-- Migration: Trading Terminal (trade journal + monthly target + MT5 agent RPCs)
-- Description: Per-trade journal for the performance terminal, a monthly profit
--               target on settings, and SECURITY DEFINER RPCs for the designated
--               MT5 agent (role = 'agent' on fintrack_profiles) to push balances
--               and trades. User data remains strictly owner-scoped.
--               Re-runnable.

-- 1. Trade journal
CREATE TABLE IF NOT EXISTS public.trading_trades (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    account_id UUID REFERENCES public.trading_accounts(id) ON DELETE CASCADE NOT NULL,
    trade_date DATE NOT NULL,
    symbol TEXT NOT NULL,                        -- traded asset (e.g. XAUUSD, BTCUSD, US30)
    direction TEXT CHECK (direction IN ('buy', 'sell')) NOT NULL,
    entry_price NUMERIC(18,6),
    exit_price NUMERIC(18,6),
    profit_loss NUMERIC(18,2) NOT NULL,
    rr_ratio NUMERIC(6,2),                       -- risk-to-reward ratio (e.g. 2.50)
    session TEXT,                                -- London / New York / Tokyo / Sydney / Other
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.trading_trades ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own trading_trades" ON public.trading_trades;
CREATE POLICY "Users can view their own trading_trades" ON public.trading_trades FOR SELECT
  USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can insert their own trading_trades" ON public.trading_trades;
CREATE POLICY "Users can insert their own trading_trades" ON public.trading_trades FOR INSERT
  WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can update their own trading_trades" ON public.trading_trades;
CREATE POLICY "Users can update their own trading_trades" ON public.trading_trades FOR UPDATE
  USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can delete their own trading_trades" ON public.trading_trades;
CREATE POLICY "Users can delete their own trading_trades" ON public.trading_trades FOR DELETE
  USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_trading_trades_account_date ON public.trading_trades(account_id, trade_date DESC);
CREATE INDEX IF NOT EXISTS idx_trading_trades_user_date ON public.trading_trades(user_id, trade_date DESC);

-- 2. Monthly profit target on module settings
ALTER TABLE public.trading_settings ADD COLUMN IF NOT EXISTS monthly_profit_target NUMERIC(18,2) DEFAULT 0 NOT NULL;

-- 3. MT5 agent write RPCs — callable only by profiles with role 'admin' or 'agent'.
--    The agent writes under the TARGET user's id (data stays owner-scoped).

CREATE OR REPLACE FUNCTION public.mt5_upsert_balance(
    p_user_id uuid, p_account_id uuid, p_balance numeric, p_trade_date date, p_note text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.fintrack_profiles WHERE id = auth.uid() AND role IN ('admin', 'agent')) THEN
    RAISE EXCEPTION 'forbidden: agent or admin only';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.trading_accounts WHERE id = p_account_id AND user_id = p_user_id) THEN
    RAISE EXCEPTION 'account % not found for user %', p_account_id, p_user_id;
  END IF;
  INSERT INTO public.trading_snapshots (user_id, account_id, balance, snap_date, fx_rate, note)
  VALUES (p_user_id, p_account_id, p_balance, p_trade_date,
          (SELECT rate_to_base FROM public.trading_fx_rates r
            JOIN public.trading_accounts a ON a.id = p_account_id AND r.user_id = a.user_id AND r.currency = a.currency),
          COALESCE(p_note, 'MT5 agent'))
  ON CONFLICT (account_id, snap_date) DO UPDATE
    SET balance = EXCLUDED.balance, note = EXCLUDED.note;
END;
$$;

CREATE OR REPLACE FUNCTION public.mt5_post_trade(
    p_user_id uuid, p_account_id uuid, p_trade_date date, p_symbol text,
    p_direction text, p_profit numeric,
    p_entry numeric DEFAULT NULL, p_exit numeric DEFAULT NULL,
    p_rr numeric DEFAULT NULL, p_session text DEFAULT NULL, p_notes text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  new_id uuid;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.fintrack_profiles WHERE id = auth.uid() AND role IN ('admin', 'agent')) THEN
    RAISE EXCEPTION 'forbidden: agent or admin only';
  END IF;
  IF p_direction NOT IN ('buy', 'sell') THEN
    RAISE EXCEPTION 'direction must be buy or sell';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.trading_accounts WHERE id = p_account_id AND user_id = p_user_id) THEN
    RAISE EXCEPTION 'account % not found for user %', p_account_id, p_user_id;
  END IF;
  INSERT INTO public.trading_trades (user_id, account_id, trade_date, symbol, direction,
                                     entry_price, exit_price, profit_loss, rr_ratio, session, notes)
  VALUES (p_user_id, p_account_id, p_trade_date, p_symbol, p_direction,
          p_entry, p_exit, p_profit, p_rr, p_session, p_notes)
  RETURNING id INTO new_id;
  RETURN new_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.mt5_list_accounts(p_user_id uuid)
RETURNS TABLE(id uuid, name text, currency text, latest_balance numeric, latest_snapshot_date date)
LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE
AS $$
  SELECT a.id, a.name, a.currency,
         (SELECT s.balance FROM public.trading_snapshots s WHERE s.account_id = a.id ORDER BY s.snap_date DESC LIMIT 1),
         (SELECT s.snap_date FROM public.trading_snapshots s WHERE s.account_id = a.id ORDER BY s.snap_date DESC LIMIT 1)
  FROM public.trading_accounts a
  WHERE a.user_id = p_user_id AND a.is_active = true
  ORDER BY a.sort_order, a.name;
$$;
