# Site Summary Report - Design Review & Fine-Tuning Plan

## Current State Analysis

Based on the review of `YARONA_CENTRE_Summary_Report.pdf`, this document identifies issues against the `DOCUMENT_DESIGN_STANDARDS` and proposes fixes.

---

## 1. COVER PAGE (Page 1)

### Issues Identified:
| Issue | Severity | Description |
|-------|----------|-------------|
| ❌ Missing client logo | High | Header shows "FORTRESS_FUND" as text only - no logo image |
| ❌ No site image | Medium | Cover page lacks visual site representation |
| ⚠️ Excessive white space | Medium | Large empty area between title and footer |
| ⚠️ Missing site address | Low | No location/address context provided |
| ⚠️ Missing prepared by/for | Low | No attribution for report authorship |
| ⚠️ Missing report ID/version | Low | No unique identifier for tracking |

### Proposed Fixes:
1. Add client logo (from `clients.logo_url`) in header, max 40x20mm
2. Add site image (from `sites.site_image_url`) as hero element
3. Add "Prepared by" and "Prepared for" sections
4. Add site address below site name
5. Add report reference number (UUID short code or sequential)
6. Add confidentiality notice at bottom

---

## 2. HEALTH OVERVIEW PAGE (Page 2)

### Issues Identified:
| Issue | Severity | Description |
|-------|----------|-------------|
| ✅ Good | - | Health cards are well-designed with clear percentages |
| ✅ Good | - | Color coding for status (green/orange/blue/red) is clear |
| ⚠️ Incomplete grid | Medium | Only 4 category cards shown, even if more exist |
| ⚠️ No legend | Low | Colors not explained in text |
| ⚠️ Empty space | Low | Bottom half of page is empty |

### Proposed Fixes:
1. Support dynamic rows for category health (wrap to next row)
2. Add color legend explaining thresholds (≥80% green, ≥60% orange, <60% red)
3. Consider adding a summary table below the visual cards
4. Add "Executive Summary" section with key findings

---

## 3. SUBSECTION CARDS (Pages 3-13)

### Issues Identified:
| Issue | Severity | Description |
|-------|----------|-------------|
| ❌ Cards cropped at bottom | High | "... and 1 more files" text appears cut off at card edge |
| ❌ Fixed card height | High | Cards use fixed 115mm height causing content overflow |
| ⚠️ No category grouping | Medium | Subsections not visually grouped by category |
| ⚠️ Repetitive site name | Low | "(YARONA CENTRE)" repeated in every subsection title |
| ⚠️ Table styling inconsistent | Low | Some tables have headers, some don't |
| ⚠️ Document list overflow | Medium | Long filenames truncate or overflow |

### Proposed Fixes:
1. **Dynamic card height** - Calculate height based on content
2. **Better overflow handling** - If content exceeds space, continue on next page
3. **Remove redundant site name** - Site name is in page header already
4. **Group by category** - Add category divider pages or section headers
5. **Filename truncation** - Apply consistent truncation with ellipsis
6. **Table improvements**:
   - Consistent header styling across all tables
   - Zebra striping for readability
   - Cell padding per design standards

---

## 4. TYPOGRAPHY ISSUES

### Current:
- Font sizes vary inconsistently (7-16pt without clear hierarchy)
- Some headings use 10pt same as body text
- Line spacing not consistent

### Required (from standards):
```javascript
scale: {
  h1: 24,
  h2: 18,
  h3: 14,
  h4: 12,
  body: 10,
  caption: 8,
  footer: 7,
}
```

### Fixes:
1. Apply proper type scale:
   - Page titles: 24pt bold
   - Section titles (Site Health Overview): 18pt bold
   - Card titles (Metering Details): 12pt bold
   - Body text: 10pt regular
   - Table text: 9pt regular
   - Captions/metadata: 8pt regular
   - Footer: 7pt regular

---

## 5. MARGINS AND GRID

### Current:
- Left margin: 15-20mm (inconsistent)
- Right margin: 15-20mm (inconsistent)
- Cards start at different X positions

### Required:
```javascript
margins: {
  top: 20,
  bottom: 20,
  left: 15,
  right: 15,
}
```

