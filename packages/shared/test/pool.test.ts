import { describe, it, expect } from "vitest";
import { reserveShare, payShare, settleDeadline, unitsFree, sharePrice, distributeMeat, PoolError, type PoolLike } from "../src/domain/pool.js";

const mk = (over: Partial<PoolLike> = {}): PoolLike => ({ status: "open", totalPriceKzt: 800_000, deadline: new Date("2026-12-01T00:00:00Z"), shares: [], reservationHoldMinutes: 30, ...over });
const t = (s: string) => new Date(s);

describe("sogym pool (складчина)", () => {
  it("share price is proportional and rounded up", () => {
    const p = mk({ totalPriceKzt: 800_001 });
    expect(sharePrice(p, "1/2")).toBe(400_001);
    expect(sharePrice(p, "1/4")).toBe(200_001);
    expect(sharePrice(p, "1/8")).toBe(100_001);
  });
  it("reserves and pays shares until filled", () => {
    const p = mk();
    const now = t("2026-11-10T10:00:00Z");
    const a = reserveShare(p, "u1", "1/2", "s1", now);
    const b = reserveShare(p, "u2", "1/4", "s2", now);
    const c = reserveShare(p, "u3", "1/8", "s3", now);
    const d = reserveShare(p, "u4", "1/8", "s4", now);
    expect(unitsFree(p, now)).toBe(0);
    expect(() => reserveShare(p, "u5", "1/8", "s5", now)).toThrow(PoolError);
    for (const s of [a, b, c, d]) payShare(p, s.id, now);
    expect(p.status).toBe("filled");
  });
  it("expired reservation frees units and cannot be paid", () => {
    const p = mk();
    reserveShare(p, "u1", "1/2", "s1", t("2026-11-10T10:00:00Z"));
    const later = t("2026-11-10T10:31:00Z");
    expect(unitsFree(p, later)).toBe(8);
    expect(() => payShare(p, "s1", later)).toThrow(/reservation_expired|истекла/);
  });
  it("deadline not reached: refunds everyone paid, cancels reservations, pool expired", () => {
    const p = mk();
    const s1 = reserveShare(p, "u1", "1/2", "s1", t("2026-11-10T10:00:00Z"));
    payShare(p, s1.id, t("2026-11-10T10:05:00Z"));
    reserveShare(p, "u2", "1/4", "s2", t("2026-11-30T23:50:00Z"));
    expect(settleDeadline(p, t("2026-11-30T00:00:00Z")).refunds).toHaveLength(0); // ещё рано
    const r = settleDeadline(p, t("2026-12-01T00:00:01Z"));
    expect(r.refunds.map((s) => s.id)).toEqual(["s1"]);
    expect(p.status).toBe("expired");
    expect(p.shares.find((s) => s.id === "s2")?.status).toBe("cancelled");
  });
  it("cannot pay into a cancelled pool or after the deadline", () => {
    const p = mk();
    const s = reserveShare(p, "u1", "1/8", "s1", t("2026-11-10T10:00:00Z"));
    p.status = "cancelled";
    expect(() => payShare(p, s.id, t("2026-11-10T10:01:00Z"))).toThrow(/pool_not_open|закрыт/);
    const q = mk(); const s2 = reserveShare(q, "u1", "1/8", "s2", t("2026-11-30T23:59:00Z"));
    expect(() => payShare(q, s2.id, t("2026-12-01T00:00:01Z"))).toThrow(/deadline/);
  });

  it("cannot reserve after deadline", () => {
    const p = mk();
    expect(() => reserveShare(p, "u1", "1/8", "s1", t("2026-12-02T00:00:00Z"))).toThrow(/deadline/);
  });
  it("distributes carcass weight proportionally", () => {
    const p = mk();
    const now = t("2026-11-10T10:00:00Z");
    payShare(p, reserveShare(p, "u1", "1/2", "s1", now).id, now);
    payShare(p, reserveShare(p, "u2", "1/2", "s2", now).id, now);
    expect(distributeMeat(p, 220)).toEqual([{ shareId: "s1", userId: "u1", units: 4, kg: 110 }, { shareId: "s2", userId: "u2", units: 4, kg: 110 }]);
  });
});
