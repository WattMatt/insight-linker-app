# COC Manual Workflow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the automated COC validation engine with a manual workflow — upload a COC, record a Pass/Fail verdict + number + issue/expiry dates (staff can override), and on Fail capture free-text reasons and generate a per-COC PDF report.

**Architecture:** `coc_status` (manual verdict) on `subsections` drives `is_compliant` via a simplified trigger (Pass + not expired). A small `CocReviewForm` replaces the AI-approval UI; a focused report module renders the per-COC PDF. The AI extraction + deterministic engine (`extract-coc`, `validate-coc`, `coc_validation_settings`, `coc_extractions`, `coc_local_validations`, `coc_validations`) and their UI are deleted. Sequenced so the app works at every step (trigger first, tables dropped last).

**Tech Stack:** TypeScript, React 18, Next.js 15, Supabase (Management API via PAT for prod DB/edge changes), vitest.

**Reference spec:** `docs/superpowers/specs/2026-06-11-coc-manual-workflow-design.md`

**Live schema (verified 2026-06-11):** `subsections` has `coc_status, coc_number, coc_issue_date, coc_type, is_coc_required, is_compliant` (no expiry/reasons/reviewer yet). `coc_status` values in prod: `Missing(1133), Failed(122), Approved(57), null(16), N/A(14), Pending(8), Pass(4), pending(4), none(2)`. Trigger `trg_sync_coc_compliance` runs `sync_coc_compliance_status()` which currently reads `coc_validations`.

**Prod changes need the PAT** (Supabase Management API: `POST /v1/projects/oltzgidkjxwsukvkomof/database/query`, `supabase functions delete`). The controller applies these; tasks state the exact SQL/commands.

---

## File structure

| File | Responsibility |
|------|----------------|
| `supabase/migrations/20260611160000_coc_manual_workflow.sql` (new) | Columns + status remap + new trigger; tables dropped in a later migration |
| `supabase/migrations/20260611170000_drop_coc_validation_tables.sql` (new) | Drop the 4 validation tables (Task 7, after code stops reading them) |
| `src/lib/cocCompliance.ts` (new) | Pure `deriveIsCompliant()` + status helpers + tests |
| `src/lib/cocCompliance.test.ts` (new) | Unit tests |
| `src/components/CocReviewForm.tsx` (new) | The manual verdict form |
| `src/lib/cocReport.ts` (new) | Per-COC PDF report generator |
| `src/views/subsection-detail/CocMeteringTab.tsx` (modify) | Host the new form + COC card + report button; drop `InlineViolationOverrides` |
| `src/views/subsection-detail/useSubsectionDetail.ts` (modify) | Remove `validate-coc`/`extract-coc` invocations |
| `src/views/subsection-detail/SubsectionDialogs.tsx` (modify) | Remove COCPreviewApproval/Dialog wiring |
| `src/components/ComplianceDashboard.tsx` (modify) | Remove COC validation UI + invocations |
| Deleted | `COCPreviewApproval.tsx`, `COCPreviewDialog.tsx`, `COCReviewStatus.tsx`, `compliance/COCValidationLogCard.tsx`, `compliance/InlineViolationOverrides.tsx`, `supabase/functions/{validate-coc,extract-coc}/` |

---

## Task 1: DB — columns, status remap, simplified trigger (apply via PAT)

**Files:** Create `supabase/migrations/20260611160000_coc_manual_workflow.sql`

- [ ] **Step 1: Write the migration**

