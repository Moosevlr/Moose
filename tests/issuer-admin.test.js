import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { setImmediate } from 'node:timers/promises';
import { createIssuerAdminHandler } from '../netlify/functions/issuer-admin.mjs';
import { selectIssuerRecord } from '../src/issuer-record.js';
import { enrollmentIndexKey } from '../src/enrollment-index.js';

// Test-only keys and records; no issuer key, bearer token or local record is read.
const KEY = Buffer.alloc(32, 73).toString('base64url');
const KEY_HASH = createHash('sha256').update(KEY).digest('hex');
const ORIGIN = 'https://jcb-synthetic.netlify.app';
const NOW = new Date('2026-11-13T15:00:00.000Z');
const SOURCE_HASH = createHash('sha256').update('synthetic credential only').digest('hex');
const source = (changes = {}) => ({
  schemaVersion: 1, tokenSha256: SOURCE_HASH, issuer: 'JCB ENGENHARIA', issuerTagline: 'ENSINO TECNICO',
  status: 'active', issuerConfirmedAt: '2026-11-13T12:00:00-03:00', approvalRef: 'Synthetic approval only',
  holderName: 'TEST STUDENT', enrollment: 'TEST-ADMIN-0001', course: 'SYNTHETIC COURSE',
  validThrough: '2027-03-31', timeZone: 'America/Sao_Paulo', canonicalOrigin: ORIGIN,
  ...changes,
});

function request({ method = 'POST', authorization = `Bearer ${KEY}`, origin = ORIGIN, type = 'application/json', body = source() } = {}) {
  const headers = new Headers();
  if (authorization !== null) headers.set('authorization', authorization);
  if (origin !== null) headers.set('origin', origin);
  if (type !== null) headers.set('content-type', type);
  const encoded = typeof body === 'string' || body instanceof Uint8Array || body instanceof ReadableStream ? body : JSON.stringify(body);
  return new Request(ORIGIN + '/.netlify/functions/issuer-admin', {
    method, headers, body: ['GET', 'HEAD'].includes(method) ? undefined : encoded,
    ...(encoded instanceof ReadableStream ? { duplex: 'half' } : {}),
  });
}

function setup(overrides = {}) {
  const writes = [];
  const indexWrites = [];
  const reads = [];
  const entries = new Map();
  const activity = { opened: 0 };
  const handler = createIssuerAdminHandler({
    expectedKeyHash: KEY_HASH,
    setupKeyHash: null, setupRecordHash: null, setupExpiresAt: null,
    initialEnrollment: null,
    now: () => NOW,
    storeFactory: async () => {
      activity.opened++;
      return {
        async setJSON(key, record, options) {
          if (key.startsWith('enrollments/')) indexWrites.push({ key, record, options });
          if (options?.onlyIfNew && entries.has(key)) return { modified: false };
          entries.set(key, structuredClone(record));
          if (!key.startsWith('enrollments/')) writes.push({ key, record });
          return { modified: true };
        },
        async get(key, options) { reads.push({ key, options }); return entries.get(key) ?? null; },
      };
    },
    ...overrides,
  });
  return { handler, writes, indexWrites, reads, entries, activity };
}

async function rejected(response, status) {
  assert.equal(response.status, status);
  assert.deepEqual(await response.json(), { ok: false });
}

function unreadableBody({ method = 'POST', authorization = `Bearer ${KEY}`, origin = ORIGIN, type = 'application/json' } = {}) {
  const headers = new Headers();
  if (authorization !== null) headers.set('authorization', authorization);
  if (origin !== null) headers.set('origin', origin);
  if (type !== null) headers.set('content-type', type);
  const state = { reads: 0 };
  return {
    state,
    request: {
      method, url: ORIGIN + '/.netlify/functions/issuer-admin', headers,
      get body() { state.reads++; throw Error('Body must not be inspected'); },
    },
  };
}

