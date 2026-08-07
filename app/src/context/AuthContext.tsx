import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { repository } from '../data';
import { obterPushToken } from '../lib/notifications';
import { Profile } from '../types/domain';

// Registra (ou atualiza) o Expo push token no perfil logado — usado
// pelo n8n pra mandar push de verdade (ex.: subiu de faixa de
// comissão). "Nice to have": nunca deve travar login nem sessão.
function registrarPushToken(profile: Profile): void {
  obterPushToken()
    .then((token) => {
      if (token) return repository.salvarPushToken(profile, token);
    })
    .catch(() => {});
}

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
      .then((sessionProfile) => {
        setProfile(sessionProfile);
        if (sessionProfile) registrarPushToken(sessionProfile);
      })
      .finally(() => setLoadingSession(false));
  }, []);

  const signIn = async (email: string, senha: string) => {
    setSigningIn(true);
    setError(null);
    try {
      const loggedProfile = await repository.login(email, senha);
      setProfile(loggedProfile);
      registrarPushToken(loggedProfile);
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
