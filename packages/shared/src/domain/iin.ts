/**
 * ИИН/БИН Казахстана: 12 цифр, контрольная сумма по ГОСТ РК (веса 1..11, при остатке 10 — веса 3..11,1,2).
 * ИИН: первые 6 цифр — дата рождения (ГГММДД), 7-я — век/пол (1–6). БИН: 5-я цифра 4–6 (юрлицо/ИП), 7-я — тип.
 */
const W1 = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
const W2 = [3, 4, 5, 6, 7, 8, 9, 10, 11, 1, 2];

export function checksumValid(digits: string): boolean {
  if (!/^\d{12}$/.test(digits)) return false;
  const d = digits.split("").map(Number);
  let s = d.slice(0, 11).reduce((a, x, i) => a + x * W1[i]!, 0) % 11;
  if (s === 10) s = d.slice(0, 11).reduce((a, x, i) => a + x * W2[i]!, 0) % 11;
  return s < 10 && s === d[11];
}

export function isIin(v: string): boolean {
  if (!checksumValid(v)) return false;
  const mm = Number(v.slice(2, 4)), dd = Number(v.slice(4, 6)), c = Number(v[6]);
  return mm >= 1 && mm <= 12 && dd >= 1 && dd <= 31 && c >= 1 && c <= 6;
}

export function isBin(v: string): boolean {
  if (!checksumValid(v)) return false;
  const fifth = Number(v[4]);
  return fifth >= 4 && fifth <= 6; // 4 — резидент-юрлицо, 5 — нерезидент, 6 — ИП (совместное предпринимательство)
}

/** Тип идентификатора по формату; null — невалидный. */
export function classifyIinBin(v: string): "iin" | "bin" | null {
  const s = v.replace(/\s/g, "");
  if (isIin(s)) return "iin";
  if (isBin(s)) return "bin";
  return null;
}

/** Маскирование для показа: 900101 ****** → первые 4 и последние 2. */
export function maskIinBin(v: string): string { return v.length === 12 ? `${v.slice(0, 4)}******${v.slice(10)}` : "****"; }
