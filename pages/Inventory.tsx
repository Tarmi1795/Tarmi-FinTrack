
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useFinance } from '../context/FinanceContext';
import { inventoryService } from '../services/inventory';
import { InventoryItem, InventoryMovement, InventorySettings, Transaction, Account } from '../types';
import { Modal } from '../components/ui/Modal';
import { InventoryPOS } from '../components/InventoryPOS';
import { SearchableSelect } from '../components/ui/SearchableSelect';
import { confirmDialog, alertDialog } from '../components/ui/ConfirmDialog';
import { SkeletonCard } from '../components/ui/Skeleton';
import { evaluateMathExpression } from '../utils/mathUtils';
import { format, parseISO } from 'date-fns';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Package, Plus, RefreshCw, Trash2, Pencil, History, AlertTriangle, X, Check,
  ArrowDownToLine, ArrowUpFromLine, Scale, Link2, Boxes, TrendingUp, ChevronDown, PackageOpen, ShoppingCart
} from 'lucide-react';

const todayStr = () => format(new Date(), 'yyyy-MM-dd');
const fmt = (n: number) => n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtQty = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 3 });
// Margin % on selling price (standard retail convention); null when no sale price
const marginPct = (cost: number, sale?: number | null): number | null =>
  sale && sale > 0 ? ((sale - cost) / sale) * 100 : null;
const fmtPct = (n: number) => `${n >= 0 ? '' : '-'}${Math.abs(n).toFixed(1)}%`;
const genId = () => (crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substr(2, 12));

const MovementBadge: React.FC<{ type: InventoryMovement['movement_type'] }> = ({ type }) => {
  const map = {
    purchase: 'bg-emerald-500/10 text-emerald-400',
    sale: 'bg-blue-500/10 text-blue-400',
    adjustment: 'bg-amber-500/10 text-amber-400',
  } as const;
  return (
    <span className={`text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded ${map[type]}`}>
      {type}
    </span>
  );
};

