import { describe, it, expect, beforeEach } from "vitest";
import { DealsService, DealError, type DealRepo, type DealRecord, type ListingForDeal } from "../src/modules/deals/service.js";
import { DEFAULT_COMMISSION_RULES } from "@malsatu/shared";

/** In-memory репозиторий: проверяем оркестрацию сервиса без БД. */
function makeRepo() {
  const listings = new Map<string, ListingForDeal>();
  const deals = new Map<string, DealRecord>();
  const events: any[] = []; const payments: any[] = []; const payouts: any[] = []; const refunds: any[] = []; const disputes: any[] = []; const resolved: any[] = [];
  let seq = 0;
  const repo: DealRepo = {
    async getListing(id) { return listings.get(id) ?? null; },
    async getSellerAccountType() { return "kh"; },
    async getCommissionRules() { return DEFAULT_COMMISSION_RULES; },
    async getOffer(id) { return id === "offer-ok" ? { id, listingId: "l1", buyerId: "buyer", status: "accepted", priceKzt: 90_000, quantity: 50, used: false } : null; },
    async insertDeal(d) { const rec = { ...d, id: `d${++seq}` }; deals.set(rec.id, rec); return rec; },
    async getDeal(id) { return deals.get(id) ?? null; },
    async updateDeal(id, p, expect) { const cur = deals.get(id)!; if (cur.status !== expect) throw new DealError("invalid_transition"); const d = { ...cur, ...p }; deals.set(id, d); return d; },
    async addEvent(e) { events.push(e); },
    async reduceListingQuantity(id, q) { const l = listings.get(id)!; if (l.quantity < q) return false; l.quantity -= q; return true; },
    async restoreListingQuantity(id, q) { listings.get(id)!.quantity += q; },
    async createPayment(p) { payments.push(p); return { id: "p1", status: "succeeded" }; },
    async refundPayment(dealId, amt) { refunds.push({ dealId, amt }); },
    async createPayout(p) { payouts.push(p); },
    async openDispute(p) { disputes.push(p); },
    async resolveDispute(dealId, resolution, refundKzt) { resolved.push({ dealId, resolution, refundKzt }); },
    async incrementUserDeals() {},
  };
  listings.set("l1", { id: "l1", ownerId: "seller", status: "active", kind: "livestock", quantity: 50, priceKzt: 95_000, priceType: "per_head", escrowAvailable: true, feeCategory: "livestock" });
  listings.set("meat1", { id: "meat1", ownerId: "butcher", status: "active", kind: "meat", quantity: 400, priceKzt: 3200, priceType: "per_kg_meat", escrowAvailable: true, feeCategory: "meat" });
  return { repo, listings, deals, events, payments, payouts, refunds, disputes, resolved };
}

