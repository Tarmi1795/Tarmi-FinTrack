import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useFinance } from '../context/FinanceContext';
import { invoicingService } from '../services/invoicing';
import { Invoice, InvoiceLine, Transaction, Receivable, CurrencyCode } from '../types';
import { format, addDays } from 'date-fns';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Receipt, Plus, RefreshCw, AlertTriangle, X, Send, CheckCircle, Printer,
  Pencil, Ban, Trash2, Share2, FileText, Wallet, BadgeCheck, Info
} from 'lucide-react';
import { Modal } from '../components/ui/Modal';
import { SearchableSelect } from '../components/ui/SearchableSelect';
import { confirmDialog, alertDialog } from '../components/ui/ConfirmDialog';
import { SkeletonCard } from '../components/ui/Skeleton';

// ---------- helpers ----------

const todayStr = () => format(new Date(), 'yyyy-MM-dd');
const daysFromNowStr = (days: number) => format(addDays(new Date(), days), 'yyyy-MM-dd');
const fmt = (n: number) => n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const round2 = (n: number) => Math.round(n * 100) / 100;
// 9-char id, same pattern ApAr uses for receivables / journal entries
const genId = () => Math.random().toString(36).substr(2, 9);

const fmtDate = (d: string) => {
  try { return format(new Date(`${d}T00:00:00`), 'MMM d, yyyy'); } catch { return d; }
};

// subtotal = Σ qty*unit_price; total = subtotal − discount + subtotal*tax_pct/100
const computeTotals = (lines: InvoiceLine[], taxPct: number, discount: number) => {
  const subtotal = round2((lines || []).reduce((s, l) => s + (Number(l.quantity) || 0) * (Number(l.unit_price) || 0), 0));
  const total = round2(subtotal - (Number(discount) || 0) + (subtotal * (Number(taxPct) || 0)) / 100);
  return { subtotal, total };
};

const invoiceTotalOf = (inv: Invoice) => computeTotals(inv.lines || [], inv.tax_pct || 0, inv.discount || 0).total;

const isOverdueInv = (inv: Invoice, today: string) =>
  (inv.status === 'sent' || inv.status === 'partial') && inv.due_date < today;

const fmtCurrencyMap = (m: Record<string, number>) => {
  const entries = Object.entries(m);
  if (!entries.length) return '—';
  return entries.map(([c, v]) => `${c} ${fmt(v)}`).join(' • ');
};

