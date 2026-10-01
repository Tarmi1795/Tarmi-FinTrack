-- Migration: Inventory item images
-- Description: image_path column on inventory items + a private storage bucket
--               scoped per user (same folder policy pattern as receipts).
--               Re-runnable.

ALTER TABLE public.inventory_items ADD COLUMN IF NOT EXISTS image_path TEXT;

INSERT INTO storage.buckets (id, name, public) VALUES ('inventory-images', 'inventory-images', false)
ON CONFLICT (id) DO NOTHING;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='Users can read own inventory images') THEN
    CREATE POLICY "Users can read own inventory images" ON storage.objects FOR SELECT
      USING (bucket_id = 'inventory-images' AND auth.uid()::text = (storage.foldername(name))[1]);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='Users can upload own inventory images') THEN
    CREATE POLICY "Users can upload own inventory images" ON storage.objects FOR INSERT
      WITH CHECK (bucket_id = 'inventory-images' AND auth.uid()::text = (storage.foldername(name))[1]);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='Users can update own inventory images') THEN
    CREATE POLICY "Users can update own inventory images" ON storage.objects FOR UPDATE
      USING (bucket_id = 'inventory-images' AND auth.uid()::text = (storage.foldername(name))[1]);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='Users can delete own inventory images') THEN
    CREATE POLICY "Users can delete own inventory images" ON storage.objects FOR DELETE
      USING (bucket_id = 'inventory-images' AND auth.uid()::text = (storage.foldername(name))[1]);
  END IF;
END $$;
