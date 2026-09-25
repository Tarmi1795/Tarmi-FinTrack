// Onboarding gate helpers (kept tiny so they can be imported eagerly)

import { AppState } from '../types';

export const onboardingFlagKey = (userId: string) => `fintrack_onboarded_${userId}`;

/** True when the local data still looks exactly like the untouched seed data. */
export const isPristineSeed = (state: AppState): boolean => {
  const t = state.transactions || [];
  const p = state.parties || [];
  const r = state.receivables || [];
  const a = state.assets || [];
  return (
    t.length === 2 &&
    t.some(x => x.note === 'Monthly Salary Credit') &&
    t.some(x => x.note === 'Supermarket Run') &&
    p.length === 4 &&
    r.length === 1 &&
    a.length === 2
  );
};
