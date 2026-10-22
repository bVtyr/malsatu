/** Модерация: очередь, решения с шаблонами причин (kk/ru), проверка документов и бирок, жалобы, журнал. */
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { ModerationDecisionSchema } from "@malsatu/shared";
import { db } from "../../db/index.js";
import { AppError } from "../../plugins/errors.js";
import { notify } from "../../services/notifications.js";
import { recomputeTrust } from "../../services/trust.js";

export default async function moderationRoutes(app: FastifyInstance) {
  const mod = app.requirePermission("moderation:queue");

  app.get("/moderation/queue", { preHandler: [mod] }, async (req) => {
    const status = ((req.query as any).status as string) ?? "pending";
    const items = await db.selectFrom("moderation_queue").innerJoin("listings", "listings.id", "moderation_queue.listing_id").innerJoin("users", "users.id", "listings.owner_user_id")
      .selectAll("moderation_queue").select(["listings.title_ru", "listings.title_kk", "listings.kind", "listings.category_code", "listings.price_kzt", "listings.price_type", "listings.region_code", "users.display_name", "users.trust_score", "users.verification_level", "users.phone"])
      .where("moderation_queue.status", "=", status).orderBy("moderation_queue.created_at").limit(100).execute();
    return { items };
  });

  app.post<{ Params: { id: string } }>("/moderation/queue/:id/decide", { preHandler: [mod] }, async (req) => {
    const d = ModerationDecisionSchema.parse(req.body);
    const item = await db.selectFrom("moderation_queue").selectAll().where("id", "=", req.params.id).where("status", "=", "pending").executeTakeFirst();
    if (!item) throw new AppError(404, "queue_item_not_found");
    const listing = await db.selectFrom("listings").selectAll().where("id", "=", item.listing_id).executeTakeFirstOrThrow();
    if (d.decision === "reject" && !d.reasonCode) throw new AppError(400, "reason_required");
    const now = new Date();
    await db.transaction().execute(async (trx) => {
      await trx.updateTable("moderation_queue").set({ status: d.decision === "approve" ? "approved" : "rejected", resolved_at: now, assigned_to: req.user!.id }).where("id", "=", item.id).execute();
      if (d.decision === "approve") {
        const target = listing.status === "hidden_quarantine" ? "hidden_quarantine" : "active";
        const upd = await trx.updateTable("listings").set({ status: target, status_before_quarantine: target === "hidden_quarantine" ? "active" : null, moderated_at: now, moderated_by: req.user!.id, reject_reason_code: null, reject_comment: null, published_at: now }).where("id", "=", listing.id).where("status", "in", ["pending_moderation", "hidden_quarantine"]).where("deleted_at", "is", null).executeTakeFirst();
        if (!upd.numUpdatedRows) throw new AppError(409, "listing_no_longer_pending"); // владелец успел архивировать/удалить
      } else {
        await trx.updateTable("listings").set({ status: "rejected", moderated_at: now, moderated_by: req.user!.id, reject_reason_code: d.reasonCode!, reject_comment: d.comment ?? null }).where("id", "=", listing.id).execute();
        await trx.updateTable("users").set((eb) => ({ trust_score: eb.fn("greatest", [eb("trust_score", "-", 2), eb.val(0)]) })).where("id", "=", listing.owner_user_id).execute();
      }
      await trx.insertInto("moderation_log").values({ moderator_id: req.user!.id, action: `listing.${d.decision}`, target_type: "listing", target_id: listing.id, reason_code: d.reasonCode ?? null, comment: d.comment ?? null }).execute();
    });
    if (d.decision === "reject") await recomputeTrust(listing.owner_user_id).catch(() => undefined);
    const reason = d.reasonCode ? await db.selectFrom("reject_reasons").selectAll().where("code", "=", d.reasonCode).executeTakeFirst() : null;
    await notify({ userId: listing.owner_user_id, type: "moderation",
      titleRu: d.decision === "approve" ? "Объявление опубликовано" : "Объявление отклонено", titleKk: d.decision === "approve" ? "Хабарландыру жарияланды" : "Хабарландыру қабылданбады",
      bodyRu: d.decision === "approve" ? listing.title_ru ?? "" : `${reason?.ru ?? ""} ${d.comment ?? ""}`.trim(), bodyKk: d.decision === "approve" ? listing.title_kk ?? "" : `${reason?.kk ?? ""} ${d.comment ?? ""}`.trim(), data: { listingId: listing.id } });
    return { ok: true };
  });

  // Проверка документов (модератор или ветеринар)
  app.post<{ Params: { id: string } }>("/moderation/documents/:id/verify", { preHandler: [app.requirePermission("document:verify")] }, async (req) => {
    const { status, comment } = z.object({ status: z.enum(["verified", "rejected"]), comment: z.string().optional() }).parse(req.body);
    const role = req.user!.roles.includes("vet") ? "vet" : "moderator";
    const doc = await db.updateTable("listing_documents").set({ verified_status: status, verified_by: req.user!.id, verified_role: role, verified_at: new Date() }).where("id", "=", req.params.id).returningAll().executeTakeFirst();
    if (!doc) throw new AppError(404, "document_not_found");
    await db.insertInto("moderation_log").values({ moderator_id: req.user!.id, action: `document.${status}`, target_type: "listing_document", target_id: doc.id, comment: comment ?? null }).execute();
    return { document: doc };
  });

  // Проверка бирок ИНЖ: вручную или через госбазу (ANIMAL_ID_DB_PROVIDER, см. docs/INTEGRATIONS.md)
  app.post<{ Params: { id: string } }>("/moderation/tags/:id/verify", { preHandler: [app.requirePermission("document:verify")] }, async (req) => {
    const { status } = z.object({ status: z.enum(["verified", "rejected", "not_found"]) }).parse(req.body);
    const tag = await db.updateTable("animal_tags").set({ verified_status: status, verified_at: new Date(), verified_source: req.user!.roles.includes("vet") ? "vet" : "moderator" }).where("id", "=", req.params.id).returningAll().executeTakeFirst();
    if (!tag) throw new AppError(404, "tag_not_found");
    return { tag };
  });

  app.get("/moderation/reports", { preHandler: [app.requirePermission("report:resolve")] }, async () => ({
    items: await db.selectFrom("reports").selectAll().where("status", "=", "open").orderBy("created_at").limit(200).execute(),
  }));
  app.post<{ Params: { id: string } }>("/moderation/reports/:id/resolve", { preHandler: [app.requirePermission("report:resolve")] }, async (req) => {
    const { status, action } = z.object({ status: z.enum(["resolved", "dismissed"]), action: z.enum(["none", "archive_listing", "block_user"]).default("none") }).parse(req.body);
    const r = await db.updateTable("reports").set({ status, resolved_by: req.user!.id, resolved_at: new Date() }).where("id", "=", req.params.id).returningAll().executeTakeFirst();
    if (!r) throw new AppError(404, "report_not_found");
    if (action === "archive_listing" && r.target_type === "listing") await db.updateTable("listings").set({ status: "archived" }).where("id", "=", r.target_id).execute();
    if (action === "block_user") {
      const uid = r.target_type === "user" ? r.target_id : r.target_type === "listing" ? (await db.selectFrom("listings").select("owner_user_id").where("id", "=", r.target_id).executeTakeFirst())?.owner_user_id : null;
      if (uid) await db.updateTable("users").set({ is_blocked: true, blocked_reason: `report:${r.reason}` }).where("id", "=", uid).execute();
    }
    await db.insertInto("moderation_log").values({ moderator_id: req.user!.id, action: `report.${status}.${action}`, target_type: r.target_type, target_id: r.target_id }).execute();
    return { ok: true };
  });

  app.get("/moderation/log", { preHandler: [mod] }, async () => ({ items: await db.selectFrom("moderation_log").selectAll().orderBy("created_at", "desc").limit(200).execute() }));
}
