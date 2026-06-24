# Reliable Bulk COC Ingestion & Assignment — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make ingesting hundreds of COC PDFs per site reliable and order-independent — classify every pooled file with a reason, auto-assign on a re-trigger glue, bulk-upload with progress/outcomes/retry, and clear stragglers fast in a guided Bulk Assign workspace.

**Architecture:** Two pure cores carry the logic and are TDD'd — `assignmentEngine.ts` (classify every file into assigned / ambiguous_cert / cert_has_no_subsection / cert_not_found / no_cert_detected) and `rankCandidates.ts` (confidence-ranked subsection suggestions). The assign write-path is extracted into reusable libs (`assignPoolFile.ts`, `reassignPool.ts`) so both the upload hook and the re-trigger glue share one path. UI: a bulk-aware load card + a new "Assign" sub-tab.

**Tech Stack:** Next.js · React · TanStack Query · Supabase · shadcn/ui · Vitest.

**Baseline:** 437 tests across 66 files green. Co-located `*.test.ts`. Run one file: `npx vitest run <file>`. Full: `npm test`.

---

## File structure

- **New (pure, tested):** `src/lib/siteCoc/assignmentEngine.ts`, `src/lib/siteCoc/rankCandidates.ts`, `src/lib/siteCoc/uploadQueue.ts` (+ `.test.ts` each)
- **New (libs):** `src/lib/coc/assignPoolFile.ts` (extracted assign + stampCert), `src/lib/coc/reassignPool.ts` (the glue)
- **New (UI):** `src/views/site-coc/AssignSubTab.tsx`
- **New (migration):** `supabase/migrations/<ts>_coc_pool_reasons.sql`
- **Modify:** `src/lib/siteCoc/poolAssign.ts` (delegate to engine), `src/views/site-coc/useSiteCocPool.ts` (bulk + reasons + delegate), `src/views/site-coc/useSiteCoc.ts` (manual status + glue), `src/lib/siteCoc/reimport.ts` (protect manual), `src/views/site-coc/useSiteCocImport.ts` (diff-confirm + glue), `src/views/site-coc/SiteCocTab.tsx` (Assign tab + orchestrate glue), `src/views/site-coc/SiteCocLoadCard.tsx` (bulk progress/outcome/retry)

---

### Task 1: Migration — pool reasons

**Files:**
- Create: `supabase/migrations/<ts>_coc_pool_reasons.sql` (use `date +%Y%m%d%H%M%S` for `<ts>`, e.g. `20260624120000`)

- [ ] **Step 1: Write the migration**

```sql
-- Persist the assignment classification on each pooled COC file so the Bulk Assign
-- workspace and the upload report can show WHY a file is unassigned.
alter table public.coc_file_pool add column if not exists reason text;
alter table public.coc_file_pool add column if not exists candidate_ids jsonb not null default '[]'::jsonb;

notify pgrst, 'reload schema';
```

- [ ] **Step 2: Commit**

```bash
git add supabase/migrations/*_coc_pool_reasons.sql
git commit -m "feat(coc): add reason + candidate_ids to coc_file_pool"
```

(Applied to prod at deploy time via the Supabase SQL editor — project `oltzgidkjxwsukvkomof` — not `db push`.)

---

### Task 2: Assignment engine (pure) + tests

**Files:**
- Create: `src/lib/siteCoc/assignmentEngine.ts`
- Test: `src/lib/siteCoc/assignmentEngine.test.ts`
- Modify: `src/lib/siteCoc/poolAssign.ts` (delegate)

- [ ] **Step 1: Write the failing test**

Create `src/lib/siteCoc/assignmentEngine.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { planPoolAssignment } from "./assignmentEngine";

const certs = [
  { id: "c1", cert_no_norm: "B1612744", subsection_id: "u1" },
  { id: "c2", cert_no_norm: "B1612747", subsection_id: "u2" },
  { id: "c3", cert_no_norm: "DUP", subsection_id: "u3" },
  { id: "c4", cert_no_norm: "DUP", subsection_id: "u4" },     // ambiguous (two subsections)
  { id: "c5", cert_no_norm: "NOSUB", subsection_id: null },   // matched cert, no subsection
  { id: "c6", cert_no_norm: "SAME", subsection_id: "u9" },
  { id: "c7", cert_no_norm: "SAME", subsection_id: "u9" },    // duplicate, SAME subsection
];

describe("planPoolAssignment", () => {
  it("assigns an exact unique cert that has a subsection", () => {
    const r = planPoolAssignment([{ id: "p1", detected_cert_no: "B-1612744", detected_kind: "coc" }], certs);
    expect(r).toEqual([{ poolId: "p1", outcome: "assigned", certId: "c1", subsectionId: "u1" }]);
  });

  it("flags no_cert_detected when the filename had no cert token", () => {
    const r = planPoolAssignment([{ id: "p2", detected_cert_no: null, detected_kind: "coc" }], certs);
    expect(r[0]).toEqual({ poolId: "p2", outcome: "no_cert_detected" });
  });

  it("flags cert_not_found when the number is not in the register", () => {
    const r = planPoolAssignment([{ id: "p3", detected_cert_no: "Z-9", detected_kind: "coc" }], certs);
    expect(r[0]).toEqual({ poolId: "p3", outcome: "cert_not_found" });
  });

  it("flags cert_has_no_subsection when the only match has no subsection", () => {
    const r = planPoolAssignment([{ id: "p4", detected_cert_no: "NOSUB", detected_kind: "coc" }], certs);
    expect(r[0]).toEqual({ poolId: "p4", outcome: "cert_has_no_subsection", certId: "c5" });
  });

  it("flags ambiguous_cert with candidate ids when the number spans two subsections", () => {
    const r = planPoolAssignment([{ id: "p5", detected_cert_no: "DUP", detected_kind: "coc" }], certs);
    expect(r[0]).toEqual({
      poolId: "p5",
      outcome: "ambiguous_cert",
      candidateCertIds: ["c3", "c4"],
      candidateSubsectionIds: ["u3", "u4"],
    });
  });

  it("assigns duplicates that all point to the SAME subsection", () => {
    const r = planPoolAssignment([{ id: "p6", detected_cert_no: "SAME", detected_kind: "coc" }], certs);
    expect(r[0]).toEqual({ poolId: "p6", outcome: "assigned", certId: "c6", subsectionId: "u9" });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/siteCoc/assignmentEngine.test.ts`
Expected: FAIL — cannot resolve `./assignmentEngine`.

- [ ] **Step 3: Write the engine**

