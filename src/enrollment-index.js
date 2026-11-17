import { createHash } from 'node:crypto';
import { normalizeEnrollment } from './verification-input.js';

export function enrollmentDigest(value) {
  const normalized = normalizeEnrollment(value);
  return normalized ? createHash('sha256').update(normalized, 'utf8').digest('hex') : null;
}

export function enrollmentIndexKey(value) {
  const digest = enrollmentDigest(value);
  return digest ? `enrollments/${digest}` : null;
}
