# Client-Portal COC View Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give client-portal users a read-only, curated COC compliance summary per site, plus a downloadable full COC report, and close a pre-existing cross-tenant RLS leak on the COC tables.

**Architecture:** A new lean `ClientCocView` component rendered as a 6th tab in `ClientPortalSiteDetail`, mirroring the `ClientPortalDocuments` precedent (dedicated read-only client component, never the admin tab behind a flag). The on-screen summary sources per-subsection COC status/expiry from the already-client-scoped `subsections` table (`coc_status`, `coc_expiry_date`, `is_coc_required`) and the "View COC" PDF link from `subsection_documents` (filtered by COC category). The leaky `coc_db_schedule`/`coc_certificates` tables are read **only** on the "Download COC report" click, which feeds the existing `buildCocReportModel` → `buildSiteCocReportDocDef` → `generatePdfBlob` → `downloadBlob` pipeline client-side (download only — no save/delete). A migration closes the `USING (true)` SELECT leak on the three `coc_*` tables and grants clients read of their own site's COC data.

**Tech Stack:** Next.js (App Router) · React · TanStack Query · Supabase (Postgres RLS) · shadcn/ui · pdfmake · Vitest.

---

## Spec delta (refinement discovered during planning)

The approved spec (`docs/superpowers/specs/2026-06-23-client-portal-coc-view-design.md`) said the on-screen view would query `coc_db_schedule` + `coc_certificates`. Planning found a cleaner, lower-exposure source: **`subsections.coc_status` / `subsections.coc_expiry_date` / `subsections.is_coc_required`** are the DB-gated source of truth and are already client-scoped (migration `20260611160000`). So the on-screen summary uses `subsections` + `subsection_documents` (both already client-readable); the `coc_*` tables are read **only** for the downloadable report. The RLS fix is still required because the report reads those tables client-side. Net effect: less data exposed on screen, same report, same mandatory leak fix.

## File structure

- **Create** `supabase/migrations/20260623120000_coc_client_read_and_leak_fix.sql` — RLS: close SELECT leak + client read on `coc_*`.
- **Create** `src/lib/siteCoc/clientCocSummary.ts` — pure mapper: subsections + COC docs → curated client rows. One responsibility, no I/O, unit-tested.
- **Create** `src/lib/siteCoc/clientCocSummary.test.ts` — unit tests for the mapper.
- **Create** `src/components/client-portal/ClientCocView.tsx` — read-only client COC tab UI (fetch + render + report download). No write-module imports.
- **Modify** `src/views/ClientPortalSiteDetail.tsx` — add the 6th "COC" tab (trigger + content).

---

### Task 1: RLS migration — close the SELECT leak and grant client read

**Files:**
- Create: `supabase/migrations/20260623120000_coc_client_read_and_leak_fix.sql`

**Context (verbatim current state, from `supabase/migrations/20260619130000_site_coc_system.sql` lines 72–88):** each of the three tables currently has `create policy "auth read <table>" ... for select to authenticated using (true);` — any authenticated user (including any `Client`) can read **every** site's COC rows. All three tables have a `site_id uuid not null references public.sites(id)` column. The fix mirrors the existing client policy `"Clients can view their site documents"` (`20251017054255` lines 80–89) and the `get_user_client_id()` / `has_role()` helpers.

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/20260623120000_coc_client_read_and_leak_fix.sql`:

```sql
-- Close the cross-tenant SELECT leak on the COC tables (previously `using (true)`),
-- and grant clients read access to their own site's COC schedule + certificates.
-- Staff (anyone who is NOT a Client: Admin / Contractor / User) keep full read, exactly as before.

-- ── coc_import_batches (clients do NOT need this; staff-only read) ─────────────
drop policy if exists "auth read coc_import_batches" on public.coc_import_batches;

create policy "staff read coc_import_batches"
  on public.coc_import_batches for select to authenticated
  using (not public.has_role(auth.uid(), 'Client'));

-- ── coc_db_schedule (staff full read + clients own-site read) ──────────────────
drop policy if exists "auth read coc_db_schedule" on public.coc_db_schedule;

