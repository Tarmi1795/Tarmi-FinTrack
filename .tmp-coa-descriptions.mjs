// One-off: add description column to fintrack_accounts and write AI-oriented
// routing descriptions for every account of the primary user.
import fs from 'fs';
import path from 'path';

const TOKEN = fs.readFileSync('secrets/supabase.pat', 'utf8').trim();
const USER_ID = 'f508f7b1-7cc2-4ded-b055-612a852c00c4';
const API = 'https://api.supabase.com/v1/projects/hdwpzyfvabljqvtxjfsg/database/query';

async function sql(query) {
  const res = await fetch(API, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${text.slice(0, 300)}`);
  const body = JSON.parse(text);
  if (!Array.isArray(body)) throw new Error(`Unexpected body: ${JSON.stringify(body).slice(0, 200)}`);
  return body;
}

// ---------- 1. Backup ----------
const dir = path.resolve(`db_backups/${new Date().toISOString().replace(/[:.]/g, '-')}`);
fs.mkdirSync(dir, { recursive: true });
const tables = (await sql(
  `SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE' ORDER BY table_name`
)).map((r) => r.table_name);
const manifest = { created: new Date().toISOString(), project: 'hdwpzyfvabljqvtxjfsg', tables: {} };
for (const t of tables) {
  const rows = await sql(`SELECT * FROM public."${t}"`);
  fs.writeFileSync(path.join(dir, `${t}.json`), JSON.stringify(rows, null, 2));
  manifest.tables[t] = rows.length;
}
fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify(manifest, null, 2));
console.log(`BACKUP OK -> ${dir}`);

// ---------- 2. Add column ----------
await sql(`ALTER TABLE public.fintrack_accounts ADD COLUMN IF NOT EXISTS description TEXT`);
console.log('COLUMN description ensured');

// ---------- 3. Build descriptions ----------
const accounts = await sql(`SELECT id, code, name, class, level, is_posting FROM fintrack_accounts WHERE user_id='${USER_ID}' ORDER BY code`);
console.log(`Accounts to describe: ${accounts.length}`);

