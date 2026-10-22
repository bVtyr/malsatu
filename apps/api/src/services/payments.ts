/**
 * Платёжный партнёр (v2). Единый интерфейс; провайдеры: mock (dev/test) и signed — обобщённый HTTP-адаптер
 * с HMAC-подписью запросов и вебхуков. Под конкретного партнёра (Kaspi Pay, PayBox/Freedom, CloudPayments)
 * меняется только маппинг полей в createSignedProvider — контракт для остального кода неизменен.
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import { config, isDev } from "../config.js";

export type PaymentStatus = "pending" | "succeeded" | "failed";
export interface PaymentProvider {
  readonly name: string;
  createPayment(p: { amountKzt: number; orderId: string; description: string; returnUrl: string; method?: string }): Promise<{ providerRef: string; payUrl?: string; qr?: string; status: PaymentStatus }>;
  refund(providerRef: string, amountKzt: number): Promise<{ ok: boolean }>;
  /** Проверка подписи вебхука по сырому телу. Возвращает нормализованное событие или ok=false. */
  verifyWebhook(rawBody: string, headers: Record<string, string | string[] | undefined>): { ok: boolean; providerRef?: string; orderId?: string; status?: "succeeded" | "failed" | "refunded"; amountKzt?: number };
}

export const mockPayments: PaymentProvider = {
  name: "mock",
  async createPayment(p) { return { providerRef: `mock-${p.orderId}-${Date.now()}`, status: "succeeded" }; },
  async refund() { return { ok: true }; },
  verifyWebhook(rawBody) {
    if (!isDev) return { ok: false };
    try { const b = JSON.parse(rawBody); return { ok: true, providerRef: b.ref, orderId: b.orderId, status: b.status, amountKzt: b.amount }; } catch { return { ok: false }; }
  },
};

function hmacHex(secret: string, data: string) { return createHmac("sha256", secret).update(data).digest("hex"); }
export function safeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length || a.length === 0) return false;
  try { return timingSafeEqual(Buffer.from(a, "hex"), Buffer.from(b, "hex")); } catch { return false; }
}

/** Обобщённый подписанный адаптер: POST JSON + заголовок x-signature = HMAC-SHA256(secret, body). */
export function createSignedProvider(opts: { name: string; apiUrl: string; merchantId: string; secret: string; callbackUrl: string }): PaymentProvider {
  const call = async (path: string, body: Record<string, unknown>) => {
    const raw = JSON.stringify({ merchantId: opts.merchantId, ...body });
    const ctrl = new AbortController(); const timer = setTimeout(() => ctrl.abort(), 15_000);
    try {
      const res = await fetch(`${opts.apiUrl}${path}`, { method: "POST", headers: { "content-type": "application/json", "x-signature": hmacHex(opts.secret, raw) }, body: raw, signal: ctrl.signal });
      if (!res.ok) throw new Error(`payment_provider_http_${res.status}`);
      return (await res.json()) as any;
    } finally { clearTimeout(timer); }
  };
  return {
    name: opts.name,
    async createPayment(p) {
      const r = await call("/payments", { orderId: p.orderId, amount: p.amountKzt, currency: "KZT", description: p.description, returnUrl: p.returnUrl, callbackUrl: opts.callbackUrl, method: p.method ?? "card" });
      return { providerRef: String(r.id), payUrl: r.payUrl, qr: r.qr, status: r.status === "succeeded" ? "succeeded" : "pending" };
    },
    async refund(providerRef, amountKzt) { const r = await call("/refunds", { paymentId: providerRef, amount: amountKzt }); return { ok: r.status === "ok" || r.status === "succeeded" }; },
    verifyWebhook(rawBody, headers) {
      const sig = String(headers["x-signature"] ?? "");
      if (!safeEqualHex(sig, hmacHex(opts.secret, rawBody))) return { ok: false };
      try {
        const b = JSON.parse(rawBody);
        const status = b.status === "succeeded" || b.status === "paid" ? "succeeded" : b.status === "refunded" ? "refunded" : "failed";
        return { ok: true, providerRef: String(b.id ?? b.paymentId ?? ""), orderId: b.orderId, status, amountKzt: Number(b.amount) };
      } catch { return { ok: false }; }
    },
  };
}

export const payments: PaymentProvider = config.PAYMENT_PROVIDER === "mock"
  ? mockPayments
  : createSignedProvider({ name: config.PAYMENT_PROVIDER, apiUrl: config.PAYMENT_API_URL ?? "", merchantId: config.PAYMENT_MERCHANT_ID ?? "", secret: config.PAYMENT_SECRET ?? "", callbackUrl: `${config.PUBLIC_API_URL}/api/v1/payments/webhook` });
