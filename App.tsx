
import React, { Suspense, lazy } from 'react';
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import { FinanceProvider, useFinance } from './context/FinanceContext';
import { PWAProvider } from './context/PWAContext';
import { Layout } from './components/Layout';
import { ErrorBoundary } from './components/ErrorBoundary';
import { DialogHost } from './components/ui/ConfirmDialog';

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

const PageLoader: React.FC = () => (
  <div className="flex items-center justify-center py-24" role="status" aria-label="Loading page">
    <div className="w-8 h-8 rounded-full border-2 border-gray-700 border-t-gold-500 animate-spin" />
  </div>
);

const AppContent: React.FC = () => {
  const { user, authLoading } = useFinance();

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

  return (
      <HashRouter>
        <Suspense fallback={null}>
          <CurrencyOnboarding />
        </Suspense>
        <Layout>
          <ErrorBoundary>
            <Suspense fallback={<PageLoader />}>
              <Routes>
                <Route path="/" element={<Dashboard />} />
                <Route path="/budget" element={<Budget />} />
                <Route path="/apar" element={<ApAr />} />
                <Route path="/assets" element={<Assets />} />
                <Route path="/journal" element={<Journal />} />
                <Route path="/reports" element={<Reports />} />
                <Route path="/money-counter" element={<MoneyCounter />} />
                <Route path="/trading" element={<Trading />} />
                <Route path="/inventory" element={<Inventory />} />
                <Route path="/invoices" element={<Invoices />} />
                <Route path="/goals" element={<Goals />} />
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
        <AppContent />
        <DialogHost />
      </FinanceProvider>
    </PWAProvider>
  );
};

export default App;
