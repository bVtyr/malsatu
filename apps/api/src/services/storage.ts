/** Хранилище медиа: S3-совместимое (MinIO локально, облако в РК в проде — требование о хранении данных в Казахстане). */
import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import crypto from "node:crypto";
import { config } from "../config.js";

export const s3 = new S3Client({
  region: config.S3_REGION, endpoint: config.S3_ENDPOINT, forcePathStyle: true,
  credentials: { accessKeyId: config.S3_ACCESS_KEY, secretAccessKey: config.S3_SECRET_KEY },
});

export function objectKey(userId: string, kind: string, ext: string) {
  const d = new Date();
  return `${kind}/${d.getUTCFullYear()}/${String(d.getUTCMonth() + 1).padStart(2, "0")}/${userId}/${crypto.randomUUID()}.${ext}`;
}

export async function presignUpload(key: string, mime: string, maxBytes = 50 * 1024 * 1024) {
  const url = await getSignedUrl(s3, new PutObjectCommand({ Bucket: config.S3_BUCKET, Key: key, ContentType: mime, ContentLength: undefined }), { expiresIn: 600 });
  return { url, maxBytes };
}
export async function presignRead(key: string) {
  return getSignedUrl(s3, new GetObjectCommand({ Bucket: config.S3_BUCKET, Key: key }), { expiresIn: 3600 });
}
export function publicUrl(key: string) { return `${config.S3_PUBLIC_URL}/${key}`; }
