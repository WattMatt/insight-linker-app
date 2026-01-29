

# Plan: Complete Overhaul of PDF Image Grid Rendering

## Problem Summary

After extensive investigation, the root cause of the persistent image rendering issues has been identified. The images are downloading correctly (70-127KB each) but rendering as tiny thumbnails because:

1. **Conflicting layout constraints**: The `.photo-item` container uses `display: flex` with `flex-direction: column` and `align-items: center`, which collapses the image's intrinsic dimensions
2. **The `height: 140px` property on the `<img>` is ignored** because the parent flexbox container doesn't establish a proper sizing context
3. **Multiple CSS properties are competing**: `width: 100%`, `max-width: 186px`, `height: 140px`, `object-fit: contain`, `display: block` interact incorrectly within the flex layout

## Solution: Simplified, Robust HTML/CSS Structure

Replace the complex flex-based approach with a **simple, predictable table-based layout** for the photo grid that explicitly controls image dimensions without relying on flexbox calculations.

### Technical Approach

**Key Principle**: Use a wrapper `<div>` with **explicit width and height** that acts as a viewport for the image. The image then fills this viewport with `object-fit: contain`.

```css
/* Container establishes fixed dimensions - IMAGE CANNOT ESCAPE THESE BOUNDS */
.photo-cell {
  width: 186px;
  height: 140px;
  overflow: hidden;
  position: relative;
  background: #f9fafb;
  border: 1px solid #e5e7eb;
  border-radius: 4px;
}

/* Image fills the container, respecting aspect ratio */
.photo-cell img {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  object-fit: contain;
}
```

This is the same technique used by professional PDF generators and ensures:
- The container is **exactly 186×140px** - no flex calculations
- The image is **absolutely positioned** within the container, filling it completely
- `object-fit: contain` ensures the full image is visible with letterboxing

## Files to Modify

### 1. supabase/functions/generate-inspection-pdf/index.ts

**Replace CSS and HTML structure for photo grids:**

Current (broken):
```css
.photo-item {
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
}

.photo-grid-3 .photo-item img {
  width: 100%;
  max-width: 186px;
  height: 140px;
  object-fit: contain;
  ...
}
```

New (robust):
```css
.photo-grid-3 {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  padding: 12px;
  background: #f9fafb;
  border-top: 1px solid #e5e7eb;
}

.photo-cell {
  width: 186px;
  height: 140px;
  position: relative;
  overflow: hidden;
  background: #f9fafb;
  border: 1px solid #e5e7eb;
  border-radius: 4px;
}

.photo-cell img {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.photo-label {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  background: rgba(0,0,0,0.5);
  color: white;
  font-size: 8pt;
  padding: 2px 4px;
  text-align: center;
}
```

**Update HTML template in `buildSectionPagesHTML`:**

Current:
```html
<div class="photo-item">
  <img src="${base64}" alt="Photo ${pIdx + 1}">
  <span class="photo-label">Photo ${pIdx + 1}</span>
</div>
```

New:
```html
<div class="photo-cell">
  <img src="${base64}" alt="Photo ${pIdx + 1}">
  <span class="photo-label">Photo ${pIdx + 1}</span>
</div>
```

### 2. supabase/functions/generate-pdf/index.ts

Apply the same absolute positioning pattern to inline styles:

```html
<div style="width: 186px; height: 140px; position: relative; overflow: hidden; background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 4px;">
  <img src="${base64}" style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; object-fit: contain;" />
</div>
```

### 3. supabase/functions/generate-pdf-browserless/index.ts

Apply the same pattern to all photo grid sections:
- Section item photos
- Tenant verification images (Meter, Breaker, CT Ratio)
- Snag evidence photos

## Why This Will Work

| Previous Approach | New Approach |
|-------------------|--------------|
| Relied on flexbox to calculate image dimensions | Container has **explicit fixed dimensions** (186×140px) |
| Image height was a "suggestion" to the browser | Image is **absolutely positioned** to fill the container |
| Flex alignment collapsed the image | No flex on the image - just fills its parent |
| Complex property interactions | Simple, predictable CSS |

## Deployment

After code changes, redeploy all three Edge Functions:
- `generate-inspection-pdf`
- `generate-pdf`
- `generate-pdf-browserless`

