/**
 * Сервис сделок. Репозиторий инжектируется (интерфейс DealRepo) — логика тестируется in-memory без БД.
 * Режимы: direct (витрина, без денег), reservation (частичная предоплата), escrow (полная сумма удерживается до осмотра).
 */
import {
  applyDealAction, calcCommission, defaultInspectionWindowHours, settlement, type DealAction, type DealActor, type DealMode, type DealStatus, type CommissionRule, type AccountType, type FeeCategory, type DealKind,
} from "@malsatu/shared";

export interface DealRecord {
  id: string; listingId: string; buyerId: string; sellerId: string; offerId: string | null; mode: DealMode; kind: DealKind; status: DealStatus; quantity: number;
  unitPriceKzt: number; amountKzt: number; prepaymentKzt: number; commissionKzt: number; deliveryOption: string; inspectionWindowHours: number; inspectionStartedAt: Date | null; paidAt: Date | null; completedAt: Date | null;
}
export interface ListingForDeal { id: string; ownerId: string; status: string; kind: DealKind; quantity: number; priceKzt: number | null; priceType: string; escrowAvailable: boolean; feeCategory: FeeCategory }
export interface DealRepo {
  getListing(id: string): Promise<ListingForDeal | null>;
  getSellerAccountType(userId: string): Promise<AccountType>;
  getCommissionRules(): Promise<CommissionRule[]>;
  getOffer(id: string): Promise<{ id: string; listingId: string; buyerId: string; status: string; priceKzt: number; quantity: number; used: boolean } | null>;
  insertDeal(d: Omit<DealRecord, "id">): Promise<DealRecord>;
  getDeal(id: string): Promise<DealRecord | null>;
  /** Обновление с проверкой ожидаемого статуса (CAS); при расхождении бросает DealError("invalid_transition"). */
  updateDeal(id: string, patch: Partial<DealRecord>, expectStatus: DealStatus): Promise<DealRecord>;
  addEvent(e: { dealId: string; actorId: string | null; actorRole: DealActor; action: DealAction; from: DealStatus; to: DealStatus; comment?: string; evidence?: string[] }): Promise<void>;
  /** Атомарно уменьшает количество; false, если товара уже не хватает (гонка покупателей). */
  reduceListingQuantity(listingId: string, qty: number): Promise<boolean>;
  restoreListingQuantity(listingId: string, qty: number): Promise<void>;
  createPayment(p: { dealId: string; userId: string; amountKzt: number }): Promise<{ id: string; status: "pending" | "succeeded"; payUrl?: string }>;
  refundPayment(dealId: string, amountKzt: number): Promise<void>;
  createPayout(p: { userId: string; dealId: string; amountKzt: number }): Promise<void>;
  openDispute(p: { dealId: string; openedBy: string; reason: string; evidence: string[] }): Promise<void>;
  resolveDispute(dealId: string, resolution: "refund" | "partial_refund" | "for_seller", refundKzt: number | null, arbiterId: string): Promise<void>;
  incrementUserDeals(userId: string): Promise<void>;
  onStatusChanged?(deal: DealRecord, action: DealAction): Promise<void>;
}

export class DealError extends Error { constructor(public code: string, m = code) { super(m); } }

export const RESERVATION_PREPAYMENT_PERCENT = 20;

export class DealsService {
  constructor(private repo: DealRepo) {}

