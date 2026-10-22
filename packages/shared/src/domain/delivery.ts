/** Калькулятор ориентировочной стоимости перевозки по расстоянию и объёму. Тарифы настраиваются в админке. */
export type VehicleType = "livestock_truck" | "refrigerator" | "flatbed";

export interface TransportTariff { base: number; perKm: number; perHeadKm?: number; perTonKm?: number; minKzt: number }

export const DEFAULT_TARIFFS: Record<VehicleType, TransportTariff> = {
  livestock_truck: { base: 15000, perKm: 180, perHeadKm: 6, minKzt: 25000 },
  refrigerator:    { base: 12000, perKm: 160, perTonKm: 40, minKzt: 20000 },
  flatbed:         { base: 10000, perKm: 140, perTonKm: 30, minKzt: 15000 },
};

export function estimateTransport(vehicle: VehicleType, distanceKm: number, payload: { heads?: number; tons?: number }, tariffs = DEFAULT_TARIFFS) {
  const t = tariffs[vehicle];
  let cost = t.base + t.perKm * distanceKm;
  if (t.perHeadKm && payload.heads) cost += t.perHeadKm * payload.heads * distanceKm;
  if (t.perTonKm && payload.tons) cost += t.perTonKm * payload.tons * distanceKm;
  cost = Math.max(cost, t.minKzt);
  const lo = Math.round((cost * 0.85) / 1000) * 1000;
  const hi = Math.round((cost * 1.2) / 1000) * 1000;
  return { estimateKzt: Math.round(cost / 1000) * 1000, rangeKzt: [lo, hi] as [number, number] };
}

/** Вместимость скотовоза по видам (ориентир): КРС ≈ 1 гол/1.6 м², МРС ≈ 1 гол/0.4 м². */
export function fitsCapacity(capacityHeadsCattle: number, species: "cattle" | "horse" | "camel" | "sheep" | "goat", heads: number) {
  const factor = species === "sheep" || species === "goat" ? 4 : species === "camel" ? 0.7 : 1;
  return heads <= Math.floor(capacityHeadsCattle * factor);
}
