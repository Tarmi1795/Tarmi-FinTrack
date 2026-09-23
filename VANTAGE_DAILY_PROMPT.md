# Vantage Balance Update (paste-screenshot workflow)

> **How to use:** paste a screenshot of your Vantage strategies/accounts dashboard into the chat
> (optionally with "update balances"). The agent reads it and updates the Trading module's broker
> balances — **balance-only**. Run as often as you like; same-day re-runs just overwrite today's row.

---

## Prompt

**Task: I pasted a screenshot of my Vantage account dashboard. Read the balances from it and update my Trading module in Supabase. Balance-only update — never change capitals, deposits, cashflows, or any main-app data.**

### Fixed context

- App repo: `C:\Users\Admin\.gemini\antigravity\scratch\tarmi-fintrack-app`
- Supabase project ref: `hdwpzyfvabljqvtxjfsg`
- App user id: `f508f7b1-7cc2-4ded-b055-612a852c00c4`
- Supabase access token: single line inside `secrets\supabase.pat` (repo-relative). If missing, STOP and report.
- DB update endpoint (Management API):
  `POST https://api.supabase.com/v1/projects/hdwpzyfvabljqvtxjfsg/database/query`
  Headers: `Authorization: Bearer <token>`, `Content-Type: application/json`
  Body: `{"query": "<SQL>"}`

### Rules (read first)

1. **BALANCE-ONLY.** Write only to `public.trading_snapshots`. Never touch `trading_cashflows`,
   `trading_accounts` amounts, or any `fintrack_*` table.
2. One snapshot per account per day — use `ON CONFLICT (account_id, snap_date) DO UPDATE` so re-runs
   overwrite today's row, not history. **Never edit or delete past dates.**
3. Use the **actual current local date** (`YYYY-MM-DD`) for the snapshot — verify it (e.g. from the
   system clock), don't assume.
4. Keep each balance in the account's own currency exactly as shown in the screenshot.
5. If the screenshot is unreadable or a value is ambiguous, ask — never guess a number.

### Step 1 — Read the screenshot

For every strategy/account row visible, record:
- **Strategy ID** if shown (e.g. `A0122030`) — this is the primary match key
- Account/strategy name exactly as displayed
- Currency
- **Balance** (if only Equity is shown, use it and note "equity used")

### Step 2 — Match to Trading module accounts

Query existing accounts:

```sql
SELECT id, name, notes, currency FROM public.trading_accounts
WHERE user_id = 'f508f7b1-7cc2-4ded-b055-612a852c00c4'
ORDER BY sort_order;
```

Match each screenshot row to a module account:
1. **First by Strategy ID** stored in the account's `notes` (`Strategy ID: xxxxx`)
2. Fall back to name match (case- and punctuation-insensitive)

For unmatched rows: **do not auto-create.** List them in the report as
`unmatched — tell me the mapping or say 'create'` (when creating, seed capital = balance − shown P/L).

Accounts in the database that are **absent from the screenshot** (confirmed by Tarmi 2026-09-23):
- **Vantage strategy accounts** (they have a `Strategy ID:` in `notes`): zero them for today —
  insert `balance 0` with note `Zeroed - strategy not on Vantage dashboard screenshot`. Absence
  means the strategy is closed. Flag zeroed accounts loudly in the report; a same-day re-run with
  a fuller screenshot overwrites today's row back to the real value.
- **Non-Vantage accounts** (no Strategy ID in notes — e.g. SHERWOOD, Exness, Binance, V-wallet,
  TradingView): **never zero these.** They never appear on a Vantage dashboard, so absence is
  expected — leave them completely untouched.

### Step 3 — Update balances (today only)

For each matched account, with `<today>` = current local date:

```sql
INSERT INTO public.trading_snapshots (user_id, account_id, balance, snap_date, fx_rate, note)
VALUES ('f508f7b1-7cc2-4ded-b055-612a852c00c4', '<account_id>', <balance>, '<today>', NULL, 'Vantage screenshot update')
ON CONFLICT (account_id, snap_date)
DO UPDATE SET balance = EXCLUDED.balance, note = EXCLUDED.note;
```

Leave `fx_rate` NULL — the app converts at current rates.

**Back up first:** before the upsert, dump today's existing rows to
`backups/trading_snapshots_<today>_pre-vantage-sync.json` (repo-relative) so overwritten values
stay recoverable.

### Step 4 — Verify and report

Re-query the latest snapshot per updated account (plus its previous-day balance) and report concisely:

```
Vantage update — <today>
✓ KGI Capital        715.86  (was 577.84, +138.02)
✓ Ms Flower          517.05  (was 499.98, +17.07)
⚠ Unmatched: "New Acct (A10145999)" — tell me the mapping or say 'create'
```

Include: accounts updated / skipped / unmatched, any values you read as Equity instead of Balance,
and any problems.
