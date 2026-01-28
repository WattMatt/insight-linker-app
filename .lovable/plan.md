

# Plan: Optimize Photo Grid Container for Better Image Fit

## Problem Summary

The current PDF photo grid uses a **nearly-square container** (≈160px × 140px = 1.14:1 ratio) which doesn't match typical photo aspect ratios. With `object-fit: cover`, this causes significant cropping:

| Photo Type | Aspect Ratio | Cropping with Current Container |
|------------|--------------|--------------------------------|
| Portrait (3:4) | 0.75:1 | Top/bottom edges cropped |
| Square (1:1) | 1.0:1 | Minor cropping |
| Landscape (4:3) | 1.33:1 | Side edges cropped (~15%) |
| Wide (16:9) | 1.78:1 | Side edges heavily cropped (~35%) |

## Proposed Solution: Match Container to Common Photo Ratio

Change the container dimensions to a **4:3 landscape ratio** (the most common photo orientation from mobile cameras), reducing cropping for the majority of images.

### New Container Dimensions

```text
Current:  ~160px × 140px  (1.14:1 ratio - nearly square)
Proposed: ~186px × 140px  (1.33:1 ratio - matches 4:3 photos)
```

Since the grid uses `grid-template-columns: repeat(3, 1fr)`, the width is fluid. The key change is ensuring the **width naturally expands** to fill available space while the **height stays at 140px**.

## Technical Changes

### 1. Update CSS in `generate-inspection-pdf/index.ts`

**Lines 1360-1385** - Adjust grid gap to allow images to expand wider:

```css
.photo-grid-3 {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;           /* Reduced from 12px to allow wider images */
  padding: 12px;
  background: #f9fafb;
  border-top: 1px solid #e5e7eb;
  break-inside: avoid;
}

.photo-grid-3 .photo-item img {
  width: 100%;
  height: 140px;
  object-fit: cover;
  border: 1px solid #e5e7eb;
  border-radius: 4px;
}
```

This gives each image cell approximately **186px width** (on A4 with 25mm margins), creating a 1.33:1 container ratio that matches 4:3 photos exactly.

### 2. Update Inline Styles in `generate-pdf/index.ts`

**Lines 399-423** - Change fixed dimensions:

```typescript
const imageWidthPx = 186;   // Up from 180 to match 4:3 ratio
const imageHeightPx = 140;  // Keep at 140px
```

### 3. Update Inline Styles in `generate-pdf-browserless/index.ts`

**Lines 552-650** - Update all image style declarations to use consistent sizing.

### 4. Server-Side Image Sizing (Optional Optimization)

The current `height=280` server transform is correct for the 140px container. However, we can optionally add width limiting to prevent downloading overly wide images:

```typescript
// Use both width and height constraints
const transformUrl = `...?height=280&width=400&quality=70`;
```

This ensures server output never exceeds what's needed for the container.

## Expected Results

| Photo Type | Before (1.14:1 container) | After (1.33:1 container) |
|------------|--------------------------|--------------------------|
| Portrait (3:4) | Heavy top/bottom crop | Moderate top/bottom crop |
| Landscape (4:3) | Side crop ~15% | **Perfect fit - no crop** |
| Wide (16:9) | Side crop ~35% | Side crop ~25% |

Since most inspection photos are landscape (4:3 from phones held horizontally), this change optimizes for the common case.

## Files to Modify

1. **supabase/functions/generate-inspection-pdf/index.ts**
   - Lines 1360-1385: Adjust grid CSS gap and padding

2. **supabase/functions/generate-pdf/index.ts**
   - Lines 399-401: Update `imageWidthPx` to 186

3. **supabase/functions/generate-pdf-browserless/index.ts**
   - Multiple inline style locations: Update fixed dimensions

## Deployment

After code changes, redeploy all three Edge Functions:
- `generate-inspection-pdf`
- `generate-pdf`
- `generate-pdf-browserless`

