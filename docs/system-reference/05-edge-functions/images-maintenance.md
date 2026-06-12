# Edge Functions — Images & Maintenance

Ground-truth reference for five image/maintenance edge functions. Sources:
`supabase/functions/<name>/index.ts`. `verify_jwt` from `supabase/config.toml`.

## verify_jwt summary (from `supabase/config.toml`)

| Function | config.toml line | verify_jwt |
|---|---|---|
| `compress-image` | `config.toml:61-62` | `true` |
| `batch-compress-images` | `config.toml:64-65` | `true` |
| `detect-schematic-regions` | `config.toml:55-56` | `false` |
| `fix-inspection-photos` | `config.toml:58-59` | `false` |
| `fix-tenant-images` | `config.toml:36-37` | `true` |

**Important — what `verify_jwt = true` actually gates.** It requires the request to carry a JWT
the gateway accepts. The Supabase **anon key is itself a valid JWT** and satisfies `verify_jwt = true`.
None of these functions performs an in-handler `getUser()`, role check, or tenant-scope check. So
`verify_jwt = true` here means "callable by anyone holding the public anon key" (which is shipped in
the client bundle), **not** "callable only by an authenticated, authorized user." All five use the
**service-role key** (`SUPABASE_SERVICE_ROLE_KEY`) internally and therefore **bypass all RLS and
storage.objects policies** once entered.

Storage context (from `02-data-model/triggers-enums-storage.md:111,120-145`): the effective
`storage.objects` policy set is four blanket `public` policies — anon can SELECT/INSERT/UPDATE/DELETE
any object in any bucket via the storage API anyway — and `inspection-photos` is `public=true`
(`triggers-enums-storage.md:111`). So for the storage-mutating functions the service-role bypass does
not grant access anon lacks directly; the unauthenticated *reachability of the side effect* is the risk.

---

## compress-image

**Purpose.** Download one image from a storage bucket, attempt a Supabase Image-Transformation resize/recompress, and upload the result alongside the original as `<name>_compressed.<ext>`.

**Auth model.**
- `verify_jwt = true` (`config.toml:61-62`). Satisfied by the anon key — see summary above.
- No in-handler auth: no `getUser`, no role check. Client is built with the **service-role key** (`index.ts:72-74`), bypassing RLS/storage policies.
- **Who can successfully call this?** Anyone with the anon key (i.e. anyone who has the public client config). No tenant/site scoping — `sourcePath`/`bucket` are caller-controlled.

**Inputs** (JSON body, parsed `index.ts:53`):

| Field | Type | Default | Line |
|---|---|---|---|
| `sourcePath` | string (required) | — | `index.ts:54-55`, validated `index.ts:61-66` |
| `bucket` | string | `'inspection-photos'` | `index.ts:56` |
| `maxWidth` | number | `800` | `index.ts:57` |
| `quality` | number | `70` | `index.ts:58` |

Returns `{ success, originalSize?, compressedSize?, path?, url?, error? }` (`index.ts:15-22,164-170`).

**Side effects.**
- Storage **read**: `download(sourcePath)` from `bucket` (`index.ts:77-79`).
- Storage **read**: `createSignedUrl(sourcePath, 60, {transform:{width,quality}})` (`index.ts:99-106`), then `fetch` of that signed URL with 30s timeout (`index.ts:110-112`).
- Storage **write**: `upload(<sourcePath>_compressed.<ext>, …, {upsert:true})` to `bucket` (`index.ts:141-146`) — `upsert:true` overwrites any existing object at that path.
- `getPublicUrl` of the compressed path (`index.ts:157-159`).
- No DB writes, no emails, no external (non-Supabase) APIs.
- Secrets used: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (`index.ts:72-73`).

**Callers.**
- `src/hooks/useImageUpload.ts:241` — `supabase.functions.invoke('compress-image', { body: { sourcePath: path, bucket, maxWidth: 800, quality: 70 } })`, fire-and-forget background optimization after upload (`useImageUpload.ts:238-260`).

**Security check.** `verify_jwt = true` but no real authorization. With service-role, `bucket` + `sourcePath` are arbitrary and `upsert:true`, so any anon-key holder can write a new `*_compressed.*` object into **any bucket** at a chosen path (subject only to the source download succeeding). Storage is already anon-writable via blanket policies (`triggers-enums-storage.md:120-145`), so this is not a *new* write capability, but it is a privileged-credential write path reachable without authenticated authorization. Recorded as a security_flag.

---

## batch-compress-images

**Purpose.** Walk a bucket (BFS up to depth 5 / 100 folders), find image files ≥ `minSizeKB` lacking a `_compressed` sibling, and compress them via Image Transformation, uploading `<name>_compressed.jpg`. Supports `dryRun`.

**Auth model.**
- `verify_jwt = true` (`config.toml:64-65`). Satisfied by the anon key.
- No in-handler auth check. Service-role client (`index.ts:116-118`).
- **Who can successfully call this?** Anyone with the anon key. No tenant scoping; `bucket`/`prefix` are caller-controlled.

