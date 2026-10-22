import { describe, it, expect } from "vitest";
import { inQuietHours } from "../src/services/notifications.js";

describe("quiet hours", () => {
  const at = (h: number, m = 0) => { const d = new Date(); d.setHours(h, m, 0, 0); return d; };
  it("same-day window", () => {
    expect(inQuietHours("13:00", "14:00", at(13, 30))).toBe(true);
    expect(inQuietHours("13:00", "14:00", at(14, 0))).toBe(false);
  });
  it("overnight window 22:00–08:00", () => {
    expect(inQuietHours("22:00", "08:00", at(23))).toBe(true);
    expect(inQuietHours("22:00", "08:00", at(3))).toBe(true);
    expect(inQuietHours("22:00", "08:00", at(12))).toBe(false);
  });
  it("disabled when unset", () => expect(inQuietHours(null, null, at(3))).toBe(false));
});