test('issuer admin rejects missing, malformed and wrong keys before reading body or store', async () => {
  const { handler, activity } = setup();
  const wrongKey = Buffer.alloc(32, 74).toString('base64url');
  for (const authorization of [null, '', 'Basic test', 'Bearer short', 'Bearer ' + '!'.repeat(43), `Bearer ${wrongKey}`]) {
    const probe = unreadableBody({ authorization });
    await rejected(await handler(probe.request), 401);
    assert.equal(probe.state.reads, 0);
  }
  assert.equal(activity.opened, 0);
});

test('issuer admin invalid configured key hashes fail closed without a buffer-length exception', async () => {
  for (const expectedKeyHash of ['', '0'.repeat(63), 'z'.repeat(64)]) {
    const { handler, activity } = setup({ expectedKeyHash });
    const probe = unreadableBody();
    await rejected(await handler(probe.request), 401);
    assert.equal(probe.state.reads, 0);
    assert.equal(activity.opened, 0);
  }
});

test('issuer admin methods return 405 and Allow POST before body or store access', async () => {
  const { handler, activity } = setup();
  for (const method of ['GET', 'HEAD', 'PUT', 'DELETE', 'OPTIONS']) {
    const probe = unreadableBody({ method });
    const response = await handler(probe.request);
    await rejected(response, 405);
    assert.equal(response.headers.get('allow'), 'POST');
    assert.equal(probe.state.reads, 0);
  }
  assert.equal(activity.opened, 0);
});

test('issuer admin refuses foreign browser origins before body or store access', async () => {
  const { handler, activity } = setup();
  for (const origin of ['https://foreign.example', 'http://jcb-synthetic.netlify.app', 'null']) {
    const probe = unreadableBody({ origin });
    await rejected(await handler(probe.request), 403);
    assert.equal(probe.state.reads, 0);
  }
  assert.equal(activity.opened, 0);
});

test('issuer admin accepts a same-origin browser or authenticated CLI without Origin', async () => {
  for (const origin of [ORIGIN, null]) {
    const { handler, writes } = setup();
    const response = await handler(request({ origin }));
    assert.equal(response.status, 201);
    assert.deepEqual(await response.json(), { ok: true });
    assert.equal(writes.length, 1);
  }
});

test('issuer admin requires the exact JSON media type and accepts its case-insensitive spelling', async () => {
  const { handler, activity } = setup();
  for (const type of [null, 'text/plain', 'application/jsonp', 'application/json-suffix']) {
    const probe = unreadableBody({ type });
    await rejected(await handler(probe.request), 415);
    assert.equal(probe.state.reads, 0);
  }
  assert.equal(activity.opened, 0);
  const response = await handler(request({ type: 'Application/JSON; charset=UTF-8' }));
  assert.equal(response.status, 201);
});

test('issuer admin malformed JSON, empty streams and failed body reads never reach storage', async () => {
  const { handler, activity } = setup();
  for (const body of ['', '{invalid', '{"status":']) await rejected(await handler(request({ body })), 400);
  const body = new ReadableStream({ start(controller) { controller.error(new Error('PRIVATE BODY DETAILS')); } });
  await rejected(await handler(request({ body })), 400);
  assert.equal(activity.opened, 0);
});

test('issuer admin rejects invalid UTF-8 rather than silently altering an approved name', async () => {
  const { handler, activity } = setup();
  const body = Buffer.from(JSON.stringify(source({ holderName: 'TEST?STUDENT' })));
  body[body.indexOf(63)] = 255;
  await rejected(await handler(request({ body })), 400);
  assert.equal(activity.opened, 0);
});

test('issuer admin validates schema, source states, dates and active confirmation before writing', async () => {
  const { handler, activity } = setup();
  for (const body of [null, [], 1, '"string"', {}, source({ schemaVersion: 2 }), source({ status: 'expired' }), source({ status: 'unknown' }), source({ status: false }), source({ issuerConfirmedAt: null }), source({ tokenSha256: 'z'.repeat(64) }), source({ validThrough: '2027-02-31' }), source({ holderName: 'A'.repeat(2049) })]) {
    await rejected(await handler(request({ body })), 422);
  }
  assert.equal(activity.opened, 0);
});

