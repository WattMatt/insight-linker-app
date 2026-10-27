import { test } from "node:test";
import assert from "node:assert/strict";
import { canonical, isJune2026, makeTokenKit, planHash, sha256 } from "../src/core.mjs";

const site = "ade5256f-419e-4860-bfd4-2f38dc3cb21a";
const other = "66de070d-7e3b-4790-865b-f926b8e3a294";
const facts = { siteId: site, dataHash: sha256("data"), planHash: sha256("plan") };

test("canonical JSON ignores key order", () => {
  assert.equal(canonical({ b: 1, a: [{ y: 2, x: 1 }] }), canonical({ a: [{ x: 1, y: 2 }], b: 1 }));
});

test("June 2026 rule", () => {
  assert.equal(isJune2026("2026-06-23T10:00:00Z"), true);
  assert.equal(isJune2026("2026-06-30T23:59:59Z"), true);
  assert.equal(isJune2026("2026-07-01T00:00:00Z"), false);
  assert.equal(isJune2026("2025-06-15T00:00:00Z"), false);
  assert.equal(isJune2026(null), false);
});

test("plan hash does not depend on list order", () => {
  const a = { row: { record_key: "doc1" }, supersedes_ids: ["b", "a"] };
  const b = { row: { record_key: "doc2" }, supersedes_ids: [] };
  const p1 = { adds: [a, b], updates: [{ id: "2" }, { id: "1" }], superseded: ["y", "x"] };
  const p2 = { adds: [b, { ...a, supersedes_ids: ["a", "b"] }], updates: [{ id: "1" }, { id: "2" }], superseded: ["x", "y"] };
  assert.equal(planHash(p1), planHash(p2));
});

test("token accepted only for the same site, data and plan", () => {
  const kit = makeTokenKit("s3cret");
  const t = kit.issue(facts);
  assert.equal(kit.check(t, facts), null);
  assert.match(kit.check(t, { ...facts, siteId: other }), /different site/);
  assert.match(kit.check(t, { ...facts, dataHash: sha256("other data") }), /differs from the dry run/);
  assert.match(kit.check(t, { ...facts, planHash: sha256("other plan") }), /changed since the dry run/);
});

test("token rejected when expired, tampered, malformed or from another process", () => {
  const kit = makeTokenKit("s3cret", 1000);
  const t = kit.issue(facts, 0);
  assert.match(kit.check(t, facts, 5000), /expired/);
  const [body, sig] = kit.issue(facts).split(".");
  const forged = Buffer.from(JSON.stringify({ s: other, d: facts.dataHash, p: facts.planHash, e: Date.now() + 1e6 })).toString("base64url");
  assert.match(kit.check(`${forged}.${sig}`, { ...facts, siteId: other }), /signature invalid/);
  assert.match(kit.check("nonsense", facts), /malformed/);
  assert.match(kit.check(undefined, facts), /malformed/);
  assert.match(makeTokenKit("different").check(`${body}.${sig}`, facts), /signature invalid/);
});
