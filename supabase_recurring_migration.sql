-- =================================================================
-- RECURRING ACCRUAL MIGRATION
-- Adds columns to integrate recurring rules with AR/AP
-- Run this in your Supabase SQL Editor
-- =================================================================

do $$
begin
  if not exists (select 1 from information_schema.columns where table_name = 'fintrack_recurring' and column_name = 'generation_type') then
    alter table public.fintrack_recurring add column generation_type text default 'transaction';
  end if;
end $$;

do $$
begin
  if not exists (select 1 from information_schema.columns where table_name = 'fintrack_recurring' and column_name = 'receivable_type') then
    alter table public.fintrack_recurring add column receivable_type text;
  end if;
end $$;

do $$
begin
  if not exists (select 1 from information_schema.columns where table_name = 'fintrack_recurring' and column_name = 'due_days') then
    alter table public.fintrack_recurring add column due_days numeric;
  end if;
end $$;
