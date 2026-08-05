# COC Register-Truth ("One truth, one pipe") Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the imported Verification-workbook verdict the single source of COC status, route every COC upload through the site pool, and turn stranded files into a fixable Exceptions queue.

**Architecture:** The register (`coc_certificates.verdict`) stamps `subsection_documents.coc_status` at assign-time, re-import-time, and once via backfill migration; the existing DB rollup trigger and compliance gate are reused unchanged. Manual verdict UI is deleted; the subsection dropzone re-routes through the pool; expiry no longer auto-fails a Pass.

**Tech Stack:** Next.js 15 + React 18, Supabase (client-side supabase-js, SQL migrations), vitest (node env, co-located `*.test.ts`), sonner toasts, shadcn/ui.

**Spec:** `docs/superpowers/specs/2026-07-25-coc-process-simplification-design.md`
**Branch:** `feat/coc-register-truth` (already created off `origin/main`)

---

## File structure

| File | Action | Responsibility |
|---|---|---|
| `src/lib/siteCoc/verdictMap.ts` (+`.test.ts`) | Create | Pure mapping: register verdict text → doc status (Pass/Fail/Pending) |
| `src/lib/coc/assignPoolFile.ts` | Modify | Stamp doc status from register verdict on every assignment |
| `src/lib/coc/uploadCocFiles.ts` | Modify | Accept a `cocStatus` on insert; delete now-unused `uploadCocCertificate` |
| `src/views/site-coc/useSiteCocImport.ts` | Modify | Re-stamp re-linked docs from the new batch's verdicts |
| `src/lib/cocHierarchy.ts` (+`.test.ts`) | Modify/Create | Drop expired-Pass→Fail branch (expiry display-only) |
| `supabase/migrations/20260725100000_coc_register_truth.sql` | Create | Rollup without expiry auto-fail + one-time backfill |
| `src/components/coc/CocCertificateList.tsx` | Rewrite | Read-only evidence view (no verdict/metadata editors) |
| `src/lib/coc/poolUpload.ts` | Create | Shared single-file pool upload + route-and-report |
| `src/views/subsection-detail/CocMeteringTab.tsx` | Modify | COC dropzone routes through the pool; new status copy |
| `src/views/SubsectionDetail.tsx`, `src/views/subsection-detail/useSubsectionDetail.ts` | Modify | Pass `siteId` down |
| `src/views/site-coc/AssignSubTab.tsx` | Rewrite | Exceptions queue: cert-no editor, candidate buttons, Schedule deep-link |
| `src/views/site-coc/SiteCocTab.tsx` | Modify | Controlled tabs, "Exceptions" label, wire new props |
| `src/views/site-coc/SiteCocLoadCard.tsx` | Modify | Pre-import guard banner |
| `src/views/site-coc/useSiteCocPool.ts` | Modify | Use shared pool upload; report per-file bulk failures |
| `src/views/ContractorSiteDetail.tsx`, `src/views/ContractorSubsectionDetail.tsx` | Modify | Badge colors recognise Pass/Fail |
| `src/lib/siteDeliverables.ts` | Modify | Failed COC keeps a to-do open; copy updated |

Run all commands from the repo root: `/Users/spud/Documents/DEVELOPER/APPS/insight-linker-app`.

---

### Task 1: Verdict mapping (pure lib)

**Files:**
- Create: `src/lib/siteCoc/verdictMap.ts`
- Test: `src/lib/siteCoc/verdictMap.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/siteCoc/verdictMap.test.ts
import { describe, expect, it } from "vitest";
import { docStatusFromVerdict } from "./verdictMap";

describe("docStatusFromVerdict", () => {
  it("maps PASS variants to Pass", () => {
    expect(docStatusFromVerdict("PASS")).toBe("Pass");
    expect(docStatusFromVerdict("pass")).toBe("Pass");
    expect(docStatusFromVerdict(" Passed ")).toBe("Pass");
  });
  it("maps FAIL variants to Fail", () => {
    expect(docStatusFromVerdict("FAIL")).toBe("Fail");
    expect(docStatusFromVerdict("Failed - see reasons")).toBe("Fail");
  });
  it("maps CV / blank / unknown to Pending", () => {
    expect(docStatusFromVerdict("CV")).toBe("Pending");
    expect(docStatusFromVerdict("Cannot verify")).toBe("Pending");
    expect(docStatusFromVerdict("")).toBe("Pending");
    expect(docStatusFromVerdict(null)).toBe("Pending");
    expect(docStatusFromVerdict(undefined)).toBe("Pending");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/siteCoc/verdictMap.test.ts`
Expected: FAIL — cannot resolve `./verdictMap`.

- [ ] **Step 3: Write the implementation**

```ts
// src/lib/siteCoc/verdictMap.ts
/**
 * Map an imported register verdict (coc_certificates.verdict, from the
 * Verification workbook) to a per-document COC status. The register is the
 * single source of truth: PASS→Pass, FAIL→Fail, anything else (CV / blank /
 * unknown) → Pending ("awaiting verification"). Matches verdictTone() prefixes.
 */
export function docStatusFromVerdict(verdict: string | null | undefined): "Pass" | "Fail" | "Pending" {
  const v = (verdict ?? "").trim().toUpperCase();
  if (v.startsWith("PASS")) return "Pass";
  if (v.startsWith("FAIL")) return "Fail";
  return "Pending";
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/siteCoc/verdictMap.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/siteCoc/verdictMap.ts src/lib/siteCoc/verdictMap.test.ts
git commit -m "feat(coc): register verdict → document status mapping (single source of truth)"
```

---

### Task 2: Stamp verdict on every pool assignment

**Files:**
- Modify: `src/lib/coc/uploadCocFiles.ts:47` (`insertCocCertificateDoc`)
- Modify: `src/lib/coc/assignPoolFile.ts`

- [ ] **Step 1: Let `insertCocCertificateDoc` accept a status**

In `src/lib/coc/uploadCocFiles.ts`, change the signature and insert (currently hard-codes `coc_status: "Pending"`):

```ts
/** Insert a COC certificate document row from an already-stored file (no upload). */
export async function insertCocCertificateDoc(opts: { subsectionId: string; cocCategoryId: string; fileName: string; fileUrl: string; fileSize: number | null; cocNumber: string | null; cocStatus?: "Pass" | "Fail" | "Pending" }): Promise<{ id: string }> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  const { data: row, error } = await supabase.from("subsection_documents").insert({
    subsection_id: opts.subsectionId, category_id: opts.cocCategoryId, file_name: opts.fileName,
    file_url: opts.fileUrl, file_size: opts.fileSize, uploaded_by: user.id,
    coc_number: opts.cocNumber, coc_status: opts.cocStatus ?? "Pending",
  }).select("id").single();
  if (error || !row) throw new Error(`Save failed: ${error?.message}`);
  return { id: row.id };
}
```

