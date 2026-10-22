/** Логика одноразовых кодов (чистые функции — покрыты тестами). */
import crypto from "node:crypto";

export function generateOtp(length: number): string {
  const max = 10 ** length;
  return String(crypto.randomInt(0, max)).padStart(length, "0");
}
export function hashOtp(phone: string, code: string, secret: string): string {
  return crypto.createHmac("sha256", secret).update(`${phone}:${code}`).digest("hex");
}
export interface OtpRecord { code_hash: string; attempts: number; expires_at: Date; consumed_at: Date | null; created_at: Date }
export type OtpCheck = "ok" | "expired" | "consumed" | "too_many_attempts" | "invalid";

export function checkOtp(rec: OtpRecord | undefined, phone: string, code: string, secret: string, maxAttempts: number, now = new Date()): OtpCheck {
  if (!rec) return "invalid";
  if (rec.consumed_at) return "consumed";
  if (rec.expires_at.getTime() <= now.getTime()) return "expired";
  if (rec.attempts >= maxAttempts) return "too_many_attempts";
  return timingSafeEq(rec.code_hash, hashOtp(phone, code, secret)) ? "ok" : "invalid";
}
export function canResend(lastCreatedAt: Date | undefined, cooldownSec: number, now = new Date()): boolean {
  return !lastCreatedAt || now.getTime() - lastCreatedAt.getTime() >= cooldownSec * 1000;
}
function timingSafeEq(a: string, b: string) {
  const ba = Buffer.from(a), bb = Buffer.from(b);
  return ba.length === bb.length && crypto.timingSafeEqual(ba, bb);
}
