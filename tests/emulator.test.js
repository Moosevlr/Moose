import test from 'node:test';
import assert from 'node:assert/strict';
import { setImmediate } from 'node:timers/promises';
import { DISC_CACHE_BLOCK_SIZE, DiscImageDevice } from '../src/emulator/disc-image-device.js';
import { MEMORY_CARD_ROOT, MemoryCards, decodeSave } from '../src/emulator/memory-cards.js';

const cardPath = (path) => `${MEMORY_CARD_ROOT}/${path}`;
const blob = (value) => new Blob([JSON.stringify(value)], { type: 'application/json' });
const bytes = (value) => [...value];

// Models the relevant Emscripten FS contract, including stripping O_TRUNC from
// the returned stream and calling mknod for empty newly-created files.
class FakeFS {
  constructor() {
    this.nodes = new Map([['/', { path: '/', mode: 0x4000 }]]);
    this.streams = [];
    this.failWriteOnce = null;
  }
  cwd() { return '/'; }
  getPath(node) { return node.path; }
  isDir(mode) { return (mode & 0xf000) === 0x4000; }
  isFile(mode) { return (mode & 0xf000) === 0x8000; }
  node(path) {
    const value = this.nodes.get(typeof path === 'string' ? path : path.path);
    if (!value) throw new Error(`Missing: ${path}`);
    return value;
  }
  analyzePath(path) { return { exists: this.nodes.has(path) }; }
  lstat(path) {
    const value = this.node(path);
    return { mode: value.mode, size: value.data?.byteLength || 0 };
  }
  mknod(path, mode = 0x8000) {
    if (this.nodes.has(path)) throw new Error('Already exists');
    const parent = path.slice(0, path.lastIndexOf('/')) || '/';
    if (!this.isDir(this.node(parent).mode)) throw new Error('Not a directory');
    const value = { path, mode, ...this.isFile(mode) ? { data: new Uint8Array() } : {} };
    this.nodes.set(path, value);
    return value;
  }
  mkdir(path) { return this.mknod(path, 0x4000); }
  mkdirTree(path) {
    let current = '';
    for (const part of path.split('/').filter(Boolean)) {
      current += `/${part}`;
      if (!this.nodes.has(current)) this.mkdir(current);
    }
  }
  readdir(path) {
    this.node(path);
    const prefix = `${path}/`;
    return ['.', '..', ...[...this.nodes.keys()].filter((name) => name.startsWith(prefix) && !name.slice(prefix.length).includes('/')).map((name) => name.slice(prefix.length))];
  }
  unlink(path) {
    this.node(path);
    this.nodes.delete(path);
  }
  rmdir(path) {
    if (this.readdir(path).length > 2) throw new Error('Directory not empty');
    this.nodes.delete(path);
  }
  truncate(path, size) {
    const node = this.node(path);
    const data = new Uint8Array(size);
    data.set(node.data.subarray(0, size));
    node.data = data;
  }
  open(path, flags) {
    flags = typeof flags === 'string' ? ({ r: 0, 'r+': 2, w: 577, 'w+': 578, a: 1089, 'a+': 1090 }[flags]) : flags;
    const existed = this.nodes.has(path);
    if (!existed && flags & 64) this.mknod(path);
    if (existed && flags & 512) this.truncate(path, 0);
    const stream = { fd: this.streams.length, path, flags: flags & ~(128 | 512 | 131072), node: this.node(path), position: 0 };
    this.streams.push(stream);
    return stream;
  }
  write(stream, input, offset = 0, length = input.length, position = stream.position) {
    if (stream.path === this.failWriteOnce) {
      this.failWriteOnce = null;
      throw new Error('Simulated restore failure');
    }
    const data = new Uint8Array(Math.max(stream.node.data.length, position + length));
    data.set(stream.node.data);
    data.set(input.subarray(offset, offset + length), position);
    stream.node.data = data;
    stream.position = position + length;
    return length;
  }
  close(stream) {
    this.streams[stream.fd] = null;
    stream.fd = null;
  }
  writeFile(path, data) {
    const stream = this.open(path, 'w');
    try { this.write(stream, data); } finally { this.close(stream); }
  }
  readFile(path) { return this.node(path).data.slice(); }
  rename(oldPath, newPath) {
    const node = this.node(oldPath);
    this.nodes.delete(oldPath);
    node.path = newPath;
    this.nodes.set(newPath, node);
  }
}

