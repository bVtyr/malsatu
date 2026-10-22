/**
 * Онлайн-аукционы (v3). Ставка — транзакция с блокировкой строки аукциона: доменная функция placeBid
 * применяется к актуальному списку ставок, вставляются новые ставки (включая автоставку лидера),
 * обновляется ends_at (анти-снайпинг). Депозит — платёж через провайдера; без депозита ставка не принимается.
 */
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { sql } from "kysely";
import { AuctionCreateSchema, AuctionBidSchema, placeBid, minNextBid, currentPrice, winner, AuctionError, OFFER_TTL_HOURS, type AuctionLike } from "@malsatu/shared";
import { db } from "../../db/index.js";
import { config } from "../../config.js";
import { AppError } from "../../plugins/errors.js";
import { payments } from "../../services/payments.js";
import { notify } from "../../services/notifications.js";
import { pushToUser, getOrCreateConversation } from "../chat/routes.js";

type Exec = Pick<typeof db, "selectFrom" | "insertInto" | "updateTable">;

async function loadAuction(id: string, exec: Exec = db, lock = false) {
  if (lock) await sql`SELECT id FROM auctions WHERE id = ${id} FOR UPDATE`.execute(exec as any);
  const row = await exec.selectFrom("auctions").selectAll().where("id", "=", id).executeTakeFirst();
  if (!row) throw new AppError(404, "auction_not_found");
  const bids = await exec.selectFrom("auction_bids").selectAll().where("auction_id", "=", id).orderBy("created_at").orderBy("amount_kzt").execute();
  const a: AuctionLike = { status: row.status as any, startPriceKzt: row.start_price_kzt, bidStepKzt: row.bid_step_kzt, endsAt: row.ends_at, extensionMinutes: row.extension_minutes, depositKzt: row.deposit_kzt,
    bids: bids.map((b) => ({ userId: b.user_id, amountKzt: b.amount_kzt, at: b.created_at, maxAutoKzt: b.max_auto_kzt ?? undefined })) };
  return { row, a, bids };
}

function publicView(row: any, a: AuctionLike, viewerId?: string) {
  const w = winner(a);
  return { ...row, currentPriceKzt: a.bids.length ? currentPrice(a) : null, minNextBidKzt: minNextBid(a), bidsCount: a.bids.length, leaderIsYou: !!viewerId && w?.userId === viewerId,
    // чужие max_auto и id участников наружу не отдаём: только суммы и время
    bids: a.bids.slice(-20).reverse().map((b) => ({ amountKzt: b.amountKzt, at: b.at, mine: b.userId === viewerId })) };
}

