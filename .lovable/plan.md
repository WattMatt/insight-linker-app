
# Complete PDF Generation Fix - Version 5.0

## Root Cause Analysis

The Edge Function logs reveal two critical issues:

### Issue 1: "Unknown image format" Error
When images are downloaded but exceed the 500KB size limit, the code logs `[IMG] Too large: XXKB` but doesn't properly return the PLACEHOLDER. The flow:
1. Transformation attempted → returns image >500KB 
2. Direct download attempted → same image >500KB
3. Logs "Too large" but continues to external fetch
4. External fetch fails (Supabase URL isn't "external")
5. Returns PLACEHOLDER... but something in this chain is corrupted

**The actual bug**: The `toBase64()` function uses `String.fromCharCode(...chunk)` which can fail for certain byte sequences, returning malformed data that isn't a valid Base64 string.

### Issue 2: Font Configuration
Line 727 still has `font: 'Helvetica'` hardcoded in the document definition, which conflicts with the Roboto-only VFS.

---

## Solution: Complete Rebuild with Bullet-Proof Image Handling

### Changes Required

#### 1. Fix `toBase64()` Function
Replace the spread operator approach with a safer chunked buffer concatenation that works reliably for all image data:

```text
function toBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}
```

#### 2. Add Explicit Return for "Too Large" Images
After logging "Too large", immediately return PLACEHOLDER:

```text
if (sizeKB > IMAGE_CONFIG.MAX_SIZE_KB) {
  console.warn(`[IMG] Too large: ${Math.round(sizeKB)}KB`);
  return PLACEHOLDER;  // <-- CRITICAL FIX
}
```

#### 3. Fix Font in Document Definition
Change line 727 from `font: 'Helvetica'` to `font: 'Roboto'`:

```text
defaultStyle: {
  font: 'Roboto',  // Fixed - was 'Helvetica'
  fontSize: 10,
  color: COLORS.slate700,
},
```

#### 4. Add Try-Catch Around Base64 Conversion
Wrap all base64 operations in try-catch to prevent crashes:

```text
try {
  const bytes = new Uint8Array(buffer);
  const mime = getMimeType(bytes);
  const b64 = toBase64(buffer);
  return `data:${mime};base64,${b64}`;
} catch (e) {
  console.warn('[IMG] Base64 conversion failed:', e);
  return PLACEHOLDER;
}
```

#### 5. Increase Size Limit for Better Coverage
Change `MAX_SIZE_KB: 500` to `MAX_SIZE_KB: 800` to allow more images through transformation.

---

## Files to Modify

| File | Changes |
|------|---------|
| `supabase/functions/generate-pdf-pdfmake/index.ts` | Fix toBase64, add explicit returns, fix font, add error handling |

---

## Specific Line Changes

| Line | Current | Fixed |
|------|---------|-------|
| 21-25 | MAX_SIZE_KB: 500 | MAX_SIZE_KB: 800 |
| 68-77 | Chunked String.fromCharCode with spread | Character-by-character (safer) |
| 150-151 | Log only | Log + return PLACEHOLDER |
| 727 | font: 'Helvetica' | font: 'Roboto' |

---

## Version Bump
Update VERSION to '5.0.0' for deployment verification.

---

## Expected Results
1. No "Unknown image format" errors
2. No font errors
3. All images either render properly OR show placeholder gracefully
4. PDF generates successfully with all content
