-- Migration: MT5 agent cashflow RPC
-- Description: Lets the designated MT5 agent record deposits/withdrawals so
--               they appear in the performance calendar as tracked events.
--               P&L stays clean — flows never mix into profit.
--               Re-runnable.

CREATE OR REPLACE FUNCTION public.mt5_push_cashflow(
    p_user_id uuid, p_account_id uuid, p_trade_date date,
    p_flow_type text, p_amount numeric, p_note text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  new_id uuid;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.fintrack_profiles WHERE id = auth.uid() AND role IN ('admin', 'agent')) THEN
    RAISE EXCEPTION 'forbidden: agent or admin only';
  END IF;
  IF p_flow_type NOT IN ('deposit', 'withdrawal') THEN
    RAISE EXCEPTION 'flow_type must be deposit or withdrawal';
  END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'amount must be positive';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.trading_accounts WHERE id = p_account_id AND user_id = p_user_id) THEN
    RAISE EXCEPTION 'account % not found for user %', p_account_id, p_user_id;
  END IF;
  INSERT INTO public.trading_cashflows (user_id, account_id, flow_type, amount, flow_date, fx_rate, note)
  VALUES (p_user_id, p_account_id, p_flow_type, p_amount, p_trade_date,
          (SELECT r.rate_to_base FROM public.trading_fx_rates r
            JOIN public.trading_accounts a ON a.id = p_account_id
            AND r.user_id = a.user_id AND r.currency = a.currency),
          COALESCE(p_note, 'MT5 agent'))
  RETURNING id INTO new_id;
  RETURN new_id;
END;
$$;