create policy "staff read coc_db_schedule"
  on public.coc_db_schedule for select to authenticated
  using (not public.has_role(auth.uid(), 'Client'));

create policy "clients read own site coc_db_schedule"
  on public.coc_db_schedule for select to authenticated
  using (
    public.has_role(auth.uid(), 'Client') and
    site_id in (select id from public.sites where client_id = public.get_user_client_id())
  );

-- ── coc_certificates (staff full read + clients own-site read) ─────────────────
drop policy if exists "auth read coc_certificates" on public.coc_certificates;

create policy "staff read coc_certificates"
  on public.coc_certificates for select to authenticated
  using (not public.has_role(auth.uid(), 'Client'));

create policy "clients read own site coc_certificates"
  on public.coc_certificates for select to authenticated
  using (
    public.has_role(auth.uid(), 'Client') and
    site_id in (select id from public.sites where client_id = public.get_user_client_id())
  );

notify pgrst, 'reload schema';
```

- [ ] **Step 2: Commit the migration file**

```bash
git add supabase/migrations/20260623120000_coc_client_read_and_leak_fix.sql
git commit -m "feat(coc): close cross-tenant SELECT leak + grant client read on coc tables"
```

- [ ] **Step 3: Apply to prod (Supabase Management API, NOT db push)**

Per project convention, prod schema is ahead of `schema_migrations` due to drift, so **do not** run `supabase db push`. Apply via the Management API `database/query` endpoint (needs `SUPABASE_ACCESS_TOKEN` + project ref). If the token is not available in `.env`, hand the SQL above to the user to run in the Supabase SQL editor.

Verification (run as a real Client session, or via SQL impersonation): a `select * from coc_certificates` from a client returns **only** their own site's rows; from staff it returns all rows as before. Expected: client cross-site read returns 0 rows for sites they don't own.

---

### Task 1b: [OPTIONAL — SECURITY HARDENING BEYOND APPROVED SPEC — confirm before applying] lock down COC writes

**Files:**
- Modify: `supabase/migrations/20260623120000_coc_client_read_and_leak_fix.sql` (append)

**Why:** The same migration (`20260619130000` lines 74–88) also grants `insert`/`update`/`delete` `to authenticated using (true)` on all three tables — meaning any authenticated **Client** can currently *modify or delete* any site's COC data, not just read it. This is a more serious sibling of the read leak. The approved spec covered only the SELECT fix, so this is isolated here for explicit sign-off. Clients have no write UI, so restricting writes to non-clients is non-breaking.

- [ ] **Step 1: Append write-hardening to the migration (only if approved)**

Append before the final `notify pgrst, 'reload schema';` line:

```sql
-- Harden writes: only non-clients (Admin / Contractor / User) may mutate COC data.
do $$
declare t text;
begin
  foreach t in array array['coc_import_batches','coc_db_schedule','coc_certificates'] loop
    execute format('drop policy if exists "auth insert %1$s" on public.%1$s;', t);
    execute format('drop policy if exists "auth update %1$s" on public.%1$s;', t);
    execute format('drop policy if exists "auth delete %1$s" on public.%1$s;', t);

    execute format($f$create policy "staff insert %1$s" on public.%1$s
      for insert to authenticated with check (not public.has_role(auth.uid(), 'Client'));$f$, t);
    execute format($f$create policy "staff update %1$s" on public.%1$s
      for update to authenticated using (not public.has_role(auth.uid(), 'Client'))
      with check (not public.has_role(auth.uid(), 'Client'));$f$, t);
    execute format($f$create policy "staff delete %1$s" on public.%1$s
      for delete to authenticated using (not public.has_role(auth.uid(), 'Client'));$f$, t);
  end loop;
