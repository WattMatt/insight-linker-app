# C16 — ui-utility-primitives

- Unit id: C16
- Slug: ui-utility-primitives
- Spec mode: full
- Date: 2026-07-29
- Files: 8

## Unit header

**Unit purpose.** Eight standalone, single-file UI primitives that live directly in `src/components/` (no subdirectory): a Cloudflare Turnstile captcha wrapper, a class-based React error boundary, empty/loading placeholder blocks, a pagination control, a self-healing image element, a fullscreen zoom/pan image viewer, and a canvas-based labeled QR-code generator. Each is consumed across multiple feature units (auth views, admin views, site components, public pages, app-shell layouts) rather than belonging to any one feature.

**Module-level observations (cross-file, verified).**
- One intra-unit dependency: `FullscreenImageViewer` imports `RobustImage` (src/components/FullscreenImageViewer.tsx:5). All other files are mutually independent.
- All eight files use named exports only; no default exports (grep across the 8 files).
- No test file references any of the eight components: `grep -rln --include='*.test.*' CaptchaTurnstile|ErrorBoundary|EmptyState|LoadingState|ListPagination|RobustImage|FullscreenImageViewer|LabeledQRCode src` returns zero hits. The only indirect coverage is `src/lib/pagination.test.ts` (L18), which tests the `getPageWindow`/`ELLIPSIS` math that `ListPagination` renders (src/lib/pagination.test.ts:2, :43-51).
- The working tree contains an untracked duplicate `src/components/CaptchaTurnstile 2.tsx` (3,641 bytes, dated May 28) that is byte-identical to `src/components/CaptchaTurnstile.tsx` (`diff` reports no difference). It is not in the C16 file set and not tracked by git; all 8 canonical files are git-tracked (`git ls-files` verified).
- Formatting is mixed inside the unit: `CaptchaTurnstile.tsx` and `ListPagination.tsx` use double quotes; the other six use single quotes. `EmptyState.tsx` uses 4-space indentation (src/components/EmptyState.tsx:12-35) versus 2-space in the rest, and imports the button via relative path `./ui/button` (src/components/EmptyState.tsx:2) while `ErrorBoundary`/`FullscreenImageViewer`/`LabeledQRCode`/`ListPagination` use the `@/components/ui/...` alias (`RobustImage` also uses relative `./ui/button`, src/components/RobustImage.tsx:3).

**External contract.** The rest of the app gets: `CaptchaTurnstile` + `CAPTCHA_ENABLED` + `CaptchaTurnstileHandle` (captcha gating for login/forgot-password/public issue reports); `ErrorBoundary` (wraps the whole app in A01 providers); `EmptyState` and `LoadingState` (list placeholders and route-level loading in admin/portal layouts); `ListPagination` (page control paired with H03 `usePaginatedList`); `RobustImage` (storage image with retry/self-heal, used by site tables, galleries, public review, inspection detail); `FullscreenImageViewer` (modal zoom/pan viewer); `LabeledQRCode` (rendered + downloadable site/subsection QR labels for QR admin surfaces).

---

## src/components/CaptchaTurnstile.tsx
- Purpose: Client-only wrapper that injects the Cloudflare Turnstile script, renders a challenge widget, reports tokens to the parent via callback, and exposes an imperative `reset()`; renders nothing when no site key is configured.
- Public surface:
  - `CAPTCHA_ENABLED: boolean` — module constant, `Boolean(process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? "")` (src/components/CaptchaTurnstile.tsx:20-21).
  - `interface CaptchaTurnstileHandle { reset: () => void }` (src/components/CaptchaTurnstile.tsx:36-39).
  - `CaptchaTurnstile` — `forwardRef<CaptchaTurnstileHandle, { onTokenChange: (token: string | null) => void }>` component returning `JSX.Element | null` (src/components/CaptchaTurnstile.tsx:41-107).
