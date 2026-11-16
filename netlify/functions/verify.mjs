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
    const url = new URL(request.url);
    const query = url.searchParams.getAll('token');
    const path = /^\/api\/verificar\/([A-Za-z0-9_-]{43})\/?$/.exec(url.pathname);
    // Functions v2 can receive the original URL in Request.url, without the
    // query added by a rewrite. Accept either form, never conflicting codes.
    if (query.length > 1 || (url.pathname.startsWith('/api/verificar/') && !path) ||
        (path && query.length === 1 && path[1] !== query[0])) {
      return { error: response({ status: 'invalid' }, 404, { 'X-JCB-Verification': 'code-rejected' }) };
    }
    token = path?.[1] ?? query[0];
  } catch { return { error: response({ status: 'invalid' }, 404, { 'X-JCB-Verification': 'code-rejected' }) }; }
  if (!/^[A-Za-z0-9_-]{43}$/.test(token || '')) return { error: response({ status: 'invalid' }, 404, { 'X-JCB-Verification': 'code-rejected' }) };
  return { digest: createHash('sha256').update(token, 'utf8').digest() };
}

function verifyRecord(record, actual, now) {
  const expectedHex = record?.tokenSha256;
  if (typeof expectedHex !== 'string' || !/^[a-fA-F0-9]{64}$/.test(expectedHex)) {
    return response({ status: 'invalid' }, 503, { 'X-JCB-Verification': 'record-unavailable' });
  }
  const expected = Buffer.from(expectedHex, 'hex');
  if (expected.length !== actual.length || !timingSafeEqual(actual, expected)) {
    return response({ status: 'invalid' }, 404, { 'X-JCB-Verification': 'not-found' });
  }
  try {
    const result = evaluateCredential(record, now());
    return result.status === 'invalid'
      ? response({ status: 'invalid' }, 503, { 'X-JCB-Verification': 'record-unavailable' })
      : response(result);
  } catch {
    // A broken source or clock must not expose the private record or a stack.
    return response({ status: 'invalid' }, 503, { 'X-JCB-Verification': 'record-unavailable' });
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
      if (record === null || record === undefined) return response({ status: 'invalid' }, 404, { 'X-JCB-Verification': 'not-found' });
      return verifyRecord(record, parsed.digest, now);
    } catch {
      return response({ status: 'invalid' }, 503, { 'X-JCB-Verification': 'storage-unavailable' });
    }
  };
}

export default createStoredVerifyHandler();
