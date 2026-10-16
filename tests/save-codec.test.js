import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Worker as ThreadWorker } from 'node:worker_threads';
import { createSaveCodecClient } from '../src/emulator/save-codec-client.js';
import { decodeSaveBlob, encodeSaveSnapshot, runSaveCodecOperation } from '../src/emulator/save-codec.js';

const snapshot = () => ({
  directories: ['mc0', 'mc1', 'mc0/GAME'],
  files: [{ path: 'mc0/GAME/progress', bytes: new Uint8Array([0, 1, 127, 255]) }],
});

// Runs the actual browser worker entry in a Node thread with only its
// postMessage/self transport adapted, rather than mocking codec execution.
class ModuleWorker {
  static instances = [];
  constructor(url, options) {
    assert.equal(options.type, 'module');
    assert.match(url.pathname, /save-codec-worker\.js$/);
    const bootstrap = `
      import { parentPort } from 'node:worker_threads';
      globalThis.self = globalThis;
      self.postMessage = (data) => parentPort.postMessage(data);
      await import(${JSON.stringify(url.href)});
      parentPort.on('message', (data) => self.onmessage({ data }));
    `;
    this.thread = new ThreadWorker(new URL(`data:text/javascript,${encodeURIComponent(bootstrap)}`));
    this.thread.on('message', (data) => this.onmessage?.({ data }));
    this.thread.on('error', (error) => this.onerror?.({ error, preventDefault() {} }));
    this.thread.on('messageerror', (error) => this.onmessageerror?.({ error }));
    this.messages = [];
    ModuleWorker.instances.push(this);
  }
  postMessage(data, ...transfer) {
    // Capturing a live/staged card must not transfer ownership away from it.
    assert.equal(transfer.length, 0);
    this.messages.push({ id: data.id, operation: data.operation });
    this.thread.postMessage(data);
  }
  terminate() { this.termination = this.thread.terminate(); }
}

test('SAVE v1 codec preserves format, checksum, card bytes, and metadata limits', async () => {
  const original = snapshot();
  const encoded = await encodeSaveSnapshot(original, 'J'.repeat(201));
  const save = JSON.parse(await encoded.blob.text());
  assert.equal(save.format, 'digital-station-save');
  assert.equal(save.version, 1);
  assert.equal(save.game.length, 200);
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(save.cards)));
  assert.equal(save.checksum, Buffer.from(hash).toString('hex'));
  assert.deepEqual(await decodeSaveBlob(encoded.blob), original);
  assert.equal(await runSaveCodecOperation('validate', { blob: encoded.blob }), true);
  assert.equal(encoded.fileCount, 1);
});

test('actual module worker encodes, decodes, validates without returning bytes, and remains reusable', async (t) => {
  const client = createSaveCodecClient({ Worker: ModuleWorker });
  const before = ModuleWorker.instances.length;
  t.after(async () => {
    client.dispose();
    await Promise.all(ModuleWorker.instances.slice(before).map((worker) => worker.termination));
  });
  const original = snapshot();
  const encoded = await client.encodeSnapshot(original, 'Teste');
  const [decoded, validation] = await Promise.all([client.decodeSave(encoded.blob), client.validateSave(encoded.blob)]);
  assert.deepEqual(decoded, original);
  assert.equal(validation, true);
  assert.deepEqual(original.files[0].bytes, new Uint8Array([0, 1, 127, 255]));
  assert.equal(original.files[0].bytes.buffer.byteLength, 4);
  assert.equal(ModuleWorker.instances.length, before + 1);
  assert.deepEqual(ModuleWorker.instances.at(-1).messages.map((message) => message.operation), ['encode', 'decode', 'validate']);
  const tampered = JSON.parse(await encoded.blob.text());
  tampered.cards.files[0].data = 'AQID';
  await assert.rejects(client.validateSave(new Blob([JSON.stringify(tampered)])), /corrompido/);
  assert.equal(ModuleWorker.instances.at(-1).termination, undefined, 'invalid SAVE must not disable the worker');
  assert.equal(await client.validateSave(encoded.blob), true);
});

test('no-Worker environments use the same codec and reject malformed data', async (t) => {
  const client = createSaveCodecClient({ Worker: null });
  t.after(() => client.dispose());
  const original = snapshot();
  const encoded = await client.encodeSnapshot(original);
  assert.deepEqual(await client.decodeSave(encoded.blob), original);
  await assert.rejects(client.validateSave(new Blob(['not a SAVE'])), /Não reconheci/);
  await assert.rejects(client.encodeSnapshot({ ...original, files: [{ path: 'mc0/GAME/bad', bytes: 'not bytes' }] }), /dados inválidos/);
});

