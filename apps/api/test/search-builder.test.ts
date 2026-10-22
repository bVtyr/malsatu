import { describe, it, expect } from "vitest";
import { Kysely, PostgresDialect } from "kysely";
import { ListingSearchSchema } from "@malsatu/shared";
import { buildSearchQuery } from "../src/modules/listings/repo.js";
import type { Database } from "../src/db/types.js";

// Компилируем SQL без подключения к БД: драйвер не инициализируется до execute().
const db = new Kysely<Database>({ dialect: new PostgresDialect({ pool: {} as any }) });

describe("listing search query builder", () => {
  it("default query: active/reserved, newest first, paginated", () => {
    const { sql, parameters } = buildSearchQuery(db, ListingSearchSchema.parse({})).compile();
    expect(sql).toContain('"listings"."status" in');
    expect(sql).toContain("published_at DESC NULLS LAST");
    expect(sql).toMatch(/offset \$\d+/i);
    expect(parameters).toContain(20);
  });
  it("radius search uses ST_DWithin with metres and selects distance", () => {
    const { sql, parameters } = buildSearchQuery(db, ListingSearchSchema.parse({ lat: "43.2", lng: "76.9", radiusKm: "50", sort: "near" })).compile();
    expect(sql).toContain("ST_DWithin");
    expect(parameters).toContain(50_000);
    expect(sql).toContain("distance_km");
    expect(sql).toContain("<->");
  });
  it("applies attribute and flag filters", () => {
    const { sql, parameters } = buildSearchQuery(db, ListingSearchSchema.parse({ kind: "livestock", category: "sheep", breed: "edilbay", sex: "male", purpose: "kurban", withDocs: "true", withTags: "1", verifiedOnly: "true", halal: "false", priceMin: "50000", priceMax: "150000", ageMin: "12" })).compile();
    expect(sql).toContain("attributes->>");
    expect(sql).toContain("attributes->'purpose' ?");
    expect(sql).toContain('"listings"."has_docs" = ');
    expect(sql).toContain('"listings"."has_tags" = ');
    expect(sql).toContain('"verification_level" >= ');
    expect(sql).not.toContain('"listings"."halal"'); // halal=false → фильтр не применяется
    expect(parameters).toEqual(expect.arrayContaining(["edilbay", "male", "kurban", 50000, 150000, 12]));
    expect(sql).toContain('"parent_code" = '); // подкатегории
  });
  it("full-text search expands kk/ru synonyms into tsquery and trigram fallback", () => {
    const { sql, parameters } = buildSearchQuery(db, ListingSearchSchema.parse({ q: "қой" })).compile();
    expect(sql).toContain("to_tsquery('simple'");
    expect(sql).toContain(" % ");
    const ts = parameters.find((p) => typeof p === "string" && p.includes(":*")) as string;
    expect(ts).toContain("овца:*");
    expect(ts).toContain("баран:*");
  });
  it("region filter restricts to subtree codes; sort by price per kg", () => {
    const { sql, parameters } = buildSearchQuery(db, ListingSearchSchema.parse({ sort: "per_kg" }), { regionCodes: ["kz-zha", "kz-zha-merke"] }).compile();
    expect(sql).toContain('"listings"."region_code" in');
    expect(parameters).toEqual(expect.arrayContaining(["kz-zha", "kz-zha-merke"]));
    expect(sql).toContain("price_per_kg_kzt ASC NULLS LAST");
  });
  it("promoted listings always sort first", () => {
    const { sql } = buildSearchQuery(db, ListingSearchSchema.parse({ sort: "cheap" })).compile();
    expect(sql.indexOf("promoted_until")).toBeLessThan(sql.indexOf("price_kzt ASC"));
  });
});
