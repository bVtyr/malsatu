/** Звонок через подменный номер: выдаём временный proxy-номер, фиксируем факт обращения для статистики. */
import type { FastifyInstance } from "fastify";
import { db } from "../../db/index.js";
import { AppError } from "../../plugins/errors.js";
import { callMasking, MASK_TTL_MINUTES } from "../../services/calls.js";
import { track } from "../../plugins/audit.js";
import { z } from "zod";
import crypto from "node:crypto";
import { config } from "../../config.js";

export default async function callsRoutes(app: FastifyInstance) {
  app.post<{ Params: { id: string } }>("/listings/:id/call", { config: { rateLimit: { max: 20, timeWindow: "1 hour" } }, preHandler: [app.authenticate] }, async (req) => {
    const l = await db.selectFrom("listings").innerJoin("users", "users.id", "listings.owner_user_id").select(["listings.id", "listings.owner_user_id", "listings.status", "users.phone as seller_phone"]).where("listings.id", "=", req.params.id).executeTakeFirst();
    if (!l || !["active", "reserved"].includes(l.status)) throw new AppError(404, "listing_not_found");
    if (l.owner_user_id === req.user!.id) throw new AppError(400, "cannot_call_self");
    const existing = await db.selectFrom("masked_numbers").selectAll().where("listing_id", "=", l.id).where("caller_id", "=", req.user!.id).where("expires_at", ">", new Date()).executeTakeFirst();
    let proxy = existing?.proxy_number;
    if (!proxy) {
      const a = await callMasking.allocate(req.user!.phone, l.seller_phone, MASK_TTL_MINUTES);
      proxy = a.proxyNumber;
      await db.insertInto("masked_numbers").values({ listing_id: l.id, caller_id: req.user!.id, callee_id: l.owner_user_id, proxy_number: proxy, provider_ref: a.ref ?? null, expires_at: new Date(Date.now() + MASK_TTL_MINUTES * 60_000) }).execute();
    }
    await db.insertInto("call_logs").values({ listing_id: l.id, caller_id: req.user!.id, callee_id: l.owner_user_id, proxy_number: proxy }).execute();
    await db.updateTable("listings").set((eb) => ({ calls_count: eb("calls_count", "+", 1) })).where("id", "=", l.id).execute();
    track("call", { userId: req.user!.id, listingId: l.id }).catch(() => undefined);
    return { proxyNumber: proxy, expiresInMinutes: MASK_TTL_MINUTES };
  });

  // Webhook телефонии: статус/длительность звонка
  app.post("/webhooks/calls", { config: { rateLimit: { max: 600, timeWindow: "1 minute" } } }, async (req) => {
    const given = String(req.headers["x-webhook-secret"] ?? ""); const want = config.CALL_WEBHOOK_SECRET ?? "";
    if (!want || given.length !== want.length || !crypto.timingSafeEqual(Buffer.from(given), Buffer.from(want))) throw new AppError(403, "bad_webhook_secret");
    const b = z.object({ proxyNumber: z.string(), status: z.enum(["answered", "missed", "failed"]), durationSec: z.number().int().optional() }).parse(req.body);
    await db.updateTable("call_logs").set({ status: b.status, duration_sec: b.durationSec ?? null }).where("proxy_number", "=", b.proxyNumber).where("status", "=", "initiated").execute();
    return { ok: true };
  });
}
