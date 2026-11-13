import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { setImmediate } from 'node:timers/promises';
import { createIssuerAdminHandler } from '../netlify/functions/issuer-admin.mjs';

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
  const activity = { opened: 0 };
  const handler = createIssuerAdminHandler({
    expectedKeyHash: KEY_HASH,
    now: () => NOW,
    storeFactory: async () => {
      activity.opened++;
      return { async setJSON(key, record) { writes.push({ key, record }); return { modified: true }; } };
    },
    ...overrides,
  });
  return { handler, writes, activity };
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

test('issuer admin confirms success only after the storage write commits', async () => {
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  let settled = false;
  const { handler } = setup({ storeFactory: async () => ({ setJSON: () => gate }) });
  const pending = handler(request()).then(response => { settled = true; return response; });
  await setImmediate();
  assert.equal(settled, false);
  release({ modified: true });
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
