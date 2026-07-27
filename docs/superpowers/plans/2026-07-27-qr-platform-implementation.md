# QR Platform Expansion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the approved QR platform spec (`docs/superpowers/plans/2026-07-27-qr-platform-design.md`): scan logging + analytics, fully-public live verdict on the QR landing page, verification QR for reports, scan-to-action for all roles, and print/trust upgrades.

**Architecture:** All public reads stay behind SECURITY DEFINER RPCs (curated whitelists); all anonymous writes go through edge functions with the service role (no anon RLS opens). Frontend work follows existing patterns (TanStack Query on contractor side, plain supabase-js elsewhere, shadcn UI). Migrations are repo files only — prod application happens at release via the Supabase Management API (NEVER `supabase db push`).

**Tech Stack:** Next.js (App Router shimmed to react-router idioms via `src/lib/navigation`), Supabase (Postgres RLS + edge functions/Deno), `qrcode` npm, pdfmake, Vitest.

**Branch:** `feat/qr-platform` (already cut from origin/main; spec committed).

**Conventions for every task:** ignore any file with `" 2"` in its name (stale recovery duplicates). Run tests with `npx vitest run <file>`. Commit after each task with the message given. Where a step modifies an existing file, the anchor (function/line) is given — read the file first, keep surrounding style.

---

### Task 1: Migration — `qr_scans` hardening

**Files:**
- Create: `supabase/migrations/20260727100000_qr_scans_hardening.sql`
- Modify: `src/integrations/supabase/types.ts` (qr_scans Row/Insert/Update — add `source`)

- [ ] **Step 1: Write the migration**

```sql
-- qr_scans hardening: the table has existed since 20251014140001 but nothing
-- ever wrote to it. Scan capture lands in the qr-redirect edge function
-- (service role), so the blanket anon INSERT policy is dropped — the only
-- client-side insert is the signed-in "landing" presence row.
-- PROD APPLY: Supabase Management API database/query (project oltzgidkjxwsukvkomof),
-- NOT supabase db push (prod schema is ahead of schema_migrations).

ALTER TABLE public.qr_scans
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'redirect';

DO $$ BEGIN
  ALTER TABLE public.qr_scans
    ADD CONSTRAINT qr_scans_source_check CHECK (source IN ('redirect', 'landing'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Analytics access paths: per-subsection recency and global time-window scans.
CREATE INDEX IF NOT EXISTS idx_qr_scans_subsection_scanned
  ON public.qr_scans (subsection_id, scanned_at DESC);
CREATE INDEX IF NOT EXISTS idx_qr_scans_scanned_at
  ON public.qr_scans (scanned_at DESC);

-- Close the open spam surface: anon INSERT WITH CHECK (true) is unused once
-- the redirect writes via service role.
DROP POLICY IF EXISTS "Anyone can insert scans" ON public.qr_scans;

CREATE POLICY "Signed-in landing logs own scan"
  ON public.qr_scans FOR INSERT TO authenticated
  WITH CHECK (scanned_by = auth.uid() AND source = 'landing');

-- Existing cleanup calls in SiteDetail/useSubsectionDetail were silent no-ops
-- (no DELETE policy). Make them real for Admins.
CREATE POLICY "Admins can delete scans"
  ON public.qr_scans FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'Admin'::app_role));
```

Before writing, confirm the `has_role` signature used elsewhere: `grep -rn "has_role(auth.uid()" supabase/migrations | tail -3` and match it exactly (cast included or not).

- [ ] **Step 2: Hand-extend generated types**

In `src/integrations/supabase/types.ts`, find the `qr_scans` block (~line 1761) and add `source: string` to `Row`, `source?: string` to `Insert` and `Update`.

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit` — Expected: no new errors.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260727100000_qr_scans_hardening.sql src/integrations/supabase/types.ts
git commit -m "feat(qr): qr_scans hardening migration — source column, indexes, RLS rework"
```

---

### Task 2: Migration — public verdict RPCs

**Files:**
- Create: `supabase/migrations/20260727101000_public_verdict_rpcs.sql`

- [ ] **Step 1: Write the migration**

The file `CREATE OR REPLACE`s `get_public_subsection` — reproduce the ENTIRE existing body from `supabase/migrations/20260610113000_public_rpcs_phase1.sql:22-50` verbatim, adding ONE key to the top-level `jsonb_build_object`, and adds the new site-register RPC:

