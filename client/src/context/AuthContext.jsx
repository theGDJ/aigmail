import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { authApi, metaApi, preferenceApi } from '../services/index.js';

const AuthContext = createContext(null);

const FALLBACK_META = {
  categories: ['WORK', 'EDUCATION', 'FINANCE', 'SHOPPING', 'TRAVEL', 'PERSONAL', 'PROMOTIONS', 'SOCIAL', 'IMPORTANT', 'OTHER'],
  priorities: ['URGENT', 'HIGH', 'MEDIUM', 'LOW'],
  languages: [{ code: 'EN', label: 'English' }],
  summaryLengths: ['SHORT', 'MEDIUM', 'DETAILED'],
  replyTones: ['PROFESSIONAL', 'FORMAL', 'CASUAL', 'FRIENDLY', 'SHORT'],
  riskLevels: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'],
  ai: { engine: 'local', live: false },
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [preference, setPreference] = useState(null);
  const [accounts, setAccounts] = useState([]);
  const [meta, setMeta] = useState(FALLBACK_META);
  const [status, setStatus] = useState({ loading: true, error: null });

  const loadMeta = useCallback(async () => {
    try {
      setMeta(await metaApi.get());
    } catch {
      setMeta(FALLBACK_META);
    }
  }, []);

  const loadSession = useCallback(async () => {
    setStatus({ loading: true, error: null });
    try {
      const data = await authApi.me();
      setUser(data.user);
      setPreference(data.preference);
      setAccounts(data.accounts || []);
      // /api/meta is authenticated, so load it once we have a session.
      await loadMeta();
    } catch (err) {
      if (err.status !== 401) setStatus({ loading: false, error: err.message });
      setUser(null);
    } finally {
      setStatus((prev) => ({ ...prev, loading: false }));
    }
  }, []);

  useEffect(() => {
    loadSession();
  }, [loadSession]);

  const demoLogin = useCallback(async () => {
    const data = await authApi.demoLogin();
    setUser(data.user);
    setPreference(data.preference);
    await loadSession();
    return data;
  }, [loadSession]);

  const logout = useCallback(async () => {
    await authApi.logout();
    setUser(null);
    setPreference(null);
    setAccounts([]);
  }, []);

  const updatePreference = useCallback(async (patch) => {
    const updated = await preferenceApi.update(patch);
    setPreference(updated);
    return updated;
  }, []);

  const value = useMemo(
    () => ({
      user,
      preference,
      accounts,
      meta,
      loading: status.loading,
      error: status.error,
      isAuthenticated: Boolean(user),
      demoLogin,
      logout,
      updatePreference,
      refresh: loadSession,
      reloadMeta: loadMeta,
    }),
    [user, preference, accounts, meta, status, demoLogin, logout, updatePreference, loadSession, loadMeta],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
};

export default AuthContext;
