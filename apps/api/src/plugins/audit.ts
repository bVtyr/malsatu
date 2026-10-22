import { db } from "../db/index.js";
export async function audit(actorId: string | null, action: string, target?: { type: string; id: string }, meta: Record<string, unknown> = {}, ip?: string) {
  await db.insertInto("audit_log").values({ actor_id: actorId, action, target_type: target?.type ?? null, target_id: target?.id ?? null, meta: JSON.stringify(meta), ip: ip ?? null }).execute();
}
export async function track(name: string, p: { userId?: string | null; anonId?: string | null; listingId?: string | null; props?: Record<string, unknown> }) {
  await db.insertInto("analytics_events").values({ name, user_id: p.userId ?? null, anon_id: p.anonId ?? null, listing_id: p.listingId ?? null, props: JSON.stringify(p.props ?? {}) }).execute();
}
