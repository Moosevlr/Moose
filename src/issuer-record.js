export const ISSUER_RECORD_FIELDS = Object.freeze([
  'schemaVersion', 'tokenSha256', 'issuer', 'issuerTagline', 'status',
  'issuerConfirmedAt', 'approvalRef', 'holderName', 'enrollment', 'course',
  'validThrough', 'timeZone', 'canonicalOrigin',
]);

/** Select issuer fields in a fixed order for persistence and snapshot hashing. */
export function selectIssuerRecord(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return {};
  return Object.fromEntries(ISSUER_RECORD_FIELDS
    .filter((key) => Object.hasOwn(input, key))
    .map((key) => [key, input[key]]));
}