  async create(buyerId: string, input: { listingId: string; mode: DealMode; quantity: number; offerId?: string; deliveryOption?: string }): Promise<DealRecord> {
    const l = await this.repo.getListing(input.listingId);
    if (!l || !["active", "reserved"].includes(l.status)) throw new DealError("listing_unavailable");
    if (l.ownerId === buyerId) throw new DealError("cannot_buy_own");
    if (input.quantity < 1 || input.quantity > l.quantity) throw new DealError("quantity_unavailable");
    if (input.mode === "escrow" && !l.escrowAvailable) throw new DealError("escrow_not_available");
    let unit = l.priceKzt ?? 0;
    if (input.offerId) {
      const o = await this.repo.getOffer(input.offerId);
      if (!o || o.listingId !== l.id || o.buyerId !== buyerId || o.status !== "accepted" || o.used) throw new DealError("offer_invalid");
      if (input.quantity > o.quantity) throw new DealError("offer_quantity_exceeded");
      unit = o.priceKzt;
    }
    if (input.mode !== "direct" && unit <= 0) throw new DealError("price_required");
    const amount = l.priceType === "per_lot" ? unit : unit * input.quantity;
    const accountType = await this.repo.getSellerAccountType(l.ownerId);
    const rules = await this.repo.getCommissionRules();
    const { commissionKzt } = input.mode === "direct" ? { commissionKzt: 0 } : calcCommission(amount, l.feeCategory, accountType, rules);
    if (l.kind === "wanted") throw new DealError("listing_unavailable");
    if (l.priceType === "per_lot" && input.quantity !== l.quantity) throw new DealError("lot_sold_whole");
    if (input.mode !== "direct" && !(await this.repo.reduceListingQuantity(l.id, input.quantity))) throw new DealError("quantity_unavailable");
    let deal: DealRecord;
    try {
      deal = await this.repo.insertDeal({
      listingId: l.id, buyerId, sellerId: l.ownerId, offerId: input.offerId ?? null, mode: input.mode, kind: l.kind, status: "created", quantity: input.quantity,
      unitPriceKzt: unit, amountKzt: amount, prepaymentKzt: input.mode === "reservation" ? Math.ceil((amount * RESERVATION_PREPAYMENT_PERCENT) / 100) : input.mode === "escrow" ? amount : 0,
      commissionKzt, deliveryOption: input.deliveryOption ?? "pickup", inspectionWindowHours: defaultInspectionWindowHours(l.kind), inspectionStartedAt: null, paidAt: null, completedAt: null,
      });
    } catch (e) { if (input.mode !== "direct") await this.repo.restoreListingQuantity(l.id, input.quantity); throw e; }
    await this.repo.onStatusChanged?.(deal, "cancel" as DealAction); // уведомление продавцу о новой сделке (статус created)
    return deal;
  }

  /** Инициировать оплату (escrow/reservation). mock-провайдер отвечает succeeded сразу → переводим в paid. */
  async pay(dealId: string, buyerId: string): Promise<{ deal: DealRecord; payUrl?: string }> {
    const d = await this.getOrThrow(dealId);
    if (d.buyerId !== buyerId) throw new DealError("forbidden");
    if (d.mode === "direct") throw new DealError("direct_no_payment");
    if (d.status !== "created") throw new DealError("already_paid");
    const p = await this.repo.createPayment({ dealId, userId: buyerId, amountKzt: d.prepaymentKzt });
    if (p.status === "succeeded") return { deal: await this.act(dealId, "pay", "system", null) };
    return { deal: d, payUrl: p.payUrl }; // реальный провайдер: покупатель уходит на страницу оплаты, статус придёт вебхуком
  }

  /** Подтверждение оплаты вебхуком провайдера (после условного перевода платежа в succeeded). */
  async markPaid(dealId: string): Promise<DealRecord> {
    const d = await this.getOrThrow(dealId);
    if (d.status !== "created") return d; // уже обработано
    return this.act(dealId, "pay", "system", null);
  }

