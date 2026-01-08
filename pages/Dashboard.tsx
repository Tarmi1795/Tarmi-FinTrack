
import React, { useMemo, useState } from 'react';
import { useFinance } from '../context/FinanceContext';
import { usePWA } from '../context/PWAContext';
import { Wallet, Briefcase, CreditCard, Clock, ChevronDown, ChevronUp, CheckSquare, Square, ArrowDownLeft, ArrowUpRight, ArrowRightLeft, Download, Share, PlusSquare, Monitor, Smartphone, TrendingUp } from 'lucide-react';
import { format, parseISO, startOfMonth, endOfMonth, isWithinInterval, startOfYear, endOfYear, endOfDay, isAfter } from 'date-fns';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip as RechartsTooltip } from 'recharts';
import { useNavigate } from 'react-router-dom';
import { Modal } from '../components/ui/Modal';

export const Dashboard: React.FC = () => {
  const { state } = useFinance();
  const { isInstallable, installPWA, isIOS } = usePWA();
  const navigate = useNavigate();
  const [showProfitDetails, setShowProfitDetails] = useState(false);
  const [checkedAssets, setCheckedAssets] = useState<Record<string, boolean>>({});
  const [showIOSInstruction, setShowIOSInstruction] = useState(false);
  const [showGenericInstruction, setShowGenericInstruction] = useState(false);
  const [includeDirectCosts, setIncludeDirectCosts] = useState(false);

  const currency = state.businessProfile.baseCurrency || 'QAR';

  React.useEffect(() => {
      // Default Ticked: Cash & Equivalents usually.
      const cashGroup = state.accounts.find(a => a.code === '11100');
      const cashGroupId = cashGroup?.id;

      // Filter specifically for Cash accounts (Children of 11100 or Code 111xx)
      const cashAccounts = state.accounts.filter(c => 
          c.isPosting && (
              (cashGroupId && c.parentId === cashGroupId) || 
              c.code.startsWith('111')
          )
      );
      
      const initial: Record<string, boolean> = {};
      cashAccounts.forEach(c => {
          initial[c.id] = true;
      });
      setCheckedAssets(prev => Object.keys(prev).length === 0 ? initial : prev);
  }, [state.accounts]);

  const handleInstallClick = async () => {
      if (isIOS) {
          setShowIOSInstruction(true);
      } else {
          const promptShown = await installPWA();
          if (!promptShown) {
             setShowGenericInstruction(true);
          }
      }
  };

  const currentMonthKey = format(new Date(), 'yyyy-MM');
  const currentYearKey = format(new Date(), 'yyyy');
  const monthStart = startOfMonth(new Date());
  const monthEnd = endOfMonth(new Date());
  const yearStart = startOfYear(new Date());
  const yearEnd = endOfYear(new Date());
  
  // Cutoff for "Current" state - Include everything up to the very end of today
  const endOfToday = endOfDay(new Date());

  const txsInMonth = useMemo(() => state.transactions.filter(t => {
      const d = parseISO(t.date);
      // Include if in month range AND not in the future (Month-to-Date view)
      return isWithinInterval(d, { start: monthStart, end: monthEnd }) && d <= endOfToday;
  }), [state.transactions]);

  const txsInYear = useMemo(() => state.transactions.filter(t => {
      const d = parseISO(t.date);
      return isWithinInterval(d, { start: yearStart, end: yearEnd }) && d <= endOfToday;
  }), [state.transactions]);

  // --- 1. Cash Breakdown ---
  const assetBalances = useMemo(() => {
      const balances: Record<string, { name: string, amount: number, id: string, code?: string }> = {};
      
      // Target Account: 11100 - Cash & Cash Equivalents
      const cashGroup = state.accounts.find(a => a.code === '11100');
      const cashGroupId = cashGroup?.id;

      // Initialize with only Cash & Cash Equivalents accounts
      state.accounts.filter(c => 
          c.isPosting && (
              (cashGroupId && c.parentId === cashGroupId) || 
              c.code.startsWith('111')
          )
      ).forEach(c => {
          balances[c.id] = { name: c.name, amount: 0, id: c.id, code: c.code };
      });

      state.transactions.forEach(t => {
          // Strict Date Filter: Do not include future transactions in Cash Balance
          if (parseISO(t.date) > endOfToday) return;

          // Standard Debit Normal logic for Assets
          // Debit increases (t.accountId), Credit decreases (t.paymentAccountId)
          if (t.accountId && balances[t.accountId]) {
              balances[t.accountId].amount += t.amount; 
          }
          if (t.paymentAccountId && balances[t.paymentAccountId]) {
              balances[t.paymentAccountId].amount -= t.amount; 
          }
      });

      return Object.values(balances)
        .sort((a,b) => (parseInt(a.code || '0') - parseInt(b.code || '0')));
  }, [state.transactions, state.accounts]);

  const totalSelectedCash = assetBalances.reduce((sum, a) => checkedAssets[a.id] ? sum + a.amount : sum, 0);

  // --- 2. Payables & Receivables ---
  // Filter out future/unearned items from Dashboard Totals
  const pendingReceivables = state.receivables.filter(r => 
      r.type === 'receivable' && 
      r.status === 'pending' &&
      (!r.issueDate || parseISO(r.issueDate) <= endOfToday)
  );
  const totalReceivables = pendingReceivables.reduce((acc, curr) => acc + curr.amount, 0);
  
  const pendingPayables = state.receivables.filter(r => 
      r.type === 'payable' && 
      r.status === 'pending' &&
      (!r.issueDate || parseISO(r.issueDate) <= endOfToday)
  );
  const totalPayables = pendingPayables.reduce((acc, curr) => acc + curr.amount, 0);

  // --- 3. Budget & Profit ---
  const budgetObjMonth = state.monthlyBudgets?.find(b => b.monthKey === currentMonthKey);
  const currentMonthBudget = budgetObjMonth?.limit || 0;
  const visibleCatIdsMonth = budgetObjMonth?.visibleAccountIds || [];
  const totalExpensesMonth = txsInMonth
    .filter(t => t.type === 'expense' && (budgetObjMonth ? visibleCatIdsMonth.includes(t.accountId) : true))
    .reduce((s, t) => s + t.amount, 0);
  const budgetProgressMonth = currentMonthBudget > 0 ? (totalExpensesMonth / currentMonthBudget) * 100 : 0;

  const budgetObjYear = state.monthlyBudgets?.find(b => b.monthKey === currentYearKey);
  const currentYearBudget = budgetObjYear?.limit || 0;
  const visibleCatIdsYear = budgetObjYear?.visibleAccountIds || [];
  const totalExpensesYear = txsInYear
    .filter(t => t.type === 'expense' && (budgetObjYear ? visibleCatIdsYear.includes(t.accountId) : true))
    .reduce((s, t) => s + t.amount, 0);
  const budgetProgressYear = currentYearBudget > 0 ? (totalExpensesYear / currentYearBudget) * 100 : 0;

  const bizStats = useMemo(() => {
      let revenue = 0;
      let cogs = 0;
      let expenses = 0;
      
      txsInMonth.forEach(t => {
          // Identify accounts involved
          const debitAcc = state.accounts.find(c => c.id === t.accountId);
          const creditAcc = state.accounts.find(c => c.id === t.paymentAccountId);
          
          // 1. Check for Revenue (Usually Credited)
          if (creditAcc?.class === 'Revenue') {
              revenue += t.amount;
          }
          // Handle Returns/Refunds (Debited Revenue)
          if (debitAcc?.class === 'Revenue') {
              revenue -= t.amount;
          }

          // 2. Check for Expenses (Usually Debited)
          if (debitAcc?.class === 'Expenses') {
              // Heuristic: Check if code suggests COGS (50000 range) or OpEx (60000 range)
              if (debitAcc.code.startsWith('5')) cogs += t.amount;
              else expenses += t.amount;
          }
          // Handle Refunds/Reversals (Credited Expense)
          if (creditAcc?.class === 'Expenses') {
              if (creditAcc.code.startsWith('5')) cogs -= t.amount;
              else expenses -= t.amount;
          }
      });

      // Use absolute values
      const absRevenue = Math.abs(revenue);
      const absCogs = Math.abs(cogs);
      const absExpenses = Math.abs(expenses);

      return { 
          revenue: absRevenue, 
          cogs: absCogs, 
          expenses: absExpenses, 
          gross: absRevenue - absCogs, 
          net: absRevenue - absCogs - absExpenses 
      };
  }, [txsInMonth, state.accounts]);

  // --- 4. Charts ---
  const expenseData = useMemo(() => {
      const map: Record<string, number> = {};
      txsInMonth.filter(t => t.type === 'expense').forEach(t => {
          const acc = state.accounts.find(c => c.id === t.accountId);
          if (!acc) return;

          // Exclude COGS if toggle is off
          // COGS accounts start with '5' in this schema (50000 range)
          if (!includeDirectCosts && acc.code.startsWith('5')) return;

          const catName = acc.name;
          map[catName] = (map[catName] || 0) + t.amount;
      });
      return Object.entries(map).map(([name, value]) => ({ name, value })).sort((a,b) => b.value - a.value).slice(0, 5);
  }, [txsInMonth, state.accounts, includeDirectCosts]);

  const COLORS = ['#ef4444', '#f97316', '#f59e0b', '#8b5cf6', '#3b82f6'];
  const recentTxs = [...state.transactions]
    .filter(t => parseISO(t.date) <= endOfToday) // Filter out future transactions
    .sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .slice(0, 5);

  return (
    <div className="space-y-6 pb-24 md:pb-0 animate-slide-up">
      <div className="flex justify-between items-end">
          <div>
            <h1 className="text-3xl font-bold text-white tracking-tight">Dashboard</h1>
            <p className="text-gray-400 text-sm">{format(new Date(), 'MMMM yyyy')}</p>
          </div>
          {/* SMALL INSTALL BUTTON IN HEADER */}
          {isInstallable && (
              <button 
                  onClick={handleInstallClick}
                  className="flex items-center gap-2 bg-gray-800 hover:bg-gray-700 text-gold-400 border border-gold-500/30 px-3 py-1.5 rounded-lg text-xs font-bold transition-all hover:scale-105 active:scale-95"
                  title="Install App"
              >
                  <Download size={14} />
                  <span className="hidden sm:inline">Install App</span>
              </button>
          )}
      </div>

      {/* --- ROW 1: CASH & PROFIT --- */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* CASH BREAKDOWN */}
          <div className="glass-card p-5 rounded-2xl relative overflow-hidden bg-gray-900 border border-gold-500/10 hover:border-gold-500/30 hover:-translate-y-1 hover:shadow-2xl transition-all duration-300 group">
              <div className="flex justify-between items-start mb-4">
                  <h3 className="text-gray-400 text-xs font-bold uppercase tracking-widest flex items-center gap-2"><Wallet size={14} className="text-gold-500 group-hover:scale-110 transition-transform"/> Cash and Cash Equivalent </h3>
                  <span className="text-2xl font-bold text-white group-hover:text-gold-400 transition-colors">{currency} {totalSelectedCash.toLocaleString()}</span>
              </div>
              <div className="space-y-2 max-h-40 overflow-y-auto pr-2 custom-scrollbar">
                  {assetBalances.map(acc => (
                      <div key={acc.id} className="flex items-center justify-between p-2 rounded-lg bg-gray-950/50 border border-white/5 cursor-pointer hover:bg-gray-800/80 transition-colors" onClick={() => setCheckedAssets(prev => ({...prev, [acc.id]: !prev[acc.id]}))}>
                          <div className="flex items-center gap-2">
                              {checkedAssets[acc.id] ? <CheckSquare size={16} className="text-gold-500"/> : <Square size={16} className="text-gray-600"/>}
                              <span className="text-sm text-gray-300">
                                {acc.code ? `${acc.code} - ` : ''}{acc.name}
                              </span>
                          </div>
                          <span className={`text-sm font-mono ${acc.amount < 0 ? 'text-red-400' : 'text-emerald-400'}`}>{acc.amount.toLocaleString()}</span>
                      </div>
                  ))}
              </div>
          </div>

          {/* BUSINESS PROFIT CARD (GROSS ONLY) */}
          <div className="glass-card p-5 rounded-2xl bg-gray-900 border border-blue-500/10 cursor-pointer transition-all duration-300 hover:border-blue-500/40 hover:-translate-y-1 hover:shadow-2xl group" onClick={() => setShowProfitDetails(!showProfitDetails)}>
              <div className="flex justify-between items-start">
                  <div>
                      <p className="text-gray-400 text-xs font-bold uppercase tracking-widest flex items-center gap-2"><Briefcase size={14} className="text-blue-500 group-hover:scale-110 transition-transform"/> Business Performance</p>
                      <h3 className={`text-3xl font-bold mt-2 ${bizStats.gross >= 0 ? 'text-blue-400' : 'text-red-400'}`}>
                          {currency} {bizStats.gross.toLocaleString()}
                      </h3>
                      <div className="flex items-center gap-2 mt-2">
                          <span className="text-xs text-gray-500 font-bold">GROSS PROFIT (Rev - Direct Cost)</span>
                      </div>
                  </div>
                  {showProfitDetails ? <ChevronUp className="text-gray-500"/> : <ChevronDown className="text-gray-500"/>}
              </div>
              
              {showProfitDetails && (
                  <div className="mt-4 pt-4 border-t border-white/10 space-y-2 animate-fade-in">
                      <div className="flex justify-between text-sm"><span className="text-gray-400">Revenue</span><span className="text-emerald-400">+ {bizStats.revenue.toLocaleString()}</span></div>
                      <div className="flex justify-between text-sm"><span className="text-gray-400">Direct Costs</span><span className="text-orange-400">- {bizStats.cogs.toLocaleString()}</span></div>
                      <div className="mt-2 text-xs text-center text-gray-500 bg-gray-950/50 py-1 rounded">
                          Margin: {bizStats.revenue > 0 ? (bizStats.gross / bizStats.revenue * 100).toFixed(1) : 0}%
                      </div>
                  </div>
              )}
          </div>
      </div>

      {/* --- ROW 2: SMALLER CARDS + BUDGET --- */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="glass-card p-4 rounded-xl border-l-4 border-l-emerald-500 flex flex-col justify-between hover:bg-gray-800/50 hover:shadow-lg transition-all duration-200 cursor-pointer active:scale-95" onClick={() => navigate('/apar')}>
              <div className="flex justify-between items-start">
                  <div>
                    <p className="text-[10px] font-bold text-emerald-500 uppercase">Receivables</p>
                    <p className="text-lg font-bold text-white mt-1">{currency} {totalReceivables.toLocaleString()}</p>
                  </div>
                  <ArrowDownLeft size={16} className="text-emerald-500 opacity-50"/>
              </div>
              <div className="mt-2 text-[10px] text-gray-500">{pendingReceivables.length} Active</div>
          </div>

          <div className="glass-card p-4 rounded-xl border-l-4 border-l-orange-500 flex flex-col justify-between hover:bg-gray-800/50 hover:shadow-lg transition-all duration-200 cursor-pointer active:scale-95" onClick={() => navigate('/apar')}>
             <div className="flex justify-between items-start">
                  <div>
                      <p className="text-[10px] font-bold text-orange-500 uppercase">Payables</p>
                      <p className="text-lg font-bold text-white mt-1">{currency} {totalPayables.toLocaleString()}</p>
                  </div>
                  <ArrowUpRight size={16} className="text-orange-500 opacity-50"/>
              </div>
              <div className="mt-2 text-[10px] text-gray-500">{pendingPayables.length} Active</div>
          </div>

          <div className="md:col-span-2 glass-card p-4 rounded-xl flex flex-col justify-center gap-3 hover:border-gray-600 transition-colors">
             <div>
                <div className="flex justify-between text-[10px] uppercase font-bold text-gray-500 mb-1">
                    <span>Monthly Budget</span>
                    <span>{budgetProgressMonth.toFixed(0)}%</span>
                </div>
                <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
                    <div className={`h-full transition-all duration-1000 ${budgetProgressMonth > 100 ? 'bg-red-500' : 'bg-blue-500'}`} style={{ width: `${Math.min(budgetProgressMonth, 100)}%` }}></div>
                </div>
             </div>
             <div>
                <div className="flex justify-between text-[10px] uppercase font-bold text-gray-500 mb-1">
                    <span>Yearly Budget</span>
                    <span>{budgetProgressYear.toFixed(0)}%</span>
                </div>
                <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
                    <div className={`h-full transition-all duration-1000 ${budgetProgressYear > 100 ? 'bg-red-500' : 'bg-purple-500'}`} style={{ width: `${Math.min(budgetProgressYear, 100)}%` }}></div>
                </div>
             </div>
          </div>
      </div>

      {/* --- ROW 3: CHARTS & HISTORY --- */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="glass-card rounded-2xl p-5 border border-white/5 hover:border-white/10 transition-colors">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-gray-400 text-xs font-bold uppercase">Top 5 Expenses</h3>
                <button 
                    onClick={() => setIncludeDirectCosts(!includeDirectCosts)}
                    className={`text-[10px] px-2 py-1 rounded transition-colors border ${includeDirectCosts ? 'bg-blue-500/20 text-blue-400 border-blue-500/30' : 'bg-gray-800 text-gray-500 border-gray-700 hover:text-gray-300'}`}
                >
                    {includeDirectCosts ? 'With Direct Costs' : 'No Direct Costs'}
                </button>
              </div>
              <div className="h-[200px] w-full flex items-center justify-center">
                <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                        <Pie data={expenseData} cx="50%" cy="50%" innerRadius={40} outerRadius={70} paddingAngle={5} dataKey="value" stroke="none">
                            {expenseData.map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                            ))}
                        </Pie>
                        <RechartsTooltip contentStyle={{ backgroundColor: '#111827', borderColor: '#374151', fontSize: '12px' }} itemStyle={{ color: '#fff' }} formatter={(val: number) => `${currency} ${val.toLocaleString()}`} />
                    </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="flex flex-wrap gap-2 justify-center mt-2">
                  {expenseData.map((e, i) => (
                      <div key={e.name} className="flex items-center gap-1 text-[10px] text-gray-400">
                          <div className="w-2 h-2 rounded-full" style={{ background: COLORS[i % COLORS.length] }} />
                          {e.name}
                      </div>
                  ))}
              </div>
          </div>

          <div className="lg:col-span-2 glass-card rounded-2xl p-5 border border-white/5 hover:border-white/10 transition-colors">
              <h3 className="text-gray-400 text-xs font-bold uppercase mb-4 flex items-center gap-2"><Clock size={14}/> Recent Activity</h3>
              <div className="space-y-3">
                  {recentTxs.map(t => {
                      const acc = state.accounts.find(c => c.id === t.accountId);
                      let sign = '-';
                      let colorClass = 'text-gray-300';
                      let iconBg = 'bg-gray-800 text-gray-400';

                      if (t.type === 'income') {
                          sign = '+';
                          colorClass = 'text-emerald-400';
                          iconBg = 'bg-emerald-500/10 text-emerald-400';
                      } else if (t.type === 'transfer') {
                          sign = '↔';
                          colorClass = 'text-blue-400';
                          iconBg = 'bg-blue-500/10 text-blue-400';
                      }

                      return (
                          <div key={t.id} className="flex items-center justify-between p-3 bg-gray-950/30 rounded-xl border border-white/5 hover:bg-gray-800/50 hover:translate-x-1 transition-all">
                              <div className="flex items-center gap-3">
                                  <div className={`p-2 rounded-lg ${iconBg}`}>
                                      {t.type === 'income' ? <TrendingUp size={16}/> : (t.type === 'transfer' ? <ArrowRightLeft size={16}/> : <CreditCard size={16}/>)}
                                  </div>
                                  <div>
                                      <p className="text-sm font-medium text-gray-200">{acc?.name || 'Unknown'}</p>
                                      <p className="text-[10px] text-gray-500">{format(parseISO(t.date), 'MMM d')} • {t.note || '-'}</p>
                                  </div>
                              </div>
                              <span className={`font-mono text-sm font-bold ${colorClass}`}>
                                  {sign} {t.amount.toLocaleString()}
                              </span>
                          </div>
                      );
                  })}
                  {recentTxs.length === 0 && <p className="text-center text-gray-600 py-4 text-sm">No recent transactions.</p>}
              </div>
          </div>
      </div>

      {/* iOS Instructions Modal */}
      <Modal isOpen={showIOSInstruction} onClose={() => setShowIOSInstruction(false)} title="Install on iPhone/iPad">
         <div className="p-4 space-y-4 text-gray-300">
             <p className="text-sm">This app can be installed on your home screen for a full-screen experience and offline access.</p>
             <div className="space-y-3">
                 <div className="flex items-center gap-3">
                     <div className="p-2 bg-gray-800 rounded"><Share size={20} className="text-blue-400"/></div>
                     <span className="text-sm">1. Tap the <b>Share</b> button in Safari toolbar.</span>
                 </div>
                 <div className="flex items-center gap-3">
                     <div className="p-2 bg-gray-800 rounded"><PlusSquare size={20} className="text-gray-400"/></div>
                     <span className="text-sm">2. Scroll down and tap <b>Add to Home Screen</b>.</span>
                 </div>
             </div>
             <button onClick={() => setShowIOSInstruction(false)} className="w-full py-3 bg-gray-800 hover:bg-gray-700 rounded-xl mt-4 text-sm font-bold">Got it</button>
         </div>
      </Modal>

      {/* Generic Instructions Modal (Chrome/Android Fallback) */}
      <Modal isOpen={showGenericInstruction} onClose={() => setShowGenericInstruction(false)} title="Install App">
            <div className="p-4 space-y-4 text-gray-300">
            <p className="text-sm">To install the app, use your browser's menu.</p>
            
            <div className="space-y-3">
                <div className="flex items-start gap-3">
                    <div className="p-2 bg-gray-800 rounded text-gray-400"><Monitor size={20} /></div>
                    <div>
                        <strong className="text-sm text-white block">Desktop (Chrome/Edge)</strong>
                        <span className="text-xs text-gray-500">Click the install icon <Download size={10} className="inline"/> in the address bar (right side).</span>
                    </div>
                </div>
                    <div className="flex items-start gap-3">
                    <div className="p-2 bg-gray-800 rounded text-gray-400"><Smartphone size={20} /></div>
                    <div>
                        <strong className="text-sm text-white block">Android (Chrome)</strong>
                        <span className="text-xs text-gray-500">Tap <span className="font-bold">⋮</span> (Menu) and select <b>Install App</b> or <b>Add to Home Screen</b>.</span>
                    </div>
                </div>
            </div>
            
            <button onClick={() => setShowGenericInstruction(false)} className="w-full py-3 bg-gray-800 hover:bg-gray-700 rounded-xl mt-4 text-sm font-bold">Close</button>
            </div>
      </Modal>
    </div>
  );
};
