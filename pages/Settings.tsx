
import React, { useState, useRef, useMemo, useEffect } from 'react';
import { useFinance } from '../context/FinanceContext';
import { Trash2, Plus, LayoutGrid, Book, AlertTriangle, Users, Pencil, Check, X, Database, Search, FileJson, FileSpreadsheet, Building2, ChevronRight, ChevronDown, Folder, Repeat, Mail, Phone, MapPin, Tag, Star, Upload, FileText, Globe, ArrowRightLeft } from 'lucide-react';
import { Account, TransactionTemplate, AccountClass, Party, PartyType, AccountLevel, Transaction, AppState, CurrencyCode } from '../types';
import { Modal } from '../components/ui/Modal';
import { format, parseISO, addMonths, addWeeks, addYears, addDays, endOfDay } from 'date-fns';
import { excelService } from '../services/excel';
import { buildAccountTree, AccountNode } from '../utils/accountHierarchy';
import { TransactionForm } from '../components/TransactionForm';
import { useNavigate, useLocation } from 'react-router-dom';
import { CURRENCIES } from '../constants';

type Tab = 'profile' | 'coa' | 'parties' | 'recurring' | 'templates' | 'migration' | 'danger';

export const Settings: React.FC = () => {
  const { state, dispatch } = useFinance();
  const navigate = useNavigate();
  const location = useLocation();
  const baseCurrency = state.businessProfile.baseCurrency || 'USD';
  
  // Default to COA as requested
  const [activeTab, setActiveTab] = useState<Tab>('coa');
  
  // Handle tab switching via navigation state
  useEffect(() => {
      if (location.state && location.state.tab) {
          setActiveTab(location.state.tab as Tab);
      }
  }, [location]);
  
  // Profile State
  const [bizName, setBizName] = useState(state.businessProfile.name);
  const [bizAddress, setBizAddress] = useState(state.businessProfile.address);
  const [bizPhone, setBizPhone] = useState(state.businessProfile.phone);
  const [bizEmail, setBizEmail] = useState(state.businessProfile.email);
  const [bizFooter, setBizFooter] = useState(state.businessProfile.footerNote || '');

  // COA State
  const [coaSearch, setCoaSearch] = useState('');
  const [expandedNodes, setExpandedNodes] = useState<Record<string, boolean>>({});
  const [newAccName, setNewAccName] = useState('');
  const [newAccClass, setNewAccClass] = useState<AccountClass>('Expenses');
  const [newAccCode, setNewAccCode] = useState('');
  const [newAccParent, setNewAccParent] = useState('');
  const [newAccLevel, setNewAccLevel] = useState<AccountLevel>('gl');
  const [editingAccId, setEditingAccId] = useState<string | null>(null);
  const [editingAccName, setEditingAccName] = useState('');

  // Parties State
  const [partySearch, setPartySearch] = useState('');
  const [partyName, setPartyName] = useState('');
  const [partyType, setPartyType] = useState<PartyType>('vendor');
  const [partyPhone, setPartyPhone] = useState('');
  const [partyEmail, setPartyEmail] = useState('');
  const [editingPartyId, setEditingPartyId] = useState<string | null>(null);

  // Template Modal State
  const [isTemplateModalOpen, setIsTemplateModalOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<TransactionTemplate | null>(null);

  // Migration State
  const [migrationTarget, setMigrationTarget] = useState<CurrencyCode | ''>('');
  const [migrationRate, setMigrationRate] = useState('');
  const [migrationConfirm, setMigrationConfirm] = useState('');

  // Refs
  const backupInputRef = useRef<HTMLInputElement>(null);
  const excelInputRef = useRef<HTMLInputElement>(null);

  // --- HIERARCHY LOGIC ---
  const accountTree = useMemo(() => {
      const todayEnd = endOfDay(new Date());
      const effectiveTransactions = state.transactions.filter(t => parseISO(t.date) <= todayEnd);
      return buildAccountTree(state.accounts, effectiveTransactions);
  }, [state.accounts, state.transactions]);

  const toggleNode = (id: string) => {
      setExpandedNodes(prev => ({ ...prev, [id]: !prev[id] }));
  };

  useMemo(() => {
      if (coaSearch) {
          const allIds: Record<string, boolean> = {};
          state.accounts.forEach(a => allIds[a.id] = true);
          setExpandedNodes(allIds);
      }
  }, [coaSearch, state.accounts]);

  const flatAccounts = useMemo(() => state.accounts.filter(a => a.level === 'group' || a.level === 'class' || a.level === 'gl').sort((a,b) => a.code.localeCompare(b.code)), [state.accounts]);

  // Update Class when Parent changes
  useEffect(() => {
      if (newAccParent) {
          const parent = state.accounts.find(a => a.id === newAccParent);
          if (parent) {
              setNewAccClass(parent.class);
          }
      }
  }, [newAccParent, state.accounts]);

  // --- HANDLERS ---

  const handleSaveProfile = (e: React.FormEvent) => { 
      e.preventDefault(); 
      dispatch({ type: 'UPDATE_BUSINESS_PROFILE', payload: { ...state.businessProfile, name: bizName, address: bizAddress, phone: bizPhone, email: bizEmail, footerNote: bizFooter } }); 
      alert('Profile Saved'); 
  };

  const handleMigration = (e: React.FormEvent) => {
    e.preventDefault();
    if (migrationConfirm !== 'CONFIRM') {
        alert("Please type CONFIRM to execute migration.");
        return;
    }
    const rate = parseFloat(migrationRate);
    if (!migrationTarget || isNaN(rate) || rate <= 0) {
        alert("Invalid target currency or rate.");
        return;
    }

    if (confirm(`WARNING: This will permanently multiply ALL historical amounts by ${rate} and change base currency to ${migrationTarget}. This cannot be undone. Proceed?`)) {
        dispatch({ 
            type: 'MIGRATE_BASE_CURRENCY', 
            payload: { newCurrency: migrationTarget, rate: rate } 
        });
        alert("Migration Complete. The dashboard will now reflect the new currency.");
        setMigrationTarget('');
        setMigrationRate('');
        setMigrationConfirm('');
        setActiveTab('profile'); // Switch away
    }
  };

  const handleAddAccount = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newAccName || !newAccCode) return;
    let normalBalance: 'debit' | 'credit' = 'debit';
    if (['Liabilities', 'Equity', 'Revenue'].includes(newAccClass)) normalBalance = 'credit';

    dispatch({ type: 'ADD_ACCOUNT', payload: {
        id: Math.random().toString(36).substr(2, 9),
        name: newAccName,
        class: newAccClass,
        code: newAccCode,
        level: newAccLevel,
        parentId: newAccParent || undefined,
        normalBalance,
        isPosting: newAccLevel === 'gl' || newAccLevel === 'sub_ledger'
    }});
    setNewAccName(''); setNewAccCode('');
  };

  const handleEditParty = (party: Party) => {
      setEditingPartyId(party.id);
      setPartyName(party.name);
      setPartyType(party.type);
      setPartyPhone(party.phone || '');
      setPartyEmail(party.email || '');
  };

  const cancelEditParty = () => {
      setEditingPartyId(null);
      setPartyName('');
      setPartyPhone('');
      setPartyEmail('');
      setPartyType('vendor');
  };

  const handleAddParty = (e: React.FormEvent) => {
    e.preventDefault();
    if (!partyName) return;

    // Use lower-case normalized type if standard, otherwise keep as is
    const standardTypes = ['vendor', 'customer', 'employee', 'other'];
    const finalType = standardTypes.includes(partyType.toLowerCase()) ? partyType.toLowerCase() : partyType;

    if (editingPartyId) {
        // UPDATE LOGIC
        const existingParty = state.parties.find(p => p.id === editingPartyId);
        if (!existingParty) return;

        const updatedParty: Party = {
            ...existingParty,
            name: partyName,
            type: finalType,
            phone: partyPhone,
            email: partyEmail
        };
        dispatch({ type: 'UPDATE_PARTY', payload: updatedParty });
        
        // Reset form
        cancelEditParty();
        alert("Party updated successfully. Linked accounts and records have been synced.");
        return;
    }

    let targetParentCode = '11900'; 
    let targetClass: AccountClass = 'Assets';
    let targetNormalBalance: 'debit' | 'credit' = 'debit';
    const parentAccount = state.accounts.find(a => a.code === targetParentCode);
    
    if (!parentAccount) {
        alert(`System Error: Parent GL Account ${targetParentCode} (Parties) not found.`);
        return;
    }

    const siblings = state.accounts.filter(a => a.parentId === parentAccount.id);
    const partyAccountCode = `${parentAccount.code}.${siblings.length + 1}`;
    const partyAccountId = Math.random().toString(36).substr(2, 9);

    const partyAccount: Account = {
        id: partyAccountId,
        code: partyAccountCode,
        name: partyName,
        class: targetClass,
        level: 'sub_ledger',
        parentId: parentAccount.id,
        normalBalance: targetNormalBalance,
        isPosting: true
    };
    dispatch({ type: 'ADD_ACCOUNT', payload: partyAccount });

    const newParty: Party = {
        id: Math.random().toString(36).substr(2, 9),
        name: partyName,
        type: finalType,
        phone: partyPhone,
        email: partyEmail,
        linkedAccountId: partyAccountId
    };
    dispatch({ type: 'ADD_PARTY', payload: newParty });

    setPartyName(''); setPartyPhone(''); setPartyEmail('');
    alert(`Party created.`);
  };

  const handleSaveTemplate = (template: TransactionTemplate) => {
      if (editingTemplate) {
          dispatch({ type: 'DELETE_TEMPLATE', payload: editingTemplate.id });
      }
      dispatch({ type: 'ADD_TEMPLATE', payload: template });
      setIsTemplateModalOpen(false);
      setEditingTemplate(null);
  };

  const handleDelete = (type: string, id: string) => { 
      if (confirm('Are you sure? This action cannot be undone.')) { 
          if(type === 'ACCOUNT') dispatch({ type: 'DELETE_ACCOUNT', payload: id }); 
          if(type === 'TEMPLATE') dispatch({ type: 'DELETE_TEMPLATE', payload: id }); 
          if(type === 'PARTY') dispatch({ type: 'DELETE_PARTY', payload: id }); 
          if(type === 'RECURRING') dispatch({ type: 'DELETE_RECURRING', payload: id }); 
      } 
  };

  const goToSOA = (accountId: string) => {
      navigate('/reports', { state: { tab: 'soa', accountId } });
  };

  const handleBackup = () => { const dataStr = JSON.stringify(state, null, 2); const link = document.createElement('a'); link.href = 'data:application/json;charset=utf-8,'+ encodeURIComponent(dataStr); link.download = `backup_${format(new Date(), 'yyyy-MM-dd')}.json`; link.click(); };
  const handleExcelExport = () => excelService.exportDataToExcel(state);
  const handleRestore = (e: React.ChangeEvent<HTMLInputElement>) => { const file = e.target.files?.[0]; if(!file)return; const reader=new FileReader(); reader.onload=async(ev)=>{ try{ const json=JSON.parse(ev.target?.result as string); if(confirm("Restore?")) dispatch({type:'SET_STATE', payload:json}); }catch(err){alert("Invalid JSON");}}; reader.readAsText(file); };
  const handleExcelImport = async (e: React.ChangeEvent<HTMLInputElement>) => { const file = e.target.files?.[0]; if(!file)return; if(confirm("Overwrite data?")) { try{ const data=await excelService.importDataFromExcel(file); if(data.transactions) dispatch({type:'SET_STATE', payload:{...state, ...data}}); alert("Imported"); }catch(e){alert("Error");}} };
  const startEditingAcc = (acc: Account) => { setEditingAccId(acc.id); setEditingAccName(acc.name); };
  const saveEditingAcc = () => { if(editingAccId) { const orig = state.accounts.find(c => c.id === editingAccId); if(orig) dispatch({ type: 'UPDATE_ACCOUNT', payload: { ...orig, name: editingAccName } }); setEditingAccId(null); } };
  const cancelEditingAcc = () => { setEditingAccId(null); };
  const handleReset = () => { if(confirm('RESET DATA? ALL TRANSACTIONS WILL BE LOST.')) dispatch({ type: 'RESET_DATA' }); };

  const getBalanceColor = (node: AccountNode) => {
    const bal = node.totalBalance;
    if (Math.abs(bal) < 0.01) return 'text-gray-500';
    if (['Liabilities', 'Equity', 'Revenue'].includes(node.class)) {
        return bal < 0 ? 'text-emerald-400' : 'text-red-400';
    }
    return bal > 0 ? 'text-emerald-400' : 'text-red-400';
  };

  const renderTreeNodes = (nodes: AccountNode[], depth: number = 0) => {
      return nodes.map(node => {
          if (coaSearch) {
              const match = node.name.toLowerCase().includes(coaSearch.toLowerCase()) || node.code.includes(coaSearch);
              if (!match && node.children.length === 0) return null;
          }
          const hasChildren = node.children.length > 0;
          const isExpanded = expandedNodes[node.id];
          const isGroup = node.level === 'group' || node.level === 'class';
          return (
              <div key={node.id}>
                  <div className={`flex items-center justify-between p-3 border-b border-gray-800 hover:bg-gray-800/50 transition-colors ${node.level === 'class' ? 'bg-gray-900/80 font-bold' : ''}`} style={{ paddingLeft: `${depth * 20 + 12}px` }}>
                      <div className="flex items-center gap-3 flex-1 overflow-hidden">
                          <div className="w-5 flex justify-center">{hasChildren && (<button onClick={() => toggleNode(node.id)} className="text-gray-500 hover:text-white transition-transform active:scale-90">{isExpanded || coaSearch ? <ChevronDown size={14} /> : <ChevronRight size={14} />}</button>)}</div>
                          <span className={`font-mono text-xs ${isGroup ? 'text-gray-400' : 'text-gray-500'} w-12 shrink-0`}>{node.code}</span>
                          {editingAccId === node.id ? (
                                <div className="flex gap-2 flex-1"><input className="w-full px-2 py-1 bg-gray-950 border border-blue-500 rounded text-sm text-white" value={editingAccName} onChange={e => setEditingAccName(e.target.value)} autoFocus /><button onClick={saveEditingAcc} className="text-emerald-500"><Check size={16} /></button><button onClick={cancelEditingAcc} className="text-red-500"><X size={16} /></button></div>
                          ) : (
                              <div className="flex items-center gap-2 truncate">{isGroup && <Folder size={14} className="text-blue-500/50" />}<span className={`${isGroup ? 'text-gray-200' : 'text-gray-400'} truncate`}>{node.name}</span></div>
                          )}
                      </div>
                      <div className="flex items-center gap-4 pl-4">
                          <span className={`font-mono text-sm ${getBalanceColor(node)} ${isGroup ? 'font-bold' : ''}`}>{node.totalBalance.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                              <button onClick={() => goToSOA(node.id)} className="p-1.5 text-gray-500 hover:text-blue-400 hover:bg-gray-800 rounded transition-colors" title="View Ledger">
                                  <FileText size={14} />
                              </button>
                              <button onClick={() => startEditingAcc(node)} className="p-1.5 text-gray-600 hover:text-blue-400 hover:bg-gray-800 rounded transition-colors"><Pencil size={14} /></button>
                              {!node.isSystem && !hasChildren && (
                                  <button onClick={() => handleDelete('ACCOUNT', node.id)} className="p-1.5 text-gray-600 hover:text-red-400 hover:bg-gray-800 rounded transition-colors"><Trash2 size={14} /></button>
                              )}
                          </div>
                      </div>
                  </div>
                  {(isExpanded || coaSearch) && hasChildren && (<div className="border-l border-gray-800 ml-4 animate-fade-in">{renderTreeNodes(node.children, depth + 1)}</div>)}
              </div>
          );
      });
  };

  const filteredParties = state.parties.filter(p => 
      p.name.toLowerCase().includes(partySearch.toLowerCase()) || 
      p.email?.toLowerCase().includes(partySearch.toLowerCase()) ||
      p.phone?.includes(partySearch)
  );

  return (
    <div className="space-y-6 pb-20 md:pb-0">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4">
          <div><h1 className="text-2xl font-bold text-gray-100">Settings</h1><p className="text-sm text-gray-400">System configuration and data management</p></div>
          <div className="flex gap-2 flex-wrap justify-end">
               <button onClick={handleBackup} className="flex items-center gap-2 bg-indigo-900/40 hover:bg-indigo-900/60 text-indigo-300 px-4 py-2 rounded-lg text-sm font-medium border border-indigo-900/50 transition-all hover:scale-105 active:scale-95"><Database size={16} /> Backup</button>
               <div className="relative"><input type="file" accept=".json" ref={backupInputRef} onChange={handleRestore} className="hidden" id="json-restore"/><label htmlFor="json-restore" className="flex items-center gap-2 bg-gray-800 hover:bg-gray-700 text-gray-200 px-4 py-2 rounded-lg text-sm font-medium border border-gray-700 cursor-pointer transition-all hover:scale-105 active:scale-95"><FileJson size={16} /> Restore</label></div>
               <button onClick={handleExcelExport} className="flex items-center gap-2 bg-green-900/40 hover:bg-green-900/60 text-green-300 px-4 py-2 rounded-lg text-sm font-medium border border-green-900/50 transition-all hover:scale-105 active:scale-95"><FileSpreadsheet size={16} /> Export</button>
               <div className="relative"><input type="file" accept=".xlsx" ref={excelInputRef} onChange={handleExcelImport} className="hidden" id="excel-restore"/><label htmlFor="excel-restore" className="flex items-center gap-2 bg-gray-800 hover:bg-gray-700 text-gray-200 px-4 py-2 rounded-lg text-sm font-medium border border-gray-700 cursor-pointer transition-all hover:scale-105 active:scale-95"><Upload size={16} /> Import</label></div>
          </div>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-2 no-scrollbar">
          {['coa', 'profile', 'parties', 'recurring', 'templates', 'migration', 'danger'].map(t => (
              <button key={t} onClick={() => setActiveTab(t as Tab)} className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-all capitalize active:scale-95 ${activeTab === t ? 'bg-primary text-white shadow-lg shadow-blue-900/20' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}`}>
                  {t === 'coa' && <Book size={16}/>} 
                  {t === 'recurring' && <Repeat size={16}/>} 
                  {t === 'profile' && <Building2 size={16}/>} 
                  {t === 'parties' && <Users size={16}/>} 
                  {t === 'templates' && <LayoutGrid size={16}/>} 
                  {t === 'migration' && <ArrowRightLeft size={16}/>} 
                  {t === 'danger' && <AlertTriangle size={16}/>}
                  {t === 'templates' ? 'Shortcuts' : (t === 'coa' ? 'Chart of Accounts' : t)}
              </button>
          ))}
      </div>

      {activeTab === 'profile' && (
          <div className="max-w-2xl bg-gray-900 p-6 rounded-2xl border border-gray-800 animate-fade-in shadow-xl">
              <div className="flex justify-between items-start mb-6">
                <h3 className="text-lg font-bold text-white flex items-center gap-2"><Building2 size={20} className="text-primary"/> Business Profile</h3>
                <div className="px-3 py-1 bg-gold-900/20 text-gold-400 border border-gold-500/30 rounded-lg text-xs font-bold uppercase flex items-center gap-2">
                    <Globe size={12} /> Base Currency: {baseCurrency}
                </div>
              </div>
              <form onSubmit={handleSaveProfile} className="space-y-4">
                  <div>
                      <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Business Name</label>
                      <input className="w-full px-4 py-2 bg-gray-950 text-white border border-gray-700 rounded-lg outline-none focus:border-primary" value={bizName} onChange={e => setBizName(e.target.value)} />
                  </div>
                  <div>
                      <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Address</label>
                      <textarea className="w-full px-4 py-2 bg-gray-950 text-white border border-gray-700 rounded-lg outline-none focus:border-primary resize-none h-20" value={bizAddress} onChange={e => setBizAddress(e.target.value)} />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                      <div>
                          <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Email</label>
                          <input className="w-full px-4 py-2 bg-gray-950 text-white border border-gray-700 rounded-lg outline-none focus:border-primary" value={bizEmail} onChange={e => setBizEmail(e.target.value)} />
                      </div>
                      <div>
                          <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Phone</label>
                          <input className="w-full px-4 py-2 bg-gray-950 text-white border border-gray-700 rounded-lg outline-none focus:border-primary" value={bizPhone} onChange={e => setBizPhone(e.target.value)} />
                      </div>
                  </div>
                  <div>
                      <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Invoice Footer Note</label>
                      <input className="w-full px-4 py-2 bg-gray-950 text-white border border-gray-700 rounded-lg outline-none focus:border-primary" value={bizFooter} onChange={e => setBizFooter(e.target.value)} placeholder="e.g. Thank you for your business" />
                  </div>
                  <button className="w-full py-3 bg-primary hover:bg-blue-600 text-white rounded-lg font-bold shadow-lg shadow-blue-900/30 active:scale-95 transition-transform">Save Profile</button>
              </form>
          </div>
      )}

      {activeTab === 'migration' && (
          <div className="max-w-2xl mx-auto space-y-6 animate-fade-in">
              <div className="bg-orange-900/20 border border-orange-500/30 p-6 rounded-2xl">
                  <h3 className="text-xl font-bold text-white mb-2 flex items-center gap-2"><ArrowRightLeft size={24} className="text-orange-500" /> Transfer Country / Currency</h3>
                  <p className="text-sm text-gray-400 mb-6">
                      Use this wizard to permanently migrate your entire financial history to a new base currency. 
                      This is useful if you move countries or change your primary reporting currency.
                  </p>
                  
                  <form onSubmit={handleMigration} className="space-y-6">
                      <div className="grid grid-cols-2 gap-4">
                          <div className="p-4 bg-gray-900 rounded-xl border border-gray-800">
                              <span className="block text-xs font-bold text-gray-500 uppercase mb-1">Current Base</span>
                              <span className="text-2xl font-bold text-white">{baseCurrency}</span>
                          </div>
                          <div className="flex flex-col justify-end">
                              <label className="block text-xs font-bold text-orange-400 uppercase mb-1">Target Currency</label>
                              <select 
                                  className="w-full px-4 py-3 bg-gray-950 text-white border border-gray-700 rounded-xl outline-none focus:border-orange-500"
                                  value={migrationTarget}
                                  onChange={e => setMigrationTarget(e.target.value as CurrencyCode)}
                                  required
                              >
                                  <option value="">Select...</option>
                                  {CURRENCIES.filter(c => c.code !== baseCurrency).map(c => (
                                      <option key={c.code} value={c.code}>{c.code} - {c.name}</option>
                                  ))}
                              </select>
                          </div>
                      </div>

                      {migrationTarget && (
                          <div className="bg-gray-900 p-4 rounded-xl border border-gray-800 animate-fade-in">
                              <label className="block text-xs font-bold text-gray-400 uppercase mb-2">Conversion Rate</label>
                              <div className="flex items-center gap-3">
                                  <span className="text-white font-mono">1 {baseCurrency} = </span>
                                  <input 
                                      type="number" step="0.0001" 
                                      className="w-32 px-3 py-2 bg-gray-950 text-white border border-gray-700 rounded-lg outline-none focus:border-orange-500 font-bold"
                                      value={migrationRate}
                                      onChange={e => setMigrationRate(e.target.value)}
                                      placeholder="0.00"
                                      required
                                  />
                                  <span className="text-white font-mono">{migrationTarget}</span>
                              </div>
                              <p className="text-xs text-gray-500 mt-2">
                                  All historical transaction amounts, asset values, and budgets will be multiplied by this rate.
                              </p>
                          </div>
                      )}

                      <div className="pt-4 border-t border-orange-500/20">
                          <label className="block text-xs font-bold text-red-400 uppercase mb-1">Confirmation</label>
                          <input 
                              type="text" 
                              className="w-full px-4 py-3 bg-gray-950 text-white border border-gray-700 rounded-xl outline-none focus:border-red-500 placeholder-gray-700" 
                              value={migrationConfirm} 
                              onChange={e => setMigrationConfirm(e.target.value)} 
                              placeholder="Type 'CONFIRM' to execute"
                              required
                          />
                      </div>

                      <button className="w-full py-4 bg-orange-600 hover:bg-orange-700 text-white rounded-xl font-bold shadow-lg shadow-orange-900/20 active:scale-95 transition-transform disabled:opacity-50 disabled:cursor-not-allowed">
                          Execute Migration
                      </button>
                  </form>
              </div>
          </div>
      )}

      {activeTab === 'parties' && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 animate-fade-in">
              <div className="bg-gray-900 p-6 rounded-2xl border border-gray-800 shadow-xl">
                  <h3 className="text-lg font-bold text-white mb-4">{editingPartyId ? 'Edit Party' : 'Add Party'}</h3>
                  <form onSubmit={handleAddParty} className="space-y-4">
                      <div>
                          <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Name</label>
                          <input className="w-full px-4 py-2 bg-gray-950 text-white border border-gray-700 rounded-lg outline-none focus:border-primary" value={partyName} onChange={e => setPartyName(e.target.value)} required placeholder="Client or Vendor Name" />
                      </div>
                      <div>
                          <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Type</label>
                          <div className="relative">
                            <input 
                                list="partyTypes"
                                className="w-full px-4 py-2 bg-gray-950 text-white border border-gray-700 rounded-lg outline-none focus:border-primary placeholder-gray-600" 
                                value={partyType} 
                                onChange={e => setPartyType(e.target.value)}
                                placeholder="Select or type custom..." 
                                required
                            />
                            <datalist id="partyTypes">
                                <option value="vendor">Vendor (Supplier)</option>
                                <option value="customer">Customer (Client)</option>
                                <option value="employee">Employee</option>
                                <option value="other">Other</option>
                            </datalist>
                             <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
                                <ChevronDown size={14} className="text-gray-500" />
                             </div>
                          </div>
                      </div>
                      <div>
                          <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Phone</label>
                          <input className="w-full px-4 py-2 bg-gray-950 text-white border border-gray-700 rounded-lg outline-none focus:border-primary" value={partyPhone} onChange={e => setPartyPhone(e.target.value)} placeholder="+974..." />
                      </div>
                      <div>
                          <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Email</label>
                          <input className="w-full px-4 py-2 bg-gray-950 text-white border border-gray-700 rounded-lg outline-none focus:border-primary" value={partyEmail} onChange={e => setPartyEmail(e.target.value)} placeholder="contact@..." />
                      </div>
                      {!editingPartyId && (
                        <div className="p-3 bg-blue-900/20 border border-blue-500/30 rounded-lg text-xs text-blue-300">
                            <p>
                                New account will be created under:<br/>
                                <b>11900 - Parties (Unified AR/AP)</b>
                            </p>
                        </div>
                      )}
                      <div className="flex gap-2">
                        <button className="w-full py-3 bg-primary hover:bg-blue-600 text-white rounded-lg font-bold shadow-lg shadow-blue-900/30 active:scale-95 transition-transform">
                            {editingPartyId ? 'Update Party' : 'Create Entity'}
                        </button>
                        {editingPartyId && (
                            <button type="button" onClick={cancelEditParty} className="px-4 py-3 bg-gray-800 hover:bg-gray-700 text-white rounded-lg font-bold active:scale-95 transition-transform border border-gray-700">
                                <X size={18} />
                            </button>
                        )}
                      </div>
                  </form>
              </div>
              <div className="md:col-span-2 space-y-4">
                  <div className="flex justify-between items-center mb-2">
                        <h4 className="text-sm font-bold text-gray-400 uppercase tracking-widest">Existing Parties</h4>
                        <div className="relative w-full max-w-xs">
                            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
                            <input 
                                className="w-full pl-9 pr-4 py-2 bg-gray-900 border border-gray-700 rounded-lg text-sm text-white focus:border-primary outline-none transition-all placeholder-gray-600" 
                                placeholder="Search parties..." 
                                value={partySearch}
                                onChange={e => setPartySearch(e.target.value)}
                            />
                        </div>
                  </div>
                  <div className="space-y-4 max-h-[600px] overflow-y-auto pr-1 custom-scrollbar">
                    {filteredParties.map(party => (
                        <div key={party.id} className="bg-gray-900 border border-gray-800 p-4 rounded-xl flex items-center justify-between hover:bg-gray-800/50 hover:shadow-lg transition-all">
                            <div className="flex items-center gap-4">
                                <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-lg ${party.type === 'customer' ? 'bg-emerald-900/50 text-emerald-400' : 'bg-orange-900/50 text-orange-400'}`}>
                                    {party.name.charAt(0)}
                                </div>
                                <div>
                                    <h4 className="font-bold text-gray-200">{party.name}</h4>
                                    <div className="flex gap-2 text-xs text-gray-500 mt-1">
                                        <span className="uppercase bg-gray-800 px-1.5 py-0.5 rounded">{party.type}</span>
                                        {party.phone && <span className="flex items-center gap-1"><Phone size={10}/> {party.phone}</span>}
                                    </div>
                                </div>
                            </div>
                            <div className="flex items-center gap-2">
                                <button onClick={() => handleEditParty(party)} className="p-2 text-gray-600 hover:text-blue-400 hover:bg-gray-800 rounded-lg transition-colors active:scale-90">
                                    <Pencil size={18} />
                                </button>
                                <button onClick={() => handleDelete('PARTY', party.id)} className="p-2 text-gray-600 hover:text-red-400 hover:bg-gray-800 rounded-lg transition-colors active:scale-90">
                                    <Trash2 size={18} />
                                </button>
                            </div>
                        </div>
                    ))}
                    {filteredParties.length === 0 && (
                        <div className="text-center py-8 text-gray-600 border border-dashed border-gray-800 rounded-xl">
                            No parties found matching "{partySearch}"
                        </div>
                    )}
                  </div>
              </div>
          </div>
      )}

      {activeTab === 'recurring' && (
          <div className="space-y-4 animate-fade-in">
              {state.recurring.map(rule => {
                  const accName = state.accounts.find(a => a.id === rule.accountId)?.name;
                  return (
                      <div key={rule.id} className="bg-gray-900 border border-gray-800 p-5 rounded-xl flex flex-col md:flex-row items-center justify-between gap-4 hover:border-gray-700 hover:shadow-lg transition-all">
                          <div className="flex items-center gap-4 w-full md:w-auto">
                              <div className="p-3 bg-purple-900/20 text-purple-400 rounded-lg">
                                  <Repeat size={24} />
                              </div>
                              <div>
                                  <h4 className="font-bold text-gray-200">{rule.note || 'Untitled Recurring'}</h4>
                                  <p className="text-xs text-gray-500 mt-1">
                                      {accName} • <span className="uppercase text-purple-300">{rule.frequency}</span>
                                  </p>
                              </div>
                          </div>
                          <div className="flex items-center gap-6 w-full md:w-auto justify-between">
                              <div className="text-right">
                                  <p className="font-bold text-lg text-white">{rule.currency} {rule.amount.toLocaleString()}</p>
                                  <p className="text-xs text-gray-500">Next: {format(parseISO(rule.nextDueDate), 'MMM d, yyyy')}</p>
                              </div>
                              <button onClick={() => handleDelete('RECURRING', rule.id)} className="p-2 text-gray-500 hover:text-red-400 bg-gray-800 hover:bg-gray-700 rounded-lg active:scale-90 transition-transform">
                                  <Trash2 size={18} />
                              </button>
                          </div>
                      </div>
                  );
              })}
              {state.recurring.length === 0 && (
                  <div className="text-center py-12 bg-gray-900 rounded-xl border border-dashed border-gray-800 text-gray-500">
                      No recurring rules active. Create them by toggling "Automate" when adding a new transaction.
                  </div>
              )}
          </div>
      )}

      {activeTab === 'templates' && (
          <div className="space-y-6 animate-fade-in">
              <button 
                  onClick={() => { setEditingTemplate(null); setIsTemplateModalOpen(true); }}
                  className="w-full md:w-auto flex items-center justify-center gap-2 bg-primary hover:bg-blue-600 text-white px-6 py-3 rounded-xl font-bold shadow-lg shadow-blue-900/30 transition-all hover:scale-105 active:scale-95"
              >
                  <Plus size={18} /> Create New Shortcut
              </button>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {state.templates.map(t => (
                      <div key={t.id} className="relative group bg-gray-900 border border-gray-800 p-5 rounded-2xl hover:border-gray-600 transition-all hover:-translate-y-1 hover:shadow-lg cursor-pointer" onClick={() => { setEditingTemplate(t); setIsTemplateModalOpen(true); }}>
                          <button 
                              onClick={(e) => { e.stopPropagation(); handleDelete('TEMPLATE', t.id); }}
                              className="absolute top-2 right-2 p-1.5 text-gray-600 hover:text-red-400 hover:bg-gray-800 rounded opacity-0 group-hover:opacity-100 transition-opacity active:scale-90"
                          >
                              <Trash2 size={14} />
                          </button>
                          <div className="flex flex-col items-center text-center">
                              <span className="text-4xl mb-3 group-hover:scale-110 transition-transform">{t.icon || '⚡'}</span>
                              <h4 className="font-bold text-gray-200 text-sm">{t.name}</h4>
                              <span className="text-xs text-gray-500 mt-1">{t.currency} {t.amount?.toLocaleString() || 'Var'}</span>
                          </div>
                      </div>
                  ))}
              </div>
          </div>
      )}

      {activeTab === 'coa' && (
        <div className="space-y-6 animate-fade-in">
            <div className="bg-gray-900 rounded-2xl shadow-sm border border-gray-800 overflow-hidden">
                <div className="p-5 border-b border-gray-800 bg-gray-900 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                    <div>
                        <h3 className="font-semibold text-gray-200">Chart of Accounts</h3>
                        <p className="text-xs text-gray-500 mt-1">Hierarchical view with aggregated signed balances.</p>
                    </div>
                    <div className="relative w-full sm:w-auto">
                        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
                        <input type="text" placeholder="Search accounts..." className="w-full sm:w-64 pl-9 pr-4 py-2 bg-gray-950 border border-gray-700 rounded-lg text-sm text-white focus:border-primary outline-none transition-all" value={coaSearch} onChange={e => setCoaSearch(e.target.value)} />
                    </div>
                </div>
                
                {/* Add New Form */}
                <form onSubmit={handleAddAccount} className="p-5 border-b border-gray-800 grid grid-cols-1 md:grid-cols-7 gap-3 items-end bg-gray-800/50">
                    <div className="md:col-span-1">
                        <label className="text-[10px] uppercase text-gray-500 font-bold mb-1 block">Code</label>
                        <input className="w-full px-3 py-2 bg-gray-800 text-white border border-gray-700 rounded-lg text-sm outline-none focus:border-primary" placeholder="e.g 1100" type="number" value={newAccCode} onChange={e => setNewAccCode(e.target.value)} />
                    </div>
                    <div className="md:col-span-1">
                        <label className="text-[10px] uppercase text-gray-500 font-bold mb-1 block">Class</label>
                        <select 
                            className="w-full px-3 py-2 bg-gray-800 text-white border border-gray-700 rounded-lg text-sm outline-none focus:border-primary disabled:opacity-50" 
                            value={newAccClass} 
                            onChange={e => setNewAccClass(e.target.value as AccountClass)}
                            disabled={!!newAccParent} // Disable if inheriting from parent
                        >
                            <option value="Assets">Assets</option>
                            <option value="Liabilities">Liabilities</option>
                            <option value="Equity">Equity</option>
                            <option value="Revenue">Revenue</option>
                            <option value="Expenses">Expenses</option>
                        </select>
                    </div>
                    <div className="md:col-span-2">
                        <label className="text-[10px] uppercase text-gray-500 font-bold mb-1 block">Name</label>
                        <input className="w-full px-3 py-2 bg-gray-800 text-white border border-gray-700 rounded-lg text-sm outline-none focus:border-primary" placeholder="Account Name" value={newAccName} onChange={e => setNewAccName(e.target.value)} />
                    </div>
                    <div>
                        <label className="text-[10px] uppercase text-gray-500 font-bold mb-1 block">Level</label>
                        <select className="w-full px-3 py-2 bg-gray-800 text-white border border-gray-700 rounded-lg text-sm outline-none focus:border-primary" value={newAccLevel} onChange={e => setNewAccLevel(e.target.value as AccountLevel)}>
                            <option value="group">Group</option>
                            <option value="gl">GL Account</option>
                            <option value="sub_ledger">Sub-Ledger</option>
                        </select>
                    </div>
                    <div>
                        <label className="text-[10px] uppercase text-gray-500 font-bold mb-1 block">Parent</label>
                        <select className="w-full px-3 py-2 bg-gray-800 text-white border border-gray-700 rounded-lg text-sm outline-none focus:border-primary" value={newAccParent} onChange={e => setNewAccParent(e.target.value)}>
                            <option value="">(None / Root)</option>
                            {flatAccounts.map(a => <option key={a.id} value={a.id}>{a.code} - {a.name}</option>)}
                        </select>
                    </div>
                    <button className="bg-primary hover:bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center justify-center gap-2 transition-transform active:scale-95">
                        <Plus size={16} /> Add
                    </button>
                </form>

                {/* Tree List */}
                <div className="max-h-[600px] overflow-y-auto group">
                    {(['Assets', 'Liabilities', 'Equity', 'Revenue', 'Expenses'] as AccountClass[]).map(acClass => (
                        <div key={acClass}>
                            <div className="bg-gray-950 px-4 py-2 text-xs font-bold text-gray-500 uppercase tracking-wider border-b border-gray-800 border-t flex justify-between">
                                <span>{acClass}</span>
                            </div>
                            {renderTreeNodes(accountTree[acClass])}
                        </div>
                    ))}
                </div>
            </div>
        </div>
      )}

      {activeTab === 'danger' && <div className="p-4"><button onClick={handleReset} className="bg-red-600 hover:bg-red-700 text-white px-6 py-3 rounded-lg font-bold w-full md:w-auto active:scale-95 transition-transform">Reset All Data</button></div>}

      <Modal isOpen={isTemplateModalOpen} onClose={() => setIsTemplateModalOpen(false)} title={editingTemplate ? "Edit Shortcut" : "New Shortcut"}>
          <TransactionForm 
              mode="template" 
              initialTemplate={editingTemplate}
              onSaveTemplate={handleSaveTemplate}
              onComplete={() => {}} // Handled inside wrapper
          />
      </Modal>
    </div>
  );
};