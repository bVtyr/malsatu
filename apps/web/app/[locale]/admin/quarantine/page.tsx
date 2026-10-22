"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { useAuth, hasRole } from "@/lib/auth";
import { PointPicker } from "@/components/MapView";
/** Карантинные зоны: список, создание (точка на карте и радиус), снятие. Применяется к объявлениям сразу. */
export default function QuarantinePage() {
  const { t, date, locale, name } = useI18n(); const { user } = useAuth();
  const [items, setItems] = useState<any[]>([]); const [res, setRes] = useState<any>(null);
  const [f, setF] = useState({ nameRu: "", nameKk: "", disease: "fmd", action: "hide", species: ["cattle", "sheep", "goat"] as string[], radiusKm: 20, endsAt: "", blockTransport: true, center: null as null | { lat: number; lng: number } });
  const load = () => api("/admin/quarantine-zones").then((r) => setItems(r.items));
  useEffect(() => { if (hasRole(user, "admin", "moderator")) load(); }, [user]);
  if (!hasRole(user, "admin", "moderator")) return <p className="sub">403</p>;
  const create = async () => { if (!f.center) return; const r = await api("/admin/quarantine-zones", { body: { nameRu: f.nameRu, nameKk: f.nameKk || f.nameRu, disease: f.disease, action: f.action, species: f.species.length ? f.species : null, startsAt: new Date().toISOString(), endsAt: f.endsAt ? new Date(f.endsAt).toISOString() : null, centerLat: f.center.lat, centerLng: f.center.lng, radiusKm: Number(f.radiusKm), blockTransport: f.blockTransport, source: "admin" } }); setRes(r.applied); load(); };
  const end = async (id: string) => { const r = await api(`/admin/quarantine-zones/${id}`, { method: "DELETE" }); setRes(r.applied); load(); };
  const SP = ["cattle", "sheep", "goat", "horse", "camel", "poultry"]; const dis: Record<string, string> = { fmd: locale === "kk" ? "аусыл" : "ящур", brucellosis: locale === "kk" ? "бруцеллёз" : "бруцеллёз", anthrax: locale === "kk" ? "сібір жарасы" : "сибирская язва", asf: locale === "kk" ? "АШО" : "АЧС", avian_flu: locale === "kk" ? "құс тұмауы" : "птичий грипп", rabies: locale === "kk" ? "құтыру" : "бешенство", other: locale === "kk" ? "басқа" : "другое" };
  return <>
    <h1 className="page-title">{t.admin.quarantine}</h1>
    {res && <div className="panel panel--yellow small">{locale === "kk" ? "Қолданылды" : "Применено"}: {locale === "kk" ? "жасырылды" : "скрыто"} {res.hidden}, {locale === "kk" ? "қалпына келтірілді" : "восстановлено"} {res.restored}, {locale === "kk" ? "белгіленді" : "помечено"} {res.flagged}</div>}
    <div className="list-rows">{items.map((z) => { const active = new Date(z.starts_at) <= new Date() && (!z.ends_at || new Date(z.ends_at) > new Date()); return <div key={z.id} className="rowline"><span style={{ flex: 1 }}><b style={{ fontWeight: 500 }}>{name(z)}</b> <span className={`mark${active ? " mark--red" : ""}`}>{dis[z.disease] ?? z.disease}, {z.action}</span><br /><span className="sub">{z.species?.join(", ") ?? (locale === "kk" ? "барлық түрлер" : "все виды")}, {z.radius_km ? `${z.radius_km} ${t.common.km}` : (locale === "kk" ? "полигон" : "полигон")}, {date(z.starts_at)} – {z.ends_at ? date(z.ends_at) : "∞"}{z.block_transport ? (locale === "kk" ? ", тасымал бұғатталған" : ", перевозка заблокирована") : ""}</span></span>{active && <button onClick={() => end(z.id)} className="chip">{locale === "kk" ? "Алу" : "Снять"}</button></div>; })}</div>
    <form className="panel panel--surface stack" onSubmit={(e) => { e.preventDefault(); create(); }}>
      <b>{locale === "kk" ? "Жаңа аймақ" : "Новая зона"}</b>
      <label><span className="label">{locale === "kk" ? "Атауы (орысша)" : "Название (ru)"}</span><input className="field" value={f.nameRu} onChange={(e) => setF({ ...f, nameRu: e.target.value })} required /></label>
      <label><span className="label">{locale === "kk" ? "Атауы (қазақша)" : "Название (kk)"}</span><input className="field" value={f.nameKk} onChange={(e) => setF({ ...f, nameKk: e.target.value })} /></label>
      <div className="actions">
        <label><span className="label">{locale === "kk" ? "Ауру" : "Болезнь"}</span><select className="field" value={f.disease} onChange={(e) => setF({ ...f, disease: e.target.value })}>{Object.entries(dis).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
        <label><span className="label">{locale === "kk" ? "Әрекет" : "Действие"}</span><select className="field" value={f.action} onChange={(e) => setF({ ...f, action: e.target.value })}><option value="hide">{locale === "kk" ? "жасыру" : "скрыть объявления"}</option><option value="flag">{locale === "kk" ? "белгілеу" : "пометить"}</option></select></label>
        <label><span className="label">{t.filters.radius}, {t.common.km}</span><input className="field" type="number" inputMode="numeric" value={f.radiusKm} onChange={(e) => setF({ ...f, radiusKm: Number(e.target.value) })} /></label>
        <label><span className="label">{locale === "kk" ? "Аяқталуы" : "Окончание"}</span><input className="field" type="date" value={f.endsAt} onChange={(e) => setF({ ...f, endsAt: e.target.value })} /></label>
      </div>
      <span className="label">{t.filters.species}</span>
      <div className="chips">{SP.map((s) => { const on = f.species.includes(s); return <button key={s} type="button" onClick={() => setF({ ...f, species: on ? f.species.filter((x) => x !== s) : [...f.species, s] })} className="chip" aria-pressed={on}>{s}</button>; })}</div>
      <label className="check"><input type="checkbox" checked={f.blockTransport} onChange={(e) => setF({ ...f, blockTransport: e.target.checked })} />{locale === "kk" ? "Аймақтан тасымалдауды бұғаттау" : "Блокировать перевозку из зоны"}</label>
      <PointPicker value={f.center} onChange={(p) => setF({ ...f, center: p })} />
      <button disabled={!f.center || !f.nameRu} className="btn btn--wide">{t.common.save}</button>
    </form>
  </>;
}
