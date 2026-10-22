/**
 * Верификация уровней 2–4. Уровень 2: ИИН/БИН с проверкой контрольной суммы (автоматически ставится в pending;
 * при наличии договора с ГБД ФЛ/ЮЛ адаптер подтвердит мгновенно, см. INTEGRATIONS.md). Уровни 3–4 — документы/выезд, решает модератор.
 * Сам ИИН наружу отдаётся только маской.
 */
import type { FastifyInstance } from "fastify";
import { sql } from "kysely";
import { VerificationRequestSchema, VerificationDecisionSchema, classifyIinBin, maskIinBin } from "@malsatu/shared";
import { db } from "../../db/index.js";
import { AppError } from "../../plugins/errors.js";
import { audit } from "../../plugins/audit.js";
import { notify } from "../../services/notifications.js";
import { recomputeTrust } from "../../services/trust.js";

export default async function verificationRoutes(app: FastifyInstance) {
  app.get("/verification/me", { preHandler: [app.authenticate] }, async (req) => {
    const u = await db.selectFrom("users").select(["verification_level", "iin_bin", "iin_bin_verified_at", "account_type"]).where("id", "=", req.user!.id).executeTakeFirstOrThrow();
    const reqs = await db.selectFrom("verification_requests").select(["id", "level", "status", "review_comment", "created_at", "resolved_at", "iin_bin"]).where("user_id", "=", req.user!.id).orderBy("created_at", "desc").limit(10).execute();
    return { level: u.verification_level, accountType: u.account_type, iinBinMasked: u.iin_bin ? maskIinBin(u.iin_bin) : null, iinBinVerifiedAt: u.iin_bin_verified_at, requests: reqs.map((r) => ({ ...r, iin_bin: r.iin_bin ? maskIinBin(r.iin_bin) : null })) };
  });

  app.post("/verification/requests", { preHandler: [app.authenticate], config: { rateLimit: { max: 5, timeWindow: "1 hour" } } }, async (req) => {
    const p = VerificationRequestSchema.parse(req.body);
    const u = await db.selectFrom("users").select(["verification_level", "account_type"]).where("id", "=", req.user!.id).executeTakeFirstOrThrow();
    if (p.level <= u.verification_level) throw new AppError(409, "level_already_reached");
    if (p.level > u.verification_level + 1) throw new AppError(409, "levels_are_sequential");
    let idKind: "iin" | "bin" | null = null;
    if (p.iinBin) {
      idKind = classifyIinBin(p.iinBin);
      if (!idKind) throw new AppError(400, "iin_bin_invalid");
      if (u.account_type === "individual" && idKind !== "iin") throw new AppError(400, "individual_needs_iin");
      if (["too", "ip", "kh"].includes(u.account_type) && idKind !== "bin" && u.account_type === "too") throw new AppError(400, "too_needs_bin"); // ИП и КХ могут работать по ИИН
      const taken = await db.selectFrom("users").select("id").where("iin_bin", "=", p.iinBin).where("iin_bin_verified_at", "is not", null).where("id", "<>", req.user!.id).executeTakeFirst();
      if (taken) throw new AppError(409, "iin_bin_already_used");
    }
    if (p.documentMediaIds.length) {
      const own = await db.selectFrom("media").select("id").where("id", "in", p.documentMediaIds).where("owner_user_id", "=", req.user!.id).where("status", "=", "ready").execute();
      if (own.length !== p.documentMediaIds.length) throw new AppError(403, "media_not_owned");
    }
    const row = await db.insertInto("verification_requests").values({ user_id: req.user!.id, level: p.level, iin_bin: p.iinBin ?? null, id_kind: idKind, document_media_ids: p.documentMediaIds, comment: p.comment ?? null })
      .returningAll().executeTakeFirst().catch((e) => { if (String(e?.code) === "23505") throw new AppError(409, "request_pending"); throw e; });
    return { request: { ...row!, iin_bin: row!.iin_bin ? maskIinBin(row!.iin_bin) : null } };
  });

  // ---- модерация
  const mod = app.requirePermission("moderation:verify");
  app.get("/moderation/verification", { preHandler: [mod] }, async () => {
    const items = await db.selectFrom("verification_requests").innerJoin("users", "users.id", "verification_requests.user_id")
      .select(["verification_requests.id", "verification_requests.level", "verification_requests.iin_bin", "verification_requests.id_kind", "verification_requests.document_media_ids", "verification_requests.comment", "verification_requests.created_at", "users.id as user_id", "users.phone", "users.display_name", "users.farm_name", "users.account_type", "users.verification_level", "users.trust_score", "users.region_code"])
      .where("verification_requests.status", "=", "pending").orderBy("verification_requests.created_at").limit(100).execute();
    const mediaIds = [...new Set(items.flatMap((i) => i.document_media_ids))];
    const media = mediaIds.length ? await db.selectFrom("media").select(["id", "url", "thumb_url", "mime"]).where("id", "in", mediaIds).execute() : [];
    return { items: items.map((i) => ({ ...i, iin_bin_masked: i.iin_bin ? maskIinBin(i.iin_bin) : null, iin_bin: undefined, documents: media.filter((m) => i.document_media_ids.includes(m.id)) })) };
  });

  app.post<{ Params: { id: string } }>("/moderation/verification/:id/decide", { preHandler: [mod] }, async (req) => {
    const d = VerificationDecisionSchema.parse(req.body);
    const r = await db.selectFrom("verification_requests").selectAll().where("id", "=", req.params.id).executeTakeFirst();
    if (!r) throw new AppError(404, "request_not_found");
    if (r.user_id === req.user!.id) throw new AppError(403, "cannot_verify_self");
    const now = new Date();
    await db.transaction().execute(async (trx) => {
      const upd = await trx.updateTable("verification_requests").set({ status: d.decision === "approve" ? "approved" : "rejected", reviewer_id: req.user!.id, review_comment: d.comment ?? null, resolved_at: now }).where("id", "=", r.id).where("status", "=", "pending").executeTakeFirst();
      if (!upd.numUpdatedRows) throw new AppError(409, "already_decided");
      if (d.decision === "approve") {
        await trx.updateTable("users").set((eb) => ({ verification_level: eb.fn("greatest", [eb.ref("verification_level"), eb.val(r.level)]), ...(r.iin_bin ? { iin_bin: r.iin_bin, iin_bin_verified_at: now } : {}) })).where("id", "=", r.user_id).execute();
        // уровень 3+: документы хозяйства дают право на роль продавца с расширенными лимитами
        if (r.level >= 3) await trx.updateTable("users").set({ roles: sqlArrayAppend("seller") }).where("id", "=", r.user_id).execute();
      }
      await trx.insertInto("moderation_log").values({ moderator_id: req.user!.id, action: `verification.${d.decision}`, target_type: "user", target_id: r.user_id, comment: d.comment ?? null }).execute();
    });
    await audit(req.user!.id, `verification.${d.decision}`, { type: "verification_request", id: r.id }, { level: r.level, userId: r.user_id }, req.ip);
    await recomputeTrust(r.user_id).catch(() => undefined);
    await notify({ userId: r.user_id, type: "system", titleRu: d.decision === "approve" ? `Верификация уровня ${r.level} подтверждена` : "Заявка на верификацию отклонена", titleKk: d.decision === "approve" ? `${r.level}-деңгей растауы расталды` : "Растау өтінімі қабылданбады", data: { requestId: r.id, comment: d.comment } });
    return { ok: true };
  });
}

function sqlArrayAppend(role: string) { return sql<string[]>`(SELECT array_agg(DISTINCT r) FROM unnest(array_append(roles, ${role})) AS r)`; }