Create `src/lib/siteCoc/assignmentEngine.ts`:

```ts
import { normCert } from "./normalize";

export interface PoolFileLite { id: string; detected_cert_no: string | null; detected_kind: string | null; }
export interface CertRowLite { id: string; cert_no_norm: string; subsection_id: string | null; }

export type AssignOutcome =
  | "assigned"
  | "ambiguous_cert"
  | "cert_has_no_subsection"
  | "cert_not_found"
  | "no_cert_detected";

export interface PoolClassification {
  poolId: string;
  outcome: AssignOutcome;
  certId?: string;
  subsectionId?: string;
  candidateCertIds?: string[];
  candidateSubsectionIds?: string[];
}

/** Classify every pooled file by how its detected cert number maps to the site's register certs. */
export function planPoolAssignment(files: PoolFileLite[], certs: CertRowLite[]): PoolClassification[] {
  return files.map((f): PoolClassification => {
    const key = f.detected_cert_no ? normCert(f.detected_cert_no) : "";
    if (!key) return { poolId: f.id, outcome: "no_cert_detected" };

    const matches = certs.filter((c) => c.cert_no_norm === key);
    if (matches.length === 0) return { poolId: f.id, outcome: "cert_not_found" };

    if (matches.length === 1) {
      const only = matches[0];
      return only.subsection_id
        ? { poolId: f.id, outcome: "assigned", certId: only.id, subsectionId: only.subsection_id }
        : { poolId: f.id, outcome: "cert_has_no_subsection", certId: only.id };
    }

    // >1 match: unambiguous only if every duplicate points to the SAME single subsection.
    const subs = Array.from(new Set(matches.map((c) => c.subsection_id).filter((x): x is string => !!x)));
    if (subs.length === 1 && matches.every((c) => c.subsection_id)) {
      return { poolId: f.id, outcome: "assigned", certId: matches[0].id, subsectionId: subs[0] };
    }
    return {
      poolId: f.id,
      outcome: "ambiguous_cert",
      candidateCertIds: matches.map((c) => c.id),
      candidateSubsectionIds: subs,
    };
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/siteCoc/assignmentEngine.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Reimplement `planPoolAutoAssign` over the engine**

Replace the entire body of `src/lib/siteCoc/poolAssign.ts` with:

```ts
import { planPoolAssignment, type PoolFileLite, type CertRowLite } from "./assignmentEngine";

export type { PoolFileLite, CertRowLite } from "./assignmentEngine";

export interface AutoAssign { poolId: string; subsectionId: string; kind: "coc" | "eval"; }

/** Auto-assign only files the engine classifies as `assigned`. */
export function planPoolAutoAssign(files: PoolFileLite[], certRows: CertRowLite[]): AutoAssign[] {
  const byId = new Map(files.map((f) => [f.id, f]));
  return planPoolAssignment(files, certRows)
    .filter((c) => c.outcome === "assigned")
    .map((c) => {
      const f = byId.get(c.poolId)!;
      return { poolId: c.poolId, subsectionId: c.subsectionId as string, kind: f.detected_kind === "eval" ? "eval" : "coc" };
    });
}
```

- [ ] **Step 6: Run the existing poolAssign test + the new one**

Run: `npx vitest run src/lib/siteCoc/poolAssign.test.ts src/lib/siteCoc/assignmentEngine.test.ts`
Expected: PASS (existing 2 + new 6). The existing `planPoolAutoAssign` behaviour is preserved.

- [ ] **Step 7: Commit**

```bash
git add src/lib/siteCoc/assignmentEngine.ts src/lib/siteCoc/assignmentEngine.test.ts src/lib/siteCoc/poolAssign.ts
git commit -m "feat(coc): assignment engine with reason codes; poolAutoAssign delegates to it"
```

---

### Task 3: Similarity ranker (pure) + tests

**Files:**
- Create: `src/lib/siteCoc/rankCandidates.ts`
- Test: `src/lib/siteCoc/rankCandidates.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/siteCoc/rankCandidates.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { rankSubsectionCandidates } from "./rankCandidates";

const subs = [
  { id: "a", name: "Ackermans", tenant_name: "Ackermans Store" },
  { id: "b", name: "PEP", tenant_name: null },
  { id: "c", name: "Mr Price", tenant_name: "Mr Price Home" },
];

