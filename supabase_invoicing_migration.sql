-- Migration: Invoicing Module
-- Description: Customer quotes/invoices with line items, tax and discount.
--               Ledger posting (receivable + accrual journal entries) happens in the app;
--               gl_receivable_id links each sent invoice back to the receivable it created.
--               Re-runnable: IF NOT EXISTS + DROP POLICY IF EXISTS.

-- 1. Invoices (quotes, sent, partially paid, paid, void)
CREATE TABLE IF NOT EXISTS public.invoices (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    invoice_no TEXT NOT NULL,                    -- e.g. INV-0001 (per-user sequence, generated client-side)
    status TEXT CHECK (status IN ('quote', 'sent', 'partial', 'paid', 'void')) DEFAULT 'quote' NOT NULL,
    party_id TEXT,                               -- Party.id in the main app (nullable — walk-in customers)
    party_name TEXT NOT NULL,
    issue_date DATE NOT NULL,
    due_date DATE NOT NULL,
    currency TEXT DEFAULT 'QAR' NOT NULL,        -- 'QAR' | 'PHP'
    lines JSONB DEFAULT '[]'::jsonb NOT NULL,    -- [{ description, quantity, unit_price }]
    tax_pct NUMERIC(5,2) DEFAULT 0,
    discount NUMERIC(18,2) DEFAULT 0,
    notes TEXT,
    gl_receivable_id TEXT,                       -- Receivable.id created when the invoice was sent
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- ============================================================
-- RLS: enable + policies (idempotent)
-- ============================================================
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own invoices" ON public.invoices;
CREATE POLICY "Users can view their own invoices" ON public.invoices FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert their own invoices" ON public.invoices;
CREATE POLICY "Users can insert their own invoices" ON public.invoices FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own invoices" ON public.invoices;
CREATE POLICY "Users can update their own invoices" ON public.invoices FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete their own invoices" ON public.invoices;
CREATE POLICY "Users can delete their own invoices" ON public.invoices FOR DELETE USING (auth.uid() = user_id);

-- Index for the common access path
CREATE INDEX IF NOT EXISTS idx_invoices_user ON public.invoices(user_id);
