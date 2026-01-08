
import React, { useState } from 'react';
import { useFinance } from '../context/FinanceContext';
import { CURRENCIES } from '../constants';
import { CurrencyCode } from '../types';
import { Globe, ArrowRight, Check } from 'lucide-react';

export const CurrencyOnboarding: React.FC = () => {
  const { state, dispatch } = useFinance();
  const [selected, setSelected] = useState<CurrencyCode | null>(null);

  // If baseCurrency is already set, don't show this component
  if (state.businessProfile.baseCurrency) return null;

  const handleConfirm = () => {
    if (!selected) return;
    dispatch({ 
        type: 'UPDATE_BUSINESS_PROFILE', 
        payload: { ...state.businessProfile, baseCurrency: selected } 
    });
  };

  return (
    <div className="fixed inset-0 z-[100] bg-[#050505] flex items-center justify-center p-4">
      {/* Background Ambience */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-gold-900/10 via-[#050505] to-[#050505] pointer-events-none" />
      
      <div className="relative w-full max-w-2xl bg-gray-900/50 backdrop-blur-xl border border-gray-800 rounded-3xl overflow-hidden shadow-2xl flex flex-col md:flex-row animate-fade-in">
        
        {/* Left Side: Visual */}
        <div className="w-full md:w-1/3 bg-gray-950 p-8 flex flex-col justify-between border-b md:border-b-0 md:border-r border-gray-800">
            <div>
                <div className="w-12 h-12 bg-gold-500/10 rounded-xl flex items-center justify-center mb-6">
                    <Globe size={24} className="text-gold-500" />
                </div>
                <h2 className="text-2xl font-bold text-white mb-2">Select Currency</h2>
                <p className="text-sm text-gray-400 leading-relaxed">
                    Choose your primary reporting currency. This will be the base for all your financial reports and dashboards.
                </p>
            </div>
            <div className="mt-8">
                <div className="text-[10px] text-gray-600 uppercase tracking-widest font-bold mb-2">Supported Regions</div>
                <div className="flex flex-wrap gap-2 opacity-50">
                    <span className="text-xs text-gray-400">USA</span>
                    <span className="text-xs text-gray-400">Europe</span>
                    <span className="text-xs text-gray-400">GCC</span>
                    <span className="text-xs text-gray-400">Asia</span>
                </div>
            </div>
        </div>

        {/* Right Side: Selection */}
        <div className="flex-1 p-6 md:p-8 flex flex-col">
            <div className="flex-1 overflow-y-auto max-h-[400px] grid grid-cols-2 gap-3 pr-2 custom-scrollbar">
                {CURRENCIES.map(curr => (
                    <button
                        key={curr.code}
                        onClick={() => setSelected(curr.code)}
                        className={`group p-4 rounded-xl border text-left transition-all duration-300 relative overflow-hidden ${
                            selected === curr.code 
                                ? 'bg-gold-500/10 border-gold-500 shadow-[0_0_20px_rgba(212,175,55,0.1)]' 
                                : 'bg-gray-800/30 border-gray-700/50 hover:bg-gray-800 hover:border-gray-600'
                        }`}
                    >
                        <div className="flex justify-between items-start mb-1">
                            <span className={`text-lg font-bold ${selected === curr.code ? 'text-gold-400' : 'text-white'}`}>
                                {curr.code}
                            </span>
                            <span className={`text-lg ${selected === curr.code ? 'text-gold-500' : 'text-gray-600'}`}>
                                {curr.symbol}
                            </span>
                        </div>
                        <span className="text-xs text-gray-500 group-hover:text-gray-400">{curr.name}</span>
                        
                        {selected === curr.code && (
                            <div className="absolute top-2 right-2 w-4 h-4 bg-gold-500 rounded-full flex items-center justify-center">
                                <Check size={10} className="text-black" />
                            </div>
                        )}
                    </button>
                ))}
            </div>

            <div className="pt-6 mt-4 border-t border-gray-800">
                <button
                    onClick={handleConfirm}
                    disabled={!selected}
                    className="w-full py-4 bg-gradient-to-r from-gold-600 to-amber-600 hover:from-gold-500 hover:to-amber-500 text-black font-bold rounded-xl transition-all shadow-lg shadow-gold-900/20 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 group"
                >
                    Confirm Selection <ArrowRight size={18} className="group-hover:translate-x-1 transition-transform"/>
                </button>
            </div>
        </div>
      </div>
    </div>
  );
};
