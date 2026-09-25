
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
    features: ['Double-entry ledger', 'Budgets & reports', 'AP / AR with aging', 'AI CFO — 10 / day', 'Cloud sync & PWA'] },
  { id: 'pro', name: 'Pro', price: 39, tagline: 'Every module, one vault.', highlight: true, aiDailyLimit: 100,
    disabledModules: [],
    features: ['Everything in Solo', 'Trading & Inventory', 'Invoices → ledger', 'Goals vaults', 'AI CFO — 100 / day', 'AI receipt capture'] },
  { id: 'business', name: 'Business', price: 89, tagline: 'Built to hand over the keys.', aiDailyLimit: 999999,
    disabledModules: [],
    features: ['Everything in Pro', 'Unlimited AI CFO', 'Admin panel & controls', 'Priority support'] },
];

const WHATSAPP_LINK = 'https://wa.me/97455855221?text=';

export const PricingPlans: React.FC<{ compact?: boolean; currentTierId?: string }> = ({ compact = false, currentTierId }) => {
  return (
    <div>
      {/* Supporting line — kept quiet, one row, only in the spacious (non-compact) layout */}
      {!compact && (
        <div className="flex items-center justify-between gap-4 mb-6">
          <p className="text-sm text-gray-500">
            Start free. Upgrade when your books outgrow the basics.
          </p>
          <p className="hidden sm:block text-[11px] text-gray-600 whitespace-nowrap">
            Prices in QAR · billed monthly
          </p>
        </div>
      )}

      <div className={`grid grid-cols-1 md:grid-cols-3 ${compact ? 'gap-3' : 'gap-5'} items-stretch`}>
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
              className={`relative flex flex-col rounded-2xl ${
                compact ? 'p-4' : 'p-6 md:p-7'
              } ${
                isHighlight
                  ? 'bg-gray-900 border border-gold-500/40 shadow-[0_16px_40px_-16px_rgba(212,175,55,0.35)]'
                  : 'bg-gray-900/50 border border-gray-800/80'
              }`}
            >
              {/* Quiet gold accent for the highlighted tier — a top hairline, not a ribbon */}
              {isHighlight && !compact && (
                <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-gold-400 to-transparent rounded-t-2xl" />
              )}

              {/* Tier name + popular badge on one line */}
              <div className="flex items-center gap-2.5">
                <span className="uppercase tracking-widest text-xs text-gold-400 font-bold">{tier.name}</span>
                {isHighlight && (
                  <span className="text-[9px] px-2 py-0.5 rounded-full bg-gold-500/15 text-gold-300 border border-gold-500/30 font-bold uppercase tracking-widest whitespace-nowrap">
                    Most popular
                  </span>
                )}
                {isCurrent && (
                  <span className="text-[9px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 font-bold uppercase tracking-widest whitespace-nowrap ml-auto">
                    Current
                  </span>
                )}
              </div>

              {/* Price block — the dominant element */}
              <div className="mt-5 flex items-baseline gap-1.5">
                {tier.price === 0 ? (
                  <span className={`font-mono font-bold tracking-tight ${compact ? 'text-2xl' : 'text-4xl'} text-white`}>Free</span>
                ) : (
                  <>
                    <span className={`font-mono font-bold ${compact ? 'text-[11px]' : 'text-sm'} text-gray-500`}>QAR</span>
                    <span className={`font-mono font-bold tracking-tight ${compact ? 'text-2xl' : 'text-4xl'} text-white`}>{tier.price}</span>
                    <span className={`font-mono ${compact ? 'text-[10px]' : 'text-xs'} text-gray-500`}>/mo</span>
                  </>
                )}
              </div>
              <p className={`text-gray-500 mt-1.5 ${compact ? 'text-xs' : 'text-sm'}`}>{tier.tagline}</p>

              {/* Divider separates pricing from benefits */}
              {!compact && <div className="my-5 border-t border-gray-800/80" />}
              {compact && <div className="my-3 border-t border-gray-800/60" />}

              {/* Benefits */}
              <ul className={`space-y-2.5 flex-1 ${compact ? 'space-y-1.5' : ''}`}>
                {visibleFeatures.map(f => (
                  <li key={f} className="flex items-start gap-2.5">
                    <Check size={compact ? 13 : 15} className="text-emerald-400 mt-0.5 shrink-0" strokeWidth={2.5} />
                    <span className={`text-gray-300 leading-snug ${compact ? 'text-xs' : 'text-sm'}`}>{f}</span>
                  </li>
                ))}
                {extraCount > 0 && (
                  <li className={`text-gold-400/80 font-medium ${compact ? 'text-[11px] pl-5' : 'text-xs pl-6'}`}>
                    +{extraCount} more
                  </li>
                )}
              </ul>

              {/* CTA — pinned to the bottom, full width */}
              <button
                onClick={handleCta}
                disabled={isCurrent}
                className={`mt-6 w-full py-3 rounded-xl text-sm font-bold transition-all active:scale-[0.98] ${
                  isCurrent
                    ? 'bg-transparent border border-gray-700/60 text-gray-500 cursor-not-allowed'
                    : isHighlight
                      ? 'bg-gradient-to-b from-[#FDE68A] via-[#D4AF37] to-[#A08020] text-black shadow-lg shadow-gold-900/30 hover:shadow-gold-500/40 hover:brightness-110'
                      : 'bg-gray-800/80 border border-gray-700 text-gray-200 hover:bg-gray-700 hover:border-gray-600'
                }`}
              >
                {isCurrent ? 'Current plan' : 'Contact to upgrade'}
              </button>
            </div>
          );
        })}
      </div>

      {/* Footnote */}
      {!compact && (
        <p className="mt-6 text-center text-[11px] text-gray-600">
          Questions first? Message us on WhatsApp — we usually reply within the hour.
        </p>
      )}
    </div>
  );
};