const OVERRIDES = {
  '1001|Bank (CBQ)': 'Primary CBQ bank current account. Debit when money is received (deposits, incoming transfers), credit when money goes out (payments, withdrawals, card bills).',
  '1002|Cash on Hand': 'Physical cash (petty cash, counter takings). Debit when cash is received, credit when cash is paid out or banked.',
  '1003|GCash / E-Wallet': 'Mobile wallet / e-money balances (GCash and similar). Debit when the wallet receives funds, credit when spent, withdrawn or transferred.',
  '1004|Credit Card': 'Credit card spending and outstanding card balance. Debit when the card is used to pay for something, credit when the card bill is settled.',
  '1005|Cash Adj.': 'Cash-count over/short adjustments from money-counter reconciliations. Debit shortage, credit overage.',
  '1006|Trading Account': 'Broker/trading account balance mirrored from the Trading module. Comparison only — the trading module never posts journal entries here.',
  '1101|Refundable': 'Refundable deposits and advances paid out (recoverable money). Debit when a deposit/advance is paid, credit when it is refunded or applied.',
  '11210|Inventory on Hand': 'Stock of goods for resale, valued at cost (liquor/retail inventory). Debit when stock is purchased, credit for cost of goods sold, shrinkage or adjustments.',
  '21100|Accounts Payable': 'Money owed to suppliers and creditors for purchases on credit. Credit when a payable is incurred, debit when it is paid.',
  '31000|Opening Balance Equity': 'One-time offset for opening balances entered when the books were started. Should be zero after setup; post here only when entering initial balances.',
  '32000|Retained Earnings': 'Accumulated undistributed profits from prior periods. System-managed at closing; do not post manually.',
  '4001|Flat 21 Collection': 'Rent and utility collections from Flat 21 (Building 21) tenants. Credit when tenant rent is collected.',
  '4002|Flat 7 Collection': 'Rent and utility collections from Flat 7 tenants. Credit when tenant rent is collected.',
  '4003|Web Development': 'Income from web development projects and client website work. Credit when invoiced or paid.',
  '4004|Dropshipping': 'Income from dropshipping sales. Credit when an order revenue is recognized.',
  '4005|MultiMedia': 'Income from multimedia services and projects. Credit when earned.',
  '4006|Alak Sale (CLOSED)': 'CLOSED (historical). Liquor sales recorded before the Inventory module. New liquor/product sales go to 41200 Inventory Sales.',
  '4007|Interest Income': 'Interest earned on bank deposits or savings. Credit when interest is credited.',
  '4100|Salary': 'Salary or wage income received. Credit when salary is received.',
  '41100|Consulting Services': 'Income from consulting engagements and professional advice. Credit when consulting revenue is earned.',
  '41200|Inventory Sales': 'Revenue from selling inventory items (liquor/retail goods). Credit the sale amount here; the matching Dr side is the receiving cash/bank account and the cost goes to 51300 COGS.',
  '5001|Flat 21 Rent': 'Rent expense for Flat 21 / Building 21. Debit when flat rent is paid.',
  '5002|Flat 7 Rent': 'Rent expense for Flat 7. Debit when flat rent is paid.',
  '5003|21 Utilities': 'Kahramaa (electricity/water) bills for Flat 21 / Building 21. Debit when paid.',
  '5004|7 Utilities': 'Kahramaa (electricity/water) bills for Flat 7 / Building 7. Debit when paid.',
  '5005|21 WIFI': 'Internet/WiFi subscription for Flat 21 / Building 21. Debit when paid.',
  '5006|7 WIFI': 'Internet/WiFi subscription for Flat 7 / Building 7. Debit when paid.',
  '5007|Flat Maintenance': 'Repairs and upkeep of the rented flats (plumbing, AC, fixtures). Debit when paid.',
  '5008|Marketing': 'Advertising, promotion and boosted posts. Debit when paid.',
  '5009|Alak Cost (CLOSED)': 'CLOSED (historical). Liquor purchases recorded before the Inventory module. Stock purchases now debit 11210 Inventory on Hand.',
  '5010|Other Cost': 'Miscellaneous costs that do not fit any specific direct-cost category. Use only when nothing else matches.',
  '5056|Licenses': 'Government and business licenses, permits, renewals (e.g. Baladiya, QDC-related permits). Debit when paid.',
  '51100|Web Hosting & Server': 'Hosting, domains and server costs supporting web-development work. Debit when paid.',
  '51200|Property Maintenance': 'General property repairs and maintenance not tied to a specific flat. Debit when paid.',
  '51300|Cost of Goods Sold': 'The cost of inventory items when they are sold. Debit with the item average cost on every sale (paired with a credit to 11210 Inventory on Hand).',
  '51400|Inventory Adjustments (Shrinkage)': 'Stock-count corrections: shrinkage, breakage, loss (debit) or found stock (credit). Paired with 11210 Inventory on Hand.',
  '600005|Garments': 'Clothing and garments purchases. Debit when paid.',
  '600017|Entertainment': 'Entertainment and leisure spending. Debit when paid.',
  '6001|Groceries': 'Groceries and household food shopping. Debit when paid.',
  '60016|Subscription': 'App, streaming and software subscriptions. Debit when paid.',
  '60018|communication': 'Phone loads, mobile plans and communication expenses. Debit when paid.',
  '60019|Gift': 'Gifts and donations given. Debit when paid.',
  '6002|Athena': 'Spending related to Athena (personal/household category). Debit when paid.',
  '6003|Hermes&Odin': 'Spending related to Hermes & Odin (personal/household category). Debit when paid.',
  '6004|Transpo': 'Local transportation fares (taxi, Karwa, bus). Debit when paid.',
  '6005|Fuel': 'Vehicle fuel purchases. Debit when paid.',
  '6006|Maintenance': 'Vehicle and equipment repairs/servicing. Debit when paid.',
  '6007|Food': 'Eating out, takeaways and food deliveries. Debit when paid.',
  '6008|Gaming': 'Games, in-game purchases and gaming gear. Debit when paid.',
  '6009|Beajones Expenses': 'Expenses related to Beajones (personal category). Debit when paid.',
  '6010|Shopping': 'General shopping that is not groceries, garments or gaming. Debit when paid.',
  '60100|Rent Expense': 'Rent expense not tied to a specific flat (use 5001/5002 for Flat 21/Flat 7). Debit when paid.',
  '6011|Health': 'Medical consultations, medicine and health spending. Debit when paid.',
  '6012|P.Rent Expense': 'Personal rent expense (P.\'s rent). Debit when paid.',
  '60300|Transport & Fuel': 'Combined transport and fuel expenses. Prefer the more specific 6004 Transpo or 6005 Fuel when identifiable.',
  '60400|Utilities': 'Utilities not tied to a specific flat (use 5003/5004 for Flat 21/Flat 7). Debit when paid.',
  '60900|Depreciation Expense': 'Periodic depreciation of fixed assets, computed by the app\'s depreciation engine. Do not post manually.',
  '6099|Depreciation Exp': 'Depreciation expense (legacy account, system-managed). Prefer 60900 for anything manual.',
};

