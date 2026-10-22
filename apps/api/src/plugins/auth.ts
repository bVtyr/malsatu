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
export const SESSION_COOKIE = "ms_session";
/** Параметры cookie сессии: httpOnly, SameSite=Lax (CSRF-защита для не-навигационных запросов), Secure в production. */
export const sessionCookieOptions = (expires: Date) => ({ httpOnly: true, sameSite: "lax" as const, secure: config.NODE_ENV === "production", path: "/", expires });

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
    const token = h?.startsWith("Bearer ") ? h.slice(7) : (req as any).cookies?.[SESSION_COOKIE];
    if (!token) return;
    const s = await resolveSession(token);
    if (s && !s.user.is_blocked) { req.user = s.user; req.sessionId = s.sessionId; }
  });

  // CSRF: изменяющие запросы по cookie-сессии принимаем только с JSON-телом или с нашим заголовком (простые формы с других сайтов их не пошлют)
  app.addHook("preHandler", async (req) => {
    if (!req.user || req.headers.authorization) return;
    if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return;
    const ct = String(req.headers["content-type"] ?? "");
    if (ct.startsWith("application/json") || ct.startsWith("multipart/form-data") && req.headers["x-requested-with"] === "MalSatu") return;
    throw new AppError(403, "csrf_rejected");
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