end $$;
```

- [ ] **Step 2: Amend the commit**

```bash
git add supabase/migrations/20260623120000_coc_client_read_and_leak_fix.sql
git commit --amend --no-edit
```

---

### Task 2: Pure curated mapper + unit test (TDD)

**Files:**
- Create: `src/lib/siteCoc/clientCocSummary.ts`
- Test: `src/lib/siteCoc/clientCocSummary.test.ts`

**Context:** `subsections.coc_status` ∈ `'Pass' | 'Pending' | 'Missing' | 'Fail' | 'N/A' | null`. `isCocCertificateCategory(name)` and `normalizeCocType(raw)` are exported from `src/lib/cocHierarchy.ts`. `Tone` (`"green" | "red" | "amber" | "slate"`) and `TONE_PILL` are exported from `src/lib/siteCoc/statusDisplay.ts`. The mapper is pure (no Supabase), so the test needs no mocking — matching the `src/lib/siteCoc/*.test.ts` convention (`import { describe, it, expect } from "vitest"`).

- [ ] **Step 1: Write the failing test**

Create `src/lib/siteCoc/clientCocSummary.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { buildClientCocSummary, cocStatusTone, cocStatusLabel } from "./clientCocSummary";

const subs = [
  { id: "s1", name: "Shop 1", tenant_name: "Acme", is_coc_required: true,  coc_status: "Pass",    coc_expiry_date: "2027-01-01" },
  { id: "s2", name: "Shop 2", tenant_name: null,   is_coc_required: true,  coc_status: "Missing", coc_expiry_date: null },
  { id: "s3", name: "Shop 3", tenant_name: null,   is_coc_required: false, coc_status: "N/A",     coc_expiry_date: "2030-01-01" },
  { id: "s4", name: "Shop 4", tenant_name: null,   is_coc_required: true,  coc_status: null,      coc_expiry_date: null },
];

const docs = [
  { subsection_id: "s1", file_name: "coc-initial.pdf", file_url: "u1", coc_type: "Initial",       category_name: "COC Certificates" },
  { subsection_id: "s1", file_name: "eval.pdf",        file_url: "u2", coc_type: "Supplementary", category_name: "COC Validation Report" },
];

describe("cocStatusTone", () => {
  it("maps gated statuses to tones, neutral when not required", () => {
    expect(cocStatusTone("Pass", true)).toBe("green");
    expect(cocStatusTone("Fail", true)).toBe("red");
    expect(cocStatusTone("Missing", true)).toBe("amber");
    expect(cocStatusTone("Pending", true)).toBe("amber");
    expect(cocStatusTone(null, true)).toBe("amber");
    expect(cocStatusTone("Pass", false)).toBe("slate");
  });
});

describe("cocStatusLabel", () => {
  it("shows 'Not required' / 'Pending' fallbacks", () => {
    expect(cocStatusLabel("Pass", true)).toBe("Pass");
    expect(cocStatusLabel(null, true)).toBe("Pending");
    expect(cocStatusLabel("Pass", false)).toBe("Not required");
  });
});

describe("buildClientCocSummary", () => {
  it("builds curated rows with tenant in the name, status, expiry and the Initial COC link", () => {
    const rows = buildClientCocSummary(subs, docs);
    expect(rows).toHaveLength(4);

    const r1 = rows.find(r => r.subsectionId === "s1")!;
    expect(r1.name).toBe("Shop 1 (Acme)");
    expect(r1.cocRequired).toBe(true);
    expect(r1.statusLabel).toBe("Pass");
    expect(r1.tone).toBe("green");
    expect(r1.expiry).toBe("2027-01-01");
    expect(r1.viewUrl).toBe("u1");          // Initial COC doc, not the validation report
    expect(r1.viewName).toBe("coc-initial.pdf");
  });

  it("excludes non-COC-category docs from the View link and handles missing docs", () => {
    const rows = buildClientCocSummary(subs, docs);
    const r2 = rows.find(r => r.subsectionId === "s2")!;
    expect(r2.statusLabel).toBe("Missing");
    expect(r2.tone).toBe("amber");
    expect(r2.viewUrl).toBeNull();
  });

  it("nulls expiry and marks 'Not required' for non-required subsections", () => {
    const rows = buildClientCocSummary(subs, docs);
    const r3 = rows.find(r => r.subsectionId === "s3")!;
    expect(r3.cocRequired).toBe(false);
    expect(r3.statusLabel).toBe("Not required");
    expect(r3.tone).toBe("slate");
    expect(r3.expiry).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/siteCoc/clientCocSummary.test.ts`
Expected: FAIL — `Failed to resolve import "./clientCocSummary"` (module does not exist yet).

- [ ] **Step 3: Write the mapper**

Create `src/lib/siteCoc/clientCocSummary.ts`:

```ts
import { isCocCertificateCategory, normalizeCocType } from "@/lib/cocHierarchy";
import type { Tone } from "@/lib/siteCoc/statusDisplay";

export interface ClientCocSubsection {
  id: string;
  name: string;
  tenant_name: string | null;
  is_coc_required: boolean | null;
  coc_status: string | null;       // 'Pass' | 'Pending' | 'Missing' | 'Fail' | 'N/A' | null
  coc_expiry_date: string | null;  // ISO yyyy-mm-dd
}

export interface ClientCocDoc {
  subsection_id: string | null;
  file_name: string;
  file_url: string;
  coc_type: string | null;
  category_name: string | null;    // from document_categories(name)
}

export interface ClientCocRow {
  subsectionId: string;
  name: string;            // includes tenant in parentheses when present
  cocRequired: boolean;
  statusLabel: string;
  tone: Tone;
  expiry: string | null;
  viewUrl: string | null;
  viewName: string | null;
}

export function cocStatusTone(status: string | null | undefined, required: boolean): Tone {
  if (!required) return "slate";
  const s = (status ?? "").toLowerCase();
  if (s === "pass") return "green";
  if (s === "fail") return "red";
  if (s === "missing") return "amber";
  if (s === "pending") return "amber";
  if (s === "n/a") return "slate";
  return "amber"; // required but unknown/blank → needs attention
}

export function cocStatusLabel(status: string | null | undefined, required: boolean): string {
  if (!required) return "Not required";
  const s = (status ?? "").trim();
  return s || "Pending";
}

export function buildClientCocSummary(
  subsections: ClientCocSubsection[],
  cocDocs: ClientCocDoc[],
): ClientCocRow[] {
  const bySub = new Map<string, ClientCocDoc[]>();
  for (const d of cocDocs) {
    if (!d.subsection_id) continue;
    if (!isCocCertificateCategory(d.category_name ?? "")) continue;
    const arr = bySub.get(d.subsection_id) ?? [];
    arr.push(d);
    bySub.set(d.subsection_id, arr);
  }

  return subsections.map((sub) => {
    const required = !!sub.is_coc_required;
    const docs = bySub.get(sub.id) ?? [];
    const initial = docs.find((d) => normalizeCocType(d.coc_type) === "Initial") ?? docs[0] ?? null;
    return {
      subsectionId: sub.id,
      name: sub.tenant_name ? `${sub.name} (${sub.tenant_name})` : sub.name,
      cocRequired: required,
      statusLabel: cocStatusLabel(sub.coc_status, required),
      tone: cocStatusTone(sub.coc_status, required),
      expiry: required ? sub.coc_expiry_date : null,
      viewUrl: initial ? initial.file_url : null,
      viewName: initial ? initial.file_name : null,
    };
  });
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/lib/siteCoc/clientCocSummary.test.ts`
Expected: PASS (3 `buildClientCocSummary` + 2 helper describes, all green).

- [ ] **Step 5: Commit**

```bash
git add src/lib/siteCoc/clientCocSummary.ts src/lib/siteCoc/clientCocSummary.test.ts
git commit -m "feat(coc): pure curated client COC summary mapper + tests"
```

---

### Task 3: ClientCocView component

**Files:**
- Create: `src/components/client-portal/ClientCocView.tsx`

**Context:** Mirrors `ClientPortalDocuments` (read-only, callback-based preview). Supabase client import is `@/integrations/supabase/client`. Subsection COC fields are client-readable today. The report pipeline (verbatim from `ReportSubTab.tsx`): `buildCocReportModel(input)` → `buildSiteCocReportDocDef(model, logoDataUrl|null)` → `generatePdfBlob(docDef): Promise<Blob>` → `downloadBlob(blob, fileName)`. **Do not** import `useSiteCocImport`, `useSiteCocPool`, `resolveShop`, `rerunAutoMatch`, `savePDFToDocuments`, or any `handleSave`/`handleDelete` path. The component reads `coc_db_schedule`/`coc_certificates` only inside the report-download handler. The toast import must match the project util used in `src/lib/fileDownload.ts` (it imports `toast` from `sonner`).

- [ ] **Step 1: Write the component**

Create `src/components/client-portal/ClientCocView.tsx`:

```tsx
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Eye, FileBarChart, ShieldCheck } from "lucide-react";
import {
  buildClientCocSummary,
  type ClientCocSubsection,
  type ClientCocDoc,
} from "@/lib/siteCoc/clientCocSummary";
import { TONE_PILL } from "@/lib/siteCoc/statusDisplay";
import { buildCocReportModel } from "@/lib/siteCoc/cocReportModel";
import { buildSiteCocReportDocDef } from "@/lib/siteCoc/siteCocReport";
import { generatePdfBlob } from "@/lib/pdfMakeConfig";
import { downloadBlob } from "@/lib/fileDownload";

interface ClientCocViewProps {
  siteId: string;
  siteName: string;
  onPreview: (url: string, name: string) => void;
}

export function ClientCocView({ siteId, siteName, onPreview }: ClientCocViewProps) {
  const [generating, setGenerating] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["client-coc", siteId],
    enabled: !!siteId,
    queryFn: async () => {
      const { data: subs, error: e1 } = await supabase
        .from("subsections")
        .select("id, name, tenant_name, is_coc_required, coc_status, coc_expiry_date")
        .eq("site_id", siteId)
        .is("deleted_at", null)
        .order("name");
      if (e1) throw e1;
      const subsections = (subs ?? []) as ClientCocSubsection[];
      const ids = subsections.map((s) => s.id);

      let cocDocs: ClientCocDoc[] = [];
      if (ids.length > 0) {
        const { data: docs, error: e2 } = await supabase
          .from("subsection_documents")
          .select("subsection_id, file_name, file_url, coc_type, document_categories(name)")
          .in("subsection_id", ids);
        if (e2) throw e2;
        cocDocs = (docs ?? []).map((d: any) => ({
          subsection_id: d.subsection_id,
          file_name: d.file_name,
          file_url: d.file_url,
          coc_type: d.coc_type,
          category_name: d.document_categories?.name ?? null,
        }));
      }
      return { subsections, cocDocs };
    },
  });

  const rows = data ? buildClientCocSummary(data.subsections, data.cocDocs) : [];
  const requiredRows = rows.filter((r) => r.cocRequired);

  const handleDownloadReport = async () => {
    setGenerating(true);
    try {
      const [schedRes, certRes] = await Promise.all([
        supabase.from("coc_db_schedule").select("*").eq("site_id", siteId).order("shop_no_raw"),
        supabase.from("coc_certificates").select("*").eq("site_id", siteId).order("shop_no_raw"),
      ]);
      if (schedRes.error) throw schedRes.error;
      if (certRes.error) throw certRes.error;

      const model = buildCocReportModel({
        siteName,
        generatedAt: new Date().toLocaleDateString(),
        lastImport: null,
        clientName: null,
        address: null,
        subsections: (data?.subsections ?? []).map((s) => ({
          id: s.id, name: s.name, tenant_name: s.tenant_name, is_coc_required: s.is_coc_required,
        })),
        certificates: (certRes.data ?? []).map((c: any) => ({
          subsection_id: c.subsection_id, cert_no: c.cert_no, cert_type: c.cert_type, verdict: c.verdict,
          rules: c.rules, issued_date: c.issued_date, coc_document_id: c.coc_document_id,
          eval_document_id: c.eval_document_id, shop_no_raw: c.shop_no_raw, doc_type: c.doc_type,
          clause_9_2: c.clause_9_2, confidence: c.confidence, source_file: c.source_file, notes: c.notes,
        })),
        schedule: (schedRes.data ?? []).map((r: any) => ({
          subsection_id: r.subsection_id, shop_no_raw: r.shop_no_raw, initial_cert_nos: r.initial_cert_nos,
          supplementary_cert_nos: r.supplementary_cert_nos, trading_name: r.trading_name,
          coc_required: r.coc_required, files_count: r.files_count, status: r.status, notes: r.notes,
        })),
      });

      const blob = await generatePdfBlob(buildSiteCocReportDocDef(model, null));
      await downloadBlob(blob, `${siteName} - Site COC Report - ${new Date().toISOString().slice(0, 10)}.pdf`);
    } catch (e: any) {
      if (process.env.NODE_ENV === "development") console.error("Client COC report failed:", e);
      toast.error("Could not generate the COC report");
    } finally {
      setGenerating(false);
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-2">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    );
  }

  if (requiredRows.length === 0) {
    return (
      <Alert>
        <AlertDescription>No COC information available for this site yet.</AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <ShieldCheck className="h-5 w-5" /> Certificates of Compliance
          </h3>
          <p className="text-sm text-muted-foreground">
            {requiredRows.length} subsection{requiredRows.length === 1 ? "" : "s"} require a COC
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={handleDownloadReport} disabled={generating}>
          <FileBarChart className="h-4 w-4 mr-2" />
          {generating ? "Preparing…" : "Download COC report"}
        </Button>
      </div>

      <div className="space-y-2">
        {requiredRows.map((row) => (
          <Card key={row.subsectionId}>
            <CardContent className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-3">
              <div className="min-w-0">
                <span className="text-sm font-medium block truncate">{row.name}</span>
                <span className="text-xs text-muted-foreground">
                  {row.expiry ? `Expires ${row.expiry}` : "No expiry recorded"}
                </span>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Badge variant="outline" className={TONE_PILL[row.tone]}>
                  {row.statusLabel}
                </Badge>
                {row.viewUrl && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => onPreview(row.viewUrl!, row.viewName!)}
                  >
                    <Eye className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck the new component**

Run: `npx tsc --noEmit`
Expected: PASS (no type errors). If `toast` import path differs in this repo, change `import { toast } from "sonner";` to the project's toast util and re-run.

- [ ] **Step 3: Assert no write-module imports leaked in**

Run: `grep -nE "useSiteCocImport|useSiteCocPool|resolveShop|rerunAutoMatch|savePDFToDocuments|handleSave|handleDelete|parseWorkbooks|reimport" src/components/client-portal/ClientCocView.tsx; echo "exit=$?"`
Expected: no matches, `exit=1` (grep found nothing → read-only confirmed).

- [ ] **Step 4: Commit**

```bash
git add src/components/client-portal/ClientCocView.tsx
git commit -m "feat(coc): read-only ClientCocView (curated summary + report download)"
```

---

### Task 4: Wire the COC tab into ClientPortalSiteDetail

**Files:**
- Modify: `src/views/ClientPortalSiteDetail.tsx`

**Context (verbatim anchors):** The import block ends with `import { downloadFile } from "@/lib/fileDownload";` (line 25). `FileBarChart` is already imported (line 8) — no new icon import needed. The `<TabsList>` ends after the `subsections` trigger with `</TabsList>` (line 281). The asset-verification `<TabsContent>` block (lines 348–350) is a clean insertion anchor. `siteId` is from `useParams()`, `site.name` is available, and `setPreviewDocument` + the `DocumentPreviewDialog` already exist (lines 33, 428–434).

- [ ] **Step 1: Add the import**

Find:
```tsx
import { ClientPortalDocuments } from "@/components/client-portal/ClientPortalDocuments";
import { downloadFile } from "@/lib/fileDownload";
```
Replace with:
```tsx
import { ClientPortalDocuments } from "@/components/client-portal/ClientPortalDocuments";
import { ClientCocView } from "@/components/client-portal/ClientCocView";
import { downloadFile } from "@/lib/fileDownload";
```

- [ ] **Step 2: Add the TabsTrigger**

Find:
```tsx
          <TabsTrigger value="subsections" className="gap-2 shrink-0">
            <Layers className="h-4 w-4 shrink-0" />
            <span className="hidden lg:inline">Subsections</span>
          </TabsTrigger>
        </TabsList>
```
Replace with:
```tsx
          <TabsTrigger value="subsections" className="gap-2 shrink-0">
            <Layers className="h-4 w-4 shrink-0" />
            <span className="hidden lg:inline">Subsections</span>
          </TabsTrigger>
          <TabsTrigger value="coc" className="gap-2 shrink-0">
            <FileBarChart className="h-4 w-4 shrink-0" />
            <span className="hidden lg:inline">COC</span>
          </TabsTrigger>
        </TabsList>
```

- [ ] **Step 3: Add the TabsContent**

Find:
```tsx
        {/* Asset Verification Tab */}
        <TabsContent value="asset-verification" className="space-y-6">
          <AssetVerification siteId={siteId!} siteName={site.name} readOnly />
        </TabsContent>
