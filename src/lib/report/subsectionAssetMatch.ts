import { normalizeMeterSerial } from "@/lib/assetVerification";

export interface MatchableAsset {
  meter_serial_number?: string | null;
  premises_id?: string | null;
  trade_as?: string | null;
  breaker_size?: string | null;
}

export interface MatchableSubsection {
  name?: string | null;
  meter_serial_number?: string | null;
}

// normalizeMeterSerial uppercases + strips non-alphanumerics; these are the
// sentinel/empty values that must NOT be treated as a real serial (parity with
// the SENTINELS set in assetVerification.ts).
const isUsableSerial = (s: string) => s !== "" && s !== "NA" && s !== "TBC";

/**
 * Resolve the electrical-meter `site_assets` row for a subsection — mirroring how
 * the Asset Verification tab/report joins, so both surfaces print the SAME
 * breaker_size for the same meter.
 *
 * Order:
 *   1. Identity join on the normalized meter serial number (the key AV uses).
 *   2. Fallback: legacy premises_id / trade_as name-suffix match (premises_id may
 *      be "YA - KIOSK" while the subsection name is just "KIOSK").
 *
 * Returns undefined when nothing matches.
 */
export function matchAssetForSubsection<T extends MatchableAsset>(
  sub: MatchableSubsection,
  assets: T[],
): T | undefined {
  const subSerialNorm = normalizeMeterSerial(sub.meter_serial_number);
  if (isUsableSerial(subSerialNorm)) {
    const bySerial = assets.find(a => {
      const aSerial = normalizeMeterSerial(a.meter_serial_number);
      return isUsableSerial(aSerial) && aSerial === subSerialNorm;
    });
    if (bySerial) return bySerial;
  }

  const subNameNorm = normalizeName(sub.name);
  if (!subNameNorm) return undefined;

  return assets.find(a => matchesSubsectionName(a, subNameNorm));
}

const normalizeName = (value: string | null | undefined) => (value || "").toLowerCase().trim();

/**
 * The name-suffix rule, shared by the read-side matcher above and the write planner below
 * so a subsection can never be READ from one register row and WRITTEN from another.
 * premises_id may be "YA - KIOSK" while the subsection is just "KIOSK".
 */
function matchesSubsectionName(asset: MatchableAsset, subNameNorm: string): boolean {
  const hit = (v: string) =>
    v === subNameNorm || v.endsWith(` - ${subNameNorm}`) || v.endsWith(`-${subNameNorm}`);
  return hit(normalizeName(asset.premises_id)) || hit(normalizeName(asset.trade_as));
}

export interface SubsectionSerialTarget {
  id: string;
  name?: string | null;
  meter_serial_number?: string | null;
}
export interface SerialWrite   { subsectionId: string; subsectionName: string; serial: string; premisesId: string }
export interface SerialConflict { subsectionId: string; subsectionName: string; existing: string; proposed: string; premisesId: string }
export interface SerialAmbiguity { subsectionId: string; subsectionName: string; serials: string[] }
export interface SubsectionSerialPlan {
  writes: SerialWrite[];
  conflicts: SerialConflict[];
  ambiguous: SerialAmbiguity[];
  alreadySynced: number;
}

/**
 * Decide which subsections the asset register may populate with a meter serial.
 *
 * Root cause this exists for: `subsections.meter_serial_number` (and the `metering_status`
 * derived from it) was only ever written by hand on the subsection page, while the register
 * import wrote `site_assets` only and nothing linked the two. So on register-populated sites
 * the column stayed blank and every consumer — schematic photos, metering compliance rate,
 * site health, PDF verdict — was wrong.
 *
 * The planner is deliberately conservative because a wrong write stamps a wrong meter onto a
 * subsection and inflates compliance:
 *   - a subsection is filled only when its matched register rows agree on exactly ONE serial;
 *   - a subsection that already holds a DIFFERENT serial is never overwritten — it is
 *     returned as a conflict for a person to resolve;
 *   - blank / NA / TBC on the subsection count as "no serial" and may be filled.
 * Pure: the caller fetches, applies the writes, and reports the rest.
 */
export function planSubsectionSerialWrites<T extends MatchableAsset>(
  assets: T[],
  subsections: SubsectionSerialTarget[],
): SubsectionSerialPlan {
  const plan: SubsectionSerialPlan = { writes: [], conflicts: [], ambiguous: [], alreadySynced: 0 };

  for (const sub of subsections) {
    const subNameNorm = normalizeName(sub.name);
    if (!subNameNorm) continue;
    const subsectionName = sub.name ?? "";

    // Distinct usable serials among the register rows that match this subsection by name,
    // keeping the first row's spelling so we write what the register says, not a normalized form.
    const bySerial = new Map<string, T>();
    for (const a of assets) {
      if (!matchesSubsectionName(a, subNameNorm)) continue;
      const serialNorm = normalizeMeterSerial(a.meter_serial_number);
      if (!isUsableSerial(serialNorm) || bySerial.has(serialNorm)) continue;
      bySerial.set(serialNorm, a);
    }
    if (bySerial.size === 0) continue;

    if (bySerial.size > 1) {
      plan.ambiguous.push({
        subsectionId: sub.id, subsectionName,
        serials: [...bySerial.values()].map(a => (a.meter_serial_number || "").trim()),
      });
      continue;
    }

    const [proposedNorm, source] = [...bySerial.entries()][0];
    const proposed = (source.meter_serial_number || "").trim();
    const premisesId = (source.premises_id || source.trade_as || "").trim();
    const existingNorm = normalizeMeterSerial(sub.meter_serial_number);

    if (!isUsableSerial(existingNorm)) {
      plan.writes.push({ subsectionId: sub.id, subsectionName, serial: proposed, premisesId });
    } else if (existingNorm === proposedNorm) {
      plan.alreadySynced++;
    } else {
      plan.conflicts.push({
        subsectionId: sub.id, subsectionName,
        existing: (sub.meter_serial_number || "").trim(), proposed, premisesId,
      });
    }
  }

  return plan;
}
