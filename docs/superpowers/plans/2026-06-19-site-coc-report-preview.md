# Site COC Report — Preview / Save / Download Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Change the COC report from force-download to generate → preview (in-app dialog) → download + save to site documents, with a list of previously-saved reports.

**Architecture:** Reuse `generatePdfBlob`, `DocumentPreviewDialog`, and `savePDFToDocuments`. The Report sub-tab generates a blob, previews it in the shared dialog (which provides download + save), and lists saved `site_documents` in the "Site COC Reports" category. Frontend-only.

**Tech Stack:** React + TS, pdfmake, Supabase, Vitest.

**Spec:** `docs/superpowers/specs/2026-06-19-site-coc-report-preview-design.md`

---

## Task 1: Register the report category

**Files:** Modify `src/lib/pdfDocumentSaver.ts`; Test `src/lib/pdfDocumentSaver.test.ts`

- [ ] **Step 1: Add the failing test (append)**

```ts
import { getReportCategoryName } from "./pdfDocumentSaver";
describe("getReportCategoryName site-coc", () => {
  it("maps site-coc to 'Site COC Reports'", () => {
    expect(getReportCategoryName("site-coc")).toBe("Site COC Reports");
  });
});
```

(If `pdfDocumentSaver.test.ts` already imports other members, add `getReportCategoryName` to that import instead of a new line.)

- [ ] **Step 2: Run — expect FAIL** `npx vitest run src/lib/pdfDocumentSaver.test.ts`

- [ ] **Step 3: Implement** — add the entry to the `categoryMap` in `getReportCategoryName`:

```ts
    "site-coc": "Site COC Reports",
```

- [ ] **Step 4: Run — expect PASS.**
- [ ] **Step 5: Commit** `git add src/lib/pdfDocumentSaver.ts src/lib/pdfDocumentSaver.test.ts && git commit -m "feat(reports): site-coc report category"`

## Task 2: Report sub-tab — generate / preview / save / list

**Files:** Rewrite `src/views/site-coc/ReportSubTab.tsx`

- [ ] **Step 1: Add `siteId` to the props** (needed for save + list). In `SiteCocTab.tsx`, the
`ReportSubTab` usage must pass `siteId={siteId}` (add it).

- [ ] **Step 2: Implement the new component**

