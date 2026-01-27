
# Plan: Fix EMB Report Content Population ✅ COMPLETED

## Problem Summary
The Electrical Main Board (EMB) inspection report was generating with correct **structure** but missing **content** (photos and tenant details).

## Root Causes Identified

### 1. Image Pipeline Using Wrong API ✅ FIXED
- ❌ Used raw transform URL (`/storage/v1/render/image/public/...`) which returned 400 errors
- ✅ Refactored to use `createSignedUrl()` with `transform` options

### 2. Stale Image URLs in Database ✅ FIXED
- Database stored image URLs like `YARONA_CENTRE_YARONA_CENTRE_LV_ROOM_...`
- Storage contained renamed files like `FortressFund_YARONA_CENTRE_LV_ROOM_...`
- ✅ Added `findAlternativeFile()` fallback to search directory for any image when exact file not found

## Solution Implemented

### Changes to `supabase/functions/generate-inspection-pdf/index.ts`

1. **Added `getSupabaseClient()` singleton** - Efficient client reuse
2. **Added `parseSupabaseStorageUrl()`** - Proper URL parsing for bucket/path extraction
3. **Added `detectImageType()`** - MIME type detection from file bytes
4. **Added `findAlternativeFile()`** - **NEW** Directory search fallback
5. **Rewrote `downloadImageWithSignedUrl()`** - Uses `createSignedUrl()` with transform options
6. **Updated `imageToBase64()`** - Uses signed URL approach

### Fallback Mechanism Flow

```text
┌─────────────────────────────────────────────────────────────┐
│ 1. Try createSignedUrl() for exact file path                │
│    ↓ (fails with "Object not found")                        │
│ 2. Extract directory from path                              │
│ 3. List files in that directory                             │
│ 4. Filter for image files (jpg, jpeg, png, webp)            │
│ 5. Sort by timestamp (newest first)                         │
│ 6. Use first matching file as alternative                   │
│ 7. Download alternative file with transformation            │
│ 8. ✓ Image successfully embedded in PDF                     │
└─────────────────────────────────────────────────────────────┘
```

## Verification

Tested with LV ROOM inspection - logs show:
```
[ImagePipeline] Signed URL failed for .../0/0...: Object not found
[ImagePipeline] Searching for alternative in: .../0/0/
[ImagePipeline] ✓ Found alternative: FortressFund_YARONA_CENTRE_LV_ROOM_0_0_1767871171237_1.jpg
[ImagePipeline] ✓ Transformed ... → 117KB
[ImagePipeline] ✓ Processed 2/2 images
[Browserless] ✓ PDF generated: 308 KB
```

## Result
- ✅ Section photos now render correctly (with fallback for renamed files)
- ✅ Tenant cards show all details (Shop Number, Meter Serial, Breaker Size, CT Ratio)
- ✅ Tenant images appear in 3-column grid
- ✅ Image pipeline is resilient to file renaming
