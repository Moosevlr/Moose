import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { analyzeDevice, recommendGraphics } from '../src/graphics/device-analysis.js';

function browser(overrides = {}) {
  const calls = { extensions: [], released: 0, contexts: 0 };
  const gl = {
    MAX_TEXTURE_SIZE: 1, MAX_RENDERBUFFER_SIZE: 2, MAX_VIEWPORT_DIMS: 3,
    getParameter(parameter) { return [null, 8192, 4096, new Int32Array([8192, 4096])][parameter]; },
    getExtension(name) {
      calls.extensions.push(name);
      assert.equal(name, 'WEBGL_lose_context', 'GPU debug renderer must not be requested');
      return { loseContext() { calls.released += 1; } };
    },
  };
  const environment = {
    navigator: { hardwareConcurrency: 8, deviceMemory: 8, maxTouchPoints: 0, connection: { saveData: false } },
    document: { documentElement: { clientWidth: 800, clientHeight: 600 }, createElement(name) {
      assert.equal(name, 'canvas');
      return { getContext(type) { calls.contexts += 1; assert.equal(type, 'webgl2'); return gl; } };
    } },
    innerWidth: 1280, innerHeight: 720, devicePixelRatio: 2,
    crossOriginIsolated: true, SharedArrayBuffer() {}, Worker() {},
    WebAssembly: { instantiate() {} },
    matchMedia() { return { matches: false }; },
    ...overrides,
  };
  return { environment, gl, calls };
}

test('import does not inspect the device, probe graphics, or make requests', () => {
  const moduleUrl = new URL('../src/graphics/device-analysis.js', import.meta.url).href;
  const code = `
    let accesses = 0;
    for (const name of ['navigator', 'document', 'matchMedia', 'fetch']) {
      Object.defineProperty(globalThis, name, { configurable: true, get() { accesses++; throw Error('Unexpected device access'); } });
    }
    const api = await import(${JSON.stringify(moduleUrl)});
    if (accesses !== 0 || typeof api.analyzeDevice !== 'function') process.exit(1);
  `;
  execFileSync(process.execPath, ['--input-type=module', '-e', code]);
});

test('explicit analysis reads standard limits and releases its WebGL probe', () => {
  const { environment, calls } = browser();
  // Current Chromium can expose a coarsened value above the historical 8 GB cap.
  environment.navigator.deviceMemory = 32;
  assert.equal(calls.contexts, 0);
  const result = analyzeDevice(environment);
  assert.equal(result.logicalProcessors, 8);
  assert.equal(result.deviceMemoryGB, 32);
  assert.equal(result.webgl2, true);
  assert.equal(result.sharedMemory, true);
  assert.equal(result.wasm, true);
  assert.equal(result.workers, true);
  assert.equal(result.maxTextureSize, 8192);
  assert.equal(result.maxRenderbufferSize, 4096);
  assert.deepEqual(result.maxViewportDimensions, [8192, 4096]);
  assert.deepEqual(result.viewport, { width: 1280, height: 720 });
  assert.equal(result.devicePixelRatio, 2);
  assert.deepEqual(calls.extensions, ['WEBGL_lose_context']);
  assert.equal(calls.released, 1);
});

test('absent APIs remain unknown rather than reporting invented CPU or memory', () => {
  const result = analyzeDevice({});
  assert.equal(result.logicalProcessors, null);
  assert.equal(result.deviceMemoryGB, null);
  assert.equal(result.maxTextureSize, null);
  assert.equal(result.maxRenderbufferSize, null);
  assert.equal(result.maxViewportDimensions, null);
  assert.deepEqual(result.viewport, { width: 0, height: 0 });
  assert.equal(result.devicePixelRatio, 1);
  for (const key of ['webgl2', 'sharedMemory', 'wasm', 'workers', 'touch', 'reducedMotion', 'dataSaver']) assert.equal(result[key], false);
});

