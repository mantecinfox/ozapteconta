import React, { createContext, useContext, useState, useEffect, ReactNode } from "react";
import api from "@/lib/api";

interface AdminUser {
  id: string;
  username: string;
  role: string;
  name?: string;
  plan?: string;
}

interface AuthContextType {
  user: AdminUser | null;
  loading: boolean;
  login: (username: string, password: string) => Promise<void>;
  loginClient: (username: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

const ADMIN_TOKEN_KEY = "ozapteconta_admin_token";
const CLIENT_TOKEN_KEY = "ozapteconta_client_token";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AdminUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const inClientArea = window.location.pathname.startsWith("/cliente");
    const token = inClientArea
      ? localStorage.getItem(CLIENT_TOKEN_KEY)
      : localStorage.getItem(ADMIN_TOKEN_KEY);

    if (!token) {
      setLoading(false);
      return;
    }

    if (inClientArea) {
      api.get("/client-portal/auth/me")
        .then((res) => {
          const c = res.data?.client;
          setUser({
            id: String(c?.id || ""),
            username: c?.phone || "cliente",
            name: c?.fullName || "Cliente",
            role: "CLIENT",
            plan: c?.plan,
          });
        })
        .catch(() => localStorage.removeItem(CLIENT_TOKEN_KEY))
        .finally(() => setLoading(false));
      return;
    }

    api.get("/auth/me")
      .then((res) => setUser(res.data.user))
      .catch(() => localStorage.removeItem(ADMIN_TOKEN_KEY))
      .finally(() => setLoading(false));
  }, []);

  const login = async (username: string, password: string) => {
    const res = await api.post("/auth/login", { username, password });
    localStorage.setItem(ADMIN_TOKEN_KEY, res.data.token);
    localStorage.removeItem(CLIENT_TOKEN_KEY);
    setUser(res.data.user);
  };

  const loginClient = async (username: string, password: string) => {
    const res = await api.post("/client-portal/auth/login", { username, password });
    localStorage.setItem(CLIENT_TOKEN_KEY, res.data.token);
    localStorage.removeItem(ADMIN_TOKEN_KEY);
    setUser(res.data.user);
  };

  const logout = () => {
    localStorage.removeItem(ADMIN_TOKEN_KEY);
    localStorage.removeItem(CLIENT_TOKEN_KEY);
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, loginClient, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