- Inputs & outputs: In — `onTokenChange` callback prop; env var `NEXT_PUBLIC_TURNSTILE_SITE_KEY` (read once at module load, src/components/CaptchaTurnstile.tsx:20). Out — token strings (or `null` on expiry/reset) pushed through `onTokenChange`; a `<div className="flex justify-center">` container, or `null` when `CAPTCHA_ENABLED` is false (src/components/CaptchaTurnstile.tsx:104-105). No tables/buckets/localStorage.
- Dependencies: uses -> `react` (`forwardRef`, `useEffect`, `useImperativeHandle`, `useRef`, src/components/CaptchaTurnstile.tsx:3); runtime global `window.turnstile` typed via local `TurnstileWindow` interface (src/components/CaptchaTurnstile.tsx:25-34). No project imports. used by <- C06 public-fortress-floorplan (src/components/public/PublicIssueReportDialog.tsx:21-23 — imports `CAPTCHA_ENABLED`, `CaptchaTurnstileHandle`, component), V05 auth-views (src/views/auth/Login.tsx:17-19, src/views/auth/ForgotPassword.tsx:15-17) (grep-verified).
- Side effects: Appends `<script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer>` to `document.head` if not already present (src/components/CaptchaTurnstile.tsx:70-77); calls `window.turnstile.render(...)` immediately or on the script's `load` event (`{ once: true }`) (src/components/CaptchaTurnstile.tsx:89-93); registers `callback` (token) and `expired-callback` (null) with Turnstile (src/components/CaptchaTurnstile.tsx:82-86); unmount cleanup calls `turnstile.remove(widgetId)` (src/components/CaptchaTurnstile.tsx:95-101). `reset()` calls `turnstile.reset(widgetId)` then fires `onTokenChange(null)` (src/components/CaptchaTurnstile.tsx:55-61).
- Error handling: No try/catch anywhere. If the widget hasn't rendered or `window.turnstile` is absent, `reset()` and cleanup are silent no-ops via the `if` guards (src/components/CaptchaTurnstile.tsx:57, :97). Script load failure is unhandled — `render` is only bound to `load`, so on script error the widget never renders and no callback fires. When `CAPTCHA_ENABLED` is false the effect returns early and the component renders `null` (src/components/CaptchaTurnstile.tsx:67, :104).
- Tests: None found (grep-verified across `*.test.*`).
- Observed issues:
  - The injected script element is never removed on unmount; cleanup removes only the widget (src/components/CaptchaTurnstile.tsx:95-101). The header comment describes this as intentional single-load behaviour ("Load script once per page", src/components/CaptchaTurnstile.tsx:69).
  - `callbackRef.current = onTokenChange` is assigned during render, not in an effect (src/components/CaptchaTurnstile.tsx:49-50).
  - A byte-identical untracked duplicate `src/components/CaptchaTurnstile 2.tsx` exists in the working tree (see unit header).
- ASSUMED: `NEXT_PUBLIC_TURNSTILE_SITE_KEY` is inlined at Next.js build time, so `CAPTCHA_ENABLED` is fixed per build (standard Next.js behaviour; not verified in build output). The comment's claim that Supabase project-level captcha enforcement is the real gate (src/components/CaptchaTurnstile.tsx:16-18) is a doc claim, not verified against the Supabase dashboard.

## src/components/ErrorBoundary.tsx
- Purpose: Class-based React error boundary that catches render-tree errors and shows a full-screen card with the error string, a reload button, a back button, and dev-only component-stack details.
- Public surface: `class ErrorBoundary extends Component<Props, State>` where `Props = { children: ReactNode; fallbackMessage?: string }` (src/components/ErrorBoundary.tsx:6-9) and `State = { hasError: boolean; error: Error | null; errorInfo: ErrorInfo | null }` (src/components/ErrorBoundary.tsx:11-15). Implements `static getDerivedStateFromError(error): State` (src/components/ErrorBoundary.tsx:24-26) and `componentDidCatch(error, errorInfo)` (src/components/ErrorBoundary.tsx:28-34).
- Inputs & outputs: In — `children`, optional `fallbackMessage`; `process.env.NODE_ENV` gates the details block (src/components/ErrorBoundary.tsx:78). Out — children when no error; otherwise a full-screen Card showing `fallbackMessage` or a default string (src/components/ErrorBoundary.tsx:51-54), `error.toString()` (src/components/ErrorBoundary.tsx:57-63), and in development a `<details>` with `errorInfo.componentStack` (src/components/ErrorBoundary.tsx:78-87). No storage.
- Dependencies: uses -> `react` (Component, ErrorInfo, ReactNode), `lucide-react` (AlertCircle, RefreshCw), C01 ui-kit-shadcn (`@/components/ui/button`, `@/components/ui/card`) (src/components/ErrorBoundary.tsx:1-4). used by <- A01 root-shell (src/app/providers.tsx:7) (grep-verified; sole consumer).
- Side effects: `console.error('ErrorBoundary caught an error:', error, errorInfo)` in `componentDidCatch` (src/components/ErrorBoundary.tsx:29); `handleReset` clears state then calls `window.location.reload()` (src/components/ErrorBoundary.tsx:36-39); "Go Back" button calls `window.history.back()` inline (src/components/ErrorBoundary.tsx:70-75). No network calls, no external error reporting.
- Error handling: This is the error handler — caught errors set `hasError` and render the fallback card; nothing is rethrown; no reporting beyond `console.error`.
- Tests: None found (grep-verified).
- Observed issues:
  - "Go Back" calls `window.history.back()` without clearing `hasError` (src/components/ErrorBoundary.tsx:70-75); the reset path instead forces a full `window.location.reload()` (src/components/ErrorBoundary.tsx:38).
  - `componentDidCatch` calls `setState` with `error`/`errorInfo` after `getDerivedStateFromError` already stored `error` with `errorInfo: null` (src/components/ErrorBoundary.tsx:24-34).
