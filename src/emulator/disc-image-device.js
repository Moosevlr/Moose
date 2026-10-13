export const DISC_CACHE_BLOCK_SIZE = 128 * 1024;
const CACHE_LIMIT = 16 * 1024 * 1024;

// Play!'s bridge signals completion without a byte count. A short read must
// therefore fail rather than leave bytes from an earlier request in the heap.
export class DiscImageDevice {
  constructor(module, onError = () => {}) {
    this.module = module;
    this.onError = onError;
    this.file = null;
    this.doneFlag = false;
    this.cache = new Map();
    this.cacheBytes = 0;
    this.generation = 0;
    this.readId = 0;
    this.readCount = 0;
    this.lastRead = null;
  }

  setFile(file) {
    if (file !== this.file) {
      this.cache.clear();
      this.cacheBytes = 0;
    }
    this.file = file;
    this.generation += 1;
    this.readId += 1;
    this.doneFlag = false;
    this.readCount = 0;
    this.lastRead = null;
  }

  getFileSize() {
    if (!this.file) throw new Error('Nenhum disco selecionado.');
    return this.file.size;
  }

  isDone() {
    return this.doneFlag;
  }

  getHeap() {
    const buffer = this.module.wasmMemory?.buffer;
    const heap = this.module.HEAPU8;
    return buffer && heap?.buffer !== buffer ? new Uint8Array(buffer) : heap;
  }

  read(destination, offset, size) {
    this.doneFlag = false;
    this.readCount += 1;
    this.lastRead = { offset, size };
    const file = this.file;
    const generation = this.generation;
    const readId = ++this.readId;
    const current = () => generation === this.generation && readId === this.readId;
    const fail = (error) => {
      if (!current()) return;
      this.doneFlag = true;
      this.onError(error);
    };
    const validateDestination = () => {
      const heap = this.getHeap();
      if (!(heap instanceof Uint8Array) || !Number.isSafeInteger(destination) ||
          destination < 0 || !Number.isSafeInteger(destination + size) ||
          destination + size > heap.byteLength) {
        throw new Error('O núcleo solicitou uma leitura fora da memória disponível.');
      }
      return heap;
    };

    try {
      if (!file) throw new Error('Nenhum disco selecionado.');
      if (!Number.isSafeInteger(offset) || !Number.isSafeInteger(size) ||
          !Number.isSafeInteger(offset + size) || offset < 0 || size < 0) {
        throw new Error('Leitura de disco inválida.');
      }
      if (offset + size > file.size) {
        throw new Error(`A leitura do disco ultrapassou o fim do arquivo (posição ${offset}, ${size} bytes, arquivo ${file.size} bytes). A imagem pode estar incompleta.`);
      }
      validateDestination();
    } catch (error) {
      fail(error);
      return;
    }
    if (size === 0) {
      this.doneFlag = true;
      return;
    }

    const readBytes = async (start, length) => {
      const bytes = new Uint8Array(await file.slice(start, start + length).arrayBuffer());
      if (bytes.byteLength !== length) {
        throw new Error(`A leitura do disco retornou dados incompletos (posição ${start}, esperado ${length}, recebido ${bytes.byteLength} bytes).`);
      }
      return bytes;
    };
    const complete = (bytes) => {
      if (!current()) return;
      validateDestination().set(bytes, destination);
      this.doneFlag = true;
    };
    if (size > DISC_CACHE_BLOCK_SIZE) {
      readBytes(offset, size).then(complete).catch(fail);
      return;
    }

    const first = Math.floor(offset / DISC_CACHE_BLOCK_SIZE);
    const last = Math.floor((offset + size - 1) / DISC_CACHE_BLOCK_SIZE);
    const indices = first === last ? [first] : [first, last];
    const blocks = indices.map((index) => {
      const bytes = this.cache.get(index);
      if (bytes) {
        this.cache.delete(index);
        this.cache.set(index, bytes);
      }
      return bytes;
    });
    const copyBlocks = (bytesByBlock) => {
      if (!current()) return;
      const heap = validateDestination();
      bytesByBlock.forEach((bytes, index) => {
        const blockOffset = indices[index] * DISC_CACHE_BLOCK_SIZE;
        const start = Math.max(offset, blockOffset);
        const end = Math.min(offset + size, blockOffset + bytes.byteLength);
        heap.set(bytes.subarray(start - blockOffset, end - blockOffset), destination + start - offset);
      });
      this.doneFlag = true;
    };
    if (blocks.every(Boolean)) {
      try { copyBlocks(blocks); } catch (error) { fail(error); }
      return;
    }

    Promise.all(indices.map(async (index, position) => {
      if (blocks[position]) return blocks[position];
      const start = index * DISC_CACHE_BLOCK_SIZE;
      const bytes = await readBytes(start, Math.min(DISC_CACHE_BLOCK_SIZE, file.size - start));
      if (generation === this.generation) {
        this.cacheBytes -= this.cache.get(index)?.byteLength || 0;
        this.cache.delete(index);
        this.cache.set(index, bytes);
        this.cacheBytes += bytes.byteLength;
        while (this.cacheBytes > CACHE_LIMIT) {
          const oldest = this.cache.keys().next().value;
          this.cacheBytes -= this.cache.get(oldest).byteLength;
          this.cache.delete(oldest);
        }
      }
      return bytes;
    })).then(copyBlocks).catch(fail);
  }
}
