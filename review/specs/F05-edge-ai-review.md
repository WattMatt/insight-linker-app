# F05 — edge-ai-review

- Unit id: F05
- Slug: edge-ai-review
- Spec mode: full
- Date: 2026-07-29
- File count: 1

## Unit header

**Unit purpose.** F05 is a single Supabase Edge Function (Deno) that accepts pasted code files over HTTP, forwards them to the Lovable AI Gateway (`ai.gateway.lovable.dev`) with a code-review system prompt tailored to this app's stack (React/TypeScript/Supabase, SANS 10142-1 electrical compliance), and returns the model's markdown review plus two values parsed out of it (a "Development Prompt" block and a numeric quality score). It is the only AI-calling function in the codebase's edge layer (review/inventory/12-supabase-functions.md:209, re-verified: the fetch at index.ts:128 is the only `ai.gateway.lovable.dev` reference under supabase/functions — `grep -rn "ai.gateway" supabase/functions` returns only offline-review/index.ts:128).

**Module-level observations.** Single-file unit; no shared module, no `_shared` imports, no tests. The function is registered in supabase/config.toml:24-25 with `verify_jwt = false` (unit D04), but performs its own JWT validation in-file (index.ts:15-30, comment labels this "G-SEC-12").

**External contract.** The rest of the app gets one invokable function named `offline-review`: POST a JSON body `{ codeFiles: {path, content}[], reviewType?, focusAreas? }` with a user JWT in the `Authorization` header, receive `{ review, developmentPrompt, qualityScore, reviewType, filesReviewed, timestamp }`. Sole in-repo caller is `src/views/OfflineReview.tsx:41` (unit V02) via `supabase.functions.invoke("offline-review", { body: { codeFiles } })`, which sends only `codeFiles` (a single synthetic file `offline-functionality.ts` built from a pasted textarea, OfflineReview.tsx:36-43).

## supabase/functions/offline-review/index.ts

- Purpose: Deno edge function that authenticates the caller, builds a review-type-specific prompt around submitted code files, calls the Lovable AI Gateway chat-completions endpoint with `google/gemini-3-flash-preview`, and returns the review text with an extracted development prompt and quality score.

- Public surface:
  - HTTP handler registered via `serve(async (req) => ...)` (index.ts:9); no exported symbols.
  - `OPTIONS` → 200 with CORS headers only (index.ts:10-12).
  - Any other method with a JSON body is treated identically (no method check); expected request:
    - Headers: `Authorization: Bearer <user JWT>` (index.ts:22-23).
    - Body: `{ codeFiles: Array<{ path: string; content: string }>, reviewType?: string = 'full', focusAreas?: string[] = [] }` (index.ts:32). Recognized `reviewType` values that change the prompt: `'security'`, `'performance'`, `'architecture'`, `'sans-compliance'` (index.ts:74-106); any other value (including the default `'full'`) leaves the base system prompt unmodified.
  - Success response (200, implicit status): `{ review: string, developmentPrompt: string | null, qualityScore: number | null, reviewType: string, filesReviewed: string[], timestamp: string (ISO) }` (index.ts:181-191).
  - Error responses: 401 `{error:'Unauthorized'}` (index.ts:26-30); 500 `{error:"AI Gateway not configured. Please ensure Lovable Cloud is enabled."}` when `LOVABLE_API_KEY` is unset (index.ts:35-40); 400 `{error:"No code files provided for review"}` (index.ts:42-47); 429 and 402 pass-throughs from the gateway with fixed messages (index.ts:149-160); 500 `{error: <message>}` from the catch-all (index.ts:193-198).

- Inputs & outputs:
  - Data in: request JSON (`codeFiles`, `reviewType`, `focusAreas`), `Authorization` header JWT.
  - Data out: JSON response as above; `qualityScore` is parsed from the review text by regex `/(?:Quality|Overall)\s*Score[:\s]*(\d+(?:\.\d+)?)\s*\/\s*10/i` (index.ts:174), `developmentPrompt` by regex `/```prompt\n([\s\S]*?)```/` (index.ts:169), each `null` when unmatched (index.ts:170, 173).
  - Env vars: `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` (both read with TypeScript non-null `!`, index.ts:19-20), `LOVABLE_API_KEY` (index.ts:34).
  - Stores touched: none — no database table, bucket, or storage read/write anywhere in the file. The Supabase client is used solely for `auth.getUser(jwt)` (index.ts:25).

- Dependencies:
  - uses -> `serve` from `https://deno.land/std@0.168.0/http/server.ts` (index.ts:1); `createClient` from `https://esm.sh/@supabase/supabase-js@2` (index.ts:2, unpinned within major 2). No imports from any other manifest unit.
  - used by <- V02 admin-ops-and-template-views: `src/views/OfflineReview.tsx:41` (`supabase.functions.invoke("offline-review", ...)`); registered by D04 db-platform-config: `supabase/config.toml:24-25` (`[functions.offline-review]` / `verify_jwt = false`). Grep also hits `src/views/OfflineReview 2.tsx:41`, an untracked duplicate file (listed as `??` in git status) outside the locked manifest. That admin view is mounted by A03 at `src/app/(admin)/offline-review/page.tsx` (review/inventory/11-src-app.md:98). No other consumers (`grep -rn "offline-review" src supabase`).

