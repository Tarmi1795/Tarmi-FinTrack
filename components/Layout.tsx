
import React, { useState, useEffect } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, Plus, PieChart, Settings as SettingsIcon, ArrowRightLeft, Monitor,
  BookOpen, LogOut, Target, Calculator, CandlestickChart, Package, Menu, X,
} from 'lucide-react';
import { Modal } from './ui/Modal';
import { TransactionForm } from './TransactionForm';
import { Logo } from './ui/Logo';
import { AIChat } from './AIChat';
import { InstallPWA } from './InstallPWA';
import { useFinance } from '../context/FinanceContext';

interface LayoutProps {
  children: React.ReactNode;
}

export const Layout: React.FC<LayoutProps> = ({ children }) => {
  const { authMethods } = useFinance();
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isMoreOpen, setIsMoreOpen] = useState(false);
  const navigate = useNavigate();

  const handleLogout = async () => {
      try {
          await authMethods.logout();
      } catch (e) {
          console.error("Logout failed:", e);
      }
  };

  // Global Keyboard Shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
        // 1. Global Search (Ctrl + F or Cmd + F)
        if ((e.ctrlKey || e.metaKey) && (e.key === 'f' || e.key === 'F')) {
            e.preventDefault();
            navigate('/journal', { state: { focusSearch: true } });
            return;
        }

        // 2. Quick Add (NumpadAdd or +)
        // Ensure we are not inside an input field
        const activeTag = document.activeElement?.tagName.toLowerCase();
        const isInputActive = activeTag === 'input' || activeTag === 'textarea';

        if (!isInputActive) {
            if (e.code === 'NumpadAdd' || e.key === '+') {
                e.preventDefault();
                if (!isAddModalOpen) {
                    setIsAddModalOpen(true);
                }
            }
        }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isAddModalOpen, navigate]);

  // Desktop sidebar navigation (all destinations)
  const navItems = [
    { icon: LayoutDashboard, label: 'Dashboard', to: '/' },
    { icon: Target, label: 'Budget', to: '/budget' },
    { icon: ArrowRightLeft, label: 'AP / AR', to: '/apar' },
    { icon: Monitor, label: 'Assets', to: '/assets' },
    { icon: BookOpen, label: 'Journal', to: '/journal' },
    { icon: PieChart, label: 'Reports', to: '/reports' },
    { icon: Calculator, label: 'Money Counter', to: '/money-counter' },
    { icon: CandlestickChart, label: 'Trading', to: '/trading' },
    { icon: Package, label: 'Inventory', to: '/inventory' },
    { icon: SettingsIcon, label: 'Settings', to: '/settings' },
  ];

  // Mobile bottom tab bar: 4 destinations + center Quick Add
  const bottomNavItems = [
    { icon: LayoutDashboard, label: 'Home', to: '/' },
    { icon: BookOpen, label: 'Journal', to: '/journal' },
    { icon: PieChart, label: 'Reports', to: '/reports' },
  ];

  // Secondary destinations shown in the mobile "More" sheet
  const moreNavItems = [
    { icon: Target, label: 'Budget', to: '/budget' },
    { icon: ArrowRightLeft, label: 'AP / AR', to: '/apar' },
    { icon: Monitor, label: 'Assets', to: '/assets' },
    { icon: CandlestickChart, label: 'Trading', to: '/trading' },
    { icon: Package, label: 'Inventory', to: '/inventory' },
    { icon: Calculator, label: 'Money Counter', to: '/money-counter' },
    { icon: SettingsIcon, label: 'Settings', to: '/settings' },
  ];

  const goFromMore = (to: string) => {
    setIsMoreOpen(false);
    navigate(to);
  };

  return (
    <div className="min-h-screen text-gray-100 flex flex-col md:flex-row bg-transparent">
      {/* Mobile Header - slim brand bar */}
      <header
        className="md:hidden fixed top-0 left-0 right-0 glass-panel z-30 px-4 flex items-center justify-between border-b border-gray-800"
        style={{
          paddingTop: 'env(safe-area-inset-top)',
          height: 'calc(3.5rem + env(safe-area-inset-top))'
        }}
      >
        <div className="flex items-center gap-2.5">
          <Logo className="w-7 h-7" showText={false} />
          <span className="font-bold text-base tracking-tight text-white">Tarmi <span className="text-gold-500">Pro</span></span>
        </div>
        <button
          onClick={() => setIsMoreOpen(true)}
          aria-label="More navigation"
          className="p-2.5 -mr-2 text-gray-400 hover:text-white rounded-lg active:bg-gray-800 transition-colors"
        >
          <Menu size={20} />
        </button>
      </header>

      {/* Sidebar (desktop) */}
      <aside className={`
        hidden md:flex flex-col w-64 glass-panel border-r border-gray-800 fixed h-full z-50 top-0 left-0 shadow-2xl bg-gray-950/95 backdrop-blur-xl
      `}>
        <div className="p-6 sidebar-safe-top relative overflow-hidden group flex justify-between items-start">
          <div className="relative z-10 transition-transform duration-300 group-hover:scale-105">
            <Logo className="w-10 h-10" />
            <div className="mt-4 flex gap-2 text-[10px] text-gold-500/80 font-mono pl-1 uppercase tracking-wider">
              Professional Edition
            </div>
          </div>
          <div className="absolute top-0 right-0 w-32 h-32 bg-gold-500/5 rounded-full blur-3xl pointer-events-none group-hover:bg-gold-500/10 transition-colors duration-500"></div>
        </div>

        <nav className="flex-1 px-4 space-y-1 py-4 overflow-y-auto no-scrollbar">
          {navItems.map(item => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) => `
                flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-300 font-medium group relative overflow-hidden
                ${isActive
                  ? 'bg-gray-800 text-gold-400 border-l-2 border-gold-500 shadow-lg shadow-black/20'
                  : 'text-gray-400 hover:bg-gray-800/50 hover:text-gray-100 hover:translate-x-1'
                }
              `}
            >
              {({ isActive }) => (
                <>
                  <item.icon size={18} className={`${isActive ? 'text-gold-500' : 'group-hover:text-gold-500/70'} transition-colors duration-300`} />
                  <span className="relative z-10 text-sm">{item.label}</span>
                </>
              )}
            </NavLink>
          ))}
        </nav>

        <div className="p-4 sidebar-safe-bottom border-t border-gray-800 space-y-2">
          <button
            onClick={() => setIsAddModalOpen(true)}
            className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-primary to-blue-600 hover:from-blue-500 hover:to-primary text-white py-3.5 rounded-xl font-bold transition-all shadow-lg shadow-blue-900/30 btn-float border border-white/10 active:scale-95 transform"
            title="Press '+' to open"
          >
            <Plus size={20} />
            Quick Add
          </button>
          <button
            onClick={handleLogout}
            className="w-full flex items-center justify-center gap-2 bg-gray-900 hover:bg-gray-800 text-gray-400 hover:text-red-400 py-3 rounded-xl text-sm font-medium transition-colors border border-gray-800 hover:border-red-500/30 active:scale-95"
          >
            <LogOut size={16} />
            Sign Out
          </button>
        </div>
      </aside>

      {/* Main Content - bottom padding clears the mobile tab bar */}
      <main className="flex-1 md:ml-64 p-4 md:p-8 max-w-[1600px] mx-auto w-full pt-20 md:pt-8 pb-28 md:pb-8 mobile-safe-main animate-fade-in min-h-[100dvh]">
        {children}
      </main>

      {/* Mobile Bottom Tab Bar */}
      <nav
        className="md:hidden fixed bottom-0 left-0 right-0 z-40 glass-panel border-t border-gray-800 bg-gray-950/95"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
        aria-label="Primary"
      >
        <div className="grid grid-cols-5 items-stretch">
          {bottomNavItems.slice(0, 2).map(item => (
            <BottomTab key={item.to} item={item} />
          ))}

          {/* Center Quick Add */}
          <div className="flex items-end justify-center">
            <button
              onClick={() => setIsAddModalOpen(true)}
              aria-label="Quick Add transaction"
              className="-mt-6 w-14 h-14 bg-gradient-to-tr from-gold-500 to-amber-300 text-black rounded-2xl flex items-center justify-center shadow-lg shadow-gold-500/30 border-4 border-[#12100d] active:scale-90 transition-transform"
            >
              <Plus size={26} strokeWidth={2.5} />
            </button>
          </div>

          {bottomNavItems.slice(2).map(item => (
            <BottomTab key={item.to} item={item} />
          ))}

          <button
            onClick={() => setIsMoreOpen(true)}
            aria-label="More"
            className={`flex flex-col items-center justify-center gap-0.5 py-2 min-h-[56px] transition-colors active:bg-gray-800/70 ${isMoreOpen ? 'text-gold-500' : 'text-gray-500'}`}
          >
            <Menu size={20} />
            <span className="text-[10px] font-semibold">More</span>
          </button>
        </div>
      </nav>

      {/* Mobile "More" sheet */}
      {isMoreOpen && (
        <div className="md:hidden fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setIsMoreOpen(false)} />
          <div
            className="absolute bottom-0 left-0 right-0 bg-gray-900 border-t border-gray-800 rounded-t-2xl animate-slide-up"
            style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
          >
            <div className="pt-3 pb-1 flex justify-center">
              <div className="w-10 h-1 rounded-full bg-gray-700" />
            </div>
            <div className="flex items-center justify-between px-5 py-3">
              <h3 className="text-base font-semibold text-gray-100">More</h3>
              <button
                onClick={() => setIsMoreOpen(false)}
                aria-label="Close"
                className="p-2.5 -mr-2 rounded-lg active:bg-gray-800 text-gray-400"
              >
                <X size={20} />
              </button>
            </div>
            <div className="px-3 pb-4 space-y-0.5">
              {moreNavItems.map(item => (
                <button
                  key={item.to}
                  onClick={() => goFromMore(item.to)}
                  className="w-full flex items-center gap-4 px-3 py-3.5 rounded-xl text-sm font-medium text-gray-300 active:bg-gray-800 transition-colors"
                >
                  <item.icon size={20} className="text-gold-500/80" />
                  {item.label}
                </button>
              ))}
              <div className="my-2 border-t border-gray-800" />
              <button
                onClick={handleLogout}
                className="w-full flex items-center gap-4 px-3 py-3.5 rounded-xl text-sm font-medium text-red-400/90 active:bg-red-500/10 transition-colors"
              >
                <LogOut size={20} />
                Sign Out
              </button>
            </div>
          </div>
        </div>
      )}

      <Modal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        title="Quick Transaction"
      >
        <TransactionForm onComplete={() => setIsAddModalOpen(false)} />
      </Modal>

      <AIChat />
      <InstallPWA />
    </div>
  );
};

const BottomTab: React.FC<{ item: { icon: React.ElementType; label: string; to: string } }> = ({ item }) => (
  <NavLink
    to={item.to}
    end={item.to === '/'}
    className={({ isActive }) => `
      flex flex-col items-center justify-center gap-0.5 py-2 min-h-[56px] transition-colors active:bg-gray-800/70
      ${isActive ? 'text-gold-500' : 'text-gray-500'}
    `}
  >
    {({ isActive }) => (
      <>
        <item.icon size={20} strokeWidth={isActive ? 2.4 : 2} />
        <span className={`text-[10px] ${isActive ? 'font-bold' : 'font-semibold'}`}>{item.label}</span>
      </>
    )}
  </NavLink>
);
