import { createHash, timingSafeEqual } from 'node:crypto';
import { evaluateCredential } from '../../src/credential-status.js';

const STORE_NAME = 'jcb-credentials';
const HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store, max-age=0',
  'CDN-Cache-Control': 'no-store',
  'Netlify-CDN-Cache-Control': 'no-store',
  'X-Robots-Tag': 'noindex, nofollow, noarchive',
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff',
};

function response(body, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(body), { status, headers: { ...HEADERS, ...extraHeaders } });
}

function readRequest(request) {
  if (request.method !== 'GET') return { error: response({ status: 'invalid' }, 405, { Allow: 'GET' }) };
  let token;
  try {
    const parameters = new URL(request.url).searchParams;
    if (parameters.getAll('token').length !== 1) return { error: response({ status: 'invalid' }, 404) };
    token = parameters.get('token');
  } catch { return { error: response({ status: 'invalid' }, 404) }; }
  if (!/^[A-Za-z0-9_-]{43}$/.test(token || '')) return { error: response({ status: 'invalid' }, 404) };
  return { digest: createHash('sha256').update(token, 'utf8').digest() };
}

function verifyRecord(record, actual, now) {
  const expectedHex = record?.tokenSha256;
  if (typeof expectedHex !== 'string' || !/^[a-fA-F0-9]{64}$/.test(expectedHex)) {
    return response({ status: 'invalid' }, 503);
  }
  const expected = Buffer.from(expectedHex, 'hex');
  if (expected.length !== actual.length || !timingSafeEqual(actual, expected)) {
    return response({ status: 'invalid' }, 404);
  }
  try {
    const result = evaluateCredential(record, now());
    return result.status === 'invalid' ? response({ status: 'invalid' }, 503) : response(result);
  } catch {
    // A broken source or clock must not expose the private record or a stack.
    return response({ status: 'invalid' }, 503);
  }
}

/** Keep local development and fixture tests independent of hosted storage. */
export function createVerifyHandler(record, { now = () => new Date() } = {}) {
  return async function verify(request) {
    const parsed = readRequest(request);
    return parsed.error || verifyRecord(record, parsed.digest, now);
  };
}

async function openStore() {
  // Functions v2 supplies the private, current site's Blobs environment.
  // No issuer record, bearer token, or control-plane credential ships in code.
  const { getStore } = await import('@netlify/blobs');
  return getStore(STORE_NAME);
}

export function createStoredVerifyHandler({ storeFactory = openStore, now = () => new Date() } = {}) {
  return async function verify(request) {
    const parsed = readRequest(request);
    if (parsed.error) return parsed.error;
    try {
      const store = await storeFactory(STORE_NAME);
      // A revoked record must not be served from an eventually consistent cache.
      const record = await store.get(parsed.digest.toString('hex'), { type: 'json', consistency: 'strong' });
      if (record === null || record === undefined) return response({ status: 'invalid' }, 404);
      return verifyRecord(record, parsed.digest, now);
    } catch {
      return response({ status: 'invalid' }, 503);
    }
  };
}

export default createStoredVerifyHandler();
