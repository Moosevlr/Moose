export const CREDENTIAL_TIME_ZONE = 'America/Sao_Paulo';

const SOURCE_STATUSES = new Set(['pending', 'active', 'revoked']);
const PUBLIC_TEXT_FIELDS = ['holderName', 'enrollment', 'course', 'issuer', 'issuerTagline'];
const nonempty = (value) => typeof value === 'string' && value.trim().length > 0;

function validCivilDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  if (year < 1 || month < 1 || month > 12 || day < 1 || day > 31) return false;
  // setUTCFullYear avoids Date.UTC's special interpretation of years 00–99.
  const date = new Date(0);
  date.setUTCFullYear(year, month - 1, day);
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function confirmationTimestamp(value) {
  if (typeof value !== 'string') return null;
  const match = value.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/);
  if (!match || !validCivilDate(match[1]) || Number(match[2]) > 23 || Number(match[3]) > 59 || Number(match[4]) > 59) return null;
  const milliseconds = Date.parse(value);
  return Number.isFinite(milliseconds) ? milliseconds : null;
}

function civilDayInSaoPaulo(date) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: CREDENTIAL_TIME_ZONE, calendar: 'iso8601', numberingSystem: 'latn',
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(date);
  const value = (type) => parts.find((part) => part.type === type)?.value;
  return `${value('year').padStart(4, '0')}-${value('month')}-${value('day')}`;
}

/**
 * Evaluate only the issuer-controlled record and server time. This module has
 * no DOM, storage, query-string, network, or mutation side effects.
 * validThrough is an inclusive civil date in America/Sao_Paulo.
 */
export function evaluateCredential(record, now = new Date()) {
  const validClock = now instanceof Date && Number.isFinite(now.getTime());
  const checkedAt = validClock ? now.toISOString() : null;
  const result = (status) => ({ status, checkedAt, timeZone: CREDENTIAL_TIME_ZONE });
  if (!validClock || !record || typeof record !== 'object' || Array.isArray(record) ||
      record.schemaVersion !== 1 || !SOURCE_STATUSES.has(record.status) ||
      typeof record.tokenSha256 !== 'string' || !/^[a-fA-F0-9]{64}$/.test(record.tokenSha256) ||
      !nonempty(record.issuer) || record.timeZone !== CREDENTIAL_TIME_ZONE ||
      !validCivilDate(record.validThrough)) return result('invalid');

  // Source revocation is authoritative even after expiry or before confirmation.
  if (record.status === 'revoked') return result('revoked');
  if (record.status === 'pending') return result('pending');

  const confirmedAt = confirmationTimestamp(record.issuerConfirmedAt);
  if (confirmedAt === null || !nonempty(record.approvalRef) ||
      PUBLIC_TEXT_FIELDS.some((field) => !nonempty(record[field]))) return result('invalid');
  if (confirmedAt > now.getTime()) return result('pending');

  let status;
  try { status = civilDayInSaoPaulo(now) > record.validThrough ? 'expired' : 'active'; }
  catch { return result('invalid'); }
  // Never spread the private source record into a public response.
  return {
    holderName: record.holderName,
    enrollment: record.enrollment,
    course: record.course,
    issuer: record.issuer,
    issuerTagline: record.issuerTagline,
    validThrough: record.validThrough,
    ...result(status),
  };
}
