import { defineConfig } from 'vite';
import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { randomUUID, createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { createVerifyHandler } from './netlify/functions/verify.mjs';
import { createContactHandler } from './netlify/functions/contact.mjs';

// Local-only adapter: private development leads go to a file, never to an
// external mailbox. Production uses the Netlify function and private Blobs.
const localContact = createContactHandler({ storeFactory: async () => ({
  async setJSON(id, value) {
    await mkdir('private', { recursive: true, mode: 0o700 });
    await appendFile('private/dev-interesses.ndjson', JSON.stringify({ ...value, development: true }) + '\n', { mode: 0o600 });
    return { modified: true };
  },
}), createId: () => `dev-${randomUUID()}` });

function apiAdapter() {
  return { name: 'jcb-local-api', configureServer: setup, configurePreviewServer: setup };
  async function setup(server) {
    let credential = null;
    try { credential = JSON.parse(await readFile('private/credential.json', 'utf8')); } catch { /* Local-only fixture may be absent in a clean clone. */ }
    const verify = createVerifyHandler(credential);
    server.middlewares.use(async (req, res, next) => {
      const source = new URL(req.url, `http://${req.headers.host}`);
      const directVerification = source.pathname === '/.netlify/functions/verify';
      if (!source.pathname.startsWith('/api/') && !directVerification) return next();
      let target = source;
      let handler;
      if (directVerification || source.pathname.startsWith('/api/verificar/')) {
        handler = verify;
      } else if (source.pathname === '/api/contato') handler = localContact;
      else { res.statusCode = 404; return res.end(); }
      try {
        const chunks = [];
        let size = 0;
        for await (const chunk of req) {
          size += chunk.length;
          if (size > 20_000) { res.statusCode = 413; return res.end(); }
          chunks.push(chunk);
        }
        const request = new Request(target, { method: req.method, headers: req.headers,
          body: ['GET', 'HEAD'].includes(req.method) ? undefined : Buffer.concat(chunks) });
        const response = await handler(request);
        res.statusCode = response.status;
        for (const [key, value] of response.headers) res.setHeader(key, value);
        res.end(Buffer.from(await response.arrayBuffer()));
      } catch { res.statusCode = 500; res.end(JSON.stringify({ error: 'Local API unavailable' })); }
    });
  }
}

function buildMetadata() {
  let root;
  let output;
  return {
    name: 'jcb-build-metadata', apply: 'build',
    configResolved(config) { root = config.root; output = resolve(root, config.build.outDir); },
    generateBundle() {
      const { version } = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
      const supplied = process.env.COMMIT_REF || '';
      const commit = /^[a-f0-9]{40}$/i.test(supplied) ? supplied : null;
      this.emitFile({ type: 'asset', fileName: 'build-info.json', source: JSON.stringify({ app: 'JCB ENGENHARIA', version, commit }, null, 2) + '\n' });
    },
    async writeBundle() {
      const filename = join(output, 'preparar-carteirinha/index.html');
      let html = await readFile(filename, 'utf8');
      const bootstrap = /<script id="setup-bootstrap">([\s\S]*?)<\/script>/.exec(html)?.[1];
      const entry = /<script\b[^>]*\bsrc="([^"]+)"[^>]*><\/script>/.exec(html);
      if (!bootstrap || !entry || !entry[1].startsWith('/assets/')) throw new Error('Private preparation entry missing.');
      const hash = value => `sha256-${createHash('sha256').update(value).digest('base64')}`;
      const bootstrapHash = hash(bootstrap);
      const entryHash = hash(await readFile(join(output, entry[1].slice(1))));
      html = html.replace(entry[0], entry[0].replace('<script ', `<script integrity="${entryHash}" `))
        .replace(/<link\b[^>]*\brel="modulepreload"[^>]*>/g, '');
      await writeFile(filename, html);
      const policy = `default-src 'none'; script-src '${bootstrapHash}' '${entryHash}' 'strict-dynamic'; style-src 'self'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'; object-src 'none'`;
      const headersFile = join(output, '_headers');
      let headers = (await readFile(headersFile, 'utf8'))
        .replace("script-src 'self';", `script-src 'self' '${bootstrapHash}';`)
        .replace("img-src 'self' data:;", "img-src 'self' data: blob:;");
      for (const path of ['/preparar-carteirinha', '/preparar-carteirinha/*']) {
        headers += `\n${path}\n  Cache-Control: no-store\n  Referrer-Policy: no-referrer\n  X-Robots-Tag: noindex, nofollow, noarchive\n  Content-Security-Policy: ${policy}\n`;
      }
      await writeFile(headersFile, headers);
    },
  };
}

export default defineConfig({ plugins: [apiAdapter(), buildMetadata()], build: {
  sourcemap: false,
  modulePreload: { polyfill: false },
  rollupOptions: { input: { main: resolve('index.html'), issuer: resolve('preparar-carteirinha/index.html') } },
} });