- ASSUMED: Nothing.

## src/components/EmptyState.tsx
- Purpose: Presentational dashed-border placeholder block with an icon, title, description, and optional action button.
- Public surface: `function EmptyState(props: { icon: LucideIcon; title: string; description: string; actionLabel?: string; onAction?: () => void }): JSX.Element` (src/components/EmptyState.tsx:4-18).
- Inputs & outputs: In — the five props. Out — static JSX; the Button renders only when both `actionLabel` and `onAction` are provided (src/components/EmptyState.tsx:28-32). No storage, no env.
- Dependencies: uses -> `lucide-react` (`LucideIcon` type), C01 ui-kit-shadcn (`./ui/button`) (src/components/EmptyState.tsx:1-2). used by <- V01 admin-entity-views (src/views/Clients.tsx:18, src/views/Sites.tsx:17) (grep-verified).
- Side effects: None besides invoking the caller's `onAction` on click.
- Error handling: None; pure presentational.
- Tests: None found (grep-verified).
- Observed issues: 4-space indentation and relative `./ui/button` import diverge from most of the unit (see unit header).
- ASSUMED: Nothing.

## src/components/LoadingState.tsx
- Purpose: Three-variant loading placeholder — inline spinner (default), skeleton list, or full-page centered spinner — with optional message.
- Public surface: `function LoadingState(props: { variant?: 'spinner' | 'skeleton' | 'full-page'; message?: string; skeletonCount?: number; className?: string }): JSX.Element` — defaults `variant='spinner'`, `skeletonCount=3` (src/components/LoadingState.tsx:5-17).
- Inputs & outputs: In — the four props. Out — `full-page`: `min-h-screen` centered `Loader2` + message (src/components/LoadingState.tsx:18-29); `skeleton`: `skeletonCount` × `Skeleton` rows `h-20 w-full` (src/components/LoadingState.tsx:31-39); default: padded centered spinner + message (src/components/LoadingState.tsx:42-51). No storage, no env.
- Dependencies: uses -> `lucide-react` (Loader2), C01 ui-kit-shadcn (`@/components/ui/skeleton`), L18 shared-utils (`cn` from `@/lib/utils`) (src/components/LoadingState.tsx:1-3). used by <- A07 contractor-routes (src/app/(contractor)/layout.tsx:4), A06 client-portal-routes (src/app/(client-portal)/layout.tsx:4), A03 admin-shell-and-list-routes (src/app/(admin)/layout.tsx:7), A05 admin-template-routes (src/app/(admin)/inspection-templates/page.tsx:3), V04 public-and-entry-views (src/views/Auth.tsx:8) (grep-verified).
- Side effects: None.
- Error handling: None; pure presentational.
- Tests: None found (grep-verified).
- Observed issues: None.
- ASSUMED: Nothing.

