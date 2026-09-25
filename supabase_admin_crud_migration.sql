-- Migration: Admin panel CRUD support
-- Description: Robust user listing, role management, and user deletion for the
--               admin panel. User data stays strictly owner-scoped — these
--               helpers are SECURITY DEFINER and expose only what admin needs.
--               Re-runnable.

-- 1. Update policy: admin can change a profile's role (promote / demote)
DROP POLICY IF EXISTS "Admins can update fintrack_profiles" ON public.fintrack_profiles;
CREATE POLICY "Admins can update fintrack_profiles" ON public.fintrack_profiles FOR UPDATE
  USING ((SELECT public.is_admin()));

-- 2. Robust listing — bypasses any policy quirk, returns profiles only
CREATE OR REPLACE FUNCTION public.admin_list_users()
RETURNS TABLE(id uuid, email text, name text, role text, base_currency text, updated_at timestamptz)
LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE
AS $$
  SELECT p.id, p.email, p.name, p.role, p.base_currency, p.updated_at
  FROM public.fintrack_profiles p
  ORDER BY p.role DESC, p.email
$$;

-- 3. Delete a user account entirely (auth row cascades to ALL of their data
--    via the ON DELETE CASCADE foreign keys). Self-deletion is blocked.
CREATE OR REPLACE FUNCTION public.admin_delete_user(target uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'forbidden: admin only';
  END IF;
  IF target = auth.uid() THEN
    RAISE EXCEPTION 'cannot delete your own account';
  END IF;
  DELETE FROM auth.users WHERE id = target;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_delete_user(uuid) FROM anon;
