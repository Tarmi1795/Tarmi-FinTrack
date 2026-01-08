
import React, { useState, useEffect } from 'react';
import { useFinance } from '../context/FinanceContext';
import { Receivable, Transaction, CurrencyCode, RecurrenceFrequency } from '../types';
import { EXCHANGE_RATE_QAR_TO_PHP } from '../constants';
import { format, isPast, addDays, addWeeks, addMonths, addYears, parseISO, endOfDay } from 'date-fns';
import { Plus, CheckCircle, ArrowUpRight, ArrowDownLeft, Repeat, Pencil, Trash2, HandCoins, FileText, Filter, Copy, RefreshCw, Users, Info } from 'lucide-react';
import { Modal } from '../components/ui/Modal';
import { SearchableSelect } from '../components/ui/SearchableSelect';
import { evaluateMathExpression } from '../utils/mathUtils';
import { InvoiceModal } from '../components/InvoiceModal';
import { useNavigate, useLocation } from 'react-router-dom';

type Mode = 'receivable' | 'payable';
type SubMode = 'invoice' | 'bill' | 'loan';

export const ApAr: React.FC = () => {
  const { state, dispatch } = useFinance();
  const navigate = useNavigate();
  const location = useLocation();
  const [activeTab, setActiveTab] = useState<'all' | 'receivable' | 'payable'>('all');
  
  // Modals
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [invoiceData, setInvoiceData] = useState<Receivable | null>(null);

  // Selection
  const [selectedItem, setSelectedItem] = useState<Receivable | null>(null);
  
  // Form State
  const [formMode, setFormMode] = useState<Mode>('receivable');
  const [formSubMode, setFormSubMode] = useState<SubMode>('invoice');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [partyId, setPartyId] = useState('');
  const [targetAccountId, setTargetAccountId] = useState('');
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState<CurrencyCode>('QAR');
  
  const baseCurrency = state.businessProfile.baseCurrency || 'QAR';

  // Fix: Use local YYYY-MM-DD for default to prevent "yesterday" bugs
  const getTodayLocal = () => {
      const d = new Date();
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
  };
  const [issueDate, setIssueDate] = useState('');
  const [dueDate, setDueDate] = useState('');
  
  const [notes, setNotes] = useState('');
  const [isRecurring, setIsRecurring] = useState(false);
  const [recurFreq, setRecurFreq] = useState<RecurrenceFrequency>('monthly');

  // Payment State
  const [paymentAccountId, setPaymentAccountId] = useState('');
  const [paymentAmount, setPaymentAmount] = useState('');

  // Handle Navigation Shortcuts
  useEffect(() => {
      if (location.state) {
          const { openMode, openSubMode } = location.state as any;
          if (openMode && openSubMode) {
              handleOpenAdd(openMode, openSubMode);
              // Clear state to avoid reopening on refresh/back
              window.history.replaceState({}, document.title);
          }
      }
  }, [location]);

  // --- HELPERS ---

  const getPartyOptions = (mode: Mode) => {
    const type = mode === 'receivable' ? 'customer' : 'vendor';
    return state.parties.filter(p => p.type === type).map(p => ({ id: p.id, label: p.name }));
  };

  const getAccountOptions = (mode: Mode, subMode: SubMode) => {
    // Only allow Sub-Ledgers
    const subLedgers = state.accounts.filter(a => a.level === 'sub_ledger' && a.isPosting);

    if (mode === 'receivable') {
        if (subMode === 'loan') {
            // Money leaving Bank (Credit Asset)
            return subLedgers.filter(a => a.class === 'Assets').map(a => ({ id: a.id, label: a.name, subLabel: a.code }));
        }
        // Revenue (Credit Revenue)
        return subLedgers.filter(a => a.class === 'Revenue').map(a => ({ id: a.id, label: a.name, subLabel: a.code }));
    } else {
        if (subMode === 'loan') {
             // Money entering Bank (Debit Asset)
             return subLedgers.filter(a => a.class === 'Assets').map(a => ({ id: a.id, label: a.name, subLabel: a.code }));
        }
        // Expense (Debit Expense)
        return subLedgers.filter(a => a.class === 'Expenses' || a.class === 'Liabilities').map(a => ({ id: a.id, label: a.name, subLabel: a.code }));
    }
  };

  // Only allow Cash & Cash Equivalents (111xx)
  const cashGroup = state.accounts.find(a => a.code === '11100');
  const cashOptions = state.accounts
      .filter(a => 
          a.isPosting && 
          (
              a.code.startsWith('111') || 
              (cashGroup && a.parentId === cashGroup.id)
          )
      )
      .map(a => ({ id: a.id, label: a.name, subLabel: a.code }));

  // --- ACTIONS ---

  const goToPartySOA = (partyId: string) => {
      const party = state.parties.find(p => p.id === partyId);
      if (party?.linkedAccountId) {
          navigate('/reports', { state: { tab: 'soa', accountId: party.linkedAccountId } });
      } else {
          alert("This party is not linked to a specific sub-ledger account.");
      }
  };

  const handleOpenAdd = (mode: Mode, subMode: SubMode) => {
      resetForm();
      setFormMode(mode);
      setFormSubMode(subMode);
      
      // Auto-select bank for loans (if it is a sub ledger)
      if (subMode === 'loan') {
          const bank = state.accounts.find(c => c.class === 'Assets' && c.level === 'sub_ledger' && c.name.toLowerCase().includes('bank'));
          if (bank) setTargetAccountId(bank.id);
      }
      
      setIsFormOpen(true);
  };

  const handleOpenEdit = (item: Receivable) => {
      setEditingId(item.id);
      setFormMode(item.type);
      setFormSubMode(item.subType || (item.type === 'receivable' ? 'invoice' : 'bill'));
      setPartyId(item.partyId || '');
      setTargetAccountId(item.targetAccountId || '');
      setAmount((item.originalAmount || item.amount).toString());
      setCurrency(item.currency || 'QAR');
      setIssueDate(item.issueDate ? item.issueDate.split('T')[0] : getTodayLocal());
      setDueDate(item.dueDate.split('T')[0]);
      setNotes(item.notes || '');
      setIsRecurring(!!item.recurring?.active);
      setRecurFreq(item.recurring?.frequency || 'monthly');
      setIsFormOpen(true);
  };

  const handleSave = (e: React.FormEvent) => {
      e.preventDefault();
      const finalValStr = evaluateMathExpression(amount);
      const val = parseFloat(finalValStr);
      if (isNaN(val) || !partyId || !targetAccountId) {
          alert("Please fill all required fields correctly.");
          return;
      }

      const finalAmountQAR = currency === 'PHP' ? val / EXCHANGE_RATE_QAR_TO_PHP : val;
      const party = state.parties.find(p => p.id === partyId);
      const newId = editingId || Math.random().toString(36).substr(2, 9);
      
      const validIssueDate = issueDate ? new Date(issueDate).toISOString() : new Date().toISOString();

      const payload: Receivable = {
          id: newId,
          type: formMode,
          subType: formSubMode,
          partyId,
          partyName: party?.name || 'Unknown',
          targetAccountId,
          amount: finalAmountQAR,
          paidAmount: 0,
          originalAmount: val,
          currency,
          issueDate: validIssueDate,
          dueDate: new Date(dueDate).toISOString(),
          status: 'pending',
          notes,
          recurring: isRecurring ? { active: true, amount: val, frequency: recurFreq, nextDueDate: dueDate } : undefined
      };

      if (editingId) {
          // Preserve existing payments on edit
          const existing = state.receivables.find(r => r.id === editingId);
          payload.paidAmount = existing?.paidAmount || 0;
          if (payload.paidAmount >= payload.amount) payload.status = 'paid';
          dispatch({ type: 'UPDATE_RECEIVABLE', payload });
      } else {
          dispatch({ type: 'ADD_RECEIVABLE', payload });
          createAccrualTransaction(payload, newId);
      }
      setIsFormOpen(false);
  };

  const createAccrualTransaction = (item: Receivable, id: string) => {
      // Logic to create the underlying GL transaction
      const party = state.parties.find(p => p.id === item.partyId);
      const partyLinkedAccount = party?.linkedAccountId;

      if (!partyLinkedAccount) {
          console.warn("Party has no linked account for accrual posting.");
          return;
      }

      const tx: Transaction = {
          id: Math.random().toString(36).substr(2, 9),
          date: item.issueDate || new Date().toISOString(), // Use provided issue date
          currency: item.currency,
          amount: item.amount,
          originalAmount: item.originalAmount,
          relatedPartyId: item.partyId,
          source: item.subType === 'loan' ? 'personal' : (item.type === 'receivable' ? 'side_hustle' : 'personal'),
          note: `Accrual: ${item.subType} Ref:${id}`, 
          type: item.type === 'receivable' ? (item.subType === 'loan' ? 'transfer' : 'income') : (item.subType === 'loan' ? 'transfer' : 'expense'),
          
          accountId: item.type === 'receivable' 
            ? partyLinkedAccount // Dr Party AR
            : (item.subType === 'loan' ? item.targetAccountId : item.targetAccountId), // Dr Bank or Expense
            
          paymentAccountId: item.type === 'receivable'
            ? item.targetAccountId // Cr Revenue or Bank
            : partyLinkedAccount // Cr Party AP
      };
      
      dispatch({ type: 'ADD_TRANSACTION', payload: tx });
  };

  const handleSync = () => {
      const confirmSync = confirm("Reconcile Transactions?\n\nThis will scan all active Payables/Receivables and create missing GL transactions if they were accidentally deleted.");
      if (!confirmSync) return;

      let createdCount = 0;
      state.receivables.forEach(r => {
          const exists = state.transactions.some(t => t.note?.includes(`Ref:${r.id}`));
          if (!exists) {
              createAccrualTransaction(r, r.id);
              createdCount++;
          }
      });

      alert(createdCount > 0 ? `Synced! Created ${createdCount} missing transactions.` : "All records are in sync.");
  };

  const handleDelete = (id: string) => {
      if(confirm("Delete this record? Associated Journal Entries will be removed.")) {
          dispatch({ type: 'DELETE_RECEIVABLE', payload: id });
      }
  };

  const handleOpenPayment = (item: Receivable) => {
      setSelectedItem(item);
      const bank = cashOptions.find(c => c.label.toLowerCase().includes('bank')) || cashOptions[0];
      setPaymentAccountId(bank ? bank.id : '');
      
      // Default to remaining balance
      const remaining = item.amount - (item.paidAmount || 0);
      setPaymentAmount(remaining.toString());
      
      setIsPaymentModalOpen(true);
  };

  const handleProcessPayment = (e: React.FormEvent) => {
      e.preventDefault();
      if (!selectedItem || !paymentAccountId) return;

      const payValStr = evaluateMathExpression(paymentAmount);
      const payVal = parseFloat(payValStr);
      if (isNaN(payVal) || payVal <= 0) {
          alert("Please enter a valid amount.");
          return;
      }

      const item = selectedItem;
      const currentPaid = item.paidAmount || 0;
      const newPaidTotal = currentPaid + payVal;
      const isFullyPaid = newPaidTotal >= (item.amount - 0.01); // Tolerance for float math

      // Update Receivable Record
      const updatedItem: Receivable = {
          ...item,
          paidAmount: newPaidTotal,
          status: isFullyPaid ? 'paid' : 'pending',
          paidDate: isFullyPaid ? new Date().toISOString() : undefined
      };
      dispatch({ type: 'UPDATE_RECEIVABLE', payload: updatedItem });

      // Create Payment Transaction (Partial Amount)
      const party = state.parties.find(p => p.id === item.partyId);
      const partyLinkedAccount = party?.linkedAccountId;

      const tx: Transaction = {
          id: Math.random().toString(36).substr(2, 9),
          date: new Date().toISOString(),
          currency: item.currency,
          amount: payVal, // Use partial amount for GL
          originalAmount: payVal, // Assuming same currency base for simplicity or 1:1 if QAR
          relatedPartyId: item.partyId,
          source: item.subType === 'loan' ? 'personal' : (item.type === 'receivable' ? 'side_hustle' : 'personal'),
          note: `Settlement (${isFullyPaid ? 'Full' : 'Partial'}): ${item.subType} Ref:${item.id}`,
          type: item.type === 'receivable' ? 'income' : 'expense',
          accountId: item.type === 'receivable' ? paymentAccountId : (partyLinkedAccount || ''),
          paymentAccountId: item.type === 'receivable' ? (partyLinkedAccount || '') : paymentAccountId
      };

      if (partyLinkedAccount) {
         dispatch({ type: 'ADD_TRANSACTION', payload: tx });
      }

      // Handle Recurring - ONLY if Fully Paid (or if user wants auto-recurrence on settlement)
      // Logic: Only generate next item if we are fully setting the current one.
      if (isFullyPaid && item.recurring?.active) {
          const freq = item.recurring.frequency;

          const dueStr = item.dueDate.split('T')[0];
          const baseDueDate = new Date(dueStr + 'T00:00:00.000Z');
          let nextDueDate = baseDueDate;
          
          if (freq === 'daily') nextDueDate = addDays(baseDueDate, 1);
          if (freq === 'weekly') nextDueDate = addWeeks(baseDueDate, 1);
          if (freq === 'monthly') nextDueDate = addMonths(baseDueDate, 1);
          if (freq === 'yearly') nextDueDate = addYears(baseDueDate, 1);

          const issueStr = item.issueDate ? item.issueDate.split('T')[0] : dueStr;
          const baseIssueDate = new Date(issueStr + 'T00:00:00.000Z');
          let nextIssueDate = baseIssueDate;

          if (freq === 'daily') nextIssueDate = addDays(baseIssueDate, 1);
          if (freq === 'weekly') nextIssueDate = addWeeks(baseIssueDate, 1);
          if (freq === 'monthly') nextIssueDate = addMonths(baseIssueDate, 1);
          if (freq === 'yearly') nextIssueDate = addYears(baseIssueDate, 1);

          const nextId = Math.random().toString(36).substr(2, 9);
          const nextItem: Receivable = {
              ...item,
              id: nextId,
              dueDate: nextDueDate.toISOString(),
              status: 'pending',
              paidDate: undefined,
              paidAmount: 0,
              issueDate: nextIssueDate.toISOString() 
          };
          dispatch({ type: 'ADD_RECEIVABLE', payload: nextItem });

          if (item.subType === 'invoice' || item.subType === 'bill') {
              const txType = item.type === 'receivable' ? 'income' : 'expense';
              const nextAccrualTx: Transaction = {
                  id: Math.random().toString(36).substr(2, 9),
                  date: nextIssueDate.toISOString(), 
                  currency: item.currency,
                  amount: item.amount,
                  originalAmount: item.originalAmount,
                  relatedPartyId: item.partyId,
                  source: 'side_hustle',
                  note: `Accrual (Auto): ${item.subType} Ref:${nextId}`,
                  type: txType,
                  accountId: item.type === 'receivable' ? (partyLinkedAccount || '') : item.targetAccountId,
                  paymentAccountId: item.type === 'receivable' ? item.targetAccountId : (partyLinkedAccount || '')
              };
              if (partyLinkedAccount) {
                  dispatch({ type: 'ADD_TRANSACTION', payload: nextAccrualTx });
              }
          }
      }

      setIsPaymentModalOpen(false);
  };

  const resetForm = () => {
      setEditingId(null); setPartyId(''); setTargetAccountId(''); setAmount(''); setNotes(''); setIsRecurring(false); 
      setIssueDate(getTodayLocal());
      setDueDate('');
  };

  // --- RENDER ---
  const filteredList = state.receivables.filter(item => {
      if (item.status === 'paid') return false; 
      if (activeTab === 'all') return true;
      return item.type === activeTab;
  }).sort((a,b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime());

  const todayEnd = endOfDay(new Date());

  const totalAr = state.receivables.filter(r => 
      r.type === 'receivable' && 
      r.status === 'pending' &&
      (!r.issueDate || parseISO(r.issueDate) <= todayEnd)
  ).reduce((s, r) => s + (r.amount - (r.paidAmount || 0)), 0);

  const totalAp = state.receivables.filter(r => 
      r.type === 'payable' && 
      r.status === 'pending' &&
      (!r.issueDate || parseISO(r.issueDate) <= todayEnd)
  ).reduce((s, r) => s + (r.amount - (r.paidAmount || 0)), 0);

  return (
    <div className="space-y-6 pb-20 md:pb-0 animate-fade-in">
        {/* Header & Tabs - Unchanged */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <div><h1 className="text-3xl font-bold text-gray-100 tracking-tight">AP / AR</h1><p className="text-gray-400 text-sm">Manage invoices, bills, and loans</p></div>
            <div className="flex gap-2 flex-wrap">
                <button onClick={() => navigate('/settings', { state: { tab: 'parties' } })} className="flex items-center gap-2 bg-gray-800 hover:bg-gray-700 text-gray-400 px-3 py-2 rounded-xl text-xs font-bold uppercase transition-all hover:scale-105"><Users size={16} /> Parties</button>
                <button onClick={handleSync} className="flex items-center gap-2 bg-gray-800 hover:bg-gray-700 text-gray-400 px-3 py-2 rounded-xl text-xs font-bold uppercase transition-all hover:scale-105"><RefreshCw size={16} /> Sync</button>
                <button onClick={() => handleOpenAdd('receivable', 'invoice')} className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-2 rounded-xl text-xs font-bold uppercase transition-all hover:scale-105 active:scale-95"><Plus size={16} /> New Invoice</button>
                <button onClick={() => handleOpenAdd('payable', 'bill')} className="flex items-center gap-2 bg-orange-600 hover:bg-orange-700 text-white px-3 py-2 rounded-xl text-xs font-bold uppercase transition-all hover:scale-105 active:scale-95"><Plus size={16} /> New Bill</button>
                <button onClick={() => handleOpenAdd('receivable', 'loan')} className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-2 rounded-xl text-xs font-bold uppercase transition-all hover:scale-105 active:scale-95"><HandCoins size={16} /> Loan</button>
            </div>
        </div>

        {/* Summary Cards - Updated Calculation */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <div className="bg-emerald-900/20 border border-emerald-500/30 p-4 rounded-2xl hover:-translate-y-1 hover:shadow-lg transition-all duration-300">
                <p className="text-xs font-bold text-emerald-400 uppercase mb-1">Total Receivables</p>
                <p className="text-2xl font-bold text-white">{baseCurrency} {totalAr.toLocaleString()}</p>
                <div className="mt-2 text-[10px] text-gray-400">Current Outstanding</div>
            </div>
            <div className="bg-orange-900/20 border border-orange-500/30 p-4 rounded-2xl hover:-translate-y-1 hover:shadow-lg transition-all duration-300">
                <p className="text-xs font-bold text-orange-400 uppercase mb-1">Total Payables</p>
                <p className="text-2xl font-bold text-white">{baseCurrency} {totalAp.toLocaleString()}</p>
                <div className="mt-2 text-[10px] text-gray-400">Current Outstanding</div>
            </div>
             <div className="bg-gray-900/40 border border-gray-800 p-4 rounded-2xl hidden md:block hover:bg-gray-800 transition-colors">
                <p className="text-xs font-bold text-gray-400 uppercase mb-1">Net Position</p>
                <p className={`text-2xl font-bold ${(totalAr - totalAp) >= 0 ? 'text-blue-400' : 'text-red-400'}`}>{baseCurrency} {(totalAr - totalAp).toLocaleString()}</p>
                <div className="mt-2 text-[10px] text-gray-500">Current Impact</div>
            </div>
        </div>

        {/* Tabs & List - Unchanged */}
        <div className="flex border-b border-gray-800">
             <button onClick={() => setActiveTab('all')} className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors ${activeTab === 'all' ? 'border-primary text-white' : 'border-transparent text-gray-500 hover:text-gray-300'}`}>All Pending</button>
             <button onClick={() => setActiveTab('receivable')} className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors ${activeTab === 'receivable' ? 'border-emerald-500 text-emerald-400' : 'border-transparent text-gray-500 hover:text-gray-300'}`}>Receivables</button>
             <button onClick={() => setActiveTab('payable')} className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors ${activeTab === 'payable' ? 'border-orange-500 text-orange-400' : 'border-transparent text-gray-500 hover:text-gray-300'}`}>Payables</button>
        </div>

        <div className="grid gap-4">
            {filteredList.map(item => {
                const isOverdue = isPast(new Date(item.dueDate));
                const isFutureItem = item.issueDate && parseISO(item.issueDate) > todayEnd;
                const colorClass = item.type === 'receivable' ? 'text-emerald-400' : 'text-orange-400';
                const bgClass = item.type === 'receivable' ? 'bg-emerald-500/10' : 'bg-orange-500/10';
                const icon = item.subType === 'loan' ? <HandCoins size={20}/> : (item.type === 'receivable' ? <ArrowDownLeft size={20}/> : <ArrowUpRight size={20}/>);
                const accName = state.accounts.find(c => c.id === item.targetAccountId)?.name;
                const remaining = item.amount - (item.paidAmount || 0);

                return (
                    <div key={item.id} className={`glass-panel p-5 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-4 group hover:bg-gray-800/60 hover:-translate-y-1 hover:shadow-xl transition-all duration-300 ${isFutureItem ? 'opacity-60 grayscale-[0.5]' : ''}`}>
                        <div className="flex items-start gap-4">
                             <div className={`p-3 rounded-xl shrink-0 ${bgClass} ${colorClass}`}>{icon}</div>
                             <div>
                                 <div className="flex items-center gap-2">
                                     <h3 className="font-bold text-gray-200">{item.partyName}</h3>
                                     {item.partyId && <button onClick={() => goToPartySOA(item.partyId!)} className="p-1 hover:bg-gray-700 rounded text-gray-500 hover:text-blue-400 transition-colors"><FileText size={14} /></button>}
                                     {item.recurring?.active && <Repeat size={14} className="text-blue-400" />}
                                     <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold uppercase ${item.type === 'receivable' ? 'bg-emerald-900/30 text-emerald-400' : 'bg-orange-900/30 text-orange-400'}`}>{item.subType}</span>
                                     {isFutureItem && <span className="text-[10px] px-1.5 py-0.5 rounded font-bold uppercase bg-gray-700 text-gray-300">Future</span>}
                                 </div>
                                 <p className="text-sm text-gray-400">{item.notes}</p>
                                 <div className="flex items-center gap-3 mt-1.5"><span className={`text-xs ${isOverdue ? 'text-red-400 font-bold' : 'text-gray-500'}`}>Due {format(new Date(item.dueDate), 'MMM d')}</span><span className="text-xs text-gray-600">• {accName}</span></div>
                             </div>
                        </div>
                        <div className="flex items-center justify-between sm:justify-end gap-6 w-full sm:w-auto border-t sm:border-t-0 border-gray-800 pt-3 sm:pt-0">
                             <div className="text-right">
                                 {item.paidAmount && item.paidAmount > 0 ? (
                                     <span className="block text-[10px] text-gray-500 mb-0.5 font-mono">
                                         PAID: {item.paidAmount.toLocaleString()} / {item.amount.toLocaleString()}
                                     </span>
                                 ) : null}
                                 <span className={`block text-xl font-bold ${colorClass}`}>{item.type === 'receivable' ? '+' : '-'} {remaining.toLocaleString()}</span>
                                 {item.currency === 'PHP' && <span className="text-xs text-gray-500">₱{item.originalAmount?.toLocaleString()}</span>}
                             </div>
                             <div className="flex gap-1 opacity-80 group-hover:opacity-100 transition-opacity">
                                 <button onClick={() => handleOpenPayment(item)} className={`p-2 rounded-lg transition-all active:scale-90 ${item.type === 'receivable' ? 'bg-emerald-600/20 text-emerald-400 hover:bg-emerald-600/40' : 'bg-orange-600/20 text-orange-400 hover:bg-orange-600/40'}`} title="Settle"><CheckCircle size={18} /></button>
                                 <button onClick={() => handleOpenEdit(item)} className="p-2 text-gray-500 hover:text-white hover:bg-gray-800 rounded-lg active:scale-90 transition-all"><Pencil size={18}/></button>
                                 <button onClick={() => handleDelete(item.id)} className="p-2 text-gray-500 hover:text-red-400 hover:bg-gray-800 rounded-lg active:scale-90 transition-all"><Trash2 size={18}/></button>
                                 {item.type === 'receivable' && item.subType !== 'loan' && <button onClick={() => setInvoiceData(item)} className="p-2 text-gray-500 hover:text-blue-400 hover:bg-gray-800 rounded-lg active:scale-90 transition-all"><FileText size={18}/></button>}
                             </div>
                        </div>
                    </div>
                );
            })}
            {filteredList.length === 0 && <div className="text-center py-12 text-gray-500 border border-dashed border-gray-800 rounded-xl">No active records found.</div>}
        </div>

        {/* Form Modal - Unchanged */}
        <Modal isOpen={isFormOpen} onClose={() => setIsFormOpen(false)} title={`${editingId ? 'Edit' : 'New'} ${formSubMode.charAt(0).toUpperCase() + formSubMode.slice(1)}`}>
            <form onSubmit={handleSave} className="space-y-4">
                <div>
                    <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Entity</label>
                    <SearchableSelect options={getPartyOptions(formMode)} value={partyId} onChange={setPartyId} required placeholder="Select Name..." />
                </div>
                <div>
                    <label className="block text-xs font-bold text-gray-500 uppercase mb-1">{formMode === 'receivable' ? 'Revenue / Source Account' : 'Expense / Asset Account'}</label>
                    <SearchableSelect options={getAccountOptions(formMode, formSubMode)} value={targetAccountId} onChange={setTargetAccountId} required placeholder="Select Account..." />
                </div>
                <div>
                    <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Amount</label>
                    <div className="flex gap-2">
                        <input type="text" className="flex-1 px-4 py-2 bg-gray-900 border border-gray-700 rounded-xl text-white outline-none focus:border-primary" value={amount} onChange={e => setAmount(e.target.value)} onBlur={() => setAmount(evaluateMathExpression(amount))} placeholder="0.00" required />
                        <select className="w-24 px-2 bg-gray-950 border border-gray-700 rounded-xl text-white outline-none" value={currency} onChange={e => setCurrency(e.target.value as CurrencyCode)}><option value="QAR">QAR</option><option value="PHP">PHP</option></select>
                    </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                    <div>
                         <label className="block text-xs font-bold text-gray-500 uppercase mb-1">{formMode === 'receivable' ? 'Revenue/Issue Date' : 'Expense/Bill Date'}</label>
                         <input type="date" className="w-full px-4 py-2 bg-gray-900 border border-gray-700 rounded-xl text-white outline-none focus:border-primary" value={issueDate} onChange={e => setIssueDate(e.target.value)} required />
                    </div>
                    <div>
                         <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Due Date</label>
                         <input type="date" className="w-full px-4 py-2 bg-gray-900 border border-gray-700 rounded-xl text-white outline-none focus:border-primary" value={dueDate} onChange={e => setDueDate(e.target.value)} required />
                    </div>
                </div>
                <div>
                    <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Recurrence</label>
                    <div className="flex items-center gap-2 h-[42px] px-3 bg-gray-900 border border-gray-700 rounded-xl">
                        <input type="checkbox" checked={isRecurring} onChange={e => setIsRecurring(e.target.checked)} className="w-4 h-4 bg-gray-800 border-gray-600 rounded" />
                        <select disabled={!isRecurring} value={recurFreq} onChange={e => setRecurFreq(e.target.value as RecurrenceFrequency)} className="bg-transparent text-xs text-white outline-none disabled:opacity-50"><option value="monthly">Monthly</option><option value="weekly">Weekly</option><option value="yearly">Yearly</option></select>
                    </div>
                </div>
                <div>
                    <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Notes</label>
                    <input type="text" className="w-full px-4 py-2 bg-gray-900 border border-gray-700 rounded-xl text-white outline-none focus:border-primary" value={notes} onChange={e => setNotes(e.target.value)} placeholder="Description..." />
                </div>
                <button className={`w-full py-3 rounded-xl font-bold text-white shadow-lg transition-transform active:scale-[0.98] ${formMode === 'receivable' ? 'bg-emerald-600 hover:bg-emerald-700 shadow-emerald-900/20' : 'bg-orange-600 hover:bg-orange-700 shadow-orange-900/20'}`}>Save Record</button>
            </form>
        </Modal>

        {/* Payment Modal - Updated for Partial Payment */}
        <Modal isOpen={isPaymentModalOpen} onClose={() => setIsPaymentModalOpen(false)} title={`Settle ${selectedItem?.type === 'receivable' ? 'Invoice' : 'Bill'}`}>
             <form onSubmit={handleProcessPayment} className="space-y-4">
                <div className="p-4 bg-gray-900/50 rounded-xl mb-4 border border-gray-800">
                    <div className="flex justify-between text-sm text-gray-500 mb-1">
                        <span>Total Amount</span>
                        <span>{selectedItem?.amount.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between text-sm text-gray-500 mb-3 border-b border-gray-700 pb-3">
                        <span>Paid So Far</span>
                        <span>- {(selectedItem?.paidAmount || 0).toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between items-center">
                        <span className="text-gray-300 font-bold uppercase text-xs">Remaining Balance</span>
                        <span className="text-2xl font-bold text-white">{baseCurrency} {(selectedItem ? (selectedItem.amount - (selectedItem.paidAmount || 0)) : 0).toLocaleString()}</span>
                    </div>
                </div>
                
                <div>
                    <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Amount to {selectedItem?.type === 'receivable' ? 'Receive' : 'Pay'}</label>
                    <input 
                        type="text" 
                        className="w-full px-4 py-3 bg-gray-900 border border-gray-700 rounded-xl text-white outline-none focus:border-primary font-bold text-lg" 
                        value={paymentAmount} 
                        onChange={e => setPaymentAmount(e.target.value)} 
                        onBlur={() => setPaymentAmount(evaluateMathExpression(paymentAmount))}
                        placeholder="0.00" 
                        required 
                    />
                </div>

                <div>
                    <label className="block text-xs font-bold text-gray-500 uppercase mb-1">{selectedItem?.type === 'receivable' ? 'Deposit To (Debit)' : 'Pay From (Credit)'}</label>
                    <SearchableSelect options={cashOptions} value={paymentAccountId} onChange={setPaymentAccountId} required placeholder="Select Cash/Bank..." />
                </div>
                
                <div className="flex items-center gap-2 text-xs text-blue-400 bg-blue-900/10 p-3 rounded-lg border border-blue-500/20">
                    <Info size={14} />
                    <span>Transaction will be recorded for the entered amount only. Item remains pending until fully paid.</span>
                </div>

                <button className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold shadow-lg shadow-blue-900/20">Confirm Transaction</button>
             </form>
        </Modal>

        {invoiceData && <InvoiceModal isOpen={!!invoiceData} onClose={() => setInvoiceData(null)} data={invoiceData} appState={state} />}
    </div>
  );
};
