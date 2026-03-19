
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { AppState, Account, Transaction, Party, Asset, Receivable, RecurringTransaction, TransactionTemplate, MonthlyBudget } from '../types';
import { SUPABASE_URL, SUPABASE_KEY } from '../constants';

// Track current credentials to avoid unnecessary client recreation
let currentUrl = SUPABASE_URL;
let currentKey = SUPABASE_KEY;

// Initialize with defaults if available
let supabaseClient: SupabaseClient | null = null;
try {
    if (currentUrl && currentKey) {
        supabaseClient = createClient(currentUrl, currentKey);
    }
} catch (e) {
    console.warn("Supabase client init failed:", e);
}

// --- DB Mapping Helpers ---
const toDB = {
    account: (a: Account, uid: string) => ({
        id: a.id, user_id: uid, code: a.code, name: a.name, class: a.class, level: a.level,
        parent_id: a.parentId, normal_balance: a.normalBalance, is_posting: a.isPosting, is_system: a.isSystem
    }),
    transaction: (t: Transaction, uid: string) => ({
        id: t.id, user_id: uid, date: t.date, type: t.type, amount: t.amount, original_amount: t.originalAmount,
        currency: t.currency, account_id: t.accountId, payment_account_id: t.paymentAccountId, source: t.source,
        note: t.note, related_party_id: t.relatedPartyId
    }),
    party: (p: Party, uid: string) => ({
        id: p.id, user_id: uid, name: p.name, type: p.type, email: p.email, phone: p.phone,
        address: p.address, linked_account_id: p.linkedAccountId
    }),
    asset: (a: Asset, uid: string) => ({
        id: a.id, user_id: uid, name: a.name, value: a.value, original_value: a.originalValue, currency: a.currency,
        purchase_date: a.purchaseDate, useful_life_years: a.usefulLifeYears, last_depreciation_date: a.lastDepreciationDate,
        note: a.note, linked_account_id: a.linkedAccountId
    }),
    receivable: (r: Receivable, uid: string) => {
        const payload: any = {
            id: r.id, user_id: uid, type: r.type, sub_type: r.subType, party_name: r.partyName, party_id: r.partyId,
            target_account_id: r.targetAccountId, amount: r.amount, original_amount: r.originalAmount, currency: r.currency,
            due_date: r.dueDate, status: r.status, notes: r.notes, paid_date: r.paidDate, recurring: r.recurring,
            paid_amount: r.paidAmount || 0 
        };
        if (r.issueDate) {
            payload.issue_date = r.issueDate;
        }
        return payload;
    },
    recurring: (r: RecurringTransaction, uid: string) => ({
        id: r.id, user_id: uid, active: r.active, type: r.type, account_id: r.accountId, amount: r.amount, currency: r.currency,
        source: r.source, payment_account_id: r.paymentAccountId, party_id: r.partyId, note: r.note,
        frequency: r.frequency, next_due_date: r.nextDueDate, last_run_date: r.lastRunDate, original_amount: r.originalAmount
    }),
    template: (t: TransactionTemplate, uid: string) => ({
        id: t.id, user_id: uid, name: t.name, account_id: t.accountId, amount: t.amount, currency: t.currency,
        note: t.note, icon: t.icon, color: t.color, party_id: t.partyId, payment_account_id: t.paymentAccountId, source: t.source
    }),
    budget: (b: MonthlyBudget, uid: string) => ({
        month_key: b.monthKey, user_id: uid, limit: b.limit, category_limits: b.categoryLimits, visible_account_ids: b.visibleAccountIds
    })
};

const fromDB = {
    account: (r: any): Account => ({
        id: r.id, code: r.code, name: r.name, class: r.class, level: r.level,
        parentId: r.parent_id, normalBalance: r.normal_balance, isPosting: r.is_posting, isSystem: r.is_system
    }),
    transaction: (r: any): Transaction => ({
        id: r.id, date: r.date, type: r.type, amount: r.amount, originalAmount: r.original_amount,
        currency: r.currency, accountId: r.account_id, paymentAccountId: r.payment_account_id, source: r.source,
        note: r.note, relatedPartyId: r.related_party_id
    }),
    party: (r: any): Party => ({
        id: r.id, name: r.name, type: r.type, email: r.email, phone: r.phone,
        address: r.address, linkedAccountId: r.linked_account_id
    }),
    asset: (r: any): Asset => ({
        id: r.id, name: r.name, value: r.value, originalValue: r.original_value, currency: r.currency,
        purchaseDate: r.purchase_date, usefulLifeYears: r.useful_life_years, lastDepreciationDate: r.last_depreciation_date,
        note: r.note, linkedAccountId: r.linked_account_id
    }),
    receivable: (r: any): Receivable => ({
        id: r.id, type: r.type, subType: r.sub_type, partyName: r.party_name, partyId: r.party_id,
        targetAccountId: r.target_account_id, amount: r.amount, originalAmount: r.original_amount, currency: r.currency,
        issueDate: r.issue_date, dueDate: r.due_date, status: r.status, notes: r.notes, paidDate: r.paid_date, recurring: r.recurring,
        paidAmount: r.paid_amount || 0 
    }),
    recurring: (r: any): RecurringTransaction => ({
        id: r.id, active: r.active, type: r.type, accountId: r.account_id, amount: r.amount, currency: r.currency,
        source: r.source, paymentAccountId: r.payment_account_id, partyId: r.party_id, note: r.note,
        frequency: r.frequency, nextDueDate: r.next_due_date, lastRunDate: r.last_run_date, originalAmount: r.original_amount
    }),
    template: (r: any): TransactionTemplate => ({
        id: r.id, name: r.name, accountId: r.account_id, amount: r.amount, currency: r.currency,
        note: r.note, icon: r.icon, color: r.color, partyId: r.party_id, paymentAccountId: r.payment_account_id, source: r.source
    }),
    budget: (r: any): MonthlyBudget => ({
        monthKey: r.month_key, limit: r.limit, categoryLimits: r.category_limits, visibleAccountIds: r.visible_account_ids
    })
};

