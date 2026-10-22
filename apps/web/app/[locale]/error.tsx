"use client";
import { useEffect } from "react";
/** Граница ошибок экрана: показываем понятное сообщение и кнопку повтора вместо пустого экрана. */
export default function ErrorBoundary({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error(error); }, [error]);
  return (
    <div className="panel panel--red" style={{ marginTop: 16 }}>
      <b style={{ fontFamily: "var(--font-display)" }}>Что-то пошло не так / Бірдеңе дұрыс болмады</b>
      <p className="small" style={{ marginTop: 8 }}>Попробуйте ещё раз. Если ошибка повторяется, напишите в поддержку.{error.digest ? ` Код: ${error.digest}` : ""}</p>
      <button type="button" onClick={reset} className="btn btn--white" style={{ marginTop: 12 }}>Повторить / Қайталау</button>
    </div>
  );
}
