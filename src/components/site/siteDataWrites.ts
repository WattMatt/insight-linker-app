// Writes behind the Asset Verification edits. The site (inspections + subsections) is the
// truth; the register is corrected towards it. Kept apart from the components so the table
// and the "Shops on site" tab write the same way.

import { supabase } from "@/integrations/supabase/client";
import {
  meterKey,
  normalizeMeterSerial,
  compareValues,
  type ComparisonResult,
  type InspectionTenant,
} from "@/lib/assetVerification";

export type SubsectionPatch = Partial<{
  name: string;
  shop_number: string | null;
  tenant_name: string | null;
  meter_serial_number: string | null;
}>;

/** Rename a subsection, or set its shop number / tenant / meter serial. */
export async function updateSubsection(id: string, patch: SubsectionPatch): Promise<void> {
  if (patch.name !== undefined && !patch.name.trim()) throw new Error("A subsection needs a name");
  const { error } = await supabase
    .from("subsections")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}

export type MeterRowPatch = Partial<
  Pick<InspectionTenant, "shopNumber" | "shopName" | "meterSerialNumber" | "ctSizeAndRatio" | "breakerSize">
>;

/**
 * Edit one board meter row inside an inspection's json_data.tenants. The row is found by its
 * own id; the serial is only a fallback for legacy rows without one. (Finding it by serial
 * alone is what broke once serials were wrong or duplicated.)
 */
export async function updateMeterRow(
  inspectionId: string,
  row: { tenantId?: string; meterSerialNumber?: string },
  patch: MeterRowPatch,
): Promise<void> {
  const { data, error } = await supabase.from("inspections").select("json_data").eq("id", inspectionId).single();
  if (error) throw error;

  const jsonData = ((data?.json_data as Record<string, unknown> | null) ?? {}) as Record<string, unknown>;
  const tenants = Array.isArray(jsonData.tenants) ? [...(jsonData.tenants as InspectionTenant[])] : [];
  const serial = normalizeMeterSerial(row.meterSerialNumber);
  const index = row.tenantId
    ? tenants.findIndex((t) => t.id === row.tenantId)
    : tenants.findIndex((t) => serial !== "" && normalizeMeterSerial(t.meterSerialNumber) === serial);
  if (index === -1) throw new Error("That meter row is no longer on the inspection");

  tenants[index] = { ...tenants[index], ...patch };
  const { error: updateError } = await supabase
    .from("inspections")
    .update({ json_data: { ...jsonData, tenants } as never })
    .eq("id", inspectionId);
  if (updateError) throw updateError;
}

/**
 * The register fields that differ from what was found on site, as the values to write.
 * Serial annotations ("35727818 METER OFF") are written as the bare serial.
 */
export function siteCorrections(result: ComparisonResult): Record<string, string> {
  const out: Record<string, string> = {};
  if (result.status === "wrong_meter" || result.matchedOnOldSerial) return out;
  if (result.serialMatch === "mismatch" && result.siteSerial) {
    out.meter_serial_number = meterKey(result.siteSerial) || result.siteSerial.trim();
  }
  const row = result.inspectionMatch;
  if (row && result.ctMatch === "mismatch" && row.ctSizeAndRatio) out.ct_ratio = row.ctSizeAndRatio.trim();
  if (row && result.breakerMatch === "mismatch" && row.breakerSize) out.breaker_size = row.breakerSize.trim();
  // A register blank that the site fills is a correction too.
  if (row && !result.asset.ct_ratio?.trim() && row.ctSizeAndRatio && compareValues("x", row.ctSizeAndRatio) !== "na") {
    out.ct_ratio = row.ctSizeAndRatio.trim();
  }
  if (row && !result.asset.breaker_size?.trim() && row.breakerSize && compareValues("x", row.breakerSize) !== "na") {
    out.breaker_size = row.breakerSize.trim();
  }
  return out;
}

/** Write the site's serial / CT / breaker into the register row. Returns what was changed. */
export async function applySiteValuesToRegister(result: ComparisonResult): Promise<Record<string, string>> {
  const update = siteCorrections(result);
  if (Object.keys(update).length === 0) return update;
  const { error } = await supabase.from("site_assets").update(update).eq("id", result.asset.id);
  if (error) throw error;
  return update;
}
