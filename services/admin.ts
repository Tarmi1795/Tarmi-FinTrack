
import { supabase } from './supabase';

// Admin + access foundations. The admin role lives on fintrack_profiles.role
// ('user' | 'admin'). AI usage is logged server-side; limits are advisory
// (client-enforced) by design.

export interface AdminUserProfile {
  id: string;
  email: string;
  name: string;
  role: 'user' | 'admin';
  base_currency?: string;
}

export interface AdminUserStats {
  userId: string;
  transactions: number;
  invoices: number;
  aiCallsToday: number;
  aiCallsTotal: number;
  lastActive: string | null; // ISO
}

export interface UserSettingsRow {
  user_id: string;
  disabled_modules: string[];
  ai_daily_limit: number;
  updated_at?: string;
}

export const MODULE_KEYS = [
  { key: '/budget', label: 'Budget' },
  { key: '/apar', label: 'AP / AR' },
  { key: '/invoices', label: 'Invoices' },
  { key: '/assets', label: 'Assets' },
  { key: '/journal', label: 'Journal' },
  { key: '/reports', label: 'Reports' },
  { key: '/money-counter', label: 'Money Counter' },
  { key: '/trading', label: 'Trading' },
  { key: '/inventory', label: 'Inventory' },
  { key: '/goals', label: 'Goals' },
] as const;

const isAdminProfileError = (e: any) => String(e?.message || e).includes('permission') || String(e?.code) === '42501';

export const adminService = {
  /** Role of the currently signed-in user (null when unknown) */
  async getMyRole(): Promise<'user' | 'admin' | null> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;
    const { data, error } = await supabase
      .from('fintrack_profiles')
      .select('role')
      .eq('id', user.id)
      .maybeSingle();
    if (error) {
      if (isAdminProfileError(error)) return null;
      throw error;
    }
    return (data?.role as 'user' | 'admin') || 'user';
  },

  /** All user profiles (admin only — RLS enforces) */
  async listUsers(): Promise<AdminUserProfile[]> {
    const { data, error } = await supabase
      .from('fintrack_profiles')
      .select('id, email, name, role, base_currency')
      .order('email');
    if (error) throw error;
    return (data || []) as AdminUserProfile[];
  },

  async countRows(table: string, userId: string, since?: string): Promise<number> {
    let q = supabase.from(table).select('*', { count: 'exact', head: true }).eq('user_id', userId);
    if (since) q = q.gte('created_at', since);
    const { count, error } = await q;
    if (error) return 0; // a denied table shouldn't break the dashboard
    return count || 0;
  },

  async getUserStats(userId: string, aiTotal: number, aiToday: number): Promise<AdminUserStats> {
    const [transactions, invoices, txMeta] = await Promise.all([
      this.countRows('fintrack_transactions', userId),
      this.countRows('invoices', userId),
      supabase.from('fintrack_transactions').select('updated_at').eq('user_id', userId).order('updated_at', { ascending: false }).limit(1).maybeSingle(),
    ]);
    return {
      userId,
      transactions,
      invoices,
      aiCallsTotal: aiTotal,
      aiCallsToday: aiToday,
      lastActive: txMeta.data?.updated_at || null,
    };
  },

  /** AI usage counters for a user */
  async getAiUsage(userId: string): Promise<{ total: number; today: number }> {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const { count: total } = await supabase
      .from('ai_usage_log').select('*', { count: 'exact', head: true }).eq('user_id', userId);
    const { count: today } = await supabase
      .from('ai_usage_log').select('*', { count: 'exact', head: true }).eq('user_id', userId).gte('created_at', startOfDay.toISOString());
    return { total: total || 0, today: today || 0 };
  },

  async getUserSettings(userId: string): Promise<UserSettingsRow | null> {
    const { data, error } = await supabase
      .from('user_settings')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();
    if (error) throw error;
    return (data as UserSettingsRow) || null;
  },

  async upsertUserSettings(userId: string, patch: Partial<Pick<UserSettingsRow, 'disabled_modules' | 'ai_daily_limit'>>): Promise<void> {
    const { error } = await supabase
      .from('user_settings')
      .upsert({ user_id: userId, ...patch, updated_at: new Date().toISOString() }, { onConflict: 'user_id' });
    if (error) throw error;
  },

  /** Fire-and-forget AI usage logging (called from services/ai.ts) */
  async logAiUsage(feature: 'chat' | 'vision', model: string, ok: boolean): Promise<void> {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      await supabase.from('ai_usage_log').insert({ user_id: user.id, feature, model, ok });
    } catch (e) {
      console.warn('AI usage log failed (non-fatal):', e);
    }
  },

  /** Advisory daily-limit check for the current user (client-enforced) */
  async checkAiLimit(): Promise<{ allowed: boolean; used: number; limit: number }> {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return { allowed: true, used: 0, limit: Infinity as any };
      const settings = await this.getUserSettings(user.id);
      const limit = settings?.ai_daily_limit ?? 50;
      const { today } = await this.getAiUsage(user.id);
      return { allowed: today < limit, used: today, limit };
    } catch {
      return { allowed: true, used: 0, limit: Infinity as any };
    }
  },
};
