
import { Account, Receivable, Transaction, TransactionTemplate, Party, Asset, CurrencyCode } from './types';
import { subDays, subMonths } from 'date-fns';

// Exchange rate usage is now deprecated for fixed constants, handled via dynamic migration logic
// keeping for backward compatibility reference if needed during migration
export const EXCHANGE_RATE_QAR_TO_PHP = 15.80; 

export interface CurrencyOption {
    code: CurrencyCode;
    symbol: string;
    name: string;
}

export const CURRENCIES: CurrencyOption[] = [
    { code: 'USD', symbol: '$', name: 'US Dollar' },
    { code: 'EUR', symbol: '€', name: 'Euro' },
    { code: 'JPY', symbol: '¥', name: 'Japanese Yen' },
    { code: 'GBP', symbol: '£', name: 'British Pound' },
    { code: 'CNY', symbol: '¥', name: 'Chinese Yuan' },
    { code: 'AUD', symbol: '$', name: 'Australian Dollar' },
    { code: 'CAD', symbol: '$', name: 'Canadian Dollar' },
    { code: 'CHF', symbol: 'CHF', name: 'Swiss Franc' },
    { code: 'HKD', symbol: '$', name: 'Hong Kong Dollar' },
    { code: 'SGD', symbol: '$', name: 'Singapore Dollar' },
    { code: 'INR', symbol: '₹', name: 'Indian Rupee' },
    { code: 'KRW', symbol: '₩', name: 'South Korean Won' },
    { code: 'MXN', symbol: '$', name: 'Mexican Peso' },
    { code: 'BRL', symbol: 'R$', name: 'Brazilian Real' },
    { code: 'SEK', symbol: 'kr', name: 'Swedish Krona' },
    { code: 'PHP', symbol: '₱', name: 'Philippine Peso' },
    { code: 'QAR', symbol: '﷼', name: 'Qatari Riyal' },
    { code: 'AED', symbol: 'د.إ', name: 'UAE Dirham' },
    { code: 'SAR', symbol: '﷼', name: 'Saudi Riyal' },
    { code: 'ZAR', symbol: 'R', name: 'South African Rand' },
];

// Supabase Credentials
// @ts-ignore
export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || "https://hdwpzyfvabljqvtxjfsg.supabase.co";
// @ts-ignore
export const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || "";

// Helper to generate IDs
const uuid = () => Math.random().toString(36).substr(2, 9);

