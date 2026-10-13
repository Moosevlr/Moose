import assert from 'node:assert/strict';
import { test } from 'node:test';
import { IDBFactory } from 'fake-indexeddb';
import { createBackupStore } from '../src/storage/save-backup.js';

const DB_NAME = 'digital-station-local-v1';

async function saveBlob(value = 'cHJvZ3Jlc3Nv') {
  const cards = { directories: ['mc0', 'mc1'], files: [{ path: 'mc0/progress', data: value }] };
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(cards)));
  const checksum = Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, '0')).join('');
  return new Blob([JSON.stringify({ format: 'digital-station-save', version: 1, cards, checksum })], {
    type: 'application/json',
  });
}

async function snapshot(game = 'Jogo de teste') {
  return { blob: await saveBlob(), game, updatedAt: 1_792_000_000_000 };
}

async function openRaw(indexedDB) {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function rawLatest(indexedDB, change) {
  const connection = await openRaw(indexedDB);
  try {
    return await new Promise((resolve, reject) => {
      const transaction = connection.transaction('backups', change ? 'readwrite' : 'readonly');
      const store = transaction.objectStore('backups');
      const request = change ? store.put(change, 'latest') : store.get('latest');
      let value;
      request.onsuccess = () => { value = request.result; };
      transaction.oncomplete = () => resolve(value);
      transaction.onabort = () => reject(transaction.error);
    });
  } finally { connection.close(); }
}

test('roundtrip confirms a valid local SAVE and preserves its metadata', async (t) => {
  const indexedDB = new IDBFactory();
  const store = createBackupStore({ indexedDB });
  t.after(() => store.dispose());
  assert.equal(await store.readLatest(), null);
  const original = await snapshot();
  const confirmed = await store.writeSnapshot(original);
  assert.equal(confirmed.game, original.game);
  const stored = await store.readLatest();
  assert.equal(stored.game, original.game);
  assert.equal(stored.updatedAt, original.updatedAt);
  assert.equal(await stored.blob.text(), await original.blob.text());
});

test('a new instance restores the committed backup after the previous instance closes', async (t) => {
  const indexedDB = new IDBFactory();
  const first = createBackupStore({ indexedDB });
  const original = await snapshot();
  await first.writeSnapshot(original);
  first.dispose();
  const second = createBackupStore({ indexedDB });
  t.after(() => second.dispose());
  assert.equal(await (await second.readLatest()).blob.text(), await original.blob.text());
});

test('malformed, tampered, oversized, and invalid-metadata writes preserve the latest valid backup', async (t) => {
  const indexedDB = new IDBFactory();
  const store = createBackupStore({ indexedDB });
  t.after(() => store.dispose());
  const original = await snapshot();
  await store.writeSnapshot(original);
  const tampered = JSON.parse(await original.blob.text());
  tampered.cards.files[0].data = 'bXV0YXRlZA==';
  const invalid = [
    { ...original, blob: new Blob(['bad save']) },
    { ...original, blob: new Blob([JSON.stringify(tampered)]) },
    { ...original, blob: new Blob([new Uint8Array(48 * 1024 * 1024 + 1)]) },
    { ...original, game: 'x'.repeat(201) },
    { ...original, updatedAt: NaN },
    { ...original, updatedAt: 9e15 },
  ];
  for (const attempted of invalid) await assert.rejects(store.writeSnapshot(attempted));
  assert.equal(await (await store.readLatest()).blob.text(), await original.blob.text());
});

test('corrupt persisted records are reported and kept until explicit deletion', async (t) => {
  const indexedDB = new IDBFactory();
  const store = createBackupStore({ indexedDB });
  t.after(() => store.dispose());
  await store.writeSnapshot(await snapshot());
  const corrupted = { blob: new Blob(['broken']), game: 'Jogo', updatedAt: Date.now() };
  await rawLatest(indexedDB, corrupted);
  await assert.rejects(store.readLatest(), /Não reconheci este SAVE/);
  assert.equal(await (await rawLatest(indexedDB)).blob.text(), 'broken');
  await store.deleteLatest();
  assert.equal(await store.readLatest(), null);
});

test('writes, deletes, and reads retain invocation order while validation is asynchronous', async (t) => {
  const indexedDB = new IDBFactory();
  const store = createBackupStore({ indexedDB });
  t.after(() => store.dispose());
  const first = await snapshot('Primeiro');
  const last = await snapshot('Último');
  await Promise.all([store.writeSnapshot(first), store.deleteLatest(), store.writeSnapshot(last)]);
  assert.equal((await store.readLatest()).game, 'Último');
  const pendingWrite = store.writeSnapshot(first);
  const pendingDelete = store.deleteLatest();
  const pendingRead = store.readLatest();
  await Promise.all([pendingWrite, pendingDelete]);
  assert.equal(await pendingRead, null);
});

test('missing IndexedDB reports an error instead of pretending persistence worked', async () => {
  const store = createBackupStore({ indexedDB: null });
  await assert.rejects(store.readLatest(), /não oferece IndexedDB/);
  await assert.rejects(store.writeSnapshot(await snapshot()), /não oferece IndexedDB/);
  await assert.rejects(store.deleteLatest(), /não oferece IndexedDB/);
  store.dispose();
});

function interceptWrites(indexedDB, intercept) {
  return {
    open(...args) {
      const request = indexedDB.open(...args);
      request.addEventListener('success', () => {
        const connection = request.result;
        const originalTransaction = connection.transaction.bind(connection);
        connection.transaction = (...transactionArgs) => {
          const transaction = originalTransaction(...transactionArgs);
          if (transactionArgs[1] === 'readwrite') intercept(transaction);
          return transaction;
        };
      });
      return request;
    },
  };
}

test('an aborted write after put success rejects and retains the previously committed snapshot', async (t) => {
  const indexedDB = new IDBFactory();
  const first = createBackupStore({ indexedDB });
  const original = await snapshot('Confirmado');
  await first.writeSnapshot(original);
  first.dispose();
  const aborting = interceptWrites(indexedDB, (transaction) => {
    const originalStore = transaction.objectStore.bind(transaction);
    transaction.objectStore = (...args) => {
      const store = originalStore(...args);
      const originalPut = store.put.bind(store);
      store.put = (...putArgs) => {
        const request = originalPut(...putArgs);
        request.addEventListener('success', () => transaction.abort());
        return request;
      };
      return store;
    };
  });
  const store = createBackupStore({ indexedDB: aborting });
  t.after(() => store.dispose());
  await assert.rejects(store.writeSnapshot(await snapshot('Não confirmado')), /cancelada|abort/i);
  assert.equal((await store.readLatest()).game, original.game);
});

test('a quota failure is surfaced and cannot replace the valid backup', async (t) => {
  const indexedDB = new IDBFactory();
  const first = createBackupStore({ indexedDB });
  const original = await snapshot('Último válido');
  await first.writeSnapshot(original);
  first.dispose();
  const full = interceptWrites(indexedDB, (transaction) => {
    const originalStore = transaction.objectStore.bind(transaction);
    transaction.objectStore = (...args) => {
      const store = originalStore(...args);
      store.put = () => { throw new DOMException('Quota exceeded', 'QuotaExceededError'); };
      return store;
    };
  });
  const store = createBackupStore({ indexedDB: full });
  t.after(() => store.dispose());
  await assert.rejects(store.writeSnapshot(await snapshot('Novo')), { name: 'QuotaExceededError' });
  assert.equal((await store.readLatest()).game, original.game);
});

test('blocked database access and operations after disposal reject clearly', async () => {
  const blocked = createBackupStore({ indexedDB: {
    open() {
      const request = {};
      queueMicrotask(() => request.onblocked());
      return request;
    },
  } });
  await assert.rejects(blocked.readLatest(), /bloqueado por outra aba/);
  blocked.dispose();
  await assert.rejects(blocked.readLatest(), /encerrado/);
  await assert.rejects(blocked.deleteLatest(), /encerrado/);
});
