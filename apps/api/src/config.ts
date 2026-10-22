import { z } from "zod";

const Env = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]), // без значения по умолчанию: dev-поведение нельзя получить случайно
  PORT: z.coerce.number().default(4000),
  HOST: z.string().default("0.0.0.0"),
  PUBLIC_WEB_URL: z.string().default("http://localhost:3000"),
  PUBLIC_API_URL: z.string().default("http://localhost:4000"),
  DATABASE_URL: z.string().default("postgres://malsatu:malsatu@localhost:5432/malsatu"),
  REDIS_URL: z.string().default("redis://localhost:6379"),
  JWT_SECRET: z.string().min(16).default("dev-secret-change-me-please-123456"),
  JWT_TTL_DAYS: z.coerce.number().default(30),
  OTP_TTL_SECONDS: z.coerce.number().default(300),
  OTP_LENGTH: z.coerce.number().min(6).max(8).default(6),
  OTP_MAX_ATTEMPTS: z.coerce.number().default(5),
  OTP_RESEND_COOLDOWN_SECONDS: z.coerce.number().default(60),
  OTP_DEV_STATIC_CODE: z.string().optional(),
  SMS_PROVIDER: z.enum(["mock", "smsc", "mobizon", "kazinfoteh"]).default("mock"),
  SMS_API_KEY: z.string().optional(),
  SMS_SENDER: z.string().default("MalSatu"),
  CALL_MASKING_PROVIDER: z.enum(["mock", "zadarma", "twilio"]).default("mock"),
  CALL_MASKING_API_KEY: z.string().optional(),
  CALL_WEBHOOK_SECRET: z.string().min(16).optional(),
  PAYMENT_PROVIDER: z.enum(["mock", "kaspi", "paybox", "cloudpayments"]).default("mock"),
  S3_ENDPOINT: z.string().default("http://localhost:9000"),
  S3_REGION: z.string().default("kz-1"),
  S3_BUCKET: z.string().default("malsatu-media"),
  S3_ACCESS_KEY: z.string().default("malsatu"),
  S3_SECRET_KEY: z.string().default("malsatu123"),
  S3_PUBLIC_URL: z.string().default("http://localhost:9000/malsatu-media"),
  TRANSLATE_PROVIDER: z.enum(["mock", "deepl", "google", "yandex"]).default("mock"),
  TRANSLATE_API_KEY: z.string().optional(),
  VAPID_PUBLIC_KEY: z.string().optional(),
  VAPID_PRIVATE_KEY: z.string().optional(),
  VAPID_SUBJECT: z.string().default("mailto:support@malsatu.kz"),
  LOG_LEVEL: z.string().default("info"),
  SENTRY_DSN: z.string().optional(),
});

export type Config = z.infer<typeof Env>;
export const config: Config = Env.parse(process.env);
export const isDev = config.NODE_ENV !== "production";

// В production небезопасные значения по умолчанию запрещены: процесс не стартует.
if (!isDev) {
  const problems: string[] = [];
  if (config.JWT_SECRET === "dev-secret-change-me-please-123456" || config.JWT_SECRET.length < 32) problems.push("JWT_SECRET должен быть случайной строкой ≥ 32 символов");
  if (config.OTP_DEV_STATIC_CODE) problems.push("OTP_DEV_STATIC_CODE нельзя задавать в production");
  if (config.SMS_PROVIDER === "mock") problems.push("SMS_PROVIDER=mock недопустим в production");
  if (!config.CALL_WEBHOOK_SECRET) problems.push("CALL_WEBHOOK_SECRET обязателен в production");
  if (config.S3_SECRET_KEY === "malsatu123" || config.S3_ACCESS_KEY === "malsatu") problems.push("S3_ACCESS_KEY/S3_SECRET_KEY остались значениями по умолчанию");
  if (/malsatu:malsatu@/.test(config.DATABASE_URL)) problems.push("DATABASE_URL использует пароль по умолчанию");
  if (config.PAYMENT_PROVIDER === "mock") problems.push("PAYMENT_PROVIDER=mock недопустим в production");
  if (problems.length) throw new Error("Небезопасная конфигурация:\n - " + problems.join("\n - "));
}
