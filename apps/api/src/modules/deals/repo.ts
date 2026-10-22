/** PostgreSQL-реализация DealRepo. */
import { DEFAULT_COMMISSION_RULES, type AccountType, type CommissionRule, type FeeCategory } from "@malsatu/shared";
import { db } from "../../db/index.js";
import { payments } from "../../services/payments.js";
import { DealError, type DealRepo, type DealRecord } from "./service.js";
import { notify } from "../../services/notifications.js";
import { pushToUser } from "../chat/routes.js";
import { recomputeTrust } from "../../services/trust.js";

const toRecord = (r: any): DealRecord => ({
  id: r.id, listingId: r.listing_id, buyerId: r.buyer_id, sellerId: r.seller_id, offerId: r.offer_id, mode: r.mode, kind: r.kind, status: r.status, quantity: r.quantity, unitPriceKzt: r.unit_price_kzt,
  amountKzt: r.amount_kzt, prepaymentKzt: r.prepayment_kzt, commissionKzt: r.commission_kzt, deliveryOption: r.delivery_option, inspectionWindowHours: r.inspection_window_hours, inspectionStartedAt: r.inspection_started_at, paidAt: r.paid_at, completedAt: r.completed_at,
});

export const feeCategoryOf = (kind: string, categoryCode: string): FeeCategory => kind === "meat" ? "meat" : kind === "service" ? (categoryCode === "service_transport" ? "transport" : categoryCode === "service_vet" ? "vet" : "service") : categoryCode === "breeding" ? "breeding" : "livestock";

