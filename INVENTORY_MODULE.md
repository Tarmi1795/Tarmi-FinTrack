# Inventory Module

Stock tracking with **Chart-of-Accounts posting** — inventory purchases, sales and adjustments post
real double-entry journal entries into the main ledger, using a configurable **Dr/Cr default mapping**.

## Data Model (Supabase)

Created by `supabase_inventory_migration.sql` (applied to the live database):

| Table | Purpose |
|---|---|
| `inventory_items` | Products: SKU, unit, category, quantity on hand, **moving-average cost**, sale price, reorder level. Optional per-item COA overrides. |
| `inventory_movements` | Purchases / sales / adjustments with the unit cost or price used, totals, and `gl_transaction_ids` linking to the posted journal entries. |
| `inventory_settings` | The module-level **Dr/Cr mapping defaults** (one row per user). |

All tables are RLS-protected (`auth.uid() = user_id`).

## Chart of Accounts Mapping (Dr/Cr defaults)

The mapping card on the Inventory page lets the user choose which accounts each posting role uses
("Auto-Setup" creates an `Inventory` asset account (code 11300) and picks sensible defaults):

| Role | Default Dr | Default Cr |
|---|---|---|
| **Purchase** (stock in) | Inventory (Asset) | Bank/Cash |
| **Sale** — revenue leg | Bank/Cash | Sales Revenue |
| **Sale** — cost leg | COGS (Expense) | Inventory (Asset) |
| **Adjustment** — write-off | Adjustment (Expense) | Inventory (Asset) |
| **Adjustment** — found stock | Inventory (Asset) | Adjustment (Expense) |

Per-item overrides (Inventory / COGS / Revenue accounts) are available in the item form under
"Advanced"; anything left empty falls back to the module defaults.

## Valuation & integrity

- **Moving-average cost**: `new_avg = (qty_on_hand × avg + purchased_qty × unit_cost) ÷ new_qty`;
  sales and write-offs consume stock at the current average without changing it.
- Stock quantity and item average are updated with every movement; deleting a movement restores the
  quantity and deletes its linked journal entries (bi-directional sync with the ledger).
- Sales are blocked from selling more than the quantity on hand.
- The `Inventory` asset account (11300) sits under the Assets class — **not** under Cash & Bank —
  so it appears on the Balance Sheet without polluting Dashboard cash totals.

## Files

- `pages/Inventory.tsx` — module UI (route `/inventory`, sidebar "Inventory")
- `services/inventory.ts` — Supabase data access
- `types.ts` — `InventoryItem`, `InventoryMovement`, `InventorySettings`
- `supabase_inventory_migration.sql` — tables + RLS (idempotent, re-runnable)