- [ ] **Step 2: Stamp from the register in `assignPoolFile`**

Replace `src/lib/coc/assignPoolFile.ts` in full:

```ts
import { supabase } from "@/integrations/supabase/client";
import { normCert } from "@/lib/siteCoc/normalize";
import { extractEvalVerdict } from "@/lib/cocFilename";
import { docStatusFromVerdict } from "@/lib/siteCoc/verdictMap";
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

/** Register-truth: the doc's status comes from the matching register cert's verdict.
 * No cert on this subsection => Pending ("awaiting verification"). */
async function lookupRegisterVerdict(siteId: string, subsectionId: string, certKey: string): Promise<string | null> {
  if (!certKey) return null;
  const { data } = await supabase.from("coc_certificates").select("verdict")
    .eq("site_id", siteId).eq("subsection_id", subsectionId).eq("cert_no_norm", certKey).limit(1);
  return (data?.[0]?.verdict as string | undefined) ?? null;
}

/** Insert a subsection_documents row for a pooled file (firing the COC rollup), link the cert, mark the pool row assigned. */
export async function assignPoolFile(siteId: string, file: AssignablePoolFile, subsectionId: string, kind: "coc" | "eval"): Promise<void> {
  const certNo = file.detected_cert_no;
  const certKey = certNo ? normCert(certNo) : "";
  const cat = await findOrCreateCategory(subsectionId, kind === "coc" ? "01 COC" : "07 COC Evaluation Reports");
  const status = docStatusFromVerdict(await lookupRegisterVerdict(siteId, subsectionId, certKey));

  const { data: dupe } = await supabase.from("subsection_documents").select("id")
    .eq("subsection_id", subsectionId).eq("category_id", cat.id).eq("file_name", file.file_name).limit(1);
  let docId = dupe?.[0]?.id as string | undefined;

  if (!docId) {
    if (kind === "coc") {
      docId = (await insertCocCertificateDoc({ subsectionId, cocCategoryId: cat.id, fileName: file.file_name, fileUrl: file.file_url, fileSize: file.file_size, cocNumber: certNo, cocStatus: status })).id;
    } else {
      let parentId: string | null = null;
      if (certNo) {
        const { data: p } = await supabase.from("subsection_documents").select("id").eq("subsection_id", subsectionId).eq("coc_number", certNo).is("parent_document_id", null).limit(1);
        parentId = p?.[0]?.id ?? null;
      }
      docId = (await insertEvaluationReportDoc({ subsectionId, evalCategoryId: cat.id, parentCocId: parentId, fileName: file.file_name, fileUrl: file.file_url, fileSize: file.file_size, cocNumber: certNo, verdict: extractEvalVerdict(file.file_name) })).id;
    }
  } else if (kind === "coc") {
    // Re-assignment of an existing doc: re-stamp its status from the register.
    await supabase.from("subsection_documents").update({ coc_status: status }).eq("id", docId);
  }

  await stampCert(siteId, subsectionId, certKey, kind === "coc" ? "coc_document_id" : "eval_document_id", docId);
  await supabase.from("coc_file_pool").update({ status: "assigned", assigned_subsection_id: subsectionId, assigned_document_id: docId }).eq("id", file.id);
}
```

Note: evaluation reports keep their filename-derived verdict — they are excluded from the rollup (category `%report%`) and drive nothing.

- [ ] **Step 3: Verify types and existing tests**

Run: `npx tsc --noEmit && npx vitest run src/lib/siteCoc`
Expected: no type errors; all existing siteCoc tests PASS.

- [ ] **Step 4: Commit**

```bash
git add src/lib/coc/uploadCocFiles.ts src/lib/coc/assignPoolFile.ts
git commit -m "feat(coc): stamp document status from register verdict on every pool assignment"
```

---

### Task 3: Re-stamp documents on workbook re-import

**Files:**
- Modify: `src/views/site-coc/useSiteCocImport.ts:76-116`

- [ ] **Step 1: Select the verdict with the new certs**

In `useSiteCocImport.ts`, add the import at the top:

```ts
import { docStatusFromVerdict } from "@/lib/siteCoc/verdictMap";
```

Change the `newCerts` declaration and select (line 76-81) to include `verdict`:

```ts
      let newCerts: { id: string; subsection_id: string | null; cert_no_norm: string; verdict: string | null }[] = [];
      if (certRows.length) {
        const { data, error } = await supabase.from("coc_certificates").insert(certRows).select("id, subsection_id, cert_no_norm, verdict");
        if (error) throw error;
        newCerts = (data ?? []) as typeof newCerts;
      }
```

- [ ] **Step 2: Stamp re-linked docs from the new verdicts**

In the re-link loop (currently lines 104-115), after the `coc_certificates` update, add a doc-status stamp. The loop becomes:

```ts
        for (const c of newCerts) {
          if (!c.subsection_id || !c.cert_no_norm) continue;
          const key = `${c.subsection_id}|${c.cert_no_norm}`;
          const cocDoc = cocByKey.get(key);
          const evalDoc = evalByKey.get(key);
          if (cocDoc || evalDoc) {
            await supabase.from("coc_certificates").update({
              ...(cocDoc ? { coc_document_id: cocDoc } : {}),
              ...(evalDoc ? { eval_document_id: evalDoc } : {}),
            }).eq("id", c.id);
          }
          // Register-truth: the new batch's verdict overwrites the attached COC
          // document's status (fires the DB rollup -> subsections.coc_status).
          if (cocDoc) {
            await supabase.from("subsection_documents")
              .update({ coc_status: docStatusFromVerdict(c.verdict) })
              .eq("id", cocDoc);
            stamped++;
          }
        }
```

Declare the counter just above the loop (next to the maps):

```ts
        let stamped = 0;
```

And extend the success toast (line ~131) so the user sees the stamping diagnostic:

```ts
      toast.success(`Imported ${summary.certs_imported} certificates across ${summary.shops_imported} shops (${summary.unmatched_count} unmatched). Re-stamped ${stamped} attached document(s) from the new verdicts.`);
```

Note: `stamped` is declared inside the `if (matchedSubIds.length)` block scope in the current code layout — declare it BEFORE that `if` block instead, so the toast (outside the block) can read it.

