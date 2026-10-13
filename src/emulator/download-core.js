export async function downloadCore(url, { signal, onProgress = () => {}, fetchImpl = fetch } = {}) {
  const response = await fetchImpl(url, { signal, credentials: 'same-origin' });
  if (!response.ok) throw new Error(`Não foi possível baixar o núcleo (HTTP ${response.status}). Confira o acesso ao site e tente novamente.`);
  const mime = response.headers.get('content-type') || '';
  if (!/application\/(wasm|octet-stream)/i.test(mime)) {
    throw new Error('O servidor não retornou o núcleo WebAssembly. O acesso pode ter redirecionado para uma página de login.');
  }
  const total = Number(response.headers.get('content-length')) || 0;
  let bytes;
  if (!response.body?.getReader) {
    bytes = new Uint8Array(await response.arrayBuffer());
    onProgress(bytes.length, total);
  } else {
    const reader = response.body.getReader();
    const chunks = [];
    let loaded = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        loaded += value.length;
        onProgress(loaded, total);
      }
    } finally { reader.releaseLock(); }
    bytes = new Uint8Array(loaded);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  }
  if (!WebAssembly.validate(bytes)) throw new Error('O download do núcleo está incompleto ou não contém WebAssembly válido. Atualize a página e tente novamente.');
  return bytes;
}
