/** Индекс цен: средние/медианные цены по категории и региону; подсказка цены; детектор аномально низкой цены. */
export type PriceUnit = "per_head" | "per_kg_live" | "per_kg_meat" | "per_lot" | "negotiable";

export interface PricePoint {
  categoryCode: string;
  regionCode: string;
  unit: PriceUnit;
  priceKzt: number;
  weightKg?: number | null;
  publishedAt: Date;
}

export interface PriceStat {
  categoryCode: string;
  regionCode: string;
  unit: PriceUnit;
  count: number;
  avg: number;
  median: number;
  p25: number;
  p75: number;
  min: number;
  max: number;
}

function quantile(sorted: number[], q: number): number {
  if (sorted.length === 0) return 0;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  const w = pos - lo;
  return sorted[lo]! * (1 - w) + sorted[hi]! * w;
}

export function computeStats(points: PricePoint[], windowDays = 30, now = new Date()): PriceStat[] {
  const since = now.getTime() - windowDays * 86_400_000;
  const groups = new Map<string, number[]>();
  for (const p of points) {
    if (p.unit === "negotiable" || p.priceKzt <= 0) continue;
    if (p.publishedAt.getTime() < since) continue;
    const key = `${p.categoryCode}|${p.regionCode}|${p.unit}`;
    (groups.get(key) ?? groups.set(key, []).get(key)!).push(p.priceKzt);
  }
  const out: PriceStat[] = [];
  for (const [key, vals] of groups) {
    vals.sort((a, b) => a - b);
    const [categoryCode, regionCode, unit] = key.split("|") as [string, string, PriceUnit];
    out.push({
      categoryCode, regionCode, unit,
      count: vals.length,
      avg: Math.round(vals.reduce((a, b) => a + b, 0) / vals.length),
      median: Math.round(quantile(vals, 0.5)),
      p25: Math.round(quantile(vals, 0.25)),
      p75: Math.round(quantile(vals, 0.75)),
      min: vals[0]!,
      max: vals[vals.length - 1]!,
    });
  }
  return out;
}

/** Подсказка цены: сначала регион, при нехватке данных — вся страна (regionCode="kz"). */
export function priceHint(stats: PriceStat[], categoryCode: string, regionCode: string, unit: PriceUnit, minSamples = 3) {
  const local = stats.find((s) => s.categoryCode === categoryCode && s.regionCode === regionCode && s.unit === unit);
  if (local && local.count >= minSamples) return { ...local, scope: "region" as const };
  const national = stats.find((s) => s.categoryCode === categoryCode && s.regionCode === "kz" && s.unit === unit);
  if (national && national.count >= minSamples) return { ...national, scope: "country" as const };
  return null;
}

/** Подозрительно низкая цена: ниже 50 % медианы (порог настраивается). */
export function isSuspiciouslyLow(priceKzt: number, stat: PriceStat | null | undefined, thresholdRatio = 0.5): boolean {
  if (!stat || stat.count < 3) return false;
  return priceKzt < stat.median * thresholdRatio;
}

/** Приведение цены к «за кг живого веса» для сортировки/сравнения, если известен вес. */
export function normalizeToPerKg(priceKzt: number, unit: PriceUnit, weightKg?: number | null, heads = 1): number | null {
  if (unit === "per_kg_live" || unit === "per_kg_meat") return priceKzt;
  if (unit === "per_head" && weightKg && weightKg > 0) return Math.round(priceKzt / weightKg);
  if (unit === "per_lot" && weightKg && weightKg > 0 && heads > 0) return Math.round(priceKzt / (weightKg * heads));
  return null;
}
