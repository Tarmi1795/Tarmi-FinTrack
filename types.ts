
export type TransactionType = 'income' | 'expense' | 'transfer';
export type SourceType = 'personal' | 'stable_job' | 'side_hustle';
export type ReceivableStatus = 'pending' | 'overdue' | 'paid';
export type CurrencyCode = 
  | 'USD' | 'EUR' | 'JPY' | 'GBP' | 'CNY' | 'AUD' | 'CAD' | 'CHF' | 'HKD' | 'SGD' 
  | 'INR' | 'KRW' | 'MXN' | 'BRL' | 'SEK' | 'PHP' | 'QAR' | 'AED' | 'SAR' | 'ZAR';

export type RecurrenceFrequency = 'weekly' | 'monthly' | 'yearly' | 'daily';

// --- ENTERPRISE ACCOUNTING TYPES ---

// Level 1: Class (Root)
export type AccountClass = 'Assets' | 'Liabilities' | 'Equity' | 'Revenue' | 'Expenses';

// Level in Hierarchy
export type AccountLevel = 'class' | 'group' | 'gl' | 'sub_ledger';

// Normal Balance
export type NormalBalance = 'debit' | 'credit';

// Combined Party Type (Changed to string to allow custom types)
export type PartyType = string;

export interface Account {
  id: string;
  code: string; // e.g., "1000", "1100", "1101"
  name: string;
  class: AccountClass;
  level: AccountLevel;
  parentId?: string; // For hierarchy aggregation
  normalBalance: NormalBalance;
  isSystem?: boolean; // Cannot be deleted
  isPosting: boolean; // Only GL (if no children) or Sub-ledgers accept transactions
  balance?: number; // Calculated at runtime
  children?: Account[]; // For UI Tree rendering
}

export interface Party {
  id: string;
  name: string;
  type: PartyType;
  email?: string;
  phone?: string;
  address?: string;
  linkedAccountId?: string; // Links party to a specific Sub-ledger Account (e.g., under AR or AP)
}

// -----------------------------------

export interface RecurringConfig {
  active: boolean;
  amount: number;
  frequency: RecurrenceFrequency;
  nextDueDate: string;
  ruleId?: string; 
}

export interface RecurringTransaction {
  id: string;
  type: TransactionType;
  accountId: string; // Updated from categoryId
  amount: number;
  currency: CurrencyCode;
  source: SourceType;
  paymentAccountId?: string;
  partyId?: string; // Updated from entityId
  note?: string;
  frequency: RecurrenceFrequency;
  nextDueDate: string;
  active: boolean;
  lastRunDate?: string;
  originalAmount?: number;
  generationType?: 'transaction' | 'receivable';
  receivableType?: 'invoice' | 'bill';
  dueDays?: number;
}

export interface Asset {
  id: string;
  name: string;
  value: number; // Current Book Value in Base Currency
  originalValue: number;
  currency: CurrencyCode;
  purchaseDate: string;
  usefulLifeYears: number; // For Depreciation
  lastDepreciationDate?: string;
  note?: string;
  linkedAccountId?: string; // Link to Chart of Accounts (Fixed Asset Group)
}

export interface Transaction {
  id: string;
  date: string; // ISO string
  type: TransactionType;
  accountId: string; // The account being affected (Dr for Expense, Cr for Income typically, but follows DE logic)
  amount: number; // Always stored in Base Currency
  originalAmount?: number; 
  currency?: CurrencyCode; 
  source: SourceType; // Scope: Personal vs Business
  paymentAccountId?: string; // The contra account
  note?: string;
  relatedPartyId?: string; // ID of Party
  receivableId?: string; // For linking to AR/AP
  recurringRuleId?: string; // For linking to Recurring Rules
}

export interface TransactionTemplate {
  id: string;
  name: string;
  accountId: string;
  amount?: number;
  currency: CurrencyCode;
  note?: string;
  icon?: string; 
  color?: string;
  partyId?: string; 
  paymentAccountId?: string; 
  source?: SourceType; 
}

export interface Receivable {
  id: string;
  type: 'receivable' | 'payable';
  subType?: 'invoice' | 'loan' | 'bill'; 
  partyName: string; 
  partyId?: string; 
  targetAccountId?: string; // The Revenue (Cr.) or Expense (Dr.) account associated.
  amount: number; // Total Amount
  paidAmount?: number; // Amount Paid so far (Partial Payment Support)
  originalAmount?: number;
  currency?: CurrencyCode;
  issueDate?: string; // Date of issuance/recognition
  dueDate: string; 
  status: ReceivableStatus;
  notes?: string;
  paidDate?: string;
  recurring?: RecurringConfig; 
}

export interface BusinessProfile {
  name: string;
  email: string;
  phone: string;
  address: string;
  logoUrl?: string;
  footerNote?: string;
  baseCurrency?: CurrencyCode; // New field for Base Reporting Currency
}

