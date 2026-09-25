import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Navigate } from 'react-router-dom';
import { adminService, MODULE_KEYS } from '../services/admin';
import type { AdminUserProfile, AdminUserStats, UserSettingsRow } from '../services/admin';
import { useAccess } from '../context/AccessContext';
import { Modal } from '../components/ui/Modal';
import { SkeletonCard } from '../components/ui/Skeleton';
import { format, parseISO, isAfter, subDays } from 'date-fns';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Shield, ShieldAlert, RefreshCw, AlertTriangle, X, Users, UserCheck, Zap, Database,
  Lock, ArrowLeft, Save, Settings2, Info
} from 'lucide-react';

// Modules that can never be disabled (not part of MODULE_KEYS — core navigation)
const FIXED_MODULES = [
  { key: '/', label: 'Dashboard' },
  { key: '/settings', label: 'Settings' },
];

// Quick-apply module restriction presets
const TIER_PRESETS: { label: string; disabled: string[] }[] = [
  { label: 'Free tier', disabled: ['/trading', '/inventory', '/invoices', '/goals'] },
  { label: 'Pro tier', disabled: [] },
  { label: 'Business tier', disabled: [] },
];

const LIMIT_PRESETS = [10, 25, 50, 100];
const UNLIMITED = 999999;

interface AdminRow {
  user: AdminUserProfile;
  stats: AdminUserStats;
  settings: UserSettingsRow | null;
}

const labelCls = 'block text-[10px] font-bold uppercase tracking-widest text-gray-500';
const inputCls = 'w-full bg-gray-900/70 border border-gray-700 rounded-lg px-3 py-2.5 text-white focus:border-gold-500 focus:ring-1 focus:ring-gold-500/30 outline-none transition-colors font-mono';

const chipCls = (active: boolean) =>
  `px-2.5 py-1 rounded-lg text-[11px] font-bold border transition-colors active:scale-95 ${
    active ? 'border-gold-500/50 bg-gold-500/10 text-gold-400' : 'border-gray-800 text-gray-400 hover:text-white hover:bg-gray-800'
  }`;

const fmtLastActive = (iso: string | null) => {
  if (!iso) return '—';
  try { return format(parseISO(iso), 'dd MMM HH:mm'); } catch { return '—'; }
};

const CenterSpinner: React.FC = () => (
  <div className="min-h-[60vh] flex items-center justify-center">
    <div className="w-10 h-10 rounded-full border-2 border-gray-700 border-t-gold-500 animate-spin" aria-label="Loading" />
  </div>
);

// Non-admins are silently redirected — the admin area stays invisible to them
const ForbiddenCard: React.FC = () => <Navigate to="/" replace />;

const RoleChip: React.FC<{ role: 'user' | 'admin' }> = ({ role }) => (
  role === 'admin' ? (
    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-gold-500/15 text-gold-400 border border-gold-500/30">admin</span>
  ) : (
    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-gray-800 text-gray-400 border border-gray-700">user</span>
  )
);