function makeCards() {
  const fs = new FakeFS();
  const cards = new MemoryCards();
  cards.attach({ FS: fs });
  return { cards, fs };
}

test('disk reads exact bytes across cache boundaries and reuses cached blocks', async () => {
  const data = Uint8Array.from({ length: DISC_CACHE_BLOCK_SIZE + 10 }, (_, index) => index % 251);
  const source = new Blob([data]);
  let slices = 0;
  const file = { size: source.size, slice: (...args) => { slices += 1; return source.slice(...args); } };
  const heap = new Uint8Array(32).fill(170);
  const errors = [];
  const device = new DiscImageDevice({ HEAPU8: heap }, (error) => errors.push(error));
  device.setFile(file);
  device.read(3, DISC_CACHE_BLOCK_SIZE - 2, 6);
  await setImmediate();
  assert.equal(device.isDone(), true);
  assert.deepEqual(bytes(heap.subarray(3, 9)), bytes(data.subarray(DISC_CACHE_BLOCK_SIZE - 2, DISC_CACHE_BLOCK_SIZE + 4)));
  assert.equal(slices, 2);
  device.read(0, DISC_CACHE_BLOCK_SIZE - 1, 3);
  assert.equal(device.isDone(), true);
  assert.equal(slices, 2);
  assert.equal(heap[3], data[DISC_CACHE_BLOCK_SIZE - 2]);
  assert.deepEqual(errors, []);
});

test('disk rejects EOF, invalid ranges and invalid heap destinations without writing stale data', () => {
  const cases = [[0, 6, 5], [0, 20, 5], [-1, 0, 1], [30, 0, 4], [0, -1, 1], [0, 0, -1], [0, Number.MAX_SAFE_INTEGER, 1]];
  for (const [destination, offset, length] of cases) {
    const heap = new Uint8Array(32).fill(170);
    const errors = [];
    const device = new DiscImageDevice({ HEAPU8: heap }, (error) => errors.push(error));
    device.setFile(new Blob([new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8])]));
    device.read(destination, offset, length);
    assert.equal(device.isDone(), true);
    assert.equal(errors.length, 1);
    assert.ok(heap.every((byte) => byte === 170));
  }
});

test('disk permits exact EOF and zero-byte EOF requests', async () => {
  const heap = new Uint8Array(8).fill(170);
  const errors = [];
  const device = new DiscImageDevice({ HEAPU8: heap }, (error) => errors.push(error));
  device.setFile(new Blob([new Uint8Array([1, 2, 3, 4])]));
  device.read(4, 2, 2);
  await setImmediate();
  assert.deepEqual(bytes(heap.subarray(4, 6)), [3, 4]);
  device.read(heap.length, 4, 0);
  assert.equal(device.isDone(), true);
  assert.deepEqual(errors, []);
});

test('disk rejects truncated and rejected reads in both cached and large-read paths', async () => {
  for (const length of [8, DISC_CACHE_BLOCK_SIZE + 1]) {
    for (const reject of [false, true]) {
      const heap = new Uint8Array(length).fill(170);
      const errors = [];
      const file = {
        size: length,
        slice: (start, end) => ({ arrayBuffer: async () => {
          if (reject) throw new Error('Disk unavailable');
          return new Uint8Array(end - start - 1).buffer;
        } }),
      };
      const device = new DiscImageDevice({ HEAPU8: heap }, (error) => errors.push(error));
      device.setFile(file);
      device.read(0, 0, length);
      await setImmediate();
      assert.equal(device.isDone(), true);
      assert.equal(errors.length, 1);
      assert.ok(heap.every((byte) => byte === 170));
      assert.equal(device.cache.size, 0);
    }
  }
});

test('large reads copy every byte without populating the small-block cache', async () => {
  const data = Uint8Array.from({ length: DISC_CACHE_BLOCK_SIZE + 7 }, (_, index) => index % 251);
  const heap = new Uint8Array(data.length);
  const device = new DiscImageDevice({ HEAPU8: heap }, (error) => assert.fail(error));
  device.setFile(new Blob([data]));
  device.read(0, 0, data.length);
  await setImmediate();
  assert.deepEqual(heap, data);
  assert.equal(device.cache.size, 0);
});

