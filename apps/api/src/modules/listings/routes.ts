import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { sql } from "kysely";
import { ListingSearchSchema, ListingUpsertSchema, gridCluster, fuzzLocation, slaughterYield, estimateTransport, haversineKm, type ListingStatus } from "@malsatu/shared";
import { db } from "../../db/index.js";
import { buildSearchQuery, regionSubtree } from "./repo.js";
import { createListing, updateListing, publishListing, setStatus, extendListing, priceHintFor } from "./service.js";
import { AppError } from "../../plugins/errors.js";
import { track } from "../../plugins/audit.js";
import { publicProfile } from "../auth/routes.js";

async function hydrate(listings: any[], viewerId?: string | null) {
  if (!listings.length) return [];
  const ids = listings.map((l) => l.id);
  const [media, owners, favs] = await Promise.all([
    db.selectFrom("listing_media").innerJoin("media", "media.id", "listing_media.media_id").select(["listing_media.listing_id", "listing_media.sort", "listing_media.is_cover", "media.id", "media.kind", "media.url", "media.thumb_url", "media.width", "media.height"]).where("listing_media.listing_id", "in", ids).orderBy("listing_media.sort").execute(),
    db.selectFrom("users").select(["id", "display_name", "farm_name", "verification_level", "rating", "reviews_count", "deals_count", "response_minutes", "region_code", "account_type", "created_at"]).where("id", "in", [...new Set(listings.map((l) => l.owner_user_id))]).execute(),
    viewerId ? db.selectFrom("favorites").select("listing_id").where("user_id", "=", viewerId).where("listing_id", "in", ids).execute() : Promise.resolve([]),
  ]);
  const favSet = new Set(favs.map((f) => f.listing_id));
  const ownerMap = new Map(owners.map((o) => [o.id, o]));
  return listings.map((l) => {
    const loc = l.address_hidden ? { lat: l.public_lat ?? Math.round(l.lat * 100) / 100, lng: l.public_lng ?? Math.round(l.lng * 100) / 100 } : { lat: l.lat, lng: l.lng };
    const { search_vector: _sv, location: _loc, lat: _la, lng: _ln, public_lat: _pa, public_lng: _pb, ...rest } = l;
    return { ...rest, approxLat: loc.lat, approxLng: loc.lng, media: media.filter((m) => m.listing_id === l.id), owner: ownerMap.get(l.owner_user_id) ?? null, isFavorite: favSet.has(l.id) };
  });
}

