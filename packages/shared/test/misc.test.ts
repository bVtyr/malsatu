import { describe, it, expect } from "vitest";
import { slaughterYield, meatForGuests } from "../src/domain/yield.js";
import { checkMessage, checkListingText, trustScore, accountLimits } from "../src/domain/antifraud.js";
import { expandQuery, toTsQuery, foldKazakh } from "../src/domain/search.js";
import { normalizeKzPhone, maskPhone } from "../src/domain/phone.js";
import { haversineKm, pointInPolygon, gridCluster } from "../src/domain/geo.js";
import { placeBid, winner, type AuctionLike } from "../src/domain/auction.js";
import { offerAct } from "../src/domain/offer.js";
import { sellPartial, ownerCanSet, validateLivestockForPublish } from "../src/domain/listing.js";
import { hasPermission } from "../src/domain/rbac.js";
import { estimateTransport } from "../src/domain/delivery.js";
import { plural, formatKzt } from "../src/domain/format.js";
import { regionPath, topLevelOf, REGIONS } from "../src/data/regions.js";
import { CATEGORIES } from "../src/data/categories.js";

describe("yield calculator", () => {
  it("cattle medium 500kg → ~260kg carcass", () => {
    const r = slaughterYield("cattle", 500, "medium");
    expect(r.carcassKg).toBe(260);
    expect(r.bonelessMeatKg).toBeCloseTo(202.8, 0);
  });
  it("fat-tailed sheep gets bonus", () => {
    expect(slaughterYield("sheep", 60, "medium", true).ratio).toBe(0.51);
  });
  it("meat for 100 guests", () => expect(meatForGuests(100)).toBe(55));
});

describe("antifraud", () => {
  it("flags prepayment requests in ru and kk", () => {
    expect(checkMessage("Скиньте предоплату 50000 на карту Kaspi").warn).toBe(true);
    expect(checkMessage("Алдын ала төлем жасаңыз, картаға аударыңыз").warn).toBe(true);
    expect(checkMessage("Сәлем, қой әлі сатылмады ма?").warn).toBe(false);
  });
  it("detects card numbers and links", () => {
    const r = checkMessage("4400 4301 1234 5678 вот карта, или сюда https://evil.kz/pay");
    expect(r.signals).toContain("card_number");
    expect(r.signals).toContain("external_link");
  });
  it("listing text with phone goes to moderation", () => {
    expect(checkListingText("Звоните +7 701 123 45 67").signals).toContain("phone_in_text");
  });
  it("trust score and limits", () => {
    const newbie = trustScore({ verificationLevel: 1, completedDeals: 0, disputesLost: 0, reportsReceived: 0, accountAgeDays: 1, listingsRejected: 0 });
    expect(newbie).toBe(25);
    expect(accountLimits(newbie, 0).premoderate).toBe(true);
    const pro = trustScore({ verificationLevel: 3, completedDeals: 20, disputesLost: 0, reportsReceived: 0, accountAgeDays: 400, listingsRejected: 0 });
    expect(pro).toBeGreaterThanOrEqual(80);
    expect(accountLimits(pro, 10).premoderate).toBe(false);
  });
});

describe("search synonyms", () => {
  it("expands kk↔ru synonyms", () => {
    const t = expandQuery("қой");
    expect(t).toContain("овца");
    expect(t).toContain("баран");
    expect(expandQuery("бараны")).toContain("қой");
  });
  it("folds kazakh letters for typos", () => {
    expect(foldKazakh("Қой Ұлытау")).toBe("кой улытау");
    expect(expandQuery("кой")).toContain("овца");
  });
  it("builds tsquery", () => {
    expect(toTsQuery("казы")).toContain("(қазы:*)");
    expect(toTsQuery("лошадь")).not.toContain("ат:*"); // короткий синоним без префикса
    expect(toTsQuery("лошадь")).toContain("(ат)");
    expect(toTsQuery("")).toBe("");
  });
});

describe("phone", () => {
  it("normalizes KZ formats", () => {
    expect(normalizeKzPhone("8 (701) 123-45-67")).toBe("+77011234567");
    expect(normalizeKzPhone("+7 701 123 45 67")).toBe("+77011234567");
    expect(normalizeKzPhone("7011234567")).toBe("+77011234567");
    expect(normalizeKzPhone("12345")).toBeNull();
    expect(normalizeKzPhone("+79161234567")).toBeNull(); // не казахстанский мобильный
    expect(normalizeKzPhone("8011234567")).toBeNull();
  });
  it("masks", () => expect(maskPhone("+77011234567")).toBe("+7 701 ***-**-67"));
});

