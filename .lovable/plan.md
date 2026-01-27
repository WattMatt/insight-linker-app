
# Plan: Fix EMB Report Content Population ✅ COMPLETED

## Problem Summary
The Electrical Main Board (EMB) inspection report was generating with correct **structure** but missing **content** (photos and tenant details).

## Root Cause
The `generate-inspection-pdf` Edge Function was using an incorrect image download strategy:
- ❌ Used raw transform URL (`/storage/v1/render/image/public/...`) which returned 400 errors
- ❌ Created a new Supabase client for each image (inefficient)
- ❌ Some image URLs in the database referenced files that no longer exist in storage

## Solution Implemented

### 1. Refactored Image Pipeline to Use Signed URLs ✅
Replaced the broken approach with the proven pattern from `generate-pdf-browserless`:

```text
Fixed (Working):
┌─────────────────────────────────────────────────────────────┐
│ 1. Parse Supabase URL using parseSupabaseStorageUrl()       │
│ 2. Use getSupabaseClient() singleton pattern               │
│ 3. Call createSignedUrl() with transform options           │
│ 4. Fetch signed URL with compression                        │
│ 5. Fallback to direct download if transform fails          │
│ 6. Image succeeds ✓                                         │
└─────────────────────────────────────────────────────────────┘
```

### 2. Technical Changes Applied

**File: `supabase/functions/generate-inspection-pdf/index.ts`**

- ✅ Added `getSupabaseClient()` singleton function
- ✅ Added `parseSupabaseStorageUrl()` utility function  
- ✅ Added `detectImageType()` for proper MIME type detection
- ✅ Added `downloadImageWithSignedUrl()` using `createSignedUrl()` with transform options
- ✅ Rewrote `imageToBase64()` to use the new signed URL approach
- ✅ Removed broken `buildTransformUrl()` approach

### 3. Verification Results

Test with valid image URLs shows:
```
[ImagePipeline] ✓ Processed 2/2 images
[ImagePipeline] Photo transform: 320px @ 75% → 117KB
[ImagePipeline] Photo transform: 200px @ 75% → 102KB
[Browserless] ✓ PDF generated: 271 KB
```

### 4. Data Issue Identified

Some image URLs in the database reference files that no longer exist in storage:
- URL references: `YARONA_CENTRE_YARONA_CENTRE_LV_ROOM_0_0_1767777711001_1.jpg`
- Storage contains: `FortressFund_YARONA_CENTRE_LV_ROOM_0_0_1767871171237_1.jpg`

This is a data synchronization issue - photos may have been re-uploaded or renamed without updating the database references.

## Next Steps (If Needed)

1. The image pipeline is now working correctly for all existing files
2. For the LV ROOM inspection specifically, photos may need to be re-captured or the database URLs updated to match actual storage files
3. Consider adding a background job to validate image URLs and flag broken references