### Fixes:
1. Apply consistent 15mm margins throughout
2. Content width should be exactly 180mm (210 - 15 - 15)
3. Cards should be 180mm wide (full content width)

---

## 6. PAGE BREAKS AND FLOW

### Issues:
- Two subsection cards per page regardless of content length
- Cards get cropped if content overflows 115mm height
- No orphan/widow control for document lists

### Fixes:
1. Calculate actual card height based on:
   - Metering rows
   - COC rows
   - Snag count
   - Inspection table rows
   - Document list items
2. If card height > remaining page space, start on new page
3. If card is too tall for single page, split intelligently:
   - Card header + Metering + COC on first page
   - Snags + Inspections + Documents on continuation

---

## 7. HEADERS AND FOOTERS

### Current:
- Footer: "Page X" centered, gray text
- No header on content pages
- No confidentiality notice

### Required:
```javascript
footers: {
  content: {
    left: 'confidentiality_notice',
    center: 'page_number',
    right: 'generation_date',
  },
  confidentialityText: 'CONFIDENTIAL - For authorized use only',
  pageNumberFormat: 'Page {current} of {total}',
}
```

### Fixes:
1. Add running header with document title and client logo
2. Update footer format: "CONFIDENTIAL | Page 1 of 14 | 2026-01-09"
3. Use smaller footer font (7pt) per standards
4. Add border line above footer

---

## 8. COLORS AND CONTRAST

### Current:
- Blue headings: RGB(63, 81, 181) ✅ Good
- Status badges use appropriate colors ✅ Good
- Gray text: RGB(150, 150, 150) ⚠️ May be too light

### Fixes:
1. Muted text minimum: RGB(113, 128, 150) for WCAG compliance
2. Ensure all gray text meets 4.5:1 contrast ratio
3. Use consistent color tokens from standards:
   - Headings: `#1a365d`
   - Body: `#2d3748`
   - Muted: `#718096`

---

## 9. ANNEXES (COC VERIFICATION REPORTS)

### Issues:
- Annex cover pages work well ✅
- Detail pages may have spacing issues
- Long lists may overflow

### Fixes:
1. Apply same page break logic as main content
2. Ensure recommendations list doesn't exceed page bounds
3. Add "continued" indicator when content splits

---

## PRIORITY IMPLEMENTATION ORDER

### Phase 1: Critical (Prevents content loss)
1. ✅ Dynamic card height calculation
2. ✅ Page break logic before card overflow
3. ✅ Document list truncation

### Phase 2: High (Professional appearance)
4. Add client logo to cover and headers
5. Add site image to cover
6. Fix typography scale
7. Consistent margins and grid

### Phase 3: Medium (Enhanced usability)
8. Category grouping/dividers
9. Improved headers and footers
10. Color contrast fixes
11. Executive summary section

### Phase 4: Polish
12. Table of contents
13. Accessibility tags
14. Preflight validation

---

## CODE CHANGES REQUIRED

### File: `src/components/SiteSummaryReport.tsx`

1. **Import design standards**:
```typescript
import { DOCUMENT_DESIGN_STANDARDS, shouldBreakPage, getContentWidth } from '@/lib/documentDesignStandards';
```

2. **Replace magic numbers** with design standard constants

3. **Update renderSubsectionCard**:
   - Calculate dynamic height
   - Accept max Y position parameter
   - Return actual height used

4. **Add header/footer functions**:
   - `renderHeader(doc, pageNumber, siteName, clientLogoUrl)`
   - `renderFooter(doc, pageNumber, totalPages, date)`

5. **Add page break logic**:
   - Before rendering each card, check available space
   - If insufficient, add new page first

6. **Fix font sizes** to use `typography.scale` values

---

## ESTIMATED EFFORT

| Task | Complexity | Est. Hours |
|------|------------|------------|
| Dynamic card heights | High | 4 |
| Page break logic | Medium | 2 |
| Logo/image integration | Medium | 2 |
| Typography standardization | Low | 1 |
| Headers/footers | Low | 1 |
| Color/contrast fixes | Low | 0.5 |
| Testing & QA | Medium | 2 |
| **TOTAL** | | **~12.5 hours** |