test('issuer admin measures the 16 KiB limit in bytes, including streamed UTF-8 bodies', async () => {
  const { handler, activity } = setup();
  for (const body of [' '.repeat(16385), JSON.stringify(source({ ignored: 'é'.repeat(9000) }))]) {
    await rejected(await handler(request({ body })), 413);
  }
  assert.equal(activity.opened, 0);
  const body = { ...source(), ignored: '' };
  body.ignored = 'x'.repeat(16384 - Buffer.byteLength(JSON.stringify(body)));
  assert.equal(Buffer.byteLength(JSON.stringify(body)), 16384);
  assert.equal((await handler(request({ body }))).status, 201);
});

test('issuer admin stores only selected fields under the normalized digest and returns no data', async () => {
  const { handler, writes } = setup();
  const record = source({ tokenSha256: SOURCE_HASH.toUpperCase() });
  const response = await handler(request({ body: { ...record, extra: 'PRIVATE EXTRA', cpf: 'PRIVATE DOCUMENT', photo: 'PRIVATE PHOTO', bearer: KEY } }));
  assert.equal(response.status, 201);
  assert.deepEqual(await response.json(), { ok: true });
  assert.equal(writes.length, 1);
  assert.equal(writes[0].key, SOURCE_HASH);
  assert.deepEqual(writes[0].record, record);
});

test('issuer admin source pending or revoked status is not replaced by a query override', async () => {
  for (const status of ['pending', 'revoked']) {
    const { handler, writes } = setup();
    const base = request({ body: source({ status, issuerConfirmedAt: null, approvalRef: null }) });
    const overridden = new Request(base.url + '?status=active', base);
    const response = await handler(overridden);
    assert.equal(response.status, 201);
    assert.equal(writes[0].record.status, status);
  }
});

test('issuer admin confirms success only after both index reservation and record writes commit', async () => {
  let reserve;
  let commit;
  const indexGate = new Promise(resolve => { reserve = resolve; });
  const recordGate = new Promise(resolve => { commit = resolve; });
  const calls = [];
  let settled = false;
  const { handler } = setup({ storeFactory: async () => ({ setJSON(key) {
    calls.push(key);
    return key.startsWith('enrollments/') ? indexGate : recordGate;
  } }) });
  const pending = handler(request()).then(response => { settled = true; return response; });
  await setImmediate();
  assert.equal(settled, false);
  assert.deepEqual(calls, [enrollmentIndexKey(source().enrollment)]);
  reserve({ modified: true });
  await setImmediate();
  assert.equal(settled, false);
  assert.deepEqual(calls, [enrollmentIndexKey(source().enrollment), SOURCE_HASH]);
  commit({ modified: true });
  const response = await pending;
  assert.equal(response.status, 201);
  assert.deepEqual(await response.json(), { ok: true });
});

test('issuer admin unavailable, failed and unconfirmed writes return minimal 503 without details', async () => {
  const factories = [
    () => { throw Error('PRIVATE STORE INITIALIZATION'); },
    async () => ({ setJSON: async () => { throw Error('PRIVATE STORE WRITE'); } }),
    ...[undefined, null, { modified: false }, { modified: 'true' }].map(result => async () => ({ setJSON: async () => result })),
  ];
  for (const storeFactory of factories) await rejected(await setup({ storeFactory }).handler(request()), 503);
});

test('issuer admin success and rejection responses prevent caching and indexing without permissive CORS', async () => {
  const { handler } = setup();
  for (const input of [request(), request({ authorization: null }), request({ method: 'GET' }), request({ body: 'invalid' })]) {
    const response = await handler(input);
    assert.match(response.headers.get('cache-control'), /no-store/);
    assert.match(response.headers.get('x-robots-tag'), /noindex/);
    assert.equal(response.headers.get('referrer-policy'), 'no-referrer');
    assert.equal(response.headers.get('access-control-allow-origin'), null);
    assert.match(response.headers.get('content-type'), /application\/json.*charset=utf-8/i);
  }
});

