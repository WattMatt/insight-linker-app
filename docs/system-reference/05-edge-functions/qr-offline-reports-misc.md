# Edge Functions — qr-redirect, offline-review, api-reports, verify-fix

Ground-truth reference. Sources: `supabase/functions/<name>/index.ts`. `verify_jwt` settings from `supabase/config.toml`.

Reminder on the platform default: with `verify_jwt = false` a function is reachable by anyone (no JWT required). With `verify_jwt = true` the Supabase gateway requires a valid JWT **OR the project anon key** in the `Authorization`/`apikey` header — the anon key (shipped in every client bundle) satisfies `verify_jwt`, so `verify_jwt = true` alone is **not** a meaningful authentication barrier for a public web/mobile app. Real authentication must come from an in-handler check.

---

## qr-redirect

**Purpose** — Resolves a QR-code path (UUID, legacy double-slashed URL, or Firebase-style `clients/Client/Site/Subsection` name path) to a `subsections.id` and 302-redirects to the public subsection page on the custom domain.

**Auth model**
- `verify_jwt = false` — `supabase/config.toml:9-10` (`[functions.qr-redirect]`). Anon-reachable by design: QR codes are scanned by unauthenticated phone cameras.
- No in-handler auth check. There is no `getUser`, no role check, no token validation anywhere in `index.ts`.
- **Who can successfully call this:** anyone on the internet (no credentials of any kind required). This is intended — the endpoint only returns a 302 `Location` header, never row data.

**Inputs** (`index.ts`)
| Source | Field | Line |
|---|---|---|
| Query string | `path` (preferred) | `:17` |
| URL path | `/qr-redirect/<path>` (fallback, stripped of prefix) | `:17` |
| Method | `OPTIONS` short-circuits to CORS preflight | `:11-13` |

Path is then classified: UUID regex `/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i` (`:23`); legacy `//public/subsections/<uuid>` form (`:27-43`); else treated as a Firebase name path (`:96-163`).

**Side effects**
- Reads `subsections` only — three query shapes:
  - By `id`, `.select('id')` (`:70-74`).
  - By `firebase_id`, joined `sites(name, client_id, clients(name))` (`:103-107`).
  - Name fallback: `.ilike('name', '%<subsectionName>%')` then JS-side filter on joined site/client names (`:130-149`).
- **No writes.** No storage, no email, no other function invoked.
- External: 302 `Location` to hard-coded `appOrigin = 'https://watsonmattheus.com'` (`:32`, `:61`, `:85`, `:111`, `:153`).
- Supabase client uses **service-role key**: `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` (`:56-58`). Rationale comment at `:52-55`: the tier-2 lockdown removed anon SELECT on `subsections`, and this function never returns row data, only an id for the redirect. (Corresponds to recent commit `9233c5e fix(qr-redirect): use service-role key for subsection lookups`.)

**Callers** — No in-repo programmatic callers. `grep -rn "qr-redirect"` over `src` and `supabase/functions` returns only the function's own source. The endpoint is consumed externally by scanning printed QR codes (URL target, not an `invoke()`).

**Security check** — Endpoint runs under the **service-role key with no auth gate**, but every code path returns only an HTTP 302 (`Location` header) or a plain-text status string (`200`/`400`/`404`/`500`); no subsection row body is ever serialized into a response. The name-fallback path does a service-role `ilike` scan across **all** subsections (`:130-133`) — an unauthenticated caller can probe existence of subsections by name and learn a valid `subsection_id` (the redirect target leaks the UUID). Severity is low because `subsection_id` is already the public QR target and the `/public/subsections/<id>` page is itself anon-accessible, but it is an unauthenticated enumeration oracle over the full subsections table via a privileged key. Recorded as a security_flag (LOW).

---

## offline-review

**Purpose** — AI code-review helper: sends user-supplied code files to the Lovable AI Gateway and returns a structured review + extracted "development prompt" + parsed quality score.

**Auth model**
- `verify_jwt = false` — `supabase/config.toml:24-25` (`[functions.offline-review]`).
- No in-handler auth check whatsoever — the handler goes straight from CORS preflight to `await req.json()` (`:14`) to the gateway call. No `getUser`, no role check.
- **Who can successfully call this:** anyone on the internet. Despite the only in-repo caller living behind an admin route (see Callers), the function itself is fully anon-reachable with zero gating.

**Inputs** — JSON body (`:14`):
| Field | Type | Default | Line |
|---|---|---|---|
| `codeFiles` | `{ path: string; content: string }[]` | (required; 400 if empty) | `:14`, `:24-29` |
| `reviewType` | `'full' \| 'security' \| 'performance' \| 'architecture' \| 'sans-compliance'` | `'full'` | `:14`, `:56-88` |
| `focusAreas` | `string[]` | `[]` | `:14`, `:98-100` |

