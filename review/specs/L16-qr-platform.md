# L16 — qr-platform

- Unit id: L16
- Slug: qr-platform
- Spec mode: full
- Date: 2026-07-29
- Files: 6 (4 source + 2 tests)

## Unit header

**Unit purpose.** The unit builds every QR artifact in the app: the URL that QR codes encode (a stable Supabase edge-function redirect endpoint, deliberately not the frontend domain — src/lib/qrBaseUrl.ts:29-44), a labeled 580×720 PNG per subsection uploaded to Supabase Storage (src/lib/qrCodeGenerator.ts:12-181), an equivalent vector SVG sticker (src/lib/qrSvg.ts:12-25), and an A4 3-column sticker-sheet PDF assembled from those SVGs (src/lib/qrStickerSheet.ts:12-35).

**Module-level observations (cross-file, verified).**
- All QR payloads route through `qrRedirectUrl`/`qrSiteRedirectUrl`: qrCodeGenerator.ts:23 and qrStickerSheet.ts:14 encode `qrRedirectUrl(subsectionId)`; no file in the unit encodes `publicSubsectionUrl` into an artifact.
- The redirect target is the `qr-redirect` edge function (unit F02), which accepts both URL shapes this unit emits: `?path=<uuid>` (supabase/functions/qr-redirect/index.ts:17,139) and `?site=<uuid>` (supabase/functions/qr-redirect/index.ts:91), and resolves the live app origin from `settings.qr_base_url` at scan time (supabase/functions/qr-redirect/index.ts:35-41).
- Layout parity: qrSvg.ts:10-11 states its layout "mirrors qrCodeGenerator.ts proportions"; both use QR 500, padding 40, 3px border, total 720 high, uppercased site name over subsection name (qrCodeGenerator.ts:27-31,129-135 vs qrSvg.ts:16-23). qrSvg is 580 wide vs qrCodeGenerator's 580 (500+2×40) — identical.
- The literal `https://insight-linker-app.vercel.app` exists twice: `DEFAULT_QR_ORIGIN` (src/lib/qrBaseUrl.ts:14) and a string fallback inside the edge function (supabase/functions/qr-redirect/index.ts:41).
- Two of the four source files are test-paired (qrBaseUrl, qrSvg); qrCodeGenerator (DOM canvas) and qrStickerSheet (pdfmake) have no tests (grep-verified: no test file references `generateAndUploadQRCode` or `buildStickerSheetBlob`).
- Other code re-implements this unit's label layout rather than importing it: comment-only references "matching qrCodeGenerator / LabeledQRCode" at src/lib/subsectionCardSpec.ts:113,156 (L15) and src/views/InspectionDetail.tsx:1102 (V01).
- Grep for `qrBaseUrl` also hits the untracked working-tree duplicate `src/views/Settings 2.tsx` (git status: untracked); it manipulates the `settings.qr_base_url` column, not this unit's exports, and belongs to no manifest unit.

**External contract.** The rest of the app gets: URL builders `qrRedirectUrl` / `qrSiteRedirectUrl` (consumed by C03, C09, C14, V01, V02, V06 — see per-file sections); `generateAndUploadQRCode` which produces+uploads a subsection QR PNG and writes `subsections.qr_code_url` (consumed by C09, V07); and `buildStickerSheetBlob` which returns an A4 PDF Blob of vector stickers (consumed by C09). `settings.qr_base_url` itself is read/written by V02 Settings (src/views/Settings.tsx:126) and by the F02 edge function — not by this unit at runtime.

---

## src/lib/qrBaseUrl.ts

- Purpose: Single source of truth for the public origin and the stable edge-function redirect URLs that QR codes encode (qrBaseUrl.ts:1-13,29-40).
- Public surface:
  - `DEFAULT_QR_ORIGIN: string` = `"https://insight-linker-app.vercel.app"` (line 14).
  - `resolveQrBaseUrl(configured?: string | null): string` — trims, falls back to `DEFAULT_QR_ORIGIN`, strips one trailing slash (lines 17-19).
  - `publicSubsectionUrl(subsectionId: string, configured?: string | null): string` — `<base>/public/subsections/<id>` (lines 22-27).
  - `qrRedirectUrl(subsectionId: string): string` — `<NEXT_PUBLIC_SUPABASE_URL>/functions/v1/qr-redirect?path=<id>` (lines 41-44).
  - `qrSiteRedirectUrl(siteId: string): string` — `<NEXT_PUBLIC_SUPABASE_URL>/functions/v1/qr-redirect?site=<id>` (lines 48-51).
