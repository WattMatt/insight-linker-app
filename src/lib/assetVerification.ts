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
  /** The tenant row's own id inside json_data.tenants — the stable handle for edits. */
  tenantId?: string;
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

/**
 * A shop (subsection) as recorded on site. At line-shop sites the subsection IS the shop:
 * its name usually carries the shop number ("SHOP G01-G06") and it holds the meter serial
 * captured on site. `shop_number`, when set, overrides whatever the name implies.
 */
export interface SiteShop {
  id: string;
  name: string;
  tenant_name?: string | null;
  meter_serial_number?: string | null;
  shop_number?: string | null;
}

/**
 * How the register row was tied to what is on site:
 *   shop       — same shop number (subsection or board meter row); the site serial is the truth
 *   serial     — no shop link; the register serial was found on a board meter row
 *   old_serial — only the register's PREVIOUS serial was found
 */
export type LinkedBy = "shop" | "serial" | "old_serial";

export type VerificationStatus = "verified" | "mismatch" | "wrong_meter" | "prev_meter" | "unverified";

export interface ComparisonResult {
  asset: AssetForComparison;
  /** The board meter row used as evidence (CT, breaker, photos). */
  inspectionMatch: InspectionTenantMatch | null;
  /** The site shop this register row is linked to (or, on a serial link, the shop holding that serial). */
  siteShop: SiteShop | null;
  linkedBy: LinkedBy | null;
  /** The meter serial found on site for this premises — the truth the register is checked against. */
  siteSerial: string | null;
  serialMatch: MatchStatus;
  /**
   * Set when the register serial was found on site but on ANOTHER premises' meter. The row is
   * then a discrepancy, never "verified", and CT/breaker are not compared (they belong to a
   * different meter). `label` names where the meter really is, e.g. "OX - G01-G06".
   */
  belongsTo: { premisesId: string; label: string } | null;
  status: VerificationStatus;
  verified: boolean;
  /**
   * True when the only inspection found was filed under the asset's PREVIOUS serial.
   * The evidence is real but it documents the meter that was replaced, not the one now
   * installed — surfaced separately so "Verified" never silently means "verified the old meter".
   */
  matchedOnOldSerial: boolean;
  /**
   * True for the second and later copies of the same register row (same premises, same serial)
   * — left behind by a re-import whose cleanup failed. Copies share the first one's link.
   */
  duplicateRow: boolean;
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
 * The key two serials are joined on. Field staff annotate the serial box ("35727818 METER OFF",
 * "34445064 TO BE REPLACED"), so when a serial contains a run of 6+ digits that run IS the
 * serial. Otherwise it falls back to the normalized form. Sentinels and blanks give "".
 */
export function meterKey(serial: string | null | undefined): string {
  const normalized = normalizeMeterSerial(serial);
  if (!normalized || SENTINELS.has(normalized)) return "";
  // A value with no digits at all ("COMMON AREA", "METER NOT MARKED NEW SHOP") is a note,
  // not a serial — it must never link two records or be written into the register.
  if (!/\d/.test(normalized)) return "";
  const digits = (serial || "").match(/\d{6,}/);
  return digits ? digits[0] : normalized;
}

// "G01-G06", "G13A - G15", "G16 & G17", "GF 07", "N103-104", "SH1001": one or more shop
// numbers (0–3 letters, digits, optional letter suffix) joined by - & / or ,
const SHOP_NUMBER_SHAPE = /^[A-Z]{0,3}\s?\d+[A-Z]?(\s*[-&/,]\s*[A-Z]{0,3}\s?\d+[A-Z]?)*$/;

const stripShopWord = (s: string) => s.replace(/^SHOP\b\.?\s*/, "");
const compact = (s: string) => s.replace(/[^A-Z0-9]/g, "");

/**
 * Comparable shop number for a register premises id: drops the site prefix ("OX - G01-G06"
 * → "G01G06") and any "SHOP" word, keeping alphanumerics only.
 */
export function premisesShopCode(premisesId: string | null | undefined): string {
  const s = (premisesId || "").toUpperCase().trim().replace(/^[A-Z]{1,4}\s+-\s+/, "");
  return compact(stripShopWord(s));
}

/** Comparable form of a shop number typed by a person ("Shop G01 - G06" → "G01G06"). */
export function shopNumberCode(shopNumber: string | null | undefined): string {
  return compact(stripShopWord((shopNumber || "").toUpperCase().trim()));
}

/**
 * The shop number a subsection stands for. An explicit `shop_number` always wins. Otherwise
 * it is read from the name, but only when the name IS a shop number ("SHOP G01-G06", "N201",
 * "Shop S101") — never from descriptive names like "Main DB F1 1st Floor North".
 */
export function siteShopCode(shop: Pick<SiteShop, "name" | "shop_number">): string {
  if (shop.shop_number && shop.shop_number.trim()) return shopNumberCode(shop.shop_number);
  const rest = stripShopWord((shop.name || "").toUpperCase().trim());
  return SHOP_NUMBER_SHAPE.test(rest) ? compact(rest) : "";
}

/** Display form of a site shop: "SHOP G01-G06 · TURN 'N TENDER". */
export function siteShopLabel(shop: SiteShop): string {
  const number = shop.shop_number?.trim();
  const name = shop.name.trim();
  const head = number && shopNumberCode(number) !== shopNumberCode(name) ? `${number} · ${name}` : name;
  return shop.tenant_name?.trim() ? `${head} · ${shop.tenant_name.trim()}` : head;
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

  // Breaking capacity ("150 A 25kA") is not part of the rating; "200/5" and "200/5A" are one ratio.
  let a = canonicalizeSpec(assetValue).replace(BREAKING_CAPACITY, "").replace(RATIO_AMPS, "");
  let b = canonicalizeSpec(inspectionValue).replace(BREAKING_CAPACITY, "").replace(RATIO_AMPS, "");
  // "40A" vs "40A DP": the field records the pole count, the register rarely does. A pole
  // count only one side states is not a discrepancy; two different pole counts still are.
  const aPole = a.match(POLE_SUFFIX);
  const bPole = b.match(POLE_SUFFIX);
  if (!aPole !== !bPole) {
    a = a.replace(POLE_SUFFIX, "");
    b = b.replace(POLE_SUFFIX, "");
  }
  return a === b ? "match" : "mismatch";
}

// Trailing pole designation on a breaker size: SP/DP/TP/FP or 1P–4P ("63A DP", "100A TP").
const POLE_SUFFIX = /(?<=A)(SP|DP|TP|FP|[1-4]P)$/;
const RATIO_AMPS = /(?<=\d\/\d+)A$/;
const BREAKING_CAPACITY = /(?<=A|P)\d+(\.\d+)?KA$/;

/**
 * The form a site value is written into the register in, or null when the site value is not a
 * single clean rating ("80A TBC not marked", "160 A - Refrigeration, 250 A - Main Switch") and
 * needs a person to read it. Breaker: "63 A 3kA" → "63A", "63A 3P" keeps its pole count.
 * CT: "300:5" → "300/5A".
 */
export function registerSpecValue(field: "ct_ratio" | "breaker_size", value: string | null | undefined): string | null {
  const v = (value || "").trim();
  if (field === "breaker_size") {
    const m = v.match(/^(\d+(?:\.\d+)?)\s*A\s*(SP|DP|TP|FP|[1-4]P)?\s*(?:\d+(?:\.\d+)?\s*kA)?$/i);
    return m ? `${m[1]}A${m[2] ? ` ${m[2].toUpperCase()}` : ""}` : null;
  }
  const m = v.match(/^(\d+)\s*[/:]\s*(\d+)\s*A?$/i);
  return m ? `${m[1]}/${m[2]}A` : null;
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
 * Every board meter row on the site that carries a usable serial, in inspection order. The
 * tenant row id is kept so an edit targets that row, not "whichever row has this serial".
 */
export function buildInspectionMeterRows(
  inspections: InspectionRecord[],
  subsections: SubsectionNameRecord[],
): InspectionTenantMatch[] {
  const rows: InspectionTenantMatch[] = [];

  inspections.forEach((inspection) => {
    const subsection = subsections.find((s) => s.id === inspection.subsection_id);

    readTenants(inspection.json_data).forEach((tenant) => {
      if (!meterKey(tenant.meterSerialNumber)) return;
      rows.push({
        inspectionId: inspection.id,
        inspectionTitle: inspection.title,
        tenantId: tenant.id,
        subsectionId: inspection.subsection_id,
        subsectionName: subsection?.name,
        shopName: tenant.shopName,
        shopNumber: tenant.shopNumber,
        meterSerialNumber: tenant.meterSerialNumber as string,
        ctSizeAndRatio: tenant.ctSizeAndRatio,
        breakerSize: tenant.breakerSize,
        meterImage: tenant.meterImage,
        ctRatioImage: tenant.ctRatioImage,
        breakerImage: tenant.breakerImage,
      });
    });
  });

  return rows;
}

/**
 * Build a map of meter key -> board meter row. When a serial appears more than once, the
 * first occurrence wins unless a later one carries images and the incumbent has none.
 */
export function buildInspectionMeterMatches(
  inspections: InspectionRecord[],
  subsections: SubsectionNameRecord[],
): Map<string, InspectionTenantMatch> {
  const matches = new Map<string, InspectionTenantMatch>();
  for (const row of buildInspectionMeterRows(inspections, subsections)) {
    const key = meterKey(row.meterSerialNumber);
    const existing = matches.get(key);
    if (!existing || (hasAnyImage(row) && !hasAnyImage(existing))) matches.set(key, row);
  }
  return matches;
}

/**
 * Heading for a meter row in the inspection report: "G01-G06 – TurnTender" (shop number, then
 * name, as a shop is known on site: "Shop 1 – Shoprite"). When the shop number box only repeats
 * the name — common in field data ("Turn Tender") — the name is printed once.
 */
export function meterRowHeading(shopNumber: string | null | undefined, shopName: string | null | undefined): string {
  const number = (shopNumber || "").trim();
  const name = (shopName || "").trim();
  if (!number) return name;
  if (!name || shopNumberCode(number) === shopNumberCode(name)) return name || number;
  return `${number} – ${name}`;
}

/** Display form of a board meter row: "Main DB C · G01-G06 · TurnTender". */
export function meterRowLabel(row: InspectionTenantMatch): string {
  const parts = [row.subsectionName?.trim(), row.shopNumber?.trim(), row.shopName?.trim()].filter(Boolean) as string[];
  // Field staff often type the shop name into the shop number box; don't print it twice.
  const deduped = parts.filter((p, i) => i === 0 || shopNumberCode(p) !== shopNumberCode(parts[i - 1]));
  return deduped.join(" · ") || "Inspection";
}

// Something on site that states a shop number: a subsection, or a board meter row whose
// shop number box holds a real number (it often holds the shop NAME, which cannot link).
interface IdentityCandidate {
  code: string;
  key: string;
  shop: SiteShop | null;
  row: InspectionTenantMatch | null;
  label: string;
}

/**
 * Reconcile each register row against what was found on site. Status is computed, never stored.
 *
 * The site is the truth. Serial-only matching (the original design) trusted the REGISTER's
 * serial to say which meter a premises has, so a register with swapped serials matched every
 * premises to its neighbour's meter — at 204 Oxford the register row for Turn 'n Tender showed
 * "Verified" against the meter row for DB F3A. So:
 *
 *   1. Shop link. A register row is tied to the site shop with the same shop number (a
 *      subsection, else a board meter row whose shop number is a real number). Rows whose
 *      serial also agrees are paired first, so duplicate shop numbers resolve by serial;
 *      a lone remaining pair links even when the serials differ — that is the point: the
 *      register serial is then reported as wrong.
 *   2. Serial fallback, for register rows with no shop link. A serial that the site places
 *      on ANOTHER premises is a "wrong meter", never a verification, and its CT/breaker are
 *      not compared (they belong to the other meter).
 *   3. Previous-serial fallback, kept separate as before.
 */
export function buildComparisonResults(
  assets: AssetForComparison[],
  inspectionMeterMatches: Map<string, InspectionTenantMatch>,
  siteShops: SiteShop[] = [],
): ComparisonResult[] {
  const candidates: IdentityCandidate[] = [
    ...siteShops.map((shop) => ({
      code: siteShopCode(shop),
      key: meterKey(shop.meter_serial_number),
      shop,
      row: null,
      label: siteShopLabel(shop),
    })),
    ...[...inspectionMeterMatches.values()].map((row) => ({
      code: /\d/.test(row.shopNumber || "") ? shopNumberCode(row.shopNumber) : "",
      key: meterKey(row.meterSerialNumber),
      shop: null,
      row,
      label: meterRowLabel(row),
    })),
  ].filter((c) => c.code);

  const shopByKey = new Map<string, SiteShop>();
  for (const shop of siteShops) {
    const key = meterKey(shop.meter_serial_number);
    if (key && !shopByKey.has(key)) shopByKey.set(key, shop);
  }

  const codeOf = new Map(assets.map((a) => [a.id, premisesShopCode(a.premises_id)]));
  const linked = new Map<string, IdentityCandidate>();
  const taken = new Set<IdentityCandidate>();
  const take = (assetId: string, c: IdentityCandidate) => {
    linked.set(assetId, c);
    // The same meter is often recorded twice (its subsection and its board row); one link claims both.
    for (const other of candidates) if (other === c || (c.key && other.key === c.key)) taken.add(other);
  };
  const freeFor = (a: AssetForComparison) => {
    const code = codeOf.get(a.id);
    return code ? candidates.filter((c) => c.code === code && !taken.has(c)) : [];
  };

  // 1a. Shop number AND serial (current or previous) agree.
  for (const a of assets) {
    const keys = [meterKey(a.meter_serial_number), meterKey(a.old_meter_serial_number)].filter(Boolean);
    const hit = freeFor(a).find((c) => c.key && keys.includes(c.key));
    if (hit) take(a.id, hit);
  }
  // 1b. Shop number agrees, serial does not — only when unambiguous on both sides.
  for (const a of assets) {
    if (linked.has(a.id)) continue;
    const code = codeOf.get(a.id);
    if (!code) continue;
    // Rivals are distinct meters: identical copies of this row (a double import) are not rivals.
    const same = (b: AssetForComparison) =>
      (b.premises_id || "").trim().toUpperCase() === (a.premises_id || "").trim().toUpperCase() &&
      meterKey(b.meter_serial_number) === meterKey(a.meter_serial_number);
    const rivals = assets.filter((b) => !linked.has(b.id) && codeOf.get(b.id) === code && !(b !== a && same(b)));
    if (rivals.length !== 1) continue;
    const free = freeFor(a);
    const shops = free.filter((c) => c.shop);
    const pick = shops.length === 1 ? shops[0] : shops.length === 0 && free.length === 1 ? free[0] : null;
    if (pick) take(a.id, pick);
  }

  // Duplicate register rows (same premises, same serial — a re-import whose cleanup failed) are
  // one meter: every copy shares the first copy's link, so none is reported as "wrong meter"
  // against itself and a correction reaches all of them.
  const twinKey = (a: AssetForComparison) => {
    const key = meterKey(a.meter_serial_number);
    return key ? `${(a.premises_id || "").trim().toUpperCase()}|${key}` : "";
  };
  const firstOfTwin = new Map<string, AssetForComparison>();
  const duplicates = new Set<string>();
  for (const a of assets) {
    const k = twinKey(a);
    if (!k) continue;
    const first = firstOfTwin.get(k);
    if (!first) {
      firstOfTwin.set(k, a);
      continue;
    }
    duplicates.add(a.id);
    const link = linked.get(first.id) ?? linked.get(a.id);
    if (link) {
      linked.set(first.id, link);
      linked.set(a.id, link);
    }
  }

  // Which premises the site says each linked meter belongs to.
  const owners = new Map<string, { assetId: string; premisesId: string; label: string }>();
  for (const a of assets) {
    const c = linked.get(a.id);
    if (c?.key && !owners.has(c.key)) owners.set(c.key, { assetId: a.id, premisesId: a.premises_id, label: c.label });
  }

  const compareSpecs = (asset: AssetForComparison, row: InspectionTenantMatch | null) => ({
    ctMatch: row ? compareValues(asset.ct_ratio, row.ctSizeAndRatio) : ("na" as MatchStatus),
    breakerMatch: row ? compareValues(asset.breaker_size, row.breakerSize) : ("na" as MatchStatus),
  });

  const result = (
    asset: AssetForComparison,
    fields: Omit<ComparisonResult, "asset" | "status" | "verified" | "hasDiscrepancy" | "duplicateRow">,
  ): ComparisonResult => {
    const hasDiscrepancy =
      !!fields.belongsTo ||
      fields.serialMatch === "mismatch" ||
      fields.ctMatch === "mismatch" ||
      fields.breakerMatch === "mismatch";
    const found = !!(fields.inspectionMatch || fields.siteShop);
    const status: VerificationStatus = !found
      ? "unverified"
      : fields.belongsTo
        ? "wrong_meter"
        : fields.matchedOnOldSerial
          ? "prev_meter"
          : hasDiscrepancy
            ? "mismatch"
            : "verified";
    return { asset, ...fields, status, verified: found, hasDiscrepancy, duplicateRow: duplicates.has(asset.id) };
  };

  return assets.map((asset) => {
    const currentKey = meterKey(asset.meter_serial_number);
    const oldKey = meterKey(asset.old_meter_serial_number);
    const ownedByOther = (key: string) => {
      const owner = key ? owners.get(key) : undefined;
      const samePremises = owner && owner.premisesId.trim().toUpperCase() === (asset.premises_id || "").trim().toUpperCase();
      return owner && owner.assetId !== asset.id && !samePremises ? owner : undefined;
    };

    // 1. Shop link: the site serial is the truth.
    const link = linked.get(asset.id);
    if (link) {
      let siteKey = link.key;
      let siteSerial = (link.shop ? link.shop.meter_serial_number : link.row?.meterSerialNumber) ?? null;
      let row = link.row ?? (siteKey ? inspectionMeterMatches.get(siteKey) ?? null : null);
      // The shop was found but no usable serial was recorded on it ("METER NOT MARKED"):
      // use the register serial's meter row, unless the site puts that meter elsewhere.
      if (!siteKey && currentKey && !ownedByOther(currentKey)) {
        row = inspectionMeterMatches.get(currentKey) ?? null;
        if (row) {
          siteKey = currentKey;
          siteSerial = row.meterSerialNumber;
        }
      }
      const matchedOnOldSerial = !!siteKey && siteKey !== currentKey && siteKey === oldKey;
      return result(asset, {
        inspectionMatch: row,
        siteShop: link.shop ?? (siteKey ? shopByKey.get(siteKey) ?? null : null),
        linkedBy: "shop",
        siteSerial: siteKey ? siteSerial : null,
        serialMatch: !siteKey || !currentKey ? "na" : siteKey === currentKey || matchedOnOldSerial ? "match" : "mismatch",
        belongsTo: null,
        matchedOnOldSerial,
        ...compareSpecs(asset, row),
      });
    }

    // 2. Serial fallback — unless the site says this meter is another premises'.
    const owner = ownedByOther(currentKey);
    if (owner) {
      return result(asset, {
        inspectionMatch: inspectionMeterMatches.get(currentKey) ?? null,
        siteShop: shopByKey.get(currentKey) ?? null,
        linkedBy: "serial",
        siteSerial: null,
        serialMatch: "na",
        belongsTo: { premisesId: owner.premisesId, label: owner.label },
        matchedOnOldSerial: false,
        ctMatch: "na",
        breakerMatch: "na",
      });
    }
    const currentRow = currentKey ? inspectionMeterMatches.get(currentKey) ?? null : null;
    const currentShop = currentKey ? shopByKey.get(currentKey) ?? null : null;
    if (currentRow || currentShop) {
      return result(asset, {
        inspectionMatch: currentRow,
        siteShop: currentShop,
        linkedBy: "serial",
        siteSerial: currentRow?.meterSerialNumber ?? currentShop?.meter_serial_number ?? null,
        serialMatch: "match",
        belongsTo: null,
        matchedOnOldSerial: false,
        ...compareSpecs(asset, currentRow),
      });
    }

    // 3. Previous serial: evidence about the meter this one replaced.
    const oldRow = oldKey && !ownedByOther(oldKey) ? inspectionMeterMatches.get(oldKey) ?? null : null;
    return result(asset, {
      inspectionMatch: oldRow,
      siteShop: null,
      linkedBy: oldRow ? "old_serial" : null,
      siteSerial: oldRow?.meterSerialNumber ?? null,
      serialMatch: "na",
      belongsTo: null,
      matchedOnOldSerial: !!oldRow,
      ...compareSpecs(asset, oldRow),
    });
  });
}

export interface VerificationStats {
  total: number;
  /** Anything found on site for the row (includes mismatches, wrong meters, previous meters). */
  verified: number;
  verifiedNoDiscrepancy: number;
  /** Rows with at least one discrepancy (value or serial mismatch, or wrong meter). */
  discrepancies: number;
  wrongMeter: number;
  serialMismatches: number;
  previousMeter: number;
  unverified: number;
  withImages: number;
  /** Extra copies of register rows (same premises and serial imported twice). */
  duplicateRows: number;
}

/** The one definition of every headline count, shared by the tab, the table and the PDF. */
export function summarizeResults(results: ComparisonResult[]): VerificationStats {
  const count = (pred: (r: ComparisonResult) => boolean) => results.filter(pred).length;
  return {
    total: results.length,
    verified: count((r) => r.verified),
    verifiedNoDiscrepancy: count((r) => r.status === "verified"),
    discrepancies: count((r) => r.status === "mismatch" || r.status === "wrong_meter"),
    wrongMeter: count((r) => r.status === "wrong_meter"),
    serialMismatches: count((r) => r.serialMatch === "mismatch"),
    previousMeter: count((r) => r.status === "prev_meter"),
    unverified: count((r) => r.status === "unverified"),
    withImages: count((r) => !!r.inspectionMatch && hasAnyImage(r.inspectionMatch) && r.status !== "wrong_meter"),
    duplicateRows: count((r) => r.duplicateRow),
  };
}

/**
 * Board meter rows that no register row accounts for — meters on site that are missing from
 * the register (or registered under a mistyped serial). One entry per meter.
 */
export function findUnregisteredMeters(
  meterRows: InspectionTenantMatch[],
  results: ComparisonResult[],
): InspectionTenantMatch[] {
  // A meter counts as registered only when a register row is actually tied to it. A register
  // row that merely quotes its serial against the wrong premises does not account for it.
  const accounted = new Set<string>();
  for (const r of results) {
    if (r.status === "wrong_meter") continue;
    for (const s of [r.siteSerial, r.inspectionMatch?.meterSerialNumber]) {
      const key = meterKey(s);
      if (key) accounted.add(key);
    }
  }
  const seen = new Set<string>();
  return meterRows.filter((row) => {
    const key = meterKey(row.meterSerialNumber);
    if (!key || accounted.has(key) || seen.has(key)) return false;
    seen.add(key);
    return true;
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

/**
 * The register fields that differ from what was found on site, as the values to write — the
 * "Use site values" action and the bulk correction share this one definition. Nothing is
 * proposed for a wrong meter or a previous-meter match. A serial is only written when the site
 * holds a real one (a 6+ digit run), and annotations are dropped ("35727818 METER OFF" →
 * "35727818").
 */
export function siteCorrections(result: ComparisonResult): Record<string, string> {
  const out: Record<string, string> = {};
  if (result.status === "wrong_meter" || result.matchedOnOldSerial) return out;
  const siteDigits = (result.siteSerial || "").match(/\d{6,}/);
  if (result.serialMatch === "mismatch" && siteDigits) out.meter_serial_number = siteDigits[0];
  const row = result.inspectionMatch;
  if (!row) return out;
  const hasValue = (v: string | null | undefined) => compareValues("x", v) !== "na";
  const ct = registerSpecValue("ct_ratio", row.ctSizeAndRatio);
  if (ct && (result.ctMatch === "mismatch" || !hasValue(result.asset.ct_ratio))) out.ct_ratio = ct;
  const breaker = registerSpecValue("breaker_size", row.breakerSize);
  if (breaker && (result.breakerMatch === "mismatch" || !hasValue(result.asset.breaker_size))) out.breaker_size = breaker;
  return out;
}
