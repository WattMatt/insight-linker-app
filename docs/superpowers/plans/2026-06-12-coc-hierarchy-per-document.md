# COC Per-Document Hierarchy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Record COC data per uploaded certificate (Initial + Supplementaries) grouped under each DB/tenant (subsection), each with its own Pass/Fail, shown in the subsection COC tab, a site-level view, and the client PDF — with `subsections.coc_status` becoming a derived roll-up that keeps the existing `is_compliant` gate working.

**Architecture:** Per-certificate facts live on `subsection_documents` (existing `coc_*` columns + new `coc_expiry_date`). A pure `cocHierarchy.ts` (group + order + roll-up, TDD) is the single source of truth for all three UI surfaces. A DB trigger rolls the certificate verdicts up into `subsections.coc_status`, which feeds the unchanged `apply_subsection_recompute` compliance gate.

**Tech Stack:** TypeScript, React 18, Next.js 15, Supabase (Management API via PAT for prod DB), vitest, pdfmake.

**Reference spec:** `docs/superpowers/specs/2026-06-12-coc-hierarchy-per-document-design.md`

**Verified live (2026-06-12):** `subsection_documents` has `coc_number, coc_issue_date, coc_type, coc_status` (no expiry). `coc_type`: Initial/Supplementary/Temporary/initial/Not Marked. `coc_status`: null/rejected/approved/pending/Failed/Approved. COC categories: `01 COC`, `01_COC`, `COC` (exclude `COC Validation Reports`). The hook selects COC fields at `useSubsectionDetail.ts:148`; identifies COC docs at `:606-609` via `name.toLowerCase().includes('coc')`. The compliance gate `apply_subsection_recompute` reads `subsections.coc_status` (required + `'Fail'` → `is_compliant=false`) — left UNCHANGED; only its input changes.

**Prod DB changes via PAT** (Management API `POST /v1/projects/oltzgidkjxwsukvkomof/database/query`). Controller applies; record a `schema_migrations` row (see `prod-migration-drift` memory).

---

## File structure

| File | Responsibility |
|------|----------------|
| `src/lib/cocHierarchy.ts` (new) | Pure: normalize, `cocDocFails`, `groupCocDocuments`, `rollupStatus`, `toCocDoc`. Single source of truth. |
| `src/lib/cocHierarchy.test.ts` (new) | Unit tests mirroring the SQL roll-up. |
| `supabase/migrations/20260612140000_coc_per_document_rollup.sql` (new) | Add `coc_expiry_date`; normalize values; `rollup_subsection_coc_status` fn + trigger; backfill. |
| `src/views/subsection-detail/types.ts` (modify) | Add `coc_expiry_date` to `SupabaseDocument`. |
| `src/views/subsection-detail/useSubsectionDetail.ts` (modify) | Load `coc_expiry_date` in the doc select; exclude validation-report categories from COC docs. |
| `src/components/coc/CocCertificateList.tsx` (new) | Per-document capture: Initial + supplementaries, editable type/number/dates/verdict. |
| `src/views/subsection-detail/CocMeteringTab.tsx` (modify) | Render `CocCertificateList`; remove `CocReviewForm` + verdict block. |
| `src/components/coc/SiteCocHierarchy.tsx` (new) | Site-level read-only grouped view across all subsections. |
| `src/views/SiteDetail.tsx` (modify) | Mount `SiteCocHierarchy`. |
| `src/lib/siteSummaryRenderSpec.ts` (modify) | Add the grouped COC hierarchy section to the client PDF. |
| Deleted | `src/components/CocReviewForm.tsx` (subsection-level form, superseded). |

---

## Task 1: Pure core — `cocHierarchy.ts` (TDD)