```sql
-- COC manual workflow: add fields, normalise status, derive is_compliant from the manual
-- verdict + expiry (no longer from coc_validations). Validation tables dropped in a later migration.

ALTER TABLE public.subsections
  ADD COLUMN IF NOT EXISTS coc_expiry_date    date,
  ADD COLUMN IF NOT EXISTS coc_failure_reasons text,
  ADD COLUMN IF NOT EXISTS coc_reviewed_by    uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS coc_reviewed_at    timestamptz;

-- Normalise the messy coc_status vocabulary to: Missing | Pending | Pass | Fail | N/A
UPDATE public.subsections SET coc_status = CASE
  WHEN coc_status IN ('Approved','Valid','Pass')      THEN 'Pass'
  WHEN coc_status IN ('Failed','Fail','Rejected')     THEN 'Fail'
  WHEN coc_status IN ('Pending','pending')            THEN 'Pending'
  WHEN coc_status = 'N/A'                             THEN 'N/A'
  ELSE 'Missing'
END;
ALTER TABLE public.subsections ALTER COLUMN coc_status SET DEFAULT 'Missing';
ALTER TABLE public.subsections DROP CONSTRAINT IF EXISTS subsections_coc_status_check;
ALTER TABLE public.subsections ADD CONSTRAINT subsections_coc_status_check
  CHECK (coc_status IN ('Missing','Pending','Pass','Fail','N/A'));

-- Replace the compliance trigger body (stops reading coc_validations)
CREATE OR REPLACE FUNCTION public.sync_coc_compliance_status()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $fn$
BEGIN
  IF NOT COALESCE(NEW.is_coc_required, false) THEN
    NEW.is_compliant := true;
  ELSE
    NEW.is_compliant := (NEW.coc_status = 'Pass'
      AND (NEW.coc_expiry_date IS NULL OR NEW.coc_expiry_date >= current_date));
  END IF;
  RETURN NEW;
END;
$fn$;

-- Recreate the trigger so it also fires on coc_expiry_date changes
DROP TRIGGER IF EXISTS trg_sync_coc_compliance ON public.subsections;
CREATE TRIGGER trg_sync_coc_compliance
  BEFORE INSERT OR UPDATE OF coc_status, is_coc_required, coc_expiry_date
  ON public.subsections FOR EACH ROW EXECUTE FUNCTION public.sync_coc_compliance_status();

-- Backfill is_compliant under the new rule
UPDATE public.subsections SET is_compliant = (
  NOT COALESCE(is_coc_required,false)
  OR (coc_status='Pass' AND (coc_expiry_date IS NULL OR coc_expiry_date >= current_date))
);

NOTIFY pgrst, 'reload schema';
```

- [ ] **Step 2: Apply to prod via the Management API (controller, with the PAT)**

`POST https://api.supabase.com/v1/projects/oltzgidkjxwsukvkomof/database/query` with the file's SQL as `{query}`. Expected HTTP 201.

- [ ] **Step 3: Verify**

Query: `select coc_status, count(*) from public.subsections group by 1 order by 2 desc`
Expected: only `Missing/Pending/Pass/Fail/N/A` values. And `select conname from pg_constraint where conname='subsections_coc_status_check'` returns 1 row.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260611160000_coc_manual_workflow.sql
git commit -m "feat(db): COC manual-workflow columns + status remap + simplified trigger"
```

---

## Task 2: Pure compliance helper (TDD)

**Files:** Create `src/lib/cocCompliance.ts`, `src/lib/cocCompliance.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, it, expect } from 'vitest';
import { deriveIsCompliant, COC_STATUSES, isExpired } from './cocCompliance';

describe('deriveIsCompliant', () => {
  const today = '2026-06-11';
  it('not required => compliant regardless of status', () => {
    expect(deriveIsCompliant({ isCocRequired: false, cocStatus: 'Fail', cocExpiryDate: null }, today)).toBe(true);
  });
  it('required + Pass + no expiry => compliant', () => {
    expect(deriveIsCompliant({ isCocRequired: true, cocStatus: 'Pass', cocExpiryDate: null }, today)).toBe(true);
  });
  it('required + Pass + future expiry => compliant', () => {
    expect(deriveIsCompliant({ isCocRequired: true, cocStatus: 'Pass', cocExpiryDate: '2027-01-01' }, today)).toBe(true);
  });
  it('required + Pass + past expiry => not compliant', () => {
    expect(deriveIsCompliant({ isCocRequired: true, cocStatus: 'Pass', cocExpiryDate: '2025-01-01' }, today)).toBe(false);
  });
  it('required + Fail => not compliant', () => {
    expect(deriveIsCompliant({ isCocRequired: true, cocStatus: 'Fail', cocExpiryDate: null }, today)).toBe(false);
  });
  it('required + Missing => not compliant', () => {
    expect(deriveIsCompliant({ isCocRequired: true, cocStatus: 'Missing', cocExpiryDate: null }, today)).toBe(false);
  });
});

