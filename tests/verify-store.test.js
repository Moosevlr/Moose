import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { setImmediate } from 'node:timers/promises';
import { createStoredVerifyHandler } from '../netlify/functions/verify.mjs';
import { createIssuerAdminHandler } from '../netlify/functions/issuer-admin.mjs';

const TOKEN = Buffer.alloc(32, 87).toString('base64url');
const TOKEN_HASH = createHash('sha256').update(TOKEN).digest('hex');
const NOW = new Date('2026-11-13T15:00:00.000Z');
const source = (changes = {}) => ({
  schemaVersion: 1, tokenSha256: TOKEN_HASH, issuer: 'JCB ENGENHARIA', issuerTagline: 'Ensino Técnico',
  status: 'active', issuerConfirmedAt: '2026-11-13T12:00:00-03:00', approvalRef: 'Synthetic approval only',
  holderName: 'ALUNO SINTÉTICO', enrollment: 'TEST-STORE-0001', course: 'CURSO SINTÉTICO',
  validThrough: '2027-03-31', timeZone: 'America/Sao_Paulo',
  privateNotes: 'PRIVATE DATA MUST NOT LEAK', cpf: 'PRIVATE VALUE', photo: 'PRIVATE PHOTO',
  ...changes,
});
const request = (parameters = { token: TOKEN }, method = 'GET') => new Request('https://example.test/api/verificar?' + new URLSearchParams(parameters), { method });
const storedHandler = (get, options = {}) => createStoredVerifyHandler({
  storeFactory: async () => ({ get }), now: () => NOW, ...options,
});

async function expectMinimum(response, status) {
  assert.equal(response.status, status);
  assert.deepEqual(await response.json(), { status: 'invalid' });
}

test('stored verification rejects methods and malformed tokens before opening any store', async () => {
  let opened = 0;
  const verify = createStoredVerifyHandler({ storeFactory() { opened++; throw Error('Must not open'); } });
  await expectMinimum(await verify(request({ token: TOKEN }, 'POST')), 405);
  for (const parameters of [{}, { token: '' }, { token: 'short' }, { token: '!'.repeat(43) }]) {
    await expectMinimum(await verify(request(parameters)), 404);
  }
  const repeated = new Request('https://example.test/api/verificar?token=' + TOKEN + '&token=' + TOKEN);
  await expectMinimum(await verify(repeated), 404);
  assert.equal(opened, 0);
});

test('stored verification reads a private site store by SHA-256 with strong consistency', async () => {
  const calls = [];
  const verify = createStoredVerifyHandler({
    storeFactory(name) {
      assert.equal(name, 'jcb-credentials');
      return { async get(key, options) { calls.push({ key, options }); return source(); } };
    },
    now: () => NOW,
  });
  const response = await verify(request());
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.status, 'active');
  assert.equal(result.holderName, 'ALUNO SINTÉTICO');
  assert.deepEqual(calls, [{ key: TOKEN_HASH, options: { type: 'json', consistency: 'strong' } }]);
  assert.notEqual(calls[0].key, TOKEN);
  assert.deepEqual(Object.keys(result).sort(), ['checkedAt', 'course', 'enrollment', 'holderName', 'issuer', 'issuerTagline', 'status', 'timeZone', 'validThrough']);
  const serialized = JSON.stringify(result);
  for (const privateValue of [TOKEN, TOKEN_HASH, 'Synthetic approval only', 'PRIVATE']) assert(!serialized.includes(privateValue));
});

test('original friendly path and rewritten function URL consult the same authoritative record', async () => {
  const calls = [];
  const verify = storedHandler(async (key, options) => {
    calls.push({ key, options });
    return source();
  });
  for (const url of [
    `https://example.test/api/verificar/${TOKEN}`,
    `https://example.test/api/verificar/${TOKEN}/`,
    `https://example.test/api/verificar/${TOKEN}?token=${TOKEN}`,
    `https://example.test/.netlify/functions/verify?token=${TOKEN}`,
  ]) {
    const result = await verify(new Request(url));
    assert.equal(result.status, 200);
    assert.equal((await result.json()).status, 'active');
  }
  assert.equal(calls.length, 4);
  assert(calls.every(call => call.key === TOKEN_HASH && call.options.consistency === 'strong'));
});

