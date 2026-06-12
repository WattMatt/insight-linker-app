# COC Manual Workflow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the automated COC validation engine with a manual workflow — upload a COC, record a Pass/Fail verdict + number + issue/expiry dates (staff can override), and on Fail capture free-text reasons and generate a per-COC PDF report.

**Architecture:** `coc_status` (manual verdict) on `subsections` is a GATE on `is_compliant`, integrated into the existing inspection-driven recompute (`apply_subsection_recompute`): `is_compliant = inspection_compliant AND NOT(is_coc_required AND COC-failed)`. A failed/expired COC forces non-compliant; a Pass does NOT auto-promote (inspections still own the base). The old `sync_coc_compliance_status` BEFORE-trigger is dropped (single owner). A small `CocReviewForm` replaces the AI-approval UI; a focused report module renders the per-COC PDF. The AI extraction + deterministic engine (`extract-coc`, `validate-coc`, `coc_validation_settings`, `coc_extractions`, `coc_local_validations`, `coc_validations`, `coc_compliance_photos` + its snapshot) and their UI are deleted. Sequenced replacement-first so the app works at every step (gate + form first, tables dropped last).

**DECISIONS LOCKED (Arno, 2026-06-12):** (1) failed COC FORCES non-compliant — gate in recompute; (2) replacement-first; (3) drop the 6 coc validation tables OUTRIGHT (no snapshot). Verified inventory: `docs/superpowers/COC-VALIDATION-STRIPOUT-TRACKER.md`.

**Tech Stack:** TypeScript, React 18, Next.js 15, Supabase (Management API via PAT for prod DB/edge changes), vitest.

**Reference spec:** `docs/superpowers/specs/2026-06-11-coc-manual-workflow-design.md`

**Live schema (verified 2026-06-11):** `subsections` has `coc_status, coc_number, coc_issue_date, coc_type, is_coc_required, is_compliant` (no expiry/reasons/reviewer yet). `coc_status` values in prod: `Missing(1133), Failed(122), Approved(57), null(16), N/A(14), Pending(8), Pass(4), pending(4), none(2)`. Trigger `trg_sync_coc_compliance` runs `sync_coc_compliance_status()` which currently reads `coc_validations`.

**Prod changes need the PAT** (Supabase Management API: `POST /v1/projects/oltzgidkjxwsukvkomof/database/query`, `supabase functions delete`). The controller applies these; tasks state the exact SQL/commands.

---

## File structure

| File | Responsibility |
|------|----------------|
| `supabase/migrations/20260611160000_coc_manual_workflow.sql` (LIVE) | Columns + status remap + (old informational trigger, superseded by Task 1) |
| `supabase/migrations/20260612120000_coc_compliance_gate.sql` (new, Task 1) | Drop the informational BEFORE-trigger; add the COC gate into `apply_subsection_recompute`; backfill |
| `supabase/migrations/20260612130000_drop_coc_validation_tables.sql` (new, Task 7) | Drop the 6 validation tables outright (after code stops reading them) |
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

## Task 1: DB — COC gate in the recompute path (apply via PAT)