// --- Sync Helper Logic ---
// Handles Upsert AND Deletion by diffing local vs remote IDs
const syncTable = async (
    tableName: string, 
    localData: any[], 
    mapper: (item: any, uid: string) => any, 
    userId: string,
    idField: string = 'id'
) => {
    if (!supabaseClient) return;

    // 1. Upsert Local Items (Create & Update)
    if (localData.length > 0) {
        const batchSize = 50;
        for (let i = 0; i < localData.length; i += batchSize) {
            const chunk = localData.slice(i, i + batchSize);
            const { error: upsertError } = await supabaseClient
                .from(tableName)
                .upsert(chunk.map(item => mapper(item, userId)));
            if (upsertError) throw upsertError;
        }
    }

    // 2. Delete Remote Items NOT in Local (The CRUD Delete)
    // Fetch all remote IDs to identify what has been deleted locally
    const { data: remoteData, error: fetchError } = await supabaseClient
        .from(tableName)
        .select(idField)
        .eq('user_id', userId);
    
    if (fetchError) throw fetchError;

    if (remoteData) {
        const localIdSet = new Set(localData.map((d: any) => {
            // Special handling for Budget which uses monthKey property but maps to month_key DB column
            return idField === 'month_key' ? d.monthKey : d.id;
        }));
        
        const idsToDelete = remoteData
            .map((row: any) => row[idField])
            .filter((remoteId: string) => !localIdSet.has(remoteId));

        if (idsToDelete.length > 0) {
            console.log(`Deleting ${idsToDelete.length} items from ${tableName}...`);
            // Delete in batches
            const deleteBatchSize = 50;
            for (let i = 0; i < idsToDelete.length; i += deleteBatchSize) {
                const batch = idsToDelete.slice(i, i + deleteBatchSize);
                const { error: deleteError } = await supabaseClient
                    .from(tableName)
                    .delete()
                    .eq('user_id', userId) // Security: ensure we only delete user's data
                    .in(idField, batch);
                
                if (deleteError) {
                    console.error("Delete failed", deleteError);
                    throw deleteError;
                }
            }
        }
    }
}