test('native base64 helpers retain the same SAVE bytes and reject malformed input before decoding', async () => {
  const fromDescriptor = Object.getOwnPropertyDescriptor(Uint8Array, 'fromBase64');
  const toDescriptor = Object.getOwnPropertyDescriptor(Uint8Array.prototype, 'toBase64');
  let decodes = 0;
  let encodes = 0;
  try {
    Object.defineProperty(Uint8Array, 'fromBase64', { configurable: true, value(data) {
      decodes += 1;
      return new Uint8Array(Buffer.from(data, 'base64'));
    } });
    Object.defineProperty(Uint8Array.prototype, 'toBase64', { configurable: true, value() {
      encodes += 1;
      return Buffer.from(this).toString('base64');
    } });
    const original = snapshot();
    const encoded = await encodeSaveSnapshot(original);
    assert.deepEqual(await decodeSaveBlob(encoded.blob), original);
    assert.equal(encodes, 1);
    assert.equal(decodes, 1);
    const invalid = JSON.parse(await encoded.blob.text());
    invalid.cards.files[0].data = 'A===';
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(invalid.cards)));
    invalid.checksum = Buffer.from(digest).toString('hex');
    await assert.rejects(decodeSaveBlob(new Blob([JSON.stringify(invalid)])), /dados inválidos/);
    assert.equal(decodes, 1);
  } finally {
    if (fromDescriptor) Object.defineProperty(Uint8Array, 'fromBase64', fromDescriptor);
    else delete Uint8Array.fromBase64;
    if (toDescriptor) Object.defineProperty(Uint8Array.prototype, 'toBase64', toDescriptor);
    else delete Uint8Array.prototype.toBase64;
  }
});

test('worker construction or message-cloning failures fall back without losing card ownership', async (t) => {
  for (const Worker of [
    class { constructor() { throw new Error('CSP blocked'); } },
    class { postMessage() { throw new DOMException('Cannot clone', 'DataCloneError'); } terminate() {} },
  ]) {
    const client = createSaveCodecClient({ Worker });
    t.after(() => client.dispose());
    const original = snapshot();
    const encoded = await client.encodeSnapshot(original);
    assert.deepEqual(await client.decodeSave(encoded.blob), original);
    assert.equal(original.files[0].bytes.byteLength, 4);
  }
});

test('worker error retries every pending job with integrity checks and ignores late responses', async (t) => {
  let worker;
  class FailingWorker {
    constructor() { worker = this; this.sent = []; }
    postMessage(data) {
      this.sent.push(data);
      if (this.sent.length === 2) queueMicrotask(() => this.onerror({ preventDefault() {} }));
    }
    terminate() { this.terminated = true; }
  }
  const client = createSaveCodecClient({ Worker: FailingWorker });
  t.after(() => client.dispose());
  const encoded = await encodeSaveSnapshot(snapshot());
  const [decoded, validation] = await Promise.all([client.decodeSave(encoded.blob), client.validateSave(encoded.blob)]);
  assert.deepEqual(decoded, snapshot());
  assert.equal(validation, true);
  assert.equal(worker.terminated, true);
  worker.onmessage({ data: { id: worker.sent[0].id, result: 'late' } });
  await assert.rejects(client.validateSave(new Blob(['broken'])), /Não reconheci/);
});

test('an unresponsive worker times out into a verified fallback instead of hanging', async (t) => {
  let terminated = false;
  class SilentWorker { postMessage() {} terminate() { terminated = true; } }
  const client = createSaveCodecClient({ Worker: SilentWorker, timeoutMs: 5 });
  t.after(() => client.dispose());
  const encoded = await client.encodeSnapshot(snapshot());
  assert.equal(terminated, true);
  assert.deepEqual(await client.decodeSave(encoded.blob), snapshot());
});

test('dispose rejects pending and future requests instead of silently falling back', async () => {
  class SilentWorker { postMessage() {} terminate() {} }
  const client = createSaveCodecClient({ Worker: SilentWorker });
  const pending = client.encodeSnapshot(snapshot());
  client.dispose();
  await assert.rejects(pending, /encerrado/);
  await assert.rejects(client.decodeSave(new Blob()), /encerrado/);
});

test('dispose before a no-Worker fallback starts prevents processing the payload', async () => {
  const client = createSaveCodecClient({ Worker: null });
  const file = { size: 1, text: () => assert.fail('Disposed fallback must not read the SAVE') };
  const pending = client.decodeSave(file);
  client.dispose();
  await assert.rejects(pending, /encerrado/);
});

test('dispose during fallback discards valid results with and without a failed worker', async () => {
  const encoded = await encodeSaveSnapshot(snapshot());
  const text = await encoded.blob.text();
  for (const Worker of [
    null,
    class {
      postMessage() { queueMicrotask(() => this.onerror({ preventDefault() {} })); }
      terminate() {}
    },
  ]) {
    const client = createSaveCodecClient({ Worker });
    let finishRead;
    let notifyStarted;
    const started = new Promise((resolve) => { notifyStarted = resolve; });
    const file = {
      size: encoded.blob.size,
      text() {
        notifyStarted();
        return new Promise((resolve) => { finishRead = resolve; });
      },
    };
    const pending = client.decodeSave(file);
    await started;
    client.dispose();
    finishRead(text);
    await assert.rejects(pending, /encerrado/);
    await assert.rejects(client.encodeSnapshot(snapshot()), /encerrado/);
  }
});