export default async function auctionsRoutes(app: FastifyInstance) {
  app.get("/auctions", async (req) => {
    const q = z.object({ status: z.enum(["scheduled", "live", "ended"]).optional(), region: z.string().max(16).optional(), page: z.coerce.number().int().min(1).default(1) }).parse(req.query);
    const rows = await db.selectFrom("auctions").innerJoin("listings", "listings.id", "auctions.listing_id")
      .select(["auctions.id", "auctions.status", "auctions.start_price_kzt", "auctions.bid_step_kzt", "auctions.deposit_kzt", "auctions.starts_at", "auctions.ends_at", "auctions.current_price_kzt", "auctions.bids_count", "listings.title_ru", "listings.title_kk", "listings.category_code", "listings.top_region_code", "listings.quantity", "listings.id as listing_id"])
      .$if(!!q.status, (qb) => qb.where("auctions.status", "=", q.status!))
      .$if(!q.status, (qb) => qb.where("auctions.status", "in", ["scheduled", "live"]))
      .$if(!!q.region, (qb) => qb.where("listings.top_region_code", "=", q.region!))
      .orderBy("auctions.ends_at").limit(30).offset((q.page - 1) * 30).execute();
    return { items: rows };
  });

  app.get<{ Params: { id: string } }>("/auctions/:id", async (req) => {
    const { row, a } = await loadAuction(req.params.id);
    const l = await db.selectFrom("listings").select(["id", "title_ru", "title_kk", "quantity", "category_code", "top_region_code", "owner_user_id"]).where("id", "=", row.listing_id).executeTakeFirst();
    const dep = req.user ? await db.selectFrom("auction_deposits").select("status").where("auction_id", "=", row.id).where("user_id", "=", req.user.id).executeTakeFirst() : null;
    const myMax = req.user ? (await db.selectFrom("auction_bids").select("max_auto_kzt").where("auction_id", "=", row.id).where("user_id", "=", req.user.id).orderBy("created_at", "desc").executeTakeFirst())?.max_auto_kzt ?? null : null;
    return { auction: { ...publicView(row, a, req.user?.id), listing: l, depositStatus: dep?.status ?? null, myMaxAutoKzt: myMax, isOwner: req.user?.id === row.seller_id } };
  });

  app.post("/auctions", { preHandler: [app.requirePermission("listing:own")] }, async (req) => {
    const p = AuctionCreateSchema.parse(req.body);
    const l = await db.selectFrom("listings").select(["id", "owner_user_id", "status", "kind", "quantity", "price_kzt"]).where("id", "=", p.listingId).executeTakeFirst();
    if (!l || l.owner_user_id !== req.user!.id) throw new AppError(404, "listing_not_found");
    if (l.status !== "active" || l.kind !== "livestock") throw new AppError(409, "listing_not_eligible"); // аукцион только по активному живому скоту
    const me = await db.selectFrom("users").select("verification_level").where("id", "=", req.user!.id).executeTakeFirstOrThrow();
    if (me.verification_level < 2) throw new AppError(403, "verification_required");
    const startsAt = new Date(p.startsAt), endsAt = new Date(p.endsAt);
    if (startsAt.getTime() < Date.now() - 5 * 60_000) throw new AppError(400, "starts_in_past");
    const row = await db.insertInto("auctions").values({ listing_id: l.id, seller_id: req.user!.id, start_price_kzt: p.startPriceKzt, bid_step_kzt: p.bidStepKzt, deposit_kzt: p.depositKzt, starts_at: startsAt, ends_at: endsAt, extension_minutes: p.extensionMinutes, stream_url: p.streamUrl ?? null, status: startsAt <= new Date() ? "live" : "scheduled" })
      .returningAll().executeTakeFirst().catch((e) => { if (String(e?.code) === "23505") throw new AppError(409, "auction_exists"); throw e; });
    return { auction: row };
  });

  app.post<{ Params: { id: string } }>("/auctions/:id/deposit", { preHandler: [app.authenticate] }, async (req) => {
    const { row } = await loadAuction(req.params.id);
    if (row.seller_id === req.user!.id) throw new AppError(400, "cannot_bid_own");
    if (!["scheduled", "live"].includes(row.status)) throw new AppError(409, "auction_closed");
    if (row.deposit_kzt <= 0) { await db.insertInto("auction_deposits").values({ auction_id: row.id, user_id: req.user!.id, payment_id: null, status: "held" }).onConflict((oc) => oc.doNothing()).execute(); return { status: "held" }; }
    const existing = await db.selectFrom("auction_deposits").select(["status", "payment_id"]).where("auction_id", "=", row.id).where("user_id", "=", req.user!.id).executeTakeFirst();
    if (existing && ["held", "pending"].includes(existing.status)) return { status: existing.status };
    const res = await payments.createPayment({ amountKzt: row.deposit_kzt, orderId: `dep-${row.id}-${req.user!.id}`, description: "MalSatu auction deposit", returnUrl: `${config.PUBLIC_WEB_URL}/ru/auctions?id=${row.id}` });
    const pay = await db.insertInto("payments").values({ user_id: req.user!.id, provider: payments.name, provider_ref: res.providerRef, amount_kzt: row.deposit_kzt, status: res.status }).returningAll().executeTakeFirstOrThrow();
    const status = res.status === "succeeded" ? "held" : "pending";
    await db.insertInto("auction_deposits").values({ auction_id: row.id, user_id: req.user!.id, payment_id: pay.id, status }).onConflict((oc) => oc.columns(["auction_id", "user_id"]).doUpdateSet({ payment_id: pay.id, status })).execute();
    return { status, payUrl: res.payUrl };
  });

  app.post<{ Params: { id: string } }>("/auctions/:id/bid", { preHandler: [app.authenticate], config: { rateLimit: { max: 30, timeWindow: "1 minute" } } }, async (req) => {
    const b = AuctionBidSchema.parse(req.body);
    const uid = req.user!.id;
    const out = await db.transaction().execute(async (trx) => {
      const { row, a } = await loadAuction(req.params.id, trx as any, true);
      if (row.seller_id === uid) throw new AppError(400, "cannot_bid_own");
      // переводим scheduled→live по времени прямо здесь, чтобы не ждать тика job
      if (row.status === "scheduled" && row.starts_at <= new Date()) { a.status = "live"; await trx.updateTable("auctions").set({ status: "live" }).where("id", "=", row.id).execute(); }
      const dep = await trx.selectFrom("auction_deposits").select("status").where("auction_id", "=", row.id).where("user_id", "=", uid).executeTakeFirst();
      const before = a.bids.length; const prevLeader = winner(a);
      try { placeBid(a, uid, b.amountKzt, dep?.status === "held", new Date(), b.maxAutoKzt); } catch (e) { if (e instanceof AuctionError) throw new AppError(409, e.code); throw e; }
      for (const nb of a.bids.slice(before)) await trx.insertInto("auction_bids").values({ auction_id: row.id, user_id: nb.userId, amount_kzt: nb.amountKzt, max_auto_kzt: nb.maxAutoKzt ?? null }).execute();
      await trx.updateTable("auctions").set({ ends_at: a.endsAt, current_price_kzt: currentPrice(a), bids_count: a.bids.length }).where("id", "=", row.id).execute();
      const lead = winner(a)!;
      return { row, a, prevLeader, lead };
    });
    const view = publicView(out.row, out.a, uid);
    if (out.prevLeader && out.prevLeader.userId !== out.lead.userId && out.prevLeader.userId !== uid) {
      pushToUser(out.prevLeader.userId, { type: "auction", auctionId: out.row.id, event: "outbid", currentPriceKzt: view.currentPriceKzt });
      await notify({ userId: out.prevLeader.userId, type: "deal", titleRu: "Вашу ставку перебили", titleKk: "Ұсынысыңыз асып түсті", data: { auctionId: out.row.id } });
    }
    pushToUser(out.row.seller_id, { type: "auction", auctionId: out.row.id, event: "bid", currentPriceKzt: view.currentPriceKzt });
    return { auction: view, youLead: out.lead.userId === uid };
  });

  app.post<{ Params: { id: string } }>("/auctions/:id/cancel", { preHandler: [app.authenticate] }, async (req) => {
    const { row, a } = await loadAuction(req.params.id);
    const isAdmin = req.user!.roles.includes("admin");
    if (row.seller_id !== req.user!.id && !isAdmin) throw new AppError(403, "not_owner");
    if (!["scheduled", "live"].includes(row.status)) throw new AppError(409, "auction_closed");
    if (a.bids.length > 0 && !isAdmin) throw new AppError(409, "has_bids"); // с ставками отменяет только администратор
    await db.updateTable("auctions").set({ status: "cancelled", settled_at: new Date() }).where("id", "=", row.id).where("status", "in", ["scheduled", "live"]).execute();
    await refundDeposits(row.id);
    return { ok: true };
  });
}