test('disk ignores an old file completion and refreshes the heap after WebAssembly memory growth', async () => {
  let finishOld;
  const memory = new WebAssembly.Memory({ initial: 1, maximum: 2 });
  const module = { wasmMemory: memory, HEAPU8: new Uint8Array(memory.buffer) };
  const errors = [];
  const device = new DiscImageDevice(module, (error) => errors.push(error));
  device.setFile({ size: 2, slice: () => ({ arrayBuffer: () => new Promise((resolve) => { finishOld = resolve; }) }) });
  device.read(0, 0, 2);
  device.setFile(new Blob([new Uint8Array([9, 8])]));
  memory.grow(1);
  device.read(70000, 0, 2);
  await setImmediate();
  finishOld(new Uint8Array([1, 2]).buffer);
  await setImmediate();
  assert.deepEqual(bytes(new Uint8Array(memory.buffer, 70000, 2)), [9, 8]);
  assert.deepEqual(bytes(new Uint8Array(memory.buffer, 0, 2)), [0, 0]);
  assert.equal(device.isDone(), true);
  assert.deepEqual(errors, []);
});

test('dssave v1 roundtrip preserves both cards and can be staged before attaching the core', async () => {
  const { cards, fs } = makeCards();
  fs.mkdir(cardPath('mc0/GAME'));
  fs.writeFile(cardPath('mc0/GAME/data'), new Uint8Array([0, 1, 255, 32]));
  fs.writeFile(cardPath('mc1/empty'), new Uint8Array());
  const exported = await cards.export('test.iso');
  const json = JSON.parse(await exported.blob.text());
  assert.equal(json.format, 'digital-station-save');
  assert.equal(json.version, 1);
  assert.match(json.checksum, /^[a-f0-9]{64}$/);
  assert.equal(json.game, 'test.iso');
  assert.equal(exported.fileCount, 2);
  const staged = new MemoryCards();
  await staged.load(exported.blob);
  const restoredFS = new FakeFS();
  staged.attach({ FS: restoredFS });
  assert.deepEqual(staged.capture(), cards.capture());
  assert.equal(staged.hasChanges, false);
  assert.deepEqual(bytes(restoredFS.readFile(cardPath('mc0/GAME/data'))), [0, 1, 255, 32]);
});

test('corrupt saves and unsafe paths never replace the current card', async () => {
  const { cards, fs } = makeCards();
  fs.writeFile(cardPath('mc0/current'), new Uint8Array([9]));
  const exported = await cards.export();
  const save = JSON.parse(await exported.blob.text());
  const previous = cards.capture();
  const version = cards.version;
  save.cards.files[0].data = 'AQ==';
  await assert.rejects(cards.load(blob(save)), /corrompido/);
  assert.deepEqual(cards.capture(), previous);
  assert.equal(cards.version, version);
  save.cards.files[0].path = 'mc0/../outside';
  await assert.rejects(cards.load(blob(save)), /caminho inválido/);
  assert.deepEqual(cards.capture(), previous);
});

test('large valid v1 saves decode without the old grouped-base64 regex stack overflow', async () => {
  const { cards, fs } = makeCards();
  const data = new Uint8Array(12 * 1024 * 1024).fill(37);
  fs.writeFile(cardPath('mc0/large'), data);
  const exported = await cards.export();
  const restored = await decodeSave(exported.blob);
  assert.deepEqual(restored.files[0].bytes, data);
});

test('save decoding rejects duplicate paths, missing parents, invalid base64 and size/entry limits', async () => {
  const { cards, fs } = makeCards();
  fs.writeFile(cardPath('mc0/current'), new Uint8Array([9]));
  const original = JSON.parse(await (await cards.export()).blob.text());
  const sign = async (save) => {
    save.checksum = bytes(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(save.cards))))).map((byte) => byte.toString(16).padStart(2, '0')).join('');
    return blob(save);
  };
  let save = structuredClone(original);
  save.cards.directories.push('mc0');
  await assert.rejects(decodeSave(blob(save)), /repetido/);
  save = structuredClone(original);
  save.cards.files[0].path = 'mc0/missing/data';
  await assert.rejects(decodeSave(blob(save)), /pasta incompleta/);
  save = structuredClone(original);
  save.cards.files[0].data = '!!!!';
  await assert.rejects(decodeSave(await sign(save)), /dados inválidos/);
  save = structuredClone(original);
  save.cards.directories = ['mc0', 'mc1', ...Array.from({ length: 4095 }, (_, index) => `mc0/d${index}`)];
  await assert.rejects(decodeSave(blob(save)), /estrutura/);
  await assert.rejects(decodeSave({ size: 48 * 1024 * 1024 + 1, text: () => assert.fail('Must reject before reading') }), /48 MB/);
});

