

# Fix Download Buttons Not Working

## Problem
Download buttons fail silently because `downloadFile()` uses `fetch()` to download from Supabase storage URLs, which can fail due to CORS restrictions. The fallback opens a new tab instead of downloading. Meanwhile, the DocumentPreviewDialog already successfully loads PDFs via the Supabase SDK `download()` method for preview -- but its download button ignores that and re-fetches via `fetch()`.

## Plan

### Step 1: Update `fileDownload.ts` to support Supabase storage URLs
Modify the `downloadFile` function to detect Supabase storage URLs and use the Supabase SDK `download()` method instead of raw `fetch()`. This mirrors the pattern already working in `DocumentPreviewDialog` for PDF rendering.

**File:** `src/lib/fileDownload.ts`
- Import `supabase` client
- Parse the URL to extract bucket name and file path when it matches the Supabase storage URL pattern
- Use `supabase.storage.from(bucket).download(path)` for Supabase URLs
- Keep the existing `fetch()` path as fallback for non-Supabase URLs (blob URLs, external URLs)

### Step 2: Use blob URL in DocumentPreviewDialog when available
In the preview dialog, the download button should use `pdfBlobUrl` (already fetched via SDK) when available, avoiding a redundant network request.

**File:** `src/components/DocumentPreviewDialog.tsx`
- Line 550: Change `downloadFile(fileUrl, fileName)` to use `pdfBlobUrl || fileUrl`

## Technical Details

The Supabase storage URL pattern is:
`https://{ref}.supabase.co/storage/v1/object/public/{bucket}/{path}`

The SDK call that already works for preview:
```ts
const { data, error } = await supabase.storage.from(bucket).download(filePath);
```

This fix applies to all download buttons across the app since they all funnel through `downloadFile()` or the `DocumentPreviewDialog`.

## Files Changed
1. `src/lib/fileDownload.ts` -- Add Supabase SDK download path
2. `src/components/DocumentPreviewDialog.tsx` -- Use cached blob URL for download

