
import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useFinance } from '../context/FinanceContext';
import { format, parseISO } from 'date-fns';
import { Search, Trash2, Pencil, Calendar, Tag, CreditCard } from 'lucide-react';
import { Modal } from '../components/ui/Modal';
import { TransactionForm } from '../components/TransactionForm';
import { Transaction } from '../types';
import { useLocation } from 'react-router-dom';

export const Journal: React.FC = () => {
  const { state, dispatch } = useFinance();
  const [searchTerm, setSearchTerm] = useState('');
  const [editingTx, setEditingTx] = useState<Transaction | null>(null);
  const location = useLocation();
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
      // Focus search input if navigated here via Ctrl+F (Global Search shortcut)
      if (location.state && (location.state as any).focusSearch) {
          if (searchInputRef.current) {
              searchInputRef.current.focus();
          }
          // Clear history state to prevent refocusing on refresh (optional but cleaner)
          window.history.replaceState({}, document.title);
      }
  }, [location]);

  const filteredTransactions = useMemo(() => {
    return state.transactions.filter(t => {
      const acc = state.accounts.find(c => c.id === t.accountId);
      const searchStr = (t.note + (acc?.name || '') + t.amount).toLowerCase();
      return searchStr.includes(searchTerm.toLowerCase());
    });
  }, [state.transactions, state.accounts, searchTerm]);

  const handleDelete = (id: string) => {
      if (window.confirm('Are you sure you want to delete this transaction? This action cannot be undone.')) {
          dispatch({ type: 'DELETE_TRANSACTION', payload: id });
      }
  };

  return (
    <div className="space-y-6 pb-20 md:pb-0 animate-fade-in">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-white tracking-tight">Journal</h1>
          <p className="text-gray-400 text-sm mt-1">Audit Log & History</p>
        </div>
      </div>

      <div className="glass-panel p-2 rounded-xl flex gap-4 border border-white/10 sticky top-16 md:relative md:top-0 z-20">
        <div className="flex-1 flex items-center gap-2 bg-gray-900/50 px-3 py-2.5 rounded-lg border border-gray-700/50 focus-within:border-gold-500/50 transition-colors">
           <Search size={18} className="text-gray-500" />
           <input 
             ref={searchInputRef}
             type="text" 
             placeholder="Search transactions..." 
             className="bg-transparent text-white outline-none w-full text-sm placeholder-gray-600"
             value={searchTerm}
             onChange={e => setSearchTerm(e.target.value)}
           />
        </div>
      </div>

      {/* Desktop Table View */}
      <div className="hidden md:block glass-card rounded-2xl overflow-hidden border border-white/5">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-gray-400">
            <thead className="bg-gray-900/80 text-gray-500 uppercase font-bold text-xs tracking-wider">
              <tr>
                <th className="p-4">Date</th>
                <th className="p-4">Account</th>
                <th className="p-4">Note</th>
                <th className="p-4 text-right">Amount</th>
                <th className="p-4 w-20 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {filteredTransactions.map(t => {
                const acc = state.accounts.find(c => c.id === t.accountId);
                return (
                  <tr key={t.id} className="hover:bg-white/5 transition-colors group">
                    <td className="p-4 whitespace-nowrap">{format(parseISO(t.date), 'MMM d, yyyy')}</td>
                    <td className="p-4">
                      <div className="flex items-center gap-2">
                         {/* Removed color since Account doesn't have it, can add later */}
                        <span className="text-gray-200 font-medium">{acc?.name}</span>
                      </div>
                    </td>
                    <td className="p-4 max-w-xs truncate text-gray-500">{t.note || '-'}</td>
                    <td className={`p-4 text-right font-bold ${t.type === 'income' ? 'text-emerald-400' : 'text-gray-300'}`}>
                      {t.type === 'income' ? '+' : '-'} {t.amount.toLocaleString()}
                    </td>
                    <td className="p-4">
                        <div className="flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button 
                                onClick={() => setEditingTx(t)}
                                className="text-gray-500 hover:text-blue-400 p-1.5 rounded hover:bg-blue-900/20 transition-colors"
                                title="Edit"
                            >
                                <Pencil size={16} />
                            </button>
                            <button 
                                onClick={() => handleDelete(t.id)}
                                className="text-gray-500 hover:text-red-400 p-1.5 rounded hover:bg-red-900/20 transition-colors"
                                title="Delete"
                            >
                                <Trash2 size={16} />
                            </button>
                        </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Mobile Card View */}
      <div className="md:hidden space-y-3">
        {filteredTransactions.map(t => {
          const acc = state.accounts.find(c => c.id === t.accountId);
          return (
            <div key={t.id} className="glass-card p-4 rounded-xl border border-white/5 flex flex-col gap-3">
              <div className="flex justify-between items-start">
                <div className="flex flex-col">
                  <span className="text-xs text-gray-500 font-medium uppercase tracking-wider mb-1 flex items-center gap-1.5">
                    <Calendar size={12} /> {format(parseISO(t.date), 'MMM d, yyyy')}
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="text-gray-200 font-semibold">{acc?.name}</span>
                  </div>
                </div>
                <div className={`text-right font-bold text-lg ${t.type === 'income' ? 'text-emerald-400' : 'text-gray-200'}`}>
                  {t.type === 'income' ? '+' : '-'} {t.amount.toLocaleString()}
                </div>
              </div>
              
              {t.note && (
                <p className="text-sm text-gray-400 italic">"{t.note}"</p>
              )}

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-white/5">
                <button 
                  onClick={() => setEditingTx(t)}
                  className="flex items-center gap-2 px-3 py-1.5 bg-blue-500/10 text-blue-400 rounded-lg text-xs font-bold"
                >
                  <Pencil size={14} /> Edit
                </button>
                <button 
                  onClick={() => handleDelete(t.id)}
                  className="flex items-center gap-2 px-3 py-1.5 bg-red-500/10 text-red-400 rounded-lg text-xs font-bold"
                >
                  <Trash2 size={14} /> Delete
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {filteredTransactions.length === 0 && (
         <div className="p-12 text-center text-gray-500 glass-card rounded-2xl border border-dashed border-white/10">
           No transactions found matching your search.
         </div>
      )}

      <Modal 
        isOpen={!!editingTx} 
        onClose={() => setEditingTx(null)}
        title="Edit Transaction"
      >
          {editingTx && (
              <TransactionForm 
                initialData={editingTx} 
                onComplete={() => setEditingTx(null)} 
              />
          )}
      </Modal>
    </div>
  );
};
