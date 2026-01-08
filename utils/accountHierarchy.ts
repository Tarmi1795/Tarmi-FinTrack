
import { Account, Transaction, AccountClass } from '../types';

export interface AccountNode extends Account {
  children: AccountNode[];
  totalBalance: number; // Aggregated (Self + Children)
  directBalance: number; // Transactions directly tagged to this account
}

/**
 * Calculates the direct balance of a specific account based on transactions.
 * Returns absolute value for display, but respects normal balance logic internally.
 * Used primarily for single-account calculations (like Asset Book Value).
 */
export const calculateDirectBalance = (accountId: string, transactions: Transaction[], normalBalance: 'debit' | 'credit'): number => {
  let dr = 0;
  let cr = 0;

  transactions.forEach(t => {
    if (t.accountId === accountId) dr += t.amount;
    if (t.paymentAccountId === accountId) cr += t.amount;
  });

  // If Debit Normal (Assets/Exp): Balance = Dr - Cr
  // If Credit Normal (Liab/Eq/Rev): Balance = Cr - Dr
  const val = normalBalance === 'debit' ? (dr - cr) : (cr - dr);
  return val; 
};

/**
 * Recursively finds all descendant account IDs for a given root ID.
 * Used for generating Group/Class level Statement of Accounts.
 */
export const getAllDescendantIds = (rootId: string, accounts: Account[]): string[] => {
    const children = accounts.filter(a => a.parentId === rootId);
    let ids = [rootId];
    children.forEach(child => {
        ids = [...ids, ...getAllDescendantIds(child.id, accounts)];
    });
    return ids;
};

/**
 * Recursively builds a tree of accounts and aggregates balances.
 * Uses STRICT SIGNED MATH: Debit is Positive, Credit is Negative.
 */
export const buildAccountTree = (
  accounts: Account[], 
  transactions: Transaction[]
): Record<AccountClass, AccountNode[]> => {
  
  // 1. Initialize Nodes with Direct Balance
  const nodes: Record<string, AccountNode> = {};
  
  accounts.forEach(acc => {
    // STRICT SIGNED LOGIC: Dr - Cr
    // Assets/Expenses (Debit Normal) will be Positive.
    // Liab/Equity/Revenue (Credit Normal) will be Negative.
    // Contra accounts will naturally have the opposite sign of their class.
    
    let dr = 0;
    let cr = 0;

    transactions.forEach(t => {
      if (t.accountId === acc.id) dr += t.amount;
      if (t.paymentAccountId === acc.id) cr += t.amount;
    });

    const balance = dr - cr;

    nodes[acc.id] = {
      ...acc,
      children: [],
      directBalance: balance,
      totalBalance: 0
    };
  });

  // 2. Build Tree Structure
  const roots: Record<AccountClass, AccountNode[]> = {
    'Assets': [],
    'Liabilities': [],
    'Equity': [],
    'Revenue': [],
    'Expenses': []
  };

  const orphanNodes: AccountNode[] = [];

  accounts.forEach(acc => {
    const node = nodes[acc.id];
    if (acc.parentId && nodes[acc.parentId]) {
      nodes[acc.parentId].children.push(node);
    } else {
      // It's a root level item (Class or Top Group)
      if (roots[acc.class]) {
        roots[acc.class].push(node);
      } else {
        orphanNodes.push(node);
      }
    }
  });

  // 3. Recursive Aggregation Function
  const aggregate = (node: AccountNode): number => {
    const childSum = node.children.reduce((sum, child) => sum + aggregate(child), 0);
    node.totalBalance = node.directBalance + childSum;
    return node.totalBalance;
  };

  // 4. Trigger Aggregation from Roots
  Object.values(roots).forEach(classList => {
    classList.forEach(rootNode => aggregate(rootNode));
    // Sort by code
    classList.sort((a,b) => a.code.localeCompare(b.code));
  });

  return roots;
};

export const flattenTree = (nodes: AccountNode[]): AccountNode[] => {
    let result: AccountNode[] = [];
    nodes.forEach(node => {
        result.push(node);
        if (node.children.length > 0) {
            result = result.concat(flattenTree(node.children));
        }
    });
    return result;
};
