import test from 'node:test';
import assert from 'node:assert/strict';
import QRCode from 'qrcode';
import { PNG } from 'pngjs';
import jsQR from 'jsqr';
import { buildCredentialUrl } from '../src/credential-url.js';

const token = 'k'.repeat(43);
test('canonical QR URL carries only an opaque token and validates its origin', () => {
  const url = buildCredentialUrl('https://jcb-test.example.invalid/', token);
  assert.equal(url, `https://jcb-test.example.invalid/validar/${token}`);
  for (const origin of ['http://example.invalid', 'javascript:alert(1)', 'https://a:b@example.invalid/', 'https://example.invalid/path', 'https://example.invalid/?a=1']) {
    assert.throws(() => buildCredentialUrl(origin, token));
  }
  for (const invalid of ['', '123', '../secret', '<script>'.padEnd(43, 'a')]) assert.throws(() => buildCredentialUrl('https://example.invalid', invalid));
});
test('independent decoder reads the generated QR URL byte for byte', async () => {
  const url = buildCredentialUrl('https://jcb-test.example.invalid/', token);
  const image = PNG.sync.read(await QRCode.toBuffer(url, { type: 'png', errorCorrectionLevel: 'M', margin: 4, width: 600 }));
  const decoded = jsQR(new Uint8ClampedArray(image.data), image.width, image.height);
  assert.equal(decoded?.data, url);
});
