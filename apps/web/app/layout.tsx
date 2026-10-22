import "./globals.css";
/** Корневой layout: html/body и общая таблица стилей. Локаль задаётся во вложенном app/[locale]/layout.tsx. */
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru">
      <head><link rel="stylesheet" href="/malsatu.css" /></head>
      <body>{children}</body>
    </html>
  );
}
