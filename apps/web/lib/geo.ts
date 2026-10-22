"use client";
import { useEffect, useState } from "react";
export interface Pos { lat: number; lng: number }
/** Геолокация с кэшем в localStorage (пользователь может выбрать регион вручную — см. RegionPicker). */
export function useGeo() {
  const [pos, setPos] = useState<Pos | null>(() => { try { const s = localStorage.getItem("malsatu_pos"); return s ? JSON.parse(s) : null; } catch { return null; } });
  const [denied, setDenied] = useState(false);
  useEffect(() => {
    if (pos || typeof navigator === "undefined" || !navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition((p) => { const v = { lat: p.coords.latitude, lng: p.coords.longitude }; setPos(v); try { localStorage.setItem("malsatu_pos", JSON.stringify(v)); } catch {} }, () => setDenied(true), { timeout: 8000, maximumAge: 600_000 });
  }, [pos]);
  return { pos, denied, setPos: (v: Pos | null) => { setPos(v); try { v ? localStorage.setItem("malsatu_pos", JSON.stringify(v)) : localStorage.removeItem("malsatu_pos"); } catch {} } };
}
