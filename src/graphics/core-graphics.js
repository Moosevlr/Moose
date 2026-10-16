// AppConfig.cpp and DefaultAppConfig.h in Play! 83700b2c resolve this path.
// Framework CConfig loads it once, when initVm first constructs CAppConfig.
export const CORE_GRAPHICS_CONFIG_PATH = '/home/web_user/.local/share/Play Data Files/config.xml';
const CONFIG_DIRECTORY = CORE_GRAPHICS_CONFIG_PATH.slice(0, CORE_GRAPHICS_CONFIG_PATH.lastIndexOf('/'));

/** Apply only before the first initVm call on a fresh Play! module. */
export function applyCoreGraphics(module, { resolutionScale = 1, bilinearFiltering = false } = {}) {
  const snapshot = {
    resolutionScale: resolutionScale === 2 ? 2 : 1,
    bilinearFiltering: bilinearFiltering === true,
  };
  // A 2x scale increases each framebuffer dimension: approximately 4x pixels.
  // Keep Play!'s native CRT rate limiter enabled regardless of visual choices.
  const xml = '<?xml version="1.0"?>\n<Config>\n' +
    `  <Preference Name="renderer.opengl.resfactor" Type="integer" Value="${snapshot.resolutionScale}"/>\n` +
    `  <Preference Name="renderer.opengl.forcebilineartextures" Type="boolean" Value="${snapshot.bilinearFiltering}"/>\n` +
    '  <Preference Name="ps2.limitframerate" Type="boolean" Value="true"/>\n</Config>\n';
  const filesystem = module?.FS;
  if (!filesystem || ['analyzePath', 'mkdirTree', 'writeFile'].some((name) => typeof filesystem[name] !== 'function')) {
    throw new Error('O núcleo não disponibilizou o sistema de arquivos necessário para configurar os gráficos.');
  }
  if (filesystem.analyzePath(CORE_GRAPHICS_CONFIG_PATH).exists) {
    // A fresh module has no config.xml. Never erase unrelated preferences if
    // another integration has already created one. Identical calls are safe.
    if (typeof filesystem.readFile !== 'function' ||
        filesystem.readFile(CORE_GRAPHICS_CONFIG_PATH, { encoding: 'utf8' }) !== xml) {
      throw new Error('O núcleo já possui uma configuração diferente. Recarregue a página antes de preparar os gráficos.');
    }
    return snapshot;
  }
  filesystem.mkdirTree(CONFIG_DIRECTORY);
  filesystem.writeFile(CORE_GRAPHICS_CONFIG_PATH, xml);
  return snapshot;
}
