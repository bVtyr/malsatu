import { describe, it, expect } from "vitest";
import { checksumValid, classifyIinBin, isBin, isIin, maskIinBin } from "../src/domain/iin.js";

// контрольные примеры рассчитаны по алгоритму ГОСТ РК 1.0
function gen(prefix11: string): string {
  const d = prefix11.split("").map(Number);
  let s = d.reduce((a, x, i) => a + x * (i + 1), 0) % 11;
  if (s === 10) s = d.reduce((a, x, i) => a + x * ([3, 4, 5, 6, 7, 8, 9, 10, 11, 1, 2][i]!), 0) % 11;
  return prefix11 + s;
}

describe("iin/bin", () => {
  it("accepts a well-formed IIN and rejects a wrong check digit", () => {
    const iin = gen("90010130001");
    expect(checksumValid(iin)).toBe(true);
    expect(isIin(iin)).toBe(true);
    const bad = iin.slice(0, 11) + ((Number(iin[11]) + 1) % 10);
    expect(isIin(bad)).toBe(false);
  });
  it("rejects impossible birth dates and century digits", () => {
    expect(isIin(gen("90139930001"))).toBe(false); // месяц 13
    expect(isIin(gen("90010190001"))).toBe(false); // 7-я цифра 9
  });
  it("classifies BIN by the fifth digit", () => {
    const bin = gen("08034000123"); // 5-я = 4 → юрлицо-резидент
    expect(isBin(bin)).toBe(true);
    expect(classifyIinBin(bin)).toBe("bin");
    expect(classifyIinBin(gen("90010130001"))).toBe("iin");
    expect(classifyIinBin("123")).toBeNull();
  });
  it("masks for display", () => { expect(maskIinBin("900101300017")).toBe("9001******17"); });
});
