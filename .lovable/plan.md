

# 3-Column Photo Grid Support with Template-First Sizing

## Current State

The HTML template currently uses a **fixed 2-column grid** for all photo layouts:

```css
.photo-grid {
  grid-template-columns: repeat(2, 1fr);  /* Always 2 columns */
}
```

Images are compressed to 400px @ 60% quality - which is arbitrary and not matched to template dimensions.

## What You Need

Support for **2-column AND 3-column photo grids** with images sized exactly for their container.

## Template Layout Calculations

### A4 Content Width
- A4 page: 210mm = ~794px at 96 DPI
- Content padding: 24px each side = 48px total
- Available width: 794px - 48px = **746px**
- Photo grid padding: 14px each side = 28px
- Usable photo area: 746px - 28px = **718px**

### Photo Sizing Per Layout

| Layout | Column Width | Optimal Image Size | Quality |
|--------|--------------|-------------------|---------|
| 2-column | 718px / 2 - gap = ~340px | **320 x 180px** | 75% |
| 3-column | 718px / 3 - gap = ~225px | **200 x 150px** | 75% |
| Logo | Fixed | **180 x 100px** | 80% |

## Implementation Plan

### Phase 1: Add IMAGE_SPECS Constants

Define explicit sizing for each image context:

```typescript
const IMAGE_SPECS = {
  logo: { width: 180, height: 100, quality: 80 },
  photo_2col: { width: 320, height: 180, quality: 75 },
  photo_3col: { width: 200, height: 150, quality: 75 },
};
```

### Phase 2: Add Dynamic Grid Classes

Update CSS to support both layouts:

```css
.photo-grid-2 {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 12px;
}

.photo-grid-3 {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 10px;
}

.photo-grid-2 .photo-item img {
  width: 280px;
  height: 150px;
  object-fit: cover;
}

.photo-grid-3 .photo-item img {
  width: 180px;
  height: 120px;
  object-fit: cover;
}
```

### Phase 3: Update Image Collection Logic

Modify the image pipeline to:
1. Detect the grid layout (2 or 3 columns based on photo count or data flag)
2. Apply correct compression size based on target layout
3. Track image type in the collection process

```typescript
interface ImageRequest {
  url: string;
  type: 'logo' | 'photo_2col' | 'photo_3col';
}

function buildTransformUrl(bucket: string, filePath: string, imageType: keyof typeof IMAGE_SPECS): string {
  const spec = IMAGE_SPECS[imageType];
  return `${SUPABASE_URL}/storage/v1/render/image/public/${bucket}/${filePath}?width=${spec.width}&height=${spec.height}&quality=${spec.quality}&resize=contain`;
}
```

### Phase 4: Update Section Renderer

Modify `buildSectionPagesHTML` to choose grid class based on photo count:

```typescript
// Choose grid layout based on photo count
const gridClass = photos.length >= 3 ? 'photo-grid-3' : 'photo-grid-2';

html += `<div class="${gridClass}">${photoHtml}</div>`;
```

## Files to Modify

| File | Changes |
|------|---------|
| `supabase/functions/generate-inspection-pdf/index.ts` | Add IMAGE_SPECS, update CSS with 2-col and 3-col grids, update buildTransformUrl to accept image type, update section renderer to pick grid class |

## Visual Result

**2-Column Layout** (1-2 photos):
```text
+-------------------+    +-------------------+
|                   |    |                   |
|   Photo 1 (320px) |    |   Photo 2 (320px) |
|                   |    |                   |
+-------------------+    +-------------------+
      Photo 1                  Photo 2
```

**3-Column Layout** (3+ photos):
```text
+-------------+    +-------------+    +-------------+
|             |    |             |    |             |
| Photo (200) |    | Photo (200) |    | Photo (200) |
|             |    |             |    |             |
+-------------+    +-------------+    +-------------+
    Photo 1            Photo 2            Photo 3
```

## Benefits

1. **Optimised file sizes**: Images compressed to exact template dimensions
2. **Faster processing**: Smaller downloads = less memory pressure
3. **Pixel-perfect rendering**: No browser scaling artifacts
4. **Flexible layouts**: Automatic 2 or 3 column based on photo count
5. **SANS compliance**: Clean professional documentation layout

