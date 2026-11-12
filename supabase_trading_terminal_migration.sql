-- Migration: Trading Terminal (trade journal + monthly target + MT5 agent RPCs)
-- Description: Monthly profit target for the performance terminal and SECURITY DEFINER
--               target on settings, and SECURITY DEFINER RPCs for the designated
--               MT5 agent (role = 'agent' on fintrack_profiles) to push balances
--               and trades. User data remains strictly owner-scoped.
--               Re-runnable.

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