**Inputs** (JSON body, parsed `index.ts:99`):

| Field | Type | Default | Line |
|---|---|---|---|
| `bucket` | string | `'inspection-photos'` | `index.ts:101` |
| `prefix` | string | `''` (all folders) | `index.ts:102` |
| `maxWidth` | number | `800` | `index.ts:103` |
| `quality` | number | `70` | `index.ts:104` |
| `minSizeKB` | number | `150` | `index.ts:105` |
| `dryRun` | boolean | `false` | `index.ts:106` |
| `limit` | number | `50` | `index.ts:107` |

Returns `{ success, processed, compressed, skipped, errors, totalSavings, files[], continuationToken? }` (`index.ts:26-35,303-312`).

**Side effects.**
- Storage **read**: recursive `list(path, {limit:500})` (`index.ts:63-65`), capped at `MAX_FOLDERS = 100` (`index.ts:57`) and `maxDepth` 5 (`index.ts:122`).
- Storage **read**: per-file `download` (`index.ts:152-154`), existence-check `download(<compressedPath>)` (`index.ts:184-186`), `createSignedUrl(…,120,{transform})` + `fetch` (`index.ts:211-227`).
- Storage **write**: `upload(<name>_compressed.jpg, …, {upsert:true})` (`index.ts:261-266`); only when `compressedSize < originalSize*0.9` (`index.ts:247`) and not `dryRun`.
- No DB writes, no emails, no non-Supabase external calls.
- Secrets used: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (`index.ts:116-117`).

**Callers.**
- `src/components/settings/ImageCompressionManager.tsx:48` — `supabase.functions.invoke('batch-compress-images', { body: { bucket:'inspection-photos', maxWidth, quality, minSizeKB, dryRun, limit } })`. Mounted in the `image-compression` Settings tab (`Settings.tsx:333-334`), under route `src/app/(admin)/settings/page.tsx` (route-group naming only; **the edge function itself is not gated by this UI placement**).

**Security check.** Same class as `compress-image`: `verify_jwt = true` with no authorization, service-role writes, caller-controlled `bucket`/`prefix`. Additionally an unauthenticated caller can drive a large unbounded storage scan + per-file downloads (resource/cost amplification) against any bucket. Recorded as a security_flag.

---

## detect-schematic-regions

**Purpose.** Given a click point and a base64 page image, ask a vision LLM (Lovable AI Gateway / Gemini first, Anthropic fallback) to locate the nearest small 7-row distribution-board table and return its bounding box as percentages.

**Auth model.**
- `verify_jwt = false` (`config.toml:55-56`). **Publicly callable with no JWT at all** — no anon key required.
- No in-handler auth check. Does not touch Supabase at all (no `createClient`).
- **Who can successfully call this?** Anyone on the internet who can reach the function URL.

**Inputs** (JSON body, destructured `index.ts:21`): `pdfUrl`, `clickX` (required), `clickY` (required), `pageWidth`, `pageHeight`, `pageImageBase64`. Validation: `clickX`/`clickY` must be defined (`index.ts:23-28`); if no `pageImageBase64`, returns `{found:false}` (`index.ts:51-57`). `pdfUrl` is read but unused downstream.

Returns `{ found:true, region:{x,y,width,height,label} }` (percentages) or `{found:false}` / `{error}` (`index.ts:243-249`, `:177-182`, `:251-258`).

**Side effects.**
- **External API**: Lovable AI Gateway `POST https://ai.gateway.lovable.dev/v1/chat/completions`, model `google/gemini-2.5-flash`, `Authorization: Bearer <LOVABLE_API_KEY>` (`index.ts:90-116`). Secret: **`LOVABLE_API_KEY`** (`index.ts:33`).
- **External API (fallback)**: Anthropic `POST https://api.anthropic.com/v1/messages`, model `claude-sonnet-4-20250514`, header `x-api-key: <ANTHROPIC_API_KEY>` (`index.ts:135-165`). Secret: **`ANTHROPIC_API_KEY`** (`index.ts:34`).
- If neither key is set → 500 `{error:'No API keys configured'}` (`index.ts:36-42`).
- No storage, no DB, no emails. Secrets are sent only to their respective provider endpoints — not returned to the caller.

**Callers.** No in-repo callers. Grep of `src/` for `detect-schematic-regions` / `detect_schematic` and of `functions/v1/detect-schematic` returns nothing. ⚠️ UNVERIFIED whether any client path invokes it (possibly dead / called by an external/native client).

**Security check.** `verify_jwt = false` and no in-handler auth → a fully **unauthenticated, internet-reachable proxy to paid LLM APIs** (`LOVABLE_API_KEY`, `ANTHROPIC_API_KEY`). Any caller can submit arbitrary base64 images + prompt-shaped input and burn the project's AI credits (cost/abuse). Keys are not leaked in responses, but the spend surface is open. Recorded as a security_flag.

---

## fix-inspection-photos

**Purpose.** Data-repair: scan up to 100 inspections' `json_data`, and for each photo URL whose storage object no longer exists, heuristically re-point it to a matching/first image in the same folder; rewrite `inspections.json_data`. Supports `dryRun`.