export default async function listingsRoutes(app: FastifyInstance) {
  // Поиск/витрина
  app.get("/listings", async (req) => {
    const s = ListingSearchSchema.parse(req.query);
    const regionCodes = s.region ? await regionSubtree(db, s.region) : null;
    const viewer = req.user?.region_code ? await db.selectFrom("regions").select(["lat", "lng"]).where("code", "=", req.user.region_code).executeTakeFirst() : null;
    const q = buildSearchQuery(db, s, { regionCodes, viewer: viewer?.lat != null && viewer?.lng != null ? { lat: viewer.lat, lng: viewer.lng } : null });
    const rows = await q.execute();
    const total = await db.selectFrom(buildSearchQuery(db, { ...s, page: 1, limit: 1000 }, { regionCodes }).clearSelect().clearOrderBy().clearOffset().select("listings.id").as("t")).select((eb) => eb.fn.countAll<number>().as("n")).executeTakeFirst(); // потолок 1000: дальше показываем «1000+»
    return { items: await hydrate(rows, req.user?.id), page: s.page, limit: s.limit, total: Number(total?.n ?? 0) };
  });

  // Режим карты: кластеры по zoom
  app.get("/listings/map", async (req) => {
    const s = ListingSearchSchema.parse({ ...(req.query as object), limit: 50 });
    const zoom = Number((req.query as any).zoom ?? 6);
    const bbox = (req.query as any).bbox ? String((req.query as any).bbox).split(",").map(Number) : null; // minLng,minLat,maxLng,maxLat
    const regionCodes = s.region ? await regionSubtree(db, s.region) : null;
    let q = buildSearchQuery(db, { ...s, page: 1, limit: 5000 }, { regionCodes }).clearSelect().select(["listings.id", "listings.lat", "listings.lng", "listings.public_lat", "listings.public_lng", "listings.price_kzt", "listings.price_type", "listings.title_ru", "listings.title_kk", "listings.category_code", "listings.address_hidden"]);
    if (bbox && bbox.length === 4 && bbox.every(Number.isFinite)) q = q.where("listings.public_lng", ">=", bbox[0]!).where("listings.public_lat", ">=", bbox[1]!).where("listings.public_lng", "<=", bbox[2]!).where("listings.public_lat", "<=", bbox[3]!); // по размытой точке: границами bbox нельзя найти двор
    const rows = await q.execute();
    const pts = rows.map((r) => ({ ...r, lat: r.address_hidden ? r.public_lat : r.lat, lng: r.address_hidden ? r.public_lng : r.lng }));
    return { clusters: gridCluster(pts, zoom).map((c) => ({ lat: c.lat, lng: c.lng, count: c.count, items: c.items.map(({ lat, lng, id, price_kzt, price_type, title_ru, title_kk, category_code }) => ({ id, lat, lng, price_kzt, price_type, title_ru, title_kk, category_code })) })) };
  });

  app.get("/listings/price-hint", async (req) => {
    const { category, region, unit } = z.object({ category: z.string(), region: z.string(), unit: z.string().default("per_head") }).parse(req.query);
    const top = (await sql<{ code: string }>`WITH RECURSIVE up AS (SELECT code, parent_code FROM regions WHERE code = ${region} UNION ALL SELECT r.code, r.parent_code FROM regions r JOIN up ON r.code = up.parent_code) SELECT code FROM up WHERE parent_code IS NULL`.execute(db)).rows[0]?.code ?? region;
    return { hint: await priceHintFor(category, top, unit) };
  });

  app.get("/listings/yield", async (req) => {
    const p = z.object({ species: z.enum(["cattle", "sheep", "goat", "horse", "camel", "poultry"]), weight: z.coerce.number().positive(), fatness: z.enum(["low", "medium", "high"]).default("medium"), fatTailed: z.coerce.string().optional() }).parse(req.query);
    return { result: slaughterYield(p.species, p.weight, p.fatness, p.fatTailed === "true") };
  });

  app.get("/users/me/listings", { preHandler: [app.authenticate] }, async (req) => {
    const status = (req.query as any).status as string | undefined;
    let q = db.selectFrom("listings").selectAll().where("owner_user_id", "=", req.user!.id).where("deleted_at", "is", null).orderBy("updated_at", "desc").limit(200);
    if (status) q = q.where("status", "=", status);
    const items = await hydrate(await q.execute(), req.user!.id);
    // статистика одним запросом вместо N+1 с клиента
    const dealCounts = items.length ? await db.selectFrom("deals").select(["listing_id", (eb) => eb.fn.countAll<number>().as("n")]).where("listing_id", "in", items.map((i: any) => i.id)).where("status", "=", "completed").groupBy("listing_id").execute() : [];
    const dc = new Map(dealCounts.map((d) => [d.listing_id, Number(d.n)]));
    return { items: items.map((l: any) => ({ ...l, stats: { views: l.views_count, favorites: l.favorites_count, calls: l.calls_count, messages: l.messages_count, offers: l.offers_count, deals: dc.get(l.id) ?? 0, conversion: l.views_count ? Math.round(((l.calls_count + l.messages_count) / l.views_count) * 1000) / 10 : 0 } })) };
  });

  app.get<{ Params: { id: string } }>("/listings/:id", async (req) => {
    const l = await db.selectFrom("listings").selectAll().where("id", "=", req.params.id).where("deleted_at", "is", null).executeTakeFirst();
    if (!l) throw new AppError(404, "listing_not_found");
    const isOwner = req.user?.id === l.owner_user_id;
    const isStaff = (req.user?.roles ?? []).some((r) => ["moderator", "admin", "arbiter"].includes(r));
    if (!isOwner && !isStaff && !["active", "reserved", "sold"].includes(l.status)) throw new AppError(404, "listing_not_found");
    const [item] = await hydrate([l], req.user?.id);
    const [docs, tags, owner, zones] = await Promise.all([
      db.selectFrom("listing_documents").leftJoin("document_types", "document_types.code", "listing_documents.doc_type_code").selectAll("listing_documents").select(["document_types.name_ru", "document_types.name_kk"]).where("listing_id", "=", l.id).execute(),
      db.selectFrom("animal_tags").select(["tag_number", "verified_status"]).where("listing_id", "=", l.id).execute(),
      db.selectFrom("users").selectAll().where("id", "=", l.owner_user_id).executeTakeFirst(),
      l.quarantine_zone_ids.length ? db.selectFrom("quarantine_zones").select(["id", "name_ru", "name_kk", "disease", "ends_at"]).where("id", "in", l.quarantine_zone_ids).execute() : Promise.resolve([]),
    ]);
    // Приватность: точный адрес/координаты — только владельцу/стаффу или если продавец разрешил
    const exact = isOwner || isStaff || !l.address_hidden ? { lat: l.lat, lng: l.lng, addressText: l.address_text } : null;
    // Расстояние и ориентировочная доставка до покупателя (по региону покупателя)
    let distanceKm: number | null = null, delivery: ReturnType<typeof estimateTransport> | null = null;
    const vq = req.query as any;
    const vl = vq.lat && vq.lng ? { lat: Number(vq.lat), lng: Number(vq.lng) } : req.user?.region_code ? await db.selectFrom("regions").select(["lat", "lng"]).where("code", "=", req.user.region_code).executeTakeFirst().then((r) => (r?.lat != null && r.lng != null ? { lat: r.lat, lng: r.lng } : null)) : null;
    if (vl) { distanceKm = Math.max(5, Math.round(haversineKm(vl, { lat: l.public_lat, lng: l.public_lng }) / 5) * 5); delivery = estimateTransport(l.kind === "meat" ? "refrigerator" : "livestock_truck", distanceKm, l.kind === "meat" ? { tons: Math.max(0.1, (l.quantity ?? 1) / 1000) } : { heads: l.quantity }); }
    if (!isOwner) {
      await db.updateTable("listings").set((eb) => ({ views_count: eb("views_count", "+", 1) })).where("id", "=", l.id).execute();
      if (req.user) await db.insertInto("view_history").values({ user_id: req.user.id, listing_id: l.id }).onConflict((oc) => oc.columns(["user_id", "listing_id"]).doUpdateSet({ viewed_at: new Date() })).execute();
      track("listing_view", { userId: req.user?.id, listingId: l.id }).catch(() => undefined);
    }
    return { listing: { ...item, exact, documents: docs, tags, quarantineZones: zones, distanceKm, deliveryEstimate: delivery }, seller: owner ? publicProfile(owner) : null };
  });

  app.get<{ Params: { id: string } }>("/listings/:id/similar", async (req) => {
    const l = await db.selectFrom("listings").select(["id", "category_code", "top_region_code", "price_kzt", "lat", "lng"]).where("id", "=", req.params.id).executeTakeFirst();
    if (!l) return { items: [] };
    const rows = await db.selectFrom("listings").selectAll().where("status", "=", "active").where("id", "!=", l.id).where("category_code", "=", l.category_code)
      .orderBy(sql`(top_region_code = ${l.top_region_code}) DESC`).orderBy(sql`listings.location <-> ST_SetSRID(ST_MakePoint(${l.lng}, ${l.lat}),4326)::geography`).limit(8).execute();
    return { items: await hydrate(rows, req.user?.id) };
  });

  app.post("/listings", { preHandler: [app.requirePermission("listing:create")] }, async (req, reply) => {
    const input = ListingUpsertSchema.parse(req.body);
    const listing = await createListing(req.user!, input);
    reply.status(201); return { listing };
  });
  app.put<{ Params: { id: string } }>("/listings/:id", { preHandler: [app.authenticate] }, async (req) => ({ listing: await updateListing(req.user!, req.params.id, ListingUpsertSchema.parse(req.body)) }));
  app.post<{ Params: { id: string } }>("/listings/:id/publish", { preHandler: [app.authenticate] }, async (req) => publishListing(req.user!, req.params.id));
  app.post<{ Params: { id: string } }>("/listings/:id/status", { preHandler: [app.authenticate] }, async (req) => {
    const { status, soldQty } = z.object({ status: z.enum(["active", "reserved", "sold", "archived", "draft"]), soldQty: z.number().int().positive().optional() }).parse(req.body);
    return { listing: await setStatus(req.user!, req.params.id, status as ListingStatus, soldQty) };
  });
  app.post<{ Params: { id: string } }>("/listings/:id/extend", { preHandler: [app.authenticate] }, async (req) => ({ listing: await extendListing(req.user!, req.params.id) }));
  app.delete<{ Params: { id: string } }>("/listings/:id", { preHandler: [app.authenticate] }, async (req) => {
    const r = await db.updateTable("listings").set({ status: "archived", deleted_at: new Date() }).where("id", "=", req.params.id).where("owner_user_id", "=", req.user!.id).executeTakeFirst();
    if (!r.numUpdatedRows) throw new AppError(404, "listing_not_found");
    await db.updateTable("moderation_queue").set({ status: "rejected", resolved_at: new Date() }).where("listing_id", "=", req.params.id).where("status", "=", "pending").execute();
    return { ok: true };
  });

  // Документы объявления (ветсправки и т.д.) — прикрепляются до/после создания
  app.post<{ Params: { id: string } }>("/listings/:id/documents", { preHandler: [app.authenticate] }, async (req) => {
    const d = z.object({ docTypeCode: z.string(), mediaId: z.string().uuid().optional(), number: z.string().optional(), issuedAt: z.string().optional(), expiresAt: z.string().optional() }).parse(req.body);
    const l = await db.selectFrom("listings").select("owner_user_id").where("id", "=", req.params.id).executeTakeFirst();
    if (!l || l.owner_user_id !== req.user!.id) throw new AppError(404, "listing_not_found");
    const doc = await db.insertInto("listing_documents").values({ listing_id: req.params.id, doc_type_code: d.docTypeCode, media_id: d.mediaId ?? null, number: d.number ?? null, issued_at: d.issuedAt ?? null, expires_at: d.expiresAt ?? null }).returningAll().executeTakeFirstOrThrow();
    await db.updateTable("listings").set({ has_docs: true }).where("id", "=", req.params.id).execute();
    return { document: doc };
  });

  // Массовая загрузка из таблицы (CSV, UTF-8, разделитель ;). Возвращает черновики.
  app.post("/listings/bulk", { preHandler: [app.requirePermission("listing:create")] }, async (req) => {
    const { csv } = z.object({ csv: z.string().max(2_000_000) }).parse(req.body);
    const lines = csv.split(/\r?\n/).filter((l) => l.trim());
    if (lines.length > 501) throw new AppError(400, "csv_too_many_rows", undefined, { max: 500 });
    const header = lines.shift()!.split(";").map((h) => h.trim());
    const results: Array<{ row: number; id?: string; error?: string }> = [];
    for (let i = 0; i < lines.length; i++) {
      const cells = lines[i]!.split(";"); const rec: Record<string, string> = {};
      header.forEach((h, j) => (rec[h] = (cells[j] ?? "").trim()));
      try {
        const input = ListingUpsertSchema.parse({
          kind: rec.kind ?? "livestock", categoryCode: rec.category, titleRu: rec.title_ru || undefined, titleKk: rec.title_kk || undefined, descriptionRu: rec.description_ru || undefined,
          sourceLocale: rec.title_ru ? "ru" : "kk", priceType: rec.price_type ?? "per_head", priceKzt: rec.price ? Number(rec.price) : undefined, quantity: Number(rec.quantity || 1), isLot: Number(rec.quantity || 1) > 1,
          avgWeightKg: rec.avg_weight ? Number(rec.avg_weight) : undefined, attributes: { breed: rec.breed, sex: rec.sex, age_months: rec.age_months ? Number(rec.age_months) : undefined, purpose: rec.purpose ? rec.purpose.split(",") : undefined },
          tagNumbers: rec.tags ? rec.tags.split(",").map((t) => t.trim()).filter(Boolean) : [], regionCode: rec.region, lat: Number(rec.lat), lng: Number(rec.lng),
        });
        const l = await createListing(req.user!, input); results.push({ row: i + 2, id: l.id });
      } catch (e: any) { results.push({ row: i + 2, error: e.message ?? "error" }); }
    }
    return { results, created: results.filter((r) => r.id).length };
  });

  // Статистика продавца по объявлению
  app.get<{ Params: { id: string } }>("/listings/:id/stats", { preHandler: [app.authenticate] }, async (req) => {
    const l = await db.selectFrom("listings").select(["owner_user_id", "views_count", "favorites_count", "calls_count", "messages_count", "offers_count"]).where("id", "=", req.params.id).executeTakeFirst();
    if (!l || l.owner_user_id !== req.user!.id) throw new AppError(404, "listing_not_found");
    const deals = await db.selectFrom("deals").select((eb) => eb.fn.countAll<number>().as("n")).where("listing_id", "=", req.params.id).where("status", "=", "completed").executeTakeFirst();
    const contacts = l.calls_count + l.messages_count;
    return { stats: { views: l.views_count, favorites: l.favorites_count, calls: l.calls_count, messages: l.messages_count, offers: l.offers_count, deals: Number(deals?.n ?? 0), conversion: l.views_count ? Math.round((contacts / l.views_count) * 1000) / 10 : 0 } };
  });
}
