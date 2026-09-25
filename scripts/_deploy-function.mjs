import fs from 'fs';
const TOKEN = fs.readFileSync('secrets/supabase.pat', 'utf8').trim();
const REF = 'hdwpzyfvabljqvtxjfsg';
const source = fs.readFileSync('supabase/functions/admin-invite/index.ts', 'utf8');

const form = new FormData();
form.append('metadata', JSON.stringify({
  name: 'admin-invite',
  verify_jwt: true,
  entrypoint_path: 'index.ts',
}));
form.append('files', new Blob([source], { type: 'application/typescript' }), 'index.ts');

const res = await fetch(`https://api.supabase.com/v1/projects/${REF}/functions`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${TOKEN}` },
  body: form,
});
const text = await res.text();
console.log(`DEPLOY ${res.status}: ${text.slice(0, 300)}`);