export interface SyncConfig {
  supabaseUrl: string;
  supabaseKey: string;
  enabled: boolean;
  gasWebAppUrl?: string;
}

export interface MonthlyBudget {
    monthKey: string; // YYYY-MM or YYYY
    limit: number;
    categoryLimits?: Record<string, number>; // Keyed by Account ID
    visibleAccountIds?: string[];
}

export interface AppState {
  transactions: Transaction[];
  accounts: Account[]; // Replaces categories
  receivables: Receivable[];
  templates: TransactionTemplate[];
  recurring: RecurringTransaction[]; 
  parties: Party[]; // Replaces entities
  assets: Asset[];
  businessProfile: BusinessProfile;
  monthlyBudgets?: MonthlyBudget[]; 
  lastUpdated?: string; 
}

export interface DateRange {
  start: Date;
  end: Date;
}

export interface Denomination {
  id: string;
  user_id?: string;
  currency_code: string;
  value: number;
  label: string;
  type: 'bill' | 'coin';
  is_active: boolean;
  created_at?: string;
}

export interface CashCount {
  id: string;
  user_id?: string;
  total_amount: number;
  currency_code: string;
  breakdown: Record<string, number>; // denomination id -> count
  notes?: string;
  created_at?: string;
}

// --- TRADING PORTFOLIO MODULE (mirrors Supabase tables directly) ---

export interface TradingAccount {
  id: string;
  user_id?: string;
  name: string;
  broker?: string;
  currency: string;
  notes?: string;
  is_active: boolean;
  sort_order?: number;
  category_id?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface TradingCategory {
  id: string;
  user_id?: string;
  name: string;
  parent_id?: string | null; // Set = sub-category of another category
  sort_order?: number;
  created_at?: string;
}

export interface TradingCashflow {
  id: string;
  user_id?: string;
  account_id: string;
  flow_type: 'deposit' | 'withdrawal';
  amount: number; // In the trading account's currency
  fx_rate?: number; // Rate to base currency used when posting to the ledger
  flow_date: string; // YYYY-MM-DD
  gl_transaction_id?: string; // Linked journal entry in fintrack_transactions
  bank_account_id?: string; // GL account id of the source/target bank
  note?: string;
  created_at?: string;
}

export interface TradingSnapshot {
  id: string;
  user_id?: string;
  account_id: string;
  balance: number; // In the trading account's currency
  snap_date: string; // YYYY-MM-DD
  fx_rate?: number;
  note?: string;
  created_at?: string;
}

export interface TradingFxRate {
  id: string;
  user_id?: string;
  currency: string;
  rate_to_base: number; // 1 unit of currency = rate_to_base units of base currency
  updated_at?: string;
}

export interface TradingSettings {
  user_id: string;
  linked_gl_account_id?: string; // The "Trading Account" Account.id in the Chart of Accounts
  updated_at?: string;
}

// --- INVENTORY MODULE (mirrors Supabase tables directly) ---

export interface InventoryItem {
  id: string;
  user_id?: string;
  sku?: string;
  name: string;
  unit?: string; // pcs, kg, box...
  category?: string;
  quantity: number; // On hand
  cost_price: number; // Moving-average cost, base currency
  sale_price?: number;
  reorder_level?: number;
  notes?: string;
  is_active: boolean;
  // Optional per-item Chart-of-Accounts overrides (fall back to module defaults)
  inventory_account_id?: string | null;
  cogs_account_id?: string | null;
  revenue_account_id?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface InventoryMovement {
  id: string;
  user_id?: string;
  item_id: string;
  movement_type: 'purchase' | 'sale' | 'adjustment';
  quantity: number; // Signed for adjustments (+ found / - shrinkage); positive for purchase/sale
  unit_cost?: number; // Actual cost on purchase; avg cost used on sale/adjustment-out
  total_cost?: number;
  unit_price?: number; // Sale price per unit
  total_price?: number;
  payment_account_id?: string | null; // Bank/cash leg for purchase (Cr) and sale (Dr)
  gl_transaction_ids?: string[]; // Linked journal entries in the main ledger
  note?: string;
  movement_date: string; // YYYY-MM-DD
  created_at?: string;
}

// Module-level Chart-of-Accounts defaults (Dr/Cr mapping)
export interface InventorySettings {
  user_id: string;
  inventory_account_id?: string | null; // Asset — Dr on purchase, Cr on sale/loss
  cogs_account_id?: string | null;      // Expense — Dr on sale
  revenue_account_id?: string | null;   // Revenue — Cr on sale
  adjustment_account_id?: string | null;// Expense — Dr/Cr on adjustments
  payment_account_id?: string | null;   // Default bank/cash — Cr on purchase, Dr on sale
  updated_at?: string;
}