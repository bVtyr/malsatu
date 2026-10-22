"use client";
import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { useAuth } from "@/lib/auth";
import { toast } from "@/components/Motion";

/** Тендеры: список требований покупателей, карточка с предложениями (покупатель видит все, продавец — своё), выбор победителя. */
function TendersInner() {
  const { t, lf, money, date, href, locale, name } = useI18n(); const { user } = useAuth(); const router = useRouter(); const sp = useSearchParams();
  const id = sp.get("id");
  const [items, setItems] = useState<any[]>([]); const [cats, setCats] = useState<any[]>([]); const [tn, setTn] = useState<any>(null); const [bids, setBids] = useState<any[]>([]); const [mine, setMine] = useState<any[]>([]);
  const [b, setB] = useState({ priceKzt: "", quantity: "", comment: "", listingId: "" });
  const load = () => api(`/tenders/${id}`).then((r) => { setTn(r.tender); setBids(r.bids); const my = r.bids.find((x: any) => x.seller_id === user?.id); if (my) setB({ priceKzt: String(my.price_kzt), quantity: String(my.quantity), comment: my.comment ?? "", listingId: my.listing_id ?? "" }); else setB((v) => ({ ...v, quantity: v.quantity || String(r.tender.quantity) })); });
  useEffect(() => { api("/categories").then((r) => setCats(r.categories ?? r.items ?? [])).catch(() => undefined); }, []);
  useEffect(() => { if (!id) { setTn(null); api("/tenders").then((r) => setItems(r.items)); } else load(); }, [id, user?.id]);
  useEffect(() => { if (id && user) api("/users/me/listings").then((r) => setMine(r.items.filter((l: any) => l.status === "active"))).catch(() => undefined); }, [id, user?.id]);
  const catName = (code: string) => { const c = cats.find((x) => x.code === code); return c ? name(c) : code; };
  const submitBid = async (e: React.FormEvent) => {
    e.preventDefault(); if (!user) return router.push(href(`/login?next=${encodeURIComponent(`/tenders?id=${id}`)}`));
    try { await api(`/tenders/${id}/bids`, { body: { priceKzt: Number(b.priceKzt), quantity: Number(b.quantity), comment: b.comment || undefined, listingId: b.listingId || undefined } }); toast(t.tender.yourBid); load(); }
    catch (e: any) { toast(e.code === "verification_required" ? t.tender.onlyVerified : e.code); }
  };
  const award = async (bidId: string) => { try { const r = await api(`/tenders/${id}/award`, { body: { bidId } }); toast(t.tender.awarded); if (r.dealId) router.push(href(`/deals/${r.dealId}`)); else load(); } catch (e: any) { toast(e.code); } };
  if (id && tn) {
    const specs = Object.entries(tn.specs ?? {});
    return <>
      <button onClick={() => router.push(href("/tenders"))} className="chip">{t.common.back}</button>
      <h1 className="h-lead">{lf(tn, "title")}</h1>
      <div className={`panel ${tn.status === "open" ? "panel--green" : "panel--surface"}`}>
        <div className="row between"><span className="mark mark--ink">{(t.tender as any)[tn.status]}</span><span className="small">{t.tender.deadline}: <b>{date(tn.deadline)}</b></span></div>
        <div className="line small"><span className="what">{t.filters.species}</span><span className="leader" /><span className="val">{catName(tn.category_code)}</span></div>
        <div className="line small"><span className="what">{t.filters.quantity}</span><span className="leader" /><span className="val">{tn.quantity}</span></div>
        {tn.region_codes?.length > 0 && <div className="line small"><span className="what">{t.filters.region}</span><span className="leader" /><span className="val">{tn.region_codes.join(", ")}</span></div>}
        <div className="line small"><span className="what">{t.tender.bids}</span><span className="leader" /><span className="val">{tn.bidsCount}</span></div>
        {specs.length > 0 && <dl className="kv" style={{ marginTop: "0.6rem" }}>{specs.map(([k, v]) => <Fragment2 key={k} k={k} v={String(v)} />)}</dl>}
      </div>
      {tn.isBuyer && <section className="stack"><h2 className="page-title">{t.tender.bids}: {bids.length}</h2>
        {bids.map((x) => <div key={x.id} className="panel panel--surface row between" style={{ flexWrap: "wrap" }}>
          <span style={{ flex: 1 }}><b style={{ fontWeight: 500 }}>{x.farm_name ?? x.display_name}</b> <span className="small">L{x.verification_level}, ★{x.rating || "—"}, {x.region_code}</span><br /><span className="sub">{money(x.price_kzt)} × {x.quantity}. {x.comment}</span>{x.listing_id && <> <Link className="link small" href={href(`/listing/${x.listing_id}`)}>{t.admin.listings.toLowerCase()}</Link></>}</span>
          {x.status === "won" ? <span className="mark mark--green">{t.auction.winner}</span> : ["open", "closed"].includes(tn.status) && <button onClick={() => award(x.id)} className="chip chip--ink">{t.tender.award}</button>}
        </div>)}
        {bids.length === 0 && <div className="panel panel--surface">{t.common.nothingFound}</div>}
        {["open", "closed"].includes(tn.status) && <button onClick={() => api(`/tenders/${id}/cancel`, { method: "POST", body: {} }).then(load)} className="btn btn--white">{t.common.cancel}</button>}
      </section>}
      {!tn.isBuyer && tn.status === "open" && <form className="panel panel--surface stack" onSubmit={submitBid}>
        <b>{t.tender.yourBid}</b>
        <p className="small">{t.tender.onlyVerified}</p>
        <label><span className="label">{t.listing.price}, ₸</span><input className="field num" type="number" inputMode="numeric" value={b.priceKzt} onChange={(e) => setB({ ...b, priceKzt: e.target.value })} required /></label>
        <label><span className="label">{t.filters.quantity} (≤ {tn.quantity})</span><input className="field num" type="number" inputMode="numeric" min={1} max={tn.quantity} value={b.quantity} onChange={(e) => setB({ ...b, quantity: e.target.value })} required /></label>
        {mine.length > 0 && <label><span className="label">{t.admin.listings}</span><select className="field" value={b.listingId} onChange={(e) => setB({ ...b, listingId: e.target.value })}><option value="">—</option>{mine.map((l) => <option key={l.id} value={l.id}>{lf(l, "title")}</option>)}</select></label>}
        <label><span className="label">{t.moderation.comment}</span><textarea className="field" value={b.comment} onChange={(e) => setB({ ...b, comment: e.target.value })} /></label>
        <button className="btn btn--wide">{t.tender.bid}</button>
        {bids.length > 0 && <button type="button" className="muted-link" onClick={() => api(`/tenders/${id}/bids/withdraw`, { method: "POST", body: {} }).then(load)}>{locale === "kk" ? "Ұсынысты қайтарып алу" : "Отозвать предложение"}</button>}
      </form>}
    </>;
  }
  return <>
    <h1 className="page-title">{t.tender.title}</h1>
    <p>{locale === "kk" ? "Ет комбинаттары, мейрамханалар мен мемлекеттік сатып алушылар талаптарын жариялайды, расталған шаруашылықтар баға ұсынады. Жеңімпаз қауіпсіз мәмілемен жеткізеді." : "Мясокомбинаты, рестораны и госзакупщики публикуют требования, подтверждённые хозяйства предлагают цену. Победитель поставляет через безопасную сделку."}</p>
    <div className="list-rows">{items.map((x) => <button key={x.id} type="button" onClick={() => router.push(href(`/tenders?id=${x.id}`))} className="rowline" style={{ width: "100%", textAlign: "left" }}>
      <span style={{ flex: 1 }}><b style={{ fontWeight: 500 }}>{lf(x, "title")}</b><br /><span className="sub">{catName(x.category_code)}, {x.quantity}. {x.farm_name ?? x.display_name}, L{x.verification_level}. {t.tender.deadline} {date(x.deadline)}</span></span>
      <span className="mark">{x.bids_count} {locale === "kk" ? "ұсыныс" : "предл."}</span>
    </button>)}{items.length === 0 && <div className="panel panel--surface">{t.tender.noTenders}</div>}</div>
    {user && <CreateTender cats={cats} onCreated={() => api("/tenders").then((r) => setItems(r.items))} />}
  </>;
}
function Fragment2({ k, v }: { k: string; v: string }) { return <><dt>{k}</dt><dd>{v}</dd></>; }
function CreateTender({ cats, onCreated }: { cats: any[]; onCreated: () => void }) {
  const { t, locale, name } = useI18n(); const [open, setOpen] = useState(false);
  const [f, setF] = useState({ titleRu: "", categoryCode: "", quantity: "", deadline: "", specs: "", regionCodes: "" });
  const submit = async () => {
    const specs: Record<string, string> = {}; for (const line of f.specs.split("\n")) { const [k, ...rest] = line.split(":"); if (k && rest.length) specs[k.trim().slice(0, 64)] = rest.join(":").trim().slice(0, 500); }
    try { await api("/tenders", { body: { titleRu: f.titleRu, categoryCode: f.categoryCode, quantity: Number(f.quantity), deadline: new Date(f.deadline).toISOString(), specs, regionCodes: f.regionCodes.split(",").map((s) => s.trim()).filter(Boolean) } }); setOpen(false); onCreated(); toast(t.common.publish); }
    catch (e: any) { toast(e.code === "verification_required" ? t.verify.level2 : e.code); }
  };
  if (!open) return <button onClick={() => setOpen(true)} className="btn btn--white btn--wide">{t.tender.create}</button>;
  return <form className="panel panel--surface stack" onSubmit={(e) => { e.preventDefault(); submit(); }}>
    <label><span className="label">{t.listing.title}</span><input className="field" value={f.titleRu} onChange={(e) => setF({ ...f, titleRu: e.target.value })} required minLength={5} placeholder={locale === "kk" ? "Мысалы: 200 бас қой, 45–55 кг, Жамбыл облысы" : "Например: 200 голов баранов, 45–55 кг, Жамбылская область"} /></label>
    <label><span className="label">{t.filters.species}</span><select className="field" value={f.categoryCode} onChange={(e) => setF({ ...f, categoryCode: e.target.value })} required><option value="">—</option>{cats.map((c) => <option key={c.code} value={c.code}>{name(c)}</option>)}</select></label>
    <label><span className="label">{t.filters.quantity}</span><input className="field" type="number" inputMode="numeric" min={1} value={f.quantity} onChange={(e) => setF({ ...f, quantity: e.target.value })} required /></label>
    <label><span className="label">{t.tender.deadline}</span><input className="field" type="datetime-local" value={f.deadline} onChange={(e) => setF({ ...f, deadline: e.target.value })} required /></label>
    <label><span className="label">{t.tender.specs} ({locale === "kk" ? "жол: «талап: мән»" : "строка: «требование: значение»"})</span><textarea className="field" rows={4} value={f.specs} onChange={(e) => setF({ ...f, specs: e.target.value })} placeholder={"вес: 45–55 кг\nвозраст: до 12 мес\nветдокументы: форма 1"} /></label>
    <label><span className="label">{t.filters.region} ({locale === "kk" ? "кодтар үтір арқылы" : "коды через запятую"})</span><input className="field" value={f.regionCodes} onChange={(e) => setF({ ...f, regionCodes: e.target.value })} placeholder="kz-zha, kz-tur" /></label>
    <div className="actions"><button type="button" onClick={() => setOpen(false)} className="btn btn--white">{t.common.cancel}</button><button className="btn">{t.common.publish}</button></div>
  </form>;
}
export default function TendersPage() { return <Suspense><TendersInner /></Suspense>; }
