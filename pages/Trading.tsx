
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useFinance } from '../context/FinanceContext';
import { tradingService } from '../services/trading';
import { TradingAccount, TradingCashflow, TradingSnapshot, TradingFxRate, Account } from '../types';
import { CURRENCIES } from '../constants';
import { Modal } from '../components/ui/Modal';
import { SearchableSelect } from '../components/ui/SearchableSelect';
import { calculateDirectBalance } from '../utils/accountHierarchy';
import { evaluateMathExpression } from '../utils/mathUtils';
import { format, parseISO } from 'date-fns';
import { motion, AnimatePresence } from 'framer-motion';
import {
  CandlestickChart, Plus, RefreshCw, Trash2, Pencil, History, Link2, Unlink,
  ArrowDownToLine, ArrowUpFromLine, AlertTriangle, Wallet, Landmark, Scale, X, Check, TrendingUp, TrendingDown
} from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';

const todayStr = () => format(new Date(), 'yyyy-MM-dd');
const fmt = (n: number) => n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtPct = (n: number) => `${n >= 0 ? '' : '-'}${Math.abs(n).toFixed(2)}%`;
const genId = () => (crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substr(2, 12));

interface AccountRow {
  account: TradingAccount;
  capital: number;
  balance: number | null;
  pnl: number | null;
  roi: number | null;
  capitalBase: number;
  balanceBase: number | null;
  pnlBase: number | null;
  lastSnapshotDate: string | null;
}

