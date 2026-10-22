/** Бизнес-логика объявлений: создание, публикация (премодерация/антифрод/карантин), статусы, перевод. */
import { sql } from "kysely";
import {
  type ListingUpsert, checkListingText, accountLimits, listingExpiresAt, publishTarget, ownerCanSet, validateLivestockForPublish, normalizeToPerKg,
  isSuspiciouslyLow, evaluateListing, SPECIES_OF_CATEGORY, type QuarantineZone, type ListingStatus, type PriceUnit, type ListingKind,
} from "@malsatu/shared";
import { db } from "../../db/index.js";
import type { User, Listing } from "../../db/types.js";
import { translator } from "../../services/translate.js";
import { AppError } from "../../plugins/errors.js";
import { notify } from "../../services/notifications.js";
import { audit } from "../../plugins/audit.js";

export async function loadActiveZones(): Promise<QuarantineZone[]> {
  const rows = await db.selectFrom("quarantine_zones").selectAll().select(sql<string | null>`ST_AsGeoJSON(geom)`.as("geojson"))
    .where("starts_at", "<=", new Date()).where((eb) => eb.or([eb("ends_at", "is", null), eb("ends_at", ">", new Date())])).execute();
  return rows.map((r) => ({
    id: r.id, disease: r.disease as any, action: r.action as any, species: r.species, startsAt: r.starts_at, endsAt: r.ends_at, blockTransport: r.block_transport,
    circle: r.center_lat != null && r.center_lng != null && r.radius_km != null ? { center: { lat: r.center_lat, lng: r.center_lng }, radiusKm: Number(r.radius_km) } : undefined,
    polygon: r.geojson ? (JSON.parse(r.geojson).coordinates?.[0] as Array<[number, number]>) : undefined,
  }));
}

async function topRegionOf(code: string): Promise<string> {
  const r = await sql<{ code: string }>`
    WITH RECURSIVE up AS (SELECT code, parent_code FROM regions WHERE code = ${code} UNION ALL SELECT r.code, r.parent_code FROM regions r JOIN up ON r.code = up.parent_code)
    SELECT code FROM up WHERE parent_code IS NULL LIMIT 1`.execute(db);
  const top = r.rows[0]?.code; if (!top) throw new AppError(400, "region_not_found");
  return top;
}

async function mediaFlags(mediaIds: string[]) {
  if (!mediaIds.length) return { photos: 0, hasVideo: false };
  const rows = await db.selectFrom("media").select(["id", "kind"]).where("id", "in", mediaIds).execute();
  return { photos: rows.filter((m) => m.kind === "image").length, hasVideo: rows.some((m) => m.kind === "video") };
}

/** Автоперевод недостающего языка. mock-провайдер возвращает исходный текст с флагом auto_translated. */
async function fillTranslations(input: ListingUpsert) {
  const out = { title_ru: input.titleRu ?? null, title_kk: input.titleKk ?? null, description_ru: input.descriptionRu ?? null, description_kk: input.descriptionKk ?? null, auto_translated: false };
  const from = input.sourceLocale, to = from === "ru" ? "kk" : "ru";
  const srcTitle = from === "ru" ? out.title_ru : out.title_kk;
  const srcDesc = from === "ru" ? out.description_ru : out.description_kk;
  if (to === "kk" && !out.title_kk && srcTitle) { out.title_kk = await translator.translate(srcTitle, from, to); out.auto_translated = true; }
  if (to === "ru" && !out.title_ru && srcTitle) { out.title_ru = await translator.translate(srcTitle, from, to); out.auto_translated = true; }
  if (to === "kk" && !out.description_kk && srcDesc) { out.description_kk = await translator.translate(srcDesc, from, to); out.auto_translated = true; }
  if (to === "ru" && !out.description_ru && srcDesc) { out.description_ru = await translator.translate(srcDesc, from, to); out.auto_translated = true; }
  return out;
}

function derived(input: ListingUpsert, photos: number, hasVideo: boolean) {
  const a = input.attributes as Record<string, any>;
  const weight = input.avgWeightKg ?? (a.live_weight_kg ? Number(a.live_weight_kg) : null);
  return {
    has_video: hasVideo,
    has_docs: input.documentIds.length > 0,
    has_tags: input.tagNumbers.length > 0,
    halal: Boolean(a.halal) || Boolean(a.ritual),
    price_per_kg_kzt: normalizeToPerKg(input.priceKzt ?? 0, input.priceType as PriceUnit, weight, input.quantity),
    photos,
  };
}