> Migration `20260611160000` (columns + status remap + the OLD informational `sync_coc_compliance_status` trigger) and `20260611161000` (permissive CHECK) are ALREADY LIVE. This task SUPERSEDES the informational trigger with the gate-in-recompute design (decision #1). It drops the BEFORE-trigger and integrates the COC verdict into `apply_subsection_recompute` so there is a SINGLE owner of `is_compliant`.

**Files:** Create `supabase/migrations/20260612120000_coc_compliance_gate.sql`

- [ ] **Step 1: Write the migration**

```sql
-- COC verdict becomes a GATE on is_compliant, integrated into the inspection-driven
-- recompute. A failed/expired COC forces non-compliant; a Pass does NOT auto-promote.
-- Drops the old informational BEFORE-trigger so is_compliant has a single owner.

DROP TRIGGER IF EXISTS trg_sync_coc_compliance ON public.subsections;
DROP FUNCTION IF EXISTS public.sync_coc_compliance_status();

-- Re-create apply_subsection_recompute with the COC gate appended. Body is the live
-- definition plus the gate block (vocab-tolerant for the transitional old-flow writes).
CREATE OR REPLACE FUNCTION public.apply_subsection_recompute(p_subsection_id uuid)
 RETURNS void
 LANGUAGE plpgsql
AS $function$
declare
  r record;
  v_is_compliant boolean;
  c record;
  v_coc_fail boolean;
begin
  if p_subsection_id is null then return; end if;

  select * into r from public.recompute_subsection_installation_status(p_subsection_id);

  v_is_compliant := case r.status
    when 'compliant'          then true
    when 'non_compliant'      then false
    when 'requires_attention' then false
    when 'incomplete'         then null
  end;

  -- COC gate: a required COC that is failed/rejected, or an expired pass, forces
  -- is_compliant = false. Vocab-tolerant (old flow may still write Failed/Approved).
  select s.is_coc_required, s.coc_status, s.coc_expiry_date
    into c
    from public.subsections s where s.id = p_subsection_id;
  v_coc_fail := coalesce(c.is_coc_required, false) and (
       c.coc_status in ('Fail','Failed','Rejected')
    or (c.coc_status in ('Pass','Approved','Valid')
        and c.coc_expiry_date is not null
        and c.coc_expiry_date < current_date)
  );
  if v_coc_fail then
    v_is_compliant := false;
  end if;

  update public.subsections s
     set installation_status = r.status,
         installation_score  = r.score,
         is_compliant        = v_is_compliant,
         updated_at          = now()
   where s.id = p_subsection_id
     and s.deleted_at is null
     and (
       coalesce(s.installation_status, '') <> coalesce(r.status, '')
       or coalesce(s.installation_score, -1) <> coalesce(r.score, -1)
       or coalesce(s.is_compliant, false) <> coalesce(v_is_compliant, false)
     );
end;
$function$;

-- Backfill: recompute every live subsection so is_compliant reflects the gate.
DO $do$
DECLARE rec record;
BEGIN
  FOR rec IN SELECT id FROM public.subsections WHERE deleted_at IS NULL LOOP
    PERFORM public.apply_subsection_recompute(rec.id);
  END LOOP;
END;
$do$;

NOTIFY pgrst, 'reload schema';
```

- [ ] **Step 2: Apply to prod via the Management API (controller, with the PAT)**

`POST https://api.supabase.com/v1/projects/oltzgidkjxwsukvkomof/database/query` with the file's SQL as `{query}`. Expected HTTP 201.

- [ ] **Step 3: Verify**

- `SELECT tgname FROM pg_trigger WHERE tgname='trg_sync_coc_compliance'` → **0 rows** (BEFORE-trigger gone).
- `SELECT proname FROM pg_proc WHERE proname='sync_coc_compliance_status'` → **0 rows**.
- Gate works: pick a subsection that is currently compliant + `is_coc_required=true`, set `coc_status='Fail'`, confirm `is_compliant` flips to false; set it back to `Pass`, confirm it returns to the inspection-driven value. (Use a scratch update, then restore.)

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260612120000_coc_compliance_gate.sql
git commit -m "feat(db): COC verdict gates is_compliant via recompute (drop informational trigger)"
```

---

## Task 2: Pure COC-gate helper (TDD)

> NOTE the gate semantics (decision #1): `is_compliant` is OWNED by the DB recompute (inspection base AND not COC-gated). The client does NOT compute final compliance — it reads `is_compliant` from the row. This helper is the client-side MIRROR of the DB gate predicate, for display ("COC is blocking compliance" / "expired") only. It deliberately does NOT take inspection state and must NOT be used as the source of truth.

**Files:** Create `src/lib/cocCompliance.ts`, `src/lib/cocCompliance.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, it, expect } from 'vitest';
import { cocFailsGate, COC_STATUSES, isExpired } from './cocCompliance';

