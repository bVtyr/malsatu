import { ru } from "./ru.js";
import { kk } from "./kk.js";
export type Locale = "kk" | "ru";
export const LOCALES: Locale[] = ["kk", "ru"];
export const DEFAULT_LOCALE: Locale = "ru";
export const dictionaries = { ru, kk } as const;
export type Dictionary = typeof ru;
export function t(locale: Locale): Dictionary { return (locale === "kk" ? (kk as Dictionary) : ru); }
/** Выбор локализованного поля из объекта вида { nameRu, nameKk } / { name_ru, name_kk }. */
export function pickName(obj: Record<string, any>, locale: Locale, base = "name"): string {
  const camel = obj[`${base}${locale === "kk" ? "Kk" : "Ru"}`];
  const snake = obj[`${base}_${locale}`];
  return camel ?? snake ?? obj[`${base}Ru`] ?? obj[`${base}_ru`] ?? "";
}
export { ru, kk };
