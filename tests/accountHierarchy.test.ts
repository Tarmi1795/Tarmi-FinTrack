
import { describe, it, expect } from 'vitest';
import { buildAccountTree, calculateDirectBalance, getAllDescendantIds, flattenTree } from '../utils/accountHierarchy';
import { Account, Transaction, AccountClass } from '../types';

const acc = (id: string, code: string, name: string, cls: AccountClass, level: Account['level'], normal: Account['normalBalance'], parentId?: string, isPosting = true): Account => ({
  id, code, name, class: cls, level, parentId, normalBalance: normal, isPosting,
});

const tx = (id: string, accountId: string, paymentAccountId: string, amount: number, date = '2026-01-15T12:00:00Z'): Transaction => ({
  id, date, type: 'transfer', amount, source: 'personal', accountId, paymentAccountId,
});

describe('calculateDirectBalance', () => {
  it('sums debits minus credits for a debit-normal account', () => {
    const txs = [
      tx('1', 'bank', 'rev', 1000),  // Dr bank
      tx('2', 'exp', 'bank', 200),   // Cr bank
      tx('3', 'cash', 'bank', 300),  // Cr bank
    ];
    expect(calculateDirectBalance('bank', txs, 'debit')).toBe(500);
  });

  it('returns credit-minus-debit for credit-normal accounts', () => {
    const txs = [
      tx('1', 'bank', 'rev', 1000),  // Cr revenue
      tx('2', 'rev', 'exp', 100),    // Dr revenue (refund)
    ];
    expect(calculateDirectBalance('rev', txs, 'credit')).toBe(900);
  });

  it('returns 0 for an account with no activity', () => {
    expect(calculateDirectBalance('nothing', [tx('1', 'a', 'b', 50)], 'debit')).toBe(0);
  });
});

describe('buildAccountTree', () => {
  const accounts: Account[] = [
    acc('10000', '10000', 'Assets', 'Assets', 'class', 'debit', undefined, false),
    acc('11100', '11100', 'Cash & Bank', 'Assets', 'group', 'debit', '10000', false),
    acc('11110', '11110', 'Main Bank', 'Assets', 'gl', 'debit', '11100'),
    acc('11120', '11120', 'Petty Cash', 'Assets', 'gl', 'debit', '11100'),
    acc('11200', '11200', 'Accounts Receivable', 'Assets', 'group', 'debit', '10000', false),
    acc('11210', '11210', 'AR Control', 'Assets', 'gl', 'debit', '11200'),
    acc('12900', '12900', 'Accumulated Depreciation', 'Assets', 'gl', 'credit', '10000'), // contra
    acc('40000', '40000', 'Revenue', 'Revenue', 'class', 'credit', undefined, false),
    acc('41100', '41100', 'Consulting', 'Revenue', 'gl', 'credit', '40000'),
    acc('50000', '50000', 'Expenses', 'Expenses', 'class', 'debit', undefined, false),
    acc('51100', '51100', 'COGS', 'Expenses', 'gl', 'debit', '50000'),
    acc('60900', '60900', 'Depreciation Expense', 'Expenses', 'gl', 'debit', '50000'),
  ];

  const transactions: Transaction[] = [
    tx('t1', '11110', '41100', 10000), // income: Dr bank / Cr revenue
    tx('t2', '51100', '11110', 300),   // cogs paid from bank
    tx('t3', '11210', '41100', 3000),  // accrual invoice (AR / revenue)
    tx('t4', '60900', '12900', 200),   // depreciation: Dr expense / Cr accum-dep
  ];

  it('roots the tree at class-level nodes', () => {
    const tree = buildAccountTree(accounts, transactions);
    expect(tree['Assets']).toHaveLength(1);
    expect(tree['Assets'][0].id).toBe('10000');
  });

  it('aggregates child balances up the hierarchy', () => {
    const tree = buildAccountTree(accounts, transactions);
    const root = tree['Assets'][0];
    const cash = root.children.find(n => n.id === '11100');
    expect(cash!.totalBalance).toBe(9700); // bank 9700 + petty 0
    const bank = cash!.children?.find(c => c.id === '11110');
    expect(bank!.totalBalance).toBe(9700);
    const ar = root.children.find(n => n.id === '11200');
    expect(ar!.totalBalance).toBe(3000);
  });

  it('contra-asset (accumulated depreciation) reduces assets via signed math', () => {
    const tree = buildAccountTree(accounts, transactions);
    const root = tree['Assets'][0];
    const contra = root.children.find(n => n.id === '12900');
    expect(contra!.totalBalance).toBe(-200); // credited → negative
    expect(root.totalBalance).toBe(9700 + 3000 - 200);
  });

  it('revenue class keeps signed credit-normal totals (negative)', () => {
    const tree = buildAccountTree(accounts, transactions);
    const revenue = tree['Revenue'].find(n => n.id === '40000');
    expect(revenue!.totalBalance).toBe(-13000);
  });

  it('expenses aggregate as positive (debit-normal)', () => {
    const tree = buildAccountTree(accounts, transactions);
    expect(tree['Expenses'][0].totalBalance).toBe(500);
  });

  it('floats orphan accounts (missing parent) as extra roots within their class', () => {
    const withOrphan = [...accounts, acc('99999', '99999', 'Orphan', 'Assets', 'gl', 'debit', 'missing-parent')];
    const tree = buildAccountTree(withOrphan, [] as Transaction[]);
    const ids = tree['Assets'].map(n => n.id);
    expect(ids).toContain('99999'); // documented behavior: becomes its own root
  });

  it('getAllDescendantIds includes the root and the full subtree', () => {
    const ids = getAllDescendantIds('10000', accounts);
    expect(ids).toEqual(expect.arrayContaining(['10000', '11100', '11110', '11120', '11200', '11210', '12900']));
    expect(ids).toHaveLength(7);
  });

  it('flattenTree walks the whole depth', () => {
    const tree = buildAccountTree(accounts, [] as Transaction[]);
    expect(flattenTree(tree['Assets']).map(n => n.id)).toEqual(
      expect.arrayContaining(['10000', '11100', '11110'])
    );
  });
});
