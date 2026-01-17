
import React, { useState, useEffect } from 'react';
import { useFinance } from '../context/FinanceContext';
import { TransactionType, SourceType, Transaction, CurrencyCode, RecurrenceFrequency, RecurringTransaction, TransactionTemplate } from '../types';
import { CURRENCIES } from '../constants';
import { Check, ArrowRightLeft, LayoutGrid, List, Save, ArrowRight, Repeat, Star, Tag } from 'lucide-react';
import { addDays, addMonths, addWeeks, addYears } from 'date-fns';
import { SearchableSelect } from './ui/SearchableSelect';
import { evaluateMathExpression } from '../utils/mathUtils';
import { useNavigate } from 'react-router-dom';

interface TransactionFormProps {
  onComplete: () => void;
  initialType?: TransactionType;
  initialData?: Transaction | null;
  mode?: 'transaction' | 'template';
  onSaveTemplate?: (template: TransactionTemplate) => void;
  initialTemplate?: TransactionTemplate | null;
}

export const TransactionForm: React.FC<TransactionFormProps> = ({ 
    onComplete, 
    initialType = 'expense', 
    initialData, 
    mode = 'transaction',
    onSaveTemplate,
    initialTemplate
}) => {
  const { state, dispatch } = useFinance();
  const navigate = useNavigate();
  const baseCurrency = state.businessProfile.baseCurrency || 'USD';
  
  // Helper for Local YYYY-MM-DD
  const getTodayLocal = () => {
      const d = new Date();
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
  };

  // Template specific state
  const [templateName, setTemplateName] = useState(initialTemplate?.name || '');
  const [templateIcon, setTemplateIcon] = useState(initialTemplate?.icon || '⚡');

  // Shared state
  const [type, setType] = useState<TransactionType>(initialData?.type || initialType);
  const [amount, setAmount] = useState(
      initialData ? (initialData.originalAmount || initialData.amount).toString() : 
      (initialTemplate ? (initialTemplate.amount || '').toString() : '')
  );
  
  // Default currency to Base Currency if not provided
  const [currency, setCurrency] = useState<CurrencyCode>(initialData?.currency || initialTemplate?.currency || baseCurrency);
  
  const [accountId, setAccountId] = useState(initialData?.accountId || initialTemplate?.accountId || '');
  const [source, setSource] = useState<SourceType>(initialData?.source || initialTemplate?.source || 'personal');
  const [paymentAccountId, setPaymentAccountId] = useState(initialData?.paymentAccountId || initialTemplate?.paymentAccountId || '');
  // Fix: Use local date for default to avoid timezone shift errors
  const [date, setDate] = useState(initialData ? initialData.date.split('T')[0] : getTodayLocal());
  const [note, setNote] = useState(initialData?.note || initialTemplate?.note || '');
  const [partyId, setPartyId] = useState(initialData?.relatedPartyId || initialTemplate?.partyId || '');
  
  // Recurrence State (Transaction Mode Only)
  const [isRecurring, setIsRecurring] = useState(false);
  const [recurFreq, setRecurFreq] = useState<RecurrenceFrequency>('monthly');
  
  const [viewMode, setViewMode] = useState<'form' | 'pos'>('pos');

  useEffect(() => {
    if (initialData || initialTemplate || mode === 'template') {
        setViewMode('form');
        
        // Infer Type from Account Class for Templates if not explicit
        if (mode === 'template' && accountId) {
             const acc = state.accounts.find(a => a.id === accountId);
             if (acc) {
                 if (acc.class === 'Revenue' || acc.class === 'Equity') setType('income');
                 else if (acc.class === 'Expenses' || acc.class === 'Liabilities') setType('expense');
             }
        }

        // Logic to swap UI fields for Income if editing existing data
        if (initialData && initialData.type === 'income' && !state.accounts.find(a => a.id === initialData.accountId)?.class.includes('Revenue')) {
             setAccountId(initialData.paymentAccountId || '');
             setPaymentAccountId(initialData.accountId);
        }
    } else {
        const isMobile = window.innerWidth < 768;
        if(isMobile) setViewMode('pos');
    }
  }, [initialData, initialTemplate, state.accounts, mode]);

  // AUTO-SET DEFAULT PAYMENT ACCOUNT
  useEffect(() => {
      if (initialData || initialTemplate) return; 
      // Only auto-select if it's a Sub-Ledger. 
      const bank = state.accounts.find(c => c.class === 'Assets' && c.name.toLowerCase().includes('bank') && c.level === 'sub_ledger');
      const cash = state.accounts.find(c => c.class === 'Assets' && c.name.toLowerCase().includes('cash') && c.level === 'sub_ledger');

      if (type === 'expense') {
          if (bank) setPaymentAccountId(bank.id);
      } else if (type === 'income') {
          if (cash) setPaymentAccountId(cash.id);
      } else if (type === 'transfer') {
          if (bank) setPaymentAccountId(bank.id);
      }
  }, [type, state.accounts, initialData, initialTemplate]);

  // DATA TRANSFORMATION FOR SEARCHABLE SELECT
  const availableAccounts = state.accounts
      .filter(c => {
          if (!c.isPosting) return false;
          // Removed strict sub_ledger check to allow GL accounts (like default Bank/Cash) to be selected
          // if (c.level !== 'sub_ledger') return false; 

          if (type === 'transfer') return true; 
          
          if (type === 'expense') return c.class === 'Expenses' || c.class === 'Liabilities' || c.class === 'Assets'; 
          if (type === 'income') return c.class === 'Revenue' || c.class === 'Equity';
          
          return true;
      })
      .sort((a, b) => {
          const codeA = parseInt(a.code) || 99999;
          const codeB = parseInt(b.code) || 99999;
          return codeA - codeB || a.name.localeCompare(b.name);
      })
      .map(c => ({
          id: c.id,
          label: c.name,
          subLabel: c.code
      }));

  const availableParties = state.parties
      .filter(e => e.type === (type === 'income' ? 'customer' : 'vendor'))
      .map(e => ({ id: e.id, label: e.name }));
  
  const transferSourceAccounts = state.accounts
      .filter(c => {
          if (!c.isPosting) return false;
          // Removed strict sub_ledger check
          // if (c.level !== 'sub_ledger') return false;

          if (type === 'transfer') return true;
          return c.class === 'Assets'; 
      })
      .sort((a, b) => {
          const codeA = parseInt(a.code) || 99999;
          const codeB = parseInt(b.code) || 99999;
          return codeA - codeB || a.name.localeCompare(b.name);
      })
      .map(c => ({
          id: c.id,
          label: c.name,
          subLabel: c.code
      }));

  // Organize Currencies: Base Currency first, then others
  const sortedCurrencies = [...CURRENCIES].sort((a, b) => {
      if (a.code === baseCurrency) return -1;
      if (b.code === baseCurrency) return 1;
      return a.code.localeCompare(b.code);
  });

  const selectedCurrencySymbol = CURRENCIES.find(c => c.code === currency)?.symbol || '$';

  const handleAccountChange = (id: string) => {
    setAccountId(id);
  };

  const handleTemplateClick = (templateId: string) => {
      const t = state.templates.find(temp => temp.id === templateId);
      if(!t) return;
      
      const acc = state.accounts.find(c => c.id === t.accountId);
      if(acc) {
        const targetType = (acc.class === 'Assets' || acc.class === 'Liabilities') ? 'expense' : (acc.class === 'Revenue' ? 'income' : 'expense');
        setType(targetType as TransactionType);
        setAccountId(acc.id);
        if (t.source) setSource(t.source);
      }
      
      if(t.amount) setAmount(t.amount.toString());
      setCurrency(t.currency);
      if(t.note) setNote(t.note);
      if(t.partyId) setPartyId(t.partyId);
      if(t.paymentAccountId) setPaymentAccountId(t.paymentAccountId);
      
      setViewMode('form'); 
  };

  const handleAmountBlur = () => {
      setAmount(evaluateMathExpression(amount));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const finalAmountStr = evaluateMathExpression(amount);
    
    if (!finalAmountStr && mode === 'transaction') return; // Amount mandatory for transaction
    if (!accountId) { alert('Please select a main category/account.'); return; }

    if (type === 'transfer' && !paymentAccountId) {
        alert("Please select a 'From' account.");
        return;
    }
    if (type === 'transfer' && accountId === paymentAccountId) {
        alert("From and To accounts cannot be the same.");
        return;
    }

    const inputAmount = parseFloat(finalAmountStr) || 0;
    
    // NOTE: In a real multi-currency system, we would ask for exchange rate if Currency != BaseCurrency.
    // For now, we assume direct entry relative to Base Currency or user handles conversion logic via input expression.
    // However, to respect the "Base Amount" field, if currency matches base, it's 1:1.
    // If different, we ideally prompt. For this specific implementation scope, we treat input amount as raw
    // and store it. The `amount` field in DB is meant to be Normalized.
    // We will just store inputAmount as amount for now unless we add an exchange rate picker.
    // Since the prompt emphasizes "Data Integrity", storing accurate original_amount is key.
    
    const finalAmountBase = inputAmount; // Simplified: Assuming user enters base equivalent or 1:1 for now

    // --- CRITICAL ACCOUNTING LOGIC ---
    let finalDebitAccount = accountId;
    let finalCreditAccount = paymentAccountId;

    if (type === 'income') {
        finalDebitAccount = paymentAccountId; // Bank becomes Dr
        finalCreditAccount = accountId;      // Revenue becomes Cr
    } 

    // --- TEMPLATE SAVE MODE ---
    if (mode === 'template') {
        if (!templateName) { alert('Please name your shortcut.'); return; }
        const templateData: TransactionTemplate = {
            id: initialTemplate?.id || Math.random().toString(36).substr(2, 9),
            name: templateName,
            icon: templateIcon,
            accountId: accountId, // Store the user selected account ID (Category), not the resolved debit/credit
            amount: inputAmount || undefined, // Optional in template
            currency: currency,
            note: note,
            partyId: partyId || undefined,
            paymentAccountId: paymentAccountId || undefined,
            source: source
        };
        if (onSaveTemplate) onSaveTemplate(templateData);
        onComplete();
        return;
    }

    // --- TRANSACTION SAVE MODE ---
    if (isNaN(inputAmount) || inputAmount <= 0) {
        alert("Invalid amount");
        return;
    }

    const transactionData: Transaction = {
      id: initialData?.id || Math.random().toString(36).substr(2, 9),
      date: new Date(date).toISOString(),
      type,
      amount: finalAmountBase, // This should technically be the converted amount to base
      originalAmount: inputAmount,
      currency: currency,
      accountId: finalDebitAccount, // DEBIT
      source,
      paymentAccountId: finalCreditAccount || undefined, // CREDIT
      note,
      relatedPartyId: partyId || undefined
    };

    if (initialData) {
        dispatch({ type: 'UPDATE_TRANSACTION', payload: transactionData });
    } else {
        dispatch({ type: 'ADD_TRANSACTION', payload: transactionData });

        if (isRecurring) {
            // STRICT DATE CALCULATION
            const baseDate = new Date(date + 'T00:00:00.000Z');
            let nextDate = baseDate;
            
            if (recurFreq === 'daily') nextDate = addDays(baseDate, 1);
            if (recurFreq === 'weekly') nextDate = addWeeks(baseDate, 1);
            if (recurFreq === 'monthly') nextDate = addMonths(baseDate, 1);
            if (recurFreq === 'yearly') nextDate = addYears(baseDate, 1);

            const recurringRule: RecurringTransaction = {
                id: Math.random().toString(36).substr(2, 9),
                active: true,
                type,
                accountId: finalDebitAccount,
                amount: finalAmountBase,
                originalAmount: inputAmount,
                currency,
                source,
                paymentAccountId: finalCreditAccount || undefined,
                partyId: partyId || undefined,
                note: note,
                frequency: recurFreq,
                nextDueDate: nextDate.toISOString()
            };

            dispatch({ type: 'ADD_RECURRING', payload: recurringRule });
            // Use local string for alert to be friendly
            alert(`Recurring rule created. Next due: ${nextDate.toISOString().split('T')[0]}`);
        }
    }
    onComplete();
  };

  return (
    <div className="space-y-4">
        {!initialData && mode === 'transaction' && (
            <div className="flex justify-end mb-2">
                <button 
                    onClick={() => setViewMode(viewMode === 'form' ? 'pos' : 'form')}
                    className="text-xs flex items-center gap-1.5 text-primary hover:text-blue-400 font-bold px-4 py-2.5 bg-gray-800 rounded-xl border border-gray-700 glass-card btn-float active:scale-95"
                >
                    {viewMode === 'form' ? <><LayoutGrid size={16} /> Use Shortcuts</> : <><List size={16} /> Manual Entry</>}
                </button>
            </div>
        )}

        {viewMode === 'pos' && !initialData && mode === 'transaction' ? (
            <div className="grid grid-cols-2 gap-3 max-h-[60vh] overflow-y-auto no-scrollbar pb-4">
                {state.templates.length === 0 && (
                    <div className="col-span-2 text-center py-12 text-gray-500 text-sm border border-dashed border-gray-700 rounded-2xl flex flex-col items-center gap-3">
                        <LayoutGrid size={32} className="opacity-20" />
                        <div>No shortcuts configured.<br/>Add them in Settings.</div>
                    </div>
                )}
                {state.templates.map(t => {
                    const tSym = CURRENCIES.find(c => c.code === t.currency)?.symbol || '$';
                    return (
                        <button
                            key={t.id}
                            onClick={() => handleTemplateClick(t.id)}
                            className="flex flex-col items-center justify-center p-5 bg-gray-800/60 backdrop-blur-md border border-gray-700 hover:border-primary hover:bg-gray-800/80 rounded-2xl transition-all active:scale-95 btn-float group"
                        >
                            <span className="text-4xl mb-3 group-hover:scale-110 transition-transform">{t.icon || '⚡'}</span>
                            <span className="text-sm font-bold text-gray-100 tracking-tight">{t.name}</span>
                            {t.amount && (
                            <span className="text-[10px] text-gold-500/80 font-mono mt-1 px-1.5 py-0.5 bg-gold-500/5 rounded border border-gold-500/10">
                                {tSym}{t.amount.toLocaleString()}
                            </span>
                            )}
                        </button>
                    );
                })}
            </div>
        ) : (
            <form onSubmit={handleSubmit} className="space-y-5 animate-fade-in">
                
                {/* QUICK SHORTCUTS FOR ACCRUALS */}
                {mode === 'transaction' && !initialData && (
                    <div className="grid grid-cols-3 gap-3 mb-2">
                        <button 
                            type="button" 
                            onClick={() => {
                                onComplete();
                                navigate('/apar', { state: { openMode: 'receivable', openSubMode: 'invoice' } });
                            }} 
                            className="flex items-center justify-center py-2.5 rounded-xl text-xs font-bold uppercase tracking-widest bg-gradient-to-br from-emerald-500/10 to-teal-600/10 hover:from-emerald-500/30 hover:to-teal-600/30 border border-emerald-500/20 hover:border-emerald-500/50 text-emerald-400 transition-all active:scale-95 shadow-lg shadow-emerald-900/5 backdrop-blur-md"
                        >
                            AR
                        </button>
                        <button 
                            type="button" 
                            onClick={() => {
                                onComplete();
                                navigate('/apar', { state: { openMode: 'payable', openSubMode: 'bill' } });
                            }} 
                            className="flex items-center justify-center py-2.5 rounded-xl text-xs font-bold uppercase tracking-widest bg-gradient-to-br from-red-500/10 to-orange-600/10 hover:from-red-500/30 hover:to-orange-600/30 border border-red-500/20 hover:border-red-500/50 text-red-400 transition-all active:scale-95 shadow-lg shadow-red-900/5 backdrop-blur-md"
                        >
                            AP
                        </button>
                        <button 
                            type="button" 
                            onClick={() => {
                                onComplete();
                                navigate('/apar', { state: { openMode: 'receivable', openSubMode: 'loan' } });
                            }} 
                            className="flex items-center justify-center py-2.5 rounded-xl text-xs font-bold uppercase tracking-widest bg-gradient-to-br from-purple-500/10 to-indigo-600/10 hover:from-purple-500/30 hover:to-indigo-600/30 border border-purple-500/20 hover:border-purple-500/50 text-purple-400 transition-all active:scale-95 shadow-lg shadow-purple-900/5 backdrop-blur-md"
                        >
                            P
                        </button>
                    </div>
                )}

                {/* TEMPLATE HEADER FIELDS */}
                {mode === 'template' && (
                    <div className="bg-indigo-900/20 p-4 rounded-xl border border-indigo-500/30 space-y-4 mb-2">
                        <h4 className="text-xs font-bold text-indigo-400 uppercase tracking-widest flex items-center gap-2">
                            <Star size={14} /> Shortcut Details
                        </h4>
                        <div>
                            <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1.5 ml-1">Shortcut Name</label>
                            <input 
                                type="text" 
                                value={templateName} 
                                onChange={e => setTemplateName(e.target.value)} 
                                className="w-full px-4 py-2.5 bg-gray-950 text-white border border-gray-700 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none" 
                                placeholder="e.g. Morning Coffee"
                                autoFocus
                            />
                        </div>
                        <div>
                            <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1.5 ml-1">Icon / Emoji</label>
                            <div className="flex gap-2">
                                {['⚡','☕','⛽','🛒','🍔','🚗','🏠','💊','✈️','🎓'].map(icon => (
                                    <button 
                                        type="button" 
                                        key={icon} 
                                        onClick={() => setTemplateIcon(icon)}
                                        className={`w-10 h-10 rounded-lg flex items-center justify-center text-xl transition-colors ${templateIcon === icon ? 'bg-indigo-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}`}
                                    >
                                        {icon}
                                    </button>
                                ))}
                                <input 
                                    type="text" 
                                    value={templateIcon} 
                                    onChange={e => setTemplateIcon(e.target.value)} 
                                    className="w-12 h-10 text-center bg-gray-950 border border-gray-700 rounded-lg text-white" 
                                    placeholder="?"
                                />
                            </div>
                        </div>
                    </div>
                )}

                <div className="grid grid-cols-3 gap-2 p-1.5 bg-gray-900/50 rounded-2xl border border-gray-700">
                    <button type="button" onClick={() => { setType('expense'); setPartyId(''); }} className={`py-3 text-xs font-bold uppercase tracking-widest rounded-xl transition-all ${type === 'expense' ? 'bg-gray-700 text-red-400 shadow-lg shadow-black/20 ring-1 ring-white/10' : 'text-gray-500 hover:text-gray-300'}`}>Expense</button>
                    <button type="button" onClick={() => { setType('income'); setPartyId(''); }} className={`py-3 text-xs font-bold uppercase tracking-widest rounded-xl transition-all ${type === 'income' ? 'bg-gray-700 text-emerald-400 shadow-lg shadow-black/20 ring-1 ring-white/10' : 'text-gray-500 hover:text-gray-300'}`}>Income</button>
                    <button type="button" onClick={() => { setType('transfer'); setPartyId(''); }} className={`py-3 text-xs font-bold uppercase tracking-widest rounded-xl transition-all ${type === 'transfer' ? 'bg-gray-700 text-blue-400 shadow-lg shadow-black/20 ring-1 ring-white/10' : 'text-gray-500 hover:text-gray-300'}`}>Transfer</button>
                </div>

                <div>
                    <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1.5 ml-1">Amount {mode === 'template' && '(Optional)'}</label>
                    <div className="flex gap-2">
                        <div className="relative flex-1">
                        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gold-500 text-xl font-bold">{selectedCurrencySymbol}</span>
                        <input 
                            type="text" 
                            inputMode="decimal"
                            value={amount} 
                            onChange={(e) => setAmount(e.target.value)} 
                            onBlur={handleAmountBlur}
                            className="w-full pl-12 pr-4 py-4 text-3xl font-bold text-white bg-gray-950 border border-gray-700 rounded-2xl focus:ring-2 focus:ring-primary focus:border-transparent outline-none placeholder-gray-800" 
                            placeholder={mode === 'template' ? "0.00 (Optional)" : "0.00"}
                            required={mode === 'transaction'}
                        />
                        </div>
                        <div className="w-24">
                            <select 
                                value={currency} 
                                onChange={(e) => setCurrency(e.target.value as CurrencyCode)} 
                                className="w-full h-full px-2 bg-gray-950 text-white border border-gray-700 rounded-2xl focus:ring-2 focus:ring-primary outline-none font-bold text-center appearance-none"
                            >
                                {sortedCurrencies.map(c => (
                                    <option key={c.code} value={c.code}>{c.code}</option>
                                ))}
                            </select>
                        </div>
                    </div>
                    {/* Math Toolbar */}
                    <div className="flex gap-2 mt-2 overflow-x-auto no-scrollbar pb-1">
                        {['+', '-', '*', '/', '(', ')'].map(op => (
                            <button
                                key={op}
                                type="button"
                                tabIndex={-1}
                                onMouseDown={(e) => e.preventDefault()}
                                onClick={() => setAmount(prev => prev + op)}
                                className="flex-1 min-w-[40px] h-10 bg-gray-800 hover:bg-gray-700 text-gold-400 font-bold rounded-lg border border-gray-700 flex items-center justify-center text-lg active:scale-95 transition-transform"
                            >
                                {op === '*' ? '×' : op === '/' ? '÷' : op}
                            </button>
                        ))}
                    </div>
                </div>

                {type === 'transfer' ? (
                     <div className="grid grid-cols-1 gap-5 p-5 bg-blue-900/10 border border-blue-500/20 rounded-2xl relative overflow-hidden">
                        <div className="absolute top-0 right-0 p-3 opacity-5">
                          <ArrowRightLeft size={64} className="text-blue-500" />
                        </div>
                        <div>
                            <label className="block text-[10px] font-bold text-blue-400 uppercase tracking-widest mb-1.5">From Account (Credit)</label>
                            <SearchableSelect
                                options={transferSourceAccounts}
                                value={paymentAccountId}
                                onChange={setPaymentAccountId}
                                placeholder="Select Source..."
                                required
                            />
                        </div>
                        <div className="flex justify-center -my-3 relative z-10">
                            <div className="bg-gray-900 border border-blue-500/30 p-2 rounded-full shadow-lg">
                              <ArrowRight className="text-blue-500 rotate-90" size={16} />
                            </div>
                        </div>
                        <div>
                            <label className="block text-[10px] font-bold text-blue-400 uppercase tracking-widest mb-1.5">To Account (Debit)</label>
                            <SearchableSelect
                                options={availableAccounts}
                                value={accountId}
                                onChange={handleAccountChange}
                                placeholder="Select Destination..."
                                required
                            />
                        </div>
                     </div>
                ) : (
                    <div className="space-y-4">
                        <div>
                            <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1.5 ml-1">Classification ({type === 'income' ? 'Revenue' : 'Expense'})</label>
                            <SearchableSelect
                                options={availableAccounts}
                                value={accountId}
                                onChange={handleAccountChange}
                                placeholder="Select Account..."
                                required
                            />
                        </div>
                        
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1.5 ml-1">Payment via</label>
                                <SearchableSelect
                                    options={[{id: '', label: 'None'}, ...transferSourceAccounts]}
                                    value={paymentAccountId}
                                    onChange={setPaymentAccountId}
                                    placeholder="Source..."
                                />
                            </div>
                            <div>
                                <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1.5 ml-1 truncate">{type === 'income' ? 'Payer' : 'Merchant'}</label>
                                <SearchableSelect
                                    options={[{id: '', label: 'Opt...'}, ...availableParties]}
                                    value={partyId}
                                    onChange={setPartyId}
                                    placeholder="Party..."
                                />
                            </div>
                        </div>
                    </div>
                )}

                {mode === 'transaction' && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1.5 ml-1">Effective Date</label>
                            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-full px-4 py-3.5 bg-gray-950 text-white border border-gray-700 rounded-2xl text-sm focus:ring-2 focus:ring-primary outline-none" />
                        </div>
                    </div>
                )}

                {!initialData && mode === 'transaction' && (
                    <div className="p-4 bg-gray-950/50 rounded-2xl border border-gray-800">
                        <div className="flex items-center gap-3 mb-2">
                            <input 
                                type="checkbox" 
                                id="isRecurring"
                                checked={isRecurring} 
                                onChange={e => setIsRecurring(e.target.checked)} 
                                className="w-5 h-5 rounded-lg bg-gray-900 border-gray-700 focus:ring-primary text-primary" 
                            />
                            <label htmlFor="isRecurring" className="text-sm font-bold text-gray-300 flex items-center gap-2 cursor-pointer">
                                <Repeat size={14} className="text-gold-500" />
                                Automate Transaction?
                            </label>
                        </div>
                        {isRecurring && (
                            <div className="flex items-center gap-3 animate-fade-in pl-8 mt-2">
                                <span className="text-xs text-gray-500 font-bold uppercase tracking-wider">Interval:</span>
                                <select 
                                    className="px-4 py-2 bg-gray-900 border border-gray-700 rounded-xl text-white text-xs outline-none focus:border-gold-500 font-bold uppercase" 
                                    value={recurFreq} 
                                    onChange={e => setRecurFreq(e.target.value as RecurrenceFrequency)}
                                >
                                    <option value="daily">Daily</option>
                                    <option value="weekly">Weekly</option>
                                    <option value="monthly">Monthly</option>
                                    <option value="yearly">Yearly</option>
                                </select>
                            </div>
                        )}
                    </div>
                )}

                <div>
                    <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1.5 ml-1">Memo / Reference</label>
                    <textarea value={note} onChange={(e) => setNote(e.target.value)} className="w-full px-4 py-3 bg-gray-950 text-white border border-gray-700 rounded-2xl text-sm focus:ring-2 focus:ring-primary outline-none resize-none h-24 placeholder-gray-900" placeholder="Type notes here..." />
                </div>

                <div className="pt-2">
                   <button type="submit" className="w-full flex items-center justify-center gap-3 py-4 bg-primary hover:bg-blue-600 text-white rounded-2xl font-bold transition-all shadow-xl shadow-blue-900/30 active:scale-[0.98] btn-float text-sm uppercase tracking-widest">
                      {mode === 'template' ? <Save size={20} /> : (initialData ? <Save size={20} /> : <Check size={20} />)}
                      {mode === 'template' ? 'Save Shortcut' : (initialData ? 'Commit Update' : 'Commit Entry')}
                  </button>
                </div>
            </form>
        )}
    </div>
  );
};
