/**
 * Scrub sensitive data from error text before storage.
 * Layered: truncate FIRST (strongest scrub — most secrets die at the cap),
 * then pattern-redact API keys, bearer tokens, emails, card-number shapes.
 *
 * Runs client-side in the generated snippet AND server-side at ingest.
 * The server pass is the only scrub for platform-sourced /fail pings.
 */

const MAX_LENGTH = 200;

// Patterns for common secret shapes. Intentionally broad to catch variants.
const SECRET_PATTERNS = [
  /sk_live_[a-zA-Z0-9]{20,}/gi, // Stripe live key
  /sk_test_[a-zA-Z0-9]{20,}/gi, // Stripe test key
  /pk_live_[a-zA-Z0-9]{20,}/gi, // Stripe publishable
  /rk_live_[a-zA-Z0-9]{20,}/gi, // Stripe restricted
  /bearer\s+[a-zA-Z0-9._\-]+/gi, // Bearer tokens
  /authorization:\s*bearer\s+[a-zA-Z0-9._\-]+/gi, // Auth header
  /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, // Email addresses
  /\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/g, // Card numbers (16 digits)
  /\b\d{4}[\s-]?\d{6}[\s-]?\d{5}\b/g, // Card numbers (15 digits, Amex)
];

export interface ScrubResult {
  text: string;
  redacted: boolean;
}

/**
 * Scrub a string: truncate to MAX_LENGTH, then redact secret patterns.
 * Returns the scrubbed text and a flag indicating if redaction occurred.
 */
export function scrub(raw: string): ScrubResult {
  if (!raw || typeof raw !== "string") {
    return { text: "", redacted: false };
  }

  // Step 1: truncate first (strongest scrub)
  const truncated = raw.length > MAX_LENGTH ? raw.slice(0, MAX_LENGTH) : raw;
  let redacted = raw.length > MAX_LENGTH;

  // Step 2: pattern-redact
  let text = truncated;
  for (const pattern of SECRET_PATTERNS) {
    if (pattern.test(text)) {
      redacted = true;
      text = text.replace(pattern, "[REDACTED]");
    }
  }

  return { text, redacted };
}
