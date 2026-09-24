-- Migration: Inventory Module
-- Description: Items, stock movements, and Chart-of-Accounts Dr/Cr mapping defaults.
--               Movements post journal entries into the main ledger (fintrack_transactions)
--               through the app; gl_transaction_ids on each movement link back to them.
--               Re-runnable: IF NOT EXISTS + DROP POLICY IF EXISTS.

-- 1. Items
CREATE TABLE IF NOT EXISTS public.inventory_items (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    sku TEXT,
    name TEXT NOT NULL,
    unit TEXT,
    category TEXT,
    quantity NUMERIC(18,3) DEFAULT 0 NOT NULL,       -- on hand
    cost_price NUMERIC(18,4) DEFAULT 0 NOT NULL,     -- moving-average cost (base currency)
    sale_price NUMERIC(18,4),
    reorder_level NUMERIC(18,3),
    notes TEXT,
    is_active BOOLEAN DEFAULT true NOT NULL,
    inventory_account_id TEXT,                        -- per-item COA overrides (nullable)
    cogs_account_id TEXT,
    revenue_account_id TEXT,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2. Stock movements (purchase / sale / adjustment)
CREATE TABLE IF NOT EXISTS public.inventory_movements (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    item_id UUID REFERENCES public.inventory_items(id) ON DELETE CASCADE NOT NULL,
    movement_type TEXT CHECK (movement_type IN ('purchase', 'sale', 'adjustment')) NOT NULL,
    quantity NUMERIC(18,3) NOT NULL,                  -- signed for adjustments
    unit_cost NUMERIC(18,4),                          -- actual on purchase; avg used on out-movements
    total_cost NUMERIC(18,2),
    unit_price NUMERIC(18,4),                         -- sale price per unit
    total_price NUMERIC(18,2),
    payment_account_id TEXT,                          -- bank/cash leg
    gl_transaction_ids JSONB DEFAULT '[]'::jsonb,     -- linked journal entry ids
    note TEXT,
    movement_date DATE NOT NULL,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 3. Chart-of-Accounts mapping defaults (Dr/Cr per posting role)
CREATE TABLE IF NOT EXISTS public.inventory_settings (
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
    inventory_account_id TEXT,        -- Asset: Dr purchase / Cr sale+loss
    cogs_account_id TEXT,             -- Expense: Dr on sale
    revenue_account_id TEXT,          -- Revenue: Cr on sale
    adjustment_account_id TEXT,       -- Expense: Dr/Cr on adjustments
    payment_account_id TEXT,          -- Default bank/cash: Cr purchase / Dr sale
    updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- ============================================================
-- RLS: enable + per-table policies (idempotent)
-- ============================================================
DO $$
DECLARE
    t TEXT;
BEGIN
    FOREACH t IN ARRAY ARRAY['inventory_items', 'inventory_movements', 'inventory_settings']
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
CREATE INDEX IF NOT EXISTS idx_inventory_movements_item ON public.inventory_movements(item_id);
CREATE INDEX IF NOT EXISTS idx_inventory_movements_date ON public.inventory_movements(movement_date DESC);
