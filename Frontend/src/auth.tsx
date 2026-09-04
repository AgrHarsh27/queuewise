import { createContext, useContext, useState, type ReactNode } from 'react';
import type { User } from './api/types';
import { api } from './api/client';

type Auth = {
  user: User | null;
  token: string | null;
  login: (email: string, password?: string) => Promise<void>;
  logout: () => void;
};

const AuthContext = createContext<Auth | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(() => JSON.parse(localStorage.getItem('qw-user') || 'null'));
  const [token, setToken] = useState(() => localStorage.getItem('qw-token'));

  const login = async (email: string, password?: string) => {
    const res = await api.login(email, password);
    setUser(res.user);
    setToken(res.token);
    localStorage.setItem('qw-user', JSON.stringify(res.user));
    localStorage.setItem('qw-token', res.token);
  };

  const logout = () => {
    setUser(null);
    setToken(null);
    localStorage.clear();
  };

  return (
    <AuthContext.Provider value={{ user, token, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be inside AuthProvider');
  return value;
}
