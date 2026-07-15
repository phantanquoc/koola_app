import { useContext } from 'react';
import { AuthContext, type AdminIdentity } from './AuthContext';

interface AuthState {
  token: string | null;
  isAuthenticated: boolean;
  identity: AdminIdentity | null;
  login: (token: string) => void;
  logout: () => void;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
