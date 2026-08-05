-- Phase 2 (Onboarding Standard): Admin UPDATE policy on public.profiles.
--
-- Problem: the only UPDATE policy on profiles is the own-row policy
-- ("Users can update their own profile", 20251014114352_...sql:81-83).
-- An Admin editing ANOTHER user's profile/status from the Users admin
-- dialog (src/views/Users.tsx — updateProfileMutation / updateStatusMutation)
-- matches 0 rows: PostgREST reports success with no rows written, so the UI
-- toasts success while nothing changes.
-- Documented: docs/system-reference/03-auth-and-access/user-lifecycle.md §5.2.
--
-- Admin SELECT already exists ("Admins can view all profiles",
-- 20251016064350_...sql:19-23) — verified; only UPDATE is missing.
--
-- Uses the SECURITY DEFINER helper public.has_role (20251014120311_...sql),
-- signature: has_role(_user_id uuid, _role app_role) — never a self-referential
-- policy on user_roles/profiles (STANDARD C4).
--
-- Idempotent: safe to re-run.

DROP POLICY IF EXISTS "Admins can update all profiles" ON public.profiles;

CREATE POLICY "Admins can update all profiles"
ON public.profiles
FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'Admin'::app_role))
WITH CHECK (public.has_role(auth.uid(), 'Admin'::app_role));
