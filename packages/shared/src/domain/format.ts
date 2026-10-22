import type { Locale } from "../i18n/index.js";

export function formatKzt(n: number, locale: Locale = "ru"): string {
  const s = new Intl.NumberFormat(locale === "kk" ? "kk-KZ" : "ru-KZ", { maximumFractionDigits: 0 }).format(n);
  return `${s} ₸`;
}

export function formatDate(d: Date | string, locale: Locale = "ru"): string {
  const date = typeof d === "string" ? new Date(d) : d;
  return new Intl.DateTimeFormat(locale === "kk" ? "kk-KZ" : "ru-KZ", { day: "numeric", month: "long", year: "numeric" }).format(date);
}

/** Склонение в русском: plural(5, ["голова","головы","голов"]); в казахском форма одна. */
export function plural(n: number, forms: [string, string, string], locale: Locale = "ru"): string {
  if (locale === "kk") return `${n} ${forms[0]}`;
  const a = Math.abs(n) % 100, b = a % 10;
  const f = a > 10 && a < 20 ? forms[2] : b > 1 && b < 5 ? forms[1] : b === 1 ? forms[0] : forms[2];
  return `${n} ${f}`;
}

export function relativeDistance(km: number, locale: Locale = "ru"): string {
  if (km < 1) return locale === "kk" ? "1 км-ден жақын" : "менее 1 км";
  return `${Math.round(km)} км`;
}
