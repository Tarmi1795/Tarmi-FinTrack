import fs from 'fs';
const TOKEN = fs.readFileSync('secrets/supabase.pat', 'utf8').trim();
const API = 'https://api.supabase.com/v1/projects/hdwpzyfvabljqvtxjfsg/database/query';
async function sql(q){const r=await fetch(API,{method:'POST',headers:{Authorization:`Bearer ${TOKEN}`,'Content-Type':'application/json'},body:JSON.stringify({query:q})});const b=await r.text();if(!r.ok)throw new Error(b.slice(0,300));try{return JSON.parse(b)||[];}catch{return[];}}
(async () => {
  const dir = `db_backups/${new Date().toISOString().replace(/[:.]/g, '-')}`;
  const tables = (await sql(`SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE' ORDER BY table_name`)).map(r => r.table_name);
  fs.mkdirSync(dir, { recursive: true });
  for (const t of tables) { const rows = await sql(`SELECT * FROM public."${t}"`); fs.writeFileSync(`${dir}/${t}.json`, JSON.stringify(rows, null, 2)); }
  console.log(`BACKUP OK -> ${dir} (${tables.length} tables)`);
  await sql(fs.readFileSync('supabase_trading_terminal_migration.sql', 'utf8'));
  console.log('MIGRATE OK: trading terminal');
  const c = await sql(`SELECT count(*)::int AS n FROM information_schema.tables WHERE table_name='trading_trades' AND table_schema='public'`);
  console.log(`VERIFY trading_trades: ${c[0].n ? 'exists' : 'MISSING'}`);
})().catch(e=>{console.error(`FAILED: ${e.message}`);process.exit(1);});
