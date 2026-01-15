
import React, { useState, useMemo } from 'react';
import { useFinance } from '../context/FinanceContext';
import { format, startOfMonth, endOfMonth, parseISO, isWithinInterval, startOfYear, endOfYear } from 'date-fns';
import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts';
import { ChevronLeft, ChevronRight, Settings, Target, CheckSquare, Square, Copy, Calendar } from 'lucide-react';
import { Modal } from '../components/ui/Modal';

export const Budget: React.FC = () => {
  const { state, dispatch } = useFinance();
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [viewMode, setViewMode] = useState<'monthly' | 'yearly'>('monthly');
  const [isManageOpen, setIsManageOpen] = useState(false);
  
  // Copy Modal State
  const [isCopyModalOpen, setIsCopyModalOpen] = useState(false);
  const [copyTargetType, setCopyTargetType] = useState<'single' | 'year'>('single');
  const [copyTargetValue, setCopyTargetValue] = useState(''); // YYYY-MM for single, YYYY for year

  const currency = state.businessProfile.baseCurrency || 'QAR';

  const budgetKey = viewMode === 'monthly' ? format(selectedDate, 'yyyy-MM') : format(selectedDate, 'yyyy');
  const periodStart = viewMode === 'monthly' ? startOfMonth(selectedDate) : startOfYear(selectedDate);
  const periodEnd = viewMode === 'monthly' ? endOfMonth(selectedDate) : endOfYear(selectedDate);
  
  // Get existing budget for this period
  const existingBudget = state.monthlyBudgets?.find(b => b.monthKey === budgetKey);
  const categoryLimits: Record<string, number> = existingBudget?.categoryLimits || {};
  const visibleAccountIds = existingBudget?.visibleAccountIds || state.accounts.filter(c => c.class === 'Expenses').map(c => c.id);

  // Calculate actual spending per account for this period
  const actualSpending = useMemo(() => {
    const spending: Record<string, number> = {};
    state.transactions.filter(t => {
      const d = parseISO(t.date);
      return isWithinInterval(d, { start: periodStart, end: periodEnd }) && t.type === 'expense';
    }).forEach(t => {
      spending[t.accountId] = (spending[t.accountId] || 0) + t.amount;
    });
    return spending;
  }, [state.transactions, periodStart, periodEnd]);

  // Expense Accounts
  const allExpenseAccounts = state.accounts.filter(c => c.class === 'Expenses');
  const activeAccounts = allExpenseAccounts.filter(c => visibleAccountIds.includes(c.id));

  // Handlers
  const handleLimitChange = (accId: string, val: string) => {
      const limit = parseFloat(val) || 0;
      const newLimits = { ...categoryLimits, [accId]: limit };
      
      // Calculate Total from visible
      const totalLimit = Object.entries(newLimits)
        .filter(([id]) => visibleAccountIds.includes(id))
        .reduce((sum, [_, amt]) => sum + (amt as number), 0);

      dispatch({
          type: 'SET_MONTHLY_BUDGET',
          payload: {
              monthKey: budgetKey,
              limit: totalLimit,
              categoryLimits: newLimits,
              visibleAccountIds
          }
      });
  };

  const handleVisibleToggle = (accId: string) => {
      const newVisible = visibleAccountIds.includes(accId) 
        ? visibleAccountIds.filter(id => id !== accId)
        : [...visibleAccountIds, accId];
      
      const totalLimit = Object.entries(categoryLimits)
        .filter(([id]) => newVisible.includes(id))
        .reduce((sum, [_, amt]) => sum + (amt as number), 0);

      dispatch({
          type: 'SET_MONTHLY_BUDGET',
          payload: {
              monthKey: budgetKey,
              limit: totalLimit,
              categoryLimits,
              visibleAccountIds: newVisible
          }
      });
  };

  const changePeriod = (delta: number) => {
      const newDate = new Date(selectedDate);
      if (viewMode === 'monthly') newDate.setMonth(newDate.getMonth() + delta);
      else newDate.setFullYear(newDate.getFullYear() + delta);
      setSelectedDate(newDate);
  };

  const handleCopyBudget = (e: React.FormEvent) => {
      e.preventDefault();
      if (!existingBudget) return;
      if (!copyTargetValue) {
          alert("Please select a target.");
          return;
      }

      const targets: string[] = [];

      if (copyTargetType === 'single') {
          // Input type="month" returns YYYY-MM
          targets.push(copyTargetValue);
      } else {
          // Input type="number" returns YYYY
          const year = parseInt(copyTargetValue);
          if (isNaN(year) || year < 2000 || year > 2100) {
              alert("Invalid year.");
              return;
          }
          for (let i = 1; i <= 12; i++) {
              const m = String(i).padStart(2, '0');
              targets.push(`${year}-${m}`);
          }
      }

      // Perform Copy
      targets.forEach(targetKey => {
          dispatch({
              type: 'SET_MONTHLY_BUDGET',
              payload: {
                  monthKey: targetKey,
                  limit: existingBudget.limit,
                  categoryLimits: { ...existingBudget.categoryLimits },
                  visibleAccountIds: [...existingBudget.visibleAccountIds]
              }
          });
      });

      alert(`Budget copied to ${targets.length} month(s).`);
      setIsCopyModalOpen(false);
      setCopyTargetValue('');
  };

  // Stats
  const totalBudget = existingBudget?.limit || 0;
  const totalActual = activeAccounts.reduce((sum, cat) => sum + (actualSpending[cat.id] || 0), 0);
  const remaining = totalBudget - totalActual;
  const percentage = totalBudget > 0 ? (totalActual / totalBudget) * 100 : 0;

  const chartData = [
      { name: 'Used', value: totalActual, color: percentage > 100 ? '#ef4444' : '#3b82f6' },
      { name: 'Remaining', value: Math.max(0, remaining), color: '#1f2937' }
  ];

  return (
    <div className="space-y-6 pb-20 md:pb-0 animate-slide-up">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
            <h1 className="text-3xl font-bold text-white tracking-tight">Budget Planner</h1>
            <p className="text-gray-400 text-sm">Allocate funds for {viewMode === 'monthly' ? format(selectedDate, 'MMMM yyyy') : format(selectedDate, 'yyyy')}</p>
        </div>
        <div className="flex items-center gap-4">
            <div className="bg-gray-900 rounded-lg p-1 border border-gray-700 flex">
                <button onClick={() => setViewMode('monthly')} className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all ${viewMode === 'monthly' ? 'bg-primary text-white' : 'text-gray-400 hover:text-white'}`}>Monthly</button>
                <button onClick={() => setViewMode('yearly')} className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all ${viewMode === 'yearly' ? 'bg-primary text-white' : 'text-gray-400 hover:text-white'}`}>Yearly</button>
            </div>
            <div className="flex items-center gap-2 bg-gray-900 rounded-lg p-1 border border-gray-700">
                <button onClick={() => changePeriod(-1)} className="p-2 hover:bg-gray-800 rounded-lg text-gray-400"><ChevronLeft size={20}/></button>
                <span className="font-mono text-sm font-bold w-32 text-center text-white">{viewMode === 'monthly' ? format(selectedDate, 'MMM yyyy') : format(selectedDate, 'yyyy')}</span>
                <button onClick={() => changePeriod(1)} className="p-2 hover:bg-gray-800 rounded-lg text-gray-400"><ChevronRight size={20}/></button>
            </div>
            {viewMode === 'monthly' && (
                <button 
                    onClick={() => setIsCopyModalOpen(true)} 
                    disabled={!existingBudget}
                    className="p-2.5 bg-gray-800 hover:bg-gray-700 text-white rounded-lg border border-gray-700 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                    title="Copy Budget to other months"
                >
                    <Copy size={18} />
                </button>
            )}
            <button onClick={() => setIsManageOpen(true)} className="p-2.5 bg-gray-800 hover:bg-gray-700 text-white rounded-lg border border-gray-700 transition-colors">
                <Settings size={18} />
            </button>
        </div>
      </div>

      {/* Overview Card */}
      <div className="glass-card p-6 rounded-2xl flex flex-col md:flex-row items-center gap-8 border border-white/5 bg-gray-900/50">
           <div className="relative w-32 h-32 flex-shrink-0">
               <ResponsiveContainer width="100%" height="100%">
                   <PieChart>
                       <Pie data={chartData} innerRadius={35} outerRadius={50} dataKey="value" stroke="none">
                            {chartData.map((entry, index) => <Cell key={index} fill={entry.color} />)}
                       </Pie>
                   </PieChart>
               </ResponsiveContainer>
               <div className="absolute inset-0 flex items-center justify-center flex-col">
                   <span className="text-xs text-gray-500">Spent</span>
                   <span className={`font-bold ${percentage > 100 ? 'text-red-500' : 'text-blue-500'}`}>{percentage.toFixed(0)}%</span>
               </div>
           </div>
           
           <div className="flex-1 grid grid-cols-2 md:grid-cols-3 gap-6 text-center md:text-left">
               <div>
                   <p className="text-xs uppercase text-gray-500 font-bold">Total Budget</p>
                   <p className="text-2xl font-bold text-white mt-1">{currency} {totalBudget.toLocaleString()}</p>
               </div>
               <div>
                   <p className="text-xs uppercase text-gray-500 font-bold">Actual Spent</p>
                   <p className={`text-2xl font-bold mt-1 ${totalActual > totalBudget ? 'text-red-400' : 'text-white'}`}>{currency} {totalActual.toLocaleString()}</p>
               </div>
               <div>
                   <p className="text-xs uppercase text-gray-500 font-bold">Remaining</p>
                   <p className={`text-2xl font-bold mt-1 ${remaining < 0 ? 'text-red-500' : 'text-emerald-400'}`}>{currency} {remaining.toLocaleString()}</p>
               </div>
           </div>
      </div>

      {/* Category List */}
      <div className="space-y-4">
          <h3 className="text-lg font-bold text-white border-b border-gray-800 pb-2">Category Allocations</h3>
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
              {activeAccounts.map(cat => {
                  const limit = categoryLimits[cat.id] || 0;
                  const spent = actualSpending[cat.id] || 0;
                  const catRemaining = limit - spent;
                  const catPercent = limit > 0 ? (spent / limit) * 100 : 0;

                  return (
                      <div key={cat.id} className="bg-gray-950/50 border border-gray-800 p-4 rounded-xl flex flex-col gap-3 group hover:border-gray-700 transition-colors">
                          <div className="flex justify-between items-start">
                              <div className="flex items-center gap-2">
                                  {/* No color in new Account, use generic dot */}
                                  <div className="w-2 h-2 rounded-full bg-blue-500"/>
                                  <span className="font-medium text-gray-300">{cat.name}</span>
                              </div>
                              <div className="flex items-center gap-1 bg-gray-900 rounded-lg border border-gray-800 px-2 py-1 focus-within:border-blue-500 focus-within:ring-1 focus-within:ring-blue-500 transition-all">
                                  <span className="text-xs text-gray-500">{currency}</span>
                                  <input 
                                    type="number" 
                                    className="w-20 bg-transparent text-right text-sm font-bold text-white outline-none" 
                                    placeholder="0"
                                    value={limit || ''}
                                    onChange={e => handleLimitChange(cat.id, e.target.value)}
                                  />
                              </div>
                          </div>

                          <div className="space-y-1">
                              <div className="flex justify-between text-xs text-gray-500">
                                  <span>Spent: {spent.toLocaleString()}</span>
                                  <span className={catRemaining < 0 ? 'text-red-400' : 'text-emerald-400'}>
                                      {catRemaining >= 0 ? 'Left: ' : 'Over: '} {Math.abs(catRemaining).toLocaleString()}
                                  </span>
                              </div>
                              <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
                                  <div 
                                    className={`h-full rounded-full transition-all duration-500 ${catPercent > 100 ? 'bg-red-500' : 'bg-blue-500'}`} 
                                    style={{ width: `${Math.min(catPercent, 100)}%` }}
                                  />
                              </div>
                          </div>
                      </div>
                  );
              })}
              {activeAccounts.length === 0 && <div className="text-gray-500 text-sm col-span-full text-center py-10">No categories selected. Click settings to add some.</div>}
          </div>
      </div>

      <Modal isOpen={isManageOpen} onClose={() => setIsManageOpen(false)} title="Manage Budget Categories">
          <div className="space-y-2 max-h-[60vh] overflow-y-auto pr-2">
              {allExpenseAccounts.map(cat => (
                  <div key={cat.id} className="flex items-center justify-between p-3 bg-gray-900 rounded-xl border border-gray-800 hover:bg-gray-800 cursor-pointer" onClick={() => handleVisibleToggle(cat.id)}>
                      <div className="flex items-center gap-3">
                          <span className="text-sm font-medium text-gray-200">{cat.name}</span>
                      </div>
                      {visibleAccountIds.includes(cat.id) 
                        ? <CheckSquare size={20} className="text-primary" /> 
                        : <Square size={20} className="text-gray-600" />
                      }
                  </div>
              ))}
          </div>
      </Modal>

      {/* Copy Budget Modal */}
      <Modal isOpen={isCopyModalOpen} onClose={() => setIsCopyModalOpen(false)} title="Copy Budget">
          <form onSubmit={handleCopyBudget} className="space-y-6">
              <div className="p-4 bg-blue-900/10 border border-blue-500/20 rounded-xl">
                  <p className="text-xs text-blue-300 font-bold uppercase tracking-wider mb-1">Source</p>
                  <p className="text-white font-medium flex items-center gap-2">
                      <Calendar size={16} />
                      {format(selectedDate, 'MMMM yyyy')}
                  </p>
                  <p className="text-xs text-gray-400 mt-2">
                      This will overwrite the budget for the target selected below.
                  </p>
              </div>

              <div>
                  <label className="text-xs text-gray-500 font-bold uppercase tracking-wider mb-2 block">Target Type</label>
                  <div className="grid grid-cols-2 gap-3">
                      <button 
                          type="button"
                          onClick={() => { setCopyTargetType('single'); setCopyTargetValue(''); }}
                          className={`py-3 px-4 rounded-xl border text-sm font-bold transition-all ${copyTargetType === 'single' ? 'bg-primary border-primary text-white' : 'bg-gray-900 border-gray-700 text-gray-400 hover:bg-gray-800'}`}
                      >
                          Single Month
                      </button>
                      <button 
                          type="button"
                          onClick={() => { setCopyTargetType('year'); setCopyTargetValue(''); }}
                          className={`py-3 px-4 rounded-xl border text-sm font-bold transition-all ${copyTargetType === 'year' ? 'bg-primary border-primary text-white' : 'bg-gray-900 border-gray-700 text-gray-400 hover:bg-gray-800'}`}
                      >
                          Full Year
                      </button>
                  </div>
              </div>

              <div>
                  <label className="text-xs text-gray-500 font-bold uppercase tracking-wider mb-2 block">
                      {copyTargetType === 'single' ? 'Select Target Month' : 'Select Target Year'}
                  </label>
                  {copyTargetType === 'single' ? (
                      <input 
                          type="month" 
                          className="w-full px-4 py-3 bg-gray-900 border border-gray-700 rounded-xl text-white outline-none focus:border-primary"
                          value={copyTargetValue}
                          onChange={e => setCopyTargetValue(e.target.value)}
                          required
                      />
                  ) : (
                      <input 
                          type="number" 
                          min="2020" max="2100"
                          placeholder="YYYY"
                          className="w-full px-4 py-3 bg-gray-900 border border-gray-700 rounded-xl text-white outline-none focus:border-primary"
                          value={copyTargetValue}
                          onChange={e => setCopyTargetValue(e.target.value)}
                          required
                      />
                  )}
              </div>

              <button 
                  type="submit"
                  className="w-full py-3 bg-gradient-to-r from-primary to-blue-600 hover:from-blue-600 hover:to-primary text-white font-bold rounded-xl shadow-lg transition-all active:scale-95"
              >
                  Copy Budget
              </button>
          </form>
      </Modal>
    </div>
  );
};
