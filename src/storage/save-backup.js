import { decodeSave } from '../emulator/memory-cards.js';

const DATABASE_NAME = 'digital-station-local-v1';
const STORE_NAME = 'backups';
const LATEST_KEY = 'latest';

function disposedError() {
  return new Error('O armazenamento de backup local foi encerrado.');
}

function validateMetadata(snapshot) {
  if (!snapshot || !(snapshot.blob instanceof Blob)) {
    throw new Error('O backup local precisa conter um arquivo SAVE válido.');
  }
  if (typeof snapshot.game !== 'string' || snapshot.game.length > 200) {
    throw new Error('O nome do jogo no backup local é inválido (máximo de 200 caracteres).');
  }
  if (!Number.isSafeInteger(snapshot.updatedAt) || snapshot.updatedAt < 0 ||
      !Number.isFinite(new Date(snapshot.updatedAt).getTime())) {
    throw new Error('A data do backup local é inválida.');
  }
  return { blob: snapshot.blob, game: snapshot.game, updatedAt: snapshot.updatedAt };
}

/**
 * Stores only the validated memory-card SAVE on this browser's IndexedDB.
 * Every operation is ordered; a write is confirmed only after its transaction
 * commits, so aborted writes cannot replace the previous backup.
 */
export function createBackupStore({ indexedDB = globalThis.indexedDB } = {}) {
  let database = null;
  let opening = null;
  let cancelOpening = null;
  let disposed = false;
  let queue = Promise.resolve();
  const transactions = new Set();

  function assertActive() {
    if (disposed) throw disposedError();
  }

  function enqueue(operation) {
    const result = queue.then(() => {
      assertActive();
      return operation();
    });
    // A failed operation remains visible to its caller without preventing a
    // later retry, read, or explicit deletion.
    queue = result.catch(() => {});
    return result;
  }

  async function openDatabase() {
    assertActive();
    if (database) return database;
    if (!indexedDB || typeof indexedDB.open !== 'function') {
      throw new Error('O backup local não está disponível: este navegador não oferece IndexedDB.');
    }
    if (!opening) {
      opening = new Promise((resolve, reject) => {
        let request;
        let settled = false;
        const fail = (error) => {
          if (settled) return;
          settled = true;
          cancelOpening = null;
          reject(error);
        };
        cancelOpening = fail;
        try { request = indexedDB.open(DATABASE_NAME, 1); } catch (error) {
          fail(error);
          return;
        }
        request.onupgradeneeded = () => {
          if (!request.result.objectStoreNames.contains(STORE_NAME)) {
            request.result.createObjectStore(STORE_NAME);
          }
        };
        request.onerror = () => fail(request.error || new Error('Não foi possível abrir o backup local.'));
        request.onblocked = () => fail(new Error(
          'O backup local está bloqueado por outra aba. Feche as outras abas do Digital Station e tente novamente.',
        ));
        request.onsuccess = () => {
          const connection = request.result;
          if (settled || disposed) {
            connection.close();
            fail(disposedError());
            return;
          }
          if (!connection.objectStoreNames.contains(STORE_NAME)) {
            connection.close();
            fail(new Error('A estrutura do armazenamento de backup local é inválida.'));
            return;
          }
          settled = true;
          cancelOpening = null;
          database = connection;
          connection.onversionchange = () => {
            connection.close();
            if (database === connection) database = null;
          };
          resolve(connection);
        };
      });
    }
    try { return await opening; } finally { opening = null; }
  }

  function transaction(connection, mode, action) {
    assertActive();
    return new Promise((resolve, reject) => {
      let active;
      let request;
      let result;
      try {
        active = connection.transaction(STORE_NAME, mode);
        transactions.add(active);
        active.oncomplete = () => {
          transactions.delete(active);
          resolve(result);
        };
        active.onabort = () => {
          transactions.delete(active);
          reject(active.error || request?.error || new Error('A transação do backup local foi cancelada.'));
        };
        request = action(active.objectStore(STORE_NAME));
        request.onsuccess = () => { result = request.result; };
        // Leave error events unhandled so IndexedDB aborts the whole write.
      } catch (error) {
        if (active) {
          transactions.delete(active);
          try { active.abort(); } catch { /* The transaction may already have finished. */ }
        }
        reject(error);
      }
    });
  }

  return {
    readLatest() {
      return enqueue(async () => {
        const connection = await openDatabase();
        const stored = await transaction(connection, 'readonly', (store) => store.get(LATEST_KEY));
        if (stored === undefined) return null;
        const snapshot = validateMetadata(stored);
        await decodeSave(snapshot.blob);
        assertActive();
        return snapshot;
      });
    },

    writeSnapshot(snapshot) {
      return enqueue(async () => {
        const validated = validateMetadata(snapshot);
        await decodeSave(validated.blob);
        assertActive();
        const connection = await openDatabase();
        await transaction(connection, 'readwrite', (store) => store.put(validated, LATEST_KEY));
        return validated;
      });
    },

    deleteLatest() {
      return enqueue(async () => {
        const connection = await openDatabase();
        await transaction(connection, 'readwrite', (store) => store.delete(LATEST_KEY));
      });
    },

    dispose() {
      if (disposed) return;
      disposed = true;
      cancelOpening?.(disposedError());
      for (const active of transactions) {
        try { active.abort(); } catch { /* A completed transaction needs no cancellation. */ }
      }
      database?.close();
      database = null;
    },
  };
}