- [ ] **Step 3: Verify types**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/views/site-coc/useSiteCocImport.ts
git commit -m "feat(coc): re-import re-stamps attached documents from the new register verdicts"
```

---

### Task 4: Expiry becomes display-only (TS mirror)

**Files:**
- Test: `src/lib/cocHierarchy.test.ts` (create)
- Modify: `src/lib/cocHierarchy.ts:46-50`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/cocHierarchy.test.ts
import { describe, expect, it } from "vitest";
import { cocDocFails, rollupStatus, type CocDoc } from "./cocHierarchy";

const doc = (over: Partial<CocDoc>): CocDoc => ({
  id: "d1", cocType: "Initial", cocNumber: "B-1", cocIssueDate: null,
  cocExpiryDate: null, cocStatus: "Pass", fileName: "f.pdf", fileUrl: "u", ...over,
});

describe("cocDocFails (register-truth: expiry is display-only)", () => {
  it("fails only on an explicit Fail status", () => {
    expect(cocDocFails(doc({ cocStatus: "Fail" }), "2026-07-25")).toBe(true);
  });
  it("does NOT fail an expired Pass — expiry no longer drives status", () => {
    expect(cocDocFails(doc({ cocStatus: "Pass", cocExpiryDate: "2020-01-01" }), "2026-07-25")).toBe(false);
  });
  it("a Pending doc never fails", () => {
    expect(cocDocFails(doc({ cocStatus: "Pending" }), "2026-07-25")).toBe(false);
  });
});

describe("rollupStatus", () => {
  it("any Fail beats Pass", () => {
    expect(rollupStatus([doc({ cocStatus: "Pass" }), doc({ id: "d2", cocStatus: "Fail" })], "2026-07-25")).toBe("Fail");
  });
  it("an expired Pass still rolls up as Pass", () => {
    expect(rollupStatus([doc({ cocStatus: "Pass", cocExpiryDate: "2020-01-01" })], "2026-07-25")).toBe("Pass");
  });
  it("no docs => Missing; no verdicts => Pending", () => {
    expect(rollupStatus([], "2026-07-25")).toBe("Missing");
    expect(rollupStatus([doc({ cocStatus: "Pending" })], "2026-07-25")).toBe("Pending");
  });
});
```

- [ ] **Step 2: Run test to verify the expiry cases fail**

Run: `npx vitest run src/lib/cocHierarchy.test.ts`
Expected: FAIL on "does NOT fail an expired Pass" and "expired Pass still rolls up as Pass" (current code returns Fail).

- [ ] **Step 3: Implement**

In `src/lib/cocHierarchy.ts`, replace `cocDocFails` (lines 46-50):

```ts
/**
 * Register-truth model (2026-07-25): a doc fails ONLY on an explicit Fail
 * verdict. Expiry is display-only — re-verification (new workbook imports) is
 * what invalidates old certificates. The `today` param is kept for call-site
 * stability but no longer affects the result.
 */
export function cocDocFails(d: CocDoc, _today: string): boolean {
  return d.cocStatus === 'Fail';
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/cocHierarchy.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/cocHierarchy.ts src/lib/cocHierarchy.test.ts
git commit -m "feat(coc): expiry no longer auto-fails a Pass (TS mirror of register-truth rollup)"
```

---

### Task 5: DB migration — rollup without expiry + backfill

**Files:**
- Create: `supabase/migrations/20260725100000_coc_register_truth.sql`

⚠️ **Deploy caution:** this project's Supabase migration history has diverged — apply this single migration deliberately (SQL editor or targeted `supabase migration up`), never a blanket `supabase db push`. Verify the `RAISE NOTICE` counts after applying.

- [ ] **Step 1: Write the migration**

```sql
-- Register-truth COC model:
-- 1. The imported Verification workbook verdict (coc_certificates.verdict) is the ONLY
--    source of a COC document's Pass/Fail; the manual verdict UI is removed in the app.
-- 2. Expiry no longer silently fails a Pass — re-verification (new imports) invalidates
--    old certs. coc_expiry_date stays as display-only data.
-- 3. One-time backfill: stamp register-linked documents from their cert verdict; reset
--    unlinked COC-category docs to Pending ("awaiting verification").

-- (1+2) Roll-up without the expired-Pass branch (supersedes 20260612140000).
CREATE OR REPLACE FUNCTION public.rollup_subsection_coc_status(p_subsection_id uuid)
RETURNS void LANGUAGE plpgsql AS $fn$
DECLARE v_status text;
BEGIN
  WITH classified AS (
    SELECT CASE
      WHEN d.coc_status IN ('Fail','Failed','Rejected') THEN 'Fail'
      WHEN d.coc_status IN ('Pass','Approved','Valid')  THEN 'Pass'
      ELSE 'Pending'
    END AS s
    FROM public.subsection_documents d
    JOIN public.document_categories c ON c.id = d.category_id
    WHERE d.subsection_id = p_subsection_id
      AND c.name ILIKE '%coc%'
      AND c.name NOT ILIKE '%validation%'
      AND c.name NOT ILIKE '%report%'
  )
  SELECT CASE
    WHEN NOT EXISTS (SELECT 1 FROM classified)               THEN 'Missing'
    WHEN EXISTS (SELECT 1 FROM classified WHERE s = 'Fail')  THEN 'Fail'
    WHEN EXISTS (SELECT 1 FROM classified WHERE s = 'Pass')  THEN 'Pass'
    ELSE 'Pending'
  END INTO v_status;

  UPDATE public.subsections
     SET coc_status = v_status, updated_at = now()
   WHERE id = p_subsection_id
     AND coalesce(coc_status,'') <> v_status;

  PERFORM public.apply_subsection_recompute(p_subsection_id);
END;
$fn$;

-- (3) One-time backfill.
DO $do$
DECLARE
  v_linked  int := 0;
  v_matched int := 0;
  v_reset   int := 0;
BEGIN
  -- 3a. Docs directly linked from the register (coc_certificates.coc_document_id).
  --     If several certs share one doc, Fail wins over Pass wins over Pending.
  UPDATE public.subsection_documents d
     SET coc_status = v.status
    FROM (
      SELECT cert.coc_document_id AS doc_id,
             CASE WHEN bool_or(upper(coalesce(cert.verdict,'')) LIKE 'FAIL%') THEN 'Fail'
                  WHEN bool_or(upper(coalesce(cert.verdict,'')) LIKE 'PASS%') THEN 'Pass'
                  ELSE 'Pending' END AS status
        FROM public.coc_certificates cert
       WHERE cert.coc_document_id IS NOT NULL
       GROUP BY cert.coc_document_id
    ) v
   WHERE d.id = v.doc_id
     AND coalesce(d.coc_status,'') <> v.status;
  GET DIAGNOSTICS v_linked = ROW_COUNT;

  -- 3b. Docs matched by subsection + normalised cert number but not yet linked.
  UPDATE public.subsection_documents d
     SET coc_status = v.status
    FROM (
      SELECT cert.subsection_id, cert.cert_no_norm,
             CASE WHEN bool_or(upper(coalesce(cert.verdict,'')) LIKE 'FAIL%') THEN 'Fail'
                  WHEN bool_or(upper(coalesce(cert.verdict,'')) LIKE 'PASS%') THEN 'Pass'
                  ELSE 'Pending' END AS status
        FROM public.coc_certificates cert
       WHERE cert.subsection_id IS NOT NULL AND coalesce(cert.cert_no_norm,'') <> ''
       GROUP BY cert.subsection_id, cert.cert_no_norm
    ) v
   WHERE d.subsection_id = v.subsection_id
     AND d.coc_number IS NOT NULL
     AND upper(regexp_replace(d.coc_number, '[\s-]+', '', 'g')) = v.cert_no_norm
     AND NOT EXISTS (SELECT 1 FROM public.coc_certificates c2 WHERE c2.coc_document_id = d.id)
     AND coalesce(d.coc_status,'') <> v.status;
  GET DIAGNOSTICS v_matched = ROW_COUNT;

  -- 3c. COC-certificate docs with NO register backing => Pending (awaiting verification).
  --     Honest outcome of register-truth: manual Passes without register backing regress.
  UPDATE public.subsection_documents d
     SET coc_status = 'Pending'
    FROM public.document_categories c
   WHERE c.id = d.category_id
     AND c.name ILIKE '%coc%' AND c.name NOT ILIKE '%validation%' AND c.name NOT ILIKE '%report%'
     AND NOT EXISTS (SELECT 1 FROM public.coc_certificates cert WHERE cert.coc_document_id = d.id)
     AND NOT EXISTS (
       SELECT 1 FROM public.coc_certificates cert
        WHERE cert.subsection_id = d.subsection_id
          AND d.coc_number IS NOT NULL
          AND cert.cert_no_norm = upper(regexp_replace(d.coc_number, '[\s-]+', '', 'g'))
     )
     AND coalesce(d.coc_status,'') <> 'Pending';
  GET DIAGNOSTICS v_reset = ROW_COUNT;

  RAISE NOTICE 'coc_register_truth backfill: % linked stamped, % cert-no matched stamped, % unbacked reset to Pending',
    v_linked, v_matched, v_reset;
END; $do$;

-- Recompute every subsection's coc_status + is_compliant under the new rules.
DO $do$ DECLARE r record; BEGIN
  FOR r IN SELECT id FROM public.subsections WHERE deleted_at IS NULL LOOP
    PERFORM public.rollup_subsection_coc_status(r.id);
  END LOOP;
END; $do$;

NOTIFY pgrst, 'reload schema';
```

