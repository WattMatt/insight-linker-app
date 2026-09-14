import { supabase } from "@/integrations/supabase/client";
import {
  planSubsectionSerialWrites,
  type MatchableAsset,
  type SubsectionSerialPlan,
} from "@/lib/report/subsectionAssetMatch";

export interface SyncResult extends SubsectionSerialPlan {
  applied: number;
  failed: number;
}

/**
 * Write register serials through to their subsections.
 *
 * This closes the root cause behind "linked but no photos" and understated metering
 * compliance: `subsections.meter_serial_number` was only ever populated by hand, while the
 * register import wrote `site_assets` only. The subsections are fetched FRESH here so the
 * planner's blank-only guard sees live state rather than a component cache, and each write
 * mirrors the manual form exactly — serial and `metering_status='Installed'` together.
 * Nothing is overwritten; conflicts and ambiguities come back for the caller to report.
 */
export async function syncSubsectionSerialsFromRegister(
  siteId: string,
  assets: MatchableAsset[],
): Promise<SyncResult> {
  const { data, error } = await supabase
    .from("subsections")
    .select("id, name, meter_serial_number")
    .eq("site_id", siteId);
  if (error) throw error;

  const plan = planSubsectionSerialWrites(assets, data ?? []);

  let applied = 0;
  let failed = 0;
  for (const write of plan.writes) {
    const { error: updateError } = await supabase
      .from("subsections")
      .update({
        meter_serial_number: write.serial,
        metering_status: "Installed",
        updated_at: new Date().toISOString(),
      })
      .eq("id", write.subsectionId);
    if (updateError) {
      failed++;
      console.error(`Failed to link ${write.subsectionName} to serial ${write.serial}:`, updateError);
    } else {
      applied++;
    }
  }

  return { ...plan, applied, failed };
}

const list = (names: string[]) =>
  names.slice(0, 5).join(", ") + (names.length > 5 ? ` +${names.length - 5} more` : "");

/** One success line and one warning line (each optional) for the toasts both callers show. */
export function describeSync(result: SyncResult): { success?: string; warning?: string } {
  const success =
    result.applied > 0
      ? `${result.applied} subsection${result.applied === 1 ? "" : "s"} linked to register meter serial${result.applied === 1 ? "" : "s"}`
      : undefined;

  const warnings: string[] = [];
  if (result.conflicts.length) {
    warnings.push(
      `${result.conflicts.length} already hold a different serial and were left unchanged: ${list(result.conflicts.map(c => c.subsectionName))}`,
    );
  }
  if (result.ambiguous.length) {
    warnings.push(
      `${result.ambiguous.length} matched more than one register serial — review by hand: ${list(result.ambiguous.map(a => a.subsectionName))}`,
    );
  }
  if (result.failed) warnings.push(`${result.failed} subsection update${result.failed === 1 ? "" : "s"} failed`);

  return { success, warning: warnings.length ? warnings.join(". ") : undefined };
}
