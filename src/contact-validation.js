export const MAX_CONTACT_BYTES = 16 * 1024;
export const CONTACT_LIMITS = Object.freeze({ name: 120, email: 254, phone: 32, course: 120, message: 4000 });

export class ContactRequestError extends Error {
  constructor(status, message) {
    super(message);
    this.name = 'ContactRequestError';
    this.status = status;
  }
}

const text = (value) => typeof value === 'string' ? value.trim() : '';
const singleLine = (value) => !/[\x00-\x1f\x7f]/.test(value);

/** Select and validate submitted data. Values remain text, never HTML. */
export function validateContact(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return { ok: false, fields: { form: 'Confira os dados do formulário.' } };
  }
  // Do not disclose validation details to submissions filling the hidden field.
  if (input.website !== undefined && input.website !== null && String(input.website).trim()) {
    return { ok: true, honeypot: true, data: null };
  }
  const data = {
    name: text(input.name),
    email: text(input.email).toLowerCase(),
    phone: text(input.phone),
    course: text(input.course),
    message: text(input.message).replace(/\r\n?/g, '\n'),
    consent: input.consent === true || ['on', 'true', '1'].includes(input.consent),
  };
  const fields = {};
  if (data.name.length < 2 || data.name.length > CONTACT_LIMITS.name || !singleLine(data.name)) {
    fields.name = 'Informe seu nome, entre 2 e 120 caracteres.';
  }
  if (data.email.length > CONTACT_LIMITS.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email) || !singleLine(data.email)) {
    fields.email = 'Informe um e-mail válido, com até 254 caracteres.';
  }
  if (input.phone !== undefined && typeof input.phone !== 'string') {
    fields.phone = 'Confira o telefone informado.';
  } else if (data.phone && (data.phone.length > CONTACT_LIMITS.phone ||
      !/^[+()\d.\s-]+$/.test(data.phone) || !singleLine(data.phone) ||
      !/^\d{8,15}$/.test(data.phone.replace(/\D/g, '')))) {
    fields.phone = 'Informe um telefone com 8 a 15 dígitos ou deixe o campo vazio.';
  }
  if (data.course.length < 2 || data.course.length > CONTACT_LIMITS.course || !singleLine(data.course)) {
    fields.course = 'Informe o curso de interesse, com até 120 caracteres.';
  }
  if (data.message.length < 10 || data.message.length > CONTACT_LIMITS.message || /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(data.message)) {
    fields.message = 'Escreva uma mensagem entre 10 e 4.000 caracteres.';
  }
  if (!data.consent) fields.consent = 'Autorize o uso dos dados para responder ao seu interesse.';
  return Object.keys(fields).length ? { ok: false, fields } : { ok: true, honeypot: false, data };
}

/** Browser POSTs must originate from the current site, including preview URLs. */
export function isSameOriginContact(request) {
  try { return request.headers.get('origin') === new URL(request.url).origin; } catch { return false; }
}

/** Enforce the byte limit while reading, even without an honest Content-Length. */
export async function readContactBody(request) {
  const type = (request.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
  if (!['application/json', 'application/x-www-form-urlencoded'].includes(type)) {
    throw new ContactRequestError(415, 'Use o formulário para enviar seu interesse.');
  }
  const declared = request.headers.get('content-length');
  if (declared !== null && (!/^\d+$/.test(declared) || !Number.isSafeInteger(Number(declared)))) {
    throw new ContactRequestError(400, 'Não foi possível ler o formulário.');
  }
  if (declared !== null && Number(declared) > MAX_CONTACT_BYTES) {
    throw new ContactRequestError(413, 'O formulário excedeu o tamanho permitido.');
  }
  const chunks = [];
  let length = 0;
  const reader = request.body?.getReader();
  try {
    if (reader) {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        length += value.byteLength;
        if (length > MAX_CONTACT_BYTES) {
          try { await reader.cancel(); } catch { /* Retain the size error. */ }
          throw new ContactRequestError(413, 'O formulário excedeu o tamanho permitido.');
        }
        chunks.push(value);
      }
    }
  } catch (error) {
    if (error instanceof ContactRequestError) throw error;
    throw new ContactRequestError(400, 'Não foi possível ler o formulário.');
  } finally { reader?.releaseLock(); }
  const buffer = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) { buffer.set(chunk, offset); offset += chunk.byteLength; }
  try {
    const body = new TextDecoder('utf-8', { fatal: true }).decode(buffer);
    if (type === 'application/json') return JSON.parse(body);
    const entries = new URLSearchParams(body);
    const input = {};
    for (const [key, value] of entries) {
      if (Object.hasOwn(input, key)) throw new ContactRequestError(400, 'O formulário contém campos repetidos.');
      Object.defineProperty(input, key, { value, enumerable: true });
    }
    return input;
  } catch (error) {
    if (error instanceof ContactRequestError) throw error;
    throw new ContactRequestError(400, 'Não foi possível ler o formulário.');
  }
}
