// One-time setup: creates the MT5 agent auth user + profile, verifies sign-in
// and the RPC contract end-to-end. Requires a Supabase access token (PAT):
//   node scripts/create-mt5-agent.mjs --token <PAT> [--password <pw>]

import fs from 'fs';
import crypto from 'crypto';

const args = process.argv.slice(2);
const getArg = (n) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : undefined; };
const TOKEN = getArg('token') || process.env.SUPABASE_ACCESS_TOKEN;
const REF = 'hdwpzyfvabljqvtxjfsg';
const EMAIL = 'mt5.agent@onesmartbiz.pro';

// Password from mt5-agent.env so the env stays the single source of truth
let PASSWORD = getArg('password');
if (!PASSWORD) {
  const env = fs.readFileSync('mt5-agent.env', 'utf8');
  PASSWORD = env.match(/MT5_AGENT_PASSWORD=(.+)/)?.[1]?.trim();
}
if (!TOKEN || !PASSWORD) {
  console.error('Usage: node scripts/create-mt5-agent.mjs --token <PAT> [--password <pw>] (mt5-agent.env must exist)');
  process.exit(1);
}

const API = `https://api.supabase.com/v1/projects/${REF}/database/query`;
async function sql(q) {
  const r = await fetch(API, { method: 'POST', headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ query: q }) });
  const b = await r.text();
  if (!r.ok) throw new Error(b.slice(0, 300));
  try { return JSON.parse(b) || []; } catch { return []; }
}

(async () => {
  // Idempotent: reuse the existing agent account when present, else create it
  const existing = await sql(`SELECT id FROM auth.users WHERE lower(email) = '${EMAIL}'`);
  let uid;
  if (existing.length > 0) {
    uid = existing[0].id;
    console.log(`auth user exists: ${uid}`);
    await sql(`UPDATE auth.users SET encrypted_password = crypt('${PASSWORD}', gen_salt('bf')),
      email_confirmed_at = COALESCE(email_confirmed_at, now()), updated_at = now()
      WHERE id = '${uid}'`);
  } else {
    uid = crypto.randomUUID();
    await sql(`
      INSERT INTO auth.users (instance_id, id, aud, role, email, encrypted_password,
        email_confirmed_at, created_at, updated_at,
        raw_app_meta_data, raw_user_meta_data)
      VALUES ('00000000-0000-0000-0000-000000000000', '${uid}', 'authenticated', 'authenticated',
        '${EMAIL}', crypt('${PASSWORD}', gen_salt('bf')), now(), now(), now(),
        '{"provider":"email","providers":["email"]}', '{}')`);
    console.log(`auth user created: ${uid}`);
  }
  const ident = await sql(`SELECT 1 FROM auth.identities WHERE user_id = '${uid}' AND provider_id = 'email'`);
  if (ident.length === 0) {
    await sql(`
      INSERT INTO auth.identities (id, user_id, provider_id, provider, identity_data, last_sign_in_at, created_at, updated_at)
      VALUES ('${uid}', '${uid}', 'email', 'email',
        jsonb_build_object('sub', '${uid}', 'email', '${EMAIL}'), now(), now(), now())`);
  }
  await sql(`
    INSERT INTO public.fintrack_profiles (id, name, email, role)
    VALUES ('${uid}', 'MT5 Agent', '${EMAIL}', 'agent')
    ON CONFLICT (id) DO UPDATE SET role = 'agent', email = '${EMAIL}', updated_at = now()`);

  // Verify sign-in + RPC end-to-end with the anon key
  const URL = 'https://hdwpzyfvabljqvtxjfsg.supabase.co';
  const ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imhkd3B6eWZ2YWJsanF2dHhqZnNnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjczNzkyODAsImV4cCI6MjA4Mjk1NTI4MH0.dyzZSPqczQFisBEIhUMPZtG4cr30FGEeaHS785kmUvI';
  const tr = await fetch(`${URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  const authBody = await tr.text();
  if (!tr.ok) throw new Error(`sign-in failed: ${authBody.slice(0, 200)}`);
  const jwt = JSON.parse(authBody).access_token;
  console.log('VERIFY sign-in: OK');

  const target = 'f508f7b1-7cc2-4ded-b055-612a852c00c4';
  console.log('VERIFY rpc list:')
  const r2 = await fetch(`${URL}/rest/v1/rpc/mt5_list_accounts`, {
    method: 'POST',
    headers: { apikey: ANON, Authorization: `Bearer ${jwt}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_user_id: target }),
  });
  console.log(`  mt5_list_accounts: ${r2.status}`, (await r2.text()).slice(0, 200));

  console.log(`\nDONE. Agent ${EMAIL} ready — credentials already in mt5-agent.env`);
})();
