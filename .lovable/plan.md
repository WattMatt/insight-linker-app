
# Fix Image Quality in PDF Reports - Restore Proper Scaling

## Problem Analysis

The current `generate-inspection-pdf` function uses `object-fit: cover` with a fixed `height: 140px` for photo grid images. This **crops** photos to fill the container, cutting off critical details (visible in Screenshot 2 showing only numbers 5-11 of a ruler instead of the full electrical board panel).

### Visual Comparison

| Approach | CSS | Result |
|----------|-----|--------|
| **GOOD (Screenshot 1)** | `object-fit: contain` or `height: auto` | Full image visible, properly scaled |
| **BAD (Screenshot 2)** | `object-fit: cover` + `height: 140px` | Cropped center portion only |

## Root Cause

Located in `supabase/functions/generate-inspection-pdf/index.ts` at lines 1377-1384:

```css
.photo-grid-3 .photo-item img {
  width: 100%;
  height: 140px;           /* Fixed height forces cropping */
  object-fit: cover;       /* PROBLEM: Crops to fill container */
  ...
}
```

The tenant images section (lines 1465-1472) uses the **correct** approach with `height: auto`.

## Solution

Change the photo grid CSS to preserve full image content while maintaining a clean grid layout:

### Option A: Use `object-fit: contain` (Recommended)

```css
.photo-grid-3 .photo-item img {
  width: 100%;
  height: 140px;
  object-fit: contain;     /* Scale to fit, preserving full content */
  background: #f9fafb;     /* Fill empty space with background */
  border: 1px solid #e5e7eb;
  border-radius: 4px;
}
```

**Pros**: Maintains consistent grid cell heights, shows full image content
**Cons**: May have empty space around some images (letterboxing)

### Option B: Use `height: auto` (Maximum Fidelity)

```css
.photo-grid-3 .photo-item img {
  width: 100%;
  max-height: 200px;       /* Prevent excessively tall images */
  height: auto;            /* Natural aspect ratio preserved */
  border: 1px solid #e5e7eb;
  border-radius: 4px;
}
```

**Pros**: Perfect image quality, no cropping or letterboxing
**Cons**: Grid rows may have varying heights

## Implementation Steps

1. Update `supabase/functions/generate-inspection-pdf/index.ts`:
   - Change `.photo-grid-3 .photo-item img` CSS from `object-fit: cover` to `object-fit: contain`
   - Add a subtle background color (`#f9fafb`) to fill any letterbox areas
   - Keep consistent height for visual alignment

2. Apply the same fix to `generate-pdf/index.ts` and `generate-pdf-browserless/index.ts` if they have the same issue

3. Redeploy all affected Edge Functions

## Affected Files

- `supabase/functions/generate-inspection-pdf/index.ts` - Photo grid CSS (lines 1377-1384)
- `supabase/functions/generate-pdf/index.ts` - Same grid styling if present  
- `supabase/functions/generate-pdf-browserless/index.ts` - Same grid styling if present

## Testing

After deployment, generate a test inspection PDF and verify:
- Electrical board panel images show the **complete** panel (not just cropped center)
- All photos are legible and maintain their original aspect ratio
- Grid layout remains clean and professional
