import type { FastifyInstance } from "fastify";
import { ReportSchema } from "@malsatu/shared";
import { db } from "../../db/index.js";

export default async function reportsRoutes(app: FastifyInstance) {
  app.post("/reports", { config: { rateLimit: { max: 10, timeWindow: "1 hour" } }, preHandler: [app.authenticate] }, async (req, reply) => {
    const r = ReportSchema.parse(req.body);
    const report = await db.insertInto("reports").values({ reporter_id: req.user!.id, target_type: r.targetType, target_id: r.targetId, reason: r.reason, comment: r.comment ?? null }).returningAll().executeTakeFirstOrThrow();
    if (r.targetType === "listing") {
      // 3+ жалобы → объявление в очередь модерации
      const n = await db.selectFrom("reports").select((eb) => eb.fn.countAll<number>().as("n")).where("target_type", "=", "listing").where("target_id", "=", r.targetId).where("status", "=", "open").executeTakeFirst();
      if (Number(n?.n ?? 0) >= 3) await db.insertInto("moderation_queue").values({ listing_id: r.targetId, reason: "report", signals: JSON.stringify({ reports: Number(n!.n) }) }).onConflict((oc) => oc.doNothing()).execute();
    }
    reply.status(201); return { report };
  });
}
