"use client";
import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { useAuth } from "@/lib/auth";

/** Согым вскладчину: список сборов, чек сбора с восемью долями, бронь и оплата доли. */
function SogymInner() {
  const { t, lf, money, date, href, locale } = useI18n(); const { user } = useAuth(); const router = useRouter(); const sp = useSearchParams();
  const [items, setItems] = useState<any[]>([]); const [pool, setPool] = useState<any>(null); const [busy, setBusy] = useState(false); const [msg, setMsg] = useState<string | null>(null);
  const pid = sp.get("pool");
  useEffect(() => { api("/pools").then((r) => setItems(r.items)); }, []);
  useEffect(() => { if (pid) api(`/pools/${pid}`).then((r) => setPool(r.pool)); else setPool(null); }, [pid]);
  const reserve = async (fraction: string) => {
    if (!user) return router.push(href(`/login?next=/sogym?pool=${pid}`));
    setBusy(true);
    try { const r = await api(`/pools/${pid}/reserve`, { body: { fraction } }); const p = await api(`/pools/${pid}/shares/${r.share.id}/pay`, { method: "POST", body: {} }); setMsg(p.poolStatus === "filled" ? (locale === "kk" ? "Жиналды! Сою мен жеткізу туралы хабарлаймыз." : "Собрано! Сообщим о забое и доставке.") : (locale === "kk" ? "Үлес төленді" : "Доля оплачена")); api(`/pools/${pid}`).then((x) => setPool(x.pool)); } catch (e: any) { setMsg(e.code); } finally { setBusy(false); }
  };
  if (pool) {
    const taken = 8 - pool.unitsFree;
    return (
      <>
        <button onClick={() => router.push(href("/sogym"))} className="chip">{t.common.back}</button>
        <h1 className="h-lead">{lf(pool, "title")}</h1>
        <div className="panel" style={{ background: "var(--surface)" }}>
          <div className="line"><span className="what">{locale === "kk" ? "Ұша бағасы" : "Цена туши"}</span><span className="leader" /><span className="val">{money(pool.total_price_kzt)}</span></div>
          {pool.carcass_weight_kg && <div className="line"><span className="what">{t.filters.weight}</span><span className="leader" /><span className="val">{pool.carcass_weight_kg} {t.common.kg}</span></div>}
          <div className="line"><span className="what">{locale === "kk" ? "Жинау мерзімі" : "Срок сбора"}</span><span className="leader" /><span className="val">{date(pool.deadline)}</span></div>
          {pool.slaughter_date && <div className="line"><span className="what">{locale === "kk" ? "Сою күні" : "Забой"}</span><span className="leader" /><span className="val">{date(pool.slaughter_date)}</span></div>}
          <div className="line"><span className="what">{locale === "kk" ? "Бос үлестер" : "Свободно долей"}</span><span className="leader" /><span className="val">{pool.unitsFree} / 8</span></div>
          <div className="steps" style={{ marginTop: "1rem", gridAutoColumns: "1fr" }} aria-hidden="true">{Array.from({ length: 8 }, (_, i) => <span key={i} className={i < taken ? "is-done" : ""} />)}</div>
          {pool.status === "open" && <div className="actions" style={{ marginTop: "1rem" }}>
            {([["1/2", pool.prices.half, 4], ["1/4", pool.prices.quarter, 2], ["1/8", pool.prices.eighth, 1]] as const).map(([f, price, u]) => <button key={f} type="button" disabled={busy || pool.unitsFree < u} onClick={() => reserve(f)} className={`btn${f === "1/8" ? " span-2" : ""}`}><span className="num" style={{ fontSize: "1.4rem" }}>{f === "1/2" ? "½" : f === "1/4" ? "¼" : "⅛"}</span>{money(price)}</button>)}
          </div>}
          {pool.status !== "open" && <p className="mark mark--green" style={{ marginTop: "1rem" }}>{pool.status}</p>}
          <div className="line line--total"><span className="what">{locale === "kk" ? "Барлығы ұша үшін" : "Итого за тушу"}</span><span className="leader" /><span className="val">{money(pool.total_price_kzt)}</span></div>
        </div>
        {msg && <div className="panel panel--surface">{msg}</div>}
        <p className="sub">{locale === "kk" ? "Мерзімге дейін барлық үлестер жиналмаса, ақша автоматты түрде қайтарылады. Қазы, жая, қарта қатысушылардың келісімі бойынша бөлінеді." : "Если к сроку не наберутся все доли, деньги вернутся автоматически. Казы, жая, қарта делятся по договорённости участников."}</p>
      </>
    );
  }
  return (
    <>
      <h1 className="page-title">{t.home.sogym}</h1>
      <p>{locale === "kk" ? "Соғымға бірігіп ұша алыңыз: ½, ¼ немесе ⅛ үлесін броньдап, өз бөлігіңізді төлеңіз. Сою, мүшелеу мен жеткізуді платформа ұйымдастырады." : "Купите тушу вскладчину: забронируйте ½, ¼ или ⅛ и оплатите свою часть. Забой, разделку и доставку организует платформа."}</p>
      <div className="list-rows">{items.map((p) => <button key={p.id} type="button" onClick={() => router.push(href(`/sogym?pool=${p.id}`))} className="rowline" style={{ width: "100%", textAlign: "left" }}><span style={{ flex: 1 }}><b style={{ fontWeight: 500 }}>{lf(p, "title")}</b><br /><span className="sub">{money(p.total_price_kzt)}, ⅛ = {money(p.prices.eighth)}, {locale === "kk" ? "бос" : "свободно"} {p.unitsFree}/8, {date(p.deadline)}</span></span></button>)}{items.length === 0 && <div className="panel panel--surface">{t.common.nothingFound}</div>}</div>
      {user && <CreatePool onCreated={() => api("/pools").then((r) => setItems(r.items))} />}
    </>
  );
}
function CreatePool({ onCreated }: { onCreated: () => void }) {
  const { t, locale } = useI18n(); const [open, setOpen] = useState(false);
  const [f, setF] = useState({ species: "horse", titleRu: "", titleKk: "", totalPriceKzt: "", carcassWeightKg: "", deadline: "", regionCode: "kz-ast" });
  const submit = async () => { await api("/pools", { body: { ...f, titleKk: f.titleKk || f.titleRu, totalPriceKzt: Number(f.totalPriceKzt), carcassWeightKg: f.carcassWeightKg ? Number(f.carcassWeightKg) : undefined, deadline: new Date(f.deadline).toISOString() } }); setOpen(false); onCreated(); };
  if (!open) return <button onClick={() => setOpen(true)} className="btn btn--white btn--wide">{locale === "kk" ? "Жинақ құру" : "Создать сбор"}</button>;
  return <form className="panel panel--surface stack" onSubmit={(e) => { e.preventDefault(); submit(); }}>
    <label><span className="label">{t.filters.species}</span><select className="field" value={f.species} onChange={(e) => setF({ ...f, species: e.target.value })}><option value="horse">{locale === "kk" ? "Жылқы" : "Лошадь"}</option><option value="cattle">{locale === "kk" ? "Бұқа" : "Бычок"}</option><option value="camel">{locale === "kk" ? "Түйе" : "Верблюд"}</option><option value="sheep">{locale === "kk" ? "Қой" : "Баран"}</option></select></label>
    <label><span className="label">{t.listing.title}</span><input className="field" value={f.titleRu} onChange={(e) => setF({ ...f, titleRu: e.target.value })} required /></label>
    <label><span className="label">{locale === "kk" ? "Ұша бағасы, ₸" : "Цена туши, ₸"}</span><input className="field" type="number" inputMode="numeric" value={f.totalPriceKzt} onChange={(e) => setF({ ...f, totalPriceKzt: e.target.value })} required /></label>
    <label><span className="label">{t.filters.weight}, {t.common.kg}</span><input className="field" type="number" inputMode="numeric" value={f.carcassWeightKg} onChange={(e) => setF({ ...f, carcassWeightKg: e.target.value })} /></label>
    <label><span className="label">{locale === "kk" ? "Мерзімі" : "Срок сбора"}</span><input className="field" type="datetime-local" value={f.deadline} onChange={(e) => setF({ ...f, deadline: e.target.value })} required /></label>
    <label><span className="label">{t.filters.region}</span><input className="field" value={f.regionCode} onChange={(e) => setF({ ...f, regionCode: e.target.value })} /></label>
    <div className="actions"><button type="button" onClick={() => setOpen(false)} className="btn btn--white">{t.common.cancel}</button><button className="btn">{t.common.publish}</button></div>
  </form>;
}
export default function SogymPage() { return <Suspense><SogymInner /></Suspense>; }
