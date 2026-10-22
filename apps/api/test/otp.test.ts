import { describe, it, expect } from "vitest";
import { generateOtp, hashOtp, checkOtp, canResend } from "../src/modules/auth/otp.js";

const secret = "test-secret";
describe("OTP", () => {
  it("generates numeric code of given length", () => { for (let i = 0; i < 20; i++) expect(generateOtp(6)).toMatch(/^\d{6}$/); expect(generateOtp(4)).toMatch(/^\d{4}$/); });
  it("verifies hash, expiry, attempts and consumption", () => {
    const now = new Date("2026-10-21T10:00:00Z");
    const rec = { code_hash: hashOtp("+77011234567", "123456", secret), attempts: 0, expires_at: new Date("2026-10-21T10:05:00Z"), consumed_at: null, created_at: now };
    expect(checkOtp(rec, "+77011234567", "123456", secret, 5, now)).toBe("ok");
    expect(checkOtp(rec, "+77011234567", "654321", secret, 5, now)).toBe("invalid");
    expect(checkOtp(rec, "+77011234568", "123456", secret, 5, now)).toBe("invalid"); // код привязан к номеру
    expect(checkOtp(rec, "+77011234567", "123456", secret, 5, new Date("2026-10-21T10:05:00Z"))).toBe("expired");
    expect(checkOtp({ ...rec, attempts: 5 }, "+77011234567", "123456", secret, 5, now)).toBe("too_many_attempts");
    expect(checkOtp({ ...rec, consumed_at: now }, "+77011234567", "123456", secret, 5, now)).toBe("consumed");
    expect(checkOtp(undefined, "+77011234567", "123456", secret, 5, now)).toBe("invalid");
  });
  it("resend cooldown", () => {
    const t = new Date("2026-10-21T10:00:00Z");
    expect(canResend(undefined, 60, t)).toBe(true);
    expect(canResend(new Date("2026-10-21T09:59:30Z"), 60, t)).toBe(false);
    expect(canResend(new Date("2026-10-21T09:59:00Z"), 60, t)).toBe(true);
  });
});
