
import React, { useMemo, useState } from 'react';
import { useFinance } from '../context/FinanceContext';
import { aiService } from '../services/ai';
import { buildPresetAccounts, PROFILE_TYPES, ProfileType, OnboardingAnswers } from '../utils/coaPresets';
import { Account, AppState } from '../types';
import { DEFAULT_ACCOUNTS } from '../constants';
import { onboardingFlagKey } from '../utils/onboardingFlags';
import { format } from 'date-fns';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Check, ChevronLeft, ChevronRight, Wallet, TrendingUp, TrendingDown, Wand2,
  Boxes, HandCoins, Store, UtensilsCrossed, Factory, HardHat, Briefcase, Loader2, ListTree
} from 'lucide-react';


const TYPE_ICONS: Record<ProfileType, React.ElementType> = {
  personal: Wallet,
  side_hustle: Briefcase,
  retail: Store,
  restaurant: UtensilsCrossed,
  manufacturing: Factory,
  construction: HardHat,
  consulting: HandCoins,
};

const INCOME_OPTIONS = [
  { id: 'salary', label: 'Salary / day job' },
  { id: 'freelance', label: 'Freelance / gigs' },
  { id: 'sales', label: 'Product or channel sales' },
  { id: 'rental', label: 'Rental property / equipment' },
  { id: 'other', label: 'Other income' },
];

const EXPENSE_OPTIONS = [
  { id: 'rent', label: 'Rent' },
  { id: 'utilities', label: 'Utilities' },
  { id: 'transport', label: 'Transport & fuel' },
  { id: 'food', label: 'Food & groceries' },
  { id: 'payroll', label: 'Payroll / staff' },
  { key: 'marketing', label: 'Marketing' } as any,
  { id: 'software', label: 'Software & subscriptions' },
  { id: 'insurance', label: 'Insurance' },
  { id: 'professional', label: 'Professional fees' },
  { id: 'bank', label: 'Bank charges' },
  { id: 'vat', label: 'VAT / tax tracking' },
];

type Step = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7; // 0-5 questions, 6 generating, 7 preview

