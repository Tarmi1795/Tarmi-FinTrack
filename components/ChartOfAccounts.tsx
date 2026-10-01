
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ChevronDown, ChevronRight, Search, Plus, MoreHorizontal, Pencil, Copy, Trash2,
  FileText, Download, Lock, Folder, Landmark, X, CheckSquare, Square, ArrowUpDown,
} from 'lucide-react';
import { useFinance } from '../context/FinanceContext';
import { buildAccountTree, AccountNode } from '../utils/accountHierarchy';
import { Account, AccountClass, AccountLevel } from '../types';
import { Modal } from './ui/Modal';
import { confirmDialog } from './ui/ConfirmDialog';
import { endOfDay, parseISO } from 'date-fns';

const CLASSES: AccountClass[] = ['Assets', 'Liabilities', 'Equity', 'Revenue', 'Expenses'];
const CREDIT_CLASSES: AccountClass[] = ['Liabilities', 'Equity', 'Revenue'];

type KindFilter = 'all' | 'group' | 'posting';
type StatusFilter = 'all' | 'system' | 'custom';
type SortKey = 'code' | 'name' | 'balance';

interface FlatRow {
  node: AccountNode;
  depth: number;
  hasChildren: boolean;
  isGroup: boolean;
}

const fmtBal = (v: number) =>
  v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Next available code under a parent, following the app's step convention. */
function nextCode(accounts: Account[], parent: Account | undefined): string {
  const siblings = accounts.filter(a => (parent ? a.parentId === parent.id : !a.parentId));
  const nums = siblings.map(a => parseInt(a.code, 10)).filter(n => !isNaN(n));
  const max = nums.length ? Math.max(...nums) : 0;
  const step = parent ? (parent.level === 'class' ? 1000 : parent.level === 'group' ? 10 : 10) : 10000;
  const next = max + step;
  const width = parent ? parent.code.length : 5;
  return String(next).padStart(width, '0').slice(0, Math.max(width, String(next).length));
}