test('conflicting, duplicate and malformed path codes are rejected before storage access', async () => {
  let reads = 0;
  const verify = storedHandler(async () => { reads++; return source(); });
  for (const url of [
    `https://example.test/api/verificar/${TOKEN}?token=${'A'.repeat(43)}`,
    `https://example.test/api/verificar/${TOKEN}?token=${TOKEN}&token=${TOKEN}`,
    `https://example.test/api/verificar/short?token=${TOKEN}`,
    `https://example.test/api/verificar/${TOKEN}/extra?token=${TOKEN}`,
    `https://example.test/api/verificar/${TOKEN}?token=`,
  ]) {
    const response = await verify(new Request(url));
    await expectMinimum(response, 404);
    assert.equal(response.headers.get('x-jcb-verification'), 'code-rejected');
  }
  assert.equal(reads, 0);
});

test('an empty store and unknown digest return the same minimal 404', async () => {
  for (const missing of [null, undefined]) await expectMinimum(await storedHandler(async () => missing)(request()), 404);
});

test('a record found under the wrong digest cannot activate the submitted token', async () => {
  const otherHash = createHash('sha256').update('different synthetic token').digest('hex');
  const verify = storedHandler(async () => source({ tokenSha256: otherHash }));
  await expectMinimum(await verify(request()), 404);
});

test('unavailable storage, failed JSON reads and invalid stored sources fail closed', async () => {
  const errors = [
    createStoredVerifyHandler({ storeFactory() { throw Error('Private storage initialization details'); } }),
    storedHandler(async () => { throw Error('Private storage read details'); }),
    storedHandler(async () => { throw new SyntaxError('Private stored JSON details'); }),
    storedHandler(async () => source({ tokenSha256: 'invalid' })),
    storedHandler(async () => source({ issuerConfirmedAt: null })),
    storedHandler(async () => source({ status: 'unknown' })),
    storedHandler(async () => false),
  ];
  for (const verify of errors) await expectMinimum(await verify(request()), 503);
});

test('stored verification waits for the authoritative read before returning active', async () => {
  let resolveRead;
  const gate = new Promise(resolve => { resolveRead = resolve; });
  let settled = false;
  const pending = storedHandler(() => gate)(request()).then(response => { settled = true; return response; });
  await setImmediate();
  assert.equal(settled, false);
  resolveRead(source());
  const response = await pending;
  assert.equal(response.status, 200);
  assert.equal((await response.json()).status, 'active');
});

test('successive reads observe committed revocation and removal without caching active data', async () => {
  let current = source();
  let reads = 0;
  const verify = storedHandler(async () => { reads++; return current; });
  assert.equal((await (await verify(request())).json()).status, 'active');
  current = source({ status: 'revoked' });
  const revoked = await verify(request());
  assert.equal(revoked.status, 200);
  assert.equal((await revoked.json()).status, 'revoked');
  current = null;
  await expectMinimum(await verify(request()), 404);
  assert.equal(reads, 3);
});

test('stored pending, expired and revoked states ignore client-side status or date overrides', async () => {
  for (const [record, now, expected] of [
    [source({ status: 'pending', issuerConfirmedAt: null }), NOW, 'pending'],
    [source({ status: 'revoked' }), new Date('2028-01-01T00:00:00Z'), 'revoked'],
    [source(), new Date('2027-04-01T03:00:00Z'), 'expired'],
  ]) {
    const verify = storedHandler(async () => record, { now: () => now });
    const response = await verify(request({ token: TOKEN, status: 'active', now: '2026-01-01', validThrough: '2099-12-31' }));
    assert.equal(response.status, 200);
    const result = await response.json();
    assert.equal(result.status, expected);
    if (expected !== 'expired') assert(!('holderName' in result));
  }
});

test('stored clock failures cannot fall back to a successful active result', async () => {
  for (const now of [() => new Date(NaN), () => { throw Error('Private clock error'); }]) {
    const verify = storedHandler(async () => source(), { now });
    await expectMinimum(await verify(request()), 503);
  }
});

