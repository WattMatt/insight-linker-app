

# Complete Overhaul: Image Handling for PDF Reports

## Problem Summary

The current PDF generation system has a fundamentally broken image pipeline that has been failing persistently despite multiple attempted fixes. The screenshot shows the logo appearing as a corrupted/tiny artifact on the cover page.

**Root Causes Identified:**

1. **Multiple Competing Systems**: There are 3+ different image loading approaches scattered across the codebase (`pdfEngine.ts`, `simpleImageLoader.ts`, `imageUrlResolver.ts`, `pdfshiftInspectionReport.ts`) that use different strategies
2. **Complex CORS Workarounds**: Multi-tier fallback strategies that don't reliably work
3. **Data Flow Disconnect**: `ComprehensiveInspectionReport.tsx` calls `generateAndSavePdfShiftInspectionReport` (server-side DOCX), but `inspectionReportGenerator.ts` uses `pdfmakeGenerateAndSave` (client-side PDF)
4. **URL Parsing Edge Cases**: The `simpleImageLoader.ts` regex may not match all Supabase URL formats

---

## Current Image Flow (Traced)

```text
Database Storage:
├── inspection.json_data → photos array with Supabase URLs
├── sites.client_logo_url → Logo URL from client-logos bucket
└── sites.site_image_url → Site image from site-images bucket

Client-Side Generation Path (pdfmake):
1. inspectionReportGenerator.ts → calls pdfmakeGenerateAndSave
2. pdfmakeInspectionReport.ts → collectImageUrls() + loadImagesSimple()
3. simpleImageLoader.ts → parseSupabaseUrl() + supabase.storage.download()
4. Convert blob → base64 via FileReader
5. Embed base64 in pdfmake document definition

Server-Side Generation Path (DOCX/PDFShift - NOT USED):
1. ComprehensiveInspectionReport.tsx → calls generateAndSavePdfShiftInspectionReport
2. pdfshiftInspectionReport.ts → calls Edge Function
3. Edge Function downloads images server-side
```

---

## Solution: Unified Client-Side Image Pipeline

### Technical Strategy

Replace all complex image loading with a single, bulletproof approach using **Supabase Storage's native download API** consistently across all image types.

### Key Changes

#### 1. Rewrite `simpleImageLoader.ts`
- Fix URL pattern matching for ALL bucket types (`client-logos`, `site-images`, `inspection-photos`, `documents`)
- Add comprehensive logging for debugging
- Handle query parameters and timestamps in URLs
- Return placeholder on failure instead of null (ensures PDF layout stability)

#### 2. Consolidate Image Loading in `pdfmakeInspectionReport.ts`
- Remove dependency on `pdfEngine.ts` image utilities
- Use only `simpleImageLoader.ts` for all images (logo + photos)
- Pre-cache ALL images before PDF generation starts
- Add the logo URL to the `collectImageUrls` list

#### 3. Add Defensive Image Rendering
- If image fails to load, render a placeholder box with "Image unavailable" text
- This prevents layout collapse from missing images

#### 4. Fix the Logo Loading Path
- Currently logo is loaded separately via `loadImageSimple(siteLogoUrl)`
- Ensure this uses the same robust download path

---

## Files to Modify

| File | Changes |
|------|---------|
| `src/lib/simpleImageLoader.ts` | Rewrite URL parser to handle all bucket formats; add retry logic; return placeholder on failure |
| `src/lib/pdfmakeInspectionReport.ts` | Use unified image loading; add logo to collectImageUrls; add defensive rendering |
| `src/lib/inspectionReportGenerator.ts` | No changes needed (already correctly orchestrates pdfmake) |

---

## Technical Details

### URL Patterns to Support

```
Client Logo:
https://oltzgidkjxwsukvkomof.supabase.co/storage/v1/object/public/client-logos/ade5256f-419e-4860-bfd4-2f38dc3cb21a/logo-1760494216241.png

Site Image:
https://oltzgidkjxwsukvkomof.supabase.co/storage/v1/object/public/site-images/ade5256f-419e-4860-bfd4-2f38dc3cb21a/site-image.jpeg?t=1768382035130

Inspection Photo:
https://oltzgidkjxwsukvkomof.supabase.co/storage/v1/object/public/inspection-photos/ce801ab0-e394-438f-83d6-9905a768fe8a/componentImages/earthLeakage/YARONA_CENTRE_YARONA_CENTRE_ACKERMANS_componentImages_earthLeakage_1767783989118_1.jpg
```

### Improved URL Parser

```typescript
function parseSupabaseUrl(url: string): { bucket: string; path: string } | null {
  if (!url) return null;
  
  try {
    const urlObj = new URL(url);
    // Match: /storage/v1/object/public/BUCKET/PATH or /storage/v1/object/sign/BUCKET/PATH
    const pathMatch = urlObj.pathname.match(/^\/storage\/v1\/object\/(?:public|sign)\/([^\/]+)\/(.+)$/);
    
    if (pathMatch) {
      return {
        bucket: pathMatch[1],
        path: decodeURIComponent(pathMatch[2])
      };
    }
    return null;
  } catch {
    return null;
  }
}
```

### Defensive Image Rendering

```typescript
// In createEngineeringCoverPage:
if (logoDataUrl) {
  content.push({
    image: logoDataUrl,
    height: 80,
    alignment: 'center',
    margin: [0, 80, 0, 60],
  });
} else {
  // Placeholder for missing logo
  content.push({
    table: {
      widths: [180],
      body: [[{
        text: '[Company Logo]',
        alignment: 'center',
        color: '#94a3b8',
        fontSize: 10,
        margin: [0, 30, 0, 30],
      }]]
    },
    layout: { hLineColor: () => '#e2e8f0', vLineColor: () => '#e2e8f0' },
    alignment: 'center',
    margin: [0, 80, 0, 60],
  });
}
```

---

## Cleanup

### Files/Code to Remove

1. **Complex fallback strategies** in `pdfEngine.ts` (lines 119-290)
2. **Duplicate image compression** utilities that are no longer used
3. **Browserless/PDFShift Edge Functions** for inspection reports (optional - can be deprecated)

---

## Expected Outcome

1. Logo renders correctly at proper size on cover page
2. All inspection photos display in 2-column grids
3. Tenant verification photos render in the tenant section
4. Snag photos appear correctly
5. No more corrupted/tiny/missing images

