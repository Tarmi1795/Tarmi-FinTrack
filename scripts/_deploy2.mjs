import fs from 'fs';
const TOKEN = fs.readFileSync('secrets/supabase.pat', 'utf8').trim();
const REF = 'hdwpzyfvabljqvtxjfsg';
const source = fs.readFileSync('supabase/functions/admin-invite/index.ts', 'utf8');

async function attempt(label, build) {
  try {
    const res = await fetch(`https://api.supabase.com/v1/projects/${REF}/functions`, { method: 'POST', headers: { Authorization: `Bearer ${TOKEN}` }, body: build() });
    const text = await res.text();
    console.log(`${label}: ${res.status} ${text.slice(0, 160)}`);
    return res.ok;
  } catch (e) { console.log(`${label}: EXC ${e.message}`); return false; }
}

// Variant A: metadata + files with explicit boundary via Blob names
const okA = await attempt('A-metadata+files', () => {
  const f = new FormData();
  f.append('metadata', JSON.stringify({ name: 'admin-invite', verify_jwt: true }));
  f.append('files', new Blob([source], { type: 'application/typescript' }), 'index.ts');
  return f;
});
if (okA) process.exit(0);

// Variant B: static_file style — single 'file' field
const okB = await attempt('B-file-field', () => {
  const f = new FormData();
  f.append('metadata', JSON.stringify({ name: 'admin-invite', verify_jwt: true, entrypoint_path: 'index.ts' }));
  f.append('file', new Blob([source], { type: 'application/typescript' }), 'index.ts');
  return f;
});
if (okB) process.exit(0);

// Variant C: JSON body with code field
const okC = await attempt('C-json-body', () => JSON.stringify({
  name: 'admin-invite', verify_jwt: true, entrypoint_path: 'index.ts',
  files: [{ name: 'index.ts', content: source }],
}));
if (okC) process.exit(0);
console.log('ALL VARIANTS FAILED');