- [ ] **Step 2: Sanity-check locally if a local Supabase stack is running (skip if not)**

Run: `supabase db lint 2>/dev/null || echo "no local stack — reviewed by eye"`
Expected: no syntax errors reported (or the skip message).

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260725100000_coc_register_truth.sql
git commit -m "feat(coc): register-truth migration — rollup w/o expiry auto-fail + verdict backfill"
```

---

### Task 6: CocCertificateList becomes a read-only evidence view

**Files:**
- Rewrite: `src/components/coc/CocCertificateList.tsx`
- Modify: `src/views/subsection-detail/CocMeteringTab.tsx:109` (drop `onSaved` prop)

- [ ] **Step 1: Replace the component**

Replace `src/components/coc/CocCertificateList.tsx` in full. Removed: Verdict/type/number/date editors, row Save, `EvalVerdict`. Kept: preview/download/delete, eval upload (attachment only).

```tsx
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Eye, Download, Trash2, Loader2, Upload } from "lucide-react";
import { toCocDoc, groupCocDocuments, CocDoc } from "@/lib/cocHierarchy";
import type { SupabaseDocument } from "@/views/subsection-detail/types";

interface Props {
  cocDocuments: SupabaseDocument[];
  evaluationDocuments: SupabaseDocument[];
  deletingDocumentId: string | null;
  uploadingFile: boolean;
  setPreviewDocument: (doc: { file_name: string; file_url: string } | null) => void;
  handleDownloadDocument: (url: string, fileName: string) => void;
  setDeleteDocumentId: (id: string | null) => void;
  onUploadEvaluationReport: (parentCoc: { id: string; coc_number: string | null }, file: File) => Promise<void>;
}

const today = () => new Date().toISOString().slice(0, 10);

function StatusBadge({ d }: { d: CocDoc }) {
  if (d.cocStatus === "Fail") return <Badge variant="destructive" className="text-xs">Fail</Badge>;
  if (d.cocStatus === "Pass") return <Badge variant="default" className="text-xs">Pass</Badge>;
  return <Badge variant="secondary" className="text-xs">Awaiting verification</Badge>;
}

function DocActions({ raw, p }: { raw: SupabaseDocument; p: Props }) {
  return (
    <div className="flex items-center gap-1">
      <Button size="sm" variant="ghost" onClick={() => p.setPreviewDocument({ file_name: raw.file_name, file_url: raw.file_url })} title="Preview document"><Eye className="h-4 w-4" /></Button>
      <Button size="sm" variant="ghost" onClick={() => p.handleDownloadDocument(raw.file_url, raw.file_name)} title="Download document"><Download className="h-4 w-4" /></Button>
      <Button size="sm" variant="ghost" onClick={() => p.setDeleteDocumentId(raw.id)} disabled={p.deletingDocumentId === raw.id}>
        {p.deletingDocumentId === raw.id ? <Loader2 className="h-4 w-4 animate-spin text-destructive" /> : <Trash2 className="h-4 w-4 text-destructive" />}
      </Button>
    </div>
  );
}

function CocRow({ raw, isInitial, ...p }: { raw: SupabaseDocument; isInitial: boolean } & Props) {
  const d: CocDoc = toCocDoc(raw);
  const meta = [
    d.cocNumber ? `No. ${d.cocNumber}` : "No cert number",
    d.cocIssueDate ? `Issued ${d.cocIssueDate}` : null,
    d.cocExpiryDate ? `Expires ${d.cocExpiryDate}` : null,
  ].filter(Boolean).join(" · ");
  const evalDoc = p.evaluationDocuments.find(e => e.parent_document_id === raw.id);

  return (
    <div className="flex flex-col gap-2 p-3 bg-muted/40 rounded-md">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2 min-w-0">
          <Badge variant={isInitial ? "default" : "outline"} className="text-xs">{isInitial ? "Initial" : d.cocType}</Badge>
          <span className="text-sm font-medium truncate">{raw.file_name}</span>
        </div>
        <div className="flex items-center gap-1">
          <StatusBadge d={d} />
          <DocActions raw={raw} p={p as Props} />
        </div>
      </div>
      <p className="text-xs text-muted-foreground">{meta} — verdict comes from the imported verification register.</p>
      {evalDoc ? (
        <div className="rounded-md border bg-background px-3 py-2 flex items-center justify-between gap-2 flex-wrap">
          <div className="min-w-0">
            <span className="text-xs font-medium text-muted-foreground">Evaluation report</span>
            <p className="text-sm truncate">{evalDoc.file_name}</p>
          </div>
          <DocActions raw={evalDoc} p={p as Props} />
        </div>
      ) : (
        <div className="rounded-md border border-dashed bg-background px-3 py-2">
          <label className="flex items-center justify-between gap-2 cursor-pointer">
            <span className="text-xs text-muted-foreground">No evaluation report yet</span>
            <span className="inline-flex items-center gap-1 text-xs font-medium text-primary">
              <Upload className="h-4 w-4" /> Upload evaluation report
            </span>
            <input
              type="file"
              className="hidden"
              accept=".html,.htm,.pdf,.doc,.docx,.jpg,.jpeg,.png"
              disabled={p.uploadingFile}
              onChange={async (e) => {
                const f = e.target.files?.[0];
                if (f) { await p.onUploadEvaluationReport({ id: raw.id, coc_number: d.cocNumber }, f); }
                e.target.value = "";
              }}
            />
          </label>
        </div>
      )}
    </div>
  );
}

