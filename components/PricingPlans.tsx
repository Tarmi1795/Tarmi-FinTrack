import React from 'react';
import { Check } from 'lucide-react';

export interface PricingTier {
  id: string;            // 'solo' | 'pro' | 'business'
  name: string;
  price: number;         // QAR/month, 0 = free
  tagline: string;
  highlight?: boolean;   // 'Most popular'
  aiDailyLimit: number;  // 10 / 100 / 999999
  disabledModules: string[];  // module route keys disabled in this tier
  features: string[];    // checklist lines
}

export const PRICING_TIERS: PricingTier[] = [
  { id: 'solo', name: 'Solo', price: 0, tagline: 'Your books, in balance.', aiDailyLimit: 10,
    disabledModules: ['/trading', '/inventory', '/invoices', '/goals'],
    features: ['Double-entry ledger & journal', 'Dashboard, budgets & reports', 'AP / AR with aging', 'AI CFO — 10 questions/day', 'Local-first with cloud sync'] },
  { id: 'pro', name: 'Pro', price: 39, tagline: 'Every module, one vault.', highlight: true, aiDailyLimit: 100,
    disabledModules: [],
    features: ['Everything in Solo', 'Trading portfolio & Inventory modules', 'Invoices with ledger posting', 'Savings goals vaults', 'AI CFO — 100 questions/day', 'Receipt snap with AI extraction'] },
  { id: 'business', name: 'Business', price: 89, tagline: 'Built to hand over the keys.', aiDailyLimit: 999999,
    disabledModules: [],
    features: ['Everything in Pro', 'Unlimited AI CFO questions', 'Admin panel & module controls', 'Priority support'] },
];

const WHATSAPP_LINK = 'https://wa.me/97455855221?text=';

export const PricingPlans: React.FC<{ compact?: boolean; currentTierId?: string }> = ({ compact = false, currentTierId }) => {
  return (
    <div className={`grid grid-cols-1 md:grid-cols-3 ${compact ? 'gap-3' : 'gap-4 md:gap-5'} items-stretch`}>
      {PRICING_TIERS.map(tier => {
        const isCurrent = currentTierId === tier.id;
        const isHighlight = !!tier.highlight;
        const visibleFeatures = compact ? tier.features.slice(0, 4) : tier.features;
        const extraCount = tier.features.length - visibleFeatures.length;

        const handleCta = () => {
          if (isCurrent) return;
          window.open(
            WHATSAPP_LINK + encodeURIComponent('Hi! I want to upgrade Tarmi FinTrack to the ' + tier.name + ' plan.'),
            '_blank'
          );
        };

        return (
          <div
            key={tier.id}
            className={`relative glass-card rounded-2xl ${compact ? 'p-4' : 'p-5'} flex flex-col ${
              isHighlight
                ? 'border-gold-500/40 shadow-[0_0_35px_-12px_rgba(212,175,55,0.45)]'
                : ''
            }`}
          >
            {/* Most Popular ribbon */}
            {isHighlight && (
              <div className="absolute -top-3 left-1/2 -translate-x-1/2 z-10 px-3 py-1 rounded-full bg-gradient-to-r from-gold-300 via-gold-500 to-gold-300 text-black text-[10px] font-bold uppercase tracking-widest shadow-lg shadow-gold-500/40 whitespace-nowrap">
                Most Popular
              </div>
            )}

            {/* Header: name + current chip */}
            <div className="flex items-center justify-between gap-2">
              <span className="uppercase tracking-widest text-xs text-gold-400 font-bold">{tier.name}</span>
              {isCurrent && (
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 font-bold uppercase tracking-wider whitespace-nowrap">
                  Current plan
                </span>
              )}
            </div>

            {/* Price line */}
            <div className="mt-3 flex items-baseline gap-1.5">
              {tier.price === 0 ? (
                <span className={`font-mono font-bold ${compact ? 'text-2xl' : 'text-3xl'} text-white`}>Free</span>
              ) : (
                <>
                  <span className={`font-mono ${compact ? 'text-xs' : 'text-sm'} text-gray-400 font-bold`}>QAR</span>
                  <span className={`font-mono font-bold ${compact ? 'text-2xl' : 'text-3xl'} text-white`}>{tier.price}</span>
                  <span className={`font-mono ${compact ? 'text-[10px]' : 'text-xs'} text-gray-500`}>/mo</span>
                </>
              )}
            </div>

            {/* Tagline */}
            <p className={`text-gray-400 mt-1 ${compact ? 'text-xs' : 'text-sm'}`}>{tier.tagline}</p>

            {/* Features */}
            <ul className={`mt-4 space-y-2 flex-1 ${compact ? 'space-y-1.5' : ''}`}>
              {visibleFeatures.map(f => (
                <li key={f} className="flex items-start gap-2">
                  <Check size={compact ? 13 : 16} className="text-emerald-400 mt-0.5 shrink-0" />
                  <span className={`text-gray-300 leading-snug ${compact ? 'text-xs' : 'text-sm'}`}>{f}</span>
                </li>
              ))}
              {extraCount > 0 && (
                <li className={`text-gold-400/80 font-medium ${compact ? 'text-[11px] pl-5' : 'text-xs pl-6'}`}>
                  +{extraCount} more
                </li>
              )}
            </ul>

            {/* CTA */}
            <button
              onClick={handleCta}
              disabled={isCurrent}
              className={`mt-5 w-full py-2.5 rounded-xl text-sm font-bold transition-all active:scale-[0.98] ${
                isCurrent
                  ? 'bg-gray-800/60 border border-gray-700/50 text-gray-500 cursor-not-allowed'
                  : isHighlight
                    ? 'bg-gradient-to-b from-[#FDE68A] via-[#D4AF37] to-[#92400E] text-black shadow-lg shadow-gold-900/30 hover:shadow-gold-500/40'
                    : 'bg-gray-800 border border-gray-700 text-gray-200 hover:bg-gray-700 hover:border-gray-600'
              }`}
            >
              {isCurrent ? 'Current plan' : 'Contact to upgrade'}
            </button>
          </div>
        );
      })}
    </div>
  );
};