const SETUP_KEY = Buffer.alloc(32, 75).toString('base64url');
const SETUP_HASH = createHash('sha256').update(SETUP_KEY).digest('hex');
const SNAPSHOT_HASH = createHash('sha256').update(JSON.stringify(selectIssuerRecord(source()))).digest('hex');
const SETUP_EXPIRY = '2026-11-13T16:00:00.000Z';
const setupRequest = (options = {}) => request({ authorization: `Bearer ${SETUP_KEY}`, ...options });
const capability = (overrides = {}) => setup({
  setupKeyHash: SETUP_HASH, setupRecordHash: SNAPSHOT_HASH, setupExpiresAt: SETUP_EXPIRY,
  ...overrides,
});

test('issuer snapshot selection has stable field order, ignores extras and never selects inherited fields', () => {
  const input = Object.assign(Object.create({ hidden: 'inherited' }), Object.fromEntries(Object.entries(source()).reverse()), { extra: 'discard' });
  const selected = selectIssuerRecord(input);
  assert.deepEqual(selected, source());
  assert.equal(JSON.stringify(selected), JSON.stringify(source()));
  const inherited = Object.create({ holderName: 'INHERITED NAME', tokenSha256: SOURCE_HASH });
  assert.deepEqual(selectIssuerRecord(inherited), {});
  assert.deepEqual(selectIssuerRecord(null), {});
});

test('issuer setup capability creates only the authorized snapshot with an atomic first-write condition', async () => {
  const writes = [];
  const { handler } = capability({ storeFactory: async () => ({
    async setJSON(key, record, options) { writes.push({ key, record, options }); return { modified: true }; },
  }) });
  const reordered = Object.fromEntries(Object.entries(source()).reverse());
  const response = await handler(setupRequest({ body: { ...reordered, ignored: 'not persisted' } }));
  assert.equal(response.status, 201);
  assert.deepEqual(await response.json(), { ok: true });
  assert.deepEqual(writes, [
    { key: enrollmentIndexKey(source().enrollment), record: { schemaVersion: 1, tokenSha256: SOURCE_HASH }, options: { onlyIfNew: true } },
    { key: SOURCE_HASH, record: source(), options: { onlyIfNew: true } },
  ]);
});

test('issuer setup capability rejects changed names, dates, states and other approved fields before storage', async () => {
  const { handler, activity } = capability();
  for (const changes of [
    { holderName: 'DIFFERENT STUDENT' }, { validThrough: '2028-03-31' },
    { status: 'revoked' }, { status: 'pending' }, { status: 'unknown' },
    { enrollment: 'ANOTHER ENROLLMENT' }, { course: 'ANOTHER COURSE' },
    { canonicalOrigin: 'https://another.netlify.app' }, { approvalRef: 'Different approval' },
    { tokenSha256: 'a'.repeat(64) },
  ]) await rejected(await handler(setupRequest({ body: source(changes) })), 403);
  assert.equal(activity.opened, 0);
});

test('issuer setup capability cannot overwrite an existing or revoked record', async () => {
  let stored;
  const indices = new Map();
  const calls = [];
  const { handler } = capability({ storeFactory: async () => ({
    async setJSON(key, record, options) {
      if (key.startsWith('enrollments/')) {
        if (indices.has(key)) return { modified: false };
        indices.set(key, record);
        return { modified: true };
      }
      calls.push(options);
      if (stored) return { modified: false };
      stored = structuredClone(record);
      return { modified: true };
    },
    async get(key) { return indices.get(key); },
  }) });
  assert.equal((await handler(setupRequest())).status, 201);
  await rejected(await handler(setupRequest()), 409);
  stored.status = 'revoked';
  await rejected(await handler(setupRequest()), 409);
  assert.equal(stored.status, 'revoked');
  assert.deepEqual(calls, [{ onlyIfNew: true }, { onlyIfNew: true }, { onlyIfNew: true }]);
});

