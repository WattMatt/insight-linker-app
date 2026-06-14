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
