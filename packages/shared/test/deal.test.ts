import { describe, it, expect } from "vitest";
import { applyDealAction, canTransition, DealTransitionError, inspectionWindowExpired, settlement, defaultInspectionWindowHours, type DealLike } from "../src/domain/deal.js";

const base = (over: Partial<DealLike> = {}): DealLike => ({ mode: "escrow", status: "created", kind: "livestock", amountKzt: 1_000_000, inspectionWindowHours: 24, inspectionStartedAt: null, ...over });

describe("deal state machine", () => {
  it("happy path escrow: created → paid → preparing → in_transit → inspection → confirmed → completed", () => {
    let d = base();
    d = { ...d, ...applyDealAction(d, "pay", "buyer") };
    expect(d.status).toBe("paid");
    d = { ...d, ...applyDealAction(d, "start_preparing", "seller") };
    expect(d.status).toBe("preparing");
    d = { ...d, ...applyDealAction(d, "ship", "carrier") };
    expect(d.status).toBe("in_transit");
    const t0 = new Date("2026-11-01T10:00:00Z");
    const r = applyDealAction(d, "arrive", "carrier", t0);
    d = { ...d, ...r };
    expect(d.status).toBe("inspection");
    expect(d.inspectionStartedAt).toEqual(t0);
    d = { ...d, ...applyDealAction(d, "confirm", "buyer") };
    expect(d.status).toBe("confirmed");
    d = { ...d, ...applyDealAction(d, "complete", "system") };
    expect(d.status).toBe("completed");
  });

  it("buyer cannot ship; seller cannot confirm", () => {
    const d = base({ status: "preparing" });
    expect(() => applyDealAction(d, "ship", "buyer")).toThrow(DealTransitionError);
    const i = base({ status: "inspection", inspectionStartedAt: new Date() });
    expect(() => applyDealAction(i, "confirm", "seller")).toThrow(/недоступно/);
  });

  it("direct deals cannot be paid via platform", () => {
    expect(canTransition(base({ mode: "direct" }), "pay", "buyer")).toBe(false);
  });

  it("auto-confirm only after inspection window expires (24h livestock)", () => {
    const start = new Date("2026-11-01T10:00:00Z");
    const d = base({ status: "inspection", inspectionStartedAt: start });
    expect(inspectionWindowExpired(d, new Date("2026-11-02T09:59:00Z"))).toBe(false);
    expect(() => applyDealAction(d, "auto_confirm", "system", new Date("2026-11-02T09:59:00Z"))).toThrow(/window_open|не истекло/);
    expect(applyDealAction(d, "auto_confirm", "system", new Date("2026-11-02T10:00:00Z")).status).toBe("confirmed");
  });

  it("dispute inside inspection window allowed, after window closed — not", () => {
    const start = new Date("2026-11-01T10:00:00Z");
    const d = base({ status: "inspection", inspectionStartedAt: start });
    expect(applyDealAction(d, "open_dispute", "buyer", new Date("2026-11-01T20:00:00Z")).status).toBe("disputed");
    expect(() => applyDealAction(d, "open_dispute", "buyer", new Date("2026-11-03T00:00:00Z"))).toThrow(/window_closed|истекло/);
  });

  it("meat inspection window is 4h", () => {
    expect(defaultInspectionWindowHours("meat")).toBe(4);
    expect(defaultInspectionWindowHours("livestock")).toBe(24);
  });

  it("settlement distributes money correctly", () => {
    expect(settlement(base({ status: "completed" }), 25_000)).toEqual({ toSeller: 975_000, toBuyer: 0, platformFee: 25_000 });
    expect(settlement(base({ status: "refunded" }), 25_000)).toEqual({ toSeller: 0, toBuyer: 1_000_000, platformFee: 0 });
    expect(settlement(base({ status: "partially_refunded" }), 25_000, 300_000)).toEqual({ toSeller: 675_000, toBuyer: 300_000, platformFee: 25_000 });
    expect(settlement(base({ status: "released_to_seller" }), 25_000).toSeller).toBe(975_000);
  });

  it("terminal statuses have no transitions", () => {
    for (const s of ["completed", "cancelled", "refunded"] as const) {
      expect(canTransition(base({ status: s }), "cancel", "admin")).toBe(false);
    }
  });
});
