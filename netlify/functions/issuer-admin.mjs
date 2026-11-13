import { createHash, timingSafeEqual } from 'node:crypto';
import { ISSUER_ADMIN_SHA256 } from '../../src/server-trust.js';
import { evaluateCredential } from '../../src/credential-status.js';

const keys = ['schemaVersion', 'tokenSha256', 'issuer', 'issuerTagline', 'status', 'issuerConfirmedAt', 'approvalRef', 'holderName', 'enrollment', 'course', 'validThrough', 'timeZone', 'canonicalOrigin'];
function json(status, body, extraHeaders = {}) {
  return new Response(JSON.stringify(body), { status, headers: {
    'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store',
    'X-Robots-Tag': 'noindex, nofollow, noarchive', 'Referrer-Policy': 'no-referrer',
    ...extraHeaders,
  } });
}
async function openStore() {
  const { getStore } = await import('@netlify/blobs');
  return getStore({ name: 'jcb-credentials', consistency: 'strong' });
}

/** Private issuer API, not a Netlify-account proxy. No visitor/list operation. */
export function createIssuerAdminHandler({ expectedKeyHash = ISSUER_ADMIN_SHA256, storeFactory = openStore, now = () => new Date() } = {}) {
  return async function issuerAdmin(request) {
    if (request.method !== 'POST') return json(405, { ok: false }, { Allow: 'POST' });
    const secret = /^Bearer ([A-Za-z0-9_-]{43})$/.exec(request.headers.get('authorization') || '')?.[1];
    if (!secret || !/^[a-f0-9]{64}$/.test(expectedKeyHash)) return json(401, { ok: false });
    const digest = createHash('sha256').update(secret).digest();
    if (!timingSafeEqual(digest, Buffer.from(expectedKeyHash, 'hex'))) return json(401, { ok: false });
    const origin = request.headers.get('origin');
    if (origin && origin !== new URL(request.url).origin) return json(403, { ok: false });
    if ((request.headers.get('content-type') || '').split(';')[0].trim().toLowerCase() !== 'application/json') return json(415, { ok: false });
    const reader = request.body?.getReader();
    const chunks = [];
    let size = 0;
    try {
      if (reader) for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > 16384) { await reader.cancel(); return json(413, { ok: false }); }
        chunks.push(value);
      }
      const input = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks)));
      if (!input || typeof input !== 'object' || Array.isArray(input)) return json(422, { ok: false });
      const record = Object.fromEntries(keys.filter(key => Object.hasOwn(input, key)).map(key => [key, input[key]]));
      if (keys.some(key => typeof record[key] === 'string' && record[key].length > 2048) ||
          evaluateCredential(record, now()).status === 'invalid') return json(422, { ok: false });
      try {
        const store = await storeFactory();
        const result = await store.setJSON(record.tokenSha256.toLowerCase(), record);
        if (result?.modified !== true) return json(503, { ok: false });
        return json(201, { ok: true });
      } catch { return json(503, { ok: false }); }
    } catch { return json(400, { ok: false }); }
    finally { reader?.releaseLock(); }
  };
}

export default createIssuerAdminHandler();