**Files:** Create `src/lib/cocHierarchy.ts`, `src/lib/cocHierarchy.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, it, expect } from 'vitest';
import {
  normalizeCocType, normalizeCocDocStatus, cocDocFails, rollupStatus, groupCocDocuments, toCocDoc, CocDoc,
} from './cocHierarchy';

const doc = (over: Partial<CocDoc>): CocDoc => ({
  id: 'x', cocType: 'Supplementary', cocNumber: null, cocIssueDate: null,
  cocExpiryDate: null, cocStatus: 'Pending', fileName: 'f.pdf', fileUrl: 'u', ...over,
});
const today = '2026-06-12';

describe('normalizeCocType', () => {
  it('maps case/variants', () => {
    expect(normalizeCocType('initial')).toBe('Initial');
    expect(normalizeCocType('Initial')).toBe('Initial');
    expect(normalizeCocType('Supplementary')).toBe('Supplementary');
    expect(normalizeCocType('Temporary')).toBe('Temporary');
  });
  it('unknown/blank/null => Supplementary (grouping promotes earliest to Initial)', () => {
    expect(normalizeCocType('Not Marked')).toBe('Supplementary');
    expect(normalizeCocType(null)).toBe('Supplementary');
  });
});

describe('normalizeCocDocStatus', () => {
  it('maps both vocabularies', () => {
    expect(normalizeCocDocStatus('approved')).toBe('Pass');
    expect(normalizeCocDocStatus('Approved')).toBe('Pass');
    expect(normalizeCocDocStatus('rejected')).toBe('Fail');
    expect(normalizeCocDocStatus('Failed')).toBe('Fail');
    expect(normalizeCocDocStatus('pending')).toBe('Pending');
  });
  it('null/unknown => Pending (doc exists, unmarked)', () => {
    expect(normalizeCocDocStatus(null)).toBe('Pending');
    expect(normalizeCocDocStatus('')).toBe('Pending');
  });
});

describe('cocDocFails', () => {
  it('Fail fails', () => expect(cocDocFails(doc({ cocStatus: 'Fail' }), today)).toBe(true));
  it('Pass with future expiry does not fail', () =>
    expect(cocDocFails(doc({ cocStatus: 'Pass', cocExpiryDate: '2027-01-01' }), today)).toBe(false));
  it('Pass with past expiry fails', () =>
    expect(cocDocFails(doc({ cocStatus: 'Pass', cocExpiryDate: '2025-01-01' }), today)).toBe(true));
  it('Pass with no expiry does not fail', () =>
    expect(cocDocFails(doc({ cocStatus: 'Pass' }), today)).toBe(false));
  it('Pending does not fail', () => expect(cocDocFails(doc({ cocStatus: 'Pending' }), today)).toBe(false));
});

describe('rollupStatus', () => {
  it('no docs => Missing', () => expect(rollupStatus([], today)).toBe('Missing'));
  it('any fail => Fail', () =>
    expect(rollupStatus([doc({ cocStatus: 'Pass' }), doc({ cocStatus: 'Fail' })], today)).toBe('Fail'));
  it('expired pass => Fail', () =>
    expect(rollupStatus([doc({ cocStatus: 'Pass', cocExpiryDate: '2025-01-01' })], today)).toBe('Fail'));
  it('pass with no fail => Pass', () =>
    expect(rollupStatus([doc({ cocStatus: 'Pass' }), doc({ cocStatus: 'Pending' })], today)).toBe('Pass'));
  it('only pending => Pending', () =>
    expect(rollupStatus([doc({ cocStatus: 'Pending' })], today)).toBe('Pending'));
});

describe('groupCocDocuments', () => {
  it('picks the Initial-typed doc and orders supplementaries by issue date', () => {
    const g = groupCocDocuments([
      doc({ id: 's2', cocType: 'Supplementary', cocIssueDate: '2025-05-01' }),
      doc({ id: 'init', cocType: 'Initial', cocIssueDate: '2025-01-01' }),
      doc({ id: 's1', cocType: 'Supplementary', cocIssueDate: '2025-03-01' }),
    ], today);
    expect(g.initial?.id).toBe('init');
    expect(g.supplementaries.map(d => d.id)).toEqual(['s1', 's2']);
    expect(g.rollup).toBe('Pending');
  });
  it('with no Initial-typed doc, promotes the earliest by issue date', () => {
    const g = groupCocDocuments([
      doc({ id: 'b', cocType: 'Supplementary', cocIssueDate: '2025-04-01' }),
      doc({ id: 'a', cocType: 'Supplementary', cocIssueDate: '2025-02-01' }),
    ], today);
    expect(g.initial?.id).toBe('a');
    expect(g.supplementaries.map(d => d.id)).toEqual(['b']);
  });
  it('empty => null initial, Missing rollup', () => {
    const g = groupCocDocuments([], today);
    expect(g.initial).toBeNull();
    expect(g.supplementaries).toEqual([]);
    expect(g.rollup).toBe('Missing');
  });
});

describe('toCocDoc', () => {
  it('maps a raw subsection_documents row', () => {
    const d = toCocDoc({ id: '1', file_name: 'c.pdf', file_url: 'u', coc_number: 'COC-1',
      coc_issue_date: '2025-01-01', coc_expiry_date: null, coc_type: 'initial', coc_status: 'approved' });
    expect(d).toMatchObject({ id: '1', cocType: 'Initial', cocNumber: 'COC-1', cocStatus: 'Pass' });
  });
});
```

- [ ] **Step 2: Run to verify fail** — `npm test -- cocHierarchy` → FAIL (cannot resolve `./cocHierarchy`).

- [ ] **Step 3: Implement**