// --- STRICT HIERARCHICAL CHART OF ACCOUNTS ---
export const DEFAULT_ACCOUNTS: Account[] = [
  // 1. ASSETS (Debit Normal)
  { id: '10000',
        description: "Everything the business or household owns — cash, receivables, inventory and fixed assets.", code: '10000', name: 'ASSETS', class: 'Assets', level: 'class', normalBalance: 'debit', isPosting: false, isSystem: true },
    // Current Assets
    { id: '11000',
        description: "Short-lived resources convertible to cash within a year.", code: '11000', name: 'Current Assets', class: 'Assets', level: 'group', parentId: '10000', normalBalance: 'debit', isPosting: false, isSystem: true },
      // Cash & Bank
      { id: '11100',
        description: "Liquid money: bank accounts, petty cash and digital wallets.", code: '11100', name: 'Cash & Cash Equivalents', class: 'Assets', level: 'group', parentId: '11000', normalBalance: 'debit', isPosting: false, isSystem: true },
        { id: 'asset_bank_main',
        description: "Primary bank account where income lands and most bills are paid from.", code: '11110', name: 'Main Bank Account', class: 'Assets', level: 'gl', parentId: '11100', normalBalance: 'debit', isPosting: true },
        { id: 'asset_cash',
        description: "Physical cash on hand for small day-to-day payments.", code: '11120', name: 'Petty Cash', class: 'Assets', level: 'gl', parentId: '11100', normalBalance: 'debit', isPosting: true },
        { id: 'asset_wallet',
        description: "Digital money (e.g. Apple Pay, PayPal, Binance Pay) used for online spending.", code: '11130', name: 'Digital Wallet', class: 'Assets', level: 'gl', parentId: '11100', normalBalance: 'debit', isPosting: true },
      // Receivables
      { id: '11200',
        description: "Money customers owe you for invoices issued on credit.", code: '11200', name: 'Accounts Receivable', class: 'Assets', level: 'gl', parentId: '11000', normalBalance: 'debit', isPosting: false, isSystem: true },
        { id: 'asset_ar_general',
        description: "Default bucket for customer debts not tied to a specific customer sub-account.", code: '11201', name: 'General Receivables', class: 'Assets', level: 'sub_ledger', parentId: '11200', normalBalance: 'debit', isPosting: true },
      // Parties (Unified AR/AP)
      { id: 'asset_parties',
        description: "Parent container for per-customer and per-vendor sub-ledger accounts.", code: '11900', name: 'Parties', class: 'Assets', level: 'gl', parentId: '11000', normalBalance: 'debit', isPosting: false, isSystem: true },

    // Fixed Assets
    { id: '12000',
        description: "Long-term equipment and property used in the business, tracked at cost.", code: '12000', name: 'Fixed Assets', class: 'Assets', level: 'group', parentId: '10000', normalBalance: 'debit', isPosting: false, isSystem: true },
      { id: '12100',
        description: "Computers, laptops, phones and accessories capitalized as assets.", code: '12100', name: 'Computer Equipment', class: 'Assets', level: 'gl', parentId: '12000', normalBalance: 'debit', isPosting: true },
      { id: '12900',
        description: "Running total of depreciation charged against fixed assets (reduces their book value).", code: '12900', name: 'Accumulated Depreciation', class: 'Assets', level: 'gl', parentId: '12000', normalBalance: 'credit', isPosting: true, isSystem: true }, // Contra-Asset (Credit Normal)

  // 2. LIABILITIES (Credit Normal)
  { id: '20000',
        description: "Everything owed to suppliers, lenders and tax authorities.", code: '20000', name: 'LIABILITIES', class: 'Liabilities', level: 'class', normalBalance: 'credit', isPosting: false, isSystem: true },
    // Current Liabilities
    { id: '21000',
        description: "Debts due within a year.", code: '21000', name: 'Current Liabilities', class: 'Liabilities', level: 'group', parentId: '20000', normalBalance: 'credit', isPosting: false, isSystem: true },
      { id: 'liab_ap',
        description: "Money owed to vendors for bills recorded on credit.", code: '21100', name: 'Accounts Payable', class: 'Liabilities', level: 'gl', parentId: '21000', normalBalance: 'credit', isPosting: false, isSystem: true },
        { id: 'liab_ap_general',
        description: "Default bucket for vendor debts not tied to a specific vendor sub-account.", code: '21101', name: 'General Payables', class: 'Liabilities', level: 'sub_ledger', parentId: 'liab_ap', normalBalance: 'credit', isPosting: true },

  // 3. EQUITY (Credit Normal)
  { id: '30000',
        description: "The owner's stake: opening equity plus accumulated retained earnings.", code: '30000', name: 'EQUITY', class: 'Equity', level: 'class', normalBalance: 'credit', isPosting: false, isSystem: true },
    { id: 'equity_opening',
        description: "Starting balances entered when the books were first set up.", code: '31000', name: 'Opening Balance Equity', class: 'Equity', level: 'gl', parentId: '30000', normalBalance: 'credit', isPosting: true, isSystem: true },
    { id: 'equity_retained',
        description: "Accumulated profits kept in the business after expenses.", code: '32000', name: 'Retained Earnings', class: 'Equity', level: 'gl', parentId: '30000', normalBalance: 'credit', isPosting: true, isSystem: true },

  // 4. REVENUE (Credit Normal)
  { id: '40000',
        description: "All income earned by the business or household.", code: '40000', name: 'REVENUE', class: 'Revenue', level: 'class', normalBalance: 'credit', isPosting: false, isSystem: true },
    // Operating Revenue
    { id: '41000',
        description: "Income from the core business activity.", code: '41000', name: 'Operating Revenue', class: 'Revenue', level: 'group', parentId: '40000', normalBalance: 'credit', isPosting: false, isSystem: true },
      { id: 'rev_consulting',
        description: "Fees earned from consulting or professional services.", code: '41100', name: 'Consulting Services', class: 'Revenue', level: 'gl', parentId: '41000', normalBalance: 'credit', isPosting: true },
      { id: 'rev_rental',
        description: "Income from renting out property or equipment.", code: '41200', name: 'Rental Income', class: 'Revenue', level: 'gl', parentId: '41000', normalBalance: 'credit', isPosting: true },
    // Professional Income (Personal Salary)
    { id: '42000',
        description: "Income from salaried or professional employment.", code: '42000', name: 'Professional Income', class: 'Revenue', level: 'group', parentId: '40000', normalBalance: 'credit', isPosting: false, isSystem: true },
      { id: 'inc_salary',
        description: "Take-home salary from a stable job or employer.", code: '42100', name: 'Salary (Stable Job)', class: 'Revenue', level: 'gl', parentId: '42000', normalBalance: 'credit', isPosting: true },

  // 5. EXPENSES (Debit Normal)
  { id: '50000',
        description: "All costs: direct costs of earning revenue plus operating overhead.", code: '50000', name: 'EXPENSES', class: 'Expenses', level: 'class', normalBalance: 'debit', isPosting: false, isSystem: true },
    // Direct Costs
    { id: '51000',
        description: "Costs directly tied to producing the goods or services sold.", code: '51000', name: 'Direct Costs (COGS)', class: 'Expenses', level: 'group', parentId: '50000', normalBalance: 'debit', isPosting: false, isSystem: true },
      { id: 'cogs_hosting',
        description: "Hosting and server costs tied to delivering services.", code: '51100', name: 'Web Hosting & Server', class: 'Expenses', level: 'gl', parentId: '51000', normalBalance: 'debit', isPosting: true },
      { id: 'cogs_maintenance',
        description: "Upkeep costs tied to maintaining rented property.", code: '51200', name: 'Property Maintenance', class: 'Expenses', level: 'gl', parentId: '51000', normalBalance: 'debit', isPosting: true },
    // Operating Expenses
    { id: '60000',
        description: "Day-to-day overhead not directly tied to production.", code: '60000', name: 'Operating Expenses', class: 'Expenses', level: 'group', parentId: '50000', normalBalance: 'debit', isPosting: false, isSystem: true },
      { id: 'exp_rent',
        description: "Monthly rent for home or business premises.", code: '60100', name: 'Rent Expense', class: 'Expenses', level: 'gl', parentId: '60000', normalBalance: 'debit', isPosting: true },
      { id: 'exp_groceries',
        description: "Supermarket and household supply purchases.", code: '60200', name: 'Groceries & Supplies', class: 'Expenses', level: 'gl', parentId: '60000', normalBalance: 'debit', isPosting: true },
      { id: 'exp_transport',
        description: "Fuel, taxi, metro and vehicle maintenance costs.", code: '60300', name: 'Transport & Fuel', class: 'Expenses', level: 'gl', parentId: '60000', normalBalance: 'debit', isPosting: true },
      { id: 'exp_utilities',
        description: "Electricity, water and internet bills.", code: '60400', name: 'Utilities', class: 'Expenses', level: 'gl', parentId: '60000', normalBalance: 'debit', isPosting: true },
      { id: 'exp_depreciation',
        description: "Monthly depreciation charged on fixed assets (system-managed).", code: '60900', name: 'Depreciation Expense', class: 'Expenses', level: 'gl', parentId: '60000', normalBalance: 'debit', isPosting: true, isSystem: true },
];

