# L06 — pdf-processing

- Unit id: L06
- Slug: pdf-processing
- Spec mode: full (per-file)
- Date: 2026-07-29
- Files: 4 (src/lib/pdf/advancedProcessor.ts, src/lib/pdf/imageExtractor.ts, src/lib/pdf/ocrEngine.ts, src/lib/pdf/textExtractor.ts) — matches review/unit-files.json L06

## Unit header

**Unit purpose.** A self-contained pdf.js-based document-analysis pipeline under `src/lib/pdf/`: position-aware text extraction with line/table/column detection (textExtractor), embedded-image extraction with logo/photo/icon classification (imageExtractor), a canvas-preprocessing OCR scaffold whose recognition step is an explicit stub (ocrEngine), and a facade that orchestrates all three into a `ProcessedDocument` with sections, metadata, and quality metrics (advancedProcessor). Total 1,261 LOC across the 4 files (`wc -l`).

**Module-level observations (cross-file facts).**
- Zero external consumers: no file outside `src/lib/pdf/` imports any of these modules (`grep -rn "lib/pdf/" src supabase` returns only intra-directory hits; per-symbol greps for `processDocument`, `quickExtractText`, `detectScannedDocument`, `extractPageRange` return only their definition sites). The only intra-unit importer is advancedProcessor.ts:7-9. Module names otherwise appear only in graphify cache JSON (`src/graphify-out/cache/*.json`), docs (docs/system-reference/GAPS.md:225, which lists "the entire orphaned `src/lib/pdf/` OCR pipeline" as dead code), and the review inventory — not in source imports.
- Sole runtime dependency is `pdfjs-dist` (^5.4.296, package.json:70). Three modules import it directly (advancedProcessor.ts:6, imageExtractor.ts:6, ocrEngine.ts:6, textExtractor.ts:6).
- The only import-time side effect in the unit: advancedProcessor.ts:12-14 sets `pdfjsLib.GlobalWorkerOptions.workerSrc` to a cdnjs URL (`https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`) when `typeof window !== 'undefined'`. Four other files in the repo set workerSrc independently and differently: src/components/FloorPlanViewer.tsx:12 and src/components/site/SchematicDiagram.tsx:66 and src/components/DocumentPreviewDialog.tsx:32 use unpkg `pdf.worker.min.mjs`; src/lib/pdfTemplateExtractor.ts:10 (unit L15) uses a protocol-relative cdnjs `pdf.worker.min.js`.
- OCR recognition is stubbed: ocrEngine.ts:121-125 (`extractTextFromCanvas`) always returns `[]` after preprocessing, with the comment "For now, return empty - actual OCR would require Tesseract.js or similar".
- No tests anywhere in the unit: vitest include glob is `src/**/*.test.{ts,tsx}` (vitest.config.ts:22); `grep -rln "advancedProcessor|imageExtractor|ocrEngine|textExtractor" src --include="*.test.ts" --include="*.test.tsx"` returns nothing.
- All four modules assume a browser DOM (`document.createElement('canvas')` in imageExtractor.ts:82,212 and ocrEngine.ts:136; `window` guard in advancedProcessor.ts:12).

**External contract.** As written, none is exercised: the unit exports a full document-processing API (`processDocument`, `quickExtractText`, `detectScannedDocument`, `extractPageRange`, plus the lower-level per-module functions and types), but no other manifest unit imports it (grep-verified). The rest of the app currently gets nothing from L06 at runtime.

## src/lib/pdf/advancedProcessor.ts

