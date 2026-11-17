export const VERIFICATION_TOKEN = /^[A-Za-z0-9_-]{43}$/;

export function normalizeEnrollment(value) {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toUpperCase();
  return /^[A-Z0-9][A-Z0-9._-]{2,39}$/.test(normalized) ? normalized : null;
}

/** Accept the number printed on the card, its opaque code, or its own QR URL. */
export function parseVerificationInput(value, origin) {
  if (typeof value !== 'string') return null;
  const input = value.trim();
  if (VERIFICATION_TOKEN.test(input)) return { kind: 'token', value: input };
  if (/^https?:/i.test(input)) {
    try {
      const url = new URL(input);
      const match = /^\/validar\/([A-Za-z0-9_-]{43})\/?$/.exec(url.pathname);
      return url.origin === origin && match ? { kind: 'token', value: match[1] } : null;
    } catch { return null; }
  }
  const enrollment = normalizeEnrollment(input);
  return enrollment ? { kind: 'enrollment', value: enrollment } : null;
}
