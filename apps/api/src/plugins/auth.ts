/**
 * Аутентификация: сессионный токен (opaque, hash в БД) в заголовке Authorization: Bearer <token>.
 * Для MVP выбран opaque-токен вместо JWT: мгновенный отзыв сессии, простая ротация.
 */
import fp from "fastify-plugin";
import crypto from "node:crypto";
import type { FastifyReply, FastifyRequest } from "fastify";
import { db } from "../db/index.js";
import { config } from "../config.js";
import { hasPermission, type Role } from "@malsatu/shared";
import { AppError } from "./errors.js";
import type { User } from "../db/types.js";

declare module "fastify" {
  interface FastifyRequest { user: User | null; sessionId: string | null }
  interface FastifyInstance {
    authenticate: (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
    requirePermission: (perm: string) => (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

export const sha256 = (s: string) => crypto.createHash("sha256").update(s).digest("hex");

export async function createSession(userId: string, meta: { ua?: string; ip?: string }) {
  const token = crypto.randomBytes(32).toString("base64url");
  const expires = new Date(Date.now() + config.JWT_TTL_DAYS * 86_400_000);
  await db.insertInto("sessions").values({ user_id: userId, token_hash: sha256(token), user_agent: meta.ua ?? null, ip: meta.ip ?? null, expires_at: expires }).execute();
  return { token, expiresAt: expires };
}

export async function resolveSession(token: string): Promise<{ user: User; sessionId: string } | null> {
  const row = await db.selectFrom("sessions").innerJoin("users", "users.id", "sessions.user_id")
    .select(["sessions.id as session_id", "sessions.expires_at", "sessions.revoked_at"]).selectAll("users")
    .where("sessions.token_hash", "=", sha256(token)).executeTakeFirst();
  if (!row || row.revoked_at || row.expires_at < new Date() || row.deleted_at) return null;
  const { session_id, expires_at: _e, revoked_at: _r, ...user } = row as any;
  return { user: user as User, sessionId: session_id };
}

export default fp(async (app) => {
  app.decorateRequest("user", null);
  app.decorateRequest("sessionId", null);

  app.addHook("onRequest", async (req) => {
    const h = req.headers.authorization;
    if (!h?.startsWith("Bearer ")) return;
    const s = await resolveSession(h.slice(7));
    if (s) { req.user = s.user; req.sessionId = s.sessionId; }
  });

  app.decorate("authenticate", async (req: FastifyRequest) => {
    if (!req.user) throw new AppError(401, "unauthorized");
    if (req.user.is_blocked) throw new AppError(403, "user_blocked");
  });

  app.decorate("requirePermission", (perm: string) => async (req: FastifyRequest) => {
    if (!req.user) throw new AppError(401, "unauthorized");
    if (req.user.is_blocked) throw new AppError(403, "user_blocked");
    if (!hasPermission(req.user.roles as Role[], perm)) throw new AppError(403, "forbidden", `Требуется право ${perm}`);
  });
});
