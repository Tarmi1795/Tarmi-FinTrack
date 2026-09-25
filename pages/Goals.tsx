
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useFinance } from '../context/FinanceContext';
import { goalsService } from '../services/goals';
import { SavingsGoal, GoalMovement, Account, Transaction } from '../types';
import { Modal } from '../components/ui/Modal';
import { SearchableSelect } from '../components/ui/SearchableSelect';
import { confirmDialog, alertDialog } from '../components/ui/ConfirmDialog';
import { SkeletonCard } from '../components/ui/Skeleton';
import { evaluateMathExpression } from '../utils/mathUtils';
import { format, parseISO, differenceInMonths } from 'date-fns';
import { motion, AnimatePresence } from 'framer-motion';
import {
  PiggyBank, Target, TrendingUp, Plus, RefreshCw, Trash2, Pencil, History,
  ArrowDownToLine, ArrowUpFromLine, AlertTriangle, X, ChevronDown, ChevronUp,
  Archive, ArchiveRestore
} from 'lucide-react';

const todayStr = () => format(new Date(), 'yyyy-MM-dd');
const fmt = (n: number) => n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const genId = () => (crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substr(2, 12));

// The savings_goals table also stores the optional modal note (kept off the base interface)
type Goal = SavingsGoal & { note?: string };

