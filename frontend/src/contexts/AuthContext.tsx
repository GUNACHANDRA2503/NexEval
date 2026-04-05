import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { api, AUTH_TOKEN_KEY, type UserMe } from '../lib/api';

interface AuthContextValue {
  token: string | null;
  user: UserMe | null;
  ready: boolean;
  preferredModel: string;
  freyaEnabled: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string) => Promise<void>;
  logout: () => void;
  refreshMe: () => Promise<void>;
  setPreferredModel: (model: string | null) => Promise<void>;
  setFreyaEnabled: (value: boolean) => Promise<void>;
  patchUserSettings: (body: {
    preferred_model?: string | null;
    saved_models?: string[];
    freya_enabled?: boolean;
  }) => Promise<void>;
}

const AuthCtx = createContext<AuthContextValue | null>(null);

export function useAuth() {
  const ctx = useContext(AuthCtx);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setTokenState] = useState<string | null>(() => localStorage.getItem(AUTH_TOKEN_KEY));
  const [user, setUser] = useState<UserMe | null>(null);
  const [ready, setReady] = useState(false);

  const refreshMe = useCallback(async () => {
    const t = localStorage.getItem(AUTH_TOKEN_KEY);
    if (!t) {
      setUser(null);
      setReady(true);
      return;
    }
    try {
      const me = await api.me();
      setUser(me);
    } catch {
      localStorage.removeItem(AUTH_TOKEN_KEY);
      setTokenState(null);
      setUser(null);
    } finally {
      setReady(true);
    }
  }, []);

  useEffect(() => {
    refreshMe();
  }, [refreshMe]);

  const login = useCallback(
    async (email: string, password: string) => {
      const res = await api.login(email, password);
      localStorage.setItem(AUTH_TOKEN_KEY, res.access_token);
      setTokenState(res.access_token);
      await refreshMe();
    },
    [refreshMe],
  );

  const register = useCallback(
    async (email: string, password: string) => {
      const res = await api.register(email, password);
      localStorage.setItem(AUTH_TOKEN_KEY, res.access_token);
      setTokenState(res.access_token);
      await refreshMe();
    },
    [refreshMe],
  );

  const logout = useCallback(() => {
    localStorage.removeItem(AUTH_TOKEN_KEY);
    setTokenState(null);
    setUser(null);
  }, []);

  const patchUserSettings = useCallback(async (body: Parameters<AuthContextValue['patchUserSettings']>[0]) => {
    const u = await api.patchAccountSettings(body);
    setUser(u);
  }, []);

  const setPreferredModel = useCallback(
    async (model: string | null) => {
      await patchUserSettings({ preferred_model: model });
    },
    [patchUserSettings],
  );

  const setFreyaEnabled = useCallback(
    async (value: boolean) => {
      await patchUserSettings({ freya_enabled: value });
    },
    [patchUserSettings],
  );

  const preferredModel = useMemo(() => {
    const sm = user?.saved_models ?? [];
    const p = user?.preferred_model?.trim();
    if (sm.length) {
      if (p && sm.includes(p)) return p;
      return sm[0];
    }
    return p || 'gpt-4o-mini';
  }, [user]);

  const freyaEnabled = user?.freya_enabled ?? false;

  const value = useMemo(
    () => ({
      token,
      user,
      ready,
      preferredModel,
      freyaEnabled,
      login,
      register,
      logout,
      refreshMe,
      setPreferredModel,
      setFreyaEnabled,
      patchUserSettings,
    }),
    [
      token,
      user,
      ready,
      preferredModel,
      freyaEnabled,
      login,
      register,
      logout,
      refreshMe,
      setPreferredModel,
      setFreyaEnabled,
      patchUserSettings,
    ],
  );

  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}