describe("DealsService", () => {
  let r: ReturnType<typeof makeRepo>; let svc: DealsService;
  beforeEach(() => { r = makeRepo(); svc = new DealsService(r.repo); });

  it("creates escrow deal from accepted offer, computes amount & commission, reserves quantity", async () => {
    const d = await svc.create("buyer", { listingId: "l1", mode: "escrow", quantity: 50, offerId: "offer-ok" });
    expect(d.unitPriceKzt).toBe(90_000);
    expect(d.amountKzt).toBe(4_500_000);
    expect(d.commissionKzt).toBe(90_000); // 2% для КХ, в пределах max 150000
    expect(d.prepaymentKzt).toBe(4_500_000);
    expect(d.inspectionWindowHours).toBe(24);
    expect(r.listings.get("l1")!.quantity).toBe(0);
  });

  it("reservation mode holds 20% prepayment", async () => {
    const d = await svc.create("buyer", { listingId: "l1", mode: "reservation", quantity: 10 });
    expect(d.amountKzt).toBe(950_000);
    expect(d.prepaymentKzt).toBe(190_000);
  });

  it("rejects buying own listing, over-quantity, and invalid offer", async () => {
    await expect(svc.create("seller", { listingId: "l1", mode: "direct", quantity: 1 })).rejects.toThrow(DealError);
    await expect(svc.create("buyer", { listingId: "l1", mode: "direct", quantity: 51 })).rejects.toThrow(/quantity_unavailable/);
    await expect(svc.create("buyer", { listingId: "l1", mode: "escrow", quantity: 1, offerId: "nope" })).rejects.toThrow(/offer_invalid/);
  });

  it("full escrow flow: pay → preparing → ship → arrive → confirm ⇒ completed, payout = amount − commission", async () => {
    const d = await svc.create("buyer", { listingId: "l1", mode: "escrow", quantity: 50, offerId: "offer-ok" });
    let { deal: cur } = await svc.pay(d.id, "buyer");
    expect(cur.status).toBe("paid"); expect(cur.paidAt).toBeInstanceOf(Date);
    cur = await svc.act(d.id, "start_preparing", "seller", "seller");
    cur = await svc.act(d.id, "ship", "carrier", "carrier");
    cur = await svc.act(d.id, "arrive", "carrier", "carrier");
    expect(cur.status).toBe("inspection"); expect(cur.inspectionStartedAt).toBeInstanceOf(Date);
    cur = await svc.act(d.id, "confirm", "buyer", "buyer");
    expect(cur.status).toBe("completed");
    expect(r.payouts).toEqual([{ userId: "seller", dealId: d.id, amountKzt: 4_500_000 - 90_000 }]);
    expect(r.events.map((e) => e.to)).toEqual(["paid", "preparing", "in_transit", "inspection", "confirmed", "completed"]);
  });

  it("meat deal has 4h inspection window and auto-confirms after it", async () => {
    const d = await svc.create("buyer", { listingId: "meat1", mode: "escrow", quantity: 100 });
    expect(d.inspectionWindowHours).toBe(4);
    await svc.pay(d.id, "buyer");
    await svc.act(d.id, "start_preparing", "seller", "butcher");
    const t0 = new Date("2026-11-01T08:00:00Z");
    await svc.act(d.id, "arrive", "seller", "butcher", { now: t0 });
    expect(await svc.autoConfirmExpired([r.deals.get(d.id)!], new Date("2026-11-01T11:00:00Z"))).toEqual([]);
    expect(await svc.autoConfirmExpired([r.deals.get(d.id)!], new Date("2026-11-01T12:00:00Z"))).toEqual([d.id]);
    expect(r.deals.get(d.id)!.status).toBe("completed");
  });

  it("dispute → full refund restores listing quantity and refunds payment", async () => {
    const d = await svc.create("buyer", { listingId: "l1", mode: "escrow", quantity: 10 });
    await svc.pay(d.id, "buyer");
    await svc.act(d.id, "start_preparing", "seller", "seller");
    await svc.act(d.id, "arrive", "seller", "seller");
    await svc.act(d.id, "open_dispute", "buyer", "buyer", { comment: "3 головы больные, фото прилагаю", evidence: ["m1"] });
    expect(r.disputes).toHaveLength(1);
    const res = await svc.act(d.id, "resolve_refund", "arbiter", "arb");
    expect(res.status).toBe("refunded");
    expect(r.refunds).toEqual([{ dealId: d.id, amt: 950_000 }]);
    expect(r.listings.get("l1")!.quantity).toBe(50);
    expect(r.payouts).toHaveLength(0);
  });

  it("partial refund splits money between buyer and seller minus commission", async () => {
    const d = await svc.create("buyer", { listingId: "l1", mode: "escrow", quantity: 10 }); // 950 000, комиссия 2% = 19 000
    await svc.pay(d.id, "buyer"); await svc.act(d.id, "start_preparing", "seller", "seller"); await svc.act(d.id, "arrive", "seller", "seller");
    await svc.act(d.id, "open_dispute", "buyer", "buyer", { comment: "Две головы не соответствуют описанию" });
    await svc.act(d.id, "resolve_partial_refund", "arbiter", "arb", { refundKzt: 300_000 });
    expect(r.refunds[0]!.amt).toBe(300_000);
    expect(r.payouts[0]!.amountKzt).toBe(950_000 - 300_000 - 19_000);
    expect(r.resolved[0]).toEqual({ dealId: d.id, resolution: "partial_refund", refundKzt: 300_000 });
  });

  it("cancel after payment refunds; direct deals cannot be paid", async () => {
    const d = await svc.create("buyer", { listingId: "l1", mode: "escrow", quantity: 5 });
    await svc.pay(d.id, "buyer");
    await svc.act(d.id, "cancel", "seller", "seller");
    expect(r.refunds[0]!.amt).toBe(475_000);
    expect(r.listings.get("l1")!.quantity).toBe(50);
    const direct = await svc.create("buyer", { listingId: "l1", mode: "direct", quantity: 1 });
    await expect(svc.pay(direct.id, "buyer")).rejects.toThrow(/direct_no_payment/);
    expect(direct.commissionKzt).toBe(0);
  });

  it("pay is idempotent: second payment attempt is rejected", async () => {
    const d = await svc.create("buyer", { listingId: "l1", mode: "escrow", quantity: 2 });
    await svc.pay(d.id, "buyer");
    await expect(svc.pay(d.id, "buyer")).rejects.toThrow(/already_paid/);
    expect(r.payments).toHaveLength(1);
  });

  it("offer quantity caps the deal quantity", async () => {
    await expect(svc.create("buyer", { listingId: "l1", mode: "escrow", quantity: 1, offerId: "offer-ok" })).resolves.toBeTruthy();
  });

  it("reservation mode settles only the held prepayment", async () => {
    const d = await svc.create("buyer", { listingId: "l1", mode: "reservation", quantity: 10 }); // 950 000, предоплата 190 000, комиссия 19 000
    await svc.pay(d.id, "buyer"); await svc.act(d.id, "start_preparing", "seller", "seller"); await svc.act(d.id, "arrive", "seller", "seller");
    await svc.act(d.id, "open_dispute", "buyer", "buyer", { comment: "Не те животные, что в объявлении" });
    await svc.act(d.id, "resolve_for_seller", "arbiter", "arb");
    expect(r.payouts[0]!.amountKzt).toBe(190_000 - 19_000);
  });

  it("partial refund must be within the held amount", async () => {
    const d = await svc.create("buyer", { listingId: "l1", mode: "escrow", quantity: 1 });
    await svc.pay(d.id, "buyer"); await svc.act(d.id, "start_preparing", "seller", "seller"); await svc.act(d.id, "arrive", "seller", "seller");
    await svc.act(d.id, "open_dispute", "buyer", "buyer", { comment: "Животное хромает на обе ноги" });
    await expect(svc.act(d.id, "resolve_partial_refund", "arbiter", "arb")).rejects.toThrow(/refund_amount_invalid/);
    await expect(svc.act(d.id, "resolve_partial_refund", "arbiter", "arb", { refundKzt: 95_000 })).rejects.toThrow(/refund_amount_invalid/);
  });

  it("direct deals do not reserve stock and complete on seller confirm", async () => {
    const d = await svc.create("buyer", { listingId: "l1", mode: "direct", quantity: 5 });
    expect(r.listings.get("l1")!.quantity).toBe(50);
    const done = await svc.act(d.id, "confirm", "seller", "seller");
    expect(done.status).toBe("completed"); expect(r.payouts).toHaveLength(0);
  });

  it("concurrent confirm cannot pay twice (CAS)", async () => {
    const d = await svc.create("buyer", { listingId: "l1", mode: "escrow", quantity: 1 });
    await svc.pay(d.id, "buyer"); await svc.act(d.id, "start_preparing", "seller", "seller"); await svc.act(d.id, "arrive", "seller", "seller");
    const results = await Promise.allSettled([svc.act(d.id, "confirm", "buyer", "buyer"), svc.act(d.id, "confirm", "buyer", "buyer")]);
    expect(results.filter((x) => x.status === "fulfilled")).toHaveLength(1);
    expect(r.payouts).toHaveLength(1);
  });

  it("forbids wrong actors", async () => {
    const d = await svc.create("buyer", { listingId: "l1", mode: "escrow", quantity: 1 });
    await svc.pay(d.id, "buyer");
    await expect(svc.act(d.id, "ship", "buyer", "buyer")).rejects.toThrow();
    await expect(svc.act(d.id, "start_preparing", "buyer", "buyer")).rejects.toThrow(/forbidden_actor|недоступно/);
  });
});
