# PDF Layout Standards for Inspection Reports

This document defines the CSS layout patterns that ALL PDF report generators must follow to ensure professional output without blank pages.

---

## Core Principle

> **Use `page-break-before` only. Never use `page-break-after`.**

Combining `page-break-after` with `page-break-before` creates blank intermediate pages. This standard eliminates that conflict.

---

## CSS Architecture

### 1. Page Margins (Browserless)

```css
@page {
  size: A4;
  margin: 20mm 10mm 20mm 10mm; /* top, right, bottom, left */
}
```

- **20mm top/bottom**: Provides header/footer space
- **10mm left/right**: Professional document margins
- Browserless handles page sizing via `preferCSSPageSize: true`

---

### 2. Page Container Rules

```css
/* Base page container - NO fixed heights */
.page {
  width: 100%;
  padding: 0;
  position: relative;
  background: white;
}

/* Force new pages for specific sections */
.page.dashboard,
.page.breakdown,
.page.cover ~ .page {
  page-break-before: always;
}

/* Cover page never triggers a preceding break */
.page.cover {
  page-break-before: avoid;
}
```

#### ❌ DO NOT USE:
```css
/* WRONG - causes blank pages */
.page {
  min-height: 297mm;  /* Forces full page height */
  page-break-after: always;  /* Creates trailing blanks */
}
```

---

### 3. Section Container Rules

```css
/* Flowing content sections */
.section-container {
  page-break-before: always;
}

/* First section after fixed pages - no leading break */
.section-container:first-child {
  page-break-before: auto;
}
```

---

### 4. Content Integrity

```css
/* Prevent orphaned headers or split content */
.inspection-item,
.photo-grid,
.subsection-card,
.table-container {
  break-inside: avoid;
  page-break-inside: avoid;
}

/* Headers should stay with content */
.section-header {
  break-after: avoid;
  page-break-after: avoid;
}
```

---

## Report Structure Template

```text
┌─────────────────────────────────────────────┐
│ PAGE 1: Cover Page                          │
│ - class="page cover"                        │
│ - page-break-before: avoid                  │
└─────────────────────────────────────────────┘
           ↓ (page-break-before: always)
┌─────────────────────────────────────────────┐
│ PAGE 2: Dashboard                           │
│ - class="page dashboard"                    │
│ - KPIs, compliance score, summary stats     │
└─────────────────────────────────────────────┘
           ↓ (page-break-before: always)
┌─────────────────────────────────────────────┐
│ PAGE 3: Breakdown/TOC                       │
│ - class="page breakdown"                    │
│ - Section overview, general info            │
└─────────────────────────────────────────────┘
           ↓ (page-break-before: always)
┌─────────────────────────────────────────────┐
│ PAGES 4+: Content Sections                  │
│ - class="section-container"                 │
│ - Inspection items, photos, tables          │
│ - Content flows naturally with breaks       │
└─────────────────────────────────────────────┘
```

---

## Browserless Configuration

```typescript
const pdfOptions = {
  pdf: {
    format: 'A4',
    printBackground: true,
    preferCSSPageSize: true,  // CRITICAL: Respect CSS @page rules
    displayHeaderFooter: true,
    headerTemplate: '<span></span>',
    footerTemplate: `
      <div style="width: 100%; font-size: 9px; text-align: center; color: #666;">
        Page <span class="pageNumber"></span> of <span class="totalPages"></span>
      </div>
    `,
    margin: {
      top: '20mm',
      bottom: '20mm',
      left: '10mm',
      right: '10mm'
    }
  }
};
```

---

## Checklist for New Report Generators

- [ ] Use `@page` rule with consistent margins
- [ ] Page containers use `width: 100%`, no fixed heights
- [ ] Cover page has `page-break-before: avoid`
- [ ] Subsequent fixed pages use `page-break-before: always`
- [ ] No `page-break-after` rules anywhere
- [ ] Content blocks use `break-inside: avoid`
- [ ] Section headers use `break-after: avoid`
- [ ] Browserless config has `preferCSSPageSize: true`

---

## Affected Edge Functions

| Function | Status | Notes |
|----------|--------|-------|
| `generate-inspection-pdf` | ✅ Updated | Primary inspection reports |
| `generate-pdf` | 🔄 Review | Site summary reports |
| `generate-pdf-browserless` | 🔄 Review | Legacy fallback |
| `generate-docx-report` | N/A | Word format, different rules |

---

## SANS 10142-1 Compliance Note

All electrical compliance reports must maintain professional formatting per SANS regulations. Blank pages are unacceptable in formal documentation submitted to authorities.

---

*Last updated: 2026-01-27*
*Standard version: 2.0*
