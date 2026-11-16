import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { encodeInterestSubmission, renderContact, submitInterestSubmission } from '../src/pages.js';

const valid = () => ({
  name: 'Pessoa de Teste', email: 'pessoa@example.com', phone: '+55 (11) 99999-1234',
  course: 'controle-tecnologico', message: 'Gostaria de informações sobre o curso.', consent: true, website: '',
});

test('native Netlify Forms protocol preserves UTF-8, literal plus signs and field boundaries', () => {
  const data = { ...valid(), name: 'Conceição & Lima', email: 'pessoa+curso@example.com', message: 'Dúvida: aço & asfalto\nCondições = preços + datas?', ignored: 'not sent' };
  const body = encodeInterestSubmission(data);
  const decoded = new URLSearchParams(body);
  assert.equal(decoded.get('form-name'), 'interesse');
  for (const key of ['name', 'email', 'phone', 'course', 'message', 'website']) assert.equal(decoded.get(key), data[key]);
  assert.equal(decoded.get('consent'), 'true');
  assert.equal(decoded.has('ignored'), false);
  assert.deepEqual([...decoded.keys()].sort(), ['form-name', 'name', 'email', 'phone', 'course', 'message', 'consent', 'website'].sort());
  assert.doesNotMatch(body, /^\{/);
});

test('submission makes one URL-encoded POST to root and accepts native HTML 200 without parsing JSON', async () => {
  const calls = [];
  const native = new Response('<!doctype html><title>Obrigado</title>', { status: 200, headers: { 'Content-Type': 'text/html' } });
  native.json = () => assert.fail('A successful native Forms response is not JSON');
  const response = await submitInterestSubmission({ ...valid(), name: '  Pessoa de Teste  ', ignored: 'not sent' }, async (...args) => {
    calls.push(args);
    return native;
  });
  assert.equal(response, native);
  assert.equal(calls.length, 1);
  const [url, options] = calls[0];
  assert.equal(url, '/');
  assert.equal(options.method, 'POST');
  assert.match(options.headers['Content-Type'], /^application\/x-www-form-urlencoded/i);
  assert.equal(new URLSearchParams(options.body).get('name'), 'Pessoa de Teste');
  assert.equal(new URLSearchParams(options.body).get('form-name'), 'interesse');
  assert.equal(new URLSearchParams(options.body).has('ignored'), false);
});

test('invalid consent and filled honeypot do not submit or report a successful send', async () => {
  const failFetch = () => assert.fail('No request should be made for rejected input');
  await assert.rejects(submitInterestSubmission({ ...valid(), consent: false }, failFetch), (error) => error.status === 422 && typeof error.fields.consent === 'string');
  await assert.rejects(submitInterestSubmission({ ...valid(), phone: '123' }, failFetch), (error) => error.status === 422 && typeof error.fields.phone === 'string');
  await assert.rejects(submitInterestSubmission({ ...valid(), website: 'filled' }, failFetch), /Não foi possível enviar/);
});

test('HTTP errors and network failures cannot be mistaken for successful native submissions', async () => {
  await assert.rejects(submitInterestSubmission(valid(), async () => new Response('<h1>Unavailable</h1>', { status: 503 })), (error) => error.status === 503);
  await assert.rejects(submitInterestSubmission(valid(), async () => { throw new Error('Network unavailable'); }), /Network unavailable/);
  const fields = { email: 'Confira o e-mail.' };
  await assert.rejects(submitInterestSubmission(valid(), async () => Response.json({ fields }, { status: 422 })), (error) => error.status === 422 && error.fields.email === fields.email);
  await assert.rejects(submitInterestSubmission(valid(), async () => new Response('{broken', { status: 422, headers: { 'Content-Type': 'application/json' } })), (error) => error.status === 422 && /Não foi possível enviar/.test(error.message));
});

test('static detection blueprint and visible form share the protocol schema and honeypot', async () => {
  const index = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  const blueprint = /<form\b[^>]*id="interest-form-blueprint"[^>]*>[\s\S]*?<\/form>/.exec(index)?.[0];
  assert.ok(blueprint, 'Netlify must see the form schema in static HTML before JavaScript runs');
  const visiblePage = renderContact({ name: 'Instituição de Teste', courses: [{ slug: 'controle-tecnologico', title: 'Curso de Teste' }] });
  const visible = /<form\b[^>]*id="interest-form"[^>]*>[\s\S]*?<\/form>/.exec(visiblePage)?.[0];
  assert.ok(visible);
  const names = (form) => [...form.matchAll(/<(?:input|select|textarea)\b[^>]*\bname="([^"]+)"/g)].map((match) => match[1]).sort();
  const fields = [...new URLSearchParams(encodeInterestSubmission(valid())).keys()].sort();
  assert.deepEqual(names(blueprint), fields);
  assert.deepEqual(names(visible), fields);
  for (const form of [blueprint, visible]) {
    assert.match(form, /name="interesse"/);
    assert.match(form, /method="POST"/);
    assert.match(form, /action="\/obrigado"/);
    assert.match(form, /data-netlify="true"/);
    assert.match(form, /netlify-honeypot="website"/);
    assert.match(form, /name="form-name" value="interesse"/);
    assert.match(form, /type="email"[^>]*name="email"|name="email"[^>]*type="email"/);
  }
  assert.match(blueprint.split('>')[0], /\bhidden\b/);
});
