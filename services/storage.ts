import { AppState, Account, Receivable, Transaction, SyncConfig, Party } from '../types';
import { DEFAULT_ACCOUNTS, SEED_RECEIVABLES, SEED_TRANSACTIONS, SEED_TEMPLATES, SEED_RECURRING, SEED_PARTIES, SEED_ASSETS } from '../constants';

// Data is scoped PER USER: fintrack_pro_data_v4_<uid>. The legacy shared key is
// migrated into the signing-in user's scoped key once, then removed — two
// accounts on the same device must never see each other's books.
const LEGACY_KEY = 'fintrack_pro_data_v4';
const keyFor = (uid: string | null) => (uid ? `fintrack_pro_data_v4_${uid}` : LEGACY_KEY);
const AUTH_KEY = 'fintrack_lock_code';
const CONFIG_KEY = 'fintrack_sync_config';

// Set on sign-in by FinanceContext; drives which key load/save/clear touch.
let activeUserId: string | null = null;

const migrateLegacyForUser = (uid: string) => {
  const userKey = keyFor(uid);
  const legacy = localStorage.getItem(LEGACY_KEY);
  if (legacy && !localStorage.getItem(userKey)) {
    // First sign-in on this device for this account: adopt the pre-existing
    // local data (it may be this same person's books from before scoping).
    localStorage.setItem(userKey, legacy);
  }
  localStorage.removeItem(LEGACY_KEY);
};

const readState = (): AppState | null => {
  const stored = localStorage.getItem(keyFor(activeUserId));
  if (!stored) return null;
  try {
    const parsed = JSON.parse(stored);
    // Migration/Safety check for new fields
    if (!parsed.templates) parsed.templates = [];
    if (!parsed.recurring) parsed.recurring = [];
    if (!parsed.parties) {
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
    return null;
  }
};

const seedState = (): AppState => ({
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
});

export const storageService = {
  /** Bind load/save/clear to a specific account (call on SIGNED_IN / SIGNED_OUT). */
  setActiveUser: (uid: string | null) => {
    if (uid) migrateLegacyForUser(uid);
    activeUserId = uid;
  },

  /** Returns the active user's local state, or fresh seeds when none exists. */
  load: (): AppState => {
    return readState() || seedState();
  },

  /** Returns the active user's local state only (null = no stored data). */
  loadStored: (): AppState | null => {
    return readState();
  },

  save: (state: AppState) => {
    localStorage.setItem(keyFor(activeUserId), JSON.stringify(state));
  },

  clear: () => {
    // Clear the active user's data and the device lock; keep Supabase config.
    localStorage.removeItem(keyFor(activeUserId));
    localStorage.removeItem(LEGACY_KEY);
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
        console.error("Failed to save sync config", e);
        return null;
    }
  }
};
