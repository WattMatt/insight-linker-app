-- Reconcile migration history with production for site_assets RLS.
--
-- Migration 20260217085025 added a blanket anonymous SELECT policy
-- ("Public can view site assets", FOR SELECT TO anon USING (true)) on site_assets.
-- That policy was already removed in production by the 2026-06-11 tier-2 anon-read
-- lockdown applied directly via the SQL editor (see docs/security/, verified 2026-06-14),
-- but it still lives in the migration files — stale drift that a fresh apply / db reset
-- would reintroduce.
--
-- This migration drops it from the history so anonymous direct reads of site_assets can
-- never come back. The only supported public read path is the token-scoped, SECURITY
-- DEFINER RPC public.get_public_site_review(). Authenticated reads remain covered by the
-- existing role/authenticated policies (20260109105319, 20260216054714), so the app is
-- unaffected. Idempotent: safe to run even where the policy is already gone.

DROP POLICY IF EXISTS "Public can view site assets" ON public.site_assets;
