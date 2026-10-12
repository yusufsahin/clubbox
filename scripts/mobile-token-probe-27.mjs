/**
 * Retired 2026-10-12 — Phase 27.5.0 SMS Token spike.
 *
 * Clubhouse rejects third-party mobile SMS from Electron (device check /
 * "login did not pass token validation"). Token import and SMS linking are
 * out of scope. Moderation is app-only; use the Clubhouse app on a phone.
 *
 * Historical result: reports/mobile-token-probe-27.json (local, gitignored).
 * See docs/api/mobile-api.md § Phase 27.5.0 and
 * docs/investigations/moderation-api-investigation.md §3.
 */
console.error(
  '[retired] mobile Token / SMS probe removed. Moderation is app-only (device check, 2026-10-12).',
);
process.exit(2);
