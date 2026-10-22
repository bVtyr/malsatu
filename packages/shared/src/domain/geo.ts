/** Географические утилиты: расстояния, радиусы, попадание точки в зону. */
export interface LatLng { lat: number; lng: number }

export const RADIUS_PRESETS_KM = [10, 50, 100, 300] as const;
export type RadiusKm = (typeof RADIUS_PRESETS_KM)[number];

const EARTH_RADIUS_KM = 6371.0088;
const toRad = (d: number) => (d * Math.PI) / 180;

/** Расстояние по дуге большого круга (haversine), км. */
export function haversineKm(a: LatLng, b: LatLng): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(s)));
}

/** Ограничивающий прямоугольник вокруг точки — для быстрого предфильтра в SQL. */
export function boundingBox(center: LatLng, radiusKm: number) {
  const dLat = radiusKm / 111.32;
  const dLng = radiusKm / (111.32 * Math.max(0.01, Math.cos(toRad(center.lat))));
  return {
    minLat: center.lat - dLat,
    maxLat: center.lat + dLat,
    minLng: center.lng - dLng,
    maxLng: center.lng + dLng,
  };
}

/** Точка в многоугольнике (ray casting). Полигон — массив вершин [lng, lat]. */
export function pointInPolygon(p: LatLng, polygon: Array<[number, number]>): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, yi] = polygon[i]!;
    const [xj, yj] = polygon[j]!;
    const intersect =
      yi > p.lat !== yj > p.lat && p.lng < ((xj - xi) * (p.lat - yi)) / (yj - yi + 0) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

/** Округление и «размытие» точки для публичного показа (приватность продавца, ~1–2 км). */
export function fuzzLocation(p: LatLng, seed = 0.5): LatLng {
  const off = (seed - 0.5) * 0.02; // ±0.01° ≈ ±1 км
  return { lat: Math.round((p.lat + off) * 100) / 100, lng: Math.round((p.lng - off) * 100) / 100 };
}

/** Кластеризация точек для карты (простая сеточная, по zoom). */
export function gridCluster<T extends LatLng>(points: T[], zoom: number) {
  const cell = 360 / Math.pow(2, zoom + 1);
  const map = new Map<string, { lat: number; lng: number; count: number; items: T[] }>();
  for (const p of points) {
    const key = `${Math.floor(p.lat / cell)}:${Math.floor(p.lng / cell)}`;
    const c = map.get(key);
    if (c) {
      c.count++;
      c.lat += (p.lat - c.lat) / c.count;
      c.lng += (p.lng - c.lng) / c.count;
      if (c.items.length < 10) c.items.push(p);
    } else map.set(key, { lat: p.lat, lng: p.lng, count: 1, items: [p] });
  }
  return [...map.values()];
}

/** Координаты центров регионов (для fallback, когда геолокация недоступна). */
export const REGION_CENTERS: Record<string, LatLng> = {
  "kz-ast": { lat: 51.1605, lng: 71.4704 },
  "kz-ala": { lat: 43.2389, lng: 76.8897 },
  "kz-shy": { lat: 42.3417, lng: 69.5901 },
  "kz-aba": { lat: 50.4111, lng: 80.2275 },
  "kz-akm": { lat: 51.9167, lng: 69.4 },
  "kz-akt": { lat: 50.2839, lng: 57.1669 },
  "kz-alm": { lat: 44.85, lng: 77.0 },
  "kz-aty": { lat: 47.1167, lng: 51.8833 },
  "kz-vko": { lat: 49.9483, lng: 82.6275 },
  "kz-zha": { lat: 42.9, lng: 71.3667 },
  "kz-zhe": { lat: 45.0167, lng: 78.3667 },
  "kz-zko": { lat: 51.2333, lng: 51.3667 },
  "kz-kar": { lat: 49.8047, lng: 73.1094 },
  "kz-kos": { lat: 53.2144, lng: 63.6246 },
  "kz-kzo": { lat: 44.8528, lng: 65.5092 },
  "kz-man": { lat: 43.65, lng: 51.1667 },
  "kz-pav": { lat: 52.2873, lng: 76.9674 },
  "kz-sko": { lat: 54.8667, lng: 69.15 },
  "kz-tur": { lat: 43.3, lng: 68.25 },
  "kz-uly": { lat: 47.8, lng: 67.7 },
};
