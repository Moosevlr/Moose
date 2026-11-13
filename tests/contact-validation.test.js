import test from 'node:test';
import assert from 'node:assert/strict';
import { CONTACT_LIMITS, MAX_CONTACT_BYTES, isSameOriginContact, readContactBody, validateContact } from '../src/contact-validation.js';
import { createContactHandler } from '../netlify/functions/contact.mjs';

const origin = 'https://jcb-example.netlify.app';
const valid = () => ({ name: 'Pessoa Interessada', email: 'pessoa@example.com', phone: '', course: 'Curso informado', message: 'Quero informações sobre este curso.', consent: true, website: '' });
const request = (data = valid(), { type = 'application/json', ...options } = {}) => new Request(origin + '/api/contato', {
  method: 'POST', headers: { Origin: origin, 'Content-Type': type },
  body: type === 'application/json' ? JSON.stringify(data) : new URLSearchParams(data).toString(), ...options,
});

test('validates required fields, normalizes text, and allows an omitted phone', () => {
  const input = { ...valid(), name: '  Maria da Silva  ', email: ' MARIA@EXAMPLE.COM ', message: 'Mensagem com\r\nmais detalhes.', ignored: 'not stored' };
  delete input.phone;
  const result = validateContact(input);
  assert.equal(result.ok, true);
  assert.equal(result.honeypot, false);
  assert.deepEqual(result.data, {
    name: 'Maria da Silva', email: 'maria@example.com', phone: '', course: 'Curso informado',
    message: 'Mensagem com\nmais detalhes.', consent: true,
  });
  assert.equal(input.name, '  Maria da Silva  ');
});

test('rejects absent, malformed, oversized or unconsented fields without reflecting their content', () => {
  assert.equal(validateContact(null).ok, false);
  assert.equal(validateContact([]).ok, false);
  for (const [field, value] of [
    ['name', 'x'], ['name', 'A'.repeat(CONTACT_LIMITS.name + 1)], ['name', 'A\nB'],
    ['email', 'invalid'], ['email', 'a\r\nb@example.com'], ['email', 'a'.repeat(255) + '@example.com'],
    ['phone', 12345678], ['phone', '123'], ['phone', '12345678\r\n'], ['phone', '1'.repeat(16)],
    ['course', ''], ['course', 'x'.repeat(CONTACT_LIMITS.course + 1)], ['message', 'curta'],
    ['message', 'x'.repeat(CONTACT_LIMITS.message + 1)], ['message', 'Mensagem\0 inválida'], ['consent', false],
  ]) {
    const input = { ...valid(), [field]: value };
    // Normal whitespace at either end is trimmed; a control inside stays invalid.
    if (field === 'phone' && value === '12345678\r\n') input.phone = '1234\r\n5678';
    const result = validateContact(input);
    assert.equal(result.ok, false, `${field}: ${String(value).slice(0, 30)}`);
    assert.equal(typeof result.fields[field], 'string');
    assert.equal('data' in result, false);
  }
  assert.equal(validateContact({ ...valid(), phone: '+55 (11) 99999-1234' }).ok, true);
  assert.equal(validateContact({ ...valid(), consent: 'on' }).ok, true);
  assert.equal(validateContact({ ...valid(), consent: 'false' }).ok, false);
});

test('honeypot submits neutrally without returning contact data', () => {
  assert.deepEqual(validateContact({ website: 'https://spam.example' }), { ok: true, honeypot: true, data: null });
});

test('HTML-like message is stored as ordinary text and cannot add record properties', () => {
  const message = '<img src=x onerror="alert(1)"> Quero informações.';
  const result = validateContact({ ...valid(), message, id: 'attacker-id', createdAt: 'fake' });
  assert.equal(result.ok, true);
  assert.equal(result.data.message, message);
  assert.equal(Object.hasOwn(result.data, 'id'), false);
  assert.equal(Object.hasOwn(result.data, 'createdAt'), false);
});

test('parses JSON and URL-encoded bodies, rejecting malformed data and duplicate form fields', async () => {
  assert.deepEqual(await readContactBody(request()), valid());
  const parsed = await readContactBody(request({ ...valid(), consent: 'on' }, { type: 'application/x-www-form-urlencoded; charset=UTF-8' }));
  assert.equal(validateContact(parsed).ok, true);
  await assert.rejects(readContactBody(request({}, { body: '{bad' })), (error) => error.status === 400);
  await assert.rejects(readContactBody(request({}, { type: 'text/plain' })), (error) => error.status === 415);
  await assert.rejects(readContactBody(request({}, {
    type: 'application/x-www-form-urlencoded', body: 'name=First&name=Second',
  })), /campos repetidos/);
});

