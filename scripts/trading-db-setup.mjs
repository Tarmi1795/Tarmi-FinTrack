// Trading module DB setup: backup -> migrate -> seed -> verify
// Usage: node scripts/trading-db-setup.mjs --token <SUPABASE_PAT> [--ref <project_ref>] [--email <user-email>]
// The token is used only for this run and never stored.

import fs from 'fs';
import path from 'path';

const args = process.argv.slice(2);
const getArg = (name) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};

const TOKEN = getArg('token') || process.env.SUPABASE_ACCESS_TOKEN;
const REF = getArg('ref') || 'hdwpzyfvabljqvtxjfsg';
const EMAIL_FILTER = (getArg('email') || '').toLowerCase();

if (!TOKEN) {
  console.error('Missing token. Pass --token <PAT> or set SUPABASE_ACCESS_TOKEN.');
  process.exit(1);
}

const API = `https://api.supabase.com/v1/projects/${REF}/database/query`;

async function sql(query) {
  const res = await fetch(API, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  const text = await res.text();
  let body;
  try { body = JSON.parse(text); } catch { body = text; }
  if (!res.ok) {
    const msg = typeof body === 'object' ? JSON.stringify(body) : body;
    throw new Error(`HTTP ${res.status} on query "${query.slice(0, 60)}...": ${msg}`);
  }
  return Array.isArray(body) ? body : [];
}

const today = new Date().toISOString().slice(0, 10);

// ---------- 1. BACKUP ----------
async function backup() {
  const dir = path.resolve(`db_backups/${new Date().toISOString().replace(/[:.]/g, '-')}`);
  fs.mkdirSync(dir, { recursive: true });
  const tables = (await sql(
    `SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE' ORDER BY table_name`
  )).map((r) => r.table_name);

  const manifest = { created: new Date().toISOString(), project: REF, tables: {} };
  for (const t of tables) {
    const rows = await sql(`SELECT * FROM public."${t}"`);
    fs.writeFileSync(path.join(dir, `${t}.json`), JSON.stringify(rows, null, 2));
    manifest.tables[t] = rows.length;
  }
  fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify(manifest, null, 2));
  console.log(`BACKUP OK -> ${dir}`);
  console.log(`  tables: ${tables.map((t) => `${t}(${manifest.tables[t]})`).join(', ')}`);
  return dir;
}

