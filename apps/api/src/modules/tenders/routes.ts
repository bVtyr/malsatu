/**
 * Тендеры (v3): покупатель (мясокомбинат, ресторан, госзакуп) публикует требование, продавцы с подтверждённым
 * ИИН/БИН подают предложения (одно на продавца, можно обновить), покупатель выбирает победителя.
 * Если к предложению приложено объявление — сразу создаётся эскроу-сделка через принятый оффер.
 */
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { sql } from "kysely";
import { TenderCreateSchema, TenderBidSchema, OFFER_TTL_HOURS } from "@malsatu/shared";
import { db } from "../../db/index.js";
import { AppError } from "../../plugins/errors.js";
import { notify } from "../../services/notifications.js";
import { getOrCreateConversation } from "../chat/routes.js";
import { dealsService } from "../deals/routes.js";
import { DealError } from "../deals/service.js";

export default async function tendersRoutes(app: FastifyInstance) {
  app.get("/tenders", async (req) => {
    const q = z.object({ status: z.enum(["open", "closed", "awarded"]).default("open"), region: z.string().max(16).optional(), category: z.string().max(64).optional(), page: z.coerce.number().int().min(1).default(1) }).parse(req.query);
    const rows = await db.selectFrom("tenders").innerJoin("users", "users.id", "tenders.buyer_id")
      .select(["tenders.id", "tenders.title_ru", "tenders.title_kk", "tenders.category_code", "tenders.quantity", "tenders.region_codes", "tenders.deadline", "tenders.status", "tenders.created_at", "users.display_name", "users.farm_name", "users.account_type", "users.verification_level"])
      .select((eb) => eb.selectFrom("tender_bids").select((e) => e.fn.countAll<number>().as("n")).whereRef("tender_bids.tender_id", "=", "tenders.id").where("tender_bids.status", "<>", "withdrawn").as("bids_count"))
      .where("tenders.status", "=", q.status)
      .$if(!!q.region, (qb) => qb.where(sql<boolean>`(${q.region!} = ANY(tenders.region_codes) OR cardinality(tenders.region_codes) = 0)`))
      .$if(!!q.category, (qb) => qb.where("tenders.category_code", "=", q.category!))
      .orderBy("tenders.deadline").limit(30).offset((q.page - 1) * 30).execute();
    return { items: rows };
  });

  app.get<{ Params: { id: string } }>("/tenders/:id", async (req) => {
    const t = await db.selectFrom("tenders").selectAll().where("id", "=", req.params.id).executeTakeFirst();
    if (!t) throw new AppError(404, "tender_not_found");
    const uid = req.user?.id; const isBuyer = uid === t.buyer_id;
    // покупатель видит все предложения; продавец — только своё; гость — только их число
    const bids = isBuyer
      ? await db.selectFrom("tender_bids").innerJoin("users", "users.id", "tender_bids.seller_id").select(["tender_bids.id", "tender_bids.price_kzt", "tender_bids.quantity", "tender_bids.comment", "tender_bids.listing_id", "tender_bids.status", "tender_bids.created_at", "users.display_name", "users.farm_name", "users.rating", "users.verification_level", "users.region_code"]).where("tender_id", "=", t.id).where("tender_bids.status", "<>", "withdrawn").orderBy("tender_bids.price_kzt").execute()
      : uid ? await db.selectFrom("tender_bids").selectAll().where("tender_id", "=", t.id).where("seller_id", "=", uid).where("status", "<>", "withdrawn").execute() : [];
    const count = await db.selectFrom("tender_bids").select((eb) => eb.fn.countAll<number>().as("n")).where("tender_id", "=", t.id).where("status", "<>", "withdrawn").executeTakeFirst();
    return { tender: { ...t, isBuyer, bidsCount: Number(count?.n ?? 0) }, bids };
  });

  app.post("/tenders", { preHandler: [app.authenticate] }, async (req) => {
    const p = TenderCreateSchema.parse(req.body);
    const me = await db.selectFrom("users").select(["verification_level", "trust_score"]).where("id", "=", req.user!.id).executeTakeFirstOrThrow();
    if (me.verification_level < 2) throw new AppError(403, "verification_required"); // тендер — только от подтверждённого ИИН/БИН
    const cat = await db.selectFrom("categories").select("code").where("code", "=", p.categoryCode).executeTakeFirst();
    if (!cat) throw new AppError(400, "unknown_category");
    const openCount = await db.selectFrom("tenders").select((eb) => eb.fn.countAll<number>().as("n")).where("buyer_id", "=", req.user!.id).where("status", "=", "open").executeTakeFirst();
    if (Number(openCount?.n ?? 0) >= 10) throw new AppError(429, "too_many_open_tenders");
    const row = await db.insertInto("tenders").values({ buyer_id: req.user!.id, title_ru: p.titleRu, title_kk: p.titleKk ?? p.titleRu, category_code: p.categoryCode, quantity: p.quantity, specs: JSON.stringify(p.specs), region_codes: p.regionCodes, deadline: new Date(p.deadline) }).returningAll().executeTakeFirstOrThrow();
    return { tender: row };
  });

  app.post<{ Params: { id: string } }>("/tenders/:id/bids", { preHandler: [app.requirePermission("listing:own")] }, async (req) => {
    const b = TenderBidSchema.parse(req.body);
    const t = await db.selectFrom("tenders").selectAll().where("id", "=", req.params.id).executeTakeFirst();
    if (!t) throw new AppError(404, "tender_not_found");
    if (t.status !== "open" || t.deadline <= new Date()) throw new AppError(409, "tender_closed");
    if (t.buyer_id === req.user!.id) throw new AppError(400, "cannot_bid_own");
    const me = await db.selectFrom("users").select("verification_level").where("id", "=", req.user!.id).executeTakeFirstOrThrow();
    if (me.verification_level < 2) throw new AppError(403, "verification_required");
    if (b.quantity > t.quantity) throw new AppError(400, "quantity_exceeds_tender");
    if (b.listingId) {
      const l = await db.selectFrom("listings").select(["owner_user_id", "status", "quantity"]).where("id", "=", b.listingId).executeTakeFirst();
      if (!l || l.owner_user_id !== req.user!.id || l.status !== "active") throw new AppError(404, "listing_not_found");
      if (l.quantity < b.quantity) throw new AppError(409, "listing_quantity_insufficient");
    }
    const existing = await db.selectFrom("tender_bids").select("id").where("tender_id", "=", t.id).where("seller_id", "=", req.user!.id).where("status", "<>", "withdrawn").executeTakeFirst();
    const values = { price_kzt: b.priceKzt, quantity: b.quantity, comment: b.comment ?? null, listing_id: b.listingId ?? null };
    const bid = existing
      ? await db.updateTable("tender_bids").set(values).where("id", "=", existing.id).where("status", "=", "pending").returningAll().executeTakeFirstOrThrow()
      : await db.insertInto("tender_bids").values({ tender_id: t.id, seller_id: req.user!.id, ...values }).returningAll().executeTakeFirstOrThrow();
    if (!existing) await notify({ userId: t.buyer_id, type: "deal", titleRu: "Новое предложение по вашему тендеру", titleKk: "Тендеріңізге жаңа ұсыныс", data: { tenderId: t.id } });
    return { bid };
  });

  app.post<{ Params: { id: string } }>("/tenders/:id/bids/withdraw", { preHandler: [app.authenticate] }, async (req) => {
    await db.updateTable("tender_bids").set({ status: "withdrawn" }).where("tender_id", "=", req.params.id).where("seller_id", "=", req.user!.id).where("status", "=", "pending").execute();
    return { ok: true };
  });

  app.post<{ Params: { id: string } }>("/tenders/:id/award", { preHandler: [app.authenticate] }, async (req) => {
    const { bidId, mode } = z.object({ bidId: z.string().uuid(), mode: z.enum(["escrow", "reservation", "direct"]).default("escrow") }).parse(req.body);
    const t = await db.selectFrom("tenders").selectAll().where("id", "=", req.params.id).executeTakeFirst();
    if (!t || t.buyer_id !== req.user!.id) throw new AppError(404, "tender_not_found");
    if (!["open", "closed"].includes(t.status)) throw new AppError(409, "tender_already_awarded");
    const bid = await db.selectFrom("tender_bids").selectAll().where("id", "=", bidId).where("tender_id", "=", t.id).where("status", "=", "pending").executeTakeFirst();
    if (!bid) throw new AppError(404, "bid_not_found");
    const upd = await db.updateTable("tenders").set({ status: "awarded", winner_bid_id: bid.id }).where("id", "=", t.id).where("status", "in", ["open", "closed"]).executeTakeFirst();
    if (!upd.numUpdatedRows) throw new AppError(409, "tender_already_awarded");
    await db.updateTable("tender_bids").set({ status: "won" }).where("id", "=", bid.id).execute();
    await db.updateTable("tender_bids").set({ status: "lost" }).where("tender_id", "=", t.id).where("status", "=", "pending").execute();
    let dealId: string | null = null; let conversationId: string | null = null;
    if (bid.listing_id) {
      const conv = await getOrCreateConversation(bid.listing_id, t.buyer_id); conversationId = conv.id;
      const offer = await db.insertInto("offers").values({ listing_id: bid.listing_id, conversation_id: conv.id, buyer_id: t.buyer_id, seller_id: bid.seller_id, from_role: "seller", price_kzt: bid.price_kzt, quantity: bid.quantity, comment: "tender", status: "accepted", responded_at: new Date(), expires_at: new Date(Date.now() + OFFER_TTL_HOURS * 3600_000) }).returningAll().executeTakeFirstOrThrow();
      try { const d = await dealsService.create(t.buyer_id, { listingId: bid.listing_id, mode, quantity: bid.quantity, offerId: offer.id }); dealId = d.id; }
      catch (e) { if (!(e instanceof DealError)) throw e; } // объявление уже продано: тендер всё равно присуждён, стороны договариваются в чате
    }
    await notify({ userId: bid.seller_id, type: "deal", titleRu: "Ваше предложение выбрано победителем тендера", titleKk: "Сіздің ұсынысыңыз тендер жеңімпазы болып таңдалды", data: { tenderId: t.id, dealId } });
    for (const loser of await db.selectFrom("tender_bids").select("seller_id").where("tender_id", "=", t.id).where("status", "=", "lost").execute())
      await notify({ userId: loser.seller_id, type: "deal", titleRu: "Тендер завершён, выбран другой поставщик", titleKk: "Тендер аяқталды, басқа жеткізуші таңдалды", data: { tenderId: t.id } });
    return { ok: true, dealId, conversationId };
  });

  app.post<{ Params: { id: string } }>("/tenders/:id/cancel", { preHandler: [app.authenticate] }, async (req) => {
    const r = await db.updateTable("tenders").set({ status: "cancelled" }).where("id", "=", req.params.id).where("buyer_id", "=", req.user!.id).where("status", "in", ["open", "closed"]).executeTakeFirst();
    if (!r.numUpdatedRows) throw new AppError(409, "cannot_cancel");
    return { ok: true };
  });
}

/** Job: закрываем приём предложений по дедлайну, напоминаем покупателю выбрать победителя. */
export async function closeTenders(now = new Date()) {
  const rows = await db.updateTable("tenders").set({ status: "closed" }).where("status", "=", "open").where("deadline", "<=", now).returning(["id", "buyer_id"]).execute();
  for (const t of rows) await notify({ userId: t.buyer_id, type: "deal", titleRu: "Приём предложений по тендеру завершён: выберите поставщика", titleKk: "Тендер бойынша ұсыныстар қабылдау аяқталды: жеткізушіні таңдаңыз", data: { tenderId: t.id } });
  return { closed: rows.length };
}
