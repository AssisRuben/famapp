import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { repository } from '../data';
import { Profile } from '../types/domain';

interface AuthContextValue {
  profile: Profile | null;
  loadingSession: boolean;
  signingIn: boolean;
  error: string | null;
  signIn: (email: string, senha: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loadingSession, setLoadingSession] = useState(true);
  const [signingIn, setSigningIn] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    repository
      .getSession()
      .then(setProfile)
      .finally(() => setLoadingSession(false));
  }, []);

  const signIn = async (email: string, senha: string) => {
    setSigningIn(true);
    setError(null);
    try {
      const loggedProfile = await repository.login(email, senha);
      setProfile(loggedProfile);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao entrar.');
    } finally {
      setSigningIn(false);
    }
  };

  const signOut = async () => {
    await repository.logout();
    setProfile(null);
  };

  const value = useMemo(
    () => ({ profile, loadingSession, signingIn, error, signIn, signOut }),
    [profile, loadingSession, signingIn, error]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth deve ser usado dentro de AuthProvider');
  return ctx;
}
