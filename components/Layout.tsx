
import React, { useState, useEffect } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { LayoutDashboard, Plus, PieChart, Settings as SettingsIcon, ArrowRightLeft, Monitor, BookOpen, LogOut, Target, Lock } from 'lucide-react';
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

  const navItems = [
    { icon: LayoutDashboard, label: 'Dashboard', to: '/' },
    { icon: Target, label: 'Budget', to: '/budget' },
    { icon: ArrowRightLeft, label: 'AP / AR', to: '/apar' },
    { icon: Monitor, label: 'Assets', to: '/assets' },
    { icon: BookOpen, label: 'Journal', to: '/journal' },
    { icon: PieChart, label: 'Reports', to: '/reports' },
    { icon: SettingsIcon, label: 'Settings', to: '/settings' },
  ];

  return (
    <div className="min-h-screen text-gray-100 flex flex-col md:flex-row bg-transparent">
      {/* Mobile Header - Compact for smaller screens */}
      <header className="md:hidden fixed top-0 left-0 right-0 glass-panel z-30 px-4 h-14 flex items-center justify-between border-b border-gray-800 shadow-sm">
         <div className="flex items-center gap-3">
             <Logo className="w-7 h-7" showText={false} />
             <span className="font-bold text-base tracking-tight text-white">Tarmi <span className="text-gold-500">Pro</span></span>
         </div>
         <div className="flex items-center gap-1">
            <button onClick={handleLogout} className="p-2 text-red-400 hover:bg-red-500/10 rounded-lg active:scale-90 transition-transform">
                <LogOut size={18} />
            </button>
         </div>
      </header>

      {/* Desktop Sidebar */}
      <aside className="hidden md:flex flex-col w-64 glass-panel border-r border-gray-800 fixed h-full z-10 top-0 left-0 shadow-2xl bg-gray-950/80 backdrop-blur-xl">
        <div className="p-6 relative overflow-hidden group">
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

        <div className="p-4 border-t border-gray-800 space-y-2">
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

      {/* Main Content - Improved spacing for mobile safe areas */}
      <main className="flex-1 md:ml-64 p-4 md:p-8 max-w-[1600px] mx-auto w-full pt-20 md:pt-8 pb-32 md:pb-8 animate-fade-in min-h-[100vh]">
        {children}
      </main>

      {/* Mobile Bottom Nav - Optimized for safe areas and ergonomics */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 glass-panel border-t border-gray-800 z-40 bg-gray-950/90 backdrop-blur-2xl shadow-2xl" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
        <div className="grid grid-cols-8 h-16 items-center px-1">
          <NavLink to="/" className={({ isActive }) => `flex flex-col items-center justify-center gap-1 h-full transition-all active:scale-90 ${isActive ? 'text-gold-500' : 'text-gray-500'}`}><LayoutDashboard size={20}/></NavLink>
          <NavLink to="/budget" className={({ isActive }) => `flex flex-col items-center justify-center gap-1 h-full transition-all active:scale-90 ${isActive ? 'text-gold-500' : 'text-gray-500'}`}><Target size={20}/></NavLink>
          <NavLink to="/apar" className={({ isActive }) => `flex flex-col items-center justify-center gap-1 h-full transition-all active:scale-90 ${isActive ? 'text-gold-500' : 'text-gray-500'}`}><ArrowRightLeft size={20}/></NavLink>
          <NavLink to="/assets" className={({ isActive }) => `flex flex-col items-center justify-center gap-1 h-full transition-all active:scale-90 ${isActive ? 'text-gold-500' : 'text-gray-500'}`}><Monitor size={20}/></NavLink>
          
          <div className="relative -top-5 flex justify-center col-span-1">
            <button
              onClick={() => setIsAddModalOpen(true)}
              className="w-14 h-14 bg-gradient-to-tr from-gold-500 to-amber-300 text-black rounded-full flex items-center justify-center shadow-lg shadow-gold-500/40 hover:scale-110 active:scale-90 transition-transform border-4 border-[#121212]"
            >
              <Plus size={28} />
            </button>
          </div>

          <NavLink to="/journal" className={({ isActive }) => `flex flex-col items-center justify-center gap-1 h-full transition-all active:scale-90 ${isActive ? 'text-gold-500' : 'text-gray-500'}`}><BookOpen size={20}/></NavLink>
          <NavLink to="/reports" className={({ isActive }) => `flex flex-col items-center justify-center gap-1 h-full transition-all active:scale-90 ${isActive ? 'text-gold-500' : 'text-gray-500'}`}><PieChart size={20}/></NavLink>
          <NavLink to="/settings" className={({ isActive }) => `flex flex-col items-center justify-center gap-1 h-full transition-all active:scale-90 ${isActive ? 'text-gold-500' : 'text-gray-500'}`}><SettingsIcon size={20}/></NavLink>
        </div>
      </nav>

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
