"use client";
import { useRef, useState } from "react";
import { Mic } from "./Icons";
import { useI18n } from "@/lib/i18n";
/** Голосовой ввод (Web Speech API, kk-KZ / ru-RU). Без поддержки кнопка не показывается. */
export function VoiceInput({ onText }: { onText: (text: string) => void }) {
  const { locale, t } = useI18n();
  const [rec, setRec] = useState(false);
  const ref = useRef<any>(null);
  const SR = typeof window !== "undefined" ? (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition : null;
  if (!SR) return null;
  const toggle = () => {
    if (rec) { ref.current?.stop(); setRec(false); return; }
    const r = new SR(); r.lang = locale === "kk" ? "kk-KZ" : "ru-RU"; r.interimResults = false; r.continuous = true;
    r.onresult = (e: any) => { onText(Array.from(e.results).map((x: any) => x[0].transcript).join(" ")); };
    r.onend = () => setRec(false); ref.current = r; r.start(); setRec(true);
  };
  return <button type="button" onClick={toggle} className="chip" aria-pressed={rec}><Mic size={20} />{rec ? (locale === "kk" ? "Жазылуда…" : "Слушаю…") : t.listing.voiceInput}</button>;
}