```
Replace with:
```tsx
        {/* Asset Verification Tab */}
        <TabsContent value="asset-verification" className="space-y-6">
          <AssetVerification siteId={siteId!} siteName={site.name} readOnly />
        </TabsContent>

        {/* COC Tab */}
        <TabsContent value="coc" className="space-y-4">
          <ClientCocView
            siteId={siteId!}
            siteName={site.name}
            onPreview={(url, name) => setPreviewDocument({ url, name })}
          />
        </TabsContent>
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/views/ClientPortalSiteDetail.tsx
git commit -m "feat(coc): add read-only COC tab to client portal site view"
```

---

### Task 5: Full verification

**Files:** none (verification only).

- [ ] **Step 1: Run the full test suite**

Run: `npm test`
Expected: PASS — all prior tests plus the new `clientCocSummary` tests (baseline was 432 passing across 65 files; expect 432 + new mapper tests, same file count + 1).

- [ ] **Step 2: Build**

Run: `npm run build`
Expected: build succeeds with no type or lint errors.

- [ ] **Step 3: Manual runtime verification (record results)**

1. Sign in as a Client (or admin preview via `?preview=<CLIENT_ID>`), open one of their sites, click the **COC** tab.
2. Confirm: only COC-required subsections list, each with a status badge (green/amber/red), expiry text, and (where a COC PDF exists) an eye icon that opens it in the in-app `DocumentPreviewDialog` (never a new tab).
3. Click **Download COC report** → a PDF downloads (the full Site COC report). Confirm it opens and contains the site's data.
4. Confirm there is **no** import/upload/resolve/save control anywhere on the tab.
5. RLS isolation: with the migration applied, confirm a client cannot read another site's `coc_certificates`/`coc_db_schedule` (SQL impersonation or a second client account). Expected: 0 cross-site rows.

- [ ] **Step 4: Note deploy specifics**

Frontend deploys via Vercel on push to `main` (confirm against project deploy convention). The migration must be applied to prod separately via the Management API (Task 1, Step 3). The PWA service worker caches the bundle — a hard refresh is required to see the new tab after deploy.

---

## Self-review notes

- **Spec coverage:** curated summary (Task 2/3), report download = existing full report (Task 3 handler), RLS leak fix bundled (Task 1), 6th tab in client portal (Task 4), exclusions enforced (Task 3 Step 3 grep). ✓
- **Beyond spec, flagged:** Task 1b (write-leak hardening) is isolated and requires explicit approval. The on-screen data-source refinement is documented in "Spec delta". The report intentionally omits `siteKpis` and client/address on the cover (passed `null`) to avoid extra queries — a deliberate v1 simplification, not a placeholder.
- **Type consistency:** `ClientCocSubsection`/`ClientCocDoc`/`ClientCocRow` and `cocStatusTone`/`cocStatusLabel`/`buildClientCocSummary` are used identically in the test (Task 2), mapper (Task 2), and component (Task 3). Report-builder input shapes match `ReportSubTab.tsx` verbatim.
```
