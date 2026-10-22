"use client";
import { useCallback, useState } from "react";
export interface Pos { lat: number; lng: number }
const KEY = "malsatu_pos"; const TTL = 24 * 3600_000;
const round = (p: Pos): Pos => ({ lat: Math.round(p.lat * 100) / 100, lng: Math.round(p.lng * 100) / 100 }); // ~1 км: достаточно для «рядом», не раскрывает дом
function readCached(): Pos | null { try { const s = sessionStorage.getItem(KEY); if (!s) return null; const v = JSON.parse(s); return Date.now() - v.at < TTL ? { lat: v.lat, lng: v.lng } : null; } catch { return null; } }
/** Геолокация только по явному действию пользователя (кнопка «Рядом со мной» или «Определить»). Хранится округлённо и до закрытия вкладки. */
export function useGeo() {
  const [pos, setPosState] = useState<Pos | null>(() => (typeof window === "undefined" ? null : readCached()));
  const [denied, setDenied] = useState(false); const [busy, setBusy] = useState(false);
  const setPos = useCallback((v: Pos | null) => { setPosState(v); try { v ? sessionStorage.setItem(KEY, JSON.stringify({ ...v, at: Date.now() })) : sessionStorage.removeItem(KEY); } catch {} }, []);
  const request = useCallback(() => {
    if (!navigator.geolocation) { setDenied(true); return; }
    setBusy(true);
    navigator.geolocation.getCurrentPosition((p) => { setPos(round({ lat: p.coords.latitude, lng: p.coords.longitude })); setBusy(false); }, () => { setDenied(true); setBusy(false); }, { timeout: 8000, maximumAge: 600_000 });
  }, [setPos]);
  return { pos, denied, busy, request, setPos };
}
