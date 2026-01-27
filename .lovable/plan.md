
# Remove Blank Pages from PDF Report

## Problem Identified

The PDF has unnecessary blank pages at positions 2, 4, and 6 because:

1. **Fixed pages** (Cover, Dashboard, Breakdown) use `.page` class with `page-break-after: always`
2. **Flowing sections** use `.section-container` with `page-break-before: always`
3. These **double page-break rules** combined with the CSS `@page { margin: 20mm 10mm 20mm 10mm }` create blank intermediate pages

```text
Current flow causing blank pages:
┌─────────────┐    ┌───────────┐    ┌─────────────┐
│ Cover Page  │ -> │ BLANK     │ -> │ Dashboard   │
│ (break-after)│    │ (unwanted)│    │ (break-after)│
└─────────────┘    └───────────┘    └─────────────┘
                        ↓
              ┌───────────┐    ┌─────────────┐
              │ BLANK     │ -> │ Breakdown   │
              │ (unwanted)│    │ (break-after)│
              └───────────┘    └─────────────┘
```

---

## Solution

Remove the conflict by using ONLY one page-break method. Since the `@page` margins now handle layout, we'll remove `page-break-after` from fixed pages and rely on section containers to force breaks only when needed.

---

## Implementation Plan

### Step 1: Remove `page-break-after` from `.page` class

Update the CSS for `.page`:

**Before:**
```css
.page {
  width: 210mm;
  min-height: 297mm;
  padding: 0;
  position: relative;
  page-break-after: always;
  background: white;
}

.page:last-child {
  page-break-after: auto;
}
```

**After:**
```css
.page {
  width: 210mm;
  min-height: 297mm;
  padding: 0;
  position: relative;
  page-break-inside: avoid;
  background: white;
}
```

The `page-break-after` rule is removed entirely; each page's content will fill its space naturally and the `@page` margins handle separation.

### Step 2: Add `page-break-before` to non-first `.page` elements

To ensure Dashboard and Breakdown still start on new pages, add CSS:

```css
.page.dashboard,
.page.breakdown {
  page-break-before: always;
}
```

This forces only these specific pages to start fresh, without creating trailing blank pages.

### Step 3: Keep `.section-container` logic unchanged

The existing rules work correctly for flowing section content:

```css
.section-container {
  page-break-before: always;
}

.section-container:first-child {
  page-break-before: auto;
}
```

The `:first-child` selector prevents a break before the first section since it immediately follows Breakdown.

---

## Technical Summary

| CSS Class | Current Issue | Fix |
|-----------|--------------|-----|
| `.page` | `page-break-after: always` creates trailing blanks | Remove `page-break-after`, keep `page-break-inside: avoid` |
| `.page.dashboard`, `.page.breakdown` | Need to start on new pages | Add `page-break-before: always` |
| `.page:last-child` | No longer needed | Remove entirely |
| `.section-container` | Works correctly | No change |
| `.section-container:first-child` | Works correctly | No change |

---

## File to Modify

`supabase/functions/generate-inspection-pdf/index.ts`

### Lines to Change

| Section | Line Range | Change |
|---------|------------|--------|
| `.page` CSS rule | ~718-726 | Remove `page-break-after: always` |
| `.page:last-child` rule | ~728-730 | Remove entirely |
| New CSS after `.page` | After ~726 | Add `.page.dashboard, .page.breakdown { page-break-before: always; }` |

---

## Expected Result

After implementation:
- **14 pages reduced to 11** (or correct count without blanks)
- Cover → Dashboard → Breakdown → Sections flow without intermediate empty pages
- Page numbering "Page X of Y" will be accurate
- Professional layout maintained with consistent margins