**Auth model.**
- `verify_jwt = false` (`config.toml:58-59`). **Publicly callable with no JWT.**
- No in-handler auth check. Service-role client (`index.ts:9-13,202`).
- **Who can successfully call this?** Anyone on the internet who can reach the function URL.

**Inputs** (JSON body, parsed with `.catch(()=>({}))` `index.ts:205`): `inspectionId` (optional; if absent, processes ALL — `index.ts:206,217-219`), `dryRun` (default `false`, `index.ts:207`).

Returns `{ success, dryRun, summary:{inspectionsProcessed, inspectionsWithIssues, totalFixed, totalNotFound}, results[] }` (`index.ts:272-285`).

**Side effects.**
- DB **read**: `inspections.select('id, title, json_data, site_id, subsection_id').not('json_data','is',null).limit(100)` (`index.ts:212-221`), optionally `.eq('id', inspectionId)`.
- Storage **read**: per-URL `download` existence check (`index.ts:43-46`), folder `list(dirPath,{limit:100})` (`index.ts:74`).
- DB **write**: when not `dryRun` and a URL was remapped, `inspections.update({ json_data, updated_at })` (`index.ts:182-186`). In `dryRun`, a deep-cloned copy is mutated and no write occurs (`index.ts:246,252`).
- No emails, no non-Supabase external calls.
- Secrets used: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (`index.ts:10-11,203`).

**Callers.** No in-repo callers. Grep of `src/` / `functions/v1/` finds none. ⚠️ UNVERIFIED whether it is invoked manually (ops/maintenance tool).

**Security check.** `verify_jwt = false` + service-role + no auth/tenant scoping → **any unauthenticated caller can mutate `inspections.json_data` across all tenants** (POST with no/`{}` body processes up to 100 inspections and rewrites photo URLs via a fuzzy "first image in folder" heuristic at `index.ts:95-100`). This is a cross-tenant destructive data-mutation path reachable without authentication. Highest-risk of the five. Recorded as a security_flag.

---

## fix-tenant-images

**Purpose.** Data-repair: scan all inspections whose `json_data->tenants` is non-null, and for each tenant `breakerImage`/`ctRatioImage`/`meterImage` URL pointing at `inspection-photos`, if the exact file is missing, re-point it to the most-recent image in the same folder; rewrite `inspections.json_data`. No `dryRun`.

**Auth model.**
- `verify_jwt = true` (`config.toml:36-37`). Satisfied by the anon key.
- No in-handler auth check. Service-role client (`index.ts:31-33`).
- **Who can successfully call this?** Anyone with the anon key (public client config). No tenant scoping — processes ALL inspections.

**Inputs.** None read from the body (the handler never parses the request body). Method `OPTIONS` short-circuits for CORS (`index.ts:26-28`); any other method runs the full scan.

Returns `{ success, summary:{totalProcessed, fixed, notFound, alreadyValid}, details[] }` (`index.ts:164-179`).

**Side effects.**
- DB **read**: `inspections.select('id, json_data').not('json_data->tenants','is',null)` (`index.ts:41-44`) — **no `.limit()`**, processes every matching row.
- Storage **read**: per-field `list(folderPath, {limit:50, sortBy:created_at desc})` on bucket `inspection-photos` (`index.ts:81-83`); `getPublicUrl` of replacement (`index.ts:109-111`).
- DB **write**: when a tenant image was remapped, `inspections.update({ json_data })` (`index.ts:151-154`). **No `dryRun` mode** — always live.
- No emails, no non-Supabase external calls.
- Secrets used: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (`index.ts:31-32`).

**Callers.** No in-repo callers. Grep of `src/` / `functions/v1/` finds none. ⚠️ UNVERIFIED whether invoked manually (ops/maintenance). (It is the only one of the five present in `config.toml`'s earlier block, suggesting it predates the others.)

**Security check.** Like `fix-inspection-photos` but `verify_jwt = true` (anon-key gate) instead of fully open. Still: service-role, no in-handler authorization, no tenant scoping, **no `dryRun` and no `limit`** → any anon-key holder can trigger a forced cross-tenant rewrite of every tenant-bearing inspection's photo URLs in one unparametrized call. Cross-tenant destructive data mutation behind only the public anon key. Recorded as a security_flag.

---

## Cross-cutting notes

- **CORS**: all five set `Access-Control-Allow-Origin: '*'` and handle `OPTIONS` preflight (`compress-image:3-6,48-50`; `batch-compress-images:3-6,94-95`; `detect-schematic-regions:1-4,16-18`; `fix-inspection-photos:3-6,197-199`; `fix-tenant-images:3-6,26-28`).
- **No function invokes another function.**
- **Common failure mode of the repair functions**: the "first/most-recent image in folder" heuristics (`fix-inspection-photos:95-100`, `fix-tenant-images:106`) can silently re-point a photo URL to the *wrong* image, corrupting inspection data even when run by a legitimate operator. ⚠️ Behavioural risk, not an auth issue.
