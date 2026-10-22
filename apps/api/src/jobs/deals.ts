import { db } from "../db/index.js";
import { dealsService } from "../modules/deals/routes.js";
/** Авто-подтверждение сделок после окна осмотра; просроченные брони без оплаты (24 ч) — отмена. */
export async function autoConfirmDeals() {
  const rows = await db.selectFrom("deals").selectAll().where("status", "=", "inspection").execute();
  const confirmed = await dealsService.autoConfirmExpired(rows.map((r) => ({ id: r.id, listingId: r.listing_id, buyerId: r.buyer_id, sellerId: r.seller_id, offerId: r.offer_id, mode: r.mode as any, kind: r.kind as any, status: r.status as any, quantity: r.quantity, unitPriceKzt: r.unit_price_kzt, amountKzt: r.amount_kzt, prepaymentKzt: r.prepayment_kzt, commissionKzt: r.commission_kzt, deliveryOption: r.delivery_option, inspectionWindowHours: r.inspection_window_hours, inspectionStartedAt: r.inspection_started_at, paidAt: r.paid_at, completedAt: r.completed_at })));
  const stale = await db.selectFrom("deals").select(["id", "mode"]).where("status", "=", "created").where((eb) => eb.or([eb.and([eb("mode", "!=", "direct"), eb("created_at", "<", new Date(Date.now() - 24 * 3600_000))]), eb.and([eb("mode", "=", "direct"), eb("created_at", "<", new Date(Date.now() - 72 * 3600_000))])])).execute();
  for (const d of stale) await dealsService.act(d.id, "cancel", "admin", null, { comment: d.mode === "direct" ? "auto: не подтверждено за 72 ч" : "auto: не оплачено за 24 ч" }).catch(() => undefined);
  return { confirmed: confirmed.length, cancelledUnpaid: stale.length };
}
