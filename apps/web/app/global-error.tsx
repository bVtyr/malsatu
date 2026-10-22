"use client";
export default function GlobalError({ reset }: { error: Error; reset: () => void }) {
  return (
    <html lang="ru"><body style={{ fontFamily: "system-ui", padding: 32 }}>
      <h1>Ошибка приложения</h1>
      <p>Қате орын алды. Обновите страницу или нажмите кнопку.</p>
      <button type="button" onClick={reset} style={{ padding: "12px 20px", fontSize: 16 }}>Повторить</button>
    </body></html>
  );
}