test('all stored response paths keep no-store, noindex and referrer protections', async () => {
  for (const get of [async () => source(), async () => null, async () => { throw Error('Storage unavailable'); }]) {
    const response = await storedHandler(get)(request());
    assert.match(response.headers.get('cache-control'), /no-store/);
    assert.equal(response.headers.get('netlify-cdn-cache-control'), 'no-store');
    assert.match(response.headers.get('x-robots-tag'), /noindex/);
    assert.equal(response.headers.get('referrer-policy'), 'no-referrer');
    assert.equal(response.headers.get('access-control-allow-origin'), null);
  }
});

test('issuer persistence and strong verification keep multiple credentials independent across revocation and expiry', async () => {
  const master = Buffer.alloc(32, 77).toString('base64url');
  const database = new Map();
  const store = {
    async get(key, options) {
      assert.deepEqual(options, { type: 'json', consistency: 'strong' });
      return database.has(key) ? structuredClone(database.get(key)) : null;
    },
    async setJSON(key, record) {
      database.set(key, structuredClone(record));
      return { modified: true };
    },
  };
  let clock = NOW;
  const issue = createIssuerAdminHandler({
    expectedKeyHash: createHash('sha256').update(master).digest('hex'),
    setupKeyHash: null, setupRecordHash: null, setupExpiresAt: null,
    storeFactory: async () => store, now: () => clock,
  });
  const verify = createStoredVerifyHandler({ storeFactory: async () => store, now: () => clock });
  const tokenB = Buffer.alloc(32, 90).toString('base64url');
  const hashB = createHash('sha256').update(tokenB).digest('hex');
  const recordA = source({ holderName: 'ALUNO A', enrollment: 'TEST-A' });
  const recordB = source({ tokenSha256: hashB, holderName: 'ALUNO B', enrollment: 'TEST-B' });
  const writeRequest = record => new Request('https://example.test/.netlify/functions/issuer-admin', {
    method: 'POST', headers: { authorization: `Bearer ${master}`, 'content-type': 'application/json', origin: 'https://example.test' },
    body: JSON.stringify(record),
  });
  for (const record of [recordA, recordB]) assert.equal((await issue(writeRequest(record))).status, 201);
  assert.equal(database.size, 2);
  const activeA = await (await verify(new Request(`https://example.test/api/verificar/${TOKEN}`))).json();
  const activeB = await (await verify(request({ token: tokenB }))).json();
  assert.deepEqual([activeA.status, activeA.enrollment, activeA.holderName], ['active', 'TEST-A', 'ALUNO A']);
  assert.deepEqual([activeB.status, activeB.enrollment, activeB.holderName], ['active', 'TEST-B', 'ALUNO B']);
  assert.equal((await issue(writeRequest({ ...recordA, status: 'revoked' }))).status, 201);
  const revoked = await (await verify(request())).json();
  assert.equal(revoked.status, 'revoked');
  assert(!('holderName' in revoked));
  assert.equal((await (await verify(request({ token: tokenB }))).json()).status, 'active');
  clock = new Date('2027-04-01T03:00:00.000Z');
  assert.equal((await (await verify(request())).json()).status, 'revoked');
  assert.equal((await (await verify(request({ token: tokenB }))).json()).status, 'expired');
  assert.equal(database.size, 2);
});

test('visitor verification is read-only and cannot register or promote a source through a POST', async () => {
  let reads = 0;
  let writes = 0;
  const verify = createStoredVerifyHandler({
    storeFactory: async () => ({
      async get() { reads++; return source({ status: 'pending', issuerConfirmedAt: null }); },
      async setJSON() { writes++; return { modified: true }; },
    }),
    now: () => NOW,
  });
  const attempt = new Request('https://example.test/api/verificar?token=' + TOKEN, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(source()),
  });
  await expectMinimum(await verify(attempt), 405);
  assert.equal(reads, 0);
  assert.equal(writes, 0);
  const result = await (await verify(request({ token: TOKEN, status: 'active' }))).json();
  assert.equal(result.status, 'pending');
  assert.equal(writes, 0);
});
