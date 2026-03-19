
import React, { createContext, useContext, useEffect, useReducer, useRef, useState, useCallback } from 'react';
import { AppState, Account, Receivable, Transaction, TransactionTemplate, Party, Asset, SyncConfig, BusinessProfile, MonthlyBudget, RecurringTransaction, CurrencyCode } from '../types';
import { storageService } from '../services/storage';
import { supabaseService } from '../services/supabase';
import { SUPABASE_URL, SUPABASE_KEY, DEFAULT_ACCOUNTS, SEED_PARTIES, SEED_TRANSACTIONS, SEED_RECEIVABLES, SEED_ASSETS } from '../constants';
import { addMonths, addWeeks, addYears, addDays, isPast, parseISO, isBefore, format } from 'date-fns';
import { User } from '@supabase/supabase-js';
import { calculateDirectBalance } from '../utils/accountHierarchy';

// MIGRATION HELPER
const migrateState = (oldState: any): AppState => {
    let accounts: Account[] = oldState.categories || oldState.accounts || DEFAULT_ACCOUNTS;
    // Map legacy 'categories' to 'accounts' if needed
    if (oldState.categories && !oldState.accounts) {
        // Simple mapping for migration - in a real app this would be more complex
        accounts = DEFAULT_ACCOUNTS; 
    }
    
    let parties: Party[] = oldState.entities || oldState.parties || SEED_PARTIES;
    // ensure parties is array
    if(!Array.isArray(parties)) parties = SEED_PARTIES;

    return {
        ...oldState,
        accounts: accounts.length > 0 ? accounts : DEFAULT_ACCOUNTS,
        parties: parties,
        transactions: oldState.transactions || [],
        receivables: oldState.receivables || [],
        assets: oldState.assets || [],
        templates: oldState.templates || [],
        recurring: oldState.recurring || [],
        businessProfile: oldState.businessProfile || { name: 'My Business', address: '', email: '', phone: '', baseCurrency: undefined }
    };
};

type Action =
  | { type: 'ADD_TRANSACTION'; payload: Transaction }
  | { type: 'UPDATE_TRANSACTION'; payload: Transaction }
  | { type: 'DELETE_TRANSACTION'; payload: string }
  | { type: 'ADD_ACCOUNT'; payload: Account }
  | { type: 'UPDATE_ACCOUNT'; payload: Account }
  | { type: 'DELETE_ACCOUNT'; payload: string }
  | { type: 'ADD_RECEIVABLE'; payload: Receivable }
  | { type: 'UPDATE_RECEIVABLE'; payload: Receivable }
  | { type: 'DELETE_RECEIVABLE'; payload: string }
  | { type: 'ADD_TEMPLATE'; payload: TransactionTemplate }
  | { type: 'DELETE_TEMPLATE'; payload: string }
  | { type: 'ADD_PARTY'; payload: Party }
  | { type: 'UPDATE_PARTY'; payload: Party }
  | { type: 'DELETE_PARTY'; payload: string }
  | { type: 'ADD_ASSET'; payload: Asset }
  | { type: 'UPDATE_ASSET'; payload: Asset }
  | { type: 'DELETE_ASSET'; payload: string }
  | { type: 'UPDATE_BUSINESS_PROFILE'; payload: BusinessProfile }
  | { type: 'SET_MONTHLY_BUDGET'; payload: MonthlyBudget }
  | { type: 'ADD_RECURRING'; payload: RecurringTransaction }
  | { type: 'UPDATE_RECURRING'; payload: RecurringTransaction }
  | { type: 'DELETE_RECURRING'; payload: string }
  | { type: 'PROCESS_RECURRING_UPDATES'; payload: { transactions: Transaction[], updatedRecurring: RecurringTransaction[] } }
  | { type: 'PROCESS_ASSET_DEPRECIATION'; payload: { transactions: Transaction[], updatedAssets: Asset[] } }
  | { type: 'RESET_DATA' }
  | { type: 'SET_STATE'; payload: any }
  | { type: 'MIGRATE_BASE_CURRENCY'; payload: { newCurrency: CurrencyCode; rate: number } };

