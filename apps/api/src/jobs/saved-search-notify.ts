import { ListingSearchSchema } from "@malsatu/shared";
import { db } from "../db/index.js";
import { buildSearchQuery, regionSubtree } from "../modules/listings/repo.js";
import { notify } from "../services/notifications.js";
/** Уведомления по сохранённым поискам: новые объявления с момента последней проверки. Также — отклики на запросы «Куплю» (wanted ↔ продавцы региона). */
export async function notifySavedSearches() {
  const searches = await db.selectFrom("saved_searches").selectAll().where("notify", "=", true).execute();
  let sent = 0;
  for (const s of searches) {
    const parsed = ListingSearchSchema.safeParse({ ...(s.query as object), publishedSince: (s.last_notified_at ?? s.created_at).toISOString(), page: 1, limit: 5 });
    if (!parsed.success) continue;
    const regionCodes = parsed.data.region ? await regionSubtree(db, parsed.data.region) : null;
    const rows = await buildSearchQuery(db, parsed.data, { regionCodes }).execute();
    if (rows.length) {
      await notify({ userId: s.user_id, type: "saved_search", titleRu: `Новые объявления: ${s.name}`, titleKk: `Жаңа хабарландырулар: ${s.name}`, bodyRu: rows.map((r) => r.title_ru).filter(Boolean).slice(0, 3).join("; "), bodyKk: rows.map((r) => r.title_kk).filter(Boolean).slice(0, 3).join("; "), data: { savedSearchId: s.id, count: rows.length } });
      sent++;
    }
    await db.updateTable("saved_searches").set({ last_notified_at: new Date() }).where("id", "=", s.id).execute();
  }
  // «Куплю»: продавцам региона с активными объявлениями той же категории — уведомление о новых запросах за последние 15 минут
  const wanted = await db.selectFrom("listings").selectAll().where("kind", "=", "wanted").where("status", "=", "active").where("published_at", ">", new Date(Date.now() - 15 * 60_000)).execute();
  for (const w of wanted) {
    const sellers = await db.selectFrom("listings").select("owner_user_id").distinct().where("kind", "!=", "wanted").where("status", "=", "active").where("category_code", "=", w.category_code).where("top_region_code", "=", w.top_region_code).where("owner_user_id", "!=", w.owner_user_id).limit(200).execute();
    for (const sl of sellers) { await notify({ userId: sl.owner_user_id, type: "saved_search", titleRu: "Новый запрос «Куплю» в вашем регионе", titleKk: "Сіздің аймағыңызда жаңа «Сатып аламын» сұранысы", bodyRu: w.title_ru ?? "", bodyKk: w.title_kk ?? "", data: { listingId: w.id } }); sent++; }
  }
  return { sent };
}
