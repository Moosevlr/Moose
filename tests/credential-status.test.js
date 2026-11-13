import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { evaluateCredential } from '../src/credential-status.js';

const TOKEN = Buffer.alloc(32, 83).toString('base64url');
const NOW = new Date('2026-11-13T15:00:00.000Z');
const hash = (value) => createHash('sha256').update(value).digest('hex');
const source = (changes = {}) => ({
  schemaVersion: 1, tokenSha256: hash(TOKEN), issuer: 'JCB ENGENHARIA', issuerTagline: 'Ensino Técnico',
  status: 'active', issuerConfirmedAt: '2026-11-13T12:00:00-03:00', approvalRef: 'Synthetic test approval',
  holderName: 'ALUNO DE TESTE', enrollment: 'TEST-0001', course: 'CURSO DE TESTE',
  validThrough: '2027-03-31', timeZone: 'America/Sao_Paulo', canonicalOrigin: null,
  photo: 'PRIVATE PHOTO MUST NOT LEAK', cpf: 'PRIVATE VALUE MUST NOT LEAK',
  ...changes,
});

test('engine keeps the final São Paulo civil day valid through UTC 02:59:59.999', () => {
  const record = source();
  assert.equal(evaluateCredential(record, new Date('2027-03-31T03:00:00.000Z')).status, 'active');
  assert.equal(evaluateCredential(record, new Date('2027-04-01T02:59:59.999Z')).status, 'active');
  assert.equal(evaluateCredential(record, new Date('2027-04-01T03:00:00.000Z')).status, 'expired');
  assert.equal(evaluateCredential(record, new Date('2027-04-01T03:00:00.001Z')).status, 'expired');
});

test('engine revocation precedes expiration and missing approval', () => {
  const result = evaluateCredential(source({ status: 'revoked', issuerConfirmedAt: null, approvalRef: null }), new Date('2028-01-01T00:00:00Z'));
  assert.equal(result.status, 'revoked');
  assert(!('holderName' in result));
});

test('engine pending source stays pending and does not expose holder details', () => {
  const record = source({ status: 'pending', issuerConfirmedAt: null, approvalRef: null });
  const result = evaluateCredential(record, new Date('2028-01-01T00:00:00Z'));
  assert.equal(result.status, 'pending');
  assert.deepEqual(Object.keys(result).sort(), ['checkedAt', 'status', 'timeZone']);
});

test('engine active source requires real confirmation metadata and complete public fields', () => {
  for (const changes of [
    { issuerConfirmedAt: null }, { issuerConfirmedAt: '13/11/2026' },
    { issuerConfirmedAt: '2026-02-30T00:00:00Z' }, { issuerConfirmedAt: '2026-11-13T24:00:00Z' },
    { approvalRef: '' }, { approvalRef: null }, { holderName: '' }, { course: null },
  ]) assert.equal(evaluateCredential(source(changes), NOW).status, 'invalid');
});

test('engine future confirmation is pending rather than valid before confirmation', () => {
  assert.equal(evaluateCredential(source({ issuerConfirmedAt: '2026-11-14T00:00:00Z' }), NOW).status, 'pending');
});

test('engine rejects impossible, zero, ambiguous, partial and unknown expiration dates', () => {
  for (const validThrough of ['2027-02-29', '2027-02-31', '2027-00-31', '2027-03-00', '0000-01-01', '2027-13-01', '2027-3-31', '31/03/2027', '2027-03-31T23:59:59Z', 'unknown', '', null, 0]) {
    assert.equal(evaluateCredential(source({ validThrough }), NOW).status, 'invalid', String(validThrough));
  }
  assert.equal(evaluateCredential(source({ validThrough: '2028-02-29' }), NOW).status, 'active');
});

test('engine rejects unknown source schemas/statuses/time zones and malformed hashes', () => {
  for (const record of [null, [], {}, source({ schemaVersion: 2 }), source({ status: 'approved' }), source({ status: true }), source({ timeZone: 'UTC' }), source({ tokenSha256: '0'.repeat(63) }), source({ tokenSha256: 'z'.repeat(64) })]) {
    assert.equal(evaluateCredential(record, NOW).status, 'invalid');
  }
});

test('engine invalid server clocks cannot activate a credential', () => {
  for (const now of [new Date(NaN), '2026-11-13', null, 0]) {
    const result = evaluateCredential(source(), now);
    assert.equal(result.status, 'invalid');
    assert.equal(result.checkedAt, null);
  }
});