```sql
-- Public verdict exposure (user decision 2026-07-27: fully public, neutral fail
-- copy lives in the frontend; raw failure reasons / issuer / SANS grid are
-- deliberately NOT exposed).
-- PROD APPLY: Management API only. GO-LIVE ORDER: after 20260725100000_coc_register_truth
-- is applied, so public verdicts reflect expiry-is-display-only semantics.

CREATE OR REPLACE FUNCTION public.get_public_subsection(p_subsection_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE
    WHEN NOT EXISTS (SELECT 1 FROM subsections WHERE id = p_subsection_id) THEN NULL
    ELSE jsonb_build_object(
      'settings', (SELECT jsonb_build_object('company_name', company_name, 'company_logo_url', company_logo_url)
                   FROM settings ORDER BY created_at LIMIT 1),
      'subsection', (SELECT jsonb_build_object('id', s.id, 'name', s.name, 'tenant_name', s.tenant_name)
                     FROM subsections s WHERE s.id = p_subsection_id),
      'site', (SELECT jsonb_build_object('id', si.id, 'name', si.name)
               FROM subsections s JOIN sites si ON si.id = s.site_id WHERE s.id = p_subsection_id),
      'categories', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'id', dc.id, 'name', dc.name, 'order_index', dc.order_index,
          'subsection_documents', COALESCE((
            SELECT jsonb_agg(jsonb_build_object('id', sd.id, 'file_name', sd.file_name,
                   'file_url', sd.file_url, 'uploaded_at', sd.uploaded_at) ORDER BY sd.uploaded_at)
            FROM subsection_documents sd WHERE sd.category_id = dc.id), '[]'::jsonb)
        ) ORDER BY dc.order_index)
        FROM document_categories dc WHERE dc.subsection_id = p_subsection_id), '[]'::jsonb),
      'snags', COALESCE((
        SELECT jsonb_agg(jsonb_build_object('id', sn.id, 'title', sn.title, 'description', sn.description,
               'status', sn.status, 'risk_level', sn.risk_level, 'created_at', sn.created_at) ORDER BY sn.created_at DESC)
        FROM snags sn WHERE sn.subsection_id = p_subsection_id), '[]'::jsonb),
      'verdict', (
        SELECT CASE WHEN s.is_coc_required THEN jsonb_build_object(
          'coc_required', s.is_coc_required,
          'status', s.coc_status,
          'cert_number', s.coc_number,
          'issue_date', s.coc_issue_date,
          'expiry_date', (SELECT MAX(sd.coc_expiry_date) FROM subsection_documents sd
                          WHERE sd.subsection_id = s.id AND sd.coc_expiry_date IS NOT NULL),
          -- reviewed_at removed in Task 2 quality review (zero writers)
        ) ELSE NULL END
        FROM subsections s WHERE s.id = p_subsection_id)
    )
  END;
$$;
REVOKE ALL ON FUNCTION public.get_public_subsection(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_subsection(uuid) TO anon, authenticated;

-- ── Site register summary (verification target for printed WM reports) ───────
CREATE OR REPLACE FUNCTION public.get_public_site_register(p_site_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE
    WHEN NOT EXISTS (SELECT 1 FROM sites WHERE id = p_site_id) THEN NULL
    ELSE jsonb_build_object(
      'settings', (SELECT jsonb_build_object('company_name', company_name, 'company_logo_url', company_logo_url)
                   FROM settings ORDER BY created_at LIMIT 1),
      'site', (SELECT jsonb_build_object('id', si.id, 'name', si.name) FROM sites si WHERE si.id = p_site_id),
      'counts', (
        SELECT jsonb_build_object(
          'required', COUNT(*) FILTER (WHERE s.is_coc_required),
          'pass',     COUNT(*) FILTER (WHERE s.is_coc_required AND s.coc_status IN ('Pass','Approved','Valid')),
          'fail',     COUNT(*) FILTER (WHERE s.is_coc_required AND s.coc_status IN ('Fail','Failed','Rejected')),
          'pending',  COUNT(*) FILTER (WHERE s.is_coc_required AND s.coc_status = 'Pending'),
          'missing',  COUNT(*) FILTER (WHERE s.is_coc_required AND (s.coc_status IS NULL OR s.coc_status = 'Missing'))
        ) FROM subsections s WHERE s.site_id = p_site_id),
      'last_import', (SELECT MAX(b.created_at) FROM coc_import_batches b WHERE b.site_id = p_site_id)
    )
  END;
$$;
REVOKE ALL ON FUNCTION public.get_public_site_register(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_site_register(uuid) TO anon, authenticated;
```

- [ ] **Step 2: Sanity-check status literals**

Run: `grep -n "Approved\|Valid\|Rejected" supabase/migrations/20260725100000_coc_register_truth.sql` (on the `feat/coc-register-truth` branch via `git show origin/feat/coc-register-truth:supabase/migrations/20260725100000_coc_register_truth.sql | grep -n "Approved"`) to confirm the synonym sets match the rollup's. Adjust the FILTER lists if the rollup uses different synonyms.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260727101000_public_verdict_rpcs.sql
git commit -m "feat(qr): public verdict + site register RPCs (curated, SECURITY DEFINER)"
```

---

### Task 3: Migration — kill-switch + snag channel

**Files:**
- Create: `supabase/migrations/20260727102000_qr_killswitch_snag_channel.sql`
- Modify: `src/integrations/supabase/types.ts` (subsections + snags Row/Insert/Update)

- [ ] **Step 1: Write the migration**

```sql
-- Per-subsection QR kill-switch (checked by qr-redirect) and provenance
-- marker for snags created via the public QR issue form.
-- PROD APPLY: Management API only.

ALTER TABLE public.subsections
  ADD COLUMN IF NOT EXISTS qr_disabled boolean NOT NULL DEFAULT false;

ALTER TABLE public.snags
  ADD COLUMN IF NOT EXISTS reported_channel text NOT NULL DEFAULT 'internal';

