import { trustScore } from "@malsatu/shared";
import { db } from "../db/index.js";
/** Пересчёт доверия пользователя по фактам: верификация, сделки, проигранные споры, жалобы, возраст аккаунта, отклонения. */
export async function recomputeTrust(userId: string) {
  const u = await db.selectFrom("users").select(["verification_level", "deals_count", "created_at"]).where("id", "=", userId).executeTakeFirst();
  if (!u) return;
  const [lost, reports, rejected] = await Promise.all([
    db.selectFrom("disputes").innerJoin("deals", "deals.id", "disputes.deal_id").select((eb) => eb.fn.countAll<number>().as("n")).where("deals.seller_id", "=", userId).where("disputes.resolution", "in", ["refund", "partial_refund"]).executeTakeFirst(),
    db.selectFrom("reports").select((eb) => eb.fn.countAll<number>().as("n")).where("target_type", "=", "user").where("target_id", "=", userId).where("status", "=", "resolved").executeTakeFirst(),
    db.selectFrom("moderation_log").select((eb) => eb.fn.countAll<number>().as("n")).where("action", "=", "listing.reject").where("target_id", "in", (eb) => eb.selectFrom("listings").select("id").where("owner_user_id", "=", userId)).executeTakeFirst(),
  ]);
  const score = trustScore({ verificationLevel: u.verification_level as any, completedDeals: u.deals_count, disputesLost: Number(lost?.n ?? 0), reportsReceived: Number(reports?.n ?? 0), accountAgeDays: Math.floor((Date.now() - new Date(u.created_at).getTime()) / 86_400_000), listingsRejected: Number(rejected?.n ?? 0) });
  await db.updateTable("users").set({ trust_score: score }).where("id", "=", userId).execute();
}