test('restricted getters and graphics calls cannot break analysis', () => {
  const { environment, gl, calls } = browser();
  Object.defineProperty(environment.navigator, 'hardwareConcurrency', { get() { throw Error('restricted'); } });
  Object.defineProperty(environment.navigator, 'deviceMemory', { get() { throw Error('restricted'); } });
  environment.matchMedia = () => { throw Error('restricted'); };
  gl.getParameter = (parameter) => { if (parameter === 1) throw Error('restricted'); return parameter === 2 ? 4096 : new Int32Array([4096, 4096]); };
  const result = analyzeDevice(environment);
  assert.equal(result.logicalProcessors, null);
  assert.equal(result.deviceMemoryGB, null);
  assert.equal(result.maxTextureSize, null);
  assert.equal(result.maxRenderbufferSize, 4096);
  assert.equal(result.webgl2, true);
  assert.equal(calls.released, 1);
});

test('a blocked canvas or cleanup extension fails safely', () => {
  const blocked = browser({ document: { createElement() { throw Error('blocked'); } } });
  assert.equal(analyzeDevice(blocked.environment).webgl2, false);
  const cleanup = browser();
  cleanup.gl.getExtension = () => { throw Error('blocked'); };
  assert.equal(analyzeDevice(cleanup.environment).webgl2, true);
});

test('invalid numeric observations are unavailable and viewport has a safe fallback', () => {
  const { environment } = browser({ innerWidth: NaN, innerHeight: -1, devicePixelRatio: 0 });
  environment.navigator.hardwareConcurrency = 2.5;
  environment.navigator.deviceMemory = Infinity;
  const result = analyzeDevice(environment);
  assert.equal(result.logicalProcessors, null);
  assert.equal(result.deviceMemoryGB, null);
  assert.equal(result.devicePixelRatio, 1);
  assert.deepEqual(result.viewport, { width: 800, height: 600 });
});

test('touch, screen size, DPR, and unknown resources do not imply weak hardware', () => {
  for (const report of [
    { logicalProcessors: null, deviceMemoryGB: null },
    { logicalProcessors: 8, deviceMemoryGB: null },
    { logicalProcessors: 64, deviceMemoryGB: 8, touch: true, viewport: { width: 320, height: 640 }, devicePixelRatio: 3 },
  ]) {
    const recommendation = recommendGraphics(report);
    assert.equal(recommendation.profile, 'balanced');
    assert(recommendation.reasons.some(reason => reason.includes('1×')));
    assert(!recommendation.reasons.some(reason => reason.includes('2×')));
  }
});

test('low exposed resources or explicit preferences select a conservative profile', () => {
  for (const report of [{ logicalProcessors: 4 }, { logicalProcessors: 2 }, { deviceMemoryGB: 4 }, { deviceMemoryGB: 0.5 }, { reducedMotion: true }, { dataSaver: true }]) {
    const recommendation = recommendGraphics(report);
    assert.equal(recommendation.profile, 'economy');
    assert(recommendation.reasons.length >= 2);
    assert(recommendation.reasons.some(reason => reason.includes('1×')));
  }
});

test('unavailable emulator capabilities produce blockers without a fake hardware diagnosis', () => {
  const recommendation = recommendGraphics({ logicalProcessors: null, deviceMemoryGB: null, webgl2: false, sharedMemory: false, wasm: false, workers: false });
  assert.equal(recommendation.profile, 'balanced');
  assert.equal(recommendation.warnings.length, 4);
  assert(!recommendation.warnings.some(warning => /VRAM|modelo|CPU lenta|GPU incompatível/.test(warning)));
});

test('touch and explicit accessibility/data preferences are collected independently', () => {
  const { environment } = browser({ matchMedia(query) { return { matches: query.includes('coarse') || query.includes('reduced-motion') }; } });
  environment.navigator.connection.saveData = true;
  const report = analyzeDevice(environment);
  assert.equal(report.touch, true);
  assert.equal(report.reducedMotion, true);
  assert.equal(report.dataSaver, true);
});
