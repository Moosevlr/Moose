import { defineConfig } from 'vite';
import { appendFile, mkdir, readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
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
      if (!source.pathname.startsWith('/api/')) return next();
      let target = source;
      let handler;
      if (source.pathname.startsWith('/api/verificar/')) {
        target = new URL('/.netlify/functions/verify', source.origin);
        target.searchParams.set('token', source.pathname.slice('/api/verificar/'.length));
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
  return {
    name: 'jcb-build-metadata', apply: 'build',
    configResolved(config) { root = config.root; },
    generateBundle() {
      const { version } = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
      const supplied = process.env.COMMIT_REF || '';
      const commit = /^[a-f0-9]{40}$/i.test(supplied) ? supplied : null;
      this.emitFile({ type: 'asset', fileName: 'build-info.json', source: JSON.stringify({ app: 'JCB ENGENHARIA', version, commit }, null, 2) + '\n' });
    },
  };
}

export default defineConfig({ plugins: [apiAdapter(), buildMetadata()], build: { sourcemap: false } });
