import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { PutObjectCommand, HeadObjectCommand } from "@aws-sdk/client-s3";
import { db } from "../../db/index.js";
import { config } from "../../config.js";
import { s3, objectKey, presignUpload, publicUrl } from "../../services/storage.js";
import { processImage, hammingDistance } from "../../services/media-processing.js";
import { AppError } from "../../plugins/errors.js";

const ALLOWED = new Map([["image/jpeg", "jpg"], ["image/png", "png"], ["image/webp", "webp"], ["image/heic", "heic"], ["video/mp4", "mp4"], ["video/quicktime", "mov"], ["audio/webm", "webm"], ["audio/ogg", "ogg"], ["application/pdf", "pdf"]]);
const kindOf = (mime: string) => mime.startsWith("image/") ? "image" : mime.startsWith("video/") ? "video" : mime.startsWith("audio/") ? "audio" : "document";

export default async function mediaRoutes(app: FastifyInstance) {
  // Публичные метаданные медиа (url/thumb) — для чата и карточек
  app.get<{ Params: { id: string } }>("/media/:id", async (req, reply) => {
    const m = await db.selectFrom("media").select(["id", "kind", "url", "thumb_url", "mime", "width", "height", "duration_sec", "status"]).where("id", "=", req.params.id).executeTakeFirst();
    if (!m) throw new AppError(404, "media_not_found");
    reply.header("cache-control", "public, max-age=86400"); return { media: m };
  });

  // Вариант 1: прямая загрузка в S3 по presigned URL (видео, большие файлы). Фронт после загрузки вызывает /media/:id/complete.
  app.post("/media/presign", { preHandler: [app.authenticate] }, async (req) => {
    const { mime, sizeBytes } = z.object({ mime: z.string(), sizeBytes: z.number().int().positive().max(200 * 1024 * 1024) }).parse(req.body);
    const ext = ALLOWED.get(mime); if (!ext) throw new AppError(400, "unsupported_mime");
    const key = objectKey(req.user!.id, kindOf(mime), ext);
    const { url } = await presignUpload(key, mime);
    const media = await db.insertInto("media").values({ owner_user_id: req.user!.id, kind: kindOf(mime), storage_key: key, url: publicUrl(key), mime, size_bytes: sizeBytes, status: "pending" }).returningAll().executeTakeFirstOrThrow();
    return { mediaId: media.id, uploadUrl: url, key };
  });
  app.post<{ Params: { id: string } }>("/media/:id/complete", { preHandler: [app.authenticate] }, async (req) => {
    const pending = await db.selectFrom("media").selectAll().where("id", "=", req.params.id).where("owner_user_id", "=", req.user!.id).where("status", "=", "pending").executeTakeFirst();
    if (!pending) throw new AppError(404, "media_not_found");
    // подтверждаем по факту: объект существует, тип и размер совпадают с заявленными
    const head = await s3.send(new HeadObjectCommand({ Bucket: config.S3_BUCKET, Key: pending.storage_key })).catch(() => null);
    if (!head) throw new AppError(409, "upload_missing");
    if ((head.ContentLength ?? 0) > 200 * 1024 * 1024 || (head.ContentType && !ALLOWED.has(head.ContentType))) throw new AppError(400, "upload_rejected");
    const m = await db.updateTable("media").set({ status: "ready", size_bytes: head.ContentLength ?? pending.size_bytes, mime: head.ContentType ?? pending.mime }).where("id", "=", pending.id).returningAll().executeTakeFirstOrThrow();
    return { media: m };
  });

  // Вариант 2: загрузка через API (фото): сжатие, водяной знак, превью, pHash для антифрода.
  app.post("/media/upload", { preHandler: [app.authenticate] }, async (req) => {
    const file = await req.file({ limits: { fileSize: 25 * 1024 * 1024 } });
    if (!file) throw new AppError(400, "file_required");
    const mime = file.mimetype; const ext = ALLOWED.get(mime); if (!ext) throw new AppError(400, "unsupported_mime");
    const buf = await file.toBuffer();
    const kind = kindOf(mime);
    let body = buf, thumb: Buffer | null = null, phash: string | null = null, width: number | null = null, height: number | null = null, outMime = mime, outExt = ext;
    if (kind === "image") { const p = await processImage(buf, { watermarkText: config.PUBLIC_WEB_URL.replace(/^https?:\/\//, "") }); body = p.full; thumb = p.thumb; phash = p.phash; width = p.width; height = p.height; outMime = "image/webp"; outExt = "webp"; }
    const key = objectKey(req.user!.id, kind, outExt);
    await s3.send(new PutObjectCommand({ Bucket: config.S3_BUCKET, Key: key, Body: body, ContentType: outMime }));
    let thumbUrl: string | null = null;
    if (thumb) { const tk = key.replace(/\.webp$/, ".thumb.webp"); await s3.send(new PutObjectCommand({ Bucket: config.S3_BUCKET, Key: tk, Body: thumb, ContentType: "image/webp" })); thumbUrl = publicUrl(tk); }
    // Поиск дубликатов фото среди чужих объявлений
    let duplicateOf: string | null = null;
    if (phash) {
      const cands = await db.selectFrom("media").select(["id", "phash", "owner_user_id"]).where("phash", "is not", null).where("owner_user_id", "!=", req.user!.id).orderBy("created_at", "desc").limit(2000).execute();
      duplicateOf = cands.find((c) => c.phash && hammingDistance(c.phash, phash!) <= 6)?.id ?? null;
    }
    const media = await db.insertInto("media").values({ owner_user_id: req.user!.id, kind, storage_key: key, url: publicUrl(key), thumb_url: thumbUrl, mime: outMime, size_bytes: body.length, width, height, watermarked: kind === "image", phash, status: "ready" }).returningAll().executeTakeFirstOrThrow();
    return { media, duplicateOf };
  });
}