test('empty creation marks a card dirty once despite nested open/mknod; read-only open does not', () => {
  const { cards, fs } = makeCards();
  const empty = fs.open(cardPath('mc0/empty'), 'w');
  assert.equal(empty.flags & 512, 0);
  assert.equal(cards.version, 1);
  assert.equal(cards.hasChanges, true);
  fs.close(empty);
  assert.equal(cards.version, 1);
  cards.markDownloaded(1);
  const read = fs.open(cardPath('mc0/empty'), 'r');
  fs.close(read);
  assert.equal(cards.hasChanges, false);
  const truncated = fs.open(cardPath('mc0/empty'), 'w');
  assert.equal(cards.version, 2);
  fs.close(truncated);
  const append = fs.open(cardPath('mc1/append'), 'a');
  assert.equal(cards.version, 3);
  fs.close(append);
});

test('card tracking observes mutations, ignores other files, and detaches cleanly', () => {
  const { cards, fs } = makeCards();
  fs.writeFile('/tmp-file', new Uint8Array([1]));
  assert.equal(cards.version, 0);
  fs.mkdir(cardPath('mc0/folder'));
  assert.equal(cards.version, 1);
  fs.writeFile(cardPath('mc0/folder/data'), new Uint8Array([1, 2]));
  const exportedVersion = cards.version;
  cards.markDownloaded(exportedVersion);
  fs.rename(cardPath('mc0/folder/data'), cardPath('mc1/moved'));
  assert.equal(cards.version, exportedVersion + 1);
  fs.truncate(cardPath('mc1/moved'), 1);
  fs.unlink(cardPath('mc1/moved'));
  fs.rmdir(cardPath('mc0/folder'));
  assert.equal(cards.version, exportedVersion + 4);
  cards.markDownloaded(exportedVersion);
  assert.equal(cards.hasChanges, true);
  cards.dispose();
  const version = cards.version;
  fs.writeFile(cardPath('mc0/no-hook'), new Uint8Array([3]));
  assert.equal(cards.version, version);
});

test('save export/import is refused while a writable card stream remains open', async () => {
  const { cards, fs } = makeCards();
  fs.writeFile(cardPath('mc0/current'), new Uint8Array([9]));
  const exported = await cards.export();
  const stream = fs.open(cardPath('mc0/current'), 'r+');
  assert.equal(cards.writing, true);
  await assert.rejects(cards.export(), /ainda está usando/);
  await assert.rejects(cards.load(exported.blob), /ainda está usando/);
  fs.close(stream);
  assert.equal(cards.writing, false);
  assert.equal((await cards.export()).fileCount, 1);
});

test('failed restore rolls back previous cards and restores dirty tracking', async () => {
  const incoming = makeCards();
  incoming.fs.writeFile(cardPath('mc0/new'), new Uint8Array([1, 2]));
  const exported = await incoming.cards.export();
  const current = makeCards();
  current.fs.writeFile(cardPath('mc1/previous'), new Uint8Array([7]));
  const previous = current.cards.capture();
  const version = current.cards.version;
  current.fs.failWriteOnce = cardPath('mc0/new');
  await assert.rejects(current.cards.load(exported.blob), /Simulated restore failure/);
  assert.deepEqual(current.cards.capture(), previous);
  assert.equal(current.cards.version, version);
  current.fs.writeFile(cardPath('mc1/previous'), new Uint8Array([8]));
  assert.ok(current.cards.version > version);
});

test('stale import is ignored and clear removes cards while retaining working hooks', async () => {
  const { cards, fs } = makeCards();
  fs.writeFile(cardPath('mc0/current'), new Uint8Array([9]));
  const exported = await cards.export();
  const previous = cards.capture();
  assert.equal(await cards.load(exported.blob, () => false), null);
  assert.deepEqual(cards.capture(), previous);
  cards.clear();
  assert.deepEqual(cards.capture(), { directories: ['mc0', 'mc1'], files: [] });
  assert.equal(cards.hasChanges, false);
  await assert.rejects(cards.export(), /ainda está vazio/);
  fs.writeFile(cardPath('mc1/after-clear'), new Uint8Array([1]));
  assert.equal(cards.hasChanges, true);
});