const rawState = storageService.load();
const initialState: AppState = rawState ? migrateState(rawState) : {
    transactions: SEED_TRANSACTIONS,
    accounts: DEFAULT_ACCOUNTS,
    receivables: SEED_RECEIVABLES,
    templates: [],
    recurring: [],
    parties: SEED_PARTIES,
    assets: SEED_ASSETS,
    businessProfile: { name: 'My Business', email: '', phone: '', address: '', baseCurrency: undefined }
};

const financeReducer = (state: AppState, action: Action): AppState => {
  let newState: AppState;
  const timestamp = new Date().toISOString();
  const withTime = (s: AppState) => ({ ...s, lastUpdated: timestamp });
  
  switch (action.type) {
    case 'SET_STATE': return migrateState(action.payload);
    case 'ADD_TRANSACTION':
      newState = withTime({ ...state, transactions: [action.payload, ...state.transactions] });
      break;
    case 'UPDATE_TRANSACTION':
      newState = withTime({ ...state, transactions: state.transactions.map(t => t.id === action.payload.id ? action.payload : t) });
      break;
    case 'DELETE_TRANSACTION':
      const txToDelete = state.transactions.find(t => t.id === action.payload);
      let updatedReceivables = state.receivables;
      
      // SYNC LOGIC: Journal -> AR/AP
      if (txToDelete && txToDelete.note && txToDelete.note.includes('Ref:')) {
          const parts = txToDelete.note.split('Ref:');
          if (parts.length > 1) {
              const potentialId = parts[1].trim().split(' ')[0]; // Extract ID
              if (potentialId) {
                  const lowerNote = txToDelete.note.toLowerCase();
                  if (lowerNote.includes('accrual')) {
                      // If Accrual (Origin) is deleted, delete the Receivable/Payable record entirely
                      updatedReceivables = updatedReceivables.filter(r => r.id !== potentialId);
                  } else if (lowerNote.includes('settlement')) {
                      // If Settlement (Payment) is deleted, reverse the paid amount and status
                      updatedReceivables = updatedReceivables.map(r => {
                          if (r.id === potentialId) {
                              const newPaid = Math.max(0, (r.paidAmount || 0) - txToDelete.amount);
                              return {
                                  ...r,
                                  paidAmount: newPaid,
                                  status: 'pending', // Revert to pending
                                  paidDate: undefined
                              };
                          }
                          return r;
                      });
                  }
              }
          }
      }

      newState = withTime({ 
          ...state, 
          transactions: state.transactions.filter(t => t.id !== action.payload),
          receivables: updatedReceivables
      });
      break;
    case 'ADD_ACCOUNT':
      newState = withTime({ ...state, accounts: [...state.accounts, action.payload] });
      break;
    case 'UPDATE_ACCOUNT':
      newState = withTime({ ...state, accounts: state.accounts.map(c => c.id === action.payload.id ? action.payload : c) });
      break;
    case 'DELETE_ACCOUNT':
      newState = withTime({ ...state, accounts: state.accounts.filter(c => c.id !== action.payload) });
      break;
    case 'ADD_RECEIVABLE':
      newState = withTime({ ...state, receivables: [action.payload, ...state.receivables] });
      break;
    case 'UPDATE_RECEIVABLE':
      newState = withTime({ ...state, receivables: state.receivables.map(r => r.id === action.payload.id ? action.payload : r) });
      break;
    case 'DELETE_RECEIVABLE':
      const recId = action.payload;
      // SYNC LOGIC: AR/AP -> Journal
      // Delete any transactions that reference this ID
      newState = withTime({ 
          ...state, 
          receivables: state.receivables.filter(r => r.id !== action.payload),
          transactions: state.transactions.filter(t => !t.note?.includes(`Ref:${recId}`))
      });
      break;
    case 'ADD_TEMPLATE':
      newState = withTime({ ...state, templates: [...state.templates, action.payload] });
      break;
    case 'DELETE_TEMPLATE':
      newState = withTime({ ...state, templates: state.templates.filter(t => t.id !== action.payload) });
      break;
    case 'ADD_PARTY':
      newState = withTime({ ...state, parties: [...state.parties, action.payload] });
      break;
    case 'UPDATE_PARTY':
      // 1. Update Party Record
      const updatedParties = state.parties.map(e => e.id === action.payload.id ? action.payload : e);
      
      // 2. Cascade: Update Receivables Party Name
      const updatedReceivablesList = state.receivables.map(r => {
          if (r.partyId === action.payload.id) {
              return { ...r, partyName: action.payload.name };
          }
          return r;
      });

      // 3. Cascade: Update Linked Account Name
      let updatedAccountsList = state.accounts;
      if (action.payload.linkedAccountId) {
          updatedAccountsList = state.accounts.map(a => {
              if (a.id === action.payload.linkedAccountId) {
                  return { ...a, name: action.payload.name };
              }
              return a;
          });
      }

      newState = withTime({ 
          ...state, 
          parties: updatedParties,
          receivables: updatedReceivablesList,
          accounts: updatedAccountsList
      });
      break;
    case 'DELETE_PARTY':
      newState = withTime({ ...state, parties: state.parties.filter(e => e.id !== action.payload) });
      break;
    case 'ADD_ASSET':
      newState = withTime({ ...state, assets: [...state.assets, action.payload] });
      break;
    case 'UPDATE_ASSET':
      newState = withTime({ ...state, assets: state.assets.map(a => a.id === action.payload.id ? action.payload : a) });
      break;
    case 'DELETE_ASSET':
      newState = withTime({ ...state, assets: state.assets.filter(a => a.id !== action.payload) });
      break;
    case 'UPDATE_BUSINESS_PROFILE':
      newState = withTime({ ...state, businessProfile: action.payload });
      break;
    case 'SET_MONTHLY_BUDGET':
      const budgets = state.monthlyBudgets || [];
      const existingIndex = budgets.findIndex(b => b.monthKey === action.payload.monthKey);
      let newBudgets;
      if (existingIndex >= 0) {
          const existing = budgets[existingIndex];
          newBudgets = [...budgets];
          newBudgets[existingIndex] = action.payload;
      } else {
          newBudgets = [...budgets, action.payload];
      }
      newState = withTime({ ...state, monthlyBudgets: newBudgets });
      break;
    case 'ADD_RECURRING':
      const currentRec = state.recurring || [];
      newState = withTime({ ...state, recurring: [...currentRec, action.payload] });
      break;
    case 'UPDATE_RECURRING':
      newState = withTime({ ...state, recurring: (state.recurring || []).map(r => r.id === action.payload.id ? action.payload : r) });
      break;
    case 'DELETE_RECURRING':
      newState = withTime({ ...state, recurring: (state.recurring || []).filter(r => r.id !== action.payload) });
      break;
    case 'PROCESS_RECURRING_UPDATES':
        newState = withTime({
            ...state,
            transactions: [...action.payload.transactions, ...state.transactions],
            recurring: state.recurring.map(r => {
                const updated = action.payload.updatedRecurring.find(ur => ur.id === r.id);
                return updated || r;
            })
        });
        break;

    case 'PROCESS_ASSET_DEPRECIATION':
        newState = withTime({
            ...state,
            transactions: [...action.payload.transactions, ...state.transactions],
            assets: state.assets.map(a => {
                const updated = action.payload.updatedAssets.find(ua => ua.id === a.id);
                return updated || a;
            })
        });
        break;

    case 'MIGRATE_BASE_CURRENCY':
        const { newCurrency, rate } = action.payload;
        // 1. Update Profile
        const updatedProfile = { ...state.businessProfile, baseCurrency: newCurrency };
        
        // 2. Recalculate Transactions (Base Amount)
        // We preserve originalAmount and update 'amount' (base normalized)
        const updatedTransactions = state.transactions.map(t => ({
            ...t,
            amount: t.originalAmount ? (t.originalAmount * rate) : (t.amount * rate)
        }));

        // 3. Recalculate Assets
        const updatedAssetsMigrated = state.assets.map(a => ({
            ...a,
            value: a.value * rate, // Book Value
            originalValue: a.originalValue * rate // Original Cost
        }));

        // 4. Recalculate Receivables
        const updatedReceivablesMigrated = state.receivables.map(r => ({
            ...r,
            amount: r.amount * rate,
            paidAmount: r.paidAmount ? r.paidAmount * rate : 0
        }));

        newState = withTime({
            ...state,
            businessProfile: updatedProfile,
            transactions: updatedTransactions,
            assets: updatedAssetsMigrated,
            receivables: updatedReceivablesMigrated
        });
        break;

    case 'RESET_DATA':
      storageService.clear(); 
      newState = { ...initialState, lastUpdated: new Date(0).toISOString() };
      break;
    default:
      return state;
  }
  
  storageService.save(newState);
  return newState;
};