describe("geo", () => {
  it("Astana–Almaty ≈ 960 km", () => {
    const d = haversineKm({ lat: 51.1605, lng: 71.4704 }, { lat: 43.2389, lng: 76.8897 });
    expect(d).toBeGreaterThan(940); expect(d).toBeLessThan(990);
  });
  it("point in polygon", () => {
    expect(pointInPolygon({ lat: 1, lng: 1 }, [[0, 0], [2, 0], [2, 2], [0, 2]])).toBe(true);
    expect(pointInPolygon({ lat: 3, lng: 1 }, [[0, 0], [2, 0], [2, 2], [0, 2]])).toBe(false);
  });
  it("clusters", () => {
    const c = gridCluster([{ lat: 43.2, lng: 76.9 }, { lat: 43.21, lng: 76.91 }, { lat: 51.1, lng: 71.4 }], 5);
    expect(c).toHaveLength(2);
    expect(c.find((x) => x.count === 2)).toBeTruthy();
  });
});

describe("auction", () => {
  const mk = (): AuctionLike => ({ status: "live", startPriceKzt: 1_000_000, bidStepKzt: 50_000, endsAt: new Date("2026-11-01T12:00:00Z"), extensionMinutes: 5, depositKzt: 100_000, bids: [] });
  it("rejects bids below minimum and without deposit", () => {
    const a = mk();
    expect(() => placeBid(a, "u1", 900_000, true, new Date("2026-11-01T11:00:00Z"))).toThrow(/too_low|Минимальная/);
    expect(() => placeBid(a, "u1", 1_000_000, false, new Date("2026-11-01T11:00:00Z"))).toThrow(/deposit/);
  });
  it("auto-bid outbids and anti-sniping extends", () => {
    const a = mk();
    placeBid(a, "u1", 1_000_000, true, new Date("2026-11-01T11:00:00Z"), 1_200_000);
    placeBid(a, "u2", 1_050_000, true, new Date("2026-11-01T11:58:00Z"));
    expect(winner(a)?.userId).toBe("u1");
    expect(winner(a)?.amountKzt).toBe(1_100_000);
    expect(a.endsAt.getTime()).toBe(new Date("2026-11-01T12:03:00Z").getTime());
  });
});

describe("offer / listing / rbac / delivery / format / regions", () => {
  it("offer accept by recipient only", () => {
    const o = { status: "pending" as const, priceKzt: 1, quantity: 1, expiresAt: new Date("2030-01-01"), fromRole: "buyer" as const };
    expect(() => offerAct({ ...o }, "accept", "buyer")).toThrow();
    expect(offerAct({ ...o }, "accept", "seller").status).toBe("accepted");
  });
  it("partial sale reduces quantity and marks sold at zero", () => {
    const l = { status: "active" as const, quantity: 50 };
    sellPartial(l, 20); expect(l.quantity).toBe(30);
    sellPartial(l, 30); expect(l.status).toBe("sold");
    expect(() => sellPartial(l, 1)).toThrow();
  });
  it("owner transitions", () => {
    expect(ownerCanSet("active", "reserved")).toBe(true);
    expect(ownerCanSet("pending_moderation", "active")).toBe(false);
  });
  it("publish validation requires 3 photos and price", () => {
    const r = validateLivestockForPublish({ photos: 2, quantity: 1, priceType: "per_head", priceKzt: null, video: false, categoryCode: "sheep_ram", regionCode: "kz-zha", lat: 42.9 });
    expect(r.ok).toBe(false); expect(r.errors).toContain("min_photos"); expect(r.errors).toContain("price");
  });
  it("rbac", () => {
    expect(hasPermission(["buyer"], "favorite:create")).toBe(true);
    expect(hasPermission(["buyer"], "moderation:approve")).toBe(false);
    expect(hasPermission(["admin"], "anything:at_all")).toBe(true);
    expect(hasPermission(["moderator"], "moderation:approve")).toBe(true);
  });
  it("transport estimate", () => {
    const e = estimateTransport("livestock_truck", 300, { heads: 50 });
    expect(e.estimateKzt).toBeGreaterThan(100_000);
    expect(e.rangeKzt[0]).toBeLessThan(e.estimateKzt);
  });
  it("plural and money", () => {
    expect(plural(1, ["голова", "головы", "голов"])).toBe("1 голова");
    expect(plural(3, ["голова", "головы", "голов"])).toBe("3 головы");
    expect(plural(12, ["голова", "головы", "голов"])).toBe("12 голов");
    expect(formatKzt(1500000)).toMatch(/₸$/);
  });
  it("region tree", () => {
    expect(regionPath("kz-zha-zhambyl-asa").map((r) => r.code)).toEqual(["kz-zha", "kz-zha-zhambyl", "kz-zha-zhambyl-asa"]);
    expect(topLevelOf("kz-kos-auliekol")).toBe("kz-kos");
    expect(REGIONS.filter((r) => r.parent === null)).toHaveLength(20);
  });
  it("categories have unique codes and valid parents", () => {
    const codes = new Set(CATEGORIES.map((c) => c.code));
    expect(codes.size).toBe(CATEGORIES.length);
    for (const c of CATEGORIES) if (c.parent) expect(codes.has(c.parent)).toBe(true);
  });
});
