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

  const subNameNorm = sub.name?.toLowerCase().trim() || "";
  if (!subNameNorm) return undefined;

  return assets.find(a => {
    const premisesNorm = a.premises_id?.toLowerCase().trim() || "";
    const tradeAsNorm = a.trade_as?.toLowerCase().trim() || "";
    const matchesPremises =
      premisesNorm === subNameNorm ||
      premisesNorm.endsWith(` - ${subNameNorm}`) ||
      premisesNorm.endsWith(`-${subNameNorm}`);
    const matchesTradeAs =
      tradeAsNorm === subNameNorm ||
      tradeAsNorm.endsWith(` - ${subNameNorm}`) ||
      tradeAsNorm.endsWith(`-${subNameNorm}`);
    return matchesPremises || matchesTradeAs;
  });
}