export const ChartOfAccounts: React.FC = () => {
  const { state, dispatch, user } = useFinance();
  const navigate = useNavigate();

  // --- view state ---
  const [search, setSearch] = useState('');
  const [classFilter, setClassFilter] = useState<'all' | AccountClass>('all');
  const [kindFilter, setKindFilter] = useState<KindFilter>('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [sortKey, setSortKey] = useState<SortKey>('code');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [dupSource, setDupSource] = useState<Account | null>(null);
  const [editTarget, setEditTarget] = useState<Account | null>(null);

  // --- form state ---
  const [fName, setFName] = useState('');
  const [fDesc, setFDesc] = useState('');
  const [fLevel, setFLevel] = useState<AccountLevel>('gl');
  const [fParent, setFParent] = useState('');
  const [fCode, setFCode] = useState('');
  const [fClass, setFClass] = useState<AccountClass>('Expenses');
  const [saving, setSaving] = useState(false);

  const menuRef = useRef<HTMLDivElement>(null);
  const baseCurrency = state.businessProfile.baseCurrency || 'QAR';

  // --- tree ---
  const accountTree = useMemo(() => {
    const todayEnd = endOfDay(new Date());
    const txs = state.transactions.filter(t => parseISO(t.date) <= todayEnd);
    return buildAccountTree(state.accounts, txs);
  }, [state.accounts, state.transactions]);

  // Default expansion: classes + their immediate children (groups)
  const ensureDefaultExpanded = useCallback(() => {
    setExpanded(prev => {
      if (prev.size > 0) return prev;
      const next = new Set<string>();
      state.accounts.forEach(a => { if (a.level === 'class' || a.level === 'group') next.add(a.id); });
      return next;
    });
  }, [state.accounts]);
  useEffect(() => { ensureDefaultExpanded(); }, [ensureDefaultExpanded]);

  const expandAll = () => setExpanded(new Set(state.accounts.map(a => a.id)));
  const collapseAll = () => setExpanded(new Set(state.accounts.filter(a => a.level === 'class').map(a => a.id)));

  const toggleNode = (id: string) => setExpanded(prev => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });

  // --- filtering (bottom-up match so parents of matches stay visible) ---
  const matchesFilters = useCallback((a: AccountNode): boolean => {
    const q = search.trim().toLowerCase();
    if (q && !(a.name.toLowerCase().includes(q) || a.code.includes(q) || (a.description || '').toLowerCase().includes(q))) return false;
    if (kindFilter === 'group' && !(a.level === 'group' || a.level === 'class')) return false;
    if (kindFilter === 'posting' && !a.isPosting) return false;
    if (statusFilter === 'system' && !a.isSystem) return false;
    if (statusFilter === 'custom' && a.isSystem) return false;
    return true;
  }, [search, kindFilter, statusFilter]);

  const filterTree = (nodes: AccountNode[]): AccountNode[] => {
    return nodes.map(node => {
      const childMatches = filterTree(node.children || []);
      const self = matchesFilters(node);
      if (!self && childMatches.length === 0) return null;
      return { ...node, children: childMatches };
    }).filter((n): n is AccountNode => n !== null);
  };

  const sortSiblings = (nodes: AccountNode[]): AccountNode[] => {
    const sorted = [...nodes].sort((a, b) => {
      switch (sortKey) {
        case 'name': return a.name.localeCompare(b.name);
        case 'balance': return a.totalBalance - b.totalBalance;
        default: return a.code.localeCompare(b.code);
      }
    });
    return sortDir === 'asc' ? sorted : sorted.reverse();
  };

  // --- flatten visible rows (respecting expansion) ---
  const sections = useMemo(() => {
    const out: Array<{ cls: AccountClass; total: number; rows: FlatRow[] }> = [];
    for (const cls of CLASSES) {
      if (classFilter !== 'all' && classFilter !== cls) continue;
      let roots = accountTree[cls] || [];
      if (search.trim() || kindFilter !== 'all' || statusFilter !== 'all') roots = filterTree(roots);
      roots = sortSiblings(roots);

      const rows: FlatRow[] = [];
      const walk = (nodes: AccountNode[], depth: number) => {
        for (const node of nodes) {
          rows.push({ node, depth, hasChildren: (node.children || []).length > 0, isGroup: node.level === 'class' || node.level === 'group' });
          if ((node.children || []).length > 0 && expanded.has(node.id)) {
            walk(sortSiblings(node.children || []), depth + 1);
          }
        }
      };
      walk(roots, 0);
      if (rows.length === 0 && classFilter !== cls) continue;
      const total = roots.reduce((s, r) => s + r.totalBalance, 0);
      out.push({ cls, total, rows });
    }
    return out;
  }, [accountTree, classFilter, search, kindFilter, statusFilter, sortKey, sortDir, expanded]);

  const visibleCount = sections.reduce((s, sec) => s + sec.rows.length, 0);
  const totalCount = state.accounts.length;

  // --- selection ---
  const toggleSelect = (id: string) => setSelected(prev => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });
  const allVisibleIds = sections.flatMap(s => s.rows.map(r => r.node.id));
  const allVisibleSelected = allVisibleIds.length > 0 && allVisibleIds.every(id => selected.has(id));
  const toggleSelectAll = () => {
    if (allVisibleSelected) setSelected(new Set());
    else setSelected(new Set(allVisibleIds));
  };
  const clearSelection = () => setSelected(new Set());

  // --- actions ---
  const openAdd = (source?: Account | null) => {
    const src = source || null;
    setDupSource(src);
    setEditTarget(null);
    const parent = src ? state.accounts.find(a => a.id === src.parentId) : undefined;
    const cls = src?.class || fClass;
    setFClass(cls);
    setFLevel(src?.level === 'sub_ledger' ? 'sub_ledger' : src?.level === 'group' ? 'group' : 'gl');
    setFParent(src?.parentId || '');
    setFName(src ? `${src.name} (copy)` : '');
    setFDesc(src?.description || '');
    setFCode(nextCode(state.accounts, parent));
    setShowAdd(true);
  };

  const openEdit = (acc: Account) => {
    setEditTarget(acc);
    setDupSource(null);
    setFClass(acc.class);
    setFName(acc.name);
    setFDesc(acc.description || '');
    setShowAdd(true);
  };

  const closeModal = () => { setShowAdd(false); setEditTarget(null); setDupSource(null); };

  const handleSaveAccount = async () => {
    if (!fName.trim()) return;
    setSaving(true);
    try {
      if (editTarget) {
        const orig = state.accounts.find(a => a.id === editTarget.id);
        if (orig) dispatch({ type: 'UPDATE_ACCOUNT', payload: { ...orig, name: fName.trim(), description: fDesc.trim() || undefined } });
      } else {
        const parent = state.accounts.find(a => a.id === fParent);
        const cls = parent ? parent.class : fClass;
        let normalBalance: 'debit' | 'credit' = CREDIT_CLASSES.includes(cls) ? 'credit' : 'debit';
        dispatch({
          type: 'ADD_ACCOUNT',
          payload: {
            id: Math.random().toString(36).slice(2, 11),
            name: fName.trim(),
            class: cls,
            code: fCode.trim(),
            level: fLevel,
            parentId: fParent || undefined,
            normalBalance,
            isPosting: fLevel === 'gl' || fLevel === 'sub_ledger',
            description: fDesc.trim() || undefined,
          },
        });
      }
      closeModal();
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteAccount = async (acc: Account) => {
    const hasChildren = state.accounts.some(a => a.parentId === acc.id);
    if (hasChildren || acc.isSystem) return;
    const hasActivity = state.transactions.some(t => t.accountId === acc.id || t.paymentAccountId === acc.id);
    const ok = await confirmDialog({
      title: `Delete ${acc.code} — ${acc.name}?`,
      message: hasActivity
        ? 'This account has transaction activity. Deleting it will remove those postings from the ledger.'
        : 'This account has no activity and will be removed.',
      confirmLabel: 'Delete',
      danger: true,
    });
    if (!ok) return;
    dispatch({ type: 'DELETE_ACCOUNT', payload: acc.id });
    setSelected(prev => { const n = new Set(prev); n.delete(acc.id); return n; });
  };

  const handleBulkDelete = async () => {
    const eligible = state.accounts.filter(a => selected.has(a.id) && !a.isSystem && !state.accounts.some(c => c.parentId === a.id));
    if (eligible.length === 0) return;
    const ok = await confirmDialog({
      title: `Delete ${eligible.length} account${eligible.length > 1 ? 's' : ''}?`,
      message: 'Only custom accounts without sub-accounts are deleted. Accounts with transactions will remove their postings.',
      confirmLabel: 'Delete',
      danger: true,
    });
    if (!ok) return;
    eligible.forEach(a => dispatch({ type: 'DELETE_ACCOUNT', payload: a.id }));
    clearSelection();
  };

  const exportCsv = () => {
    const ids = selected.size > 0 ? selected : null;
    const rowsSrc: Array<{ a: Account; balance: number }> = [];
    const collect = (nodes: AccountNode[]) => nodes.forEach(n => {
      if (!ids || ids.has(n.id)) rowsSrc.push({ a: n, balance: n.totalBalance });
      collect(n.children || []);
    });
    for (const cls of CLASSES) collect(accountTree[cls]);
    const header = 'Code,Name,Class,Level,Type,Currency,Balance,Status,Description';
    const lines = rowsSrc.map(({ a, balance }) =>
      [a.code, `"${a.name.replace(/"/g, '""')}"`, a.class, a.level, a.isPosting ? 'Posting' : 'Group', baseCurrency, balance.toFixed(2), a.isSystem ? 'System' : 'Custom', `"${(a.description || '').replace(/"/g, '""')}"`].join(',')
    );
    const blob = new Blob([header + '\n' + lines.join('\n')], { type: 'text/csv;charset=utf-8' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `chart-of-accounts_${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
  };

  const duplicateFrom = (acc: Account) => { setMenuFor(null); openAdd(acc); };

  const goToLedger = (id: string) => { setMenuFor(null); navigate('/reports', { state: { tab: 'soa', accountId: id } }); };

  // close the ••• menu on outside click / Escape
  useEffect(() => {
    if (!menuFor) return;
    const onDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuFor(null);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setMenuFor(null); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [menuFor]);

  const balanceCls = (node: AccountNode) => {
    if (Math.abs(node.totalBalance) < 0.01) return 'text-gray-500';
    const normalNegative = CREDIT_CLASSES.includes(node.class) ? node.totalBalance > 0 : node.totalBalance < 0;
    return normalNegative ? 'text-red-400' : 'text-gray-100';
  };

  const typeChip = (node: AccountNode) => {
    if (node.level === 'class' || node.level === 'group')
      return <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-gray-500"><Folder size={10} /> Group</span>;
    if (node.level === 'sub_ledger')
      return <span className="text-[10px] font-semibold uppercase tracking-wider text-sky-400/80">Sub-ledger</span>;
    return <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">GL</span>;
  };

  const sortButton = (key: SortKey, label: string, align: 'left' | 'right' = 'left') => (
    <button
      onClick={() => { setSortKey(key); setSortDir(d => (sortKey === key && d === 'asc' ? 'desc' : 'asc')); }}
      className={`inline-flex items-center gap-1 ${align === 'right' ? 'ml-auto' : ''} uppercase tracking-[0.08em] text-gray-500 hover:text-gray-300 transition-colors`}
    >
      {label}
      <ArrowUpDown size={10} className={sortKey === key ? 'text-gold-500/80' : 'opacity-40'} />
    </button>
  );

  const parentOptions = state.accounts
    .filter(a => a.level === 'class' || a.level === 'group' || a.class === fClass)
    .sort((a, b) => a.code.localeCompare(b.code))
    .map(a => ({ id: a.id, label: `${a.code} — ${a.name}`, subLabel: a.level }));

  const renderMenu = (acc: Account) => (
    <div ref={menuFor === acc.id ? menuRef : undefined} className="absolute right-0 top-8 z-30 w-48 bg-gray-900 border border-gray-700/80 rounded-lg shadow-2xl py-1 animate-fade-in">
      {[
        { icon: FileText, label: 'View ledger', run: () => goToLedger(acc.id), show: true },
        { icon: Pencil, label: 'Edit name / notes', run: () => { setMenuFor(null); openEdit(acc); }, show: true },
        { icon: Copy, label: 'Duplicate', run: () => duplicateFrom(acc), show: true },
        { icon: Trash2, label: 'Delete', run: () => { setMenuFor(null); handleDeleteAccount(acc); }, show: !acc.isSystem && !state.accounts.some(c => c.parentId === acc.id), danger: true },
      ].filter(m => m.show).map(m => (
        <button
          key={m.label}
          onClick={m.run}
          className={`w-full flex items-center gap-2.5 px-3 py-2 text-xs font-medium transition-colors ${m.danger ? 'text-red-400 hover:bg-red-500/10' : 'text-gray-300 hover:bg-gray-800'}`}
        >
          <m.icon size={13} /> {m.label}
        </button>
      ))}
    </div>
  );

  return (
    <div className="space-y-3">
      {/* ============ Page header ============ */}
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-white tracking-tight">Chart of Accounts</h2>
          <p className="text-xs text-gray-500 mt-0.5">Manage the account structure used across your financial records.</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={expandAll}
            className="px-2.5 py-1.5 text-[11px] font-semibold text-gray-400 hover:text-gray-200 border border-gray-800 rounded-md transition-colors"
          >
            Expand all
          </button>
          <button
            onClick={collapseAll}
            className="px-2.5 py-1.5 text-[11px] font-semibold text-gray-400 hover:text-gray-200 border border-gray-800 rounded-md transition-colors"
          >
            Collapse all
          </button>
          <button
            onClick={exportCsv}
            className="flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] font-semibold text-gray-400 hover:text-gray-200 border border-gray-800 rounded-md transition-colors"
          >
            <Download size={11} /> Export CSV
          </button>
          <button
            onClick={() => openAdd(null)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-gold-500 hover:bg-gold-400 text-black text-[11px] font-bold rounded-md transition-colors active:scale-[0.98]"
          >
            <Plus size={12} strokeWidth={2.5} /> Add Account
          </button>
        </div>
      </div>

      {/* ============ Toolbar: search + filters ============ */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-2 bg-gray-900/80 border border-gray-800 rounded-md px-2.5 py-1.5 w-full sm:w-64 focus-within:border-gray-600 transition-colors">
          <Search size={13} className="text-gray-600 shrink-0" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search code, name, description…"
            className="w-full bg-transparent text-xs text-white outline-none placeholder-gray-600"
          />
          {search && <button onClick={() => setSearch('')} className="text-gray-600 hover:text-gray-300"><X size={12} /></button>}
        </div>

        <select
          value={classFilter}
          onChange={(e) => setClassFilter(e.target.value as 'all' | AccountClass)}
          className="bg-gray-900/80 border border-gray-800 rounded-md px-2 py-1.5 text-[11px] font-medium text-gray-300 outline-none focus:border-gray-600"
          aria-label="Filter by account type"
        >
          <option value="all">All types</option>
          {CLASSES.map(c => <option key={c} value={c}>{c}</option>)}
        </select>

        <select
          value={kindFilter}
          onChange={(e) => setKindFilter(e.target.value as KindFilter)}
          className="bg-gray-900/80 border border-gray-800 rounded-md px-2 py-1.5 text-[11px] font-medium text-gray-300 outline-none focus:border-gray-600"
          aria-label="Filter by account kind"
        >
          <option value="all">Groups &amp; posting</option>
          <option value="group">Groups only</option>
          <option value="posting">Posting only</option>
        </select>

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
          className="bg-gray-900/80 border border-gray-800 rounded-md px-2 py-1.5 text-[11px] font-medium text-gray-300 outline-none focus:border-gray-600"
          aria-label="Filter by status"
        >
          <option value="all">Any status</option>
          <option value="system">System</option>
          <option value="custom">Custom</option>
        </select>

        <span className="ml-auto text-[11px] text-gray-600 font-mono">
          {visibleCount === totalCount ? `${totalCount} accounts` : `${visibleCount} of ${totalCount}`}
        </span>
      </div>

      {/* ============ Bulk action bar ============ */}
      {selected.size > 0 && (
        <div className="flex items-center gap-3 bg-gray-900/90 border border-gray-700/80 rounded-md px-3 py-2 animate-fade-in">
          <span className="text-xs font-semibold text-gray-300">{selected.size} selected</span>
          <button onClick={exportCsv} className="flex items-center gap-1.5 text-[11px] font-semibold text-gray-300 hover:text-white transition-colors">
            <Download size={11} /> Export selected
          </button>
          <button
            onClick={handleBulkDelete}
            className="flex items-center gap-1.5 text-[11px] font-semibold text-red-400 hover:text-red-300 transition-colors"
          >
            <Trash2 size={11} /> Delete selected
          </button>
          <button onClick={clearSelection} className="ml-auto text-gray-500 hover:text-gray-300"><X size={13} /></button>
        </div>
      )}

      {/* ============ The tree-table ============ */}
      <div className="border border-gray-800 rounded-lg overflow-hidden bg-gray-950/40">
        <div className="overflow-x-auto">
          <div className="min-w-[860px]">
            {/* Header */}
            <div className="sticky top-0 z-20 grid grid-cols-[36px_88px_minmax(0,1fr)_110px_72px_130px_96px_40px] items-center gap-2 px-3 h-10 bg-[#141210] border-b border-gray-800 text-[10px] font-bold">
              <button onClick={toggleSelectAll} className="text-gray-500 hover:text-gray-300 flex justify-center" aria-label="Select all visible">
                {allVisibleSelected ? <CheckSquare size={13} className="text-gold-500" /> : <Square size={13} />}
              </button>
              <div>{sortButton('code', 'Code')}</div>
              <div>{sortButton('name', 'Account')}</div>
              <div className="uppercase">Type</div>
              <div className="uppercase text-center">Currency</div>
              <div className="flex justify-end">{sortButton('balance', 'Balance', 'right')}</div>
              <div className="uppercase text-center">Status</div>
              <div />
            </div>

            {/* Sections */}
            {sections.map(sec => (
              <div key={sec.cls}>
                {/* Class sub-header */}
                <div className="sticky top-10 z-10 flex items-center justify-between px-3 py-1.5 bg-[#181512] border-b border-gray-800/80">
                  <button
                    onClick={() => toggleNode(sec.rows[0]?.node.parentId || sec.rows[0]?.node.id || sec.cls)}
                    className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.12em] text-gray-400 hover:text-gray-200 transition-colors"
                  >
                    <Landmark size={11} className="text-gold-600/70" />
                    {sec.cls}
                  </button>
                  <span className={`font-mono text-[11px] font-semibold ${(() => {
                    if (Math.abs(sec.total) < 0.01) return 'text-gray-500';
                    const normalNegative = CREDIT_CLASSES.includes(sec.cls) ? sec.total > 0 : sec.total < 0;
                    return normalNegative ? 'text-red-400' : 'text-gray-100';
                  })()}`}>
                    {fmtBal(sec.total)} {baseCurrency}
                  </span>
                </div>

                {sec.rows.length === 0 ? (
                  <div className="px-3 py-6 text-center text-xs text-gray-600">No accounts match the current filters.</div>
                ) : (
                  sec.rows.map(({ node, depth, hasChildren }) => {
                    const isSelected = selected.has(node.id);
                    const isOpen = expanded.has(node.id);
                    return (
                      <div
                        key={node.id}
                        className={`group grid grid-cols-[36px_88px_minmax(0,1fr)_110px_72px_130px_96px_40px] items-center gap-2 px-3 min-h-[38px] border-b border-gray-900/80 transition-colors ${
                          isSelected ? 'bg-gold-500/[0.06]' : 'hover:bg-gray-900/60'
                        }`}
                      >
                        {/* select */}
                        <button onClick={() => toggleSelect(node.id)} className="flex justify-center text-gray-600 hover:text-gray-300" aria-label={`Select ${node.name}`}>
                          {isSelected ? <CheckSquare size={13} className="text-gold-500" /> : <Square size={13} className="opacity-0 group-hover:opacity-60 transition-opacity" />}
                        </button>

                        {/* code */}
                        <span className="font-mono text-[11px] text-gray-500">{node.code}</span>

                        {/* name + description, with hierarchy guides */}
                        <div
                          className="flex items-center min-w-0"
                          style={{ paddingLeft: depth * 18 }}
                        >
                          <div className="flex items-center gap-1.5 min-w-0">
                            {hasChildren ? (
                              <button
                                onClick={() => toggleNode(node.id)}
                                className="p-0.5 text-gray-500 hover:text-white transition-colors rounded focus:outline-none focus-visible:ring-1 focus-visible:ring-gold-500/60"
                                aria-expanded={isOpen}
                                aria-label={`${isOpen ? 'Collapse' : 'Expand'} ${node.name}`}
                              >
                                {isOpen ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                              </button>
                            ) : (
                              <span className="w-[18px] flex justify-center">
                                {node.isPosting && <span className="w-1 h-1 rounded-full bg-gray-600" />}
                              </span>
                            )}
                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                <span className={`text-[13px] truncate ${node.level === 'class' || node.level === 'group' ? 'font-semibold text-gray-200' : 'text-gray-300'}`}>
                                  {node.name}
                                </span>
                                {node.isSystem && <Lock size={9} className="text-gray-600 shrink-0" />}
                              </div>
                              {node.description && (
                                <p className="text-[10px] text-gray-600 truncate">{node.description}</p>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* type */}
                        <div>{typeChip(node)}</div>

                        {/* currency */}
                        <div className="text-center font-mono text-[11px] text-gray-600">
                          {node.isPosting ? baseCurrency : <span className="opacity-40">—</span>}
                        </div>

                        {/* balance */}
                        <div className={`text-right font-mono text-[12px] tabular-nums ${balanceCls(node)}`}>
                          {node.isPosting || hasChildren ? fmtBal(node.totalBalance) : '—'}
                        </div>

                        {/* status */}
                        <div className="flex justify-center">
                          <span className={`text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded border ${
                            node.isSystem ? 'border-gray-800 text-gray-600' : 'border-gray-700/70 text-gray-400'
                          }`}>
                            {node.isSystem ? 'System' : 'Custom'}
                          </span>
                        </div>

                        {/* actions */}
                        <div className="relative flex justify-end">
                          <button
                            onClick={() => setMenuFor(menuFor === node.id ? null : node.id)}
                            className={`p-1.5 rounded-md text-gray-600 hover:text-gray-200 hover:bg-gray-800 transition-all ${
                              menuFor === node.id ? 'opacity-100 text-gray-200 bg-gray-800' : 'opacity-0 group-hover:opacity-100'
                            }`}
                            aria-label={`Actions for ${node.name}`}
                            aria-haspopup="menu"
                          >
                            <MoreHorizontal size={14} />
                          </button>
                          {menuFor === node.id && renderMenu(node)}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            ))}

            {/* Empty state */}
            {visibleCount === 0 && (
              <div className="py-16 text-center">
                <Landmark size={28} className="mx-auto text-gray-700 mb-3" />
                <p className="text-sm font-semibold text-gray-400">No accounts found</p>
                <p className="text-xs text-gray-600 mt-1">
                  {search || kindFilter !== 'all' || statusFilter !== 'all'
                    ? 'Try clearing the search or filters.'
                    : 'Add your first account to begin structuring your books.'}
                </p>
                {(search || kindFilter !== 'all' || statusFilter !== 'all' || classFilter !== 'all') && (
                  <button
                    onClick={() => { setSearch(''); setKindFilter('all'); setStatusFilter('all'); setClassFilter('all'); }}
                    className="mt-4 px-3 py-1.5 text-xs font-semibold text-gold-400 border border-gold-500/30 rounded-md hover:bg-gold-500/10 transition-colors"
                  >
                    Clear filters
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ============ Add / Edit modal ============ */}
      <Modal isOpen={showAdd} onClose={closeModal} title={editTarget ? `Edit — ${editTarget.code}` : 'Add Account'}>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-1.5">Account type</label>
              <select
                value={fClass}
                disabled={!!editTarget}
                onChange={(e) => { setFClass(e.target.value as AccountClass); setFParent(''); setFCode(nextCode(state.accounts, undefined)); }}
                className="w-full bg-gray-900/70 border border-gray-700 rounded-lg px-3 py-2.5 text-sm text-white outline-none focus:border-gold-500 disabled:opacity-50"
              >
                {CLASSES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-1.5">Level</label>
              <select
                value={fLevel}
                disabled={!!editTarget}
                onChange={(e) => setFLevel(e.target.value as AccountLevel)}
                className="w-full bg-gray-900/70 border border-gray-700 rounded-lg px-3 py-2.5 text-sm text-white outline-none focus:border-gold-500 disabled:opacity-50"
              >
                <option value="gl">GL account (posting)</option>
                <option value="sub_ledger">Sub-ledger (posting)</option>
                <option value="group">Group (header)</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-1.5">Parent account</label>
            <select
              value={fParent}
              disabled={!!editTarget}
              onChange={(e) => {
                setFParent(e.target.value);
                const parent = state.accounts.find(a => a.id === e.target.value);
                if (parent) { setFClass(parent.class); setFCode(nextCode(state.accounts, parent)); }
              }}
              className="w-full bg-gray-900/70 border border-gray-700 rounded-lg px-3 py-2.5 text-sm text-white outline-none focus:border-gold-500 disabled:opacity-50"
            >
              <option value="">(None / root of {fClass})</option>
              {parentOptions.map(a => <option key={a.id} value={a.id}>{a.label}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-[120px_1fr] gap-3">
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-1.5">Code</label>
              <input
                value={fCode}
                disabled={!!editTarget}
                onChange={(e) => setFCode(e.target.value)}
                className="w-full bg-gray-900/70 border border-gray-700 rounded-lg px-3 py-2.5 text-sm text-white font-mono outline-none focus:border-gold-500 disabled:opacity-50"
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-1.5">Account name *</label>
              <input
                value={fName}
                onChange={(e) => setFName(e.target.value)}
                placeholder="e.g. Advertising Expense"
                className="w-full bg-gray-900/70 border border-gray-700 rounded-lg px-3 py-2.5 text-sm text-white outline-none focus:border-gold-500"
                autoFocus={!editTarget}
              />
            </div>
          </div>
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-1.5">Description</label>
            <input
              value={fDesc}
              onChange={(e) => setFDesc(e.target.value)}
              placeholder="What is this account for? (used by you and AI_riane)"
              className="w-full bg-gray-900/70 border border-gray-700 rounded-lg px-3 py-2.5 text-sm text-white outline-none focus:border-gold-500"
            />
          </div>
          <div className="flex items-center justify-between pt-1">
            <p className="text-[10px] text-gray-600">
              {editTarget
                ? 'Only the name and description can be edited — code, type and parent are structural.'
                : `Posts to ${fLevel === 'group' ? 'nowhere (header account)' : 'the ledger'} · normal balance ${CREDIT_CLASSES.includes(fClass) ? 'credit' : 'debit'} · ${baseCurrency}`}
            </p>
            <div className="flex gap-2">
              <button onClick={closeModal} className="px-4 py-2 text-xs font-semibold text-gray-400 hover:text-white transition-colors">Cancel</button>
              <button
                onClick={handleSaveAccount}
                disabled={saving || !fName.trim()}
                className="px-4 py-2 bg-gold-500 hover:bg-gold-400 text-black text-xs font-bold rounded-md transition-colors active:scale-[0.98] disabled:opacity-40"
              >
                {saving ? 'Saving…' : editTarget ? 'Save changes' : 'Add account'}
              </button>
            </div>
          </div>
        </div>
      </Modal>
    </div>
  );
};
