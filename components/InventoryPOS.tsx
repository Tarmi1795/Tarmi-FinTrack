
import React, { useEffect, useMemo, useState } from 'react';
import { useFinance } from '../context/FinanceContext';
import { inventoryService } from '../services/inventory';
import { InventoryItem, InventorySettings, Transaction } from '../types';
import { Modal } from './ui/Modal';
import { format } from 'date-fns';
import { SearchableSelect } from './ui/SearchableSelect';
import { confirmDialog } from './ui/ConfirmDialog';
import {
  ShoppingCart, Trash2, Plus, Minus, Search, ScanBarcode, Loader2, ArrowDownToLine, TrendingUp,
} from 'lucide-react';

interface PosLine { item: InventoryItem; qty: number; }

const fmt = (n: number) => n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtQty = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 3 });
const r2 = (n: number) => Math.round(n * 100) / 100;
const genId = () => (crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2, 12));

/**
 * POS-style quick entry for inventory: tap item tiles to build a basket and
 * complete it in one go. Sales post one batch revenue leg + one batch COGS leg
 * (grouped per account set), with a movement per line; Stock In mirrors it.
 */
export const InventoryPOS: React.FC<{
  open: boolean;
  onClose: () => void;
  items?: InventoryItem[];
  settings?: InventorySettings | null;
  onDone?: () => void;
}> = ({ open, onClose, items: itemsProp, settings: settingsProp, onDone }) => {
  const { dispatch, user, state } = useFinance();
  const [ownItems, setOwnItems] = useState<InventoryItem[]>([]);
  const [ownSettings, setOwnSettings] = useState<InventorySettings | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [mode, setMode] = useState<'sale' | 'stock'>('sale');
  const [search, setSearch] = useState('');
  const [cart, setCart] = useState<PosLine[]>([]);
  const [paymentId, setPaymentId] = useState('');
  const [note, setNote] = useState('');
  const [unitCosts, setUnitCosts] = useState<Record<string, string>>({});
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const baseCurrency = state.businessProfile.baseCurrency || 'QAR';

  const paymentOptions = useMemo(() => (
    state.accounts.filter(a => a.isPosting && a.class === 'Assets')
      .map(a => ({ id: a.id, label: a.name, subLabel: `${a.code} • Asset`, color: '#D4AF37' }))
  ), [state.accounts]);

  const settings = settingsProp ?? ownSettings;
  const items = itemsProp ?? ownItems;

  const paymentResolved = paymentId || settings?.payment_account_id
    || state.accounts.find(a => a.code === '11110')?.id || paymentOptions[0]?.id || '';

  // Effective COA (per-item override -> module default)
  const coa = (item: InventoryItem) => ({
    inv: item.inventory_account_id || settings?.inventory_account_id || null,
    cogs: item.cogs_account_id || settings?.cogs_account_id || null,
    rev: item.revenue_account_id || settings?.revenue_account_id || null,
  });

  // Standalone mode: fetch items + settings when opened without props
  useEffect(() => {
    if (!open || itemsProp) return;
    let cancelled = false;
    (async () => {
      try {
        const [its, st] = await Promise.all([
          inventoryService.getItems(user!.id),
          inventoryService.getSettings(user!.id).catch(() => null),
        ]);
        if (cancelled) return;
        setOwnItems(its);
        setOwnSettings(st);
      } catch (e: any) {
        if (!cancelled) setLoadError(e?.message || 'Failed to load inventory items.');
      }
    })();
    return () => { cancelled = true; };
  }, [open, itemsProp, user]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const base = (itemsProp ?? ownItems).filter(i => i.is_active !== false);
    if (!q) return base;
    return base.filter(i => `${i.name} ${i.sku || ''} ${i.category || ''}`.toLowerCase().includes(q));
  }, [items, search]);

  const addToCart = (item: InventoryItem) => {
    if (mode === 'sale' && item.quantity <= 0) return;
    setCart(c => {
      const existing = c.find(l => l.item.id === item.id);
      if (existing) {
        if (mode === 'sale' && existing.qty + 1 > item.quantity) return c;
        return c.map(l => l.item.id === item.id ? { ...l, qty: l.qty + 1 } : l);
      }
      return [...c, { item, qty: 1 }];
    });
  };

  const changeQty = (itemId: string, delta: number) => {
    setCart(c => c.map(l => {
      if (l.item.id !== itemId) return l;
      let q = l.qty + delta;
      if (mode === 'sale') q = Math.min(q, l.item.quantity);
      return { ...l, qty: Math.max(0, q) };
    }).filter(l => l.qty > 0));
  };

  const removeLine = (itemId: string) => setCart(c => c.filter(l => l.item.id !== itemId));

  const unitPriceOf = (l: PosLine) => l.item.sale_price || 0;
  const unitCostOf = (l: PosLine) =>
    mode === 'stock' ? Number(unitCosts[l.item.id] ?? l.item.cost_price ?? 0) : l.item.cost_price;

  const totals = useMemo(() => {
    if (mode === 'sale') {
      const revenue = r2(cart.reduce((s, l) => s + l.qty * unitPriceOf(l), 0));
      const cost = r2(cart.reduce((s, l) => s + l.qty * l.item.cost_price, 0));
      return { revenue, cost, margin: r2(revenue - cost) };
    }
    return { revenue: 0, cost: r2(cart.reduce((s, l) => s + l.qty * unitCostOf(l), 0)), margin: 0 };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cart, mode, unitCosts]);

  const addJournalEntry = (date: string, drId: string, crId: string, amount: number, noteText: string): string => {
    const tx: Transaction = {
      id: genId(),
      date: new Date(`${date}T12:00:00`).toISOString(),
      type: 'transfer',
      amount: r2(amount),
      source: 'side_hustle',
      accountId: drId,
      paymentAccountId: crId,
      note: noteText,
    };
    dispatch({ type: 'ADD_TRANSACTION', payload: tx });
    return tx.id;
  };

  const canComplete = cart.length > 0 && !!paymentResolved
    && (mode === 'sale' || cart.every(l => unitCostOf(l) >= 0));

  const handleComplete = async () => {
    if (!user || !canComplete) return;
    if (mode === 'sale') {
      const over = cart.find(l => l.qty > l.item.quantity);
      if (over) { setError(`Only ${fmtQty(over.item.quantity)} of "${over.item.name}" on hand.`); return; }
    }
    const ok = await confirmDialog({
      title: mode === 'sale' ? `Complete sale — ${baseCurrency} ${fmt(totals.revenue)}?` : `Record stock in — ${baseCurrency} ${fmt(totals.cost)}?`,
      message: mode === 'sale'
        ? `${cart.length} item line${cart.length > 1 ? 's' : ''} will be deducted from stock and the sale posted to the ledger.`
        : `${cart.length} item line${cart.length > 1 ? 's' : ''} will be added to stock and the purchase posted to the ledger.`,
      confirmLabel: mode === 'sale' ? 'Complete sale' : 'Record stock in',
    });
    if (!ok) return;

    setIsSaving(true);
    setError(null);
    try {
      const date = format(new Date(), 'yyyy-MM-dd');
      const countLabel = `${cart.reduce((s, l) => s + l.qty, 0)} units · ${cart.length} line${cart.length > 1 ? 's' : ''}`;
      const glIds: string[] = [];

      // Batch journal legs, grouped by account-set so per-item overrides stay correct
      if (mode === 'sale') {
        const groups = new Map<string, { rev: string | null; cogs: string | null; inv: string | null; lines: PosLine[] }>();
        cart.forEach(l => {
          const c = coa(l.item);
          const key = `${c.rev || '-'}|${c.cogs || '-'}|${c.inv || '-'}`;
          const g = groups.get(key) || { rev: c.rev, cogs: c.cogs, inv: c.inv, lines: [] };
          g.lines.push(l);
          groups.set(key, g);
        });
        groups.forEach(g => {
          const revenue = r2(g.lines.reduce((s, l) => s + l.qty * unitPriceOf(l), 0));
          const cost = r2(g.lines.reduce((s, l) => s + l.qty * l.item.cost_price, 0));
          if (paymentResolved && g.rev && revenue > 0)
            glIds.push(addJournalEntry(date, paymentResolved, g.rev, revenue, `[Inventory] POS sale — ${countLabel}`));
          if (g.cogs && cost > 0)
            glIds.push(addJournalEntry(date, g.cogs, g.inv || paymentResolved, cost, `[Inventory] POS sale COGS — ${countLabel}`));
        });
      } else {
        const groups = new Map<string, { inv: string | null; lines: PosLine[] }>();
        cart.forEach(l => {
          const c = coa(l.item);
          const key = c.inv || '-';
          const g = groups.get(key) || { inv: c.inv, lines: [] };
          g.lines.push(l);
          groups.set(key, g);
        });
        groups.forEach(g => {
          const cost = r2(g.lines.reduce((s, l) => s + l.qty * unitCostOf(l), 0));
          if (paymentResolved && g.inv && cost > 0)
            glIds.push(addJournalEntry(date, g.inv, paymentResolved, cost, `[Inventory] POS stock in — ${countLabel}`));
        });
      }

      // Movements + quantity updates
      for (const l of cart) {
        if (mode === 'sale') {
          await inventoryService.createMovement(user.id, {
            item_id: l.item.id,
            movement_type: 'sale',
            quantity: l.qty,
            unit_cost: l.item.cost_price,
            total_cost: r2(l.qty * l.item.cost_price),
            unit_price: unitPriceOf(l),
            total_price: r2(l.qty * unitPriceOf(l)),
            payment_account_id: paymentResolved || null,
            gl_transaction_ids: glIds.length ? glIds : undefined,
            note: note.trim() || 'POS sale',
            movement_date: date,
          });
          await inventoryService.updateItem(user.id, l.item.id, {
            quantity: Math.round((l.item.quantity - l.qty) * 1000) / 1000,
          });
        } else {
          const unit = unitCostOf(l);
          const newQty = Math.round((l.item.quantity + l.qty) * 1000) / 1000;
          const newAvg = newQty > 0
            ? Math.round(((l.item.quantity * l.item.cost_price + l.qty * unit) / newQty) * 100) / 100
            : unit;
          await inventoryService.createMovement(user.id, {
            item_id: l.item.id,
            movement_type: 'purchase',
            quantity: l.qty,
            unit_cost: unit,
            total_cost: r2(l.qty * unit),
            payment_account_id: paymentResolved || null,
            gl_transaction_ids: glIds.length ? glIds : undefined,
            note: note.trim() || 'POS stock in',
            movement_date: date,
          });
          await inventoryService.updateItem(user.id, l.item.id, { quantity: newQty, cost_price: newAvg });
        }
      }

      setCart([]);
      setNote('');
      setUnitCosts({});
      onDone();
      onClose();
    } catch (e: any) {
      setError(e?.message || 'Failed to complete.');
    } finally {
      setIsSaving(false);
    }
  };

  const inputCls = 'w-full bg-gray-900/70 border border-gray-700 rounded-lg px-3 py-2.5 text-white focus:border-gold-500 focus:ring-1 focus:ring-gold-500/30 outline-none transition-colors';
  const labelCls = 'block text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-1.5';

  return (
    <Modal isOpen={open} onClose={onClose} title="Quick POS Entry" wide>
      {/* Mode toggle */}
      <div className="flex gap-2 mb-4">
        <button
          onClick={() => { setMode('sale'); setCart(c => c); }}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-widest border transition-colors ${
            mode === 'sale' ? 'bg-blue-500/10 border-blue-500/40 text-blue-400' : 'bg-gray-900 border-gray-800 text-gray-500'
          }`}
        >
          <TrendingUp size={13} /> Sale
        </button>
        <button
          onClick={() => setMode('stock')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-widest border transition-colors ${
            mode === 'stock' ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-400' : 'bg-gray-900 border-gray-800 text-gray-500'
          }`}
        >
          <ArrowDownToLine size={13} /> Stock In
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        {/* Item tiles */}
        <div className="lg:col-span-3">
          <div className="flex items-center gap-2 bg-gray-900/70 border border-gray-800 rounded-lg px-3 py-2 mb-3 focus-within:border-gold-500/50 transition-colors">
            <Search size={14} className="text-gray-500 shrink-0" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search items..."
              className="w-full bg-transparent text-sm text-white outline-none placeholder-gray-600"
            />
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 max-h-[42vh] lg:max-h-[46vh] overflow-y-auto pr-1 custom-scrollbar">
            {filtered.map(item => {
              const out = mode === 'sale' && item.quantity <= 0;
              return (
                <button
                  key={item.id}
                  onClick={() => addToCart(item)}
                  disabled={out}
                  className={`text-left p-3 rounded-xl border transition-all active:scale-[0.97] ${
                    out ? 'border-gray-800/60 bg-gray-950/50 opacity-40 cursor-not-allowed'
                      : 'border-gray-800 bg-gray-900/50 hover:border-gold-500/40 hover:bg-gray-900'
                  }`}
                >
                  <p className="text-sm font-bold text-gray-200 truncate">{item.name}</p>
                  <p className="text-[10px] text-gray-500 mt-0.5">{item.sku || item.category || item.unit || '\u00A0'}</p>
                  <div className="flex items-center justify-between mt-1.5">
                    <span className={`font-mono text-xs font-bold ${out ? 'text-gray-600' : 'text-gold-400'}`}>
                      {mode === 'sale' ? (item.sale_price ? fmt(item.sale_price) : '—') : fmt(item.cost_price)}
                    </span>
                    <span className="font-mono text-[10px] text-gray-500">
                      {fmtQty(item.quantity)} {item.unit || ''}
                    </span>
                  </div>
                </button>
              );
            })}
            {filtered.length === 0 && (
              <p className="col-span-full text-center text-xs text-gray-600 py-8">No items match.</p>
            )}
          </div>
        </div>

        {/* Basket */}
        <div className="lg:col-span-2 flex flex-col gap-3">
          <div className="bg-gray-950/60 border border-gray-800 rounded-xl flex-1 min-h-[160px] max-h-[38vh] lg:max-h-none overflow-y-auto divide-y divide-gray-800/60">
            {cart.length === 0 && (
              <p className="text-center text-xs text-gray-600 py-10">Tap items to add them here.</p>
            )}
            {cart.map(l => (
              <div key={l.item.id} className="p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-bold text-gray-200 truncate">{l.item.name}</p>
                  <button onClick={() => removeLine(l.item.id)} className="text-gray-600 hover:text-red-400 shrink-0" aria-label="Remove">
                    <Trash2 size={14} />
                  </button>
                </div>
                <div className="flex items-center justify-between gap-2 mt-2">
                  <div className="flex items-center gap-1.5">
                    <button onClick={() => changeQty(l.item.id, -1)} className="p-1.5 rounded-lg bg-gray-800 text-gray-300 active:scale-90 transition-transform" aria-label="Less">
                      <Minus size={12} />
                    </button>
                    <span className="font-mono text-sm font-bold text-white w-10 text-center">{l.qty}</span>
                    <button onClick={() => changeQty(l.item.id, +1)} className="p-1.5 rounded-lg bg-gray-800 text-gray-300 active:scale-90 transition-transform" aria-label="More">
                      <Plus size={12} />
                    </button>
                    <span className="text-[10px] text-gray-600 ml-1">{l.item.unit || ''}</span>
                  </div>
                  <span className="font-mono text-sm font-bold text-gold-400">
                    {fmt(l.qty * (mode === 'sale' ? unitPriceOf(l) : unitCostOf(l)))}
                  </span>
                </div>
                {mode === 'stock' && (
                  <input
                    value={unitCosts[l.item.id] ?? String(l.item.cost_price || '')}
                    onChange={(e) => setUnitCosts(u => ({ ...u, [l.item.id]: e.target.value }))}
                    placeholder={`Unit cost (${baseCurrency})`}
                    className={`${inputCls} font-mono mt-2 text-xs py-1.5`}
                    inputMode="decimal"
                  />
                )}
              </div>
            ))}
          </div>

          {/* Totals */}
          <div className="bg-gray-900/70 border border-gray-800 rounded-xl p-3.5 space-y-1.5 font-mono text-sm">
            {mode === 'sale' ? (
              <>
                <div className="flex justify-between text-gray-400"><span>Revenue</span><span className="text-white">{fmt(totals.revenue)}</span></div>
                <div className="flex justify-between text-gray-400"><span>Cost</span><span className="text-white">{fmt(totals.cost)}</span></div>
                <div className="flex justify-between font-bold pt-1 border-t border-gray-800">
                  <span className="text-gray-300">Margin</span>
                  <span className={totals.margin >= 0 ? 'text-emerald-400' : 'text-red-400'}>{fmt(totals.margin)}</span>
                </div>
              </>
            ) : (
              <div className="flex justify-between text-gray-400"><span>Total cost</span><span className="text-gold-400 font-bold">{fmt(totals.cost)}</span></div>
            )}
          </div>

          <div>
            <label className={labelCls}>{mode === 'sale' ? 'Deposit to' : 'Paid from'} (Bank / Cash)</label>
            <SearchableSelect
              options={paymentOptions}
              value={paymentResolved}
              onChange={setPaymentId}
              placeholder="Select payment account..."
            />
          </div>

          <div>
            <label className={labelCls}>Note</label>
            <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Optional" className={inputCls} />
          </div>

          {error && (
            <div className="p-2.5 rounded-lg bg-red-500/10 border border-red-500/30 text-red-300 text-xs">{error}</div>
          )}

          <button
            onClick={handleComplete}
            disabled={isSaving || cart.length === 0 || !paymentResolved}
            className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-gold-500 to-amber-400 text-black font-bold py-3.5 rounded-xl active:scale-95 transition-transform disabled:opacity-40"
          >
            {isSaving
              ? <Loader2 size={16} className="animate-spin" />
              : mode === 'sale'
                ? <ScanBarcode size={16} />
                : <ArrowDownToLine size={16} />}
            {isSaving
              ? 'Processing…'
              : mode === 'sale'
                ? `Complete Sale — ${baseCurrency} ${fmt(totals.revenue)}`
                : `Record Stock In — ${baseCurrency} ${fmt(totals.cost)}`}
          </button>
          <p className="text-center text-[10px] text-gray-600">
            Standalone inventory posting — batch ledger entries, per-line movements, quantities updated.
          </p>
        </div>
      </div>
    </Modal>
  );
};