describe('cocFailsGate (mirror of the DB recompute gate)', () => {
  const today = '2026-06-12';
  it('not required => never gates, even on Fail', () => {
    expect(cocFailsGate({ isCocRequired: false, cocStatus: 'Fail', cocExpiryDate: null }, today)).toBe(false);
  });
  it('required + Fail => gates (forces non-compliant)', () => {
    expect(cocFailsGate({ isCocRequired: true, cocStatus: 'Fail', cocExpiryDate: null }, today)).toBe(true);
  });
  it('required + legacy "Failed"/"Rejected" => gates (vocab-tolerant)', () => {
    expect(cocFailsGate({ isCocRequired: true, cocStatus: 'Failed', cocExpiryDate: null }, today)).toBe(true);
    expect(cocFailsGate({ isCocRequired: true, cocStatus: 'Rejected', cocExpiryDate: null }, today)).toBe(true);
  });
  it('required + Pass + future expiry => does NOT gate', () => {
    expect(cocFailsGate({ isCocRequired: true, cocStatus: 'Pass', cocExpiryDate: '2027-01-01' }, today)).toBe(false);
  });
  it('required + Pass + past expiry => gates', () => {
    expect(cocFailsGate({ isCocRequired: true, cocStatus: 'Pass', cocExpiryDate: '2025-01-01' }, today)).toBe(true);
  });
  it('required + Pass + no expiry => does NOT gate', () => {
    expect(cocFailsGate({ isCocRequired: true, cocStatus: 'Pass', cocExpiryDate: null }, today)).toBe(false);
  });
  it('required + Missing/Pending => does NOT gate (inspections decide)', () => {
    expect(cocFailsGate({ isCocRequired: true, cocStatus: 'Missing', cocExpiryDate: null }, today)).toBe(false);
    expect(cocFailsGate({ isCocRequired: true, cocStatus: 'Pending', cocExpiryDate: null }, today)).toBe(false);
  });
});

describe('isExpired', () => {
  it('null expiry is never expired', () => expect(isExpired(null, '2026-06-12')).toBe(false));
  it('past date is expired', () => expect(isExpired('2025-01-01', '2026-06-12')).toBe(true));
  it('today is not expired', () => expect(isExpired('2026-06-12', '2026-06-12')).toBe(false));
});

describe('COC_STATUSES', () => {
  it('is the 5-value set', () => expect(COC_STATUSES).toEqual(['Missing','Pending','Pass','Fail','N/A']));
});
```

- [ ] **Step 2: Run to verify fail**

Run: `npm test -- cocCompliance`
Expected: FAIL — cannot resolve `./cocCompliance`.

- [ ] **Step 3: Implement** (mirror the DB gate in `apply_subsection_recompute` exactly)

```ts
export const COC_STATUSES = ['Missing','Pending','Pass','Fail','N/A'] as const;
export type CocStatus = typeof COC_STATUSES[number];

// Vocab-tolerant sets — must match the DB gate during the old-flow transition.
const FAILED_VALUES = new Set(['Fail','Failed','Rejected']);
const PASS_VALUES = new Set(['Pass','Approved','Valid']);

export interface CocGateInput {
  isCocRequired?: boolean | null;
  cocStatus?: string | null;
  cocExpiryDate?: string | null; // ISO yyyy-mm-dd
}

export function isExpired(cocExpiryDate: string | null | undefined, today: string): boolean {
  if (!cocExpiryDate) return false;
  return cocExpiryDate < today;
}

/**
 * Client-side mirror of the DB recompute COC gate. Returns true when a required COC
 * forces the subsection non-compliant (failed, or an expired pass). NOT the source of
 * truth for is_compliant — that is owned by apply_subsection_recompute in the DB.
 */
