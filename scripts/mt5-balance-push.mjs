// Push MT5 broker balances into the Trading module (Supabase) via the
// mt5_push_balances SECURITY DEFINER RPC. See MT5_BALANCE_API.md for the full contract.
//
// Usage:
//   node scripts/mt5-balance-push.mjs --json '[{"strategy_id":"A0141065","name":"Flow Trading","balance":414.67,"currency":"USD"}]'
//   node scripts/mt5-balance-push.mjs --file updates.json [--note "MT5 EA 20:00"] [--dry-run]
//   node scripts/mt5-balance-push.mjs --key <MT5_API_KEY> ... [--url ...] [--anon ...]
//
// MT5 API key resolution order: --key flag, MT5_API_KEY env var, secrets/mt5-api-key.txt.
// Supabase URL + anon key come from the repo's .env (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY).
// Exit codes: 0 = all rows updated/would_update, 2 = some rows skipped, 1 = call failed.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

// --- tiny .env loader (no dependency) ---
const env = {};
try {
  for (const line of fs.readFileSync(path.join(ROOT, '.env'), 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
} catch { /* .env optional if --url/--anon given */ }

const args = process.argv.slice(2);
const getArg = (n) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : undefined; };

const URL_BASE = getArg('url') || env.VITE_SUPABASE_URL || 'https://hdwpzyfvabljqvtxjfsg.supabase.co';
const ANON = getArg('anon') || env.VITE_SUPABASE_ANON_KEY;
let KEY = getArg('key') || process.env.MT5_API_KEY;
if (!KEY) {
  const secretPath = path.join(ROOT, 'secrets', 'mt5-api-key.txt');
  if (fs.existsSync(secretPath)) KEY = fs.readFileSync(secretPath, 'utf8').trim();
}

let updates;
const jsonArg = getArg('json');
const fileArg = getArg('file');
if (jsonArg) updates = JSON.parse(jsonArg);
else if (fileArg) updates = JSON.parse(fs.readFileSync(fileArg, 'utf8'));
else {
  console.error('Provide --json or --file with an array of updates (see MT5_BALANCE_API.md)');
  process.exit(1);
}

if (!ANON) { console.error('Missing VITE_SUPABASE_ANON_KEY in .env (or --anon)'); process.exit(1); }
if (!KEY) { console.error('Missing MT5 API key (--key, MT5_API_KEY env, or secrets/mt5-api-key.txt)'); process.exit(1); }

const body = { p_api_key: KEY, p_updates: updates };
const note = getArg('note');
if (note) body.p_note = note;
if (args.includes('--dry-run')) body.p_dry_run = true;

const res = await fetch(`${URL_BASE}/rest/v1/rpc/mt5_push_balances`, {
  method: 'POST',
  headers: { apikey: ANON, Authorization: `Bearer ${ANON}`, 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});
const text = await res.text();
let out;
try { out = JSON.parse(text); } catch { out = text; }

if (!res.ok) {
  console.error(`HTTP ${res.status}: ${typeof out === 'string' ? out : JSON.stringify(out)}`);
  process.exit(1);
}

console.log(`snap_date ${out.snap_date}  updated ${out.updated}  skipped ${out.skipped}${out.dry_run ? '  (DRY RUN)' : ''}`);
for (const r of out.results) {
  const target = r.account_name || r.name || '?';
  const mark = r.status === 'updated' ? '+' : r.status === 'would_update' ? '~' : '!';
  const prev = r.previous_balance != null ? ` (was ${r.previous_balance})` : '';
  const bal = r.balance != null ? ` -> ${r.balance}${r.currency ? ' ' + r.currency : ''}` : '';
  console.log(`[${mark}] ${target}: ${r.status}${bal}${prev}${r.detail ? ' — ' + r.detail : ''}`);
}
if (out.results.some((r) => r.status !== 'updated' && r.status !== 'would_update')) process.exit(2);
