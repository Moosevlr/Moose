import test from 'node:test';
import assert from 'node:assert/strict';
import { applyCoreGraphics } from '../src/graphics/core-graphics.js';

const directory = '/home/web_user/.local/share/Play Data Files';
const configPath = directory + '/config.xml';

function makeModule() {
  const files = new Map();
  const calls = [];
  const module = {
    FS: {
      analyzePath(path) { calls.push(['exists', path]); return { exists: files.has(path) }; },
      mkdirTree(path) { calls.push(['mkdir', path]); },
      writeFile(path, data) { calls.push(['write', path, data]); files.set(path, data); },
      readFile(path, options) { calls.push(['read', path, options]); return files.get(path); },
    },
  };
  return { module, files, calls };
}

test('writes the official default XML before returning the applied graphics snapshot', () => {
  const { module, files, calls } = makeModule();
  const applied = applyCoreGraphics(module);
  assert.deepEqual(applied, { resolutionScale: 1, bilinearFiltering: false });
  const expected = '<?xml version="1.0"?>\n<Config>\n' +
    '  <Preference Name="renderer.opengl.resfactor" Type="integer" Value="1"/>\n' +
    '  <Preference Name="renderer.opengl.forcebilineartextures" Type="boolean" Value="false"/>\n' +
    '  <Preference Name="ps2.limitframerate" Type="boolean" Value="true"/>\n</Config>\n';
  assert.equal(files.get(configPath), expected);
  assert.deepEqual(calls, [['exists', configPath], ['mkdir', directory], ['write', configPath, expected]]);
});

test('2x and forced bilinear use native preferences and cannot disable the rate limiter', () => {
  const { module, files } = makeModule();
  const options = { resolutionScale: 2, bilinearFiltering: true, limitFramerate: false, widescreen: true };
  assert.deepEqual(applyCoreGraphics(module, options), { resolutionScale: 2, bilinearFiltering: true });
  const xml = files.get(configPath);
  assert.match(xml, /Name="renderer\.opengl\.resfactor" Type="integer" Value="2"/);
  assert.match(xml, /Name="renderer\.opengl\.forcebilineartextures" Type="boolean" Value="true"/);
  assert.match(xml, /Name="ps2\.limitframerate" Type="boolean" Value="true"/);
  assert.equal((xml.match(/<Preference /g) || []).length, 3);
  assert.doesNotMatch(xml, /widescreen|fps|frameskip/i);
  assert.equal(options.limitFramerate, false, 'caller settings are not mutated');
});

test('unsupported scales and non-boolean filter values normalize to conservative defaults', () => {
  for (const scale of [0, -1, 1.5, 3, Infinity, NaN, '2', null]) {
    const { module, files } = makeModule();
    assert.deepEqual(applyCoreGraphics(module, { resolutionScale: scale, bilinearFiltering: 'true' }), {
      resolutionScale: 1, bilinearFiltering: false,
    });
    assert.match(files.get(configPath), /Name="renderer\.opengl\.resfactor" Type="integer" Value="1"/);
  }
});

test('missing or failing filesystem cannot be reported as an applied configuration', () => {
  assert.throws(() => applyCoreGraphics(null), /sistema de arquivos/);
  assert.throws(() => applyCoreGraphics({ FS: {} }), /sistema de arquivos/);
  for (const method of ['analyzePath', 'mkdirTree', 'writeFile']) {
    const { module, files } = makeModule();
    module.FS[method] = () => { throw new Error(`Failed ${method}`); };
    assert.throws(() => applyCoreGraphics(module), new RegExp(`Failed ${method}`));
    assert.equal(files.has(configPath), false);
  }
});

test('identical configuration is idempotent and does not rewrite the filesystem', () => {
  const { module, calls } = makeModule();
  const initial = applyCoreGraphics(module, { resolutionScale: 2 });
  calls.length = 0;
  assert.deepEqual(applyCoreGraphics(module, { resolutionScale: 2 }), initial);
  assert.deepEqual(calls, [['exists', configPath], ['read', configPath, { encoding: 'utf8' }]]);
});

test('existing differing configuration is preserved, including unrelated preferences', () => {
  const { module, files, calls } = makeModule();
  const existing = '<Config><Preference Name="system.language" Type="integer" Value="4"/></Config>';
  files.set(configPath, existing);
  assert.throws(() => applyCoreGraphics(module, { resolutionScale: 2 }), /configuração diferente/);
  assert.equal(files.get(configPath), existing);
  assert.equal(calls.some(([operation]) => operation === 'write' || operation === 'mkdir'), false);
});
