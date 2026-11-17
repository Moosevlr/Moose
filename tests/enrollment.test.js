import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { normalizeEnrollment, parseVerificationInput } from '../src/verification-input.js';
import { enrollmentDigest, enrollmentIndexKey } from '../src/enrollment-index.js';
import { createStoredVerifyHandler } from '../netlify/functions/verify.mjs';

const token = Buffer.alloc(32, 68).toString('base64url');
const hash = createHash('sha256').update(token).digest('hex');
const enrollment = 'TEST2026-0001';
const now = new Date('2026-11-17T15:00:00Z');
const record = (changes = {}) => ({
  schemaVersion: 1, tokenSha256: hash, issuer: 'JCB ENGENHARIA', issuerTagline: 'Ensino Técnico',
  holderName: 'ALUNO SINTÉTICO', enrollment, course: 'CURSO SINTÉTICO', status: 'active',
  issuerConfirmedAt: '2026-11-13T15:00:00Z', approvalRef: 'Synthetic approval',
  validThrough: '2027-03-31', timeZone: 'America/Sao_Paulo',
  privateNotes: 'PRIVATE VALUE MUST NOT LEAK', ...changes,
});
const request = (parameters) => new Request('https://example.test/.netlify/functions/verify?' + new URLSearchParams(parameters));
const index = () => ({ schemaVersion: 1, tokenSha256: hash });
function fixture(entries, { initialEnrollment = null, clock = () => now } = {}) {
  const calls = [];
  const database = new Map(entries);
  const verify = createStoredVerifyHandler({
    initialEnrollment, now: clock,
    storeFactory: async () => ({
      async get(key, options) { calls.push(key); assert.deepEqual(options, { type: 'json', consistency: 'strong' }); return database.get(key) ?? null; },
      async setJSON() { assert.fail('Public verification must not write'); },
      async list() { assert.fail('Public verification must not scan the registry'); },
    }),
  });
  return { verify, calls, database };
}

test('manual input distinguishes printed enrollment, opaque QR code and own QR URL', () => {
  const origin = 'https://example.test';
  assert.equal(normalizeEnrollment('  test2026-0001  '), enrollment);
  assert.deepEqual(parseVerificationInput('  test2026-0001  ', origin), { kind: 'enrollment', value: enrollment });
  assert.deepEqual(parseVerificationInput(token, origin), { kind: 'token', value: token });
  assert.deepEqual(parseVerificationInput(origin + '/validar/' + token, origin), { kind: 'token', value: token });
  for (const value of ['', 'A', 'A'.repeat(41), 'student/name', '<script>', 'https://other.test/validar/' + token, 'javascript:alert(1)']) {
    assert.equal(parseVerificationInput(value, origin), null);
  }
});

test('enrollment index uses only a normalized digest, without exposing the printed identifier', () => {
  assert.equal(enrollmentIndexKey(' test2026-0001 '), enrollmentIndexKey(enrollment));
  assert.equal(enrollmentIndexKey(enrollment), 'enrollments/' + createHash('sha256').update(enrollment).digest('hex'));
  assert.equal(enrollmentIndexKey('invalid identifier'), null);
  assert(!enrollmentIndexKey(enrollment).includes(enrollment));
});

test('typed enrollment and QR use the same authoritative source for active, pending, revoked and expired results', async () => {
  for (const [changes, clock] of [
    [{}, () => now], [{ status: 'pending' }, () => now], [{ status: 'revoked' }, () => now],
    [{}, () => new Date('2027-04-01T03:00:00Z')],
  ]) {
    const { verify } = fixture([[enrollmentIndexKey(enrollment), index()], [hash, record(changes)]], { clock });
    const qr = await verify(request({ token }));
    const manual = await verify(request({ matricula: ' test2026-0001 ' }));
    assert.equal(qr.status, 200); assert.equal(manual.status, 200);
    assert.deepEqual(await manual.json(), await qr.json());
  }
});

