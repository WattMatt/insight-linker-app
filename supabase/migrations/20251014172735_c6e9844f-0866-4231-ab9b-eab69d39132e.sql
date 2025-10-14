-- Assign Admin role to the current user
INSERT INTO public.user_roles (user_id, role)
VALUES ('02847fd1-0cd1-42a7-b5d0-10122b74828e', 'Admin')
ON CONFLICT (user_id, role) DO NOTHING;