describe('isExpired', () => {
  it('null expiry is never expired', () => expect(isExpired(null, '2026-06-11')).toBe(false));
  it('past date is expired', () => expect(isExpired('2025-01-01', '2026-06-11')).toBe(true));
  it('today is not expired', () => expect(isExpired('2026-06-11', '2026-06-11')).toBe(false));
});

describe('COC_STATUSES', () => {
  it('is the 5-value set', () => expect(COC_STATUSES).toEqual(['Missing','Pending','Pass','Fail','N/A']));
});
```

- [ ] **Step 2: Run to verify fail**

Run: `npm test -- cocCompliance`
Expected: FAIL — cannot resolve `./cocCompliance`.

- [ ] **Step 3: Implement**

```ts
export const COC_STATUSES = ['Missing','Pending','Pass','Fail','N/A'] as const;
export type CocStatus = typeof COC_STATUSES[number];

export interface CocComplianceInput {
  isCocRequired?: boolean | null;
  cocStatus?: string | null;
  cocExpiryDate?: string | null; // ISO yyyy-mm-dd
}

export function isExpired(cocExpiryDate: string | null | undefined, today: string): boolean {
  if (!cocExpiryDate) return false;
  return cocExpiryDate < today;
}

export function deriveIsCompliant(s: CocComplianceInput, today: string): boolean {
  if (!s.isCocRequired) return true;
  return s.cocStatus === 'Pass' && !isExpired(s.cocExpiryDate, today);
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npm test -- cocCompliance`  → Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/cocCompliance.ts src/lib/cocCompliance.test.ts
git commit -m "feat(coc): pure compliance helper with tests"
```

---

## Task 3: CocReviewForm component

**Files:** Create `src/components/CocReviewForm.tsx`

- [ ] **Step 1: Implement the form**

```tsx
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface CocReviewValue {
  coc_status: "Pass" | "Fail";
  coc_number: string;
  coc_issue_date: string | null;
  coc_expiry_date: string | null;
  coc_failure_reasons: string | null;
}

interface Props { subsectionId: string; initial?: Partial<CocReviewValue>; onSaved?: (v: CocReviewValue) => void; }

export function CocReviewForm({ subsectionId, initial, onSaved }: Props) {
  const [verdict, setVerdict] = useState<"Pass" | "Fail">((initial?.coc_status as any) || "Pass");
  const [number, setNumber] = useState(initial?.coc_number || "");
  const [issue, setIssue] = useState(initial?.coc_issue_date || "");
  const [expiry, setExpiry] = useState(initial?.coc_expiry_date || "");
  const [reasons, setReasons] = useState(initial?.coc_failure_reasons || "");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    const value: CocReviewValue = {
      coc_status: verdict,
      coc_number: number.trim(),
      coc_issue_date: issue || null,
      coc_expiry_date: expiry || null,
      coc_failure_reasons: verdict === "Fail" ? (reasons.trim() || null) : null,
    };
    const { error } = await supabase.from("subsections").update({
      ...value, coc_reviewed_by: user?.id ?? null, coc_reviewed_at: new Date().toISOString(),
    }).eq("id", subsectionId);
    setSaving(false);
    if (error) { toast.error(`Failed to save COC review: ${error.message}`); return; }
    toast.success("COC review saved");
    onSaved?.(value);
  };

  return (
    <div className="space-y-4">
      <div>
        <Label>Verdict</Label>
        <RadioGroup value={verdict} onValueChange={(v) => setVerdict(v as any)} className="flex gap-6 mt-2">
          <div className="flex items-center gap-2"><RadioGroupItem value="Pass" id="coc-pass" /><Label htmlFor="coc-pass">Pass</Label></div>
          <div className="flex items-center gap-2"><RadioGroupItem value="Fail" id="coc-fail" /><Label htmlFor="coc-fail">Fail</Label></div>
        </RadioGroup>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div><Label htmlFor="coc-number">COC number</Label><Input id="coc-number" value={number} onChange={(e) => setNumber(e.target.value)} /></div>
        <div><Label htmlFor="coc-issue">Issue date</Label><Input id="coc-issue" type="date" value={issue} onChange={(e) => setIssue(e.target.value)} /></div>
        <div><Label htmlFor="coc-expiry">Expiry date</Label><Input id="coc-expiry" type="date" value={expiry} onChange={(e) => setExpiry(e.target.value)} /></div>
      </div>
      {verdict === "Fail" && (
        <div><Label htmlFor="coc-reasons">Failure reasons</Label>
          <Textarea id="coc-reasons" rows={4} value={reasons} onChange={(e) => setReasons(e.target.value)} placeholder="List the items in the COC that cause it to fail…" /></div>
      )}
      <Button onClick={save} disabled={saving}>{saving ? "Saving…" : "Save COC review"}</Button>
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit 2>&1 | grep "CocReviewForm.tsx" || echo "no new errors in CocReviewForm"`
Expected: "no new errors in CocReviewForm". (If `@/components/ui/radio-group` or `textarea` is missing, confirm with `ls src/components/ui/ | grep -E "radio-group|textarea"` — both are present per the ui inventory.)

- [ ] **Step 3: Commit**

```bash
git add src/components/CocReviewForm.tsx
git commit -m "feat(coc): manual COC review form"
```

---

## Task 4: Host the form in the subsection COC tab + update the COC card

**Files:** Modify `src/views/subsection-detail/CocMeteringTab.tsx`

- [ ] **Step 1: Read the file** to find where `InlineViolationOverrides` and the COC status display are rendered (`grep -n "InlineViolationOverrides\|coc_status\|COCPreview" src/views/subsection-detail/CocMeteringTab.tsx`).

- [ ] **Step 2: Replace the COC validation area with the manual form + status card.** Remove the `InlineViolationOverrides` import and JSX. Render `<CocReviewForm subsectionId={subsection.id} initial={{ coc_status: subsection.coc_status, coc_number: subsection.coc_number, coc_issue_date: subsection.coc_issue_date, coc_expiry_date: subsection.coc_expiry_date, coc_failure_reasons: subsection.coc_failure_reasons }} onSaved={() => refetch()} />` (use the tab's existing subsection object + its refetch/reload callback — find its name in the file). Show a status line: verdict badge + number + issue/expiry, and an "Expired"/"Expires soon" flag using `isExpired(subsection.coc_expiry_date, new Date().toISOString().slice(0,10))` from `@/lib/cocCompliance`.

- [ ] **Step 3: Type-check** `npx tsc --noEmit 2>&1 | grep "CocMeteringTab.tsx" || echo "clean"` — expect no NEW errors (pre-existing baseline errors elsewhere are fine).

- [ ] **Step 4: Visual check** — open a subsection's COC tab, mark Pass/Fail, save, confirm the row updates and `is_compliant` flips (Pass→compliant, Fail→not), and the Fail path shows the reasons box.

- [ ] **Step 5: Commit** `git add src/views/subsection-detail/CocMeteringTab.tsx && git commit -m "feat(coc): manual review form in the subsection COC tab"`

---

## Task 5: Per-COC PDF report

**Files:** Create `src/lib/cocReport.ts`; modify `CocMeteringTab.tsx` (add the button)

- [ ] **Step 1: Implement the report generator** using the existing pdfmake setup (mirror `src/lib/pdfmakeInspectionReport.ts` imports/structure).

```ts
import { getPdfMake } from "@/lib/pdfMakeConfig"; // confirm the exported accessor name in pdfMakeConfig.ts

export interface CocReportData {
  subsectionName: string; siteName?: string;
  coc_status: string; coc_number?: string | null;
  coc_issue_date?: string | null; coc_expiry_date?: string | null;
  coc_failure_reasons?: string | null;
}

export async function generateCocReport(d: CocReportData): Promise<Blob> {
  const pdfMake = await getPdfMake();
  const reasons = (d.coc_failure_reasons || "").split(/\r?\n/).map(s => s.trim()).filter(Boolean);
  const doc: any = {
    pageSize: "A4", pageMargins: [40, 50, 40, 50],
    content: [
      { text: "Certificate of Compliance — Report", style: "h1" },
      { text: `${d.siteName ? d.siteName + " · " : ""}${d.subsectionName}`, margin: [0, 0, 0, 12] },
      { table: { widths: ["35%", "65%"], body: [
        ["Verdict", d.coc_status],
        ["COC number", d.coc_number || "—"],
        ["Issue date", d.coc_issue_date || "—"],
        ["Expiry date", d.coc_expiry_date || "—"],
      ]}, layout: "lightHorizontalLines", margin: [0, 0, 0, 16] },
      ...(d.coc_status === "Fail" ? [
        { text: "Reasons for failure", style: "h2", margin: [0, 8, 0, 6] },
        reasons.length ? { ul: reasons } : { text: "No reasons recorded.", italics: true },
      ] : []),
    ],
    styles: { h1: { fontSize: 18, bold: true, margin: [0,0,0,8] }, h2: { fontSize: 14, bold: true } },
  };
  return new Promise<Blob>((resolve) => pdfMake.createPdf(doc).getBlob(resolve));
}
```

- [ ] **Step 2: Add a "COC report" button** in `CocMeteringTab.tsx` that calls `generateCocReport({...subsection})` then `downloadBlob(blob, \`COC-${subsection.name}.pdf\`)` (use the existing `@/lib/fileDownload` `downloadBlob`). Emphasise it when `coc_status === 'Fail'`.

- [ ] **Step 3: Type-check + visual** — generate a report for a Failed COC; confirm the PDF lists the reasons; `npx tsc --noEmit 2>&1 | grep -E "cocReport.ts|CocMeteringTab.tsx" || echo clean`.

- [ ] **Step 4: Commit** `git add src/lib/cocReport.ts src/views/subsection-detail/CocMeteringTab.tsx && git commit -m "feat(coc): per-COC PDF report"`

---

## Task 6: Remove the validation engine (code + edge fns)

**Files:** delete `supabase/functions/{validate-coc,extract-coc}/`; delete `src/components/COCPreviewApproval.tsx`, `src/components/COCPreviewDialog.tsx`, `src/components/COCReviewStatus.tsx`, `src/components/compliance/COCValidationLogCard.tsx`, `src/components/compliance/InlineViolationOverrides.tsx`; modify `ComplianceDashboard.tsx`, `SubsectionDialogs.tsx`, `useSubsectionDetail.ts`.

- [ ] **Step 1: Remove invocations.** `grep -rn "validate-coc\|extract-coc" src` → remove every `supabase.functions.invoke('validate-coc'…)` / `'extract-coc'` block and any now-dead state/handlers in `COCPreviewApproval.tsx` (being deleted), `ComplianceDashboard.tsx`, `useSubsectionDetail.ts`. In `useSubsectionDetail.ts` and `ComplianceDashboard.tsx`, also remove reads of `coc_validations`/`coc_extractions` (`grep -rn "coc_validations\|coc_extractions\|coc_local_validations\|coc_validation_settings" src`).

- [ ] **Step 2: Remove component renders + imports.** In `ComplianceDashboard.tsx` and `SubsectionDialogs.tsx`, delete the JSX + imports for `COCPreviewApproval`, `COCPreviewDialog`, `COCValidationLogCard`. In `CocMeteringTab.tsx` confirm `InlineViolationOverrides` is already gone (Task 4).

- [ ] **Step 2b: Delete the files.**
```bash
rm src/components/COCPreviewApproval.tsx src/components/COCPreviewDialog.tsx src/components/COCReviewStatus.tsx \
   src/components/compliance/COCValidationLogCard.tsx src/components/compliance/InlineViolationOverrides.tsx
rm -rf supabase/functions/validate-coc supabase/functions/extract-coc
```

- [ ] **Step 3: Delete the deployed edge functions (controller, PAT):**
`supabase functions delete validate-coc --project-ref oltzgidkjxwsukvkomof` and `… extract-coc …`.

- [ ] **Step 4: Verify no dangling refs.** `grep -rn "COCPreviewApproval\|COCPreviewDialog\|COCValidationLogCard\|InlineViolationOverrides\|validate-coc\|extract-coc\|coc_validations\|coc_extractions\|coc_validation_settings\|coc_local_validations" src` → **expect zero hits**. Then `npm test` (15+ pass) and `npx tsc --noEmit 2>&1 | grep -E "ComplianceDashboard|SubsectionDialogs|useSubsectionDetail|CocMeteringTab" || echo "no new errors in the touched files"`.

- [ ] **Step 5: Commit** `git add -A && git commit -m "refactor(coc): remove the validation engine + UI (extract-coc/validate-coc, preview-approval, overrides)"`

---

## Task 7: Drop the validation tables (apply via PAT)

**Files:** Create `supabase/migrations/20260611170000_drop_coc_validation_tables.sql`

- [ ] **Step 1: Write the migration** (only after Task 6 confirmed nothing reads them):

```sql
DROP TABLE IF EXISTS public.coc_validations       CASCADE;
DROP TABLE IF EXISTS public.coc_extractions       CASCADE;
DROP TABLE IF EXISTS public.coc_validation_settings CASCADE;
DROP TABLE IF EXISTS public.coc_local_validations CASCADE;
NOTIFY pgrst, 'reload schema';
-- Kept: coc_compliance_photos (evidence), contractor_coc_uploads (upload table).
```

- [ ] **Step 2: Apply via the Management API** (`POST …/database/query`). Expected HTTP 201.

- [ ] **Step 3: Verify** `select table_name from information_schema.tables where table_schema='public' and table_name like 'coc_%'` → expect only `coc_compliance_photos` (and `contractor_coc_uploads` if it matches a different prefix). The 4 validation tables are gone.

- [ ] **Step 4: Commit** `git add supabase/migrations/20260611170000_drop_coc_validation_tables.sql && git commit -m "feat(db): drop COC validation tables (manual workflow replaces them)"`

---

## Task 8: Final verification

- [ ] **Step 1: Tests** `npm test` → all pass (cocCompliance + siteHealth if present on this branch).
- [ ] **Step 2: Type-check delta** `npx tsc --noEmit 2>&1 | wc -l` is not higher than the pre-branch baseline (the branch introduces no new errors).
- [ ] **Step 3: End-to-end manual** on a real subsection: upload a COC → mark Fail with reasons → `is_compliant` shows false → generate report (lists reasons) → staff override to Pass with a future expiry → `is_compliant` flips true. Re-confirm no COC validation/extraction UI remains anywhere.
- [ ] **Step 4: Regenerate types** `types.ts` should be regenerated (Management API or `supabase gen types`) so the dropped tables + new columns are reflected; commit it.
- [ ] **Step 5: Update GAPS** note in `docs/system-reference/GAPS.md`: G-SEC-16 (COC validation gaming) is **dissolved** — the engine is removed; `extract-coc`/`validate-coc` deleted from prod. Commit.

---

## Notes / sequencing
- Tasks 1–5 keep the old engine alive (tables still present) so nothing breaks while the new path is added; Task 6 removes the code, Task 7 drops the tables only once no code reads them.
- `coc_compliance_photos` and `contractor_coc_uploads` are retained (evidence + the upload table; the latter is anon-locked per G-SEC-11).
- Out of scope: COC version history; per-item SANS checklist; migrating historical `coc_validations` violation detail into the new free-text reasons (the new reasons start blank — existing failed COCs keep `coc_status='Fail'` with empty reasons until re-reviewed).