export const SEED_PARTIES: Party[] = [
  { id: uuid(), name: 'Global Tech Suppliers', type: 'vendor', linkedAccountId: 'liab_ap_general' },
  { id: uuid(), name: 'City Real Estate', type: 'vendor', linkedAccountId: 'liab_ap_general' },
  { id: uuid(), name: 'Client Corp A', type: 'customer', linkedAccountId: 'asset_ar_general' },
  { id: uuid(), name: 'John Doe', type: 'customer', linkedAccountId: 'asset_ar_general' },
];

// Re-mapping assets provided to fixed assets table
export const SEED_ASSETS: Asset[] = [
  { id: uuid(), name: 'Workstation PC', value: 8500, originalValue: 8500, currency: 'USD', purchaseDate: new Date().toISOString(), note: 'High-end PC for dev', usefulLifeYears: 3 },
  { id: uuid(), name: 'Office Laptop', value: 5000, originalValue: 6000, currency: 'USD', purchaseDate: subMonths(new Date(), 6).toISOString(), note: 'MacBook Air', usefulLifeYears: 3 },
];

export const SEED_TRANSACTIONS: Transaction[] = [
  { id: uuid(), date: new Date().toISOString(), type: 'income', accountId: 'inc_salary', amount: 15000, currency: 'USD', source: 'stable_job', note: 'Monthly Salary Credit', paymentAccountId: 'asset_bank_main' },
  { id: uuid(), date: subDays(new Date(), 2).toISOString(), type: 'expense', accountId: 'exp_groceries', amount: 450.50, currency: 'USD', source: 'personal', note: 'Supermarket Run', paymentAccountId: 'asset_bank_main' },
];

export const SEED_RECEIVABLES: Receivable[] = [
  { id: uuid(), type: 'receivable', partyName: 'Client Corp A', amount: 5000, currency: 'USD', dueDate: subDays(new Date(), -10).toISOString(), status: 'pending', notes: 'Project Milestone 1', targetAccountId: 'rev_consulting' },
];

export const SEED_TEMPLATES: TransactionTemplate[] = [];
export const SEED_RECURRING = [];
