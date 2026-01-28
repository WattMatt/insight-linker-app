

# Fix Photo Grid to Fill Container Width

## Problem

Current CSS uses `object-fit: contain` which:
- ✅ Shows full image content (no cropping)
- ❌ Leaves empty space on sides for portrait/tall images (as seen in screenshots)

## Solution

Switch to `object-fit: cover` with `object-position: center top` to:
- ✅ Fill the full container width (no empty side space)
- ✅ Keep fixed 140px height for consistent grid layout
- ✅ Crop from bottom only (preserving top content which is usually most important)

## CSS Change

```css
.photo-grid-3 .photo-item img {
  width: 100%;
  height: 140px;
  object-fit: cover;           /* Fill width, may crop height */
  object-position: center top; /* Anchor to top, crop bottom */
  border: 1px solid #e5e7eb;
  border-radius: 4px;
}
```

## Files to Update

1. **supabase/functions/generate-inspection-pdf/index.ts** (lines 1378-1385)
   - Change `object-fit: contain` → `object-fit: cover`
   - Add `object-position: center top`
   - Remove `background: #f9fafb` (no longer needed - no letterbox)

2. **supabase/functions/generate-pdf/index.ts**
   - Apply same changes to photo grid styling

3. **supabase/functions/generate-pdf-browserless/index.ts**
   - Apply same changes to inline image styles

## Technical Details

The `object-position: center top` ensures:
- Horizontally: Image is centered
- Vertically: Image anchors to top, any cropping happens at the bottom

This is ideal for electrical panel photos where the header/label information is typically at the top.

## Deployment

Redeploy all three edge functions after changes are applied.

