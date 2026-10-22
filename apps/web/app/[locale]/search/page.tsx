"use client";
import { useEffect, useMemo, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { useAuth } from "@/lib/auth";
import { useGeo } from "@/lib/geo";
import { ListingCard } from "@/components/ListingCard";
import { ListingsMap } from "@/components/MapView";
import { RegionPicker } from "@/components/RegionPicker";
import { CategoryIcon, Search } from "@/components/Icons";
import { RADIUS_PRESETS_KM } from "@malsatu/shared";

function SearchInner() {
  const { t, name, href, locale } = useI18n(); const { user } = useAuth(); const { pos, request: requestGeo } = useGeo();
  const sp = useSearchParams(); const router = useRouter();
  const q = useMemo(() => Object.fromEntries(sp.entries()), [sp]);
  const set = (patch: Record<string, string | undefined>) => { const n = new URLSearchParams(sp); for (const [k, v] of Object.entries(patch)) v ? n.set(k, v) : n.delete(k); n.delete("page"); router.replace(`?${n.toString()}`); };
  const [data, setData] = useState<{ items: any[]; total: number }>({ items: [], total: 0 });
  const [cats, setCats] = useState<any[]>([]); const [breeds, setBreeds] = useState<any[]>([]);
  const [view, setView] = useState<"list" | "map">("list"); const [filters, setFilters] = useState(false); const [loading, setLoading] = useState(false); const [saved, setSaved] = useState(false);
  const page = Number(q.page ?? 1);
  const query = { ...q, ...(q.radiusKm && pos ? { lat: pos.lat, lng: pos.lng } : {}), page, limit: 20 };
  useEffect(() => { api("/categories").then((r) => setCats(r.categories)); }, []);
  useEffect(() => { const c = cats.find((x) => x.code === q.category); if (c?.species) api("/breeds", { query: { species: c.species } }).then((r) => setBreeds(r.breeds)); else setBreeds([]); }, [q.category, cats]);
  useEffect(() => { setLoading(true); api("/listings", { query }).then(setData).finally(() => setLoading(false)); }, [JSON.stringify(query)]);
  const saveSearch = async () => { if (!user) return router.push(href("/login?next=/search")); await api("/saved-searches", { body: { name: q.q || cats.find((c) => c.code === q.category)?.name_ru || "Поиск", query: q, notify: true } }); setSaved(true); };
  const Toggle = ({ k, label }: { k: string; label: string }) => <button type="button" onClick={() => set({ [k]: q[k] === "true" ? undefined : "true" })} className="chip" aria-pressed={q[k] === "true"}>{label}</button>;
  const topCats = cats.filter((c) => !c.parent_code); const sub = cats.filter((c) => c.parent_code === q.category);
  const activeTop = cats.find((x) => x.code === q.category)?.parent_code ?? q.category;
  const purposeNames: Record<string, string> = { slaughter: locale === "kk" ? "союға" : "на убой", fattening: locale === "kk" ? "бордақылауға" : "на откорм", breeding: locale === "kk" ? "тұқымға" : "на племя", kurban: locale === "kk" ? "Құрбан айтқа" : "на Курбан айт", dairy: locale === "kk" ? "сауын" : "дойная", sogym: locale === "kk" ? "соғымға" : "на согым" };
  const nFilters = Object.keys(q).filter((k) => !["q", "category", "sort", "page"].includes(k)).length;
  return (
    <>
      <form onSubmit={(e) => { e.preventDefault(); set({ q: (new FormData(e.currentTarget).get("q") as string) || undefined }); }} className="row between" style={{ gap: "0.5rem" }}>
        <input name="q" type="search" autoComplete="off" defaultValue={q.q} placeholder="қой, бычки, казы…" className="field" aria-label={t.common.search} style={{ flex: 1 }} />
        <button className="btn btn--ink" aria-label={t.common.search}><Search size={22} /></button>
      </form>
      <div className="signs">
        {topCats.map((c) => <button key={c.code} type="button" onClick={() => set({ category: activeTop === c.code ? undefined : c.code, breed: undefined })} className="tile" aria-pressed={activeTop === c.code} style={activeTop === c.code ? { background: "var(--accent)", color: "var(--ink)" } : undefined}><CategoryIcon icon={c.icon} /><span className="tile-title">{c.name_kk}</span><span className="tile-sub" style={activeTop === c.code ? { color: "var(--ink)" } : undefined}>{c.name_ru}</span></button>)}
      </div>
      {sub.length > 0 && <div className="chips chips--scroll">{sub.map((c) => <button key={c.code} type="button" onClick={() => set({ category: q.category === c.code ? c.parent_code : c.code })} className="chip" aria-pressed={q.category === c.code}>{name(c)}</button>)}</div>}
      <div className="chips">
        <button type="button" onClick={() => setFilters(!filters)} className="chip" aria-expanded={filters}>{t.common.filters}{nFilters ? ` ${nFilters}` : ""}</button>
        <select value={q.sort ?? "new"} onChange={(e) => set({ sort: e.target.value })} className="field" aria-label={t.filters.sort} style={{ width: "auto", minHeight: "2.75rem", padding: "0.3rem 2.4rem 0.3rem 0.9rem", fontSize: "var(--step-small)" }}>
          <option value="new">{t.filters.sortNew}</option><option value="cheap">{t.filters.sortCheap}</option><option value="expensive">{t.filters.sortExpensive}</option><option value="near">{t.filters.sortNear}</option><option value="rating">{t.filters.sortRating}</option><option value="per_kg">{t.filters.sortPerKg}</option>
        </select>
        <button type="button" onClick={() => setView(view === "list" ? "map" : "list")} className="chip" aria-pressed={view === "map"}>{view === "list" ? t.filters.map : t.filters.list}</button>
      </div>
      {filters && (
        <div className="panel panel--surface stack">
          <RegionPicker value={q.region ?? null} onChange={(code) => set({ region: code, radiusKm: undefined })} geo={pos} onRequestGeo={requestGeo} />
          <div><span className="label">{t.filters.radius}{pos ? "" : ` (${locale === "kk" ? "геолокация қажет" : "нужна геолокация"})`}</span><div className="chips">{RADIUS_PRESETS_KM.map((r) => <button key={r} type="button" onClick={() => { if (!pos) requestGeo(); set({ radiusKm: q.radiusKm === String(r) ? undefined : String(r), region: undefined }); }} className="chip" aria-pressed={q.radiusKm === String(r)}>{r} {t.common.km}</button>)}</div></div>
          {breeds.length > 0 && <select className="field" value={q.breed ?? ""} onChange={(e) => set({ breed: e.target.value || undefined })} aria-label={t.filters.breed}><option value="">{t.filters.breed}</option>{breeds.map((b) => <option key={b.code} value={b.code}>{name(b)}</option>)}</select>}
          <div className="actions">
            {([["priceMin", `${t.filters.price}, ${t.common.from}`], ["priceMax", `${t.filters.price}, ${t.common.to}`], ["weightMin", `${t.filters.weight}, ${t.common.from}`], ["qtyMin", `${t.filters.quantity}, ${t.common.from}`], ["ageMin", `${t.filters.age}, ${t.common.from}`], ["ageMax", `${t.filters.age}, ${t.common.to}`]] as const).map(([k, label]) => (
              <label key={k}><span className="label">{label}</span><input className="field" type="number" inputMode="numeric" defaultValue={q[k]} onBlur={(e) => set({ [k]: e.target.value || undefined })} /></label>
            ))}
          </div>
          <div><span className="label">{t.filters.sex}</span><div className="chips">{[["male", locale === "kk" ? "еркек" : "самцы"], ["female", locale === "kk" ? "ұрғашы" : "самки"], ["castrated", locale === "kk" ? "ісек, өгіз" : "кастраты"]].map(([s, l]) => <button key={s} type="button" onClick={() => set({ sex: q.sex === s ? undefined : s })} className="chip" aria-pressed={q.sex === s}>{l}</button>)}</div></div>
          <div><span className="label">{t.filters.purpose}</span><div className="chips">{Object.entries(purposeNames).map(([p, l]) => <button key={p} type="button" onClick={() => set({ purpose: q.purpose === p ? undefined : p })} className="chip" aria-pressed={q.purpose === p}>{l}</button>)}</div></div>
          <div className="chips"><Toggle k="withDocs" label={t.filters.withDocs} /><Toggle k="withTags" label={t.filters.withTags} /><Toggle k="verifiedOnly" label={t.filters.verifiedOnly} /><Toggle k="halal" label={t.filters.halal} /><Toggle k="withDelivery" label={t.filters.withDelivery} /><Toggle k="escrow" label={t.filters.escrow} /><Toggle k="withVideo" label={t.filters.withVideo} /></div>
          <div className="actions"><button type="button" onClick={() => router.replace("?")} className="btn btn--white">{t.common.reset}</button><button type="button" onClick={saveSearch} className="btn">{saved ? t.common.verified : t.filters.saveSearch}</button></div>
        </div>
      )}
      {view === "map" ? <ListingsMap query={query} center={pos ?? undefined} /> : (
        <>
          <p className="sub">{loading ? t.common.loading : `${data.total} ${locale === "kk" ? "хабарландыру" : "объявлений"}`}</p>
          {!loading && data.items.length === 0 && <div className="panel panel--surface">{t.common.nothingFound}</div>}
          <div className="list">{data.items.map((l) => <ListingCard key={l.id} l={l} />)}</div>
          {data.total > page * 20 && <button type="button" onClick={() => { const n = new URLSearchParams(sp); n.set("page", String(page + 1)); router.replace(`?${n}`); }} className="btn btn--white btn--wide">{t.common.more}</button>}
        </>
      )}
    </>
  );
}
export default function SearchPage() { return <Suspense><SearchInner /></Suspense>; }
