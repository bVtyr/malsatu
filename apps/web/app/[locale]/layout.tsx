import type { Metadata, Viewport } from "next";
import { notFound } from "next/navigation";
import "../globals.css";
import { I18nProvider, isLocale } from "@/lib/i18n";
import { AuthProvider } from "@/lib/auth";
import { Shell } from "@/components/Shell";
import { unstable_ViewTransition as ViewTransition } from "react";

export const metadata: Metadata = {
  title: { default: "MalSatu. Скот, мясо и услуги по всему Казахстану", template: "%s · MalSatu" },
  description: "Мал базары в телефоне: живой скот, мясо, согым вскладчину, бараны к Курбан айту. Цены по областям, безопасная сделка с осмотром за 24 часа.",
  manifest: "/manifest.json", applicationName: "MalSatu", appleWebApp: { capable: true, title: "MalSatu", statusBarStyle: "default" },
  alternates: { languages: { ru: "/ru", kk: "/kk" } },
};
export const viewport: Viewport = { themeColor: "#ffd23f", width: "device-width", initialScale: 1, maximumScale: 5, viewportFit: "cover" };
export function generateStaticParams() { return [{ locale: "ru" }, { locale: "kk" }]; }

export default async function LocaleLayout({ children, params }: { children: React.ReactNode; params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return (
    <html lang={locale}>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Unbounded:wght@600;700;800&family=Golos+Text:wght@400;500;600;700&display=swap" rel="stylesheet" />
        <link rel="stylesheet" href="/malsatu.css" />
      </head>
      <body>
        <I18nProvider locale={locale}><AuthProvider><Shell><ViewTransition>{children}</ViewTransition></Shell></AuthProvider></I18nProvider>
      </body>
    </html>
  );
}
