/** Осмотр ветеринаром перед покупкой (v2/v3): заявка → назначение ветеринара в районе → отчёт прикрепляется к сделке. */
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { db } from "../../db/index.js";
import { AppError } from "../../plugins/errors.js";
import { notify } from "../../services/notifications.js";

export default async function vetRoutes(app: FastifyInstance) {
  app.post("/vet/requests", { preHandler: [app.authenticate] }, async (req, reply) => {
    const p = z.object({ listingId: z.string().uuid().optional(), dealId: z.string().uuid().optional(), scheduledAt: z.string().datetime().optional() }).parse(req.body);
    const row = await db.insertInto("vet_requests").values({ requester_id: req.user!.id, listing_id: p.listingId ?? null, deal_id: p.dealId ?? null, scheduled_at: p.scheduledAt ?? null }).returningAll().executeTakeFirstOrThrow();
    // назначение: ветеринары, работающие в области объявления
    if (p.listingId) {
      const l = await db.selectFrom("listings").select("top_region_code").where("id", "=", p.listingId).executeTakeFirst();
      const vets = l ? await db.selectFrom("vet_profiles").select("user_id").where("verified", "=", true).where("regions", "@>", [l.top_region_code] as any).limit(10).execute().catch(() => []) : [];
      for (const v of vets as any[]) await notify({ userId: v.user_id, type: "system", titleRu: "Заявка на осмотр животного", titleKk: "Малды тексеруге өтінім", data: { vetRequestId: row.id } });
    }
    reply.status(201); return { request: row };
  });
  app.get("/vet/requests", { preHandler: [app.authenticate] }, async (req) => {
    const isVet = req.user!.roles.includes("vet");
    const q = db.selectFrom("vet_requests").selectAll().orderBy("created_at", "desc").limit(100);
    return { items: await (isVet ? q.where((eb) => eb.or([eb("vet_id", "=", req.user!.id), eb("status", "=", "new")])) : q.where("requester_id", "=", req.user!.id)).execute() };
  });
  app.post<{ Params: { id: string } }>("/vet/requests/:id/accept", { preHandler: [app.requirePermission("vet:requests")] }, async (req) => {
    const { scheduledAt, priceKzt } = z.object({ scheduledAt: z.string().datetime(), priceKzt: z.number().int().positive() }).parse(req.body);
    const r = await db.updateTable("vet_requests").set({ vet_id: req.user!.id, status: "scheduled", scheduled_at: scheduledAt, price_kzt: priceKzt }).where("id", "=", req.params.id).where("status", "=", "new").returningAll().executeTakeFirst();
    if (!r) throw new AppError(404, "request_not_found");
    await notify({ userId: r.requester_id, type: "system", titleRu: "Ветеринар назначен", titleKk: "Мал дәрігері тағайындалды", data: { vetRequestId: r.id } });
    return { request: r };
  });
  app.post<{ Params: { id: string } }>("/vet/requests/:id/report", { preHandler: [app.requirePermission("vet:report")] }, async (req) => {
    const p = z.object({ reportText: z.string().min(10), mediaIds: z.array(z.string().uuid()).default([]), conclusion: z.enum(["healthy", "issues_found", "unfit"]) }).parse(req.body);
    const r = await db.updateTable("vet_requests").set({ status: "done", report_text: p.reportText, report_media_ids: p.mediaIds, conclusion: p.conclusion, done_at: new Date() }).where("id", "=", req.params.id).where("vet_id", "=", req.user!.id).returningAll().executeTakeFirst();
    if (!r) throw new AppError(404, "request_not_found");
    await notify({ userId: r.requester_id, type: "deal", titleRu: "Отчёт ветеринара готов", titleKk: "Мал дәрігерінің есебі дайын", bodyRu: p.conclusion, bodyKk: p.conclusion, data: { vetRequestId: r.id, dealId: r.deal_id } });
    return { request: r };
  });
  app.put("/vet/profile", { preHandler: [app.authenticate] }, async (req) => {
    const p = z.object({ licenseNo: z.string(), regions: z.array(z.string()), services: z.array(z.string()).default([]), priceInspectionKzt: z.number().int().optional() }).parse(req.body);
    const row = { user_id: req.user!.id, license_no: p.licenseNo, regions: p.regions, services: p.services, price_inspection_kzt: p.priceInspectionKzt ?? null };
    await db.insertInto("vet_profiles").values(row).onConflict((oc) => oc.column("user_id").doUpdateSet(row)).execute();
    if (!req.user!.roles.includes("vet")) await db.updateTable("users").set({ roles: [...req.user!.roles, "vet"] }).where("id", "=", req.user!.id).execute();
    return { ok: true };
  });
}
