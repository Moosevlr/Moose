import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createGraphicsPreferences, DEFAULT_GRAPHICS, normalizeGraphics } from '../src/graphics/graphics-preferences.js';

const KEY = 'digital-station-graphics-v1';

function memoryStorage(entries = []) {
  const values = new Map(entries);
  const calls = [];
  return {
    values,
    calls,
    getItem(key) { calls.push(['getItem', key]); return values.get(key) ?? null; },
    setItem(key, value) { calls.push(['setItem', key]); values.set(key, value); },
    removeItem(key) { calls.push(['removeItem', key]); values.delete(key); },
  };
}

test('normalization accepts only version 1, strict booleans, supported scales and enums', () => {
  assert(Object.isFrozen(DEFAULT_GRAPHICS));
  for (const value of [null, undefined, [], {}, { version: 2, resolutionScale: 2 }]) {
    assert.equal(normalizeGraphics(value), DEFAULT_GRAPHICS);
  }
  assert.deepEqual(normalizeGraphics({
    version: 1, resolutionScale: '2', bilinearFiltering: 'true', displaySize: 'huge', scaling: 'blurred', showFps: 'false',
  }), DEFAULT_GRAPHICS);
  const normalized = normalizeGraphics({
    version: 1, resolutionScale: 2, bilinearFiltering: true, displaySize: 'compact', scaling: 'pixelated', showFps: false,
    deviceMemory: 64, renderer: 'private device detail', extra: true,
  });
  assert.deepEqual(normalized, {
    version: 1, resolutionScale: 2, bilinearFiltering: true, displaySize: 'compact', scaling: 'pixelated', showFps: false,
  });
  assert(Object.isFrozen(normalized));
});

test('module import, creation, and subscription do not access localStorage or identify a device', async () => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  let accesses = 0;
  try {
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, get() {
      accesses += 1;
      throw new DOMException('Denied', 'SecurityError');
    } });
    const freshModule = await import('../src/graphics/graphics-preferences.js?lazy-import');
    const unsubscribe = freshModule.graphicsPreferences.subscribe(() => {});
    const created = freshModule.createGraphicsPreferences();
    assert.equal(accesses, 0);
    assert.match(created.getSnapshot().storageError, /ler as preferências/);
    assert.equal(accesses, 1);
    created.getSnapshot();
    assert.equal(accesses, 1, 'storage is read once, not on every React snapshot read');
    unsubscribe();
  } finally {
    if (descriptor) Object.defineProperty(globalThis, 'localStorage', descriptor);
    else delete globalThis.localStorage;
  }
});

test('snapshot and preferences keep identity until a visible state change', () => {
  const storage = memoryStorage();
  const store = createGraphicsPreferences({ storage: () => storage });
  let updates = 0;
  const unsubscribe = store.subscribe(() => { updates += 1; });
  const initial = store.getSnapshot();
  assert.equal(initial, store.getSnapshot());
  assert(Object.isFrozen(initial));
  assert.equal(store.update({ showFps: true, ignored: 'value' }), initial);
  assert.equal(updates, 0);
  const changed = store.update({ showFps: false });
  assert.notEqual(changed, initial);
  assert.equal(changed, store.getSnapshot());
  assert.equal(updates, 1);
  assert.equal(store.update({ showFps: false }), changed);
  assert.equal(updates, 1);
  unsubscribe();
  store.update({ showFps: true });
  assert.equal(updates, 1);
});

test('updates preserve other preferences, persist only the six fields, and survive a new instance', () => {
  const storage = memoryStorage([[KEY, JSON.stringify({ ...DEFAULT_GRAPHICS, scaling: 'pixelated' })]]);
  const first = createGraphicsPreferences({ storage: () => storage });
  first.update({ resolutionScale: 2, bilinearFiltering: true, analysis: { gpu: 'private' }, applied: { resolutionScale: 2 }, version: 9 });
  const persisted = JSON.parse(storage.values.get(KEY));
  assert.deepEqual(persisted, { ...DEFAULT_GRAPHICS, resolutionScale: 2, bilinearFiltering: true, scaling: 'pixelated' });
  assert.equal(Object.keys(persisted).length, 6);
  const reloaded = createGraphicsPreferences({ storage: () => storage }).getSnapshot();
  assert.deepEqual(reloaded.preferences, persisted);
  assert.equal(reloaded.applied, null);
  assert.equal(reloaded.storageError, null);
});

test('reset deletes only graphics preferences and keeps applied native settings pending', () => {
  const storage = memoryStorage([
    ['digital-station-controls-v1', '{"version":1,"keys":{}}'],
    ['unrelated-user-preference', 'keep'],
  ]);
  const store = createGraphicsPreferences({ storage: () => storage });
  store.update({ resolutionScale: 2, bilinearFiltering: true });
  const applied = store.markApplied().applied;
  storage.calls.length = 0;
  const reset = store.reset();
  assert.equal(reset.preferences, DEFAULT_GRAPHICS);
  assert.equal(reset.applied, applied, 'reset cannot pretend the running core reverted');
  assert.equal(storage.values.has(KEY), false);
  assert.equal(storage.values.get('digital-station-controls-v1'), '{"version":1,"keys":{}}');
  assert.equal(storage.values.get('unrelated-user-preference'), 'keep');
  assert.deepEqual(storage.calls, [['removeItem', KEY]]);
});