- Inputs & outputs: pure string in → string out. Env: `process.env.NEXT_PUBLIC_SUPABASE_URL` read at call time in both redirect builders (lines 42, 49), empty-string fallback. No stores touched.
- Dependencies: uses -> none (zero imports). used by <- (grep-verified) src/components/SiteSummaryReport.tsx:10 (C14, imports qrRedirectUrl + qrSiteRedirectUrl); src/components/site/QRCodeManager.tsx:9 (C09, qrRedirectUrl); src/components/client-portal/ClientCocView.tsx:23 (C03, qrSiteRedirectUrl); src/views/InspectionDetail.tsx:4 (V01, qrRedirectUrl); src/views/QRCodes.tsx:13 (V02, qrRedirectUrl); src/views/site-coc/ReportSubTab.tsx:14 (V06, qrSiteRedirectUrl); in-unit: src/lib/qrCodeGenerator.ts:3 and src/lib/qrStickerSheet.ts:2 (both qrRedirectUrl); src/lib/qrBaseUrl.test.ts:2-7.
- Side effects: none; pure functions plus env read.
- Error handling: no failure paths. Missing/empty env yields `""` host, producing a URL beginning `/functions/v1/qr-redirect?...` (lines 42-43); a comment asserts the env is guaranteed at app boot because integrations/supabase/client.ts throws when it is absent (lines 39-40).
- Tests: src/lib/qrBaseUrl.test.ts (see below); 5 tests, all passing (vitest run 2026-07-29).
- Observed issues:
  - `publicSubsectionUrl`, `resolveQrBaseUrl`, and `DEFAULT_QR_ORIGIN` have zero importers outside this unit's own test file (grep-verified across src and supabase).
  - `subsectionId`/`siteId` are interpolated into the query string without `encodeURIComponent` (lines 43, 50).
  - The `DEFAULT_QR_ORIGIN` value is duplicated as an inline literal in supabase/functions/qr-redirect/index.ts:41 (F02).
- ASSUMED: that production actually sets `settings.qr_base_url` to the Vercel URL (comment claim, line 13 — not verifiable from the repo); that Next.js inlines `NEXT_PUBLIC_SUPABASE_URL` at build time (comment claim, line 40).

## src/lib/qrBaseUrl.test.ts

- Purpose: Vitest suite pinning the durable-QR-payload contract of qrBaseUrl.ts.
- Public surface: none (test file).
- Inputs & outputs: mutates `process.env.NEXT_PUBLIC_SUPABASE_URL` in beforeEach/afterEach (lines 10-16, 25).
- Dependencies: uses -> ./qrBaseUrl (in-unit, lines 2-7); vitest. used by <- none found (grep-verified; picked up by vitest include glob `src/**/*.test.{ts,tsx}`, vitest.config.ts:22).
- Side effects: env mutation during the run; restored in afterEach (line 15).
- Error handling: n/a.
- Tests (what it asserts):
  - `qrRedirectUrl` encodes exactly `https://abc123.supabase.co/functions/v1/qr-redirect?path=<id>` (lines 18-22).
  - Trailing slash on the supabase URL is stripped (lines 24-29).
  - Payload is domain-independent: output contains neither `vercel.app`, `lovable.app`, nor `/public/subsections/` (lines 31-38).
  - `publicSubsectionUrl('id-1','https://example.com')` → `https://example.com/public/subsections/id-1` (lines 42-46).
  - `resolveQrBaseUrl(null)` → `DEFAULT_QR_ORIGIN` (lines 48-50).
  - All 5 pass (vitest run 2026-07-29). Runs in node environment (vitest.config.ts:18); env var is also pre-seeded by vitest.setup.ts:7.
- Observed issues: afterEach does `process.env.NEXT_PUBLIC_SUPABASE_URL = ORIG` (line 15); when `ORIG` is `undefined`, Node coerces the assignment to the string `"undefined"` rather than unsetting the key — in this repo the var is always pre-set by vitest.setup.ts:7, so the branch is not reached.
- ASSUMED: none.

