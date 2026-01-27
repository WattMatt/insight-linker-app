
# Complete PDF Generation System Rebuild

## Problem Summary

After a full day of attempts, the inspection report generation has consistently failed to produce output matching your reference document. The issues stem from:

1. **Image Rendering Failures**: Both pdfmake and DOCX generators have produced inconsistent results with images
2. **Template Mismatch**: The generated output structure doesn't match your reference document
3. **Architecture Complexity**: Multiple overlapping generators (pdfmake, DOCX, Browserless, Google Docs, PDFShift) have created confusion

## Fresh Start Architecture

We will build a completely new system with two components:

```text
+------------------+        +---------------------+        +------------------+
|  CLIENT SIDE     |   -->  |   HTML TEMPLATE     |   -->  |  BROWSERLESS     |
|  Data Collector  |        |   (Complete HTML)   |        |  PDF Renderer    |
+------------------+        +---------------------+        +------------------+
       |                            |                            |
   Collect data              Build pixel-perfect           Headless Chrome
   + pre-fetch               HTML matching reference       renders to PDF
   images as base64          document exactly
```

### Why HTML + Browserless?

| Approach | Image Support | Layout Control | Reliability |
|----------|---------------|----------------|-------------|
| pdfmake  | Poor in Deno  | Programmatic   | Unreliable  |
| DOCX     | Requires preview lib | Limited | Moderate  |
| pdf-lib  | Manual positioning | Very limited | Good |
| **HTML + Browserless** | Native `<img>` tags | Full CSS | Excellent |

You already have the `BROWSERLESS_API_KEY` configured. Browserless renders HTML in a real Chrome browser, so CSS/HTML layouts work exactly as designed.

---

## Reference Document Structure (Exact Match Target)

Based on your uploaded reference document, the PDF must have this exact structure:

### Page 1: Cover Page
- Full-width navy header bar with template name (white text)
- Centered logo below header
- Large template title (dark blue, centered)
- Subsection name below title (teal/gray)
- Metadata table with teal left border:
  - Site: [value]
  - Client: [value]
  - Inspector: [value]
  - Date: [value]
- Footer: "CONFIDENTIAL - For authorized use only" | "Page 1 of X" | Date

### Page 2: Quality Score Dashboard
- Navy header bar + teal "QUALITY SCORE DASHBOARD" banner
- Three large statistics in a row:
  - % COMPLIANCE (green number)
  - ITEMS CHECKED (dark blue number)
  - PHOTOS (dark blue number)
- SANS 10142-1 notice (italic, centered)
- 2x2 grid of colored stat cards:
  - Items Passed (green background)
  - Items Failed (red background)
  - Pending Review (amber background)
  - Photos Captured (blue background)

### Page 3: Section Breakdown + General Info
- Navy header bar
- Large circular progress indicator (77% OVERALL)
- "Section Breakdown" table:
  | Section | Items | Pass | Fail | Photos | Score |
  - Pass/Fail numbers colored (green/red)
  - Score percentage colored based on value
- "GENERAL INFORMATION" teal banner
- Info table with alternating row backgrounds

### Pages 4+: Section Content
- Teal section header with number: "1  SECTION NAME"
- For each item:
  - Item label (left) with PASS/FAIL/N/A badge (right, colored background)
  - Photo grid in bordered container (2 columns max)
  - "Photo 1", "Photo 2" labels below each image

---

## Implementation Plan

### Phase 1: Create HTML Template Engine

**New File**: `supabase/functions/generate-inspection-pdf/index.ts`

This replaces all existing PDF generation for inspections. The function will:

1. Accept the exact same payload structure as current generators
2. Pre-download all images using the Supabase service role client
3. Build a complete, self-contained HTML document with embedded base64 images
4. Send to Browserless for PDF conversion
5. Upload result to Supabase Storage
6. Return download URL

Key HTML template sections:
- `buildCoverPageHTML()` - Exact match to reference page 1
- `buildDashboardHTML()` - Exact match to reference page 2
- `buildBreakdownHTML()` - Exact match to reference page 3
- `buildSectionHTML()` - Exact match to reference pages 4+
- CSS using `@page` rules for proper A4 sizing and page breaks

### Phase 2: Robust Image Pipeline

The image handler will:
1. Collect all unique image URLs from the payload
2. Download in parallel batches (5 concurrent)
3. Use Supabase Image Transformation for compression (400px, 75% quality)
4. Convert to base64 data URIs
5. Embed directly in `<img>` tags (no external references)

```text
Image Pipeline:
  URL -> Supabase Transform -> Download -> Base64 -> Embed in HTML
```

### Phase 3: Update Client-Side Caller

**Modified File**: `src/lib/pdfshiftInspectionReport.ts`

Update to call the new `generate-inspection-pdf` function instead of the DOCX generator.

### Phase 4: Cleanup Legacy Functions

After verification, mark these as deprecated:
- `generate-pdf-pdfmake`
- `generate-docx-report` (for inspections)

---

## Technical Specifications

### HTML Page Structure

```html
<!DOCTYPE html>
<html>
<head>
  <style>
    @page { size: A4; margin: 0; }
    body { font-family: 'Segoe UI', Roboto, sans-serif; }
    .page { width: 210mm; height: 297mm; page-break-after: always; }
    .header-bar { background: #1a365d; color: white; padding: 12px 20px; }
    .section-banner { background: #0d7377; color: white; padding: 10px 20px; }
    .pass-badge { background: #dcfce7; color: #16a34a; padding: 4px 12px; }
    .fail-badge { background: #fef2f2; color: #dc2626; padding: 4px 12px; }
    /* ... complete CSS matching reference ... */
  </style>
</head>
<body>
  <!-- Page 1: Cover -->
  <div class="page cover">...</div>
  <!-- Page 2: Dashboard -->
  <div class="page dashboard">...</div>
  <!-- Page 3: Breakdown -->
  <div class="page breakdown">...</div>
  <!-- Pages 4+: Sections -->
  <div class="page section">...</div>
</body>
</html>
```

### Browserless API Call

```typescript
const response = await fetch('https://chrome.browserless.io/pdf', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Basic ${btoa(BROWSERLESS_API_KEY + ':')}`,
  },
  body: JSON.stringify({
    html: completeHTML,
    options: {
      format: 'A4',
      printBackground: true,
      margin: { top: '0mm', right: '0mm', bottom: '0mm', left: '0mm' },
      displayHeaderFooter: false,
    },
  }),
});
```

---

## Files to Create/Modify

| File | Action | Description |
|------|--------|-------------|
| `supabase/functions/generate-inspection-pdf/index.ts` | **CREATE** | New HTML-to-PDF generator |
| `supabase/config.toml` | **MODIFY** | Add new function config |
| `src/lib/pdfshiftInspectionReport.ts` | **MODIFY** | Call new function |
| `src/components/ComprehensiveInspectionReport.tsx` | **MINOR** | Ensure correct payload |

---

## Testing Strategy

1. Deploy new Edge Function
2. Generate a test report using existing inspection data
3. Compare output visually against reference document
4. Verify all images render correctly
5. Check page breaks and layout consistency
6. Validate footer pagination

---

## Timeline Estimate

- Phase 1 (HTML Template): Core implementation
- Phase 2 (Image Pipeline): Using proven patterns from existing code
- Phase 3 (Integration): Minimal changes
- Phase 4 (Testing): Visual verification

---

## Risk Mitigation

- **Browserless Timeout**: Set generous timeouts, use efficient HTML
- **Large Reports**: Implement chunked image processing
- **Fallback**: Keep existing generators as backup during transition
