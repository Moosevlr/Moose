// Pure SAVE v1 codec. This module has no UI, filesystem, or storage dependencies
// so the same integrity checks run in a browser worker and in the Node fallback.
const SAVE_FORMAT = 'digital-station-save';
export const MAX_CARD_BYTES = 32 * 1024 * 1024;
export const MAX_ENTRIES = 4096;
export const validPath = (path) => typeof path === 'string' && path.length <= 512 &&
  /^(mc0|mc1)(\/[^/]+)*$/.test(path) && path.split('/').every(
    (part) => part !== '.' && part !== '..' && !/[\\\x00-\x1f\x7f]/.test(part),
  );

function validateStructure(cards) {
  if (!cards || !Array.isArray(cards.directories) || !Array.isArray(cards.files) ||
      cards.directories.length + cards.files.length > MAX_ENTRIES) {
    throw new Error('A estrutura do SAVE é inválida.');
  }
  const paths = new Set();
  for (const path of [...cards.directories, ...cards.files.map((file) => file?.path)]) {
    if (!validPath(path) || paths.has(path)) throw new Error('O SAVE contém um caminho inválido ou repetido.');
    paths.add(path);
  }
  const directories = new Set(cards.directories);
  if (!directories.has('mc0') || !directories.has('mc1')) throw new Error('Os cartões do SAVE estão incompletos.');
  for (const path of paths) {
    const parent = path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : null;
    if (parent && !directories.has(parent)) throw new Error('O SAVE contém uma pasta incompleta.');
  }
}

export function validateSnapshot(snapshot) {
  validateStructure(snapshot);
  let total = 0;
  for (const file of snapshot.files) {
    if (!(file.bytes instanceof Uint8Array)) throw new Error('O SAVE contém dados inválidos.');
    total += file.bytes.byteLength;
    if (total > MAX_CARD_BYTES) throw new Error('O conteúdo do SAVE excede 32 MB.');
  }
}

function encodeBase64(bytes) {
  if (typeof bytes.toBase64 === 'function') return bytes.toBase64();
  let binary = '';
  for (let index = 0; index < bytes.length; index += 16384) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 16384));
  }
  return btoa(binary);
}

function decodeBase64(data) {
  if (typeof data !== 'string' || data.length > Math.ceil(MAX_CARD_BYTES / 3) * 4 ||
      data.length % 4 || !/^[A-Za-z0-9+/]*={0,2}$/.test(data)) {
    throw new Error('O SAVE contém dados inválidos.');
  }
  if (typeof Uint8Array.fromBase64 === 'function') return Uint8Array.fromBase64(data);
  const binary = atob(data);
  const bytes = new Uint8Array(binary.length);
  // Uint8Array.from(string, callback) builds an intermediate iterable and calls
  // into JS for each byte; a direct copy avoids that cost for multi-MB cards.
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

async function checksum(cards) {
  const bytes = new TextEncoder().encode(JSON.stringify(cards));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function encodeSaveSnapshot(snapshot, game = '') {
  validateSnapshot(snapshot);
  if (typeof game !== 'string') throw new Error('O nome do jogo no SAVE é inválido.');
  const cards = {
    directories: snapshot.directories,
    files: snapshot.files.map((file) => ({ path: file.path, data: encodeBase64(file.bytes) })),
  };
  const save = {
    format: SAVE_FORMAT,
    version: 1,
    createdAt: new Date().toISOString(),
    game: game.slice(0, 200),
    cards,
    checksum: await checksum(cards),
  };
  return { blob: new Blob([JSON.stringify(save)], { type: 'application/json' }), fileCount: snapshot.files.length };
}

export async function decodeSaveBlob(file) {
  if (!file || !Number.isSafeInteger(file.size) || file.size < 0 || file.size > 48 * 1024 * 1024 ||
      typeof file.text !== 'function') {
    throw new Error('Escolha um SAVE do Digital Station com até 48 MB.');
  }
  let save;
  try { save = JSON.parse(await file.text()); } catch {
    throw new Error('Não reconheci este SAVE. Escolha um arquivo .dssave baixado neste ambiente.');
  }
  if (save?.format !== SAVE_FORMAT || save.version !== 1) {
    throw new Error('Formato de SAVE incompatível. Use um arquivo .dssave do Digital Station.');
  }
  validateStructure(save.cards);
  if (await checksum(save.cards) !== save.checksum) {
    throw new Error('O SAVE está corrompido ou foi alterado. O cartão atual foi preservado.');
  }
  let total = 0;
  const files = save.cards.files.map((file) => {
    const bytes = decodeBase64(file.data);
    total += bytes.byteLength;
    if (total > MAX_CARD_BYTES) throw new Error('O conteúdo do SAVE excede 32 MB.');
    return { path: file.path, bytes };
  });
  return { directories: [...save.cards.directories].sort((a, b) => a.length - b.length), files };
}

export async function runSaveCodecOperation(operation, payload) {
  switch (operation) {
    case 'encode': return encodeSaveSnapshot(payload.snapshot, payload.game);
    case 'decode': return decodeSaveBlob(payload.blob);
    case 'validate':
      // Storage only needs a verdict. Do not clone the decoded card bytes back
      // onto the UI thread just to discard them before an IndexedDB write.
      await decodeSaveBlob(payload.blob);
      return true;
    default: throw new Error('Operação de SAVE desconhecida.');
  }
}
