import { describe, it, expect } from "vitest";
import { evaluateListing, transportAllowed, zoneActive, type QuarantineZone } from "../src/domain/quarantine.js";

const zone = (over: Partial<QuarantineZone> = {}): QuarantineZone => ({
  id: "z1", disease: "fmd", action: "hide", species: ["cattle", "sheep"], startsAt: new Date("2026-10-01"), endsAt: new Date("2026-12-31"),
  circle: { center: { lat: 42.9, lng: 71.1 }, radiusKm: 30 }, blockTransport: true, ...over,
});

describe("quarantine zones", () => {
  it("hides cattle listing inside active circle zone", () => {
    const r = evaluateListing({ lat: 42.95, lng: 71.2 }, "cattle", [zone()], new Date("2026-11-01"));
    expect(r.hidden).toBe(true);
    expect(r.flagged).toBe(true);
  });
  it("does not affect listing outside radius or of other species", () => {
    expect(evaluateListing({ lat: 44.0, lng: 71.2 }, "cattle", [zone()], new Date("2026-11-01")).flagged).toBe(false);
    expect(evaluateListing({ lat: 42.95, lng: 71.2 }, "horse", [zone()], new Date("2026-11-01")).flagged).toBe(false);
  });
  it("flag action marks but does not hide", () => {
    const r = evaluateListing({ lat: 42.95, lng: 71.2 }, "sheep", [zone({ action: "flag" })], new Date("2026-11-01"));
    expect(r.hidden).toBe(false);
    expect(r.flagged).toBe(true);
  });
  it("inactive (expired / future) zones are ignored", () => {
    expect(zoneActive(zone(), new Date("2027-01-15"))).toBe(false);
    expect(zoneActive(zone(), new Date("2026-09-15"))).toBe(false);
    expect(evaluateListing({ lat: 42.95, lng: 71.2 }, "cattle", [zone()], new Date("2027-01-15")).flagged).toBe(false);
  });
  it("polygon zone works", () => {
    const poly = zone({ circle: undefined, polygon: [[70, 42], [72, 42], [72, 44], [70, 44]] });
    expect(evaluateListing({ lat: 43, lng: 71 }, null, [poly], new Date("2026-11-01")).hidden).toBe(true);
    expect(evaluateListing({ lat: 45, lng: 71 }, null, [poly], new Date("2026-11-01")).hidden).toBe(false);
  });
  it("blocks livestock transport from zone", () => {
    expect(transportAllowed({ lat: 42.95, lng: 71.2 }, "sheep", [zone()], new Date("2026-11-01")).allowed).toBe(false);
    expect(transportAllowed({ lat: 42.95, lng: 71.2 }, "sheep", [zone({ blockTransport: false })], new Date("2026-11-01")).allowed).toBe(true);
  });
});