**Side effects**
- **No DB reads/writes, no storage, no email.**
- External API: `POST https://ai.gateway.lovable.dev/v1/chat/completions` (`:110`), model `google/gemini-3-flash-preview` (`:117`), `temperature 0.3`, `max_tokens 8000` (`:122-123`). Auth via `Authorization: Bearer ${LOVABLE_API_KEY}` (`:113`); secret env key **`LOVABLE_API_KEY`** (`:16`; 500 if unset, `:17-22`).
- Returns `{ review, developmentPrompt, qualityScore, reviewType, filesReviewed, timestamp }` (`:163-172`). Passes 429/402 gateway statuses through to the client (`:131-142`).

**Callers**
- `src/views/OfflineReview.tsx:41` — `supabase.functions.invoke("offline-review", { body: { codeFiles } })`. The caller component is routed at `src/app/(admin)/offline-review/page.tsx` (admin route group). Note the route guard protects only the UI, not the function.

**Security check** — `verify_jwt = false` with **no in-handler auth** means any anonymous internet caller can drive the function and burn `LOVABLE_API_KEY` quota/credits at will (uncapped `max_tokens 8000` per call). The secret itself is not exposed in the response, but the side effect (paid AI-gateway spend) is an unauthenticated, abusable action. No tenant scoping is relevant since no DB is touched. Recorded as a security_flag (MEDIUM — unauthenticated paid-API abuse / cost-DoS).

---

## api-reports

**Purpose** — Machine-to-machine REST API (OAuth client-credentials) that lists available report types and generates COC-validation / inspection / site-summary / subsection / floor-plan reports as base64 text "PDF" bodies.

**Auth model**
- `verify_jwt = false` — `supabase/config.toml:39-40` (`[functions.api-reports]`). JWT gating is intentionally off because this is a third-party API authenticated by **bearer access token**, not a Supabase session.
- In-handler auth: `validateToken()` (`:11-36`) requires `Authorization: Bearer <token>` (`:12-13`), looks up `api_access_tokens` joined to `api_clients` where `access_token = token AND expires_at > now()` and `api_clients.is_active` is truthy (`:18-27`); 401 on miss (`:50-55`). Then enforces scope `reports:read` (`:58-63`; 403 if absent). Bumps `last_used_at` (`:30-33`).
- **Who can successfully call this:** any holder of a non-expired access token belonging to an active `api_clients` row that carries the `reports:read` scope. Tokens are minted by the `oauth-token` function from client credentials. See `docs/system-reference/03-auth-and-access/token-systems.md` (Path 6) for the token lifecycle and `api_clients`/`api_access_tokens`/`api_request_logs` RLS.

**Inputs**
| Source | Field | Line |
|---|---|---|
| Header | `authorization: Bearer <access_token>` | `:49`, `:12-16` |
| URL path | `/api-reports/<path>` → routes `''` / `/available`, `/generate/<reportType>` | `:65-66`, `:80`, `:126-127` |
| Body (POST) or query (GET) | report params per type | `:128-130` |

Per-report required params (`:135-320`): `coc-validation` → `subsection_id`, `document_id`; `inspection` → `inspection_id`; `site-summary` → `site_id`; `subsection` → `subsection_id`; `floor-plan` → `floor_plan_id`.

**Side effects**
- Supabase client uses **service-role key**: `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` (`:44-46`).
- **Writes:** `api_access_tokens.last_used_at` update (`:30-33`); inserts an `api_request_logs` row (client_id, endpoint, method, status_code hard-coded `200`, request_params, ip from `x-forwarded-for`/`cf-connecting-ip`, user_agent) (`:69-77`).
- **Reads (service-role, bypasses RLS):** `subsections` (+joined `sites`/`clients`) (`:145-149`, `:223-226`, `:260-264`), `subsection_documents` (`:152-156`, `:266-269`), `coc_validations` (`:159-165`), `inspections` (+joined templates/sites/subsections) (`:187-191`, `:228-232`, `:271-274`), `inspection_signatures` (`:193-196`), `sites` (+`clients`) (`:217-221`), `subsection_floor_plans` (+joined subsections/sites) (`:296-300`), `floor_plan_pins` (`:302-305`).
- Report bodies are built by local `generate*PDFBase64()` helpers (`:350-517`) — plain text `btoa`-encoded, not real PDFs.
- No storage, no email, no other function invoked.

**Callers** — No programmatic in-repo callers. `src/views/APIClients.tsx:435` and `:451` are documentation strings (`GET .../functions/v1/api-reports/available`, `POST .../generate/site-summary`) rendered in the admin "API Clients" docs panel — not `invoke()` calls. The API is consumed by external third-party clients.

