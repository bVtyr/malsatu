import { describe, it, expect } from "vitest";
import { calcCommission, pickRule, DEFAULT_COMMISSION_RULES } from "../src/domain/commission.js";

describe("commission", () => {
  it("picks most specific rule by priority", () => {
    expect(pickRule(DEFAULT_COMMISSION_RULES, "livestock", "too")?.percent).toBe(2);
    expect(pickRule(DEFAULT_COMMISSION_RULES, "livestock", "individual")?.percent).toBe(2.5);
    expect(pickRule(DEFAULT_COMMISSION_RULES, "meat", "ip")?.percent).toBe(4);
  });
  it("applies percent with min and max caps", () => {
    expect(calcCommission(1_000_000, "livestock", "individual").commissionKzt).toBe(25_000);
    expect(calcCommission(10_000, "livestock", "individual").commissionKzt).toBe(2_000); // min
    expect(calcCommission(100_000_000, "livestock", "individual").commissionKzt).toBe(150_000); // max
  });
  it("rounds up to whole tenge", () => {
    expect(calcCommission(33_333, "meat", "individual").commissionKzt).toBe(1_334);
  });
  it("promo discount reduces fee, never exceeds amount", () => {
    expect(calcCommission(1_000_000, "livestock", "individual", DEFAULT_COMMISSION_RULES, 50).commissionKzt).toBe(12_500);
    expect(calcCommission(300, "meat", "individual").commissionKzt).toBe(300);
    expect(calcCommission(0, "meat", "individual").commissionKzt).toBe(0);
  });
  it("custom rules from admin override defaults", () => {
    const rules = [{ category: "*" as const, accountType: "*" as const, percent: 1, minKzt: 0, maxKzt: null, priority: 0 }];
    expect(calcCommission(500_000, "livestock", "kh", rules).commissionKzt).toBe(5_000);
  });
});
