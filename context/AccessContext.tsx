
import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { useFinance } from './FinanceContext';
import { adminService } from '../services/admin';

// Lightweight access layer: the current user's role + restricted modules.
// Restricted modules disappear from navigation and are blocked at the route level.

interface AccessState {
  role: 'user' | 'admin' | null;
  disabledModules: string[];
  loading: boolean;
  refresh: () => Promise<void>;
  isModuleEnabled: (route: string) => boolean;
}

const AccessContext = createContext<AccessState>({
  role: null,
  disabledModules: [],
  loading: true,
  refresh: async () => {},
  isModuleEnabled: () => true,
});

export const AccessProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useFinance();
  const [role, setRole] = useState<'user' | 'admin' | null>(null);
  const [disabledModules, setDisabledModules] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!user) { setRole(null); setDisabledModules([]); setLoading(false); return; }
    try {
      const myRole = await adminService.getMyRole();
      setRole(myRole || 'user');
      const settings = await adminService.getUserSettings(user.id);
      setDisabledModules(settings?.disabled_modules || []);
    } catch (e) {
      console.warn('AccessContext load failed (defaults apply):', e);
      setRole(r => r || 'user');
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => { refresh(); }, [refresh]);

  const isModuleEnabled = useCallback((route: string) => !disabledModules.includes(route), [disabledModules]);

  return (
    <AccessContext.Provider value={{ role, disabledModules, loading, refresh, isModuleEnabled }}>
      {children}
    </AccessContext.Provider>
  );
};

export const useAccess = () => useContext(AccessContext);