test('issuer setup capability expires exactly at its deadline before body or storage access', async () => {
  for (const time of ['2026-11-13T16:00:00.000Z', '2026-11-13T16:00:00.001Z']) {
    const { handler, activity } = capability({ now: () => new Date(time) });
    const probe = unreadableBody({ authorization: `Bearer ${SETUP_KEY}` });
    await rejected(await handler(probe.request), 401);
    assert.equal(probe.state.reads, 0);
    assert.equal(activity.opened, 0);
  }
  const { handler } = capability({ now: () => new Date('2026-11-13T15:59:59.999Z') });
  assert.equal((await handler(setupRequest())).status, 201);
});

test('issuer setup capability fails closed for invalid configuration, invalid clocks or a shared master key', async () => {
  for (const options of [
    { setupRecordHash: 'invalid' }, { setupExpiresAt: null }, { setupExpiresAt: '13/11/2026' },
    { setupExpiresAt: '2026-02-30T16:00:00Z' }, { setupExpiresAt: '2026-11-13T24:00:00Z' },
    { now: () => new Date(NaN) }, { now() { throw Error('Clock unavailable'); } },
    { expectedKeyHash: SETUP_HASH },
  ]) {
    const { handler, activity } = capability(options);
    const probe = unreadableBody({ authorization: `Bearer ${SETUP_KEY}` });
    await rejected(await handler(probe.request), 401);
    assert.equal(probe.state.reads, 0);
    assert.equal(activity.opened, 0);
  }
});

test('issuer setup capability is rechecked after body processing and cannot outlive expiry', async () => {
  let calls = 0;
  const { handler, activity } = capability({ now: () => new Date(++calls === 1 ? '2026-11-13T15:59:59.999Z' : SETUP_EXPIRY) });
  await rejected(await handler(setupRequest()), 401);
  assert.equal(activity.opened, 0);
});

test('issuer setup capability cannot start a write after storage initialization crosses its deadline', async () => {
  let clock = new Date('2026-11-13T15:59:59.999Z');
  let writes = 0;
  const { handler } = capability({
    now: () => clock,
    storeFactory: async () => {
      await setImmediate();
      clock = new Date(SETUP_EXPIRY);
      return { async setJSON() { writes++; return { modified: true }; } };
    },
  });
  await rejected(await handler(setupRequest()), 401);
  assert.equal(writes, 0);
});

test('issuer setup capability still validates an exactly matched source and cannot claim unconfirmed storage writes', async () => {
  const invalid = source({ issuerConfirmedAt: null });
  const fingerprint = createHash('sha256').update(JSON.stringify(selectIssuerRecord(invalid))).digest('hex');
  const badSource = capability({ setupRecordHash: fingerprint });
  await rejected(await badSource.handler(setupRequest({ body: invalid })), 422);
  assert.equal(badSource.activity.opened, 0);
  for (const storeFactory of [
    async () => { throw Error('Storage unavailable'); },
    async () => ({ setJSON: async () => { throw Error('Write failed'); } }),
    async () => ({ setJSON: async () => undefined }),
    async () => ({ setJSON: async () => ({ modified: 'true' }) }),
  ]) await rejected(await capability({ storeFactory }).handler(setupRequest()), 503);
});

test('issuer master key keeps ordinary updates independently of setup scope or expiration', async () => {
  const writes = [];
  const { handler } = capability({
    setupExpiresAt: '2026-01-01T00:00:00Z',
    storeFactory: async () => ({ async setJSON(key, record, ...options) { writes.push({ key, record, options }); return { modified: true }; } }),
  });
  const changed = source({ status: 'revoked', holderName: 'MASTER UPDATED NAME' });
  const response = await handler(request({ body: changed }));
  assert.equal(response.status, 201);
  assert.deepEqual(writes, [{ key: SOURCE_HASH, record: changed, options: [] }]);
  const unconfirmed = capability({ storeFactory: async () => ({ setJSON: async () => ({ modified: false }) }) });
  await rejected(await unconfirmed.handler(request()), 503);
});

