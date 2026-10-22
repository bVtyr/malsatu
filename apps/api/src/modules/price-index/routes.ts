/** Публичный индекс цен: средние по видам/регионам, динамика по неделям и месяцам, сравнение регионов. */
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { sql } from "kysely";
import { db } from "../../db/index.js";

export default async function priceIndexRoutes(app: FastifyInstance) {
  app.get("/price-index", async (req, reply) => {
    const q = z.object({ category: z.string().optional(), region: z.string().optional(), unit: z.string().optional() }).parse(req.query);
    let qb = db.selectFrom("price_index_daily").selectAll().where("day", "=", (eb) => eb.selectFrom("price_index_daily").select((e) => e.fn.max("day").as("d")));
    if (q.category) qb = qb.where("category_code", "=", q.category);
    if (q.region) qb = qb.where("region_code", "=", q.region);
    if (q.unit) qb = qb.where("unit", "=", q.unit);
    reply.header("cache-control", "public, max-age=900");
    return { items: await qb.orderBy("category_code").orderBy("region_code").execute() };
  });

  app.get("/price-index/history", async (req, reply) => {
    const q = z.object({ category: z.string(), region: z.string().default("kz"), unit: z.string().default("per_head"), granularity: z.enum(["day", "week", "month"]).default("week"), months: z.coerce.number().min(1).max(24).default(6) }).parse(req.query);
    const rows = await sql<{ period: string; avg: number; median: number; count: number }>`
      SELECT date_trunc(${q.granularity}, day)::date AS period, round(avg(avg_kzt))::bigint AS avg, round(avg(median_kzt))::bigint AS median, sum(count)::int AS count
      FROM price_index_daily WHERE category_code = ${q.category} AND region_code = ${q.region} AND unit = ${q.unit} AND day >= now() - (${q.months} || ' months')::interval
      GROUP BY 1 ORDER BY 1`.execute(db);
    reply.header("cache-control", "public, max-age=900");
    return { series: rows.rows };
  });

  app.get("/price-index/compare", async (req) => {
    const q = z.object({ category: z.string(), unit: z.string().default("per_head") }).parse(req.query);
    const rows = await db.selectFrom("price_index_daily").innerJoin("regions", "regions.code", "price_index_daily.region_code").selectAll("price_index_daily").select(["regions.name_ru", "regions.name_kk"])
      .where("category_code", "=", q.category).where("unit", "=", q.unit).where("day", "=", (eb) => eb.selectFrom("price_index_daily").select((e) => e.fn.max("day").as("d"))).orderBy("median_kzt").execute();
    return { regions: rows };
  });
}