**Security check**
- Auth is enforced in-handler (bearer token + active client + `reports:read` scope), so the privileged report data is **not** reachable anonymously. Good.
- **No tenant scoping inside reports.** Every `api_clients` row with `reports:read` can fetch **any** `subsection_id` / `site_id` / `inspection_id` / `floor_plan_id` in the database — the queries filter only by the id supplied in the request (`:148`, `:155`, `:190`, `:218`, `:263`, `:299`), never by the caller's `client_id`. There is no per-client allow-list of clients/sites. A single issued API token is therefore a cross-tenant read of the entire compliance dataset (subsections, documents, COC validations, inspections + signatures, floor plans + pins). Whether that is acceptable depends on the API being single-customer; **⚠️ UNVERIFIED** that `api_clients` are scoped to a tenant — no scoping column or filter exists in code. Recorded as a security_flag (MEDIUM — missing tenant scoping / IDOR-by-design across all reports).
- Token comparison is a plain SQL equality (`.eq("access_token", token)`, `:21`) — not constant-time; mitigated by the 32+ byte random token. (Already noted in token-systems doc.)

---

## verify-fix

**Purpose** — AI QA helper: given an issue/suggestion plus a proposed fix description, asks the Lovable AI Gateway (forced `verify_fix` tool call) whether the fix resolves the report, returning a normalized pass/warning/fail report with confidence score.

**Auth model**
- `verify_jwt = true` — `supabase/config.toml:27-28` (`[functions.verify-fix]`). At the gateway this requires a valid JWT **or the project anon key**; since the anon key ships in the client bundle, this gate stops only completely credential-less callers, not arbitrary internet users with the public anon key.
- No in-handler auth check beyond what the gateway enforces — no `getUser`, no admin-role check. Both callers (admin Suggestions / IssueReports views) are admin-facing UI, but the function does not re-verify the caller's role.
- **Who can successfully call this:** any caller presenting a valid JWT or the public anon key. Effectively anyone who has the anon key (i.e. any user of the app, authenticated or not). No admin enforcement at the function layer.

**Inputs** — JSON body `VerificationRequest` (`:8-18`, parsed `:36`):
| Field | Type | Required | Line |
|---|---|---|---|
| `type` | `'issue' \| 'suggestion'` | yes | `:9` |
| `description` | string | yes | `:10` |
| `title` | string | optional | `:11` |
| `category` | string | yes | `:12` |
| `severity` | string | optional | `:13` |
| `priority` | string | optional | `:14` |
| `pageUrl` | string | yes | `:15` |
| `browserInfo` | any | optional | `:16` |
| `fixDescription` | string | yes (400 if empty after trim) | `:17`, `:43-52` |

Callers also pass `codeChanges` / `adminNotes` in the body (`Suggestions.tsx:255-256`) but the handler ignores them.

**Side effects**
- **No DB reads/writes, no storage, no email.**
- External API: `POST https://ai.gateway.lovable.dev/v1/chat/completions` (`:103`), model `google/gemini-2.5-flash` (`:110`), forced tool call `verify_fix` via `tool_choice` (`:115-165`). Auth via `Authorization: Bearer ${LOVABLE_API_KEY}` (`:106`); secret env key **`LOVABLE_API_KEY`** (`:37`; throws 500 if unset, `:39-41`).
- Parses the tool-call arguments into `VerificationReport`, clamps `confidenceScore` to 0–100 (`:202`), and reconciles `status` to the score band (`:205-211`). Passes 429/402 gateway statuses through (`:169-184`). Logs the full AI response to function logs (`:191`).

**Callers**
- `src/views/Suggestions.tsx:245` — `invoke('verify-fix', { body: { type:'suggestion', ... fixDescription } })`.
- `src/views/IssueReports.tsx:97` — `invoke('verify-fix', { body: { type:'issue', ... fixDescription: adminNotes } })`, auto-run debounced on admin-notes change.

**Security check** — No DB access, so no tenant/IDOR concern. `verify_jwt = true` admits anon-key holders, and there is no in-handler admin check, so any anon-key holder can drive paid `LOVABLE_API_KEY` spend (same cost-abuse class as offline-review, but behind the anon-key bar rather than fully open). Secret not exposed in response. Lower severity than offline-review because the anon key is at least a (weak) gate. Recorded as a security_flag (LOW — anon-key-reachable paid-API spend, no admin enforcement).

---

## Cross-cutting observations

- `LOVABLE_API_KEY` is shared by `offline-review` and `verify-fix` (and other AI functions). `offline-review` (`verify_jwt = false`, no in-handler auth) is the most exposed spender. Name only — value never printed.
- `qr-redirect` and `api-reports` both run under `SUPABASE_SERVICE_ROLE_KEY` (RLS-bypassing). `api-reports` gates access in-handler; `qr-redirect` does not but limits output to redirects/status strings.
- All four set permissive CORS `Access-Control-Allow-Origin: '*'` (`qr-redirect:5`, `offline-review:4`, `api-reports:5`, `verify-fix:4`).
