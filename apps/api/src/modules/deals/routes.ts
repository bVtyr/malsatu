import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { DealCreateSchema, DealActionSchema } from "@malsatu/shared";
import { db } from "../../db/index.js";
import { AppError } from "../../plugins/errors.js";
import { DealsService, DealError } from "./service.js";
import { pgDealRepo } from "./repo.js";
import { track, audit } from "../../plugins/audit.js";

export const dealsService = new DealsService(pgDealRepo);

export default async function dealsRoutes(app: FastifyInstance) {

  app.post("/deals", { preHandler: [app.authenticate] }, async (req, reply) => {
    const i = DealCreateSchema.parse(req.body);
    try {
      const deal = await dealsService.create(req.user!.id, { listingId: i.listingId, mode: i.mode, quantity: i.quantity, offerId: i.offerId, deliveryOption: i.deliveryOption });
      track("deal_created", { userId: req.user!.id, listingId: i.listingId, props: { mode: i.mode } }).catch(() => undefined);
      reply.status(201); return { deal };
    } catch (e) { if (e instanceof DealError) throw new AppError(409, e.code); throw e; }
  });

  app.get("/deals", { preHandler: [app.authenticate] }, async (req) => {
    const uid = req.user!.id;
    const role = (req.query as any).role as string | undefined;
    let q = db.selectFrom("deals").leftJoin("listings", "listings.id", "deals.listing_id").selectAll("deals").select(["listings.title_ru", "listings.title_kk", "listings.category_code"]).orderBy("deals.created_at", "desc").limit(100);
    q = role === "seller" ? q.where("seller_id", "=", uid) : role === "buyer" ? q.where("buyer_id", "=", uid) : q.where((eb) => eb.or([eb("buyer_id", "=", uid), eb("seller_id", "=", uid)]));
    return { items: await q.execute() };
  });

  app.get<{ Params: { id: string } }>("/deals/:id", { preHandler: [app.authenticate] }, async (req) => {
    const d = await db.selectFrom("deals").selectAll().where("id", "=", req.params.id).executeTakeFirst();
    if (!d) throw new AppError(404, "deal_not_found");
    const uid = req.user!.id; const staff = req.user!.roles.some((r) => ["arbiter", "admin", "finance"].includes(r));
    if (d.buyer_id !== uid && d.seller_id !== uid && !staff) throw new AppError(404, "deal_not_found");
    const [events, payments_, dispute, vet] = await Promise.all([
      db.selectFrom("deal_events").selectAll().where("deal_id", "=", d.id).orderBy("created_at").execute(),
      db.selectFrom("payments").selectAll().where("deal_id", "=", d.id).execute(),
      db.selectFrom("disputes").selectAll().where("deal_id", "=", d.id).executeTakeFirst(),
      db.selectFrom("vet_requests").selectAll().where("deal_id", "=", d.id).execute(),
    ]);
    return { deal: d, events, payments: payments_, dispute: dispute ?? null, vetReports: vet };
  });

  app.post<{ Params: { id: string } }>("/deals/:id/pay", { preHandler: [app.authenticate] }, async (req) => {
    try { return { deal: await dealsService.pay(req.params.id, req.user!.id) }; } catch (e) { if (e instanceof DealError) throw new AppError(409, e.code); throw e; }
  });

  app.post<{ Params: { id: string } }>("/deals/:id/action", { preHandler: [app.authenticate] }, async (req) => {
    const a = DealActionSchema.parse(req.body);
    const d = await db.selectFrom("deals").select(["buyer_id", "seller_id", "transport_request_id"]).where("id", "=", req.params.id).executeTakeFirst();
    if (!d) throw new AppError(404, "deal_not_found");
    const uid = req.user!.id;
    let actor: "buyer" | "seller" | "carrier" | "admin" | null = uid === d.buyer_id ? "buyer" : uid === d.seller_id ? "seller" : req.user!.roles.includes("admin") ? "admin" : null;
    if (!actor && d.transport_request_id && req.user!.roles.includes("carrier")) {
      // перевозчик может менять статус только по своей (выбранной заказчиком) заявке
      const tr = await db.selectFrom("transport_requests").innerJoin("transport_bids", "transport_bids.id", "transport_requests.chosen_bid_id").select("transport_bids.carrier_id").where("transport_requests.id", "=", d.transport_request_id).executeTakeFirst();
      if (tr?.carrier_id === uid) actor = "carrier";
    }
    if (!actor) throw new AppError(403, "not_participant");
    try { return { deal: await dealsService.act(req.params.id, a.action, actor, uid, { comment: a.comment, evidence: a.evidenceMediaIds }) }; }
    catch (e) { if (e instanceof DealError) throw new AppError(409, e.code); throw e; }
  });

  // Арбитраж споров
  app.get("/disputes", { preHandler: [app.requirePermission("dispute:read")] }, async () => ({ items: await db.selectFrom("disputes").selectAll().where("status", "!=", "resolved").orderBy("created_at").execute() }));
  app.post<{ Params: { id: string } }>("/disputes/:id/messages", { preHandler: [app.authenticate] }, async (req) => {
    const { text, mediaIds } = z.object({ text: z.string().max(4000), mediaIds: z.array(z.string().uuid()).default([]) }).parse(req.body);
    const disp = await db.selectFrom("disputes").innerJoin("deals", "deals.id", "disputes.deal_id").select(["disputes.id", "deals.buyer_id", "deals.seller_id", "disputes.status"]).where("disputes.id", "=", req.params.id).executeTakeFirst();
    if (!disp) throw new AppError(404, "dispute_not_found");
    const uid = req.user!.id; const isArb = req.user!.roles.some((r) => ["arbiter", "admin"].includes(r));
    if (!isArb && uid !== disp.buyer_id && uid !== disp.seller_id) throw new AppError(403, "not_participant");
    const m = await db.insertInto("dispute_messages").values({ dispute_id: disp.id, author_id: uid, text, media_ids: mediaIds }).returningAll().executeTakeFirstOrThrow();
    const next = isArb ? "under_review" : uid === disp.seller_id ? "awaiting_buyer" : "awaiting_seller";
    await db.updateTable("disputes").set({ status: next, deadline_at: new Date(Date.now() + 48 * 3600_000) }).where("id", "=", disp.id).execute();
    return { message: m };
  });
  app.post<{ Params: { id: string } }>("/disputes/:id/resolve", { preHandler: [app.requirePermission("dispute:resolve")] }, async (req) => {
    const { resolution, refundKzt, comment } = z.object({ resolution: z.enum(["refund", "partial_refund", "for_seller"]), refundKzt: z.number().int().positive().max(1e12).optional(), comment: z.string().max(2000).optional() }).superRefine((v, ctx) => { if (v.resolution === "partial_refund" && !v.refundKzt) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "refund_required", path: ["refundKzt"] }); }).parse(req.body);
    const disp = await db.selectFrom("disputes").select(["deal_id"]).where("id", "=", req.params.id).executeTakeFirst();
    if (!disp) throw new AppError(404, "dispute_not_found");
    const action = resolution === "refund" ? "resolve_refund" : resolution === "partial_refund" ? "resolve_partial_refund" : "resolve_for_seller";
    try {
      const deal = await dealsService.act(disp.deal_id, action, "arbiter", req.user!.id, { comment, refundKzt });
      await audit(req.user!.id, "dispute.resolve", { type: "dispute", id: req.params.id }, { resolution, refundKzt }, req.ip);
      return { deal };
    } catch (e) { if (e instanceof DealError) throw new AppError(409, e.code); throw e; }
  });

  // Отзывы — только после завершённой сделки
  app.post<{ Params: { id: string } }>("/deals/:id/review", { preHandler: [app.authenticate] }, async (req) => {
    const r = z.object({ scoreOverall: z.number().int().min(1).max(5), scoreDescription: z.number().int().min(1).max(5).optional(), scoreQuality: z.number().int().min(1).max(5).optional(), scorePunctuality: z.number().int().min(1).max(5).optional(), scoreCommunication: z.number().int().min(1).max(5).optional(), text: z.string().max(2000).optional(), mediaIds: z.array(z.string().uuid()).default([]) }).parse(req.body);
    const d = await db.selectFrom("deals").selectAll().where("id", "=", req.params.id).executeTakeFirst();
    if (!d) throw new AppError(404, "deal_not_found");
    if (!["completed", "released_to_seller", "partially_refunded", "refunded"].includes(d.status)) throw new AppError(409, "deal_not_completed");
    if (d.mode === "direct") throw new AppError(409, "review_requires_platform_deal"); // накрутка рейтинга бесплатными «прямыми» сделками
    if (d.completed_at && Date.now() - new Date(d.completed_at).getTime() > 30 * 86_400_000) throw new AppError(409, "review_window_closed");
    const dup = await db.selectFrom("reviews").select("id").where("deal_id", "=", d.id).where("author_id", "=", req.user!.id).executeTakeFirst();
    if (dup) throw new AppError(409, "review_exists");
    const uid = req.user!.id;
    if (uid !== d.buyer_id && uid !== d.seller_id) throw new AppError(403, "not_participant");
    const target = uid === d.buyer_id ? d.seller_id : d.buyer_id;
    const review = await db.insertInto("reviews").values({ deal_id: d.id, author_id: uid, target_user_id: target, target_role: uid === d.buyer_id ? "seller" : "buyer", score_overall: r.scoreOverall, score_description: r.scoreDescription ?? null, score_quality: r.scoreQuality ?? null, score_punctuality: r.scorePunctuality ?? null, score_communication: r.scoreCommunication ?? null, text: r.text ?? null, media_ids: r.mediaIds }).returningAll().executeTakeFirstOrThrow();
    const agg = await db.selectFrom("reviews").select((eb) => [eb.fn.avg<number>("score_overall").as("avg"), eb.fn.countAll<number>().as("n")]).where("target_user_id", "=", target).executeTakeFirstOrThrow();
    await db.updateTable("users").set({ rating: Math.round(Number(agg.avg) * 100) / 100, reviews_count: Number(agg.n) }).where("id", "=", target).execute();
    return { review };
  });
  app.post<{ Params: { id: string } }>("/reviews/:id/reply", { preHandler: [app.authenticate] }, async (req) => {
    const { text } = z.object({ text: z.string().max(1000) }).parse(req.body);
    const r = await db.updateTable("reviews").set({ reply_text: text, replied_at: new Date() }).where("id", "=", req.params.id).where("target_user_id", "=", req.user!.id).returningAll().executeTakeFirst();
    if (!r) throw new AppError(404, "review_not_found");
    return { review: r };
  });
}
