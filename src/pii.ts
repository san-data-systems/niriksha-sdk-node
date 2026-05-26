/* eslint-disable security/detect-unsafe-regex */
// All regexes here are intentional fixed-pattern PII detectors applied to
// developer-supplied strings — not untrusted external input — so ReDoS risk
// is accepted and scoped to this file only.

// PII patterns compiled once at module load to avoid per-call overhead.
// eslint-disable-next-line no-useless-escape
const EMAIL_RE    = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g
const PHONE_RE    = /(\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}/g
const SSN_RE      = /\b\d{3}-\d{2}-\d{4}\b/g
const CC_RE       = /\b\d{4}[- ]?\d{4}[- ]?\d{4}[- ]?\d{0,4}\b/g

/**
 * Replace common PII patterns in a string with safe placeholders.
 *
 * Patterns applied in order:
 *  1. Email address   → [REDACTED_EMAIL]
 *  2. US phone number → [REDACTED_PHONE]
 *  3. SSN (NNN-NN-NNNN) → [REDACTED_SSN]
 *  4. Credit card (13–16 contiguous digits, optional spaces/hyphens) → [REDACTED_CC]
 *
 * The function does NOT mutate the original string.
 */
export function redactPii(s: string): string {
  return s
    .replace(EMAIL_RE, '[REDACTED_EMAIL]')
    .replace(PHONE_RE, '[REDACTED_PHONE]')
    .replace(SSN_RE,   '[REDACTED_SSN]')
    .replace(CC_RE,    '[REDACTED_CC]')
}
