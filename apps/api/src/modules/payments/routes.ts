/**
 * Вебхук платёжного провайдера и статус платежа.
 * Подпись проверяется по сырому телу (парсер JSON в этом scope сохраняет строку), событие применяется условным UPDATE:
 * повторная доставка вебхука или гонка с ручным опросом не переведёт сделку дважды.
 */
import type { FastifyInstance } from "fastify";
import { db } from "../../db/index.js";
import { AppError } from "../../plugins/errors.js";
import { payments } from "../../services/payments.js";
import { dealsService } from "../deals/routes.js";
import { markSharePaid } from "../pools/routes.js";

export default async function paymentsRoutes(app: FastifyInstance) {
  // сырое тело только для вебхука: парсер инкапсулирован в этом плагине
  app.addContentTypeParser("application/json", { parseAs: "string" }, (req, body, done) => {
    (req as any).rawBody = body;
    try { done(null, body.length ? JSON.parse(body as string) : {}); } catch (e) { done(e as Error, undefined); }
  });

  app.post("/payments/webhook", { config: { rateLimit: { max: 600, timeWindow: "1 minute" } } }, async (req, reply) => {
    const ev = payments.verifyWebhook(String((req as any).rawBody ?? ""), req.headers as any);
    if (!ev.ok || !ev.providerRef) { req.log.warn({ ip: req.ip }, "payment webhook rejected"); throw new AppError(401, "bad_signature"); }
    const pay = await db.selectFrom("payments").selectAll().where("provider", "=", payments.name).where("provider_ref", "=", ev.providerRef).executeTakeFirst();
    if (!pay) { reply.code(202); return { ok: true, ignored: "unknown_ref" }; } // не наш платёж: отвечаем 2xx, чтобы провайдер не ретраил
    if (ev.amountKzt != null && Math.round(ev.amountKzt) !== pay.amount_kzt) { req.log.error({ paymentId: pay.id, got: ev.amountKzt, want: pay.amount_kzt }, "payment amount mismatch"); throw new AppError(409, "amount_mismatch"); }
    if (ev.status === "succeeded") {
      const upd = await db.updateTable("payments").set({ status: "succeeded", updated_at: new Date() }).where("id", "=", pay.id).where("status", "=", "pending").executeTakeFirst();
      if (upd.numUpdatedRows) {
        if (pay.deal_id) await dealsService.markPaid(pay.deal_id);
        else if (pay.pool_share_id) await markSharePaid(pay.pool_share_id, pay.id);
        else await db.updateTable("auction_deposits").set({ status: "held" }).where("payment_id", "=", pay.id).where("status", "=", "pending").execute();
      }
    } else if (ev.status === "failed") {
      await db.updateTable("payments").set({ status: "failed", updated_at: new Date() }).where("id", "=", pay.id).where("status", "=", "pending").execute();
      await db.updateTable("auction_deposits").set({ status: "refunded" }).where("payment_id", "=", pay.id).where("status", "=", "pending").execute();
    }
    // refunded: возвраты инициируем мы сами и уже отметили их в БД
    return { ok: true };
  });

  app.get<{ Params: { id: string } }>("/payments/:id", { preHandler: [app.authenticate] }, async (req) => {
    const p = await db.selectFrom("payments").select(["id", "status", "amount_kzt", "deal_id", "pool_share_id", "receipt_url", "created_at"]).where("id", "=", req.params.id).where("user_id", "=", req.user!.id).executeTakeFirst();
    if (!p) throw new AppError(404, "payment_not_found");
    return { payment: p };
  });
}
