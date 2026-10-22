/** Биржа перевозок (v2): заявка → отклики перевозчиков → выбор. Проверка карантина и ветдокументов для живого скота. */
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { haversineKm, estimateTransport, transportAllowed, type VehicleType } from "@malsatu/shared";
import { db } from "../../db/index.js";
import { AppError } from "../../plugins/errors.js";
import { loadActiveZones } from "../listings/service.js";
import { notify } from "../../services/notifications.js";

export default async function transportRoutes(app: FastifyInstance) {
  app.get("/transport/estimate", async (req) => {
    const q = z.object({ vehicle: z.enum(["livestock_truck", "refrigerator", "flatbed"]), fromLat: z.coerce.number(), fromLng: z.coerce.number(), toLat: z.coerce.number(), toLng: z.coerce.number(), heads: z.coerce.number().optional(), tons: z.coerce.number().optional() }).parse(req.query);
    const km = Math.round(haversineKm({ lat: q.fromLat, lng: q.fromLng }, { lat: q.toLat, lng: q.toLng }) * 1.25); // дорожный коэффициент
    return { distanceKm: km, ...estimateTransport(q.vehicle as VehicleType, km, { heads: q.heads, tons: q.tons }) };
  });

  app.post("/transport/requests", { preHandler: [app.authenticate] }, async (req, reply) => {
    const r = z.object({ dealId: z.string().uuid().optional(), fromRegion: z.string().optional(), fromLat: z.number(), fromLng: z.number(), toRegion: z.string().optional(), toLat: z.number(), toLng: z.number(), cargoKind: z.enum(["livestock", "meat", "other"]), species: z.string().optional(), heads: z.number().int().optional(), tons: z.number().optional(), dateFrom: z.string(), dateTo: z.string().optional(), vetDocsConfirmed: z.boolean().default(false), combineAllowed: z.boolean().default(true) }).parse(req.body);
    if (r.cargoKind === "livestock" && !r.vetDocsConfirmed) throw new AppError(400, "vet_docs_required");
    if (r.cargoKind === "livestock") {
      const t = transportAllowed({ lat: r.fromLat, lng: r.fromLng }, r.species ?? null, await loadActiveZones());
      if (!t.allowed) throw new AppError(409, "quarantine_transport_blocked", undefined, { zones: t.blockedBy.map((z) => z.id) });
    }
    const km = Math.round(haversineKm({ lat: r.fromLat, lng: r.fromLng }, { lat: r.toLat, lng: r.toLng }) * 1.25);
    const row = await db.insertInto("transport_requests").values({ requester_id: req.user!.id, deal_id: r.dealId ?? null, from_region: r.fromRegion ?? null, from_lat: r.fromLat, from_lng: r.fromLng, to_region: r.toRegion ?? null, to_lat: r.toLat, to_lng: r.toLng, distance_km: km, cargo_kind: r.cargoKind, species: r.species ?? null, heads: r.heads ?? null, tons: r.tons ?? null, date_from: r.dateFrom, date_to: r.dateTo ?? null, requires_temp: r.cargoKind === "meat", vet_docs_confirmed: r.vetDocsConfirmed, combine_allowed: r.combineAllowed }).returningAll().executeTakeFirstOrThrow();
    if (r.dealId) await db.updateTable("deals").set({ transport_request_id: row.id }).where("id", "=", r.dealId).execute();
    // уведомить перевозчиков, работающих в регионе отправления
    const carriers = await db.selectFrom("carrier_profiles").select("user_id").where((eb) => eb.or([eb("regions", "@>", [r.fromRegion ?? ""] as any), eb("regions", "=", [] as any)])).limit(200).execute().catch(() => []);
    for (const c of carriers) await notify({ userId: c.user_id, type: "system", titleRu: "Новая заявка на перевозку", titleKk: "Жаңа тасымалдау өтінімі", bodyRu: `${km} км, ${r.cargoKind}`, bodyKk: `${km} км, ${r.cargoKind}`, data: { transportRequestId: row.id } });
    reply.status(201); return { request: row, estimate: estimateTransport(r.cargoKind === "meat" ? "refrigerator" : "livestock_truck", km, { heads: r.heads, tons: r.tons }) };
  });

  app.get("/transport/requests", { preHandler: [app.authenticate] }, async (req) => {
    const mine = (req.query as any).mine === "true";
    let q = db.selectFrom("transport_requests").selectAll().orderBy("created_at", "desc").limit(100);
    q = mine ? q.where("requester_id", "=", req.user!.id) : q.where("status", "=", "open");
    return { items: await q.execute() };
  });

  app.post<{ Params: { id: string } }>("/transport/requests/:id/bids", { preHandler: [app.requirePermission("transport:bid")] }, async (req, reply) => {
    const b = z.object({ priceKzt: z.number().int().positive(), vehicleType: z.enum(["livestock_truck", "refrigerator", "flatbed"]), comment: z.string().max(500).optional() }).parse(req.body);
    const r = await db.selectFrom("transport_requests").selectAll().where("id", "=", req.params.id).where("status", "=", "open").executeTakeFirst();
    if (!r) throw new AppError(404, "request_not_found");
    if (r.requires_temp && b.vehicleType !== "refrigerator") throw new AppError(400, "refrigerator_required");
    const bid = await db.insertInto("transport_bids").values({ request_id: r.id, carrier_id: req.user!.id, price_kzt: b.priceKzt, vehicle_type: b.vehicleType, comment: b.comment ?? null }).returningAll().executeTakeFirstOrThrow();
    await notify({ userId: r.requester_id, type: "system", titleRu: "Новое предложение перевозчика", titleKk: "Тасымалдаушының жаңа ұсынысы", bodyRu: `${b.priceKzt} ₸`, bodyKk: `${b.priceKzt} ₸`, data: { transportRequestId: r.id } });
    reply.status(201); return { bid };
  });
  app.get<{ Params: { id: string } }>("/transport/requests/:id/bids", { preHandler: [app.authenticate] }, async (req) => ({ items: await db.selectFrom("transport_bids").innerJoin("users", "users.id", "transport_bids.carrier_id").leftJoin("carrier_profiles", "carrier_profiles.user_id", "users.id").selectAll("transport_bids").select(["users.display_name", "carrier_profiles.rating", "carrier_profiles.trips_count", "carrier_profiles.verified"]).where("request_id", "=", req.params.id).orderBy("price_kzt").execute() }));
  app.post<{ Params: { id: string } }>("/transport/requests/:id/choose", { preHandler: [app.authenticate] }, async (req) => {
    const { bidId } = z.object({ bidId: z.string().uuid() }).parse(req.body);
    const r = await db.selectFrom("transport_requests").selectAll().where("id", "=", req.params.id).where("requester_id", "=", req.user!.id).executeTakeFirst();
    if (!r) throw new AppError(404, "request_not_found");
    const bid = await db.selectFrom("transport_bids").selectAll().where("id", "=", bidId).where("request_id", "=", r.id).executeTakeFirst();
    if (!bid) throw new AppError(404, "bid_not_found");
    await db.transaction().execute(async (trx) => {
      await trx.updateTable("transport_bids").set({ status: "rejected" }).where("request_id", "=", r.id).where("id", "!=", bidId).execute();
      await trx.updateTable("transport_bids").set({ status: "accepted" }).where("id", "=", bidId).execute();
      await trx.updateTable("transport_requests").set({ status: "assigned", chosen_bid_id: bidId }).where("id", "=", r.id).execute();
    });
    await notify({ userId: bid.carrier_id, type: "system", titleRu: "Вас выбрали перевозчиком", titleKk: "Сізді тасымалдаушы ретінде таңдады", data: { transportRequestId: r.id } });
    return { ok: true };
  });
  app.post<{ Params: { id: string } }>("/transport/requests/:id/track", { preHandler: [app.requirePermission("transport:bid")] }, async (req) => {
    const t = z.object({ lat: z.number(), lng: z.number(), tempC: z.number().optional() }).parse(req.body);
    await db.insertInto("transport_tracking").values({ request_id: req.params.id, lat: t.lat, lng: t.lng, temp_c: t.tempC ?? null }).execute();
    return { ok: true };
  });
  app.post<{ Params: { id: string } }>("/transport/requests/:id/status", { preHandler: [app.authenticate] }, async (req) => {
    const { status } = z.object({ status: z.enum(["in_transit", "delivered", "cancelled"]) }).parse(req.body);
    await db.updateTable("transport_requests").set({ status }).where("id", "=", req.params.id).execute();
    return { ok: true };
  });
  app.put("/carrier/profile", { preHandler: [app.authenticate] }, async (req) => {
    const p = z.object({ vehicleTypes: z.array(z.enum(["livestock_truck", "refrigerator", "flatbed"])), capacityHeads: z.number().int().optional(), capacityTons: z.number().optional(), regions: z.array(z.string()).default([]), vehicleMediaIds: z.array(z.string().uuid()).default([]) }).parse(req.body);
    const row = { user_id: req.user!.id, vehicle_types: p.vehicleTypes, capacity_heads: p.capacityHeads ?? null, capacity_tons: p.capacityTons ?? null, regions: p.regions, vehicle_media_ids: p.vehicleMediaIds };
    await db.insertInto("carrier_profiles").values(row).onConflict((oc) => oc.column("user_id").doUpdateSet(row)).execute();
    if (!req.user!.roles.includes("carrier")) await db.updateTable("users").set({ roles: [...req.user!.roles, "carrier"] }).where("id", "=", req.user!.id).execute();
    return { ok: true };
  });
}
