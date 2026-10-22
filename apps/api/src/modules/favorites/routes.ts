import type { FastifyInstance } from "fastify";
import { SavedSearchSchema } from "@malsatu/shared";
import { db } from "../../db/index.js";
import { AppError } from "../../plugins/errors.js";

export default async function favoritesRoutes(app: FastifyInstance) {
  app.get("/favorites", { preHandler: [app.authenticate] }, async (req) => {
    const items = await db.selectFrom("favorites").innerJoin("listings", "listings.id", "favorites.listing_id").selectAll("listings").select("favorites.created_at as favorited_at").where("favorites.user_id", "=", req.user!.id).orderBy("favorites.created_at", "desc").execute();
    return { items };
  });
  app.post<{ Params: { id: string } }>("/favorites/:id", { preHandler: [app.authenticate] }, async (req) => {
    await db.insertInto("favorites").values({ user_id: req.user!.id, listing_id: req.params.id }).onConflict((oc) => oc.doNothing()).execute();
    return { ok: true };
  });
  app.delete<{ Params: { id: string } }>("/favorites/:id", { preHandler: [app.authenticate] }, async (req) => {
    await db.deleteFrom("favorites").where("user_id", "=", req.user!.id).where("listing_id", "=", req.params.id).execute();
    return { ok: true };
  });

  app.get("/history", { preHandler: [app.authenticate] }, async (req) => ({
    items: await db.selectFrom("view_history").innerJoin("listings", "listings.id", "view_history.listing_id").selectAll("listings").select("view_history.viewed_at").where("view_history.user_id", "=", req.user!.id).orderBy("view_history.viewed_at", "desc").limit(50).execute(),
  }));

  app.get("/compare", { preHandler: [app.authenticate] }, async (req) => ({
    items: await db.selectFrom("comparisons").innerJoin("listings", "listings.id", "comparisons.listing_id").selectAll("listings").where("comparisons.user_id", "=", req.user!.id).limit(5).execute(),
  }));
  app.post<{ Params: { id: string } }>("/compare/:id", { preHandler: [app.authenticate] }, async (req) => {
    const n = await db.selectFrom("comparisons").select((eb) => eb.fn.countAll<number>().as("n")).where("user_id", "=", req.user!.id).executeTakeFirst();
    if (Number(n?.n ?? 0) >= 5) throw new AppError(400, "compare_limit");
    await db.insertInto("comparisons").values({ user_id: req.user!.id, listing_id: req.params.id }).onConflict((oc) => oc.doNothing()).execute();
    return { ok: true };
  });
  app.delete<{ Params: { id: string } }>("/compare/:id", { preHandler: [app.authenticate] }, async (req) => { await db.deleteFrom("comparisons").where("user_id", "=", req.user!.id).where("listing_id", "=", req.params.id).execute(); return { ok: true }; });

  // Сохранённые поиски с уведомлениями о новых объявлениях (job saved-search-notify)
  app.get("/saved-searches", { preHandler: [app.authenticate] }, async (req) => ({ items: await db.selectFrom("saved_searches").selectAll().where("user_id", "=", req.user!.id).orderBy("created_at", "desc").execute() }));
  app.post("/saved-searches", { preHandler: [app.authenticate] }, async (req, reply) => {
    const s = SavedSearchSchema.parse(req.body);
    const row = await db.insertInto("saved_searches").values({ user_id: req.user!.id, name: s.name, query: JSON.stringify(s.query), notify: s.notify, last_notified_at: new Date() }).returningAll().executeTakeFirstOrThrow();
    reply.status(201); return { savedSearch: row };
  });
  app.delete<{ Params: { id: string } }>("/saved-searches/:id", { preHandler: [app.authenticate] }, async (req) => { await db.deleteFrom("saved_searches").where("id", "=", req.params.id).where("user_id", "=", req.user!.id).execute(); return { ok: true }; });
}