```ts
export type CocType = 'Initial' | 'Supplementary' | 'Temporary';
export type CocDocStatus = 'Pass' | 'Fail' | 'Pending' | 'Missing';

export interface CocDoc {
  id: string;
  cocType: CocType;
  cocNumber: string | null;
  cocIssueDate: string | null; // yyyy-mm-dd
  cocExpiryDate: string | null;
  cocStatus: CocDocStatus;     // per-doc never 'Missing' (that is a roll-up-only value)
  fileName: string;
  fileUrl: string;
}

export interface CocGroup {
  initial: CocDoc | null;
  supplementaries: CocDoc[]; // includes Temporary; ordered by issue date asc
  rollup: CocDocStatus;
}

export function normalizeCocType(raw: string | null | undefined): CocType {
  const v = (raw ?? '').trim().toLowerCase();
  if (v === 'initial') return 'Initial';
  if (v === 'temporary') return 'Temporary';
  return v === 'supplementary' ? 'Supplementary' : 'Supplementary';
}

export function normalizeCocDocStatus(raw: string | null | undefined): CocDocStatus {
  const v = (raw ?? '').trim().toLowerCase();
  if (v === 'pass' || v === 'approved' || v === 'valid') return 'Pass';
  if (v === 'fail' || v === 'failed' || v === 'rejected') return 'Fail';
  return 'Pending'; // null/blank/unknown => uploaded but unmarked
}

export function cocDocFails(d: CocDoc, today: string): boolean {
  if (d.cocStatus === 'Fail') return true;
  if (d.cocStatus === 'Pass' && d.cocExpiryDate && d.cocExpiryDate < today) return true;
  return false;
}

export function rollupStatus(docs: CocDoc[], today: string): CocDocStatus {
  if (docs.length === 0) return 'Missing';
  if (docs.some(d => cocDocFails(d, today))) return 'Fail';
  if (docs.some(d => d.cocStatus === 'Pass')) return 'Pass';
  return 'Pending';
}

export function groupCocDocuments(docs: CocDoc[], today: string): CocGroup {
  const sorted = [...docs].sort((a, b) => (a.cocIssueDate ?? '').localeCompare(b.cocIssueDate ?? ''));
  const initial: CocDoc | null = sorted.find(d => d.cocType === 'Initial') ?? sorted[0] ?? null;
  const supplementaries = sorted.filter(d => d !== initial);
  return { initial, supplementaries, rollup: rollupStatus(docs, today) };
}

export function toCocDoc(d: {
  id: string; file_name: string; file_url: string;
  coc_number?: string | null; coc_issue_date?: string | null; coc_expiry_date?: string | null;
  coc_type?: string | null; coc_status?: string | null;
}): CocDoc {
  return {
    id: d.id,
    cocType: normalizeCocType(d.coc_type),
    cocNumber: d.coc_number ?? null,
    cocIssueDate: d.coc_issue_date ?? null,
    cocExpiryDate: d.coc_expiry_date ?? null,
    cocStatus: normalizeCocDocStatus(d.coc_status),
    fileName: d.file_name,
    fileUrl: d.file_url,
  };
}
```

- [ ] **Step 4: Run to verify pass** — `npm test -- cocHierarchy` → PASS.
- [ ] **Step 5: Commit** — `git add src/lib/cocHierarchy.ts src/lib/cocHierarchy.test.ts && git commit -m "feat(coc): pure COC hierarchy + roll-up core with tests"`

---

## Task 2: DB — per-document column, normalize, roll-up trigger, backfill (controller, PAT)

**Files:** Create `supabase/migrations/20260612140000_coc_per_document_rollup.sql`

- [ ] **Step 1: Write the migration**

