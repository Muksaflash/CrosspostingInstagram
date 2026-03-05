import crypto from 'crypto';

/**
 * Perform a timing-safe comparison of two strings.
 *
 * This uses HMAC-SHA256 to hash both strings before comparing them with
 * crypto.timingSafeEqual. Hashing ensures that the compared buffers always
 * have the same length, preventing length-based timing attacks and
 * avoiding errors when the input strings have different lengths.
 *
 * @param a - The first string to compare (e.g., a secret from a request)
 * @param b - The second string to compare (e.g., a secret from environment variables)
 * @returns True if the strings are equal, false otherwise
 */
export function safeCompare(a: string | null | undefined, b: string | null | undefined): boolean {
  if (typeof a !== 'string' || typeof b !== 'string') {
    return false;
  }

  // We use a constant key for HMAC to ensure consistent hashing within this comparison.
  // The key itself doesn't need to be secret for this purpose, as we're just
  // ensuring the buffers passed to timingSafeEqual have the same length.
  const hashA = crypto.createHmac('sha256', 'constant-salt').update(a).digest();
  const hashB = crypto.createHmac('sha256', 'constant-salt').update(b).digest();

  return crypto.timingSafeEqual(hashA, hashB);
}
