/** Складчина (согым, v3): создание сбора, бронь/оплата долей, автоматический возврат при недоборе (job pool-deadlines). */
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { reserveShare, payShare, settleDeadline, unitsFree, sharePrice, distributeMeat, type PoolLike, type PoolShare, type ShareFraction } from "@malsatu/shared";
import { db } from "../../db/index.js";
import { AppError } from "../../plugins/errors.js";
import { payments } from "../../services/payments.js";
import { notify } from "../../services/notifications.js";

async function loadPool(id: string): Promise<{ row: any; pool: PoolLike }> {
  const row = await db.selectFrom("pools").selectAll().where("id", "=", id).executeTakeFirst();
  if (!row) throw new AppError(404, "pool_not_found");
  const shares = await db.selectFrom("pool_shares").selectAll().where("pool_id", "=", id).execute();
  const pool: PoolLike = { status: row.status as any, totalPriceKzt: row.total_price_kzt, deadline: row.deadline, reservationHoldMinutes: row.reservation_hold_minutes,
    shares: shares.map((s): PoolShare => ({ id: s.id, userId: s.user_id, units: s.units, status: s.status as any, amountKzt: s.amount_kzt, reservedAt: s.reserved_at })) };
  return { row, pool };
}

export async function settlePoolDeadlines(now = new Date()) {
  const open = await db.selectFrom("pools").select("id").where("status", "=", "open").where("deadline", "<=", now).execute();
  let refunded = 0;
  for (const p of open) {
    const { pool } = await loadPool(p.id);
    const { refunds } = settleDeadline(pool, now);
    await db.updateTable("pools").set({ status: "expired" }).where("id", "=", p.id).execute();
    await db.updateTable("pool_shares").set({ status: "cancelled" }).where("pool_id", "=", p.id).where("status", "=", "reserved").execute();
    for (const s of refunds) {
      const pay = await db.selectFrom("payments").selectAll().where("pool_share_id", "=", s.id).where("status", "=", "succeeded").executeTakeFirst();
      if (pay) { await payments.refund(pay.provider_ref ?? "", pay.amount_kzt); await db.updateTable("payments").set({ status: "refunded", refunded_kzt: pay.amount_kzt }).where("id", "=", pay.id).execute(); }
      await db.updateTable("pool_shares").set({ status: "refunded" }).where("id", "=", s.id).execute();
      await notify({ userId: s.userId, type: "deal", titleRu: "Складчина не состоялась — деньги возвращены", titleKk: "Соғым жиналмады — ақша қайтарылды", data: { poolId: p.id } });
      refunded++;
    }
  }
  return { expired: open.length, refunded };
}