export const pgDealRepo: DealRepo = {
  async getListing(id) {
    const l = await db.selectFrom("listings").select(["id", "owner_user_id", "status", "kind", "quantity", "price_kzt", "price_type", "escrow_available", "category_code", "manual_reserved"]).where("id", "=", id).executeTakeFirst();
    return l ? { id: l.id, ownerId: l.owner_user_id, status: l.manual_reserved ? "manual_reserved" : l.status, kind: l.kind as any, quantity: l.quantity, priceKzt: l.price_kzt, priceType: l.price_type, escrowAvailable: l.escrow_available, feeCategory: feeCategoryOf(l.kind, l.category_code) } : null;
  },
  async getSellerAccountType(userId) { return ((await db.selectFrom("users").select("account_type").where("id", "=", userId).executeTakeFirst())?.account_type ?? "individual") as AccountType; },
  async getCommissionRules() {
    const rows = await db.selectFrom("commission_rules").selectAll().where("enabled", "=", true).execute();
    return rows.length ? rows.map((r): CommissionRule => ({ category: r.category as any, accountType: r.account_type as any, percent: Number(r.percent), minKzt: r.min_kzt, maxKzt: r.max_kzt, priority: r.priority })) : DEFAULT_COMMISSION_RULES;
  },
  async getOffer(id) { const o = await db.selectFrom("offers").selectAll().where("id", "=", id).executeTakeFirst(); if (!o) return null; const used = await db.selectFrom("deals").select("id").where("offer_id", "=", id).where("status", "not in", ["cancelled", "refunded"]).executeTakeFirst(); return { id: o.id, listingId: o.listing_id, buyerId: o.buyer_id, status: o.status, priceKzt: o.price_kzt, quantity: o.quantity, used: !!used }; },
  async insertDeal(d) {
    const r = await db.insertInto("deals").values({ listing_id: d.listingId, buyer_id: d.buyerId, seller_id: d.sellerId, offer_id: d.offerId, mode: d.mode, kind: d.kind, status: d.status, quantity: d.quantity, unit_price_kzt: d.unitPriceKzt, amount_kzt: d.amountKzt, prepayment_kzt: d.prepaymentKzt, commission_kzt: d.commissionKzt, delivery_option: d.deliveryOption, inspection_window_hours: d.inspectionWindowHours }).returningAll().executeTakeFirstOrThrow();
    return toRecord(r);
  },
  async getDeal(id) { const r = await db.selectFrom("deals").selectAll().where("id", "=", id).executeTakeFirst(); return r ? toRecord(r) : null; },
  async updateDeal(id, p, expectStatus) {
    const r = await db.updateTable("deals").set({ ...(p.status && { status: p.status }), ...(p.inspectionStartedAt !== undefined && { inspection_started_at: p.inspectionStartedAt }), ...(p.paidAt !== undefined && { paid_at: p.paidAt }), ...(p.completedAt !== undefined && { completed_at: p.completedAt }) }).where("id", "=", id).where("status", "=", expectStatus).returningAll().executeTakeFirst();
    if (!r) throw new DealError("invalid_transition");
    return toRecord(r);
  },
  async addEvent(e) { await db.insertInto("deal_events").values({ deal_id: e.dealId, actor_id: e.actorId, actor_role: e.actorRole, action: e.action, from_status: e.from, to_status: e.to, comment: e.comment ?? null, evidence_media_ids: e.evidence ?? [] }).execute(); },
  async reduceListingQuantity(listingId, qty) {
    // условное обновление: защищает от двух покупателей на последние головы
    const r = await db.updateTable("listings").set((eb) => ({ quantity: eb("quantity", "-", qty) })).where("id", "=", listingId).where("quantity", ">=", qty).where("status", "in", ["active", "reserved"]).executeTakeFirst();
    if (!r.numUpdatedRows) return false;
    await db.updateTable("listings").set({ status: "reserved" }).where("id", "=", listingId).where("quantity", "<=", 0).where("status", "=", "active").execute();
    return true;
  },
  async restoreListingQuantity(listingId, qty) {
    await db.updateTable("listings").set((eb) => ({ quantity: eb("quantity", "+", qty) })).where("id", "=", listingId).execute();
    await db.updateTable("listings").set({ status: "active" }).where("id", "=", listingId).where("status", "=", "reserved").where("manual_reserved", "=", false).where("quantity", ">", 0).execute();
  },
  async createPayment(p) {
    const dup = await db.selectFrom("payments").select("id").where("deal_id", "=", p.dealId).where("status", "in", ["pending", "succeeded"]).executeTakeFirst();
    if (dup) throw new Error("payment_exists");
    const res = await payments.createPayment({ amountKzt: p.amountKzt, orderId: p.dealId, description: `MalSatu deal ${p.dealId}`, returnUrl: "" });
    const row = await db.insertInto("payments").values({ deal_id: p.dealId, user_id: p.userId, provider: "mock", provider_ref: res.providerRef, amount_kzt: p.amountKzt, status: res.status }).returningAll().executeTakeFirstOrThrow();
    return { id: row.id, status: res.status };
  },
  async refundPayment(dealId, amountKzt) {
    // возвращаем по всем успешным платежам сделки, пока не наберём сумму; статус меняем условно (повторный вызов не вернёт дважды)
    let left = amountKzt;
    const pays = await db.selectFrom("payments").selectAll().where("deal_id", "=", dealId).where("status", "in", ["succeeded", "partially_refunded"]).orderBy("created_at").execute();
    for (const pay of pays) {
      if (left <= 0) break;
      const avail = pay.amount_kzt - pay.refunded_kzt; if (avail <= 0) continue;
      const part = Math.min(avail, left);
      const claimed = await db.updateTable("payments").set({ status: part >= avail ? "refunded" : "partially_refunded", refunded_kzt: pay.refunded_kzt + part, updated_at: new Date() }).where("id", "=", pay.id).where("refunded_kzt", "=", pay.refunded_kzt).executeTakeFirst();
      if (!claimed.numUpdatedRows) continue;
      await payments.refund(pay.provider_ref ?? "", part);
      left -= part;
    }
  },
  async createPayout(p) { await db.insertInto("payouts").values({ user_id: p.userId, deal_id: p.dealId, amount_kzt: p.amountKzt, destination: JSON.stringify({ type: "default" }) }).onConflict((oc) => oc.doNothing()).execute(); },
  async openDispute(p) { await db.insertInto("disputes").values({ deal_id: p.dealId, opened_by: p.openedBy, reason: p.reason, status: "awaiting_seller", deadline_at: new Date(Date.now() + 48 * 3600_000) }).onConflict((oc) => oc.doNothing()).execute(); if (p.evidence.length) { const d = await db.selectFrom("disputes").select("id").where("deal_id", "=", p.dealId).executeTakeFirst(); if (d) await db.insertInto("dispute_messages").values({ dispute_id: d.id, author_id: p.openedBy, text: p.reason, media_ids: p.evidence }).execute(); } },
  async resolveDispute(dealId, resolution, refundKzt, arbiterId) { await db.updateTable("disputes").set({ status: "resolved", resolution, refund_kzt: refundKzt, arbiter_id: arbiterId || null, resolved_at: new Date() }).where("deal_id", "=", dealId).execute(); const d = await db.selectFrom("deals").select("seller_id").where("id", "=", dealId).executeTakeFirst(); if (d) await recomputeTrust(d.seller_id).catch(() => undefined); },
  async incrementUserDeals(userId) { await db.updateTable("users").set((eb) => ({ deals_count: eb("deals_count", "+", 1) })).where("id", "=", userId).execute(); await recomputeTrust(userId).catch(() => undefined); },
  async onStatusChanged(deal, action) {
    const titles: Record<string, [string, string]> = { created: ["Новая сделка по вашему объявлению", "Хабарландыруыңыз бойынша жаңа мәміле"], paid: ["Сделка оплачена", "Мәміле төленді"], preparing: ["Продавец готовит заказ", "Сатушы тапсырысты дайындауда"], in_transit: ["Заказ в пути", "Тапсырыс жолда"], inspection: ["Начался осмотр", "Тексеру басталды"], confirmed: ["Сделка подтверждена", "Мәміле расталды"], completed: ["Сделка завершена", "Мәміле аяқталды"], cancelled: ["Сделка отменена", "Мәміле болдырылмады"], disputed: ["Открыт спор", "Дау ашылды"], refunded: ["Возврат выполнен", "Қайтарым жасалды"], partially_refunded: ["Частичный возврат", "Ішінара қайтарым"], released_to_seller: ["Спор решён в пользу продавца", "Дау сатушының пайдасына шешілді"] };
    const t = titles[deal.status]; if (!t) return;
    for (const uid of [deal.buyerId, deal.sellerId]) { pushToUser(uid, { type: "deal", deal, action }); await notify({ userId: uid, type: "deal", titleRu: t[0], titleKk: t[1], data: { dealId: deal.id, status: deal.status } }); }
  },
};
