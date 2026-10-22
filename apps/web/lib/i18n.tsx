"use client";
import { createContext, useContext, type ReactNode } from "react";
import { t as dict, type Locale, type Dictionary, pickName, formatKzt, formatDate, plural } from "@malsatu/shared";

const Ctx = createContext<{ locale: Locale; t: Dictionary }>({ locale: "ru", t: dict("ru") });
export function I18nProvider({ locale, children }: { locale: Locale; children: ReactNode }) { return <Ctx.Provider value={{ locale, t: dict(locale) }}>{children}</Ctx.Provider>; }
export function useI18n() {
  const { locale, t } = useContext(Ctx);
  return {
    locale, t,
    name: (o: Record<string, any> | null | undefined, base = "name") => (o ? pickName(o, locale, base) : ""),
    /** Локализованное поле объявления: title_ru/title_kk с fallback на другой язык */
    lf: (o: Record<string, any> | null | undefined, base: string) => (o ? (o[`${base}_${locale}`] ?? o[`${base}_${locale === "kk" ? "ru" : "kk"}`] ?? "") : ""),
    money: (n: number | null | undefined) => (n == null ? "" : formatKzt(n, locale)),
    date: (d: Date | string | null | undefined) => (d ? formatDate(d, locale) : ""),
    heads: (n: number) => plural(n, t.common.heads as unknown as [string, string, string], locale),
    priceUnit: (pt: string) => ({ per_head: t.common.perHead, per_kg_live: t.common.perKgLive, per_kg_meat: t.common.perKgMeat, per_lot: t.common.perLot, negotiable: t.common.negotiable } as Record<string, string>)[pt] ?? pt,
    href: (p: string) => `/${locale}${p.startsWith("/") ? p : `/${p}`}`,
  };
}
export { isLocale } from "./locale";