export async function createListing(user: User, input: ListingUpsert): Promise<Listing> {
  const cat = await db.selectFrom("categories").selectAll().where("code", "=", input.categoryCode).where("enabled", "=", true).executeTakeFirst();
  if (!cat) throw new AppError(400, "category_not_found");
  if (input.kind !== "wanted" && cat.kind !== input.kind) throw new AppError(400, "category_kind_mismatch");
  const top = await topRegionOf(input.regionCode);
  const { photos, hasVideo } = await mediaFlags(input.mediaIds);
  const tr = await fillTranslations(input);
  const d = derived(input, photos, hasVideo);

  // Идемпотентность офлайн-черновика
  if (input.clientDraftId) {
    const existing = await db.selectFrom("listings").selectAll().where("owner_user_id", "=", user.id).where("client_draft_id", "=", input.clientDraftId).executeTakeFirst();
    if (existing) return existing;
  }
  const listing = await db.transaction().execute(async (trx) => {
    const l = await trx.insertInto("listings").values({
      owner_user_id: user.id, kind: input.kind, category_code: input.categoryCode, status: "draft", ...tr, source_locale: input.sourceLocale,
      price_type: input.priceType, price_kzt: input.priceType === "negotiable" ? null : input.priceKzt ?? null, price_per_kg_kzt: d.price_per_kg_kzt, bargain: input.bargain,
      quantity: input.quantity, initial_quantity: input.quantity, is_lot: input.isLot || input.quantity > 1, avg_weight_kg: input.avgWeightKg ?? null, weight_min_kg: input.weightMinKg ?? null, weight_max_kg: input.weightMaxKg ?? null,
      attributes: JSON.stringify(input.attributes), region_code: input.regionCode, top_region_code: top, lat: input.lat, lng: input.lng, address_hidden: input.addressHidden,
      delivery_options: input.deliveryOptions, escrow_available: input.escrowAvailable, has_video: d.has_video, has_docs: d.has_docs, has_tags: d.has_tags, halal: d.halal,
      needed_by: input.neededBy ?? null, client_draft_id: input.clientDraftId ?? null,
    }).returningAll().executeTakeFirstOrThrow();
    if (input.mediaIds.length) await trx.insertInto("listing_media").values(input.mediaIds.map((m, i) => ({ listing_id: l.id, media_id: m, sort: i, is_cover: i === 0 }))).execute();
    if (input.tagNumbers.length) await trx.insertInto("animal_tags").values(input.tagNumbers.map((t) => ({ listing_id: l.id, tag_number: t }))).execute();
    if (input.documentIds.length) await trx.updateTable("listing_documents").set({ listing_id: l.id }).where("id", "in", input.documentIds).execute();
    return l;
  });
  return listing;
}

export async function updateListing(user: User, id: string, input: ListingUpsert): Promise<Listing> {
  const cur = await db.selectFrom("listings").selectAll().where("id", "=", id).where("deleted_at", "is", null).executeTakeFirst();
  if (!cur) throw new AppError(404, "listing_not_found");
  if (cur.owner_user_id !== user.id) throw new AppError(403, "not_owner");
  const top = await topRegionOf(input.regionCode);
  const { photos, hasVideo } = await mediaFlags(input.mediaIds);
  const tr = await fillTranslations(input);
  const d = derived(input, photos, hasVideo);
  // Существенные правки активного объявления возвращают его на модерацию (если продавец на премодерации)
  const limits = accountLimits(user.trust_score, user.published_count);
  const backToModeration = cur.status === "active" && limits.premoderate;
  return db.transaction().execute(async (trx) => {
    const l = await trx.updateTable("listings").set({
      category_code: input.categoryCode, ...tr, source_locale: input.sourceLocale, price_type: input.priceType, price_kzt: input.priceType === "negotiable" ? null : input.priceKzt ?? null,
      price_per_kg_kzt: d.price_per_kg_kzt, bargain: input.bargain, quantity: input.quantity, is_lot: input.isLot || input.quantity > 1, avg_weight_kg: input.avgWeightKg ?? null,
      weight_min_kg: input.weightMinKg ?? null, weight_max_kg: input.weightMaxKg ?? null, attributes: JSON.stringify(input.attributes), region_code: input.regionCode, top_region_code: top,
      lat: input.lat, lng: input.lng, address_hidden: input.addressHidden, delivery_options: input.deliveryOptions, escrow_available: input.escrowAvailable,
      has_video: d.has_video, has_docs: d.has_docs, has_tags: d.has_tags, halal: d.halal, needed_by: input.neededBy ?? null,
      ...(backToModeration ? { status: "pending_moderation" } : {}),
    }).where("id", "=", id).returningAll().executeTakeFirstOrThrow();
    await trx.deleteFrom("listing_media").where("listing_id", "=", id).execute();
    if (input.mediaIds.length) await trx.insertInto("listing_media").values(input.mediaIds.map((m, i) => ({ listing_id: id, media_id: m, sort: i, is_cover: i === 0 }))).execute();
    await trx.deleteFrom("animal_tags").where("listing_id", "=", id).execute();
    if (input.tagNumbers.length) await trx.insertInto("animal_tags").values(input.tagNumbers.map((t) => ({ listing_id: id, tag_number: t }))).execute();
    if (backToModeration) await trx.insertInto("moderation_queue").values({ listing_id: id, reason: "first_listings", signals: JSON.stringify({ edited: true }) }).onConflict((oc) => oc.doNothing()).execute();
    return l;
  });
}

