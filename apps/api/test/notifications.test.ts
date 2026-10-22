import { describe, it, expect } from "vitest";
import { inQuietHours, localMinutes } from "../src/services/notifications.js";

describe("quiet hours", () => {
  const at = (h: number, m = 0) => { const d = new Date(); d.setHours(h, m, 0, 0); return d; };
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  it("same-day window", () => {
    expect(inQuietHours("13:00", "14:00", at(13, 30), tz)).toBe(true);
    expect(inQuietHours("13:00", "14:00", at(14, 0), tz)).toBe(false);
  });
  it("overnight window 22:00–08:00", () => {
    expect(inQuietHours("22:00", "08:00", at(23), tz)).toBe(true);
    expect(inQuietHours("22:00", "08:00", at(3), tz)).toBe(true);
    expect(inQuietHours("22:00", "08:00", at(12), tz)).toBe(false);
  });
  it("disabled when unset", () => expect(inQuietHours(null, null, at(3))).toBe(false));
  it("uses the user timezone, not the server one", () => {
    const utcMidnight = new Date("2026-10-21T00:00:00Z"); // 05:00 в Алматы
    expect(localMinutes(utcMidnight, "Asia/Almaty")).toBe(5 * 60);
    expect(inQuietHours("22:00", "08:00", utcMidnight, "Asia/Almaty")).toBe(true);
    expect(inQuietHours("22:00", "08:00", new Date("2026-10-21T07:00:00Z"), "Asia/Almaty")).toBe(false); // 12:00 Алматы
  });
});
