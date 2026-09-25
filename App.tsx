
import React, { Suspense, lazy } from 'react';
import { HashRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { FinanceProvider, useFinance } from './context/FinanceContext';
import { PWAProvider } from './context/PWAContext';
import { AccessProvider, useAccess } from './context/AccessContext';
import { Layout } from './components/Layout';
import { ErrorBoundary } from './components/ErrorBoundary';
import { DialogHost } from './components/ui/ConfirmDialog';
import { RequireAdmin } from './components/RequireAdmin';

const Dashboard = lazy(() => import('./pages/Dashboard').then(m => ({ default: m.Dashboard })));
const ApAr = lazy(() => import('./pages/ApAr').then(m => ({ default: m.ApAr })));
const Assets = lazy(() => import('./pages/Assets').then(m => ({ default: m.Assets })));
const Reports = lazy(() => import('./pages/Reports').then(m => ({ default: m.Reports })));
const Settings = lazy(() => import('./pages/Settings').then(m => ({ default: m.Settings })));
const Journal = lazy(() => import('./pages/Journal').then(m => ({ default: m.Journal })));
const Budget = lazy(() => import('./pages/Budget').then(m => ({ default: m.Budget })));
const Login = lazy(() => import('./pages/Login').then(m => ({ default: m.Login })));
const CurrencyOnboarding = lazy(() => import('./components/CurrencyOnboarding').then(m => ({ default: m.CurrencyOnboarding })));
const MoneyCounter = lazy(() => import('./pages/MoneyCounter').then(m => ({ default: m.MoneyCounter })));
const Trading = lazy(() => import('./pages/Trading').then(m => ({ default: m.Trading })));
const Inventory = lazy(() => import('./pages/Inventory').then(m => ({ default: m.Inventory })));
const Invoices = lazy(() => import('./pages/Invoices').then(m => ({ default: m.Invoices })));
const Goals = lazy(() => import('./pages/Goals').then(m => ({ default: m.Goals })));
const Admin = lazy(() => import('./pages/Admin').then(m => ({ default: m.Admin })));
const OnboardingWizard = lazy(() => import('./components/OnboardingWizard').then(m => ({ default: m.OnboardingWizard })));
import { isPristineSeed, onboardingFlagKey } from './utils/onboardingFlags';

const PageLoader: React.FC = () => (
  <div className="flex items-center justify-center py-24" role="status" aria-label="Loading page">
    <div className="w-8 h-8 rounded-full border-2 border-gray-700 border-t-gold-500 animate-spin" />
  </div>
);

// Redirects to the dashboard when the current route's module is restricted for this user
const ModuleRoute: React.FC<{ routeKey: string; children: React.ReactNode }> = ({ routeKey, children }) => {
  const { isModuleEnabled } = useAccess();
  const location = useLocation();
  if (!isModuleEnabled(routeKey)) return <Navigate to="/" replace state={{ from: location.pathname }} />;
  return <>{children}</>;
};

const AppContent: React.FC = () => {
  const { user, authLoading, state, isNewUser } = useFinance();

  if (authLoading) {
      return (
          <div className="min-h-screen bg-[#12100d] flex items-center justify-center">
              <div className="animate-pulse text-gold-500 font-bold tracking-widest text-xl">LOADING TARMI...</div>
          </div>
      );
  }

  if (!user) {
    return (
      <Suspense fallback={<PageLoader />}>
        <Login onLogin={() => {}} />
      </Suspense>
    );
  }

  const showOnboarding = user
    && !!state.businessProfile.baseCurrency
    && (isNewUser || isPristineSeed(state) || localStorage.getItem('fintrack_pending_onboarding') === '1')
    && localStorage.getItem(onboardingFlagKey(user.id)) !== 'done';

  return (
      <HashRouter>
        <Suspense fallback={null}>
          <CurrencyOnboarding />
        </Suspense>
        {showOnboarding && (
          <Suspense fallback={<div className="min-h-screen bg-[#12100d]" />}>
            <OnboardingWizard onComplete={() => window.location.hash = '#/'} />
          </Suspense>
        )}
        <Layout>
          <ErrorBoundary>
            <Suspense fallback={<PageLoader />}>
              <Routes>
                <Route path="/" element={<Dashboard />} />
                <Route path="/budget" element={<ModuleRoute routeKey="/budget"><Budget /></ModuleRoute>} />
                <Route path="/apar" element={<ModuleRoute routeKey="/apar"><ApAr /></ModuleRoute>} />
                <Route path="/assets" element={<ModuleRoute routeKey="/assets"><Assets /></ModuleRoute>} />
                <Route path="/journal" element={<ModuleRoute routeKey="/journal"><Journal /></ModuleRoute>} />
                <Route path="/reports" element={<ModuleRoute routeKey="/reports"><Reports /></ModuleRoute>} />
                <Route path="/money-counter" element={<ModuleRoute routeKey="/money-counter"><MoneyCounter /></ModuleRoute>} />
                <Route path="/trading" element={<ModuleRoute routeKey="/trading"><Trading /></ModuleRoute>} />
                <Route path="/inventory" element={<ModuleRoute routeKey="/inventory"><Inventory /></ModuleRoute>} />
                <Route path="/invoices" element={<ModuleRoute routeKey="/invoices"><Invoices /></ModuleRoute>} />
                <Route path="/goals" element={<ModuleRoute routeKey="/goals"><Goals /></ModuleRoute>} />
                <Route path="/admin" element={<RequireAdmin><Admin /></RequireAdmin>} />
                <Route path="/settings" element={<Settings />} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </Suspense>
          </ErrorBoundary>
        </Layout>
      </HashRouter>
  );
};

const App: React.FC = () => {
  return (
    <PWAProvider>
      <FinanceProvider>
        <AccessProvider>
          <AppContent />
          <DialogHost />
        </AccessProvider>
      </FinanceProvider>
    </PWAProvider>
  );
};

export default App;