export const Trading: React.FC = () => {
  const { user, state, dispatch } = useFinance();
  const baseCurrency = state.businessProfile.baseCurrency || 'QAR';

  const [accounts, setAccounts] = useState<TradingAccount[]>([]);
  const [cashflows, setCashflows] = useState<TradingCashflow[]>([]);
  const [snapshots, setSnapshots] = useState<TradingSnapshot[]>([]);
  const [fxRates, setFxRates] = useState<TradingFxRate[]>([]);
  const [linkedGlAccountId, setLinkedGlAccountId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [needsMigration, setNeedsMigration] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // Modal state
  const [showAccountForm, setShowAccountForm] = useState(false);
  const [editAccount, setEditAccount] = useState<TradingAccount | null>(null);
  const [showBalanceForm, setShowBalanceForm] = useState(false);
  const [showCashflowForm, setShowCashflowForm] = useState(false);
  const [cashflowMode, setCashflowMode] = useState<'deposit' | 'withdrawal'>('deposit');
  const [cashflowAccount, setCashflowAccount] = useState<TradingAccount | null>(null);
  const [balanceAccount, setBalanceAccount] = useState<TradingAccount | null>(null);
  const [historyAccount, setHistoryAccount] = useState<TradingAccount | null>(null);
  const [showLinkCard, setShowLinkCard] = useState(false);
  const [linkSelection, setLinkSelection] = useState('');

  // Form fields
  const [fName, setFName] = useState('');
  const [fBroker, setFBroker] = useState('');
  const [fCurrency, setFCurrency] = useState('USD');
  const [fNotes, setFNotes] = useState('');
  const [fBalance, setFBalance] = useState('');
  const [fBalanceDate, setFBalanceDate] = useState(todayStr());
  const [fAmount, setFAmount] = useState('');
  const [fDate, setFDate] = useState(todayStr());
  const [fNote, setFNote] = useState('');
  const [fxDraft, setFxDraft] = useState<Record<string, string>>({});

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  };

  const handleError = (e: any, fallback: string) => {
    if (tradingService.isMissingTableError(e)) {
      setNeedsMigration(true); // Show the "run the migration" banner instead of a raw error
    } else {
      setLoadError(e?.message || fallback);
    }
  };

  const loadAll = useCallback(async () => {
    if (!user) return;
    setIsLoading(true);
    setNeedsMigration(false);
    setLoadError(null);
    try {
      const [accs, flows, snaps, rates, settings] = await Promise.all([
        tradingService.getAccounts(user.id),
        tradingService.getCashflows(user.id),
        tradingService.getSnapshots(user.id),
        tradingService.getFxRates(user.id, baseCurrency),
        tradingService.getSettings(user.id),
      ]);
      setAccounts(accs);
      setCashflows(flows);
      setSnapshots(snaps);
      setFxRates(rates);
      setLinkedGlAccountId(settings?.linked_gl_account_id ?? null);
      const draft: Record<string, string> = {};
      rates.forEach((r) => { draft[r.currency] = String(r.rate_to_base); });
      setFxDraft(draft);
    } catch (e: any) {
      if (tradingService.isMissingTableError(e)) {
        setNeedsMigration(true);
      } else {
        setLoadError(e?.message || 'Failed to load trading data.');
      }
    } finally {
      setIsLoading(false);
    }
  }, [user, baseCurrency]);

  useEffect(() => { loadAll(); }, [loadAll]);

  // --- Derived data ---
  const rateMap = useMemo(() => {
    const m: Record<string, number> = { [baseCurrency]: 1 };
    fxRates.forEach((r) => { m[r.currency] = r.rate_to_base; });
    return m;
  }, [fxRates, baseCurrency]);

  const rateFor = useCallback((currency: string): number => {
    if (currency === baseCurrency) return 1;
    return rateMap[currency] ?? 1; // Missing rate falls back to 1; flagged in the FX card
  }, [rateMap, baseCurrency]);

  const missingRates = useMemo(() => {
    const used = new Set(accounts.map((a) => a.currency).filter((c) => c !== baseCurrency));
    return Array.from(used).filter((c) => !rateMap[c]);
  }, [accounts, rateMap, baseCurrency]);

  const rows: AccountRow[] = useMemo(() => {
    return accounts.map((account) => {
      const flows = cashflows.filter((f) => f.account_id === account.id);
      const capital = flows.reduce((sum, f) => sum + (f.flow_type === 'deposit' ? f.amount : -f.amount), 0);
      const accSnaps = snapshots
        .filter((s) => s.account_id === account.id)
        .sort((a, b) => a.snap_date.localeCompare(b.snap_date));
      const latest = accSnaps.length ? accSnaps[accSnaps.length - 1] : null;
      const balance = latest ? latest.balance : null;
      const pnl = balance !== null ? balance - capital : null;
      const roi = pnl !== null && capital !== 0 ? (pnl / capital) * 100 : null;
      return {
        account, capital, balance, pnl, roi,
        capitalBase: capital * rateFor(account.currency),
        balanceBase: balance !== null ? balance * rateFor(account.currency) : null,
        pnlBase: pnl !== null ? pnl * rateFor(account.currency) : null,
        lastSnapshotDate: latest ? latest.snap_date : null,
      };
    });
  }, [accounts, cashflows, snapshots, rateFor]);

  const totals = useMemo(() => {
    const capitalBase = rows.reduce((s, r) => s + r.capitalBase, 0);
    const balanceBase = rows.reduce((s, r) => s + (r.balanceBase ?? r.capitalBase), 0);
    const pnlBase = balanceBase - capitalBase;
    const roi = capitalBase !== 0 ? (pnlBase / capitalBase) * 100 : 0;
    return { capitalBase, balanceBase, pnlBase, roi };
  }, [rows]);

  const linkedGlAccount: Account | undefined = useMemo(
    () => state.accounts.find((a) => a.id === linkedGlAccountId),
    [state.accounts, linkedGlAccountId]
  );

  // Net invested capital in base currency at current rates (stored fx_rate is informational only)
  const netInvestedBase = useMemo(() => (
    cashflows.reduce((sum, f) => {
      const acc = accounts.find((a) => a.id === f.account_id);
      const rate = acc ? rateFor(acc.currency) : 1;
      return sum + (f.flow_type === 'deposit' ? f.amount : -f.amount) * rate;
    }, 0)
  ), [cashflows, accounts, rateFor]);

  const glBalance = useMemo(
    () => (linkedGlAccountId ? calculateDirectBalance(linkedGlAccountId, state.transactions, 'debit') : 0),
    [linkedGlAccountId, state.transactions]
  );

  // --- Actions ---
  const handleSaveAccount = async () => {
    if (!user || !fName.trim()) return;
    setIsSaving(true);
    try {
      if (editAccount) {
        await tradingService.updateAccount(user.id, editAccount.id, {
          name: fName.trim(), broker: fBroker.trim() || undefined,
          currency: fCurrency, notes: fNotes.trim() || undefined,
        });
      } else {
        await tradingService.createAccount(user.id, {
          name: fName.trim(), broker: fBroker.trim() || undefined,
          currency: fCurrency, notes: fNotes.trim() || undefined,
          is_active: true, sort_order: accounts.length,
        });
      }
      setShowAccountForm(false);
      showToast(editAccount ? 'Account updated.' : 'Trading account added.');
      await loadAll();
    } catch (e: any) {
      handleError(e, 'Failed to save account.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteAccount = async (acc: TradingAccount) => {
    if (!user) return;
    if (!window.confirm(`Delete "${acc.name}"? Its deposits/withdrawals and snapshots will also be removed. (Nothing in the main ledger is affected.)`)) return;
    setIsSaving(true);
    try {
      await tradingService.deleteAccount(user.id, acc.id);
      showToast('Trading account deleted.');
      await loadAll();
    } catch (e: any) {
      handleError(e, 'Failed to delete account.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveBalance = async () => {
    if (!user || !balanceAccount) return;
    const evaluated = evaluateMathExpression(fBalance);
    const value = Number(evaluated);
    if (evaluated.trim() === '' || isNaN(value)) return;
    setIsSaving(true);
    try {
      await tradingService.upsertSnapshot(user.id, {
        account_id: balanceAccount.id, balance: value, snap_date: fBalanceDate,
        fx_rate: rateFor(balanceAccount.currency), note: fNote.trim() || undefined,
      });
      setShowBalanceForm(false);
      showToast('Balance updated.');
      await loadAll();
    } catch (e: any) {
      handleError(e, 'Failed to save balance.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveCashflow = async () => {
    if (!user || !cashflowAccount) return;
    const evaluated = evaluateMathExpression(fAmount);
    const value = Number(evaluated);
    if (evaluated.trim() === '' || isNaN(value) || value <= 0) return;
    const rate = rateFor(cashflowAccount.currency);
    setIsSaving(true);
    try {
      await tradingService.createCashflow(user.id, {
        account_id: cashflowAccount.id,
        flow_type: cashflowMode,
        amount: value,
        fx_rate: rate,
        flow_date: fDate,
        note: fNote.trim() || undefined,
      });
      setShowCashflowForm(false);
      showToast(cashflowMode === 'deposit' ? 'Deposit recorded.' : 'Withdrawal recorded.');
      await loadAll();
    } catch (e: any) {
      handleError(e, 'Failed to record cash flow.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteCashflow = async (flow: TradingCashflow) => {
    if (!user) return;
    if (!window.confirm('Delete this entry?')) return;
    setIsSaving(true);
    try {
      await tradingService.deleteCashflow(user.id, flow.id);
      showToast('Entry deleted.');
      await loadAll();
    } catch (e: any) {
      handleError(e, 'Failed to delete entry.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteSnapshot = async (snap: TradingSnapshot) => {
    if (!user) return;
    setIsSaving(true);
    try {
      await tradingService.deleteSnapshot(user.id, snap.id);
      await loadAll();
    } catch (e: any) {
      handleError(e, 'Failed to delete snapshot.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveFxRates = async () => {
    if (!user) return;
    setIsSaving(true);
    try {
      const entries = Object.entries(fxDraft) as [string, string][];
      const rates = entries
        .filter(([, v]) => v.trim() !== '' && !isNaN(Number(v)) && Number(v) > 0)
        .map(([currency, v]) => ({ currency, rate_to_base: Number(v) }));
      await tradingService.upsertFxRates(user.id, rates);
      showToast('FX rates saved.');
      await loadAll();
    } catch (e: any) {
      handleError(e, 'Failed to save FX rates.');
    } finally {
      setIsSaving(false);
    }
  };

  // --- Chart of Accounts connection ---
  const eligibleLinkOptions = useMemo(() => (
    state.accounts
      .filter((a) => a.class === 'Assets' && a.isPosting)
      .map((a) => ({ id: a.id, label: a.name, subLabel: `${a.code} • Current Asset`, color: '#D4AF37' }))
  ), [state.accounts]);

  const createTradingGlAccount = async () => {
    const parent = state.accounts.find((a) => a.code === '11100')
      ?? state.accounts.find((a) => a.class === 'Assets' && a.level === 'group');
    if (!parent) {
      showToast('No "Cash & Bank" group found in the Chart of Accounts.');
      return;
    }
    let n = 40;
    while (state.accounts.some((a) => a.code === `111${n}`)) n += 10;
    const newAccount: Account = {
      id: genId(),
      code: `111${n}`,
      name: 'Trading Account',
      class: 'Assets',
      level: 'gl',
      parentId: parent.id,
      normalBalance: 'debit',
      isSystem: false,
      isPosting: true,
    };
    dispatch({ type: 'ADD_ACCOUNT', payload: newAccount });
    await saveLink(newAccount.id);
  };

  const saveLink = async (accountId: string) => {
    if (!user) return;
    try {
      await tradingService.saveSettings(user.id, { linked_gl_account_id: accountId });
      setLinkedGlAccountId(accountId);
      setShowLinkCard(false);
      showToast('Trading module linked to the Chart of Accounts.');
    } catch (e: any) {
      handleError(e, 'Failed to save the link.');
    }
  };

  const unlink = async () => {
    if (!user) return;
    await tradingService.saveSettings(user.id, { linked_gl_account_id: null });
    setLinkedGlAccountId(null);
    showToast('Chart of Accounts link removed.');
  };

  // --- Render helpers ---
  const openAccountForm = (acc: TradingAccount | null) => {
    setEditAccount(acc);
    setFName(acc?.name ?? '');
    setFBroker(acc?.broker ?? '');
    setFCurrency(acc?.currency ?? 'USD');
    setFNotes(acc?.notes ?? '');
    setShowAccountForm(true);
  };

  const openBalanceForm = (acc: TradingAccount) => {
    setBalanceAccount(acc);
    setFBalance('');
    setFBalanceDate(todayStr());
    setFNote('');
    setShowBalanceForm(true);
  };

  const openCashflowForm = (acc: TradingAccount, mode: 'deposit' | 'withdrawal') => {
    setCashflowAccount(acc);
    setCashflowMode(mode);
    setFAmount('');
    setFDate(todayStr());
    setFNote('');
    setShowCashflowForm(true);
  };

  const inputCls = "w-full bg-gray-900/70 border border-gray-700 rounded-lg px-3 py-2.5 text-white focus:border-gold-500 focus:ring-1 focus:ring-gold-500/30 outline-none transition-colors";
  const labelCls = "block text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-1.5";

  const PnlCell: React.FC<{ value: number | null; pct?: number | null; suffix?: string }> = ({ value, pct, suffix }) => {
    if (value === null) return <span className="text-gray-600 text-sm">—</span>;
    const positive = value >= 0;
    return (
      <span className={`font-mono font-bold ${positive ? 'text-emerald-400' : 'text-red-400'}`}>
        {suffix === '%' ? fmtPct(pct ?? 0) : `${positive ? '' : '-'}${suffix === '$' ? '$' : ''}${fmt(Math.abs(value))}`}
        {suffix !== '%' && pct !== undefined && pct !== null && (
          <span className="text-[10px] ml-1 opacity-70">({fmtPct(pct)})</span>
        )}
      </span>
    );
  };

  const historySnaps = useMemo(() => (
    historyAccount
      ? snapshots
          .filter((s) => s.account_id === historyAccount.id)
          .sort((a, b) => b.snap_date.localeCompare(a.snap_date))
      : []
  ), [historyAccount, snapshots]);

  const historyFlows = useMemo(() => (
    historyAccount
      ? cashflows.filter((f) => f.account_id === historyAccount.id)
      : []
  ), [historyAccount, cashflows]);

  const equityChartData = useMemo(() => (
    [...historySnaps]
      .reverse()
      .map((s) => ({ date: s.snap_date, balance: s.balance }))
  ), [historySnaps]);

  // --- Page ---
  return (
    <div className="space-y-6 pb-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold flex items-center gap-3">
            <CandlestickChart className="text-gold-500" size={28} />
            <span className="text-gold-gradient">Trading Portfolio</span>
          </h1>
          <p className="text-gray-500 text-sm mt-1">Multi-broker tracking • consolidated in {baseCurrency}</p>
        </div>
        <div className="flex gap-2">
          <button onClick={loadAll} className="p-2.5 bg-gray-900 hover:bg-gray-800 border border-gray-800 rounded-xl text-gray-400 hover:text-white transition-colors active:scale-95" title="Refresh">
            <RefreshCw size={18} className={isLoading ? 'animate-spin' : ''} />
          </button>
          <button
            onClick={() => openAccountForm(null)}
            className="flex items-center gap-2 bg-gradient-to-r from-gold-500 to-amber-400 text-black font-bold px-4 py-2.5 rounded-xl hover:shadow-lg hover:shadow-gold-500/20 transition-all active:scale-95 text-sm"
          >
            <Plus size={18} /> Add Account
          </button>
        </div>
      </div>

      {/* Migration / error banners */}
      <AnimatePresence>
        {needsMigration && (
          <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            className="glass-card border-amber-500/30 p-4 flex items-start gap-3">
            <AlertTriangle className="text-amber-400 shrink-0 mt-0.5" size={20} />
            <div className="text-sm">
              <p className="font-bold text-amber-300">Trading tables not found in Supabase</p>
              <p className="text-gray-400 mt-1">Run <code className="text-gold-400 bg-gray-900 px-1.5 py-0.5 rounded">supabase_trading_migration.sql</code> in the Supabase SQL Editor, then refresh this page.</p>
            </div>
          </motion.div>
        )}
        {loadError && !needsMigration && (
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

      {/* Chart of Accounts connection */}
      <div className="glass-card p-4 md:p-5">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="p-2.5 bg-gold-500/10 rounded-xl">
              {linkedGlAccount ? <Link2 className="text-gold-500" size={20} /> : <Unlink className="text-gray-500" size={20} />}
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-gray-500">Chart of Accounts Link</p>
              {linkedGlAccount ? (
                <>
                  <p className="font-bold text-white mt-0.5">
                    {linkedGlAccount.name} <span className="text-gray-500 font-mono text-xs">({linkedGlAccount.code})</span>
                  </p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    Comparison only — this module never posts entries to the main ledger. It reads this account's balance and compares it against your tracked portfolio.
                  </p>
                </>
              ) : (
                <>
                  <p className="font-bold text-white mt-0.5">Not connected</p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    Connect one current-asset account (e.g. "Trading Account" under Cash &amp; Bank) to compare its ledger balance against this portfolio.
                  </p>
                </>
              )}
            </div>
          </div>
          <div className="flex gap-2 shrink-0">
            {linkedGlAccount && (
              <div className="text-right mr-2 hidden sm:block">
                <p className="text-[10px] font-bold uppercase tracking-widest text-gray-500">GL Balance</p>
                <p className="font-mono font-bold text-gold-400">{fmt(glBalance)} {baseCurrency}</p>
              </div>
            )}
            {linkedGlAccount ? (
              <>
                <button onClick={() => { setLinkSelection(linkedGlAccountId ?? ''); setShowLinkCard(true); }}
                  className="px-3 py-2 bg-gray-900 hover:bg-gray-800 border border-gray-800 rounded-xl text-xs font-bold text-gray-300 transition-colors active:scale-95">
                  Change
                </button>
                <button onClick={unlink}
                  className="px-3 py-2 bg-gray-900 hover:bg-red-900/30 border border-gray-800 hover:border-red-500/30 rounded-xl text-xs font-bold text-gray-400 hover:text-red-400 transition-colors active:scale-95">
                  Unlink
                </button>
              </>
            ) : (
              <button onClick={() => { setLinkSelection(''); setShowLinkCard(true); }}
                className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-gold-500 to-amber-400 text-black font-bold rounded-xl text-xs hover:shadow-lg hover:shadow-gold-500/20 transition-all active:scale-95">
                <Link2 size={14} /> Connect Account
              </button>
            )}
          </div>
        </div>

        {/* Balance comparison (read-only vs the main ledger) */}
        {linkedGlAccount && (
          <div className="mt-4 pt-4 border-t border-gray-800/70">
            <div className="flex items-center gap-2 text-xs text-gray-500 mb-2">
              <Scale size={14} className="text-gold-500/70" />
              <span>Balance comparison (read-only) — ledger vs this module</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
              <div className="bg-gray-900/60 rounded-lg px-3 py-2 flex items-center justify-between">
                <span className="text-gray-500">GL: {linkedGlAccount.name}</span>
                <span className="font-mono font-bold text-gold-400">{fmt(glBalance)}</span>
              </div>
              <div className="bg-gray-900/60 rounded-lg px-3 py-2 flex items-center justify-between">
                <span className="text-gray-500">Module: Net Capital</span>
                <span className="font-mono font-bold text-gray-300">{fmt(netInvestedBase)}</span>
              </div>
              <div className="bg-gray-900/60 rounded-lg px-3 py-2 flex items-center justify-between">
                <span className="text-gray-500">Module: Balance Today</span>
                <span className="font-mono font-bold text-gray-300">{fmt(totals.balanceBase)}</span>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-x-5 gap-y-1 mt-2 font-mono text-xs">
              <span className="text-gray-500">
                GL − Net Capital: <span className={`font-bold ${Math.abs(glBalance - netInvestedBase) < 0.01 ? 'text-emerald-400' : 'text-amber-400'}`}>{fmt(glBalance - netInvestedBase)}</span>
              </span>
              <span className="text-gray-500">
                GL − Balance Today: <span className={`font-bold ${Math.abs(glBalance - totals.balanceBase) < 0.01 ? 'text-emerald-400' : 'text-amber-400'}`}>{fmt(glBalance - totals.balanceBase)}</span>
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
        <div className="glass-card p-4">
          <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-gray-500"><Landmark size={12} /> Total Capital</div>
          <p className="font-mono text-lg md:text-xl font-bold text-white mt-2">{fmt(totals.capitalBase)}</p>
          <p className="text-[10px] text-gray-600 mt-0.5">{baseCurrency} • net deposits</p>
        </div>
        <div className="glass-card p-4">
          <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-gray-500"><Wallet size={12} /> Balance Today</div>
          <p className="font-mono text-lg md:text-xl font-bold text-gold-400 mt-2">{fmt(totals.balanceBase)}</p>
          <p className="text-[10px] text-gray-600 mt-0.5">{baseCurrency} • latest snapshots</p>
        </div>
        <div className="glass-card p-4">
          <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-gray-500">
            {totals.pnlBase >= 0 ? <TrendingUp size={12} className="text-emerald-400" /> : <TrendingDown size={12} className="text-red-400" />} Net P/L
          </div>
          <PnlCell value={totals.pnlBase} />
          <p className="text-[10px] text-gray-600 mt-0.5">{baseCurrency} • balance − capital</p>
        </div>
        <div className="glass-card p-4">
          <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-gray-500"><CandlestickChart size={12} /> ROI</div>
          <p className={`font-mono text-lg md:text-xl font-bold mt-2 ${totals.roi >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{fmtPct(totals.roi)}</p>
          <p className="text-[10px] text-gray-600 mt-0.5">portfolio return on capital</p>
        </div>
      </div>

      {/* FX rates */}
      <div className="glass-card p-4 md:p-5">
        <div className="flex items-center justify-between mb-3">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-gray-500">FX Rates</p>
            <p className="text-xs text-gray-500 mt-0.5">1 unit = X {baseCurrency} • used to consolidate accounts</p>
          </div>
          <button onClick={handleSaveFxRates} disabled={isSaving}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-900 hover:bg-gray-800 border border-gray-800 rounded-lg text-xs font-bold text-gold-400 transition-colors active:scale-95 disabled:opacity-50">
            <Check size={13} /> Save Rates
          </button>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5">
          {fxRates.map((r) => (
            <div key={r.id} className="flex items-center gap-2 bg-gray-900/70 border border-gray-800 rounded-lg px-3 py-2">
              <span className="text-xs font-bold text-gold-400 w-10 shrink-0">{r.currency}</span>
              <input
                type="number" step="any" min="0"
                value={fxDraft[r.currency] ?? ''}
                onChange={(e) => setFxDraft((d) => ({ ...d, [r.currency]: e.target.value }))}
                className="w-full bg-transparent text-white font-mono text-sm outline-none text-right"
              />
              <span className="text-[10px] text-gray-600 shrink-0">{baseCurrency}</span>
            </div>
          ))}
        </div>
        {missingRates.length > 0 && (
          <p className="text-xs text-amber-400 mt-3 flex items-center gap-1.5">
            <AlertTriangle size={13} />
            No rate saved for {missingRates.join(', ')} — treated as 1:1 until you add a rate above (save, then reload).
          </p>
        )}
      </div>

      {/* Accounts */}
      <div className="glass-card overflow-hidden">
        <div className="px-4 md:px-5 py-4 border-b border-gray-800/70 flex items-center justify-between">
          <p className="text-[10px] font-bold uppercase tracking-widest text-gray-500">
            Broker Accounts ({accounts.length})
          </p>
          <p className="text-[10px] text-gray-600 hidden sm:block">P/L = Balance Today − Net Capital</p>
        </div>

        {isLoading ? (
          <div className="p-10 text-center text-gray-500 animate-pulse font-bold tracking-widest text-sm">LOADING PORTFOLIO...</div>
        ) : accounts.length === 0 ? (
          <div className="p-10 text-center">
            <CandlestickChart size={40} className="mx-auto text-gray-700 mb-3" />
            <p className="text-gray-400 font-bold">No trading accounts yet</p>
            <p className="text-gray-600 text-sm mt-1">Add your first brokerage account to start tracking.</p>
            <button onClick={() => openAccountForm(null)}
              className="mt-4 inline-flex items-center gap-2 bg-gradient-to-r from-gold-500 to-amber-400 text-black font-bold px-4 py-2 rounded-xl text-sm active:scale-95 transition-transform">
              <Plus size={16} /> Add Account
            </button>
          </div>
        ) : (
          <>
            {/* Desktop table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[10px] uppercase tracking-widest text-gray-500 border-b border-gray-800/70">
                    <th className="px-5 py-3 font-bold">Account</th>
                    <th className="px-4 py-3 font-bold text-right">Capital</th>
                    <th className="px-4 py-3 font-bold text-right">Balance Today</th>
                    <th className="px-4 py-3 font-bold text-right">P / L</th>
                    <th className="px-4 py-3 font-bold text-right">ROI</th>
                    <th className="px-4 py-3 font-bold text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.account.id} className="border-b border-gray-800/40 hover:bg-gray-800/30 transition-colors">
                      <td className="px-5 py-3.5">
                        <p className="font-bold text-white">{r.account.name}</p>
                        <p className="text-xs text-gray-500">
                          {r.account.broker && <span className="text-gold-500/80">{r.account.broker} • </span>}
                          {r.account.currency}
                          {r.lastSnapshotDate && <span> • updated {format(parseISO(r.lastSnapshotDate), 'dd MMM')}</span>}
                        </p>
                      </td>
                      <td className="px-4 py-3.5 text-right font-mono text-gray-300">{fmt(r.capital)}</td>
                      <td className="px-4 py-3.5 text-right font-mono font-bold text-gold-400">{r.balance !== null ? fmt(r.balance) : '—'}</td>
                      <td className="px-4 py-3.5 text-right"><PnlCell value={r.pnl} /></td>
                      <td className="px-4 py-3.5 text-right"><PnlCell value={r.roi ?? 0} pct={r.roi} suffix="%" /></td>
                      <td className="px-4 py-3.5">
                        <div className="flex items-center justify-end gap-1">
                          <IconBtn title="Update balance" onClick={() => openBalanceForm(r.account)} icon={<CandlestickChart size={15} />} />
                          <IconBtn title="Deposit" onClick={() => openCashflowForm(r.account, 'deposit')} icon={<ArrowDownToLine size={15} />} gold />
                          <IconBtn title="Withdraw" onClick={() => openCashflowForm(r.account, 'withdrawal')} icon={<ArrowUpFromLine size={15} />} />
                          <IconBtn title="History" onClick={() => setHistoryAccount(r.account)} icon={<History size={15} />} />
                          <IconBtn title="Edit" onClick={() => openAccountForm(r.account)} icon={<Pencil size={15} />} />
                          <IconBtn title="Delete" onClick={() => handleDeleteAccount(r.account)} icon={<Trash2 size={15} />} danger />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile cards */}
            <div className="md:hidden divide-y divide-gray-800/40">
              {rows.map((r) => (
                <div key={r.account.id} className="p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-bold text-white text-sm">{r.account.name}</p>
                      <p className="text-[11px] text-gray-500">
                        {r.account.broker && <span className="text-gold-500/80">{r.account.broker} • </span>}{r.account.currency}
                      </p>
                    </div>
                    <div className="text-right">
                      <PnlCell value={r.pnl} pct={r.roi} />
                      <p className="text-[10px] text-gray-600 font-sans">P/L &amp; ROI</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2 mt-3 text-xs">
                    <div className="bg-gray-900/60 rounded-lg p-2.5">
                      <p className="text-[9px] uppercase tracking-widest text-gray-500 font-bold">Capital</p>
                      <p className="font-mono text-gray-300 mt-0.5">{fmt(r.capital)} {r.account.currency}</p>
                    </div>
                    <div className="bg-gray-900/60 rounded-lg p-2.5">
                      <p className="text-[9px] uppercase tracking-widest text-gray-500 font-bold">Balance Today</p>
                      <p className="font-mono text-gold-400 mt-0.5">{r.balance !== null ? `${fmt(r.balance)}` : '—'}</p>
                    </div>
                  </div>
                  <div className="flex gap-1.5 mt-3 flex-wrap">
                    <MiniBtn onClick={() => openBalanceForm(r.account)} label="Balance" icon={<CandlestickChart size={13} />} gold />
                    <MiniBtn onClick={() => openCashflowForm(r.account, 'deposit')} label="Deposit" icon={<ArrowDownToLine size={13} />} />
                    <MiniBtn onClick={() => openCashflowForm(r.account, 'withdrawal')} label="Withdraw" icon={<ArrowUpFromLine size={13} />} />
                    <MiniBtn onClick={() => setHistoryAccount(r.account)} label="History" icon={<History size={13} />} />
                    <MiniBtn onClick={() => openAccountForm(r.account)} label="" icon={<Pencil size={13} />} />
                    <MiniBtn onClick={() => handleDeleteAccount(r.account)} label="" icon={<Trash2 size={13} />} danger />
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* ============ Modals ============ */}

      {/* Link account picker */}
      <Modal isOpen={showLinkCard} onClose={() => setShowLinkCard(false)} title="Connect Chart of Accounts">
        <div className="space-y-4">
          <p className="text-sm text-gray-400">
            Choose an existing current-asset account, or create the standard <span className="text-gold-400 font-bold">Trading Account</span> under Cash &amp; Bank (11100).
          </p>
          <div>
            <label className={labelCls}>Existing Asset Account</label>
            <SearchableSelect options={eligibleLinkOptions} value={linkSelection} onChange={setLinkSelection} placeholder="Select an account..." />
          </div>
          <div className="flex flex-col sm:flex-row gap-2 pt-2">
            <button
              onClick={() => linkSelection && saveLink(linkSelection)}
              disabled={!linkSelection}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-gradient-to-r from-gold-500 to-amber-400 text-black font-bold rounded-xl text-sm active:scale-95 transition-transform disabled:opacity-40"
            >
              <Link2 size={15} /> Link Selected
            </button>
            <button
              onClick={createTradingGlAccount}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-gray-900 hover:bg-gray-800 border border-gold-500/30 text-gold-400 font-bold rounded-xl text-sm active:scale-95 transition-all"
            >
              <Plus size={15} /> Create "Trading Account"
            </button>
          </div>
        </div>
      </Modal>

      {/* Add / edit trading account */}
      <Modal isOpen={showAccountForm} onClose={() => setShowAccountForm(false)} title={editAccount ? 'Edit Trading Account' : 'New Trading Account'}>
        <div className="space-y-4">
          <div>
            <label className={labelCls}>Account Name *</label>
            <input value={fName} onChange={(e) => setFName(e.target.value)} placeholder="e.g. Binance, Exness Standard" className={inputCls} autoFocus />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Broker / Platform</label>
              <input value={fBroker} onChange={(e) => setFBroker(e.target.value)} placeholder="Optional" className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Currency</label>
              <select value={fCurrency} onChange={(e) => setFCurrency(e.target.value)} className={inputCls}>
                {CURRENCIES.map((c) => <option key={c.code} value={c.code}>{c.code} — {c.name}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className={labelCls}>Notes</label>
            <input value={fNotes} onChange={(e) => setFNotes(e.target.value)} placeholder="Optional" className={inputCls} />
          </div>
          <button onClick={handleSaveAccount} disabled={isSaving || !fName.trim()}
            className="w-full bg-gradient-to-r from-gold-500 to-amber-400 text-black font-bold py-3 rounded-xl active:scale-95 transition-transform disabled:opacity-40">
            {isSaving ? 'Saving...' : editAccount ? 'Save Changes' : 'Add Account'}
          </button>
        </div>
      </Modal>

      {/* Update balance */}
      <Modal isOpen={showBalanceForm} onClose={() => setShowBalanceForm(false)} title={`Update Balance — ${balanceAccount?.name ?? ''}`}>
        <div className="space-y-4">
          <div className="bg-gray-900/60 border border-gray-800 rounded-lg p-3 text-xs text-gray-500">
            Record today's total equity in the account. One snapshot per day — re-saving the same date overwrites it.
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Balance ({balanceAccount?.currency}) *</label>
              <input value={fBalance} onChange={(e) => setFBalance(e.target.value)} onBlur={() => setFBalance(fBalance ? String(evaluateMathExpression(fBalance)) : '')}
                placeholder="e.g. 1050.75" className={`${inputCls} font-mono`} autoFocus />
            </div>
            <div>
              <label className={labelCls}>Date</label>
              <input type="date" value={fBalanceDate} onChange={(e) => setFBalanceDate(e.target.value)} className={inputCls} />
            </div>
          </div>
          <p className="text-[10px] text-gray-600 font-mono">Tip: math works here too — type 500*2 and blur.</p>
          <div>
            <label className={labelCls}>Note</label>
            <input value={fNote} onChange={(e) => setFNote(e.target.value)} placeholder="Optional" className={inputCls} />
          </div>
          <button onClick={handleSaveBalance} disabled={isSaving || !fBalance.trim()}
            className="w-full bg-gradient-to-r from-gold-500 to-amber-400 text-black font-bold py-3 rounded-xl active:scale-95 transition-transform disabled:opacity-40">
            {isSaving ? 'Saving...' : 'Save Balance'}
          </button>
        </div>
      </Modal>

      {/* Deposit / withdrawal */}
      <Modal
        isOpen={showCashflowForm}
        onClose={() => setShowCashflowForm(false)}
        title={`${cashflowMode === 'deposit' ? 'Deposit to' : 'Withdraw from'} ${cashflowAccount?.name ?? ''}`}
      >
        <div className="space-y-4">
          <p className="text-xs text-gray-500 bg-gray-900/60 border border-gray-800 rounded-lg p-3">
            Standalone entry — tracked in this module only. It never posts journal entries or changes balances in the main app.
          </p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Amount ({cashflowAccount?.currency}) *</label>
              <input value={fAmount} onChange={(e) => setFAmount(e.target.value)} onBlur={() => setFAmount(fAmount ? String(evaluateMathExpression(fAmount)) : '')}
                placeholder="0.00" className={`${inputCls} font-mono`} autoFocus />
            </div>
            <div>
              <label className={labelCls}>Date</label>
              <input type="date" value={fDate} onChange={(e) => setFDate(e.target.value)} className={inputCls} />
            </div>
          </div>
          {cashflowAccount && cashflowAccount.currency !== baseCurrency && (
            <p className="text-[11px] text-gray-500 font-mono">
              Ledger amount: {fmt(Number(evaluateMathExpression(fAmount || '0') || 0) * rateFor(cashflowAccount.currency))} {baseCurrency} @ rate {rateFor(cashflowAccount.currency)}
            </p>
          )}
          <div>
            <label className={labelCls}>Note</label>
            <input value={fNote} onChange={(e) => setFNote(e.target.value)} placeholder="Optional" className={inputCls} />
          </div>
          <button onClick={handleSaveCashflow} disabled={isSaving || !fAmount.trim()}
            className="w-full bg-gradient-to-r from-gold-500 to-amber-400 text-black font-bold py-3 rounded-xl active:scale-95 transition-transform disabled:opacity-40">
            {isSaving ? 'Saving...' : cashflowMode === 'deposit' ? 'Record Deposit' : 'Record Withdrawal'}
          </button>
        </div>
      </Modal>

      {/* History */}
      <Modal isOpen={!!historyAccount} onClose={() => setHistoryAccount(null)} title={`History — ${historyAccount?.name ?? ''}`}>
        <div className="space-y-5">
          {equityChartData.length > 1 && (
            <div className="bg-gray-900/60 border border-gray-800 rounded-xl p-3">
              <p className="text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-2">Equity Curve ({historyAccount?.currency})</p>
              <div className="h-40">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={equityChartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                    <XAxis dataKey="date" tick={{ fill: '#71717a', fontSize: 10 }} tickFormatter={(d: string) => format(parseISO(d), 'dd MMM')} />
                    <YAxis tick={{ fill: '#71717a', fontSize: 10 }} domain={['auto', 'auto']} width={50} />
                    <Tooltip
                      contentStyle={{ background: '#18181b', border: '1px solid #3f3f46', borderRadius: 8, fontSize: 12 }}
                      labelStyle={{ color: '#d4af37' }}
                      formatter={(v: number) => [fmt(v), 'Balance']}
                      labelFormatter={(d: string) => format(parseISO(d), 'dd MMM yyyy')}
                    />
                    <Line type="monotone" dataKey="balance" stroke="#D4AF37" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-2">Balance Snapshots</p>
            {historySnaps.length === 0 ? (
              <p className="text-xs text-gray-600">No snapshots yet.</p>
            ) : (
              <div className="max-h-44 overflow-y-auto space-y-1 pr-1">
                {historySnaps.map((s) => (
                  <div key={s.id} className="flex items-center justify-between bg-gray-900/60 border border-gray-800 rounded-lg px-3 py-2 text-sm">
                    <span className="text-gray-400 font-mono text-xs">{format(parseISO(s.snap_date), 'dd MMM yyyy')}</span>
                    <div className="flex items-center gap-3">
                      <span className="font-mono font-bold text-gold-400">{fmt(s.balance)}</span>
                      <button onClick={() => handleDeleteSnapshot(s)} className="text-gray-600 hover:text-red-400 transition-colors">
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-2">Deposits &amp; Withdrawals</p>
            {historyFlows.length === 0 ? (
              <p className="text-xs text-gray-600">No cash flows yet.</p>
            ) : (
              <div className="max-h-44 overflow-y-auto space-y-1 pr-1">
                {historyFlows.map((f) => (
                  <div key={f.id} className="flex items-center justify-between bg-gray-900/60 border border-gray-800 rounded-lg px-3 py-2 text-sm">
                    <div className="min-w-0">
                      <span className={`text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded mr-2 ${f.flow_type === 'deposit' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-orange-500/10 text-orange-400'}`}>
                        {f.flow_type}
                      </span>
                      <span className="text-gray-400 font-mono text-xs">{format(parseISO(f.flow_date), 'dd MMM yyyy')}</span>
                      {f.note && <span className="text-gray-600 text-xs ml-2 truncate">{f.note}</span>}
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <span className={`font-mono font-bold ${f.flow_type === 'deposit' ? 'text-emerald-400' : 'text-orange-400'}`}>
                        {f.flow_type === 'deposit' ? '+' : '−'}{fmt(f.amount)}
                      </span>
                      <button onClick={() => handleDeleteCashflow(f)} className="text-gray-600 hover:text-red-400 transition-colors">
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </Modal>

      {/* Toast */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 20 }}
            className="fixed bottom-24 md:bottom-8 left-1/2 -translate-x-1/2 z-50 bg-gray-900 border border-gold-500/40 text-gold-300 text-sm font-bold px-5 py-3 rounded-xl shadow-2xl shadow-black/50"
          >
            {toast}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

// Helpers (kept outside the main component to avoid re-creation)
const IconBtn: React.FC<{ title: string; onClick: () => void; icon: React.ReactNode; gold?: boolean; danger?: boolean }> = ({ title, onClick, icon, gold, danger }) => (
  <button
    title={title} onClick={onClick}
    className={`p-1.5 rounded-lg transition-colors active:scale-90 ${
      danger ? 'text-gray-500 hover:text-red-400 hover:bg-red-500/10'
      : gold ? 'text-gold-500 hover:bg-gold-500/10'
      : 'text-gray-500 hover:text-white hover:bg-gray-800'
    }`}
  >
    {icon}
  </button>
);

const MiniBtn: React.FC<{ label: string; onClick: () => void; icon: React.ReactNode; gold?: boolean; danger?: boolean }> = ({ label, onClick, icon, gold, danger }) => (
  <button
    onClick={onClick}
    className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-bold border transition-colors active:scale-95 ${
      danger ? 'border-gray-800 text-gray-500 hover:text-red-400 hover:border-red-500/30'
      : gold ? 'border-gold-500/40 text-gold-400 hover:bg-gold-500/10'
      : 'border-gray-800 text-gray-400 hover:text-white hover:bg-gray-800'
    }`}
  >
    {icon}{label && <span>{label}</span>}
  </button>
);