export default async function poolsRoutes(app: FastifyInstance) {
  app.get("/pools", async (req) => {
    const region = (req.query as any).region as string | undefined;
    let q = db.selectFrom("pools").selectAll().where("status", "=", "open").where("deadline", ">", new Date()).orderBy("deadline").limit(100);
    if (region) q = q.where("region_code", "=", region);
    const rows = await q.execute();
    const out = [];
    for (const r of rows) { const { pool } = await loadPool(r.id); out.push({ ...r, unitsFree: unitsFree(pool), prices: { half: sharePrice(pool, "1/2"), quarter: sharePrice(pool, "1/4"), eighth: sharePrice(pool, "1/8") } }); }
    return { items: out };
  });
  app.get<{ Params: { id: string } }>("/pools/:id", async (req) => {
    const { row, pool } = await loadPool(req.params.id);
    return { pool: { ...row, unitsFree: unitsFree(pool), shares: pool.shares.map((s) => ({ ...s, userId: req.user?.id === s.userId ? s.userId : undefined })), prices: { half: sharePrice(pool, "1/2"), quarter: sharePrice(pool, "1/4"), eighth: sharePrice(pool, "1/8") }, distribution: row.carcass_weight_kg ? distributeMeat(pool, Number(row.carcass_weight_kg)) : null } };
  });
  app.post("/pools", { preHandler: [app.authenticate] }, async (req, reply) => {
    const p = z.object({ listingId: z.string().uuid().optional(), sellerId: z.string().uuid().optional(), species: z.enum(["horse", "cattle", "camel", "sheep"]), titleRu: z.string().min(3), titleKk: z.string().min(3), totalPriceKzt: z.number().int().positive(), carcassWeightKg: z.number().positive().optional(), deadline: z.string().datetime(), slaughterDate: z.string().optional(), regionCode: z.string(), deliveryIncluded: z.boolean().default(true) }).parse(req.body);
    const row = await db.insertInto("pools").values({ organizer_id: req.user!.id, listing_id: p.listingId ?? null, seller_id: p.sellerId ?? null, species: p.species, title_ru: p.titleRu, title_kk: p.titleKk, total_price_kzt: p.totalPriceKzt, carcass_weight_kg: p.carcassWeightKg ?? null, deadline: p.deadline, slaughter_date: p.slaughterDate ?? null, region_code: p.regionCode, delivery_included: p.deliveryIncluded }).returningAll().executeTakeFirstOrThrow();
    reply.status(201); return { pool: row };
  });
  app.post<{ Params: { id: string } }>("/pools/:id/reserve", { preHandler: [app.authenticate] }, async (req) => {
    const { fraction, partsPreference, deliveryAddress } = z.object({ fraction: z.enum(["1/2", "1/4", "1/8"]), partsPreference: z.array(z.string()).default([]), deliveryAddress: z.record(z.any()).optional() }).parse(req.body);
    const { pool } = await loadPool(req.params.id);
    const share = reserveShare(pool, req.user!.id, fraction as ShareFraction, "tmp");
    const row = await db.insertInto("pool_shares").values({ pool_id: req.params.id, user_id: req.user!.id, units: share.units, amount_kzt: share.amountKzt, parts_preference: partsPreference, delivery_address: deliveryAddress ? JSON.stringify(deliveryAddress) : null }).returningAll().executeTakeFirstOrThrow();
    return { share: row, holdMinutes: pool.reservationHoldMinutes };
  });
  app.post<{ Params: { id: string }; }>("/pools/:id/shares/:shareId/pay", { preHandler: [app.authenticate] }, async (req) => {
    const shareId = (req.params as any).shareId as string;
    const { pool } = await loadPool(req.params.id);
    const s = pool.shares.find((x) => x.id === shareId);
    if (!s || s.userId !== req.user!.id) throw new AppError(404, "share_not_found");
    const res = await payments.createPayment({ amountKzt: s.amountKzt, orderId: shareId, description: "MalSatu pool share", returnUrl: "" });
    const pay = await db.insertInto("payments").values({ pool_share_id: shareId, user_id: req.user!.id, provider: "mock", provider_ref: res.providerRef, amount_kzt: s.amountKzt, status: res.status }).returningAll().executeTakeFirstOrThrow();
    if (res.status !== "succeeded") return { payment: pay, payUrl: res.payUrl };
    payShare(pool, shareId);
    await db.updateTable("pool_shares").set({ status: "paid", paid_at: new Date(), payment_id: pay.id }).where("id", "=", shareId).execute();
    if (pool.status === "filled") {
      await db.updateTable("pools").set({ status: "filled" }).where("id", "=", req.params.id).execute();
      for (const uid of new Set(pool.shares.filter((x) => x.status === "paid").map((x) => x.userId))) await notify({ userId: uid, type: "deal", titleRu: "Складчина собрана! Скоро забой и доставка", titleKk: "Соғым жиналды! Жақында сою және жеткізу", data: { poolId: req.params.id } });
    }
    return { payment: pay, poolStatus: pool.status };
  });
  app.post<{ Params: { id: string } }>("/pools/:id/status", { preHandler: [app.authenticate] }, async (req) => {
    const { status } = z.object({ status: z.enum(["slaughtered", "distributed", "completed", "cancelled"]) }).parse(req.body);
    const { row } = await loadPool(req.params.id);
    if (row.organizer_id !== req.user!.id) throw new AppError(403, "not_organizer");
    await db.updateTable("pools").set({ status }).where("id", "=", req.params.id).execute();
    if (status === "completed") await db.updateTable("pool_shares").set({ status: "delivered" }).where("pool_id", "=", req.params.id).where("status", "=", "paid").execute();
    return { ok: true };
  });
  app.get("/users/me/pool-shares", { preHandler: [app.authenticate] }, async (req) => ({ items: await db.selectFrom("pool_shares").innerJoin("pools", "pools.id", "pool_shares.pool_id").selectAll("pool_shares").select(["pools.title_ru", "pools.title_kk", "pools.status as pool_status", "pools.deadline"]).where("pool_shares.user_id", "=", req.user!.id).orderBy("pool_shares.reserved_at", "desc").execute() }));
}
