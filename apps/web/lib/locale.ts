/** Общий (серверный и клиентский) модуль локали без директивы "use client". */
export type Locale = "kk" | "ru";
export const LOCALES: Locale[] = ["kk", "ru"];
export const isLocale = (s: string): s is Locale => s === "kk" || s === "ru";
