
import React from 'react';
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import { FinanceProvider, useFinance } from './context/FinanceContext';
import { PWAProvider } from './context/PWAContext';
import { Layout } from './components/Layout';
import { Dashboard } from './pages/Dashboard';
import { ApAr } from './pages/ApAr';
import { Assets } from './pages/Assets';
import { Reports } from './pages/Reports';
import { Settings } from './pages/Settings';
import { Journal } from './pages/Journal';
import { Budget } from './pages/Budget';
import { Login } from './pages/Login';
import { CurrencyOnboarding } from './components/CurrencyOnboarding';

const AppContent: React.FC = () => {
  const { user, authLoading } = useFinance();

  if (authLoading) {
      return (
          <div className="min-h-screen bg-[#0B0F19] flex items-center justify-center">
              <div className="animate-pulse text-gold-500 font-bold tracking-widest text-xl">LOADING TARMI...</div>
          </div>
      );
  }

  if (!user) {
    return <Login onLogin={() => {}} />;
  }

  return (
      <HashRouter>
        <CurrencyOnboarding />
        <Layout>
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/budget" element={<Budget />} />
            <Route path="/apar" element={<ApAr />} />
            <Route path="/assets" element={<Assets />} />
            <Route path="/journal" element={<Journal />} />
            <Route path="/reports" element={<Reports />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Layout>
      </HashRouter>
  );
};

const App: React.FC = () => {
  return (
    <PWAProvider>
      <FinanceProvider>
        <AppContent />
      </FinanceProvider>
    </PWAProvider>
  );
};

export default App;
