import test from 'node:test';
import assert from 'node:assert/strict';
import { downloadCore } from '../src/emulator/download-core.js';

const wasm = Uint8Array.of(0, 97, 115, 109, 1, 0, 0, 0);
test('downloads streamed WebAssembly and reports received bytes', async () => {
  const progress = [];
  const response = new Response(new ReadableStream({ start(controller) {
    controller.enqueue(wasm.slice(0, 3)); controller.enqueue(wasm.slice(3)); controller.close();
  } }), { headers: { 'content-type': 'application/wasm', 'content-length': '8' } });
  assert.deepEqual(await downloadCore('/core', { fetchImpl: async () => response, onProgress: (...args) => progress.push(args) }), wasm);
  assert.deepEqual(progress, [[3, 8], [8, 8]]);
});
test('rejects the actual sign-in HTTP status rather than reporting readiness', async () => {
  await assert.rejects(downloadCore('/core', { fetchImpl: async () => new Response('login', { status: 401 }) }), /HTTP 401/);
});
test('rejects HTML even when the server responds with 200', async () => {
  await assert.rejects(downloadCore('/core', { fetchImpl: async () => new Response('<html>login</html>', { headers: { 'content-type': 'text/html' } }) }), /login/);
});
test('rejects a truncated WebAssembly download', async () => {
  await assert.rejects(downloadCore('/core', { fetchImpl: async () => new Response(wasm.slice(0, 6), { headers: { 'content-type': 'application/wasm' } }) }), /incompleto/);
});
