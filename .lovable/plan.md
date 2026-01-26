
# Fix: PDF Images Not Rendering in pdfmake (Version 5.1)

## Root Cause Analysis

After extensive debugging, the issue has been identified:

### The Problem
The Edge Function successfully downloads 19 images and converts them to Base64, logging "Transformed: XXXkb" for each. The PDF generates at 3.8MB but **no images are visible**.

The root cause is a **pdfmake compatibility issue** in the Deno environment. When using inline data URLs directly in `{image: 'data:...'}` nodes, pdfmake in Deno may not properly process them.

### Why This Happens
- pdfmake has two ways to embed images:
  1. **Inline data URLs**: `{image: 'data:image/jpeg;base64,...'}` - Less reliable in non-browser environments
  2. **Images dictionary**: Reference by key, define in document's `images` property - More reliable
- The current code uses inline data URLs which work in browsers but can fail in Deno's Edge Function environment
- The 3.8MB PDF size suggests content is being generated, but images are silently failing

---

## Solution: Use pdfmake Images Dictionary Pattern

### Changes Required

#### 1. Build Images Dictionary During Document Construction
Instead of passing data URLs inline, create an `images` object in the document definition and reference by key:

```typescript
// In buildDocument function
const images: Record<string, string> = {};
let imageIndex = 0;

const getImageKey = (url?: string): string => {
  if (!url) return 'PLACEHOLDER';
  if (url.startsWith('data:')) {
    const key = `img_${imageIndex++}`;
    images[key] = url;
    return key;
  }
  const dataUri = imageMap.get(url);
  if (dataUri && dataUri !== PLACEHOLDER) {
    const key = `img_${imageIndex++}`;
    images[key] = dataUri;
    return key;
  }
  return 'PLACEHOLDER';
};

// Add placeholder to images dictionary
images['PLACEHOLDER'] = PLACEHOLDER;
```

#### 2. Update Image References in Document Content
Change from:
```typescript
{ image: img(photo), width: SIZES.PHOTO }
```
To:
```typescript
{ image: getImageKey(photo), width: SIZES.PHOTO }
```

#### 3. Add Images Dictionary to Document Definition
```typescript
return {
  pageSize: 'A4',
  content,
  images,  // Add the images dictionary
  defaultStyle: { font: 'Roboto', ... },
  ...
};
```

#### 4. Add Debug Logging
Log the number of images added to the dictionary and sample keys to verify the mapping is working.

---

## Files to Modify

| File | Changes |
|------|---------|
| `supabase/functions/generate-pdf-pdfmake/index.ts` | Implement images dictionary pattern, update all image references |

---

## Technical Details

### Before (Current - Broken)
```typescript
const img = (url?: string) => {
  return imageMap.get(url) || PLACEHOLDER;  // Returns full data URL
};

// Usage
{ image: img(photo), width: 150 }  // Inline data URL - unreliable in Deno
```

### After (Fixed)
```typescript
const images: Record<string, string> = { PLACEHOLDER };
let imgIdx = 0;

const imgKey = (url?: string) => {
  const dataUri = url?.startsWith('data:') ? url : imageMap.get(url);
  if (dataUri && dataUri !== PLACEHOLDER) {
    const key = `img${imgIdx++}`;
    images[key] = dataUri;
    return key;
  }
  return 'PLACEHOLDER';
};

// Usage
{ image: imgKey(photo), width: 150 }  // Reference key - reliable

// Document definition
return { content, images, ... };  // Include images dictionary
```

---

## Version Update
Bump VERSION to '5.1.0' for deployment verification.

## Expected Results
1. All 19 images render correctly in the PDF
2. Tenant verification photos appear in grid
3. No "Unknown image format" or silent failures
4. PDF maintains ~3-4MB size with embedded images