- Purpose: Facade that combines OCR, text extraction, and image extraction into a unified PDF processing pipeline producing a `ProcessedDocument` (header comment, L1-4).
- Public surface:
  - `interface ProcessingOptions { maxPages?; enableOCR?; extractImages?; extractTables?; detectStructure?; ocrOptions?: OCROptions; imageOptions?: ImageExtractionOptions }` (L16-24)
  - `interface DocumentSection { id; title; content; pageStart; pageEnd; level; subsections: DocumentSection[] }` (L26-34)
  - `interface ProcessedDocument { fileName; pageCount; totalProcessingTime; pages: PageTextContent[]; fullText; sections; tables: DetectedTable[]; images: ExtractedImage[]; logo: ExtractedImage | null; ocrResults?: OCRPageResult[]; metadata: {title?; author?; subject?; keywords?; creationDate?; modificationDate?}; quality: {textConfidence; hasOCRContent; tableCount; imageCount; averageWordsPerPage} }` (L36-72)
  - `processDocument(file: File, options: ProcessingOptions = DEFAULT_OPTIONS, onProgress?: (stage: string, current: number, total: number) => void): Promise<ProcessedDocument>` (L199-283)
  - `quickExtractText(file: File, maxPages: number = 10): Promise<string>` (L288-305)
  - `detectScannedDocument(file: File): Promise<boolean>` (L310-339)
  - `extractPageRange(file: File, startPage: number, endPage: number, options: ProcessingOptions = DEFAULT_OPTIONS): Promise<PageTextContent[]>` (L344-366)
  - Type re-exports: `OCRPageResult, OCROptions` (L369), `PageTextContent, DetectedTable, TextBlock, TextLine` (L370), `ExtractedImage, ImageExtractionOptions` (L371)
  - Module-private: `DEFAULT_OPTIONS` (L74-80: maxPages 50, enableOCR/extractImages/extractTables/detectStructure all true), `detectSections(pages)` (L85-138), `extractMetadata(pdf)` (L143-159), `calculateQualityMetrics(pages, ocrResults?)` (L164-194).
- Inputs & outputs: browser `File` objects in (read via `file.arrayBuffer()`, L208/292/311/350); plain `ProcessedDocument`/`PageTextContent[]`/`string`/`boolean` data out. No tables, buckets, localStorage/IndexedDB, or env vars. Loads the pdf.js worker script from the cdnjs CDN URL set at L13.
- Dependencies: uses -> `pdfjs-dist` (L6); `./ocrEngine` `processPageWithOCR` + types (L7, same unit); `./textExtractor` `extractDocumentContent` + types statically (L8) and `extractPageContent` via dynamic `import('./textExtractor')` inside the loop of `extractPageRange` (L360); `./imageExtractor` `extractAllImages`, `extractCoverPageImages` + types (L9, same unit). used by <- none found (grep-verified: `processDocument`/`quickExtractText`/`detectScannedDocument`/`extractPageRange` and the path `lib/pdf/advancedProcessor` have no hits outside this file in src/ or supabase/).
- Side effects: module-load assignment of `pdfjsLib.GlobalWorkerOptions.workerSrc` (L12-14, `window` guard); pdf.js document/page loading (network fetch of the CDN worker when pdf.js runs in-browser); `onProgress` callback invocations with stages 'loading', 'extracting_text', 'ocr_processing', 'extracting_images', 'complete' (L207, 214-217, 225-232, 241-244, 267). No direct DOM writes of its own; canvas work happens in the imported modules.
- Error handling: `extractMetadata` wraps `pdf.getMetadata()` in try/catch and returns `{}` on any failure (L144-158). Nothing else is caught — a rejection from `getDocument`, `getPage`, or any downstream extractor propagates out of `processDocument`/`quickExtractText`/`detectScannedDocument`/`extractPageRange` to the (nonexistent) caller.
- Tests: none (grep-verified; no `*.test.*` file references this module).
- Observed issues:
  - `options` is a default parameter, not merged with `DEFAULT_OPTIONS`: a caller passing any object replaces the defaults wholesale; only `maxPages` has an inline fallback (`options.maxPages || 50`, L211), so e.g. `enableOCR`/`extractImages`/`extractTables`/`detectStructure` are undefined→falsy when omitted from a caller-supplied object (L224, 240, 251, 254).
  - `extractPageRange` declares `options: ProcessingOptions = DEFAULT_OPTIONS` (L348) but never reads `options` in its body (L349-366); it also dynamically imports `extractPageContent` inside the per-page loop (L360) even though the same module is statically imported at L8.
  - `detectSections` only reassigns `currentSection` in the two branches that push to the top-level `sections` array (L112-120); in the `level > currentSection.level` branch (L115-116) the new subsection is pushed into `currentSection.subsections` but `currentSection` still points at the parent, and content is only ever appended to `currentSection` (L121-125) — so every subsection retains `content: ''` and `pageEnd === pageStart` as constructed at L102-110.
  - `quality.hasOCRContent` requires an OCR text block with `confidence < 1` (L174-176), but ocrEngine's native-text path emits `confidence: 1.0` (ocrEngine.ts:186) and its OCR path emits zero blocks (ocrEngine.ts:125, 203) — no current code path produces a block with confidence < 1. By the same construction `textConfidence` (L178-185) evaluates to 1 on every path.
  - `calculateQualityMetrics` hardcodes `imageCount: 0` with comment "Set later" (L191); it is overwritten at L263 after image extraction.
  - `detectScannedDocument` counts a page as scanned when its text is under 100 chars and it has at least one `paintImageXObject`/`paintXObject` op (L324-335), sampling at most the first 3 pages (L315) and returning true when `scannedPages >= pagesToCheck / 2` (L338).
  - `metadata.info` is cast to `any` (L146); text items are `any`-cast in `quickExtractText` (L301) and `detectScannedDocument` (L321).
  - The cdnjs worker URL (L13) interpolates the installed `pdfjs-dist` version (^5.4.296, package.json:70) into a `pdf.worker.min.js` filename; the repo's other pdf.js consumers use `.mjs` worker files from unpkg (FloorPlanViewer.tsx:12, SchematicDiagram.tsx:66, DocumentPreviewDialog.tsx:32).
