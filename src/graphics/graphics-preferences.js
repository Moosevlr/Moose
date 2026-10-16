const STORAGE_KEY = 'digital-station-graphics-v1';
const FIELDS = ['version', 'resolutionScale', 'bilinearFiltering', 'displaySize', 'scaling', 'showFps'];

export const DEFAULT_GRAPHICS = Object.freeze({
  version: 1,
  resolutionScale: 1,
  bilinearFiltering: false,
  displaySize: 'fit',
  scaling: 'smooth',
  showFps: true,
});

function samePreferences(left, right) {
  return FIELDS.every((field) => left[field] === right[field]);
}

/** Discard unknown fields and unsupported schema versions without coercion. */
export function normalizeGraphics(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || value.version !== 1) {
    return DEFAULT_GRAPHICS;
  }
  const normalized = {
    version: 1,
    resolutionScale: value.resolutionScale === 2 ? 2 : 1,
    bilinearFiltering: typeof value.bilinearFiltering === 'boolean' ? value.bilinearFiltering : false,
    displaySize: value.displaySize === 'compact' ? 'compact' : 'fit',
    scaling: value.scaling === 'pixelated' ? 'pixelated' : 'smooth',
    showFps: typeof value.showFps === 'boolean' ? value.showFps : true,
  };
  return samePreferences(normalized, DEFAULT_GRAPHICS) ? DEFAULT_GRAPHICS : Object.freeze(normalized);
}

/**
 * Preferences and applied native settings have separate lifetimes: changing a
 * preference must not claim the running core already accepted that change.
 * Storage is resolved lazily, never during module import or subscription.
 */
export function createGraphicsPreferences({ storage = () => globalThis.localStorage } = {}) {
  let snapshot = null;
  const listeners = new Set();

  function resolveStorage(method) {
    const available = typeof storage === 'function' ? storage() : storage;
    if (!available || typeof available[method] !== 'function') {
      throw new Error('O armazenamento local não está disponível.');
    }
    return available;
  }

  function getSnapshot() {
    if (snapshot) return snapshot;
    let preferences = DEFAULT_GRAPHICS;
    let storageError = null;
    try {
      const serialized = resolveStorage('getItem').getItem(STORAGE_KEY);
      if (serialized !== null && serialized !== undefined) preferences = normalizeGraphics(JSON.parse(serialized));
    } catch {
      storageError = 'Não foi possível ler as preferências gráficas salvas. Os padrões serão usados nesta sessão.';
    }
    snapshot = Object.freeze({ preferences, applied: null, storageError });
    return snapshot;
  }

  function publish(preferences, applied, storageError) {
    const previous = getSnapshot();
    if (samePreferences(preferences, previous.preferences)) preferences = previous.preferences;
    if (applied && previous.applied && applied.resolutionScale === previous.applied.resolutionScale &&
        applied.bilinearFiltering === previous.applied.bilinearFiltering) applied = previous.applied;
    if (preferences === previous.preferences && applied === previous.applied && storageError === previous.storageError) {
      return previous;
    }
    snapshot = Object.freeze({ preferences, applied, storageError });
    for (const listener of [...listeners]) listener();
    return snapshot;
  }

  return {
    getSnapshot,

    subscribe(listener) {
      if (typeof listener !== 'function') throw new TypeError('A assinatura de preferências precisa de uma função.');
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    update(patch) {
      const current = getSnapshot();
      const input = { ...current.preferences };
      if (patch && typeof patch === 'object' && !Array.isArray(patch)) {
        for (const field of FIELDS) {
          if (field !== 'version' && Object.prototype.hasOwnProperty.call(patch, field)) input[field] = patch[field];
        }
      }
      const preferences = normalizeGraphics(input);
      let storageError = null;
      try { resolveStorage('setItem').setItem(STORAGE_KEY, JSON.stringify(preferences)); } catch {
        storageError = 'Preferências mantidas nesta sessão. O navegador não permitiu guardá-las.';
      }
      return publish(preferences, current.applied, storageError);
    },

    reset() {
      const current = getSnapshot();
      let storageError = null;
      try { resolveStorage('removeItem').removeItem(STORAGE_KEY); } catch {
        storageError = 'Padrões restaurados nesta sessão. O navegador não permitiu remover as preferências salvas.';
      }
      return publish(DEFAULT_GRAPHICS, current.applied, storageError);
    },

    markApplied(value) {
      const current = getSnapshot();
      if (value === undefined) value = current.preferences;
      if (value !== null && (!value || ![1, 2].includes(value.resolutionScale) || typeof value.bilinearFiltering !== 'boolean')) {
        throw new TypeError('A configuração gráfica aplicada é inválida.');
      }
      const applied = value === null ? null : Object.freeze({
        resolutionScale: value.resolutionScale,
        bilinearFiltering: value.bilinearFiltering,
      });
      return publish(current.preferences, applied, current.storageError);
    },
  };
}

export const graphicsPreferences = createGraphicsPreferences();
