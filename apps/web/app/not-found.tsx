import Link from "next/link";
export default function NotFound() {
  return (
    <main style={{ padding: "48px 16px", maxWidth: 640, margin: "0 auto" }}>
      <h1 className="h1" style={{ fontFamily: "var(--font-display)" }}>Страница не найдена</h1>
      <p style={{ marginTop: 12 }}>Бет табылмады. Проверьте адрес или вернитесь на главную.</p>
      <p style={{ marginTop: 24 }}><Link className="btn" href="/">На главную</Link></p>
    </main>
  );
}
