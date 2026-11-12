import fs from 'fs';
const TOKEN = fs.readFileSync('secrets/supabase.pat', 'utf8').trim();
const API = 'https://api.supabase.com/v1/projects/hdwpzyfvabljqvtxjfsg/database/query';
async function sql(q){const r=await fetch(API,{method:'POST',headers:{Authorization:`Bearer ${TOKEN}`,'Content-Type':'application/json'},body:JSON.stringify({query:q})});const b=await r.text();if(!r.ok)throw new Error(b.slice(0,300));try{return JSON.parse(b)||[];}catch{return[];}}
(async () => {
  const grants = await sql(`
    SELECT routine_name, grantee, privilege_type
    FROM information_schema.role_routine_grants
    WHERE routine_schema = 'public'
      AND routine_name IN ('mt5_upsert_balance','mt5_post_trade','mt5_list_accounts','mt5_push_cashflow','mt5_push_balances')
    ORDER BY routine_name, grantee`);
  grants.forEach(g => console.log(`${g.routine_name.padEnd(22)} ${g.grantee.padEnd(20)} ${g.privilege_type}`));
  const missing = await sql(`
    SELECT t.table_name FROM information_schema.tables t
    WHERE t.table_schema='public' AND t.rowsecurity = false`);
  console.log(missing.length ? 'RLS OFF: ' + missing.map(t=>t.table_name).join(', ') : 'RLS ON: all public tables');
})();