```sql
-- Per-document COC: add expiry, normalise messy values, and derive subsections.coc_status
-- from the certificate documents (Initial + Supplementaries). The existing recompute gate
-- (apply_subsection_recompute) keeps reading subsections.coc_status, unchanged.

ALTER TABLE public.subsection_documents ADD COLUMN IF NOT EXISTS coc_expiry_date date;

UPDATE public.subsection_documents SET coc_type = CASE
  WHEN lower(coc_type) = 'initial'       THEN 'Initial'
  WHEN lower(coc_type) = 'supplementary' THEN 'Supplementary'
  WHEN lower(coc_type) = 'temporary'     THEN 'Temporary'
  ELSE coc_type END
WHERE coc_type IS NOT NULL;

UPDATE public.subsection_documents SET coc_status = CASE
  WHEN lower(coc_status) IN ('approved','pass','valid')  THEN 'Pass'
  WHEN lower(coc_status) IN ('rejected','failed','fail') THEN 'Fail'
  WHEN lower(coc_status) = 'pending'                     THEN 'Pending'
  ELSE coc_status END
WHERE coc_status IS NOT NULL;

-- Roll-up: set subsections.coc_status from its COC certificate documents.
CREATE OR REPLACE FUNCTION public.rollup_subsection_coc_status(p_subsection_id uuid)
RETURNS void LANGUAGE plpgsql AS $fn$
DECLARE v_status text;
BEGIN
  WITH classified AS (
    SELECT CASE
      WHEN d.coc_status IN ('Fail','Failed','Rejected') THEN 'Fail'
      WHEN d.coc_status IN ('Pass','Approved','Valid')
        AND d.coc_expiry_date IS NOT NULL AND d.coc_expiry_date < current_date THEN 'Fail'
      WHEN d.coc_status IN ('Pass','Approved','Valid') THEN 'Pass'
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
END;
$fn$;

CREATE OR REPLACE FUNCTION public.trg_rollup_coc_from_documents()
RETURNS trigger LANGUAGE plpgsql AS $fn$
BEGIN
  PERFORM public.rollup_subsection_coc_status(COALESCE(NEW.subsection_id, OLD.subsection_id));
  RETURN NULL;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_rollup_coc_from_documents ON public.subsection_documents;
CREATE TRIGGER trg_rollup_coc_from_documents
AFTER INSERT OR DELETE OR UPDATE OF coc_status, coc_type, coc_expiry_date, category_id
ON public.subsection_documents FOR EACH ROW
EXECUTE FUNCTION public.trg_rollup_coc_from_documents();

-- Backfill: roll every subsection up from its documents (fires the recompute gate => is_compliant).
DO $do$ DECLARE r record; BEGIN
  FOR r IN SELECT id FROM public.subsections WHERE deleted_at IS NULL LOOP
    PERFORM public.rollup_subsection_coc_status(r.id);
  END LOOP;
END; $do$;

NOTIFY pgrst, 'reload schema';
```

- [ ] **Step 2: Apply via Management API** (controller, PAT) — POST the file's SQL as `{query}`. Expect HTTP 201.

- [ ] **Step 3: Verify (controller)**
  - `SELECT count(*) FROM information_schema.columns WHERE table_name='subsection_documents' AND column_name='coc_expiry_date';` → 1.
  - `SELECT tgname FROM pg_trigger WHERE tgname='trg_rollup_coc_from_documents';` → 1 row.
  - Gate end-to-end: pick a subsection with a Pass COC doc that is currently compliant; `UPDATE subsection_documents SET coc_status='Fail' WHERE id=<one of its coc docs>;` → confirm `subsections.coc_status='Fail'` AND `is_compliant=false`; revert the doc → confirm it returns. Record before/after.
  - Record a `schema_migrations` row for `20260612140000` (per `prod-migration-drift`).

- [ ] **Step 4: Commit** — `git add supabase/migrations/20260612140000_coc_per_document_rollup.sql && git commit -m "feat(db): per-document COC + subsections.coc_status roll-up trigger"`

---

## Task 3: Load the new per-document field

**Files:** Modify `src/views/subsection-detail/types.ts`, `src/views/subsection-detail/useSubsectionDetail.ts`

- [ ] **Step 1: Add the field to `SupabaseDocument`** in `types.ts` (after `coc_status?: string | null;`):

```ts
  coc_expiry_date?: string | null;
```

- [ ] **Step 2: Load it in the hook.** In `useSubsectionDetail.ts` find the doc select (currently `.select('id, file_name, file_url, category_id, uploaded_at, coc_number, coc_issue_date, coc_type, coc_status')`, ~line 148) and add `coc_expiry_date`:

```ts
.select('id, file_name, file_url, category_id, uploaded_at, coc_number, coc_issue_date, coc_expiry_date, coc_type, coc_status')
```

- [ ] **Step 3: Exclude validation-report categories from COC docs.** In `getSupabaseCocDocuments` (~line 606) the current filter `name.toLowerCase().includes('coc')` also matches "COC Validation Reports". Replace with all matching COC categories minus validation/report:

```ts
  const getSupabaseCocDocuments = () => {
    const cocCatIds = documentCategories
      .filter(cat => {
        const n = cat.name.toLowerCase();
        return n.includes('coc') && !n.includes('validation') && !n.includes('report');
      })
      .map(cat => cat.id);
    if (cocCatIds.length === 0) return [];
    return supabaseDocuments.filter(doc => cocCatIds.includes(doc.category_id));
  };
```

- [ ] **Step 4: Type-check** — `npx tsc --noEmit 2>&1 | grep -E "useSubsectionDetail|subsection-detail/types" || echo "no new errors"` (pre-existing baseline errors are fine).
- [ ] **Step 5: Commit** — `git add src/views/subsection-detail/types.ts src/views/subsection-detail/useSubsectionDetail.ts && git commit -m "feat(coc): load coc_expiry_date + exclude validation-report categories"`

