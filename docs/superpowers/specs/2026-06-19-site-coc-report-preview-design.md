# Site COC report — preview / save / download

**Date:** 2026-06-19
**Surface:** Site COC tab → Report sub-tab (`ReportSubTab.tsx`)
**Status:** Design (approved)

## Problem
The COC report's "Download PDF" force-downloads immediately — no preview, and it's not saved
anywhere. Every other report in the app generates → previews in a dialog → saves to documents.
Bring the COC report in line and reuse that infrastructure.

## Reuse (existing, proven)
- `generatePdfBlob(docDef)` — pdfmake → `Blob` (no auto-download).
- `DocumentPreviewDialog` — in-app contained viewer; props `fileUrl`, `fileName`,
  `downloadBlobData` (download), `onSaveToDocuments`, `saveLocation`, `contextName`, `isSaving`.
- `savePDFToDocuments({ blob, fileName, siteId, categoryName })` — uploads to the `documents`
  bucket + inserts `site_documents` (with `category` = name); find-or-creates the category.
- `getReportCategoryName(reportType)` — add `"site-coc": "Site COC Reports"`.

## Flow (locked)
1. **Generate** — button "Generate report" → build model → `generatePdfBlob(buildSiteCocReportDocDef(model))`.
2. **Preview** — create an object URL from the blob; open `DocumentPreviewDialog`
   (`fileUrl`=objectURL, `fileName`=`${siteName} - Site COC Report - YYYY-MM-DD.pdf`,
   `downloadBlobData`=blob, `saveLocation`='site', `contextName`=siteName).
3. **Download** — handled by the dialog via `downloadBlobData`.
4. **Save** — `onSaveToDocuments` → `savePDFToDocuments({ blob, fileName, siteId,
   categoryName: getReportCategoryName('site-coc') })`; on success toast + refresh the list.
5. **Past reports list** — on the sub-tab, fetch `site_documents` for the site where
   `category = 'Site COC Reports'`, newest first; each row: filename · date · Preview · Download.
   Preview reopens `DocumentPreviewDialog` with the stored `file_url`.

## UX
- Replace the single "Download PDF" button with "Generate report" (opens the preview dialog).
- Below it, "Saved reports" list (or "No saved reports yet").
- Object URLs revoked on dialog close to avoid leaks.

## Files
- `src/lib/pdfDocumentSaver.ts` — add `site-coc` to `getReportCategoryName`.
- `src/views/site-coc/ReportSubTab.tsx` — generate→preview→save flow + saved-reports list +
  `DocumentPreviewDialog`.
- (Optional) `src/components/site/SiteReports.tsx` — add "Site COC Reports" to `REPORT_CATEGORIES`
  so saved COC reports also appear in the main Reports tab. Low-risk one-line add.

## Out of scope (YAGNI)
- New tables (reuse `site_documents`). Deleting saved reports from the COC tab (do it in the
  Documents/Reports tab, which already supports delete).

## Testing
- `getReportCategoryName('site-coc')` unit assertion = "Site COC Reports".
- Build + suite green. Runtime: Generate → preview opens with the PDF → Download works → Save
  stores it (appears in Documents tab + the sub-tab list) → list Preview reopens it.

## Deploy
Frontend-only; standard Vercel deploy.