export function cocFailsGate(s: CocGateInput, today: string): boolean {
  if (!s.isCocRequired) return false;
  const status = s.cocStatus ?? '';
  if (FAILED_VALUES.has(status)) return true;
  if (PASS_VALUES.has(status) && isExpired(s.cocExpiryDate, today)) return true;
  return false;
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npm test -- cocCompliance`  → Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/cocCompliance.ts src/lib/cocCompliance.test.ts
git commit -m "feat(coc): pure COC-gate helper with tests"
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

- [ ] **Step 4: Visual check** — open a subsection's COC tab, mark Fail, save, confirm `is_compliant` becomes false (the DB recompute gate fires); mark Pass, confirm the COC gate releases and `is_compliant` returns to the inspection-driven value (Pass does NOT auto-promote a subsection whose inspections fail). The Fail path shows the reasons box. Form must `refetch()` after save so the UI reflects the recompute.

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

## Task 7: Drop the validation tables OUTRIGHT (apply via PAT)

> Decision #3: drop all 6 validation tables permanently, NO snapshot. VERIFIED prod tables (2026-06-12): `coc_validations` (239 rows), `coc_extractions` (53), `coc_validation_settings` (1), `coc_local_validations` (0), `coc_compliance_photos` (0), `coc_compliance_photos_snap_20260421` (0). All are validation-engine artefacts. KEEP `contractor_coc_uploads` (separate manual-upload table, anon-locked) — confirm it's untouched.

**Files:** Create `supabase/migrations/20260612130000_drop_coc_validation_tables.sql`

- [ ] **Step 1: Write the migration** (only after Task 6 confirmed nothing reads them):

```sql
-- Drop the COC auto-validation engine tables outright (no snapshot — decision #3).
DROP TABLE IF EXISTS public.coc_validations                    CASCADE;
DROP TABLE IF EXISTS public.coc_extractions                    CASCADE;
DROP TABLE IF EXISTS public.coc_validation_settings            CASCADE;
DROP TABLE IF EXISTS public.coc_local_validations              CASCADE;
DROP TABLE IF EXISTS public.coc_compliance_photos              CASCADE;
DROP TABLE IF EXISTS public.coc_compliance_photos_snap_20260421 CASCADE;
NOTIFY pgrst, 'reload schema';
-- Kept: contractor_coc_uploads (manual upload target, anon-locked per G-SEC-11).
```

- [ ] **Step 2: Apply via the Management API** (`POST …/database/query`). Expected HTTP 201.

- [ ] **Step 3: Verify** `select table_name from information_schema.tables where table_schema='public' and table_name like 'coc%'` → **expect 0 rows**. Confirm `contractor_coc_uploads` still exists.

- [ ] **Step 4: Commit** `git add supabase/migrations/20260612130000_drop_coc_validation_tables.sql && git commit -m "feat(db): drop COC validation tables outright (manual workflow replaces them)"`

---

## Task 8: Final verification

- [ ] **Step 1: Tests** `npm test` → all pass (cocCompliance + siteHealth if present on this branch).
- [ ] **Step 2: Type-check delta** `npx tsc --noEmit 2>&1 | wc -l` is not higher than the pre-branch baseline (the branch introduces no new errors).
- [ ] **Step 3: End-to-end manual** on a real subsection (pick one whose inspections already pass): upload a COC → mark Fail with reasons → `is_compliant` shows false (gate) → generate report (lists reasons) → staff override to Pass with a future expiry → `is_compliant` returns to true (gate released, inspections pass). Also confirm a subsection with FAILING inspections stays non-compliant even when COC=Pass. Re-confirm no COC validation/extraction UI remains anywhere.
- [ ] **Step 4: Regenerate types** `types.ts` should be regenerated (Management API or `supabase gen types`) so the dropped tables + new columns are reflected; commit it.
- [ ] **Step 5: Update GAPS** note in `docs/system-reference/GAPS.md`: G-SEC-16 (COC validation gaming) is **dissolved** — the engine is removed; `extract-coc`/`validate-coc` deleted from prod. Commit.

---

## Notes / sequencing
- Tasks 1–5 keep the old engine alive (tables still present) so nothing breaks while the new path is added; Task 6 removes the code, Task 7 drops the tables only once no code reads them.
- `coc_compliance_photos` and `contractor_coc_uploads` are retained (evidence + the upload table; the latter is anon-locked per G-SEC-11).
- Out of scope: COC version history; per-item SANS checklist; migrating historical `coc_validations` violation detail into the new free-text reasons (the new reasons start blank — existing failed COCs keep `coc_status='Fail'` with empty reasons until re-reviewed).
