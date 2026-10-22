import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { db } from "../../db/index.js";
import { config } from "../../config.js";

export default async function notificationsRoutes(app: FastifyInstance) {
  app.get("/notifications", { preHandler: [app.authenticate] }, async (req) => {
    const items = await db.selectFrom("notifications").selectAll().where("user_id", "=", req.user!.id).orderBy("created_at", "desc").limit(50).execute();
    const unread = items.filter((n) => !n.read_at).length;
    return { items, unread };
  });
  app.post("/notifications/read", { preHandler: [app.authenticate] }, async (req) => {
    const { ids } = z.object({ ids: z.array(z.string().uuid()).optional() }).parse(req.body ?? {});
    let q = db.updateTable("notifications").set({ read_at: new Date() }).where("user_id", "=", req.user!.id).where("read_at", "is", null);
    if (ids?.length) q = q.where("id", "in", ids);
    await q.execute();
    return { ok: true };
  });
  app.get("/notifications/settings", { preHandler: [app.authenticate] }, async (req) => {
    const s = await db.selectFrom("notification_settings").selectAll().where("user_id", "=", req.user!.id).executeTakeFirst();
    return { settings: s ?? null, vapidPublicKey: config.VAPID_PUBLIC_KEY ?? null };
  });
  app.put("/notifications/settings", { preHandler: [app.authenticate] }, async (req) => {
    const p = z.object({ prefs: z.record(z.array(z.enum(["push", "sms", "telegram", "email"]))).optional(), quietFrom: z.string().regex(/^\d{2}:\d{2}$/).nullable().optional(), quietTo: z.string().regex(/^\d{2}:\d{2}$/).nullable().optional(), email: z.string().email().nullable().optional() }).parse(req.body);
    const row = { user_id: req.user!.id, ...(p.prefs && { prefs: JSON.stringify(p.prefs) }), ...(p.quietFrom !== undefined && { quiet_from: p.quietFrom }), ...(p.quietTo !== undefined && { quiet_to: p.quietTo }), ...(p.email !== undefined && { email: p.email }), updated_at: new Date() };
    await db.insertInto("notification_settings").values(row).onConflict((oc) => oc.column("user_id").doUpdateSet(row)).execute();
    return { ok: true };
  });
  app.post("/notifications/push-subscribe", { preHandler: [app.authenticate] }, async (req) => {
    const PUSH_HOSTS = [/(^|\.)fcm\.googleapis\.com$/, /(^|\.)push\.services\.mozilla\.com$/, /(^|\.)notify\.windows\.com$/, /(^|\.)push\.apple\.com$/];
    const sub = z.object({ endpoint: z.string().url().max(2048).refine((u) => { try { const x = new URL(u); return x.protocol === "https:" && PUSH_HOSTS.some((r) => r.test(x.hostname)); } catch { return false; } }, { message: "push_endpoint_not_allowed" }), keys: z.object({ p256dh: z.string().max(200), auth: z.string().max(100) }) }).parse(req.body); // SSRF: сервер шлёт POST только известным push-шлюзам
    const cur = await db.selectFrom("notification_settings").select("push_subscriptions").where("user_id", "=", req.user!.id).executeTakeFirst();
    const subs = ((cur?.push_subscriptions as any[]) ?? []).filter((s) => s.endpoint !== sub.endpoint).concat([sub]).slice(-5);
    await db.insertInto("notification_settings").values({ user_id: req.user!.id, push_subscriptions: JSON.stringify(subs) }).onConflict((oc) => oc.column("user_id").doUpdateSet({ push_subscriptions: JSON.stringify(subs) })).execute();
    return { ok: true };
  });
}
