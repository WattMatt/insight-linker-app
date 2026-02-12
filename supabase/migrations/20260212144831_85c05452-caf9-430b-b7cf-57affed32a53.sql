CREATE EXTENSION IF NOT EXISTS pgcrypto SCHEMA extensions;

CREATE OR REPLACE FUNCTION public.temp_reset_password()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public', 'extensions'
AS $$
DECLARE
  target_user_id uuid;
BEGIN
  SELECT id INTO target_user_id FROM auth.users WHERE email = 'marries.liesie@gmail.com';
  
  IF target_user_id IS NULL THEN
    RAISE EXCEPTION 'User not found';
  END IF;
  
  UPDATE auth.users 
  SET encrypted_password = extensions.crypt('Marries@001', extensions.gen_salt('bf'))
  WHERE id = target_user_id;
END;
$$;

SELECT public.temp_reset_password();

DROP FUNCTION public.temp_reset_password();
