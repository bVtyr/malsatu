"use client";
import { useEffect, useState } from "react";
import { useI18n } from "@/lib/i18n";
/** Дни до Курбан айта. Дата из настроек админки (settings.kurban_ait_date). */
export function KurbanTimer({ date = "2027-05-26" }: { date?: string }) {
  const { locale } = useI18n(); const [left, setLeft] = useState(0);
  useEffect(() => { const tick = () => setLeft(Math.max(0, new Date(date).getTime() - Date.now())); tick(); const i = setInterval(tick, 60_000); return () => clearInterval(i); }, [date]);
  const d = Math.floor(left / 86_400_000);
  return <p className="price-big" style={{ marginTop: "0.6rem" }}>{d}<small style={{ color: "inherit" }}>{locale === "kk" ? "күн қалды" : "дней до праздника"}</small></p>;
}
