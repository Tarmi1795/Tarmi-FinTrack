
// Chart-of-Accounts presets for the onboarding wizard.
// Builds an engine-compatible account tree from the user's onboarding answers.
// Conventions that MUST hold (other features depend on them):
//   - Cash accounts: codes starting 111 (11110 bank, 11120 cash, 11130 wallet)
//   - AR group: 11200 · AP: 21100 (+21101 sub-ledger) · Inventory asset: 11300
//   - COGS: codes starting 5 · OpEx group: 60000 · Depreciation expense: 60900
//   - Class nodes: 10000/20000/30000/40000/50000 · Equity: 31000 + 32000

import { Account, AccountClass, AccountLevel, NormalBalance } from '../types';

export type ProfileType = 'personal' | 'side_hustle' | 'retail' | 'restaurant' | 'manufacturing' | 'construction' | 'consulting';

export interface OnboardingAnswers {
  profileType: ProfileType;
  incomeSources: string[];   // e.g. ['salary', 'freelance', 'rental', 'sales']
  expenseAreas: string[];    // e.g. ['rent', 'utilities', 'payroll', 'marketing']
  sells: 'products' | 'services' | 'both';
  creditCustomers: boolean;
  creditSuppliers: boolean;
  cashAccounts: string[];    // ['bank', 'cash', 'wallet']
}

const genId = () => (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2, 12));

type Row = {
  code: string;
  name: string;
  class: AccountClass;
  level: AccountLevel;
  parent?: string; // parent CODE (resolved after)
  normal: NormalBalance;
  posting: boolean;
  system?: boolean;
  description: string;
};

const R = (code: string, name: string, cls: AccountClass, level: AccountLevel, parent: string | undefined, normal: NormalBalance, posting: boolean, description: string, system?: boolean): Row =>
  ({ code, name, class: cls, level, parent, normal, posting, system, description });

export const PROFILE_TYPES: Array<{ id: ProfileType; label: string; hint: string }> = [
  { id: 'personal', label: 'Personal', hint: 'Household money: salary, bills, savings' },
  { id: 'side_hustle', label: 'Personal + Side Hustle', hint: 'Day job plus a growing side income' },
  { id: 'retail', label: 'Retail / E-commerce', hint: 'Buy stock, sell products' },
  { id: 'restaurant', label: 'Restaurant / Café', hint: 'Food, kitchen costs, daily sales' },
  { id: 'manufacturing', label: 'Manufacturing', hint: 'Raw materials in, products out' },
  { id: 'construction', label: 'Construction', hint: 'Projects, materials, subcontractors' },
  { id: 'consulting', label: 'Freelance / Consulting', hint: 'Selling time and expertise' },
];

