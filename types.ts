
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

// Combined Party Type
export type PartyType = 'customer' | 'vendor' | 'employee' | 'other';

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
