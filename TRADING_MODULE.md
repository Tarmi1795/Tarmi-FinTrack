# Trading Portfolio Module

A standalone multi-broker trading tracker, modeled on the manual spreadsheet workflow it replaces:
brokerage accounts (Binance, Exness, TradingView, prop/strategy accounts) each with a **Capital**
(net deposits), a **Total Balance today** (updated via daily snapshots), and computed **P/L** and
**ROI%**, consolidated into the app's base currency through user-maintained **FX rates**.

## Data Model (Supabase)

Created by `supabase_trading_migration.sql` (run it in the Supabase SQL Editor):

| Table | Purpose |
|---|---|
| `trading_accounts` | One row per brokerage account (name, broker, currency, notes). |
| `trading_cashflows` | Deposits / withdrawals per account. Stores the FX rate used and the `gl_transaction_id` of the posted journal entry. |
| `trading_snapshots` | "Balance today" per account, one per day (`UNIQUE (account_id, snap_date)`; re-saving a date overwrites). Feeds the equity curve. |
| `trading_fx_rates` | `1 unit of currency = rate_to_base units of base currency`. Seeded with sensible defaults vs QAR on first load, editable in the UI. |
| `trading_settings` | The single Chart-of-Accounts link (`linked_gl_account_id`). |

All tables are user-scoped with RLS (`auth.uid() = user_id`). The module talks to Supabase directly
(the Money Counter pattern), independent of the `AppState` sync pipeline.

## Formulas

- `Capital = Σ deposits − Σ withdrawals` (account currency)
- `Balance Today = latest snapshot balance`
- `P/L = Balance Today − Capital` ; `ROI% = P/L ÷ Capital × 100`
- Portfolio totals convert each figure at its FX rate into the base currency
  (`businessProfile.baseCurrency`).

## Chart of Accounts Integration (comparison only)

The module links to **one current-asset GL account** — by default it offers to create
**Trading Account (code 11140)** under **Cash & Bank (11100)**, or you can select any existing
asset account.

The link is **read-only**. This module is fully standalone:

- Deposits, withdrawals, balances and P/L are stored only in the module's own tables.
- **No journal entries are ever posted** — main app balances, the Journal, Reports and the
  Dashboard are never affected by anything entered here.
- The linked account's **GL balance is compared** against the module's Net Capital and Balance
  Today (both variances shown) — useful to reconcile what the main ledger says about trading
  capital versus what the brokers actually hold.
- If you want trading cash to appear in your main balances, record transfers in the main app
  (Journal / Quick Add) against the Trading Account yourself; this module will simply compare.

## Files

- `pages/Trading.tsx` — module UI (route `/trading`, sidebar "Trading")
- `services/trading.ts` — Supabase data access
- `types.ts` — `TradingAccount`, `TradingCashflow`, `TradingSnapshot`, `TradingFxRate`, `TradingSettings`
- `supabase_trading_migration.sql` — tables + RLS (idempotent, re-runnable)