export const Inventory: React.FC = () => {
  const { user, state, dispatch } = useFinance();
  const baseCurrency = state.businessProfile.baseCurrency || 'QAR';

  const [items, setItems] = useState<InventoryItem[]>([]);
  const [movements, setMovements] = useState<InventoryMovement[]>([]);
  const [settings, setSettings] = useState<InventorySettings | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [needsMigration, setNeedsMigration] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // Modals
  const [showItemForm, setShowItemForm] = useState(false);
  const [editItem, setEditItem] = useState<InventoryItem | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [stockInItem, setStockInItem] = useState<InventoryItem | null>(null);
  const [saleItem, setSaleItem] = useState<InventoryItem | null>(null);
  const [adjustItem, setAdjustItem] = useState<InventoryItem | null>(null);
  const [historyItem, setHistoryItem] = useState<InventoryItem | null>(null);
  const [showSettingsCard, setShowSettingsCard] = useState(false);
  const [showPOS, setShowPOS] = useState(false);

  // Item form
  const [fName, setFName] = useState('');
  const [fSku, setFSku] = useState('');
  const [fUnit, setFUnit] = useState('');
  const [fCategory, setFCategory] = useState('');
  const [fCost, setFCost] = useState('');
  const [fSale, setFSale] = useState('');
  const [fReorder, setFReorder] = useState('');
  const [fNotes, setFNotes] = useState('');
  const [fInvAcc, setFInvAcc] = useState('');
  const [fCogsAcc, setFCogsAcc] = useState('');
  const [fRevAcc, setFRevAcc] = useState('');

  // Movement forms
  const [mQty, setMQty] = useState('');
  const [mCost, setMCost] = useState('');   // unit cost (stock-in)
  const [mPrice, setMPrice] = useState(''); // unit price (sale)
  const [mDate, setMDate] = useState(todayStr());
  const [mPayment, setMPayment] = useState('');
  const [mNote, setMNote] = useState('');
  const [mDirection, setMDirection] = useState<'in' | 'out'>('out');

  // Settings draft
  const [sInv, setSInv] = useState('');
  const [sCogs, setCogs] = useState('');
  const [sRev, setSRev] = useState('');
  const [sAdj, setSAdj] = useState('');
  const [sPay, setSPay] = useState('');

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  };

  const handleError = (e: any, fallback: string) => {
    if (inventoryService.isMissingTableError(e)) {
      setNeedsMigration(true);
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
      const [its, mvts, st] = await Promise.all([
        inventoryService.getItems(user.id),
        inventoryService.getMovements(user.id),
        inventoryService.getSettings(user.id),
      ]);
      setItems(its);
      setMovements(mvts);
      setSettings(st);
      setSInv(st?.inventory_account_id ?? '');
      setCogs(st?.cogs_account_id ?? '');
      setSRev(st?.revenue_account_id ?? '');
      setSAdj(st?.adjustment_account_id ?? '');
      setSPay(st?.payment_account_id ?? '');
    } catch (e: any) {
      if (inventoryService.isMissingTableError(e)) {
        setNeedsMigration(true);
      } else {
        setLoadError(e?.message || 'Failed to load inventory data.');
      }
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  useEffect(() => { loadAll(); }, [loadAll]);

  // --- COA options ---
  const accountOptions = useMemo(() => (
    state.accounts
      .filter((a) => a.isPosting)
      .map((a) => ({
        id: a.id,
        label: a.name,
        subLabel: `${a.code} • ${a.class}`,
        color: a.class === 'Assets' ? '#D4AF37' : a.class === 'Revenue' ? '#10b981' : a.class === 'Expenses' ? '#f87171' : '#3b82f6',
      }))
  ), [state.accounts]);

  const paymentOptions = useMemo(() => (
    state.accounts
      .filter((a) => a.class === 'Assets' && a.isPosting)
      .map((a) => ({ id: a.id, label: a.name, subLabel: `${a.code} • Asset`, color: '#D4AF37' }))
  ), [state.accounts]);

  const accName = (id?: string | null) => {
    const a = state.accounts.find((x) => x.id === id);
    return a ? `${a.name} (${a.code})` : 'Not set';
  };

  const defaultPaymentId = useMemo(() => (
    settings?.payment_account_id || state.accounts.find((a) => a.code === '11110')?.id || paymentOptions[0]?.id || ''
  ), [settings, state.accounts, paymentOptions]);

  // Effective COA for an item (per-item override -> module default)
  const effectiveAccounts = useCallback((item: InventoryItem) => ({
    inv: item.inventory_account_id || settings?.inventory_account_id || null,
    cogs: item.cogs_account_id || settings?.cogs_account_id || null,
    rev: item.revenue_account_id || settings?.revenue_account_id || null,
    adj: settings?.adjustment_account_id || settings?.cogs_account_id || null,
    pay: settings?.payment_account_id || null,
  }), [settings]);

  const settingsConfigured = !!(settings?.inventory_account_id);

  // --- Journal entry helper (accountId = Dr, paymentAccountId = Cr) ---
  const addJournalEntry = (date: string, drId: string, crId: string, amount: number, note: string): string => {
    const tx: Transaction = {
      id: genId(),
      date: new Date(`${date}T12:00:00`).toISOString(),
      type: 'transfer',
      amount: Math.round(amount * 100) / 100,
      source: 'side_hustle',
      accountId: drId,
      paymentAccountId: crId,
      note,
    };
    dispatch({ type: 'ADD_TRANSACTION', payload: tx });
    return tx.id;
  };

  // --- Derived ---
  const stats = useMemo(() => {
    const stockValue = items.reduce((s, i) => s + i.quantity * i.cost_price, 0);
    const potentialRevenue = items.reduce((s, i) => s + i.quantity * (i.sale_price || 0), 0);
    const lowStock = items.filter((i) => (i.reorder_level ?? 0) > 0 && i.quantity <= (i.reorder_level ?? 0)).length;
    const avgMargin = marginPct(stockValue, potentialRevenue);
    return { stockValue, potentialRevenue, lowStock, avgMargin };
  }, [items]);

  const itemMovements = useMemo(() => (
    historyItem
      ? movements
          .filter((m) => m.item_id === historyItem.id)
          .sort((a, b) => b.movement_date.localeCompare(a.movement_date) || (b.created_at || '').localeCompare(a.created_at || ''))
      : []
  ), [historyItem, movements]);

  // --- Actions ---
  const openItemForm = (item: InventoryItem | null) => {
    setEditItem(item);
    setFName(item?.name ?? '');
    setFSku(item?.sku ?? '');
    setFUnit(item?.unit ?? '');
    setFCategory(item?.category ?? '');
    setFCost(item ? String(item.cost_price) : '');
    setFSale(item?.sale_price ? String(item.sale_price) : '');
    setFReorder(item?.reorder_level ? String(item.reorder_level) : '');
    setFNotes(item?.notes ?? '');
    setFInvAcc(item?.inventory_account_id ?? '');
    setFCogsAcc(item?.cogs_account_id ?? '');
    setFRevAcc(item?.revenue_account_id ?? '');
    setShowAdvanced(!!(item?.inventory_account_id || item?.cogs_account_id || item?.revenue_account_id));
    setShowItemForm(true);
  };

  const handleSaveItem = async () => {
    if (!user || !fName.trim()) return;
    const num = (v: string) => (v.trim() === '' ? null : Number(evaluateMathExpression(v)));
    setIsSaving(true);
    try {
      const payload = {
        name: fName.trim(),
        sku: fSku.trim() || undefined,
        unit: fUnit.trim() || undefined,
        category: fCategory.trim() || undefined,
        cost_price: num(fCost) ?? 0,
        sale_price: num(fSale) ?? undefined,
        reorder_level: num(fReorder) ?? undefined,
        notes: fNotes.trim() || undefined,
        inventory_account_id: fInvAcc || null,
        cogs_account_id: fCogsAcc || null,
        revenue_account_id: fRevAcc || null,
      };
      if (editItem) {
        await inventoryService.updateItem(user.id, editItem.id, payload);
      } else {
        await inventoryService.createItem(user.id, { ...payload, quantity: 0, is_active: true });
      }
      setShowItemForm(false);
      showToast(editItem ? 'Item updated.' : 'Item added.');
      await loadAll();
    } catch (e: any) {
      handleError(e, 'Failed to save item.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteItem = async (item: InventoryItem) => {
    if (!user) return;
    const linked = movements.filter((m) => m.item_id === item.id);
    const glCount = linked.reduce((s, m) => s + (m.gl_transaction_ids?.length || 0), 0);
    if (!(await confirmDialog({
      title: `Delete "${item.name}"?`,
      message: `Its ${linked.length} movement record${linked.length === 1 ? '' : 's'} will be removed.`
        + (glCount ? ` The ${glCount} linked journal entr${glCount === 1 ? 'y' : 'ies'} in the main ledger will also be deleted.`
          : ' No journal entries are linked.'),
      danger: true,
      confirmLabel: 'Delete',
    }))) return;
    setIsSaving(true);
    try {
      linked.forEach((m) => (m.gl_transaction_ids || []).forEach((txId) => dispatch({ type: 'DELETE_TRANSACTION', payload: txId })));
      await inventoryService.deleteItem(user.id, item.id);
      showToast('Item deleted.');
      await loadAll();
    } catch (e: any) {
      handleError(e, 'Failed to delete item.');
    } finally {
      setIsSaving(false);
    }
  };

  const openStockIn = (item: InventoryItem) => {
    setStockInItem(item);
    setMQty('');
    setMCost(String(item.cost_price || ''));
    setMDate(todayStr());
    setMPayment(defaultPaymentId);
    setMNote('');
  };

  const openSale = (item: InventoryItem) => {
    setSaleItem(item);
    setMQty('');
    setMPrice(item.sale_price ? String(item.sale_price) : '');
    setMDate(todayStr());
    setMPayment(defaultPaymentId);
    setMNote('');
  };

  const openAdjust = (item: InventoryItem) => {
    setAdjustItem(item);
    setMDirection('out');
    setMQty('');
    setMDate(todayStr());
    setMNote('');
  };

  const handleStockIn = async () => {
    if (!user || !stockInItem) return;
    const qty = Number(evaluateMathExpression(mQty));
    const unitCost = Number(evaluateMathExpression(mCost));
    if (!mQty.trim() || isNaN(qty) || qty <= 0 || isNaN(unitCost) || unitCost < 0) return;
    setIsSaving(true);
    try {
      const totalCost = Math.round(qty * unitCost * 100) / 100;
      const newQty = stockInItem.quantity + qty;
      const newAvg = newQty > 0
        ? Math.round(((stockInItem.quantity * stockInItem.cost_price + qty * unitCost) / newQty) * 100) / 100
        : unitCost;
      const coa = effectiveAccounts(stockInItem);
      const glIds: string[] = [];
      if (coa.inv && coa.pay && totalCost > 0) {
        glIds.push(addJournalEntry(mDate, coa.inv, coa.pay, totalCost, `[Inventory] Purchase ${fmtQty(qty)} ${stockInItem.unit || ''} x ${stockInItem.name}`.trim()));
      }
      await inventoryService.createMovement(user.id, {
        item_id: stockInItem.id,
        movement_type: 'purchase',
        quantity: qty,
        unit_cost: unitCost,
        total_cost: totalCost,
        payment_account_id: coa.pay || null,
        gl_transaction_ids: glIds,
        note: mNote.trim() || undefined,
        movement_date: mDate,
      });
      await inventoryService.updateItem(user.id, stockInItem.id, { quantity: newQty, cost_price: newAvg });
      setShowStockInFalse();
      showToast(`Stock added — avg cost now ${fmt(newAvg)}.`);
      await loadAll();
    } catch (e: any) {
      handleError(e, 'Failed to record purchase.');
    } finally {
      setIsSaving(false);
    }
  };

  const setShowStockInFalse = () => setStockInItem(null);

  const handleSale = async () => {
    if (!user || !saleItem) return;
    const qty = Number(evaluateMathExpression(mQty));
    const unitPrice = Number(evaluateMathExpression(mPrice));
    if (!mQty.trim() || isNaN(qty) || qty <= 0 || isNaN(unitPrice) || unitPrice < 0) return;
    if (qty > saleItem.quantity) {
      setLoadError(`Only ${fmtQty(saleItem.quantity)} ${saleItem.unit || 'units'} on hand.`);
      return;
    }
    setIsSaving(true);
    try {
      const totalPrice = Math.round(qty * unitPrice * 100) / 100;
      const totalCost = Math.round(qty * saleItem.cost_price * 100) / 100;
      const coa = effectiveAccounts(saleItem);
      const glIds: string[] = [];
      if (coa.pay && coa.rev && totalPrice > 0) {
        glIds.push(addJournalEntry(mDate, coa.pay, coa.rev, totalPrice, `[Inventory] Sale ${fmtQty(qty)} ${saleItem.unit || ''} x ${saleItem.name}`.trim()));
      }
      if (coa.cogs && coa.inv && totalCost > 0) {
        glIds.push(addJournalEntry(mDate, coa.cogs, coa.inv, totalCost, `[Inventory] COGS ${fmtQty(qty)} x ${saleItem.name}`.trim()));
      }
      await inventoryService.createMovement(user.id, {
        item_id: saleItem.id,
        movement_type: 'sale',
        quantity: qty,
        unit_cost: saleItem.cost_price,
        total_cost: totalCost,
        unit_price: unitPrice,
        total_price: totalPrice,
        payment_account_id: coa.pay || null,
        gl_transaction_ids: glIds,
        note: mNote.trim() || undefined,
        movement_date: mDate,
      });
      await inventoryService.updateItem(user.id, saleItem.id, { quantity: Math.round((saleItem.quantity - qty) * 1000) / 1000 });
      setSaleItem(null);
      showToast('Sale recorded — revenue and COGS posted.');
      await loadAll();
    } catch (e: any) {
      handleError(e, 'Failed to record sale.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleAdjust = async () => {
    if (!user || !adjustItem) return;
    const qty = Number(evaluateMathExpression(mQty));
    if (!mQty.trim() || isNaN(qty) || qty <= 0) return;
    const signed = mDirection === 'in' ? qty : -qty;
    if (mDirection === 'out' && qty > adjustItem.quantity) {
      setLoadError(`Only ${fmtQty(adjustItem.quantity)} on hand to write off.`);
      return;
    }
    setIsSaving(true);
    try {
      const totalCost = Math.round(qty * adjustItem.cost_price * 100) / 100;
      const coa = effectiveAccounts(adjustItem);
      const glIds: string[] = [];
      if (totalCost > 0) {
        if (mDirection === 'out' && coa.adj && coa.inv) {
          glIds.push(addJournalEntry(mDate, coa.adj, coa.inv, totalCost, `[Inventory] Shrinkage ${fmtQty(qty)} x ${adjustItem.name}`.trim()));
        } else if (mDirection === 'in' && coa.inv && coa.adj) {
          glIds.push(addJournalEntry(mDate, coa.inv, coa.adj, totalCost, `[Inventory] Found ${fmtQty(qty)} x ${adjustItem.name}`.trim()));
        }
      }
      await inventoryService.createMovement(user.id, {
        item_id: adjustItem.id,
        movement_type: 'adjustment',
        quantity: signed,
        unit_cost: adjustItem.cost_price,
        total_cost: mDirection === 'out' ? totalCost : totalCost,
        gl_transaction_ids: glIds,
        note: mNote.trim() || undefined,
        movement_date: mDate,
      });
      await inventoryService.updateItem(user.id, adjustItem.id, {
        quantity: Math.round((adjustItem.quantity + signed) * 1000) / 1000,
      });
      setAdjustItem(null);
      showToast('Adjustment recorded.');
      await loadAll();
    } catch (e: any) {
      handleError(e, 'Failed to record adjustment.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteMovement = async (m: InventoryMovement) => {
    if (!user) return;
    const glCount = m.gl_transaction_ids?.length || 0;
    if (!(await confirmDialog({
      title: 'Delete this movement?',
      message: glCount ? `The ${glCount} linked journal entr${glCount === 1 ? 'y' : 'ies'} will also be deleted, and stock quantity restored.`
        : 'The stock quantity will be restored.',
      danger: true,
      confirmLabel: 'Delete',
    }))) return;
    setIsSaving(true);
    try {
      const item = items.find((i) => i.id === m.item_id);
      if (item) {
        // Reverse the quantity effect: purchase/adjustment+ added, sale/adjustment- removed
        const reverse = m.movement_type === 'purchase' ? -m.quantity
          : m.movement_type === 'sale' ? +m.quantity
          : -m.quantity;
        await inventoryService.updateItem(user.id, item.id, {
          quantity: Math.round((item.quantity + reverse) * 1000) / 1000,
        });
      }
      (m.gl_transaction_ids || []).forEach((txId) => dispatch({ type: 'DELETE_TRANSACTION', payload: txId }));
      await inventoryService.deleteMovement(user.id, m.id);
      showToast('Movement deleted — stock restored.');
      await loadAll();
    } catch (e: any) {
      handleError(e, 'Failed to delete movement.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveSettings = async () => {
    if (!user) return;
    setIsSaving(true);
    try {
      await inventoryService.saveSettings(user.id, {
        inventory_account_id: sInv || null,
        cogs_account_id: sCogs || null,
        revenue_account_id: sRev || null,
        adjustment_account_id: sAdj || null,
        payment_account_id: sPay || null,
      });
      showToast('Chart of Accounts mapping saved.');
      await loadAll();
    } catch (e: any) {
      handleError(e, 'Failed to save mapping.');
    } finally {
      setIsSaving(false);
    }
  };

  // Auto-setup: create an Inventory asset account + pick sensible defaults
  const autoSetup = async () => {
    let invId = sInv;
    if (!invId) {
      const assetsClass = state.accounts.find((a) => a.class === 'Assets' && a.level === 'class');
      const parent = state.accounts.find((a) => a.code === '11200' && a.level === 'group') || assetsClass;
      if (!parent) {
        showToast('No Assets class found in the Chart of Accounts.');
        return;
      }
      let code = 11300;
      while (state.accounts.some((a) => a.code === String(code))) code += 10;
      const newAccount: Account = {
        id: genId(),
        code: String(code),
        name: 'Inventory',
        class: 'Assets',
        level: 'gl',
        parentId: parent.id,
        normalBalance: 'debit',
        isSystem: false,
        isPosting: true,
      };
      dispatch({ type: 'ADD_ACCOUNT', payload: newAccount });
      invId = newAccount.id;
    }
    const cogsAcc = state.accounts.find((a) => a.isPosting && a.code.startsWith('51'))?.id || sCogs;
    const revAcc = state.accounts.find((a) => a.isPosting && a.class === 'Revenue')?.id || sRev;
    const payAcc = state.accounts.find((a) => a.code === '11110')?.id || sPay;
    const adjAcc = sAdj || cogsAcc;
    try {
      await inventoryService.saveSettings(user!.id, {
        inventory_account_id: invId,
        cogs_account_id: cogsAcc,
        revenue_account_id: revAcc,
        adjustment_account_id: adjAcc,
        payment_account_id: payAcc,
      });
      showToast('Default Dr/Cr mapping configured.');
      await loadAll();
    } catch (e: any) {
      handleError(e, 'Failed to save mapping.');
    }
  };

  // --- Render helpers ---
  const inputCls = "w-full bg-gray-900/70 border border-gray-700 rounded-lg px-3 py-2.5 text-white focus:border-gold-500 focus:ring-1 focus:ring-gold-500/30 outline-none transition-colors";
  const labelCls = "block text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-1.5";

  const num = (v: string) => Number(evaluateMathExpression(v || '0') || 0);

  const renderRow = (item: InventoryItem, indent = false) => {
    const low = (item.reorder_level ?? 0) > 0 && item.quantity <= (item.reorder_level ?? 0);
    const margin = marginPct(item.cost_price, item.sale_price);
    return (
      <tr key={item.id} className="border-b border-gray-800/40 hover:bg-gray-800/30 transition-colors">
        <td className={`py-3.5 pr-4 ${indent ? 'pl-10' : 'pl-5'}`}>
          <p className="font-bold text-white text-sm">{item.name}</p>
          <p className="text-xs text-gray-500">
            {item.sku && <span className="font-mono text-gold-500/80">{item.sku} • </span>}
            {item.category || 'Uncategorized'}
          </p>
        </td>
        <td className="px-4 py-3.5 text-right">
          <span className={`font-mono font-bold ${low ? 'text-amber-400' : 'text-white'}`}>{fmtQty(item.quantity)}</span>
          {item.unit && <span className="text-[10px] text-gray-600 ml-1">{item.unit}</span>}
          {low && <p className="text-[9px] text-amber-500/80 uppercase tracking-wider">Low stock</p>}
        </td>
        <td className="px-4 py-3.5 text-right font-mono text-xs text-gray-500">{fmt(item.cost_price)}</td>
        <td className="px-4 py-3.5 text-right font-mono font-bold text-gold-400">{fmt(item.quantity * item.cost_price)}</td>
        <td className="px-4 py-3.5 text-right font-mono text-xs text-gray-400">{item.sale_price ? fmt(item.sale_price) : '—'}</td>
        <td className="px-4 py-3.5 text-right">
          {margin !== null ? (
            <span className={`font-mono text-xs font-bold ${margin >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{fmtPct(margin)}</span>
          ) : (
            <span className="text-gray-600 text-xs">—</span>
          )}
        </td>
        <td className="px-4 py-3.5">
          <div className="flex items-center justify-end gap-1">
            <IconBtn title="Stock In (purchase)" onClick={() => openStockIn(item)} icon={<ArrowDownToLine size={15} />} gold />
            <IconBtn title="Record Sale" onClick={() => openSale(item)} icon={<TrendingUp size={15} />} />
            <IconBtn title="Adjust stock" onClick={() => openAdjust(item)} icon={<Scale size={15} />} />
            <IconBtn title="History" onClick={() => setHistoryItem(item)} icon={<History size={15} />} />
            <IconBtn title="Edit" onClick={() => openItemForm(item)} icon={<Pencil size={15} />} />
            <IconBtn title="Delete" onClick={() => handleDeleteItem(item)} icon={<Trash2 size={15} />} danger />
          </div>
        </td>
      </tr>
    );
  };

  const renderCard = (item: InventoryItem) => {
    const low = (item.reorder_level ?? 0) > 0 && item.quantity <= (item.reorder_level ?? 0);
    const margin = marginPct(item.cost_price, item.sale_price);
    return (
      <div key={item.id} className="p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="font-bold text-white text-sm">{item.name}</p>
            <p className="text-[11px] text-gray-500">
              {item.sku && <span className="font-mono text-gold-500/80">{item.sku} • </span>}{item.category || 'Uncategorized'}
            </p>
          </div>
          <div className="text-right shrink-0">
            <p className={`font-mono font-bold ${low ? 'text-amber-400' : 'text-gold-400'}`}>{fmtQty(item.quantity)} {item.unit}</p>
            <p className="text-[10px] text-gray-600">on hand{low ? ' • LOW' : ''}</p>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2 mt-3 text-xs">
          <div className="bg-gray-900/60 rounded-lg p-2.5">
            <p className="text-[9px] uppercase tracking-widest text-gray-500 font-bold">Stock Value</p>
            <p className="font-mono text-gold-400 font-bold mt-0.5">{fmt(item.quantity * item.cost_price)}</p>
          </div>
          <div className="bg-gray-900/60 rounded-lg p-2.5">
            <p className="text-[9px] uppercase tracking-widest text-gray-500 font-bold">Avg Cost</p>
            <p className="font-mono text-gray-300 mt-0.5">{fmt(item.cost_price)}</p>
          </div>
          <div className="bg-gray-900/60 rounded-lg p-2.5">
            <p className="text-[9px] uppercase tracking-widest text-gray-500 font-bold">Sale Price</p>
            <p className="font-mono text-gray-300 mt-0.5">{item.sale_price ? fmt(item.sale_price) : '—'}</p>
            {margin !== null && (
              <p className={`font-mono text-[10px] mt-0.5 ${margin >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{fmtPct(margin)} margin</p>
            )}
          </div>
        </div>
        <div className="flex gap-1.5 mt-3 flex-wrap">
          <MiniBtn onClick={() => openStockIn(item)} label="Stock In" icon={<ArrowDownToLine size={13} />} gold />
          <MiniBtn onClick={() => openSale(item)} label="Sale" icon={<TrendingUp size={13} />} />
          <MiniBtn onClick={() => openAdjust(item)} label="Adjust" icon={<Scale size={13} />} />
          <MiniBtn onClick={() => setHistoryItem(item)} label="History" icon={<History size={13} />} />
          <MiniBtn onClick={() => openItemForm(item)} label="" icon={<Pencil size={13} />} />
          <MiniBtn onClick={() => handleDeleteItem(item)} label="" icon={<Trash2 size={13} />} danger />
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-4 md:space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl md:text-3xl font-bold flex items-center gap-2.5">
            <Package className="text-gold-500" size={24} />
            <span className="text-gold-gradient">Inventory</span>
          </h1>
          <p className="text-gray-500 text-sm mt-1">Stock tracking with Chart-of-Accounts posting • {baseCurrency}</p>
        </div>
        <div className="flex gap-2">
          <button onClick={loadAll} className="p-2.5 bg-gray-900 hover:bg-gray-800 border border-gray-800 rounded-xl text-gray-400 hover:text-white transition-colors active:scale-95" title="Refresh">
            <RefreshCw size={18} className={isLoading ? 'animate-spin' : ''} />
          </button>
          <button
            onClick={() => setShowPOS(true)}
            disabled={items.length === 0}
            title="Quick POS entry"
            className="flex items-center gap-2 px-4 py-2.5 bg-gray-900 hover:bg-gray-800 border border-gold-500/40 text-gold-400 font-bold rounded-xl text-sm transition-all active:scale-95 disabled:opacity-40"
          >
            <ShoppingCart size={16} /> POS
          </button>
          <button
            onClick={() => openItemForm(null)}
            className="flex items-center gap-2 bg-gradient-to-r from-gold-500 to-amber-400 text-black font-bold px-4 py-2.5 rounded-xl hover:shadow-lg hover:shadow-gold-500/20 transition-all active:scale-95 text-sm"
          >
            <Plus size={18} /> Add Item
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
              <p className="font-bold text-amber-300">Inventory tables not found in Supabase</p>
              <p className="text-gray-400 mt-1">Run <code className="text-gold-400 bg-gray-900 px-1.5 py-0.5 rounded">supabase_inventory_migration.sql</code> in the Supabase SQL Editor, then refresh.</p>
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

      {/* Chart of Accounts mapping (Dr/Cr defaults) */}
      <div className="glass-card p-4 md:p-5">
        <button onClick={() => setShowSettingsCard((v) => !v)} className="w-full flex items-center justify-between gap-3" aria-expanded={showSettingsCard}>
          <div className="flex items-start gap-3 text-left">
            <div className="p-2.5 bg-gold-500/10 rounded-xl">
              <Link2 className={settingsConfigured ? 'text-gold-500' : 'text-gray-500'} size={20} />
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-gray-500">Chart of Accounts Mapping (Dr/Cr defaults)</p>
              {settingsConfigured ? (
                <>
                  <p className="font-bold text-white mt-0.5">Connected — movements post journal entries</p>
                  <p className="text-xs text-gray-500 mt-0.5 truncate">
                    Inventory: {accName(settings?.inventory_account_id)} • COGS: {accName(settings?.cogs_account_id)} • Revenue: {accName(settings?.revenue_account_id)}
                  </p>
                </>
              ) : (
                <>
                  <p className="font-bold text-white mt-0.5">Not configured</p>
                  <p className="text-xs text-gray-500 mt-0.5">Pick which accounts stock movements post to — or run auto-setup to create them.</p>
                </>
              )}
            </div>
          </div>
          <div className="text-gray-500 shrink-0">
            {showSettingsCard ? <ChevronDown size={16} className="rotate-180" /> : <ChevronDown size={16} />}
          </div>
        </button>

        {showSettingsCard && (
          <div className="mt-4 pt-4 border-t border-gray-800/70 space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>Inventory (Asset) — Dr on purchase, Cr on sale/loss</label>
                <SearchableSelect options={accountOptions} value={sInv} onChange={setSInv} placeholder="Select asset account..." />
              </div>
              <div>
                <label className={labelCls}>COGS (Expense) — Dr on sale</label>
                <SearchableSelect options={accountOptions} value={sCogs} onChange={setCogs} placeholder="Select COGS account..." />
              </div>
              <div>
                <label className={labelCls}>Sales Revenue — Cr on sale</label>
                <SearchableSelect options={accountOptions} value={sRev} onChange={setSRev} placeholder="Select revenue account..." />
              </div>
              <div>
                <label className={labelCls}>Adjustment (Expense) — shrinkage / found</label>
                <SearchableSelect options={accountOptions} value={sAdj} onChange={setSAdj} placeholder="Select adjustment account..." />
              </div>
              <div>
                <label className={labelCls}>Default Bank/Cash — Cr on purchase, Dr on sale</label>
                <SearchableSelect options={paymentOptions} value={sPay} onChange={setSPay} placeholder="Select payment account..." />
              </div>
            </div>
            <div className="flex flex-col sm:flex-row gap-2 pt-1">
              <button onClick={handleSaveSettings} disabled={isSaving}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-gradient-to-r from-gold-500 to-amber-400 text-black font-bold rounded-xl text-sm active:scale-95 transition-transform disabled:opacity-40">
                <Check size={15} /> Save Mapping
              </button>
              <button onClick={autoSetup} disabled={isSaving}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-gray-900 hover:bg-gray-800 border border-gold-500/30 text-gold-400 font-bold rounded-xl text-sm active:scale-95 transition-all disabled:opacity-40">
                <PackageOpen size={15} /> Auto-Setup (create Inventory account + defaults)
              </button>
            </div>
            <p className="text-[10px] text-gray-600">
              A sale posts two entries: Dr Bank / Cr Revenue (sale value) and Dr COGS / Cr Inventory (cost). Items can override the Inventory, COGS and Revenue accounts individually.
            </p>
          </div>
        )}
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
        <div className="glass-card p-3.5">
          <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-gray-500"><Boxes size={12} /> Stock Value</div>
          <p className="font-mono text-base md:text-xl font-bold text-gold-400 mt-2 truncate">{fmt(stats.stockValue)}</p>
          <p className="text-[10px] text-gray-600 mt-0.5">{baseCurrency} • Σ qty × avg cost</p>
        </div>
        <div className="glass-card p-3.5">
          <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-gray-500"><Package size={12} /> Items</div>
          <p className="font-mono text-base md:text-xl font-bold text-white mt-2">{items.length}</p>
          <p className="text-[10px] text-gray-600 mt-0.5">tracked products</p>
        </div>
        <div className="glass-card p-3.5">
          <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-gray-500"><AlertTriangle size={12} className={stats.lowStock ? 'text-amber-400' : ''} /> Low Stock</div>
          <p className={`font-mono text-base md:text-xl font-bold mt-2 ${stats.lowStock ? 'text-amber-400' : 'text-white'}`}>{stats.lowStock}</p>
          <p className="text-[10px] text-gray-600 mt-0.5">at or below reorder level</p>
        </div>
        <div className="glass-card p-3.5">
          <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-gray-500"><TrendingUp size={12} /> Potential Profit</div>
          <p className="font-mono text-base md:text-xl font-bold text-emerald-400 mt-2 truncate">{fmt(Math.max(0, stats.potentialRevenue - stats.stockValue))}</p>
          <p className="text-[10px] text-gray-600 mt-0.5">
            {baseCurrency} • {stats.avgMargin !== null ? <span className={stats.avgMargin >= 0 ? 'text-emerald-400/80' : 'text-red-400/80'}>{fmtPct(stats.avgMargin)} margin</span> : 'set sale prices'}
          </p>
        </div>
      </div>

      {/* Items */}
      <div className="glass-card overflow-hidden">
        <div className="px-4 md:px-5 py-3.5 border-b border-gray-800/70 flex items-center justify-between">
          <p className="text-[10px] font-bold uppercase tracking-widest text-gray-500">Inventory Items ({items.length})</p>
          <p className="text-[10px] text-gray-600 hidden sm:block">Purchases Dr Inventory • Sales Dr Bank / Cr Revenue + Dr COGS / Cr Inventory</p>
        </div>

        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 p-4">{Array.from({length:4}).map((_,i)=>(<SkeletonCard key={i} />))}</div>
        ) : items.length === 0 ? (
          <div className="p-10 text-center">
            <Package size={40} className="mx-auto text-gray-700 mb-3" />
            <p className="text-gray-400 font-bold">No items yet</p>
            <p className="text-gray-600 text-sm mt-1">Add your first product to start tracking stock.</p>
            <button onClick={() => openItemForm(null)}
              className="mt-4 inline-flex items-center gap-2 bg-gradient-to-r from-gold-500 to-amber-400 text-black font-bold px-4 py-2 rounded-xl text-sm active:scale-95 transition-transform">
              <Plus size={16} /> Add Item
            </button>
          </div>
        ) : (
          <>
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[10px] uppercase tracking-widest text-gray-500 border-b border-gray-800/70">
                    <th className="pl-5 pr-4 py-3 font-bold">Item</th>
                    <th className="px-4 py-3 font-bold text-right">On Hand</th>
                    <th className="px-4 py-3 font-bold text-right">Avg Cost</th>
                    <th className="px-4 py-3 font-bold text-right">Stock Value</th>
                    <th className="px-4 py-3 font-bold text-right">Sale Price</th>
                    <th className="px-4 py-3 font-bold text-right">Margin</th>
                    <th className="px-4 py-3 font-bold text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>{items.map((i) => renderRow(i))}</tbody>
              </table>
            </div>
            <div className="md:hidden divide-y divide-gray-800/40">{items.map((i) => renderCard(i))}</div>
          </>
        )}
      </div>

      {/* ============ Modals ============ */}

      {/* POS quick entry */}
      <InventoryPOS
        open={showPOS}
        onClose={() => setShowPOS(false)}
        items={items}
        settings={settings}
        onDone={loadAll}
      />

      {/* Item form */}
      <Modal isOpen={showItemForm} onClose={() => setShowItemForm(false)} title={editItem ? 'Edit Item' : 'New Inventory Item'}>
        <div className="space-y-4">
          <div>
            <label className={labelCls}>Item Name *</label>
            <input value={fName} onChange={(e) => setFName(e.target.value)} placeholder="e.g. Copy Paper A4" className={inputCls} autoFocus />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>SKU</label>
              <input value={fSku} onChange={(e) => setFSku(e.target.value)} placeholder="Optional" className={`${inputCls} font-mono`} />
            </div>
            <div>
              <label className={labelCls}>Unit</label>
              <input value={fUnit} onChange={(e) => setFUnit(e.target.value)} placeholder="pcs, kg, box..." className={inputCls} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Category</label>
              <input value={fCategory} onChange={(e) => setFCategory(e.target.value)} placeholder="Optional" className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Reorder Level</label>
              <input value={fReorder} onChange={(e) => setFReorder(e.target.value)} inputMode="decimal" placeholder="e.g. 10" className={`${inputCls} font-mono`} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Cost Price ({baseCurrency}) *</label>
              <input value={fCost} onChange={(e) => setFCost(e.target.value)} onBlur={() => setFCost(fCost ? String(evaluateMathExpression(fCost)) : '')}
                inputMode="decimal" placeholder="0.00" className={`${inputCls} font-mono`} />
            </div>
            <div>
              <label className={labelCls}>Sale Price ({baseCurrency})</label>
              <input value={fSale} onChange={(e) => setFSale(e.target.value)} onBlur={() => setFSale(fSale ? String(evaluateMathExpression(fSale)) : '')}
                inputMode="decimal" placeholder="0.00" className={`${inputCls} font-mono`} />
            </div>
          </div>
          {marginPct(num(fCost), num(fSale)) !== null && num(fSale) > 0 && (() => {
            const m = marginPct(num(fCost), num(fSale))!;
            return (
              <p className={`text-[11px] font-mono ${m >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                Margin: {fmtPct(m)} • profit {fmt(num(fSale) - num(fCost))} per unit
              </p>
            );
          })()}
          <div>
            <label className={labelCls}>Notes</label>
            <input value={fNotes} onChange={(e) => setFNotes(e.target.value)} placeholder="Optional" className={inputCls} />
          </div>

          <button onClick={() => setShowAdvanced((v) => !v)} className="text-xs font-bold text-gold-400/90 flex items-center gap-1">
            <ChevronDown size={13} className={showAdvanced ? 'rotate-180 transition-transform' : 'transition-transform'} />
            Advanced: per-item account overrides (optional)
          </button>
          {showAdvanced && (
            <div className="space-y-3 bg-gray-900/60 border border-gray-800 rounded-xl p-3">
              <p className="text-[10px] text-gray-600">Leave empty to use the module defaults from the mapping card above.</p>
              <div>
                <label className={labelCls}>Inventory Account (override)</label>
                <SearchableSelect options={accountOptions} value={fInvAcc} onChange={setFInvAcc} placeholder="Default from settings" />
              </div>
              <div>
                <label className={labelCls}>COGS Account (override)</label>
                <SearchableSelect options={accountOptions} value={fCogsAcc} onChange={setFCogsAcc} placeholder="Default from settings" />
              </div>
              <div>
                <label className={labelCls}>Revenue Account (override)</label>
                <SearchableSelect options={accountOptions} value={fRevAcc} onChange={setFRevAcc} placeholder="Default from settings" />
              </div>
            </div>
          )}

          <button onClick={handleSaveItem} disabled={isSaving || !fName.trim()}
            className="w-full bg-gradient-to-r from-gold-500 to-amber-400 text-black font-bold py-3 rounded-xl active:scale-95 transition-transform disabled:opacity-40">
            {isSaving ? 'Saving...' : editItem ? 'Save Changes' : 'Add Item'}
          </button>
        </div>
      </Modal>

      {/* Stock In */}
      <Modal isOpen={!!stockInItem} onClose={() => setStockInItem(null)} title={`Stock In — ${stockInItem?.name ?? ''}`}>
        <div className="space-y-4">
          <div className="bg-gray-900/60 border border-gray-800 rounded-lg p-3 text-xs text-gray-500">
            Purchase: <span className="text-gold-400 font-mono">Dr {accName(effectiveAccounts(stockInItem || items[0] || { id: '' } as InventoryItem).inv)} / Cr Bank</span> — stock quantity rises and the moving-average cost is recalculated.
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Quantity {stockInItem?.unit ? `(${stockInItem.unit})` : ''} *</label>
              <input value={mQty} onChange={(e) => setMQty(e.target.value)} onBlur={() => setMQty(mQty ? String(evaluateMathExpression(mQty)) : '')}
                inputMode="decimal" placeholder="0" className={`${inputCls} font-mono`} autoFocus />
            </div>
            <div>
              <label className={labelCls}>Unit Cost ({baseCurrency}) *</label>
              <input value={mCost} onChange={(e) => setMCost(e.target.value)} onBlur={() => setMCost(mCost ? String(evaluateMathExpression(mCost)) : '')}
                inputMode="decimal" placeholder="0.00" className={`${inputCls} font-mono`} />
            </div>
          </div>
          {stockInItem && num(mQty) > 0 && (
            <p className="text-[11px] text-gray-500 font-mono">
              Total: {fmt(num(mQty) * num(mCost))} • New avg cost: {fmt(((stockInItem.quantity * stockInItem.cost_price + num(mQty) * num(mCost)) / (stockInItem.quantity + num(mQty))))}
            </p>
          )}
          <div>
            <label className={labelCls}>Paid From (Bank/Cash)</label>
            <SearchableSelect options={paymentOptions} value={mPayment} onChange={setMPayment} placeholder="Select payment account..." />
          </div>
          <div>
            <label className={labelCls}>Date</label>
            <input type="date" value={mDate} onChange={(e) => setMDate(e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Note</label>
            <input value={mNote} onChange={(e) => setMNote(e.target.value)} placeholder="Optional — e.g. supplier, invoice #" className={inputCls} />
          </div>
          <button onClick={handleStockIn} disabled={isSaving || !mQty.trim()}
            className="w-full bg-gradient-to-r from-gold-500 to-amber-400 text-black font-bold py-3 rounded-xl active:scale-95 transition-transform disabled:opacity-40">
            {isSaving ? 'Saving...' : 'Record Purchase'}
          </button>
        </div>
      </Modal>

      {/* Sale */}
      <Modal isOpen={!!saleItem} onClose={() => setSaleItem(null)} title={`Record Sale — ${saleItem?.name ?? ''}`}>
        <div className="space-y-4">
          <div className="bg-gray-900/60 border border-gray-800 rounded-lg p-3 text-xs text-gray-500">
            Posts: <span className="text-gold-400 font-mono">Dr Bank / Cr Revenue</span> (sale) + <span className="text-gold-400 font-mono">Dr COGS / Cr Inventory</span> (cost) — stock decreases.
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Quantity {saleItem?.unit ? `(${saleItem.unit})` : ''} * — {saleItem ? `${fmtQty(saleItem.quantity)} on hand` : ''}</label>
              <input value={mQty} onChange={(e) => setMQty(e.target.value)} onBlur={() => setMQty(mQty ? String(evaluateMathExpression(mQty)) : '')}
                inputMode="decimal" placeholder="0" className={`${inputCls} font-mono`} autoFocus />
            </div>
            <div>
              <label className={labelCls}>Unit Price ({baseCurrency}) *</label>
              <input value={mPrice} onChange={(e) => setMPrice(e.target.value)} onBlur={() => setMPrice(mPrice ? String(evaluateMathExpression(mPrice)) : '')}
                inputMode="decimal" placeholder="0.00" className={`${inputCls} font-mono`} />
            </div>
          </div>
          {saleItem && num(mQty) > 0 && (
            <div className="text-[11px] text-gray-500 font-mono space-y-0.5">
              <p>Revenue: {fmt(num(mQty) * num(mPrice))} • COGS @ {fmt(saleItem.cost_price)}: {fmt(num(mQty) * saleItem.cost_price)}</p>
              {(() => {
                const revenue = num(mQty) * num(mPrice);
                const m = marginPct(num(mQty) * saleItem.cost_price, revenue);
                return (
                  <p className="text-emerald-400">
                    Margin: {fmt(revenue - num(mQty) * saleItem.cost_price)}{m !== null ? ` (${fmtPct(m)})` : ''}
                  </p>
                );
              })()}
            </div>
          )}
          <div>
            <label className={labelCls}>Deposit To (Bank/Cash)</label>
            <SearchableSelect options={paymentOptions} value={mPayment} onChange={setMPayment} placeholder="Select payment account..." />
          </div>
          <div>
            <label className={labelCls}>Date</label>
            <input type="date" value={mDate} onChange={(e) => setMDate(e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Note</label>
            <input value={mNote} onChange={(e) => setMNote(e.target.value)} placeholder="Optional — e.g. customer" className={inputCls} />
          </div>
          <button onClick={handleSale} disabled={isSaving || !mQty.trim()}
            className="w-full bg-gradient-to-r from-gold-500 to-amber-400 text-black font-bold py-3 rounded-xl active:scale-95 transition-transform disabled:opacity-40">
            {isSaving ? 'Saving...' : 'Record Sale'}
          </button>
        </div>
      </Modal>

      {/* Adjustment */}
      <Modal isOpen={!!adjustItem} onClose={() => setAdjustItem(null)} title={`Adjust Stock — ${adjustItem?.name ?? ''}`}>
        <div className="space-y-4">
          <div className="bg-gray-900/60 border border-gray-800 rounded-lg p-3 text-xs text-gray-500">
            Write-offs post <span className="text-gold-400 font-mono">Dr Adjustment / Cr Inventory</span>; found stock posts the reverse — valued at avg cost ({adjustItem ? fmt(adjustItem.cost_price) : '0'}).
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button onClick={() => setMDirection('out')}
              className={`py-3 rounded-xl text-xs font-bold uppercase tracking-widest border transition-colors ${mDirection === 'out' ? 'bg-red-500/10 border-red-500/40 text-red-400' : 'bg-gray-900 border-gray-800 text-gray-500'}`}>
              − Write Off / Loss
            </button>
            <button onClick={() => setMDirection('in')}
              className={`py-3 rounded-xl text-xs font-bold uppercase tracking-widest border transition-colors ${mDirection === 'in' ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-400' : 'bg-gray-900 border-gray-800 text-gray-500'}`}>
              + Found / Add
            </button>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Quantity {adjustItem?.unit ? `(${adjustItem.unit})` : ''} * {adjustItem ? `— ${fmtQty(adjustItem.quantity)} on hand` : ''}</label>
              <input value={mQty} onChange={(e) => setMQty(e.target.value)} onBlur={() => setMQty(mQty ? String(evaluateMathExpression(mQty)) : '')}
                inputMode="decimal" placeholder="0" className={`${inputCls} font-mono`} autoFocus />
            </div>
            <div>
              <label className={labelCls}>Date</label>
              <input type="date" value={mDate} onChange={(e) => setMDate(e.target.value)} className={inputCls} />
            </div>
          </div>
          <div>
            <label className={labelCls}>Note</label>
            <input value={mNote} onChange={(e) => setMNote(e.target.value)} placeholder="Optional — reason" className={inputCls} />
          </div>
          <button onClick={handleAdjust} disabled={isSaving || !mQty.trim()}
            className="w-full bg-gradient-to-r from-gold-500 to-amber-400 text-black font-bold py-3 rounded-xl active:scale-95 transition-transform disabled:opacity-40">
            {isSaving ? 'Saving...' : 'Record Adjustment'}
          </button>
        </div>
      </Modal>

      {/* History */}
      <Modal isOpen={!!historyItem} onClose={() => setHistoryItem(null)} title={`Movements — ${historyItem?.name ?? ''}`}>
        <div className="space-y-2.5">
          {itemMovements.length === 0 ? (
            <p className="text-xs text-gray-600 text-center py-6">No movements yet.</p>
          ) : itemMovements.map((m) => (
            <div key={m.id} className="flex items-center justify-between gap-3 bg-gray-900/60 border border-gray-800 rounded-lg px-3 py-2.5 text-sm">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <MovementBadge type={m.movement_type} />
                  <span className="text-gray-400 font-mono text-xs">{format(parseISO(m.movement_date), 'dd MMM yyyy')}</span>
                  {m.gl_transaction_ids && m.gl_transaction_ids.length > 0 ? (
                    <span className="text-[9px] text-gold-500/70 font-bold uppercase">{m.gl_transaction_ids.length} GL</span>
                  ) : (
                    <span className="text-[9px] text-gray-600 font-bold uppercase">No GL</span>
                  )}
                </div>
                <p className="text-xs text-gray-500 mt-0.5 truncate">
                  {m.movement_type === 'sale'
                    ? `@ ${fmt(m.unit_price || 0)} → revenue ${fmt(m.total_price || 0)} • COGS ${fmt(m.total_cost || 0)}`
                    : `@ ${fmt(m.unit_cost || 0)} → ${fmt(m.total_cost || 0)}`}
                  {m.note && <span className="text-gray-600"> • {m.note}</span>}
                </p>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <span className={`font-mono font-bold ${m.movement_type === 'purchase' || (m.movement_type === 'adjustment' && m.quantity > 0) ? 'text-emerald-400' : m.movement_type === 'sale' ? 'text-blue-400' : 'text-red-400'}`}>
                  {m.movement_type === 'sale' ? '−' : m.movement_type === 'purchase' ? '+' : (m.quantity > 0 ? '+' : '')}
                  {fmtQty(Math.abs(m.quantity))}
                </span>
                <button onClick={() => handleDeleteMovement(m)} className="text-gray-600 hover:text-red-400 transition-colors" title="Delete movement">
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))}
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
