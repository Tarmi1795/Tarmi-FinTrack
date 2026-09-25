
import { describe, it, expect, vi } from 'vitest';

// FinanceContext initializes app state from localStorage at import time —
// stub it before the module imports run.
vi.hoisted(() => {
  const store = new Map<string, string>();
  (globalThis as any).localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => { store.set(k, String(v)); },
    removeItem: (k: string) => { store.delete(k); },
    clear: () => store.clear(),
  };
});

import { financeReducer } from '../context/FinanceContext';
import { AppState, Transaction, Receivable, RecurringTransaction } from '../types';
import { DEFAULT_ACCOUNTS, SEED_PARTIES, SEED_TRANSACTIONS, SEED_RECEIVABLES, SEED_ASSETS } from '../constants';

const baseState = (): AppState => ({
  transactions: [...SEED_TRANSACTIONS],
  accounts: JSON.parse(JSON.stringify(DEFAULT_ACCOUNTS)),
  receivables: [...SEED_RECEIVABLES],
  templates: [],
  recurring: [],
  parties: [...SEED_PARTIES],
  assets: JSON.parse(JSON.stringify(SEED_ASSETS)),
  businessProfile: { name: 'Test', email: '', phone: '', address: '', baseCurrency: 'QAR' },
});

const accrualTx = (id: string, receivableId: string, amount = 500): Transaction => ({
  id,
  date: '2026-01-10T12:00:00Z',
  type: 'income',
  amount,
  source: 'personal',
  accountId: 'ar-control',
  paymentAccountId: 'revenue-1',
  receivableId,
  note: `Accrual: invoice Ref:${receivableId}`,
});

describe('financeReducer — accrual cascade integrity', () => {
  it('DELETE_TRANSACTION with accrual note removes the linked receivable', () => {
    const rec: Receivable = {
      id: 'rec-1', type: 'receivable', subType: 'invoice', partyName: 'Client A',
      amount: 500, dueDate: '2026-02-01', status: 'pending',
    };
    let s = baseState();
    s.receivables = [rec];
    s.transactions = [accrualTx('tx-1', 'rec-1')];

    s = financeReducer(s, { type: 'DELETE_TRANSACTION', payload: 'tx-1' });

    expect(s.transactions.find(t => t.id === 'tx-1')).toBeUndefined();
    expect(s.receivables.find(r => r.id === 'rec-1')).toBeUndefined();
  });

  it('DELETE_TRANSACTION with settlement note reverts the receivable to pending', () => {
    const rec: Receivable = {
      id: 'rec-2', type: 'receivable', subType: 'invoice', partyName: 'Client B',
      amount: 500, paidAmount: 500, dueDate: '2026-02-01', status: 'paid', paidDate: '2026-01-15',
    };
    const settleTx: Transaction = {
      id: 'tx-s', date: '2026-01-15T12:00:00Z', type: 'income', amount: 500, source: 'personal',
      accountId: 'bank', paymentAccountId: 'ar-control', receivableId: 'rec-2',
      note: 'Settlement (Full): Client B Ref:rec-2',
    };
    let s = baseState();
    s.receivables = [rec];
    s.transactions = [settleTx];

    s = financeReducer(s, { type: 'DELETE_TRANSACTION', payload: 'tx-s' });

    expect(s.transactions.find(t => t.id === 'tx-s')).toBeUndefined();
    const reverted = s.receivables.find(r => r.id === 'rec-2');
    expect(reverted?.status).toBe('pending');
    expect(reverted?.paidAmount ?? 0).toBe(0);
  });

  it('DELETE_TRANSACTION with recurringRuleId removes the recurring rule', () => {
    const rule: RecurringTransaction = {
      id: 'rule-1', type: 'expense', accountId: 'exp-1', amount: 50, currency: 'QAR',
      source: 'personal', frequency: 'monthly', nextDueDate: '2026-03-01', active: true,
    };
    const tx: Transaction = {
      id: 'tx-r', date: '2026-02-01T12:00:00Z', type: 'expense', amount: 50, source: 'personal',
      accountId: 'exp-1', paymentAccountId: 'bank', recurringRuleId: 'rule-1',
    };
    let s = baseState();
    s.recurring = [rule];
    s.transactions = [tx];

    s = financeReducer(s, { type: 'DELETE_TRANSACTION', payload: 'tx-r' });

    expect(s.recurring.find(r => r.id === 'rule-1')).toBeUndefined();
  });

  it('plain transactions delete without touching receivables', () => {
    const rec: Receivable = {
      id: 'rec-3', type: 'receivable', partyName: 'Client C',
      amount: 100, dueDate: '2026-02-01', status: 'pending',
    };
    const plain: Transaction = {
      id: 'tx-p', date: '2026-01-05T12:00:00Z', type: 'expense', amount: 25, source: 'personal',
      accountId: 'exp-1', paymentAccountId: 'bank', note: 'Coffee',
    };
    let s = baseState();
    s.receivables = [rec];
    s.transactions = [plain];

    s = financeReducer(s, { type: 'DELETE_TRANSACTION', payload: 'tx-p' });

    expect(s.transactions).toHaveLength(0);
    expect(s.receivables.find(r => r.id === 'rec-3')).toBeDefined();
  });

  it('ADD_TRANSACTION prepends and stamps lastUpdated', () => {
    let s = baseState();
    const before = s.lastUpdated;
    s = financeReducer(s, { type: 'ADD_TRANSACTION', payload: accrualTx('tx-new', 'rec-x', 10) });
    expect(s.transactions[0].id).toBe('tx-new');
    expect(s.lastUpdated).toBeTruthy();
    expect(s.lastUpdated).not.toBe(before);
  });

  it('SET_MONTHLY_BUDGET upserts by monthKey', () => {
    let s = baseState();
    s = financeReducer(s, { type: 'SET_MONTHLY_BUDGET', payload: { monthKey: '2026-01', limit: 1000 } });
    expect(s.monthlyBudgets?.find(b => b.monthKey === '2026-01')?.limit).toBe(1000);
    s = financeReducer(s, { type: 'SET_MONTHLY_BUDGET', payload: { monthKey: '2026-01', limit: 1500 } });
    expect(s.monthlyBudgets?.filter(b => b.monthKey === '2026-01')).toHaveLength(1);
    expect(s.monthlyBudgets?.find(b => b.monthKey === '2026-01')?.limit).toBe(1500);
  });
});
