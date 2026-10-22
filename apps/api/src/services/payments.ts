/** Платёжный партнёр (v2). mock: мгновенно успешная оплата. Реальные: Kaspi Pay, PayBox (Freedom), CloudPayments — единый интерфейс. */
export interface PaymentProvider {
  createPayment(p: { amountKzt: number; orderId: string; description: string; returnUrl: string; method?: string }): Promise<{ providerRef: string; payUrl?: string; qr?: string; status: "pending" | "succeeded" }>;
  refund(providerRef: string, amountKzt: number): Promise<{ ok: boolean }>;
  verifyWebhook(headers: Record<string, string | string[] | undefined>, body: unknown): { ok: boolean; providerRef?: string; status?: "succeeded" | "failed" };
}
export const mockPayments: PaymentProvider = {
  async createPayment(p) { return { providerRef: `mock-${p.orderId}`, status: "succeeded" }; },
  async refund() { return { ok: true }; },
  verifyWebhook(_h, body: any) { return { ok: true, providerRef: body?.ref, status: body?.status }; },
};
export const payments: PaymentProvider = mockPayments;