export const supabaseService = {
  updateClient: (url: string, key: string) => {
    if (!url || !key) return;
    if (url === currentUrl && key === currentKey && supabaseClient) return;
    try {
        console.log("Updating Supabase Client connection...");
        currentUrl = url; currentKey = key;
        supabaseClient = createClient(url, key);
    } catch (e) {
        console.error("Failed to update Supabase client", e);
    }
  },

  getClient: () => supabaseClient,
  isConnected: () => !!supabaseClient, 

  auth: {
    login: async (email: string, password: string) => {
         if(!supabaseClient) return { error: { message: "Supabase not configured in Settings" } };
         return supabaseClient.auth.signInWithPassword({ email, password });
    },
    signUp: async (email: string, password: string) => {
         if(!supabaseClient) return { error: { message: "Supabase not configured in Settings" } };
         return supabaseClient.auth.signUp({ email, password });
    },
    signInWithGoogle: async () => {
         if(!supabaseClient) return { error: { message: "Supabase not configured in Settings" } };
         return supabaseClient.auth.signInWithOAuth({ provider: 'google' });
    },
    logout: async () => { if(!supabaseClient) return; return supabaseClient.auth.signOut(); },
    getUser: async () => {
        if(!supabaseClient) return null;
        const { data: { user } } = await supabaseClient.auth.getUser();
        return user;
    },
    onAuthStateChange: (callback: (event: any, session: any) => void) => {
        if(!supabaseClient) return { data: { subscription: { unsubscribe: () => {} } } };
        return supabaseClient.auth.onAuthStateChange(callback);
    }
  },

  // --- Normalized Data Methods ---
  pullData: async (userId: string): Promise<{ data: AppState | null; error: any }> => {
    if(!supabaseClient) return { data: null, error: "Client not initialized" };
    
    try {
      console.log(`Pulling normalized data for user: ${userId}...`);

      // Parallel fetch for speed
      const [
          accountsRes, partiesRes, transactionsRes, assetsRes, 
          receivablesRes, templatesRes, recurringRes, budgetsRes, profilesRes
      ] = await Promise.all([
          supabaseClient.from('fintrack_accounts').select('*').eq('user_id', userId),
          supabaseClient.from('fintrack_parties').select('*').eq('user_id', userId),
          supabaseClient.from('fintrack_transactions').select('*').eq('user_id', userId),
          supabaseClient.from('fintrack_assets').select('*').eq('user_id', userId),
          supabaseClient.from('fintrack_receivables').select('*').eq('user_id', userId),
          supabaseClient.from('fintrack_templates').select('*').eq('user_id', userId),
          supabaseClient.from('fintrack_recurring').select('*').eq('user_id', userId),
          supabaseClient.from('fintrack_budgets').select('*').eq('user_id', userId),
          supabaseClient.from('fintrack_profiles').select('*').eq('id', userId).maybeSingle()
      ]);

      // Check for missing table error specifically on the core tables
      if (accountsRes.error && accountsRes.error.code === '42P01') {
          return { data: null, error: "Missing Tables. Please run Setup SQL in Settings > Sync." };
      }
      
      // If basic fetches fail
      if (accountsRes.error) throw accountsRes.error;
      if (transactionsRes.error) throw transactionsRes.error;

      // Map to AppState
      const newState: AppState = {
          accounts: (accountsRes.data || []).map(fromDB.account),
          parties: (partiesRes.data || []).map(fromDB.party),
          transactions: (transactionsRes.data || []).map(fromDB.transaction),
          assets: (assetsRes.data || []).map(fromDB.asset),
          receivables: (receivablesRes.data || []).map(fromDB.receivable),
          templates: (templatesRes.data || []).map(fromDB.template),
          recurring: (recurringRes.data || []).map(fromDB.recurring),
          monthlyBudgets: (budgetsRes.data || []).map(fromDB.budget),
          businessProfile: profilesRes.data ? {
              name: profilesRes.data.name || 'My Business',
              address: profilesRes.data.address || '',
              phone: profilesRes.data.phone || '',
              email: profilesRes.data.email || '',
              baseCurrency: profilesRes.data.base_currency // Map base_currency
          } : { name: 'My Business', address: '', phone: '', email: '' }
      };

      // Basic empty state check - if no accounts exist, it might be a fresh user
      if (newState.accounts.length === 0) {
          console.log("No remote data found (New Account).");
          // Return null data so the app can initialize seed data locally
          return { data: null, error: null };
      }

      console.log("Data pulled successfully.");
      return { data: newState, error: null };

    } catch (e: any) {
      const msg = e.message || String(e);
      console.warn("Supabase Pull Exception:", msg); 
      return { data: null, error: msg };
    }
  },

  pushData: async (userId: string, state: AppState): Promise<{ error: any }> => {
    if(!supabaseClient) return { error: "Client not initialized" };

    try {
      console.log(`Pushing normalized data for user: ${userId}...`);

      const p = state;
      
      // Execute syncs SEQUENTIALLY to avoid "Failed to fetch" due to browser connection limits/congestion
      await syncTable('fintrack_accounts', p.accounts, toDB.account, userId);
      await syncTable('fintrack_parties', p.parties, toDB.party, userId);
      await syncTable('fintrack_transactions', p.transactions, toDB.transaction, userId);
      await syncTable('fintrack_assets', p.assets, toDB.asset, userId);
      await syncTable('fintrack_receivables', p.receivables, toDB.receivable, userId);
      await syncTable('fintrack_recurring', p.recurring, toDB.recurring, userId);
      await syncTable('fintrack_templates', p.templates, toDB.template, userId);
      
      if (p.monthlyBudgets) {
          await syncTable('fintrack_budgets', p.monthlyBudgets, toDB.budget, userId, 'month_key');
      }

      // Profile is a single row, simple upsert is fine
      await supabaseClient.from('fintrack_profiles').upsert({
          id: userId,
          name: p.businessProfile.name,
          address: p.businessProfile.address,
          phone: p.businessProfile.phone,
          email: p.businessProfile.email,
          base_currency: p.businessProfile.baseCurrency // Save baseCurrency
      });
      
      console.log("Data pushed successfully.");
      return { error: null };
    } catch (e: any) {
      const msg = e.message || String(e);
      console.error("Supabase Push Exception:", msg);
      
      if (typeof msg === 'string' && msg.includes('42P01')) {
          return { error: "Missing Tables. Please run Setup SQL in Settings > Sync." };
      }
      return { error: msg };
    }
  }
};

export const supabase = supabaseClient || createClient('https://placeholder.supabase.co', 'placeholder');
