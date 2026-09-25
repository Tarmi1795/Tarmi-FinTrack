import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAccess } from '../context/AccessContext';

// Route guard: renders children only for admins. While the access layer is
// resolving, show a centered spinner; non-admins are silently redirected to
// the dashboard — to them, the admin area simply does not exist.
export const RequireAdmin: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { role, loading } = useAccess();

  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="w-10 h-10 rounded-full border-2 border-gray-700 border-t-gold-500 animate-spin" aria-label="Loading" />
      </div>
    );
  }

  if (role !== 'admin') {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
};