## src/components/ListPagination.tsx
- Purpose: Presentational pagination control that renders the shadcn Pagination primitives around the `getPageWindow` page-number math; renders nothing for a single page.
- Public surface: `function ListPagination(props: { page: number; pageCount: number; onPageChange: (page: number) => void; disabled?: boolean; className?: string }): JSX.Element | null` (src/components/ListPagination.tsx:17-26).
- Inputs & outputs: In — the five props. Out — `null` when `pageCount <= 1` (src/components/ListPagination.tsx:27); otherwise Previous / windowed page links with ellipses / Next; page changes emitted through `onPageChange` via `go()`, which suppresses calls when `disabled`, same-page, or out of range (src/components/ListPagination.tsx:30-33). No storage, no env.
- Dependencies: uses -> C01 ui-kit-shadcn (`@/components/ui/pagination` — Pagination, PaginationContent, PaginationItem, PaginationLink, PaginationNext, PaginationPrevious, PaginationEllipsis, src/components/ListPagination.tsx:5-13), L18 shared-utils (`getPageWindow`, `ELLIPSIS` from `@/lib/pagination`, src/components/ListPagination.tsx:14; `cn` from `@/lib/utils`, src/components/ListPagination.tsx:15). Its doc comment names H03's `usePaginatedList` as the intended pairing (src/components/ListPagination.tsx:1-4; hook lives at src/hooks/usePaginatedList.ts, unit H03). used by <- V02 admin-ops-and-template-views (src/views/Users.tsx:6), V01 admin-entity-views (src/views/Clients.tsx:5) (grep-verified).
- Side effects: None; all anchors are `href="#"` with `e.preventDefault()` before delegating to `go()` (src/components/ListPagination.tsx:42-47, :60-66, :76-81).
- Error handling: None needed; out-of-range and disabled clicks are silently ignored by `go()` (src/components/ListPagination.tsx:31). Disabled/boundary states additionally get `aria-disabled` and `pointer-events-none opacity-50` classes (src/components/ListPagination.tsx:48-49, :82-83).
- Tests: No direct test. The windowing math it renders is asserted in src/lib/pagination.test.ts (L18): `getPageWindow` returns full ranges ≤ maxButtons, and ellipsis-bearing windows for larger counts (src/lib/pagination.test.ts:43-51).
- Observed issues: None.
- ASSUMED: Nothing.

## src/components/RobustImage.tsx
- Purpose: `<img>` wrapper with loading/error states that, on load failure, first tries to resolve the correct storage URL via `findCorrectImageUrl`, then retries with cache-busting, and finally shows an "Image unavailable" block with a manual Retry button.
- Public surface: `const RobustImage: (props: { src: string; alt: string; className?: string; onError?: () => void; onClick?: () => void; retryCount?: number }) => JSX.Element` — default `retryCount = 2` (src/components/RobustImage.tsx:6-26).
- Inputs & outputs: In — the six props. Out — spinner overlay while `loading` (src/components/RobustImage.tsx:119-123); `<img>` keyed by current `imageSrc` with `opacity-0` until loaded (src/components/RobustImage.tsx:124-132); error block with `ImageOff` icon and Retry button on final failure (src/components/RobustImage.tsx:99-115). Indirectly reads Supabase Storage (bucket listing) through `findCorrectImageUrl` (src/lib/imageUrlResolver.ts:33-58, which calls `supabase.storage.from(bucket).list(...)`).
- Dependencies: uses -> `react`, `lucide-react` (RefreshCw, ImageOff), C01 ui-kit-shadcn (`./ui/button`), L12 file-image-utils (`findCorrectImageUrl` from `@/lib/imageUrlResolver`, src/components/RobustImage.tsx:1-4). used by <- C16 (intra-unit: src/components/FullscreenImageViewer.tsx:5), C12 floor-plan-annotation (src/components/BeforeAfterComparison.tsx:10), C13 offline-pwa (src/components/OfflineImageGallery.tsx:5), C07 site-assets-inspections (src/components/site/AssetComparisonTable.tsx:23, src/components/site/MeterRegister.tsx:12), V01 admin-entity-views (src/views/Sites.tsx:16, src/views/InspectionDetail.tsx:24), V04 public-and-entry-views (src/views/PublicSubsectionReview.tsx:35) (grep-verified).
- Side effects: Network — image fetches via the `<img>` element; one Supabase Storage `list` call per failed src (Strategy 1, src/components/RobustImage.tsx:49-57) and another on each manual retry (src/components/RobustImage.tsx:91); `console.log('Found correct image at:', foundUrl)` on successful self-heal (src/components/RobustImage.tsx:53). `setTimeout` back-off of `500 * (retries + 1)` ms between cache-bust retries (src/components/RobustImage.tsx:62-68). State resets whenever the `src` prop changes (src/components/RobustImage.tsx:33-43).
- Error handling: `onError` on the img drives a three-stage cascade: (1) once per src, await `findCorrectImageUrl(src)` and swap in the found URL (src/components/RobustImage.tsx:49-57); (2) up to `retryCount` cache-busting retries appending `?t=Date.now()` to the current `imageSrc` (src/components/RobustImage.tsx:61-69); (3) set `error` state and invoke the caller's `onError?.()` (src/components/RobustImage.tsx:73-76). All setState paths in the automatic cascade are gated on `mountedRef` (src/components/RobustImage.tsx:46, :52, :63, :73). `findCorrectImageUrl` itself returns `null` on any storage error (src/lib/imageUrlResolver.ts:53), which falls through to the retry path.
- Tests: None found (grep-verified).
- Observed issues:
  - `handleManualRetry` performs `await findCorrectImageUrl(src)` and then calls `setImageSrc` without checking `mountedRef`, unlike `handleError` (src/components/RobustImage.tsx:85-97).
  - Strategy-2 cache-busting operates on `imageSrc` (which may already be the Strategy-1 replacement URL), whereas manual retry cache-busts the original `src` prop (src/components/RobustImage.tsx:65-66 vs :95).
  - `console.log` diagnostic ships unconditionally (src/components/RobustImage.tsx:53).