- ASSUMED:
  - Whether cdnjs actually hosts `pdf.worker.min.js` for pdf.js 5.x was not verified (no network check performed); pdf.js 4+ distributes the worker as `.mjs`, so the `.js` URL at L13 may 404 at runtime — inferred, not observed.
  - Since the module has no importers, none of these behaviors is currently reachable in the running app — inferred from the grep evidence, not from runtime observation.

## src/lib/pdf/imageExtractor.ts

- Purpose: Extracts embedded images from PDF pages via pdf.js operator lists, classifies them as logo/photo/icon by size heuristics, and converts raw image data to canvas data URLs (header comment, L1-4).
- Public surface:
  - `interface ExtractedImage { id; pageNumber; dataUrl; width; height; x; y; type: 'jpeg' | 'png' | 'unknown'; sizeBytes; isLogo; isPhoto; isIcon }` (L8-21)
  - `interface ImageExtractionOptions { minWidth?; minHeight?; maxImages?; extractLogos?; extractPhotos?; quality? }` (L23-30)
  - `extractImagesFromPage(page: pdfjsLib.PDFPageProxy, pageNumber: number, options: ImageExtractionOptions = DEFAULT_OPTIONS): Promise<ExtractedImage[]>` (L122-201)
  - `capturePageAsImage(page: pdfjsLib.PDFPageProxy, pageNumber: number, scale: number = 1.5): Promise<ExtractedImage>` (L206-242)
  - `extractAllImages(pdf: pdfjsLib.PDFDocumentProxy, options: ImageExtractionOptions = DEFAULT_OPTIONS, onProgress?: (current: number, total: number) => void): Promise<ExtractedImage[]>` (L247-268)
  - `findDocumentLogo(pdf: pdfjsLib.PDFDocumentProxy): Promise<ExtractedImage | null>` (L273-287)
  - `extractCoverPageImages(pdf: pdfjsLib.PDFDocumentProxy): Promise<{ logo: ExtractedImage | null; hero: ExtractedImage | null }>` (L292-306)
  - Module-private: `DEFAULT_OPTIONS` (L32-39: minWidth/minHeight 20, maxImages 100, quality 0.92), `LOGO_MAX_SIZE = 300` (L42), `LOGO_ASPECT_RATIO_RANGE {0.3, 3}` (L43), `PHOTO_MIN_SIZE = 200` (L46), `classifyImage(width, height)` (L51-70), `imageDataToDataUrl(imageData, width, height, format, quality)` (L75-117).
