import { AppState, Account, Receivable, Transaction, SyncConfig, Party } from '../types';
import { DEFAULT_ACCOUNTS, SEED_RECEIVABLES, SEED_TRANSACTIONS, SEED_TEMPLATES, SEED_RECURRING, SEED_PARTIES, SEED_ASSETS } from '../constants';

const STORAGE_KEY = 'fintrack_pro_data_v4'; 
const AUTH_KEY = 'fintrack_lock_code';
const CONFIG_KEY = 'fintrack_sync_config';

const getInitialState = (): AppState => {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored) {
    try {
      const parsed = JSON.parse(stored);
      // Migration/Safety check for new fields
      if (!parsed.templates) parsed.templates = [];
      if (!parsed.recurring) parsed.recurring = [];
      if (!parsed.parties) {
          // Attempt migration from entities if exists
          parsed.parties = parsed.entities || [];
          delete parsed.entities;
      }
      if (!parsed.assets) parsed.assets = [];
      if (!parsed.receivables) parsed.receivables = [];
      
      // MIGRATION: Ensure all DEFAULT system accounts exist
      if (parsed.accounts) {
          const existingIds = new Set(parsed.accounts.map((c: Account) => c.id));
          const missingDefaults = DEFAULT_ACCOUNTS.filter(dc => dc.isSystem && !existingIds.has(dc.id));
          if (missingDefaults.length > 0) {
              parsed.accounts = [...parsed.accounts, ...missingDefaults];
          }
      } else if (parsed.categories) {
          // Very basic migration from categories to accounts if strictly needed, otherwise reset to defaults
          // For simplicity in this context, we fallback to DEFAULT_ACCOUNTS if 'accounts' doesn't exist but 'categories' does
          parsed.accounts = DEFAULT_ACCOUNTS;
          delete parsed.categories;
      } else {
          parsed.accounts = DEFAULT_ACCOUNTS;
      }

      if (!parsed.businessProfile) {
        parsed.businessProfile = {
            name: 'My Business',
            email: '',
            phone: '',
            address: '',
            footerNote: 'Thank you for your business.'
        };
      }
      return parsed;
    } catch (e) {
      console.error("Failed to parse storage", e);
    }
  }
  
  // Return seed data if new
  return {
    transactions: SEED_TRANSACTIONS,
    accounts: DEFAULT_ACCOUNTS,
    receivables: SEED_RECEIVABLES,
    templates: SEED_TEMPLATES,
    recurring: SEED_RECURRING,
    parties: SEED_PARTIES,
    assets: SEED_ASSETS,
    businessProfile: {
        name: 'My Business',
        email: 'contact@mybusiness.com',
        phone: '+974 1234 5678',
        address: 'Doha, Qatar',
        footerNote: 'Thank you for your business.'
    }
  };
};

export const storageService = {
  load: (): AppState => {
    return getInitialState();
  },

  save: (state: AppState) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  },

  clear: () => {
    // Only clear data and auth lock, preserve the Supabase Config (CONFIG_KEY)
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(AUTH_KEY);
  },

  setPassword: (password: string) => {
    localStorage.setItem(AUTH_KEY, password);
  },

  verifyPassword: (password: string): boolean => {
    return localStorage.getItem(AUTH_KEY) === password;
  },

  hasPassword: (): boolean => {
    return !!localStorage.getItem(AUTH_KEY);
  },

  // --- CONFIG PERSISTENCE ---
  saveSyncConfig: (config: SyncConfig) => {
    try {
        localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
    } catch (e) {
        console.error("Failed to save sync config", e);
    }
  },

  loadSyncConfig: (): SyncConfig | null => {
    const stored = localStorage.getItem(CONFIG_KEY);
    if (!stored) return null;
    try {
        return JSON.parse(stored);
    } catch (e) {
        console.error("Failed to parse sync config", e);
        return null;
    }
  }
};