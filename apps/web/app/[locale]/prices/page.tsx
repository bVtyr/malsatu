"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
/** Индекс цен: ценник по категориям и регионам, график по неделям, сравнение регионов. */
export default function PricesPage() {
  const { t, name, money, locale } = useI18n();
  const [cats, setCats] = useState<any[]>([]); const [regions, setRegions] = useState<any[]>([]);
  const [cat, setCat] = useState("sheep_ram"); const [region, setRegion] = useState("kz"); const [unit, setUnit] = useState("per_head");
  const [items, setItems] = useState<any[]>([]); const [series, setSeries] = useState<any[]>([]); const [cmp, setCmp] = useState<any[]>([]);
  useEffect(() => { api("/categories").then((r) => setCats(r.categories.filter((c: any) => c.parent_code && c.kind !== "service"))); api("/regions", { query: { parent: "" } }).then((r) => setRegions(r.regions)); }, []);
  useEffect(() => { api("/price-index", { query: { category: cat, unit } }).then((r) => setItems(r.items)); api("/price-index/history", { query: { category: cat, region, unit, granularity: "week", months: 3 } }).then((r) => setSeries(r.series)); api("/price-index/compare", { query: { category: cat, unit } }).then((r) => setCmp(r.regions)); }, [cat, region, unit]);
  const cur = items.find((i) => i.region_code === region);
  const max = Math.max(1, ...series.map((s) => Number(s.median))); const min = Math.min(...series.map((s) => Number(s.median)), max);
  const pts = series.map((s, i) => `${(i / Math.max(1, series.length - 1)) * 300},${100 - ((Number(s.median) - min) / Math.max(1, max - min)) * 90}`).join(" ");
  const units: Array<[string, string]> = [["per_head", t.common.perHead], ["per_kg_live", t.common.perKgLive], ["per_kg_meat", t.common.perKgMeat]];
  return (
    <>
      <h1 className="page-title">{t.home.prices}</h1>
      <div className="actions">
        <select className="field" value={cat} onChange={(e) => setCat(e.target.value)} aria-label={t.home.categories}>{cats.map((c) => <option key={c.code} value={c.code}>{name(c)}</option>)}</select>
        <select className="field" value={region} onChange={(e) => setRegion(e.target.value)} aria-label={t.filters.region}><option value="kz">{locale === "kk" ? "Қазақстан" : "Казахстан"}</option>{regions.map((r) => <option key={r.code} value={r.code}>{name(r)}</option>)}</select>
      </div>
      <div className="chips">{units.map(([u, l]) => <button key={u} type="button" onClick={() => setUnit(u)} className="chip" aria-pressed={unit === u}>{l}</button>)}</div>
      <div className="panel" style={{ background: "var(--surface)" }}>
        {cur ? <><p className="price-big">{money(cur.median_kzt)}<small>{locale === "kk" ? "медиана" : "медиана"}</small></p><p className="sub" style={{ marginTop: "0.4rem" }}>{money(cur.p25_kzt)} – {money(cur.p75_kzt)}, {cur.count} {locale === "kk" ? "хабарландыру" : "объявлений"}, {new Date(cur.day).toLocaleDateString(locale === "kk" ? "kk-KZ" : "ru-KZ")}</p></> : <p className="sub">{t.common.nothingFound}</p>}
        {series.length > 1 && <svg viewBox="0 0 300 110" className="spark" role="img" aria-label={locale === "kk" ? "Апта бойынша медиана" : "Медиана по неделям"}><polyline fill="none" stroke="#184c2e" strokeWidth="3" points={pts} />{series.map((s, i) => <circle key={i} cx={(i / Math.max(1, series.length - 1)) * 300} cy={100 - ((Number(s.median) - min) / Math.max(1, max - min)) * 90} r="4" fill="#f0c21c" stroke="#141413" strokeWidth="1.5" />)}</svg>}
        {series.length > 1 && <div className="label-row sub"><span>{new Date(series[0].period).toLocaleDateString()}</span><span>{new Date(series[series.length - 1].period).toLocaleDateString()}</span></div>}
      </div>
      <h2 className="page-title">{locale === "kk" ? "Аймақтар бойынша" : "По регионам"}</h2>
      <div className="price-rows">{cmp.map((r) => <div key={r.region_code} className="line"><span className="what">{name(r)}</span><span className="leader" /><span className="val">{money(r.median_kzt)}</span></div>)}{cmp.length === 0 && <p className="sub">—</p>}</div>
      <p className="sub">{locale === "kk" ? "Кеңейтілген аналитика (аудандар, болжамдар, экспорт) бизнес үшін ақылы." : "Расширенная аналитика (районы, прогнозы, выгрузки) платная для бизнеса."}</p>
    </>
  );
}
