/** Чат покупатель–продавец: REST + WebSocket (/ws?token=...). Антифрод-предупреждения, автоперевод, блокировки, шаблоны. */
import type { FastifyInstance } from "fastify";
import type { WebSocket } from "ws";
import { z } from "zod";
import { MessageSchema, checkMessage } from "@malsatu/shared";
import { db } from "../../db/index.js";
import { AppError } from "../../plugins/errors.js";
import { translator } from "../../services/translate.js";
import { notify } from "../../services/notifications.js";
import { resolveSession } from "../../plugins/auth.js";
import { track } from "../../plugins/audit.js";

const sockets = new Map<string, Set<WebSocket>>(); // userId → sockets
export function pushToUser(userId: string, payload: unknown) {
  const set = sockets.get(userId); if (!set) return;
  const data = JSON.stringify(payload);
  for (const ws of set) { try { ws.send(data); } catch { /* ignore */ } }
}

export async function getOrCreateConversation(listingId: string, buyerId: string) {
  const listing = await db.selectFrom("listings").select(["id", "owner_user_id", "status"]).where("id", "=", listingId).executeTakeFirst();
  if (!listing || !["active", "reserved", "sold"].includes(listing.status)) throw new AppError(404, "listing_not_found");
  if (listing.owner_user_id === buyerId) throw new AppError(400, "cannot_chat_self");
  const blocked = await db.selectFrom("user_blocks").select("blocker_id").where((eb) => eb.or([
    eb.and([eb("blocker_id", "=", listing.owner_user_id), eb("blocked_id", "=", buyerId)]), eb.and([eb("blocker_id", "=", buyerId), eb("blocked_id", "=", listing.owner_user_id)])])).executeTakeFirst();
  if (blocked) throw new AppError(403, "blocked");
  const existing = await db.selectFrom("conversations").selectAll().where("listing_id", "=", listingId).where("buyer_id", "=", buyerId).executeTakeFirst();
  if (existing) return existing;
  return db.insertInto("conversations").values({ listing_id: listingId, buyer_id: buyerId, seller_id: listing.owner_user_id }).returningAll().executeTakeFirstOrThrow();
}

export async function sendMessage(conversationId: string, senderId: string, input: z.infer<typeof MessageSchema>, systemKind?: "system" | "offer", offerId?: string) {
  const c = await db.selectFrom("conversations").selectAll().where("id", "=", conversationId).executeTakeFirst();
  if (!c) throw new AppError(404, "conversation_not_found");
  if (c.buyer_id !== senderId && c.seller_id !== senderId && !systemKind) throw new AppError(403, "not_participant");
  if (c.blocked_by) throw new AppError(403, "conversation_blocked");
  const recipientId = senderId === c.buyer_id ? c.seller_id : c.buyer_id;
  if (input.mediaId) { const own = await db.selectFrom("media").select("id").where("id", "=", input.mediaId).where("owner_user_id", "=", senderId).executeTakeFirst(); if (!own) throw new AppError(403, "media_not_owned"); }
  const fraud = input.text ? checkMessage(input.text) : { signals: [], score: 0, warn: false };
  const [sender, recipient] = await Promise.all([
    db.selectFrom("users").select(["locale", "display_name"]).where("id", "=", senderId).executeTakeFirstOrThrow(),
    db.selectFrom("users").select(["locale"]).where("id", "=", recipientId).executeTakeFirstOrThrow(),
  ]);
  let translated: string | null = null;
  if (input.text && sender.locale !== recipient.locale) translated = await translator.translate(input.text, sender.locale as any, recipient.locale as any);
  const msg = await db.transaction().execute(async (trx) => {
    const m = await trx.insertInto("messages").values({
      conversation_id: conversationId, sender_id: senderId, kind: systemKind ?? input.kind, text: input.text ?? null, text_translated: translated, translated_to: translated ? recipient.locale : null,
      media_id: input.mediaId ?? null, lat: input.lat ?? null, lng: input.lng ?? null, offer_id: offerId ?? null, fraud_signals: fraud.signals, fraud_score: fraud.score,
    }).returningAll().executeTakeFirstOrThrow();
    await trx.updateTable("conversations").set((eb) => ({
      last_message_at: new Date(), last_message_preview: (input.text ?? `[${input.kind}]`).slice(0, 120),
      ...(senderId === c.buyer_id ? { seller_unread: eb("seller_unread", "+", 1) } : { buyer_unread: eb("buyer_unread", "+", 1) }),
    })).where("id", "=", conversationId).execute();
    if (c.listing_id && senderId === c.buyer_id) await trx.updateTable("listings").set((eb) => ({ messages_count: eb("messages_count", "+", 1) })).where("id", "=", c.listing_id).execute();
    return m;
  });
  pushToUser(recipientId, { type: "message", conversationId, message: msg });
  pushToUser(senderId, { type: "message", conversationId, message: msg });
  notify({ userId: recipientId, type: "message", titleRu: `Сообщение от ${sender.display_name ?? "пользователя"}`, titleKk: `${sender.display_name ?? "Пайдаланушыдан"} хабарлама`, bodyRu: (input.text ?? "").slice(0, 100), bodyKk: (translated ?? input.text ?? "").slice(0, 100), data: { conversationId } }).catch(() => undefined);
  track("message", { userId: senderId, listingId: c.listing_id }).catch(() => undefined);
  return { message: msg, fraudWarning: fraud.warn ? fraud.signals : null };
}

