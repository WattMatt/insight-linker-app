# QR / Lovable decommission runbook

Date: 2026-06-21
Decisions (Arno): **migrate `watsonmattheus.com` → Vercel** (becomes canonical, serves the live app); **keep `wm-compliance.lovable.app` as a redirect shim** (old codes survive, nothing deleted-and-broken).

## STATUS (2026-06-21)
- ✅ **Step 1 DONE** — watsonmattheus.com + www added to Vercel project `wm_compliance`.
- ✅ **Step 3 DONE** — DNS cut over at Squarespace: removed Lovable "Domain Connect to Entri" group (A @/www → 185.158.133.1 + lovable_verify TXT); added custom `A @ → 76.76.21.21` and `A www → 76.76.21.21`. Email (MX/SPF/DKIM/DMARC) + `_domainconnect` CNAME untouched. Authoritative NS + 8.8.8.8 resolve to 76.76.21.21; Vercel issued SSL; watsonmattheus.com serves the live Next app (server: Vercel, 200). Public-resolver cache (~1h) clears on its own.
- ✅ **Step 4 DONE** — `settings.qr_base_url` flipped → `https://watsonmattheus.com`; edge fn now 302s durable codes → watsonmattheus.com/public/subsections/<id> → 200.
- ⛔ **Step 2 NOT ACHIEVABLE → LEAVE AS-IS (resolved 2026-06-21).** The Lovable project that publishes `wm-compliance.lovable.app` (`7b7a829f-…`) migrated Vite→Next.js and *is* the live `insight-linker-app` (GitHub-tied). There's no editable Vite source, Lovable shows "Build unsuccessful" and a re-publish attempt failed ("build failed with exit status 1"), `*.lovable.app` can't be repointed, and reverting would endanger the live repo. The site serves a **frozen old Vite build** (commit `52fa533`) that still loads from the same Supabase, so lovable-subdomain codes still **work** (old UI, not broken). Decision: leave it. Only path to a current UI for those specific codes = **reprint**. (The shim snippet in Step 2 below is retained for reference only — it cannot be applied.)

## Why this is needed
A printed QR is a static image — its baked URL can't be changed after printing. Old printed codes encode one of:
- `watsonmattheus.com/public/subsections/<id>` (the branded domain — likely the bulk)
- `wm-compliance.lovable.app/public/subsections/<id>` (codes generated ~Jun 14–16)
- `insight-linker-app.vercel.app/...` or the durable edge-fn URL (post 2026-06-18 — already live ✅)

Today **both** `watsonmattheus.com` and `wm-compliance.lovable.app` serve the **stale Lovable Vite build** (Cloudflare/Lovable host `185.158.133.x`). Only `insight-linker-app.vercel.app` serves the live Next app. Goal: every old code reaches the live app, and the stale Lovable build stops being served.

## Current state (verified 2026-06-21)
- `settings.qr_base_url` = `https://insight-linker-app.vercel.app` (edge fn redirects here — LIVE, safe). **Do not change yet.**
- `watsonmattheus.com` + `www` added to Vercel project `wm_compliance` (pending DNS).
- DNS for watsonmattheus.com is managed at **Google Cloud DNS** (`ns-cloud-c1..c4.googledomains.com`); apex A currently → Lovable.

---

## Step 1 — (DONE) Attach domain to Vercel project
`vercel domains add watsonmattheus.com` + `www.watsonmattheus.com` → added to `wm_compliance`. Status: "not configured" until DNS changes (Step 3).

## Step 2 — (OPTIONAL, instant safety) Lovable redirect shim
In the **Lovable project** (separate platform), make it forward everything to the live app. Put this as the FIRST `<script>` in the Lovable app's `index.html` `<head>` (or replace the app with a one-file static page):

```html
<script>
  // Redirect any old QR scan that lands on Lovable to the live app, preserving the path.
  location.replace("https://insight-linker-app.vercel.app" + location.pathname + location.search + location.hash);
</script>
```

- Redirects to the **vercel.app** host (NOT watsonmattheus.com) on purpose — avoids a redirect loop while watsonmattheus.com still resolves to Lovable.
- Safe to deploy at any time. Once live, it instantly re-routes old codes on BOTH `wm-compliance.lovable.app` and (until DNS cutover) `watsonmattheus.com` to the live app.
- Verify: scan/open `https://wm-compliance.lovable.app/public/subsections/<any-real-id>` → should land on the live Next app.

## Step 3 — DNS cutover: watsonmattheus.com → Vercel (Arno, at Google Cloud DNS)
Change the web records (leave **MX / email** records untouched):

| Record | Host | Current (remove) | New (set) |
|---|---|---|---|
| A | `watsonmattheus.com` (apex) | `185.158.133.1` (Lovable) | `76.76.21.21` (Vercel) |
| A or CNAME | `www` | Lovable | A `76.76.21.21`  *or*  CNAME `cname.vercel-dns.com` |

- Alternative to A-records: delegate nameservers to `ns1.vercel-dns.com` / `ns2.vercel-dns.com` (only if you want Vercel to manage all DNS — affects email, so prefer the A-record route above).
- After propagation, Vercel auto-issues SSL. `watsonmattheus.com` then serves the **live Next app** directly.
- Verify: `curl -s https://watsonmattheus.com/ | grep -c /_next/` → should be > 0 (Next markers), `grep -c /assets/index` → 0 (Lovable gone). And `https://watsonmattheus.com/public/subsections/<id>` → 200.

## Step 4 — (Claude, AFTER Step 3 verified) point durable redirect at the brand domain (optional)
Flip `settings.qr_base_url` → `https://watsonmattheus.com` via the Supabase Mgmt API so the durable edge-fn redirect lands on the branded domain. Then re-verify: edge fn `?path=<id>` → 302 → `watsonmattheus.com/public/subsections/<id>` → 200.
(Leaving it at the vercel.app URL also works — this step is cosmetic/branding.)

## Step 5 — (optional cleanup)
- Regenerate stored QR PNG markers so the stored `subsections.qr_code_url` images encode the durable URL: in-app, per site → **QR tab → "Generate All"**. (Not required — every in-app render and report already produces the durable URL fresh; the stored PNG is only a "generated" marker.)
- Reprinting is NOT required (the Lovable shim keeps old codes working). Reprint only if you want to retire the shim later.

## End state
- `watsonmattheus.com` = canonical, serves live Vercel app.
- `wm-compliance.lovable.app` = thin redirect shim → live app (old codes survive).
- No surface serves the stale Lovable build.
- All in-app/rendered codes already encode the durable edge-fn URL (domain-portable forever).

## Residual / cannot-fix
- Codes baked with a dead Vercel **preview** origin or `localhost` (from the old `window.location.origin` fallback, pre-2026-06-16) point at hosts that no longer exist — unrecoverable without reprint. Believed to be few (generated only from non-prod sessions).