export function CocCertificateList(p: Props) {
  const docs = p.cocDocuments.map(toCocDoc);
  if (docs.length === 0) {
    return <p className="text-sm text-muted-foreground">No COC certificates uploaded yet. Upload one below.</p>;
  }
  const group = groupCocDocuments(docs, today());
  const rawById = new Map(p.cocDocuments.map((r) => [r.id, r]));
  return (
    <div className="space-y-2">
      {group.initial && <CocRow raw={rawById.get(group.initial.id)!} isInitial {...p} />}
      {group.supplementaries.length > 0 && (
        <div className="ml-4 border-l-2 border-border pl-3 space-y-2">
          {group.supplementaries.map((s) => <CocRow key={s.id} raw={rawById.get(s.id)!} isInitial={false} {...p} />)}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Drop the removed `onSaved` prop at the call site**

In `src/views/subsection-detail/CocMeteringTab.tsx`, delete this line from the `<CocCertificateList …>` JSX (currently line 109):

```tsx
            onSaved={() => { fetchSupabaseDocuments(); refetchSubsection(); }}
```

- [ ] **Step 3: Verify types**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/coc/CocCertificateList.tsx src/views/subsection-detail/CocMeteringTab.tsx
git commit -m "feat(coc): subsection COC list is read-only evidence — verdicts come from the register"
```

---

### Task 7: Subsection COC upload routes through the pool

**Files:**
- Create: `src/lib/coc/poolUpload.ts`
- Modify: `src/views/site-coc/useSiteCocPool.ts:33-74` (reuse the shared uploader)
- Modify: `src/views/subsection-detail/CocMeteringTab.tsx` (dropzone + copy)
- Modify: `src/views/subsection-detail/useSubsectionDetail.ts` (expose `siteId`)
- Modify: `src/views/SubsectionDetail.tsx:221` (pass `siteId`)
- Modify: `src/lib/coc/uploadCocFiles.ts:26-44` (delete now-unused `uploadCocCertificate`)

- [ ] **Step 1: Create the shared pool uploader**

```ts
// src/lib/coc/poolUpload.ts
import { supabase } from "@/integrations/supabase/client";
import { extractCocNumber } from "@/lib/cocFilename";
import { classifyCocFile } from "@/lib/siteCoc/routeUpload";
import { reassignPendingPoolFiles } from "@/lib/coc/reassignPool";

const sanitize = (s: string) => s.replace(/[^a-zA-Z0-9.-]/g, "_");

export interface PoolRouteResult {
  poolId: string;
  detectedCertNo: string | null;
  /** null => still pending in the Exceptions queue */
  assignedSubsectionId: string | null;
  /** failure reason when still pending */
  reason: string | null;
}

/** Upload ONE file into the site COC pool (storage + coc_file_pool row). */
export async function uploadFileToPool(siteId: string, file: File): Promise<{ poolId: string; detectedCertNo: string | null }> {
  const { data: { user } } = await supabase.auth.getUser();
  const ts = Date.now();
  const path = `${siteId}/_pool/${ts}-${sanitize(file.name)}`;
  const { data: up, error: upErr } = await supabase.storage.from("documents").upload(path, file);
  if (upErr || !up?.path) throw new Error(upErr?.message ?? "upload error");
  const { data: urlData } = supabase.storage.from("documents").getPublicUrl(up.path);
  const detected = extractCocNumber(file.name);
  const { data: row, error } = await supabase.from("coc_file_pool").insert({
    site_id: siteId, file_name: file.name, file_url: urlData.publicUrl, file_size: file.size,
    detected_cert_no: detected, detected_kind: classifyCocFile(file.name), uploaded_by: user?.id ?? null,
  }).select("id").single();
  if (error || !row) {
    await supabase.storage.from("documents").remove([up.path]);
    throw new Error(error?.message ?? "insert error");
  }
  return { poolId: row.id, detectedCertNo: detected };
}

/** One-pipe ingestion for subsection-level uploads: pool the file, run
 * auto-assignment, and report where it landed. */
export async function poolRouteFile(siteId: string, file: File): Promise<PoolRouteResult> {
  const { poolId, detectedCertNo } = await uploadFileToPool(siteId, file);
  await reassignPendingPoolFiles(siteId);
  const { data } = await supabase.from("coc_file_pool")
    .select("status, reason, assigned_subsection_id").eq("id", poolId).single();
  const assigned = data?.status === "assigned";
  return {
    poolId,
    detectedCertNo,
    assignedSubsectionId: assigned ? ((data?.assigned_subsection_id as string | null) ?? null) : null,
    reason: assigned ? null : ((data?.reason as string | null) ?? null),
  };
}
```

- [ ] **Step 2: Reuse it in `useSiteCocPool.upload`**

In `src/views/site-coc/useSiteCocPool.ts`: add `import { uploadFileToPool } from "@/lib/coc/poolUpload";`, remove the now-unused `sanitize` const (line 15) and the `extractCocNumber`/`classifyCocFile` imports (lines 4-5), and replace the per-file body inside `mapWithConcurrency` (lines 41-58) with:

```ts
        async (file): Promise<FileOutcome> => {
          try {
            const { poolId, detectedCertNo } = await uploadFileToPool(siteId, file);
            return { name: file.name, state: "uploaded", poolId, detectedCertNo };
          } catch (e: any) {
            return { name: file.name, state: "failed", error: e?.message ?? "error" };
          }
        },
```

Also delete the `const { data: { user } } = await supabase.auth.getUser();` line above `mapWithConcurrency` (the helper fetches the user itself). Keep the `supabase` import — `refetch`, `updateCertNo` and `remove` still use it.

- [ ] **Step 3: Expose `siteId` from `useSubsectionDetail`**

In `src/views/subsection-detail/useSubsectionDetail.ts`, `siteId` already exists in scope (line 21: `const { clientId, siteId, subsectionId } = useParams();`). Find the hook's `return {` object and add `siteId,` as the first entry if it is not already returned. Verify with:

Run: `grep -n "return {" src/views/subsection-detail/useSubsectionDetail.ts`

- [ ] **Step 4: Pass it into `CocMeteringTab`**

In `src/views/SubsectionDetail.tsx`, inside the `<CocMeteringTab` JSX (line ~221), add below `subsectionId={hook.subsectionId}`:

```tsx
            siteId={hook.siteId}
```

- [ ] **Step 5: Re-route the COC dropzone in `CocMeteringTab`**

In `src/views/subsection-detail/CocMeteringTab.tsx`:

a. Change imports: remove `import { uploadCocCertificate } from "@/lib/coc/uploadCocFiles";` and add `import { poolRouteFile } from "@/lib/coc/poolUpload";`.

b. Add `siteId: string | undefined;` to `CocMeteringTabProps` (after `subsectionId`) and `siteId,` to the destructured params.

c. Add the reason-text map above the component:

```tsx
const POOL_REASON_TEXT: Record<string, string> = {
  no_cert_detected: "no cert number in the filename",
  cert_not_found: "cert number not in the imported register",
  cert_has_no_subsection: "cert's shop isn't matched to a subsection yet",
  ambiguous_cert: "cert number appears on more than one subsection",
  assign_failed: "assignment failed",
};
```

d. Replace the COC upload `onChange` handler (the whole `onChange={async (e) => { … }}` block for the COC dropzone, currently lines 129-160) with:

```tsx
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  if (!siteId || !subsectionId) { toast.error("Missing site context"); return; }
                  try {
                    setUploadingFile(true);
                    toast.info("Uploading COC document...");
                    const res = await poolRouteFile(siteId, file);
                    if (res.assignedSubsectionId === subsectionId) {
                      toast.success("COC attached — verdict taken from the verification register.");
                    } else if (res.assignedSubsectionId) {
                      toast.info("Per the register this certificate belongs to a different subsection — it was attached there.", { duration: 8000 });
                    } else {
                      toast.warning(`File didn't match the imported register (${POOL_REASON_TEXT[res.reason ?? ""] ?? "no match"}). Find it under Site COC → Exceptions.`, { duration: 8000 });
                    }
                    fetchSupabaseDocuments();
                    refetchSubsection();
                  } catch (error: any) {
                    toast.error(error?.message || "Failed to upload COC document", { duration: 5000 });
                  } finally {
                    setUploadingFile(false);
                    e.target.value = "";
                  }
                }}
```

Note: the old handler's `documentCategories.find(cat => cat.name === '01 COC')`, `setUploadCategoryId`, and `setUploadFile` calls are gone for the COC dropzone (the pool pipeline resolves the category itself). The metering dropzone further down keeps using them — do not touch it.

e. Update the `cocSummary` copy (lines 84-85) — replace the `pending` and fallback branches:

```tsx
    if (st === "pending") return { cls: "bg-amber-50 text-amber-700 border-amber-200", text: "COC: PENDING — awaiting verification. Verdicts come from the imported verification register (Site COC tab)." };
    return { cls: "bg-amber-50 text-amber-700 border-amber-200", text: "COC: not yet recorded — upload the certificate below; it will match the imported register automatically." };
```

- [ ] **Step 6: Delete the dead direct-upload helper**

In `src/lib/coc/uploadCocFiles.ts`, delete ONLY the `uploadCocCertificate` function (lines 26-44). Keep the line-2 import unchanged — `extractCocNumber` is still used by `uploadEvaluationReport` (line 73) and `extractEvalVerdict` by the same function (line 74).

Run: `grep -rn "uploadCocCertificate" src` — Expected: no matches.

- [ ] **Step 7: Verify types + tests**

Run: `npx tsc --noEmit && npm test`
Expected: clean.

- [ ] **Step 8: Commit**

```bash
git add src/lib/coc/poolUpload.ts src/views/site-coc/useSiteCocPool.ts src/views/subsection-detail/CocMeteringTab.tsx src/views/subsection-detail/useSubsectionDetail.ts src/views/SubsectionDetail.tsx src/lib/coc/uploadCocFiles.ts
git commit -m "feat(coc): one ingestion pipe — subsection uploads route through the site pool"
```

---

### Task 8: Exceptions queue

**Files:**
- Rewrite: `src/views/site-coc/AssignSubTab.tsx`
- Modify: `src/views/site-coc/SiteCocTab.tsx` (controlled tabs, label, props)
- Modify: `src/views/site-coc/SiteCocLoadCard.tsx` (pre-import guard)
- Modify: `src/views/site-coc/useSiteCocPool.ts:96-109` (per-file bulk failures)

- [ ] **Step 1: Rewrite `AssignSubTab.tsx`**

```tsx
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { rankSubsectionCandidates } from "@/lib/siteCoc/rankCandidates";
import type { PoolFile } from "./useSiteCocPool";
import type { SubsectionOption } from "./useSiteCoc";

const REASON_LABEL: Record<string, string> = {
  cert_has_no_subsection: "Cert found in the register, but its shop isn't matched to a subsection",
  ambiguous_cert: "Cert number appears on more than one subsection — pick the right one",
  cert_not_found: "Cert number not in the imported register — check the workbook or fix the number",
  no_cert_detected: "No cert number detected in the filename — type it in to match",
  assign_failed: "Assignment failed — retry",
};

const EDITABLE_CERT_REASONS = new Set(["no_cert_detected", "cert_not_found"]);

function FileRow({ file, subsections, onAssign, onUpdateCertNo, busy }: {
  file: PoolFile; subsections: SubsectionOption[];
  onAssign: (f: PoolFile, sub: string) => void;
  onUpdateCertNo: (f: PoolFile, certNo: string) => void;
  busy: boolean;
}) {
  const [sub, setSub] = useState("");
  const [certNo, setCertNo] = useState(file.detected_cert_no ?? "");
  const canEditCert = EDITABLE_CERT_REASONS.has(file.reason ?? "");

  // Ambiguous certs already carry their candidate subsections — surface those
  // first; fall back to fuzzy name suggestions otherwise.
  const candidates = useMemo(() => {
    if (file.reason === "ambiguous_cert" && file.candidate_ids?.length) {
      return file.candidate_ids
        .map(id => subsections.find(s => s.id === id))
        .filter((s): s is SubsectionOption => !!s)
        .map(s => ({ id: s.id, name: s.name, score: 1 }));
    }
    return rankSubsectionCandidates(file.detected_cert_no ?? file.file_name, subsections, 3).filter(c => c.score > 0.3);
  }, [file, subsections]);

  return (
    <div className="flex flex-col gap-2 border-b py-2 sm:flex-row sm:items-center sm:gap-3">
      <span className="text-xs max-w-[18rem] truncate sm:flex-1" title={file.file_name}>{file.file_name}</span>
      {canEditCert ? (
        <form className="flex items-center gap-1" onSubmit={(e) => { e.preventDefault(); onUpdateCertNo(file, certNo.trim()); }}>
          <Input className="h-8 w-32 font-mono text-xs" placeholder="Cert no." value={certNo} onChange={(e) => setCertNo(e.target.value)} />
          <Button type="submit" size="sm" variant="outline" className="h-8" disabled={busy || certNo.trim() === (file.detected_cert_no ?? "")}>Match</Button>
        </form>
      ) : (
        <span className="font-mono text-xs whitespace-nowrap w-28">{file.detected_cert_no ?? "—"}</span>
      )}
      <div className="flex flex-wrap gap-1 sm:flex-1">
        {candidates.map(s => (
          <Button key={s.id} size="sm" variant="outline" className="h-7" onClick={() => onAssign(file, s.id)}>
            {s.name}{s.score < 1 && <span className="ml-1 text-[10px] text-muted-foreground">{Math.round(s.score * 100)}%</span>}
          </Button>
        ))}
        {!candidates.length && <span className="text-xs text-muted-foreground">no close match</span>}
      </div>
      <Select value={sub} onValueChange={(v) => { setSub(v); onAssign(file, v); }}>
        <SelectTrigger className="h-8 w-56"><SelectValue placeholder="Choose subsection…" /></SelectTrigger>
        <SelectContent>
          {subsections.map(s => <SelectItem key={s.id} value={s.id}>{s.name}{s.tenant_name && s.tenant_name !== s.name ? ` · ${s.tenant_name}` : ""}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  );
}

export function AssignSubTab({ pending, subsections, onAssign, onAssignMany, onReassign, onUpdateCertNo, onGoToSchedule, hasImport, busy }: {
  pending: PoolFile[];
  subsections: SubsectionOption[];
  onAssign: (f: PoolFile, sub: string) => void;
  onAssignMany: (files: PoolFile[], sub: string) => void;
  onReassign: () => void;
  onUpdateCertNo: (f: PoolFile, certNo: string) => void;
  onGoToSchedule: () => void;
  hasImport: boolean;
  busy: boolean;
}) {
  const [batchSub, setBatchSub] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const groups = useMemo(() => {
    const m = new Map<string, PoolFile[]>();
    for (const f of pending) {
      const k = f.reason ?? "cert_not_found";
      const arr = m.get(k) ?? [];
      arr.push(f);
      m.set(k, arr);
    }
    return Array.from(m.entries());
  }, [pending]);

  const toggle = (id: string) => setSelected(prev => {
    const n = new Set(prev);
    if (n.has(id)) n.delete(id); else n.add(id);
    return n;
  });

  if (!pending.length) {
    return (
      <div className="space-y-2">
        <p className="text-sm text-muted-foreground">No exceptions — every uploaded COC file is attached to its subsection.</p>
        {!hasImport && <p className="text-sm text-amber-700">No register imported yet. Import the DB Schedule and Verification workbooks first — files can only match after that.</p>}
      </div>
    );
  }

  const selectedFiles = pending.filter(f => selected.has(f.id));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">{pending.length} file(s) need attention, grouped by what's wrong.</p>
        <Button size="sm" variant="outline" disabled={busy} onClick={onReassign}>Re-run auto-assign</Button>
      </div>

      {!hasImport && (
        <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
          No register imported yet — import the DB Schedule and Verification workbooks, then re-run auto-assign.
        </p>
      )}

      {selectedFiles.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-md border bg-muted/30 p-2">
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
        <div key={reason} className="space-y-1">
          <h4 className="text-sm font-semibold flex items-center gap-2">
            <Badge variant="outline">{files.length}</Badge> {REASON_LABEL[reason] ?? reason}
            {reason === "cert_has_no_subsection" && (
              <Button size="sm" variant="link" className="h-6 px-1" onClick={onGoToSchedule}>Fix in Schedule →</Button>
            )}
          </h4>
          <div>
            {files.map(f => (
              <div key={f.id} className="flex items-start gap-2">
                <div className="pt-3"><Checkbox checked={selected.has(f.id)} onCheckedChange={() => toggle(f.id)} /></div>
                <div className="flex-1"><FileRow file={f} subsections={subsections} onAssign={onAssign} onUpdateCertNo={onUpdateCertNo} busy={busy} /></div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Wire it up in `SiteCocTab.tsx`**

a. Add `useState` for the active tab (it's already imported): after line 27 (`const [rerunning, setRerunning] = useState(false);`) add:

```tsx
  const [tab, setTab] = useState("schedule");
```

b. Make the tabs controlled — change `<Tabs defaultValue="schedule">` (line 80) to:

```tsx
      <Tabs value={tab} onValueChange={setTab}>
```

c. Rename the trigger (line 85):

```tsx
          <TabsTrigger value="assign">Exceptions{pool.pending.length ? ` (${pool.pending.length})` : ""}</TabsTrigger>
```

d. Pass the new props (line 91):

```tsx
        <TabsContent value="assign"><Card><CardContent className="pt-4"><AssignSubTab pending={pool.pending} subsections={subsections} onAssign={(f, s) => pool.assignManual(f, s, f.detected_kind === "eval" ? "eval" : "coc")} onAssignMany={pool.assignManyTo} onReassign={pool.reassign} onUpdateCertNo={pool.updateCertNo} onGoToSchedule={() => setTab("schedule")} hasImport={!!batch} busy={pool.busy} /></CardContent></Card></TabsContent>
```

e. Pass the guard to the load card (line 78):

```tsx
      <SiteCocLoadCard pool={pool} hasImport={!!batch} />
```

- [ ] **Step 3: Pre-import guard in `SiteCocLoadCard.tsx`**

Change the component signature (line 7):

```tsx
export function SiteCocLoadCard({ pool, hasImport }: { pool: ReturnType<typeof useSiteCocPool>; hasImport: boolean }) {
```

Directly under `<CardContent className="space-y-3">` (line 22), add:

```tsx
        {!hasImport && (
          <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
            Import the register first — files can only auto-match after the DB Schedule + Verification workbooks are imported above.
          </p>
        )}
```

And update the two copy strings mentioning the Assign tab: in the dropzone hint (line 32) and the footer note (line 50), replace "the Assign tab" / "**Assign** tab" with "the **Exceptions** tab".

- [ ] **Step 4: Per-file bulk-assign failures in `useSiteCocPool.ts`**

Replace `assignManyTo` (lines 96-109):

```ts
  const assignManyTo = useCallback(async (files: PoolFile[], subsectionId: string) => {
    if (!siteId || !files.length) return;
    setBusy(true);
    try {
      let n = 0;
      const failed: string[] = [];
      for (const f of files) {
        try { await assignPoolFile(siteId, f, subsectionId, f.detected_kind === "eval" ? "eval" : "coc"); n++; }
        catch (e) {
          failed.push(f.file_name);
          if (process.env.NODE_ENV === "development") console.error("batch assign failed", f.file_name, e);
        }
      }
      if (failed.length) toast.error(`Failed to assign: ${failed.join(", ")}`, { duration: 8000 });
      toast.success(`Assigned ${n}/${files.length} file(s).`);
      await refetch();
      onAssigned();
    } finally { setBusy(false); }
  }, [siteId, refetch, onAssigned]);
```

- [ ] **Step 5: Verify types + tests**

Run: `npx tsc --noEmit && npm test`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add src/views/site-coc/AssignSubTab.tsx src/views/site-coc/SiteCocTab.tsx src/views/site-coc/SiteCocLoadCard.tsx src/views/site-coc/useSiteCocPool.ts
git commit -m "feat(coc): Assign tab becomes an Exceptions queue with in-place fixes"
```

---

### Task 9: Downstream — contractor badge colors + dashboard to-dos

**Files:**
- Modify: `src/views/ContractorSiteDetail.tsx:78-94`
- Modify: `src/views/ContractorSubsectionDetail.tsx:65-81`
- Modify: `src/lib/siteDeliverables.ts:136-141` and `:179-190`

- [ ] **Step 1: Fix `getStatusColor` in BOTH contractor views**

Scope note: the spec's "one shared tone helper" is satisfied minimally — after this plan, nothing writes legacy vocab anymore (all writes are stamped Pass/Fail/Pending), so these two read-side switches just gain the canonical values. Extracting a single cross-portal helper would touch the internal and client surfaces too and is consciously deferred (YAGNI).

In each file the function is identical — extend the green and red cases (the rest of the switch stays):

```ts
  const getStatusColor = (status: string) => {
    switch (status) {
      case "Pass":
      case "Valid":
      case "Approved":
      case "Completed":
        return "bg-green-500/10 text-green-700 border-green-500/20";
      case "In Progress":
        return "bg-blue-500/10 text-blue-700 border-blue-500/20";
      case "Pending":
      case "Expiring Soon":
        return "bg-yellow-500/10 text-yellow-700 border-yellow-500/20";
      case "Fail":
      case "Failed":
      case "Rejected":
      case "Missing":
      case "Expired":
        return "bg-red-500/10 text-red-700 border-red-500/20";
      default:
        return "bg-gray-500/10 text-gray-700 border-gray-500/20";
    }
  };
```

- [ ] **Step 2: Failed COC keeps its to-do open (`siteDeliverables.ts`)**

Replace `cocItemCopy` (lines 136-141):

```ts
function cocItemCopy(coc_status?: string | null): { label: string; action: string } {
  const st = (coc_status || '').toLowerCase();
  if (['fail', 'failed', 'rejected'].includes(st)) return { label: 'COC failed', action: 'Review COC' };
  if (st === 'pending') return { label: 'COC awaiting verification', action: 'View COC' };
  return { label: 'COC missing', action: 'Upload COC' };
}
```

Replace `cocVerdictRecorded` and its comment (lines 179-185):

```ts
// Register-truth model (2026-07-25, supersedes the 2026-06-16 decision): a COC
// to-do clears only on a verified Pass from the register. A recorded Fail stays
// visible as "Review COC" — it still blocks compliance via the gate.
function cocResolved(s: SubsectionForCompliance): boolean {
  return hasValidCocStatus(s.coc_status);
}
```

In `buildCoc` (lines 187-190), replace both uses:

```ts
  const done = required.filter(cocResolved).length;
  const outstanding = required.filter(s => !cocResolved(s)); // Missing / Pending / Failed
```

Then check whether `hasFailedCocStatus` is still used anywhere in the file — if not, remove it from the import at the top of `siteDeliverables.ts`.

Run: `grep -n "hasFailedCocStatus" src/lib/siteDeliverables.ts`

- [ ] **Step 3: Verify types, lint, tests**

Run: `npx tsc --noEmit && npm run lint && npm test`
Expected: clean (note: existing `siteDeliverables` tests, if any assert the Fail-clears behaviour, must be updated to the new rule — a Fail is now outstanding).

- [ ] **Step 4: Commit**

```bash
git add src/views/ContractorSiteDetail.tsx src/views/ContractorSubsectionDetail.tsx src/lib/siteDeliverables.ts
git commit -m "feat(coc): Pass renders green in contractor portal; failed COC keeps a to-do open"
```

---

### Task 10: Full verification + wrap-up

**Files:** none new.

- [ ] **Step 1: Full suite**

Run: `npm test && npm run lint && npm run build`
Expected: all tests pass, no lint errors, production build succeeds.

- [ ] **Step 2: Manual E2E in the dev preview (one test site)**

Use the browser preview tools against `npm run dev` (per `.claude/launch.json` if present):

1. Site COC tab: import both workbooks → Schedule matched, verdicts visible in Certificates.
2. Drop a batch of PDFs into the Load card: a file whose filename cert number exactly matches a PASS register row lands on its subsection with status **Pass** — no manual step. Check the subsection's CoC/Metering tab shows the read-only row with a green Pass badge.
3. A garbage-named file appears in **Exceptions** under "No cert number detected" with an editable cert-no field; typing the right number and clicking Match assigns it.
4. Subsection CoC tab: dropzone upload of a register-matched file attaches with register verdict; a non-matching file warns and points to Site COC → Exceptions.
5. Contractor portal: a passing COC badge renders green (was grey).
6. Client portal COC tab: register verdict and subsection status agree for the same cert.
7. Re-import with a changed verdict (PASS→FAIL on one cert): the attached document and subsection flip to Fail, and the dashboard shows "COC failed / Review COC".

- [ ] **Step 3: Apply the migration to staging/prod**

Per project process (memory: migration history diverged — never blanket `db push`): apply `20260725100000_coc_register_truth.sql` as a single targeted migration, then check the `RAISE NOTICE` backfill counts and spot-check 2-3 subsections whose status changed.

- [ ] **Step 4: Finish the branch**

Invoke the superpowers:finishing-a-development-branch skill (merge/PR decision belongs to Arno; web deploys go live via push to `main`).
