import type { FastifyInstance } from "fastify";
import { OtpRequestSchema, OtpVerifySchema, ProfileUpdateSchema } from "@malsatu/shared";
import { db } from "../../db/index.js";
import { config, isDev } from "../../config.js";
import { sms } from "../../services/sms.js";
import { generateOtp, hashOtp, checkOtp, canResend } from "./otp.js";
import { createSession, sha256, SESSION_COOKIE, sessionCookieOptions } from "../../plugins/auth.js";
import { AppError } from "../../plugins/errors.js";
import { audit } from "../../plugins/audit.js";

export default async function authRoutes(app: FastifyInstance) {
  // Запрос кода. Rate limit: 5 запросов / 10 мин на IP (см. app.ts) + cooldown на номер.
  app.post("/auth/otp/request", { config: { rateLimit: { max: 5, timeWindow: "10 minutes" } } }, async (req) => {
    const { phone, channel } = OtpRequestSchema.parse(req.body);
    const black = await db.selectFrom("blacklist").select("id").where("kind", "=", "phone").where("value_hash", "=", sha256(phone)).executeTakeFirst();
    if (black) throw new AppError(403, "phone_blacklisted");
    const last = await db.selectFrom("otp_codes").select("created_at").where("phone", "=", phone).orderBy("created_at", "desc").executeTakeFirst();
    if (!canResend(last?.created_at, config.OTP_RESEND_COOLDOWN_SECONDS)) throw new AppError(429, "otp_cooldown");
    const recent = await db.selectFrom("otp_codes").select((eb) => eb.fn.countAll<number>().as("n")).where("phone", "=", phone).where("created_at", ">", new Date(Date.now() - 3600_000)).executeTakeFirstOrThrow();
    if (Number(recent.n) >= 5) throw new AppError(429, "otp_hourly_limit"); // SMS-pumping и перебор по номеру
    const code = isDev && config.OTP_DEV_STATIC_CODE ? config.OTP_DEV_STATIC_CODE.padStart(config.OTP_LENGTH, "0").slice(-config.OTP_LENGTH) : generateOtp(config.OTP_LENGTH);
    await db.insertInto("otp_codes").values({ phone, code_hash: hashOtp(phone, code, config.JWT_SECRET), channel, expires_at: new Date(Date.now() + config.OTP_TTL_SECONDS * 1000), ip: req.ip }).execute();
    await sms.send(phone, `MalSatu: код ${code}. Никому не сообщайте. / MalSatu: код ${code}. Ешкімге айтпаңыз.`, channel);
    return { ok: true, ttl: config.OTP_TTL_SECONDS, cooldown: config.OTP_RESEND_COOLDOWN_SECONDS, ...(isDev ? { devCode: code } : {}) };
  });

  // Проверка кода → создание пользователя при первом входе → сессия.
  app.post("/auth/otp/verify", { config: { rateLimit: { max: 10, timeWindow: "10 minutes" } } }, async (req, reply) => {
    const { phone, code } = OtpVerifySchema.parse(req.body);
    if (await db.selectFrom("blacklist").select("id").where("kind", "=", "phone").where("value_hash", "=", sha256(phone)).executeTakeFirst()) throw new AppError(403, "phone_blacklisted");
    const found = await db.selectFrom("otp_codes").select("id").where("phone", "=", phone).where("consumed_at", "is", null).orderBy("created_at", "desc").executeTakeFirst();
    // атомарный инкремент попыток ДО сравнения: параллельные запросы не обходят лимит
    const rec = found ? await db.updateTable("otp_codes").set((eb) => ({ attempts: eb("attempts", "+", 1) })).where("id", "=", found.id).where("attempts", "<", config.OTP_MAX_ATTEMPTS).returningAll().executeTakeFirst() : undefined;
    if (found && !rec) throw new AppError(400, "otp_too_many_attempts");
    const res = checkOtp(rec ? { ...rec, attempts: rec.attempts - 1 } : undefined, phone, code, config.JWT_SECRET, config.OTP_MAX_ATTEMPTS);
    if (res !== "ok") throw new AppError(400, `otp_${res}`);
    await db.updateTable("otp_codes").set({ consumed_at: new Date() }).where("id", "=", rec!.id).execute();
    await db.updateTable("otp_codes").set({ consumed_at: new Date() }).where("phone", "=", phone).where("consumed_at", "is", null).execute(); // старые коды гасим
    let user = await db.selectFrom("users").selectAll().where("phone", "=", phone).executeTakeFirst();
    let isNew = false;
    if (!user) {
      user = await db.insertInto("users").values({ phone, phone_verified_at: new Date(), verification_level: 1, roles: ["buyer", "seller"] }).returningAll().executeTakeFirstOrThrow();
      await db.insertInto("notification_settings").values({ user_id: user.id }).execute();
      isNew = true;
    }
    if (user.is_blocked) throw new AppError(403, "user_blocked");
    const session = await createSession(user.id, { ua: req.headers["user-agent"], ip: req.ip });
    await db.updateTable("users").set({ last_seen_at: new Date() }).where("id", "=", user.id).execute();
    await audit(user.id, "auth.login", { type: "user", id: user.id }, { isNew }, req.ip);
    reply.setCookie(SESSION_COOKIE, session.token, sessionCookieOptions(session.expiresAt));
    return { token: session.token, expiresAt: session.expiresAt, user: publicSelf(user), isNew };
  });

  app.post("/auth/logout", { preHandler: [app.authenticate] }, async (req, reply) => {
    await db.updateTable("sessions").set({ revoked_at: new Date() }).where("id", "=", req.sessionId!).execute();
    reply.clearCookie(SESSION_COOKIE, { path: "/" });
    return { ok: true };
  });

  app.get("/auth/me", { preHandler: [app.authenticate] }, async (req) => ({ user: publicSelf(req.user!) }));

  app.patch("/users/me", { preHandler: [app.authenticate] }, async (req) => {
    const p = ProfileUpdateSchema.parse(req.body);
    const user = await db.updateTable("users").set({
      ...(p.displayName !== undefined && { display_name: p.displayName }),
      ...(p.accountType !== undefined && { account_type: p.accountType }),
      ...(p.regionCode !== undefined && { region_code: p.regionCode }),
      ...(p.locale !== undefined && { locale: p.locale }),
      ...(p.farmName !== undefined && { farm_name: p.farmName }),
      ...(p.about !== undefined && { about: p.about }),
      ...(p.herdSummary !== undefined && { herd_summary: JSON.stringify(p.herdSummary) }),
    }).where("id", "=", req.user!.id).returningAll().executeTakeFirstOrThrow();
    return { user: publicSelf(user) };
  });

  // Удаление аккаунта (soft delete + анонимизация) и экспорт данных — требования закона о ПДн.
  app.delete("/users/me", { preHandler: [app.authenticate] }, async (req) => {
    const id = req.user!.id;
    await db.transaction().execute(async (trx) => {
      await trx.updateTable("listings").set({ status: "archived", deleted_at: new Date() }).where("owner_user_id", "=", id).execute();
      await trx.updateTable("sessions").set({ revoked_at: new Date() }).where("user_id", "=", id).execute();
      await trx.updateTable("users").set({ deleted_at: new Date(), phone: `deleted:${id}`, display_name: null, iin_bin: null, about: null, farm_name: null }).where("id", "=", id).execute();
    });
    await audit(id, "user.delete", { type: "user", id });
    return { ok: true };
  });

  app.get("/users/me/export", { preHandler: [app.authenticate] }, async (req) => {
    const id = req.user!.id;
    const [listings, deals, messages, favorites] = await Promise.all([
      db.selectFrom("listings").selectAll().where("owner_user_id", "=", id).execute(),
      db.selectFrom("deals").selectAll().where((eb) => eb.or([eb("buyer_id", "=", id), eb("seller_id", "=", id)])).execute(),
      db.selectFrom("messages").selectAll().where("sender_id", "=", id).execute(),
      db.selectFrom("favorites").selectAll().where("user_id", "=", id).execute(),
    ]);
    return { user: publicSelf(req.user!), listings, deals, messages, favorites, exportedAt: new Date() };
  });

  // Публичный профиль продавца
  app.get<{ Params: { id: string } }>("/users/:id", async (req) => {
    const u = await db.selectFrom("users").selectAll().where("id", "=", req.params.id).where("deleted_at", "is", null).executeTakeFirst();
    if (!u) throw new AppError(404, "user_not_found");
    const activeListings = await db.selectFrom("listings").select((eb) => eb.fn.countAll<number>().as("n")).where("owner_user_id", "=", u.id).where("status", "=", "active").executeTakeFirst();
    const reviews = await db.selectFrom("reviews").selectAll().where("target_user_id", "=", u.id).orderBy("created_at", "desc").limit(20).execute();
    return { user: publicProfile(u), activeListings: Number(activeListings?.n ?? 0), reviews };
  });
}

export function publicSelf(u: any) {
  const { ...rest } = u;
  return { id: rest.id, phone: rest.phone, displayName: rest.display_name, accountType: rest.account_type, verificationLevel: rest.verification_level, roles: rest.roles, locale: rest.locale,
    regionCode: rest.region_code, farmName: rest.farm_name, about: rest.about, herdSummary: rest.herd_summary, rating: Number(rest.rating), reviewsCount: rest.reviews_count, dealsCount: rest.deals_count,
    responseMinutes: rest.response_minutes, trustScore: rest.trust_score, twoFactorEnabled: rest.two_factor_enabled, createdAt: rest.created_at, avatarMediaId: rest.avatar_media_id };
}
export function publicProfile(u: any) {
  const s = publicSelf(u);
  return { id: s.id, displayName: s.displayName, accountType: s.accountType, verificationLevel: s.verificationLevel, regionCode: s.regionCode, farmName: s.farmName, about: s.about,
    herdSummary: s.herdSummary, rating: s.rating, reviewsCount: s.reviewsCount, dealsCount: s.dealsCount, responseMinutes: s.responseMinutes, createdAt: s.createdAt, avatarMediaId: s.avatarMediaId, farmMediaIds: u.farm_media_ids };
}
