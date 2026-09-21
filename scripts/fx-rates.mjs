// Update trading FX rates for a user (base currency = the app profile's base).
// Usage: node scripts/fx-rates.mjs --token <PAT> --set QAR=1,PHP=0.05787,USD=3.631944,EUR=4.164942 [--prune] [--email x@y.z]
// --prune removes any other currency rows for that user.

import path from 'path';

const args = process.argv.slice(2);
const getArg = (n) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : undefined; };

const TOKEN = getArg('token') || process.env.SUPABASE_ACCESS_TOKEN;
const REF = getArg('ref') || 'hdwpzyfvabljqvtxjfsg';
const SET = getArg('set') || '';
const PRUNE = args.includes('--prune');
const EMAIL = (getArg('email') || '').toLowerCase();

if (!TOKEN || !SET) {
  console.error('Usage: node scripts/fx-rates.mjs --token <PAT> --set QAR=1,PHP=0.05787 [--prune]');
  process.exit(1);
}

const API = `https://api.supabase.com/v1/projects/${REF}/database/query`;

async function sql(query) {
  const res = await fetch(API, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  const body = await res.text();
  let parsed;
  try { parsed = JSON.parse(body); } catch { parsed = body; }
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${typeof parsed === 'object' ? JSON.stringify(parsed) : parsed}`);
  return Array.isArray(parsed) ? parsed : [];
}

(async () => {
  const users = await sql(`SELECT id, email FROM auth.users ORDER BY created_at`);
  let user = users.find((u) => EMAIL && u.email.toLowerCase() === EMAIL);
  if (!user) {
    const counts = await sql(`SELECT user_id, count(*)::int AS n FROM public.fintrack_transactions GROUP BY user_id ORDER BY n DESC`);
    user = users.find((u) => u.id === counts[0]?.user_id) || users[0];
  }
  console.log(`User: ${user.id} (${user.email.replace(/^(.).*(@.*)$/, '$1***$2')})`);

  const pairs = SET.split(',').map((p) => p.split('=')).filter(([c, v]) => c && v && !isNaN(Number(v)));
  if (pairs.length === 0) { console.error('No valid currency=rate pairs in --set'); process.exit(1); }

  const values = pairs.map(([c, v]) => `('${user.id}', '${c.trim().toUpperCase()}', ${Number(v)})`).join(', ');
  await sql(
    `INSERT INTO public.trading_fx_rates (user_id, currency, rate_to_base)
     VALUES ${values}
     ON CONFLICT (user_id, currency) DO UPDATE SET rate_to_base = EXCLUDED.rate_to_base, updated_at = now()`
  );
  console.log(`Set: ${pairs.map(([c, v]) => `${c}=${v}`).join(', ')}`);

  if (PRUNE) {
    const keep = pairs.map(([c]) => `'${c.trim().toUpperCase()}'`).join(', ');
    const del = await sql(`DELETE FROM public.trading_fx_rates WHERE user_id = '${user.id}' AND currency NOT IN (${keep}) RETURNING currency`);
    if (del.length) console.log(`Pruned: ${del.map((r) => r.currency).join(', ')}`);
  }

  const rows = await sql(`SELECT currency, rate_to_base FROM public.trading_fx_rates WHERE user_id = '${user.id}' ORDER BY currency`);
  console.log('Current rates:');
  rows.forEach((r) => console.log(`  1 ${r.currency} = ${r.rate_to_base} (base)`));
})().catch((e) => { console.error(`FAILED: ${e.message}`); process.exit(1); });
