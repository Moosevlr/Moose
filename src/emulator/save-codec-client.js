import { runSaveCodecOperation } from './save-codec.js';

/** One lazily started worker shared by export, import, and backup validation. */
export function createSaveCodecClient({ Worker = globalThis.Worker, timeoutMs = 45_000 } = {}) {
  let worker = null;
  let unavailable = typeof Worker !== 'function';
  let disposed = false;
  let nextId = 0;
  const pending = new Map();

  function disposeError() {
    return new Error('O processamento de SAVE foi encerrado.');
  }

  function runFallback(operation, payload) {
    return Promise.resolve().then(() => {
      if (disposed) throw disposeError();
      return runSaveCodecOperation(operation, payload);
    }).then((result) => {
      if (disposed) throw disposeError();
      return result;
    }, (error) => {
      if (disposed) throw disposeError();
      throw error;
    });
  }

  function fallback(job) {
    clearTimeout(job.timer);
    runFallback(job.operation, job.payload).then(job.resolve, job.reject);
  }

  function failWorker() {
    unavailable = true;
    worker?.terminate();
    worker = null;
    const jobs = [...pending.values()];
    pending.clear();
    // Startup/CSP/transport failures must not lose a SAVE or leave a caller
    // hanging. Retry the identical operation through the same verified codec.
    for (const job of jobs) fallback(job);
  }

  function getWorker() {
    if (unavailable) return null;
    if (worker) return worker;
    try {
      worker = new Worker(new URL('./save-codec-worker.js', import.meta.url), { type: 'module' });
      worker.onmessage = ({ data }) => {
        const job = pending.get(data?.id);
        if (!job) return;
        pending.delete(data.id);
        clearTimeout(job.timer);
        if (data.error) {
          const error = new Error(data.error.message || 'Não foi possível processar o SAVE.');
          error.name = data.error.name || 'Error';
          job.reject(error);
        } else job.resolve(data.result);
      };
      worker.onerror = (event) => { event.preventDefault?.(); failWorker(); };
      worker.onmessageerror = failWorker;
      return worker;
    } catch {
      failWorker();
      return null;
    }
  }

  function run(operation, payload) {
    if (disposed) return Promise.reject(disposeError());
    const current = getWorker();
    if (!current) return runFallback(operation, payload);
    return new Promise((resolve, reject) => {
      const id = ++nextId;
      const job = { operation, payload, resolve, reject, timer: null };
      pending.set(id, job);
      job.timer = setTimeout(failWorker, timeoutMs);
      try {
        // Structured clone deliberately retains ownership of staged/FS buffers
        // on the UI thread; exporting must never detach the live card bytes.
        current.postMessage({ id, operation, payload });
      } catch { failWorker(); }
    });
  }

  return {
    encodeSnapshot(snapshot, game = '') { return run('encode', { snapshot, game }); },
    decodeSave(blob) { return run('decode', { blob }); },
    validateSave(blob) { return run('validate', { blob }); },
    dispose() {
      if (disposed) return;
      disposed = true;
      worker?.terminate();
      worker = null;
      for (const job of pending.values()) {
        clearTimeout(job.timer);
        job.reject(disposeError());
      }
      pending.clear();
    },
  };
}

const sharedClient = createSaveCodecClient();
export const encodeSaveSnapshot = (snapshot, game = '') => sharedClient.encodeSnapshot(snapshot, game);
export const decodeSave = (blob) => sharedClient.decodeSave(blob);
export const validateSave = (blob) => sharedClient.validateSave(blob);