export const Admin: React.FC = () => {
  const { role, loading: accessLoading } = useAccess();

  const [rows, setRows] = useState<AdminRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  // Manage drawer draft state
  const [manageUser, setManageUser] = useState<AdminUserProfile | null>(null);
  const [draftDisabled, setDraftDisabled] = useState<string[]>([]);
  const [draftLimit, setDraftLimit] = useState<string>('50');
  const [isSaving, setIsSaving] = useState(false);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  };

  const load = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);
    try {
      const users = await adminService.listUsers();
      const loaded: AdminRow[] = await Promise.all(users.map(async (u) => {
        const [usage, settings] = await Promise.all([
          adminService.getAiUsage(u.id),
          // A missing user_settings row/table should not kill the whole dashboard
          adminService.getUserSettings(u.id).catch(() => null),
        ]);
        const stats = await adminService.getUserStats(u.id, usage.total, usage.today);
        return { user: u, stats, settings };
      }));
      setRows(loaded);
    } catch (e: any) {
      setLoadError(e?.message || 'Failed to load admin data.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Only hit the admin endpoints once the access layer confirms an admin
  useEffect(() => {
    if (role === 'admin') load();
  }, [role, load]);

  // --- Dashboard summary ---
  const summary = useMemo(() => {
    const cutoff = subDays(new Date(), 7);
    return {
      totalUsers: rows.length,
      activeThisWeek: rows.filter((r) => r.stats.lastActive && isAfter(parseISO(r.stats.lastActive), cutoff)).length,
      aiToday: rows.reduce((s, r) => s + r.stats.aiCallsToday, 0),
      aiTotal: rows.reduce((s, r) => s + r.stats.aiCallsTotal, 0),
    };
  }, [rows]);

  // --- Manage drawer ---
  const openManage = (row: AdminRow) => {
    setManageUser(row.user);
    setDraftDisabled([...(row.settings?.disabled_modules || [])]);
    setDraftLimit(String(row.settings?.ai_daily_limit ?? 50));
  };

  const toggleModule = (key: string) =>
    setDraftDisabled((d) => (d.includes(key) ? d.filter((k) => k !== key) : [...d, key]));

  const saveSettings = async () => {
    if (!manageUser) return;
    setIsSaving(true);
    try {
      const parsed = parseInt(draftLimit, 10);
      await adminService.upsertUserSettings(manageUser.id, {
        disabled_modules: draftDisabled,
        ai_daily_limit: Number.isFinite(parsed) && parsed >= 0 ? parsed : 50,
      });
      // Refresh just this row's settings from the server
      const settings = await adminService.getUserSettings(manageUser.id).catch(() => null);
      setRows((rs) => rs.map((r) => (r.user.id === manageUser.id ? { ...r, settings } : r)));
      showToast('Settings saved');
      setManageUser(null);
    } catch (e: any) {
      setLoadError(e?.message || 'Failed to save settings.');
    } finally {
      setIsSaving(false);
    }
  };

  // --- Guard (belt — RequireAdmin is the suspenders) ---
  if (accessLoading) return <CenterSpinner />;
  if (role !== 'admin') return <ForbiddenCard />;

  return (
    <div className="space-y-4 md:space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl md:text-3xl font-bold flex items-center gap-2.5">
            <Shield className="text-gold-500" size={24} />
            <span className="text-gold-gradient">Admin Panel</span>
          </h1>
          <p className="text-gray-500 text-sm mt-1">Users, usage and module restrictions</p>
        </div>
        <div className="flex gap-2">
          <button onClick={load} className="p-2.5 bg-gray-900 hover:bg-gray-800 border border-gray-800 rounded-xl text-gray-400 hover:text-white transition-colors active:scale-95" title="Refresh">
            <RefreshCw size={18} className={isLoading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* Error banner */}
      <AnimatePresence>
        {loadError && (
          <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            className="glass-card border-red-500/30 p-4 flex items-start gap-3">
            <AlertTriangle className="text-red-400 shrink-0 mt-0.5" size={20} />
            <div className="text-sm flex-1">
              <p className="font-bold text-red-300">{loadError}</p>
            </div>
            <button onClick={() => setLoadError(null)} className="text-gray-500 hover:text-white"><X size={16} /></button>
          </motion.div>
        )}
      </AnimatePresence>

      {isLoading ? (
        <div className="space-y-4">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
            <SkeletonCard /><SkeletonCard /><SkeletonCard /><SkeletonCard />
          </div>
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </div>
      ) : (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
            <div className="glass-card p-3.5">
              <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-gray-500"><Users size={12} /> Total Users</div>
              <p className="font-mono text-base md:text-xl font-bold text-white mt-2 truncate">{summary.totalUsers.toLocaleString()}</p>
              <p className="text-[10px] text-gray-600 mt-0.5">registered profiles</p>
            </div>
            <div className="glass-card p-3.5">
              <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-gray-500"><UserCheck size={12} /> Active This Week</div>
              <p className="font-mono text-base md:text-xl font-bold text-white mt-2 truncate">{summary.activeThisWeek.toLocaleString()}</p>
              <p className="text-[10px] text-gray-600 mt-0.5">last activity within 7 days</p>
            </div>
            <div className="glass-card p-3.5">
              <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-gray-500"><Zap size={12} /> AI Calls Today</div>
              <p className="font-mono text-base md:text-xl font-bold text-gold-400 mt-2 truncate">{summary.aiToday.toLocaleString()}</p>
              <p className="text-[10px] text-gray-600 mt-0.5">all users • since midnight</p>
            </div>
            <div className="glass-card p-3.5">
              <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-gray-500"><Database size={12} /> AI Calls Total</div>
              <p className="font-mono text-base md:text-xl font-bold text-white mt-2 truncate">{summary.aiTotal.toLocaleString()}</p>
              <p className="text-[10px] text-gray-600 mt-0.5">logged server-side</p>
            </div>
          </div>

          {/* Users table (desktop) */}
          <div className="hidden md:block glass-card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[10px] uppercase tracking-widest text-gray-500 border-b border-gray-800/70">
                    <th className="px-5 py-3 font-bold">User</th>
                    <th className="px-4 py-3 font-bold">Role</th>
                    <th className="px-4 py-3 font-bold text-right">Txns</th>
                    <th className="px-4 py-3 font-bold text-right">Invoices</th>
                    <th className="px-4 py-3 font-bold text-right">AI Today / Total</th>
                    <th className="px-4 py-3 font-bold text-right">Last Active</th>
                    <th className="px-4 py-3 font-bold text-right">Modules Off</th>
                    <th className="px-5 py-3 font-bold text-right"><span className="sr-only">Actions</span></th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.user.id} className="border-b border-gray-800/40 hover:bg-gray-800/30 transition-colors">
                      <td className="px-5 py-3.5">
                        <p className="font-bold text-white">{r.user.name || '—'}</p>
                        <p className="text-xs text-gray-500">{r.user.email}</p>
                      </td>
                      <td className="px-4 py-3.5"><RoleChip role={r.user.role} /></td>
                      <td className="px-4 py-3.5 text-right font-mono text-xs text-gray-400">{r.stats.transactions}</td>
                      <td className="px-4 py-3.5 text-right font-mono text-xs text-gray-400">{r.stats.invoices}</td>
                      <td className="px-4 py-3.5 text-right font-mono text-xs">
                        <span className="text-gold-400 font-bold">{r.stats.aiCallsToday}</span>
                        <span className="text-gray-600"> / </span>
                        <span className="text-gray-400">{r.stats.aiCallsTotal}</span>
                      </td>
                      <td className="px-4 py-3.5 text-right font-mono text-xs text-gray-400">{fmtLastActive(r.stats.lastActive)}</td>
                      <td className="px-4 py-3.5 text-right font-mono text-xs text-gray-400">{r.settings ? r.settings.disabled_modules.length : '—'}</td>
                      <td className="px-5 py-3.5 text-right">
                        <button
                          onClick={() => openManage(r)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold border border-gold-500/40 text-gold-400 hover:bg-gold-500/10 transition-colors active:scale-95"
                        >
                          <Settings2 size={13} /> Manage
                        </button>
                      </td>
                    </tr>
                  ))}
                  {rows.length === 0 && (
                    <tr>
                      <td colSpan={8} className="px-5 py-8 text-center text-sm text-gray-500">No users found.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* User cards (mobile) */}
          <div className="md:hidden space-y-3">
            {rows.map((r) => (
              <div key={r.user.id} className="glass-card p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-bold text-white text-sm truncate">{r.user.name || r.user.email}</p>
                    <p className="text-[11px] text-gray-500 truncate">{r.user.email}</p>
                  </div>
                  <RoleChip role={r.user.role} />
                </div>
                <div className="grid grid-cols-2 gap-2 mt-3">
                  <div className="bg-gray-900/60 rounded-lg p-2.5">
                    <p className="text-[9px] uppercase tracking-widest text-gray-500 font-bold">AI Today / Total</p>
                    <p className="font-mono text-sm font-bold text-gold-400 mt-0.5">{r.stats.aiCallsToday} / {r.stats.aiCallsTotal}</p>
                  </div>
                  <div className="bg-gray-900/60 rounded-lg p-2.5">
                    <p className="text-[9px] uppercase tracking-widest text-gray-500 font-bold">Last Active</p>
                    <p className="font-mono text-[11px] text-gray-400 mt-1">{fmtLastActive(r.stats.lastActive)}</p>
                  </div>
                  <div className="bg-gray-900/60 rounded-lg p-2.5">
                    <p className="text-[9px] uppercase tracking-widest text-gray-500 font-bold">Txns / Invoices</p>
                    <p className="font-mono text-sm font-bold text-white mt-0.5">{r.stats.transactions} / {r.stats.invoices}</p>
                  </div>
                  <div className="bg-gray-900/60 rounded-lg p-2.5">
                    <p className="text-[9px] uppercase tracking-widest text-gray-500 font-bold">Modules Off</p>
                    <p className="font-mono text-sm font-bold text-white mt-0.5">{r.settings ? r.settings.disabled_modules.length : '—'}</p>
                  </div>
                </div>
                <button
                  onClick={() => openManage(r)}
                  className="mt-3 w-full flex items-center justify-center gap-1.5 px-3 py-2 min-h-[36px] rounded-lg text-[11px] font-bold border border-gold-500/40 text-gold-400 hover:bg-gold-500/10 transition-colors active:scale-95"
                >
                  <Settings2 size={13} /> Manage
                </button>
              </div>
            ))}
            {rows.length === 0 && (
              <div className="glass-card p-8 text-center text-sm text-gray-500">No users found.</div>
            )}
          </div>
        </>
      )}

      {/* Manage drawer */}
      <Modal
        isOpen={!!manageUser}
        onClose={() => setManageUser(null)}
        title={manageUser ? `Manage — ${manageUser.email}` : 'Manage'}
      >
        {manageUser && (
          <div className="space-y-5">
            {/* Role (read-only) */}
            <section>
              <p className={labelCls}>Role</p>
              <div className="flex items-center gap-2 mt-1.5">
                <RoleChip role={manageUser.role} />
                <span className="text-xs text-gray-500">
                  {manageUser.role === 'admin' ? 'Full access to all data and this panel' : 'Standard access'}
                </span>
              </div>
              <p className="text-[11px] text-gray-600 mt-2 flex items-start gap-1.5">
                <Info size={12} className="shrink-0 mt-0.5 text-gray-500" />
                <span>Promotion is done in Supabase (<span className="font-mono">fintrack_profiles.role</span>)</span>
              </p>
            </section>

            {/* Tier presets */}
            <section>
              <p className={labelCls}>Tier presets</p>
              <div className="flex gap-1.5 mt-1.5 flex-wrap">
                {TIER_PRESETS.map((t) => (
                  <button key={t.label} onClick={() => setDraftDisabled([...t.disabled])} className={chipCls(false)}>
                    {t.label}
                  </button>
                ))}
              </div>
              <p className="text-[11px] text-gray-600 mt-1.5">
                Quick-apply module restrictions: Free locks Trading, Inventory, Invoices and Goals; Pro and Business unlock everything.
              </p>
            </section>

            {/* Modules */}
            <section>
              <p className={labelCls}>Modules</p>
              <div className="mt-1.5 space-y-1.5">
                {MODULE_KEYS.map((m) => {
                  const enabled = !draftDisabled.includes(m.key);
                  return (
                    <div key={m.key} className="flex items-center justify-between gap-3 bg-gray-900/60 rounded-lg px-3 py-2.5">
                      <div className="min-w-0">
                        <p className={`text-sm font-bold ${enabled ? 'text-gray-100' : 'text-gray-500'}`}>{m.label}</p>
                        <p className="text-[10px] text-gray-600 font-mono">{m.key}</p>
                      </div>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={enabled}
                        aria-label={`${m.label} ${enabled ? 'enabled' : 'disabled'}`}
                        onClick={() => toggleModule(m.key)}
                        className={`relative w-11 h-6 rounded-full transition-colors shrink-0 ${enabled ? 'bg-gold-500' : 'bg-gray-700'}`}
                      >
                        <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${enabled ? 'translate-x-5' : 'translate-x-0'}`} />
                      </button>
                    </div>
                  );
                })}
                {FIXED_MODULES.map((m) => (
                  <div key={m.key} className="flex items-center justify-between gap-3 bg-gray-900/60 rounded-lg px-3 py-2.5 opacity-75">
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-gray-100">{m.label}</p>
                      <p className="text-[10px] text-gray-600 font-mono">{m.key}</p>
                    </div>
                    <span className="flex items-center gap-1 text-[10px] font-bold text-gray-500 shrink-0">
                      <Lock size={12} /> Always on
                    </span>
                  </div>
                ))}
              </div>
            </section>

            {/* AI daily limit */}
            <section>
              <p className={labelCls}>AI daily limit</p>
              <input
                type="number"
                min={0}
                inputMode="numeric"
                value={draftLimit}
                onChange={(e) => setDraftLimit(e.target.value)}
                className={`${inputCls} mt-1.5`}
                aria-label="AI daily limit"
              />
              <div className="flex gap-1.5 mt-2 flex-wrap">
                {LIMIT_PRESETS.map((n) => (
                  <button key={n} onClick={() => setDraftLimit(String(n))} className={chipCls(draftLimit === String(n))}>{n}</button>
                ))}
                <button onClick={() => setDraftLimit(String(UNLIMITED))} className={chipCls(draftLimit === String(UNLIMITED))}>Unlimited</button>
              </div>
              <p className="text-[11px] text-gray-600 mt-2">Advisory — enforced in the app, usage is logged server-side.</p>
            </section>

            {/* Save */}
            <button
              onClick={saveSettings}
              disabled={isSaving}
              className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-gold-500 to-amber-400 text-black font-bold px-4 py-3 rounded-xl hover:shadow-lg hover:shadow-gold-500/20 transition-all active:scale-95 text-sm disabled:opacity-50"
            >
              <Save size={16} /> {isSaving ? 'Saving…' : 'Save Settings'}
            </button>
          </div>
        )}
      </Modal>

      {/* Toast */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 20 }}
            className="fixed bottom-[calc(5.75rem+env(safe-area-inset-bottom))] md:bottom-8 left-1/2 -translate-x-1/2 z-50 bg-gray-900 border border-gold-500/40 text-gold-300 text-sm font-bold px-5 py-3 rounded-xl shadow-2xl shadow-black/50"
          >
            {toast}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
