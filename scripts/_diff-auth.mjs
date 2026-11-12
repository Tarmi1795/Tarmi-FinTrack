import fs from 'fs';
const TOKEN = fs.readFileSync('secrets/supabase.pat', 'utf8').trim();
const API = 'https://api.supabase.com/v1/projects/hdwpzyfvabljqvtxjfsg/database/query';
async function sql(q){const r=await fetch(API,{method:'POST',headers:{Authorization:`Bearer ${TOKEN}`,'Content-Type':'application/json'},body:JSON.stringify({query:q})});const b=await r.text();if(!r.ok)throw new Error(b.slice(0,300));try{return JSON.parse(b)||[];}catch{return[];}}
(async () => {
  const rows = await sql(`
    SELECT jsonb_pretty(to_jsonb(u)) AS row
    FROM auth.users u
    WHERE u.email IN ('mt5.agent@onesmartbiz.pro', 'zgianpaulo@gmail.com')`);
  if (rows.length < 2) { console.log('rows found:', rows.length); return; }
  const agent = JSON.parse(rows.find(r => JSON.stringify(r).includes('mt5.agent')).row);
  const human = JSON.parse(rows.find(r => !JSON.stringify(r).includes('mt5.agent')).row);
  const keys = new Set([...Object.keys(agent), ...Object.keys(human)]);
  const ignored = new Set(['id', 'email', 'encrypted_password', 'created_at', 'updated_at', 'last_sign_in_at', 'confirmation_sent_at', 'recovery_sent_at', 'email_change_sent_at', 'phone_change_sent_at', 'reauthentication_sent_at']);
  for (const k of keys) {
    if (ignored.has(k)) continue;
    if (JSON.stringify(agent[k]) !== JSON.stringify(human[k]))
      console.log(`${k}: agent=${JSON.stringify(agent[k])} | human=${JSON.stringify(human[k])}`);
  }
  // identities shape
  const ids = await sql(`
    SELECT jsonb_pretty(to_jsonb(i)) AS row FROM auth.identities i
    WHERE i.user_id IN (SELECT id FROM auth.users WHERE email IN ('mt5.agent@onesmartbiz.pro','zgianpaulo@gmail.com'))`);
  ids.forEach(r => console.log('IDENTITY:', r.row));
})().catch(e=>{console.error(`FAILED: ${e.message}`);process.exit(1);});