test('engine returns only approved public fields without mutating its source or clock', () => {
  const record = Object.freeze(source());
  const timestamp = NOW.getTime();
  const result = evaluateCredential(record, NOW);
  assert.deepEqual(Object.keys(result).sort(), ['checkedAt', 'course', 'enrollment', 'holderName', 'issuer', 'issuerTagline', 'status', 'timeZone', 'validThrough']);
  assert.equal(result.holderName, record.holderName);
  assert.equal(result.checkedAt, NOW.toISOString());
  assert.equal(NOW.getTime(), timestamp);
  assert(!JSON.stringify(result).includes('PRIVATE'));
  assert(!JSON.stringify(result).includes(record.approvalRef));
  assert(!JSON.stringify(result).includes(record.tokenSha256));
});

async function handler(record = source(), options = {}) {
  const { createVerifyHandler } = await import('../netlify/functions/verify.mjs');
  return createVerifyHandler(record, { now: () => NOW, ...options });
}
const request = (parameters = { token: TOKEN }, method = 'GET') => new Request('https://example.test/.netlify/functions/verify?' + new URLSearchParams(parameters), { method });

test('HTTP known token uses the source and server clock, ignoring query overrides', async () => {
  const verify = await handler();
  const response = await verify(request({ token: TOKEN, status: 'revoked', validThrough: '1900-01-01', now: '2100-01-01', issuerConfirmedAt: '' }));
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.status, 'active');
  assert.equal(result.validThrough, '2027-03-31');
  assert.equal(result.checkedAt, NOW.toISOString());
  assert.deepEqual(Object.keys(result).sort(), ['checkedAt', 'course', 'enrollment', 'holderName', 'issuer', 'issuerTagline', 'status', 'timeZone', 'validThrough']);
});

test('HTTP unknown and malformed tokens have the same minimal 404 without PII', async () => {
  const verify = await handler();
  const parameters = [{}, { token: '' }, { token: 'A'.repeat(42) }, { token: 'A'.repeat(44) }, { token: '!'.repeat(43) }, { token: 'A'.repeat(43) }];
  for (const input of parameters) {
    const response = await verify(request(input));
    assert.equal(response.status, 404);
    assert.deepEqual(await response.json(), { status: 'invalid' });
  }
  const repeated = new Request('https://example.test/api/verificar?token=' + TOKEN + '&token=' + TOKEN);
  assert.equal((await verify(repeated)).status, 404);
});

test('HTTP rejects unsupported methods with Allow GET and no holder information', async () => {
  const verify = await handler();
  for (const method of ['POST', 'PUT', 'DELETE', 'HEAD', 'OPTIONS']) {
    const response = await verify(request({ token: TOKEN }, method));
    assert.equal(response.status, 405);
    assert.equal(response.headers.get('Allow'), 'GET');
    assert.deepEqual(await response.json(), { status: 'invalid' });
  }
});

test('HTTP source errors and clock failures return a safe unavailable response', async () => {
  for (const changes of [{ tokenSha256: 'bad' }, { tokenSha256: 'z'.repeat(64) }, { status: 'unknown' }, { issuerConfirmedAt: null }]) {
    const response = await (await handler(source(changes)))(request());
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), { status: 'invalid' });
  }
  const response = await (await handler(source(), { now() { throw Error('Private server failure'); } }))(request());
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { status: 'invalid' });
});

test('HTTP known pending, revoked and expired records remain non-active', async () => {
  for (const [record, now, expected] of [
    [source({ status: 'pending', issuerConfirmedAt: null }), NOW, 'pending'],
    [source({ status: 'revoked' }), new Date('2028-01-01T00:00:00Z'), 'revoked'],
    [source(), new Date('2027-04-01T03:00:00Z'), 'expired'],
  ]) {
    const response = await (await handler(record, { now: () => now }))(request());
    assert.equal(response.status, 200);
    assert.equal((await response.json()).status, expected);
  }
});

test('HTTP success and error responses prevent caching and indexing without permissive CORS', async () => {
  const verify = await handler();
  for (const input of [request(), request({ token: 'invalid' }), request({ token: TOKEN }, 'POST')]) {
    const response = await verify(input);
    assert.match(response.headers.get('content-type'), /application\/json.*charset=utf-8/i);
    assert.match(response.headers.get('cache-control'), /no-store/);
    assert.equal(response.headers.get('netlify-cdn-cache-control'), 'no-store');
    assert.match(response.headers.get('x-robots-tag'), /noindex/);
    assert.equal(response.headers.get('referrer-policy'), 'no-referrer');
    assert.equal(response.headers.get('access-control-allow-origin'), null);
  }
});

test('HTTP default function rejects malformed tokens before accessing hosted storage', async () => {
  const { default: verify } = await import('../netlify/functions/verify.mjs');
  const response = await verify(request({ token: '!'.repeat(43) }));
  assert.equal(response.status, 404);
  assert.deepEqual(await response.json(), { status: 'invalid' });
});