export const Goals: React.FC = () => {
  const { user, state, dispatch } = useFinance();
  const baseCurrency = state.businessProfile.baseCurrency || 'QAR';

  const [goals, setGoals] = useState<Goal[]>([]);
  const [movements, setMovements] = useState<GoalMovement[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [needsMigration, setNeedsMigration] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // Modal state
  const [showGoalForm, setShowGoalForm] = useState(false);
  const [editGoal, setEditGoal] = useState<Goal | null>(null);
  const [showMovementForm, setShowMovementForm] = useState(false);
  const [movementGoal, setMovementGoal] = useState<Goal | null>(null);
  const [movementMode, setMovementMode] = useState<'in' | 'out'>('in');
  const [historyGoal, setHistoryGoal] = useState<Goal | null>(null);
  const [showArchived, setShowArchived] = useState(false);

  // Goal form fields
  const [fName, setFName] = useState('');
  const [fTarget, setFTarget] = useState('');
  const [fDate, setFDate] = useState('');
  const [fNote, setFNote] = useState('');

  // Movement form fields
  const [mAmount, setMAmount] = useState('');
  const [mDate, setMDate] = useState(todayStr());
  const [mBankId, setMBankId] = useState('');
  const [mNote, setMNote] = useState('');

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  };

  const handleError = (e: any, fallback: string) => {
    if (goalsService.isMissingTableError(e)) {
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
      const [g, mvs] = await Promise.all([
        goalsService.getGoals(user.id),
        goalsService.getMovements(user.id),
      ]);
      setGoals(g);
      setMovements(mvs);
    } catch (e: any) {
      if (goalsService.isMissingTableError(e)) {
        setNeedsMigration(true);
      } else {
        setLoadError(e?.message || 'Failed to load savings goals.');
      }
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  useEffect(() => { loadAll(); }, [loadAll]);

  // --- Derived data ---
  const activeGoals = useMemo(() => goals.filter((g) => !g.is_archived), [goals]);
  const archivedGoals = useMemo(() => goals.filter((g) => g.is_archived), [goals]);

  // Saved = sum of movements (in − out) per goal
  const savedFor = useCallback((goalId: string) => (
    movements.reduce(
      (sum, m) => m.goal_id === goalId ? sum + (m.direction === 'in' ? Number(m.amount) : -Number(m.amount)) : sum,
      0
    )
  ), [movements]);

  const goalProgress = useCallback((g: Goal) => {
    const saved = savedFor(g.id);
    const target = Number(g.target_amount);
    return { saved, remaining: Math.max(0, target - saved), pct: target > 0 ? (saved / target) * 100 : 0 };
  }, [savedFor]);

  // 'past' = deadline passed, 'done' = fully saved, number = required per month, null = no deadline
  const monthlyNeed = (g: Goal): 'past' | 'done' | number | null => {
    if (!g.target_date) return null;
    const monthsLeft = differenceInMonths(parseISO(g.target_date), new Date());
    if (monthsLeft <= 0) return 'past';
    const { remaining } = goalProgress(g);
    if (remaining <= 0) return 'done';
    return remaining / monthsLeft;
  };

  const totals = useMemo(() => {
    const saved = activeGoals.reduce((s, g) => s + savedFor(g.id), 0);
    const target = activeGoals.reduce((s, g) => s + Number(g.target_amount), 0);
    const progress = target > 0 ? (saved / target) * 100 : 0;
    return { saved, target, progress };
  }, [activeGoals, savedFor]);

  // Assets posting accounts (banks/cash) for the movement contra leg
  const bankOptions = useMemo(() => (
    state.accounts
      .filter((a) => a.class === 'Assets' && a.isPosting)
      .map((a) => ({ id: a.id, label: a.name, subLabel: a.code, color: '#D4AF37' }))
  ), [state.accounts]);

  const defaultBankId = useMemo(() => (
    state.accounts.find((a) => a.code === '11110')?.id || bankOptions[0]?.id || ''
  ), [state.accounts, bankOptions]);

  const historyRows = useMemo(() => (
    historyGoal
      ? movements
          .filter((m) => m.goal_id === historyGoal.id)
          .sort((a, b) => b.flow_date.localeCompare(a.flow_date) || (b.created_at || '').localeCompare(a.created_at || ''))
      : []
  ), [historyGoal, movements]);

  // --- Actions ---
  const openGoalForm = (g: Goal | null) => {
    setEditGoal(g);
    setFName(g?.name ?? '');
    setFTarget(g ? String(Number(g.target_amount)) : '');
    setFDate(g?.target_date ?? '');
    setFNote(g?.note ?? '');
    setShowGoalForm(true);
  };

  const handleSaveGoal = async () => {
    if (!user || !fName.trim()) return;
    const evaluated = evaluateMathExpression(fTarget);
    const value = Number(evaluated);
    if (evaluated.trim() === '' || isNaN(value) || value <= 0) return;
    setIsSaving(true);
    try {
      const payload = {
        name: fName.trim(),
        target_amount: Math.round(value * 100) / 100,
        target_date: fDate || null,
        note: fNote.trim() || undefined,
      };
      if (editGoal) {
        await goalsService.updateGoal(user.id, editGoal.id, payload);
      } else {
        // Create the goal's own GL asset sub-account (parent: 11400 if present, else the Assets class node)
        const parent = state.accounts.find((a) => a.code === '11400')
          ?? state.accounts.find((a) => a.class === 'Assets' && a.level === 'class');
        let glAccountId: string | null = null;
        if (parent) {
          let codeNum = 11410;
          while (state.accounts.some((a) => a.code === String(codeNum))) codeNum += 10;
          const newAccount: Account = {
            id: genId(),
            code: String(codeNum),
            name: `Goal: ${fName.trim()}`,
            class: 'Assets',
            level: 'gl',
            parentId: parent.id,
            normalBalance: 'debit',
            isSystem: false,
            isPosting: true,
          };
          dispatch({ type: 'ADD_ACCOUNT', payload: newAccount });
          glAccountId = newAccount.id;
        } else {
          await alertDialog({
            title: 'No Assets class found',
            message: 'This goal was created without a Chart-of-Accounts link, so its movements will be tracked here only — no journal entries will be posted to the main ledger.',
          });
        }
        await goalsService.createGoal(user.id, { ...payload, gl_account_id: glAccountId, is_archived: false });
      }
      setShowGoalForm(false);
      showToast(editGoal ? 'Goal updated.' : 'Savings goal created.');
      await loadAll();
    } catch (e: any) {
      handleError(e, 'Failed to save goal.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleArchiveGoal = async (g: Goal) => {
    if (!user) return;
    if (!(await confirmDialog({
      title: `Archive "${g.name}"?`,
      message: 'It will be hidden from the list and summary cards — all data is kept and you can restore it anytime.',
      confirmLabel: 'Archive',
    }))) return;
    setIsSaving(true);
    try {
      await goalsService.updateGoal(user.id, g.id, { is_archived: true });
      showToast('Goal archived.');
      await loadAll();
    } catch (e: any) {
      handleError(e, 'Failed to archive goal.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleRestoreGoal = async (g: Goal) => {
    if (!user) return;
    setIsSaving(true);
    try {
      await goalsService.updateGoal(user.id, g.id, { is_archived: false });
      showToast('Goal restored.');
      await loadAll();
    } catch (e: any) {
      handleError(e, 'Failed to restore goal.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteGoal = async (g: Goal) => {
    if (!user) return;
    if (!(await confirmDialog({
      title: `Delete "${g.name}"?`,
      message: 'All of its movements and their linked journal entries will be removed, and the goal\'s Chart-of-Accounts sub-account will be deleted. This cannot be undone.',
      danger: true,
      confirmLabel: 'Delete',
    }))) return;
    setIsSaving(true);
    try {
      // Remove the journal entries posted by this goal's movements
      movements
        .filter((m) => m.goal_id === g.id && m.gl_transaction_id)
        .forEach((m) => dispatch({ type: 'DELETE_TRANSACTION', payload: m.gl_transaction_id! }));
      // Remove the goal's GL sub-account (never touch system accounts)
      const glAccount = g.gl_account_id ? state.accounts.find((a) => a.id === g.gl_account_id) : undefined;
      if (glAccount && !glAccount.isSystem) {
        dispatch({ type: 'DELETE_ACCOUNT', payload: glAccount.id });
      }
      await goalsService.deleteGoal(user.id, g.id); // movements cascade in the DB
      showToast('Savings goal deleted.');
      await loadAll();
    } catch (e: any) {
      handleError(e, 'Failed to delete goal.');
    } finally {
      setIsSaving(false);
    }
  };

  const openMovementForm = (g: Goal, mode: 'in' | 'out') => {
    setMovementGoal(g);
    setMovementMode(mode);
    setMAmount('');
    setMDate(todayStr());
    setMBankId(defaultBankId);
    setMNote('');
    setShowMovementForm(true);
  };

  const handleSaveMovement = async () => {
    if (!user || !movementGoal) return;
    const evaluated = evaluateMathExpression(mAmount);
    const value = Number(evaluated);
    if (evaluated.trim() === '' || isNaN(value) || value <= 0) return;
    const goal = movementGoal;
    const amount = Math.round(value * 100) / 100;
    const bank = state.accounts.find((a) => a.id === mBankId) || null;
    setIsSaving(true);
    try {
      const mv = await goalsService.createMovement(user.id, {
        goal_id: goal.id,
        direction: movementMode,
        amount,
        flow_date: mDate,
        note: mNote.trim() || undefined,
      });

      // Post the matching transfer to the main ledger (Dr goal account / Cr bank — reversed on withdrawal)
      if (goal.gl_account_id && bank) {
        const txId = genId();
        const tx: Transaction = {
          id: txId,
          date: new Date(`${mDate}T12:00:00`).toISOString(),
          type: 'transfer',
          amount,
          source: 'personal',
          accountId: movementMode === 'in' ? goal.gl_account_id : bank.id,
          paymentAccountId: movementMode === 'in' ? bank.id : goal.gl_account_id,
          note: movementMode === 'in' ? `[Goal] Save to ${goal.name}` : `[Goal] Withdraw from ${goal.name}`,
        };
        dispatch({ type: 'ADD_TRANSACTION', payload: tx });
        await goalsService.updateMovement(user.id, mv.id, { gl_transaction_id: txId });
      }

      setShowMovementForm(false);
      showToast(movementMode === 'in' ? 'Saved to goal.' : 'Withdrawal recorded.');
      await loadAll();
    } catch (e: any) {
      handleError(e, 'Failed to record movement.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteMovement = async (mv: GoalMovement) => {
    if (!user) return;
    if (!(await confirmDialog({
      title: 'Delete this movement?',
      message: mv.gl_transaction_id
        ? 'Its linked journal entry in the main ledger will be removed too.'
        : 'This cannot be undone.',
      danger: true,
      confirmLabel: 'Delete',
    }))) return;
    setIsSaving(true);
    try {
      if (mv.gl_transaction_id) {
        dispatch({ type: 'DELETE_TRANSACTION', payload: mv.gl_transaction_id });
      }
      await goalsService.deleteMovement(user.id, mv.id);
      showToast('Movement deleted.');
      await loadAll();
    } catch (e: any) {
      handleError(e, 'Failed to delete movement.');
    } finally {
      setIsSaving(false);
    }
  };

  // --- Render helpers ---
  const inputCls = "w-full bg-gray-900/70 border border-gray-700 rounded-lg px-3 py-2.5 text-white focus:border-gold-500 focus:ring-1 focus:ring-gold-500/30 outline-none transition-colors";
  const labelCls = "block text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-1.5";

  const renderMonthlyNeed = (g: Goal) => {
    const need = monthlyNeed(g);
    const { remaining } = goalProgress(g);
    if (need === 'past') return <span className="text-red-400 font-bold">Past due — {fmt(remaining)} {baseCurrency} to go</span>;
    if (need === 'done') return <span className="text-emerald-400 font-bold">Goal reached</span>;
    if (need === null) return <span className="text-gray-600">No deadline set</span>;
    return <>Needs <span className="text-gold-400 font-bold">{baseCurrency} {fmt(need)}</span>/month</>;
  };

  const renderGoalCard = (g: Goal) => {
    const { saved, pct } = goalProgress(g);
    return (
      <div key={g.id} className="bg-gray-900/50 border border-gray-800 rounded-xl p-4 flex flex-col hover:border-gray-700 transition-colors">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="font-bold text-white text-sm truncate">{g.name}</p>
            <p className="text-[11px] text-gray-500">
              {g.target_date ? `Target: ${format(parseISO(g.target_date), 'dd MMM yyyy')}` : 'No target date'}
            </p>
          </div>
          <span className="font-mono text-sm font-bold text-gold-400 shrink-0">{pct.toFixed(1)}%</span>
        </div>
        <p className="font-mono text-lg font-bold text-white mt-2 truncate">
          {fmt(saved)} <span className="text-[11px] text-gray-600 font-sans">of {fmt(Number(g.target_amount))} {baseCurrency}</span>
        </p>
        <div className="h-2.5 bg-gray-800 rounded-full overflow-hidden mt-2 shrink-0">
          <div
            className="h-full bg-gradient-to-r from-gold-500 to-amber-400 rounded-full transition-all duration-500"
            style={{ width: `${Math.min(100, Math.max(0, pct))}%` }}
          />
        </div>
        <p className="text-[10px] text-gray-500 mt-2">{renderMonthlyNeed(g)}</p>
        <div className="flex gap-1.5 mt-3 flex-wrap pt-3 border-t border-gray-800/60">
          <MiniBtn onClick={() => openMovementForm(g, 'in')} label="Add" icon={<ArrowDownToLine size={13} />} gold />
          <MiniBtn onClick={() => openMovementForm(g, 'out')} label="Withdraw" icon={<ArrowUpFromLine size={13} />} />
          <MiniBtn onClick={() => setHistoryGoal(g)} label="History" icon={<History size={13} />} />
          <MiniBtn onClick={() => openGoalForm(g)} label="" icon={<Pencil size={13} />} />
          <MiniBtn onClick={() => handleArchiveGoal(g)} label="" icon={<Archive size={13} />} />
          <MiniBtn onClick={() => handleDeleteGoal(g)} label="" icon={<Trash2 size={13} />} danger />
        </div>
      </div>
    );
  };

  // --- Page ---
  return (
    <div className="space-y-4 md:space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl md:text-3xl font-bold flex items-center gap-2.5">
            <PiggyBank className="text-gold-500" size={24} />
            <span className="text-gold-gradient">Savings Goals</span>
          </h1>
          <p className="text-gray-500 text-sm mt-1">Set money aside toward targets • tracked in {baseCurrency}</p>
        </div>
        <div className="flex gap-2">
          <button onClick={loadAll} className="p-2.5 bg-gray-900 hover:bg-gray-800 border border-gray-800 rounded-xl text-gray-400 hover:text-white transition-colors active:scale-95" title="Refresh">
            <RefreshCw size={18} className={isLoading ? 'animate-spin' : ''} />
          </button>
          <button
            onClick={() => openGoalForm(null)}
            className="flex items-center gap-2 bg-gradient-to-r from-gold-500 to-amber-400 text-black font-bold px-4 py-2.5 rounded-xl hover:shadow-lg hover:shadow-gold-500/20 transition-all active:scale-95 text-sm"
          >
            <Plus size={18} /> Add Goal
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
              <p className="font-bold text-amber-300">Savings goals tables not found in Supabase</p>
              <p className="text-gray-400 mt-1">Run <code className="text-gold-400 bg-gray-900 px-1.5 py-0.5 rounded">supabase_goals_migration.sql</code> in the Supabase SQL Editor, then refresh this page.</p>
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

      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4">
        <div className="glass-card p-3.5">
          <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-gray-500"><PiggyBank size={12} /> Total Saved</div>
          <p className="font-mono text-base md:text-xl font-bold text-white mt-2 truncate">{fmt(totals.saved)}</p>
          <p className="text-[10px] text-gray-600 mt-0.5">{baseCurrency} • across {activeGoals.length} active {activeGoals.length === 1 ? 'goal' : 'goals'}</p>
        </div>
        <div className="glass-card p-3.5">
          <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-gray-500"><Target size={12} /> Total Target</div>
          <p className="font-mono text-base md:text-xl font-bold text-gold-400 mt-2 truncate">{fmt(totals.target)}</p>
          <p className="text-[10px] text-gray-600 mt-0.5">{baseCurrency} • combined goal targets</p>
        </div>
        <div className="glass-card p-3.5 col-span-2 lg:col-span-1">
          <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-gray-500"><TrendingUp size={12} /> Overall Progress</div>
          <p className="font-mono text-base md:text-xl font-bold text-gold-400 mt-2 truncate">{totals.progress.toFixed(1)}%</p>
          <div className="h-2.5 bg-gray-800 rounded-full overflow-hidden mt-2">
            <div
              className="h-full bg-gradient-to-r from-gold-500 to-amber-400 rounded-full transition-all duration-500"
              style={{ width: `${Math.min(100, Math.max(0, totals.progress))}%` }}
            />
          </div>
        </div>
      </div>

      {/* Goals */}
      <div className="glass-card overflow-hidden">
        <div className="px-4 md:px-5 py-3.5 border-b border-gray-800/70 flex items-center justify-between gap-2.5">
          <p className="text-[10px] font-bold uppercase tracking-widest text-gray-500">Savings Goals ({activeGoals.length})</p>
          <p className="hidden lg:block text-[10px] text-gray-600">Saved = movements in − movements out</p>
        </div>

        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 p-4">{Array.from({ length: 3 }).map((_, i) => (<SkeletonCard key={i} />))}</div>
        ) : goals.length === 0 ? (
          <div className="p-10 text-center">
            <PiggyBank size={40} className="mx-auto text-gray-700 mb-3" />
            <p className="text-gray-400 font-bold">No savings goals yet</p>
            <p className="text-gray-600 text-sm mt-1">Create your first goal to start setting money aside.</p>
            <button onClick={() => openGoalForm(null)}
              className="mt-4 inline-flex items-center gap-2 bg-gradient-to-r from-gold-500 to-amber-400 text-black font-bold px-4 py-2 rounded-xl text-sm active:scale-95 transition-transform">
              <Plus size={16} /> Add Goal
            </button>
          </div>
        ) : activeGoals.length === 0 ? (
          <div className="p-10 text-center">
            <Archive size={40} className="mx-auto text-gray-700 mb-3" />
            <p className="text-gray-400 font-bold">All goals are archived</p>
            <p className="text-gray-600 text-sm mt-1">Restore a goal below or create a new one.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 p-4">
            {activeGoals.map(renderGoalCard)}
          </div>
        )}

        {/* Archived goals (hidden from list and summary cards) */}
        {!isLoading && archivedGoals.length > 0 && (
          <div className="border-t border-gray-800/70">
            <button
              onClick={() => setShowArchived((v) => !v)}
              className="w-full px-4 md:px-5 py-3 flex items-center justify-between gap-3 text-left"
              aria-expanded={showArchived}
            >
              <span className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-widest text-gray-500">
                <Archive size={13} />
                Archived ({archivedGoals.length})
              </span>
              <span className="text-gray-600">{showArchived ? <ChevronUp size={14} /> : <ChevronDown size={14} />}</span>
            </button>
            {showArchived && (
              <div className="px-4 md:px-5 pb-4 space-y-1.5">
                {archivedGoals.map((g) => (
                  <div key={g.id} className="flex items-center justify-between gap-3 bg-gray-900/50 border border-gray-800 rounded-lg px-3 py-2.5">
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-gray-300 truncate">{g.name}</p>
                      <p className="text-[10px] text-gray-600 font-mono">
                        saved {fmt(goalProgress(g).saved)} of {fmt(Number(g.target_amount))} {baseCurrency}
                      </p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <IconBtn title="Restore to list" onClick={() => handleRestoreGoal(g)} icon={<ArchiveRestore size={15} />} gold />
                      <IconBtn title="Delete permanently" onClick={() => handleDeleteGoal(g)} icon={<Trash2 size={15} />} danger />
                    </div>
                  </div>
                ))}
                <p className="text-[10px] text-gray-600">Archived goals are excluded from the summary cards but keep all their history.</p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ============ Modals ============ */}

      {/* New / edit goal */}
      <Modal isOpen={showGoalForm} onClose={() => setShowGoalForm(false)} title={editGoal ? 'Edit Savings Goal' : 'New Savings Goal'}>
        <div className="space-y-4">
          <div>
            <label className={labelCls}>Goal Name *</label>
            <input value={fName} onChange={(e) => setFName(e.target.value)} placeholder="e.g. Emergency Fund, New Car, Hajj Trip" className={inputCls} autoFocus />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Target Amount ({baseCurrency}) *</label>
              <input
                value={fTarget}
                onChange={(e) => setFTarget(e.target.value)}
                onBlur={() => setFTarget(fTarget ? String(evaluateMathExpression(fTarget)) : '')}
                placeholder="e.g. 25000 or 500*50"
                className={`${inputCls} font-mono`}
              />
            </div>
            <div>
              <label className={labelCls}>Target Date</label>
              <input type="date" value={fDate} onChange={(e) => setFDate(e.target.value)} className={inputCls} />
            </div>
          </div>
          <p className="text-[10px] text-gray-600 font-mono">Tip: math works here too — type 500*2 and blur.</p>
          <div>
            <label className={labelCls}>Note</label>
            <input value={fNote} onChange={(e) => setFNote(e.target.value)} placeholder="Optional" className={inputCls} />
          </div>
          {!editGoal && (
            <p className="text-[11px] text-gray-500 bg-gray-900/60 border border-gray-800 rounded-lg p-3">
              On creation, a dedicated asset sub-account (<span className="text-gold-400 font-bold">Goal: {fName.trim() || '…'}</span>) is added under the Assets class, and every save/withdrawal posts a transfer entry to the main ledger.
            </p>
          )}
          <button
            onClick={handleSaveGoal}
            disabled={isSaving || !fName.trim() || !fTarget.trim()}
            className="w-full bg-gradient-to-r from-gold-500 to-amber-400 text-black font-bold py-3 rounded-xl active:scale-95 transition-transform disabled:opacity-40"
          >
            {isSaving ? 'Saving...' : editGoal ? 'Save Changes' : 'Create Goal'}
          </button>
        </div>
      </Modal>

      {/* Add (save) / withdraw movement */}
      <Modal
        isOpen={showMovementForm}
        onClose={() => setShowMovementForm(false)}
        title={`${movementMode === 'in' ? 'Save to' : 'Withdraw from'} ${movementGoal?.name ?? ''}`}
      >
        <div className="space-y-4">
          <p className="text-xs text-gray-500 bg-gray-900/60 border border-gray-800 rounded-lg p-3">
            {movementMode === 'in' ? 'Records money saved into this goal' : 'Records money withdrawn from this goal'}
            {movementGoal?.gl_account_id
              ? ' and posts the matching transfer to the main ledger.'
              : '. No ledger account is linked to this goal, so nothing is posted to the main ledger.'}
          </p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Amount ({baseCurrency}) *</label>
              <input
                value={mAmount}
                onChange={(e) => setMAmount(e.target.value)}
                onBlur={() => setMAmount(mAmount ? String(evaluateMathExpression(mAmount)) : '')}
                placeholder="0.00"
                className={`${inputCls} font-mono`}
                autoFocus
              />
              {movementMode === 'out' && movementGoal && Number(evaluateMathExpression(mAmount || '0')) > goalProgress(movementGoal).saved && (
                <p className="text-[10px] text-amber-400 mt-1 flex items-center gap-1">
                  <AlertTriangle size={11} /> Exceeds the amount saved so far
                </p>
              )}
            </div>
            <div>
              <label className={labelCls}>Date</label>
              <input type="date" value={mDate} onChange={(e) => setMDate(e.target.value)} className={inputCls} />
            </div>
          </div>
          <div>
            <label className={labelCls}>Bank / Cash Account</label>
            <SearchableSelect options={bankOptions} value={mBankId} onChange={setMBankId} placeholder="Select bank..." />
            {!movementGoal?.gl_account_id && (
              <p className="text-[10px] text-gray-600 mt-1.5">
                No Chart-of-Accounts sub-account linked to this goal — the movement is tracked here only.
              </p>
            )}
          </div>
          <div>
            <label className={labelCls}>Note</label>
            <input value={mNote} onChange={(e) => setMNote(e.target.value)} placeholder="Optional" className={inputCls} />
          </div>
          <button
            onClick={handleSaveMovement}
            disabled={isSaving || !mAmount.trim()}
            className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-gold-500 to-amber-400 text-black font-bold py-3 rounded-xl active:scale-95 transition-transform disabled:opacity-40"
          >
            {movementMode === 'in' ? <ArrowDownToLine size={16} /> : <ArrowUpFromLine size={16} />}
            {isSaving ? 'Saving...' : movementMode === 'in' ? 'Record Save' : 'Record Withdrawal'}
          </button>
        </div>
      </Modal>

      {/* Movement history */}
      <Modal isOpen={!!historyGoal} onClose={() => setHistoryGoal(null)} title={`History — ${historyGoal?.name ?? ''}`}>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="bg-gray-900/60 border border-gray-800 rounded-lg px-3 py-2.5">
              <p className="text-[9px] uppercase tracking-widest text-gray-500 font-bold">Saved so far</p>
              <p className="font-mono font-bold text-gold-400 mt-0.5">
                {fmt(historyGoal ? goalProgress(historyGoal).saved : 0)} {baseCurrency}
              </p>
            </div>
            <div className="bg-gray-900/60 border border-gray-800 rounded-lg px-3 py-2.5">
              <p className="text-[9px] uppercase tracking-widest text-gray-500 font-bold">Movements</p>
              <p className="font-mono font-bold text-white mt-0.5">{historyRows.length}</p>
            </div>
          </div>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-2">Saves &amp; Withdrawals</p>
            {historyRows.length === 0 ? (
              <p className="text-xs text-gray-600">No movements yet — record your first save.</p>
            ) : (
              <div className="max-h-72 overflow-y-auto space-y-1 pr-1">
                {historyRows.map((m) => (
                  <div key={m.id} className="flex items-center justify-between bg-gray-900/60 border border-gray-800 rounded-lg px-3 py-2 text-sm">
                    <div className="min-w-0">
                      <span className={`text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded mr-2 ${m.direction === 'in' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-orange-500/10 text-orange-400'}`}>
                        {m.direction === 'in' ? 'save' : 'withdraw'}
                      </span>
                      <span className="text-gray-400 font-mono text-xs">{format(parseISO(m.flow_date), 'dd MMM yyyy')}</span>
                      {m.note && <span className="text-gray-600 text-xs ml-2 truncate">{m.note}</span>}
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <span className={`font-mono font-bold ${m.direction === 'in' ? 'text-emerald-400' : 'text-orange-400'}`}>
                        {m.direction === 'in' ? '+' : '−'}{fmt(Number(m.amount))}
                      </span>
                      <button onClick={() => handleDeleteMovement(m)} className="text-gray-600 hover:text-red-400 transition-colors">
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
            className="fixed bottom-[calc(5.75rem+env(safe-area-inset-bottom))] md:bottom-8 left-1/2 -translate-x-1/2 z-50 bg-gray-900 border border-gold-500/40 text-gold-300 text-sm font-bold px-5 py-3 rounded-xl shadow-2xl shadow-black/50"
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
    className={`flex items-center gap-1 px-3 py-2 min-h-[36px] rounded-lg text-[11px] font-bold border transition-colors active:scale-95 ${
      danger ? 'border-gray-800 text-gray-500 hover:text-red-400 hover:border-red-500/30'
      : gold ? 'border-gold-500/40 text-gold-400 hover:bg-gold-500/10'
      : 'border-gray-800 text-gray-400 hover:text-white hover:bg-gray-800'
    }`}
  >
    {icon}{label && <span>{label}</span>}
  </button>
);
