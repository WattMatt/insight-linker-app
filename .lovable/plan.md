

# Fix Page Break Issues & Duplicate Footers

## Problems Identified

1. **Duplicate footers** on every page (static HTML + Browserless template)
2. **Inconsistent page counts** ("Page X of 11" vs "Page X of 9")
3. **Content bleeding** without proper header spacing
4. **CSS @page margin:0** conflicting with Browserless margin settings

## Solution Overview

Remove all static footers from the HTML and rely solely on Browserless's dynamic header/footer templates. Fix the CSS @page rule to work with Browserless margins.

---

## Implementation Plan

### Step 1: Remove All Static HTML Footers

Delete the `.footer` div from all page builder functions:

| Function | Lines to Remove |
|----------|-----------------|
| `buildCoverPageHTML` | Lines 475-479 |
| `buildDashboardHTML` | Lines 543-547 |
| `buildBreakdownHTML` | Lines 631-635 |

Also remove the `.footer` CSS class definition (lines 774-786).

### Step 2: Fix CSS @page Rule

Change:
```css
@page { 
  size: A4; 
  margin: 0; 
}
```

To:
```css
@page { 
  size: A4; 
  margin: 20mm 0 15mm 0;
}
```

This ensures consistent margins are applied within the CSS itself, not conflicting with Browserless.

### Step 3: Add Top Padding to Body/Content

Add padding to the body or a wrapper to create consistent "header distance":

```css
body {
  padding-top: 15mm;
}
```

This ensures all pages have content starting below the top margin zone.

### Step 4: Fix Flowing Section Header Distance

Update `.section-container` to have proper top spacing:

```css
.section-container {
  page-break-before: always;
  padding-top: 0; /* margin handled by @page */
}

.section-container:first-child {
  page-break-before: auto;
}
```

The padding is no longer needed because `@page` margins handle it.

### Step 5: Update Browserless Options

Ensure margins align with CSS:

```typescript
margin: { top: '0mm', right: '0mm', bottom: '0mm', left: '0mm' },
```

Since `@page` now handles margins, Browserless shouldn't double-apply them.

Alternatively, keep Browserless margins and remove `@page { margin: 0 }`:

```typescript
margin: { top: '20mm', right: '10mm', bottom: '20mm', left: '10mm' },
```

---

## Technical Details

### File to Modify
`supabase/functions/generate-inspection-pdf/index.ts`

### Changes Summary

| Section | Change |
|---------|--------|
| CSS `@page` rule (line 719-721) | Add proper margins: `margin: 20mm 10mm 20mm 10mm` |
| CSS `.footer` class (lines 774-786) | Remove entirely |
| Cover page (lines 475-479) | Remove static footer div |
| Dashboard page (lines 543-547) | Remove static footer div |
| Breakdown page (lines 631-635) | Remove static footer div |
| `.section-container` (lines 1012-1020) | Remove extra padding-top (margins handled by @page) |
| Browserless options (line 1217) | Set `margin: { top: '0mm', bottom: '20mm' }` to let @page handle top and Browserless handle footer space |

### Expected Result

After these changes:
- **Single footer** per page from Browserless template
- **Accurate page numbering** (dynamic "Page X of Y")
- **Consistent 20mm top margin** on every page
- **No duplicate dates** or conflicting information
- **Professional header distance** before content starts

---

## Visual Comparison

**Before:**
```text
+------------------------+
| Content starts here    |  ← Too close to top
| ...                    |
| Footer: Page 1 of 11   |  ← Static HTML footer
| Footer: Page 1 of 9    |  ← Browserless footer (duplicate!)
+------------------------+
```

**After:**
```text
+------------------------+
|                        |  ← 20mm margin
| Content starts here    |
| ...                    |
|                        |
| Page 1 of 9 | Date     |  ← Single Browserless footer
+------------------------+
```

