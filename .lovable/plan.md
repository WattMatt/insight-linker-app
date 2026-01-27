
# Plan: Align PDF Image Pipeline with DOCX Generator Standard

## Problem Analysis

The PDF generator and DOCX generator use **fundamentally different approaches** for server-side image handling:

### Current PDF Pipeline Issues
1. Uses `createSignedUrl` SDK with transform object
2. Server transforms images to a fixed width
3. CSS then forces images into fixed pixel boxes (240x180, 180x135)
4. Result: Images may appear distorted because server-resized images are then CSS-forced into different aspect ratios

### DOCX Pipeline (The Standard)
1. Uses the **direct Render API** endpoint (`/storage/v1/render/image/public/...`)
2. Passes only `width` and `quality` as query parameters
3. Server automatically preserves original aspect ratio
4. Native binary (`Uint8Array`) is embedded directly

---

## Solution: Refactor PDF to Use Direct Render API

Modify the PDF generator to use the exact same server-side transformation approach as the DOCX generator.

### Technical Changes

#### 1. Add Direct Render API Function (New)

```typescript
// New function matching DOCX generator's approach
async function downloadImageViaRenderAPI(
  bucket: string,
  filePath: string,
  maxWidth: number,
  quality: number = 75
): Promise<ArrayBuffer | null> {
  // Construct transform URL exactly like DOCX generator
  const transformUrl = `${SUPABASE_URL}/storage/v1/render/image/public/${bucket}/${filePath}?width=${maxWidth}&quality=${quality}`;
  
  try {
    const response = await fetch(transformUrl);
    if (response.ok) {
      return await response.arrayBuffer();
    }
  } catch {
    // Fallback to direct download
  }
  
  // Fallback: download without transformation
  const supabase = getSupabaseClient();
  const { data: blob, error } = await supabase.storage
    .from(bucket)
    .download(filePath);
  if (error || !blob) return null;
  return await blob.arrayBuffer();
}
```

#### 2. Update IMAGE_SPECS to Use Single maxWidth

```typescript
// Change from width/height pairs to single maxWidth (matching DOCX)
const IMAGE_SPECS = {
  logo: { maxWidth: 200, quality: 80 },       // DOCX uses 200
  photo_2col: { maxWidth: 400, quality: 75 }, // DOCX uses MAX_IMAGE_WIDTH = 400
  photo_3col: { maxWidth: 300, quality: 75 }, // Smaller for 3-col grid
  signature: { maxWidth: 400, quality: 85 },
};
```

#### 3. Refactor `imageToBase64` Function

Replace the `createSignedUrl` approach with direct Render API:

```typescript
async function imageToBase64(url: string, imageType: ImageType = 'photo_2col'): Promise<string | null> {
  // ... existing validation ...
  
  const parsed = parseSupabaseStorageUrl(url);
  
  if (parsed) {
    const spec = IMAGE_SPECS[imageType];
    
    // Use Direct Render API (matching DOCX generator)
    const buffer = await downloadImageViaRenderAPI(
      parsed.bucket,
      parsed.path,
      spec.maxWidth,
      spec.quality
    );
    
    if (buffer && buffer.byteLength > 0) {
      const bytes = new Uint8Array(buffer);
      const mimeType = detectImageType(bytes);
      const base64 = arrayBufferToBase64(buffer);
      return `data:${mimeType};base64,${base64}`;
    }
  }
  
  // ... fallback for non-Supabase URLs ...
}
```

#### 4. Update CSS to Preserve Aspect Ratio

Change CSS from fixed dimensions with `object-fit: contain` to flexible sizing:

```css
/* 2-column photos - let aspect ratio flow naturally */
.photo-grid-2 .photo-item img {
  width: 100%;
  max-width: 300px;
  height: auto;
  border: 1px solid #e5e7eb;
  border-radius: 4px;
}

/* 3-column/Tenant photos */
.photo-grid-3 .photo-item img,
.tenant-image-item img {
  width: 100%;
  max-width: 200px;
  height: auto;
  border: 1px solid #e5e7eb;
  border-radius: 4px;
}
```

---

## Files to Modify

| File | Changes |
|------|---------|
| `supabase/functions/generate-inspection-pdf/index.ts` | Refactor image pipeline to use Direct Render API, update IMAGE_SPECS, update CSS |

---

## Expected Outcome

- Images will be transformed server-side using the **exact same API** as the Low Voltage Line Shop Board Audit
- Aspect ratios will be preserved automatically by Supabase
- CSS will no longer force images into fixed dimensions that may distort them
- Visual output will match the DOCX reference document
