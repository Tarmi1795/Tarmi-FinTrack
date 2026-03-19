
# Supabase Database Setup

If you encounter **"Database error creating new user"**, **"Permission denied"**, or data disappearing after refresh (Sync Error), run this **entire** script in the Supabase SQL Editor.

This script will:
1.  **Grant Permissions**: Fixes "permission denied" errors.
2.  **Create Tables**: Sets up the database structure (including the critical `paid_amount` column and new `base_currency` field).
3.  **Run Migrations**: Adds missing columns to existing tables.

```sql
-- =================================================================
-- 0. PERMISSIONS (Fixes "permission denied" errors)
-- =================================================================
GRANT USAGE ON SCHEMA public TO postgres, anon, authenticated, service_role;

GRANT ALL ON ALL TABLES IN SCHEMA public TO postgres, anon, authenticated, service_role;
GRANT ALL ON ALL FUNCTIONS IN SCHEMA public TO postgres, anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO postgres, anon, authenticated, service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO postgres, anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO postgres, anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO postgres, anon, authenticated, service_role;

-- =================================================================
-- 1. CLEANUP (Fixes "Database error creating new user")
-- =================================================================
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS public.handle_new_user();


-- =================================================================
-- 2. CREATE TABLES
-- =================================================================

-- 1. PROFILES (Business Details)
create table if not exists public.fintrack_profiles (
  id uuid references auth.users on delete cascade not null primary key,
  name text,
  address text,
  phone text,
  email text,
  base_currency text, -- NEW: Stores user's primary reporting currency
  updated_at timestamp with time zone default timezone('utc'::text, now())
);
alter table public.fintrack_profiles enable row level security;
create policy "Manage own profile" on public.fintrack_profiles for all using (auth.uid() = id);

-- 2. ACCOUNTS (Chart of Accounts)
create table if not exists public.fintrack_accounts (
  id text not null,
  user_id uuid references auth.users on delete cascade not null,
  code text,
  name text,
  class text,
  level text,
  parent_id text,
  normal_balance text,
  is_posting boolean,
  is_system boolean,
  updated_at timestamp with time zone default timezone('utc'::text, now()),
  primary key (id, user_id)
);
alter table public.fintrack_accounts enable row level security;
create policy "Manage own accounts" on public.fintrack_accounts for all using (auth.uid() = user_id);

-- 3. PARTIES (Customers/Vendors)
create table if not exists public.fintrack_parties (
  id text not null,
  user_id uuid references auth.users on delete cascade not null,
  name text,
  type text,
  email text,
  phone text,
  address text,
  linked_account_id text,
  updated_at timestamp with time zone default timezone('utc'::text, now()),
  primary key (id, user_id)
);
alter table public.fintrack_parties enable row level security;
create policy "Manage own parties" on public.fintrack_parties for all using (auth.uid() = user_id);

-- 4. TRANSACTIONS (Ledger)
create table if not exists public.fintrack_transactions (
  id text not null,
  user_id uuid references auth.users on delete cascade not null,
  date text,
  type text,
  amount numeric, -- Stores BASE currency amount (normalized)
  original_amount numeric, -- Stores INPUT currency amount
  currency text, -- Stores INPUT currency code
  account_id text,
  payment_account_id text,
  source text,
  note text,
  related_party_id text,
  updated_at timestamp with time zone default timezone('utc'::text, now()),
  primary key (id, user_id)
);
alter table public.fintrack_transactions enable row level security;
create policy "Manage own transactions" on public.fintrack_transactions for all using (auth.uid() = user_id);

-- 5. ASSETS (Fixed Assets)
create table if not exists public.fintrack_assets (
  id text not null,
  user_id uuid references auth.users on delete cascade not null,
  name text,
  value numeric,
  original_value numeric,
  currency text,
  purchase_date text,
  useful_life_years numeric,
  last_depreciation_date text,
  note text,
  linked_account_id text,
  updated_at timestamp with time zone default timezone('utc'::text, now()),
  primary key (id, user_id)
);
alter table public.fintrack_assets enable row level security;
create policy "Manage own assets" on public.fintrack_assets for all using (auth.uid() = user_id);

-- 6. RECEIVABLES (Invoices/Bills)
create table if not exists public.fintrack_receivables (
  id text not null,
  user_id uuid references auth.users on delete cascade not null,
  type text,
  sub_type text,
  party_name text,
  party_id text,
  target_account_id text,
  amount numeric,
  paid_amount numeric default 0, -- Track partial payments
  original_amount numeric,
  currency text,
  issue_date text, 
  due_date text,
  status text,
  notes text,
  paid_date text,
  recurring jsonb,
  updated_at timestamp with time zone default timezone('utc'::text, now()),
  primary key (id, user_id)
);
alter table public.fintrack_receivables enable row level security;
create policy "Manage own receivables" on public.fintrack_receivables for all using (auth.uid() = user_id);

-- 7. RECURRING RULES
create table if not exists public.fintrack_recurring (
  id text not null,
  user_id uuid references auth.users on delete cascade not null,
  active boolean,
  type text,
  account_id text,
  amount numeric,
  currency text,
  source text,
  payment_account_id text,
  party_id text,
  note text,
  frequency text,
  next_due_date text,
  last_run_date text,
  original_amount numeric,
  updated_at timestamp with time zone default timezone('utc'::text, now()),
  primary key (id, user_id)
);
alter table public.fintrack_recurring enable row level security;
create policy "Manage own recurring" on public.fintrack_recurring for all using (auth.uid() = user_id);

-- 8. TEMPLATES (Shortcuts)
create table if not exists public.fintrack_templates (
  id text not null,
  user_id uuid references auth.users on delete cascade not null,
  name text,
  account_id text,
  amount numeric,
  currency text,
  note text,
  icon text,
  color text,
  party_id text,
  payment_account_id text,
  source text,
  updated_at timestamp with time zone default timezone('utc'::text, now()),
  primary key (id, user_id)
);
alter table public.fintrack_templates enable row level security;
create policy "Manage own templates" on public.fintrack_templates for all using (auth.uid() = user_id);

-- 9. BUDGETS
create table if not exists public.fintrack_budgets (
  month_key text not null,
  user_id uuid references auth.users on delete cascade not null,
  "limit" numeric,
  category_limits jsonb,
  visible_account_ids jsonb,
  updated_at timestamp with time zone default timezone('utc'::text, now()),
  primary key (month_key, user_id)
);
alter table public.fintrack_budgets enable row level security;
create policy "Manage own budgets" on public.fintrack_budgets for all using (auth.uid() = user_id);

-- 10. CURRENCY LOGS (Migration History)
create table if not exists public.fintrack_currency_logs (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users on delete cascade not null,
  old_currency text,
  new_currency text,
  conversion_rate numeric,
  migrated_at timestamp with time zone default timezone('utc'::text, now())
);
alter table public.fintrack_currency_logs enable row level security;
create policy "Manage own logs" on public.fintrack_currency_logs for all using (auth.uid() = user_id);


-- =================================================================
-- 3. SETUP NEW TRIGGER
-- =================================================================
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.fintrack_profiles (id, name, email)
  values (new.id, 'My Business', new.email);
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- =================================================================
-- 4. MIGRATIONS (Fixes for existing databases)
-- =================================================================

-- Add issue_date to receivables if missing
do $$
begin
  if not exists (select 1 from information_schema.columns where table_name = 'fintrack_receivables' and column_name = 'issue_date') then
    alter table public.fintrack_receivables add column issue_date text;
  end if;
end $$;

-- Add paid_amount to receivables if missing
do $$
begin
  if not exists (select 1 from information_schema.columns where table_name = 'fintrack_receivables' and column_name = 'paid_amount') then
    alter table public.fintrack_receivables add column paid_amount numeric default 0;
  end if;
end $$;

-- Add base_currency to profiles if missing
do $$
begin
  if not exists (select 1 from information_schema.columns where table_name = 'fintrack_profiles' and column_name = 'base_currency') then
    alter table public.fintrack_profiles add column base_currency text;
  end if;
end $$;
```
