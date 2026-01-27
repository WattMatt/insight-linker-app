
# Plan: Align PDF Generator with PDF_LAYOUT_STANDARDS.md

## Summary

The current `generate-inspection-pdf` implementation is **largely compliant** with the layout standards. However, there are a few discrepancies that need to be corrected to ensure full alignment and prevent potential layout issues (orphaned photo grids, split tables).

---

## Discrepancies to Fix

### 1. Browserless Margin Configuration (Critical)

**Standard Requires:**
```typescript
margin: {
  top: '20mm',
  bottom: '20mm',
  left: '10mm',
  right: '10mm'
}
```

**Current Implementation (Line 1553):**
```typescript
margin: { top: '0mm', right: '0mm', bottom: '20mm', left: '0mm' }
```

**Issue:** Top and side margins set to `0mm` means CSS `@page` margins are handling it alone. This can cause conflicts when Browserless applies its own logic. The standard mandates explicit Browserless margins to sync with CSS.

---

### 2. Photo Grid Content Integrity (Missing Rule)

**Standard Requires:**
```css
.photo-grid {
  break-inside: avoid;
  page-break-inside: avoid;
}
```

**Current Implementation:** Only `.inspection-item` and `.tenant-card` have `break-inside: avoid`. The photo grid containers (`.photo-grid-2`, `.photo-grid-3`) are missing this rule.

**Risk:** A photo grid could be split across pages, leaving orphaned photos.

---

### 3. Table Container Integrity (Missing Rule)

**Standard Requires:**
```css
.table-container {
  break-inside: avoid;
  page-break-inside: avoid;
}
```

**Current Implementation:** The `.breakdown-table` and `.info-table` do not have `break-inside: avoid`.

**Risk:** Tables could break mid-row across pages.

---

## Technical Changes

### File: `supabase/functions/generate-inspection-pdf/index.ts`

#### Change 1: Update Browserless Margin Configuration

**Location:** Line 1553

```typescript
// BEFORE
margin: { top: '0mm', right: '0mm', bottom: '20mm', left: '0mm' },

// AFTER (aligned with PDF_LAYOUT_STANDARDS.md)
margin: {
  top: '20mm',
  bottom: '20mm', 
  left: '10mm',
  right: '10mm'
},
```

#### Change 2: Add Photo Grid Content Integrity Rules

**Location:** After line 1380 (in CSS section)

```css
/* Photo grid content integrity - prevents split across pages */
.photo-grid-2,
.photo-grid-3 {
  break-inside: avoid;
  page-break-inside: avoid;
}
```

#### Change 3: Add Table Container Content Integrity Rules

**Location:** After the `.breakdown-table` and `.info-table` definitions

```css
/* Table content integrity - prevents split across pages */
.breakdown-table,
.info-table,
.tenant-table {
  break-inside: avoid;
  page-break-inside: avoid;
}
```

---

## Updated CSS Structure (Summary)

```text
+----------------------------------------------+
| @page { margin: 20mm 10mm 20mm 10mm }        |  <-- CSS defines page margins
+----------------------------------------------+
| .page.cover { page-break-before: avoid }     |  <-- No break before cover
+----------------------------------------------+
| .page.dashboard,                             |
| .page.breakdown { page-break-before: always }|  <-- New pages for fixed sections
+----------------------------------------------+
| .section-container { page-break-before: always }
| .section-container:first-child { page-break-before: auto }
+----------------------------------------------+
| Content Integrity:                           |
| - .inspection-item { break-inside: avoid }   |
| - .photo-grid-2, .photo-grid-3 { break-inside: avoid }  <-- NEW
| - .tenant-card { break-inside: avoid }       |
| - .breakdown-table, .info-table { break-inside: avoid } <-- NEW
+----------------------------------------------+
| Browserless margins sync:                    |
| { top: '20mm', bottom: '20mm',              |
|   left: '10mm', right: '10mm' }              |  <-- FIXED
+----------------------------------------------+
```

---

## Expected Outcome

1. **No blank pages** - Page break rules are correctly applied
2. **No orphaned photos** - Photo grids cannot split across pages
3. **No split tables** - Tables remain intact on a single page
4. **Consistent margins** - CSS and Browserless margins are synchronized
5. **Full SANS 10142-1 compliance** - Professional document formatting

---

## Files to Modify

| File | Changes |
|------|---------|
| `supabase/functions/generate-inspection-pdf/index.ts` | Update Browserless margins, add content integrity CSS rules |

