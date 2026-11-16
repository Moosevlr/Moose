import { createHash, timingSafeEqual } from 'node:crypto';
import { ISSUER_ADMIN_SHA256 } from '../../src/server-trust.js';
import { SETUP_KEY_SHA256, SETUP_RECORD_SHA256, SETUP_EXPIRES_AT } from '../../src/setup-trust.js';
import { evaluateCredential } from '../../src/credential-status.js';
import { ISSUER_RECORD_FIELDS, selectIssuerRecord } from '../../src/issuer-record.js';

const validHash = (value) => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const matchesHash = (digest, expected) => validHash(expected) && timingSafeEqual(digest, Buffer.from(expected, 'hex'));

function deadlineMilliseconds(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,9})?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/.test(value)) return NaN;
  const day = value.slice(0, 10);
  const calendarCheck = new Date(day + 'T00:00:00Z');
  if (!Number.isFinite(calendarCheck.getTime()) || calendarCheck.toISOString().slice(0, 10) !== day || day.startsWith('0000-')) return NaN;
  return Date.parse(value);
}

const liveAt = (now, deadline) => now instanceof Date && Number.isFinite(now.getTime()) &&
  Number.isFinite(deadline) && now.getTime() < deadline;
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
export function createIssuerAdminHandler({
  expectedKeyHash = ISSUER_ADMIN_SHA256,
  setupKeyHash = SETUP_KEY_SHA256,
  setupRecordHash = SETUP_RECORD_SHA256,
  setupExpiresAt = SETUP_EXPIRES_AT,
  storeFactory = openStore,
  now = () => new Date(),
} = {}) {
  const setupDeadline = deadlineMilliseconds(setupExpiresAt);
  return async function issuerAdmin(request) {
    if (request.method !== 'POST') return json(405, { ok: false }, { Allow: 'POST' });
    const secret = /^Bearer ([A-Za-z0-9_-]{43})$/.exec(request.headers.get('authorization') || '')?.[1];
    if (!secret) return json(401, { ok: false });
    const digest = createHash('sha256').update(secret).digest();
    const master = matchesHash(digest, expectedKeyHash);
    const setup = matchesHash(digest, setupKeyHash);
    // A setup key must never become an unrestricted key through misconfiguration.
    if ((!master && !setup) || (master && setup)) return json(401, { ok: false });
    if (setup) {
      try {
        if (!validHash(setupRecordHash) || !liveAt(now(), setupDeadline)) return json(401, { ok: false });
      } catch { return json(401, { ok: false }); }
    }
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
      const record = selectIssuerRecord(input);
      if (ISSUER_RECORD_FIELDS.some(key => typeof record[key] === 'string' && record[key].length > 2048)) return json(422, { ok: false });
      if (setup) {
        const fingerprint = createHash('sha256').update(JSON.stringify(record), 'utf8').digest();
        if (!matchesHash(fingerprint, setupRecordHash)) return json(403, { ok: false });
      }
      const checkedAt = now();
      if (setup && !liveAt(checkedAt, setupDeadline)) return json(401, { ok: false });
      if (evaluateCredential(record, checkedAt).status === 'invalid') return json(422, { ok: false });
      try {
        const store = await storeFactory();
        // Lazy storage initialization may outlive the setup grant. Authorize
        // again immediately before starting the conditional write.
        if (setup) {
          try {
            if (!liveAt(now(), setupDeadline)) return json(401, { ok: false });
          } catch { return json(401, { ok: false }); }
        }
        const key = record.tokenSha256.toLowerCase();
        const result = setup
          ? await store.setJSON(key, record, { onlyIfNew: true })
          : await store.setJSON(key, record);
        if (setup && result?.modified === false) return json(409, { ok: false });
        if (result?.modified !== true) return json(503, { ok: false });
        return json(201, { ok: true });
      } catch { return json(503, { ok: false }); }
    } catch { return json(400, { ok: false }); }
    finally { reader?.releaseLock(); }
  };
}

export default createIssuerAdminHandler();
