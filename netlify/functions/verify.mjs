import { createHash, timingSafeEqual } from 'node:crypto';
import { evaluateCredential } from '../../src/credential-status.js';
import { normalizeEnrollment } from '../../src/verification-input.js';
import { enrollmentDigest, enrollmentIndexKey } from '../../src/enrollment-index.js';
import { INITIAL_ENROLLMENT_SHA256, INITIAL_CREDENTIAL_SHA256 } from '../../src/initial-enrollment.js';

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
    const enrollments = url.searchParams.getAll('matricula');
    const path = /^\/api\/verificar\/([A-Za-z0-9_-]{43})\/?$/.exec(url.pathname);
    if (enrollments.length) {
      const enrollment = normalizeEnrollment(enrollments[0]);
      if (enrollments.length !== 1 || !enrollment || query.length || url.pathname.startsWith('/api/verificar/')) {
        return { error: response({ status: 'invalid' }, 404, { 'X-JCB-Verification': 'code-rejected' }) };
      }
      return { enrollment };
    }
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
    if (parsed.error) return parsed.error;
    if (parsed.enrollment) {
      if (normalizeEnrollment(record?.enrollment) !== parsed.enrollment) return response({ status: 'invalid' }, 404);
      if (!/^[a-fA-F0-9]{64}$/.test(record?.tokenSha256 || '')) return response({ status: 'invalid' }, 503);
      return verifyRecord(record, Buffer.from(record.tokenSha256, 'hex'), now);
    }
    return verifyRecord(record, parsed.digest, now);
  };
}

async function openStore() {
  // Functions v2 supplies the private, current site's Blobs environment.
  // No issuer record, bearer token, or control-plane credential ships in code.
  const { getStore } = await import('@netlify/blobs');
  return getStore(STORE_NAME);
}

export function createStoredVerifyHandler({
  storeFactory = openStore,
  now = () => new Date(),
  initialEnrollment = { enrollmentSha256: INITIAL_ENROLLMENT_SHA256, tokenSha256: INITIAL_CREDENTIAL_SHA256 },
} = {}) {
  return async function verify(request) {
    const parsed = readRequest(request);
    if (parsed.error) return parsed.error;
    try {
      const store = await storeFactory(STORE_NAME);
      let digest = parsed.digest;
      if (parsed.enrollment) {
        const index = await store.get(enrollmentIndexKey(parsed.enrollment), { type: 'json', consistency: 'strong' });
        let hash;
        if (index === null || index === undefined) {
          // The pre-index record is located by digests only. Its actual state
          // and identity still come exclusively from the private live store.
          if (enrollmentDigest(parsed.enrollment) === initialEnrollment?.enrollmentSha256) hash = initialEnrollment.tokenSha256;
          else return response({ status: 'invalid' }, 404, { 'X-JCB-Verification': 'not-found' });
        } else {
          if (index.schemaVersion !== 1) return response({ status: 'invalid' }, 503, { 'X-JCB-Verification': 'record-unavailable' });
          hash = index.tokenSha256;
        }
        if (typeof hash !== 'string' || !/^[a-fA-F0-9]{64}$/.test(hash)) return response({ status: 'invalid' }, 503, { 'X-JCB-Verification': 'record-unavailable' });
        digest = Buffer.from(hash, 'hex');
      }
      // A revoked record must not be served from an eventually consistent cache.
      const record = await store.get(digest.toString('hex'), { type: 'json', consistency: 'strong' });
      if (record === null || record === undefined) return response({ status: 'invalid' }, 404, { 'X-JCB-Verification': 'not-found' });
      const storedEnrollment = normalizeEnrollment(record.enrollment);
      // An issuer may revoke by credential ID without retaining identifying
      // fields. A trusted existing index may still return the minimal revoked
      // status, which contains no personal data.
      const anonymousRevocation = record.status === 'revoked' && !storedEnrollment;
      if (parsed.enrollment && storedEnrollment !== parsed.enrollment && !anonymousRevocation) {
        return response({ status: 'invalid' }, 404, { 'X-JCB-Verification': 'not-found' });
      }
      return verifyRecord(record, digest, now);
    } catch {
      return response({ status: 'invalid' }, 503, { 'X-JCB-Verification': 'storage-unavailable' });
    }
  };
}

export default createStoredVerifyHandler();
