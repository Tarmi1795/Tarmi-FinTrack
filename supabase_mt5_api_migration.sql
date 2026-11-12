-- Migration: MT5 balance push API
-- Description: Authenticated HTTP endpoint (PostgREST RPC) that lets an external
--               automation push MT5 broker balances into the Trading module.
--               BALANCE-ONLY: writes ONLY public.trading_snapshots, and only for
--               today's date in Asia/Qatar — history, trading_cashflows,
--               trading_accounts and every fintrack_* table are untouchable.
--               Matching: Strategy ID in trading_accounts.notes first
--               ("Strategy ID: A0141065"), punctuation-insensitive name fallback;
--               never auto-creates accounts.
--               Re-runnable: IF NOT EXISTS / CREATE OR REPLACE.
--
-- Endpoint (after applying):  POST {SUPABASE_URL}/rest/v1/rpc/mt5_push_balances
-- Caller docs: MT5_BALANCE_API.md   ·  plaintext key lives in secrets/ (gitignored)

-- 1. API keys — only sha256 hashes are stored; plaintext never touches the DB.
CREATE TABLE IF NOT EXISTS public.trading_api_keys (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    label TEXT DEFAULT 'mt5' NOT NULL,
    key_hash TEXT NOT NULL UNIQUE,               -- sha256 hex of the API key
    is_active BOOLEAN DEFAULT true NOT NULL,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    last_used_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_trading_api_keys_user ON public.trading_api_keys(user_id);

-- RLS enabled with zero policies: the table is unreachable through PostgREST.
-- Only the SECURITY DEFINER function below (and direct admin SQL) may read it.
ALTER TABLE public.trading_api_keys ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.trading_api_keys FROM anon, authenticated;

-- 2. The push function. The API key (not a Supabase JWT) is the credential;
--    the matched key row's user_id scopes every write.
CREATE OR REPLACE FUNCTION public.mt5_push_balances(
    p_api_key  TEXT,
    p_updates  JSONB,                            -- [{"strategy_id","name","balance","currency","note"}]
    p_note     TEXT DEFAULT NULL,                 -- default note for the whole batch
    p_dry_run  BOOLEAN DEFAULT false              -- validate + match only, no writes
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER VOLATILE SET search_path = public
AS $$
DECLARE
    v_key_hash  TEXT;
    v_user      UUID;
    v_today     DATE  := (now() AT TIME ZONE 'Asia/Qatar')::date;  -- never a past date
    v_note_base TEXT  := COALESCE(left(btrim(p_note), 200), 'MT5 API auto-update');
    v_results   JSONB := '[]'::jsonb;
    v_updated   INTEGER := 0;
    v_skipped   INTEGER := 0;
    u           JSONB;
    v_sid       TEXT;
    v_name      TEXT;
    v_raw_bal   TEXT;
    v_balance   NUMERIC;
    v_cur       TEXT;
    v_note      TEXT;
    v_status    TEXT;
    v_detail    TEXT;
    v_matched   TEXT;
    v_acct_id   UUID;
    v_acct_name TEXT;
    v_acct_cur  TEXT;
    v_prev      NUMERIC;
BEGIN
    -- Auth: hash the presented key and match an active key row
    v_key_hash := encode(sha256(p_api_key::bytea), 'hex');
    SELECT k.user_id INTO v_user
    FROM public.trading_api_keys k
    WHERE k.key_hash = v_key_hash AND k.is_active;
    IF v_user IS NULL THEN
        RAISE EXCEPTION 'Invalid API key';
    END IF;

    IF p_updates IS NULL OR jsonb_typeof(p_updates) <> 'array'
       OR jsonb_array_length(p_updates) = 0 OR jsonb_array_length(p_updates) > 100 THEN
        RAISE EXCEPTION 'p_updates must be a JSON array of 1..100 objects';
    END IF;

    UPDATE public.trading_api_keys SET last_used_at = now()
    WHERE key_hash = v_key_hash;

    FOR u IN SELECT jsonb_array_elements(p_updates) LOOP
        v_sid     := NULLIF(btrim(COALESCE(u->>'strategy_id', '')), '');
        v_name    := NULLIF(btrim(COALESCE(u->>'name', '')), '');
        v_raw_bal := u->>'balance';
        v_cur     := NULLIF(btrim(COALESCE(u->>'currency', '')), '');
        v_note    := COALESCE(NULLIF(btrim(COALESCE(u->>'note', '')), ''), v_note_base);
        v_status  := NULL;
        v_detail  := NULL;
        v_matched := NULL;
        v_acct_id := NULL;
        v_acct_name := NULL;
        v_acct_cur  := NULL;
        v_prev      := NULL;

        -- Balance validation: plain decimal, >= 0, <= 1e12 (fits NUMERIC(18,2))
        BEGIN
            IF v_raw_bal IS NULL OR v_raw_bal !~ '^\s*-?\d+(\.\d+)?\s*$'
               OR (v_raw_bal::numeric) < 0 OR (v_raw_bal::numeric) > 1000000000000 THEN
                v_status := 'invalid_balance';
                v_detail := 'balance must be a number >= 0';
            ELSE
                v_balance := round(v_raw_bal::numeric, 2);
            END IF;
        EXCEPTION WHEN OTHERS THEN
            v_status := 'invalid_balance';
            v_detail := 'balance must be a number >= 0';
        END;

        -- Match 1: Strategy ID in notes (whitespace-normalized, case-insensitive;
        -- matches both "Strategy ID: X" and "Strategy ID: X <extra text>")
        IF v_status IS NULL AND v_sid IS NOT NULL THEN
            SELECT a.id, a.name, a.currency INTO v_acct_id, v_acct_name, v_acct_cur
            FROM public.trading_accounts a
            WHERE a.user_id = v_user AND a.is_active
              AND (btrim(regexp_replace(lower(coalesce(a.notes, '')), '\s+', ' ', 'g')) = 'strategy id: ' || lower(v_sid)
                   OR btrim(regexp_replace(lower(coalesce(a.notes, '')), '\s+', ' ', 'g')) LIKE 'strategy id: ' || lower(v_sid) || ' %')
            LIMIT 1;
            IF v_acct_id IS NOT NULL THEN v_matched := 'strategy_id'; END IF;
        END IF;

        -- Match 2: punctuation-insensitive name fallback
        IF v_status IS NULL AND v_acct_id IS NULL AND v_name IS NOT NULL THEN
            SELECT a.id, a.name, a.currency INTO v_acct_id, v_acct_name, v_acct_cur
            FROM public.trading_accounts a
            WHERE a.user_id = v_user AND a.is_active
              AND regexp_replace(lower(a.name), '[^a-z0-9]', '', 'g')
                = regexp_replace(lower(v_name), '[^a-z0-9]', '', 'g')
            LIMIT 1;
            IF v_acct_id IS NOT NULL THEN v_matched := 'name'; END IF;
        END IF;

        -- Match 3: same key would hit an inactive (archived) account — report it
        IF v_status IS NULL AND v_acct_id IS NULL THEN
            SELECT a.id, a.name INTO v_acct_id, v_acct_name
            FROM public.trading_accounts a
            WHERE a.user_id = v_user AND NOT a.is_active
              AND (
                (v_sid IS NOT NULL AND (
                   btrim(regexp_replace(lower(coalesce(a.notes, '')), '\s+', ' ', 'g')) = 'strategy id: ' || lower(v_sid)
                   OR btrim(regexp_replace(lower(coalesce(a.notes, '')), '\s+', ' ', 'g')) LIKE 'strategy id: ' || lower(v_sid) || ' %'))
                OR
                (v_name IS NOT NULL AND regexp_replace(lower(a.name), '[^a-z0-9]', '', 'g')
                   = regexp_replace(lower(v_name), '[^a-z0-9]', '', 'g'))
              )
            LIMIT 1;
            IF v_acct_id IS NOT NULL THEN
                v_status := 'inactive';
                v_detail := 'account exists but is archived';
            END IF;
        END IF;

        -- Still nothing: report for mapping, never auto-create
        IF v_status IS NULL AND v_acct_id IS NULL THEN
            v_status := 'unmatched';
            v_detail := 'no active account with this Strategy ID or name — map it in the app';
        END IF;

        -- Currency guard: balance stays in the account's own currency
        IF v_status IS NULL AND v_cur IS NOT NULL AND upper(v_cur) <> upper(v_acct_cur) THEN
            v_status := 'currency_mismatch';
            v_detail := 'account currency is ' || v_acct_cur;
        END IF;

        IF v_status IS NULL THEN
            SELECT s.balance INTO v_prev
            FROM public.trading_snapshots s
            WHERE s.account_id = v_acct_id AND s.snap_date = v_today;

            IF p_dry_run THEN
                v_status := 'would_update';
            ELSE
                INSERT INTO public.trading_snapshots
                    (user_id, account_id, balance, snap_date, fx_rate, note)
                VALUES
                    (v_user, v_acct_id, v_balance, v_today, NULL, v_note)
                ON CONFLICT (account_id, snap_date)
                DO UPDATE SET balance = EXCLUDED.balance, note = EXCLUDED.note;
                v_status := 'updated';
                v_updated := v_updated + 1;
            END IF;
        ELSE
            v_skipped := v_skipped + 1;
        END IF;

        v_results := v_results || jsonb_build_object(
            'strategy_id',      v_sid,
            'name',             v_name,
            'account_id',       v_acct_id,
            'account_name',     v_acct_name,
            'matched_by',       v_matched,
            'currency',         v_acct_cur,
            'balance',          v_balance,
            'previous_balance', v_prev,
            'status',           v_status,
            'detail',           v_detail
        );
    END LOOP;

    RETURN jsonb_build_object(
        'ok',       true,
        'dry_run',  COALESCE(p_dry_run, false),
        'snap_date', v_today,
        'updated',  v_updated,
        'skipped',  v_skipped,
        'results',  v_results
    );
END $$;

-- 3. Executable by the PostgREST roles (callers authenticate with the API key
--    inside the function, not with a Supabase JWT).
REVOKE ALL ON FUNCTION public.mt5_push_balances(text, jsonb, text, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mt5_push_balances(text, jsonb, text, boolean) TO anon, authenticated;
