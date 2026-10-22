/** Калькулятор убойного выхода: ориентировочный выход мяса (туши) из живого веса. */
export type Species = "cattle" | "sheep" | "goat" | "horse" | "camel" | "poultry";
export type Fatness = "low" | "medium" | "high";

/** Доля убойного выхода (туша без шкуры, головы, внутренностей), по упитанности. Усреднённые нормативы. */
export const YIELD_TABLE: Record<Species, Record<Fatness, number>> = {
  cattle:  { low: 0.45, medium: 0.52, high: 0.58 },
  sheep:   { low: 0.42, medium: 0.48, high: 0.54 }, // курдючные породы — выше
  goat:    { low: 0.40, medium: 0.45, high: 0.50 },
  horse:   { low: 0.46, medium: 0.52, high: 0.58 },
  camel:   { low: 0.45, medium: 0.50, high: 0.55 },
  poultry: { low: 0.60, medium: 0.65, high: 0.70 },
};

export interface YieldResult {
  carcassKg: number;      // туша
  boneInMeatKg: number;   // мясо на кости (≈ туша)
  bonelessMeatKg: number; // мясо без костей
  offalKg: number;        // субпродукты (ориентировочно)
  ratio: number;
}

export function slaughterYield(species: Species, liveWeightKg: number, fatness: Fatness = "medium", fatTailed = false): YieldResult {
  if (liveWeightKg <= 0) return { carcassKg: 0, boneInMeatKg: 0, bonelessMeatKg: 0, offalKg: 0, ratio: 0 };
  let ratio = YIELD_TABLE[species][fatness];
  if (species === "sheep" && fatTailed) ratio += 0.03; // курдюк
  const carcass = liveWeightKg * ratio;
  const bonelessShare = species === "poultry" ? 0.75 : 0.78;
  const r = (n: number) => Math.round(n * 10) / 10;
  return {
    carcassKg: r(carcass),
    boneInMeatKg: r(carcass),
    bonelessMeatKg: r(carcass * bonelessShare),
    offalKg: r(liveWeightKg * (species === "poultry" ? 0.08 : 0.05)),
    ratio: Math.round(ratio * 1000) / 1000,
  };
}

/** Сколько кг мяса нужно на той по числу гостей (норма ≈ 0.5 кг на гостя + 10 % запас). */
export function meatForGuests(guests: number, kgPerGuest = 0.5, reserve = 0.1): number {
  if (guests <= 0) return 0;
  return Math.ceil(Math.round(guests * kgPerGuest * (1 + reserve) * 1000) / 1000);
}