describe("rankSubsectionCandidates", () => {
  it("ranks an exact/near match first with a high score", () => {
    const out = rankSubsectionCandidates("ACKERMANS", subs, 3);
    expect(out[0].id).toBe("a");
    expect(out[0].score).toBeGreaterThan(0.8);
  });

  it("ranks a near-miss (extra word) above unrelated names", () => {
    const out = rankSubsectionCandidates("MR PRICE", subs, 3);
    expect(out[0].id).toBe("c");
  });

  it("respects topN and returns sorted descending", () => {
    const out = rankSubsectionCandidates("ACKERMANS", subs, 2);
    expect(out).toHaveLength(2);
    expect(out[0].score).toBeGreaterThanOrEqual(out[1].score);
  });

  it("returns [] for an empty query", () => {
    expect(rankSubsectionCandidates("", subs, 3)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/siteCoc/rankCandidates.test.ts`
Expected: FAIL — cannot resolve `./rankCandidates`.

- [ ] **Step 3: Write the ranker**

Create `src/lib/siteCoc/rankCandidates.ts`:

```ts
import { normShop } from "./normalize";

export interface RankInput { id: string; name: string; tenant_name?: string | null }
export interface RankedCandidate { id: string; name: string; score: number }

function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length;
  if (!m) return n;
  if (!n) return m;
  let prev = Array.from({ length: n + 1 }, (_, i) => i);
  let curr = new Array(n + 1).fill(0);
  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    [prev, curr] = [curr, prev];
  }
  return prev[n];
}

function editSim(a: string, b: string): number {
  if (!a && !b) return 1;
  const max = Math.max(a.length, b.length);
  return max === 0 ? 1 : 1 - levenshtein(a, b) / max;
}

function tokenOverlap(a: string, b: string): number {
  const at = new Set(a.split(" ").filter(Boolean));
  const bt = new Set(b.split(" ").filter(Boolean));
  if (!at.size || !bt.size) return 0;
  let inter = 0;
  for (const t of at) if (bt.has(t)) inter++;
  return inter / new Set([...at, ...bt]).size;
}

function score(query: string, key: string): number {
  if (!key) return 0;
  return Math.max(editSim(query, key), tokenOverlap(query, key));
}

/** Rank subsections by similarity to a shop/trading name. Returns top-N sorted descending. */
export function rankSubsectionCandidates(query: string, subs: RankInput[], topN = 3): RankedCandidate[] {
  const q = normShop(query);
  if (!q) return [];
  return subs
    .map((s) => {
      const keys = [normShop(s.name), s.tenant_name ? normShop(s.tenant_name) : ""];
      const best = Math.max(...keys.map((k) => score(q, k)));
      const label = s.tenant_name && s.tenant_name !== s.name ? `${s.name} · ${s.tenant_name}` : s.name;
      return { id: s.id, name: label, score: best };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, topN);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/siteCoc/rankCandidates.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/siteCoc/rankCandidates.ts src/lib/siteCoc/rankCandidates.test.ts
git commit -m "feat(coc): self-contained subsection similarity ranker"
```

---

### Task 4: Upload queue (pure) + tests

**Files:**
- Create: `src/lib/siteCoc/uploadQueue.ts`
- Test: `src/lib/siteCoc/uploadQueue.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/siteCoc/uploadQueue.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { mapWithConcurrency, summarizeUpload, type FileOutcome } from "./uploadQueue";

describe("mapWithConcurrency", () => {
  it("processes all items, preserves order, and never exceeds the limit", async () => {
    let active = 0, maxActive = 0;
    const worker = async (n: number) => {
      active++; maxActive = Math.max(maxActive, active);
      await new Promise((r) => setTimeout(r, 1));
      active--;
      return n * 2;
    };
    const out = await mapWithConcurrency([1, 2, 3, 4, 5, 6, 7], 3, worker);
    expect(out).toEqual([2, 4, 6, 8, 10, 12, 14]);
    expect(maxActive).toBeLessThanOrEqual(3);
  });

  it("reports progress per completion", async () => {
    const seen: number[] = [];
    await mapWithConcurrency([1, 2, 3], 2, async (n) => n, (done, total) => seen.push(done));
    expect(seen).toEqual([1, 2, 3]);
    expect(seen[seen.length - 1]).toBe(3);
  });
});

describe("summarizeUpload", () => {
  it("counts uploaded vs failed", () => {
    const outcomes: FileOutcome[] = [
      { name: "a.pdf", state: "uploaded", poolId: "1", detectedCertNo: "B-1" },
      { name: "b.pdf", state: "failed", error: "boom" },
      { name: "c.pdf", state: "uploaded", poolId: "2", detectedCertNo: null },
    ];
    expect(summarizeUpload(outcomes)).toEqual({ total: 3, uploaded: 2, failed: 1 });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/siteCoc/uploadQueue.test.ts`
Expected: FAIL — cannot resolve `./uploadQueue`.

- [ ] **Step 3: Write the queue**

Create `src/lib/siteCoc/uploadQueue.ts`:

```ts
export type FileOutcome =
  | { name: string; state: "uploaded"; poolId: string; detectedCertNo: string | null }
  | { name: string; state: "failed"; error: string };

export interface UploadSummary { total: number; uploaded: number; failed: number }

/** Run `worker` over items with a bounded number in flight; preserves output order. */
export async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>,
  onProgress?: (done: number, total: number) => void,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  let done = 0;
  const total = items.length;
  const runners = new Array(Math.min(Math.max(1, limit), total || 1)).fill(0).map(async () => {
    while (true) {
      const i = next++;
      if (i >= total) return;
      results[i] = await worker(items[i], i);
      done++;
      onProgress?.(done, total);
    }
  });
  await Promise.all(runners);
  return results;
}

export function summarizeUpload(outcomes: FileOutcome[]): UploadSummary {
  let uploaded = 0, failed = 0;
  for (const o of outcomes) (o.state === "uploaded" ? uploaded++ : failed++);
  return { total: outcomes.length, uploaded, failed };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/siteCoc/uploadQueue.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/siteCoc/uploadQueue.ts src/lib/siteCoc/uploadQueue.test.ts
git commit -m "feat(coc): bounded-concurrency upload queue + outcome summary"
```

---

### Task 5: Extract the assign write-path into a lib

**Files:**
- Create: `src/lib/coc/assignPoolFile.ts`

**Context:** This lifts `assign()` + `stampCert()` verbatim out of `useSiteCocPool.ts` (lines 28–72) into a pure-ish lib function (no React) so the upload hook AND the re-trigger glue share one write-path. It reuses `findOrCreateCategory`, `insertCocCertificateDoc`, `insertEvaluationReportDoc` from `@/lib/coc/uploadCocFiles` and `normCert`/`extractEvalVerdict`.

- [ ] **Step 1: Write the lib**

Create `src/lib/coc/assignPoolFile.ts`:

```ts
import { supabase } from "@/integrations/supabase/client";
import { normCert } from "@/lib/siteCoc/normalize";
import { extractEvalVerdict } from "@/lib/cocFilename";
import { findOrCreateCategory, insertCocCertificateDoc, insertEvaluationReportDoc } from "@/lib/coc/uploadCocFiles";

export interface AssignablePoolFile {
  id: string;
  file_name: string;
  file_url: string;
  file_size: number | null;
  detected_cert_no: string | null;
}

async function stampCert(siteId: string, subsectionId: string, certKey: string, col: "coc_document_id" | "eval_document_id", docId: string) {
  if (!certKey) return;
  const { data: empty } = await supabase.from("coc_certificates").select("id")
    .eq("site_id", siteId).eq("subsection_id", subsectionId).eq("cert_no_norm", certKey).is(col, null).limit(1);
  let targetId = empty?.[0]?.id as string | undefined;
  if (!targetId) {
    const { data: any1 } = await supabase.from("coc_certificates").select("id")
      .eq("site_id", siteId).eq("subsection_id", subsectionId).eq("cert_no_norm", certKey).limit(1);
    targetId = any1?.[0]?.id;
  }
  if (targetId) await supabase.from("coc_certificates").update({ [col]: docId }).eq("id", targetId);
}

/** Insert a subsection_documents row for a pooled file (firing the COC rollup), link the cert, mark the pool row assigned. */
export async function assignPoolFile(siteId: string, file: AssignablePoolFile, subsectionId: string, kind: "coc" | "eval"): Promise<void> {
  const certNo = file.detected_cert_no;
  const certKey = certNo ? normCert(certNo) : "";
  const cat = await findOrCreateCategory(subsectionId, kind === "coc" ? "01 COC" : "07 COC Evaluation Reports");

  const { data: dupe } = await supabase.from("subsection_documents").select("id")
    .eq("subsection_id", subsectionId).eq("category_id", cat.id).eq("file_name", file.file_name).limit(1);
  let docId = dupe?.[0]?.id as string | undefined;

  if (!docId) {
    if (kind === "coc") {
      docId = (await insertCocCertificateDoc({ subsectionId, cocCategoryId: cat.id, fileName: file.file_name, fileUrl: file.file_url, fileSize: file.file_size, cocNumber: certNo })).id;
    } else {
      let parentId: string | null = null;
      if (certNo) {
        const { data: p } = await supabase.from("subsection_documents").select("id").eq("subsection_id", subsectionId).eq("coc_number", certNo).is("parent_document_id", null).limit(1);
        parentId = p?.[0]?.id ?? null;
      }
      docId = (await insertEvaluationReportDoc({ subsectionId, evalCategoryId: cat.id, parentCocId: parentId, fileName: file.file_name, fileUrl: file.file_url, fileSize: file.file_size, cocNumber: certNo, verdict: extractEvalVerdict(file.file_name) })).id;
    }
  }

  await stampCert(siteId, subsectionId, certKey, kind === "coc" ? "coc_document_id" : "eval_document_id", docId);
  await supabase.from("coc_file_pool").update({ status: "assigned", assigned_subsection_id: subsectionId, assigned_document_id: docId }).eq("id", file.id);
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit 2>&1 | grep assignPoolFile || echo "clean"`
Expected: `clean`.

- [ ] **Step 3: Commit**

```bash
git add src/lib/coc/assignPoolFile.ts
git commit -m "feat(coc): extract shared assignPoolFile write-path lib"
```

---

### Task 6: Re-trigger glue lib

**Files:**
- Create: `src/lib/coc/reassignPool.ts`

**Context:** Fetches pending pool files + the site's register certs, runs the engine, assigns the assignable via `assignPoolFile`, and persists `reason` + `candidate_ids` on the rest. Called after upload, after a manual resolve/auto-match, and after a schedule import — so assignment converges regardless of order.

- [ ] **Step 1: Write the lib**

Create `src/lib/coc/reassignPool.ts`:

```ts
import { supabase } from "@/integrations/supabase/client";
import { planPoolAssignment, type CertRowLite, type PoolFileLite } from "@/lib/siteCoc/assignmentEngine";
import { assignPoolFile, type AssignablePoolFile } from "@/lib/coc/assignPoolFile";

interface PoolRow extends PoolFileLite, AssignablePoolFile {}

export interface ReassignResult { assigned: number; pending: number }

/** Re-classify all pending pool files for a site, assign the assignable, persist reasons on the rest. */
export async function reassignPendingPoolFiles(siteId: string): Promise<ReassignResult> {
  const [{ data: poolRows }, { data: certs }] = await Promise.all([
    supabase.from("coc_file_pool").select("*").eq("site_id", siteId).eq("status", "pending"),
    supabase.from("coc_certificates").select("id, cert_no_norm, subsection_id").eq("site_id", siteId),
  ]);
  const files = (poolRows ?? []) as unknown as PoolRow[];
  const classifications = planPoolAssignment(files, (certs ?? []) as CertRowLite[]);
  const byId = new Map(files.map((f) => [f.id, f]));

  let assigned = 0;
  for (const c of classifications) {
    const f = byId.get(c.poolId);
    if (!f) continue;
    if (c.outcome === "assigned" && c.subsectionId) {
      try {
        await assignPoolFile(siteId, f, c.subsectionId, f.detected_kind === "eval" ? "eval" : "coc");
        assigned++;
      } catch (e) {
        if (process.env.NODE_ENV === "development") console.error("reassign assign failed", f.file_name, e);
        await supabase.from("coc_file_pool").update({ reason: "assign_failed", candidate_ids: [] }).eq("id", f.id);
      }
    } else {
      await supabase.from("coc_file_pool")
        .update({ reason: c.outcome, candidate_ids: c.candidateSubsectionIds ?? [] })
        .eq("id", f.id);
    }
  }
  return { assigned, pending: classifications.length - assigned };
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit 2>&1 | grep reassignPool || echo "clean"`
Expected: `clean`.

- [ ] **Step 3: Commit**

```bash
git add src/lib/coc/reassignPool.ts
git commit -m "feat(coc): reassignPendingPoolFiles glue (order-independent assignment)"
```

---

### Task 7: Rewire `useSiteCocPool` — bulk upload, reasons, delegate

**Files:**
- Modify: `src/views/site-coc/useSiteCocPool.ts` (full replacement)

**Context:** Replace the one-at-a-time loop with `mapWithConcurrency` (limit 5), surface progress + per-file outcomes for the UI, delegate the write-path to `assignPoolFile`, run `reassignPendingPoolFiles` after upload, and expose a `reassign()` method. `PoolFile` gains `reason` + `candidate_ids`.

- [ ] **Step 1: Replace the file**

Replace the entire contents of `src/views/site-coc/useSiteCocPool.ts` with:

```ts
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { extractCocNumber } from "@/lib/cocFilename";
import { classifyCocFile } from "@/lib/siteCoc/routeUpload";
import { assignPoolFile } from "@/lib/coc/assignPoolFile";
import { reassignPendingPoolFiles } from "@/lib/coc/reassignPool";
import { mapWithConcurrency, summarizeUpload, type FileOutcome } from "@/lib/siteCoc/uploadQueue";

export interface PoolFile {
  id: string; file_name: string; file_url: string; file_size: number | null;
  detected_cert_no: string | null; detected_kind: string | null; status: string;
  reason: string | null; candidate_ids: string[] | null;
}
const sanitize = (s: string) => s.replace(/[^a-zA-Z0-9.-]/g, "_");
const UPLOAD_CONCURRENCY = 5;

export function useSiteCocPool(siteId: string | undefined, onAssigned: () => void) {
  const [pending, setPending] = useState<PoolFile[]>([]);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [outcomes, setOutcomes] = useState<FileOutcome[]>([]);
  const inFlight = useRef<Set<string>>(new Set());

  const refetch = useCallback(async () => {
    if (!siteId) return;
    const { data } = await supabase.from("coc_file_pool").select("*").eq("site_id", siteId).eq("status", "pending").order("created_at");
    setPending((data ?? []) as unknown as PoolFile[]);
  }, [siteId]);

  useEffect(() => { refetch(); }, [refetch]);

  const upload = useCallback(async (files: File[]) => {
    if (!siteId || !files.length) return;
    setBusy(true);
    setProgress({ done: 0, total: files.length });
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const result = await mapWithConcurrency<File, FileOutcome>(
        files, UPLOAD_CONCURRENCY,
        async (file): Promise<FileOutcome> => {
          try {
            const ts = Date.now();
            const path = `${siteId}/_pool/${ts}-${sanitize(file.name)}`;
            const { data: up, error: upErr } = await supabase.storage.from("documents").upload(path, file);
            if (upErr || !up?.path) return { name: file.name, state: "failed", error: upErr?.message ?? "upload error" };
            const { data: urlData } = supabase.storage.from("documents").getPublicUrl(up.path);
            const detected = extractCocNumber(file.name);
            const { data: row, error } = await supabase.from("coc_file_pool").insert({
              site_id: siteId, file_name: file.name, file_url: urlData.publicUrl, file_size: file.size,
              detected_cert_no: detected, detected_kind: classifyCocFile(file.name), uploaded_by: user?.id ?? null,
            }).select("id").single();
            if (error || !row) return { name: file.name, state: "failed", error: error?.message ?? "insert error" };
            return { name: file.name, state: "uploaded", poolId: row.id, detectedCertNo: detected };
          } catch (e: any) {
            return { name: file.name, state: "failed", error: e?.message ?? "error" };
          }
        },
        (done, total) => setProgress({ done, total }),
      );
      setOutcomes(result);
      const sum = summarizeUpload(result);
      const { assigned } = await reassignPendingPoolFiles(siteId);
      toast.success(`Uploaded ${sum.uploaded}/${sum.total}; auto-assigned ${assigned}.${sum.failed ? ` ${sum.failed} failed.` : ""}`);
      await refetch();
      onAssigned();
    } catch (e: any) {
      if (process.env.NODE_ENV === "development") console.error("pool upload failed", e);
      toast.error(e?.message || "Upload failed", { duration: 6000 });
    } finally {
      setBusy(false);
      setProgress(null);
    }
  }, [siteId, refetch, onAssigned]);

  const reassign = useCallback(async () => {
    if (!siteId) return;
    setBusy(true);
    try {
      const { assigned } = await reassignPendingPoolFiles(siteId);
      if (assigned) toast.success(`Auto-assigned ${assigned} pending file(s).`);
      await refetch();
      onAssigned();
    } finally { setBusy(false); }
  }, [siteId, refetch, onAssigned]);

  const assignManual = useCallback(async (file: PoolFile, subsectionId: string, kind: "coc" | "eval") => {
    if (!siteId || inFlight.current.has(file.id)) return;
    inFlight.current.add(file.id);
    setBusy(true);
    try { await assignPoolFile(siteId, file, subsectionId, kind); toast.success(`Assigned ${file.file_name}`); await refetch(); onAssigned(); }
    catch (e: any) { toast.error(e?.message || "Assign failed"); }
    finally { inFlight.current.delete(file.id); setBusy(false); }
  }, [siteId, refetch, onAssigned]);

  const assignManyTo = useCallback(async (files: PoolFile[], subsectionId: string) => {
    if (!siteId || !files.length) return;
    setBusy(true);
    try {
      let n = 0;
      for (const f of files) {
        try { await assignPoolFile(siteId, f, subsectionId, f.detected_kind === "eval" ? "eval" : "coc"); n++; }
        catch (e) { if (process.env.NODE_ENV === "development") console.error("batch assign failed", f.file_name, e); }
      }
      toast.success(`Assigned ${n}/${files.length} file(s).`);
      await refetch();
      onAssigned();
    } finally { setBusy(false); }
  }, [siteId, refetch, onAssigned]);

  const updateCertNo = useCallback(async (file: PoolFile, certNo: string) => {
    await supabase.from("coc_file_pool").update({ detected_cert_no: certNo || null }).eq("id", file.id);
    await reassign();
  }, [reassign]);

  const remove = useCallback(async (file: PoolFile) => {
    try {
      const u = new URL(file.file_url);
      const parts = u.pathname.split("/");
      const p = parts.slice(parts.indexOf("documents") + 1).join("/");
      if (p) await supabase.storage.from("documents").remove([p]);
    } catch { /* ignore */ }
    await supabase.from("coc_file_pool").delete().eq("id", file.id);
    await refetch();
  }, [refetch]);

  return { pending, busy, progress, outcomes, upload, reassign, assignManual, assignManyTo, updateCertNo, remove, refetch };
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit 2>&1 | grep useSiteCocPool || echo "clean"`
Expected: `clean`.

- [ ] **Step 3: Commit**

```bash
git add src/views/site-coc/useSiteCocPool.ts
git commit -m "feat(coc): bulk-concurrent pool upload + reasons + reassign glue in hook"
```

---

### Task 8: Manual-match status + glue after resolve (`useSiteCoc`)

**Files:**
- Modify: `src/views/site-coc/useSiteCoc.ts`

**Context (verbatim current bodies):** `stampMatch` (lines 56–63) sets `match_status: "matched"`; `resolveShop` (66–70) calls it; `rerunAutoMatch` (73–82) calls it per hit. We make `stampMatch` take the status, have `resolveShop` stamp `"manual"` and trigger the pool glue, and keep `rerunAutoMatch` stamping `"matched"`.

- [ ] **Step 1: Add the glue import**

At the top of `src/views/site-coc/useSiteCoc.ts`, add after the existing imports:

```ts
import { reassignPendingPoolFiles } from "@/lib/coc/reassignPool";
```

- [ ] **Step 2: Make `stampMatch` take a status**

Replace the `stampMatch` body (the `useCallback` at lines 56–63) with:

```ts
const stampMatch = useCallback(async (scheduleRowId: string, shopNoRaw: string, subsectionId: string, status: "matched" | "manual" = "matched") => {
    await supabase.from("coc_db_schedule").update({ subsection_id: subsectionId, match_status: status }).eq("id", scheduleRowId);
    const target = normShop(shopNoRaw);
    const certIds = certificates.filter(c => normShop(c.shop_no_raw) === target).map(c => c.id);
    if (certIds.length) {
      await supabase.from("coc_certificates").update({ subsection_id: subsectionId, match_status: status }).in("id", certIds);
    }
  }, [certificates]);
```

- [ ] **Step 3: `resolveShop` stamps `manual` and triggers the glue**

Replace the `resolveShop` body (lines 66–70) with:

```ts
const resolveShop = useCallback(async (scheduleRowId: string, shopNoRaw: string, subsectionId: string) => {
    if (!siteId) return;
    await stampMatch(scheduleRowId, shopNoRaw, subsectionId, "manual");
    await reassignPendingPoolFiles(siteId);
    await refetch();
  }, [siteId, stampMatch, refetch]);
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit 2>&1 | grep useSiteCoc.ts || echo "clean"`
Expected: `clean`. (`rerunAutoMatch` still calls `stampMatch` with no status arg → defaults to `"matched"`.)

- [ ] **Step 5: Commit**

```bash
git add src/views/site-coc/useSiteCoc.ts
git commit -m "feat(coc): mark manual resolves + re-trigger pool assignment on resolve"
```

---

### Task 9: Protect manual matches on re-import + glue

**Files:**
- Modify: `src/lib/siteCoc/reimport.ts`
- Modify: `src/views/site-coc/useSiteCocImport.ts`

**Context:** `applyPriorMatches` (reimport.ts 8–19) restores prior `subsection_id` keyed on `normShop`. The import delete (useSiteCocImport.ts 82–85) wipes prior rows. We (a) preserve the prior `match_status` (so `'manual'` survives), and (b) skip deleting rows that are `match_status='manual'`, and (c) run the pool glue after import.

- [ ] **Step 1: Preserve match_status in `applyPriorMatches`**

Replace the body of `applyPriorMatches` in `src/lib/siteCoc/reimport.ts` with:

```ts
export function applyPriorMatches<T extends { shop_no_raw: string; subsection_id: string | null; match_status: "matched" | "unmatched" | "manual" }>(
  newRows: T[], priorMap: Map<string, { id: string; status: "matched" | "manual" }>, validSubsectionIds: Set<string>,
): T[] {
  return newRows.map(r => {
    if (r.subsection_id) return r;
    const prior = priorMap.get(normShop(r.shop_no_raw));
    if (prior && validSubsectionIds.has(prior.id)) {
      return { ...r, subsection_id: prior.id, match_status: prior.status };
    }
    return r;
  });
}
```

- [ ] **Step 2: Build the richer priorMap and skip manual rows on delete in `useSiteCocImport.ts`**

Replace the prior-snapshot block (lines 55–66) with:

```ts
const { data: priorRows } = await supabase
        .from("coc_db_schedule").select("shop_no_raw, subsection_id, match_status").eq("site_id", siteId);
      const priorMap = new Map<string, { id: string; status: "matched" | "manual" }>();
      for (const p of priorRows ?? []) {
        if (p.subsection_id) priorMap.set(normShop(p.shop_no_raw), { id: p.subsection_id, status: p.match_status === "manual" ? "manual" : "matched" });
      }
      const validSubIds = new Set(subsLite.map(s => s.id));
```

Replace the delete block (lines 82–85) with (never delete manual rows):

```ts
const notThisBatch = `import_batch_id.is.null,import_batch_id.neq.${batch.id}`;
      await supabase.from("coc_db_schedule").delete().eq("site_id", siteId).neq("match_status", "manual").or(notThisBatch);
      await supabase.from("coc_certificates").delete().eq("site_id", siteId).neq("match_status", "manual").or(notThisBatch);
```

- [ ] **Step 3: Run the pool glue after import**

Add the import near the top of `src/views/site-coc/useSiteCocImport.ts`:

```ts
import { reassignPendingPoolFiles } from "@/lib/coc/reassignPool";
```

Then, immediately before the import function's final success return / summary (after the existing re-link + `is_coc_required` sync steps), add:

```ts
await reassignPendingPoolFiles(siteId);
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit 2>&1 | grep -E "reimport|useSiteCocImport" || echo "clean"`
Expected: `clean`. If the build flags the `priorMap` value type elsewhere it's used, adjust that call site to read `.id` (the only consumer is `applyPriorMatches`, updated in Step 1).

- [ ] **Step 5: Commit**

```bash
git add src/lib/siteCoc/reimport.ts src/views/site-coc/useSiteCocImport.ts
git commit -m "feat(coc): protect manual matches across re-import + glue after import"
```

---

### Task 10: Bulk Assign workspace + wire the sub-tab

**Files:**
- Create: `src/views/site-coc/AssignSubTab.tsx`
- Modify: `src/views/site-coc/SiteCocTab.tsx`

**Context:** New sub-tab grouping pending pool files by `reason`, with confidence-ranked subsection suggestions (Task 3) and multi-select batch assign (`assignManyTo` from Task 7). `SiteCocTab` already owns `useSiteCoc` (schedule/certificates/subsections/resolveShop). It must also own `useSiteCocPool` and pass its data down, and orchestrate the glue on resolve.

- [ ] **Step 1: Create the workspace component**

Create `src/views/site-coc/AssignSubTab.tsx`:

```tsx
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { rankSubsectionCandidates } from "@/lib/siteCoc/rankCandidates";
import type { PoolFile } from "./useSiteCocPool";
import type { SubsectionOption } from "./useSiteCoc";

const REASON_LABEL: Record<string, string> = {
  cert_has_no_subsection: "Cert found, shop not matched to a subsection",
  ambiguous_cert: "Cert number appears on more than one subsection",
  cert_not_found: "Cert number not in the imported schedule",
  no_cert_detected: "No cert number in the filename",
  assign_failed: "Assignment failed — retry",
};

function Row({ file, subsections, onAssign }: {
  file: PoolFile; subsections: SubsectionOption[];
  onAssign: (f: PoolFile, sub: string) => void;
}) {
  const [sub, setSub] = useState("");
  const suggestions = useMemo(
    () => rankSubsectionCandidates(file.detected_cert_no ?? file.file_name, subsections, 3).filter(c => c.score > 0.3),
    [file, subsections],
  );
  return (
    <tr className="border-b">
      <td className="p-2 text-xs max-w-[18rem] truncate" title={file.file_name}>{file.file_name}</td>
      <td className="p-2 font-mono text-xs whitespace-nowrap">{file.detected_cert_no ?? "—"}</td>
      <td className="p-2">
        <div className="flex flex-wrap gap-1">
          {suggestions.map(s => (
            <Button key={s.id} size="sm" variant="outline" className="h-7" onClick={() => onAssign(file, s.id)}>
              {s.name} <span className="ml-1 text-[10px] text-muted-foreground">{Math.round(s.score * 100)}%</span>
            </Button>
          ))}
          {!suggestions.length && <span className="text-xs text-muted-foreground">no close match</span>}
        </div>
      </td>
      <td className="p-2">
        <Select value={sub} onValueChange={(v) => { setSub(v); onAssign(file, v); }}>
          <SelectTrigger className="h-8 w-56"><SelectValue placeholder="Choose subsection…" /></SelectTrigger>
          <SelectContent>
            {subsections.map(s => <SelectItem key={s.id} value={s.id}>{s.name}{s.tenant_name && s.tenant_name !== s.name ? ` · ${s.tenant_name}` : ""}</SelectItem>)}
          </SelectContent>
        </Select>
      </td>
    </tr>
  );
}

export function AssignSubTab({ pending, subsections, onAssign, onAssignMany, onReassign, busy }: {
  pending: PoolFile[];
  subsections: SubsectionOption[];
  onAssign: (f: PoolFile, sub: string) => void;
  onAssignMany: (files: PoolFile[], sub: string) => void;
  onReassign: () => void;
  busy: boolean;
}) {
  const [batchSub, setBatchSub] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const groups = useMemo(() => {
    const m = new Map<string, PoolFile[]>();
    for (const f of pending) {
      const k = f.reason ?? "cert_not_found";
      (m.get(k) ?? m.set(k, []).get(k)!).push(f);
    }
    return Array.from(m.entries());
  }, [pending]);

  const toggle = (id: string) => setSelected(prev => {
    const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n;
  });

  if (!pending.length) {
    return <p className="text-sm text-muted-foreground">All uploaded COC files are assigned. Drop more files in the Load card to ingest.</p>;
  }

  const selectedFiles = pending.filter(f => selected.has(f.id));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">{pending.length} file(s) awaiting assignment, grouped by reason.</p>
        <Button size="sm" variant="outline" disabled={busy} onClick={onReassign}>Re-run auto-assign</Button>
      </div>

      {selectedFiles.length > 0 && (
        <div className="flex items-center gap-2 rounded-md border bg-muted/30 p-2">
          <span className="text-sm">{selectedFiles.length} selected →</span>
          <Select value={batchSub} onValueChange={setBatchSub}>
            <SelectTrigger className="h-8 w-56"><SelectValue placeholder="Assign all to…" /></SelectTrigger>
            <SelectContent>
              {subsections.map(s => <SelectItem key={s.id} value={s.id}>{s.name}{s.tenant_name && s.tenant_name !== s.name ? ` · ${s.tenant_name}` : ""}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button size="sm" disabled={!batchSub || busy} onClick={() => { onAssignMany(selectedFiles, batchSub); setSelected(new Set()); setBatchSub(""); }}>Assign {selectedFiles.length}</Button>
        </div>
      )}

      {groups.map(([reason, files]) => (
        <div key={reason} className="space-y-2">
          <h4 className="text-sm font-semibold flex items-center gap-2">
            <Badge variant="outline">{files.length}</Badge> {REASON_LABEL[reason] ?? reason}
          </h4>
          <table className="w-full text-left">
            <thead><tr className="text-xs text-muted-foreground border-b">
              <th className="p-2 w-8"></th><th className="p-2">File</th><th className="p-2">Cert no</th><th className="p-2">Suggestions</th><th className="p-2">Subsection</th>
            </tr></thead>
            <tbody>
              {files.map(f => (
                <tr key={f.id} className="border-b align-top">
                  <td className="p-2"><Checkbox checked={selected.has(f.id)} onCheckedChange={() => toggle(f.id)} /></td>
                  <td colSpan={4} className="p-0">
                    <table className="w-full"><tbody><Row file={f} subsections={subsections} onAssign={onAssign} /></tbody></table>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Verify `SubsectionOption` is exported from `useSiteCoc.ts`**

Run: `grep -n "export interface SubsectionOption" src/views/site-coc/useSiteCoc.ts || echo "NOT EXPORTED"`
If it prints `NOT EXPORTED`, add `export` to the `SubsectionOption` interface declaration in `src/views/site-coc/useSiteCoc.ts`.

- [ ] **Step 3: Wire the sub-tab in `SiteCocTab.tsx`**

In `src/views/site-coc/SiteCocTab.tsx`: add imports at top —

```tsx
import { useSiteCocPool } from "./useSiteCocPool";
import { AssignSubTab } from "./AssignSubTab";
```

Find where `useSiteCoc(...)` is destructured and add a pool hook beside it (using the same `refetch`/reload the component already calls after import; pass a no-op or the existing reload):

```tsx
const pool = useSiteCocPool(siteId, refetch);
```

(If the component's reload function is not named `refetch`, pass that one — it is the callback run after assignment to refresh schedule/certs.)

Then replace the `<TabsList>`/`<TabsContent>` block (lines 78–88) with the version that adds the Assign tab:

```tsx
      <Tabs defaultValue="schedule">
        <TabsList>
          <TabsTrigger value="schedule">Schedule</TabsTrigger>
          <TabsTrigger value="certificates">Certificates</TabsTrigger>
          <TabsTrigger value="verification">Verification</TabsTrigger>
          <TabsTrigger value="assign">Assign{pool.pending.length ? ` (${pool.pending.length})` : ""}</TabsTrigger>
          <TabsTrigger value="report">Report</TabsTrigger>
        </TabsList>
        <TabsContent value="schedule"><Card><CardContent className="pt-4">{loading ? "Loading…" : <ScheduleSubTab rows={schedule} subsections={subsections} onResolve={resolveShop} />}</CardContent></Card></TabsContent>
        <TabsContent value="certificates"><Card><CardContent className="pt-4">{loading ? "Loading…" : <CertificatesSubTab rows={certificates} />}</CardContent></Card></TabsContent>
        <TabsContent value="verification"><Card><CardContent className="pt-4">{loading ? "Loading…" : <VerificationSubTab rows={certificates} />}</CardContent></Card></TabsContent>
        <TabsContent value="assign"><Card><CardContent className="pt-4"><AssignSubTab pending={pool.pending} subsections={subsections} onAssign={(f, s) => pool.assignManual(f, s, f.detected_kind === "eval" ? "eval" : "coc")} onAssignMany={pool.assignManyTo} onReassign={pool.reassign} busy={pool.busy} /></CardContent></Card></TabsContent>
        <TabsContent value="report"><Card><CardContent className="pt-4"><ReportSubTab siteId={siteId} siteName={siteName} schedule={schedule} certificates={certificates} batch={batch} subsections={subsections} clientName={clientName} siteAddress={siteAddress} siteKpis={siteKpis} companyLogo={companyLogo} /></CardContent></Card></TabsContent>
      </Tabs>
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit 2>&1 | grep -E "AssignSubTab|SiteCocTab" || echo "clean"`
Expected: `clean`.

- [ ] **Step 5: Commit**

```bash
git add src/views/site-coc/AssignSubTab.tsx src/views/site-coc/SiteCocTab.tsx
git commit -m "feat(coc): Bulk Assign workspace sub-tab with ranked suggestions + batch assign"
```

---

### Task 11: Bulk progress / outcomes / retry in the Load card

**Files:**
- Modify: `src/views/site-coc/SiteCocLoadCard.tsx`

**Context:** The card calls `useSiteCocPool` today (its own instance). To avoid two pool instances, the card should accept the pool as props from `SiteCocTab`. Keep it minimal: render the dropzone, a progress bar during upload, and a per-file outcome list with a retry button for failures. The card holds the dropped `File[]` so it can retry failures by name.

- [ ] **Step 1: Refit the card to use injected pool + show progress/outcomes**

Open `src/views/site-coc/SiteCocLoadCard.tsx`. Change its props to receive the pool and render progress + outcomes. Replace the component's top-level (props + the `handleFiles`/state and the area under the dropzone) so it:
- takes `pool: ReturnType<typeof useSiteCocPool>` as a prop (and `subsections` if still rendering inline pending — but pending now lives in the Assign tab, so the card no longer renders the pending table),
- keeps a `useRef<File[]>` of the last dropped batch,
- shows `pool.progress` as `Uploading {done}/{total}` while busy,
- after upload, renders `pool.outcomes`: each `failed` row gets a **Retry** button that re-invokes `pool.upload([thatFile])`.

Concretely, set the props block to:

```tsx
export function SiteCocLoadCard({ pool }: { pool: ReturnType<typeof import("./useSiteCocPool").useSiteCocPool> }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);
  const lastBatch = useRef<File[]>([]);
  const { busy, progress, outcomes, upload } = pool;
  const handleFiles = (list: FileList | null) => {
    if (!list || !list.length) return;
    const arr = Array.from(list);
    lastBatch.current = arr;
    upload(arr);
  };
```

Keep the existing dropzone JSX (lines 52–64). Replace the previous pending-table block (the `pending.length > 0` table) with a progress + outcomes block:

```tsx
        {progress && (
          <p className="mt-3 text-sm text-muted-foreground">Uploading {progress.done}/{progress.total}…</p>
        )}
        {!busy && outcomes.length > 0 && (
          <div className="mt-3 space-y-1">
            {outcomes.map((o, i) => (
              <div key={i} className="flex items-center justify-between text-xs border-b py-1">
                <span className="truncate max-w-[24rem]" title={o.name}>{o.name}</span>
                {o.state === "uploaded"
                  ? <span className="text-emerald-600">uploaded{o.detectedCertNo ? ` · ${o.detectedCertNo}` : " · no cert no"}</span>
                  : <span className="flex items-center gap-2 text-destructive">failed
                      <Button size="sm" variant="ghost" className="h-6" disabled={busy}
                        onClick={() => { const f = lastBatch.current.find(x => x.name === o.name); if (f) upload([f]); }}>Retry</Button>
                    </span>}
              </div>
            ))}
            <p className="text-xs text-muted-foreground pt-1">Assign the unmatched files in the <strong>Assign</strong> tab.</p>
          </div>
        )}
```

Remove the now-unused `PoolRow` component and any imports it alone used (e.g. `Select`/`Trash2`) **only if** nothing else in the file references them (check with grep before deleting an import).

- [ ] **Step 2: Pass the pool from `SiteCocTab` to the card**

Wherever `SiteCocTab.tsx` renders `<SiteCocLoadCard ... />`, change it to `<SiteCocLoadCard pool={pool} />`. (If `SiteCocLoadCard` was previously rendering its own `useSiteCocPool`, that instance is now removed in Step 1.)

Run: `grep -n "SiteCocLoadCard" src/views/site-coc/SiteCocTab.tsx` to find the render site and update its props.

- [ ] **Step 3: Typecheck + build**

Run: `npx tsc --noEmit 2>&1 | grep -E "SiteCocLoadCard|SiteCocTab" || echo "clean"`
Expected: `clean`.

- [ ] **Step 4: Commit**

```bash
git add src/views/site-coc/SiteCocLoadCard.tsx src/views/site-coc/SiteCocTab.tsx
git commit -m "feat(coc): bulk upload progress + per-file outcomes + retry in load card"
```

---

### Task 12: Full verification

- [ ] **Step 1: Full test suite**

Run: `npm test`
Expected: PASS — baseline 437 + new (assignmentEngine 6, rankCandidates 4, uploadQueue 3) = 450, file count 66 + 3 = 69. (poolAssign's existing 2 still pass.)

- [ ] **Step 2: Build**

Run: `npm run build`
Expected: succeeds (pre-existing unrelated `tsc` warnings in `subsection-detail/*` and `TemplateBuilderPage.tsx` are not introduced by this work).

- [ ] **Step 3: Manual runtime (record results)**

1. Open a site → COC tab → Load card → drop 50+ COC PDFs. Confirm progress `X/N`, the outcome list, and a toast summarising uploaded/auto-assigned.
2. Open the **Assign** tab → confirm pending files are grouped by reason, suggestions show with %match, single-click assign works, and multi-select "Assign N to subsection" works.
3. In **Schedule**, resolve an unmatched shop → confirm previously `cert_has_no_subsection` files for that shop auto-assign (the glue), without re-uploading.
4. Re-import the schedule → confirm a manually-resolved shop keeps its assignment (manual protection).

- [ ] **Step 4: Note deploy specifics**

Frontend deploys via `vercel --prod` (project `wm_compliance` → watsonmattheus.com). The Task 1 migration must be applied to prod via the Supabase SQL editor (project `oltzgidkjxwsukvkomof`) — additive, non-destructive. PWA service worker caches the bundle → hard-refresh.

---

## Self-review notes

- **Spec coverage:** engine + reasons (T2, T1), re-trigger glue (T6, T8, T9), bulk upload (T4, T7, T11), workspace (T10), ranker (T3), manual protection (T9). ✓
- **Type consistency:** `PoolFileLite`/`CertRowLite` defined in `assignmentEngine.ts`, re-exported by `poolAssign.ts`; `PoolClassification.outcome` strings match the persisted `reason` values and `AssignSubTab`'s `REASON_LABEL` keys; `PoolFile` gains `reason`/`candidate_ids` (T7) consumed by `AssignSubTab` (T10). `assignPoolFile(siteId, file, subsectionId, kind)` signature identical across T5/T6/T7.
- **Known soft spots flagged for the executor:** T9 Step 3 inserts the glue call before the import's success return — confirm the exact line in `useSiteCocImport.ts`; T11 changes `SiteCocLoadCard` to injected props — confirm and update the single render site in `SiteCocTab.tsx`. Both are verified by `tsc`/build.
```
