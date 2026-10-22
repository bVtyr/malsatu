import { haversineKm, pointInPolygon, type LatLng } from "./geo.js";

/** Карантинные зоны: круг (центр+радиус) или полигон. Действие: скрыть объявления или пометить. */
export type QuarantineAction = "hide" | "flag";
export type QuarantineDisease = "fmd" | "brucellosis" | "anthrax" | "asf" | "avian_flu" | "rabies" | "other";

export interface QuarantineZone {
  id: string;
  disease: QuarantineDisease;
  action: QuarantineAction;
  species: string[] | null; // null = все виды; иначе коды категорий ("cattle","sheep","horse",...)
  startsAt: Date;
  endsAt: Date | null;
  circle?: { center: LatLng; radiusKm: number };
  polygon?: Array<[number, number]>; // [lng, lat]
  blockTransport: boolean;
}

export function zoneActive(z: QuarantineZone, now = new Date()): boolean {
  return z.startsAt <= now && (z.endsAt === null || z.endsAt > now);
}

export function pointInZone(p: LatLng, z: QuarantineZone): boolean {
  if (z.circle) return haversineKm(p, z.circle.center) <= z.circle.radiusKm;
  if (z.polygon) return pointInPolygon(p, z.polygon);
  return false;
}

export function zoneAppliesToSpecies(z: QuarantineZone, species: string | null): boolean {
  if (!z.species || z.species.length === 0) return true;
  if (!species) return true;
  return z.species.includes(species);
}

export interface ListingVisibility {
  hidden: boolean;
  flagged: boolean;
  zones: QuarantineZone[];
}

/** Какой эффект зоны оказывают на объявление в точке p с видом species. */
export function evaluateListing(p: LatLng, species: string | null, zones: QuarantineZone[], now = new Date()): ListingVisibility {
  const hit = zones.filter((z) => zoneActive(z, now) && zoneAppliesToSpecies(z, species) && pointInZone(p, z));
  return {
    hidden: hit.some((z) => z.action === "hide"),
    flagged: hit.length > 0,
    zones: hit,
  };
}

/** Можно ли перевозить из точки from (живой скот). Блокируется, если точка в активной зоне с blockTransport. */
export function transportAllowed(from: LatLng, species: string | null, zones: QuarantineZone[], now = new Date()) {
  const blocking = zones.filter(
    (z) => zoneActive(z, now) && z.blockTransport && zoneAppliesToSpecies(z, species) && pointInZone(from, z),
  );
  return { allowed: blocking.length === 0, blockedBy: blocking };
}
