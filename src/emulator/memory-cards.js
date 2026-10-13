export const MEMORY_CARD_ROOT = '/home/web_user/.local/share/Play Data Files/vfs';
const SAVE_FORMAT = 'digital-station-save';
const MAX_CARD_BYTES = 32 * 1024 * 1024;
const MAX_ENTRIES = 4096;
const cardPath = (path) => `${MEMORY_CARD_ROOT}/${path}`;
const isCardPath = (path) => typeof path === 'string' && ['mc0', 'mc1'].some(
  (card) => path === cardPath(card) || path.startsWith(`${cardPath(card)}/`),
);
const validPath = (path) => typeof path === 'string' && path.length <= 512 &&
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

function encodeBase64(bytes) {
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
  return Uint8Array.from(atob(data), (character) => character.charCodeAt(0));
}

async function checksum(cards) {
  const bytes = new TextEncoder().encode(JSON.stringify(cards));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function decodeSave(file) {
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

function validateSnapshot(snapshot) {
  validateStructure(snapshot);
  let total = 0;
  for (const file of snapshot.files) {
    if (!(file.bytes instanceof Uint8Array)) throw new Error('O SAVE contém dados inválidos.');
    total += file.bytes.byteLength;
    if (total > MAX_CARD_BYTES) throw new Error('O conteúdo do SAVE excede 32 MB.');
  }
}

export class MemoryCards {
  constructor(onChange = () => {}) {
    this.onChange = onChange;
    this.FS = null;
    this.staged = null;
    this.version = 0;
    this.exportedVersion = 0;
    this.restoreHooks = [];
    this.mutationDepth = 0;
    this.mutationPending = false;
  }

  get hasChanges() { return this.version !== this.exportedVersion; }

  get writing() {
    return !!this.FS?.streams?.some((stream) => stream && stream.fd !== null &&
      (stream.flags & 3) !== 0 && isCardPath(stream.path));
  }

  attach(module) {
    this.dispose();
    this.FS = module.FS;
    for (const card of ['mc0', 'mc1']) this.FS.mkdirTree(cardPath(card));
    if (this.staged) this.restore(this.staged);
    this.watch();
  }

  restore(snapshot) {
    validateSnapshot(snapshot);
    const removeChildren = (path) => {
      for (const child of this.FS.readdir(path).filter((name) => name !== '.' && name !== '..')) {
        const childPath = `${path}/${child}`;
        if (this.FS.isDir(this.FS.lstat(childPath).mode)) {
          removeChildren(childPath);
          this.FS.rmdir(childPath);
        } else this.FS.unlink(childPath);
      }
    };
    for (const card of ['mc0', 'mc1']) removeChildren(cardPath(card));
    [...snapshot.directories].sort((a, b) => a.length - b.length).forEach((path) => this.FS.mkdirTree(cardPath(path)));
    snapshot.files.forEach((file) => this.FS.writeFile(cardPath(file.path), file.bytes));
  }

  watch() {
    if (this.restoreHooks.length) return;
    const normalize = (value) => {
      if (value && typeof value === 'object') return this.FS.getPath(value);
      if (typeof value !== 'string') return '';
      const parts = [];
      for (const part of (value.startsWith('/') ? value : `${this.FS.cwd()}/${value}`).split('/')) {
        if (part === '..') parts.pop();
        else if (part && part !== '.') parts.push(part);
      }
      return `/${parts.join('/')}`;
    };
    // mknod covers empty files. FS.open removes O_TRUNC before returning its
    // stream; observe the original flags and coalesce its nested truncate/mknod.
    const changes = {
      write: (args) => [args[0]?.path],
      mknod: (args) => [args[0]],
      open: (args, stream) => {
        const flags = typeof args[1] === 'string' ? ({ w: 512, 'w+': 512 }[args[1]] || 0) : args[1];
        return flags & 512 ? [stream.path] : [];
      },
      mkdir: (args) => [args[0]],
      rmdir: (args) => [args[0]],
      unlink: (args) => [args[0]],
      rename: (args) => [args[0], args[1]],
      truncate: (args) => [args[0]],
    };
    for (const [name, changedPaths] of Object.entries(changes)) {
      const original = this.FS[name];
      if (typeof original !== 'function') continue;
      const wrapped = (...args) => {
        this.mutationDepth += 1;
        try {
          const result = original.apply(this.FS, args);
          if (changedPaths(args, result).some((path) => isCardPath(normalize(path)))) this.mutationPending = true;
          return result;
        } finally {
          this.mutationDepth -= 1;
          if (this.mutationDepth === 0 && this.mutationPending) {
            this.mutationPending = false;
            this.version += 1;
            this.onChange(this);
          }
        }
      };
      this.FS[name] = wrapped;
      this.restoreHooks.push(() => { if (this.FS[name] === wrapped) this.FS[name] = original; });
    }
    const originalClose = this.FS.close;
    if (typeof originalClose === 'function') {
      const wrappedClose = (stream) => {
        const card = isCardPath(stream?.path);
        const result = originalClose.call(this.FS, stream);
        if (card) this.onChange(this);
        return result;
      };
      this.FS.close = wrappedClose;
      this.restoreHooks.push(() => { if (this.FS.close === wrappedClose) this.FS.close = originalClose; });
    }
  }

  capture() {
    if (!this.FS) return this.staged || { directories: ['mc0', 'mc1'], files: [] };
    if (this.writing) throw new Error('O jogo ainda está usando o cartão para gravação. Aguarde a confirmação de que ele salvou e tente novamente.');
    const snapshot = { directories: [], files: [] };
    let total = 0;
    const visit = (path) => {
      if (!validPath(path)) throw new Error('O cartão contém um caminho não suportado.');
      const absolute = cardPath(path);
      const stat = this.FS.lstat(absolute);
      if (this.FS.isDir(stat.mode)) {
        snapshot.directories.push(path);
        if (snapshot.directories.length + snapshot.files.length > MAX_ENTRIES) throw new Error('O cartão contém arquivos demais.');
        this.FS.readdir(absolute).filter((name) => name !== '.' && name !== '..').sort().forEach((name) => visit(`${path}/${name}`));
      } else if (this.FS.isFile(stat.mode)) {
        total += stat.size;
        if (total > MAX_CARD_BYTES) throw new Error('O cartão excedeu o tamanho permitido para exportação.');
        snapshot.files.push({ path, bytes: this.FS.readFile(absolute).slice() });
      } else throw new Error('O cartão contém um tipo de arquivo não suportado.');
      if (snapshot.directories.length + snapshot.files.length > MAX_ENTRIES) throw new Error('O cartão contém arquivos demais.');
    };
    visit('mc0');
    visit('mc1');
    return snapshot;
  }

  replaceSafely(snapshot) {
    const previous = this.capture();
    this.dispose();
    try { this.restore(snapshot); } catch (error) {
      try { this.restore(previous); } catch (rollbackError) {
        throw new AggregateError([error, rollbackError], 'Não foi possível restaurar o cartão anterior. Guarde seu SAVE e encerre a sessão.');
      }
      throw error;
    } finally { this.watch(); }
  }

  async load(file, stillCurrent = () => true) {
    const snapshot = await decodeSave(file);
    if (!stillCurrent()) return null;
    if (this.FS) this.replaceSafely(snapshot);
    this.staged = snapshot;
    this.version = 0;
    this.exportedVersion = 0;
    this.onChange(this);
    return snapshot;
  }

  clear() {
    if (this.FS) this.replaceSafely({ directories: ['mc0', 'mc1'], files: [] });
    this.staged = null;
    this.version = 0;
    this.exportedVersion = 0;
    this.onChange(this);
  }

  async export(game = '') {
    const version = this.version;
    const snapshot = this.capture();
    if (!snapshot.files.length) throw new Error('O cartão ainda está vazio. Salve o progresso dentro do jogo antes de baixar o SAVE.');
    const cards = {
      directories: snapshot.directories,
      files: snapshot.files.map((file) => ({ path: file.path, data: encodeBase64(file.bytes) })),
    };
    const save = { format: SAVE_FORMAT, version: 1, createdAt: new Date().toISOString(), game: game.slice(0, 200), cards, checksum: await checksum(cards) };
    return { blob: new Blob([JSON.stringify(save)], { type: 'application/json' }), version, fileCount: snapshot.files.length };
  }

  markDownloaded(version) {
    this.exportedVersion = version;
    this.onChange(this);
  }

  dispose() {
    this.restoreHooks.splice(0).forEach((restore) => restore());
  }
}
