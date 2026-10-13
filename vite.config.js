import { defineConfig } from 'vite';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const headers = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',
  'Cross-Origin-Resource-Policy': 'same-origin',
};
let projectRoot;

export default defineConfig({
  plugins: [{
    name: 'digital-station-build-info',
    apply: 'build',
    configResolved(config) { projectRoot = config.root; },
    generateBundle() {
      let commit = process.env.COMMIT_REF?.trim();
      if (!/^[a-f0-9]{40}$/i.test(commit || '')) {
        try {
          commit = execFileSync('git', ['rev-parse', 'HEAD'], {
            cwd: projectRoot,
            encoding: 'utf8',
            stdio: ['ignore', 'pipe', 'ignore'],
          }).trim();
        } catch { commit = null; }
      }
      if (!/^[a-f0-9]{40}$/i.test(commit || '')) commit = null;
      const { version } = JSON.parse(readFileSync(join(projectRoot, 'package.json'), 'utf8'));
      this.emitFile({
        type: 'asset',
        fileName: 'build-info.json',
        source: JSON.stringify({ app: 'Digital Station', version, commit }, null, 2) + '\n',
      });
    },
  }],
  server: { headers },
  preview: { headers },
  build: { sourcemap: true },
});
