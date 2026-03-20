-- Migration: Create Admin Users for Maison Toa
-- This migration creates the initial admin users
-- NOTE: Passwords are hashed using Supabase's built-in auth system
-- You must run this AFTER linking to your Supabase project

-- First, ensure the users table has the admin role option
DO $$ 
BEGIN
  -- Add 'admin' to role check if it doesn't include it
  -- The users table uses text for role, so we just need to ensure we can insert 'admin'
  NULL;
END $$;

-- Create admin users via Supabase Auth
-- These users will be created using supabase CLI or dashboard
-- The SQL below prepares the users table entries that will be linked to auth.users

-- IMPORTANT: To create these users, run the following Supabase CLI commands:
-- 
-- supabase auth admin create-user --email wilson@mutant.ae --password wilsontest --data '{"role":"admin","full_name":"Wilson Admin"}'
-- supabase auth admin create-user --email louise.goerig@maisontoa.com --password louisetest --data '{"role":"admin","full_name":"Louise Goerig"}'
--
-- Or use the Supabase Dashboard > Authentication > Users > Create User

-- After creating users via auth, this function ensures they exist in the public.users table
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.users (id, email, full_name, role)
  VALUES (
    new.id,
    new.email,
    COALESCE(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    COALESCE(new.raw_user_meta_data->>'role', 'staff')
  )
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    full_name = COALESCE(EXCLUDED.full_name, users.full_name),
    role = COALESCE(EXCLUDED.role, users.role);
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger if it doesn't exist
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Also handle user updates
DROP TRIGGER IF EXISTS on_auth_user_updated ON auth.users;
CREATE TRIGGER on_auth_user_updated
  AFTER UPDATE ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
