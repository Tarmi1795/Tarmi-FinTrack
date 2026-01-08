
import React, { useMemo, useState, useEffect } from 'react';
import { useFinance } from '../context/FinanceContext';
import { format, startOfMonth, endOfMonth, parseISO, isWithinInterval, isPast } from 'date-fns';
import { Calendar, FileText, Scale, Users, Download, Activity, Table, ScrollText, ArrowRightLeft, FileSpreadsheet, Camera, Printer } from 'lucide-react';
import { StatementOfAccount } from '../components/StatementOfAccount';
import { buildAccountTree, AccountNode } from '../utils/accountHierarchy';
import { Transaction, AccountClass } from '../types';
import { useLocation } from 'react-router-dom';
import html2canvas from 'html2canvas';
import * as XLSX from 'xlsx';

type ReportTab = 'income_statement' | 'balance_sheet' | 'cash_flow' | 'trial_balance' | 'soa';

const formatCurrency = (amount: number) => {
  return amount.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2});
};

export const Reports: React.FC = () => {
  const { state } = useFinance();
  const location = useLocation();
  const [activeTab, setActiveTab] = useState<ReportTab>('income_statement');
  const [initialSoaAccount, setInitialSoaAccount] = useState<string>('');
  
  const [dateRange, setDateRange] = useState({
    start: format(startOfMonth(new Date()), 'yyyy-MM-dd'),
    end: format(endOfMonth(new Date()), 'yyyy-MM-dd')
  });

  // Handle incoming shortcuts from other pages
  useEffect(() => {
      if (location.state && location.state.tab === 'soa') {
          setActiveTab('soa');
          if (location.state.accountId) {
              setInitialSoaAccount(location.state.accountId);
          }
      }
  }, [location]);

  // --- DATA CALCULATIONS ---

  const transactionsInPeriod = useMemo(() => {
    return state.transactions.filter(t => {
      const d = parseISO(t.date);
      const start = parseISO(dateRange.start);
      const end = parseISO(dateRange.end);
      end.setHours(23, 59, 59, 999);
      return isWithinInterval(d, { start, end });
    });
  }, [state.transactions, dateRange]);

  // 1. Balance Sheet Tree (Cumulative up to End Date)
  const balanceSheetTree = useMemo(() => {
      const endDate = parseISO(dateRange.end);
      endDate.setHours(23, 59, 59, 999);
      
      const bsTransactions = state.transactions.filter(t => parseISO(t.date) <= endDate);

      // Calculate Net Income for Retained Earnings Injection
      let totalRevenue = 0;
      let totalExpenses = 0;

      state.accounts.forEach(acc => {
          if (!acc.isPosting) return;
          if (acc.class !== 'Revenue' && acc.class !== 'Expenses') return;

          let dr = 0; 
          let cr = 0;
          bsTransactions.forEach(t => {
             if (t.accountId === acc.id) dr += t.amount;
             if (t.paymentAccountId === acc.id) cr += t.amount;
          });

          if (acc.class === 'Revenue') {
              totalRevenue += (cr - dr); 
          } else {
              totalExpenses += (dr - cr); 
          }
      });

      const netIncome = totalRevenue - totalExpenses;
      const retainedEarningsAcc = state.accounts.find(a => a.code === '32000' || a.name === 'Retained Earnings');
      let modifiedTransactions = [...bsTransactions];

      if (retainedEarningsAcc && Math.abs(netIncome) > 0.001) {
          const isProfit = netIncome > 0;
          const virtualTx: Transaction = {
              id: 'virtual_ni_adjustment',
              date: endDate.toISOString(),
              type: 'income',
              amount: Math.abs(netIncome),
              currency: 'QAR',
              source: 'personal',
              accountId: isProfit ? 'virtual_contra' : retainedEarningsAcc.id,
              paymentAccountId: isProfit ? retainedEarningsAcc.id : 'virtual_contra'
          };
          modifiedTransactions.push(virtualTx);
      }

      return buildAccountTree(state.accounts, modifiedTransactions);
  }, [state.accounts, state.transactions, dateRange.end]);

  // 2. Income Statement (Period Only)
  const incomeStatement = useMemo(() => {
      const getPeriodBalance = (accountId: string, type: 'revenue' | 'expense') => {
          let bal = 0;
          transactionsInPeriod.forEach(t => {
              if (t.accountId === accountId) bal += t.amount; 
              if (t.paymentAccountId === accountId) bal -= t.amount; 
          });
          // Revenue is Credit normal (negative balance), convert to positive for display
          if (type === 'revenue') return -(bal);
          // Expense is Debit normal (positive balance), keep positive
          return bal;
      };

      const revenueAccs = state.accounts.filter(c => c.class === 'Revenue' && c.isPosting);
      const allExpenseAccs = state.accounts.filter(c => c.class === 'Expenses' && c.isPosting);

      const revenueBreakdown = revenueAccs.map(a => ({ name: a.name, amount: getPeriodBalance(a.id, 'revenue') })).filter(i => Math.abs(i.amount) > 0.01);
      
      // Separate Direct Costs (Code starts with 5) from Operating Expenses (others)
      const directCostBreakdown = allExpenseAccs
          .filter(a => a.code.startsWith('5')) 
          .map(a => ({ name: a.name, amount: getPeriodBalance(a.id, 'expense') }))
          .filter(i => Math.abs(i.amount) > 0.01);

      const operatingExpenseBreakdown = allExpenseAccs
          .filter(a => !a.code.startsWith('5'))
          .map(a => ({ name: a.name, amount: getPeriodBalance(a.id, 'expense') }))
          .filter(i => Math.abs(i.amount) > 0.01);

      const totalRevenue = revenueBreakdown.reduce((s, i) => s + i.amount, 0);
      const totalDirectCosts = directCostBreakdown.reduce((s, i) => s + i.amount, 0);
      const grossProfit = totalRevenue - totalDirectCosts;
      const totalOperatingExpenses = operatingExpenseBreakdown.reduce((s, i) => s + i.amount, 0);
      const netIncome = grossProfit - totalOperatingExpenses;

      return { 
          revenueBreakdown, 
          totalRevenue, 
          directCostBreakdown, 
          totalDirectCosts, 
          grossProfit, 
          operatingExpenseBreakdown, 
          totalOperatingExpenses, 
          netIncome 
      };
  }, [transactionsInPeriod, state.accounts]);

  // 3. Cash Flow (Direct Method)
  const cashFlowStatement = useMemo(() => {
      const cashGroup = state.accounts.find(a => a.name.includes('Cash & Cash Equivalents') || a.code === '11100');
      const cashAccountIds = state.accounts
          .filter(a => a.parentId === cashGroup?.id || a.code.startsWith('111'))
          .map(a => a.id);
      
      const report = { operating: { in: 0, out: 0 }, investing: { in: 0, out: 0 }, financing: { in: 0, out: 0 }, startCash: 0, endCash: 0 };
      const startDate = parseISO(dateRange.start);
      
      state.transactions.filter(t => parseISO(t.date) < startDate).forEach(t => {
          if (cashAccountIds.includes(t.accountId)) report.startCash += t.amount; 
          if (cashAccountIds.includes(t.paymentAccountId || '')) report.startCash -= t.amount; 
      });

      transactionsInPeriod.forEach(t => {
          const isCashDr = cashAccountIds.includes(t.accountId);
          const isCashCr = cashAccountIds.includes(t.paymentAccountId || '');
          if (isCashDr && isCashCr) return;

          if (isCashDr) {
              const contraAcc = state.accounts.find(a => a.id === t.paymentAccountId);
              if (contraAcc) {
                  const cat = contraAcc.class;
                  if (cat === 'Revenue' || cat === 'Expenses') report.operating.in += t.amount;
                  else if (cat === 'Assets') {
                      if (contraAcc.code.startsWith('12')) report.investing.in += t.amount;
                      else report.operating.in += t.amount;
                  } else report.financing.in += t.amount;
              } else report.financing.in += t.amount;
          } else if (isCashCr) {
              const contraAcc = state.accounts.find(a => a.id === t.accountId);
              if (contraAcc) {
                  const cat = contraAcc.class;
                  if (cat === 'Expenses' || cat === 'Revenue') report.operating.out += t.amount;
                  else if (cat === 'Assets') {
                      if (contraAcc.code.startsWith('12')) report.investing.out += t.amount;
                      else report.operating.out += t.amount;
                  } else if (cat === 'Liabilities') report.financing.out += t.amount;
                  else report.financing.out += t.amount;
              }
          }
      });

      const netOperating = report.operating.in - report.operating.out;
      const netInvesting = report.investing.in - report.investing.out;
      const netFinancing = report.financing.in - report.financing.out;
      const netChange = netOperating + netInvesting + netFinancing;

      return { ...report, netOperating, netInvesting, netFinancing, netChange, endCash: report.startCash + netChange };
  }, [state.transactions, state.accounts, transactionsInPeriod, dateRange]);

  // 4. Trial Balance (Cumulative up to End Date)
  const trialBalanceData = useMemo(() => {
      const endDate = parseISO(dateRange.end);
      endDate.setHours(23, 59, 59, 999);
      
      const relevantTxs = state.transactions.filter(t => parseISO(t.date) <= endDate);
      const balances: Record<string, number> = {};
      
      relevantTxs.forEach(t => {
          balances[t.accountId] = (balances[t.accountId] || 0) + t.amount; // Dr +
          if (t.paymentAccountId) {
              balances[t.paymentAccountId] = (balances[t.paymentAccountId] || 0) - t.amount; // Cr -
          }
      });
      
      const rows = state.accounts
          .filter(a => a.isPosting)
          .map(acc => {
              const bal = balances[acc.id] || 0;
              // Map to Debit/Credit columns based on sign
              // Positive = Debit Side, Negative = Credit Side (show as positive number)
              return {
                  ...acc,
                  balance: bal,
                  debit: bal > 0 ? bal : 0,
                  credit: bal < 0 ? Math.abs(bal) : 0
              };
          })
          .filter(r => Math.abs(r.balance) > 0.001);
          
      const groups: Record<AccountClass, typeof rows> = { 'Assets': [], 'Liabilities': [], 'Equity': [], 'Revenue': [], 'Expenses': [] };
      rows.forEach(r => { if (groups[r.class]) groups[r.class].push(r); });
      Object.keys(groups).forEach(k => groups[k as AccountClass].sort((a,b) => a.code.localeCompare(b.code)));
      
      const totalDebit = rows.reduce((sum, r) => sum + r.debit, 0);
      const totalCredit = rows.reduce((sum, r) => sum + r.credit, 0);
      
      return { groups, totalDebit, totalCredit };
  }, [state.accounts, state.transactions, dateRange.end]);

  // --- UTILS & HANDLERS ---

  const renderReportNode = (nodes: AccountNode[], indent = 0, multiplier = 1) => {
      return nodes.map(node => {
          const displayVal = node.totalBalance * multiplier;
          return (
            <React.Fragment key={node.id}>
                {Math.abs(node.totalBalance) > 0.01 && (
                    <div className="flex justify-between py-1 border-b border-gray-100 last:border-0 hover:bg-gray-50">
                        <span className={`pl-${indent * 4} ${node.level === 'group' || node.level === 'class' ? 'font-bold text-gray-800' : 'text-gray-600'} text-sm`}>
                            {node.name}
                        </span>
                        <span className={`text-sm font-mono ${node.level === 'group' ? 'font-bold' : ''}`}>
                            {formatCurrency(displayVal)}
                        </span>
                    </div>
                )}
                {node.children.length > 0 && renderReportNode(node.children, indent + 2, multiplier)}
            </React.Fragment>
          );
      });
  };

  const getNodeTotal = (nodes: AccountNode[]) => nodes.reduce((s, n) => s + n.totalBalance, 0);
  const totalAssets = getNodeTotal(balanceSheetTree['Assets']);
  const totalLiabilities = getNodeTotal(balanceSheetTree['Liabilities']);
  const totalEquity = getNodeTotal(balanceSheetTree['Equity']);

  const handleExcelExport = () => {
      const wb = XLSX.utils.book_new();
      let rows: any[] = [];
      let sheetName = "Report";
      let fileName = `Report_${dateRange.end}.xlsx`;

      if (activeTab === 'income_statement') {
          sheetName = "Income Statement";
          fileName = `IncomeStatement_${dateRange.start}_${dateRange.end}.xlsx`;
          rows = [
              { A: 'REVENUE' },
              ...incomeStatement.revenueBreakdown.map(r => ({ A: r.name, B: r.amount })),
              { A: 'TOTAL REVENUE', B: incomeStatement.totalRevenue },
              { A: '' },
              { A: 'DIRECT COSTS' },
              ...incomeStatement.directCostBreakdown.map(r => ({ A: r.name, B: r.amount })),
              { A: 'TOTAL DIRECT COSTS', B: incomeStatement.totalDirectCosts },
              { A: '' },
              { A: 'GROSS PROFIT', B: incomeStatement.grossProfit },
              { A: '' },
              { A: 'OPERATING EXPENSES' },
              ...incomeStatement.operatingExpenseBreakdown.map(r => ({ A: r.name, B: r.amount })),
              { A: 'TOTAL OPERATING EXPENSES', B: incomeStatement.totalOperatingExpenses },
              { A: '' },
              { A: 'NET INCOME', B: incomeStatement.netIncome }
          ];
      } else if (activeTab === 'balance_sheet') {
          sheetName = "Balance Sheet";
          fileName = `BalanceSheet_${dateRange.end}.xlsx`;
          // Simple flat export for BS
          const processNodes = (nodes: AccountNode[], multiplier: number) => {
              let flat: any[] = [];
              nodes.forEach(n => {
                  if (Math.abs(n.totalBalance) > 0.01) flat.push({ A: n.name, B: n.totalBalance * multiplier });
                  if (n.children) flat = [...flat, ...processNodes(n.children, multiplier)];
              });
              return flat;
          };
          rows = [
              { A: 'ASSETS' },
              ...processNodes(balanceSheetTree['Assets'], 1),
              { A: 'TOTAL ASSETS', B: totalAssets },
              { A: '' },
              { A: 'LIABILITIES' },
              ...processNodes(balanceSheetTree['Liabilities'], -1),
              { A: 'TOTAL LIABILITIES', B: totalLiabilities * -1 },
              { A: '' },
              { A: 'EQUITY' },
              ...processNodes(balanceSheetTree['Equity'], -1),
              { A: 'TOTAL EQUITY', B: totalEquity * -1 },
              { A: '' },
              { A: 'TOTAL LIAB & EQUITY', B: (totalLiabilities + totalEquity) * -1 }
          ];
      } else if (activeTab === 'trial_balance') {
          sheetName = "Trial Balance";
          fileName = `TrialBalance_${dateRange.end}.xlsx`;
          rows.push({ A: 'Account Code', B: 'Account Name', C: 'Debit', D: 'Credit' });
          ['Assets', 'Liabilities', 'Equity', 'Revenue', 'Expenses'].forEach(cls => {
              rows.push({ A: cls.toUpperCase() });
              trialBalanceData.groups[cls as AccountClass].forEach(r => {
                  rows.push({ A: r.code, B: r.name, C: r.debit, D: r.credit });
              });
          });
          rows.push({ A: 'TOTAL', B: '', C: trialBalanceData.totalDebit, D: trialBalanceData.totalCredit });
      } else if (activeTab === 'cash_flow') {
          sheetName = "Cash Flow";
          fileName = `CashFlow_${dateRange.start}_${dateRange.end}.xlsx`;
          rows = [
              { A: 'OPERATING ACTIVITIES', B: '' },
              { A: 'Cash In', B: cashFlowStatement.operating.in },
              { A: 'Cash Out', B: cashFlowStatement.operating.out * -1 },
              { A: 'Net Operating', B: cashFlowStatement.netOperating },
              { A: '' },
              { A: 'INVESTING ACTIVITIES', B: '' },
              { A: 'Cash In', B: cashFlowStatement.investing.in },
              { A: 'Cash Out', B: cashFlowStatement.investing.out * -1 },
              { A: 'Net Investing', B: cashFlowStatement.netInvesting },
              { A: '' },
              { A: 'FINANCING ACTIVITIES', B: '' },
              { A: 'Cash In', B: cashFlowStatement.financing.in },
              { A: 'Cash Out', B: cashFlowStatement.financing.out * -1 },
              { A: 'Net Financing', B: cashFlowStatement.netFinancing },
              { A: '' },
              { A: 'Net Change in Cash', B: cashFlowStatement.netChange },
              { A: 'Beginning Cash', B: cashFlowStatement.startCash },
              { A: 'Ending Cash', B: cashFlowStatement.endCash }
          ];
      }

      const ws = XLSX.utils.json_to_sheet(rows, { skipHeader: true });
      XLSX.utils.book_append_sheet(wb, ws, sheetName);
      XLSX.writeFile(wb, fileName);
  };

  return (
    <div className="space-y-6 pb-20 md:pb-0 animate-fade-in">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4 no-print">
            <div><h1 className="text-3xl font-bold text-white tracking-tight">Financial Reports</h1></div>
            {activeTab !== 'soa' && (
                <div className="flex gap-2 bg-gray-900 p-1 rounded-xl border border-gray-700">
                    <input type="date" value={dateRange.start} onChange={e => setDateRange(prev => ({...prev, start: e.target.value}))} className="bg-transparent text-white text-sm px-2 outline-none" />
                    <span className="text-gray-500">to</span>
                    <input type="date" value={dateRange.end} onChange={e => setDateRange(prev => ({...prev, end: e.target.value}))} className="bg-transparent text-white text-sm px-2 outline-none" />
                </div>
            )}
        </div>

        <div className="flex gap-2 overflow-x-auto pb-2 no-scrollbar no-print">
            {['income_statement', 'balance_sheet', 'cash_flow', 'trial_balance', 'soa'].map(t => (
                <button 
                    key={t} 
                    onClick={() => setActiveTab(t as ReportTab)} 
                    className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap ${activeTab === t ? 'bg-primary text-white' : 'bg-gray-800 text-gray-400'}`}
                >
                    {t === 'trial_balance' && <Table size={14}/>}
                    {t === 'soa' ? 'SOA' : t.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}
                </button>
            ))}
        </div>

        {/* --- GLOBAL EXPORT BUTTON (Only for non-SOA tabs, SOA has its own control) --- */}
        {activeTab !== 'soa' && (
            <div className="flex justify-end no-print">
                <button 
                    onClick={handleExcelExport}
                    className="flex items-center gap-2 px-4 py-2 bg-emerald-800 hover:bg-emerald-700 text-white rounded-lg font-bold text-sm transition-colors"
                >
                    <FileSpreadsheet size={16} /> Export to Excel
                </button>
            </div>
        )}

        {/* --- TABS --- */}
        
        {activeTab === 'trial_balance' && (
            <div className="glass-card bg-white text-black p-8 rounded-2xl min-h-[600px] shadow-xl">
                <div className="text-center mb-8 border-b border-gray-200 pb-6">
                    <h2 className="text-2xl font-bold text-gray-900 uppercase">{state.businessProfile.name}</h2>
                    <h3 className="text-xl font-medium text-gray-600 mt-2">TRIAL BALANCE</h3>
                    <p className="text-sm text-gray-500">As of {dateRange.end}</p>
                </div>
                <div className="max-w-4xl mx-auto">
                    <table className="w-full text-sm text-left border-collapse">
                        <thead>
                            <tr className="bg-slate-800 text-white uppercase text-xs">
                                <th className="py-3 px-4 border-r border-slate-600 w-24">Code</th>
                                <th className="py-3 px-4 border-r border-slate-600">Account</th>
                                <th className="py-3 px-4 border-r border-slate-600 text-right bg-emerald-900 w-32">Debit</th>
                                <th className="py-3 px-4 text-right bg-red-900 w-32">Credit</th>
                            </tr>
                        </thead>
                        <tbody>
                            {(['Assets', 'Liabilities', 'Equity', 'Revenue', 'Expenses'] as AccountClass[]).map(cls => (
                                <React.Fragment key={cls}>
                                    <tr className="bg-gray-100 font-bold text-gray-700">
                                        <td colSpan={4} className="py-2 px-4 uppercase text-xs tracking-wider">{cls}</td>
                                    </tr>
                                    {trialBalanceData.groups[cls].map(row => (
                                        <tr key={row.id} className="border-b border-gray-100 hover:bg-gray-50">
                                            <td className="py-2 px-4 font-mono text-gray-500">{row.code}</td>
                                            <td className="py-2 px-4 text-gray-800">{row.name}</td>
                                            <td className="py-2 px-4 text-right font-mono text-emerald-700">
                                                {row.debit > 0 ? formatCurrency(row.debit) : '-'}
                                            </td>
                                            <td className="py-2 px-4 text-right font-mono text-red-700">
                                                {row.credit > 0 ? formatCurrency(row.credit) : '-'}
                                            </td>
                                        </tr>
                                    ))}
                                </React.Fragment>
                            ))}
                        </tbody>
                        <tfoot className="bg-slate-200 font-bold text-slate-900 border-t-2 border-slate-400">
                            <tr>
                                <td colSpan={2} className="py-3 px-4 text-right uppercase">Total</td>
                                <td className="py-3 px-4 text-right text-emerald-800">{formatCurrency(trialBalanceData.totalDebit)}</td>
                                <td className="py-3 px-4 text-right text-red-800">{formatCurrency(trialBalanceData.totalCredit)}</td>
                            </tr>
                        </tfoot>
                    </table>
                </div>
            </div>
        )}

        {activeTab === 'soa' ? <StatementOfAccount appState={state} initialAccountId={initialSoaAccount} /> : null}

        {activeTab !== 'soa' && activeTab !== 'trial_balance' && (
            <div className="glass-card bg-white text-black p-8 rounded-2xl min-h-[600px] shadow-xl">
                <div className="text-center mb-8 border-b border-gray-200 pb-6">
                    <h2 className="text-2xl font-bold text-gray-900 uppercase">{state.businessProfile.name}</h2>
                    <h3 className="text-xl font-medium text-gray-600 mt-2">
                        {activeTab === 'cash_flow' ? 'Statement of Cash Flows' : activeTab.replace('_', ' ').toUpperCase()}
                    </h3>
                    <p className="text-sm text-gray-500">
                        {activeTab === 'balance_sheet' ? `As of ${dateRange.end}` : `Period: ${dateRange.start} to ${dateRange.end}`}
                    </p>
                </div>

                {activeTab === 'balance_sheet' && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-12 max-w-4xl mx-auto">
                        <div>
                            <h4 className="font-bold text-gray-800 border-b-2 border-gray-800 pb-2 mb-4">ASSETS</h4>
                            {renderReportNode(balanceSheetTree['Assets'], 0, 1)}
                            <div className="flex justify-between pt-4 mt-4 font-bold text-lg border-t border-gray-300">
                                <span>TOTAL ASSETS</span>
                                <span>{formatCurrency(totalAssets)}</span>
                            </div>
                        </div>
                        <div>
                            <h4 className="font-bold text-gray-800 border-b-2 border-gray-800 pb-2 mb-4">LIABILITIES & EQUITY</h4>
                            <div className="mb-6">
                                <h5 className="font-bold text-sm text-gray-500 mb-2 uppercase">Liabilities</h5>
                                {renderReportNode(balanceSheetTree['Liabilities'], 0, -1)}
                                <div className="flex justify-between font-bold text-gray-700 mt-2 pt-2 border-t border-gray-200">
                                    <span>Total Liabilities</span>
                                    <span>{formatCurrency(totalLiabilities * -1)}</span>
                                </div>
                            </div>
                            <div>
                                <h5 className="font-bold text-sm text-gray-500 mb-2 uppercase">Equity</h5>
                                {renderReportNode(balanceSheetTree['Equity'], 0, -1)}
                                <div className="flex justify-between font-bold text-gray-700 mt-2 pt-2 border-t border-gray-200">
                                    <span>Total Equity</span>
                                    <span>{formatCurrency(totalEquity * -1)}</span>
                                </div>
                            </div>
                            <div className="flex justify-between pt-4 mt-8 font-bold text-lg border-t border-gray-300">
                                <span>TOTAL LIAB & EQUITY</span>
                                <span>{formatCurrency((totalLiabilities + totalEquity) * -1)}</span>
                            </div>
                        </div>
                    </div>
                )}

                {activeTab === 'income_statement' && (
                    <div className="max-w-2xl mx-auto space-y-6">
                        {/* Revenue */}
                        <div>
                            <h4 className="font-bold border-b mb-2 text-emerald-700">REVENUE</h4>
                            {incomeStatement.revenueBreakdown.map(i => (
                                <div key={i.name} className="flex justify-between text-sm py-1">
                                    <span>{i.name}</span>
                                    <span>{formatCurrency(i.amount)}</span>
                                </div>
                            ))}
                            <div className="font-bold flex justify-between mt-2 pt-2 border-t border-gray-200">
                                <span>Total Revenue</span>
                                <span>{formatCurrency(incomeStatement.totalRevenue)}</span>
                            </div>
                        </div>

                        {/* Direct Costs */}
                        <div>
                            <h4 className="font-bold border-b mb-2 text-orange-700">DIRECT COSTS</h4>
                            {incomeStatement.directCostBreakdown.map(i => (
                                <div key={i.name} className="flex justify-between text-sm py-1">
                                    <span>{i.name}</span>
                                    <span className="text-orange-600">{formatCurrency(i.amount)}</span>
                                </div>
                            ))}
                            <div className="font-bold flex justify-between mt-2 pt-2 border-t border-gray-200 text-orange-700">
                                <span>Total Direct Costs</span>
                                <span>{formatCurrency(incomeStatement.totalDirectCosts)}</span>
                            </div>
                        </div>

                        {/* Gross Profit */}
                        <div className="bg-gray-100 p-3 rounded-lg flex justify-between font-bold text-gray-800 border border-gray-300">
                            <span>GROSS PROFIT</span>
                            <span className={incomeStatement.grossProfit >= 0 ? 'text-blue-600' : 'text-red-600'}>
                                {formatCurrency(incomeStatement.grossProfit)}
                            </span>
                        </div>

                        {/* Operating Expenses */}
                        <div>
                            <h4 className="font-bold border-b mb-2 text-red-700">OPERATING EXPENSES</h4>
                            {incomeStatement.operatingExpenseBreakdown.map(i => (
                                <div key={i.name} className="flex justify-between text-sm py-1">
                                    <span>{i.name}</span>
                                    <span className="text-red-600">{formatCurrency(i.amount)}</span>
                                </div>
                            ))}
                            <div className="font-bold flex justify-between mt-2 pt-2 border-t border-gray-200 text-red-700">
                                <span>Total Operating Expenses</span>
                                <span>{formatCurrency(incomeStatement.totalOperatingExpenses)}</span>
                            </div>
                        </div>

                        {/* Net Income */}
                        <div className="bg-gray-900 text-white p-4 rounded-lg flex justify-between font-bold text-xl mt-8">
                            <span>NET INCOME</span>
                            <span className={incomeStatement.netIncome >= 0 ? 'text-emerald-400' : 'text-red-400'}>
                                {formatCurrency(incomeStatement.netIncome)}
                            </span>
                        </div>
                    </div>
                )}

                {activeTab === 'cash_flow' && (
                    <div className="max-w-2xl mx-auto space-y-8">
                        <div>
                            <h4 className="font-bold border-b mb-2 text-gray-800 uppercase text-sm">Operating Activities</h4>
                            <div className="flex justify-between text-sm py-1 text-gray-600">
                                <span>Cash Receipts from Customers/Ops</span>
                                <span>{formatCurrency(cashFlowStatement.operating.in)}</span>
                            </div>
                            <div className="flex justify-between text-sm py-1 text-gray-600">
                                <span>Cash Paid for Expenses</span>
                                <span>({formatCurrency(cashFlowStatement.operating.out)})</span>
                            </div>
                            <div className="font-bold flex justify-between mt-2 pt-2 border-t border-gray-200">
                                <span>Net Cash from Operating</span>
                                <span className={cashFlowStatement.netOperating >= 0 ? 'text-black' : 'text-red-600'}>
                                    {formatCurrency(cashFlowStatement.netOperating)}
                                </span>
                            </div>
                        </div>

                        <div>
                            <h4 className="font-bold border-b mb-2 text-gray-800 uppercase text-sm">Investing Activities</h4>
                            <div className="flex justify-between text-sm py-1 text-gray-600">
                                <span>Sale of Assets</span>
                                <span>{formatCurrency(cashFlowStatement.investing.in)}</span>
                            </div>
                            <div className="flex justify-between text-sm py-1 text-gray-600">
                                <span>Purchase of Assets</span>
                                <span>({formatCurrency(cashFlowStatement.investing.out)})</span>
                            </div>
                            <div className="font-bold flex justify-between mt-2 pt-2 border-t border-gray-200">
                                <span>Net Cash from Investing</span>
                                <span className={cashFlowStatement.netInvesting >= 0 ? 'text-black' : 'text-red-600'}>
                                    {formatCurrency(cashFlowStatement.netInvesting)}
                                </span>
                            </div>
                        </div>

                        <div>
                            <h4 className="font-bold border-b mb-2 text-gray-800 uppercase text-sm">Financing Activities</h4>
                            <div className="flex justify-between text-sm py-1 text-gray-600">
                                <span>Loans / Capital Injected</span>
                                <span>{formatCurrency(cashFlowStatement.financing.in)}</span>
                            </div>
                            <div className="flex justify-between text-sm py-1 text-gray-600">
                                <span>Repayments / Drawings</span>
                                <span>({formatCurrency(cashFlowStatement.financing.out)})</span>
                            </div>
                            <div className="font-bold flex justify-between mt-2 pt-2 border-t border-gray-200">
                                <span>Net Cash from Financing</span>
                                <span className={cashFlowStatement.netFinancing >= 0 ? 'text-black' : 'text-red-600'}>
                                    {formatCurrency(cashFlowStatement.netFinancing)}
                                </span>
                            </div>
                        </div>

                        <div className="bg-gray-100 p-4 rounded-lg space-y-2 mt-8">
                            <div className="flex justify-between text-sm font-medium text-gray-600">
                                <span>Net Increase (Decrease) in Cash</span>
                                <span>{formatCurrency(cashFlowStatement.netChange)}</span>
                            </div>
                            <div className="flex justify-between text-sm font-medium text-gray-600">
                                <span>Cash at Beginning of Period</span>
                                <span>{formatCurrency(cashFlowStatement.startCash)}</span>
                            </div>
                            <div className="flex justify-between font-bold text-lg text-gray-900 border-t border-gray-300 pt-2 mt-2">
                                <span>Cash at End of Period</span>
                                <span>{formatCurrency(cashFlowStatement.endCash)}</span>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        )}
    </div>
  );
};