test('issuer admin reserves a normalized enrollment before its record, with only a lowercase digest in the index', async () => {
  const calls = [];
  const { handler } = setup({ storeFactory: async () => ({ async setJSON(key, value, options) {
    calls.push({ key, value, options });
    return { modified: true };
  } }) });
  const record = source({ enrollment: '  test-admin-0001  ', tokenSha256: SOURCE_HASH.toUpperCase() });
  assert.equal((await handler(request({ body: record }))).status, 201);
  assert.deepEqual(calls, [
    { key: enrollmentIndexKey('TEST-ADMIN-0001'), value: { schemaVersion: 1, tokenSha256: SOURCE_HASH }, options: { onlyIfNew: true } },
    { key: SOURCE_HASH, value: record, options: undefined },
  ]);
});

test('issuer admin strongly reads an existing reservation and only reuses the same credential binding', async () => {
  const indexKey = enrollmentIndexKey(source().enrollment);
  for (const tokenSha256 of [SOURCE_HASH, SOURCE_HASH.toUpperCase(), 'a'.repeat(64)]) {
    const { handler, entries, reads, writes } = setup();
    entries.set(indexKey, { schemaVersion: 1, tokenSha256 });
    const response = await handler(request());
    if (tokenSha256.toLowerCase() === SOURCE_HASH) {
      assert.equal(response.status, 201);
      assert.equal(writes.length, 1);
    } else {
      await rejected(response, 409);
      assert.equal(writes.length, 0);
    }
    assert.deepEqual(reads, [{ key: indexKey, options: { type: 'json', consistency: 'strong' } }]);
    assert.deepEqual(entries.get(indexKey), { schemaVersion: 1, tokenSha256 });
  }
});

test('issuer admin never writes a record when its existing index is missing, malformed or unreadable', async () => {
  const indexKey = enrollmentIndexKey(source().enrollment);
  for (const existing of [null, false, [], {}, { schemaVersion: 2, tokenSha256: SOURCE_HASH }, { schemaVersion: 1 }, { schemaVersion: 1, tokenSha256: 'invalid' }]) {
    const { handler, entries, writes } = setup();
    entries.set(indexKey, existing);
    await rejected(await handler(request()), 503);
    assert.equal(writes.length, 0);
  }
  const keys = [];
  const { handler } = setup({ storeFactory: async () => ({
    async setJSON(key) { keys.push(key); return { modified: false }; },
    async get() { throw Error('PRIVATE INDEX FAILURE'); },
  }) });
  await rejected(await handler(request()), 503);
  assert.deepEqual(keys, [indexKey]);
});

test('issuer admin fails closed for unconfirmed reservations and record commits', async () => {
  for (const result of [undefined, null, { modified: 'true' }]) {
    const calls = [];
    const { handler } = setup({ storeFactory: async () => ({ async setJSON(key) {
      calls.push(key);
      return result;
    } }) });
    await rejected(await handler(request()), 503);
    assert.deepEqual(calls, [enrollmentIndexKey(source().enrollment)]);
  }
  for (const result of [undefined, null, { modified: false }, { modified: 'true' }]) {
    const calls = [];
    const { handler } = setup({ storeFactory: async () => ({ async setJSON(key) {
      calls.push(key);
      return key.startsWith('enrollments/') ? { modified: true } : result;
    } }) });
    await rejected(await handler(request()), 503);
    assert.deepEqual(calls, [enrollmentIndexKey(source().enrollment), SOURCE_HASH]);
  }
});

test('issuer admin recovers an orphan reservation on retry without transferring it to another credential', async () => {
  const entries = new Map();
  const reads = [];
  let recordAttempts = 0;
  const { handler } = setup({ storeFactory: async () => ({
    async setJSON(key, value, options) {
      if (options?.onlyIfNew && entries.has(key)) return { modified: false };
      if (!key.startsWith('enrollments/') && ++recordAttempts === 1) throw Error('Synthetic interrupted record write');
      entries.set(key, structuredClone(value));
      return { modified: true };
    },
    async get(key, options) { reads.push({ key, options }); return entries.get(key) ?? null; },
  }) });
  await rejected(await handler(request()), 503);
  assert.equal(entries.size, 1);
  assert.equal(entries.has(SOURCE_HASH), false);
  assert.equal((await handler(request())).status, 201);
  assert.equal(entries.size, 2);
  const original = structuredClone(entries.get(SOURCE_HASH));
  await rejected(await handler(request({ body: source({ tokenSha256: 'b'.repeat(64), enrollment: '  test-admin-0001 ' }) })), 409);
  assert.equal(recordAttempts, 2);
  assert.deepEqual(entries.get(SOURCE_HASH), original);
  assert.equal(reads.every(read => read.options.consistency === 'strong'), true);
});

