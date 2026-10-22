"use client";
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { api, ApiError, getToken, setToken } from "./api";

export interface Me { id: string; phone: string; displayName: string | null; accountType: string; verificationLevel: number; roles: string[]; locale: string; regionCode: string | null; farmName: string | null; rating: number; dealsCount: number; trustScore: number }
const Ctx = createContext<{ user: Me | null; loading: boolean; refresh: () => Promise<void>; logout: () => Promise<void> }>({ user: null, loading: true, refresh: async () => {}, logout: async () => {} });

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);
  const refresh = useCallback(async () => {
    if (!getToken()) { setUser(null); setLoading(false); return; }
    try { const r = await api<{ user: Me }>("/auth/me"); setUser(r.user); }
    catch (e) { if (e instanceof ApiError && (e.status === 401 || e.status === 403)) { setToken(null); setUser(null); } /* офлайн: сессию не трогаем */ }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { refresh(); }, [refresh]);
  const logout = useCallback(async () => { try { await api("/auth/logout", { method: "POST", body: {} }); } catch { /* ignore */ } setToken(null); setUser(null); }, []);
  return <Ctx.Provider value={{ user, loading, refresh, logout }}>{children}</Ctx.Provider>;
}
export const useAuth = () => useContext(Ctx);
export const hasRole = (u: Me | null, ...roles: string[]) => !!u && roles.some((r) => u.roles.includes(r));
