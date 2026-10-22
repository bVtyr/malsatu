import type { FastifyInstance } from "fastify";
import { OfferCreateSchema, OfferActSchema, offerAct, OFFER_TTL_HOURS } from "@malsatu/shared";
import { db } from "../../db/index.js";
import { AppError } from "../../plugins/errors.js";
import { sendMessage, pushToUser } from "../chat/routes.js";
import { notify } from "../../services/notifications.js";
import { track } from "../../plugins/audit.js";

export default async function offersRoutes(app: FastifyInstance) {
  app.post("/offers", { preHandler: [app.requirePermission("offer:create")] }, async (req, reply) => {
    const o = OfferCreateSchema.parse(req.body);
    const l = await db.selectFrom("listings").select(["id", "owner_user_id", "status", "quantity", "price_kzt"]).where("id", "=", o.listingId).executeTakeFirst();
    if (!l || !["active", "reserved"].includes(l.status)) throw new AppError(404, "listing_not_found");
    if (l.owner_user_id === req.user!.id) throw new AppError(400, "cannot_offer_self");
    if (o.quantity > l.quantity) throw new AppError(400, "quantity_exceeds");
    const conv = await db.selectFrom("conversations").selectAll().where("listing_id", "=", l.id).where("buyer_id", "=", req.user!.id).executeTakeFirst()
      ?? await db.insertInto("conversations").values({ listing_id: l.id, buyer_id: req.user!.id, seller_id: l.owner_user_id }).returningAll().executeTakeFirstOrThrow();
    const offer = await db.insertInto("offers").values({ listing_id: l.id, conversation_id: conv.id, buyer_id: req.user!.id, seller_id: l.owner_user_id, from_role: "buyer", price_kzt: o.priceKzt, quantity: o.quantity, comment: o.comment ?? null, expires_at: new Date(Date.now() + OFFER_TTL_HOURS * 3600_000) }).returningAll().executeTakeFirstOrThrow();
    await db.updateTable("listings").set((eb) => ({ offers_count: eb("offers_count", "+", 1) })).where("id", "=", l.id).execute();
    await sendMessage(conv.id, req.user!.id, { kind: "offer", text: o.comment ?? `Предложение: ${o.priceKzt} ₸ × ${o.quantity}` }, "offer", offer.id);
    await notify({ userId: l.owner_user_id, type: "offer", titleRu: "Новое предложение цены", titleKk: "Жаңа баға ұсынысы", bodyRu: `${o.priceKzt} ₸ × ${o.quantity}`, bodyKk: `${o.priceKzt} ₸ × ${o.quantity}`, data: { offerId: offer.id, conversationId: conv.id } });
    track("offer", { userId: req.user!.id, listingId: l.id, props: { price: o.priceKzt } }).catch(() => undefined);
    reply.status(201); return { offer };
  });

  app.get("/offers", { preHandler: [app.authenticate] }, async (req) => {
    const uid = req.user!.id;
    const items = await db.selectFrom("offers").leftJoin("listings", "listings.id", "offers.listing_id").selectAll("offers").select(["listings.title_ru", "listings.title_kk"]).where((eb) => eb.or([eb("buyer_id", "=", uid), eb("seller_id", "=", uid)])).orderBy("offers.created_at", "desc").limit(100).execute();
    return { items };
  });

  app.post<{ Params: { id: string } }>("/offers/:id", { preHandler: [app.authenticate] }, async (req) => {
    const a = OfferActSchema.parse(req.body);
    const o = await db.selectFrom("offers").selectAll().where("id", "=", req.params.id).executeTakeFirst();
    if (!o) throw new AppError(404, "offer_not_found");
    const uid = req.user!.id;
    const role = uid === o.buyer_id ? "buyer" : uid === o.seller_id ? "seller" : null;
    if (!role) throw new AppError(403, "not_participant");
    const like = { status: o.status as any, priceKzt: o.price_kzt, quantity: o.quantity, expiresAt: o.expires_at, fromRole: o.from_role as any };
    offerAct(like, a.action, role, new Date(), a.counterPriceKzt);
    const updated = await db.updateTable("offers").set({ status: like.status, responded_at: new Date() }).where("id", "=", o.id).returningAll().executeTakeFirstOrThrow();
    let counter = null;
    if (a.action === "counter") {
      counter = await db.insertInto("offers").values({ listing_id: o.listing_id, conversation_id: o.conversation_id, buyer_id: o.buyer_id, seller_id: o.seller_id, from_role: role, price_kzt: a.counterPriceKzt!, quantity: o.quantity, parent_offer_id: o.id, expires_at: new Date(Date.now() + OFFER_TTL_HOURS * 3600_000) }).returningAll().executeTakeFirstOrThrow();
      if (o.conversation_id) await sendMessage(o.conversation_id, uid, { kind: "offer", text: `Встречное предложение: ${a.counterPriceKzt} ₸` }, "offer", counter.id);
    } else if (o.conversation_id) {
      await sendMessage(o.conversation_id, uid, { kind: "text", text: a.action === "accept" ? "Предложение принято ✅ — можно переходить к сделке" : a.action === "reject" ? "Предложение отклонено" : "Предложение отозвано" }, "system", o.id);
    }
    const other = uid === o.buyer_id ? o.seller_id : o.buyer_id;
    pushToUser(other, { type: "offer", offer: updated, counter });
    await notify({ userId: other, type: "offer", titleRu: a.action === "accept" ? "Ваше предложение принято" : a.action === "counter" ? "Встречное предложение" : "Предложение отклонено", titleKk: a.action === "accept" ? "Ұсынысыңыз қабылданды" : a.action === "counter" ? "Қарсы ұсыныс" : "Ұсыныс қабылданбады", data: { offerId: o.id } });
    return { offer: updated, counter };
  });
}
