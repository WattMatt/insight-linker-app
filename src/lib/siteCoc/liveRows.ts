/**
 * Which coc_certificates rows count as the current register.
 *
 * Re-verification imports add rows with review_status 'proposed' (no final verdict) and only
 * sign-off makes them 'signed_off'; replaced rows get superseded_at. Readers that show, report or
 * match against the register use only live final rows: review_status in LIVE_REVIEW_STATUSES and
 * superseded_at IS NULL. See 20261023120000_coc_reverification_proposed.sql.
 */
export const LIVE_REVIEW_STATUSES = ["final", "signed_off"];
