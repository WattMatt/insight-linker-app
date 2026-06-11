# Edge Functions — PDF / DOCX Report Generation

Ground-truth reference for the six report-rendering edge functions. Every claim cites source
`path:line`, `supabase/config.toml`, or an existing system-reference doc. Inferred-but-unverified
points are marked **⚠️ UNVERIFIED**.

## Shared facts (apply to all six)

- **Transport auth.** All six are listed in `supabase/config.toml` with `verify_jwt = false`
  (lines below). With `verify_jwt = false` the function is reachable with **no auth session at all** —
  not even the anon key is required at the gateway (cf. `03-auth-and-access/token-systems.md:4-5`).
  `supabase.functions.invoke(...)` from the browser still attaches the caller's session JWT (or the
  anon key when logged out), but nothing in these handlers reads or validates it.
- **No in-handler auth.** None of the six call `auth.getUser()`, inspect the `Authorization` header to
  identify/authorize the caller, or check a role. Verified by absence: `grep -nE "getUser|auth\."` returns
  no caller-auth use in any of the six handlers (the only `Authorization` headers present are *outbound*
  to PDFShift / Browserless / Google, e.g. `generate-pdf/index.ts:2974`, `generate-inspection-pdf/index.ts:1560`,
  `generate-pdf-browserless/index.ts:889`).
- **All run as service-role.** Every function constructs its Supabase client from
  `SUPABASE_SERVICE_ROLE_KEY` (citations per function below), so all storage writes and table inserts
  **bypass RLS**.
- **All write the `documents` storage bucket**, which is **public = true**
  (`02-data-model/triggers-enums-storage.md:112`) and additionally exposed by the blanket
  `storage.objects` policies *"Anyone can view/upload/update/delete all storage"* (`USING (true)`, role
  `public`/anon — `triggers-enums-storage.md:135-145`). Net: every report URL these functions return is
  world-readable, and the 2026-06-11 lockdown does not touch storage policies
  (`triggers-enums-storage.md` final note).
- **CORS.** All six send `Access-Control-Allow-Origin: *` and answer `OPTIONS` with the CORS preflight
  (e.g. `generate-pdf/index.ts:2833`, `generate-pdf-google/index.ts:432`).

### `verify_jwt` settings (config.toml)

| Function | config.toml header line | verify_jwt (next line) |
|---|---|---|
| `generate-pdf` | `config.toml:46` | `false` (`:47`) |
| `generate-pdf-browserless` | `config.toml:49` | `false` (`:50`) |
| `generate-pdf-pdfmake` | `config.toml:52` | `false` (`:53`) |
| `generate-docx-report` | `config.toml:67` | `false` (`:68`) |
| `generate-pdf-google` | `config.toml:70` | `false` (`:71`) |
| `generate-inspection-pdf` | `config.toml:76` | `false` (`:77`) |

(Each `verify_jwt = false` line directly follows its `[functions.<name>]` header.)

### Caller summary

| Function | In-repo callers |
|---|---|
| `generate-pdf` | `src/hooks/useUnifiedPdfGeneration.ts:245`, `:291`; `src/hooks/useServerPdfGeneration.ts:121` |
| `generate-inspection-pdf` | `src/lib/pdfshiftInspectionReport.ts:252` |
| `generate-pdf-browserless` | **none** (no `invoke('generate-pdf-browserless')` or fetch in `src` or `supabase/functions`) |
| `generate-pdf-google` | **none** |
| `generate-pdf-pdfmake` | **none** |
| `generate-docx-report` | **none** |

`generate-pdf-browserless`, `generate-pdf-google`, `generate-pdf-pdfmake`, `generate-docx-report` are
**deployed but dead** w.r.t. the repo — no client or server code invokes them. They remain anon-reachable
endpoints (verify_jwt=false). ⚠️ UNVERIFIED whether any out-of-repo client (Capacitor build, manual
tooling) calls them.

---

## `generate-pdf`

**Purpose.** Multi-report-type HTML→PDF generator. Builds report HTML in-function, renders via the
PDFShift API, uploads the PDF to the `documents` bucket, and (for site reports) inserts a row into
`site_documents`. `supabase/functions/generate-pdf/index.ts` (3083 lines).

**Auth model.** `verify_jwt = false` (`config.toml`, `[functions.generate-pdf]`). No in-handler auth
(handler `:2832`; no `getUser`/role check anywhere). **Who can call:** anyone who can reach the function
URL — no session required. Callers in-repo always invoke it while logged in, but that is convention, not
enforcement.