---

## Task 4: Per-document capture UI

**Files:** Create `src/components/coc/CocCertificateList.tsx`; modify `src/views/subsection-detail/CocMeteringTab.tsx`; delete `src/components/CocReviewForm.tsx`.

**Context:** `CocMeteringTab` currently renders (after the 2026-06-12 strip-out) a subsection-level `<CocReviewForm>` verdict block (around lines 89-140) plus a plain COC document list. Replace the verdict block AND the plain list with `<CocCertificateList>`. The tab already receives `getSupabaseCocDocuments`, `fetchSupabaseDocuments`, `refetchSubsection`, `setPreviewDocument`, `handleDownloadDocument`, `setDeleteDocumentId`, `deletingDocumentId`.

- [ ] **Step 1: Create `CocCertificateList.tsx`.** Renders the group (Initial first, supplementaries nested), each row inline-editable, writing `subsection_documents` directly.

```tsx
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Eye, Download, Trash2, Check, X, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { toCocDoc, groupCocDocuments, cocDocFails, CocDoc, CocType } from "@/lib/cocHierarchy";
import type { SupabaseDocument } from "@/views/subsection-detail/types";

interface Props {
  cocDocuments: SupabaseDocument[];
  deletingDocumentId: string | null;
  onSaved: () => void; // call fetchSupabaseDocuments + refetchSubsection
  setPreviewDocument: (doc: { file_name: string; file_url: string } | null) => void;
  handleDownloadDocument: (url: string, fileName: string) => void;
  setDeleteDocumentId: (id: string | null) => void;
}

const today = () => new Date().toISOString().slice(0, 10);

function CocRow({ raw, isInitial, ...p }: { raw: SupabaseDocument; isInitial: boolean } & Props) {
  const d: CocDoc = toCocDoc(raw);
  const [type, setType] = useState<CocType>(d.cocType);
  const [number, setNumber] = useState(d.cocNumber ?? "");
  const [issue, setIssue] = useState(d.cocIssueDate ?? "");
  const [expiry, setExpiry] = useState(d.cocExpiryDate ?? "");
  const [status, setStatus] = useState<"Pass" | "Fail" | "Pending">(d.cocStatus === "Missing" ? "Pending" : d.cocStatus);
  const [saving, setSaving] = useState(false);
  const failing = cocDocFails({ ...d, cocStatus: status, cocExpiryDate: expiry || null }, today());

  const save = async () => {
    setSaving(true);
    const { error } = await supabase.from("subsection_documents").update({
      coc_type: type, coc_number: number.trim() || null,
      coc_issue_date: issue || null, coc_expiry_date: expiry || null, coc_status: status,
    }).eq("id", raw.id);
    setSaving(false);
    if (error) { toast.error(`Failed to save COC: ${error.message}`); return; }
    toast.success("COC saved");
    p.onSaved();
  };

  return (
    <div className="flex flex-col gap-2 p-3 bg-muted/40 rounded-md">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2 min-w-0">
          <Badge variant={isInitial ? "default" : "outline"} className="text-xs">{isInitial ? "Initial" : type}</Badge>
          <span className="text-sm font-medium truncate">{raw.file_name}</span>
        </div>
        <div className="flex items-center gap-1">
          <Badge variant={failing ? "destructive" : status === "Pass" ? "default" : "secondary"} className="text-xs">
            {failing ? "Fail" : status}
          </Badge>
          <Button size="sm" variant="ghost" onClick={() => p.setPreviewDocument({ file_name: raw.file_name, file_url: raw.file_url })}><Eye className="h-4 w-4" /></Button>
          <Button size="sm" variant="ghost" onClick={() => p.handleDownloadDocument(raw.file_url, raw.file_name)}><Download className="h-4 w-4" /></Button>
          <Button size="sm" variant="ghost" onClick={() => p.setDeleteDocumentId(raw.id)} disabled={p.deletingDocumentId === raw.id}>
            {p.deletingDocumentId === raw.id ? <Loader2 className="h-4 w-4 animate-spin text-destructive" /> : <Trash2 className="h-4 w-4 text-destructive" />}
          </Button>
        </div>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-5 gap-2 items-end">
        <div>
          <label className="text-xs text-muted-foreground">Type</label>
          <Select value={type} onValueChange={(v) => setType(v as CocType)}>
            <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="Initial">Initial</SelectItem>
              <SelectItem value="Supplementary">Supplementary</SelectItem>
              <SelectItem value="Temporary">Temporary</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div><label className="text-xs text-muted-foreground">COC number</label><Input className="h-8" value={number} onChange={(e) => setNumber(e.target.value)} /></div>
        <div><label className="text-xs text-muted-foreground">Issue</label><Input className="h-8" type="date" value={issue} onChange={(e) => setIssue(e.target.value)} /></div>
        <div><label className="text-xs text-muted-foreground">Expiry</label><Input className="h-8" type="date" value={expiry} onChange={(e) => setExpiry(e.target.value)} /></div>
        <div>
          <label className="text-xs text-muted-foreground">Verdict</label>
          <Select value={status} onValueChange={(v) => setStatus(v as "Pass" | "Fail" | "Pending")}>
            <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="Pending">Pending</SelectItem>
              <SelectItem value="Pass">Pass</SelectItem>
              <SelectItem value="Fail">Fail</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="flex justify-end">
        <Button size="sm" onClick={save} disabled={saving}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4 mr-1" />}Save
        </Button>
      </div>
    </div>
  );
}

export function CocCertificateList(p: Props) {
  const docs = p.cocDocuments.map(toCocDoc);
  if (docs.length === 0) {
    return <p className="text-sm text-muted-foreground">No COC certificates uploaded yet. Upload one below.</p>;
  }
  const group = groupCocDocuments(docs, today());
  const rawById = new Map(p.cocDocuments.map(r => [r.id, r]));
  return (
    <div className="space-y-2">
      {group.initial && <CocRow raw={rawById.get(group.initial.id)!} isInitial {...p} />}
      {group.supplementaries.length > 0 && (
        <div className="ml-4 border-l-2 border-border pl-3 space-y-2">
          {group.supplementaries.map(s => <CocRow key={s.id} raw={rawById.get(s.id)!} isInitial={false} {...p} />)}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Wire it into `CocMeteringTab.tsx`.** Read the file. Remove the `CocReviewForm` import + the `<div className="border rounded-lg p-4 space-y-4">…verdict…<CocReviewForm/></div>` block and the separate plain "Existing COC Documents" map. Replace with:

```tsx
<CocCertificateList
  cocDocuments={getSupabaseCocDocuments()}
  deletingDocumentId={deletingDocumentId}
  onSaved={() => { fetchSupabaseDocuments(); refetchSubsection(); }}
  setPreviewDocument={setPreviewDocument}
  handleDownloadDocument={handleDownloadDocument}
  setDeleteDocumentId={setDeleteDocumentId}