- Inputs & outputs: pdf.js page/document proxies in; `ExtractedImage` records with base64 `dataUrl` strings out. No tables, buckets, browser storage, or env vars.
- Dependencies: uses -> `pdfjs-dist` only (L6). used by <- src/lib/pdf/advancedProcessor.ts:9 (same unit L06: `extractAllImages`, `extractCoverPageImages`, types; type re-export at advancedProcessor.ts:371). `capturePageAsImage` and `findDocumentLogo`: none found (grep-verified — only their definition sites match).
- Side effects: creates detached `<canvas>` elements via `document.createElement` (L82, L212); reads pdf.js operator lists and page objects (`page.objs as any` with callback-style `objs.get(imageName, resolve)`, L143-146); renders pages to canvas (L220-224); `console.warn` per failed image (L195). No network calls of its own.
- Error handling: per-image try/catch inside the operator loop — `console.warn('[ImageExtractor] Failed to extract image …')` and continue (L194-196). `imageDataToDataUrl` returns `''` when the 2d context is unavailable (L87), and callers skip empty data URLs (L179). `capturePageAsImage` throws `Error('Could not get canvas context')` (L215). `extractAllImages`/`findDocumentLogo`/`extractCoverPageImages` have no try/catch — page-level pdf.js rejections propagate.
- Tests: none (grep-verified).
- Observed issues:
  - `viewport` is computed at L129 and never used in `extractImagesFromPage`.
  - Every extracted image gets `x: 0, y: 0` with the comment "Position tracking would require transform matrix analysis" (L187-188), yet `findDocumentLogo`'s comment claims "preferring top of page" (L284) while the code returns the first logo-classified image with no position sort (L285-286).
  - `format` is hardcoded to `'png'` (L169-170), so `type` is always `'png'` despite the `'jpeg' | 'png' | 'unknown'` union; the `quality` option is still passed to `canvas.toDataURL('image/png', quality)` (L116, and 0.92 at L226).
  - `sizeBytes` is an approximation: `Math.round(dataUrl.length * 0.75)` (L190, L237).
  - `imageDataToDataUrl` handles exactly three data lengths (RGBA `w*h*4`, RGB `w*h*3`, grayscale `w*h`, L93-112); any other length leaves the `ImageData` zero-filled and the function still returns a data URL of a blank canvas.
  - The promise wrapping `objs.get(imageName, resolve)` (L144-146) has no rejection or timeout path; `page.objs` is cast to `any` (L143).
  - `classifyImage` can return all-false (e.g. width 60, height 10: not icon since width ≥ 50 fails only jointly — icon requires both < 50; not logo since aspect 6 exceeds 3; not photo since both dimensions < 200) — the three booleans are not exhaustive (L51-70).
  - Both a per-page limit check (L159-161) and a document-level break (L262-264) test against the same `options.maxImages`.
- ASSUMED:
  - That `img.data` from `page.objs` is a `Uint8ClampedArray`/`Uint8Array` of raw pixel data in one of the three handled layouts is assumed from the branch structure, not verified against pdf.js 5.x internals (pdf.js may deliver `ImageBitmap`-backed objects without a `.data` field in newer versions, which would hit the `!img || !img.data` skip at L148).

## src/lib/pdf/ocrEngine.ts

- Purpose: Canvas-based OCR scaffold — scanned-page detection, image preprocessing (grayscale, contrast, binary threshold), and page rendering — with the actual character recognition step stubbed to return nothing (header comment L1-4; stub comment L121-122).
- Public surface:
  - `interface OCRResult { text; confidence; boundingBox?: {x; y; width; height} }` (L8-17)
  - `interface OCRPageResult { pageNumber; textBlocks: OCRResult[]; fullText; processingTime }` (L19-24)
  - `interface OCROptions { scale?; enhanceContrast?; removeNoise?; language? }` (L26-31)
  - `detectScannedPage(textContent: string, imageCount: number): boolean` (L92-98)
  - `extractTextFromCanvas(canvas: HTMLCanvasElement, options: OCROptions = DEFAULT_OCR_OPTIONS): Promise<OCRResult[]>` (L104-126)
  - `renderPageToCanvas(page: pdfjsLib.PDFPageProxy, scale: number = 2): Promise<HTMLCanvasElement>` (L131-151)
  - `processPageWithOCR(page: pdfjsLib.PDFPageProxy, pageNumber: number, options: OCROptions = DEFAULT_OCR_OPTIONS): Promise<OCRPageResult>` (L156-217)
  - `batchProcessPagesWithOCR(pages: pdfjsLib.PDFPageProxy[], options?: OCROptions, onProgress?: (current: number, total: number) => void): Promise<OCRPageResult[]>` (L222-236)
  - Module-private: `DEFAULT_OCR_OPTIONS` (L33-38: scale 2, enhanceContrast true, removeNoise true, language 'eng'), `enhanceImageContrast` (L43-54), `convertToGrayscale` (L59-70), `applyBinaryThreshold` (L75-87).
