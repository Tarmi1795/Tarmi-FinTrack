
import { supabase } from './supabase';
import { TradingAccount, TradingCashflow, TradingSnapshot, TradingFxRate, TradingSettings, CurrencyCode } from '../types';

// Sensible seed rates vs QAR (1 unit of currency = N QAR). User-editable in the UI.
const DEFAULT_FX_RATES: Partial<Record<CurrencyCode, number>> = {
  QAR: 1,
  USD: 3.64,
  EUR: 3.96,
  PHP: 0.058,
  SAR: 0.97,
  AED: 0.99,
  GBP: 4.69,
  JPY: 0.024,
  INR: 0.041,
};

export const tradingService = {
  isMissingTableError(error: { code?: string; message?: string } | null): boolean {
    if (!error) return false;
    return error.code === '42P01' || (error.message?.includes('does not exist') ?? false);
  },

  // --- Trading accounts ---
  async getAccounts(userId: string): Promise<TradingAccount[]> {
    const { data, error } = await supabase
      .from('trading_accounts')
      .select('*')
      .eq('user_id', userId)
      .order('sort_order', { ascending: true });
    if (error) throw error;
    return data ?? [];
  },

  async createAccount(userId: string, account: Omit<TradingAccount, 'id' | 'user_id'>): Promise<TradingAccount> {
    const { data, error } = await supabase
      .from('trading_accounts')
      .insert({ ...account, user_id: userId })
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async updateAccount(userId: string, id: string, patch: Partial<TradingAccount>): Promise<void> {
    const { error } = await supabase
      .from('trading_accounts')
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('user_id', userId);
    if (error) throw error;
  },

  async deleteAccount(userId: string, id: string): Promise<void> {
    const { error } = await supabase
      .from('trading_accounts')
      .delete()
      .eq('id', id)
      .eq('user_id', userId);
    if (error) throw error;
  },

  // --- Cash flows (deposits / withdrawals) ---
  async getCashflows(userId: string): Promise<TradingCashflow[]> {
    const { data, error } = await supabase
      .from('trading_cashflows')
      .select('*')
      .eq('user_id', userId)
      .order('flow_date', { ascending: false });
    if (error) throw error;
    return data ?? [];
  },

  async createCashflow(userId: string, flow: Omit<TradingCashflow, 'id' | 'user_id'>): Promise<TradingCashflow> {
    const { data, error } = await supabase
      .from('trading_cashflows')
      .insert({ ...flow, user_id: userId })
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async attachGlTransaction(userId: string, cashflowId: string, glTransactionId: string): Promise<void> {
    const { error } = await supabase
      .from('trading_cashflows')
      .update({ gl_transaction_id: glTransactionId })
      .eq('id', cashflowId)
      .eq('user_id', userId);
    if (error) throw error;
  },

  async deleteCashflow(userId: string, id: string): Promise<void> {
    const { error } = await supabase
      .from('trading_cashflows')
      .delete()
      .eq('id', id)
      .eq('user_id', userId);
    if (error) throw error;
  },

  // --- Balance snapshots (one per account per day, upsert) ---
  async getSnapshots(userId: string): Promise<TradingSnapshot[]> {
    const { data, error } = await supabase
      .from('trading_snapshots')
      .select('*')
      .eq('user_id', userId)
      .order('snap_date', { ascending: true });
    if (error) throw error;
    return data ?? [];
  },

  async upsertSnapshot(userId: string, snapshot: Omit<TradingSnapshot, 'id' | 'user_id' | 'created_at'>): Promise<void> {
    const { error } = await supabase
      .from('trading_snapshots')
      .upsert(
        { ...snapshot, user_id: userId },
        { onConflict: 'account_id,snap_date' }
      );
    if (error) throw error;
  },

  async deleteSnapshot(userId: string, id: string): Promise<void> {
    const { error } = await supabase
      .from('trading_snapshots')
      .delete()
      .eq('id', id)
      .eq('user_id', userId);
    if (error) throw error;
  },

  // --- FX rates ---
  async getFxRates(userId: string, baseCurrency: string): Promise<TradingFxRate[]> {
    const { data, error } = await supabase
      .from('trading_fx_rates')
      .select('*')
      .eq('user_id', userId);
    if (error) throw error;

    if (data && data.length === 0) {
      // Seed defaults on first use (always keep the base currency itself at 1)
      const seeds = Object.entries({ ...DEFAULT_FX_RATES, [baseCurrency]: 1 }).map(([currency, rate_to_base]) => ({
        user_id: userId,
        currency,
        rate_to_base,
      }));
      const { data: seeded, error: seedError } = await supabase
        .from('trading_fx_rates')
        .upsert(seeds, { onConflict: 'user_id,currency' })
        .select();
      if (seedError) throw seedError;
      return seeded ?? [];
    }
    return data ?? [];
  },

  async upsertFxRates(userId: string, rates: { currency: string; rate_to_base: number }[]): Promise<void> {
    if (rates.length === 0) return;
    const { error } = await supabase
      .from('trading_fx_rates')
      .upsert(
        rates.map((r) => ({ ...r, user_id: userId, updated_at: new Date().toISOString() })),
        { onConflict: 'user_id,currency' }
      );
    if (error) throw error;
  },

  // --- Module settings (Chart-of-Accounts link) ---
  async getSettings(userId: string): Promise<TradingSettings | null> {
    const { data, error } = await supabase
      .from('trading_settings')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();
    if (error) throw error;
    return data ?? null;
  },

  async saveSettings(userId: string, settings: Partial<TradingSettings>): Promise<void> {
    const { error } = await supabase
      .from('trading_settings')
      .upsert(
        { user_id: userId, ...settings, updated_at: new Date().toISOString() },
        { onConflict: 'user_id' }
      );
    if (error) throw error;
  },
};
