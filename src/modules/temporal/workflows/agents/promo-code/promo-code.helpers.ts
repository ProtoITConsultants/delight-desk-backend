/**
 * Promo Code Workflow helpers (deterministic, runs inside the Temporal sandbox).
 */

/**
 * Extracts the bare email address from a "Display Name <email@domain>" header value.
 * Mirrors the helper used in other agents so the workflow can pass a plain address to
 * WooCommerce REST calls.
 */
export function extractEmailAddress(fromEmail: string): string {
  const match = fromEmail.match(/<([^>]+)>/);
  return (match ? match[1] : fromEmail).trim();
}