// ---------- 2. MIGRATION ----------
const MIGRATION_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS public.trading_accounts (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    name TEXT NOT NULL,
    broker TEXT,
    currency TEXT DEFAULT 'QAR' NOT NULL,
    notes TEXT,
    is_active BOOLEAN DEFAULT true NOT NULL,
    sort_order INTEGER DEFAULT 0 NOT NULL,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS public.trading_cashflows (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    account_id UUID REFERENCES public.trading_accounts(id) ON DELETE CASCADE NOT NULL,
    flow_type TEXT CHECK (flow_type IN ('deposit', 'withdrawal')) NOT NULL,
    amount NUMERIC(18,2) NOT NULL,
    fx_rate NUMERIC(18,6),
    flow_date DATE NOT NULL,
    gl_transaction_id TEXT,
    bank_account_id TEXT,
    note TEXT,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS public.trading_snapshots (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    account_id UUID REFERENCES public.trading_accounts(id) ON DELETE CASCADE NOT NULL,
    balance NUMERIC(18,2) NOT NULL,
    snap_date DATE NOT NULL,
    fx_rate NUMERIC(18,6),
    note TEXT,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    UNIQUE (account_id, snap_date)
  )`,
  `CREATE TABLE IF NOT EXISTS public.trading_fx_rates (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    currency TEXT NOT NULL,
    rate_to_base NUMERIC(18,6) NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    UNIQUE (user_id, currency)
  )`,
  `CREATE TABLE IF NOT EXISTS public.trading_settings (
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
    linked_gl_account_id TEXT,
    updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
  )`,
  `DO $$
  DECLARE t TEXT;
  BEGIN
    FOREACH t IN ARRAY ARRAY['trading_accounts', 'trading_cashflows', 'trading_snapshots', 'trading_fx_rates', 'trading_settings']
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
  END $$`,
  `CREATE INDEX IF NOT EXISTS idx_trading_cashflows_account ON public.trading_cashflows(account_id)`,
  `CREATE INDEX IF NOT EXISTS idx_trading_snapshots_account_date ON public.trading_snapshots(account_id, snap_date DESC)`,
];

async function migrate() {
  for (const stmt of MIGRATION_STATEMENTS) {
    await sql(stmt);
    console.log(`MIGRATE OK: ${stmt.slice(0, 55).replace(/\s+/g, ' ')}...`);
  }
}

// ---------- 3. SEED (from the user's spreadsheet) ----------
const FX_RATES = [
  { currency: 'QAR', rate_to_base: 17.28 },
  { currency: 'USD', rate_to_base: 62.76 },
  { currency: 'EUR', rate_to_base: 71.95 },
];

const SEED_ACCOUNTS = [
  { name: 'Profit engine', currency: 'USD', capital: 998.02, balance: 570.92 },
  { name: 'JC ICT', currency: 'USD', capital: 50.0, balance: 53.73 },
  { name: 'EDUARDO', currency: 'USD', capital: 50.0, balance: 58.57 },
  { name: 'SHERWOOD', currency: 'EUR', capital: 291.17, balance: 351.66 },
  { name: 'TradingView', currency: 'USD', capital: 200.0, balance: 188.0 },
  { name: 'Binance', currency: 'USD', capital: 2800.0, balance: 2959.48 },
  { name: 'Exness', currency: 'PHP', capital: 95000.0, balance: 0.0 },
];

async function resolveUser() {
  const users = await sql(`SELECT id, email, created_at FROM auth.users ORDER BY created_at`);
  if (users.length === 0) throw new Error('No users found in auth.users');
  let user = users.find((u) => EMAIL_FILTER && u.email.toLowerCase() === EMAIL_FILTER);
  if (!user) {
    // fall back to the user who owns the most transactions
    const counts = await sql(
      `SELECT user_id, count(*)::int AS n FROM public.fintrack_transactions GROUP BY user_id ORDER BY n DESC`
    ).catch(() => []);
    if (counts.length > 0) {
      user = users.find((u) => u.id === counts[0].user_id) || users[0];
    } else {
      user = users[0];
    }
  }
  const email = user.email.replace(/^(.).*(@.*)$/, '$1***$2');
  console.log(`SEED user: ${user.id} (${email})${users.length > 1 ? ` [of ${users.length} users]` : ''}`);
  return user;
}

async function seed() {
  const user = await resolveUser();

  const existing = await sql(`SELECT count(*)::int AS n FROM public.trading_accounts WHERE user_id = '${user.id}'`);
  if (existing[0].n > 0) {
    console.log(`SEED skipped: ${existing[0].n} trading accounts already exist for this user.`);
    return;
  }

  for (const [i, acc] of SEED_ACCOUNTS.entries()) {
    const inserted = await sql(
      `INSERT INTO public.trading_accounts (user_id, name, currency, is_active, sort_order)
       VALUES ('${user.id}', '${acc.name.replace(/'/g, "''")}', '${acc.currency}', true, ${i})
       RETURNING id`
    );
    const accountId = inserted[0].id;
    const fx = FX_RATES.find((r) => r.currency === acc.currency)?.rate_to_base ?? 1;

    await sql(
      `INSERT INTO public.trading_cashflows (user_id, account_id, flow_type, amount, fx_rate, flow_date, note)
       VALUES ('${user.id}', '${accountId}', 'deposit', ${acc.capital}, ${fx}, '${today}', 'Initial capital (from tracking sheet)')`
    );
    await sql(
      `INSERT INTO public.trading_snapshots (user_id, account_id, balance, snap_date, fx_rate, note)
       VALUES ('${user.id}', '${accountId}', ${acc.balance}, '${today}', ${fx}, 'Initial balance (from tracking sheet)')`
    );
    console.log(`SEED account: ${acc.name} (${acc.currency}) capital=${acc.capital} balance=${acc.balance}`);
  }

  for (const r of FX_RATES) {
    await sql(
      `INSERT INTO public.trading_fx_rates (user_id, currency, rate_to_base)
       VALUES ('${user.id}', '${r.currency}', ${r.rate_to_base})
       ON CONFLICT (user_id, currency) DO UPDATE SET rate_to_base = ${r.rate_to_base}`
    );
  }
  console.log(`SEED fx rates: ${FX_RATES.map((r) => `${r.currency}=${r.rate_to_base}`).join(', ')}`);
}

// ---------- 4. VERIFY ----------
async function verify() {
  for (const t of ['trading_accounts', 'trading_cashflows', 'trading_snapshots', 'trading_fx_rates', 'trading_settings']) {
    const rows = await sql(`SELECT count(*)::int AS n FROM public.${t}`);
    console.log(`VERIFY ${t}: ${rows[0].n} rows`);
  }
  const sample = await sql(`SELECT name, currency FROM public.trading_accounts ORDER BY sort_order`);
  console.log(`VERIFY accounts: ${sample.map((r) => `${r.name}(${r.currency})`).join(', ')}`);
}

// ---------- RUN ----------
(async () => {
  try {
    console.log(`=== Trading DB setup — project ${REF} — ${new Date().toISOString()} ===`);
    await backup();
    await migrate();
    await seed();
    await verify();
    console.log('=== DONE ===');
  } catch (e) {
    console.error(`FAILED: ${e.message}`);
    process.exit(1);
  }
})();