- Inputs & outputs: pdf.js page proxies and HTML canvases in; `OCRPageResult`/`OCRResult[]` out. No tables, buckets, browser storage, or env vars.
- Dependencies: uses -> `pdfjs-dist` only (L6). used by <- src/lib/pdf/advancedProcessor.ts:7 (same unit L06: `processPageWithOCR` + types; type re-export at advancedProcessor.ts:369). `batchProcessPagesWithOCR`: none found (grep-verified — only its definition site matches).
- Side effects: creates detached canvases (L136) and renders pages into them (L144-148); mutates canvas pixel data in place via `ctx.putImageData` when `enhanceContrast` is set (L114-119); `console.log` on every `extractTextFromCanvas` call (L123) and per scanned page (L194); `console.error` on page failure (L209). No network calls of its own.
- Error handling: `extractTextFromCanvas` returns `[]` when no 2d context (L109). `renderPageToCanvas` throws `Error('Could not get canvas context')` (L139). `processPageWithOCR` wraps everything in try/catch — on any failure it `console.error`s and resolves with `{pageNumber, textBlocks: [], fullText: '', processingTime}` rather than rejecting (L208-216). Inside the OCR branch, an empty OCR `fullText` falls back to the native text (`fullText: fullText || nativeText`, L204).
- Tests: none (grep-verified).
- Observed issues:
  - The recognition step is a stub: after preprocessing, `extractTextFromCanvas` always returns `[]` (L125) — comment: "For now, return empty - actual OCR would require Tesseract.js or similar / This stub allows the architecture to be in place" (L121-122). Consequently the scanned-page branch of `processPageWithOCR` (L194-206) always yields `textBlocks: []` and `fullText` equal to the (minimal) native text.
  - `OCROptions.removeNoise` and `OCROptions.language` are declared and defaulted (L29-30, L36-37) but never read anywhere in the unit (grep: only `options.enhanceContrast` at L114 and `options.scale` at L196 are consumed).
  - `OCRResult.boundingBox` is declared (L11-16) but never populated at either construction site (L184-187 native path; stub `[]`).
  - `applyBinaryThreshold` reads only the red channel as "gray" (L79) — it relies on `convertToGrayscale` having run first in the fixed L115-117 sequence; its default threshold parameter is 128 (L75) but the one call site passes 140 (L117), just as `enhanceImageContrast`'s default factor 1.5 (L43) is overridden with 1.8 (L116).
  - `detectScannedPage` uses a <50-char threshold (L94), while advancedProcessor's own `detectScannedDocument` uses <100 chars (advancedProcessor.ts:333) — two different "scanned" heuristics in the unit.
  - `processPageWithOCR`'s native-text path hardcodes `confidence: 1.0` in a single whole-page block (L184-187).
- ASSUMED:
  - The `page.render({canvasContext, viewport, canvas})` parameter object (L144-148, also imageExtractor.ts:220-224) matching pdfjs-dist 5.x's RenderParameters was not verified against the installed typings beyond the fact that the repo's tsconfig build passes are recorded elsewhere (P01 notes build gates disabled) — inferred, not observed.

## src/lib/pdf/textExtractor.ts

- Purpose: Position- and style-aware text extraction from pdf.js pages, grouping items into blocks/lines and heuristically detecting table rows, tables, and multi-column layouts (header comment L1-4).
- Public surface:
  - `interface TextBlock { text; x; y; width; height; fontSize; fontName; pageNumber; isHeader; isBold; column? }` (L8-20)
  - `interface TextLine { text; y; blocks: TextBlock[]; isTableRow }` (L22-27)
  - `interface ExtractedColumn { index; xStart; xEnd; blocks: TextBlock[] }` (L29-34)
  - `interface TableCell { text; row; col; x; y }` (L36-42)
  - `interface DetectedTable { rows: TableCell[][]; headers: string[]; startY; endY; pageNumber }` (L44-50)
  - `interface PageTextContent { pageNumber; blocks; lines; tables; columns; rawText; structuredText }` (L52-60)
  - `extractTextBlocks(page: pdfjsLib.PDFPageProxy, pageNumber: number): Promise<TextBlock[]>` (L70-99)
  - `groupBlocksIntoLines(blocks: TextBlock[]): TextLine[]` (L104-144)
  - `detectColumns(blocks: TextBlock[]): ExtractedColumn[]` (L171-214)
  - `detectTables(lines: TextLine[]): DetectedTable[]` (L219-243)
  - `extractPageContent(page: pdfjsLib.PDFPageProxy, pageNumber: number): Promise<PageTextContent>` (L294-327)
  - `extractDocumentContent(pdf: pdfjsLib.PDFDocumentProxy, maxPages?: number, onProgress?: (current: number, total: number) => void): Promise<PageTextContent[]>` (L332-348)
  - Module-private: `LINE_TOLERANCE = 3` (L63), `COLUMN_GAP_THRESHOLD = 50` (L64), `TABLE_CELL_PATTERN = /^[\d.,\-$%]+$|^[A-Z]{1,4}$/` (L65), `detectTableRow(blocks)` (L149-166), `buildTable(rows)` (L248-289).