test('manual lookup cannot trust stale active data in an index or expose private record fields', async () => {
  const { verify, database } = fixture([[enrollmentIndexKey(enrollment), { ...index(), status: 'active', holderName: 'UNTRUSTED' }], [hash, record()]]);
  const active = await verify(request({ matricula: enrollment }));
  const result = await active.json();
  assert.equal(result.status, 'active'); assert.equal(result.holderName, 'ALUNO SINTÉTICO');
  for (const value of [hash, token, 'PRIVATE', 'UNTRUSTED', 'Synthetic approval']) assert(!JSON.stringify(result).includes(value));
  database.set(hash, record({ status: 'revoked' }));
  const revoked = await (await verify(request({ matricula: enrollment }))).json();
  assert.equal(revoked.status, 'revoked'); assert(!('holderName' in revoked));
});

test('unknown enrollment, orphan index and index pointing to another enrollment never validate', async () => {
  for (const entries of [
    [], [[enrollmentIndexKey(enrollment), index()]],
    [[enrollmentIndexKey(enrollment), index()], [hash, record({ enrollment: 'OTHER-0001' })]],
  ]) {
    const { verify } = fixture(entries);
    const response = await verify(request({ matricula: enrollment }));
    assert.equal(response.status, 404); assert.deepEqual(await response.json(), { status: 'invalid' });
  }
});

test('revocation without retained identifying fields remains visible through the existing index', async () => {
  const revoked = record({ status: 'revoked' });
  delete revoked.enrollment;
  delete revoked.holderName;
  const { verify } = fixture([[enrollmentIndexKey(enrollment), index()], [hash, revoked]]);
  const manual = await verify(request({ matricula: enrollment }));
  const qr = await verify(request({ token }));
  const manualResult = await manual.json();
  assert.equal(manual.status, 200); assert.equal(qr.status, 200);
  assert.equal(manualResult.status, 'revoked');
  assert.deepEqual(manualResult, await qr.json());
  assert(!('holderName' in manualResult));
});

test('pre-index migration locates only the initial private record and follows its real state', async () => {
  const seed = { enrollmentSha256: enrollmentDigest(enrollment), tokenSha256: hash };
  const { verify, database } = fixture([[hash, record()]], { initialEnrollment: seed });
  const valid = await verify(request({ matricula: enrollment }));
  assert.equal(valid.status, 200); assert.equal((await valid.json()).status, 'active');
  const unknown = await verify(request({ matricula: 'OTHER-0001' }));
  assert.equal(unknown.status, 404);
  database.set(hash, record({ status: 'revoked' }));
  assert.equal((await (await verify(request({ matricula: enrollment }))).json()).status, 'revoked');
  database.delete(hash);
  const missing = await verify(request({ matricula: enrollment }));
  assert.equal(missing.status, 404); assert.deepEqual(await missing.json(), { status: 'invalid' });
});

test('conflicting and repeated selectors are rejected before storage access', async () => {
  const { verify, calls } = fixture([]);
  for (const query of [
    `matricula=${enrollment}&token=${token}`, `matricula=${enrollment}&matricula=${enrollment}`,
    'matricula=', 'matricula=not%20an%20identifier',
  ]) assert.equal((await verify(new Request('https://example.test/.netlify/functions/verify?' + query))).status, 404);
  assert.equal(calls.length, 0);
});

test('broken indices and unavailable storage never become active or expose diagnostics from private data', async () => {
  for (const bad of [{}, { schemaVersion: 1, tokenSha256: 'invalid' }, { schemaVersion: 2, tokenSha256: hash }]) {
    const { verify } = fixture([[enrollmentIndexKey(enrollment), bad], [hash, record()]]);
    const response = await verify(request({ matricula: enrollment }));
    assert.equal(response.status, 503); assert.deepEqual(await response.json(), { status: 'invalid' });
  }
  const verify = createStoredVerifyHandler({ storeFactory() { throw Error('PRIVATE STORAGE DETAILS'); } });
  const unavailable = await verify(request({ matricula: enrollment }));
  assert.equal(unavailable.status, 503); assert.deepEqual(await unavailable.json(), { status: 'invalid' });
});
