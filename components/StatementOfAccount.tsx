
import React, { useMemo, useState, useEffect } from 'react';
import { AppState } from '../types';
import { format, parseISO, startOfMonth, endOfMonth } from 'date-fns';
import { SearchableSelect } from './ui/SearchableSelect';
import { ArrowRight, FileText, Building2, Printer, Share2, Camera, FileSpreadsheet, Download } from 'lucide-react';
import { getAllDescendantIds } from '../utils/accountHierarchy';
import html2canvas from 'html2canvas';
import * as XLSX from 'xlsx';

interface SOAProps {
  appState: AppState;
  initialAccountId?: string;
}

export const StatementOfAccount: React.FC<SOAProps> = ({ appState, initialAccountId }) => {
  const [selectedAccountId, setSelectedAccountId] = useState(initialAccountId || '');
  const [dateRange, setDateRange] = useState({
    start: format(startOfMonth(new Date()), 'yyyy-MM-dd'),
    end: format(endOfMonth(new Date()), 'yyyy-MM-dd')
  });
  const [isExporting, setIsExporting] = useState(false);

  useEffect(() => {
      if (initialAccountId) setSelectedAccountId(initialAccountId);
  }, [initialAccountId]);

  const selectedAccount = appState.accounts.find(c => c.id === selectedAccountId);

  // Filter options to show ALL accounts (Group, GL, Sub-ledger) so we can run SOA on Groups
  const accountOptions = useMemo(() => {
    return appState.accounts
      .map(c => ({
        id: c.id,
        label: c.name,
        subLabel: c.code,
        color: c.level === 'sub_ledger' ? '#3b82f6' : (c.level === 'gl' ? '#8b5cf6' : '#6b7280')
      })).sort((a,b) => a.subLabel.localeCompare(b.subLabel));
  }, [appState.accounts]);

  // Calculation Logic
  const ledgerData = useMemo(() => {
    if (!selectedAccountId) return null;

    // 1. Sort all transactions by date ascending
    const allTxs = [...appState.transactions].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    
    const startDate = parseISO(dateRange.start);
    const endDate = parseISO(dateRange.end);
    endDate.setHours(23, 59, 59, 999);

    let runningBalance = 0;
    let openingBalance = 0;
    const rows: any[] = [];
    let totalDebits = 0;
    let totalCredits = 0;

    const account = appState.accounts.find(a => a.id === selectedAccountId);
    if(!account) return null;

    // Determine Relevant Account IDs (Self + Descendants)
    const relevantIds = new Set(getAllDescendantIds(account.id, appState.accounts));

    // Normal Balance Logic:
    // If Debit Normal: Dr adds, Cr subtracts.
    // If Credit Normal: Cr adds, Dr subtracts.
    const isDrNormal = account.normalBalance === 'debit';

    allTxs.forEach(t => {
      const txDate = parseISO(t.date);
      let debit = 0;
      let credit = 0;
      let isRelevant = false;

      // Check if Transaction affects this group/account
      // Use Sets for O(1) lookup
      if (relevantIds.has(t.accountId)) {
          // This account (or child) was Debited
          debit += t.amount;
          isRelevant = true;
      }
      
      if (relevantIds.has(t.paymentAccountId || '')) {
          // This account (or child) was Credited
          credit += t.amount;
          isRelevant = true;
      }
      
      if (isRelevant) {
        // Calculate impact on balance based on Normal Balance
        let impact = 0;
        if (isDrNormal) {
             impact = debit - credit;
        } else {
             impact = credit - debit;
        }

        if (txDate < startDate) {
          openingBalance += impact;
          runningBalance += impact;
        } else if (txDate <= endDate) {
          runningBalance += impact;
          totalDebits += debit;
          totalCredits += credit;
          
          // --- IMPROVISED DESCRIPTION LOGIC ---
          const party = t.relatedPartyId ? appState.parties.find(p => p.id === t.relatedPartyId) : null;
          const monthStr = format(txDate, 'MMM yyyy');
          
          // Check if we need to show sub-account context (if viewing a Group)
          let subAccountName = '';
          if (relevantIds.size > 1 && t.accountId !== account.id && t.paymentAccountId !== account.id) {
              if (relevantIds.has(t.accountId)) subAccountName = appState.accounts.find(a => a.id === t.accountId)?.name || '';
              else if (relevantIds.has(t.paymentAccountId || '')) subAccountName = appState.accounts.find(a => a.id === t.paymentAccountId)?.name || '';
          }

          // Construct Rich Description
          // Format: [Party Name] - [Note] - [SubAccount] ([Month])
          let richDescription = t.note || t.type.toUpperCase();
          
          const parts = [];
          if (party) parts.push(party.name);
          parts.push(richDescription);
          if (subAccountName) parts.push(`[${subAccountName}]`);
          
          richDescription = `${parts.join(' - ')} (${monthStr})`;

          rows.push({
            ...t,
            debit,
            credit,
            balance: runningBalance,
            subAccountName,
            richDescription, // Use this for display
            partyName: party?.name
          });
        }
      }
    });

    return {
      openingBalance,
      rows,
      closingBalance: runningBalance,
      totalDebits,
      totalCredits,
      account
    };

  }, [selectedAccountId, dateRange, appState.transactions, appState.accounts, appState.parties]);

  const handlePrint = () => window.print();

  const handleSnapAndShare = async () => {
      const element = document.getElementById('soa-print-area');
      if (!element) return;
      
      setIsExporting(true);
      try {
          const canvas = await html2canvas(element, { scale: 2, backgroundColor: '#ffffff' });
          const dataUrl = canvas.toDataURL('image/png');
          const blob = await (await fetch(dataUrl)).blob();
          const file = new File([blob], `SOA_${selectedAccount?.name}.png`, { type: 'image/png' });

          // 1. Try Native Share (Mobile) - Great for direct WhatsApp sharing
          if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
              await navigator.share({
                  files: [file],
                  title: `SOA - ${selectedAccount?.name}`,
                  text: `Statement of Account for ${selectedAccount?.name}`
              });
          } 
          // 2. Fallback: Download and Open WhatsApp Web
          else {
              // Download
              const link = document.createElement('a');
              link.href = dataUrl;
              link.download = `SOA_${selectedAccount?.name}.png`;
              link.click();

              // Prompt
              if (confirm("Image downloaded. Open WhatsApp to send it?")) {
                  window.open(`https://wa.me/?text=Please find the attached Statement of Account for ${selectedAccount?.name}.`, '_blank');
              }
          }
      } catch (e) {
          console.error("Snap failed", e);
          alert("Could not generate image.");
      } finally {
          setIsExporting(false);
      }
  };

  const handleExcelExport = () => {
      if (!ledgerData) return;

      const exportRows = ledgerData.rows.map(r => ({
          Date: r.date.split('T')[0],
          Party: r.partyName || '-',
          Description: r.note || r.type,
          'Sub Account': r.subAccountName || '-',
          Debit: r.debit,
          Credit: r.credit,
          Balance: r.balance
      }));

      // Add Opening Balance Row
      exportRows.unshift({
          Date: dateRange.start,
          Party: '-',
          Description: 'OPENING BALANCE',
          'Sub Account': '-',
          Debit: 0,
          Credit: 0,
          Balance: ledgerData.openingBalance
      });

      const ws = XLSX.utils.json_to_sheet(exportRows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Statement");
      XLSX.writeFile(wb, `SOA_${selectedAccount?.name}_${dateRange.start}.xlsx`);
  };

  const formatMoney = (amount: number) => {
      return amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  return (
    <div className="space-y-6">
      {/* Control Bar */}
      <div className="no-print bg-gray-900 p-4 rounded-xl border border-gray-800 flex flex-col xl:flex-row gap-4 items-end shadow-lg">
        <div className="flex-1 w-full">
          <label className="text-[10px] text-gray-500 uppercase font-bold mb-1 block">Select Ledger Account / Group</label>
          <SearchableSelect 
            options={accountOptions}
            value={selectedAccountId}
            onChange={setSelectedAccountId}
            placeholder="Search Account..."
          />
        </div>
        <div className="flex flex-wrap gap-2 items-center w-full xl:w-auto">
            <div>
                <label className="text-[10px] text-gray-500 uppercase font-bold mb-1 block">Start Date</label>
                <input 
                    type="date" 
                    className="bg-gray-950 border border-gray-700 text-white text-sm rounded-lg px-3 py-2 outline-none focus:border-primary transition-colors w-full md:w-auto"
                    value={dateRange.start}
                    onChange={e => setDateRange(prev => ({...prev, start: e.target.value}))}
                />
            </div>
            <div className="hidden xl:block">
                <ArrowRight className="text-gray-600 mt-6" size={16} />
            </div>
            <div>
                <label className="text-[10px] text-gray-500 uppercase font-bold mb-1 block">End Date</label>
                <input 
                    type="date" 
                    className="bg-gray-950 border border-gray-700 text-white text-sm rounded-lg px-3 py-2 outline-none focus:border-primary transition-colors w-full md:w-auto"
                    value={dateRange.end}
                    onChange={e => setDateRange(prev => ({...prev, end: e.target.value}))}
                />
            </div>
        </div>
        <div className="flex gap-2 w-full xl:w-auto mt-2 xl:mt-0">
            <button 
                onClick={handleSnapAndShare}
                disabled={!selectedAccountId || isExporting}
                className="flex items-center justify-center gap-2 px-4 py-2.5 bg-green-700 hover:bg-green-600 text-white rounded-lg font-bold text-sm transition-colors disabled:opacity-50 h-[42px]"
                title="Snap & Send to WhatsApp"
            >
                {isExporting ? <span className="animate-spin">⌛</span> : <Camera size={18} />} <span className="hidden sm:inline">WhatsApp</span>
            </button>
            <button 
                onClick={handleExcelExport}
                disabled={!selectedAccountId}
                className="flex items-center justify-center gap-2 px-4 py-2.5 bg-emerald-800 hover:bg-emerald-700 text-white rounded-lg font-bold text-sm transition-colors disabled:opacity-50 h-[42px]"
                title="Export to Excel"
            >
                <FileSpreadsheet size={18} /> <span className="hidden sm:inline">CSV</span>
            </button>
            <button 
                onClick={handlePrint}
                disabled={!selectedAccountId}
                className="flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-bold text-sm transition-colors disabled:opacity-50 h-[42px] shadow-lg shadow-blue-900/20"
            >
                <Printer size={18} /> Print
            </button>
        </div>
      </div>

      {selectedAccount && ledgerData ? (
        <div className="w-full overflow-x-auto pb-6 custom-scrollbar">
            <div id="soa-print-area" className="bg-white text-slate-900 p-8 md:p-12 rounded-xl shadow-2xl min-h-[800px] min-w-[900px] max-w-6xl mx-auto animate-fade-in relative">
                
                {/* Header */}
                <div className="flex justify-between items-start border-b-2 border-slate-800 pb-6 mb-8">
                    <div className="flex gap-4">
                        <div className="p-3 bg-slate-900 rounded-lg text-white h-fit">
                            <Building2 size={32} />
                        </div>
                        <div>
                            <h1 className="text-3xl font-bold text-slate-900 tracking-tight uppercase">{appState.businessProfile.name}</h1>
                            <div className="text-sm text-slate-600 mt-2 space-y-1">
                                <p>{appState.businessProfile.address}</p>
                                <p>{appState.businessProfile.email}</p>
                                <p>{appState.businessProfile.phone}</p>
                            </div>
                        </div>
                    </div>
                    <div className="text-right">
                        <h2 className="text-2xl font-bold text-slate-800 uppercase tracking-widest mb-2">Statement of Account</h2>
                        <div className="bg-slate-100 p-3 rounded-lg text-sm text-slate-600 border border-slate-200 inline-block text-right">
                             <div className="flex justify-between gap-4"><span className="font-bold">Account:</span> <span>{selectedAccount.name}</span></div>
                             <div className="flex justify-between gap-4"><span className="font-bold">GL Code:</span> <span className="font-mono">{selectedAccount.code}</span></div>
                             <div className="flex justify-between gap-4"><span className="font-bold">Period:</span> <span>{dateRange.start} to {dateRange.end}</span></div>
                        </div>
                    </div>
                </div>

                {/* Summary Cards */}
                <div className="grid grid-cols-4 gap-4 mb-8">
                     <div className="p-4 bg-gray-50 rounded-lg border border-gray-200">
                         <span className="block text-xs font-bold text-gray-500 uppercase">Opening Balance</span>
                         <span className="text-xl font-bold text-slate-700">{formatMoney(ledgerData.openingBalance)}</span>
                     </div>
                     <div className="p-4 bg-emerald-50 rounded-lg border border-emerald-100">
                         <span className="block text-xs font-bold text-emerald-600 uppercase">Total Debits</span>
                         <span className="text-xl font-bold text-emerald-700">+{formatMoney(ledgerData.totalDebits)}</span>
                     </div>
                     <div className="p-4 bg-red-50 rounded-lg border border-red-100">
                         <span className="block text-xs font-bold text-red-600 uppercase">Total Credits</span>
                         <span className="text-xl font-bold text-red-700">-{formatMoney(ledgerData.totalCredits)}</span>
                     </div>
                     <div className="p-4 bg-slate-800 text-white rounded-lg border border-slate-700">
                         <span className="block text-xs font-bold text-slate-400 uppercase">Closing Balance</span>
                         <span className="text-xl font-bold">{formatMoney(ledgerData.closingBalance)}</span>
                     </div>
                </div>

                {/* Table */}
                <table className="w-full text-sm text-left border-collapse">
                    <thead>
                        <tr className="bg-slate-800 text-white uppercase text-xs">
                            <th className="py-3 px-4 border-r border-slate-600">Date</th>
                            <th className="py-3 px-4 border-r border-slate-600 w-2/5">Description</th>
                            <th className="py-3 px-4 border-r border-slate-600 text-right bg-emerald-900">Debit</th>
                            <th className="py-3 px-4 border-r border-slate-600 text-right bg-red-900">Credit</th>
                            <th className="py-3 px-4 text-right">Balance</th>
                        </tr>
                    </thead>
                    <tbody>
                        {/* Opening Balance Row */}
                        <tr className="bg-yellow-50 text-slate-600 font-medium italic border-b border-gray-200">
                             <td className="py-3 px-4">{dateRange.start}</td>
                             <td className="py-3 px-4">Balance Brought Forward</td>
                             <td className="py-3 px-4 text-right">-</td>
                             <td className="py-3 px-4 text-right">-</td>
                             <td className="py-3 px-4 text-right font-bold">{formatMoney(ledgerData.openingBalance)}</td>
                        </tr>

                        {ledgerData.rows.map((row, idx) => (
                            <tr key={idx} className="border-b border-gray-200 hover:bg-gray-50 transition-colors">
                                <td className="py-3 px-4 text-slate-600 font-mono whitespace-nowrap">{row.date.split('T')[0]}</td>
                                <td className="py-3 px-4 text-slate-800 font-medium">
                                    {row.richDescription}
                                </td>
                                <td className="py-3 px-4 text-right font-mono text-emerald-700 font-bold bg-emerald-50/30">
                                    {row.debit > 0 ? formatMoney(row.debit) : ''}
                                </td>
                                <td className="py-3 px-4 text-right font-mono text-red-700 font-bold bg-red-50/30">
                                    {row.credit > 0 ? formatMoney(row.credit) : ''}
                                </td>
                                <td className="py-3 px-4 text-right font-mono font-bold text-slate-900 bg-gray-50">
                                    {formatMoney(row.balance)}
                                </td>
                            </tr>
                        ))}

                        {ledgerData.rows.length === 0 && (
                            <tr><td colSpan={5} className="py-12 text-center text-slate-400 italic">No transactions in this period.</td></tr>
                        )}
                    </tbody>
                    <tfoot className="bg-slate-100 font-bold text-slate-800 border-t-2 border-slate-300">
                        <tr>
                            <td colSpan={2} className="py-4 px-4 text-right uppercase text-xs">Period Totals</td>
                            <td className="py-4 px-4 text-right text-emerald-700">{formatMoney(ledgerData.totalDebits)}</td>
                            <td className="py-4 px-4 text-right text-red-700">{formatMoney(ledgerData.totalCredits)}</td>
                            <td className="py-4 px-4 text-right bg-slate-200">{formatMoney(ledgerData.closingBalance)}</td>
                        </tr>
                    </tfoot>
                </table>

                {/* Footer */}
                <div className="mt-12 pt-6 border-t border-gray-200 text-center text-slate-500 text-xs">
                    This is a computer-generated document. No signature is required. <br/>
                    Generated by Tarmi FinTrack Pro on {format(new Date(), 'yyyy-MM-dd HH:mm')}
                </div>
            </div>
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-20 text-gray-500 bg-gray-900/50 rounded-2xl border border-gray-800 border-dashed">
            <FileText size={48} className="mb-4 opacity-50" />
            <p className="text-lg font-medium">Select an account to view the Statement</p>
        </div>
      )}
    </div>
  );
};
