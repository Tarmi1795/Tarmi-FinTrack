import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Search, Plus, Wallet, Users, History, LayoutDashboard, Target, Flag, FileText,
  Receipt, ArrowDownToLine, ArrowRightLeft, Monitor, BookOpen, PieChart, Coins,
  Calculator, CandlestickChart, Package, Settings as SettingsIcon,
} from 'lucide-react';
import { useFinance } from '../context/FinanceContext';

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
  onQuickAdd: () => void;
}

type PaletteSection = 'Actions' | 'Navigation' | 'Accounts' | 'Parties' | 'Recent Transactions';

interface PaletteItem {
  id: string;
  section: PaletteSection;
  label: string;
  sublabel?: string;
  icon: React.ElementType;
  run: () => void;
}

const SECTION_ORDER: PaletteSection[] = [
  'Actions', 'Navigation', 'Accounts', 'Parties', 'Recent Transactions',
];

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

const fmtAmount = (n: number) =>
  n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const CommandPalette: React.FC<CommandPaletteProps> = ({ open, onClose, onQuickAdd }) => {
  const { state } = useFinance();
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Reset search state and focus the input every time the palette opens
  useEffect(() => {
    if (open) {
      setQuery('');
      setActiveIndex(0);
      // Defer so the input exists in the DOM before focusing
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  const allItems = useMemo<PaletteItem[]>(() => {
    const items: PaletteItem[] = [];

    // --- Actions ---
    items.push(
      {
        id: 'action-quick-add',
        section: 'Actions',
        label: 'Open Quick Add',
        sublabel: 'New transaction',
        icon: Plus,
        run: onQuickAdd,
      },
      {
        id: 'action-new-invoice',
        section: 'Actions',
        label: 'New Invoice',
        sublabel: 'Invoices',
        icon: FileText,
        run: () => { onClose(); navigate('/invoices'); },
      },
      {
        id: 'action-new-bill',
        section: 'Actions',
        label: 'New Bill',
        sublabel: 'AP / AR',
        icon: Receipt,
        run: () => { onClose(); navigate('/apar', { state: { openMode: 'payable', openSubMode: 'bill' } }); },
      },
      {
        id: 'action-record-deposit',
        section: 'Actions',
        label: 'Record Deposit',
        sublabel: 'Trading',
        icon: ArrowDownToLine,
        run: () => { onClose(); navigate('/trading'); },
      },
      {
        id: 'action-money-count',
        section: 'Actions',
        label: 'Update Money Count',
        sublabel: 'Money Counter',
        icon: Calculator,
        run: () => { onClose(); navigate('/money-counter'); },
      },
    );

    // --- Navigation ---
    const navDestinations: Array<{ label: string; to: string; icon: React.ElementType }> = [
      { label: 'Dashboard', to: '/', icon: LayoutDashboard },
      { label: 'Budget', to: '/budget', icon: Target },
      { label: 'AP / AR', to: '/apar', icon: ArrowRightLeft },
      { label: 'Invoices', to: '/invoices', icon: FileText },
      { label: 'Goals', to: '/goals', icon: Flag },
      { label: 'Assets', to: '/assets', icon: Monitor },
      { label: 'Journal', to: '/journal', icon: BookOpen },
      { label: 'Reports', to: '/reports', icon: PieChart },
      { label: 'Money Counter', to: '/money-counter', icon: Coins },
      { label: 'Trading', to: '/trading', icon: CandlestickChart },
      { label: 'Inventory', to: '/inventory', icon: Package },
      { label: 'Settings', to: '/settings', icon: SettingsIcon },
    ];
    navDestinations.forEach(d => {
      items.push({
        id: `nav-${d.to}`,
        section: 'Navigation',
        label: d.label,
        sublabel: d.to,
        icon: d.icon,
        run: () => { onClose(); navigate(d.to); },
      });
    });

    // --- Accounts (posting only) → Statement of Account in Reports ---
    state.accounts
      .filter(a => a.isPosting)
      .forEach(a => {
        items.push({
          id: `account-${a.id}`,
          section: 'Accounts',
          label: a.name,
          sublabel: a.code,
          icon: Wallet,
          run: () => { onClose(); navigate('/reports', { state: { tab: 'soa', accountId: a.id } }); },
        });
      });

    // --- Parties → Settings > Parties ---
    state.parties.forEach(p => {
      items.push({
        id: `party-${p.id}`,
        section: 'Parties',
        label: p.name,
        sublabel: p.type,
        icon: Users,
        run: () => { onClose(); navigate('/settings', { state: { tab: 'parties' } }); },
      });
    });

    // --- Recent Transactions (last 15 by date) → Journal ---
    [...state.transactions]
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, 15)
      .forEach(t => {
        const note = t.note?.trim() || t.type.charAt(0).toUpperCase() + t.type.slice(1);
        const sign = t.type === 'income' ? '+' : t.type === 'expense' ? '-' : '';
        items.push({
          id: `tx-${t.id}`,
          section: 'Recent Transactions',
          label: note,
          sublabel: `${sign}${fmtAmount(Math.abs(t.amount))} · ${fmtDate(t.date)}`,
          icon: History,
          run: () => { onClose(); navigate('/journal'); },
        });
      });

    return items;
  }, [state.accounts, state.parties, state.transactions, navigate, onClose, onQuickAdd]);

  // Filter (case-insensitive substring across label + sublabel).
  // Empty query shows only Actions + Navigation.
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return allItems
      .filter(item => {
        if (!q) return item.section === 'Actions' || item.section === 'Navigation';
        return `${item.label} ${item.sublabel ?? ''}`.toLowerCase().includes(q);
      })
      .slice(0, 12);
  }, [allItems, query]);

  // Keep the highlight within bounds as the list changes
  useEffect(() => {
    setActiveIndex(i => Math.min(i, Math.max(0, visible.length - 1)));
  }, [visible.length]);

  // Scroll the active row into view
  useEffect(() => {
    const row = listRef.current?.querySelector<HTMLElement>(`[data-index="${activeIndex}"]`);
    row?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex]);

  if (!open) return null;

  const runItem = (item?: PaletteItem) => {
    if (!item) return;
    item.run();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (visible.length > 0) setActiveIndex(i => (i + 1) % visible.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (visible.length > 0) setActiveIndex(i => (i - 1 + visible.length) % visible.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      runItem(visible[activeIndex]);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      onClose();
    }
  };

  // Group the (capped) visible rows by section, preserving order
  const grouped = SECTION_ORDER
    .map(section => ({
      section,
      items: visible.filter(v => v.section === section),
    }))
    .filter(g => g.items.length > 0);

  let flatIndex = -1;

  return (
    <div className="fixed inset-0 z-[80]" role="dialog" aria-modal="true" aria-label="Command palette">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />

      {/* Panel */}
      <div className="relative mx-auto mt-20 w-[calc(100%-2rem)] max-w-lg bg-gray-900 border border-gray-800 rounded-2xl shadow-2xl overflow-hidden">
        {/* Search input */}
        <div className="flex items-center gap-3 px-4 border-b border-gray-800">
          <Search size={18} className="text-gold-400/80 shrink-0" />
          <input
            ref={inputRef}
            autoFocus
            value={query}
            onChange={e => { setQuery(e.target.value); setActiveIndex(0); }}
            onKeyDown={handleKeyDown}
            placeholder="Search commands, accounts, parties…"
            className="w-full bg-transparent py-4 text-sm text-gray-100 placeholder-gray-500 outline-none"
          />
          <kbd className="shrink-0 text-[10px] font-mono px-1.5 py-0.5 rounded border border-gray-700 bg-gray-800 text-gray-500">
            Esc
          </kbd>
        </div>

        {/* Results */}
        <div ref={listRef} className="max-h-[60vh] overflow-y-auto no-scrollbar py-2">
          {grouped.length === 0 ? (
            <div className="px-4 py-10 text-center text-sm text-gray-500">
              No results for &ldquo;{query}&rdquo;
            </div>
          ) : (
            grouped.map(group => (
              <div key={group.section}>
                <div className="px-4 pt-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-gold-400/60">
                  {group.section}
                </div>
                {group.items.map(item => {
                  flatIndex += 1;
                  const idx = flatIndex;
                  const isActive = idx === activeIndex;
                  return (
                    <button
                      key={item.id}
                      data-index={idx}
                      onClick={() => runItem(item)}
                      onMouseEnter={() => setActiveIndex(idx)}
                      className={`w-full flex items-center gap-3 px-4 min-h-[44px] text-left transition-colors ${
                        isActive ? 'bg-gray-800 text-white' : 'text-gray-300'
                      }`}
                    >
                      <item.icon size={17} className={isActive ? 'text-gold-400' : 'text-gold-400/70 shrink-0'} />
                      <span className="text-sm truncate">{item.label}</span>
                      {item.sublabel && (
                        <span className={`ml-auto shrink-0 pl-2 text-xs text-right truncate ${isActive ? 'text-gray-400' : 'text-gray-500'}`}>
                          {item.sublabel}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
