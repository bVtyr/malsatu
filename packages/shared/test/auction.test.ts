import { describe, it, expect } from "vitest";
import { placeBid, minNextBid, winner, currentPrice, type AuctionLike } from "../src/domain/auction.js";

const mk = (over: Partial<AuctionLike> = {}): AuctionLike => ({ status: "live", startPriceKzt: 500_000, bidStepKzt: 10_000, endsAt: new Date("2026-11-01T12:00:00Z"), extensionMinutes: 5, depositKzt: 20_000, bids: [], ...over });
const t = (s: string) => new Date(s);

describe("auction", () => {
  it("first bid must be at least the start price", () => {
    const a = mk();
    expect(minNextBid(a)).toBe(500_000);
    expect(() => placeBid(a, "u1", 490_000, true, t("2026-11-01T11:00:00Z"))).toThrow(/too_low|Минимальная/);
    placeBid(a, "u1", 500_000, true, t("2026-11-01T11:00:00Z"));
    expect(currentPrice(a)).toBe(500_000); expect(minNextBid(a)).toBe(510_000);
  });
  it("requires a deposit and a live auction", () => {
    expect(() => placeBid(mk(), "u1", 500_000, false, t("2026-11-01T11:00:00Z"))).toThrow(/deposit/);
    expect(() => placeBid(mk({ status: "scheduled" }), "u1", 500_000, true, t("2026-11-01T11:00:00Z"))).toThrow(/not_live/);
  });
  it("auto-bid of the previous leader outbids by one step", () => {
    const a = mk();
    placeBid(a, "u1", 500_000, true, t("2026-11-01T11:00:00Z"), 600_000);
    placeBid(a, "u2", 520_000, true, t("2026-11-01T11:01:00Z"));
    expect(winner(a)?.userId).toBe("u1"); expect(winner(a)?.amountKzt).toBe(530_000);
  });
  it("extends the end when a bid lands in the last minutes (anti-sniping)", () => {
    const a = mk();
    placeBid(a, "u1", 500_000, true, t("2026-11-01T11:58:00Z"));
    expect(a.endsAt.toISOString()).toBe("2026-11-01T12:03:00.000Z");
    expect(() => placeBid(a, "u2", 510_000, true, t("2026-11-01T12:04:00Z"))).toThrow(/ended/);
  });
});
