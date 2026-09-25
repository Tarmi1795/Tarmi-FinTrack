-- Migration: Receipt Capture Module
-- Description: AI receipt capture — metadata table (public.receipts) linking an uploaded
--               receipt image to a ledger transaction, plus a private Supabase Storage
--               bucket ('receipts'). Objects are stored per-user with the path pattern:
--               '{user_id}/{transaction_id}-{timestamp}.{ext}' (first folder = user id).
--               Re-runnable: uses IF NOT EXISTS + DROP POLICY IF EXISTS.

-- 1. Receipt metadata (one row per uploaded receipt image)
CREATE TABLE IF NOT EXISTS public.receipts (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    transaction_id TEXT NOT NULL,                -- id of the journal entry in fintrack_transactions
    storage_path TEXT NOT NULL,                  -- path of the file inside the 'receipts' bucket
    extracted JSONB,                             -- AI-extracted fields (vendor, amount, date, ...)
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- ============================================================
-- RLS: enable + per-table policies (idempotent)
-- ============================================================
DO $$
BEGIN
    EXECUTE 'ALTER TABLE public.receipts ENABLE ROW LEVEL SECURITY';

    EXECUTE 'DROP POLICY IF EXISTS "Users can view their own receipts" ON public.receipts';
    EXECUTE 'CREATE POLICY "Users can view their own receipts" ON public.receipts FOR SELECT USING (auth.uid() = user_id)';

    EXECUTE 'DROP POLICY IF EXISTS "Users can insert their own receipts" ON public.receipts';
    EXECUTE 'CREATE POLICY "Users can insert their own receipts" ON public.receipts FOR INSERT WITH CHECK (auth.uid() = user_id)';

    EXECUTE 'DROP POLICY IF EXISTS "Users can update their own receipts" ON public.receipts';
    EXECUTE 'CREATE POLICY "Users can update their own receipts" ON public.receipts FOR UPDATE USING (auth.uid() = user_id)';

    EXECUTE 'DROP POLICY IF EXISTS "Users can delete their own receipts" ON public.receipts';
    EXECUTE 'CREATE POLICY "Users can delete their own receipts" ON public.receipts FOR DELETE USING (auth.uid() = user_id)';
END $$;

-- Index for the common access path (attachments per transaction)
CREATE INDEX IF NOT EXISTS idx_receipts_transaction ON public.receipts(transaction_id);

-- ============================================================
-- Storage: private 'receipts' bucket + object policies
-- Object path pattern: '{user_id}/{transaction_id}-{timestamp}.{ext}'
-- (first folder segment must equal the owner's auth.uid(), enforced below)
-- ============================================================
INSERT INTO storage.buckets (id, name, public) VALUES ('receipts', 'receipts', false)
ON CONFLICT (id) DO NOTHING;

DO $$
BEGIN
    EXECUTE 'DROP POLICY IF EXISTS "Users can read own receipts" ON storage.objects';
    EXECUTE 'CREATE POLICY "Users can read own receipts" ON storage.objects FOR SELECT USING (bucket_id = ''receipts'' AND auth.uid()::text = (storage.foldername(name))[1])';

    EXECUTE 'DROP POLICY IF EXISTS "Users can upload own receipts" ON storage.objects';
    EXECUTE 'CREATE POLICY "Users can upload own receipts" ON storage.objects FOR INSERT WITH CHECK (bucket_id = ''receipts'' AND auth.uid()::text = (storage.foldername(name))[1])';

    EXECUTE 'DROP POLICY IF EXISTS "Users can update own receipts" ON storage.objects';
    EXECUTE 'CREATE POLICY "Users can update own receipts" ON storage.objects FOR UPDATE USING (bucket_id = ''receipts'' AND auth.uid()::text = (storage.foldername(name))[1])';

    EXECUTE 'DROP POLICY IF EXISTS "Users can delete own receipts" ON storage.objects';
    EXECUTE 'CREATE POLICY "Users can delete own receipts" ON storage.objects FOR DELETE USING (bucket_id = ''receipts'' AND auth.uid()::text = (storage.foldername(name))[1])';
END $$;