export interface PublishResult { listing: Listing; status: ListingStatus; signals: Record<string, unknown>; warnings: string[] }

/** Публикация: валидация → антифрод-сигналы → карантин → премодерация или active. */
export async function publishListing(user: User, id: string): Promise<PublishResult> {
  const l = await db.selectFrom("listings").selectAll().where("id", "=", id).executeTakeFirst();
  if (!l) throw new AppError(404, "listing_not_found");
  if (l.owner_user_id !== user.id) throw new AppError(403, "not_owner");
  if (!ownerCanSet(l.status as ListingStatus, "active") && !ownerCanSet(l.status as ListingStatus, "pending_moderation")) throw new AppError(409, "cannot_publish_from_status");

  const activeCount = await db.selectFrom("listings").select((eb) => eb.fn.countAll<number>().as("n")).where("owner_user_id", "=", user.id).where("status", "in", ["active", "reserved", "pending_moderation"]).executeTakeFirstOrThrow();
  const limits = accountLimits(user.trust_score, user.published_count);
  if (Number(activeCount.n) >= limits.maxActiveListings) throw new AppError(429, "listing_limit_reached", undefined, { max: limits.maxActiveListings });

  const photos = await db.selectFrom("listing_media").innerJoin("media", "media.id", "listing_media.media_id").select("media.kind").where("listing_id", "=", id).execute();
  const warnings: string[] = [];
  if (l.kind === "livestock") {
    const v = validateLivestockForPublish({ photos: photos.filter((p) => p.kind === "image").length, quantity: l.quantity, priceType: l.price_type as PriceUnit, priceKzt: l.price_kzt, video: l.has_video, categoryCode: l.category_code, regionCode: l.region_code, lat: l.lat });
    if (!v.ok) throw new AppError(400, "listing_incomplete", undefined, { errors: v.errors });
    warnings.push(...v.errors);
  }
  if (l.kind === "meat") {
    const a = l.attributes as Record<string, unknown>;
    if (!a.slaughter_date || !a.slaughter_place) throw new AppError(400, "listing_incomplete", undefined, { errors: ["slaughter_date", "slaughter_place"] });
  }

  // Антифрод-сигналы
  const signals: Record<string, unknown> = {};
  const text = `${l.title_ru ?? ""} ${l.title_kk ?? ""} ${l.description_ru ?? ""} ${l.description_kk ?? ""}`;
  const fraud = checkListingText(text);
  if (fraud.signals.length) signals.text = fraud.signals;
  const stat = await db.selectFrom("price_index_daily").selectAll().where("category_code", "=", l.category_code).where("region_code", "in", [l.top_region_code, "kz"]).where("unit", "=", l.price_type)
    .orderBy("day", "desc").orderBy(sql`region_code = ${l.top_region_code}`, "desc").executeTakeFirst();
  if (l.price_kzt && stat && isSuspiciouslyLow(l.price_kzt, { ...stat, count: stat.count, median: stat.median_kzt } as any)) signals.price_low = { price: l.price_kzt, median: stat.median_kzt };
  const dupPhotos = await sql<{ n: number }>`
    SELECT count(*)::int AS n FROM listing_media lm JOIN media m ON m.id = lm.media_id
    WHERE lm.listing_id = ${id} AND m.phash IS NOT NULL AND EXISTS (
      SELECT 1 FROM media m2 JOIN listing_media lm2 ON lm2.media_id = m2.id JOIN listings l2 ON l2.id = lm2.listing_id
      WHERE m2.phash = m.phash AND l2.owner_user_id <> ${user.id} AND l2.status IN ('active','reserved','sold'))`.execute(db);
  if ((dupPhotos.rows[0]?.n ?? 0) > 0) signals.duplicate_photos = dupPhotos.rows[0]!.n;
  const similarRecent = await db.selectFrom("listings").select((eb) => eb.fn.countAll<number>().as("n")).where("owner_user_id", "=", user.id).where("id", "!=", id)
    .where("category_code", "=", l.category_code).where("created_at", ">", new Date(Date.now() - 86_400_000)).executeTakeFirstOrThrow();
  if (Number(similarRecent.n) >= 10) signals.mass_posting = Number(similarRecent.n);

  // Карантин
  const zones = await loadActiveZones();
  const q = evaluateListing({ lat: l.lat, lng: l.lng }, SPECIES_OF_CATEGORY(l.category_code), zones);
  const needsModeration = limits.premoderate || Object.keys(signals).length > 0;
  let status: ListingStatus = publishTarget(needsModeration);
  if (q.hidden && l.kind === "livestock") status = "hidden_quarantine";
  const now = new Date();
  const listing = await db.transaction().execute(async (trx) => {
    const upd = await trx.updateTable("listings").set({
      status, published_at: now, expires_at: listingExpiresAt(now), quarantine_flagged: q.flagged, quarantine_zone_ids: q.zones.map((z) => z.id),
      status_before_quarantine: status === "hidden_quarantine" ? publishTarget(needsModeration) : null,
    }).where("id", "=", id).returningAll().executeTakeFirstOrThrow();
    if (status === "pending_moderation") {
      await trx.insertInto("moderation_queue").values({ listing_id: id, reason: limits.premoderate ? "first_listings" : "auto_flag", signals: JSON.stringify(signals) }).onConflict((oc) => oc.doNothing()).execute();
    }
    await trx.updateTable("users").set((eb) => ({ published_count: eb("published_count", "+", 1) })).where("id", "=", user.id).execute();
    return upd;
  });
  if (status === "hidden_quarantine") {
    await notify({ userId: user.id, type: "quarantine", titleRu: "Объявление скрыто: карантинная зона", titleKk: "Хабарландыру жасырылды: карантин аймағы",
      bodyRu: "Ваше объявление находится в зоне ветеринарных ограничений и будет показано после снятия карантина.", bodyKk: "Хабарландыруыңыз ветеринариялық шектеу аймағында, карантин алынғаннан кейін көрсетіледі.", data: { listingId: id } });
  }
  await audit(user.id, "listing.publish", { type: "listing", id }, { status, signals });
  return { listing, status, signals, warnings };
}

