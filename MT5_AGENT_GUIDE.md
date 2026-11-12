# MT5 Agent — Tarmi FinTrack Integration Guide

This guide describes how your MT5 AI agent connects to Tarmi FinTrack and
pushes balances/trades into the Trading module.

> **Balance-only alternative:** if the agent only needs to push daily balances (no trades),
> the lighter API-key endpoint `mt5_push_balances` (see `MT5_BALANCE_API.md`) does the same
> snapshot upsert with a single hashed key, batch support and a dry-run flag — no agent login
> required. Use the full agent flow below when it should also post trades or list accounts.

## 1. Environment

All credentials and identifiers live in `mt5-agent.env` (gitignored):

| Variable | Purpose |
|---|---|
| `SUPABASE_URL` / `SUPABASE_ANON_KEY` | Project endpoint + public key |
| `MT5_AGENT_EMAIL` / `MT5_AGENT_PASSWORD` | Dedicated agent login (role = `agent`) |
| `TARGET_USER_ID` | The Tarmi account whose trading books the agent manages |
| `TRADING_ACCOUNTS` | Account id / name / currency list |

## 2. Prerequisites (one-time)

1. Apply `supabase_trading_terminal_migration.sql` in the Supabase SQL Editor
   (creates `trading_trades`, the monthly target column, and the agent RPCs).
2. Run `node scripts/create-mt5-agent.mjs --token <SUPABASE_PAT>` — creates the
   agent auth user with the password baked into `mt5-agent.env` and marks its
   profile `role = 'agent'`.
3. Rotate `MT5_AGENT_PASSWORD` in `mt5-agent.env` + the DB if it ever leaks
   (script supports `--password`).

## 3. Authentication

```
POST {SUPABASE_URL}/auth/v1/token?grant_type=password
{ "email": "<MT5_AGENT_EMAIL>", "password": "<MT5_AGENT_PASSWORD>" }
→ { access_token, refresh_token, ... }
```

All subsequent calls: `Authorization: Bearer <access_token>` and
`apikey: <SUPABASE_ANON_KEY>`.

## 4. RPC contract (SECURITY DEFINER — agent or admin only)

### `mt5_upsert_balance`
```
POST {SUPABASE_URL}/rest/v1/rpc/mt5_upsert_balance
{ "p_user_id": "<TARGET_USER_ID>",
  "p_account_id": "<account uuid>",
  "p_balance": 2959.48,
  "p_trade_date": "2026-11-12",
  "p_note": "MT5 end-of-day" }
```
Upserts the daily closing balance (one per account per day — safe to re-run).

### `mt5_push_cashflow`
```
POST {SUPABASE_URL}/rest/v1/rpc/mt5_push_cashflow
{ "p_user_id": "<TARGET_USER_ID>",
  "p_account_id": "<account uuid>",
  "p_trade_date": "2026-11-12",
  "p_flow_type": "deposit" | "withdrawal",
  "p_amount": 500,
  "p_note": "manual top-up" }
```
Records a deposit/withdrawal event. Appears in the performance calendar as a
tracked movement (never mixed into P&L). Amount is always positive —
direction is carried by `p_flow_type`.

### `mt5_list_accounts`
```
POST {SUPABASE_URL}/rest/v1/rpc/mt5_list_accounts
{ "p_user_id": "<TARGET_USER_ID>" }
```
Returns active accounts + latest balances — useful for the agent to map
MT5 account numbers to Tarmi account ids.

## 5. JavaScript example (supabase-js)

```js
import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);
await sb.auth.signInWithPassword({
  email: process.env.MT5_AGENT_EMAIL,
  password: process.env.MT5_AGENT_PASSWORD,
});
await sb.rpc('mt5_upsert_balance', {
  p_user_id: process.env.TARGET_USER_ID,
  p_account_id: '<account uuid>',
  p_balance: 2959.48,
  p_trade_date: '2026-11-12',
  p_note: 'MT5 end-of-day',
});
```

## 6. Behavior notes

- Balances land as **daily snapshots** — the performance terminal (calendar,
  table, day inspector, KPI cards) reads them directly.
- Deposits/withdrawals from the Tarmi app are excluded from P&L by the
  terminal math — agent-pushed balances are pure MT5 equity.
- The agent can only touch the `TARGET_USER_ID` books; every RPC verifies the
  caller's `role ∈ ('admin','agent')` and that the account belongs to the
  target user.
- Delete the agent user from Supabase Auth to revoke access instantly.