function describe(a) {
  const key = `${a.code}|${a.name}`;
  if (OVERRIDES[key]) return OVERRIDES[key];

  if (a.name.startsWith('Accum Dep')) {
    const item = a.name.replace(/^Accum Dep - /, '');
    return `Contra-asset: accumulated depreciation of ${item}. Credit as depreciation is posted; never post purchases or expenses here.`;
  }
  if (a.name.endsWith('(Cost)')) {
    const item = a.name.replace(' (Cost)', '');
    return `Fixed-asset cost ledger for ${item}, held at purchase price. Debit on purchase; depreciation posts to its Accum Dep account, not here.`;
  }
  if (a.level === 'class' || a.level === 'group') {
    const cls = a.class;
    const guides = {
      Assets: 'everything the business owns or is owed',
      Liabilities: 'everything the business owes',
      Equity: 'owner stakes: opening equity and retained profits',
      Revenue: 'all income; post to a specific income account beneath it, never here',
      Expenses: 'all costs; post to a specific expense account beneath it, never here',
    };
    return `Header account only — do not post directly. Totals all ${cls} (${guides[cls] || cls}) beneath it in the tree.`;
  }
  // party sub-ledgers (parent = Parties group)
  if (a.level === 'sub_ledger') {
    return `Receivable sub-ledger for ${a.name.trim()}. Debit when ${a.name.trim()} owes money (credit sale, loan, advance), credit when ${a.name.trim()} pays up or the balance is written off.`;
  }
  return `${a.class} account for ${a.name.trim()}.`;
}

const updates = accounts.map((a) => {
  const d = describe(a).replace(/'/g, "''");
  return `('${a.id}', '${d}')`;
});

// ---------- 3b. Revert descriptions accidentally written to other users' rows ----------
// Account ids are shared across users (system default ids); restrict all writes to USER_ID.
const reverted = await sql(
  `UPDATE fintrack_accounts SET description = NULL, updated_at = now()
   WHERE user_id <> '${USER_ID}' AND description IS NOT NULL RETURNING id`);
console.log(`REVERTED other-user rows: ${reverted.length}`);

// ---------- 4. Apply in batches, verified (user-scoped) ----------
let applied = 0;
for (let i = 0; i < updates.length; i += 10) {
  const batch = updates.slice(i, i + 10);
  const rows = await sql(
    `UPDATE fintrack_accounts a SET description = v.d, updated_at = now()
     FROM (VALUES ${batch.join(',')}) AS v(id, d)
     WHERE a.id = v.id AND a.user_id = '${USER_ID}' RETURNING a.id`);
  if (rows.length !== batch.length) throw new Error(`Batch ${i / 10 + 1}: expected ${batch.length} rows, got ${rows.length}`);
  applied += rows.length;
}
console.log(`DESCRIPTIONS APPLIED: ${applied}`);

// ---------- 5. Verify ----------
const missing = await sql(`SELECT code, name FROM fintrack_accounts WHERE user_id='${USER_ID}' AND (description IS NULL OR description='')`);
const sample = await sql(`SELECT code, name, left(description, 70) preview FROM fintrack_accounts WHERE user_id='${USER_ID}' AND code IN ('1002','41200','51300','11210','11900.8','12109') ORDER BY code`);
console.log(`Rows missing description: ${missing.length}`);
console.log('Samples:');
sample.forEach((r) => console.log(`  ${r.code} ${r.name}: ${r.preview}...`));