  async act(dealId: string, action: DealAction, actor: DealActor, actorId: string | null, opts: { comment?: string; evidence?: string[]; now?: Date; refundKzt?: number } = {}): Promise<DealRecord> {
    const d = await this.getOrThrow(dealId);
    const now = opts.now ?? new Date();
    const r = applyDealAction({ mode: d.mode, status: d.status, kind: d.kind, amountKzt: d.amountKzt, inspectionWindowHours: d.inspectionWindowHours, inspectionStartedAt: d.inspectionStartedAt, paidAt: d.paidAt }, action, actor, now);
    // Продавец не может начать окно осмотра сам, если доставку делает не покупатель (самовывоз): иначе авто-подтверждение выплатит деньги без получения товара
    if (action === "arrive" && actor === "seller" && d.deliveryOption !== "pickup") throw new DealError("seller_cannot_start_inspection");
    if (action === "open_dispute" && !(opts.comment && opts.comment.trim().length >= 10)) throw new DealError("dispute_reason_required");
    // Удержанная сумма: в режиме брони у платформы только предоплата; комиссия не может превышать удержанное
    const held = d.mode === "reservation" ? d.prepaymentKzt : d.mode === "escrow" ? d.amountKzt : 0;
    const fee = Math.min(d.commissionKzt, held);
    if (action === "resolve_partial_refund") {
      const refund = opts.refundKzt ?? 0;
      if (!(refund > 0 && refund < held)) throw new DealError("refund_amount_invalid");
    }
    const patch: Partial<DealRecord> = { status: r.status };
    if (r.inspectionStartedAt) patch.inspectionStartedAt = r.inspectionStartedAt;
    if (action === "pay") patch.paidAt = now;
    if (r.status === "completed") patch.completedAt = now;
    // compare-and-set: переход применяется только если статус не изменился параллельно (двойной confirm, двойной cancel)
    const updated = await this.repo.updateDeal(dealId, patch, d.status);
    await this.repo.addEvent({ dealId, actorId, actorRole: actor, action, from: d.status, to: r.status, comment: opts.comment, evidence: opts.evidence });

    if (action === "open_dispute") await this.repo.openDispute({ dealId, openedBy: actorId ?? "", reason: opts.comment ?? "", evidence: opts.evidence ?? [] });
    if (r.status === "cancelled") {
      await this.repo.restoreListingQuantity(d.listingId, d.quantity);
      if (d.paidAt && held > 0) await this.repo.refundPayment(dealId, held);
    }
    if (r.status === "confirmed") {
      const s = settlement({ ...updated, mode: d.mode, kind: d.kind, inspectionWindowHours: d.inspectionWindowHours, amountKzt: held, status: "completed" } as any, fee);
      if (held > 0) await this.repo.createPayout({ userId: d.sellerId, dealId, amountKzt: s.toSeller });
      await this.repo.incrementUserDeals(d.sellerId); await this.repo.incrementUserDeals(d.buyerId);
      await this.repo.onStatusChanged?.(updated, action);
      return this.act(dealId, "complete", "system", null, { now });
    }
    if (r.status === "refunded" || r.status === "partially_refunded" || r.status === "released_to_seller") {
      const resolution = r.status === "refunded" ? "refund" : r.status === "partially_refunded" ? "partial_refund" : "for_seller";
      const refund = r.status === "refunded" ? held : r.status === "partially_refunded" ? Math.min(opts.refundKzt ?? 0, held) : 0;
      await this.repo.resolveDispute(dealId, resolution, refund || null, actorId ?? "");
      if (refund > 0) await this.repo.refundPayment(dealId, refund);
      const s = settlement({ ...updated, mode: d.mode, kind: d.kind, inspectionWindowHours: d.inspectionWindowHours, amountKzt: held } as any, fee, refund);
      if (s.toSeller > 0) await this.repo.createPayout({ userId: d.sellerId, dealId, amountKzt: s.toSeller });
      if (r.status === "refunded") await this.repo.restoreListingQuantity(d.listingId, d.quantity);
    }
    await this.repo.onStatusChanged?.(updated, action);
    return updated;
  }

  /** Авто-подтверждение по истечении окна осмотра (job). */
  async autoConfirmExpired(deals: DealRecord[], now = new Date()): Promise<string[]> {
    const done: string[] = [];
    for (const d of deals) {
      if (d.status !== "inspection") continue;
      try { await this.act(d.id, "auto_confirm", "system", null, { now }); done.push(d.id); } catch { /* окно ещё открыто */ }
    }
    return done;
  }

  private async getOrThrow(id: string) { const d = await this.repo.getDeal(id); if (!d) throw new DealError("deal_not_found"); return d; }
}