**Inputs.** Single JSON body cast to `ReportData` (`:2848`; interface `:596-...`):
- `reportType: ReportType` (`:597`) — one of `'site-summary' | 'compliance' | 'inspection' | 'floor-plan' | 'coc-validation' | 'site-drawing' | 'fortress-checklist' | 'calendar' | 'inspection-template'` (`:594`). Selects the HTML builder via `switch` (`:2857-2935`); default → `generateSiteSummaryHTML` (`:2934`).
- `siteId?` (`:600`), `siteName?` (`:601`), `title?`, `subtitle?`, `siteAddress?`, `clientName?`, `clientLogoUrl?`, `companyLogoUrl?`, `accentColor?`, `qrBaseUrl?`, `subsections?`, `summaryStats?`, plus type-specific blocks: `inspection`, `cocValidation`, `fortressChecklistFull`, `calendar`, `assetVerification`, `fortressChecklist`, `documentsSummary`, `categoryHealth` (referenced `:2849-2853`, `:2862`, `:2916`, `:2925`).
- `debugHtml?: boolean` (`:2941`) — when `true`, uploads the rendered HTML to `documents/debug/...` and returns its URL (`:2944-2968`).
- Body validation is per-report-type: `coc-validation` requires `cocValidation` (`:2862`, 400 if missing); `inspection` requires `inspection` or flat `inspectionId` (`:2872`); `fortress-checklist` requires `fortressChecklistFull` (`:2916`); `calendar` requires `calendar` (`:2925`).

**Side effects.**
- **External API:** POST `https://api.pdfshift.io/v3/convert/pdf` (`:2971`) with `Authorization: Basic base64("api:" + PDFSHIFT_API_KEY)` (`:2974`). Secret: **`PDFSHIFT_API_KEY`** (`:2838`; 500 "service not configured" if unset `:2840-2846`).
- **Storage read:** downloads referenced images from storage buckets to embed (helper `:131`, `:229-231`, `:341-343`); service-role client.
- **Storage write (PDF):** `documents` bucket at `site-reports/{siteId}/{filename}` when `siteId` present, else `reports/{filename}` (`:3016-3026`), `upsert:false`.
- **Storage write (debug HTML):** `documents/debug/html_{reportType}_{ts}.html` when `debugHtml` (`:2952-2957`).
- **Table write:** when `body.siteId` is set, `INSERT` into **`site_documents`** `{ site_id, file_name, file_url, category }` (`:3045-3052`; `category` from `getReportCategory(reportType)` `:1969`). Insert failure is logged but does not fail the request (`:3054-3056`).
- Env: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (`:3007-3009`, also `:2945-2946`, `:59-60`).
- Returns `{ success, url, filename, storagePath, debugHtmlUrl }` (`:3062-3069`).

**Callers.** `src/hooks/useUnifiedPdfGeneration.ts:245` (`generatePdf`) and `:291`
(`generatePdfForPreview`, adds `returnBlob:true`); `src/hooks/useServerPdfGeneration.ts:121`. All pass the
whole `data` object as `body` and rely on `invoke`'s implicit session JWT.

**Security check.** `verify_jwt=false` + service-role + no caller scoping. The privileged side effect is the
**`site_documents` insert** (`:3045`): `site_id` is taken **verbatim from the request body** and written
with the service-role client (RLS bypassed). An anonymous caller can therefore attach an arbitrary
attacker-controlled PDF URL to **any** `site_id` they name, and can write reports/debug HTML to the public
`documents` bucket at will. No tenant check ties `siteId` to the caller. → **security_flag**.

---

## `generate-inspection-pdf`

**Purpose.** Inspection-report HTML builder + Browserless PDF render; uploads to `documents` and persists a
`subsection_documents` record server-side (so the report survives a client timeout).
`supabase/functions/generate-inspection-pdf/index.ts` (1794 lines).

**Auth model.** `verify_jwt = false` (`config.toml`, `[functions.generate-inspection-pdf]`). No in-handler
auth (handler `:1698`). **Who can call:** anyone reachable to the URL; no session enforced.

