/** Применение карантинных зон к объявлениям: скрыть/пометить/вернуть, уведомить продавцов. Вызывается при создании зоны и из job. */
import { sql } from "kysely";
import { evaluateListing, SPECIES_OF_CATEGORY } from "@malsatu/shared";
import { db } from "../../db/index.js";
import { loadActiveZones } from "../listings/service.js";
import { notify } from "../../services/notifications.js";

export async function applyQuarantineZones(): Promise<{ hidden: number; restored: number; flagged: number }> {
  const zones = await loadActiveZones();
  const speciesByCat = new Map((await db.selectFrom("categories").select(["code", "species"]).execute()).map((c) => [c.code, c.species]));
  const listings = await db.selectFrom("listings").select(["id", "owner_user_id", "lat", "lng", "category_code", "kind", "status", "status_before_quarantine", "quarantine_flagged", "quarantine_zone_ids"])
    .where("status", "in", ["active", "reserved", "hidden_quarantine", "pending_moderation"]).where("deleted_at", "is", null).execute();
  let hidden = 0, restored = 0, flagged = 0;
  const notifyHidden: string[] = [], notifyRestored: string[] = [];
  for (const l of listings) {
    const r = evaluateListing({ lat: l.lat, lng: l.lng }, speciesByCat.get(l.category_code) ?? SPECIES_OF_CATEGORY(l.category_code), zones);
    const zoneIds = r.zones.map((z) => z.id);
    const shouldHide = r.hidden && l.kind === "livestock";
    if (shouldHide && l.status !== "hidden_quarantine") {
      await db.updateTable("listings").set({ status: "hidden_quarantine", status_before_quarantine: l.status, quarantine_flagged: true, quarantine_zone_ids: zoneIds }).where("id", "=", l.id).execute();
      hidden++; notifyHidden.push(l.owner_user_id);
    } else if (!shouldHide && l.status === "hidden_quarantine") {
      // срок объявления продлеваем на время, пока оно было скрыто
      await db.updateTable("listings").set((eb) => ({ status: l.status_before_quarantine ?? "active", status_before_quarantine: null, quarantine_flagged: r.flagged, quarantine_zone_ids: zoneIds, expires_at: sql`greatest(expires_at, now() + interval '7 days')` as any })).where("id", "=", l.id).execute();
      restored++; notifyRestored.push(l.owner_user_id);
    } else if (r.flagged !== l.quarantine_flagged || zoneIds.join() !== l.quarantine_zone_ids.join()) {
      await db.updateTable("listings").set({ quarantine_flagged: r.flagged, quarantine_zone_ids: zoneIds }).where("id", "=", l.id).execute();
      if (r.flagged) flagged++;
    }
  }
  for (const uid of new Set(notifyHidden)) await notify({ userId: uid, type: "quarantine", titleRu: "Введён карантин: объявления скрыты", titleKk: "Карантин енгізілді: хабарландырулар жасырылды", bodyRu: "В вашем районе введены ветеринарные ограничения. Объявления о живом скоте временно скрыты, перевозка из зоны заблокирована.", bodyKk: "Сіздің ауданыңызда ветеринариялық шектеулер енгізілді. Тірі мал туралы хабарландырулар уақытша жасырылды, аймақтан тасымалдау бұғатталды." });
  for (const uid of new Set(notifyRestored)) await notify({ userId: uid, type: "quarantine", titleRu: "Карантин снят: объявления снова видны", titleKk: "Карантин алынды: хабарландырулар қайта көрінеді" });
  // Заявки на перевозку из зоны — блокируем
  await sql`UPDATE transport_requests tr SET status = 'blocked_quarantine' WHERE tr.status = 'open' AND tr.cargo_kind = 'livestock' AND EXISTS (
    SELECT 1 FROM quarantine_zones z WHERE z.block_transport AND z.starts_at <= now() AND (z.ends_at IS NULL OR z.ends_at > now())
      AND (z.species IS NULL OR tr.species IS NULL OR tr.species = ANY(z.species))
      AND ((z.geom IS NOT NULL AND ST_Covers(z.geom, ST_SetSRID(ST_MakePoint(tr.from_lng, tr.from_lat),4326)::geography))
        OR (z.center_lat IS NOT NULL AND ST_DWithin(ST_SetSRID(ST_MakePoint(z.center_lng, z.center_lat),4326)::geography, ST_SetSRID(ST_MakePoint(tr.from_lng, tr.from_lat),4326)::geography, z.radius_km*1000))))`.execute(db);
  // заявки, заблокированные карантином, открываем снова, если точка больше не в зоне с блокировкой
  await sql`UPDATE transport_requests tr SET status = 'open' WHERE tr.status = 'blocked_quarantine' AND NOT EXISTS (
    SELECT 1 FROM quarantine_zones z WHERE z.block_transport AND z.starts_at <= now() AND (z.ends_at IS NULL OR z.ends_at > now())
      AND (z.species IS NULL OR tr.species IS NULL OR tr.species = ANY(z.species))
      AND ((z.geom IS NOT NULL AND ST_Covers(z.geom, ST_SetSRID(ST_MakePoint(tr.from_lng, tr.from_lat),4326)::geography))
        OR (z.center_lat IS NOT NULL AND ST_DWithin(ST_SetSRID(ST_MakePoint(z.center_lng, z.center_lat),4326)::geography, ST_SetSRID(ST_MakePoint(tr.from_lng, tr.from_lat),4326)::geography, z.radius_km*1000))))`.execute(db);
  return { hidden, restored, flagged };
}
