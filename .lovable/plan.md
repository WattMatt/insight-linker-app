
# Definitive PDF Image Fix - Using Width Instead of Fit

## Root Cause Discovery

After thorough investigation, I found that:
1. The Edge Function IS deployed correctly (Version 2.0.0)
2. The CONFIG values ARE correct (160x120, 180x80, etc.)
3. Images ARE being downloaded successfully (20 images, 200-400KB each)

**The Real Problem**: The `fit` property in pdfmake preserves aspect ratio but doesn't guarantee a minimum size. When photos are portrait-oriented (taller than wide), `fit: [160, 120]` constrains them to 120px height, making them extremely narrow.

**Example of the issue**:
- Original photo: 480px wide × 640px tall (portrait, 0.75 aspect ratio)
- `fit: [160, 120]` → Constrained by height to 120px → Width becomes 90px → Appears as narrow strip

---

## Solution: Switch from `fit` to `width` with Max Height

The fix is to use `width` as the primary constraint instead of `fit`. This ensures images are always a consistent width, with height automatically calculated.

### Changes Required

| Location | Current | Fixed |
|----------|---------|-------|
| Logo (line 381) | `fit: [180, 80]` | `width: 180, maxHeight: 80` |
| Section Photos (line 654) | `fit: [160, 120]` | `width: 150` |
| Tenant Images (line 758) | `fit: [140, 180]` | `width: 130` |
| Snag Photos (line 825) | `fit: [200, 150]` | `width: 180` |
| Signatures (line 868) | `fit: [140, 50]` | `width: 140, maxHeight: 50` |

---

## Technical Implementation

### Step 1: Update CONFIG with Width-Only Values
```text
const CONFIG = {
  VERSION: '3.0.0',  // Version bump for verification
  // Width-based sizing (height auto-calculated)
  LOGO_WIDTH: 180,
  SECTION_PHOTO_WIDTH: 150,  // Consistent width for 3-column grid
  TENANT_PHOTO_WIDTH: 130,   // 3 per row in tenant section  
  SNAG_PHOTO_WIDTH: 180,     // Larger for evidence
  SIGNATURE_WIDTH: 140,
  SIGNATURE_MAX_HEIGHT: 50,
};
```

### Step 2: Update Logo Rendering
```text
// Cover page logo
{
  image: logoDataUri,
  width: CONFIG.LOGO_WIDTH,
  alignment: 'center',
  margin: [0, 30, 0, 25],
}
```

### Step 3: Update Section Photo Rendering  
```text
// Section item photos - 3-column layout
{
  image: getImage(photo),
  width: CONFIG.SECTION_PHOTO_WIDTH,
  alignment: 'center',
}
```

### Step 4: Update Tenant Image Rendering
```text
// Tenant verification images
{
  image: getImage(tenant.meterImage),
  width: CONFIG.TENANT_PHOTO_WIDTH,
  alignment: 'center',
}
```

### Step 5: Update Snag Photo Rendering
```text
// Snag evidence photos
{
  image: getImage(photo),
  width: CONFIG.SNAG_PHOTO_WIDTH,
  alignment: 'center',
}
```

---

## Visual Comparison

### Before (using `fit`):
```text
Photo (portrait): 480×640px 
fit: [160, 120] → Constrained by height
Result: 90×120px → Narrow vertical strip
```

### After (using `width`):
```text
Photo (portrait): 480×640px
width: 150 → Width is fixed
Result: 150×200px → Properly sized, readable
```

---

## Files to Modify

| File | Changes |
|------|---------|
| `supabase/functions/generate-pdf-pdfmake/index.ts` | Replace all `fit` properties with `width` properties for images |

---

## Code Locations to Update

1. **Line ~381**: Logo on cover page
2. **Line ~654**: Section item photos in 3-column grid
3. **Line ~758**: Tenant verification images (meter, breaker, CT ratio)
4. **Line ~825**: Snag evidence photos
5. **Line ~868**: Signature images

---

## Expected Results

After implementation:
1. **All photos will have consistent widths** regardless of orientation
2. **Portrait photos won't become narrow strips** - they'll be properly sized
3. **Logo will display at 180px wide** with natural height
4. **3-column photo grids will be evenly spaced** with equal-width images
5. **Evidence photos will be clearly visible** and readable

---

## Verification

After deployment, the Edge Function logs should show:
- `[PDFMake] Version: 3.0.0`
- Generated PDF should have properly-sized images at consistent widths
