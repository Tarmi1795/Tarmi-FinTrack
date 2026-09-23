-- Migration: Trading Portfolio Module
-- Description: Standalone multi-broker trading tracker (accounts, deposits/withdrawals,
--               daily balance snapshots, FX rates, and the Chart-of-Accounts link).
--               Re-runnable: uses IF NOT EXISTS + DROP POLICY IF EXISTS.

-- 1. Trading accounts (one row per brokerage / platform account)
CREATE TABLE IF NOT EXISTS public.trading_accounts (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    name TEXT NOT NULL,
    broker TEXT,
    currency TEXT DEFAULT 'QAR' NOT NULL,
    notes TEXT,
    is_active BOOLEAN DEFAULT true NOT NULL,
    sort_order INTEGER DEFAULT 0 NOT NULL,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2. Cash flows (deposits into / withdrawals from a broker account)
CREATE TABLE IF NOT EXISTS public.trading_cashflows (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    account_id UUID REFERENCES public.trading_accounts(id) ON DELETE CASCADE NOT NULL,
    flow_type TEXT CHECK (flow_type IN ('deposit', 'withdrawal')) NOT NULL,
    amount NUMERIC(18,2) NOT NULL,               -- in the account's currency
    fx_rate NUMERIC(18,6),                       -- rate to base currency used when posting to the ledger
    flow_date DATE NOT NULL,
    gl_transaction_id TEXT,                      -- id of the journal entry in fintrack_transactions
    bank_account_id TEXT,                        -- GL account id of the source/target bank account
    note TEXT,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 3. Balance snapshots ("Total Balance today" per account, one per day)
CREATE TABLE IF NOT EXISTS public.trading_snapshots (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    account_id UUID REFERENCES public.trading_accounts(id) ON DELETE CASCADE NOT NULL,
    balance NUMERIC(18,2) NOT NULL,              -- in the account's currency
    snap_date DATE NOT NULL,
    fx_rate NUMERIC(18,6),
    note TEXT,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    UNIQUE (account_id, snap_date)
);

-- 4. FX rates used to consolidate accounts into the base currency
CREATE TABLE IF NOT EXISTS public.trading_fx_rates (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    currency TEXT NOT NULL,
    rate_to_base NUMERIC(18,6) NOT NULL,         -- 1 unit of `currency` = rate_to_base units of base currency
    updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    UNIQUE (user_id, currency)
);

-- 5. Module settings: the single Chart-of-Accounts link ("Trading Account" current asset)
CREATE TABLE IF NOT EXISTS public.trading_settings (
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
    linked_gl_account_id TEXT,                   -- Account.id in fintrack_accounts
    updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 6. Categories & sub-categories (a sub-category is a category with a parent_id)
CREATE TABLE IF NOT EXISTS public.trading_categories (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    name TEXT NOT NULL,
    parent_id UUID REFERENCES public.trading_categories(id) ON DELETE CASCADE,
    sort_order INTEGER DEFAULT 0 NOT NULL,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Accounts optionally belong to a category (cleared if the category is deleted)
ALTER TABLE public.trading_accounts ADD COLUMN IF NOT EXISTS category_id UUID REFERENCES public.trading_categories(id) ON DELETE SET NULL;

-- ============================================================
-- RLS: enable + per-table policies (idempotent)
-- ============================================================
DO $$
DECLARE
    t TEXT;
BEGIN
    FOREACH t IN ARRAY ARRAY['trading_accounts', 'trading_cashflows', 'trading_snapshots', 'trading_fx_rates', 'trading_settings', 'trading_categories']
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
CREATE INDEX IF NOT EXISTS idx_trading_cashflows_account ON public.trading_cashflows(account_id);
CREATE INDEX IF NOT EXISTS idx_trading_snapshots_account_date ON public.trading_snapshots(account_id, snap_date DESC);
CREATE INDEX IF NOT EXISTS idx_trading_accounts_category ON public.trading_accounts(category_id);
CREATE INDEX IF NOT EXISTS idx_trading_categories_parent ON public.trading_categories(parent_id);
