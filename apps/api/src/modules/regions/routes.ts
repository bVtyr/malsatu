import type { FastifyInstance } from "fastify";
import { sql } from "kysely";
import { db } from "../../db/index.js";

export default async function regionsRoutes(app: FastifyInstance) {
  // Дерево регионов (кэшируется на фронте; ETag по max(updated)). Параметр parent — ленивое раскрытие.
  app.get<{ Querystring: { parent?: string; level?: string } }>("/regions", async (req, reply) => {
    let q = db.selectFrom("regions").selectAll().where("enabled", "=", true).orderBy("sort").orderBy("name_ru");
    if (req.query.parent === "") q = q.where("parent_code", "is", null);
    else if (req.query.parent) q = q.where("parent_code", "=", req.query.parent);
    if (req.query.level) q = q.where("level", "=", req.query.level);
    reply.header("cache-control", "public, max-age=3600");
    return { regions: await q.execute() };
  });

  // Определение региона по геолокации: ближайший населённый пункт/район, затем область.
  app.get<{ Querystring: { lat: string; lng: string } }>("/regions/resolve", async (req) => {
    const lat = Number(req.query.lat), lng = Number(req.query.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return { region: null };
    const nearest = await db.selectFrom("regions").selectAll()
      .select(sql<number>`ST_Distance(ST_SetSRID(ST_MakePoint(lng, lat),4326)::geography, ST_SetSRID(ST_MakePoint(${lng}, ${lat}),4326)::geography) / 1000`.as("distance_km"))
      .where("enabled", "=", true).where("lat", "is not", null)
      .orderBy(sql`ST_SetSRID(ST_MakePoint(lng, lat),4326)::geography <-> ST_SetSRID(ST_MakePoint(${lng}, ${lat}),4326)::geography`)
      .limit(1).executeTakeFirst();
    if (!nearest) return { region: null };
    const path = [];
    let cur: any = nearest;
    while (cur) { path.unshift(cur); cur = cur.parent_code ? await db.selectFrom("regions").selectAll().where("code", "=", cur.parent_code).executeTakeFirst() : null; }
    return { region: nearest, path, top: path[0] };
  });

  app.get<{ Params: { code: string } }>("/regions/:code", async (req) => {
    const r = await db.selectFrom("regions").selectAll().where("code", "=", req.params.code).executeTakeFirst();
    const children = r ? await db.selectFrom("regions").selectAll().where("parent_code", "=", r.code).where("enabled", "=", true).orderBy("name_ru").execute() : [];
    return { region: r ?? null, children };
  });
}
