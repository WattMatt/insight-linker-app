// Pure, testable core logic for the Asset Verification tab.
// The React components own data fetching, IO (Excel/FileReader) and rendering;
// everything here is deterministic and unit-tested in assetVerification.test.ts.

export type MatchStatus = "match" | "mismatch" | "na";

/** An electrical asset parsed from an imported register. Water meters are not supported. */
export interface ParsedAsset {
  premises_id: string;
  trade_as: string;
  meter_serial_number: string;
  meter_type?: string;
  ct_ratio?: string;
  breaker_size?: string;
  reading_at_commissioning?: string;
  old_meter_serial_number?: string;
  last_meter_read_old?: string;
  comments?: string;
}

export interface InspectionTenant {
  id?: string;
  shopName?: string;
  shopNumber?: string;
  meterSerialNumber?: string;
  ctSizeAndRatio?: string;
  breakerSize?: string;
  meterImage?: string;
  ctRatioImage?: string;
  breakerImage?: string;
}

export interface InspectionRecord {
  id: string;
  title: string;
  subsection_id: string | null;
  json_data: unknown;
}

export interface SubsectionNameRecord {
  id: string;
  name: string;
}

export interface InspectionTenantMatch {
  inspectionId: string;
  inspectionTitle: string;
  subsectionId: string | null;
  subsectionName?: string;
  shopName?: string;
  shopNumber?: string;
  meterSerialNumber: string;
  ctSizeAndRatio?: string;
  breakerSize?: string;
  meterImage?: string;
  ctRatioImage?: string;
  breakerImage?: string;
}

export interface AssetForComparison {
  id: string;
  premises_id: string;
  trade_as: string | null;
  meter_serial_number: string | null;
  /** Previous serial for a swapped meter. Imported from the register and used as a match fallback. */
  old_meter_serial_number?: string | null;
  ct_ratio: string | null;
  breaker_size: string | null;
  asset_category: string;
}

export interface ComparisonResult {
  asset: AssetForComparison;
  inspectionMatch: InspectionTenantMatch | null;
  verified: boolean;
  /**
   * True when the only inspection found was filed under the asset's PREVIOUS serial.
   * The evidence is real but it documents the meter that was replaced, not the one now
   * installed — surfaced separately so "Verified" never silently means "verified the old meter".
   */
  matchedOnOldSerial: boolean;
  ctMatch: MatchStatus;
  breakerMatch: MatchStatus;
  hasDiscrepancy: boolean;
}

const SENTINELS = new Set(["NA", "TBC"]);

/** Normalize a meter serial for identity matching: uppercase, alphanumerics only. */
export function normalizeMeterSerial(serial: string | null | undefined): string {
  return (serial || "").toUpperCase().replace(/[^A-Z0-9]/g, "").trim();
}

/**
 * Is this value really "no data"? Tested on the bare alphanumerics so that every spelling
 * of the sentinel collapses to the same thing — "NA", "N/A", "n.a." all become "NA".
 * The comparison form below keeps a separator, so it can NOT be used for this test:
 * "N/A" survives there as a distinct token and was previously compared as a real value.
 */