const STATUS_META: Record<Invoice['status'], { label: string; cls: string }> = {
  quote: { label: 'Quote', cls: 'bg-violet-500/10 text-violet-400 border-violet-500/30' },
  sent: { label: 'Sent', cls: 'bg-blue-500/10 text-blue-400 border-blue-500/30' },
  partial: { label: 'Partial', cls: 'bg-amber-500/10 text-amber-400 border-amber-500/30' },
  paid: { label: 'Paid', cls: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' },
  void: { label: 'Void', cls: 'bg-gray-500/10 text-gray-400 border-gray-500/30' },
};

const StatusChip: React.FC<{ inv: Invoice; today: string }> = ({ inv, today }) => {
  const meta = STATUS_META[inv.status] || STATUS_META.quote;
  const overdue = isOverdueInv(inv, today);
  return (
    <span className={`inline-flex items-center gap-1.5 text-[10px] px-2 py-0.5 rounded-full border font-bold uppercase tracking-wider ${meta.cls}`}>
      {overdue && <span className="w-1.5 h-1.5 rounded-full bg-red-500" title="Overdue" />}
      {meta.label}
    </span>
  );
};

// Line editor keeps strings for smooth typing; converted to InvoiceLine on save/totals
interface LineDraft { description: string; quantity: string; unit_price: string; }
const draftToLine = (d: LineDraft): InvoiceLine => ({
  description: d.description.trim(),
  quantity: Number(d.quantity) || 0,
  unit_price: Number(d.unit_price) || 0,
});
const lineToDraft = (l: InvoiceLine): LineDraft => ({
  description: l.description || '',
  quantity: String(l.quantity ?? ''),
  unit_price: String(l.unit_price ?? ''),
});

type FilterKey = 'all' | 'quote' | 'sent' | 'overdue' | 'paid';
const FILTER_LABELS: Record<FilterKey, string> = { all: 'All', quote: 'Quotes', sent: 'Sent', overdue: 'Overdue', paid: 'Paid' };

// ---------- component ----------

export const Invoices: React.FC = () => {
  const { user, state, dispatch } = useFinance();

  // Data / loading
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [needsMigration, setNeedsMigration] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterKey>('all');

  // Form modal
  const [showForm, setShowForm] = useState(false);
  const [editingInvoice, setEditingInvoice] = useState<Invoice | null>(null);
  const [fInvoiceNo, setFInvoiceNo] = useState('');
  const [fPartyId, setFPartyId] = useState('');
  const [fPartyName, setFPartyName] = useState('');
  const [fIssueDate, setFIssueDate] = useState(todayStr());
  const [fDueDate, setFDueDate] = useState(daysFromNowStr(14));
  const [fCurrency, setFCurrency] = useState<'QAR' | 'PHP'>('QAR');
  const [fLines, setFLines] = useState<LineDraft[]>([{ description: '', quantity: '1', unit_price: '' }]);
  const [fTaxPct, setFTaxPct] = useState('0');
  const [fDiscount, setFDiscount] = useState('0');
  const [fNotes, setFNotes] = useState('');

  // Send (convert) modal
  const [sendInvoice, setSendInvoice] = useState<Invoice | null>(null);
  const [fRevenueAccountId, setFRevenueAccountId] = useState('');

  // Payment modal
  const [payInvoice, setPayInvoice] = useState<Invoice | null>(null);
  const [fBankAccountId, setFBankAccountId] = useState('');

  // Print / share modal
  const [printInvoice, setPrintInvoice] = useState<Invoice | null>(null);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  };

  const handleError = (e: any, fallback: string) => {
    if (invoicingService.isMissingTableError(e)) {
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
      const rows = await invoicingService.getInvoices(user.id);
      setInvoices(rows);
    } catch (e: any) {
      if (invoicingService.isMissingTableError(e)) {
        setNeedsMigration(true);
      } else {
        setLoadError(e?.message || 'Failed to load invoices.');
      }
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  useEffect(() => { loadAll(); }, [loadAll]);

  // ---------- Chart of Accounts resolution (mirrors pages/ApAr.tsx) ----------

  const partyOptions = state.parties.map((p) => ({
    id: p.id,
    label: p.name,
    subLabel: p.type.charAt(0).toUpperCase() + p.type.slice(1),
  }));

  // Revenue posting accounts (Cr side of the accrual) — sub-ledgers first, then GL-level
  const revenueOptions = state.accounts
    .filter((a) => a.isPosting && a.class === 'Revenue' && (a.level === 'sub_ledger' || a.level === 'gl'))
    .map((a) => ({ id: a.id, label: a.name, subLabel: a.code }));

  // Only Cash & Cash Equivalents (111xx) — same rule as ApAr payment modal
  const cashGroup = state.accounts.find((a) => a.code === '11100');
  const cashOptions = state.accounts
    .filter((a) =>
      a.isPosting &&
      (
        a.code.startsWith('111') ||
        (cashGroup && a.parentId === cashGroup.id)
      )
    )
    .map((a) => ({ id: a.id, label: a.name, subLabel: a.code }));

  // ApAr only posts accruals to the party's sub-ledger; when a party has none,
  // fall back to the standard General Receivables sub-ledger (11201).
  const fallbackArAccountId = useMemo(() => {
    const general = state.accounts.find((a) => a.code === '11201' && a.isPosting);
    return general?.id || 'asset_ar_general';
  }, [state.accounts]);

  // AR account used at accrual time — resolve for the settlement entry
  const resolveArAccountId = (inv: Invoice): string => {
    if (inv.gl_receivable_id) {
      // 1. The linked receivable's party sub-ledger
      const rec = state.receivables.find((r) => r.id === inv.gl_receivable_id);
      const recParty = rec?.partyId ? state.parties.find((p) => p.id === rec.partyId) : undefined;
      if (recParty?.linkedAccountId) return recParty.linkedAccountId;
      // 2. The accrual journal entry found by its note Ref:<gl_receivable_id>
      const accrual = state.transactions.find(
        (t) => t.note?.includes(`Ref:${inv.gl_receivable_id}`) && (t.note?.startsWith('Accrual') ?? false)
      );
      if (accrual?.accountId) return accrual.accountId;
    }
    // 3. The invoice's own party
    const party = inv.party_id ? state.parties.find((p) => p.id === inv.party_id) : undefined;
    if (party?.linkedAccountId) return party.linkedAccountId;
    // 4. General Receivables fallback
    return fallbackArAccountId;
  };

  // ---------- Derived data ----------

  const today = todayStr();

  const counts: Record<FilterKey, number> = useMemo(() => ({
    all: invoices.length,
    quote: invoices.filter((i) => i.status === 'quote').length,
    sent: invoices.filter((i) => i.status === 'sent' || i.status === 'partial').length,
    overdue: invoices.filter((i) => isOverdueInv(i, today)).length,
    paid: invoices.filter((i) => i.status === 'paid').length,
  }), [invoices, today]);

  const filteredList = useMemo(() => (
    invoices.filter((inv) => {
      switch (filter) {
        case 'quote': return inv.status === 'quote';
        case 'sent': return inv.status === 'sent' || inv.status === 'partial';
        case 'overdue': return isOverdueInv(inv, today);
        case 'paid': return inv.status === 'paid';
        default: return true;
      }
    }).sort((a, b) => b.issue_date.localeCompare(a.issue_date) || b.invoice_no.localeCompare(a.invoice_no))
  ), [invoices, filter, today]);

  const summary = useMemo(() => {
    const outstanding: Record<string, number> = {};
    const paidThisMonth: Record<string, number> = {};
    let quotesOpen = 0;
    const monthKey = today.slice(0, 7);
    invoices.forEach((inv) => {
      const t = invoiceTotalOf(inv);
      if (inv.status === 'sent' || inv.status === 'partial') {
        outstanding[inv.currency] = (outstanding[inv.currency] || 0) + t;
      }
      if (inv.status === 'paid') {
        const stamp = (inv.updated_at || inv.issue_date).slice(0, 10);
        if (stamp.slice(0, 7) === monthKey) {
          paidThisMonth[inv.currency] = (paidThisMonth[inv.currency] || 0) + t;
        }
      }
      if (inv.status === 'quote') quotesOpen++;
    });
    return { outstanding, paidThisMonth, quotesOpen, total: invoices.length };
  }, [invoices, today]);

  const formTotals = useMemo(
    () => computeTotals(fLines.map(draftToLine), Number(fTaxPct) || 0, Number(fDiscount) || 0),
    [fLines, fTaxPct, fDiscount]
  );

  const sendParty = sendInvoice?.party_id ? state.parties.find((p) => p.id === sendInvoice.party_id) : undefined;
  const sendDrAccountName = sendParty?.linkedAccountId
    ? (state.accounts.find((a) => a.id === sendParty.linkedAccountId)?.name || 'party sub-ledger')
    : `${state.accounts.find((a) => a.id === fallbackArAccountId)?.name || 'General Receivables'} (fallback)`;
  const sendCrAccountName = state.accounts.find((a) => a.id === fRevenueAccountId)?.name || 'revenue';
  const payCrAccountName = payInvoice
    ? (state.accounts.find((a) => a.id === resolveArAccountId(payInvoice))?.name || 'Accounts Receivable')
    : '';
  const payDrAccountName = state.accounts.find((a) => a.id === fBankAccountId)?.name || 'bank';

  // ---------- Form actions ----------

  const openForm = async (inv: Invoice | null) => {
    setEditingInvoice(inv);
    if (inv) {
      setFInvoiceNo(inv.invoice_no);
      setFPartyId(inv.party_id || '');
      setFPartyName(inv.party_name);
      setFIssueDate(inv.issue_date);
      setFDueDate(inv.due_date);
      setFCurrency(inv.currency === 'PHP' ? 'PHP' : 'QAR');
      setFLines((inv.lines && inv.lines.length) ? inv.lines.map(lineToDraft) : [{ description: '', quantity: '1', unit_price: '' }]);
      setFTaxPct(String(inv.tax_pct ?? 0));
      setFDiscount(String(inv.discount ?? 0));
      setFNotes(inv.notes || '');
    } else {
      setFInvoiceNo('INV-0001');
      setFPartyId('');
      setFPartyName('');
      setFIssueDate(todayStr());
      setFDueDate(daysFromNowStr(14));
      setFCurrency('QAR');
      setFLines([{ description: '', quantity: '1', unit_price: '' }]);
      setFTaxPct('0');
      setFDiscount('0');
      setFNotes('');
      if (user) {
        try {
          setFInvoiceNo(await invoicingService.nextInvoiceNo(user.id));
        } catch (e: any) {
          if (invoicingService.isMissingTableError(e)) setNeedsMigration(true);
        }
      }
    }
    setShowForm(true);
  };

  const updateLine = (idx: number, patch: Partial<LineDraft>) =>
    setFLines((prev) => prev.map((l, i) => (i === idx ? { ...l, ...patch } : l)));
  const addLine = () => setFLines((prev) => [...prev, { description: '', quantity: '1', unit_price: '' }]);
  const removeLine = (idx: number) =>
    setFLines((prev) => (prev.length > 1 ? prev.filter((_, i) => i !== idx) : prev));

  const handleSaveInvoice = async () => {
    if (!user) return;
    if (!fPartyName.trim()) {
      alertDialog({ title: 'Missing customer', message: 'Select a party or enter a customer name.' });
      return;
    }
    if (!fInvoiceNo.trim()) {
      alertDialog({ title: 'Missing invoice number', message: 'Enter an invoice number (e.g. INV-0001).' });
      return;
    }
    const payload: Omit<Invoice, 'id' | 'user_id'> = {
      invoice_no: fInvoiceNo.trim(),
      status: editingInvoice ? editingInvoice.status : 'quote',
      party_id: fPartyId || null,
      party_name: fPartyName.trim(),
      issue_date: fIssueDate || todayStr(),
      due_date: fDueDate || daysFromNowStr(14),
      currency: fCurrency,
      lines: fLines.map(draftToLine),
      tax_pct: Number(fTaxPct) || 0,
      discount: Number(fDiscount) || 0,
      notes: fNotes.trim() || undefined,
      gl_receivable_id: editingInvoice?.gl_receivable_id ?? null,
    };
    setIsSaving(true);
    try {
      if (editingInvoice) {
        await invoicingService.updateInvoice(user.id, editingInvoice.id, payload);
        setInvoices((prev) => prev.map((i) => (i.id === editingInvoice.id ? { ...i, ...payload } : i)));
        showToast(`${payload.invoice_no} updated.`);
      } else {
        const created = await invoicingService.createInvoice(user.id, payload);
        setInvoices((prev) => [created, ...prev]);
        showToast(`${created.invoice_no} saved as ${STATUS_META[created.status]?.label || created.status}.`);
      }
      setShowForm(false);
    } catch (e: any) {
      handleError(e, 'Failed to save invoice.');
    } finally {
      setIsSaving(false);
    }
  };

  // ---------- Send / Convert (quote → sent, posts receivable + accrual) ----------

  const openSend = (inv: Invoice) => {
    setFRevenueAccountId(revenueOptions[0]?.id || '');
    setSendInvoice(inv);
  };

  const confirmSend = async () => {
    if (!user || !sendInvoice || !fRevenueAccountId) return;
    const inv = sendInvoice;
    const total = invoiceTotalOf(inv);
    const party = inv.party_id ? state.parties.find((p) => p.id === inv.party_id) : undefined;
    // Dr the party's sub-ledger like ApAr; fall back to General Receivables when unlinked
    const arAccountId = party?.linkedAccountId || fallbackArAccountId;
    const receivableId = genId();

    setIsSaving(true);
    try {
      await invoicingService.updateInvoice(user.id, inv.id, { status: 'sent', gl_receivable_id: receivableId });

      // 1) Receivable record — same shape ApAr creates on save
      const receivable: Receivable = {
        id: receivableId,
        type: 'receivable',
        subType: 'invoice',
        partyId: inv.party_id || undefined,
        partyName: inv.party_name,
        targetAccountId: fRevenueAccountId,
        amount: total,
        paidAmount: 0,
        originalAmount: total,
        currency: inv.currency as CurrencyCode,
        issueDate: new Date(`${inv.issue_date}T00:00:00`).toISOString(),
        dueDate: new Date(`${inv.due_date}T00:00:00`).toISOString(),
        status: 'pending',
        notes: `Invoice ${inv.invoice_no}`,
      };
      dispatch({ type: 'ADD_RECEIVABLE', payload: receivable });

      // 2) Accrual journal entry — mirrors ApAr createAccrualTransaction (Dr Party AR / Cr Revenue)
      const accrual: Transaction = {
        id: genId(),
        date: new Date(`${inv.issue_date}T00:00:00`).toISOString(),
        type: 'income',
        amount: total,
        originalAmount: total,
        currency: inv.currency as CurrencyCode,
        source: 'side_hustle',
        note: `Accrual: invoice Ref:${receivableId}`,
        relatedPartyId: inv.party_id || undefined,
        accountId: arAccountId,              // Dr Party AR (Asset)
        paymentAccountId: fRevenueAccountId, // Cr Revenue
        receivableId,
      };
      dispatch({ type: 'ADD_TRANSACTION', payload: accrual });

      setInvoices((prev) => prev.map((i) => (i.id === inv.id ? { ...i, status: 'sent', gl_receivable_id: receivableId } : i)));
      showToast(`${inv.invoice_no} sent — receivable & accrual posted to the ledger.`);
      setSendInvoice(null);
    } catch (e: any) {
      handleError(e, 'Failed to send invoice.');
    } finally {
      setIsSaving(false);
    }
  };

  // ---------- Mark paid (settlement entry + receivable settled) ----------

  const markPaidNoLedger = async (inv: Invoice) => {
    if (!user) return;
    setIsSaving(true);
    try {
      await invoicingService.updateInvoice(user.id, inv.id, { status: 'paid' });
      setInvoices((prev) => prev.map((i) => (i.id === inv.id ? { ...i, status: 'paid', updated_at: new Date().toISOString() } : i)));
      showToast(`${inv.invoice_no} marked as paid (no ledger entry).`);
    } catch (e: any) {
      handleError(e, 'Failed to update invoice.');
    } finally {
      setIsSaving(false);
    }
  };

  const openPay = async (inv: Invoice) => {
    if (!inv.gl_receivable_id) {
      const ok = await confirmDialog({
        title: `Mark ${inv.invoice_no} as paid?`,
        message: 'This invoice has no linked receivable (it was never sent to the ledger), so no journal entry will be recorded.',
        confirmLabel: 'Mark Paid',
      });
      if (ok) await markPaidNoLedger(inv);
      return;
    }
    // Default bank account (code 11110), like ApAr defaults to a bank
    const bank = state.accounts.find((a) => a.code === '11110') || cashOptions[0];
    setFBankAccountId(bank ? bank.id : '');
    setPayInvoice(inv);
  };

  const confirmPayment = async () => {
    if (!user || !payInvoice || !fBankAccountId) return;
    const inv = payInvoice;
    const glReceivableId = inv.gl_receivable_id as string;
    const total = invoiceTotalOf(inv);
    const arAccountId = resolveArAccountId(inv);

    setIsSaving(true);
    try {
      await invoicingService.updateInvoice(user.id, inv.id, { status: 'paid' });

      // Settlement journal entry — mirrors ApAr settlement (Dr Bank / Cr the AR account used at accrual)
      const tx: Transaction = {
        id: genId(),
        date: new Date().toISOString(),
        type: 'income',
        amount: total,
        originalAmount: total,
        currency: inv.currency as CurrencyCode,
        source: 'side_hustle',
        note: `Settlement (Full): invoice Ref:${glReceivableId}`,
        relatedPartyId: inv.party_id || undefined,
        accountId: fBankAccountId,     // Dr Bank
        paymentAccountId: arAccountId, // Cr the AR account used at accrual
        receivableId: glReceivableId,
      };
      dispatch({ type: 'ADD_TRANSACTION', payload: tx });

      // Settle the linked receivable in full
      const linked = state.receivables.find((r) => r.id === glReceivableId);
      if (linked) {
        dispatch({
          type: 'UPDATE_RECEIVABLE',
          payload: { ...linked, paidAmount: linked.amount, status: 'paid', paidDate: new Date().toISOString() },
        });
      }

      setInvoices((prev) => prev.map((i) => (i.id === inv.id ? { ...i, status: 'paid', updated_at: new Date().toISOString() } : i)));
      showToast(`${inv.invoice_no} paid — settlement posted to the ledger.`);
      setPayInvoice(null);
    } catch (e: any) {
      handleError(e, 'Failed to mark invoice as paid.');
    } finally {
      setIsSaving(false);
    }
  };

  // ---------- Void / Delete ----------

  const handleVoid = async (inv: Invoice) => {
    const ok = await confirmDialog({
      title: `Void ${inv.invoice_no}?`,
      message: 'The invoice will be marked as void and excluded from outstanding totals. Ledger entries already posted are not touched.',
      confirmLabel: 'Void',
    });
    if (!ok || !user) return;
    setIsSaving(true);
    try {
      await invoicingService.updateInvoice(user.id, inv.id, { status: 'void' });
      setInvoices((prev) => prev.map((i) => (i.id === inv.id ? { ...i, status: 'void', updated_at: new Date().toISOString() } : i)));
      showToast(`${inv.invoice_no} voided.`);
    } catch (e: any) {
      handleError(e, 'Failed to void invoice.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (inv: Invoice) => {
    const hasLedger = !!inv.gl_receivable_id;
    const accrualTx = hasLedger
      ? state.transactions.find((t) => t.note?.includes(`Ref:${inv.gl_receivable_id}`) && (t.note?.startsWith('Accrual') ?? false))
      : undefined;
    const ok = await confirmDialog({
      title: `Delete ${inv.invoice_no}?`,
      message: hasLedger
        ? 'This permanently deletes the invoice AND its ledger footprint: the accrual journal entry and the linked receivable will also be removed. This cannot be undone.'
        : 'This permanently deletes the invoice. This cannot be undone.',
      danger: true,
      confirmLabel: 'Delete',
    });
    if (!ok || !user) return;
    setIsSaving(true);
    try {
      if (inv.gl_receivable_id) {
        if (accrualTx) dispatch({ type: 'DELETE_TRANSACTION', payload: accrualTx.id });
        dispatch({ type: 'DELETE_RECEIVABLE', payload: inv.gl_receivable_id });
      }
      await invoicingService.deleteInvoice(user.id, inv.id);
      setInvoices((prev) => prev.filter((i) => i.id !== inv.id));
      showToast(`${inv.invoice_no} deleted.`);
    } catch (e: any) {
      handleError(e, 'Failed to delete invoice.');
    } finally {
      setIsSaving(false);
    }
  };

  // ---------- Print / WhatsApp (mirrors components/InvoiceModal.tsx) ----------

  const handlePrint = () => window.print();

  const handleWhatsAppShare = (inv: Invoice) => {
    const profile = state.businessProfile;
    const party = (inv.party_id && state.parties.find((p) => p.id === inv.party_id))
      || state.parties.find((p) => p.name === inv.party_name);
    const text = `Hello ${inv.party_name},\nHere is your invoice ${inv.invoice_no}.\nAmount: ${inv.currency} ${fmt(invoiceTotalOf(inv))}\nDue Date: ${inv.due_date}\n\nThank you,\n${profile.name}`;
    const url = `https://wa.me/${party?.phone?.replace(/\D/g, '') || ''}?text=${encodeURIComponent(text)}`;
    window.open(url, '_blank');
  };

  const printParty = printInvoice
    ? (printInvoice.party_id && state.parties.find((p) => p.id === printInvoice.party_id))
      || state.parties.find((p) => p.name === printInvoice.party_name)
    : undefined;
  const printTotals = printInvoice ? computeTotals(printInvoice.lines || [], printInvoice.tax_pct || 0, printInvoice.discount || 0) : null;

  // ---------- row action helpers ----------

  const canSend = (inv: Invoice) => inv.status === 'quote';
  const canPay = (inv: Invoice) => inv.status === 'sent' || inv.status === 'partial';
  const canEdit = (inv: Invoice) => inv.status === 'quote' || inv.status === 'sent' || inv.status === 'partial';
  const canVoid = (inv: Invoice) => inv.status === 'quote' || inv.status === 'sent' || inv.status === 'partial';

  const rowActions = (inv: Invoice) => (
    <>
      {canSend(inv) && <IconBtn title="Send (post to ledger)" gold onClick={() => openSend(inv)} icon={<Send size={15} />} />}
      {canPay(inv) && <IconBtn title="Mark paid" onClick={() => openPay(inv)} icon={<CheckCircle size={15} />} />}
      <IconBtn title="Print / Share" onClick={() => setPrintInvoice(inv)} icon={<Printer size={15} />} />
      {canEdit(inv) && <IconBtn title="Edit" onClick={() => openForm(inv)} icon={<Pencil size={15} />} />}
      {canVoid(inv) && <IconBtn title="Void" onClick={() => handleVoid(inv)} icon={<Ban size={15} />} />}
      <IconBtn title="Delete" danger onClick={() => handleDelete(inv)} icon={<Trash2 size={15} />} />
    </>
  );

  const mobileActions = (inv: Invoice) => (
    <>
      {canSend(inv) && <MiniBtn onClick={() => openSend(inv)} label="Send" icon={<Send size={13} />} gold />}
      {canPay(inv) && <MiniBtn onClick={() => openPay(inv)} label="Mark Paid" icon={<CheckCircle size={13} />} />}
      <MiniBtn onClick={() => setPrintInvoice(inv)} label="Print" icon={<Printer size={13} />} />
      {canEdit(inv) && <MiniBtn onClick={() => openForm(inv)} label="" icon={<Pencil size={13} />} />}
      {canVoid(inv) && <MiniBtn onClick={() => handleVoid(inv)} label="" icon={<Ban size={13} />} />}
      <MiniBtn onClick={() => handleDelete(inv)} label="" icon={<Trash2 size={13} />} danger />
    </>
  );

  const inputCls = "w-full bg-gray-900/70 border border-gray-700 rounded-lg px-3 py-2.5 text-white focus:border-gold-500 focus:ring-1 focus:ring-gold-500/30 outline-none transition-colors";
  const labelCls = "block text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-1.5";

  // ---------- render ----------

  return (
    <div className="space-y-4 md:space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl md:text-3xl font-bold flex items-center gap-2.5">
            <Receipt className="text-gold-500" size={24} />
            <span className="text-gold-gradient">Invoices</span>
          </h1>
          <p className="text-gray-500 text-sm mt-1">Quotes, invoices &amp; payments • posts to the ledger on send</p>
        </div>
        <div className="flex gap-2">
          <button onClick={loadAll} className="p-2.5 bg-gray-900 hover:bg-gray-800 border border-gray-800 rounded-xl text-gray-400 hover:text-white transition-colors active:scale-95" title="Refresh">
            <RefreshCw size={18} className={isLoading ? 'animate-spin' : ''} />
          </button>
          <button
            onClick={() => openForm(null)}
            className="flex items-center gap-2 bg-gradient-to-r from-gold-500 to-amber-400 text-black font-bold px-4 py-2.5 rounded-xl hover:shadow-lg hover:shadow-gold-500/20 transition-all active:scale-95 text-sm"
          >
            <Plus size={18} /> New Invoice
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
              <p className="font-bold text-amber-300">Invoices table not found in Supabase</p>
              <p className="text-gray-400 mt-1">Run <code className="text-gold-400 bg-gray-900 px-1.5 py-0.5 rounded">supabase_invoicing_migration.sql</code> in the Supabase SQL Editor, then refresh this page.</p>
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
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
        <div className="glass-card p-3.5">
          <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-gray-500"><Wallet size={12} /> Outstanding</div>
          <p className="font-mono text-sm md:text-xl font-bold text-white mt-2 truncate" title={fmtCurrencyMap(summary.outstanding)}>{fmtCurrencyMap(summary.outstanding)}</p>
          <p className="text-[10px] text-gray-600 mt-0.5">sent + partial invoices</p>
        </div>
        <div className="glass-card p-3.5">
          <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-gray-500"><BadgeCheck size={12} className="text-emerald-400" /> Paid This Month</div>
          <p className="font-mono text-sm md:text-xl font-bold text-emerald-400 mt-2 truncate" title={fmtCurrencyMap(summary.paidThisMonth)}>{fmtCurrencyMap(summary.paidThisMonth)}</p>
          <p className="text-[10px] text-gray-600 mt-0.5">{format(new Date(), 'MMMM yyyy')}</p>
        </div>
        <div className="glass-card p-3.5">
          <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-gray-500"><FileText size={12} className="text-violet-400" /> Quotes Open</div>
          <p className="font-mono text-base md:text-xl font-bold text-white mt-2 truncate">{summary.quotesOpen}</p>
          <p className="text-[10px] text-gray-600 mt-0.5">waiting to be sent</p>
        </div>
        <div className="glass-card p-3.5">
          <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-gray-500"><Receipt size={12} /> Total Invoices</div>
          <p className="font-mono text-base md:text-xl font-bold text-white mt-2 truncate">{summary.total}</p>
          <p className="text-[10px] text-gray-600 mt-0.5">all statuses</p>
        </div>
      </div>

      {/* Filter chips */}
      <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
        {(['all', 'quote', 'sent', 'overdue', 'paid'] as FilterKey[]).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold uppercase tracking-wide whitespace-nowrap transition-all active:scale-95 border ${
              filter === f
                ? 'bg-gradient-to-r from-gold-500 to-amber-400 text-black border-transparent'
                : 'bg-gray-900 hover:bg-gray-800 text-gray-400 border-gray-800'
            }`}
          >
            {FILTER_LABELS[f]}{counts[f] > 0 && <span className="ml-1.5 opacity-70">{counts[f]}</span>}
          </button>
        ))}
      </div>

      {/* List */}
      <div className="glass-card overflow-hidden">
        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 p-4">{Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)}</div>
        ) : filteredList.length === 0 ? (
          <div className="p-10 text-center">
            <Receipt size={40} className="mx-auto text-gray-700 mb-3" />
            <p className="text-gray-400 font-bold">{invoices.length === 0 ? 'No invoices yet' : 'No invoices match this filter'}</p>
            <p className="text-gray-600 text-sm mt-1">{invoices.length === 0 ? 'Create a quote or invoice to get started.' : 'Try a different filter chip above.'}</p>
            {invoices.length === 0 && (
              <button onClick={() => openForm(null)}
                className="mt-4 inline-flex items-center gap-2 bg-gradient-to-r from-gold-500 to-amber-400 text-black font-bold px-4 py-2 rounded-xl text-sm active:scale-95 transition-transform">
                <Plus size={16} /> New Invoice
              </button>
            )}
          </div>
        ) : (
          <>
            {/* Desktop table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[10px] uppercase tracking-widest text-gray-500 border-b border-gray-800/70">
                    <th className="px-5 py-3 font-bold">Invoice</th>
                    <th className="px-4 py-3 font-bold">Party</th>
                    <th className="px-4 py-3 font-bold">Issued</th>
                    <th className="px-4 py-3 font-bold">Due</th>
                    <th className="px-4 py-3 font-bold text-right">Total</th>
                    <th className="px-4 py-3 font-bold">Status</th>
                    <th className="px-4 py-3 font-bold text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredList.map((inv) => {
                    const overdue = isOverdueInv(inv, today);
                    return (
                      <tr key={inv.id} className="border-b border-gray-800/40 hover:bg-gray-800/30 transition-colors">
                        <td className="px-5 py-3.5">
                          <p className="font-bold text-white font-mono">{inv.invoice_no}</p>
                          {inv.notes && <p className="text-xs text-gray-500 truncate max-w-[180px]">{inv.notes}</p>}
                        </td>
                        <td className="px-4 py-3.5 text-gray-300">{inv.party_name}</td>
                        <td className="px-4 py-3.5 text-gray-500 text-xs">{fmtDate(inv.issue_date)}</td>
                        <td className={`px-4 py-3.5 text-xs ${overdue ? 'text-red-400 font-bold' : 'text-gray-500'}`}>{fmtDate(inv.due_date)}</td>
                        <td className="px-4 py-3.5 text-right font-mono font-bold text-gold-400">{inv.currency} {fmt(invoiceTotalOf(inv))}</td>
                        <td className="px-4 py-3.5"><StatusChip inv={inv} today={today} /></td>
                        <td className="px-4 py-3.5">
                          <div className="flex items-center justify-end gap-1">{rowActions(inv)}</div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile cards */}
            <div className="md:hidden divide-y divide-gray-800/40">
              {filteredList.map((inv) => {
                const overdue = isOverdueInv(inv, today);
                return (
                  <div key={inv.id} className="p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-bold text-white text-sm font-mono">{inv.invoice_no}</p>
                          <StatusChip inv={inv} today={today} />
                        </div>
                        <p className="text-xs text-gray-400 mt-0.5 truncate">{inv.party_name}</p>
                        <p className="text-[10px] text-gray-600 mt-0.5">
                          Issued {fmtDate(inv.issue_date)} • Due <span className={overdue ? 'text-red-400 font-bold' : ''}>{fmtDate(inv.due_date)}</span>
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="font-mono font-bold text-gold-400 text-sm">{inv.currency} {fmt(invoiceTotalOf(inv))}</p>
                        {(inv.tax_pct || 0) > 0 && <p className="text-[10px] text-gray-600">incl. {inv.tax_pct}% tax</p>}
                      </div>
                    </div>
                    {inv.notes && <p className="text-[11px] text-gray-600 mt-1.5 truncate">{inv.notes}</p>}
                    <div className="flex gap-1.5 mt-3 flex-wrap">{mobileActions(inv)}</div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>

      {/* ============ New / Edit modal ============ */}
      <Modal isOpen={showForm} onClose={() => setShowForm(false)} title={editingInvoice ? `Edit ${editingInvoice.invoice_no}` : 'New Invoice'}>
        <div className="space-y-4">
          {editingInvoice?.gl_receivable_id && (
            <div className="flex items-start gap-2 text-xs text-amber-400 bg-amber-900/10 p-3 rounded-lg border border-amber-500/20">
              <Info size={14} className="shrink-0 mt-0.5" />
              <span>This invoice was already posted to the ledger. Edits here will not re-post its journal entries.</span>
            </div>
          )}
          <div>
            <label className={labelCls}>Invoice Number</label>
            <input value={fInvoiceNo} onChange={(e) => setFInvoiceNo(e.target.value)} placeholder="INV-0001" className={`${inputCls} font-mono`} />
          </div>
          <div>
            <label className={labelCls}>Party</label>
            <SearchableSelect
              options={partyOptions}
              value={fPartyId}
              onChange={(v) => {
                setFPartyId(v);
                const p = state.parties.find((x) => x.id === v);
                if (p) setFPartyName(p.name);
              }}
              placeholder="Select party..."
            />
            <div className="mt-2">
              <label className={labelCls}>Or Customer Name (free text)</label>
              <input value={fPartyName} onChange={(e) => setFPartyName(e.target.value)} placeholder="e.g. Walk-in customer" className={inputCls} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Issue Date</label>
              <input type="date" value={fIssueDate} onChange={(e) => setFIssueDate(e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Due Date</label>
              <input type="date" value={fDueDate} onChange={(e) => setFDueDate(e.target.value)} className={inputCls} />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className={labelCls}>Currency</label>
              <select value={fCurrency} onChange={(e) => setFCurrency(e.target.value as 'QAR' | 'PHP')} className={inputCls}>
                <option value="QAR">QAR</option>
                <option value="PHP">PHP</option>
              </select>
            </div>
            <div>
              <label className={labelCls}>Tax %</label>
              <input type="number" step="any" min="0" inputMode="decimal" value={fTaxPct} onChange={(e) => setFTaxPct(e.target.value)} placeholder="0" className={`${inputCls} font-mono`} />
            </div>
            <div>
              <label className={labelCls}>Discount</label>
              <input type="number" step="any" min="0" inputMode="decimal" value={fDiscount} onChange={(e) => setFDiscount(e.target.value)} placeholder="0" className={`${inputCls} font-mono`} />
            </div>
          </div>

          {/* Line items */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-[10px] font-bold uppercase tracking-widest text-gray-500">Line Items</label>
              <button type="button" onClick={addLine} className="flex items-center gap-1 px-2.5 py-1.5 bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded-lg text-[11px] font-bold text-gold-400 active:scale-95 transition-transform">
                <Plus size={12} /> Add Line
              </button>
            </div>
            <div className="hidden sm:grid grid-cols-[1fr_4.5rem_5.5rem_6rem_2rem] gap-2 px-1 text-[10px] font-bold uppercase tracking-widest text-gray-600">
              <span>Description</span><span className="text-right">Qty</span><span className="text-right">Unit</span><span className="text-right">Total</span><span />
            </div>
            <div className="space-y-2 mt-1">
              {fLines.map((line, idx) => (
                <div key={idx} className="sm:grid sm:grid-cols-[1fr_4.5rem_5.5rem_6rem_2rem] sm:gap-2 sm:items-center p-2.5 sm:p-0 bg-gray-900/40 sm:bg-transparent border border-gray-800 sm:border-0 rounded-lg space-y-2 sm:space-y-0">
                  <input value={line.description} onChange={(e) => updateLine(idx, { description: e.target.value })} placeholder="Description" className={inputCls} />
                  <input type="number" step="any" min="0" inputMode="decimal" value={line.quantity} onChange={(e) => updateLine(idx, { quantity: e.target.value })} placeholder="1" className={`${inputCls} font-mono text-right`} />
                  <input type="number" step="any" min="0" inputMode="decimal" value={line.unit_price} onChange={(e) => updateLine(idx, { unit_price: e.target.value })} placeholder="0.00" className={`${inputCls} font-mono text-right`} />
                  <div className="text-right font-mono text-xs text-gray-300 pr-1">
                    {fCurrency} {fmt((Number(line.quantity) || 0) * (Number(line.unit_price) || 0))}
                  </div>
                  <button type="button" onClick={() => removeLine(idx)} disabled={fLines.length <= 1}
                    className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-500 hover:text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-30 disabled:hover:text-gray-500 disabled:hover:bg-transparent"
                    title={fLines.length <= 1 ? 'At least one line is required' : 'Remove line'}>
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div>
            <label className={labelCls}>Notes</label>
            <input value={fNotes} onChange={(e) => setFNotes(e.target.value)} placeholder="Payment terms, remarks..." className={inputCls} />
          </div>

          {/* Live totals */}
          <div className="bg-gray-900/60 border border-gray-800 rounded-xl p-3.5 space-y-1.5 font-mono text-sm">
            <div className="flex justify-between text-gray-500"><span>Subtotal</span><span>{fCurrency} {fmt(formTotals.subtotal)}</span></div>
            {(Number(fDiscount) || 0) > 0 && (
              <div className="flex justify-between text-orange-400"><span>Discount</span><span>- {fCurrency} {fmt(Number(fDiscount) || 0)}</span></div>
            )}
            {(Number(fTaxPct) || 0) > 0 && (
              <div className="flex justify-between text-gray-500"><span>Tax ({Number(fTaxPct) || 0}%)</span><span>+ {fCurrency} {fmt(round2(formTotals.subtotal * (Number(fTaxPct) || 0) / 100))}</span></div>
            )}
            <div className="flex justify-between text-white font-bold text-base border-t border-gray-800 pt-2"><span>Total</span><span>{fCurrency} {fmt(formTotals.total)}</span></div>
          </div>

          <button onClick={handleSaveInvoice} disabled={isSaving}
            className="w-full bg-gradient-to-r from-gold-500 to-amber-400 text-black font-bold py-3 rounded-xl active:scale-95 transition-transform disabled:opacity-40">
            {isSaving ? 'Saving...' : editingInvoice ? 'Save Changes' : 'Save Invoice'}
          </button>
        </div>
      </Modal>

      {/* ============ Send / Convert modal ============ */}
      <Modal isOpen={!!sendInvoice} onClose={() => setSendInvoice(null)} title={`Send ${sendInvoice?.invoice_no ?? ''}`}>
        <div className="space-y-4">
          <div className="bg-gray-900/60 border border-gray-800 rounded-xl p-3.5 text-sm space-y-1.5">
            <div className="flex justify-between gap-3"><span className="text-gray-500">Customer</span><span className="text-gray-200 font-bold truncate">{sendInvoice?.party_name}</span></div>
            <div className="flex justify-between gap-3"><span className="text-gray-500">Total</span><span className="text-gold-400 font-mono font-bold">{sendInvoice?.currency} {fmt(sendInvoice ? invoiceTotalOf(sendInvoice) : 0)}</span></div>
            <div className="flex justify-between gap-3"><span className="text-gray-500">Due</span><span className="text-gray-300">{sendInvoice ? fmtDate(sendInvoice.due_date) : ''}</span></div>
          </div>
          <div>
            <label className={labelCls}>Revenue Account (Credit)</label>
            <SearchableSelect options={revenueOptions} value={fRevenueAccountId} onChange={setFRevenueAccountId} placeholder="Select revenue account..." />
          </div>
          <div className="flex items-start gap-2 text-xs text-blue-400 bg-blue-900/10 p-3 rounded-lg border border-blue-500/20">
            <Info size={14} className="shrink-0 mt-0.5" />
            <span>
              Sends the invoice and posts to the ledger: a receivable is created (Dr <span className="font-bold">{sendDrAccountName}</span>) and revenue accrued
              (Cr <span className="font-bold">{sendCrAccountName}</span>), note <span className="font-mono">Accrual: invoice Ref:…</span>
            </span>
          </div>
          <button onClick={confirmSend} disabled={isSaving || !fRevenueAccountId}
            className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-gold-500 to-amber-400 text-black font-bold py-3 rounded-xl active:scale-95 transition-transform disabled:opacity-40">
            <Send size={16} /> {isSaving ? 'Sending...' : 'Send & Post to Ledger'}
          </button>
        </div>
      </Modal>

      {/* ============ Payment modal ============ */}
      <Modal isOpen={!!payInvoice} onClose={() => setPayInvoice(null)} title={`Payment — ${payInvoice?.invoice_no ?? ''}`}>
        <div className="space-y-4">
          <div className="bg-gray-900/60 border border-gray-800 rounded-xl p-3.5 text-sm space-y-1.5">
            <div className="flex justify-between gap-3"><span className="text-gray-500">Customer</span><span className="text-gray-200 font-bold truncate">{payInvoice?.party_name}</span></div>
            <div className="flex justify-between gap-3"><span className="text-gray-500">Total Due</span><span className="text-gold-400 font-mono font-bold text-lg">{payInvoice?.currency} {fmt(payInvoice ? invoiceTotalOf(payInvoice) : 0)}</span></div>
          </div>
          <div>
            <label className={labelCls}>Deposit To (Debit)</label>
            <SearchableSelect options={cashOptions} value={fBankAccountId} onChange={setFBankAccountId} placeholder="Select Cash/Bank..." />
          </div>
          <div className="flex items-start gap-2 text-xs text-blue-400 bg-blue-900/10 p-3 rounded-lg border border-blue-500/20">
            <Info size={14} className="shrink-0 mt-0.5" />
            <span>
              Records the settlement: Dr <span className="font-bold">{payDrAccountName}</span> / Cr <span className="font-bold">{payCrAccountName}</span>,
              note <span className="font-mono">Settlement (Full): invoice Ref:…</span> The linked receivable is settled in full and the invoice is marked paid.
            </span>
          </div>
          <button onClick={confirmPayment} disabled={isSaving || !fBankAccountId}
            className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-emerald-500 to-emerald-600 text-white font-bold py-3 rounded-xl active:scale-95 transition-transform disabled:opacity-40">
            <CheckCircle size={16} /> {isSaving ? 'Posting...' : 'Confirm Payment'}
          </button>
        </div>
      </Modal>

      {/* ============ Print / Share modal ============ */}
      <Modal isOpen={!!printInvoice} onClose={() => setPrintInvoice(null)} title="Invoice Preview">
        <div className="flex justify-end gap-2 mb-4 no-print">
          <button onClick={() => printInvoice && handleWhatsAppShare(printInvoice)} className="flex items-center gap-2 px-3 py-2 bg-green-600 text-white rounded-lg text-sm hover:bg-green-700 transition-colors">
            <Share2 size={16} /> WhatsApp
          </button>
          <button onClick={handlePrint} className="flex items-center gap-2 px-3 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 transition-colors">
            <Printer size={16} /> Print / PDF
          </button>
        </div>

        {printInvoice && printTotals && (
          <div id="invoice-area" className="bg-white text-black p-8 rounded-lg shadow-lg max-w-2xl mx-auto min-h-[600px] flex flex-col">
            {/* Header */}
            <div className="flex justify-between items-start border-b-2 border-gray-100 pb-6 mb-6">
              <div>
                <h1 className="text-3xl font-bold text-gray-800">{state.businessProfile.name}</h1>
                <div className="text-sm text-gray-500 mt-2 space-y-1">
                  <p>{state.businessProfile.address}</p>
                  <p>{state.businessProfile.phone}</p>
                  <p>{state.businessProfile.email}</p>
                </div>
              </div>
              <div className="text-right">
                <h2 className="text-4xl font-light text-gray-300 uppercase tracking-widest">Invoice</h2>
                <p className="font-mono text-gray-600 mt-2">#{printInvoice.invoice_no}</p>
                <p className="text-sm text-gray-500 mt-1">Date: {fmtDate(printInvoice.issue_date)}</p>
                <p className="text-sm text-gray-500">Due: <span className="font-semibold text-red-500">{fmtDate(printInvoice.due_date)}</span></p>
              </div>
            </div>

            {/* Bill To */}
            <div className="mb-8">
              <h3 className="text-xs font-bold text-gray-400 uppercase mb-2">Bill To</h3>
              <h4 className="text-xl font-bold text-gray-800">{printInvoice.party_name}</h4>
              {printParty && (
                <div className="text-sm text-gray-500 mt-1">
                  {printParty.address && <p>{printParty.address}</p>}
                  {printParty.phone && <p>{printParty.phone}</p>}
                  {printParty.email && <p>{printParty.email}</p>}
                </div>
              )}
            </div>

            {/* Lines */}
            <div className="flex-1">
              <table className="w-full text-left">
                <thead>
                  <tr className="bg-gray-50 border-y border-gray-200">
                    <th className="py-3 px-4 text-sm font-semibold text-gray-600">Description</th>
                    <th className="py-3 px-2 text-sm font-semibold text-gray-600 text-right">Qty</th>
                    <th className="py-3 px-2 text-sm font-semibold text-gray-600 text-right">Unit Price</th>
                    <th className="py-3 px-4 text-sm font-semibold text-gray-600 text-right">Amount</th>
                  </tr>
                </thead>
                <tbody className="text-sm text-gray-700">
                  {(printInvoice.lines || []).map((l, i) => (
                    <tr key={i} className="border-b border-gray-100">
                      <td className="py-3 px-4">{l.description || '—'}</td>
                      <td className="py-3 px-2 text-right">{l.quantity}</td>
                      <td className="py-3 px-2 text-right">{fmt(Number(l.unit_price) || 0)}</td>
                      <td className="py-3 px-4 text-right font-medium">{fmt((Number(l.quantity) || 0) * (Number(l.unit_price) || 0))}</td>
                    </tr>
                  ))}
                  {(printInvoice.lines || []).length === 0 && (
                    <tr className="border-b border-gray-100"><td colSpan={4} className="py-4 px-4 text-gray-400">No line items.</td></tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Totals */}
            <div className="border-t-2 border-gray-100 pt-4 mt-8 flex justify-end">
              <div className="text-right w-64 space-y-1.5 text-sm">
                <div className="flex justify-between text-gray-500">
                  <span>Subtotal</span><span className="font-medium text-gray-700">{printInvoice.currency} {fmt(printTotals.subtotal)}</span>
                </div>
                {(printInvoice.discount || 0) > 0 && (
                  <div className="flex justify-between text-gray-500">
                    <span>Discount</span><span className="font-medium text-gray-700">- {printInvoice.currency} {fmt(printInvoice.discount || 0)}</span>
                  </div>
                )}
                {(printInvoice.tax_pct || 0) > 0 && (
                  <div className="flex justify-between text-gray-500">
                    <span>Tax ({printInvoice.tax_pct}%)</span>
                    <span className="font-medium text-gray-700">+ {printInvoice.currency} {fmt(round2(printTotals.subtotal * (printInvoice.tax_pct || 0) / 100))}</span>
                  </div>
                )}
                <div className="flex justify-between items-baseline pt-2 border-t border-gray-200">
                  <span className="font-bold text-gray-500 uppercase text-xs">Total Due</span>
                  <span className="text-2xl font-bold text-gray-900">{printInvoice.currency} {fmt(printTotals.total)}</span>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="mt-12 pt-6 border-t border-gray-100 text-center">
              <p className="text-sm font-medium text-gray-600">{state.businessProfile.name}</p>
              <p className="text-xs text-gray-400 mt-1">{state.businessProfile.footerNote || 'Thank you for your business.'}</p>
            </div>
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

// Helpers (kept outside the main component to avoid re-creation) — same style as Trading.tsx
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