/** Возврат депозитов (идемпотентно: условный UPDATE до вызова провайдера). except — победитель, чей депозит остаётся. */
export async function refundDeposits(auctionId: string, except?: string) {
  const deps = await db.selectFrom("auction_deposits").selectAll().where("auction_id", "=", auctionId).where("status", "in", ["held", "pending"]).execute();
  for (const d of deps) {
    if (except && d.user_id === except) continue;
    const claimed = await db.updateTable("auction_deposits").set({ status: "refunded" }).where("auction_id", "=", auctionId).where("user_id", "=", d.user_id).where("status", "=", d.status).executeTakeFirst();
    if (!claimed.numUpdatedRows || !d.payment_id) continue;
    const pay = await db.selectFrom("payments").selectAll().where("id", "=", d.payment_id).executeTakeFirst();
    if (pay && pay.status === "succeeded") {
      const upd = await db.updateTable("payments").set({ status: "refunded", refunded_kzt: pay.amount_kzt, updated_at: new Date() }).where("id", "=", pay.id).where("status", "=", "succeeded").executeTakeFirst();
      if (upd.numUpdatedRows) await payments.refund(pay.provider_ref ?? "", pay.amount_kzt);
    }
  }
}

/** Job: scheduled→live, live→ended; победителю — принятый оффер (48 ч на сделку с эскроу), проигравшим — возврат депозитов. */
export async function settleAuctions(now = new Date()) {
  await db.updateTable("auctions").set({ status: "live" }).where("status", "=", "scheduled").where("starts_at", "<=", now).execute();
  const due = await db.selectFrom("auctions").select("id").where("status", "=", "live").where("ends_at", "<=", now).execute();
  let ended = 0, awarded = 0;
  for (const { id } of due) {
    const r = await db.transaction().execute(async (trx) => {
      const { row, a, bids } = await loadAuction(id, trx as any, true);
      if (row.status !== "live" || row.ends_at > now) return null; // продлили ставкой в последнюю минуту
      const w = winner(a);
      const winnerBid = w ? bids.filter((b) => b.user_id === w.userId && b.amount_kzt === w.amountKzt).at(-1) : undefined;
      let offerId: string | null = null;
      if (w && winnerBid) {
        const l = await trx.selectFrom("listings").select(["id", "owner_user_id", "quantity"]).where("id", "=", row.listing_id).executeTakeFirstOrThrow();
        const conv = await getOrCreateConversation(l.id, w.userId);
        const offer = await trx.insertInto("offers").values({ listing_id: l.id, conversation_id: conv.id, buyer_id: w.userId, seller_id: l.owner_user_id, from_role: "seller", price_kzt: Math.ceil(w.amountKzt / Math.max(1, l.quantity)), quantity: l.quantity, comment: "auction", status: "accepted", responded_at: now, expires_at: new Date(now.getTime() + OFFER_TTL_HOURS * 3600_000) }).returningAll().executeTakeFirstOrThrow();
        offerId = offer.id;
      }
      await trx.updateTable("auctions").set({ status: "ended", winner_bid_id: winnerBid?.id ?? null, winner_offer_id: offerId, settled_at: now }).where("id", "=", id).execute();
      return { row, w, offerId };
    });
    if (!r) continue;
    ended++;
    if (r.w) {
      awarded++;
      await db.updateTable("auction_deposits").set({ status: "applied" }).where("auction_id", "=", id).where("user_id", "=", r.w.userId).where("status", "=", "held").execute();
      await notify({ userId: r.w.userId, type: "deal", titleRu: "Вы выиграли аукцион: оформите безопасную сделку в течение 48 часов", titleKk: "Сіз аукционда жеңдіңіз: 48 сағат ішінде қауіпсіз мәміле рәсімдеңіз", data: { auctionId: id, offerId: r.offerId } });
      await notify({ userId: r.row.seller_id, type: "deal", titleRu: "Аукцион завершён, есть победитель", titleKk: "Аукцион аяқталды, жеңімпаз бар", data: { auctionId: id } });
    } else await notify({ userId: r.row.seller_id, type: "deal", titleRu: "Аукцион завершён без ставок", titleKk: "Аукцион ұсыныссыз аяқталды", data: { auctionId: id } });
    await refundDeposits(id, r.w?.userId);
  }
  // депозит победителя: сделка по офферу оплачена → возвращаем; оффер истёк без сделки → удерживаем (forfeited)
  const applied = await db.selectFrom("auctions").innerJoin("offers", "offers.id", "auctions.winner_offer_id").innerJoin("auction_deposits", (j) => j.onRef("auction_deposits.auction_id", "=", "auctions.id").onRef("auction_deposits.user_id", "=", "offers.buyer_id"))
    .leftJoin("deals", "deals.offer_id", "offers.id")
    .select(["auctions.id", "offers.buyer_id", "offers.status as offer_status", "deals.status as deal_status"]).where("auctions.status", "=", "ended").where("auction_deposits.status", "=", "applied").execute();
  for (const s of applied) {
    if (s.deal_status && !["created", "cancelled"].includes(s.deal_status)) { await db.updateTable("auction_deposits").set({ status: "held" }).where("auction_id", "=", s.id).where("user_id", "=", s.buyer_id).where("status", "=", "applied").execute(); await refundDeposits(s.id); }
    else if (s.offer_status === "expired" && !s.deal_status) await db.updateTable("auction_deposits").set({ status: "forfeited" }).where("auction_id", "=", s.id).where("user_id", "=", s.buyer_id).where("status", "=", "applied").execute();
  }
  return { ended, awarded };
}