export function buildPresetAccounts(answers: OnboardingAnswers): Account[] {
  const rows: Row[] = [];

  // ---------- Core skeleton (always present) ----------
  rows.push(
    R('10000', 'ASSETS', 'Assets', 'class', undefined, 'debit', false, 'Everything the business or household owns.', true),
    R('11000', 'Current Assets', 'Assets', 'group', '10000', 'debit', false, 'Cash, receivables and inventory — usable within a year.', true),
    R('11100', 'Cash & Cash Equivalents', 'Assets', 'group', '11000', 'debit', false, 'Liquid money: banks, petty cash and wallets.', true),
  );

  if (answers.cashAccounts.includes('bank') || answers.cashAccounts.length === 0)
    rows.push(R('11110', 'Main Bank Account', 'Assets', 'gl', '11100', 'debit', true, 'Primary bank account for income and bill payments.'));
  if (answers.cashAccounts.includes('cash'))
    rows.push(R('11120', 'Petty Cash', 'Assets', 'gl', '11100', 'debit', true, 'Physical cash on hand for small payments.'));
  if (answers.cashAccounts.includes('wallet'))
    rows.push(R('11130', 'Digital Wallet', 'Assets', 'gl', '11100', 'debit', true, 'Digital balances (Apple Pay, PayPal, Binance Pay…).'));

  rows.push(R('11900', 'Parties', 'Assets', 'gl', '11000', 'debit', false, 'Parent container for customer and vendor sub-accounts.', true));

  // ---------- Inventory (product businesses) ----------
  const sellsProducts = answers.sells === 'products' || answers.sells === 'both';
  if (sellsProducts) {
    if (answers.profileType === 'manufacturing') {
      rows.push(R('11300', 'Raw Materials Inventory', 'Assets', 'gl', '11000', 'debit', true, 'Materials purchased and waiting to be used in production.'));
      rows.push(R('11310', 'Work in Progress', 'Assets', 'gl', '11000', 'debit', true, 'Partially finished goods still on the factory floor.'));
      rows.push(R('11320', 'Finished Goods Inventory', 'Assets', 'gl', '11000', 'debit', true, 'Completed products ready to ship to customers.'));
    } else {
      rows.push(R('11300', 'Inventory', 'Assets', 'gl', '11000', 'debit', true, 'Stock bought for resale, valued at cost.'));
    }
  }

  // ---------- Receivables ----------
  if (answers.creditCustomers) {
    rows.push(
      R('11200', 'Accounts Receivable', 'Assets', 'group', '11000', 'debit', false, 'Customer invoices awaiting payment.', true),
      R('11201', 'General Receivables', 'Assets', 'sub_ledger', '11200', 'debit', true, 'Customer debts not tied to a specific customer account.'),
    );
  }

  // ---------- Fixed assets ----------
  rows.push(
    R('12000', 'Fixed Assets', 'Assets', 'group', '10000', 'debit', false, 'Long-term equipment and property tracked at cost.', true),
    R('12100', 'Computer Equipment', 'Assets', 'gl', '12000', 'debit', true, 'Computers, laptops, phones and accessories.'),
    R('12200', 'Furniture & Fixtures', 'Assets', 'gl', '12000', 'debit', true, 'Desks, shelving and fittings used long-term.'),
    R('12900', 'Accumulated Depreciation', 'Assets', 'gl', '12000', 'credit', true, 'Total depreciation charged so far (reduces book value).', true),
  );

  // ---------- Liabilities ----------
  rows.push(
    R('20000', 'LIABILITIES', 'Liabilities', 'class', undefined, 'credit', false, 'Everything owed to suppliers, lenders and authorities.', true),
    R('21000', 'Current Liabilities', 'Liabilities', 'group', '20000', 'credit', false, 'Debts due within a year.', true),
  );
  if (answers.creditSuppliers) {
    rows.push(
      R('21100', 'Accounts Payable', 'Liabilities', 'gl', '21000', 'credit', false, 'Bills from vendors recorded on credit.', true),
      R('21101', 'General Payables', 'Liabilities', 'sub_ledger', '21100', 'credit', true, 'Vendor debts not tied to a specific vendor account.'),
    );
  }
  if (answers.expenseAreas.includes('vat')) {
    rows.push(R('22100', 'VAT / Tax Payable', 'Liabilities', 'gl', '21000', 'credit', true, 'Sales tax collected, due to the tax authority.'));
  }

  // ---------- Equity ----------
  rows.push(
    R('30000', 'EQUITY', 'Equity', 'class', undefined, 'credit', false, "The owner's stake in the business.", true),
    R('31000', 'Opening Balance Equity', 'Equity', 'gl', '30000', 'credit', true, 'Starting balances from when the books were set up.', true),
    R('32000', 'Retained Earnings', 'Equity', 'gl', '30000', 'credit', true, 'Accumulated profits kept in the business.', true),
  );

  // ---------- Revenue (per profile type + income sources) ----------
  rows.push(
    R('40000', 'REVENUE', 'Revenue', 'class', undefined, 'credit', false, 'All income earned.', true),
    R('41000', 'Operating Revenue', 'Revenue', 'group', '40000', 'credit', false, 'Income from the core activity.', true),
  );

  const type = answers.profileType;
  const wants = (src: string) => answers.incomeSources.includes(src);

  if (type === 'personal' || type === 'side_hustle') {
    rows.push(R('42000', 'Professional Income', 'Revenue', 'group', '40000', 'credit', false, 'Income from salaried employment.', true));
    if (wants('salary') || type === 'side_hustle')
      rows.push(R('42100', 'Salary (Stable Job)', 'Revenue', 'gl', '42000', 'credit', true, 'Take-home salary from a stable job.'));
    if (type === 'side_hustle')
      rows.push(R('41100', 'Side Hustle Revenue', 'Revenue', 'gl', '41000', 'credit', true, 'All income from the side business.'));
    if (wants('freelance'))
      rows.push(R('41110', 'Freelance Income', 'Revenue', 'gl', '41000', 'credit', true, 'Project and gig fees from freelance work.'));
    if (wants('rental'))
      rows.push(R('41200', 'Rental Income', 'Revenue', 'gl', '41000', 'credit', true, 'Income from renting out property or equipment.'));
    if (wants('sales') && sellsProducts)
      rows.push(R('41120', 'Product Sales', 'Revenue', 'gl', '41000', 'credit', true, 'Revenue from selling products.'));
  } else if (type === 'retail') {
    rows.push(R('41100', 'Product Sales', 'Revenue', 'gl', '41000', 'credit', true, 'Revenue from merchandise sold in-store or online.'));
    if (wants('sales')) rows.push(R('41200', 'Online Channel Sales', 'Revenue', 'gl', '41000', 'credit', true, 'Revenue from e-commerce platforms.'));
  } else if (type === 'restaurant') {
    rows.push(R('41100', 'Food & Beverage Sales', 'Revenue', 'gl', '41000', 'credit', true, 'Daily dine-in and takeaway sales.'));
    if (wants('sales')) rows.push(R('41200', 'Catering & Events', 'Revenue', 'gl', '41000', 'credit', true, 'Catering orders and event contracts.'));
  } else if (type === 'manufacturing') {
    rows.push(R('41100', 'Finished Goods Sales', 'Revenue', 'gl', '41000', 'credit', true, 'Revenue from shipped finished products.'));
    if (wants('sales')) rows.push(R('41200', 'Wholesale Orders', 'Revenue', 'gl', '41000', 'credit', true, 'Bulk orders to distributors or resellers.'));
  } else if (type === 'construction') {
    rows.push(R('41100', 'Project Revenue', 'Revenue', 'gl', '41000', 'credit', true, 'Contract value recognized on construction projects.'));
    rows.push(R('41200', 'Progress Billings', 'Revenue', 'gl', '41000', 'credit', true, 'Milestone invoices billed as work progresses.'));
    if (wants('rental')) rows.push(R('41300', 'Equipment Hire Income', 'Revenue', 'gl', '41000', 'credit', true, 'Renting machines and tools to others.'));
  } else if (type === 'consulting') {
    rows.push(R('41100', 'Consulting Services', 'Revenue', 'gl', '41000', 'credit', true, 'Fees for consulting and advisory work.'));
    if (wants('freelance')) rows.push(R('41200', 'Project Fees', 'Revenue', 'gl', '41000', 'credit', true, 'Fixed-fee project engagements.'));
    if (wants('rental')) rows.push(R('41300', 'Rental Income', 'Revenue', 'gl', '41000', 'credit', true, 'Income from renting out property or equipment.'));
  }
  if (wants('other') || answers.incomeSources.length === 0)
    rows.push(R('41900', 'Other Income', 'Revenue', 'gl', '41000', 'credit', true, 'Miscellaneous income outside the main categories.'));

  // ---------- Expenses ----------
  rows.push(
    R('50000', 'EXPENSES', 'Expenses', 'class', undefined, 'debit', false, 'All costs of running the activity.', true),
    R('60000', 'Operating Expenses', 'Expenses', 'group', '50000', 'debit', false, 'Day-to-day overhead.', true),
    R('60900', 'Depreciation Expense', 'Expenses', 'gl', '60000', 'debit', true, 'Monthly depreciation on fixed assets (system-managed).', true),
  );

  if (sellsProducts || type === 'construction' || answers.sells === 'both') {
    rows.push(R('51000', 'Direct Costs (COGS)', 'Expenses', 'group', '50000', 'debit', false, 'Costs directly tied to what was sold.', true));
    if (type === 'restaurant') {
      rows.push(
        R('51100', 'Food Cost', 'Expenses', 'gl', '51000', 'debit', true, 'Cost of ingredients used in dishes sold.'),
        R('51200', 'Beverage Cost', 'Expenses', 'gl', '51000', 'debit', true, 'Cost of drinks consumed in sales.'),
      );
    } else if (type === 'manufacturing') {
      rows.push(
        R('51100', 'Raw Materials Used', 'Expenses', 'gl', '51000', 'debit', true, 'Materials consumed in production.'),
        R('51200', 'Direct Labor', 'Expenses', 'gl', '51000', 'debit', true, 'Wages of production staff.'),
        R('51300', 'Factory Overhead', 'Expenses', 'gl', '51000', 'debit', true, 'Utilities and upkeep of the production space.'),
      );
    } else if (type === 'construction') {
      rows.push(
        R('51100', 'Construction Materials', 'Expenses', 'gl', '51000', 'debit', true, 'Materials bought for projects.'),
        R('51200', 'Subcontractor Costs', 'Expenses', 'gl', '51000', 'debit', true, 'Payments to subcontracted crews.'),
        R('51300', 'Equipment Rental', 'Expenses', 'gl', '51000', 'debit', true, 'Hired machinery for project work.'),
      );
    } else {
      rows.push(R('51100', 'Cost of Goods Sold', 'Expenses', 'gl', '51000', 'debit', true, 'Purchase cost of the items that were sold.'));
    }
    if (answers.sells === 'both' && type !== 'construction')
      rows.push(R('51400', 'Direct Service Costs', 'Expenses', 'gl', '51000', 'debit', true, 'Delivery costs for the services side (e.g. subcontractors).'));
  }

  // Expense areas -> OpEx accounts
  const AREA_MAP: Array<{ key: string; row: Row }> = [
    { key: 'rent', row: R('60100', 'Rent Expense', 'Expenses', 'gl', '60000', 'debit', true, 'Monthly rent for premises or home office.') },
    { key: 'payroll', row: R('60500', 'Salaries & Wages', 'Expenses', 'gl', '60000', 'debit', true, 'Staff salaries and related costs.') },
    { key: 'marketing', row: R('60600', 'Marketing & Advertising', 'Expenses', 'gl', '60000', 'debit', true, 'Ads, promotions and sponsorships.') },
    { key: 'software', row: R('60700', 'Software & Subscriptions', 'Expenses', 'gl', '60000', 'debit', true, 'SaaS tools, apps and subscriptions.') },
    { key: 'food', row: R('60200', 'Food & Groceries', 'Expenses', 'gl', '60000', 'debit', true, 'Supermarket and household supplies.') },
    { key: 'transport', row: R('60300', 'Transport & Fuel', 'Expenses', 'gl', '60000', 'debit', true, 'Fuel, taxi, metro and vehicle upkeep.') },
    { key: 'utilities', row: R('60400', 'Utilities', 'Expenses', 'gl', '60000', 'debit', true, 'Electricity, water and internet bills.') },
    { key: 'insurance', row: R('60800', 'Insurance', 'Expenses', 'gl', '60000', 'debit', true, 'Policy premiums for business or personal cover.') },
    { key: 'professional', row: R('61100', 'Professional Fees', 'Expenses', 'gl', '60000', 'debit', true, 'Accountants, lawyers and permit fees.') },
    { key: 'bank', row: R('61200', 'Bank & Finance Charges', 'Expenses', 'gl', '60000', 'debit', true, 'Transfer fees, card fees and interest.') },
  ];
  AREA_MAP.forEach(({ key, row }) => {
    if (answers.expenseAreas.includes(key)) rows.push(row);
  });

  // ---------- Instantiate ----------
  const byCode = new Map<string, Account>();
  const accounts: Account[] = [];
  for (const row of rows) {
    if (byCode.has(row.code)) continue; // de-dup safety
    const acc: Account = {
      id: genId(),
      code: row.code,
      name: row.name,
      class: row.class,
      level: row.level,
      normalBalance: row.normal,
      isPosting: row.posting,
      isSystem: row.system || row.level === 'class' || row.level === 'group',
      description: row.description,
    };
    byCode.set(row.code, acc);
    accounts.push(acc);
  }
  // Resolve parents by code
  accounts.forEach(acc => {
    const row = rows.find(r => r.code === acc.code);
    if (row?.parent) {
      const parent = byCode.get(row.parent);
      if (parent) acc.parentId = parent.id;
    }
  });

  return accounts;
}
