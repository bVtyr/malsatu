/** Нормализация казахстанских номеров к формату E.164 (+7XXXXXXXXXX). */
export function normalizeKzPhone(raw: string): string | null {
  const digits = raw.replace(/\D/g, "");
  let d = digits;
  if (d.length === 10 && d.startsWith("7")) d = "7" + d; // 7XXXXXXXXX без кода страны (редко)
  if (d.length === 11 && d.startsWith("8")) d = "7" + d.slice(1);
  if (d.length === 10 && d.startsWith("7")) d = "7" + d;
  if (d.length !== 11 || !d.startsWith("7")) return null;
  // Только мобильные Казахстана (+7 7xx): российские +7 9xx и прочие не принимаем, чтобы не оплачивать чужие SMS
  if (!/^77[0-9]{9}$/.test(d)) return null;
  return "+" + d;
}

export function formatKzPhone(e164: string): string {
  const m = /^\+7(\d{3})(\d{3})(\d{2})(\d{2})$/.exec(e164);
  return m ? `+7 ${m[1]} ${m[2]}-${m[3]}-${m[4]}` : e164;
}

/** Маскирование для публичного показа: +7 701 ***-**-45 */
export function maskPhone(e164: string): string {
  const m = /^\+7(\d{3})\d{5}(\d{2})$/.exec(e164);
  return m ? `+7 ${m[1]} ***-**-${m[2]}` : "+7 *** ***-**-**";
}