**Inputs.** JSON body cast to `InspectionPayload & { returnHtmlOnly?: boolean }` (`:1707`; interface
`:57-79`):
- `inspection` (required; 400 if missing `:1709-1714`) — `{ inspectionId, templateName?, inspectorName?, inspectionDate?, status?, qualityRating?, generalInfo?, sections?, tenants?, snags?, signatures?, subsectionName? }`.
- `siteName: string` (`:72`), `clientName?`, `siteLogoUrl?`, `accentColor?` (`:73-75`).
- `subsectionId?: string` (`:77`) — gates the `subsection_documents` persistence (`:1762`).
- `userId?: string` (`:78`) — written to `subsection_documents.uploaded_by` (`:1676`). **Caller-supplied**, not derived from a verified JWT (the caller sets `userId: user?.id`, `src/lib/pdfshiftInspectionReport.ts:247`).
- `returnHtmlOnly?: boolean` (`:1707`) — returns raw HTML, skips PDF/upload/persist (`:1741-1746`).

**Side effects.**
- **External API:** POST `https://chrome.browserless.io/pdf` (`:1556`) with `Authorization: Basic base64(BROWSERLESS_API_KEY + ":")` (`:1560`). Secret: **`BROWSERLESS_API_KEY`** (`:25`).
- **Storage read:** image download/transform helpers using service-role client (`:109-114`, `:206-207`, `:308-310`).
- **Storage write (PDF):** `documents` bucket at `inspection-reports/{fileName}` (`uploadToStorage` `:1597-1622`), `upsert:true`.
- **Table writes** (`saveDocumentRecord` `:1629-1692`, only when `subsectionId` set):
  - `document_categories`: `SELECT` find, else `INSERT { subsection_id, name:'Inspection Reports', order_index:0 }` (`:1641-1660`).
  - `subsection_documents`: `INSERT { subsection_id, category_id, file_name, file_url, uploaded_by: userId||null }` (`:1669-1677`).
- Env: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `BROWSERLESS_API_KEY` (`:23-25`).
- Returns `{ success, url, fileName, documentId }` (`:1773-1780`).

**Callers.** `src/lib/pdfshiftInspectionReport.ts:252` — body `{ inspection, siteName, clientName, siteLogoUrl, accentColor, subsectionId, userId: user?.id }` (`:240-248`).

**Security check.** `verify_jwt=false` + service-role + no caller scoping. Two privileged side effects are
attacker-controllable:
1. **`subsection_documents` / `document_categories` insert** keyed on a body-supplied `subsectionId`
   (`:1654`, `:1672`) — anon caller can attach an arbitrary `file_url` to any subsection and auto-create a
   category under it.
2. **`uploaded_by` spoofing** — `userId` comes from the body (`:1676`), so the audit attribution of the
   document can be set to any user id. → **security_flag**.

---

## `generate-pdf-browserless`

**Purpose.** Self-contained inspection-report HTML generator with aggressive image pre-embedding, rendered
to PDF via Browserless, uploaded to `documents`. `supabase/functions/generate-pdf-browserless/index.ts`
(1020 lines). Comment header claims feature parity / unified image specs with `generate-inspection-pdf`
(`:23-46`).

**Auth model.** `verify_jwt = false` (`config.toml`, `[functions.generate-pdf-browserless]`). No
in-handler auth (handler `:818`). **Who can call:** anyone reachable to the URL.

**Inputs.** JSON body (`:832-841`):
- `reportType` (default `'inspection'`), `inspection` (required; throws "No inspection data provided" `:850-852`), `siteName` (default `'Site Report'`), `clientName?`, `siteLogoUrl?`, `accentColor?` (default `'#2563eb'`), `debugHtml?: boolean`.
- `inspection` shape (`InspectionData` `:410-452`): `inspectionId`, `templateName?`, `inspectorName?`, `inspectionDate?`, `status?`, `qualityRating?`, `generalInfo?`, `sections?`, `tenants?`, `snags?`, `signatures?`, `subsectionName?`.

**Side effects.**
- **External API:** POST `https://chrome.browserless.io/pdf?token={BROWSERLESS_API_KEY}&timeout=60000` (`:889`). Secret: **`BROWSERLESS_API_KEY`** (`:827`; throws if unset `:828-830`).
- **Storage read:** image fetch via Supabase Render API `…/storage/v1/render/image/public/{bucket}/{path}` (`:169`) and direct `download` fallback (`:195-197`); service-role client (`:54-61`).
- **Storage write (PDF):** `documents` bucket at `reports/{safeSiteName}_Inspection_{ts}.pdf` (`:957-965`), `upsert:true`.
- **Storage write (debug HTML):** `documents/debug/browserless_{ts}.html` when `debugHtml` (`:874-880`).
- **No table writes.**
- Env: `SUPABASE_URL` (`:36`, `:56`), `SUPABASE_SERVICE_ROLE_KEY` (`:57`), `BROWSERLESS_API_KEY` (`:827`).
- Returns `{ success, url, filename, size, timings, totalTime }` (`:990-998`).