export const OnboardingWizard: React.FC<{ onComplete: () => void }> = ({ onComplete }) => {
  const { user, state, dispatch } = useFinance();
  const [step, setStep] = useState<Step>(0);
  const [answers, setAnswers] = useState<OnboardingAnswers>({
    profileType: 'personal',
    incomeSources: [],
    expenseAreas: [],
    sells: 'services',
    creditCustomers: false,
    creditSuppliers: false,
    cashAccounts: ['bank', 'cash'],
  });
  const [generated, setGenerated] = useState<Account[] | null>(null);
  const [usedAi, setUsedAi] = useState(false);
  const [genError, setGenError] = useState<string | null>(null);

  const toggleMulti = (field: 'incomeSources' | 'expenseAreas' | 'cashAccounts', id: string) => {
    setAnswers(a => ({
      ...a,
      [field]: a[field].includes(id) ? a[field].filter(x => x !== id) : [...a[field], id],
    }));
  };

  const canProceed = useMemo(() => {
    switch (step) {
      case 0: return !!answers.profileType;
      case 1: return answers.incomeSources.length > 0;
      case 2: return answers.expenseAreas.length > 0;
      case 3: return !!answers.sells;
      case 4: return true; // credit questions optional
      case 5: return answers.cashAccounts.length > 0;
      default: return true;
    }
  }, [step, answers]);

  const generate = async () => {
    setStep(6);
    setGenError(null);
    let accounts: Account[] | null = null;
    try {
      accounts = await aiService.generateChartOfAccounts(answers);
    } catch (e: any) {
      console.warn('COA AI generation failed, using preset:', e?.message);
    }
    if (accounts && accounts.length >= 10) {
      setGenerated(accounts);
      setUsedAi(true);
    } else {
      setGenerated(buildPresetAccounts(answers));
      setUsedAi(false);
      if (accounts === null) setGenError('AI designer unavailable — applied the built-in template instead.');
    }
    setStep(7);
  };

  const finishWith = (accounts: Account[]) => {
    const clean: AppState = {
      ...state,
      accounts,
      transactions: [],
      parties: [],
      receivables: [],
      templates: [],
      recurring: [],
      assets: [],
      monthlyBudgets: [],
      lastUpdated: new Date().toISOString(),
    };
    dispatch({ type: 'SET_STATE', payload: clean });
    if (user) localStorage.setItem(onboardingFlagKey(user.id), 'done');
    localStorage.removeItem('fintrack_pending_onboarding');
    onComplete();
  };

  const applyAndFinish = () => {
    if (!generated) return;
    finishWith(generated);
  };

  // "Skip" completes onboarding with the standard chart of accounts
  const skipToStandard = () => {
    finishWith(DEFAULT_ACCOUNTS.map(a => ({ ...a })));
  };

  const grouped = useMemo(() => {
    const g: Record<string, Account[]> = { Assets: [], Liabilities: [], Equity: [], Revenue: [], Expenses: [] };
    (generated || []).forEach(a => g[a.class]?.push(a));
    return g;
  }, [generated]);

  const questionCount = 6;
  const progress = step <= 5 ? ((step + 1) / questionCount) * 100 : step === 6 ? 100 : 100;

  const OptionCard: React.FC<{ active: boolean; onClick: () => void; icon?: React.ReactNode; title: string; hint?: string; multi?: boolean }> =
    ({ active, onClick, icon, title, hint, multi }) => (
      <button
        onClick={onClick}
        className={`text-left p-4 rounded-xl border transition-all active:scale-[0.98] ${
          active ? 'border-gold-500/60 bg-gold-500/10 shadow-lg shadow-gold-500/10' : 'border-gray-800 bg-gray-900/50 hover:border-gray-700'
        }`}
      >
        <div className="flex items-center gap-2.5">
          {icon}
          <span className={`font-bold text-sm ${active ? 'text-gold-300' : 'text-gray-200'}`}>{title}</span>
          {multi && active && <Check size={14} className="text-gold-400 ml-auto" />}
        </div>
        {hint && <p className="text-xs text-gray-500 mt-1.5">{hint}</p>}
      </button>
    );

  return (
    <div className="fixed inset-0 z-[60] bg-[#12100d] overflow-y-auto">
      <div className="max-w-2xl mx-auto px-4 py-8 md:py-12">
        {/* Header */}
        <div className="flex items-center gap-3 mb-2">
          <div className="p-2 bg-gold-500/10 rounded-xl"><ListTree className="text-gold-500" size={20} /></div>
          <div>
            <h1 className="text-xl md:text-2xl font-bold text-white">Let's set up your books</h1>
            <p className="text-xs text-gray-500">A few questions — then a tailored chart of accounts is built for you</p>
          </div>
        </div>
        {/* Progress */}
        <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden my-5">
          <div className="h-full bg-gradient-to-r from-gold-500 to-amber-400 transition-all duration-500" style={{ width: `${progress}%` }} />
        </div>

        <AnimatePresence mode="wait">
          <motion.div
            key={step}
            initial={{ opacity: 0, x: 24 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -24 }}
            transition={{ duration: 0.25 }}
          >
            {/* Q1 — profile type */}
            {step === 0 && (
              <div>
                <h2 className="text-lg font-bold text-white mb-1">How will you use Tarmi?</h2>
                <p className="text-sm text-gray-500 mb-4">This shapes your whole chart of accounts.</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {PROFILE_TYPES.map(t => {
                    const Icon = TYPE_ICONS[t.id];
                    return (
                      <OptionCard
                        key={t.id}
                        active={answers.profileType === t.id}
                        onClick={() => setAnswers(a => ({ ...a, profileType: t.id }))}
                        icon={<Icon size={17} className={answers.profileType === t.id ? 'text-gold-400' : 'text-gray-500'} />}
                        title={t.label}
                        hint={t.hint}
                      />
                    );
                  })}
                </div>
              </div>
            )}

            {/* Q2 — income */}
            {step === 1 && (
              <div>
                <h2 className="text-lg font-bold text-white mb-1">Where will money come in from?</h2>
                <p className="text-sm text-gray-500 mb-4">Pick all that apply — each becomes an income account.</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {INCOME_OPTIONS.map(o => (
                    <OptionCard
                      key={o.id}
                      multi
                      active={answers.incomeSources.includes(o.id)}
                      onClick={() => toggleMulti('incomeSources', o.id)}
                      icon={<TrendingUp size={16} className={answers.incomeSources.includes(o.id) ? 'text-emerald-400' : 'text-gray-500'} />}
                      title={o.label}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Q3 — expenses */}
            {step === 2 && (
              <div>
                <h2 className="text-lg font-bold text-white mb-1">What will you spend on?</h2>
                <p className="text-sm text-gray-500 mb-4">Each pick becomes a dedicated expense account.</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {EXPENSE_OPTIONS.map(o => (
                    <OptionCard
                      key={o.id}
                      multi
                      active={answers.expenseAreas.includes(o.id)}
                      onClick={() => toggleMulti('expenseAreas', o.id)}
                      icon={<TrendingDown size={16} className={answers.expenseAreas.includes(o.id) ? 'text-red-400' : 'text-gray-500'} />}
                      title={o.label}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Q4 — products/services */}
            {step === 3 && (
              <div>
                <h2 className="text-lg font-bold text-white mb-1">Do you sell products or services?</h2>
                <p className="text-sm text-gray-500 mb-4">Product sellers get inventory and cost-of-goods accounts.</p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  <OptionCard active={answers.sells === 'products'} onClick={() => setAnswers(a => ({ ...a, sells: 'products' }))}
                    icon={<Boxes size={16} className={answers.sells === 'products' ? 'text-gold-400' : 'text-gray-500'} />} title="Products" hint="I buy/make stock to sell" />
                  <OptionCard active={answers.sells === 'services'} onClick={() => setAnswers(a => ({ ...a, sells: 'services' }))}
                    icon={<Briefcase size={16} className={answers.sells === 'services' ? 'text-gold-400' : 'text-gray-500'} />} title="Services" hint="I sell time and skills" />
                  <OptionCard active={answers.sells === 'both'} onClick={() => setAnswers(a => ({ ...a, sells: 'both' }))}
                    icon={<Store size={16} className={answers.sells === 'both' ? 'text-gold-400' : 'text-gray-500'} />} title="Both" hint="Products plus services" />
                </div>
              </div>
            )}

            {/* Q5 — credit */}
            {step === 4 && (
              <div>
                <h2 className="text-lg font-bold text-white mb-1">Do you buy or sell on credit?</h2>
                <p className="text-sm text-gray-500 mb-4">Adds receivable/payable tracking for invoices and bills.</p>
                <div className="space-y-2.5">
                  <OptionCard
                    multi
                    active={answers.creditCustomers}
                    onClick={() => setAnswers(a => ({ ...a, creditCustomers: !a.creditCustomers }))}
                    icon={<HandCoins size={16} className={answers.creditCustomers ? 'text-emerald-400' : 'text-gray-500'} />}
                    title="Customers pay me later (invoices)"
                    hint="Adds Accounts Receivable tracking"
                  />
                  <OptionCard
                    multi
                    active={answers.creditSuppliers}
                    onClick={() => setAnswers(a => ({ ...a, creditSuppliers: !a.creditSuppliers }))}
                    icon={<HandCoins size={16} className={answers.creditSuppliers ? 'text-orange-400' : 'text-gray-500'} />}
                    title="I pay my suppliers later (bills)"
                    hint="Adds Accounts Payable tracking"
                  />
                </div>
              </div>
            )}

            {/* Q6 — cash accounts */}
            {step === 5 && (
              <div>
                <h2 className="text-lg font-bold text-white mb-1">Where do you keep money?</h2>
                <p className="text-sm text-gray-500 mb-4">These become your cash accounts — pick at least one.</p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  <OptionCard multi active={answers.cashAccounts.includes('bank')} onClick={() => toggleMulti('cashAccounts', 'bank')}
                    icon={<Wallet size={16} className={answers.cashAccounts.includes('bank') ? 'text-gold-400' : 'text-gray-500'} />} title="Bank account" />
                  <OptionCard multi active={answers.cashAccounts.includes('cash')} onClick={() => toggleMulti('cashAccounts', 'cash')}
                    icon={<Wallet size={16} className={answers.cashAccounts.includes('cash') ? 'text-gold-400' : 'text-gray-500'} />} title="Cash on hand" />
                  <OptionCard multi active={answers.cashAccounts.includes('wallet')} onClick={() => toggleMulti('cashAccounts', 'wallet')}
                    icon={<Wallet size={16} className={answers.cashAccounts.includes('wallet') ? 'text-gold-400' : 'text-gray-500'} />} title="Digital wallet" />
                </div>
              </div>
            )}

            {/* Generating */}
            {step === 6 && (
              <div className="py-16 text-center">
                <Loader2 size={40} className="mx-auto text-gold-500 animate-spin mb-4" />
                <h2 className="text-lg font-bold text-white">Designing your chart of accounts…</h2>
                <p className="text-sm text-gray-500 mt-1">AI_riane is building accounts around your answers</p>
              </div>
            )}

            {/* Preview */}
            {step === 7 && generated && (
              <div>
                <div className="flex items-center gap-2.5 mb-1">
                  <ListTree className="text-gold-500" size={20} />
                  <h2 className="text-lg font-bold text-white">Your chart of accounts is ready</h2>
                </div>
                <p className="text-sm text-gray-500 mb-4">
                  {usedAi ? 'Designed by AI_riane from your answers' : 'Built from your answers'} — {generated.length} accounts, each with a plain-language description.
                  You can rename or add accounts anytime in Settings.
                </p>
                {genError && (
                  <div className="mb-3 text-xs text-amber-300 bg-amber-500/10 border border-amber-500/30 rounded-lg p-2.5">{genError}</div>
                )}
                <div className="space-y-4 max-h-[46vh] overflow-y-auto pr-1 custom-scrollbar">
                  {(['Assets', 'Liabilities', 'Equity', 'Revenue', 'Expenses'] as const).map(cls =>
                    grouped[cls].length > 0 && (
                      <div key={cls}>
                        <p className="text-[10px] font-bold uppercase tracking-widest text-gold-400/80 mb-1.5">{cls}</p>
                        <div className="space-y-1.5">
                          {grouped[cls].map(a => (
                            <div key={a.id} className="bg-gray-900/60 border border-gray-800 rounded-lg px-3 py-2">
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-sm font-medium text-gray-200">{a.name}</span>
                                <span className="font-mono text-[10px] text-gray-600">{a.code}</span>
                              </div>
                              {a.description && <p className="text-[11px] text-gray-500 mt-0.5">{a.description}</p>}
                            </div>
                          ))}
                        </div>
                      </div>
                    )
                  )}
                </div>
              </div>
            )}
          </motion.div>
        </AnimatePresence>

        {/* Footer controls */}
        <div className="flex items-center justify-between gap-3 mt-8">
          <button
            onClick={() => setStep(s => (Math.max(0, s - 1)) as Step)}
            disabled={step === 0 || step === 6}
            className="flex items-center gap-1.5 px-4 py-2.5 bg-gray-900 border border-gray-800 rounded-xl text-sm font-medium text-gray-400 hover:text-white transition-colors disabled:opacity-30"
          >
            <ChevronLeft size={16} /> Back
          </button>

          {step === 0 && (
            <button onClick={skipToStandard} className="text-xs text-gray-600 hover:text-gray-400 transition-colors">
              Skip — use the standard chart of accounts
            </button>
          )}

          {step < 5 && (
            <button
              onClick={() => setStep(s => (Math.min(5, s + 1)) as Step)}
              disabled={!canProceed}
              className="flex items-center gap-1.5 px-5 py-2.5 bg-gradient-to-r from-gold-500 to-amber-400 text-black font-bold rounded-xl text-sm active:scale-95 transition-transform disabled:opacity-40"
            >
              Next <ChevronRight size={16} />
            </button>
          )}
          {step === 5 && (
            <button
              onClick={generate}
              disabled={!canProceed}
              className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-gold-500 to-amber-400 text-black font-bold rounded-xl text-sm active:scale-95 transition-transform disabled:opacity-40"
            >
              <Wand2 size={16} /> Build my chart of accounts
            </button>
          )}
          {step === 7 && (
            <button
              onClick={applyAndFinish}
              className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-gold-500 to-amber-400 text-black font-bold rounded-xl text-sm active:scale-95 transition-transform"
            >
              <Check size={16} /> Start using Tarmi
            </button>
          )}
        </div>

        <p className="text-center text-[10px] text-gray-600 mt-6">
          Skipping keeps the standard accounts — demo entries are cleared either way once you start.{user ? '' : ''}
          {' '}Today is {format(new Date(), 'MMMM yyyy')}.
        </p>
      </div>
    </div>
  );
};