- Side effects:
  - Network call 1: `supabaseAuth.auth.getUser(__jwt)` against the project auth server, using a client constructed with the service-role key (index.ts:18-25).
  - Network call 2: `fetch("https://ai.gateway.lovable.dev/v1/chat/completions")` with `Authorization: Bearer ${LOVABLE_API_KEY}`, body `{ model: "google/gemini-3-flash-preview", messages: [system, user], temperature: 0.3, max_tokens: 8000 }` (index.ts:128-143). The user message embeds the full content of every submitted file inside ```typescript fences (index.ts:109-114) — i.e., submitted code is transmitted to a third-party AI service.
  - Logging: `console.log` of review start (file count + type, index.ts:49) and completion (score + dev-prompt presence, index.ts:179); `console.error` on gateway failure (status + response text, index.ts:147) and in the catch-all (index.ts:194).
  - No mutations, no events, no subscriptions.

- Error handling:
  - Missing/invalid JWT: if the header yields an empty token, a synthetic `missing token` error object is used instead of calling `getUser` (index.ts:25, with an `as any` cast); either an auth error or a null user → 401 JSON (index.ts:26-30). The anon key is a valid JWT that resolves to no user, so anon-key-only calls get 401 (comment, index.ts:15-17).
  - Invalid JSON body: `req.json()` (index.ts:32) throws → outer catch → 500 with the parser's message (index.ts:193-198).
  - `LOVABLE_API_KEY` unset: 500 with the Lovable-specific message (index.ts:35-40) — checked after auth, so unauthenticated callers still get 401 first.
  - `codeFiles` falsy or zero-length: 400 (index.ts:42-47). A truthy non-array without `.length === 0` (e.g. a number) passes the guard and throws at `.map` (index.ts:109) → outer catch → 500.
  - Gateway non-OK: response body read as text and logged (index.ts:146-147); status 429 → 429 with fixed retry message (index.ts:149-154); status 402 → 402 with fixed credits message (index.ts:155-160); any other status → `throw new Error(...)` (index.ts:162) → outer catch → 500 carrying `"AI Gateway error: <status>"`.
  - Missing model content: `data.choices?.[0]?.message?.content || ""` falls back to empty string (index.ts:166); the function still returns 200 with `review: ""`, `developmentPrompt: null`, `qualityScore: null`.
  - Catch-all: any thrown value → 500 with `error.message` if `Error`, else `"An unexpected error occurred"` (index.ts:193-198). All responses, success and failure, carry the CORS headers.

- Tests: none found. No test file references `offline-review` (`find src -name "*.test.*" | xargs grep -l "offline-review\|OfflineReview"` returns nothing), and the function directory contains only index.ts.

- Observed issues (factual):
  - `verify_jwt = false` in supabase/config.toml:24-25 while authentication is enforced in-file (index.ts:15-30); the platform-level JWT check is disabled and replaced by the G-SEC-12 pattern.
  - The auth client is constructed with the service-role key (index.ts:20) though it is only used to resolve a user JWT via `getUser`.
  - `Deno.env.get(...)!` non-null assertions (index.ts:19-20) are compile-time only; if `SUPABASE_URL` is absent at runtime, `createClient` throws and the outer catch returns 500 rather than a config-specific message (unlike the explicit `LOVABLE_API_KEY` check at index.ts:35-40).
  - Every request path except OPTIONS is handled identically regardless of HTTP method — no method filter, and the CORS preflight response names no `Access-Control-Allow-Methods` (index.ts:4-7, 10-12).
  - `codeFiles` element shape is asserted inline (`file: { path: string; content: string }`, index.ts:109, 187) but never validated; the emptiness guard (index.ts:42) is the only body validation.
  - `reviewType` is echoed back verbatim in the response (index.ts:186) whatever string the caller sent; unrecognized values silently behave as `'full'` (no matching branch at index.ts:74-106).
  - `focusAreas` is read with optional chaining (`focusAreas?.length`, index.ts:116) even though its destructuring default is `[]` (index.ts:32); an explicit `focusAreas: null` in the body would bypass the default and rely on the optional chain.
  - The model called is `google/gemini-3-flash-preview` (index.ts:135) while the sole calling view's UI copy says "AI-powered comprehensive code review using Gemini 3 Pro" (src/views/OfflineReview.tsx:72).
  - Cross-unit version spread (also recorded at review/inventory/12-supabase-functions.md:229): this function pins std 0.168.0 and floats supabase-js at `@2` (index.ts:1-2), differing from sibling functions.
  - The in-repo caller sends only `codeFiles` (src/views/OfflineReview.tsx:42), so the `security`/`performance`/`architecture`/`sans-compliance` prompt branches (index.ts:74-106) and `focusAreas` (index.ts:116-118) are reachable only by callers outside the repo.
  - The system prompt instructs the model to emit a copy-pasteable "Development Prompt" for "Lovable or another AI development platform" (index.ts:62-70) — Lovable-platform-era wording embedded in the deployed function.

- ASSUMED:
  - That the deployed edge function matches this file (deployment state not verified from the repo).
  - That `LOVABLE_API_KEY`, `SUPABASE_URL`, and `SUPABASE_SERVICE_ROLE_KEY` are set in the deployed function's environment (not verifiable from the repo).
  - That `google/gemini-3-flash-preview` is a model identifier accepted by the Lovable AI Gateway (external service behavior, not verifiable here).
  - That `supabase.functions.invoke` from the app attaches the signed-in user's JWT as the `Authorization` header (supabase-js documented behavior; not traced through the library source).