**Callers.** None in repo.

**Security check.** `verify_jwt=false` + service-role, no caller scoping. No DB writes, so blast radius is
limited to writing files into the public `documents` bucket (`reports/`, `debug/`) and consuming the
Browserless quota. Anon-callable + service-role storage write is still a free-write/abuse vector, but lower
severity than the DB-insert functions. → **security_flag** (lower severity).

---

## `generate-pdf-google`

**Purpose.** Renders the inspection report by creating a **Google Doc** (Drive API), populating it via the
Docs API (incl. uploading photos to Drive and making them `anyone`-readable), exporting the Doc to PDF,
uploading the PDF to `documents`, then deleting the temp Doc.
`supabase/functions/generate-pdf-google/index.ts` (535 lines).

**Auth model.** `verify_jwt = false` (`config.toml`, `[functions.generate-pdf-google]`). No in-handler auth
(handler `:431`). **Who can call:** anyone reachable to the URL.

**Inputs.** JSON body (`:445-446`): `{ inspection, siteName, clientName, siteLogoUrl }`. `inspection`
required (throws "Missing inspection data" `:448-450`). `inspection` shape (`InspectionData` `:31-40`):
`inspectionId`, `templateName?`, `inspectorName?`, `inspectionDate?`, `status?`, `qualityRating?`,
`sections?`, `subsectionName?` (each `section.items[]` has `label,value,notes?,photos?`).

**Side effects.**
- **External APIs (Google):** OAuth token `https://oauth2.googleapis.com/token` via service-account JWT (`:90-110`); Drive create-doc `POST https://www.googleapis.com/drive/v3/files` (`:118`); Docs batchUpdate `https://docs.googleapis.com/v1/documents/{id}:batchUpdate` (`:329`, `:384`); Drive resumable upload of each photo `https://www.googleapis.com/upload/drive/v3/files` (`:165`) **then sets the uploaded image permission to `{role:'reader', type:'anyone'}`** (`:204-214`) — i.e. each embedded photo becomes a publicly-shared Drive file; Drive export-to-PDF `…/files/{id}/export?mimeType=application/pdf` (`:402`); Drive delete temp doc (`:421-427`).
- **Secret:** **`GOOGLE_SERVICE_ACCOUNT_JSON`** (`:437`; parsed at `:442`, throws if unset `:438-440`). The service account's `client_email` is logged (`:443`). The RSA private key is imported via WebCrypto (`:64-75`) — not printed.
- **Storage write (PDF):** `documents` bucket at `reports/Inspection_Report_{siteName}_{ts}.pdf` (`:487-495`), `upsert:true`.
- **No table writes.**
- Env: `GOOGLE_SERVICE_ACCOUNT_JSON` (`:437`), `SUPABASE_URL` (`:483`), `SUPABASE_SERVICE_ROLE_KEY` (`:484`).
- Returns `{ success, url, filename }` (`:511-515`).

**Callers.** None in repo.

**Security check.** `verify_jwt=false` + service-role + a powerful Google service account, no caller
scoping. Anon-callable. Two concerns: (1) any anon caller can drive the Google service account to create
Docs/upload files in Drive and make them world-shared (`anyone`-reader, `:210-213`) — a resource-abuse /
data-exposure surface using the org's Google identity; (2) standard public-bucket PDF write. Mitigating:
each request creates and then deletes its temp Doc (`:508`), and the function has no in-repo caller. →
**security_flag** (anon-reachable side effects against Google service account).

---

## `generate-pdf-pdfmake`

**Purpose.** Pure-Deno inspection-report PDF generator using **pdfmake** (no external render service);
embeds images as base64 via the pdfmake images dictionary, uploads PDF to `documents`. Version `5.1.0`
(`:19`). `supabase/functions/generate-pdf-pdfmake/index.ts` (959 lines).

**Auth model.** `verify_jwt = false` (`config.toml`, `[functions.generate-pdf-pdfmake]`). No in-handler
auth (handler `:809`). **Who can call:** anyone reachable to the URL.