test('issuer admin concurrent credentials cannot claim the same enrollment', async () => {
  const { handler, entries, writes } = setup();
  const competingHash = 'c'.repeat(64);
  const responses = await Promise.all([
    handler(request()),
    handler(request({ body: source({ tokenSha256: competingHash, enrollment: 'test-admin-0001' }) })),
  ]);
  assert.deepEqual(responses.map(response => response.status).sort(), [201, 409]);
  assert.equal(writes.length, 1);
  const binding = entries.get(enrollmentIndexKey(source().enrollment));
  assert.equal(entries.has(binding.tokenSha256), true);
  assert.equal(entries.size, 2);
});

test('issuer admin protects the initial imported enrollment before any index exists', async () => {
  const indexKey = enrollmentIndexKey(source().enrollment);
  const initialEnrollment = { enrollmentSha256: indexKey.slice('enrollments/'.length), tokenSha256: SOURCE_HASH };
  const { handler, activity, writes } = setup({ initialEnrollment });
  await rejected(await handler(request({ body: source({ tokenSha256: 'd'.repeat(64), enrollment: ' test-admin-0001 ' }) })), 409);
  assert.equal(activity.opened, 0);
  assert.equal(writes.length, 0);
  assert.equal((await handler(request())).status, 201);
  assert.equal((await handler(request({ body: source({ tokenSha256: 'd'.repeat(64), enrollment: 'OTHER-NUMBER' }) }))).status, 201);
});

test('issuer master can revoke with or without enrollment even when an old index is unusable', async () => {
  for (const enrollment of [undefined, source().enrollment]) {
    const calls = [];
    const indexKey = enrollmentIndexKey(source().enrollment);
    const { handler } = setup({
      initialEnrollment: { enrollmentSha256: indexKey.slice('enrollments/'.length), tokenSha256: 'e'.repeat(64) },
      storeFactory: async () => ({
        async setJSON(key, record, ...options) {
          assert.equal(key.startsWith('enrollments/'), false);
          calls.push({ key, record, options });
          return { modified: true };
        },
        async get() { throw Error('Revocation must not require the index'); },
      }),
    });
    const record = source({ status: 'revoked', enrollment });
    assert.equal((await handler(request({ body: record }))).status, 201);
    assert.deepEqual(calls, [{ key: SOURCE_HASH, record: selectIssuerRecord(JSON.parse(JSON.stringify(record))), options: [] }]);
  }
});

test('issuer admin rejects active numbers outside the lookup format before storage', async () => {
  const { handler, activity } = setup();
  for (const enrollment of ['AB', 'A'.repeat(41), 'NOT A CODE', '<INVALID>']) {
    await rejected(await handler(request({ body: source({ enrollment }) })), 422);
  }
  assert.equal(activity.opened, 0);
});

test('issuer setup deadline is rechecked after asynchronous index reservation or strong read', async () => {
  for (const existingIndex of [false, true]) {
    let clock = new Date('2026-11-13T15:59:59.999Z');
    const writes = [];
    const { handler } = capability({
      now: () => clock,
      storeFactory: async () => ({
        async setJSON(key) {
          writes.push(key);
          assert.equal(key.startsWith('enrollments/'), true);
          if (existingIndex) return { modified: false };
          await setImmediate();
          clock = new Date(SETUP_EXPIRY);
          return { modified: true };
        },
        async get() {
          await setImmediate();
          clock = new Date(SETUP_EXPIRY);
          return { schemaVersion: 1, tokenSha256: SOURCE_HASH };
        },
      }),
    });
    await rejected(await handler(setupRequest()), 401);
    assert.deepEqual(writes, [enrollmentIndexKey(source().enrollment)]);
  }
});