function isMissingValue(value: string | null | undefined): boolean {
  const bare = (value || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  return !bare || SENTINELS.has(bare);
}

/**
 * Canonical form for comparing a CT ratio or breaker size. The separator in a ratio is
 * meaningful (1000/5 is not 10005) but its spelling is not — the register exports "600/5A"
 * while the field app captures "600:5A" — so both collapse to a single "/".
 */
function canonicalizeSpec(value: string | null | undefined): string {
  return (value || "").toUpperCase().replace(/:/g, "/").replace(/[^A-Z0-9/]/g, "");
}

/**
 * Compare two spec values (CT ratio / breaker size). Missing or sentinel values on either
 * side yield "na" — never "match" (two blanks are not evidence) and never "mismatch"
 * (a blank is not a discrepancy worth sending someone to site over).
 */
export function compareValues(
  assetValue: string | null | undefined,
  inspectionValue: string | null | undefined,
): MatchStatus {
  if (isMissingValue(assetValue) || isMissingValue(inspectionValue)) return "na";

  return canonicalizeSpec(assetValue) === canonicalizeSpec(inspectionValue) ? "match" : "mismatch";
}

function readTenants(jsonData: unknown): InspectionTenant[] {
  if (!jsonData || typeof jsonData !== "object") return [];
  const tenants = (jsonData as { tenants?: unknown }).tenants;
  return Array.isArray(tenants) ? (tenants as InspectionTenant[]) : [];
}

function hasAnyImage(t: { meterImage?: string; ctRatioImage?: string; breakerImage?: string }): boolean {
  return !!(t.meterImage || t.ctRatioImage || t.breakerImage);
}

/**
 * Build a map of normalized meter serial -> inspection tenant data. When a serial appears
 * more than once, the first occurrence wins unless a later one carries images and the
 * incumbent has none.
 */
export function buildInspectionMeterMatches(
  inspections: InspectionRecord[],
  subsections: SubsectionNameRecord[],
): Map<string, InspectionTenantMatch> {
  const matches = new Map<string, InspectionTenantMatch>();

  inspections.forEach((inspection) => {
    const subsection = subsections.find((s) => s.id === inspection.subsection_id);

    readTenants(inspection.json_data).forEach((tenant) => {
      if (!tenant.meterSerialNumber) return;
      const normalizedSerial = normalizeMeterSerial(tenant.meterSerialNumber);
      if (!normalizedSerial || SENTINELS.has(normalizedSerial)) return;

      const existing = matches.get(normalizedSerial);
      const upgradeToImages = hasAnyImage(tenant) && existing != null && !hasAnyImage(existing);

      if (!existing || upgradeToImages) {
        matches.set(normalizedSerial, {
          inspectionId: inspection.id,
          inspectionTitle: inspection.title,
          subsectionId: inspection.subsection_id,
          subsectionName: subsection?.name,
          shopName: tenant.shopName,
          shopNumber: tenant.shopNumber,
          meterSerialNumber: tenant.meterSerialNumber,
          ctSizeAndRatio: tenant.ctSizeAndRatio,
          breakerSize: tenant.breakerSize,
          meterImage: tenant.meterImage,
          ctRatioImage: tenant.ctRatioImage,
          breakerImage: tenant.breakerImage,
        });
      }
    });
  });

  return matches;
}

/** Reconcile each asset against the inspection match map. Status is computed, never stored. */
export function buildComparisonResults(
  assets: AssetForComparison[],
  inspectionMeterMatches: Map<string, InspectionTenantMatch>,
): ComparisonResult[] {
  const lookup = (serial: string | null | undefined): InspectionTenantMatch | null => {
    const normalized = normalizeMeterSerial(serial);
    if (!normalized || SENTINELS.has(normalized)) return null;
    return inspectionMeterMatches.get(normalized) || null;
  };

  return assets.map((asset) => {
    // Current serial wins. Only when it finds nothing do we fall back to the serial the
    // register records for the meter this one replaced.
    const currentMatch = lookup(asset.meter_serial_number);
    const oldMatch = currentMatch ? null : lookup(asset.old_meter_serial_number);
    const inspectionMatch = currentMatch ?? oldMatch;

    const ctMatch = inspectionMatch ? compareValues(asset.ct_ratio, inspectionMatch.ctSizeAndRatio) : "na";
    const breakerMatch = inspectionMatch ? compareValues(asset.breaker_size, inspectionMatch.breakerSize) : "na";

    return {
      asset,
      inspectionMatch,
      verified: !!inspectionMatch,
      matchedOnOldSerial: !!oldMatch,
      ctMatch,
      breakerMatch,
      hasDiscrepancy: ctMatch === "mismatch" || breakerMatch === "mismatch",
    };
  });
}

/**
 * Transform raw worksheet rows into electrical assets. Water sections are intentionally
 * ignored — this feature is electrical-only. The component handles XLSX parsing/IO and
 * passes the row matrix here.
 */
export function parseAssetRows(rows: (string | number)[][]): ParsedAsset[] {
  const parsed: ParsedAsset[] = [];
  let currentSection: "electrical" | "water" | null = null;
  let columnMap: Record<string, number> = {};
  let hasHeader = false;

  const normalizeHeader = (header: string) => header.toLowerCase().replace(/[^a-z0-9]/g, "");

  for (const row of rows) {
    if (!row || row.length === 0) continue;

    const firstCell = String(row[0] || "").trim().toUpperCase();
    const secondCell = String(row[1] || "").trim().toUpperCase();

    if (firstCell === "ELECTRICAL" || secondCell === "ELECTRICAL") {
      currentSection = "electrical";
      columnMap = {};
      hasHeader = false;
      continue;
    }
    if (firstCell === "WATER" || secondCell === "WATER") {
      currentSection = "water";
      columnMap = {};
      hasHeader = false;
      continue;
    }

    const hasPremisesId = row.some((cell) => String(cell || "").toLowerCase().includes("premises id"));
    if (hasPremisesId) {
      columnMap = {};
      row.forEach((cell, idx) => {
        const normalized = normalizeHeader(String(cell || ""));
        if (normalized) columnMap[normalized] = idx;
      });
      hasHeader = true;
      continue;
    }

    // Electrical-only: skip every row until we are inside the ELECTRICAL section with a header.
    if (currentSection !== "electrical" || !hasHeader) continue;

    const premisesIdIdx = columnMap["premisesid"] ?? columnMap["premiseid"] ?? 1;
    const premisesId = String(row[premisesIdIdx] || "").trim();
    if (!premisesId || premisesId.toLowerCase().includes("premises")) continue;

    const getCol = (keys: string[]): string => {
      for (const key of keys) {
        if (columnMap[key] !== undefined) return String(row[columnMap[key]] || "").trim();
      }
      return "";
    };

    const meterSerial = getCol(["meterserialnumber", "meterserno", "serialnumber", "serial"]);
    if (!meterSerial) continue;

    parsed.push({
      premises_id: premisesId,
      trade_as: getCol(["tradeas", "trade", "tenant"]),
      meter_type: getCol(["directdcurrenttransformerct", "directcurrenttransformer", "type", "metertype"]),
      ct_ratio: getCol(["ctratio", "ratio"]),
      meter_serial_number: meterSerial,
      breaker_size: getCol(["breakersize", "breaker"]),
      reading_at_commissioning: getCol(["readingatcomissioningofnewmeter", "readingatcommissioning", "reading"]),
      old_meter_serial_number: getCol(["oldmeterserialnumber", "oldmeterserial", "oldserial"]),
      last_meter_read_old: getCol(["lastmeterreadofoldmeter", "lastmeterread"]),
      comments: getCol(["comments", "comment", "notes"]),
    });
  }

  return parsed;
}
