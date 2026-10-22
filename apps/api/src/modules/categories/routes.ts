import type { FastifyInstance } from "fastify";
import { db } from "../../db/index.js";

export default async function categoriesRoutes(app: FastifyInstance) {
  app.get("/categories", async (_req, reply) => {
    reply.header("cache-control", "public, max-age=600");
    const categories = await db.selectFrom("categories").selectAll().where("enabled", "=", true).orderBy("sort").execute();
    return { categories };
  });
  app.get<{ Params: { code: string } }>("/categories/:code", async (req) => {
    const c = await db.selectFrom("categories").selectAll().where("code", "=", req.params.code).executeTakeFirst();
    const children = c ? await db.selectFrom("categories").selectAll().where("parent_code", "=", c.code).where("enabled", "=", true).orderBy("sort").execute() : [];
    const breeds = c?.species ? await db.selectFrom("breeds").selectAll().where("species", "=", c.species).where("enabled", "=", true).execute() : [];
    return { category: c ?? null, children, breeds };
  });
  app.get<{ Querystring: { species?: string } }>("/breeds", async (req) => {
    let q = db.selectFrom("breeds").selectAll().where("enabled", "=", true);
    if (req.query.species) q = q.where("species", "=", req.query.species);
    return { breeds: await q.execute() };
  });
  app.get("/document-types", async () => ({ documentTypes: await db.selectFrom("document_types").selectAll().execute() }));
  app.get("/reject-reasons", async () => ({ reasons: await db.selectFrom("reject_reasons").selectAll().where("enabled", "=", true).execute() }));
}