/>
```

Add `import { CocCertificateList } from "@/components/coc/CocCertificateList";`. Remove the now-unused `isExpired`/`cocFailsGate`/`Badge` verdict imports only if they become unused (check). Keep the upload control + the Metering card unchanged.

- [ ] **Step 3: Delete the superseded form** — `git rm src/components/CocReviewForm.tsx` (confirm no other importers: `grep -rn "CocReviewForm" src` → none). If `src/lib/cocCompliance.ts` `cocFailsGate` is now unused (`grep -rn "cocFailsGate" src`), leave the file (its `isExpired` may be used) but it's fine either way.

- [ ] **Step 4: Verify** — `npx tsc --noEmit 2>&1 | grep -E "CocCertificateList|CocMeteringTab" || echo "clean"`; `npm test -- cocHierarchy` green. Visual: open a subsection COC tab, mark the Initial Pass and a Supplementary Fail, Save → the subsection becomes non-compliant (roll-up), nested layout shows Initial then supplementary.

- [ ] **Step 5: Commit** — `git add -A && git commit -m "feat(coc): per-document COC capture (Initial + supplementaries) in subsection tab"`

---

## Task 5: Site-level grouped view

**Files:** Create `src/components/coc/SiteCocHierarchy.tsx`; modify `src/views/SiteDetail.tsx`.

**Context:** `SiteDetail.tsx` has `subsections` (each with `id`, `name`, and a tenant name field — confirm the exact prop, e.g. `tenant_name`/`tenantName`, by reading the subsections shape in the file) and `siteId`. The new component fetches all COC docs for the site's subsections and renders one group per subsection.

- [ ] **Step 1: Create `SiteCocHierarchy.tsx`.**

```tsx
import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Server, Check, X, FileOff } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toCocDoc, groupCocDocuments, cocDocFails, CocGroup } from "@/lib/cocHierarchy";

interface SubsectionLite { id: string; name: string; tenantName?: string | null; }
interface Props { subsections: SubsectionLite[]; }

const today = () => new Date().toISOString().slice(0, 10);
const rollupBadge = (g: CocGroup) =>
  g.rollup === "Fail" ? { label: "Non-compliant", variant: "destructive" as const }
  : g.rollup === "Pass" ? { label: "Compliant", variant: "default" as const }
  : g.rollup === "Missing" ? { label: "No COC", variant: "secondary" as const }
  : { label: "Pending", variant: "secondary" as const };