**Inputs.** JSON body (`:816`): `{ inspection, siteName, clientName, logoUrl, accentColor }`. `inspection`
and `siteName` both required → 400 `'Missing inspection or siteName'` (`:818-823`). `inspection` shape
(`InspectionData` `:194-232`): `templateName?`, `inspectorName?`, `inspectionDate?`, `subsectionName?`,
`sections?` (items: `label,value?,status?,notes?,photos?`), `tenants?` (shopName/shopNumber/
meterSerialNumber/breakerSize/ctSizeAndRatio/meterImage/breakerImage/ctRatioImage), `snags?`
(title/description?/status?/riskLevel?/photos?), `signatures?` (name/role?/signedAt?/signatureUrl?).

**Side effects.**
- **External API:** none for rendering; pulls pdfmake + fonts from esm.sh at runtime
  (`import('https://esm.sh/pdfmake@0.2.10/build/pdfmake.min.js')` `:888`, vfs_fonts `:889`).
- **Storage read:** signed-URL-with-transform then `download` fallback (`:110-145`); external `fetch` for
  non-storage URLs (`:171`); service-role client (`:55-60`).
- **Storage write (PDF):** `documents` bucket at `reports/inspection_{Date.now()}.pdf` (`:918-926`),
  `upsert:true`.
- **No table writes.**
- Env: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (`:57-58`).
- Returns `{ success, url, fileName, sizeKB }` (`:942-948`).

**Callers.** None in repo.

**Security check.** `verify_jwt=false` + service-role, no caller scoping, no DB writes. Same lower-severity
profile as `generate-pdf-browserless`: anon caller can write arbitrary PDFs into the public `documents`
bucket. → **security_flag** (lower severity).

---

## `generate-docx-report`

**Purpose.** Builds a Word (.docx) inspection report with the `docx` library (cover page, quality
dashboard, section breakdown, snags, signatures), embedding preloaded images, and uploads to `documents`.
Version `3.1.0` (`:35`). `supabase/functions/generate-docx-report/index.ts` (1078 lines).

**Auth model.** `verify_jwt = false` (`config.toml`, `[functions.generate-docx-report]`). No in-handler
auth (handler `:949`). **Who can call:** anyone reachable to the URL.

**Inputs.** JSON body cast to `RequestPayload` (`:957`; interface `:113-120`):
`{ reportType: string, inspection: InspectionReportData, siteName: string, clientName?, siteLogoUrl?,
accentColor? }`. No explicit presence validation beyond destructuring (`:958`); a missing `inspection`
would throw inside the builders. `inspection` carries `templateName?`, `subsectionName?`, `sections?`,
`snags?`, `signatures?` (used `:961-983`).

**Side effects.**
- **External API:** none; pulls the `docx` library at runtime. ⚠️ UNVERIFIED exact import URL (top-of-file
  imports not read in full).
- **Storage read:** image preload via `preloadAllImages` / `download` (`:266`); service-role client (`:966`).
- **Storage write (DOCX):** `documents` bucket at `inspection-reports/{safeName}_Inspection_{ts}.docx`
  (`:1051-1058`), contentType `application/vnd.openxmlformats-officedocument.wordprocessingml.document`,
  `upsert:true`.
- **No table writes.**
- Env: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (`:964-965`).
- Returns `{ success, url, fileName, version }` (`:1066-1067`).

**Callers.** None in repo.

**Security check.** `verify_jwt=false` + service-role, no caller scoping, no DB writes. Anon caller can
write arbitrary .docx files to the public `documents` bucket. → **security_flag** (lower severity).

---

## Cross-cutting observations

- **Four dead functions still exposed.** `generate-pdf-browserless`, `generate-pdf-google`,
  `generate-pdf-pdfmake`, `generate-docx-report` have no in-repo callers yet are deployed anon-reachable
  with service-role keys. They are attack surface with no legitimate traffic. (`generate-pdf-google`
  additionally fronts a Google service account.)
- **The two live functions write tenant-scoped tables (`site_documents`, `subsection_documents`) with
  unscoped, body-supplied ids and service-role privileges** — the same class as the `invite-user`/
  `create-user-admin` problem (privileged write reachable without caller authz), here applied to document
  attribution rather than user roles.
- **`uploaded_by` / report attribution is client-asserted** in `generate-inspection-pdf`
  (`userId` from body, `:1676`).
