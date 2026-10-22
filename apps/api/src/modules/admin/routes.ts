/** Админ-панель: дашборд, пользователи, справочники, карантин, комиссии, CMS, рассылки, журнал. Все операции пишутся в audit_log. */
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { sql } from "kysely";
import { QuarantineZoneSchema } from "@malsatu/shared";
import { db } from "../../db/index.js";
import { AppError } from "../../plugins/errors.js";
import { audit } from "../../plugins/audit.js";
import { applyQuarantineZones } from "./quarantine.js";
import { notify } from "../../services/notifications.js";

export default async function adminRoutes(app: FastifyInstance) {
  const admin = app.requirePermission("admin:all");
  const staff = app.requirePermission("dashboard:read");

  app.get("/admin/dashboard", { preHandler: [staff] }, async (req) => {
    const days = Number((req.query as any).days ?? 30);
    const since = new Date(Date.now() - days * 86_400_000);
    const [users, listings, deals, byRegion, byCategory, funnel] = await Promise.all([
      sql<{ total: number; new_: number }>`SELECT count(*)::int AS total, count(*) FILTER (WHERE created_at >= ${since})::int AS new_ FROM users WHERE deleted_at IS NULL`.execute(db),
      sql<{ active: number; pending: number; new_: number }>`SELECT count(*) FILTER (WHERE status='active')::int AS active, count(*) FILTER (WHERE status='pending_moderation')::int AS pending, count(*) FILTER (WHERE created_at >= ${since})::int AS new_ FROM listings WHERE deleted_at IS NULL`.execute(db),
      sql<{ count: number; gmv: number; revenue: number; completed: number }>`SELECT count(*)::int AS count, coalesce(sum(amount_kzt) FILTER (WHERE status IN ('completed','confirmed','released_to_seller')),0)::bigint AS gmv, coalesce(sum(commission_kzt) FILTER (WHERE status IN ('completed','released_to_seller')),0)::bigint AS revenue, count(*) FILTER (WHERE status='completed')::int AS completed FROM deals WHERE created_at >= ${since}`.execute(db),
      sql<{ region: string; listings: number; deals: number; gmv: number }>`SELECT l.top_region_code AS region, count(DISTINCT l.id)::int AS listings, count(d.id)::int AS deals, coalesce(sum(d.amount_kzt),0)::bigint AS gmv FROM listings l LEFT JOIN deals d ON d.listing_id = l.id AND d.status='completed' WHERE l.status IN ('active','reserved','sold') GROUP BY 1 ORDER BY 2 DESC`.execute(db),
      sql<{ category: string; listings: number; gmv: number }>`SELECT l.category_code AS category, count(DISTINCT l.id)::int AS listings, coalesce(sum(d.amount_kzt),0)::bigint AS gmv FROM listings l LEFT JOIN deals d ON d.listing_id = l.id AND d.status='completed' WHERE l.status IN ('active','reserved','sold') GROUP BY 1 ORDER BY 2 DESC`.execute(db),
      sql<{ name: string; n: number }>`SELECT name, count(*)::int AS n FROM analytics_events WHERE created_at >= ${since} GROUP BY name`.execute(db),
    ]);
    return { period: { days, since }, users: users.rows[0], listings: listings.rows[0], deals: deals.rows[0], byRegion: byRegion.rows, byCategory: byCategory.rows, funnel: Object.fromEntries(funnel.rows.map((r) => [r.name, r.n])) };
  });

  // ---- Пользователи
  app.get("/admin/users", { preHandler: [staff] }, async (req) => {
    const { q, page = 1 } = z.object({ q: z.string().optional(), page: z.coerce.number().default(1) }).parse(req.query);
    let qb = db.selectFrom("users").selectAll().where("deleted_at", "is", null).orderBy("created_at", "desc").limit(50).offset((page - 1) * 50);
    const like = `%${q?.replace(/[\\%_]/g, (m) => "\\" + m).slice(0, 64) ?? ""}%`;
    if (q) qb = qb.where((eb) => eb.or([eb("phone", "ilike", like), eb("display_name", "ilike", like), eb("farm_name", "ilike", like)]));
    return { items: await qb.execute() };
  });
  app.patch<{ Params: { id: string } }>("/admin/users/:id", { preHandler: [admin] }, async (req) => {
    const p = z.object({ roles: z.array(z.string()).optional(), isBlocked: z.boolean().optional(), blockedReason: z.string().optional(), verificationLevel: z.number().int().min(0).max(4).optional(), trustScore: z.number().int().min(0).max(100).optional() }).parse(req.body);
    const u = await db.updateTable("users").set({ ...(p.roles && { roles: p.roles }), ...(p.isBlocked !== undefined && { is_blocked: p.isBlocked, blocked_reason: p.blockedReason ?? null }), ...(p.verificationLevel !== undefined && { verification_level: p.verificationLevel }), ...(p.trustScore !== undefined && { trust_score: p.trustScore }) }).where("id", "=", req.params.id).returningAll().executeTakeFirst();
    if (!u) throw new AppError(404, "user_not_found");
    if (p.isBlocked) await db.updateTable("sessions").set({ revoked_at: new Date() }).where("user_id", "=", u.id).execute();
    await audit(req.user!.id, "admin.user.update", { type: "user", id: u.id }, p, req.ip);
    return { user: u };
  });
  app.post("/admin/blacklist", { preHandler: [admin] }, async (req) => {
    const { kind, valueHash, reason } = z.object({ kind: z.enum(["phone", "iin", "card", "device"]), valueHash: z.string(), reason: z.string().optional() }).parse(req.body);
    await db.insertInto("blacklist").values({ kind, value_hash: valueHash, reason: reason ?? null, created_by: req.user!.id }).onConflict((oc) => oc.doNothing()).execute();
    await audit(req.user!.id, "admin.blacklist.add", undefined, { kind }, req.ip);
    return { ok: true };
  });

  // ---- Справочники: категории (конструктор атрибутов), регионы, породы, причины отклонения
  app.put<{ Params: { code: string } }>("/admin/categories/:code", { preHandler: [admin] }, async (req) => {
    const c = z.object({ parentCode: z.string().nullable().optional(), kind: z.enum(["livestock", "meat", "service"]), species: z.string().nullable().optional(), nameRu: z.string(), nameKk: z.string(), slugRu: z.string(), slugKk: z.string(), icon: z.string().default("paw"), enabled: z.boolean().default(true), sort: z.number().int().default(0), attributes: z.array(z.any()).default([]) }).parse(req.body);
    const row = { code: req.params.code, parent_code: c.parentCode ?? null, kind: c.kind, species: c.species ?? null, name_ru: c.nameRu, name_kk: c.nameKk, slug_ru: c.slugRu, slug_kk: c.slugKk, icon: c.icon, enabled: c.enabled, sort: c.sort, attributes: JSON.stringify(c.attributes) };
    await db.insertInto("categories").values(row).onConflict((oc) => oc.column("code").doUpdateSet(row)).execute();
    await audit(req.user!.id, "admin.category.upsert", { type: "category", id: req.params.code }, {}, req.ip);
    return { ok: true };
  });
  app.patch<{ Params: { code: string } }>("/admin/categories/:code/enabled", { preHandler: [admin] }, async (req) => {
    const { enabled } = z.object({ enabled: z.boolean() }).parse(req.body);
    await db.updateTable("categories").set({ enabled }).where("code", "=", req.params.code).execute();
    return { ok: true };
  });
  app.put<{ Params: { code: string } }>("/admin/regions/:code", { preHandler: [admin] }, async (req) => {
    const r = z.object({ parentCode: z.string().nullable().optional(), level: z.enum(["oblast", "city", "district", "rural_okrug", "village"]), nameRu: z.string(), nameKk: z.string(), slugRu: z.string(), slugKk: z.string(), lat: z.number().optional(), lng: z.number().optional(), kato: z.string().optional(), enabled: z.boolean().default(true), sort: z.number().int().default(0) }).parse(req.body);
    const row = { code: req.params.code, parent_code: r.parentCode ?? null, level: r.level, name_ru: r.nameRu, name_kk: r.nameKk, slug_ru: r.slugRu, slug_kk: r.slugKk, lat: r.lat ?? null, lng: r.lng ?? null, kato: r.kato ?? null, enabled: r.enabled, sort: r.sort };
    await db.insertInto("regions").values(row).onConflict((oc) => oc.column("code").doUpdateSet(row)).execute();
    return { ok: true };
  });
  app.put<{ Params: { code: string } }>("/admin/breeds/:code", { preHandler: [admin] }, async (req) => {
    const b = z.object({ species: z.string(), nameRu: z.string(), nameKk: z.string(), direction: z.string().optional(), enabled: z.boolean().default(true) }).parse(req.body);
    const row = { code: req.params.code, species: b.species, name_ru: b.nameRu, name_kk: b.nameKk, direction: b.direction ?? null, enabled: b.enabled };
    await db.insertInto("breeds").values(row).onConflict((oc) => oc.column("code").doUpdateSet(row)).execute();
    return { ok: true };
  });
  app.put<{ Params: { code: string } }>("/admin/reject-reasons/:code", { preHandler: [admin] }, async (req) => {
    const b = z.object({ ru: z.string(), kk: z.string(), enabled: z.boolean().default(true) }).parse(req.body);
    await db.insertInto("reject_reasons").values({ code: req.params.code, ...b }).onConflict((oc) => oc.column("code").doUpdateSet(b)).execute();
    return { ok: true };
  });

  // ---- Карантинные зоны
  app.get("/admin/quarantine-zones", { preHandler: [app.requirePermission("quarantine:read")] }, async () => ({
    items: await db.selectFrom("quarantine_zones").selectAll().select(sql<string | null>`ST_AsGeoJSON(geom)`.as("geojson")).orderBy("starts_at", "desc").execute(),
  }));
  app.post("/admin/quarantine-zones", { preHandler: [admin] }, async (req, reply) => {
    const zn = QuarantineZoneSchema.parse(req.body);
    const geom = zn.polygon ? sql`ST_GeogFromText(${"SRID=4326;POLYGON((" + [...zn.polygon, zn.polygon[0]!].map((p) => `${p[0]} ${p[1]}`).join(",") + "))"})` : null;
    const zone = await db.insertInto("quarantine_zones").values({
      name_ru: zn.nameRu, name_kk: zn.nameKk, disease: zn.disease, action: zn.action, species: zn.species, starts_at: zn.startsAt, ends_at: zn.endsAt,
      center_lat: zn.centerLat ?? null, center_lng: zn.centerLng ?? null, radius_km: zn.radiusKm ?? null, block_transport: zn.blockTransport, source: zn.source ?? null, created_by: req.user!.id,
      ...(geom ? { geom: geom as any } : {}),
    } as any).returningAll().executeTakeFirstOrThrow();
    const applied = await applyQuarantineZones();
    await audit(req.user!.id, "admin.quarantine.create", { type: "quarantine_zone", id: zone.id }, { applied }, req.ip);
    reply.status(201); return { zone, applied };
  });
  app.patch<{ Params: { id: string } }>("/admin/quarantine-zones/:id", { preHandler: [admin] }, async (req) => {
    const p = z.object({ endsAt: z.string().datetime().nullable().optional(), action: z.enum(["hide", "flag"]).optional(), blockTransport: z.boolean().optional() }).parse(req.body);
    const zone = await db.updateTable("quarantine_zones").set({ ...(p.endsAt !== undefined && { ends_at: p.endsAt }), ...(p.action && { action: p.action }), ...(p.blockTransport !== undefined && { block_transport: p.blockTransport }) }).where("id", "=", req.params.id).returningAll().executeTakeFirst();
    if (!zone) throw new AppError(404, "zone_not_found");
    const applied = await applyQuarantineZones();
    await audit(req.user!.id, "admin.quarantine.update", { type: "quarantine_zone", id: zone.id }, { ...p, applied }, req.ip);
    return { zone, applied };
  });
  app.delete<{ Params: { id: string } }>("/admin/quarantine-zones/:id", { preHandler: [admin] }, async (req) => {
    await db.updateTable("quarantine_zones").set({ ends_at: new Date() }).where("id", "=", req.params.id).execute(); // «снять» = завершить
    const applied = await applyQuarantineZones();
    await audit(req.user!.id, "admin.quarantine.end", { type: "quarantine_zone", id: req.params.id }, { applied }, req.ip);
    return { ok: true, applied };
  });

  // ---- Комиссии, тарифы, промокоды, настройки
  app.get("/admin/commission-rules", { preHandler: [app.requirePermission("finance:read")] }, async () => ({ items: await db.selectFrom("commission_rules").selectAll().orderBy("priority", "desc").execute() }));
  app.post("/admin/commission-rules", { preHandler: [admin] }, async (req) => {
    const r = z.object({ category: z.string().default("*"), accountType: z.string().default("*"), percent: z.number().min(0).max(100), minKzt: z.number().int().default(0), maxKzt: z.number().int().nullable().default(null), priority: z.number().int().default(0), enabled: z.boolean().default(true) }).parse(req.body);
    const row = await db.insertInto("commission_rules").values({ category: r.category, account_type: r.accountType, percent: r.percent, min_kzt: r.minKzt, max_kzt: r.maxKzt, priority: r.priority, enabled: r.enabled }).returningAll().executeTakeFirstOrThrow();
    await audit(req.user!.id, "admin.commission.create", { type: "commission_rule", id: row.id }, r, req.ip);
    return { rule: row };
  });
  app.delete<{ Params: { id: string } }>("/admin/commission-rules/:id", { preHandler: [admin] }, async (req) => { await db.deleteFrom("commission_rules").where("id", "=", req.params.id).execute(); return { ok: true }; });
  app.put<{ Params: { code: string } }>("/admin/tariffs/:code", { preHandler: [admin] }, async (req) => {
    const t = z.object({ nameRu: z.string(), nameKk: z.string(), kind: z.string(), priceKzt: z.number().int(), durationDays: z.number().int().nullable().default(null), params: z.record(z.any()).default({}), enabled: z.boolean().default(true) }).parse(req.body);
    const row = { code: req.params.code, name_ru: t.nameRu, name_kk: t.nameKk, kind: t.kind, price_kzt: t.priceKzt, duration_days: t.durationDays, params: JSON.stringify(t.params), enabled: t.enabled };
    await db.insertInto("tariffs").values(row).onConflict((oc) => oc.column("code").doUpdateSet(row)).execute();
    return { ok: true };
  });
  app.post("/admin/promo-codes", { preHandler: [admin] }, async (req) => {
    const p = z.object({ code: z.string().min(3), kind: z.enum(["commission_discount", "bonus_kzt", "promotion_free"]), value: z.number(), maxUses: z.number().int().nullable().default(null), validUntil: z.string().datetime().nullable().default(null) }).parse(req.body);
    const row = await db.insertInto("promo_codes").values({ code: p.code.toUpperCase(), kind: p.kind, value: p.value, max_uses: p.maxUses, valid_until: p.validUntil }).returningAll().executeTakeFirstOrThrow();
    return { promoCode: row };
  });
  app.get("/admin/settings", { preHandler: [admin] }, async () => ({ items: await db.selectFrom("settings").selectAll().execute() }));
  app.put<{ Params: { key: string } }>("/admin/settings/:key", { preHandler: [admin] }, async (req) => {
    const { value } = z.object({ value: z.any() }).parse(req.body);
    await db.insertInto("settings").values({ key: req.params.key, value: JSON.stringify(value) }).onConflict((oc) => oc.column("key").doUpdateSet({ value: JSON.stringify(value), updated_at: new Date() })).execute();
    await audit(req.user!.id, "admin.settings.set", { type: "setting", id: req.params.key }, { value }, req.ip);
    return { ok: true };
  });

  // ---- CMS и баннеры
  app.put<{ Params: { slug: string } }>("/admin/cms/:slug", { preHandler: [admin] }, async (req) => {
    const p = z.object({ titleRu: z.string(), titleKk: z.string(), bodyRu: z.string(), bodyKk: z.string(), kind: z.enum(["page", "faq", "article", "legal"]).default("page"), published: z.boolean().default(true) }).parse(req.body);
    const row = { slug: req.params.slug, title_ru: p.titleRu, title_kk: p.titleKk, body_ru: p.bodyRu, body_kk: p.bodyKk, kind: p.kind, published: p.published, updated_at: new Date() };
    await db.insertInto("cms_pages").values(row).onConflict((oc) => oc.column("slug").doUpdateSet(row)).execute();
    return { ok: true };
  });
  app.post("/admin/banners", { preHandler: [admin] }, async (req) => {
    const b = z.object({ title: z.string().optional(), mediaId: z.string().uuid().optional(), link: z.string().optional(), regionCodes: z.array(z.string()).default([]), roles: z.array(z.string()).default([]), endsAt: z.string().datetime().optional() }).parse(req.body);
    const row = await db.insertInto("banners").values({ title: b.title ?? null, media_id: b.mediaId ?? null, link: b.link ?? null, region_codes: b.regionCodes, roles: b.roles, ends_at: b.endsAt ?? null }).returningAll().executeTakeFirstOrThrow();
    return { banner: row };
  });

  // ---- Рассылки и push-кампании с сегментацией
  app.post("/admin/broadcast", { preHandler: [admin] }, async (req) => {
    const b = z.object({ titleRu: z.string(), titleKk: z.string(), bodyRu: z.string().optional(), bodyKk: z.string().optional(), regionCodes: z.array(z.string()).default([]), roles: z.array(z.string()).default([]), limit: z.number().int().max(5_000).default(2_000) }).parse(req.body);
    let q = db.selectFrom("users").select("id").where("deleted_at", "is", null).where("is_blocked", "=", false).limit(b.limit);
    if (b.regionCodes.length) q = q.where("region_code", "in", b.regionCodes);
    if (b.roles.length) q = q.where(sql<boolean>`roles && ${b.roles}::text[]`);
    const users = await q.execute();
    // доставка в фоне пачками, чтобы запрос не держал соединение минутами
    setImmediate(async () => { for (const u of users) { try { await notify({ userId: u.id, type: "system", titleRu: b.titleRu, titleKk: b.titleKk, bodyRu: b.bodyRu, bodyKk: b.bodyKk }); } catch (e) { req.log.warn({ err: e }, "broadcast item failed"); } } });
    await audit(req.user!.id, "admin.broadcast", undefined, { count: users.length, segment: { regions: b.regionCodes, roles: b.roles } }, req.ip);
    return { queued: users.length };
  });

  // ---- Журнал действий
  app.get("/admin/audit", { preHandler: [admin] }, async (req) => {
    const { page = 1 } = z.object({ page: z.coerce.number().default(1) }).parse(req.query);
    return { items: await db.selectFrom("audit_log").selectAll().orderBy("created_at", "desc").limit(100).offset((page - 1) * 100).execute() };
  });

  // ---- Сделки/споры/выплаты (обзор для финменеджера/арбитра)
  app.get("/admin/deals", { preHandler: [app.requirePermission("deal:read_any")] }, async (req) => {
    const { status } = z.object({ status: z.string().optional() }).parse(req.query);
    let q = db.selectFrom("deals").selectAll().orderBy("created_at", "desc").limit(100);
    if (status) q = q.where("status", "=", status);
    return { items: await q.execute() };
  });
  app.get("/admin/payouts", { preHandler: [app.requirePermission("payout:read")] }, async () => ({ items: await db.selectFrom("payouts").selectAll().orderBy("created_at", "desc").limit(200).execute() }));
  app.post<{ Params: { id: string } }>("/admin/payouts/:id/mark-paid", { preHandler: [app.requirePermission("payout:update")] }, async (req) => {
    await db.updateTable("payouts").set({ status: "paid", paid_at: new Date() }).where("id", "=", req.params.id).execute();
    await audit(req.user!.id, "finance.payout.paid", { type: "payout", id: req.params.id }, {}, req.ip);
    return { ok: true };
  });
}
