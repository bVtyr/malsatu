import { sql } from "kysely";
import { db } from "../db/index.js";
/** Ежедневный индекс цен по категориям/регионам/единицам (окно 30 дней) + агрегат по стране 'kz'. */
export async function buildPriceIndex() {
  const r = await sql`
    INSERT INTO price_index_daily (day, category_code, region_code, unit, count, avg_kzt, median_kzt, p25_kzt, p75_kzt, min_kzt, max_kzt)
    SELECT current_date, category_code, region_code, price_type,
      count(*)::int, round(avg(price_kzt))::bigint, percentile_cont(0.5) WITHIN GROUP (ORDER BY price_kzt)::bigint,
      percentile_cont(0.25) WITHIN GROUP (ORDER BY price_kzt)::bigint, percentile_cont(0.75) WITHIN GROUP (ORDER BY price_kzt)::bigint, min(price_kzt), max(price_kzt)
    FROM (
      SELECT category_code, top_region_code AS region_code, price_type, price_kzt FROM listings
      WHERE price_kzt > 0 AND price_type NOT IN ('negotiable','per_lot') AND kind IN ('livestock','meat') AND status IN ('active','reserved','sold') AND published_at > now() - interval '30 days'
      UNION ALL
      SELECT category_code, 'kz', price_type, price_kzt FROM listings
      WHERE price_kzt > 0 AND price_type NOT IN ('negotiable','per_lot') AND kind IN ('livestock','meat') AND status IN ('active','reserved','sold') AND published_at > now() - interval '30 days'
    ) t GROUP BY category_code, region_code, price_type HAVING count(*) >= 1
    ON CONFLICT (day, category_code, region_code, unit) DO UPDATE SET count = EXCLUDED.count, avg_kzt = EXCLUDED.avg_kzt, median_kzt = EXCLUDED.median_kzt, p25_kzt = EXCLUDED.p25_kzt, p75_kzt = EXCLUDED.p75_kzt, min_kzt = EXCLUDED.min_kzt, max_kzt = EXCLUDED.max_kzt`.execute(db);
  return { rows: Number(r.numAffectedRows ?? 0) };
}