export function SiteCocHierarchy({ subsections }: Props) {
  const [byId, setById] = useState<Record<string, CocGroup>>({});
  useEffect(() => {
    const ids = subsections.map(s => s.id);
    if (ids.length === 0) return;
    (async () => {
      const { data } = await supabase
        .from("subsection_documents")
        .select("id, subsection_id, file_name, file_url, coc_number, coc_issue_date, coc_expiry_date, coc_type, coc_status, document_categories(name)")
        .in("subsection_id", ids);
      const groups: Record<string, CocGroup> = {};
      for (const s of subsections) {
        const docs = (data ?? [])
          .filter((r: any) => r.subsection_id === s.id)
          .filter((r: any) => {
            const n = (r.document_categories?.name ?? "").toLowerCase();
            return n.includes("coc") && !n.includes("validation") && !n.includes("report");
          })
          .map(toCocDoc);
        groups[s.id] = groupCocDocuments(docs, today());
      }
      setById(groups);
    })();
  }, [subsections]);

  return (
    <Card>
      <CardHeader><CardTitle>Certificates of Compliance</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        {subsections.map(s => {
          const g = byId[s.id] ?? { initial: null, supplementaries: [], rollup: "Missing" as const };
          const b = rollupBadge(g);
          return (
            <div key={s.id} className="border rounded-lg p-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2"><Server className="h-4 w-4 text-muted-foreground" /><span className="font-medium">{s.name}</span>{s.tenantName && <span className="text-muted-foreground text-sm">· {s.tenantName}</span>}</div>
                <Badge variant={b.variant} className="text-xs">{b.label}</Badge>
              </div>
              {g.initial ? (
                <div className="mt-2 space-y-1">
                  <CocLine label="Initial" number={g.initial.cocNumber} fail={cocDocFails(g.initial, today())} status={g.initial.cocStatus} />
                  {g.supplementaries.length > 0 && (
                    <div className="ml-4 border-l-2 border-border pl-3 space-y-1">
                      {g.supplementaries.map(d => <CocLine key={d.id} label={d.cocType} number={d.cocNumber} fail={cocDocFails(d, today())} status={d.cocStatus} />)}
                    </div>
                  )}
                </div>
              ) : (
                <p className="mt-2 text-sm text-muted-foreground flex items-center gap-1"><FileOff className="h-4 w-4" />No certificate uploaded yet</p>
              )}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

function CocLine({ label, number, fail, status }: { label: string; number: string | null; fail: boolean; status: string }) {
  return (
    <div className="flex items-center justify-between gap-2 px-2 py-1.5 bg-muted/40 rounded">
      <div className="flex items-center gap-2"><Badge variant="outline" className="text-xs">{label}</Badge><span className="font-mono text-xs">{number || "—"}</span></div>
      <Badge variant={fail ? "destructive" : status === "Pass" ? "default" : "secondary"} className="text-xs">
        {fail ? <X className="h-3 w-3 mr-1" /> : status === "Pass" ? <Check className="h-3 w-3 mr-1" /> : null}{fail ? "Fail" : status}
      </Badge>
    </div>
  );
}
```

- [ ] **Step 2: Mount in `SiteDetail.tsx`.** Read the file to find the subsections shape + a sensible place (near the ComplianceDashboard mount, ~line 656). Map subsections to `{ id, name, tenantName }` and render:

```tsx
<SiteCocHierarchy subsections={subsections.map((s: any) => ({ id: s.id, name: s.name, tenantName: s.tenant_name ?? s.tenantName ?? null }))} />
```

Add `import { SiteCocHierarchy } from "@/components/coc/SiteCocHierarchy";`.

- [ ] **Step 3: Verify** — `npx tsc --noEmit 2>&1 | grep -E "SiteCocHierarchy|SiteDetail" || echo "clean"`. Visual: open a site → the COC section lists each DB/tenant with Initial + supplementaries + roll-up badge.
- [ ] **Step 4: Commit** — `git add -A && git commit -m "feat(coc): site-level Initial→Supplementary COC hierarchy view"`

---

## Task 6: Client PDF — COC hierarchy section

**Files:** Modify `src/lib/siteSummaryRenderSpec.ts` (and confirm whether the on-screen `SiteSummaryReport.tsx` shares this spec — if so it inherits the section).

- [ ] **Step 1: Read `siteSummaryRenderSpec.ts`** to find how sections are assembled and what site/subsection + document data it already has. It must have (or be given) the site's COC documents per subsection. If the spec already receives subsection documents, reuse them; otherwise add a `cocDocsBySubsection: Record<string, RawCocDoc[]>` input to the spec's data param, populated by the caller from `subsection_documents`.

- [ ] **Step 2: Add a COC section builder.** Using `groupCocDocuments`/`toCocDoc` from `@/lib/cocHierarchy`, produce a pdfmake section: a heading "Certificates of Compliance", then per subsection a sub-block — group header (subsection name + tenant + roll-up label) and a table of rows `[Type, COC number, Issue, Expiry, Pass/Fail]`, Initial first then supplementaries. Mirror the existing table/section styling in the file (reuse its layout/style helpers; do not invent new styles).

```ts
import { toCocDoc, groupCocDocuments, cocDocFails } from "@/lib/cocHierarchy";

function buildCocSection(cocDocsBySubsection: Record<string, any[]>, subs: { id: string; name: string; tenantName?: string | null }[]): any[] {
  const today = new Date().toISOString().slice(0, 10);
  const blocks: any[] = [{ text: "Certificates of Compliance", style: "sectionHeader", margin: [0, 12, 0, 6] }];
  for (const s of subs) {
    const g = groupCocDocuments((cocDocsBySubsection[s.id] ?? []).map(toCocDoc), today);
    const rollup = g.rollup === "Fail" ? "Non-compliant" : g.rollup === "Pass" ? "Compliant" : g.rollup === "Missing" ? "No COC" : "Pending";
    blocks.push({ text: `${s.name}${s.tenantName ? " · " + s.tenantName : ""}  —  ${rollup}`, bold: true, margin: [0, 6, 0, 2] });
    const ordered = [g.initial, ...g.supplementaries].filter(Boolean) as ReturnType<typeof toCocDoc>[];
    if (ordered.length === 0) { blocks.push({ text: "No certificate uploaded.", italics: true, margin: [0, 0, 0, 4] }); continue; }
    blocks.push({
      table: { widths: ["18%", "32%", "18%", "18%", "14%"], body: [
        ["Type", "COC number", "Issue", "Expiry", "Verdict"],
        ...ordered.map((d, i) => [ i === 0 ? "Initial" : d.cocType, d.cocNumber || "—", d.cocIssueDate || "—", d.cocExpiryDate || "—", cocDocFails(d, today) ? "Fail" : d.cocStatus ]),
      ]},
      layout: "lightHorizontalLines", margin: [0, 0, 0, 8],
    });
  }
  return blocks;
}
```

Insert `...buildCocSection(...)` into the spec's content array where COC belongs (replace any leftover single-`cocStatus` COC line if present). Wire `cocDocsBySubsection` from the caller (the report-generation path) by querying `subsection_documents` for the site.

- [ ] **Step 3: Verify** — generate a site PDF for a site with mixed Pass/Fail COCs; confirm each DB/tenant shows Initial + supplementaries with per-COC verdicts. `npx tsc --noEmit 2>&1 | grep -E "siteSummaryRenderSpec" || echo "clean"`.
- [ ] **Step 4: Commit** — `git add -A && git commit -m "feat(coc): COC hierarchy section in the client site PDF"`

---

## Task 7: Regenerate types + final verification

- [ ] **Step 1: Regenerate `src/integrations/supabase/types.ts`** (controller, Management API `gen types` or the dashboard) so `subsection_documents.coc_expiry_date` + the new functions are reflected. Commit.
- [ ] **Step 2: Full tests** — `npm test` → `cocHierarchy` (and `siteHealth`, `cocCompliance` if still present) all pass.
- [ ] **Step 3: tsc delta** — `npx tsc --noEmit 2>&1 | wc -l` is not higher than the pre-branch baseline (no new errors introduced).
- [ ] **Step 4: End-to-end** — upload two COCs to one subsection, mark one Initial Pass + one Supplementary Fail → subsection non-compliant; site view + PDF both show the grouped hierarchy with per-COC verdicts; fix the supplementary to Pass → subsection returns to compliant.
- [ ] **Step 5: Update tracker** — note in `docs/superpowers/COC-VALIDATION-STRIPOUT-TRACKER.md` (or a short follow-up doc) that per-document capture + hierarchy replaced the single subsection verdict. Commit.

---

## Notes / sequencing
- Tasks 1-2 are the foundation (pure core + DB roll-up). 3-4 restore per-COC capture; 5-6 add the read-only surfaces. Each task leaves the app working.
- The compliance gate (`apply_subsection_recompute`) is intentionally untouched — only its input (`subsections.coc_status`) changes from hand-written to roll-up-derived.
- Out of scope (YAGNI): per-COC failure-reason text + per-COC report (report removed 2026-06-12), parent-id link / multi-level chains, removing legacy `subsections.coc_*` columns, the `contractor_coc_uploads` inbox.
