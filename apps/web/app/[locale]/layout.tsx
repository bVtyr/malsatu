import type { Metadata, Viewport } from "next";
import { notFound } from "next/navigation";
import { Unbounded, Golos_Text } from "next/font/google";
import { I18nProvider } from "@/lib/i18n";
import { isLocale } from "@/lib/locale";
import { AuthProvider } from "@/lib/auth";
import { Shell } from "@/components/Shell";

const display = Unbounded({ subsets: ["cyrillic", "cyrillic-ext", "latin"], weight: ["600", "700", "800"], variable: "--font-display", display: "swap" });
const ui = Golos_Text({ subsets: ["cyrillic", "cyrillic-ext", "latin"], weight: ["400", "500", "600", "700"], variable: "--font-ui", display: "swap" });

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_WEB_URL ?? "http://localhost:3000"),
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
    <div lang={locale} className={`${display.variable} ${ui.variable}`} style={{ display: "contents" }}>
      <I18nProvider locale={locale}><AuthProvider><Shell>{children}</Shell></AuthProvider></I18nProvider>
    </div>
  );
}