DO $$ BEGIN
  ALTER TABLE public.snags
    ADD CONSTRAINT snags_reported_channel_check CHECK (reported_channel IN ('internal', 'public_qr'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
```

- [ ] **Step 2: Hand-extend types** — add `qr_disabled: boolean` to subsections and `reported_channel: string` to snags (optional in Insert/Update).

- [ ] **Step 3: Typecheck** — `npx tsc --noEmit`, no new errors.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260727102000_qr_killswitch_snag_channel.sql src/integrations/supabase/types.ts
git commit -m "feat(qr): kill-switch column + snag reported_channel migration"
```

---

### Task 4: `qr-redirect` — scan logging, kill-switch, site branch, ORDER BY fix

**Files:**
- Modify: `supabase/functions/qr-redirect/index.ts`

- [ ] **Step 1: Fix the settings read (line ~35)** — add ordering so redirect origin matches the RPCs if multiple settings rows ever exist:

```ts
    const { data: settingsRow } = await supabase
      .from('settings')
      .select('qr_base_url')
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();
```

- [ ] **Step 2: Add helpers near the top of `serve` (after `supabase` client creation)**

```ts
    // Best-effort scan log — must NEVER block or fail the redirect.
    // IP is truncated to /24 (POPIA: no precise-IP retention).
    const logScan = async (subsectionId: string) => {
      try {
        const rawIp = (req.headers.get('x-forwarded-for') || '').split(',')[0].trim();
        const truncatedIp = /^\d+\.\d+\.\d+\.\d+$/.test(rawIp)
          ? rawIp.replace(/\.\d+$/, '.0')
          : null;
        await supabase.from('qr_scans').insert({
          subsection_id: subsectionId,
          user_agent: req.headers.get('user-agent') ?? null,
          ip_address: truncatedIp,
          source: 'redirect',
        });
      } catch (e) {
        console.error('scan log failed (non-blocking):', e);
      }
    };

    // Single exit point for subsection redirects: honors the kill-switch and logs.
    const redirectToSubsection = async (subsectionId: string, qrDisabled: boolean) => {
      if (qrDisabled) {
        return new Response(null, {
          status: 302,
          headers: { ...corsHeaders, 'Location': `${appOrigin}/public/qr-retired` },
        });
      }
      await logScan(subsectionId);
      return new Response(null, {
        status: 302,
        headers: { ...corsHeaders, 'Location': `${appOrigin}/public/subsections/${subsectionId}` },
      });
    };
```

- [ ] **Step 3: Add the site branch** (before the malformed-path branch): `?site=<uuid>` → verify `sites.select('id').eq('id', siteId).single()` → 302 to `${appOrigin}/public/sites/${siteId}/register`, 404 if absent. (No scan log — `qr_scans.subsection_id` is NOT NULL; site-scan logging is a documented non-goal for v1.)

```ts
    const siteParam = url.searchParams.get('site');
    if (siteParam && uuidRegex.test(siteParam)) {
      const { data: siteRow, error: siteErr } = await supabase
        .from('sites').select('id').eq('id', siteParam).single();
      if (siteErr || !siteRow) {
        return new Response('Site not found', { status: 404, headers: corsHeaders });
      }
      return new Response(null, {
        status: 302,
        headers: { ...corsHeaders, 'Location': `${appOrigin}/public/sites/${siteParam}/register` },
      });
    }
```

- [ ] **Step 4: Route every existing subsection-redirect branch through `redirectToSubsection`**

Four branches currently build the redirect inline; each must now select `qr_disabled` and delegate:
1. Malformed `/public/subsections/` branch (line ~45): after extracting the UUID, fetch `subsections.select('id, qr_disabled').eq('id', subsectionId).maybeSingle()`; if found → `return await redirectToSubsection(id, row.qr_disabled)`; if not found, fall through to 404.
2. UUID branch (line ~70): change the select to `'id, qr_disabled'` and `return await redirectToSubsection(subsectionId, data.qr_disabled)`.
3. firebase_id branch (line ~108): add `qr_disabled` to the select; delegate.
4. Name-match fallback (line ~128): add `qr_disabled` to the select; delegate.

- [ ] **Step 5: Review diff** — `git diff supabase/functions/qr-redirect/index.ts`; confirm: every 302 to a subsection goes through the helper, no `Location` header built inline for subsections anymore, all error paths unchanged.

- [ ] **Step 6: Commit**

```bash
git add supabase/functions/qr-redirect/index.ts
git commit -m "feat(qr): scan logging, kill-switch, site branch in qr-redirect"
```

---

### Task 5: New edge function — `report-issue`

**Files:**
- Create: `supabase/functions/report-issue/index.ts`
- Modify: `supabase/config.toml` (add `[functions.report-issue]` / `verify_jwt = false`, matching the existing entries' format)

- [ ] **Step 1: Write the function**

```ts
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Best-effort per-instance throttle (edge instances are ephemeral; this is a
// speed bump, not a guarantee — Turnstile is the real gate).
const recent = new Map<string, number[]>();
const throttled = (ip: string) => {
  const now = Date.now();
  const hits = (recent.get(ip) ?? []).filter((t) => now - t < 60_000);
  hits.push(now);
  recent.set(ip, hits);
  return hits.length > 5;
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405, headers: corsHeaders });
  }
  try {
    const ip = (req.headers.get('x-forwarded-for') || 'unknown').split(',')[0].trim();
    if (throttled(ip)) {
      return new Response(JSON.stringify({ error: 'Too many reports — please wait a minute.' }),
        { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const form = await req.formData();
    const token = String(form.get('turnstile_token') ?? '');
    const subsectionId = String(form.get('subsection_id') ?? '');
    const title = String(form.get('title') ?? '').trim().slice(0, 200);
    const description = String(form.get('description') ?? '').trim().slice(0, 2000);
    const photos = form.getAll('photos').filter((p): p is File => p instanceof File).slice(0, 3);

    if (!uuidRegex.test(subsectionId) || !title) {
      return new Response(JSON.stringify({ error: 'Missing subsection or title.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Server-side Turnstile verification — the whole point of the function.
    const secret = Deno.env.get('TURNSTILE_SECRET_KEY');
    if (!secret) throw new Error('TURNSTILE_SECRET_KEY not configured');
    const verify = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ secret, response: token, remoteip: ip }),
    }).then((r) => r.json());
    if (!verify.success) {
      return new Response(JSON.stringify({ error: 'Captcha verification failed.' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const { data: sub, error: subErr } = await supabase
      .from('subsections').select('id').eq('id', subsectionId).single();
    if (subErr || !sub) {
      return new Response(JSON.stringify({ error: 'Subsection not found.' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const photoPaths: string[] = [];
    for (const [i, photo] of photos.entries()) {
      if (!photo.type.startsWith('image/') || photo.size > 5 * 1024 * 1024) continue;
      const ext = photo.type === 'image/png' ? 'png' : 'jpg';
      const path = `public-reports/${subsectionId}/${Date.now()}-${i}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from('issue-screenshots')
        .upload(path, photo, { contentType: photo.type });
      if (!upErr) photoPaths.push(path);
    }

    const { error: insErr } = await supabase.from('snags').insert({
      subsection_id: subsectionId,
      title,
      description: description || null,
      status: 'Open',
      photos: photoPaths,
      reported_channel: 'public_qr',
    });
    if (insErr) throw insErr;

    return new Response(JSON.stringify({ ok: true }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (error) {
    console.error('report-issue error:', error);
    return new Response(JSON.stringify({ error: 'Could not submit the report. Please try again.' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
```

Before finalizing: check `snags` NOT NULL columns (`created_by` nullability, `photos` shape) via `grep -n "created_by\|photos" supabase/migrations/20251016084545_*.sql` and adjust the insert if `created_by` is NOT NULL (if so, the design requires making it nullable — add that `ALTER COLUMN ... DROP NOT NULL` to Task 3's migration).

- [ ] **Step 2: Register in config.toml** — add a `[functions.report-issue]` block with `verify_jwt = false` in the same format as the `qr-redirect` entry.

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/report-issue/index.ts supabase/config.toml
git commit -m "feat(qr): report-issue edge function — Turnstile-gated public snag intake"
```

---

### Task 6: Verdict presentation lib (TDD)

**Files:**
- Create: `src/lib/publicVerdict.ts`
- Test: `src/lib/publicVerdict.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { presentVerdict, type PublicVerdict } from "./publicVerdict";

const base: PublicVerdict = {
  coc_required: true, status: "Pass", cert_number: "C-123",
  issue_date: "2026-03-14", expiry_date: null,
};
// NOTE (review correction 2026-07-27): reviewed_at was removed from the public
// contract during Task 2's quality review — subsections.coc_reviewed_at has zero
// writers. The RPC does not return it and the card does not render it.
const today = new Date("2026-07-27T00:00:00Z");

describe("presentVerdict", () => {
  it("returns none when verdict is null (not required)", () => {
    expect(presentVerdict(null, today).kind).toBe("none");
  });
  it("Pass → pass with cert details", () => {
    const p = presentVerdict(base, today);
    expect(p.kind).toBe("pass");
    expect(p.headline).toBe("Compliant");
  });
  it("Pass expiring within 30 days → pass-expiring hint (display-only)", () => {
    const p = presentVerdict({ ...base, expiry_date: "2026-08-10" }, today);
    expect(p.kind).toBe("pass-expiring");
    expect(p.sub).toContain("re-verification");
  });
  it("Pass expiring beyond 30 days → plain pass", () => {
    expect(presentVerdict({ ...base, expiry_date: "2026-09-27" }, today).kind).toBe("pass");
  });
  it("Fail → neutral copy, no raw reasons", () => {
    const p = presentVerdict({ ...base, status: "Fail" }, today);
    expect(p.kind).toBe("fail");
    expect(p.headline).toBe("Not compliant");
    expect(p.sub).toContain("remedial work in progress");
  });
  it("Pending → pending", () => {
    expect(presentVerdict({ ...base, status: "Pending" }, today).kind).toBe("pending");
  });
  it("Missing → missing", () => {
    expect(presentVerdict({ ...base, status: "Missing" }, today).kind).toBe("missing");
  });
  it("N/A or not required → none", () => {
    expect(presentVerdict({ ...base, status: "N/A" }, today).kind).toBe("none");
    expect(presentVerdict({ ...base, coc_required: false }, today).kind).toBe("none");
  });
  it("status synonyms map (Approved→pass, Rejected→fail)", () => {
    expect(presentVerdict({ ...base, status: "Approved" }, today).kind).toBe("pass");
    expect(presentVerdict({ ...base, status: "Rejected" }, today).kind).toBe("fail");
  });
});
```

- [ ] **Step 2: Run to verify failure** — `npx vitest run src/lib/publicVerdict.test.ts` — Expected: FAIL (module not found).

- [ ] **Step 3: Implement**

```ts
// Presentation mapping for the public QR verdict card.
// Register-truth rule: expiry is DISPLAY-ONLY — it can add a hint to a Pass,
// never change the verdict. Raw failure reasons are never shown publicly.
export interface PublicVerdict {
  coc_required: boolean;
  status: string | null;
  cert_number: string | null;
  issue_date: string | null;
  expiry_date: string | null;
}

export type VerdictKind = "pass" | "pass-expiring" | "fail" | "pending" | "missing" | "none";

export interface VerdictPresentation {
  kind: VerdictKind;
  headline: string;
  sub: string | null;
}

const PASS = new Set(["Pass", "Approved", "Valid"]);
const FAIL = new Set(["Fail", "Failed", "Rejected"]);
const EXPIRY_HINT_DAYS = 30;

export function presentVerdict(v: PublicVerdict | null, today: Date): VerdictPresentation {
  if (!v || !v.coc_required || v.status === "N/A" || v.status == null) {
    return { kind: "none", headline: "", sub: null };
  }
  if (FAIL.has(v.status)) {
    return { kind: "fail", headline: "Not compliant", sub: "Certificate of Compliance — remedial work in progress" };
  }
  if (PASS.has(v.status)) {
    if (v.expiry_date) {
      const days = (new Date(v.expiry_date).getTime() - today.getTime()) / 86_400_000;
      if (days < EXPIRY_HINT_DAYS) {
        return { kind: "pass-expiring", headline: "Compliant", sub: "COC expiry date approaching — re-verification pending" };
      }
    }
    return { kind: "pass", headline: "Compliant", sub: null };
  }
  if (v.status === "Missing") {
    return { kind: "missing", headline: "No COC on record yet", sub: null };
  }
  return { kind: "pending", headline: "Verification in progress", sub: null };
}
```

- [ ] **Step 4: Run tests** — `npx vitest run src/lib/publicVerdict.test.ts` — Expected: PASS (9 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/publicVerdict.ts src/lib/publicVerdict.test.ts
git commit -m "feat(qr): verdict presentation mapping with expiry display-hint"
```

---

### Task 7: Verdict card on the public landing page

**Files:**
- Create: `src/components/public/PublicVerdictCard.tsx`
- Modify: `src/views/PublicSubsection.tsx` (state ~line 57, `fetchPublicData` ~line 105, render between site header and documents ~line 290)

- [ ] **Step 1: Create the card component**

```tsx
import { presentVerdict, type PublicVerdict } from "@/lib/publicVerdict";
import { CheckCircle2, XCircle, Clock, HelpCircle } from "lucide-react";

const STYLE: Record<string, { wrap: string; Icon: typeof CheckCircle2 }> = {
  "pass":          { wrap: "bg-green-50 border-green-200 text-green-800", Icon: CheckCircle2 },
  "pass-expiring": { wrap: "bg-green-50 border-amber-300 text-green-800", Icon: CheckCircle2 },
  "fail":          { wrap: "bg-red-50 border-red-200 text-red-800", Icon: XCircle },
  "pending":       { wrap: "bg-muted border-border text-muted-foreground", Icon: Clock },
  "missing":       { wrap: "bg-muted border-border text-muted-foreground", Icon: HelpCircle },
};

export const PublicVerdictCard = ({ verdict }: { verdict: PublicVerdict | null }) => {
  const p = presentVerdict(verdict, new Date());
  if (p.kind === "none") return null;
  const { wrap, Icon } = STYLE[p.kind];
  return (
    <div className={`rounded-lg border p-4 mb-6 ${wrap}`}>
      <div className="flex items-center gap-2 font-semibold text-lg">
        <Icon className="h-5 w-5" /> {p.headline}
      </div>
      {p.sub && <p className="text-sm mt-1 text-amber-700">{p.sub}</p>}
      <div className="text-sm mt-2 space-y-0.5">
        {verdict?.cert_number && <p>COC No. {verdict.cert_number}</p>}
        {verdict?.issue_date && <p>Issued {new Date(verdict.issue_date).toLocaleDateString()}</p>}
        {verdict?.expiry_date && <p>Expiry date {new Date(verdict.expiry_date).toLocaleDateString()}</p>}
      </div>
    </div>
  );
};
```

(Amber sub-line only renders for `pass-expiring`; the fail sub uses the same slot — adjust the sub `<p>` className to `text-sm mt-1 opacity-80` and it inherits the state color. Keep it one class, not conditional.)

- [ ] **Step 2: Wire into `PublicSubsection`** — add `const [verdict, setVerdict] = useState<PublicVerdict | null>(null);`, set `setVerdict(payload.verdict ?? null);` in `fetchPublicData`, render `<PublicVerdictCard verdict={verdict} />` directly above the documents mapping (`{documents.map(...)}`).

- [ ] **Step 3: Verify in dev** — `npm run dev`, open `http://localhost:3000/public/subsections/<any real id from local data>`; the RPC won't return `verdict` until the migration is live, so assert the page still renders cleanly with `verdict` undefined (card absent, no console errors).

- [ ] **Step 4: Commit**

```bash
git add src/components/public/PublicVerdictCard.tsx src/views/PublicSubsection.tsx
git commit -m "feat(qr): live verdict card on public QR landing page"
```

---

### Task 8: Rename QRAnalytics → QRCodeManager

**Files:**
- Rename: `src/components/site/QRAnalytics.tsx` → `src/components/site/QRCodeManager.tsx`
- Modify: `src/views/SiteDetail.tsx` (import line ~15, usage line ~841)

- [ ] **Step 1:** `git mv src/components/site/QRAnalytics.tsx src/components/site/QRCodeManager.tsx`; rename the component/interface (`QRAnalytics` → `QRCodeManager`, `QRAnalyticsProps` → `QRCodeManagerProps`) inside; update the import and JSX usage in `SiteDetail.tsx`. Leave the tab `value="qr-analytics"` string as-is (URL stability).
- [ ] **Step 2:** `npx tsc --noEmit` — no errors; `grep -rn "QRAnalytics" src --include="*.tsx" | grep -v " 2"` returns nothing.
- [ ] **Step 3: Commit** — `git commit -am "refactor(qr): rename QRAnalytics to QRCodeManager (it generates, not analyzes)"`

---

### Task 9: Site-scoped scan activity panel

**Files:**
- Create: `src/components/site/QRScanActivity.tsx`
- Modify: `src/views/SiteDetail.tsx` (render inside the existing `qr-analytics` TabsContent, above `<QRCodeManager …/>`)

- [ ] **Step 1: Create the panel** — props `{ subsections: Subsection[] }`. One query: `supabase.from('qr_scans').select('subsection_id, scanned_at').in('subsection_id', ids).gte('scanned_at', new Date(Date.now() - 30*86400000).toISOString()).order('scanned_at', { ascending: false })`, plus an all-time last-scan via a second select limited per the same ids ordered desc (client-side reduce to first-per-subsection). Render a Card titled "Scan activity — last 30 days": stat row (total scans, subsections never scanned), then a per-subsection table (name · 30d count · last scanned relative date) sorting never-scanned rows last with a destructive-muted badge "Never scanned".
- [ ] **Step 2: Mount it** in `SiteDetail.tsx` inside `TabsContent value="qr-analytics"` above the manager.
- [ ] **Step 3: Verify in dev** — tab renders; with an empty `qr_scans` table every row shows "Never scanned" and totals are 0 (this is correct pre-deploy reality).
- [ ] **Step 4: Commit** — `git add src/components/site/QRScanActivity.tsx src/views/SiteDetail.tsx && git commit -m "feat(qr): site scan-activity panel"`

---

### Task 10: Global QR activity view

**Files:**
- Create: `src/views/QRActivity.tsx`, `src/app/(admin)/qr-activity/page.tsx`
- Modify: `src/components/AppSidebar.tsx` (nav array lines 42-47)

- [ ] **Step 1: Page shell** — `src/app/(admin)/qr-activity/page.tsx` mirrors `qr-codes/page.tsx` exactly (3 lines, import view, render).
- [ ] **Step 2: View** — `QRActivity.tsx`: fetch `qr_scans.select('subsection_id, scanned_at, source, subsections(name, site_id, sites(name))')` for the last 30 days ordered desc (limit 500); render stat cards (scans 30d, active subsections, sites touched) + a recent-scans table (site · subsection · when · source). Follow `QRCodes.tsx` structure/styling.
- [ ] **Step 3: Sidebar** — add `{ title: "QR Activity", url: "/qr-activity", icon: Activity, adminOnly: false }` after the QR Codes entry (`Activity` from lucide-react).
- [ ] **Step 4: Verify in dev** — nav entry appears, page renders empty-state cleanly.
- [ ] **Step 5: Commit** — `git add src/views/QRActivity.tsx "src/app/(admin)/qr-activity/page.tsx" src/components/AppSidebar.tsx && git commit -m "feat(qr): global QR activity view"`

---

### Task 11: Dashboard scan tile

**Files:**
- Modify: `src/views/Dashboard.tsx` (`fetchTriageData` ~line 166: add one head-count query to the `Promise.all`; `DashboardStats` interface ~line 15; stats grid render)

- [ ] **Step 1:** Add `supabase.from('qr_scans').select('*', { count: 'exact', head: true }).gte('scanned_at', new Date(Date.now() - 30*86400000).toISOString())` to the `Promise.all`; add `qrScans30d: number` to `DashboardStats`; render one more stat `<Card>` ("QR scans · 30d", `QrCode` icon) matching the existing tiles.
- [ ] **Step 2:** Dev check: dashboard renders, tile shows 0.
- [ ] **Step 3: Commit** — `git commit -am "feat(qr): dashboard scan-count tile"`

---

### Task 12: `returnTo` login bridge (TDD on the allow-list)

**Files:**
- Create: `src/lib/loginNext.ts`, `src/lib/loginNext.test.ts`
- Modify: `src/components/ProtectedRoute.tsx`, `src/components/ContractorProtectedRoute.tsx` (line 18), `src/components/ClientProtectedRoute.tsx` — the `<Navigate to="/auth/login" …>` lines; `src/views/auth/Login.tsx` (success paths lines ~106 and ~174, and the already-signed-in effect line ~67)

- [ ] **Step 1: Failing test**

```ts
import { describe, it, expect } from "vitest";
import { safeNext } from "./loginNext";

describe("safeNext", () => {
  it("allows allow-listed relative paths", () => {
    expect(safeNext("/contractor/subsections/abc?tab=upload")).toBe("/contractor/subsections/abc?tab=upload");
    expect(safeNext("/dashboard")).toBe("/dashboard");
    expect(safeNext("/sites/1/subsections/2?tab=coc-metering")).toBe("/sites/1/subsections/2?tab=coc-metering");
  });
  it("rejects absolute/protocol-relative/external", () => {
    expect(safeNext("https://evil.example")).toBeNull();
    expect(safeNext("//evil.example")).toBeNull();
    expect(safeNext("javascript:alert(1)")).toBeNull();
  });
  it("rejects non-allow-listed prefixes and empties", () => {
    expect(safeNext("/settings")).toBeNull();
    expect(safeNext(null)).toBeNull();
    expect(safeNext("")).toBeNull();
  });
});
```

- [ ] **Step 2:** `npx vitest run src/lib/loginNext.test.ts` — FAIL (module not found).
- [ ] **Step 3: Implement**

```ts
// Post-login intended-destination guard. Only same-origin relative paths with
// an allow-listed prefix survive the login round-trip; everything else falls
// back to the role redirect. Prevents open-redirect via ?next=.
const ALLOWED_PREFIXES = ["/contractor", "/clients", "/client-portal", "/dashboard", "/sites", "/qr-codes", "/qr-activity"];

export function safeNext(raw: string | null | undefined): string | null {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//")) return null;
  const ok = ALLOWED_PREFIXES.some(
    (p) => raw === p || raw.startsWith(`${p}/`) || raw.startsWith(`${p}?`),
  );
  return ok ? raw : null;
}
```

- [ ] **Step 4:** Tests PASS.
- [ ] **Step 5: Guards carry the destination** — in each of the three guards change the unauthenticated redirect to:

```tsx
if (!session) {
  const next = encodeURIComponent(location.pathname + (location.search || ""));
  return <Navigate to={`/auth/login?next=${next}`} replace />;
}
```

(`ContractorProtectedRoute` already has `location`; add `useLocation()` to the other two if absent.)

- [ ] **Step 6: Login honors `next`** — in `Login.tsx`, read `const [searchParams] = useSearchParams();` (already imported via navigation shim; add if absent) and at each success point replace `await redirectByRole(...)` with:

```ts
const next = safeNext(searchParams.get("next"));
if (next) { navigate(next); } else { await redirectByRole(data.user!.id); }
```

Role safety: an honored `next` still passes through the target route's own guard, which bounces wrong roles — no role check needed here. Apply to both the submit path(s) and the already-signed-in effect.

- [ ] **Step 7: Dev check** — visit `/contractor/subsections/x` signed out → login URL carries `?next=`; log in as any user → lands on target (or its guard's bounce).
- [ ] **Step 8: Commit** — `git add -A && git commit -m "feat(auth): returnTo bridge with allow-listed next param"`

---

### Task 13: Session-aware role banner on the landing page

**Files:**
- Modify: `src/views/PublicSubsection.tsx`

- [ ] **Step 1:** Import `useAuthSession` + `useUserRole`; when `session` exists render a slim banner Card under the verdict card:
  - role `Contractor` → button "Upload COC for this subsection" → `navigate(\`/contractor/subsections/${subsectionId}?tab=upload\`)`
  - role `Admin` or `null`-role staff (`userRole !== 'Client' && userRole !== 'Contractor'`) → "Open in admin" → `navigate(\`/sites/${siteData?.id ? '' : ''}\`)` — use the site-scoped admin route: `` `/sites/${payload.site.id}/subsections/${subsectionId}?tab=coc-metering` `` (store `site.id` from the RPC payload; it is already returned).
  - role `Client` → "Open client portal" → `/client-portal`.
  Anonymous render is untouched (no loading gate on the banner — render nothing while the role query is in flight).
- [ ] **Step 2:** When session exists, log presence once per mount: `supabase.from('qr_scans').insert({ subsection_id: subsectionId, scanned_by: session.user.id, source: 'landing' })` inside a `useEffect` guarded by a `useRef` flag, `.then()` with error swallowed to console. (RLS from Task 1 permits exactly this shape.)
- [ ] **Step 3:** Dev check signed-out (unchanged page) and signed-in as admin (banner appears; insert fails gracefully pre-migration — console only).
- [ ] **Step 4: Commit** — `git commit -am "feat(qr): role-aware banner + presence logging on QR landing"`

---

### Task 14: Contractor COC upload panel

**Files:**
- Modify: `src/views/ContractorSubsectionDetail.tsx`

- [ ] **Step 1:** Add an "Upload COC" Card (rendered when `(subsection as any)?.is_coc_required`): a file `<Input type="file" multiple accept=".pdf,.html,.doc,.docx,.jpg,.jpeg,.png">` + submit Button. On submit, for each file call the existing pipe:

```ts
import { poolRouteFile } from "@/lib/coc/poolUpload";
// in handler:
const res = await poolRouteFile((subsection as any).site_id, file);
// res.assignedSubsectionId → toast.success(`${file.name}: assigned`)
// res.reason → toast.info(`${file.name}: ${res.reason}`)
```

Match the exact return shape by reading `src/lib/coc/poolUpload.ts` first; mirror the result copy used in `src/views/subsection-detail/CocMeteringTab.tsx:145` area. After uploads, `queryClient.invalidateQueries({ queryKey: ["contractor-subsection", subsectionId] })` so the status badge refreshes.
- [ ] **Step 2:** Honor the deep link: `searchParams.get("tab") === "upload"` → `ref.scrollIntoView()` on mount.
- [ ] **Step 3:** Dev check via admin preview mode (`?preview=<siteId>`): card renders, file select works (actual pool insert requires authenticated staff/contractor RLS on `coc_file_pool` — verify a real upload succeeds with a contractor test account if available; otherwise verify request fires and RLS response is surfaced in the toast).
- [ ] **Step 4: Commit** — `git commit -am "feat(coc): contractor COC upload panel via pool ingestion"`

---

### Task 15: Public issue-report form

**Files:**
- Create: `src/components/public/PublicIssueReportDialog.tsx`
- Modify: `src/views/PublicSubsection.tsx` (button in header area + under a Fail verdict card)

- [ ] **Step 1: Dialog component** — shadcn `Dialog` with fields title (Input, required), description (Textarea), up to 3 photos (`Input type="file" accept="image/*" multiple`), and `<CaptchaTurnstile>` (read `src/components/CaptchaTurnstile.tsx` for its props — reuse exactly as `Login.tsx` does, including the site-key env var). Submit builds `FormData` (`turnstile_token`, `subsection_id`, `title`, `description`, `photos`) and POSTs to `` `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/report-issue` `` with no auth header. Success → toast "Report submitted — thank you." + close; error → toast the server's `error` string.
- [ ] **Step 2: Wire in** — a "Report an issue" outline Button on the landing page (always available in the page footer area; ALSO rendered inside the verdict card region when `presentVerdict(...).kind === 'fail'` per the spec's Fail state).
- [ ] **Step 3:** Dev check: dialog opens, validation blocks empty title, Turnstile renders with test key, submit fires POST (may 500 pre-deploy — acceptable, verify the request shape in the network tab).
- [ ] **Step 4: Commit** — `git add -A && git commit -m "feat(qr): public issue-report dialog on QR landing"`

---

### Task 16: Public site register page

**Files:**
- Create: `src/views/PublicSiteRegister.tsx`, `src/app/public/sites/[siteId]/register/page.tsx`, `src/app/public/qr-retired/page.tsx`

- [ ] **Step 1: Route shells** — both `page.tsx` files mirror `src/app/public/subsections/[subsectionId]/page.tsx` (import view / render). `qr-retired` renders a tiny inline component: centered Card, "This QR code has been retired", "Contact Watson Mattheus for the current compliance status." (no data fetch).
- [ ] **Step 2: View** — `PublicSiteRegister.tsx` mirrors `PublicSubsection.tsx` structure: `supabase.rpc('get_public_site_register', { p_site_id: siteId })`; render branding header, site name, four count tiles (Compliant / Not compliant / Pending / No COC yet) + "COC-required subsections: N" and "Register last updated: <date>" footer. Not-found → the same fallback pattern PublicSubsection uses.
- [ ] **Step 3:** Dev check: page renders (RPC missing locally → clean error state, no crash).
- [ ] **Step 4: Commit** — `git add -A && git commit -m "feat(qr): public site register page + qr-retired page"`

---

### Task 17: Site redirect helper + report cover QRs

**Files:**
- Modify: `src/lib/qrBaseUrl.ts`; `src/components/SiteSummaryReport.tsx` (cover options block ~lines 585-597); `src/lib/siteCoc/siteCocReport.ts` (`buildSiteCocReportDocDef` line ~132) and its two callers (`src/views/site-coc/ReportSubTab.tsx:48`, `src/components/client-portal/ClientCocView.tsx:97`)

- [ ] **Step 1: Helper** — append to `qrBaseUrl.ts`:

```ts
/** Stable redirect for SITE-level QR codes (report covers) — same indirection
 *  as qrRedirectUrl: the edge function resolves the live domain at scan time. */
export function qrSiteRedirectUrl(siteId: string): string {
  const fnHost = (process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/$/, "");
  return `${fnHost}/functions/v1/qr-redirect?site=${siteId}`;
}
```

- [ ] **Step 2: Site Summary cover** — in `SiteSummaryReport.tsx`, before building cover options: `const coverQr = await QRCode.toDataURL(qrSiteRedirectUrl(site.id), { width: 300, margin: 1, errorCorrectionLevel: 'H' });` (import `QRCode` from `qrcode` — it is already a dependency; check how the file currently imports QR utilities and follow suit) and pass `qrCodeDataUrl: coverQr` into the existing cover options object (the `createCoverPage` slot already renders it with "Scan for digital access" — `src/lib/pdfMakeUtils.ts:278-292`).
- [ ] **Step 3: Site COC Report** — extend `buildSiteCocReportDocDef(opts)` with optional `qrCodeDataUrl?: string`; when present, add to the header content array: `{ image: qrCodeDataUrl, width: 70, alignment: 'right', margin: [0, 0, 0, 8] }` alongside the existing title block (read the docDef structure first and place it in the title row as a column). Update both callers to generate the data URL exactly as Step 2 and pass it.
- [ ] **Step 4:** Dev check: generate a Site Summary PDF and a Site COC report from the UI; both show a cover/header QR; scanning target is the `?site=` URL (decode visually with a phone or paste the data URL into a decoder).
- [ ] **Step 5: Commit** — `git add -A && git commit -m "feat(qr): site-level verification QR on report covers"`

---

### Task 18: Vector QR sticker lib (TDD)

**Files:**
- Create: `src/lib/qrSvg.ts`, `src/lib/qrSvg.test.ts`

- [ ] **Step 1: Failing test**

```ts
import { describe, it, expect } from "vitest";
import { buildLabeledQrSvg } from "./qrSvg";

describe("buildLabeledQrSvg", () => {
  it("produces a self-contained svg with real text labels", async () => {
    const svg = await buildLabeledQrSvg({
      url: "https://x.test/functions/v1/qr-redirect?path=abc",
      siteName: "The Plaza",
      subsectionName: "DB 2A Ground Floor",
    });
    expect(svg).toContain("<svg");
    expect(svg).toContain("THE PLAZA");           // uppercase site label as TEXT
    expect(svg).toContain("DB 2A Ground Floor");  // subsection label as TEXT
    expect(svg).toContain("</svg>");
  });
});
```

- [ ] **Step 2:** Run — FAIL (module not found).
- [ ] **Step 3: Implement**

```ts
import QRCode from "qrcode";

interface LabeledQrOptions {
  url: string;
  siteName: string;
  subsectionName: string;
}

// Vector sticker: QR + border + REAL text labels (labels were previously
// rasterized into the PNG, which is why renames left stale artifacts).
// Layout mirrors qrCodeGenerator.ts: 500 QR, 40 padding, 140 text band.
export async function buildLabeledQrSvg({ url, siteName, subsectionName }: LabeledQrOptions): Promise<string> {
  const qrInner = await QRCode.toString(url, { type: "svg", errorCorrectionLevel: "H", margin: 1 });
  // Strip the outer <svg> wrapper, keep its path content and viewBox scale.
  const inner = qrInner.replace(/^[\s\S]*?<svg[^>]*>/, "").replace(/<\/svg>\s*$/, "");
  const qrViewBox = /viewBox="([^"]+)"/.exec(qrInner)?.[1] ?? "0 0 37 37";
  const W = 580, QR = 500, PAD = 40, TEXT_Y = PAD + QR + 48;
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="720" viewBox="0 0 ${W} 720">
  <rect width="${W}" height="720" fill="white"/>
  <rect x="1.5" y="1.5" width="${W - 3}" height="717" fill="none" stroke="black" stroke-width="3"/>
  <svg x="${PAD}" y="${PAD}" width="${QR}" height="${QR}" viewBox="${qrViewBox}">${inner}</svg>
  <text x="${W / 2}" y="${TEXT_Y}" text-anchor="middle" font-family="Arial, sans-serif" font-size="36" font-weight="bold">${esc(siteName.toUpperCase())}</text>
  <text x="${W / 2}" y="${TEXT_Y + 42}" text-anchor="middle" font-family="Arial, sans-serif" font-size="30">${esc(subsectionName)}</text>
</svg>`;
}
```

- [ ] **Step 4:** Tests PASS.
- [ ] **Step 5: Commit** — `git add src/lib/qrSvg.ts src/lib/qrSvg.test.ts && git commit -m "feat(qr): vector labeled QR sticker builder"`

---

### Task 19: Sticker-sheet PDF + download action

**Files:**
- Create: `src/lib/qrStickerSheet.ts`
- Modify: `src/components/site/QRCodeManager.tsx` (add a third button)

- [ ] **Step 1: Sheet builder**

```ts
import { buildLabeledQrSvg } from "./qrSvg";
import { qrRedirectUrl } from "./qrBaseUrl";
import { generatePdfBlob } from "./pdfMakeUtils";

interface StickerSubsection { id: string; name: string }

// A4 3×3 grid of vector stickers with cut margins. pdfmake renders `svg`
// nodes natively, so print output is crisp at any size.
export async function buildStickerSheetBlob(siteName: string, subsections: StickerSubsection[]): Promise<Blob> {
  const cells = await Promise.all(subsections.map(async (s) => ({
    svg: await buildLabeledQrSvg({ url: qrRedirectUrl(s.id), siteName, subsectionName: s.name }),
    width: 165,
  })));
  const rows: any[] = [];
  for (let i = 0; i < cells.length; i += 3) {
    rows.push({ columns: cells.slice(i, i + 3).map((c) => ({ svg: c.svg, width: c.width, margin: [0, 0, 8, 12] })), columnGap: 8 });
  }
  const docDefinition: any = {
    pageSize: "A4",
    pageMargins: [24, 28, 24, 28],
    content: [{ text: `${siteName} — QR sticker sheet`, style: { bold: true, fontSize: 12 }, margin: [0, 0, 0, 10] }, ...rows],
  };
  return generatePdfBlob(docDefinition);
}
```

Check `generatePdfBlob`'s actual signature in `src/lib/pdfMakeUtils.ts` / `pdfMakeConfig.ts` first (it may take `(docDefinition, styles)`) and match it; `DEFAULT_STYLES` is already imported by this component's neighbor.
- [ ] **Step 2: Button** — in `QRCodeManager.tsx` add "Print sticker sheet" beside Download-all: builds the blob for all subsections and triggers a download `${site.name}-Sticker-Sheet.pdf` (same anchor-click pattern already in the file).
- [ ] **Step 3:** Dev check: button produces a PDF; stickers are vector (zoom in — no pixelation) with correct labels.
- [ ] **Step 4: Commit** — `git add -A && git commit -m "feat(qr): vector sticker-sheet PDF export"`

---

### Task 20: Kill-switch admin toggle

**Files:**
- Modify: `src/views/QRCodes.tsx` (row actions + `QRCodeEntry` interface line ~14)

- [ ] **Step 1:** Add `qr_disabled` to the select in `fetchQRCodes` (line ~68) and to `QRCodeEntry`. Render a shadcn `Switch` per row labeled "Active"; toggling runs `supabase.from('subsections').update({ qr_disabled: !current }).eq('id', qr.id)` then refetches; disabled rows get a muted "Retired" badge.
- [ ] **Step 2:** Dev check: toggle persists across refresh (staff RLS on subsections permits the update).
- [ ] **Step 3: Commit** — `git commit -am "feat(qr): per-subsection QR kill-switch toggle"`

---

### Task 21: Regenerate QR label on rename

**Files:**
- Modify: `src/views/subsection-detail/useSubsectionDetail.ts` (`handleSaveEdit` ~lines 477-503)

- [ ] **Step 1:** In `handleSaveEdit`, capture the pre-save name; after a successful update where the name changed, fire-and-forget exactly like the create path (line ~457):

```ts
if (editName !== previousName && siteData?.name) {
  void generateAndUploadQRCode({
    subsectionId,
    siteName: siteData.name,
    subsectionName: editName,
    logoUrl: companyLogo || undefined,
  });
}
```

Read the surrounding create-path invocation first and reuse its exact variable names for site name / logo.
- [ ] **Step 2:** Dev check: rename a subsection → storage object `qr-codes/<id>.png` gets a new `updated_at` (or verify the upsert request in the network tab).
- [ ] **Step 3: Commit** — `git commit -am "fix(qr): regenerate QR label when subsection is renamed"`

---

### Task 22: Full verification, PR, release runbook

**Files:**
- Create: `docs/superpowers/plans/2026-07-27-qr-platform-release-runbook.md`

- [ ] **Step 1: Full test + lint + build** — `npx vitest run` (all green), `npm run lint` (no new errors), `npm run build` (succeeds).
- [ ] **Step 2: Write the release runbook** — production steps in order, each as a checkbox:
  1. Land PR #59 (apply `20260725100000_coc_register_truth.sql` via Management API `database/query`, project `oltzgidkjxwsukvkomof`; merge; run its post-deploy E2E).
  2. Apply the three QR migrations via Management API in timestamp order (paste each file's SQL).
  3. Set edge-function secret: `supabase secrets set TURNSTILE_SECRET_KEY=<value>` (user supplies value; NEVER commit it).
  4. Merge `feat/qr-platform` PR → Vercel auto-deploys.
  5. `supabase functions deploy qr-redirect` and `supabase functions deploy report-issue`.
  6. Live E2E checklist: curl the redirect (`curl -sI "$SUPABASE_URL/functions/v1/qr-redirect?path=<known-id>"` → 302 + Location), confirm a `qr_scans` row appeared, load the public landing for a Pass and a Fail subsection, toggle a kill-switch and re-curl (302 → `/public/qr-retired`), submit a Turnstile-gated public issue and see the snag with `reported_channel='public_qr'`, print a sticker sheet, confirm dashboard/site/global activity views populate.
- [ ] **Step 3: Push + PR**

```bash
git push -u origin feat/qr-platform
gh pr create --title "QR platform: scan analytics, public verdicts, scan-to-action, print/trust" --body "<summary per repo PR style; link the design spec; note release runbook + sequencing after #59>

🤖 Generated with [Claude Code](https://claude.com/claude-code)"
```

- [ ] **Step 4: Commit runbook** (before push) — `git add docs/superpowers/plans/2026-07-27-qr-platform-release-runbook.md && git commit -m "docs(qr): production release runbook"`

---

## Self-review notes (completed at authoring)

- **Spec coverage:** W1→Tasks 1,4,9,10,11,13(presence); W2→Tasks 2,6,7; W3→Tasks 2(site RPC),4(site branch),16,17; W4→Tasks 5,12,13,14,15; W5→Tasks 18,19,20,21 (+3 kill-switch schema); bug fixes→Tasks 1(RLS/indexes/delete),4(ORDER BY),21(rename). HMAC: non-goal per spec.
- **Type consistency:** `presentVerdict`/`PublicVerdict` (T6) match usage in T7/T15; `buildLabeledQrSvg` (T18) matches T19; `safeNext` (T12) matches guard/Login usage.
- **Known adapt-points for the executor** (verify-in-file, not placeholders): `has_role` cast form (T1), rollup synonym sets (T2), `snags.created_by` nullability (T5), `poolRouteFile` return shape (T14), `CaptchaTurnstile` props (T15), `generatePdfBlob` signature (T19), create-path variable names (T21).
