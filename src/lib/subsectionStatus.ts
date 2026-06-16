// Shared subsection-status helpers. Single source of truth for how the UI interprets
// a subsection's compliance verdict and snag openness, so the list, detail page and
// dashboards agree.

export type ComplianceState = "compliant" | "non-compliant" | "pending";

/**
 * Map the server-owned `is_compliant` flag to a display state.
 * `null`/`undefined` means the recompute hasn't produced a verdict yet — that is
 * "pending", NOT a failure. Rendering it as "Fail" misrepresents an unknown state.
 */
export function complianceState(isCompliant: boolean | null | undefined): ComplianceState {
  if (isCompliant === true) return "compliant";
  if (isCompliant === false) return "non-compliant";
  return "pending";
}

// A snag is terminal/closed if its status (case-insensitive) is rectified or closed;
// everything else (Open, In Progress, unknown) counts as open.
const TERMINAL_SNAG_STATUSES = ["rectified", "closed"];

export function isSnagOpen(status: string | null | undefined): boolean {
  return !TERMINAL_SNAG_STATUSES.includes((status || "").toLowerCase());
}

export type SnagBucket = "open" | "inProgress" | "closed";

// Three-way bucket for snag-status displays (pie charts, summaries). Case-insensitive,
// and treats `rectified`/`closed` as terminal — consistent with isSnagOpen above, so the
// dashboards never undercount resolved snags due to casing (e.g. a lowercase "rectified").
export function snagStatusBucket(status: string | null | undefined): SnagBucket {
  const s = (status || "").toLowerCase();
  if (TERMINAL_SNAG_STATUSES.includes(s)) return "closed";
  if (s === "in progress" || s === "in_progress") return "inProgress";
  return "open";
}