- ASSUMED: Nothing.

## src/components/FullscreenImageViewer.tsx
- Purpose: Full-screen Dialog-based image viewer with wheel/button zoom (0.5×–5×), drag/touch panning above 1×, double-click zoom toggle, and keyboard shortcuts, rendering the image through `RobustImage`.
- Public surface: `const FullscreenImageViewer: (props: { src: string | null; alt?: string; onClose: () => void }) => JSX.Element` — default `alt = "Full size view"`; open state is `!!src` (src/components/FullscreenImageViewer.tsx:7-13, :135).
- Inputs & outputs: In — the three props; window `keydown` events. Out — a `Dialog` covering the viewport (`w-screen h-screen`, `bg-black/95`, src/components/FullscreenImageViewer.tsx:136) with zoom controls, percentage readout, reset, close button, "Drag to pan" hint at scale > 1 (src/components/FullscreenImageViewer.tsx:196-201), and a desktop-only instructions block (src/components/FullscreenImageViewer.tsx:222-225). Closing is delegated to the caller via `onClose`. No storage, no env.
- Dependencies: uses -> `react`, `lucide-react` (X, ZoomIn, ZoomOut, RotateCcw, Move), C01 ui-kit-shadcn (`@/components/ui/dialog` — Dialog, DialogContent; `@/components/ui/button`), C16 intra-unit (`./RobustImage`) (src/components/FullscreenImageViewer.tsx:1-5). used by <- C13 offline-pwa (src/components/OfflineImageGallery.tsx:6), C09 site-structure-qr-schematic (src/components/site/SchematicDiagram.tsx:57), V01 admin-entity-views (src/views/InspectionDetail.tsx:25) (grep-verified).
- Side effects: Adds a `window` `keydown` listener for the component's whole mount lifetime (removed on unmount/dep change); the handler no-ops when `src` is null (src/components/FullscreenImageViewer.tsx:109-132). Escape → `onClose()`, `+`/`=` → zoom in, `-` → zoom out, `0` → reset (src/components/FullscreenImageViewer.tsx:113-127). `handleWheel` calls `e.preventDefault()` (src/components/FullscreenImageViewer.tsx:45-46). Zoom/position state resets when `src` changes (src/components/FullscreenImageViewer.tsx:21-24). Position snaps to origin whenever scale drops to ≤ 1 (src/components/FullscreenImageViewer.tsx:33-34, :50-52).
- Error handling: None of its own; image failures are handled inside `RobustImage` (its error block renders within the dialog). Dialog dismissal (`onOpenChange`) unconditionally calls `onClose()` (src/components/FullscreenImageViewer.tsx:135).
- Tests: None found (grep-verified).
- Observed issues:
  - The keydown listener is registered even while the viewer is closed (consumers mount it permanently with `src=null`); guarding is inside the handler (src/components/FullscreenImageViewer.tsx:110-111, :130).
  - `DialogContent` contains no `DialogTitle`/`DialogDescription` elements (src/components/FullscreenImageViewer.tsx:136-227).
  - The inner `RobustImage` gets `pointer-events-none`, so `RobustImage`'s manual Retry button inside this viewer cannot receive clicks (src/components/FullscreenImageViewer.tsx:216).
  - Touch handling is single-finger pan only; there is no pinch-zoom branch (`e.touches.length === 1` checks, src/components/FullscreenImageViewer.tsx:78, :88).
