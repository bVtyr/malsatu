import { describe, it, expect } from "vitest";
import { computeStats, priceHint, isSuspiciouslyLow, normalizeToPerKg, type PricePoint } from "../src/domain/priceIndex.js";

const now = new Date("2026-10-21");
const pt = (price: number, region = "kz-zha", daysAgo = 5, unit: PricePoint["unit"] = "per_head"): PricePoint => ({ categoryCode: "sheep_ram", regionCode: region, unit, priceKzt: price, publishedAt: new Date(now.getTime() - daysAgo * 86_400_000) });

describe("price index", () => {
  it("computes avg/median within 30-day window", () => {
    const s = computeStats([pt(60_000), pt(70_000), pt(80_000), pt(500_000, "kz-zha", 45)], 30, now);
    expect(s).toHaveLength(1);
    expect(s[0]!.count).toBe(3);
    expect(s[0]!.avg).toBe(70_000);
    expect(s[0]!.median).toBe(70_000);
  });
  it("ignores negotiable prices", () => {
    expect(computeStats([pt(0, "kz-zha", 1, "negotiable")], 30, now)).toHaveLength(0);
  });
  it("falls back to national stats when region has few samples", () => {
    const stats = computeStats([pt(60_000, "kz-kos"), pt(65_000, "kz"), pt(70_000, "kz"), pt(75_000, "kz")], 30, now);
    const h = priceHint(stats, "sheep_ram", "kz-kos", "per_head");
    expect(h?.scope).toBe("country");
  });
  it("detects suspiciously low prices", () => {
    const [s] = computeStats([pt(60_000), pt(70_000), pt(80_000)], 30, now);
    expect(isSuspiciouslyLow(20_000, s)).toBe(true);
    expect(isSuspiciouslyLow(50_000, s)).toBe(false);
  });
  it("normalizes to per kg", () => {
    expect(normalizeToPerKg(120_000, "per_head", 60)).toBe(2_000);
    expect(normalizeToPerKg(2_500, "per_kg_live")).toBe(2_500);
    expect(normalizeToPerKg(120_000, "per_head", null)).toBeNull();
    expect(normalizeToPerKg(6_000_000, "per_lot", 60, 50)).toBe(2_000);
  });
});
