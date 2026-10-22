/** Построитель поискового запроса объявлений. Чистая функция над Kysely-билдером — тестируется компиляцией SQL без БД. */
import { sql, type Kysely, type SelectQueryBuilder } from "kysely";
import { toTsQuery, type ListingSearch } from "@malsatu/shared";
import type { Database } from "../../db/types.js";

export interface SearchContext { regionCodes?: string[] | null; viewer?: { lat: number; lng: number } | null; includeStatuses?: string[] }

const ATTR_FILTERS: Array<[keyof ListingSearch, string]> = [["breed", "breed"], ["sex", "sex"]];

export function buildSearchQuery(db: Kysely<Database>, s: ListingSearch, ctx: SearchContext = {}) {
  const statuses = ctx.includeStatuses ?? ["active", "reserved"];
  let q = db.selectFrom("listings").selectAll("listings")
    .where("listings.status", "in", statuses).where("listings.deleted_at", "is", null);

  if (s.kind) q = q.where("listings.kind", "=", s.kind);
  if (s.category) q = q.where((eb) => eb.or([
    eb("listings.category_code", "=", s.category!),
    eb("listings.category_code", "in", eb.selectFrom("categories").select("code").where("parent_code", "=", s.category!)),
  ]));
  if (ctx.regionCodes && ctx.regionCodes.length) q = q.where("listings.region_code", "in", ctx.regionCodes);
  if (s.priceType) q = q.where("listings.price_type", "=", s.priceType);
  if (s.priceMin != null) q = q.where("listings.price_kzt", ">=", s.priceMin);
  if (s.priceMax != null) q = q.where("listings.price_kzt", "<=", s.priceMax);
  if (s.qtyMin != null) q = q.where("listings.quantity", ">=", s.qtyMin);
  if (s.weightMin != null) q = q.where((eb) => eb.or([eb("listings.avg_weight_kg", ">=", s.weightMin!), sql<boolean>`(listings.attributes->>'live_weight_kg')::numeric >= ${s.weightMin}`]));
  if (s.weightMax != null) q = q.where((eb) => eb.or([eb("listings.avg_weight_kg", "<=", s.weightMax!), sql<boolean>`(listings.attributes->>'live_weight_kg')::numeric <= ${s.weightMax}`]));
  if (s.ageMin != null) q = q.where(sql<boolean>`(listings.attributes->>'age_months')::numeric >= ${s.ageMin}`);
  if (s.ageMax != null) q = q.where(sql<boolean>`(listings.attributes->>'age_months')::numeric <= ${s.ageMax}`);
  for (const [param, attr] of ATTR_FILTERS) { const v = s[param]; if (v) q = q.where(sql<boolean>`listings.attributes->>${attr} = ${String(v)}`); }
  if (s.purpose) q = q.where(sql<boolean>`listings.attributes->'purpose' ? ${s.purpose}`);
  if (s.withDocs) q = q.where("listings.has_docs", "=", true);
  if (s.withTags) q = q.where("listings.has_tags", "=", true);
  if (s.withVideo) q = q.where("listings.has_video", "=", true);
  if (s.halal) q = q.where("listings.halal", "=", true);
  if (s.escrow) q = q.where("listings.escrow_available", "=", true);
  if (s.withDelivery) q = q.where(sql<boolean>`listings.delivery_options && ARRAY['seller_delivery','platform_carrier']::text[]`);
  if (s.verifiedOnly) q = q.where("listings.owner_user_id", "in", (eb) => eb.selectFrom("users").select("id").where("verification_level", ">=", 2));
  if (s.publishedSince) q = q.where("listings.published_at", ">=", new Date(s.publishedSince));

  const hasGeo = s.lat != null && s.lng != null;
  const point = hasGeo ? sql`ST_SetSRID(ST_MakePoint(${s.lng}, ${s.lat}), 4326)::geography` : null;
  if (hasGeo && s.radiusKm) q = q.where(sql<boolean>`ST_DWithin(listings.location, ${point}, ${s.radiusKm * 1000})`);
  if (hasGeo) q = q.select(sql<number>`ST_Distance(listings.location, ${point}) / 1000.0`.as("distance_km"));
  else if (ctx.viewer) q = q.select(sql<number>`ST_Distance(listings.location, ST_SetSRID(ST_MakePoint(${ctx.viewer.lng}, ${ctx.viewer.lat}),4326)::geography) / 1000.0`.as("distance_km"));

  if (s.q && s.q.trim()) {
    const ts = toTsQuery(s.q);
    const like = `%${s.q.trim()}%`;
    q = q.where((eb) => eb.or([
      sql<boolean>`listings.search_vector @@ to_tsquery('simple', ${ts})`,
      sql<boolean>`(coalesce(listings.title_ru,'') || ' ' || coalesce(listings.title_kk,'')) ILIKE ${like}`,
      sql<boolean>`similarity(coalesce(listings.title_ru,'') || ' ' || coalesce(listings.title_kk,''), ${s.q.trim()}) > 0.3`,
    ]));
  }

  // Сортировка: продвинутые — всегда сверху, далее выбранный порядок.
  q = q.orderBy(sql`(listings.promoted_until IS NOT NULL AND listings.promoted_until > now())`, "desc");
  switch (s.sort) {
    case "cheap": q = q.orderBy(sql`listings.price_kzt ASC NULLS LAST`); break;
    case "expensive": q = q.orderBy(sql`listings.price_kzt DESC NULLS LAST`); break;
    case "per_kg": q = q.orderBy(sql`listings.price_per_kg_kzt ASC NULLS LAST`); break;
    case "near":
      if (hasGeo) q = q.orderBy(sql`listings.location <-> ${point}`);
      else if (ctx.viewer) q = q.orderBy(sql`listings.location <-> ST_SetSRID(ST_MakePoint(${ctx.viewer.lng}, ${ctx.viewer.lat}),4326)::geography`);
      else q = q.orderBy("listings.published_at", "desc");
      break;
    case "rating": q = q.orderBy(sql`(SELECT rating FROM users WHERE users.id = listings.owner_user_id) DESC NULLS LAST`); break;
    default: q = q.orderBy(sql`listings.published_at DESC NULLS LAST`);
  }
  return q.offset((s.page - 1) * s.limit).limit(s.limit);
}

/** Коды региона и всех его потомков (для фильтра «регион/район»). */
export async function regionSubtree(db: Kysely<Database>, code: string): Promise<string[]> {
  const rows = await sql<{ code: string }>`
    WITH RECURSIVE t AS (SELECT code FROM regions WHERE code = ${code} UNION ALL SELECT r.code FROM regions r JOIN t ON r.parent_code = t.code)
    SELECT code FROM t`.execute(db);
  return rows.rows.map((r) => r.code);
}

export type SearchQuery = ReturnType<typeof buildSearchQuery>;
export type AnyListingQuery = SelectQueryBuilder<Database, "listings", any>;
