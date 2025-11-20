-- Create function to get RLS policies for a specific role
CREATE OR REPLACE FUNCTION public.get_rls_policies_for_role(role_name text)
RETURNS TABLE(
  table_name text,
  policy_name text,
  command text,
  using_expression text,
  with_check_expression text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
  SELECT 
    tablename::text as table_name,
    policyname::text as policy_name,
    cmd::text as command,
    COALESCE(qual::text, '')::text as using_expression,
    COALESCE(with_check::text, '')::text as with_check_expression
  FROM pg_policies 
  WHERE schemaname = 'public'
  AND (
    policyname ILIKE '%' || role_name || '%'
    OR policyname ILIKE '%authenticated%'
    OR (role_name = 'Admin' AND policyname ILIKE '%admin%')
    OR (role_name = 'Client' AND policyname ILIKE '%client%')
    OR (role_name = 'Contractor' AND policyname ILIKE '%contractor%')
  )
  ORDER BY tablename, cmd, policyname;
$$;