interface FinanceContextType {
  state: AppState;
  dispatch: React.Dispatch<Action>;
  syncConfig: SyncConfig;
  updateSyncConfig: (cfg: SyncConfig) => void;
  refreshData: () => Promise<void>;
  pushDataManual: () => Promise<void>;
  syncStatus: 'offline' | 'syncing' | 'synced' | 'error';
  lastError?: string;
  user: User | null;
  authLoading: boolean;
  authMethods: {
      login: (e: string, p: string) => Promise<any>;
      signUp: (e: string, p: string) => Promise<any>;
      signInWithGoogle: () => Promise<any>;
      logout: () => Promise<void>;
  };
}

const FinanceContext = createContext<FinanceContextType | undefined>(undefined);

export const FinanceProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [state, dispatch] = useReducer(financeReducer, initialState);
  const stateRef = useRef(state);
  useEffect(() => { stateRef.current = state; }, [state]);

  const [syncConfig, setSyncConfig] = useState<SyncConfig>(() => {
    const saved = storageService.loadSyncConfig();
    return saved || { supabaseUrl: SUPABASE_URL, supabaseKey: SUPABASE_KEY, enabled: true };
  });

  const [syncStatus, setSyncStatus] = useState<'offline' | 'syncing' | 'synced' | 'error'>('offline');
  const [lastError, setLastError] = useState<string | undefined>(undefined);
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  
  const isRemoteUpdate = useRef(false);
  const isPullingRef = useRef(false); 

  useEffect(() => {
    let timeout: ReturnType<typeof setTimeout>;
    if (syncStatus === 'syncing') {
        timeout = setTimeout(() => {
            console.warn("Sync timed out");
            setSyncStatus(navigator.onLine ? 'synced' : 'offline'); 
            isPullingRef.current = false; 
        }, 10000); 
    }
    return () => clearTimeout(timeout);
  }, [syncStatus]);

  const performPull = useCallback(async (currentUser: User) => {
    if (!navigator.onLine || !currentUser) { setSyncStatus('offline'); return; }
    if (isPullingRef.current) return; 

    isPullingRef.current = true;
    setSyncStatus('syncing');
    setLastError(undefined);
    
    try {
        const { data, error } = await supabaseService.pullData(currentUser.id);
        
        if (error) {
            console.warn("Sync Pull Error:", error);
            if (String(error).includes('404') || String(error).includes('406') || String(error).includes('PGRST116')) {
                 console.log("New user detected, pushing seed data.");
                 const { error: pushError } = await supabaseService.pushData(currentUser.id, stateRef.current);
                 if (pushError) setLastError(String(pushError));
                 setSyncStatus('synced');
            } else {
                 setLastError(String(error));
                 setSyncStatus('error');
            }
        } else if (data) {
            isRemoteUpdate.current = true;
            // Ensure migration happens on pull
            dispatch({ type: 'SET_STATE', payload: data });
            console.log("Loaded user data successfully");
            setSyncStatus('synced');
        } else {
             setSyncStatus('synced');
        }
    } catch (e) {
        console.error("Pull execution error:", e);
        setSyncStatus('error');
    } finally {
        isPullingRef.current = false;
    }
  }, []); 

  // AUTH & INITIALIZATION
  useEffect(() => {
    if (syncConfig.supabaseUrl && syncConfig.supabaseKey) {
        supabaseService.updateClient(syncConfig.supabaseUrl, syncConfig.supabaseKey);
    }

    const { data: { subscription } } = supabaseService.auth.onAuthStateChange(async (event, session) => {
        const currentUser = session?.user ?? null;
        setUser(currentUser);
        setAuthLoading(false); 

        if (event === 'SIGNED_IN' && currentUser) {
            performPull(currentUser); 
        } else if (event === 'SIGNED_OUT') {
            dispatch({ type: 'RESET_DATA' });
            setSyncStatus('offline');
            setUser(null);
            isPullingRef.current = false;
        }
    });

    supabaseService.auth.getUser().then((currentUser) => {
        setAuthLoading(false); 
        if (currentUser) {
            setUser(currentUser);
            performPull(currentUser);
        }
    });

    return () => {
        subscription.unsubscribe();
    };
  }, [syncConfig, performPull]); 

  // Check online status
  useEffect(() => {
    const handleOnline = () => { if(user) setSyncStatus('synced'); };
    const handleOffline = () => setSyncStatus('offline');
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
        window.removeEventListener('online', handleOnline);
        window.removeEventListener('offline', handleOffline);
    };
  }, [user]);

  // Automated Checks (Recurring & Depreciation)
  useEffect(() => {
      const recurringRules = state.recurring || [];
      const hasAssets = state.assets && state.assets.length > 0;
      
      if (recurringRules.length === 0 && !hasAssets) return;
      
      const now = new Date();
      const newRecTransactions: Transaction[] = [];
      const updatedRecurring: RecurringTransaction[] = [];

      recurringRules.forEach(rule => {
          if (rule.active && rule.nextDueDate) {
              const dueDate = parseISO(rule.nextDueDate);
              if (isPast(dueDate)) {
                  newRecTransactions.push({
                      id: Math.random().toString(36).substr(2, 9),
                      date: new Date().toISOString(), 
                      type: rule.type,
                      amount: rule.amount,
                      currency: rule.currency,
                      originalAmount: rule.originalAmount,
                      accountId: rule.accountId,
                      source: rule.source,
                      paymentAccountId: rule.paymentAccountId,
                      relatedPartyId: rule.partyId,
                      note: `Recurring: ${rule.note || 'Auto Transaction'}`
                  });

                  // STRICT DATE CALCULATION FOR AUTOMATED SCHEDULER
                  const dateStr = rule.nextDueDate.split('T')[0];
                  const baseDate = new Date(dateStr + 'T00:00:00.000Z');
                  
                  let nextDate = baseDate;
                  if (rule.frequency === 'daily') nextDate = addDays(baseDate, 1);
                  if (rule.frequency === 'weekly') nextDate = addWeeks(baseDate, 1);
                  if (rule.frequency === 'monthly') nextDate = addMonths(baseDate, 1);
                  if (rule.frequency === 'yearly') nextDate = addYears(baseDate, 1);

                  updatedRecurring.push({
                      ...rule,
                      lastRunDate: new Date().toISOString(),
                      nextDueDate: nextDate.toISOString()
                  });
              }
          }
      });

      if (newRecTransactions.length > 0) {
          dispatch({ type: 'PROCESS_RECURRING_UPDATES', payload: { transactions: newRecTransactions, updatedRecurring } });
      }

      // --- DYNAMIC DEPRECIATION LOGIC ---
      const newDepTransactions: Transaction[] = [];
      const updatedAssets: Asset[] = [];
      
      const depExpAccount = state.accounts.find(c => c.code === '60900');
      const globalAccumDepAccount = state.accounts.find(c => c.code === '12900');

      if (depExpAccount && state.assets) {
          state.assets.forEach(asset => {
              let specificAccumDep = state.accounts.find(a => a.name === `Accum Dep - ${asset.name}`);
              const targetCreditAccount = specificAccumDep || globalAccumDepAccount;

              if (!targetCreditAccount) return; 

              let currentBookValue = 0;
              let totalDepreciatedLedger = 0;

              if (specificAccumDep) {
                  totalDepreciatedLedger = calculateDirectBalance(specificAccumDep.id, state.transactions, 'credit');
                  currentBookValue = asset.originalValue - totalDepreciatedLedger;
              } else {
                  currentBookValue = asset.value;
              }

              if (currentBookValue <= 0.01) return; // Fully depreciated

              const monthlyAmount = asset.originalValue / (asset.usefulLifeYears * 12);
              
              let nextRunDate = asset.lastDepreciationDate 
                  ? addMonths(parseISO(asset.lastDepreciationDate), 1)
                  : addMonths(parseISO(asset.purchaseDate), 1); 
              
              let lastRun = asset.lastDepreciationDate;
              let hasUpdates = false;
              let tempBookValue = currentBookValue;

              while (isBefore(nextRunDate, now)) {
                  if (tempBookValue <= 0.01) break;

                  const amountToDepreciate = Math.min(monthlyAmount, tempBookValue);

                  hasUpdates = true;
                  newDepTransactions.push({
                      id: Math.random().toString(36).substr(2, 9),
                      date: nextRunDate.toISOString(),
                      type: 'expense',
                      accountId: depExpAccount.id, // Debit Expense
                      paymentAccountId: targetCreditAccount.id, // Credit Specific or Global Accum Dep
                      amount: amountToDepreciate,
                      currency: asset.currency,
                      originalAmount: amountToDepreciate,
                      source: 'personal',
                      note: `Auto Depreciation: ${asset.name} (${format(nextRunDate, 'MMM yyyy')})`
                  });
                  
                  tempBookValue -= amountToDepreciate;
                  lastRun = nextRunDate.toISOString();
                  nextRunDate = addMonths(nextRunDate, 1);
              }

              if (hasUpdates) {
                  updatedAssets.push({ 
                      ...asset, 
                      value: Math.max(0, tempBookValue), 
                      lastDepreciationDate: lastRun 
                  });
              }
          });

          if (newDepTransactions.length > 0) {
              dispatch({ type: 'PROCESS_ASSET_DEPRECIATION', payload: { transactions: newDepTransactions, updatedAssets } });
          }
      }

  }, [state.accounts, state.assets, state.recurring, state.transactions.length]);

  // Push on state change
  useEffect(() => {
    if (syncStatus === 'offline' || !navigator.onLine || !user) return;
    if (syncStatus === 'syncing') return; 
    
    if (isRemoteUpdate.current) { isRemoteUpdate.current = false; return; }
    if (syncStatus === 'error') return; 

    const push = async () => {
      if (isPullingRef.current) return; 
      setSyncStatus('syncing');
      setLastError(undefined);
      const { error } = await supabaseService.pushData(user.id, state);
      if (error) {
        setLastError(String(error));
        setSyncStatus('error');
      } else {
        setSyncStatus('synced');
      }
    };
    const timeout = setTimeout(push, 3000); 
    return () => clearTimeout(timeout);
  }, [state]); 

  const pushDataManual = async () => {
      if(!user) return;
      setSyncStatus('syncing');
      const { error } = await supabaseService.pushData(user.id, state);
      if (error) { setSyncStatus('error'); alert("Upload Failed: " + (error.message || error)); } 
      else { setSyncStatus('synced'); alert("Upload Successful!"); }
  }

  const updateSyncConfig = (cfg: SyncConfig) => {
    setSyncConfig(cfg);
    storageService.saveSyncConfig(cfg); 
  };

  const refreshData = async () => {
      if (user) await performPull(user);
  };

  const authMethods = {
      login: (e: string, p: string) => supabaseService.auth.login(e, p),
      signUp: (e: string, p: string) => supabaseService.auth.signUp(e, p),
      signInWithGoogle: () => supabaseService.auth.signInWithGoogle(),
      logout: async () => {
          setUser(null);
          setSyncStatus('offline');
          dispatch({ type: 'RESET_DATA' });
          isPullingRef.current = false;
          try {
            await supabaseService.auth.logout();
          } catch (e) {
            console.error("Supabase logout warning:", e);
          }
      }
  };

  return (
    <FinanceContext.Provider value={{ state, dispatch, syncConfig, updateSyncConfig, refreshData, pushDataManual, syncStatus, lastError, user, authLoading, authMethods }}>
      {children}
    </FinanceContext.Provider>
  );
};

export const useFinance = () => {
  const context = useContext(FinanceContext);
  if (!context) throw new Error('useFinance must be used within a FinanceProvider');
  return context;
};