export default async function chatRoutes(app: FastifyInstance) {
  app.get("/conversations", { preHandler: [app.authenticate] }, async (req) => {
    const uid = req.user!.id;
    const items = await db.selectFrom("conversations").leftJoin("listings", "listings.id", "conversations.listing_id")
      .selectAll("conversations").select(["listings.title_ru", "listings.title_kk", "listings.price_kzt", "listings.price_type"])
      .where((eb) => eb.or([eb("buyer_id", "=", uid), eb("seller_id", "=", uid)])).orderBy("last_message_at", "desc").limit(100).execute();
    const peerIds = [...new Set(items.map((c) => (c.buyer_id === uid ? c.seller_id : c.buyer_id)))];
    const peers = peerIds.length ? await db.selectFrom("users").select(["id", "display_name", "farm_name", "verification_level", "last_seen_at"]).where("id", "in", peerIds).execute() : [];
    const pm = new Map(peers.map((p) => [p.id, p]));
    return { items: items.map((c) => ({ ...c, unread: c.buyer_id === uid ? c.buyer_unread : c.seller_unread, peer: pm.get(c.buyer_id === uid ? c.seller_id : c.buyer_id) ?? null })) };
  });

  app.post("/conversations", { preHandler: [app.authenticate] }, async (req) => {
    const { listingId } = z.object({ listingId: z.string().uuid() }).parse(req.body);
    return { conversation: await getOrCreateConversation(listingId, req.user!.id) };
  });

  app.get<{ Params: { id: string } }>("/conversations/:id/messages", { preHandler: [app.authenticate] }, async (req) => {
    const uid = req.user!.id;
    const c = await db.selectFrom("conversations").selectAll().where("id", "=", req.params.id).executeTakeFirst();
    if (!c || (c.buyer_id !== uid && c.seller_id !== uid && !req.user!.roles.includes("arbiter") && !req.user!.roles.includes("admin"))) throw new AppError(404, "conversation_not_found");
    const before = (req.query as any).before as string | undefined;
    let q = db.selectFrom("messages").selectAll().where("conversation_id", "=", c.id).orderBy("created_at", "desc").limit(50);
    if (before) q = q.where("created_at", "<", new Date(before));
    const messages = (await q.execute()).reverse();
    await db.updateTable("conversations").set(c.buyer_id === uid ? { buyer_unread: 0 } : { seller_unread: 0 }).where("id", "=", c.id).execute();
    await db.updateTable("messages").set({ read_at: new Date() }).where("conversation_id", "=", c.id).where("sender_id", "!=", uid).where("read_at", "is", null).execute();
    return { conversation: c, messages };
  });

  app.post<{ Params: { id: string } }>("/conversations/:id/messages", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } }, preHandler: [app.authenticate] }, async (req) => {
    return sendMessage(req.params.id, req.user!.id, MessageSchema.parse(req.body));
  });

  app.post<{ Params: { id: string } }>("/conversations/:id/block", { preHandler: [app.authenticate] }, async (req) => {
    const c = await db.selectFrom("conversations").selectAll().where("id", "=", req.params.id).executeTakeFirst();
    if (!c || (c.buyer_id !== req.user!.id && c.seller_id !== req.user!.id)) throw new AppError(404, "conversation_not_found");
    const other = c.buyer_id === req.user!.id ? c.seller_id : c.buyer_id;
    await db.insertInto("user_blocks").values({ blocker_id: req.user!.id, blocked_id: other }).onConflict((oc) => oc.doNothing()).execute();
    await db.updateTable("conversations").set({ blocked_by: req.user!.id }).where("id", "=", c.id).execute();
    return { ok: true };
  });

  app.get("/quick-replies", { preHandler: [app.authenticate] }, async (req) => ({ items: await db.selectFrom("quick_replies").selectAll().where("user_id", "=", req.user!.id).orderBy("sort").execute() }));
  app.put("/quick-replies", { preHandler: [app.authenticate] }, async (req) => {
    const { items } = z.object({ items: z.array(z.string().min(1).max(300)).max(20) }).parse(req.body);
    await db.transaction().execute(async (trx) => {
      await trx.deleteFrom("quick_replies").where("user_id", "=", req.user!.id).execute();
      if (items.length) await trx.insertInto("quick_replies").values(items.map((text, sort) => ({ user_id: req.user!.id, text, sort }))).execute();
    });
    return { ok: true };
  });

  // WebSocket: realtime доставка сообщений/офферов/статусов сделок
  app.get("/ws", { websocket: true }, async (socket, req) => {
    let uid: string | null = req.user?.id ?? null; // cookie-сессия уже разобрана onRequest-хуком
    const attach = () => { if (!uid) return; if (!sockets.has(uid)) sockets.set(uid, new Set()); sockets.get(uid)!.add(socket); };
    attach();
    const guard = setTimeout(() => { if (!uid) socket.close(4001, "unauthorized"); }, 5000);
    socket.on("message", async (raw: Buffer) => {
      try {
        if (raw.length > 4096) return;
        const m = JSON.parse(raw.toString());
        if (m.type === "auth" && !uid && typeof m.token === "string") { const s = await resolveSession(m.token); if (s) { uid = s.user.id; attach(); clearTimeout(guard); } else socket.close(4001, "unauthorized"); return; }
        if (!uid) return;
        if (m.type === "ping") socket.send(JSON.stringify({ type: "pong" }));
        if (m.type === "typing" && typeof m.conversationId === "string") {
          const c = await db.selectFrom("conversations").select(["buyer_id", "seller_id"]).where("id", "=", m.conversationId).executeTakeFirst();
          if (c && (c.buyer_id === uid || c.seller_id === uid)) pushToUser(c.buyer_id === uid ? c.seller_id : c.buyer_id, { type: "typing", conversationId: m.conversationId, userId: uid });
        }
      } catch { /* ignore */ }
    });
    socket.on("close", () => { clearTimeout(guard); if (uid) sockets.get(uid)?.delete(socket); });
  });
}
