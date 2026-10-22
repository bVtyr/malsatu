import { describe, it, expect } from "vitest";
import { createHmac } from "node:crypto";
import { createSignedProvider, safeEqualHex } from "../src/services/payments.js";

describe("signed payment provider webhook", () => {
  const secret = "0123456789abcdef0123456789abcdef";
  const p = createSignedProvider({ name: "paybox", apiUrl: "https://pay.example", merchantId: "m1", secret, callbackUrl: "https://api.example/webhook" });
  const sign = (body: string) => createHmac("sha256", secret).update(body).digest("hex");
  it("accepts a correctly signed body and normalises the event", () => {
    const body = JSON.stringify({ id: "p-1", orderId: "deal-1", status: "paid", amount: 190000 });
    const ev = p.verifyWebhook(body, { "x-signature": sign(body) });
    expect(ev).toMatchObject({ ok: true, providerRef: "p-1", orderId: "deal-1", status: "succeeded", amountKzt: 190000 });
  });
  it("rejects a tampered body, a wrong secret and a missing signature", () => {
    const body = JSON.stringify({ id: "p-1", status: "paid", amount: 190000 });
    const sig = sign(body);
    expect(p.verifyWebhook(body.replace("190000", "1"), { "x-signature": sig }).ok).toBe(false);
    expect(p.verifyWebhook(body, { "x-signature": createHmac("sha256", "other-secret").update(body).digest("hex") }).ok).toBe(false);
    expect(p.verifyWebhook(body, {}).ok).toBe(false);
  });
  it("timing-safe compare handles length mismatch and bad hex", () => {
    expect(safeEqualHex("ab", "abcd")).toBe(false);
    expect(safeEqualHex("", "")).toBe(false);
    expect(safeEqualHex("zz", "zz")).toBe(false);
    expect(safeEqualHex("abcd", "abcd")).toBe(true);
  });
});
