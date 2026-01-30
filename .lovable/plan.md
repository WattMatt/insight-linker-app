

# WYSIWYG Inspection Report Generator: Complete Rebuild

## Overview

Replace the broken pdfmake/image-fetching pipeline with a **visual-first approach**:

1. **Render the report as HTML/React** in a preview container
2. **Use html2canvas** to capture the visual output as images
3. **Generate PDF** from those captured images using jsPDF

This approach guarantees that **what you see is exactly what gets exported** because we're literally screenshotting the rendered page.

---

## Architecture

```text
User clicks "Generate Report"
         │
         ▼
┌─────────────────────────────────────┐
│  InspectionReportPreview.tsx        │
│  (React component renders report)   │
│  - Cover page with logo             │
│  - Sections with findings           │
│  - Photo grids (using <img> tags)   │
│  - Tenant cards                     │
│  - Signatures                       │
└─────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────┐
│  User sees WYSIWYG preview          │
│  in a dialog/modal                  │
└─────────────────────────────────────┘
         │
         ▼ (User clicks "Download PDF")
┌─────────────────────────────────────┐
│  html2canvas captures each page     │
│  → Canvas screenshots               │
└─────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────┐
│  jsPDF creates PDF from images      │
│  → Final PDF file                   │
└─────────────────────────────────────┘
```

---

## Files to Create

| File | Purpose |
|------|---------|
| `src/components/inspection-report/InspectionReportPreview.tsx` | Main WYSIWYG report renderer (React component) |
| `src/components/inspection-report/CoverPage.tsx` | Cover page with logo and metadata |
| `src/components/inspection-report/QualityDashboard.tsx` | Quality score dashboard |
| `src/components/inspection-report/SectionPage.tsx` | Section with checklist items and photos |
| `src/components/inspection-report/TenantSection.tsx` | Tenant verification cards |
| `src/components/inspection-report/SnagSection.tsx` | Snags/defects listing |
| `src/components/inspection-report/SignaturePage.tsx` | Signatures section |
| `src/lib/wysiwygPdfGenerator.ts` | html2canvas + jsPDF conversion utility |

---

## Files to Modify

| File | Changes |
|------|---------|
| `src/components/ComprehensiveInspectionReport.tsx` | Replace pdfmake calls with WYSIWYG preview + screenshot-to-PDF workflow |
| `package.json` | Add jsPDF dependency (html2canvas already installed) |

---

## Technical Implementation Details

### 1. Install jsPDF
```bash
npm install jspdf
```

### 2. Report Preview Component Structure

```tsx
// src/components/inspection-report/InspectionReportPreview.tsx
export function InspectionReportPreview({ data, onGeneratePdf }) {
  const pagesRef = useRef<HTMLDivElement[]>([]);
  
  return (
    <div className="wysiwyg-report-container">
      {/* Page 1: Cover */}
      <div ref={el => pagesRef.current[0] = el} className="page">
        <CoverPage {...} />
      </div>
      
      {/* Page 2: Quality Dashboard */}
      <div ref={el => pagesRef.current[1] = el} className="page">
        <QualityDashboard {...} />
      </div>
      
      {/* Section Pages */}
      {sections.map((section, idx) => (
        <div ref={el => pagesRef.current[idx+2] = el} className="page">
          <SectionPage section={section} />
        </div>
      ))}
    </div>
  );
}
```

### 3. Page Styling (A4 dimensions)

```css
.page {
  width: 210mm;
  min-height: 297mm;
  background: white;
  padding: 20mm 10mm;
  box-sizing: border-box;
  margin-bottom: 16px;
  box-shadow: 0 4px 12px rgba(0,0,0,0.1);
}
```

### 4. Screenshot-to-PDF Conversion

```typescript
// src/lib/wysiwygPdfGenerator.ts
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';

export async function generatePdfFromPages(
  pages: HTMLElement[],
  filename: string
): Promise<{ success: boolean; blob?: Blob; url?: string; error?: string }> {
  const pdf = new jsPDF('p', 'mm', 'a4');
  const pageWidth = 210;
  const pageHeight = 297;
  
  for (let i = 0; i < pages.length; i++) {
    const page = pages[i];
    
    // Capture page as canvas
    const canvas = await html2canvas(page, {
      scale: 2, // Higher resolution
      useCORS: true,
      allowTaint: true,
      backgroundColor: '#ffffff',
    });
    
    // Convert to image
    const imgData = canvas.toDataURL('image/jpeg', 0.95);
    
    // Add page to PDF
    if (i > 0) pdf.addPage();
    pdf.addImage(imgData, 'JPEG', 0, 0, pageWidth, pageHeight);
  }
  
  const blob = pdf.output('blob');
  const url = URL.createObjectURL(blob);
  
  return { success: true, blob, url };
}
```

### 5. Cover Page Component

```tsx
// src/components/inspection-report/CoverPage.tsx
export function CoverPage({ 
  logoUrl, 
  templateName, 
  subsectionName, 
  siteName, 
  clientName, 
  inspectorName, 
  inspectionDate 
}) {
  return (
    <div className="cover-page">
      {/* Top accent bar */}
      <div className="h-4 bg-[#1e3a5f] absolute top-0 left-0 right-0" />
      
      {/* Logo - uses standard <img> tag */}
      {logoUrl && (
        <img 
          src={logoUrl} 
          alt="Company Logo"
          className="h-20 mx-auto mt-20 object-contain"
          crossOrigin="anonymous"
        />
      )}
      
      {/* Title */}
      <h1 className="text-3xl font-bold text-[#1e3a5f] text-center mt-16">
        {templateName || 'Inspection Report'}
      </h1>
      
      {/* ... metadata table */}
    </div>
  );
}
```

### 6. Image Handling (Simplified)

Since images are rendered as standard `<img>` tags in the browser:
- The browser handles all image loading natively
- `html2canvas` captures what's visible on screen
- No complex base64 conversion or Supabase downloads needed
- Logo and photos just work because the browser already loaded them

### 7. User Flow

1. User clicks **"Generate Report"** button
2. Dialog opens showing **live WYSIWYG preview** (scrollable pages)
3. User can review the report visually
4. User clicks **"Download PDF"**
5. System captures each page with html2canvas
6. jsPDF assembles the images into a PDF
7. PDF downloads automatically

---

## Benefits of This Approach

| Issue | Old Approach | New Approach |
|-------|--------------|--------------|
| Image loading | Complex CORS workarounds, base64 conversion | Browser loads images normally via `<img>` tags |
| Layout accuracy | pdfmake approximates layout | Exact screenshot of rendered HTML |
| Logo rendering | Broken/corrupted | Just works (browser renders it) |
| Debugging | Hard to debug PDF internals | Visual preview shows exactly what will export |
| Maintenance | Multiple fallback strategies | Single straightforward pipeline |

---

## Cleanup (Deprecation)

Once the new system is working, the following can be deprecated:

1. `src/lib/pdfmakeInspectionReport.ts` - No longer needed
2. `src/lib/simpleImageLoader.ts` - Not needed for WYSIWYG
3. Complex image loading in `src/lib/pdfEngine.ts`
4. Server-side Edge Functions for PDF generation (`generate-pdf-*`)

---

## Expected Result

1. Logo renders correctly at proper size on cover page
2. All inspection photos display in grids exactly as previewed
3. Tenant verification photos render correctly
4. What you see in the preview is exactly what exports to PDF
5. No more corrupted/tiny/missing images