## src/lib/qrCodeGenerator.ts

- Purpose: Renders a labeled subsection QR code to a canvas PNG, uploads it to Supabase Storage, and records the public URL on the subsection row.
- Public surface: `generateAndUploadQRCode({ subsectionId: string; siteName: string; subsectionName: string; logoUrl?: string }): Promise<string | null>` (interface lines 5-10, function lines 12-181). Returns the storage public URL, or `null` on any failure.
- Inputs & outputs:
  - In: subsection id/names, optional logo URL (fetched cross-origin via an `<img crossOrigin="anonymous">`, lines 63-107).
  - Out: 580×720 PNG (canvas 500 QR + 40 padding + 140 text band + 3px border, lines 27-47); uploaded to Storage bucket `inspection-photos` at `qr-codes/<subsectionId>.png` with `upsert: true` (lines 146-152); public URL fetched (lines 157-159); `subsections.qr_code_url` updated for the row (lines 162-165).
  - QR payload: `qrRedirectUrl(subsectionId)` at error-correction level `H`, margin 1, width 500 (lines 23, 51-55).
- Dependencies: uses -> `qrcode` (line 1, package.json:72 `^1.5.4`); `@/integrations/supabase/client` (line 2, L19); `@/lib/qrBaseUrl` (line 3, in-unit). used by <- (grep-verified) src/components/site/QRCodeManager.tsx:8 (C09); src/views/subsection-detail/useSubsectionDetail.ts:6 (V07). Comment-only mentions (not imports): src/lib/subsectionCardSpec.ts:113,156 (L15); src/views/InspectionDetail.tsx:1102 (V01); src/lib/qrSvg.ts:11 (in-unit).
- Side effects: DOM canvas/img creation (`document.createElement`, lines 26, 50, 63 — browser-only); network fetch of `logoUrl` via the img element; Supabase Storage upload; `subsections` table UPDATE; three `console.error` calls on failure paths (lines 103, 171-178).
- Error handling: single outer try/catch. Null canvas context, blob-creation failure, `uploadError`, and `updateError` all throw into the catch (lines 38, 141, 154, 167), which logs the error plus a details object and returns `null` (lines 170-180) — callers never see an exception. Logo load failure is non-fatal: `img.onerror` logs "Failed to load logo" and resolves, continuing without the overlay (lines 102-105).
- Tests: none found (grep-verified: `generateAndUploadQRCode` appears in no `*.test.*` file).
- Observed issues:
  - QR PNGs live in the `inspection-photos` bucket under a `qr-codes/` prefix, not a QR-specific bucket (lines 147-149).
  - All failures collapse to `null` with console logging only; the return type does not distinguish failure cause (lines 170-180).
  - Text labels are rasterized into the PNG (lines 126-135) — the property qrSvg.ts:9-10 says caused stale artifacts after renames.
  - `fitText` floors at 16px: text still wider than `maxTextWidth` at fontSize 16 is drawn overflowing (lines 115-124).
  - Browser-only (`document`, canvas); cannot run under the repo's default node test environment without a jsdom opt-in (vitest.config.ts:16-18).
- ASSUMED: that `inspection-photos` is a public bucket (the code consumes `getPublicUrl` output, lines 157-165; bucket policy not inspected — defined in D-era migrations).

## src/lib/qrSvg.ts

- Purpose: Builds a self-contained labeled QR sticker as an SVG string with real (non-rasterized) text labels, mirroring the PNG layout.
- Public surface: `buildLabeledQrSvg({ url: string; siteName: string; subsectionName: string }): Promise<string>` (interface lines 3-7, function lines 12-25). Returns a complete `<svg>…</svg>` string, 580×720 viewBox, white background, 3px black border.
- Inputs & outputs: url + labels in → SVG string out. Site name is uppercased (line 22); labels are XML-escaped for `& < > "` (line 17). QR generated via `QRCode.toString(url, { type: "svg", errorCorrectionLevel: "H", margin: 1 })` (line 13); its outer `<svg>` wrapper is regex-stripped and re-nested at x/y 40, 500×500 (lines 14-15, 21). No stores, no env.
- Dependencies: uses -> `qrcode` (line 1). used by <- (grep-verified) src/lib/qrStickerSheet.ts:1,14 (in-unit) and src/lib/qrSvg.test.ts:2 only; no consumer outside the unit.
- Side effects: none (pure async string builder; `QRCode.toString` is computation only).
- Error handling: none in-file; a `QRCode.toString` rejection propagates to the caller. If the generated QR SVG lacks a `viewBox` attribute the code falls back to `"0 0 37 37"` (line 15).
- Tests: src/lib/qrSvg.test.ts (see below); 2 tests, passing.
- Observed issues:
  - Outer-tag removal is regex-based (`/^[\s\S]*?<svg[^>]*>/` and `/<\/svg>\s*$/`, line 14), coupled to the shape of qrcode's SVG output.
  - Overall height 720 is hard-coded in three places (lines 18-20) while width derives from the `W` constant.
  - `esc` does not escape apostrophes (line 17); both `<text>` payloads are element content and attributes in the produced markup use double quotes.
