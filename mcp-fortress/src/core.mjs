// Pure helpers for mcp-fortress: hashing, the dry-run confirm token, the June 2026 rule and the
// diff summary. No I/O, so everything here is unit-tested (test/core.test.mjs).
import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export const sha256 = s => createHash("sha256").update(s).digest("hex");

/** JSON with object keys sorted, so the same data always hashes the same. */
export function canonical(v) {
  if (Array.isArray(v)) return `[${v.map(canonical).join(",")}]`;
  if (v && typeof v === "object") {
    return `{${Object.keys(v).sort().filter(k => v[k] !== undefined).map(k => `${JSON.stringify(k)}:${canonical(v[k])}`).join(",")}}`;
  }
  return JSON.stringify(v);
}

/** June 2026 import batches are protected: their rows are read-only for this server. */
export function isJune2026(ts) {
  if (!ts) return false;
  const d = new Date(ts);
  return d.getUTCFullYear() === 2026 && d.getUTCMonth() === 5;
}

/** What a write would do: the parts of a planner SitePlan that change rows, in stable order. */
export function planWrites(plan) {
  return {
    adds: plan.adds.map(a => ({ ...a, supersedes_ids: [...a.supersedes_ids].sort() })).sort((x, y) => x.row.record_key.localeCompare(y.row.record_key)),
    updates: [...plan.updates].sort((x, y) => x.id.localeCompare(y.id)),
    superseded: [...plan.superseded].sort(),
  };
}

export const planHash = plan => sha256(canonical(planWrites(plan)));

/** Diff counts and short id lists for the dry-run response. */
export function summarize(plan, juneIds) {
  const linkedJune = new Set(plan.adds.flatMap(a => a.supersedes_ids).filter(id => juneIds.has(id)));
  const keys = xs => xs.slice(0, 25);
  return {
    counts: {
      source_records: plan.records, scored: plan.scored, pass: plan.pass, fail: plan.fail, review: plan.review,
      not_scored: plan.notScored, adds: plan.adds.length, updates: plan.updates.length,
      restores: plan.updates.filter(u => u.restores).length, unchanged: plan.unchanged,
      superseded_now: plan.superseded.length, blocked: plan.blocked.length,
      legacy_linked_for_signoff: plan.legacyLinked, legacy_left_live: plan.legacyUnlinked,
      june_2026_rows_linked_for_signoff: linkedJune.size,
    },
    adds: keys(plan.adds.map(a => `${a.row.record_key} ${a.row.cert_no ?? "(no cert no)"} → ${a.row.proposed_verdict}`)),
    updates: keys(plan.updates.map(u => `${u.row.record_key} (${u.id})${u.restores ? " restored" : ""} → ${u.row.proposed_verdict}`)),
    superseded_now: keys(plan.superseded),
    blocked: plan.blocked,
    listed_max: 25,
  };
}

/**
 * Confirm token: binds site, the exact submitted data and the exact plan (which also captures the
 * site's rows at dry-run time). HMAC-signed with a per-process secret unless one is configured, so
 * a restart invalidates outstanding tokens. Single use is enforced by the caller.
 */
export function makeTokenKit(secret = process.env.FORTRESS_MCP_TOKEN_SECRET || randomBytes(32).toString("hex"), ttlMs = 15 * 60_000) {
  const sign = body => createHmac("sha256", secret).update(body).digest("base64url");
  return {
    issue({ siteId, dataHash, planHash: ph }, now = Date.now()) {
      const body = Buffer.from(JSON.stringify({ s: siteId, d: dataHash, p: ph, e: now + ttlMs })).toString("base64url");
      return `${body}.${sign(body)}`;
    },
    /** Returns null when valid, otherwise the reason it is refused. */
    check(token, { siteId, dataHash, planHash: ph }, now = Date.now()) {
      const [body, sig] = String(token ?? "").split(".");
      if (!body || !sig) return "malformed token";
      const want = Buffer.from(sign(body));
      const got = Buffer.from(sig);
      if (want.length !== got.length || !timingSafeEqual(want, got)) return "token signature invalid (or issued by an earlier server process)";
      let t;
      try { t = JSON.parse(Buffer.from(body, "base64url").toString("utf8")); } catch { return "malformed token"; }
      if (t.e < now) return "token expired — run the dry run again";
      if (t.s !== siteId) return "token was issued for a different site";
      if (t.d !== dataHash) return "submitted JSON differs from the dry run";
      if (t.p !== ph) return "the site's COC rows changed since the dry run — run it again";
      return null;
    },
  };
}

export const slug = s => String(s).replace(/[^A-Za-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 60);
