-- Migration: Savings Goals Module
-- Description: Named savings goals with target amounts/dates, the money movements
--               (saves / withdrawals) against them, and an optional per-goal Chart-of-Accounts
--               asset sub-account link. Re-runnable: uses IF NOT EXISTS + DROP POLICY IF EXISTS.

-- 1. Savings goals (one row per goal)
CREATE TABLE IF NOT EXISTS public.savings_goals (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    name TEXT NOT NULL,
    target_amount NUMERIC(18,2) NOT NULL,        -- in the base currency
    target_date DATE,                            -- optional deadline (YYYY-MM-DD)
    gl_account_id TEXT,                          -- Account.id of the Asset sub-account created for this goal
    note TEXT,
    is_archived BOOLEAN DEFAULT false NOT NULL,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2. Goal movements (money saved into / withdrawn from a goal)
CREATE TABLE IF NOT EXISTS public.goal_movements (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    goal_id UUID REFERENCES public.savings_goals(id) ON DELETE CASCADE NOT NULL,
    direction TEXT CHECK (direction IN ('in', 'out')) NOT NULL,
    amount NUMERIC(18,2) NOT NULL,
    flow_date DATE NOT NULL,
    gl_transaction_id TEXT,                      -- id of the journal entry in fintrack_transactions
    note TEXT,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- ============================================================
-- RLS: enable + per-table policies (idempotent)
-- ============================================================
DO $$
DECLARE
    t TEXT;
BEGIN
    FOREACH t IN ARRAY ARRAY['savings_goals', 'goal_movements']
    LOOP
        EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);

        EXECUTE format('DROP POLICY IF EXISTS "Users can view their own %s" ON public.%I', t, t);
        EXECUTE format('CREATE POLICY "Users can view their own %s" ON public.%I FOR SELECT USING (auth.uid() = user_id)', t, t);

        EXECUTE format('DROP POLICY IF EXISTS "Users can insert their own %s" ON public.%I', t, t);
        EXECUTE format('CREATE POLICY "Users can insert their own %s" ON public.%I FOR INSERT WITH CHECK (auth.uid() = user_id)', t, t);

        EXECUTE format('DROP POLICY IF EXISTS "Users can update their own %s" ON public.%I', t, t);
        EXECUTE format('CREATE POLICY "Users can update their own %s" ON public.%I FOR UPDATE USING (auth.uid() = user_id)', t, t);

        EXECUTE format('DROP POLICY IF EXISTS "Users can delete their own %s" ON public.%I', t, t);
        EXECUTE format('CREATE POLICY "Users can delete their own %s" ON public.%I FOR DELETE USING (auth.uid() = user_id)', t, t);
    END LOOP;
END $$;

-- Indexes for the common access paths
CREATE INDEX IF NOT EXISTS idx_goal_movements_goal ON public.goal_movements(goal_id);
