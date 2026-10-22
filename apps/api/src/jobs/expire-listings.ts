import { db } from "../db/index.js";
import { notify } from "../services/notifications.js";
/** Истечение срока объявлений (30 дней) + напоминание за 2 дня до истечения. */
export async function expireListings() {
  const now = new Date();
  const expired = await db.updateTable("listings").set({ status: "expired" }).where("status", "in", ["active", "reserved"]).where("expires_at", "<", now).returning(["id", "owner_user_id"]).execute();
  for (const l of expired) await notify({ userId: l.owner_user_id, type: "system", titleRu: "Срок объявления истёк", titleKk: "Хабарландыру мерзімі өтті", bodyRu: "Продлите объявление в личном кабинете.", bodyKk: "Жеке кабинетте хабарландыруды ұзартыңыз.", data: { listingId: l.id } });
  const soon = await db.selectFrom("listings").select(["id", "owner_user_id"]).where("status", "=", "active").where("expires_at", "<", new Date(now.getTime() + 2 * 86_400_000)).where("expires_at", ">", new Date(now.getTime() + 2 * 86_400_000 - 10 * 60_000)).execute();
  for (const l of soon) await notify({ userId: l.owner_user_id, type: "system", titleRu: "Объявление истекает через 2 дня", titleKk: "Хабарландыру 2 күннен кейін аяқталады", data: { listingId: l.id } });
  return { expired: expired.length, reminded: soon.length };
}
