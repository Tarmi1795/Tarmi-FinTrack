import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, ShieldAlert } from 'lucide-react';
import { useAccess } from '../context/AccessContext';

// Route guard: renders children only for admins. While the access layer is
// resolving, show a centered spinner; non-admins get a 403 card with a way back.
export const RequireAdmin: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { role, loading } = useAccess();
  const navigate = useNavigate();

  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="w-10 h-10 rounded-full border-2 border-gray-700 border-t-gold-500 animate-spin" aria-label="Loading" />
      </div>
    );
  }

  if (role !== 'admin') {
    return (
      <div className="min-h-[60vh] flex items-center justify-center px-4">
        <div className="glass-card p-8 max-w-sm w-full text-center">
          <div className="mx-auto w-14 h-14 rounded-2xl bg-red-500/10 flex items-center justify-center">
            <ShieldAlert className="text-red-400" size={28} />
          </div>
          <h2 className="text-xl font-bold text-white mt-4">403 — Admins only</h2>
          <p className="text-sm text-gray-500 mt-1.5">Your account does not have access to this area.</p>
          <button
            onClick={() => navigate('/')}
            className="mt-6 w-full flex items-center justify-center gap-2 bg-gradient-to-r from-gold-500 to-amber-400 text-black font-bold px-4 py-2.5 rounded-xl hover:shadow-lg hover:shadow-gold-500/20 transition-all active:scale-95 text-sm"
          >
            <ArrowLeft size={16} /> Back to Dashboard
          </button>
        </div>
      </div>
    );
  }

  return <>{children}</>;
};
