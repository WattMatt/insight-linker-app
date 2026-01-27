
# Plan: Fix EMB Report Content Population

## Problem Summary
The Electrical Main Board (EMB) inspection report is generating with the correct **structure** but missing **content** (photos and tenant details). Analysis shows:

1. **Image Pipeline Failure**: All 15+ images fail to download in the Edge Function
   - Transform API returns 400 errors
   - Direct storage download fails with `StorageUnknownError`
   
2. **Tenant Section Empty**: Shows "Tenant 1" but no details or photos because image loading fails

3. **Section Photos Missing**: Status badges appear (PASS/FAIL) but photos are not rendered

## Root Cause
The `generate-inspection-pdf` Edge Function uses an incorrect image download strategy:
- Uses raw transform URL (`/storage/v1/render/image/public/...`) which fails
- Creates a new Supabase client for each image (inefficient)
- The working `generate-pdf-browserless` function uses `createSignedUrl` with `transform` options

## Solution

### 1. Refactor Image Pipeline to Use Signed URLs
Replace the current broken approach with the proven pattern from `generate-pdf-browserless`:

```text
Current (Broken):
┌─────────────────────────────────────────────────────────────┐
│ 1. Build raw transform URL                                  │
│ 2. Fetch transform URL → 400 Error                         │
│ 3. Create new Supabase client                              │
│ 4. Call storage.download() → StorageUnknownError           │
│ 5. Image fails                                              │
└─────────────────────────────────────────────────────────────┘

Fixed (Working):
┌─────────────────────────────────────────────────────────────┐
│ 1. Parse Supabase URL to get bucket + path                  │
│ 2. Use singleton Supabase client                           │
│ 3. Call createSignedUrl() with transform options           │
│ 4. Fetch signed URL with compression                        │
│ 5. Fallback to direct download if needed                   │
│ 6. Image succeeds                                           │
└─────────────────────────────────────────────────────────────┘
```

### 2. Implementation Changes

**File: `supabase/functions/generate-inspection-pdf/index.ts`**

a) **Add singleton Supabase client pattern**:
   - Move client creation to module level with lazy initialization
   - Reuse across all image downloads

b) **Replace `buildTransformUrl` with `createSignedUrl` approach**:
   - Use `storage.createSignedUrl()` with `transform` options for photos
   - Use direct `storage.download()` for logos
   - Add proper fallback chain

c) **Fix URL parsing**:
   - Use the proven `parseSupabaseStorageUrl` function from `generate-pdf-browserless`
   - Properly handle public and signed URL formats

d) **Improve logging**:
   - Add success/failure counts per image type
   - Log transformed URL for debugging

### 3. Technical Changes

```text
Files to Modify:
├── supabase/functions/generate-inspection-pdf/index.ts
│   ├── Add getSupabaseClient() singleton function
│   ├── Add parseSupabaseStorageUrl() utility function  
│   ├── Rewrite imageToBase64() to use signed URL approach
│   ├── Remove buildTransformUrl() function (unused)
│   └── Keep IMAGE_SPECS for dimension reference
```

### 4. Verification Steps
After implementation:
1. Generate an EMB inspection report
2. Verify section photos appear in the PDF
3. Verify tenant cards show all details (Shop Number, Meter Serial, Breaker Size, CT Ratio)
4. Verify tenant images (Meter, Breaker, CT Ratio) appear in 3-column grid
5. Check Edge Function logs show `✓ Processed X/Y images` with X > 0

### 5. Expected Outcome
- All section item photos will render in the report
- Tenant Information section will display complete cards with:
  - Shop name and number
  - Meter serial number
  - Breaker size  
  - CT Size and Ratio
  - Verification photos (Meter, Breaker, CT Ratio)
- Quality Score Dashboard will show accurate photo count
