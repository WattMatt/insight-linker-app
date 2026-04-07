
I reviewed the current download flow. The PDF generation itself is not the problem: the report is being created/fetched and rendered in the preview. The break is happening in the final browser handoff to the user’s Downloads flow.

What I found
- `src/components/DocumentPreviewDialog.tsx` uses a plain `<a download>` in the header. That button does not use the safer shared save flow and it ignores `downloadBlobData`, even when the report already exists as an in-memory `Blob`.
- `src/lib/fileDownload.ts` can show a success/start toast even when the browser blocks the actual download handoff inside the preview iframe.
- Some report paths bypass the shared downloader completely, especially `src/lib/wysiwygPdfGenerator.ts` and `src/components/ComprehensiveInspectionReport.tsx`.
- Some preview-generating components fetch/create a `Blob` for preview, but do not pass that `Blob` into `DocumentPreviewDialog`, so the dialog falls back to a weaker URL-based flow.

Implementation plan
1. Make one shared download path the source of truth
   - Refactor `DocumentPreviewDialog` so the Download button calls a real `handleDownload()` function instead of relying on a raw anchor.
   - Download priority will be:
     1. `downloadBlobData`
     2. internally loaded PDF `Blob`
     3. remote file URL

2. Fix the shared utility so it reflects real outcomes
   - Keep `showSaveFilePicker` as the primary path for generated PDFs and other in-memory files.
   - For storage-backed files, replace hidden/programmatic anchor tricks with a direct browser-controlled handoff triggered from the actual click path.
   - Update toast behavior so it never says “Downloaded” unless a real save happened; fallback flows will use accurate wording.

3. Pass Blob data through every generated report preview
   - Preserve and forward the generated `Blob` into `DocumentPreviewDialog` in:
     - `src/components/SiteSummaryReport.tsx`
     - `src/components/SiteDrawingReport.tsx`
     - `src/components/FortressMarkingChecklist.tsx`
     - `src/components/TemplateBasedReport.tsx`
   - In `DocumentPreviewDialog`, when a Supabase PDF is fetched for preview, keep both the object URL and the original `Blob` so the download button uses the `Blob` path instead of a fragile link path.

4. Remove bypasses
   - Replace direct blob-anchor download logic in `src/lib/wysiwygPdfGenerator.ts` with the shared downloader.
   - Update `src/components/ComprehensiveInspectionReport.tsx` to use the same utility instead of its own `downloadPdf(result.blob, fileName)` call.
   - Review `src/components/site/SiteReports.tsx` so saved report downloads use the same pipeline, not a separate anchor-only route.

5. Add a fallback only if the iframe still blocks browser downloads
   - If storage-backed downloads are still blocked after the unified fix, add a top-level download handoff route/page opened directly by user click, so the browser handles the attachment outside the fragile inline preview flow.
   - This is a fallback layer, not the primary fix.

Technical details
- No database, RLS, or Supabase schema changes are needed.
- The issue is in client-side download handling, not report generation or storage access.
- The best fix is to standardize on Blob-first saving wherever possible, because that supports generated PDFs, offline-capable flows, and consistent behavior across report types.
- The current code already has the right building blocks (`downloadBlob`, `downloadFile`, preview `Blob`s); they just are not wired together consistently.

Files likely to change
- `src/lib/fileDownload.ts`
- `src/components/DocumentPreviewDialog.tsx`
- `src/components/SiteSummaryReport.tsx`
- `src/components/SiteDrawingReport.tsx`
- `src/components/FortressMarkingChecklist.tsx`
- `src/components/TemplateBasedReport.tsx`
- `src/components/ComprehensiveInspectionReport.tsx`
- `src/lib/wysiwygPdfGenerator.ts`
- `src/components/site/SiteReports.tsx`

Acceptance checks
- Clicking Download in a generated Site Summary preview saves the PDF.
- Clicking Download in other generated report previews also saves the PDF.
- Clicking Download from saved reports/documents on the site page saves the file.
- Toasts match reality: no false “downloaded” message when nothing was saved.
- Previewing and “save to documents” still work after the refactor.