test('markApplied is memory-only and keeps pending preferences independent of the running core', () => {
  const storage = memoryStorage();
  const store = createGraphicsPreferences({ storage: () => storage });
  const initial = store.getSnapshot();
  storage.calls.length = 0;
  const appliedSnapshot = store.markApplied({ ...DEFAULT_GRAPHICS, ignored: 'never store' });
  assert.equal(appliedSnapshot.preferences, initial.preferences);
  assert.deepEqual(appliedSnapshot.applied, { resolutionScale: 1, bilinearFiltering: false });
  assert(Object.isFrozen(appliedSnapshot.applied));
  assert.equal(store.markApplied(DEFAULT_GRAPHICS), appliedSnapshot);
  assert.deepEqual(storage.calls, []);
  const pending = store.update({ resolutionScale: 2, bilinearFiltering: true });
  assert.equal(pending.applied, appliedSnapshot.applied);
  const serialized = storage.values.get(KEY);
  storage.calls.length = 0;
  const confirmed = store.markApplied(pending.preferences);
  assert.deepEqual(confirmed.applied, { resolutionScale: 2, bilinearFiltering: true });
  assert.equal(storage.values.get(KEY), serialized);
  assert.deepEqual(storage.calls, []);
  assert.equal(store.markApplied(null).applied, null);
  assert.throws(() => store.markApplied({ resolutionScale: 2, bilinearFiltering: 'true' }), /inválida/);
});

test('corrupt JSON and unknown versions safely use defaults without overwriting stored data', () => {
  for (const serialized of ['not JSON', '{"version":2,"resolutionScale":2}', 'null', '[]']) {
    const storage = memoryStorage([[KEY, serialized]]);
    const store = createGraphicsPreferences({ storage: () => storage });
    const value = store.getSnapshot();
    assert.equal(value.preferences, DEFAULT_GRAPHICS);
    assert.equal(storage.values.get(KEY), serialized);
    assert.equal(storage.calls.filter(([operation]) => operation !== 'getItem').length, 0);
    if (serialized === 'not JSON') assert.match(value.storageError, /ler as preferências/);
  }
});

test('unavailable storage and throwing storage getters keep changes and reset usable in this session', () => {
  for (const storage of [() => undefined, () => null, () => { throw new DOMException('Denied', 'SecurityError'); }]) {
    const store = createGraphicsPreferences({ storage });
    assert.equal(store.getSnapshot().preferences, DEFAULT_GRAPHICS);
    assert.match(store.getSnapshot().storageError, /nesta sessão/);
    const changed = store.update({ resolutionScale: 2, showFps: false });
    assert.equal(changed.preferences.resolutionScale, 2);
    assert.equal(changed.preferences.showFps, false);
    assert.match(changed.storageError, /não permitiu guardá-las/);
    const reset = store.reset();
    assert.equal(reset.preferences, DEFAULT_GRAPHICS);
    assert.match(reset.storageError, /não permitiu remover/);
  }
});

test('getItem, setItem, and removeItem failures retain session state and recover after storage starts working', () => {
  const working = memoryStorage([[KEY, JSON.stringify({ ...DEFAULT_GRAPHICS, resolutionScale: 2 })]]);
  let blocked = true;
  const storage = {
    getItem(...args) { if (blocked) throw new Error('Read failed'); return working.getItem(...args); },
    setItem(...args) { if (blocked) throw new DOMException('Quota', 'QuotaExceededError'); return working.setItem(...args); },
    removeItem(...args) { if (blocked) throw new Error('Remove failed'); return working.removeItem(...args); },
  };
  const store = createGraphicsPreferences({ storage: () => storage });
  assert(store.getSnapshot().storageError);
  store.update({ resolutionScale: 2 });
  assert.equal(store.getSnapshot().preferences.resolutionScale, 2);
  assert.match(store.getSnapshot().storageError, /guardá-las/);
  blocked = false;
  const recovered = store.update({ resolutionScale: 2 });
  assert.equal(recovered.storageError, null);
  assert.equal(JSON.parse(working.values.get(KEY)).resolutionScale, 2);
  blocked = true;
  const failedReset = store.reset();
  assert.equal(failedReset.preferences, DEFAULT_GRAPHICS);
  assert.match(failedReset.storageError, /remover/);
  assert.equal(JSON.parse(working.values.get(KEY)).resolutionScale, 2, 'failed deletion cannot claim the old stored value disappeared');
  blocked = false;
  assert.equal(store.reset().storageError, null);
  assert.equal(working.values.has(KEY), false);
});
