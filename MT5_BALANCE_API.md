# MT5 Balance Push API

> **How to use:** your AI/automation (running next to the MT5 terminal) POSTs broker balances to
> this endpoint whenever it likes — no screenshots, no chat. It writes the Trading module's
> `trading_snapshots` under the same **balance-only** rules as the Vantage screenshot workflow.
> Same-day re-pushes just overwrite today's row. Safe to call as often as you want.

---

## Rules (what the endpoint enforces)

1. **BALANCE-ONLY.** Writes only to `public.trading_snapshots`. It cannot touch
   `trading_cashflows`, `trading_accounts` amounts, or any `fintrack_*` table.
2. **Today only, ever.** The snapshot date is computed server-side as *today in Asia/Qatar*.
   There is no date parameter — past dates are structurally impossible to modify.
3. **Never auto-creates.** Rows that don't match an existing account come back as
   `unmatched` — map them in the app (add `Strategy ID: xxxxx` to the account's notes) and
   re-push. Nothing is invented.
4. **Currency stays native.** Balances are stored in the account's own currency; an optional
   `currency` field is checked against it (`currency_mismatch` → row skipped).
5. **One snapshot per account per day** — `ON CONFLICT (account_id, snap_date) DO UPDATE`.
   The API never writes `fx_rate` (fresh rows stay NULL; an existing row's rate is preserved —
   informational only). The app converts at its current rates.

## Endpoint

```
POST https://hdwpzyfvabljqvtxjfsg.supabase.co/rest/v1/rpc/mt5_push_balances
Headers:
  apikey: <SUPABASE_ANON_KEY>
  Authorization: Bearer <SUPABASE_ANON_KEY>
  Content-Type: application/json
```

`<SUPABASE_ANON_KEY>` is the app's public anon key — in the repo's `.env` as
`VITE_SUPABASE_ANON_KEY` (it authenticates the HTTP route only; the real credential is your MT5
API key below).

## Request body

```json
{
  "p_api_key": "<MT5 API key>",
  "p_note": "MT5 EA 20:00",            // optional, default note for the whole batch
  "p_dry_run": false,                  // optional: full match/validate pass, zero writes
  "p_updates": [                       // 1..100 objects per call
    {
      "strategy_id": "A0141065",       // preferred match key (notes: "Strategy ID: A0141065")
      "name": "Flow Trading",          // optional fallback match (punctuation-insensitive)
      "balance": 414.67,               // required, number >= 0, in the account's currency
      "currency": "USD",               // optional sanity check against the account currency
      "note": "MT5 EA equity 20:00"    // optional per-row note override
    }
  ]
}
```

Matching order per row: **Strategy ID** in `trading_accounts.notes` → **name** fallback →
report `unmatched`. Archived (`is_active = false`) accounts are never written; a match against
one is reported as `inactive`.

## Response

```json
{
  "ok": true,
  "dry_run": false,
  "snap_date": "2026-11-12",
  "updated": 1,
  "skipped": 1,
  "results": [
    {"strategy_id": "A0141065", "name": "Flow Trading", "account_id": "…",
     "account_name": "Flow Trading", "matched_by": "strategy_id", "currency": "USD",
     "balance": 414.67, "previous_balance": 413.86, "status": "updated", "detail": null},
    {"strategy_id": "A9999999", "name": "Mystery", "account_id": null, "account_name": null,
     "matched_by": null, "currency": null, "balance": null, "previous_balance": null,
     "status": "unmatched", "detail": "no active account with this Strategy ID or name — map it in the app"}
  ]
}
```

Row `status` values:

| status | meaning | wrote? |
|---|---|---|
| `updated` | snapshot upserted | yes |
| `would_update` | would have written — only with `p_dry_run: true` | no |
| `unmatched` | no active account matches | no |
| `inactive` | matches an archived account — reactivate it in the app if wrong | no |
| `currency_mismatch` | sent `currency` ≠ account currency | no |
| `invalid_balance` | balance missing, non-numeric, negative, or > 1e12 | no |

Call-level failures (HTTP 4xx, PostgREST error body): `Invalid API key`, `p_updates must be a
JSON array of 1..100 objects`. Check the HTTP status first; a 4xx means **nothing was written**.

## curl example

```bash
cd /path/to/tarmi-fintrack-app
ANON=$(grep '^VITE_SUPABASE_ANON_KEY=' .env | cut -d= -f2 | tr -d '"')
curl -s -X POST "https://hdwpzyfvabljqvtxjfsg.supabase.co/rest/v1/rpc/mt5_push_balances" \
  -H "apikey: $ANON" -H "Authorization: Bearer $ANON" -H "Content-Type: application/json" \
  --data-raw '{"p_api_key":"'"$(cat secrets/mt5-api-key.txt)"'","p_updates":[{"strategy_id":"A0141065","name":"Flow Trading","balance":414.67,"currency":"USD"}]}'
```

## Python example (MetaTrader 5 terminal on the same machine)

```python
import MetaTrader5 as mt5
import requests

# One MT5 login maps to one strategy/account — repeat per account (initialize each login).
MT5_LOGIN, MT5_PASSWORD, MT5_SERVER = 12345678, "your-mt5-password", "VantageInternational"
STRATEGY_ID, STRAT_NAME = "A0141065", "Flow Trading"   # must match the app's account

API_URL   = "https://hdwpzyfvabljqvtxjfsg.supabase.co/rest/v1/rpc/mt5_push_balances"
ANON_KEY  = "<VITE_SUPABASE_ANON_KEY from the app's .env>"
MT5_API_KEY = open(r"C:\path\to\tarmi-fintrack-app\secrets\mt5-api-key.txt").read().strip()

ok = mt5.initialize(login=MT5_LOGIN, password=MT5_PASSWORD, server=MT5_SERVER)
assert ok, mt5.last_error()
info = mt5.account_info()
mt5.shutdown()

# Equity is the day's balance per the standing rule (Balance excludes floating P/L).
r = requests.post(API_URL, headers={"apikey": ANON_KEY, "Authorization": f"Bearer {ANON_KEY}"},
                  json={"p_api_key": MT5_API_KEY, "p_updates": [{
                      "strategy_id": STRATEGY_ID, "name": STRAT_NAME,
                      "balance": info.equity, "currency": info.currency}]})
r.raise_for_status()
for row in r.json()["results"]:
    print(row["account_name"], row["status"], row["previous_balance"], "->", row["balance"])
```

## Node helper (in this repo)

```bash
node scripts/mt5-balance-push.mjs --dry-run --json '[{"strategy_id":"A0141065","balance":414.67,"currency":"USD"}]'
node scripts/mt5-balance-push.mjs --file updates.json --note "MT5 EA 20:00"
```

Reads the key from `--key` / `MT5_API_KEY` env / `secrets/mt5-api-key.txt`, and the Supabase
URL/anon key from `.env`. Exit 0 = all rows written, 2 = some rows skipped (check statuses),
1 = call failed.

## Key management

- Plaintext key: `secrets/mt5-api-key.txt` (gitignored; mirrored in `mt5-agent.env` as
  `MT5_API_KEY`). Only its sha256 hash is in the DB (`public.trading_api_keys`, RLS-locked,
  reachable solely by the push function).
- Create another key (e.g. for a second machine):
  ```sql
  INSERT INTO public.trading_api_keys (user_id, label, key_hash)
  VALUES ('f508f7b1-7cc2-4ded-b055-612a852c00c4', '<label>',
          encode(sha256('<NEW_64_HEX_CHARS>'::bytea), 'hex'));
  ```
- Rotate/revoke: `UPDATE public.trading_api_keys SET is_active = false WHERE label = 'mt5';`
- `last_used_at` on the key row shows the last successful call.

## Relationship to the other MT5 integration

`MT5_AGENT_GUIDE.md` documents the **full MT5 agent** (Supabase-auth `agent` user, balance +
trades + account listing, feeding the TradingTerminal trade journal). This doc's endpoint is the
lighter **balance-only pusher**: hashed API key (no JWT/refresh handling), batch updates,
dry-run, and no date parameter (past dates structurally impossible). Use either for balances —
they write the same daily snapshots — but pick one per machine/agent; the agent route is needed
if it should also post trades. Both require the migrations to be applied (see Prerequisites in
each guide).

`VANTAGE_DAILY_PROMPT.md` (paste-screenshot) remains for manual/screenshot syncs and for the
zero-absent-strategies rule. This API is push-only: strategies you don't send are left exactly
as they are — it never zeroes anything. The two can coexist; both write the same daily snapshot.
