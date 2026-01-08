
import React, { useState } from 'react';
import { useFinance } from '../context/FinanceContext';
import { Asset, Transaction, Account } from '../types';
import { Plus, Monitor, Trash2, CalendarClock, AlertCircle, Pencil } from 'lucide-react';
import { Modal } from '../components/ui/Modal';
import { format, parseISO, addMonths, isBefore } from 'date-fns';
import { SearchableSelect } from '../components/ui/SearchableSelect';
import { evaluateMathExpression } from '../utils/mathUtils';
import { calculateDirectBalance } from '../utils/accountHierarchy';

export const Assets: React.FC = () => {
  const { state, dispatch } = useFinance();
  const [isModalOpen, setIsModalOpen] = useState(false);
  
  // Form State
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [value, setValue] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [life, setLife] = useState('');
  const [note, setNote] = useState('');
  // Payment source for Double Entry
  const [paymentAccountId, setPaymentAccountId] = useState('');

  const currency = state.businessProfile.baseCurrency || 'QAR';

  const cashAccountOptions = state.accounts
    .filter(c => c.class === 'Assets')
    .map(c => ({ id: c.id, label: c.name, subLabel: c.code }));

  const paymentOptions = [{id: '', label: 'None (Opening Balance / Equity)'}, ...cashAccountOptions];

  const handleCostBlur = () => {
      setValue(evaluateMathExpression(value));
  };

  const openAddModal = () => {
      setEditingId(null);
      setName(''); setValue(''); setDate(new Date().toISOString().split('T')[0]); setNote(''); setLife(''); setPaymentAccountId('');
      setIsModalOpen(true);
  };

  const openEditModal = (asset: Asset) => {
      setEditingId(asset.id);
      setName(asset.name);
      setValue(asset.originalValue.toString());
      setDate(asset.purchaseDate ? asset.purchaseDate.split('T')[0] : new Date().toISOString().split('T')[0]);
      setLife(asset.usefulLifeYears.toString());
      setNote(asset.note || '');
      setPaymentAccountId(''); // Don't allow changing payment source on edit to keep logic simple
      setIsModalOpen(true);
  }

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    const finalCostStr = evaluateMathExpression(value);
    const inputVal = parseFloat(finalCostStr);
    const usefulLifeVal = parseFloat(life);
    
    if (isNaN(inputVal) || isNaN(usefulLifeVal) || usefulLifeVal <= 0) {
        alert("Invalid Cost or Useful Life");
        return;
    }

    if (editingId) {
        // --- EDIT MODE ---
        const existingAsset = state.assets.find(a => a.id === editingId);
        if (!existingAsset) return;

        // 1. Update Asset Object
        const updatedAsset: Asset = {
            ...existingAsset,
            name,
            originalValue: inputVal,
            value: inputVal - (existingAsset.originalValue - existingAsset.value), // Approximation, mostly display
            usefulLifeYears: usefulLifeVal,
            note,
            purchaseDate: new Date(date).toISOString()
        };
        dispatch({ type: 'UPDATE_ASSET', payload: updatedAsset });

        // 2. Update Linked Account Names
        if (existingAsset.linkedAccountId) {
            const costAccount = state.accounts.find(a => a.id === existingAsset.linkedAccountId);
            if (costAccount) {
                dispatch({ type: 'UPDATE_ACCOUNT', payload: { ...costAccount, name: `${name} (Cost)` } });
            }
            
            // Try to find the Accum Dep account by name pattern
            const oldAccumName = `Accum Dep - ${existingAsset.name}`;
            const accumAccount = state.accounts.find(a => a.name === oldAccumName);
            if (accumAccount) {
                 dispatch({ type: 'UPDATE_ACCOUNT', payload: { ...accumAccount, name: `Accum Dep - ${name}` } });
            }
        }

        // 3. Update Original Acquisition Transaction (To Fix Ledger Balance)
        if (existingAsset.linkedAccountId) {
            const acqTx = state.transactions.find(t => t.accountId === existingAsset.linkedAccountId && (t.type === 'transfer' || t.type === 'expense'));
            if (acqTx) {
                dispatch({ 
                    type: 'UPDATE_TRANSACTION', 
                    payload: { 
                        ...acqTx, 
                        amount: inputVal, 
                        originalAmount: inputVal,
                        date: new Date(date).toISOString() 
                    } 
                });
            }
        }

        setIsModalOpen(false);

    } else {
        // --- ADD MODE ---
        // 1. Create Fixed Asset Cost Account (Debit Normal)
        const assetCostAccountId = Math.random().toString(36).substr(2, 9);
        const fixedAssetsCount = state.accounts.filter(a => a.class === 'Assets' && a.parentId === '12000').length;
        const newCode = (12100 + fixedAssetsCount + 1).toString();

        dispatch({ 
            type: 'ADD_ACCOUNT', 
            payload: {
                id: assetCostAccountId,
                name: `${name} (Cost)`,
                class: 'Assets',
                level: 'gl',
                code: newCode,
                parentId: '12000', // Fixed Assets Group
                normalBalance: 'debit',
                isPosting: true
            }
        });

        // 2. Create Specific Accumulated Depreciation Account (Credit Normal)
        const accumDepAccountId = Math.random().toString(36).substr(2, 9);
        
        let accumDepParent = state.accounts.find(a => a.code === '12900' && a.level === 'group');
        if (!accumDepParent) {
            accumDepParent = state.accounts.find(a => a.id === '12000'); 
        }

        dispatch({ 
            type: 'ADD_ACCOUNT', 
            payload: {
                id: accumDepAccountId,
                name: `Accum Dep - ${name}`, // Strict Naming for Auto-Linkage
                class: 'Assets',
                level: 'sub_ledger',
                code: `AD-${newCode}`,
                parentId: accumDepParent?.id,
                normalBalance: 'credit', // Contra Asset
                isPosting: true,
                isSystem: true 
            }
        });

        // --- RETROACTIVE DEPRECIATION LOGIC ---
        // 2a. Find or Create Depreciation Expense Account (60900)
        let depExpAccount = state.accounts.find(c => c.code === '60900' || c.name === 'Depreciation Expense');
        
        if (!depExpAccount) {
            // Auto-create to prevent silent failure
            const newDepExpId = Math.random().toString(36).substr(2, 9);
            const parentExp = state.accounts.find(a => a.class === 'Expenses' && a.level === 'group') || state.accounts.find(a => a.class === 'Expenses');
            depExpAccount = {
                id: newDepExpId,
                code: '60900',
                name: 'Depreciation Expense',
                class: 'Expenses',
                level: 'gl',
                parentId: parentExp?.id,
                normalBalance: 'debit',
                isPosting: true,
                isSystem: true
            };
            dispatch({ type: 'ADD_ACCOUNT', payload: depExpAccount });
        }

        let accumulatedDep = 0;
        let lastDepDateStr: string | undefined = undefined;
        
        // 2b. Execute Retro Loop
        if (depExpAccount && usefulLifeVal > 0) {
            const purchaseDateObj = parseISO(date); // Use parseISO to ensure correct date interpretation
            const now = new Date();
            const monthlyAmount = inputVal / (usefulLifeVal * 12);
            
            // Start checking from month 1 after purchase
            let nextRun = addMonths(purchaseDateObj, 1);
            
            // Loop while the depreciation date is strictly before now
            while (isBefore(nextRun, now)) {
                // Safety Cap: Don't depreciate more than value
                if (accumulatedDep + monthlyAmount > inputVal) break;

                const depTx: Transaction = {
                    id: Math.random().toString(36).substr(2, 9),
                    date: nextRun.toISOString(),
                    type: 'expense',
                    accountId: depExpAccount.id, // Dr Depreciation Expense
                    paymentAccountId: accumDepAccountId, // Cr Accum Dep - [Asset]
                    amount: monthlyAmount,
                    currency: 'QAR',
                    source: 'personal',
                    note: `Auto Depreciation (Catch-up): ${name} (${format(nextRun, 'MMM yyyy')})`
                };
                
                dispatch({ type: 'ADD_TRANSACTION', payload: depTx });
                
                accumulatedDep += monthlyAmount;
                lastDepDateStr = nextRun.toISOString();
                nextRun = addMonths(nextRun, 1);
            }
        }

        // 3. Create Asset Record
        const newAsset: Asset = {
            id: Math.random().toString(36).substr(2, 9),
            name,
            value: Math.max(0, inputVal - accumulatedDep), // Set Initial Book Value
            originalValue: inputVal,
            currency: 'QAR',
            purchaseDate: new Date(date).toISOString(),
            usefulLifeYears: usefulLifeVal,
            note,
            linkedAccountId: assetCostAccountId,
            lastDepreciationDate: lastDepDateStr // Mark last run so Context doesn't duplicate
        };

        dispatch({ type: 'ADD_ASSET', payload: newAsset });

        // 4. Post Acquisition Journal
        const creditAccount = paymentAccountId || 'equity_opening'; 
        const sourceNote = paymentAccountId ? `Purchase of Asset: ${name}` : `Opening Balance Asset: ${name}`;

        const purchaseTx: Transaction = {
            id: Math.random().toString(36).substr(2, 9),
            date: new Date(date).toISOString(),
            type: 'transfer',
            accountId: assetCostAccountId, // Debit Asset Cost
            amount: inputVal,
            currency: 'QAR',
            source: 'personal',
            paymentAccountId: creditAccount, // Credit Bank/Equity
            note: sourceNote
        };
        dispatch({ type: 'ADD_TRANSACTION', payload: purchaseTx });

        setIsModalOpen(false);
    }
    
    // Reset
    setName(''); setValue(''); setDate(new Date().toISOString().split('T')[0]); setNote(''); setLife(''); setPaymentAccountId('');
  };

  const handleDelete = (asset: Asset) => {
      if(confirm(`Delete Asset: ${asset.name}?\n\nWARNING: This will delete the Asset Record, the linked GL Accounts (Cost & Accum Dep), and ALL related ledger transactions (Acquisition & Depreciation).\n\nThis action cannot be undone.`)) {
          
          // 1. Identify Accounts
          const costAccountId = asset.linkedAccountId;
          const accumDepAccount = state.accounts.find(a => a.name === `Accum Dep - ${asset.name}`);
          const accumDepAccountId = accumDepAccount?.id;

          // 2. Delete Transactions Linked to these accounts
          const txToDelete = state.transactions.filter(t => 
             (costAccountId && (t.accountId === costAccountId || t.paymentAccountId === costAccountId)) ||
             (accumDepAccountId && (t.accountId === accumDepAccountId || t.paymentAccountId === accumDepAccountId))
          );
          
          txToDelete.forEach(t => {
              dispatch({ type: 'DELETE_TRANSACTION', payload: t.id });
          });

          // 3. Delete Accounts
          if (costAccountId) dispatch({ type: 'DELETE_ACCOUNT', payload: costAccountId });
          if (accumDepAccountId) dispatch({ type: 'DELETE_ACCOUNT', payload: accumDepAccountId });

          // 4. Delete Asset Record
          dispatch({ type: 'DELETE_ASSET', payload: asset.id });
      }
  }

  const totalBookValue = state.assets.reduce((sum, asset) => {
      // Dynamic Calculation for Summary
      const accumDepAccount = state.accounts.find(a => a.name === `Accum Dep - ${asset.name}`);
      const accumDepVal = accumDepAccount 
        ? calculateDirectBalance(accumDepAccount.id, state.transactions, 'credit')
        : 0; 
      
      if (!accumDepAccount && asset.lastDepreciationDate) return sum + asset.value;

      return sum + (asset.originalValue - accumDepVal);
  }, 0);

  return (
    <div className="space-y-6 pb-20 md:pb-0 animate-fade-in">
      <div className="flex justify-between items-center">
        <div>
            <h1 className="text-2xl font-bold text-gray-100">Fixed Assets</h1>
            <p className="text-gray-400 text-sm">Subsidiary Ledger & Automatic Depreciation</p>
        </div>
        <button 
          onClick={openAddModal}
          className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-all hover:scale-105 active:scale-95"
        >
          <Plus size={16} />
          Add Asset
        </button>
      </div>

      {/* Summary Card */}
      <div className="bg-indigo-900/20 border border-indigo-900/30 p-6 rounded-2xl flex items-center justify-between shadow-lg">
          <div>
            <p className="text-indigo-400 text-sm font-medium uppercase tracking-wider">Total Book Value</p>
            <p className="text-3xl font-bold text-indigo-300 mt-1">{currency} {totalBookValue.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}</p>
            <p className="text-[10px] text-indigo-500/60 mt-1">Real-time Ledger Calculation</p>
          </div>
          <div className="bg-indigo-900/40 p-3 rounded-xl text-indigo-400">
            <Monitor size={32} />
          </div>
      </div>

      {/* List */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {state.assets.map(asset => {
             const linkedAccountName = state.accounts.find(c => c.id === asset.linkedAccountId)?.name;
             
             // --- DYNAMIC BOOK VALUE CALCULATION ---
             const accumDepAccount = state.accounts.find(a => a.name === `Accum Dep - ${asset.name}`);
             
             const totalDepreciated = accumDepAccount 
                ? calculateDirectBalance(accumDepAccount.id, state.transactions, 'credit') 
                : (asset.originalValue - asset.value); 

             const currentBookValue = Math.max(0, asset.originalValue - totalDepreciated);
             
             const monthlyDep = asset.originalValue / (asset.usefulLifeYears * 12);
             const nextDepDate = asset.lastDepreciationDate 
                ? addMonths(parseISO(asset.lastDepreciationDate), 1) 
                : addMonths(parseISO(asset.purchaseDate), 1);

             return (
                <div key={asset.id} className="bg-gray-900 border border-gray-800 p-5 rounded-2xl flex flex-col justify-between group relative hover:border-gray-600 hover:-translate-y-1 hover:shadow-xl transition-all duration-300">
                    <div>
                        <div className="flex justify-between items-start">
                            <div className="p-2 bg-gray-800 rounded-lg text-gray-400 mb-3 inline-block">
                                <Monitor size={20} />
                            </div>
                            <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                <button onClick={() => openEditModal(asset)} className="text-gray-600 hover:text-blue-400 p-1.5 hover:bg-gray-800 rounded active:scale-90 transition-transform">
                                    <Pencil size={16} />
                                </button>
                                <button onClick={() => handleDelete(asset)} className="text-gray-600 hover:text-red-400 p-1.5 hover:bg-gray-800 rounded active:scale-90 transition-transform">
                                    <Trash2 size={16} />
                                </button>
                            </div>
                        </div>
                        <h3 className="text-lg font-bold text-gray-100">{asset.name}</h3>
                        <div className="flex flex-col gap-1 mt-1">
                            <p className="text-xs text-gray-500 font-mono">Cost Acc: {linkedAccountName || 'Unlinked'}</p>
                            {accumDepAccount ? (
                                <p className="text-xs text-gray-500 font-mono">Dep Acc: {accumDepAccount.name}</p>
                            ) : (
                                <p className="text-[10px] text-orange-400/60 flex items-center gap-1"><AlertCircle size={10}/> Using Global Dep Account</p>
                            )}
                        </div>
                        
                        <div className="mt-3 space-y-1">
                            <div className="flex justify-between text-xs text-gray-500">
                                <span>Original Cost:</span>
                                <span>{asset.originalValue.toLocaleString()}</span>
                            </div>
                            <div className="flex justify-between text-xs text-gray-500">
                                <span>Useful Life:</span>
                                <span>{asset.usefulLifeYears} Years</span>
                            </div>
                            <div className="flex justify-between text-xs text-gray-400 font-medium">
                                <span>Monthly Dep:</span>
                                <span>{monthlyDep.toFixed(2)}</span>
                            </div>
                            <div className="flex justify-between text-xs text-red-400/60">
                                <span>Accumulated Dep:</span>
                                <span>-{totalDepreciated.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</span>
                            </div>
                        </div>

                        {currentBookValue > 0 ? (
                            <div className="mt-2 flex items-center gap-1.5 text-[10px] text-indigo-400 bg-indigo-900/20 px-2 py-1 rounded w-fit">
                                <CalendarClock size={12} />
                                <span>Next Run: {format(nextDepDate, 'MMM yyyy')}</span>
                            </div>
                        ) : (
                            <div className="mt-2 text-[10px] text-green-400 bg-green-900/20 px-2 py-1 rounded w-fit font-bold">
                                Fully Depreciated
                            </div>
                        )}
                    </div>
                    <div className="mt-4 pt-4 border-t border-gray-800">
                        <p className="text-xs text-gray-500 uppercase font-bold">Net Book Value</p>
                        <p className="text-xl font-bold text-indigo-400">{currency} {currentBookValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                    </div>
                </div>
             );
        })}
         {state.assets.length === 0 && (
          <div className="col-span-full text-center py-12 text-gray-500 bg-gray-900 rounded-xl border border-dashed border-gray-800">
            No assets tracked.
          </div>
        )}
      </div>

      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title={editingId ? "Edit Asset" : "New Asset"}>
        <form onSubmit={handleSave} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-400 uppercase mb-1">Asset Name</label>
            <input 
              className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white outline-none focus:border-indigo-500" 
              value={name} onChange={e => setName(e.target.value)} required placeholder="e.g MacBook Pro" 
            />
            {!editingId && <p className="text-[10px] text-gray-500 mt-1">System will create two GL accounts: <b>Cost</b> and <b>Accumulated Depreciation</b>.</p>}
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <div>
                <label className="block text-xs font-medium text-gray-400 uppercase mb-1">Cost ({currency})</label>
                <input 
                type="text" 
                inputMode="decimal"
                className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white outline-none focus:border-indigo-500" 
                value={value} 
                onChange={e => setValue(e.target.value)} 
                onBlur={handleCostBlur}
                required 
                placeholder="0.00" 
                />
            </div>
            <div>
                <label className="block text-xs font-medium text-gray-400 uppercase mb-1">Useful Life (Years)</label>
                <input 
                type="number" className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white outline-none focus:border-indigo-500" 
                value={life} onChange={e => setLife(e.target.value)} required placeholder="e.g 3" 
                />
            </div>
          </div>
          
          {!editingId && (
              <div>
                <label className="block text-xs font-medium text-gray-400 uppercase mb-1">Acquisition Payment Source</label>
                <SearchableSelect
                  options={paymentOptions}
                  value={paymentAccountId}
                  onChange={setPaymentAccountId}
                  placeholder="Select Source..."
                />
                <p className="text-[10px] text-gray-500 mt-1">
                    {paymentAccountId 
                        ? `Dr Asset Cost, Cr ${state.accounts.find(c=>c.id===paymentAccountId)?.name}`
                        : "Dr Asset Cost, Cr Opening Balance Equity"
                    }
                </p>
              </div>
          )}

          <div>
            <label className="block text-xs font-medium text-gray-400 uppercase mb-1">Purchase Date</label>
            <input 
              type="date" className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white outline-none focus:border-indigo-500" 
              value={date} onChange={e => setDate(e.target.value)} required 
            />
          </div>
          
          <div>
            <label className="block text-xs font-medium text-gray-400 uppercase mb-1">Note</label>
            <textarea 
              className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white outline-none focus:border-indigo-500 resize-none h-20" 
              value={note} onChange={e => setNote(e.target.value)} placeholder="Serial number, warranty info..."
            />
          </div>
          <button className="w-full py-3 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 transition-colors">
            {editingId ? "Update Asset" : "Save Asset"}
          </button>
        </form>
      </Modal>
    </div>
  );
};