- Inputs & outputs: pdf.js page/document proxies in; plain `PageTextContent` structures out. No DOM, no tables/buckets/storage/env vars.
- Dependencies: uses -> `pdfjs-dist` only (L6; `pdfjsLib.Util.transform` at L81). used by <- src/lib/pdf/advancedProcessor.ts:8 (same unit L06: `extractDocumentContent` + types, static) and advancedProcessor.ts:360 (`extractPageContent` via dynamic import inside `extractPageRange`); type re-export at advancedProcessor.ts:370. No consumers outside the unit (grep-verified).
- Side effects: none beyond pdf.js reads (`getTextContent` L74, `getViewport` L75, `getPage` L341); no logging, no DOM, no network.
- Error handling: none — no try/catch anywhere in the file; any pdf.js rejection propagates from `extractTextBlocks`/`extractPageContent`/`extractDocumentContent` to the caller.
- Tests: none (grep-verified).
- Observed issues:
  - Text items are iterated as `any[]` (L78); block `width` falls back to the heuristic `fontSize * item.str.length * 0.6` when `item.width` is falsy (L88); `isHeader` is simply `fontSize > 14` (L93) while advancedProcessor's `detectSections` treats `fontSize >= 14` as level 2 (advancedProcessor.ts:100) — a 14pt-exact block is level-2-sized there but not `isHeader` here (it can still enter section detection via `isBold`, advancedProcessor.ts:93).
  - `detectTableRow` computes gaps between consecutive blocks (L153-156) that can be negative for overlapping heuristic widths; the row qualifies only when gaps are within ±50% of a positive average > 20 and either a block matches `TABLE_CELL_PATTERN` or there are ≥3 blocks (L159-165).
  - `detectTables` requires ≥2 consecutive table-flagged lines (L226, L237) and drops a single interleaved non-table line's accumulated rows only when fewer than 2 were gathered (L226-233); `buildTable` derives column boundaries solely from the first gathered row (L252-256), assigns blocks to cells by x-window ±10 (L266-268) — a block can match multiple overlapping windows and thus appear in more than one cell, and blocks outside every window are silently dropped; `headers` is just the first row's cell texts (L284).
  - `detectColumns` rounds x-positions to the nearest 10 to find frequent line starts (L175), keeps starts backed by >5% of blocks (L183-187), then filters raw (unrounded) `b.x >= start` (L201) — a block whose x rounded up to its column's start (e.g. x = 7.4 → start 10) fails the raw comparison and is excluded from that column; returns `[]` unless ≥2 columns survive (L213).
  - In `extractPageContent`, when >1 column is detected, `structuredText` is rebuilt column-by-column (L307-312) while `lines`, `tables`, and `rawText` remain based on the page-wide y-sorted ordering (L298-303) — the same block set is represented in two different reading orders in one result.
  - Y coordinates are flipped to top-origin via `viewport.height - tx[5]` (L87) and blocks sorted y-then-x (L98), so `startY < endY` in `DetectedTable` means top-to-bottom page order.
- ASSUMED:
  - The interpretation of `pdfjsLib.Util.transform(viewport.transform, item.transform)` output (tx[4]/tx[5] as position, √(a²+b²) as font size, L81-87) follows common pdf.js usage; not verified against pdfjs-dist 5.x documentation.
  - `TextBlock.column?` (L19) appears to be populated nowhere in the unit (grep shows no assignment to `.column`); assumed dead field.