- ASSUMED: that qrcode\@1.5.x `toString` output always begins with an `<svg …>` open tag matching the strip regex (holds for the version in package.json:72; not verified against other versions).

## src/lib/qrSvg.test.ts

- Purpose: Vitest suite for `buildLabeledQrSvg` output shape and XML escaping.
- Public surface: none (test file).
- Inputs & outputs: calls the builder with fixture strings; asserts on the returned SVG string.
- Dependencies: uses -> ./qrSvg (in-unit, line 2); vitest. used by <- none found (grep-verified; picked up by vitest include glob, vitest.config.ts:22).
- Side effects: none.
- Error handling: n/a.
- Tests (what it asserts):
  - Output contains `<svg`, the uppercased site name `THE PLAZA`, the verbatim subsection name, and a closing `</svg>` (lines 5-15).
  - XML-special labels (`Smith & Co <Ltd>`, `Unit "A" & B`) produce `&amp;`/`&lt;` and the raw `<Ltd>` never appears (lines 16-26).
  - Both pass (vitest run 2026-07-29), node environment.
- Observed issues: none.
- ASSUMED: none.

## src/lib/qrStickerSheet.ts

- Purpose: Assembles an A4 PDF Blob laying out vector QR stickers for a site's subsections in a 3-column grid.
- Public surface: `buildStickerSheetBlob(siteName: string, subsections: { id: string; name: string }[]): Promise<Blob>` (interface lines 5-8, function lines 12-35).
- Inputs & outputs: site name + subsection id/name list in → PDF Blob out. Each sticker's QR encodes `qrRedirectUrl(s.id)` (line 14). Layout: rows of ≤3 `svg` columns at width 165, columnGap 8, page A4 with margins [24,28,24,28], heading `"<siteName> — QR sticker sheet"` (lines 17-31). No stores, no env (beyond qrRedirectUrl's env read).
- Dependencies: uses -> ./qrSvg and ./qrBaseUrl (in-unit, lines 1-2); `generatePdfBlob` from ./pdfMakeUtils (line 3 — L14; re-export of pdfMakeConfig's `generatePdfBlob(docDefinition: TDocumentDefinitions): Promise<Blob>`, src/lib/pdfMakeUtils.ts:17,42 → src/lib/pdfMakeConfig.ts:389). used by <- (grep-verified) src/components/site/QRCodeManager.tsx:12,248 (C09) only.
- Side effects: none directly; delegates PDF rendering to pdfmake via `generatePdfBlob`.
- Error handling: none in-file. A rejection from any `buildLabeledQrSvg` call fails the whole `Promise.all` (lines 13-15); `generatePdfBlob` throws on canvas-validation issues or unloaded fonts (src/lib/pdfMakeConfig.ts:392-404). All propagate to the caller.
- Tests: none found (grep-verified: `buildStickerSheetBlob` appears in no `*.test.*` file).
- Observed issues:
  - `rows` and `docDefinition` are typed `any` (lines 17, 25), bypassing the `TDocumentDefinitions` typing that `generatePdfBlob` declares.
  - All SVGs are generated in one unbounded `Promise.all` over the full subsection list (lines 13-15).
  - The docDefinition contains no explicit page-break directives; multi-page flow is left to pdfmake defaults (lines 25-31).
- ASSUMED: that pdfmake renders `svg` nodes natively (comment claim, lines 10-11; not verified against the pdfmake build in use).
