// This module reads browser capabilities only when analyzeDevice() is called.
// Values describe what the browser exposes, not an inventory of the machine.
function read(getValue, fallback = null) {
  try { return getValue() ?? fallback; } catch { return fallback; }
}

const positiveNumber = (value) => typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null;
const positiveInteger = (value) => Number.isSafeInteger(value) && value > 0 ? value : null;
const preference = (environment, query) => read(() => environment.matchMedia(query).matches, false) === true;

/**
 * Call from the explicit analysis button, never during module import or mount.
 * Numeric null means unavailable/restricted. Device memory is approximate and
 * logical processors may be reduced for privacy. Neither is an exact CPU/RAM
 * measurement. Boolean false means a capability/preference was not observed.
 */
export function analyzeDevice(environment = globalThis) {
  const navigator = read(() => environment.navigator);
  const document = read(() => environment.document);
  const width = positiveInteger(read(() => environment.innerWidth)) ||
    positiveInteger(read(() => document.documentElement.clientWidth)) || 0;
  const height = positiveInteger(read(() => environment.innerHeight)) ||
    positiveInteger(read(() => document.documentElement.clientHeight)) || 0;
  const report = {
    logicalProcessors: positiveInteger(read(() => navigator.hardwareConcurrency)),
    deviceMemoryGB: positiveNumber(read(() => navigator.deviceMemory)),
    webgl2: false,
    sharedMemory: read(() => environment.crossOriginIsolated, false) === true &&
      read(() => typeof environment.SharedArrayBuffer === 'function', false),
    wasm: read(() => typeof environment.WebAssembly.instantiate === 'function', false),
    workers: read(() => typeof environment.Worker === 'function', false),
    maxTextureSize: null,
    maxRenderbufferSize: null,
    maxViewportDimensions: null,
    devicePixelRatio: positiveNumber(read(() => environment.devicePixelRatio)) || 1,
    viewport: { width, height },
    // Touch/coarse input describes interaction, not a mobile/performance tier.
    touch: preference(environment, '(pointer: coarse)') ||
      (positiveInteger(read(() => navigator.maxTouchPoints)) || 0) > 0,
    reducedMotion: preference(environment, '(prefers-reduced-motion: reduce)'),
    dataSaver: read(() => navigator.connection.saveData, false) === true,
  };
  let context = null;
  try {
    const canvas = document?.createElement('canvas');
    context = canvas?.getContext('webgl2', { antialias: false, preserveDrawingBuffer: false });
    if (context) {
      report.webgl2 = true;
      report.maxTextureSize = positiveInteger(read(() => context.getParameter(context.MAX_TEXTURE_SIZE)));
      report.maxRenderbufferSize = positiveInteger(read(() => context.getParameter(context.MAX_RENDERBUFFER_SIZE)));
      const dimensions = read(() => context.getParameter(context.MAX_VIEWPORT_DIMS));
      const viewportWidth = positiveInteger(read(() => dimensions[0]));
      const viewportHeight = positiveInteger(read(() => dimensions[1]));
      if (viewportWidth && viewportHeight) report.maxViewportDimensions = [viewportWidth, viewportHeight];
    }
  } catch { /* A blocked or failed context is unavailable to this analysis. */ }
  finally {
    // Do not request debug-renderer information, enumerate extensions, or keep
    // an extra graphics context alive beside the actual emulator.
    read(() => context.getExtension('WEBGL_lose_context')?.loseContext());
  }
  return report;
}

/** A conservative starting point, never an automatic 2x or FPS prediction. */
export function recommendGraphics(report = {}) {
  const reasons = [];
  const warnings = [];
  const memory = positiveNumber(read(() => report.deviceMemoryGB));
  const processors = positiveInteger(read(() => report.logicalProcessors));
  if (memory !== null && memory <= 4) reasons.push('A estimativa de memória exposta pelo navegador é de até 4 GB.');
  if (processors !== null && processors <= 4) reasons.push('O navegador disponibilizou até 4 processadores lógicos.');
  if (read(() => report.reducedMotion, false) === true) reasons.push('A preferência por menos movimento está ativada; reduza as animações da interface.');
  if (read(() => report.dataSaver, false) === true) reasons.push('A preferência por economia de dados está ativada.');
  const profile = reasons.length ? 'economy' : 'balanced';
  reasons.push('Comece em 1× e ajuste manualmente após testar o jogo; estes dados não estimam FPS.');
  if (read(() => report.webgl2) === false) warnings.push('WebGL2 não foi disponibilizado nesta análise.');
  if (read(() => report.sharedMemory) === false) warnings.push('Os recursos de memória compartilhada não estão disponíveis nesta aba.');
  if (read(() => report.wasm) === false) warnings.push('WebAssembly não está disponível neste navegador.');
  if (read(() => report.workers) === false) warnings.push('Web Workers não estão disponíveis neste navegador.');
  return { profile, reasons, warnings };
}
