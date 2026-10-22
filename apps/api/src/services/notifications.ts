/** Уведомления: запись в БД + доставка по каналам (push/sms/telegram/email) с учётом настроек и «тихих часов». */
import webpush from "web-push";
import { db } from "../db/index.js";
import { config } from "../config.js";
import { sms } from "./sms.js";

if (config.VAPID_PUBLIC_KEY && config.VAPID_PRIVATE_KEY) webpush.setVapidDetails(config.VAPID_SUBJECT, config.VAPID_PUBLIC_KEY, config.VAPID_PRIVATE_KEY);

export type NotificationType = "message" | "offer" | "deal" | "saved_search" | "quarantine" | "price" | "moderation" | "system";

export interface NotifyInput { userId: string; type: NotificationType; titleRu: string; titleKk: string; bodyRu?: string; bodyKk?: string; data?: Record<string, unknown> }

export async function notify(n: NotifyInput) {
  const settings = await db.selectFrom("notification_settings").selectAll().where("user_id", "=", n.userId).executeTakeFirst();
  const prefs = (settings?.prefs as Record<string, string[]> | undefined) ?? {};
  const channels = prefs[n.type] ?? ["push"];
  const row = await db.insertInto("notifications").values({
    user_id: n.userId, type: n.type, title_ru: n.titleRu, title_kk: n.titleKk, body_ru: n.bodyRu ?? null, body_kk: n.bodyKk ?? null,
    data: JSON.stringify(n.data ?? {}), channels,
  }).returningAll().executeTakeFirstOrThrow();
  if (inQuietHours(settings?.quiet_from ?? null, settings?.quiet_to ?? null)) return row; // доставит job позже
  await deliver(row.id).catch((e) => console.error("notify deliver failed", e));
  return row;
}

/** Местное время пользователя (Казахстан, UTC+5 с 2024 года): тихие часы считаем по нему, а не по часам сервера. */
export function localMinutes(now: Date, timeZone = "Asia/Almaty"): number {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone, hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(now);
  const h = Number(parts.find((p) => p.type === "hour")?.value ?? 0) % 24; const m = Number(parts.find((p) => p.type === "minute")?.value ?? 0);
  return h * 60 + m;
}
export function inQuietHours(from: string | null, to: string | null, now = new Date(), timeZone = "Asia/Almaty"): boolean {
  if (!from || !to) return false;
  const [fh, fm] = from.split(":").map(Number); const [th, tm] = to.split(":").map(Number);
  const cur = localMinutes(now, timeZone); const f = (fh ?? 0) * 60 + (fm ?? 0); const t = (th ?? 0) * 60 + (tm ?? 0);
  return f <= t ? cur >= f && cur < t : cur >= f || cur < t; // например 22:00–08:00
}

export async function deliver(notificationId: string): Promise<boolean> {
  const n = await db.selectFrom("notifications").selectAll().where("id", "=", notificationId).executeTakeFirst();
  if (!n || n.sent_at) return false;
  const user = await db.selectFrom("users").select(["phone", "locale"]).where("id", "=", n.user_id).executeTakeFirstOrThrow();
  const settings = await db.selectFrom("notification_settings").selectAll().where("user_id", "=", n.user_id).executeTakeFirst();
  if (inQuietHours(settings?.quiet_from ?? null, settings?.quiet_to ?? null)) return false; // ждём конца тихих часов
  const title = user.locale === "kk" ? n.title_kk : n.title_ru;
  const body = (user.locale === "kk" ? n.body_kk : n.body_ru) ?? "";
  for (const ch of n.channels) {
    if (ch === "push") {
      const subs = (settings?.push_subscriptions as any[]) ?? [];
      for (const sub of subs) {
        if (!config.VAPID_PRIVATE_KEY) break;
        await webpush.sendNotification(sub, JSON.stringify({ title, body, data: n.data })).catch(() => undefined);
      }
    } else if (ch === "sms") {
      await sms.send(user.phone, `${title}. ${body}`.slice(0, 300));
    }
    // telegram/email: аналогично через адаптеры (см. docs/INTEGRATIONS.md)
  }
  await db.updateTable("notifications").set({ sent_at: new Date() }).where("id", "=", n.id).execute();
  return true;
}
