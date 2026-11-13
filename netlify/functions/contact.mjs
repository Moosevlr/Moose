import { randomUUID } from 'node:crypto';
import { ContactRequestError, isSameOriginContact, readContactBody, validateContact } from '../../src/contact-validation.js';

const STORE_NAME = 'jcb-interesses';
const successMessage = 'Seu interesse foi registrado. Este formulário não confirma matrícula ou vaga.';
const unavailableMessage = 'Não foi possível registrar seu interesse agora. Tente novamente mais tarde.';

function json(status, data, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      ...extraHeaders,
    },
  });
}

async function openStore() {
  // Functions v2 supplies the server-side Blobs environment automatically.
  // No token, store-read endpoint, or browser credential is exposed by this API.
  const { getStore } = await import('@netlify/blobs');
  return getStore(STORE_NAME);
}

export function createContactHandler({ storeFactory = openStore, now = () => new Date(), createId = randomUUID } = {}) {
  return async function contact(request) {
    if (request.method !== 'POST') return json(405, { ok: false, error: 'Use POST para enviar o formulário.' }, { Allow: 'POST' });
    if (!isSameOriginContact(request)) return json(403, { ok: false, error: 'Envie o formulário a partir deste site.' });
    let result;
    try { result = validateContact(await readContactBody(request)); } catch (error) {
      const status = error instanceof ContactRequestError ? error.status : 400;
      return json(status, { ok: false, error: error instanceof ContactRequestError ? error.message : 'Não foi possível ler o formulário.' });
    }
    if (!result.ok) return json(422, { ok: false, error: 'Confira os campos indicados.', fields: result.fields });
    if (result.honeypot) return json(200, { ok: true, message: 'Solicitação recebida.' });
    try {
      const id = createId();
      const record = { id, createdAt: now().toISOString(), ...result.data };
      const store = await storeFactory(STORE_NAME);
      const written = await store.setJSON(id, record, { onlyIfNew: true });
      if (written?.modified !== true) throw new Error('Storage did not confirm the write');
      return json(201, { ok: true, message: successMessage });
    } catch {
      // Never claim delivery when persistence failed, or expose PII/errors.
      return json(503, { ok: false, error: unavailableMessage }, { 'Retry-After': '60' });
    }
  };
}

export default createContactHandler();
