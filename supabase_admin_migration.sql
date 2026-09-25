-- Migration: Admin panel foundations
-- Description: User roles (single admin), AI usage logging, per-user module
--               restrictions and AI limits, plus admin read policies.
--               Re-runnable: IF NOT EXISTS / DROP POLICY IF EXISTS.
--
-- IMPORTANT: admin checks use the SECURITY DEFINER helper public.is_admin()
-- (which bypasses RLS on fintrack_profiles). An inline EXISTS subquery on
-- fintrack_profiles inside its own policy causes infinite recursion (500s).

-- 0. Admin helper — SECURITY DEFINER so reading fintrack_profiles.role does
--    not recurse into that table's own RLS policies.
CREATE OR REPLACE FUNCTION public.is_admin() RETURNS boolean
LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.fintrack_profiles p
    WHERE p.id = auth.uid() AND p.role = 'admin'
  )
$$;

-- 1. Role flag on profiles ('user' | 'admin')
ALTER TABLE public.fintrack_profiles ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'user' NOT NULL;

-- Promote the app owner (idempotent)
UPDATE public.fintrack_profiles SET role = 'admin' WHERE email = 'onebizfam@gmail.com';

-- 2. AI usage log (one row per assistant call, written by the client as the caller)
CREATE TABLE IF NOT EXISTS public.ai_usage_log (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    feature TEXT CHECK (feature IN ('chat', 'vision')) NOT NULL,
    model TEXT,
    ok BOOLEAN DEFAULT true NOT NULL,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_ai_usage_user_time ON public.ai_usage_log(user_id, created_at DESC);

-- 3. Per-user settings: disabled modules + advisory AI daily limit
CREATE TABLE IF NOT EXISTS public.user_settings (
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
    disabled_modules TEXT[] DEFAULT '{}'::text[] NOT NULL,
    ai_daily_limit INTEGER DEFAULT 50 NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- ============================================================
-- RLS: enable + policies (owner + admin reads via is_admin())
-- ============================================================
ALTER TABLE public.ai_usage_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_settings ENABLE ROW LEVEL SECURITY;

-- ai_usage_log: owner full, admin reads all
DROP POLICY IF EXISTS "Users can view their own ai_usage_log" ON public.ai_usage_log;
CREATE POLICY "Users can view their own ai_usage_log" ON public.ai_usage_log FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can insert their own ai_usage_log" ON public.ai_usage_log;
CREATE POLICY "Users can insert their own ai_usage_log" ON public.ai_usage_log FOR INSERT WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "Admins can view all ai_usage_log" ON public.ai_usage_log;
CREATE POLICY "Admins can view all ai_usage_log" ON public.ai_usage_log FOR SELECT USING ((SELECT public.is_admin()));

-- user_settings: owner full, admin reads + updates everyone's
DROP POLICY IF EXISTS "Users can view their own user_settings" ON public.user_settings;
CREATE POLICY "Users can view their own user_settings" ON public.user_settings FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can insert their own user_settings" ON public.user_settings;
CREATE POLICY "Users can insert their own user_settings" ON public.user_settings FOR INSERT WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can update their own user_settings" ON public.user_settings;
CREATE POLICY "Users can update their own user_settings" ON public.user_settings FOR UPDATE USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Admins can view all user_settings" ON public.user_settings;
CREATE POLICY "Admins can view all user_settings" ON public.user_settings FOR SELECT USING ((SELECT public.is_admin()));
DROP POLICY IF EXISTS "Admins can update all user_settings" ON public.user_settings;
CREATE POLICY "Admins can update all user_settings" ON public.user_settings FOR UPDATE USING ((SELECT public.is_admin()));

-- User data is STRICTLY owner-scoped: the admin gets NO raw-row access to
-- content tables. The panel's per-user numbers come from the SECURITY DEFINER
-- aggregate below (counts and timestamps only — never row contents).
DROP POLICY IF EXISTS "Admins can view all fintrack_transactions" ON public.fintrack_transactions;
DROP POLICY IF EXISTS "Admins can view all invoices" ON public.invoices;
DROP POLICY IF EXISTS "Admins can view all trading_accounts" ON public.trading_accounts;
DROP POLICY IF EXISTS "Admins can view all receipts" ON public.receipts;
DROP POLICY IF EXISTS "Admins can view all fintrack_receivables" ON public.fintrack_receivables;

CREATE OR REPLACE FUNCTION public.admin_user_stats()
RETURNS TABLE(user_id uuid, transactions bigint, invoices bigint, last_active timestamptz)
LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE
AS $$
  SELECT
    p.id,
    (SELECT count(*) FROM public.fintrack_transactions t WHERE t.user_id = p.id),
    (SELECT count(*) FROM public.invoices i WHERE i.user_id = p.id),
    (SELECT max(t.updated_at) FROM public.fintrack_transactions t WHERE t.user_id = p.id)
  FROM public.fintrack_profiles p
$$;