```tsx
import { Button } from "@/components/ui/button";
import { FileText, Download, Loader2, Eye } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { generatePdfBlob } from "@/lib/pdfMakeConfig";
import { savePDFToDocuments, getReportCategoryName } from "@/lib/pdfDocumentSaver";
import { DocumentPreviewDialog } from "@/components/DocumentPreviewDialog";
import { buildCocReportModel } from "@/lib/siteCoc/cocReportModel";
import { buildSiteCocReportDocDef } from "@/lib/siteCoc/siteCocReport";
import type { CocScheduleRow, CocCertRow, CocBatch, SubsectionOption } from "./useSiteCoc";

interface SavedReport { id: string; file_name: string; file_url: string; created_at: string; }
const CATEGORY = getReportCategoryName("site-coc");

export function ReportSubTab({ siteId, siteName, schedule, certificates, batch, subsections, clientName, siteAddress }: {
  siteId: string | undefined; siteName: string; schedule: CocScheduleRow[]; certificates: CocCertRow[]; batch: CocBatch | null; subsections: SubsectionOption[]; clientName?: string | null; siteAddress?: string | null;
}) {
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [preview, setPreview] = useState<{ url: string; name: string; blob?: Blob; isObjectUrl?: boolean } | null>(null);
  const [saved, setSaved] = useState<SavedReport[]>([]);
  const empty = !subsections.some(s => s.is_coc_required);

  const fetchSaved = useCallback(async () => {
    if (!siteId) return;
    const { data } = await supabase.from("site_documents").select("id, file_name, file_url, created_at").eq("site_id", siteId).eq("category", CATEGORY).order("created_at", { ascending: false });
    setSaved((data ?? []) as unknown as SavedReport[]);
  }, [siteId]);
  useEffect(() => { fetchSaved(); }, [fetchSaved]);

  const buildModel = () => buildCocReportModel({
    siteName, generatedAt: new Date().toLocaleDateString(), lastImport: batch ? new Date(batch.created_at).toLocaleDateString() : null,
    clientName: clientName ?? null, address: siteAddress ?? null,
    subsections: subsections.map(s => ({ id: s.id, name: s.name, tenant_name: s.tenant_name, is_coc_required: s.is_coc_required })),
    certificates: certificates.map(c => ({ subsection_id: c.subsection_id, cert_no: c.cert_no, cert_type: c.cert_type, verdict: c.verdict, rules: c.rules, issued_date: c.issued_date, coc_document_id: c.coc_document_id, eval_document_id: c.eval_document_id })),
    schedule: schedule.map(r => ({ subsection_id: r.subsection_id, shop_no_raw: r.shop_no_raw, initial_cert_nos: r.initial_cert_nos, supplementary_cert_nos: r.supplementary_cert_nos })),
  });

  const generate = async () => {
    setGenerating(true);
    try {
      const blob = await generatePdfBlob(buildSiteCocReportDocDef(buildModel()));
      const url = URL.createObjectURL(blob);
      setPreview({ url, name: `${siteName} - Site COC Report - ${new Date().toISOString().slice(0, 10)}.pdf`, blob, isObjectUrl: true });
    } catch (e: any) {
      if (process.env.NODE_ENV === "development") console.error("Site COC report failed:", e);
      toast.error("Could not generate the report");
    } finally { setGenerating(false); }
  };

  const closePreview = () => {
    if (preview?.isObjectUrl && preview.url.startsWith("blob:")) URL.revokeObjectURL(preview.url);
    setPreview(null);
  };

  const handleSave = async () => {
    if (!preview?.blob || !siteId) return;
    setSaving(true);
    const res = await savePDFToDocuments({ blob: preview.blob, fileName: preview.name, siteId, categoryName: CATEGORY });
    setSaving(false);
    if (res.success) { toast.success("Report saved to site documents"); fetchSaved(); }
    else toast.error(res.error || "Could not save the report");
  };

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <p className="text-sm text-muted-foreground">Generate the inclusive site COC report, then preview, download, or save it to the site's documents.</p>
        <Button onClick={generate} disabled={generating || empty}>
          {generating ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <FileText className="h-4 w-4 mr-2" />}
          Generate report
        </Button>
        {empty && <p className="text-xs text-muted-foreground">No COC-required subsections on this site.</p>}
      </div>

      <div>
        <p className="text-sm font-medium mb-2">Saved reports</p>
        {saved.length ? (
          <div className="rounded-md border divide-y">
            {saved.map(r => (
              <div key={r.id} className="flex items-center justify-between p-2 gap-2">
                <div className="min-w-0">
                  <div className="text-sm truncate">{r.file_name}</div>
                  <div className="text-xs text-muted-foreground">{new Date(r.created_at).toLocaleString()}</div>
                </div>
                <Button size="sm" variant="ghost" onClick={() => setPreview({ url: r.file_url, name: r.file_name })} title="Preview / download">
                  <Eye className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        ) : <p className="text-xs text-muted-foreground">No saved reports yet.</p>}
      </div>

      {preview && (
        <DocumentPreviewDialog
          open={!!preview}
          onOpenChange={(o) => { if (!o) closePreview(); }}
          fileUrl={preview.url}
          fileName={preview.name}
          downloadBlobData={preview.blob}
          onSaveToDocuments={preview.blob ? handleSave : undefined}
          saveLocation="site"
          contextName={siteName}
          isSaving={saving}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 3: Update `SiteCocTab.tsx`** to pass `siteId` to `ReportSubTab`:

```tsx
<ReportSubTab siteId={siteId} siteName={siteName} schedule={schedule} certificates={certificates} batch={batch} subsections={subsections} clientName={clientName} siteAddress={siteAddress} />
```

- [ ] **Step 4: Build** `npm run build` — Expected: success.
- [ ] **Step 5: Commit** `git add src/views/site-coc/ReportSubTab.tsx src/views/site-coc/SiteCocTab.tsx && git commit -m "feat(site-coc): report preview/save/download + saved-reports list"`

## Task 3: Surface in the main Reports tab (low-risk bonus)

**Files:** Modify `src/components/site/SiteReports.tsx`

- [ ] **Step 1:** Add `"Site COC Reports"` to the `REPORT_CATEGORIES` array so saved COC reports also
appear in the site's Reports tab list (the `getCategoryColor` helper already styles `COC`).

- [ ] **Step 2: Build + Commit** `npm run build && git add src/components/site/SiteReports.tsx && git commit -m "feat(reports): show Site COC Reports in the Reports tab"`

## Task 4: Verify

- [ ] `npx vitest run` — all pass.
- [ ] `npm run build` — succeeds.

## Task 5: Deploy

- [ ] Merge `feat/site-coc-report-preview` → `main`, push; confirm Vercel Ready. (Frontend-only.)
- [ ] Runtime: YARONA → Site COC → Report → Generate report → preview opens (in-app) → Download
  works → Save to site documents → appears in "Saved reports" + the Documents/Reports tabs →
  reopening a saved report previews it.

---

## Self-Review
- Generate→blob → Task 2 `generate`. ✓  Preview (in-app dialog) → Task 2 `DocumentPreviewDialog`. ✓
- Download → dialog `downloadBlobData` (generated) / URL (saved). ✓  Save → `handleSave` +
  `savePDFToDocuments`. ✓
- Category "Site COC Reports" → Task 1 (tested). ✓  Past-reports list → Task 2 `saved`. ✓
- Object URL revoked on close → Task 2 `closePreview`. ✓  Reports-tab surfacing → Task 3. ✓
- Placeholders: none. Types: `SavedReport` consistent; `getReportCategoryName('site-coc')` used in
  Tasks 1↔2; `savePDFToDocuments` options match the saver's `SavePDFOptions`
  (`blob, fileName, siteId, categoryName`); `DocumentPreviewDialog` props match its interface.
