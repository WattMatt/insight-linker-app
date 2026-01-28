

# Fix Portrait Image Rendering in PDF Photo Grids

## Problem Analysis

The current image pipeline uses Supabase's Render API with `width=500` only. This works fine for landscape photos, but for portrait/vertical photos (common when photographing electrical boards), the result is:

- Server output: 500px wide × 1200px+ tall (aspect ratio preserved)
- PDF container: ~160px wide × 140px tall
- CSS `object-fit: contain`: Scales the tall image to fit the 140px height → appears ~60px wide

This creates the "tall and narrow" appearance visible in your screenshot.

## Solution

Modify the Supabase Render API call to use `height` parameter instead of `width`, targeting the PDF container's height (140px → use 280px for 2x sharpness):

```text
Current:  /render/image/public/{bucket}/{path}?width=500&quality=70
Proposed: /render/image/public/{bucket}/{path}?height=280&quality=70
```

This ensures:
- Portrait images: scaled to 280px tall (fits 140px container perfectly)
- Landscape images: scaled proportionally (will be wider than tall, fills container width)

## Technical Changes

### 1. Update IMAGE_SPECS (line 98-102)

```typescript
const IMAGE_SPECS = {
  logo: { maxHeight: 200, quality: 80 },       // Logo: fit cover area
  photo: { maxHeight: 280, quality: 70 },      // Photos: 2x 140px container height
  signature: { maxHeight: 150, quality: 80 },  // Signatures: preserve legibility
};
```

### 2. Update Render API call (line 260)

Change from width-based to height-based transformation:

```typescript
// FROM:
const transformUrl = `${SUPABASE_URL}/storage/v1/render/image/public/${bucket}/${filePath}?width=${maxWidth}&quality=${quality}`;

// TO:
const transformUrl = `${SUPABASE_URL}/storage/v1/render/image/public/${bucket}/${filePath}?height=${maxHeight}&quality=${quality}`;
```

### 3. Update function signature (line 253-258)

```typescript
async function downloadImageViaRenderAPI(
  bucket: string,
  filePath: string,
  maxHeight: number,  // Changed from maxWidth
  quality: number = 75
): Promise<ArrayBuffer | null> {
```

### 4. Apply same changes to other generators

- `supabase/functions/generate-pdf/index.ts`
- `supabase/functions/generate-pdf-browserless/index.ts`

## Expected Result

| Image Type | Before (width=500) | After (height=280) |
|------------|-------------------|-------------------|
| Portrait (2:3) | 500×750px → appears ~90px wide in PDF | 187×280px → fills 140px height properly |
| Landscape (4:3) | 500×375px → OK | 373×280px → fills container width |
| Square (1:1) | 500×500px → appears narrow | 280×280px → balanced fit |

## Files to Update

1. **supabase/functions/generate-inspection-pdf/index.ts**
   - Lines 98-102: Update IMAGE_SPECS to use maxHeight
   - Lines 253-260: Update downloadImageViaRenderAPI signature and URL
   - Lines 340-344: Update call site

2. **supabase/functions/generate-pdf/index.ts**
   - Apply same height-based transformation logic

3. **supabase/functions/generate-pdf-browserless/index.ts**
   - Apply same height-based transformation logic

## Deployment

Redeploy all three Edge Functions after changes are applied.

