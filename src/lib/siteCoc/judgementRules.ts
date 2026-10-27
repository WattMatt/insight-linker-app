/**
 * Judgement-policy translation of strict per-rule COC results — the TypeScript twin of
 * public.coc_judgement_rules() (supabase/migrations/20261027120000_coc_judgement_signoff.sql).
 * Keep the two identical: signed-off judgement rows store the SQL result in `rules`, and the
 * Site COC report applies this to rows still awaiting sign-off.
 *
 *   C5 FAIL                 -> FLAG      neutral loop > earth loop is flagged, not failed
 *   C1 / C2 ASSERTED        -> PASS      "Compliant" ticked without an ohm value counts as measured
 *   FAIL with note exactly 'printed "correct" label, box not ticked' -> ASSERTED
 *   anything else           -> unchanged
 */
export interface RuleResult { rule: string; res: string; note?: string | null; val?: string | null }

export const PRINTED_CORRECT_UNTICKED = 'printed "correct" label, box not ticked';

export function judgementRules(ruleResults: RuleResult[] | null | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  for (const r of ruleResults ?? []) {
    const res = String(r.res ?? "").toUpperCase();
    if (r.rule === "C5" && res === "FAIL") out[r.rule] = "FLAG";
    else if ((r.rule === "C1" || r.rule === "C2") && res === "ASSERTED") out[r.rule] = "PASS";
    else if (res === "FAIL" && (r.note ?? "").trim() === PRINTED_CORRECT_UNTICKED) out[r.rule] = "ASSERTED";
    else out[r.rule] = r.res;
  }
  return out;
}