export async function setStatus(user: User, id: string, to: ListingStatus, soldQty?: number): Promise<Listing> {
  const l = await db.selectFrom("listings").selectAll().where("id", "=", id).executeTakeFirst();
  if (!l) throw new AppError(404, "listing_not_found");
  if (l.owner_user_id !== user.id) throw new AppError(403, "not_owner");
  if (to === "active" && (l.status === "draft" || l.status === "rejected" || l.status === "expired")) { return (await publishListing(user, id)).listing; }
  if (!ownerCanSet(l.status as ListingStatus, to)) throw new AppError(409, "invalid_status_transition");
  const patch: Record<string, unknown> = { status: to };
  if (to === "sold" && soldQty && soldQty < l.quantity) { patch.status = "active"; patch.quantity = l.quantity - soldQty; } // частичная продажа
  if (to === "sold" && !soldQty) patch.quantity = 0;
  return db.updateTable("listings").set(patch as any).where("id", "=", id).returningAll().executeTakeFirstOrThrow();
}

export async function extendListing(user: User, id: string): Promise<Listing> {
  const l = await db.selectFrom("listings").selectAll().where("id", "=", id).where("owner_user_id", "=", user.id).executeTakeFirst();
  if (!l) throw new AppError(404, "listing_not_found");
  if (!["active", "expired", "reserved"].includes(l.status)) throw new AppError(409, "cannot_extend");
  return db.updateTable("listings").set({ status: l.status === "expired" ? "active" : l.status, expires_at: listingExpiresAt(new Date()) }).where("id", "=", id).returningAll().executeTakeFirstOrThrow();
}

/** Подсказка рыночной цены для мастера создания. */
export async function priceHintFor(categoryCode: string, topRegionCode: string, unit: string) {
  const local = await db.selectFrom("price_index_daily").selectAll().where("category_code", "=", categoryCode).where("region_code", "=", topRegionCode).where("unit", "=", unit).orderBy("day", "desc").executeTakeFirst();
  if (local && local.count >= 3) return { scope: "region", ...local };
  const nat = await db.selectFrom("price_index_daily").selectAll().where("category_code", "=", categoryCode).where("region_code", "=", "kz").where("unit", "=", unit).orderBy("day", "desc").executeTakeFirst();
  if (nat && nat.count >= 3) return { scope: "country", ...nat };
  // Fallback: прямой расчёт по активным объявлениям за 30 дней
  const live = await sql<{ count: number; avg: number; median: number }>`
    SELECT count(*)::int AS count, round(avg(price_kzt))::bigint AS avg, percentile_cont(0.5) WITHIN GROUP (ORDER BY price_kzt)::bigint AS median
    FROM listings WHERE category_code = ${categoryCode} AND price_type = ${unit} AND price_kzt > 0 AND status IN ('active','reserved','sold') AND published_at > now() - interval '30 days'`.execute(db);
  const r = live.rows[0];
  return r && r.count >= 3 ? { scope: "country_live", count: r.count, avg_kzt: r.avg, median_kzt: r.median } : null;
}

export const KIND_OF_CATEGORY = (kind: string): ListingKind => kind as ListingKind;
