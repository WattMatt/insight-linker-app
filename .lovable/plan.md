
# Comprehensive PDF Image Handling Fix

## Problem Analysis

After reviewing the uploaded PDF, screenshot, and codebase, I've identified the root causes of the persistent image issues:

### Current Issues:
1. **Tiny 75x100 image constraints** - All images (logo, photos, tenant images, snags) are constrained to `fit: [75, 100]` which is far too small
2. **Portrait aspect ratio for landscape photos** - Inspection photos are typically landscape (wider than tall), but 75x100 forces a portrait constraint
3. **Logo too small** - Using the same tiny 75x100 constraint shrinks the logo inappropriately
4. **Inconsistent with project standards** - The codebase has established standards that work:
   - General photos: `250x200px`
   - Snag photos: `250x190px`
   - Tenant verification (3-column): `160x150px` or `fit: [140, 180]`
   - Logo: Much larger dimensions (typically 180+ width)

### Visual Evidence:
From the PDF and screenshot, photos appear as narrow vertical strips instead of properly proportioned images. This is because `fit: [75, 100]` constrains photos to an extremely small box.

---

## Solution: Implement Correct Image Dimensions

I'll update the `generate-pdf-pdfmake` Edge Function to use proper, tested dimensions from the codebase standards.

### Configuration Changes:

| Image Type | Current Setting | New Setting | Rationale |
|------------|-----------------|-------------|-----------|
| **Logo** | `fit: [75, 100]` | `fit: [180, 80]` | Logo should be landscape and prominent |
| **Section Photos** | `fit: [75, 100]` | `fit: [160, 120]` | 3 per row, landscape-friendly |
| **Tenant Images** | `fit: [75, 100]` | `fit: [140, 180]` | Standard 3-column grid per docs |
| **Snag Photos** | `fit: [75, 100]` | `fit: [200, 150]` | 2 per row, clear evidence photos |
| **Signatures** | `fit: [140, 60]` | `fit: [140, 50]` | Keep as-is (signatures are wide) |

---

## Technical Implementation

### Step 1: Update CONFIG constants
```text
PHOTO_WIDTH: 160      (was 75)
PHOTO_HEIGHT: 120     (was 100)
LOGO_WIDTH: 180       (new)
LOGO_HEIGHT: 80       (new)
TENANT_PHOTO_WIDTH: 140
TENANT_PHOTO_HEIGHT: 180
SNAG_PHOTO_WIDTH: 200
SNAG_PHOTO_HEIGHT: 150
```

### Step 2: Apply specific sizes to each image type
- **Logo**: `fit: [180, 80]` - Wide rectangle for company logos
- **Section item photos** (3-column): `fit: [160, 120]` - Landscape orientation
- **Tenant verification images** (3-column): `fit: [140, 180]` - Portrait for meter/breaker closeups
- **Snag evidence photos** (2-column): `fit: [200, 150]` - Larger for issue documentation

### Step 3: Adjust column spacing
Increase `columnGap` to `15-20` between photos to prevent crowding.

---

## Files to Modify

| File | Changes |
|------|---------|
| `supabase/functions/generate-pdf-pdfmake/index.ts` | Update CONFIG, logo sizing, photo grid sizing, tenant image sizing, snag photo sizing |

---

## Expected Results

After implementation:
1. **Cover page logo** will be properly sized and landscape-oriented
2. **Section photos** will display in a proper 3-column grid with correct proportions
3. **Tenant verification images** will be clearly visible in portrait orientation
4. **Snag evidence photos** will be larger and easier to review
5. All images maintain their natural aspect ratio via `fit` property (no stretching)

---

## Testing Checklist

After deploying the changes:
- [ ] Generate a new inspection report
- [ ] Verify cover page logo appears correctly sized
- [ ] Check that section photos are landscape-oriented and clearly visible
- [ ] Confirm tenant images show meters/breakers/CT ratios properly
- [ ] Validate snag photos are large enough for evidence review
- [ ] Ensure no images are stretched or distorted