test('enforces 16 KiB by bytes before reading and during streamed reads', async () => {
  const declared = request({}, { headers: { 'Content-Type': 'application/json', 'Content-Length': String(MAX_CONTACT_BYTES + 1) } });
  await assert.rejects(readContactBody(declared), (error) => error.status === 413);
  const multiByte = request({ message: 'á'.repeat(MAX_CONTACT_BYTES / 2) });
  await assert.rejects(readContactBody(multiByte), (error) => error.status === 413);
  const lying = request({}, {
    headers: { 'Content-Type': 'application/json', 'Content-Length': '2' }, body: 'x'.repeat(MAX_CONTACT_BYTES + 1),
  });
  await assert.rejects(readContactBody(lying), (error) => error.status === 413);
});

test('allows only an explicit same-origin POST origin', () => {
  assert.equal(isSameOriginContact(request()), true);
  for (const value of ['https://other.example', 'null', '', origin + '.evil.example']) {
    assert.equal(isSameOriginContact(request({}, { headers: { Origin: value } })), false);
  }
  assert.equal(isSameOriginContact(request({}, { headers: {} })), false);
});

test('function confirms success only after private Blobs storage commits selected data', async () => {
  let release;
  const saved = [];
  const handler = createContactHandler({
    storeFactory: (name) => {
      assert.equal(name, 'jcb-interesses');
      return { setJSON: async (...args) => { saved.push(args); return new Promise((resolve) => { release = resolve; }); } };
    },
    now: () => new Date('2026-11-13T12:00:00.000Z'), createId: () => 'test-uuid',
  });
  let settled = false;
  const pending = handler(request({ ...valid(), id: 'attacker' })).then((response) => { settled = true; return response; });
  while (!release) await new Promise((resolve) => setImmediate(resolve));
  assert.equal(settled, false);
  release({ modified: true });
  const response = await pending;
  assert.equal(response.status, 201);
  assert.equal(response.headers.get('Cache-Control'), 'no-store');
  assert.equal((await response.json()).ok, true);
  assert.deepEqual(saved, [['test-uuid', {
    id: 'test-uuid', createdAt: '2026-11-13T12:00:00.000Z',
    name: 'Pessoa Interessada', email: 'pessoa@example.com', phone: '', course: 'Curso informado',
    message: 'Quero informações sobre este curso.', consent: true,
  }, { onlyIfNew: true }]]);
});

test('honeypot, invalid data, wrong origin and wrong method never open the store', async () => {
  const handler = createContactHandler({ storeFactory: () => assert.fail('Store must not be accessed') });
  const cases = [
    [request({ website: 'filled' }), 200],
    [request({ ...valid(), consent: false }), 422],
    [request({}, { headers: { Origin: 'https://other.example', 'Content-Type': 'application/json' } }), 403],
    [new Request(origin + '/api/contato'), 405],
    [request({}, { body: '{malformed' }), 400],
  ];
  for (const [submission, status] of cases) {
    const response = await handler(submission);
    assert.equal(response.status, status);
    assert.equal(response.headers.get('Cache-Control'), 'no-store');
  }
  const honeypot = await handler(request({ website: 'filled' }));
  assert.deepEqual(await honeypot.json(), { ok: true, message: 'Solicitação recebida.' });
});

test('unavailable, refused or failed Blobs writes return 503 without raw errors or false delivery', async () => {
  for (const storeFactory of [
    () => { throw new Error('private token and contact details'); },
    () => ({ setJSON: async () => { throw new Error('private token and contact details'); } }),
    () => ({ setJSON: async () => ({ modified: false }) }),
  ]) {
    const response = await createContactHandler({ storeFactory })(request());
    assert.equal(response.status, 503);
    assert.equal(response.headers.get('Cache-Control'), 'no-store');
    assert.equal(response.headers.get('Retry-After'), '60');
    const result = await response.json();
    assert.equal(result.ok, false);
    assert.doesNotMatch(JSON.stringify(result), /private|token|pessoa@example/);
  }
});
