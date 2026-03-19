import React, { useState, useEffect, useRef } from 'react';
import { useFinance } from '../context/FinanceContext';
import { supabase } from '../services/supabase';
import { Denomination, CashCount } from '../types';
import { DenominationManager } from '../components/DenominationManager';
import { Calculator, Settings, RefreshCw, Save, History, ChevronRight } from 'lucide-react';
import { motion } from 'framer-motion';

export const MoneyCounter: React.FC = () => {
  const { user } = useFinance();
  const [denominations, setDenominations] = useState<Denomination[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [showManager, setShowManager] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [showConfirmClear, setShowConfirmClear] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const inputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const fetchDenominations = async () => {
    if (!user) return;
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('denominations')
        .select('*')
        .eq('user_id', user.id)
        .order('value', { ascending: false });

      if (error) throw error;

      if (data && data.length === 0) {
        // Seed default QAR denominations
        const defaults = [
          { currency_code: 'QAR', value: 500, label: '500 Riyal Bill', type: 'bill', is_active: true, user_id: user.id },
          { currency_code: 'QAR', value: 100, label: '100 Riyal Bill', type: 'bill', is_active: true, user_id: user.id },
          { currency_code: 'QAR', value: 50, label: '50 Riyal Bill', type: 'bill', is_active: true, user_id: user.id },
          { currency_code: 'QAR', value: 10, label: '10 Riyal Bill', type: 'bill', is_active: true, user_id: user.id },
          { currency_code: 'QAR', value: 5, label: '5 Riyal Bill', type: 'bill', is_active: true, user_id: user.id },
          { currency_code: 'QAR', value: 1, label: '1 Riyal Bill', type: 'bill', is_active: true, user_id: user.id },
        ];
        
        const { data: insertedData, error: insertError } = await supabase
          .from('denominations')
          .insert(defaults)
          .select();
          
        if (insertError) throw insertError;
        if (insertedData) setDenominations(insertedData as Denomination[]);
      } else {
        setDenominations(data as Denomination[]);
      }
    } catch (error) {
      console.error("Error fetching denominations:", error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchDenominations();
  }, [user]);

  const handleCountChange = (id: string, value: string) => {
    const numValue = parseInt(value, 10);
    setCounts(prev => ({
      ...prev,
      [id]: isNaN(numValue) ? 0 : Math.max(0, numValue)
    }));
  };

  const activeDenominations = denominations.filter(d => d.is_active);
  
  const totalAmount = activeDenominations.reduce((sum, d) => {
    const count = counts[d.id] || 0;
    return sum + (count * d.value);
  }, 0);

  const handleKeyDown = (e: React.KeyboardEvent, index: number) => {
    if (e.key === 'Enter' || e.key === 'NumpadEnter') {
      e.preventDefault();
      const nextIndex = index + 1;
      if (nextIndex < activeDenominations.length) {
        const nextDenomId = activeDenominations[nextIndex].id;
        inputRefs.current[nextDenomId]?.focus();
      }
    }
  };

  const handleClear = () => {
    setShowConfirmClear(true);
  };

  const confirmClear = () => {
    setCounts({});
    setShowConfirmClear(false);
  };

  const handleSave = async () => {
    if (!user || totalAmount === 0) return;
    setIsSaving(true);
    try {
      const { error } = await supabase
        .from('cash_counts')
        .insert([{
          user_id: user.id,
          total_amount: totalAmount,
          currency_code: activeDenominations[0]?.currency_code || 'QAR',
          breakdown: counts,
          notes: `Cash count on ${new Date().toLocaleString()}`
        }]);
        
      if (error) throw error;
      setToastMessage("Cash count saved successfully!");
      setTimeout(() => setToastMessage(null), 3000);
      setCounts({});
    } catch (error) {
      console.error("Error saving cash count:", error);
      setToastMessage("Failed to save cash count.");
      setTimeout(() => setToastMessage(null), 3000);
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="animate-pulse text-gold-500 font-bold tracking-widest text-xl">LOADING DENOMINATIONS...</div>
      </div>
    );
  }

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex-1 overflow-y-auto p-4 md:p-6 lg:p-8 max-w-4xl mx-auto w-full"
    >
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Calculator className="text-gold-500" /> Dynamic Money Counter
          </h1>
          <p className="text-sm text-gray-400 mt-1">Calculate physical cash totals quickly</p>
        </div>
        <button 
          onClick={() => setShowManager(true)}
          className="p-2 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-xl transition-colors"
          title="Manage Denominations"
        >
          <Settings size={20} />
        </button>
      </div>

      {/* Sticky Total Header */}
      <div className="sticky top-0 z-10 bg-gray-900/90 backdrop-blur-md border border-white/10 rounded-2xl p-6 mb-8 shadow-2xl shadow-black/50">
        <div className="text-center">
          <p className="text-sm text-gray-400 uppercase tracking-widest font-semibold mb-2">Grand Total</p>
          <div className="text-5xl font-bold text-gold-gradient font-mono tracking-tight">
            {totalAmount.toLocaleString()} <span className="text-2xl text-gold-600 ml-1">{activeDenominations[0]?.currency_code || 'QAR'}</span>
          </div>
        </div>
        
        <div className="flex gap-3 mt-6 justify-center">
          <button 
            onClick={handleClear}
            disabled={totalAmount === 0}
            className="px-6 py-2.5 bg-gray-800 hover:bg-gray-700 text-white rounded-xl text-sm font-medium transition-colors disabled:opacity-50 flex items-center gap-2"
          >
            <RefreshCw size={16} /> Clear
          </button>
          <button 
            onClick={handleSave}
            disabled={totalAmount === 0 || isSaving}
            className="px-6 py-2.5 bg-gold-600 hover:bg-gold-500 text-white rounded-xl text-sm font-medium transition-colors disabled:opacity-50 flex items-center gap-2 shadow-lg shadow-gold-500/20"
          >
            <Save size={16} /> {isSaving ? 'Saving...' : 'Save Count'}
          </button>
        </div>
      </div>

      {/* Counter Grid */}
      <div className="bg-gray-900 border border-white/10 rounded-2xl overflow-hidden shadow-xl">
        <div className="grid grid-cols-12 gap-4 p-4 border-b border-white/5 bg-gray-800/30 text-xs font-semibold text-gray-400 uppercase tracking-wider">
          <div className="col-span-5 md:col-span-4">Denomination</div>
          <div className="col-span-4 md:col-span-4 text-center">Quantity</div>
          <div className="col-span-3 md:col-span-4 text-right">Subtotal</div>
        </div>
        
        <div className="divide-y divide-white/5">
          {activeDenominations.map((d, index) => {
            const count = counts[d.id] || 0;
            const subtotal = count * d.value;
            
            return (
              <div key={d.id} className="grid grid-cols-12 gap-4 p-4 items-center hover:bg-gray-800/20 transition-colors">
                <div className="col-span-5 md:col-span-4">
                  <div className="font-medium text-white text-sm md:text-base">{d.label}</div>
                  <div className="text-xs text-gray-500 mt-0.5">{d.value} {d.currency_code}</div>
                </div>
                
                <div className="col-span-4 md:col-span-4 flex justify-center">
                  <div className="relative w-full max-w-[120px]">
                    <input
                      type="number"
                      ref={(el) => (inputRefs.current[d.id] = el)}
                      min="0"
                      value={counts[d.id] || ''}
                      onChange={(e) => handleCountChange(d.id, e.target.value)}
                      onKeyDown={(e) => handleKeyDown(e, index)}
                      className="w-full bg-gray-950 border border-white/10 rounded-xl py-2 px-3 text-center text-white font-mono focus:border-gold-500 focus:ring-1 focus:ring-gold-500 outline-none transition-all"
                      placeholder="0"
                    />
                  </div>
                </div>
                
                <div className="col-span-3 md:col-span-4 text-right">
                  <div className="font-mono font-bold text-emerald-400 text-sm md:text-base">
                    {subtotal > 0 ? subtotal.toLocaleString() : '-'}
                  </div>
                </div>
              </div>
            );
          })}
          
          {activeDenominations.length === 0 && (
            <div className="p-8 text-center text-gray-500">
              <p>No active denominations found.</p>
              <button 
                onClick={() => setShowManager(true)}
                className="mt-4 text-gold-500 hover:text-gold-400 text-sm font-medium"
              >
                Manage Denominations
              </button>
            </div>
          )}
        </div>
      </div>

      {showManager && (
        <DenominationManager 
          denominations={denominations} 
          onClose={() => setShowManager(false)} 
          onUpdate={fetchDenominations} 
        />
      )}

      {showConfirmClear && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 max-w-sm w-full shadow-2xl">
            <h3 className="text-xl font-bold text-white mb-2">Clear Counts?</h3>
            <p className="text-gray-400 mb-6">Are you sure you want to clear all current counts? This cannot be undone.</p>
            <div className="flex gap-3 justify-end">
              <button 
                onClick={() => setShowConfirmClear(false)}
                className="px-4 py-2 text-gray-400 hover:text-white transition-colors"
              >
                Cancel
              </button>
              <button 
                onClick={confirmClear}
                className="px-4 py-2 bg-red-500/10 text-red-500 hover:bg-red-500 hover:text-white rounded-xl transition-colors font-medium"
              >
                Clear All
              </button>
            </div>
          </div>
        </div>
      )}

      {toastMessage && (
        <div className="fixed bottom-4 right-4 z-50 bg-gray-800 border border-gray-700 text-white px-6 py-3 rounded-xl shadow-2xl flex items-center gap-3 animate-fade-in">
          <div className={`w-2 h-2 rounded-full ${toastMessage.includes('Failed') ? 'bg-red-500' : 'bg-emerald-500'}`} />
          {toastMessage}
        </div>
      )}
    </motion.div>
  );
};