- ASSUMED: Nothing.

## src/components/LabeledQRCode.tsx
- Purpose: Renders a bordered canvas containing a 500px QR code (error-correction H) with optional centered logo overlay and site/subsection text labels, exposes the PNG data-URL to the parent, and offers a download button.
- Public surface: `const LabeledQRCode: (props: { url: string; siteName: string; subsectionName: string; logoUrl?: string; onGenerated?: (dataUrl: string) => void }) => JSX.Element` (src/components/LabeledQRCode.tsx:7-21).
- Inputs & outputs: In — the five props; `logoUrl` image fetched cross-origin (`img.crossOrigin = 'anonymous'`, src/components/LabeledQRCode.tsx:75). Out — an on-screen `<canvas>` (580px wide: 500 QR + 2×40 padding; height 720 incl. 140px text band, src/components/LabeledQRCode.tsx:41-49); PNG data-URL via `onGenerated` (src/components/LabeledQRCode.tsx:154-158); a browser download named `` `${siteName}-${subsectionName}-QR.png` `` triggered by a synthetic anchor click (src/components/LabeledQRCode.tsx:174-177). No tables/buckets/env.
- Dependencies: uses -> `react`, `qrcode` npm package (`QRCode.toCanvas`, package.json:72 pins `^1.5.4`), C01 ui-kit-shadcn (`@/components/ui/button`), `lucide-react` (Download), H04 ui-and-pdf-template-hooks (`useToast` from `@/hooks/use-toast`) (src/components/LabeledQRCode.tsx:1-5). used by <- C09 site-structure-qr-schematic (src/components/site/QRCodeManager.tsx:5), V02 admin-ops-and-template-views (src/views/QRCodes.tsx:12) (grep-verified).
- Side effects: Canvas 2D drawing on every change of `url`/`siteName`/`subsectionName`/`logoUrl` (effect deps, src/components/LabeledQRCode.tsx:27-29); creates a temporary off-DOM canvas for the raw QR (src/components/LabeledQRCode.tsx:61-66); optional network fetch of `logoUrl` via `Image` (src/components/LabeledQRCode.tsx:72-120); text auto-shrinks from 38px/32px down to a 16px floor to fit width (src/components/LabeledQRCode.tsx:129-138); success/error toasts on download/generation (src/components/LabeledQRCode.tsx:160-165, :179-182); DOM anchor creation + click for download (src/components/LabeledQRCode.tsx:174-177).
- Error handling: Generation is wrapped in try/catch/finally — on throw it `console.error`s and shows a destructive "Failed to generate QR code" toast; `finally` clears `isGenerating` (src/components/LabeledQRCode.tsx:159-168). Logo load failure resolves the promise after `console.error('Failed to load logo')`, so generation proceeds without the logo (src/components/LabeledQRCode.tsx:114-117). `handleDownload` silently returns when no data-URL exists yet (src/components/LabeledQRCode.tsx:172).
- Tests: None found (grep-verified).
- Observed issues:
  - `if (!ctx) return;` at src/components/LabeledQRCode.tsx:37 executes after `setIsGenerating(true)` (line 34) but before the try/finally block (line 39), so on that path `isGenerating` is never cleared and the "Generating QR code..." text persists (src/components/LabeledQRCode.tsx:196-198).
  - The effect calls `generateLabeledQRCode()` but omits the function from its dependency array (src/components/LabeledQRCode.tsx:27-29).
  - The download filename interpolates `siteName`/`subsectionName` verbatim with no character sanitization (src/components/LabeledQRCode.tsx:175).
- ASSUMED: The `qrcode` package's `toCanvas` renders synchronously into the temp canvas once awaited (library behaviour, not read in this review).
