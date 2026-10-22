"use client";
import { Suspense, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { useAuth } from "@/lib/auth";
import { toast } from "@/components/Motion";

/** Аукционы: список лотов и страница лота — табло цены, таймер, депозит, ставка с автоставкой. Обновление опросом раз в 5 с. */
function AuctionsInner() {
  const { t, lf, money, date, href, locale } = useI18n(); const { user } = useAuth(); const router = useRouter(); const sp = useSearchParams();
  const id = sp.get("id");
  const [items, setItems] = useState<any[]>([]); const [a, setA] = useState<any>(null); const [amount, setAmount] = useState(""); const [maxAuto, setMaxAuto] = useState(""); const [busy, setBusy] = useState(false); const [now, setNow] = useState(Date.now());
  const timer = useRef<ReturnType<typeof setInterval>>(undefined);
  useEffect(() => { if (!id) api("/auctions").then((r) => setItems(r.items)); }, [id]);
  useEffect(() => {
    if (!id) { setA(null); return; }
    const load = () => api(`/auctions/${id}`).then((r) => { setA(r.auction); setAmount((v) => v || String(r.auction.minNextBidKzt)); }).catch((e) => toast(e.code));
    load(); timer.current = setInterval(load, 5000);
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => { clearInterval(timer.current); clearInterval(tick); };
  }, [id]);
  const left = (end: string) => { const ms = new Date(end).getTime() - now; if (ms <= 0) return "0:00"; const h = Math.floor(ms / 3600_000), m = Math.floor((ms % 3600_000) / 60_000), s = Math.floor((ms % 60_000) / 1000); return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}` : `${m}:${String(s).padStart(2, "0")}`; };
  const need = (next: string) => router.push(href(`/login?next=${encodeURIComponent(next)}`));
  const deposit = async () => { if (!user) return need(`/auctions?id=${id}`); setBusy(true); try { const r = await api(`/auctions/${id}/deposit`, { method: "POST", body: {} }); if (r.payUrl) { window.location.href = r.payUrl; return; } toast(t.auction.deposit + ": " + r.status); setA({ ...a, depositStatus: r.status }); } catch (e: any) { toast(e.code); } finally { setBusy(false); } };
  const bid = async (e: React.FormEvent) => {
    e.preventDefault(); if (!user) return need(`/auctions?id=${id}`); setBusy(true);
    try { const r = await api(`/auctions/${id}/bid`, { body: { amountKzt: Number(amount), maxAutoKzt: maxAuto ? Number(maxAuto) : undefined } }); setA({ ...a, ...r.auction }); setAmount(String(r.auction.minNextBidKzt)); toast(r.youLead ? t.auction.youLead : t.auction.outbid); }
    catch (e: any) { toast(e.code === "deposit_required" ? t.auction.deposit : e.code); } finally { setBusy(false); }
  };
  if (id && a) {
    const live = a.status === "live"; const statusLabel = (t.auction as any)[a.status];
    return <>
      <button onClick={() => router.push(href("/auctions"))} className="chip">{t.common.back}</button>
      <h1 className="h-lead"><Link className="link" href={href(`/listing/${a.listing_id}`)}>{lf(a.listing ?? a, "title")}</Link></h1>
      <div className={`panel ${live ? "panel--yellow" : "panel--surface"}`}>
        <div className="row between"><span className="mark mark--ink">{statusLabel}</span><b className="num" style={{ fontSize: "1.6rem" }} aria-live="polite">{live ? left(a.ends_at) : date(a.ends_at)}</b></div>
        <div style={{ marginTop: "0.6rem" }}><span className="small">{a.currentPriceKzt ? t.auction.currentPrice : t.auction.minBid}</span><div className="display" style={{ fontSize: "clamp(2rem, 8vw, 3.2rem)", lineHeight: 1 }} aria-live="polite">{money(a.currentPriceKzt ?? a.start_price_kzt)}</div></div>
        <div className="line small"><span className="what">{t.auction.bids}</span><span className="leader" /><span className="val">{a.bidsCount}</span></div>
        <div className="line small"><span className="what">{locale === "kk" ? "Қадам" : "Шаг"}</span><span className="leader" /><span className="val">{money(a.bid_step_kzt)}</span></div>
        {a.deposit_kzt > 0 && <div className="line small"><span className="what">{t.auction.deposit}</span><span className="leader" /><span className="val">{money(a.deposit_kzt)}</span></div>}
        <div className="line small"><span className="what">{t.auction.extension}</span><span className="leader" /><span className="val">{a.extension_minutes} {locale === "kk" ? "мин" : "мин"}</span></div>
        {a.leaderIsYou && <p className="mark mark--green" style={{ marginTop: "0.6rem" }}>{t.auction.youLead}</p>}
      </div>
      {live && !a.isOwner && <>
        {a.depositStatus !== "held" && <button type="button" disabled={busy} onClick={deposit} className="btn btn--ink btn--wide">{t.auction.payDeposit}{a.deposit_kzt > 0 ? `: ${money(a.deposit_kzt)}` : ""}</button>}
        <form className="panel panel--surface stack" onSubmit={bid}>
          <label><span className="label">{t.auction.yourBid} (≥ {money(a.minNextBidKzt)})</span><input className="field num" type="number" inputMode="numeric" min={a.minNextBidKzt} step={a.bid_step_kzt} value={amount} onChange={(e) => setAmount(e.target.value)} required /></label>
          <label><span className="label">{t.auction.autoBid}</span><input className="field num" type="number" inputMode="numeric" min={amount || 0} value={maxAuto} onChange={(e) => setMaxAuto(e.target.value)} placeholder={locale === "kk" ? "міндетті емес" : "необязательно"} /></label>
          <button className="btn btn--wide" disabled={busy || a.depositStatus !== "held"}>{t.auction.bid}</button>
          {a.myMaxAutoKzt && <p className="small">{t.auction.autoBid}: {money(a.myMaxAutoKzt)}</p>}
        </form>
      </>}
      {a.status === "ended" && <div className="panel panel--green"><b>{t.auction.ended}</b>{a.leaderIsYou && <p className="small">{locale === "kk" ? "Сіз жеңдіңіз. Кабинеттегі «Ұсыныстар» бөлімінде 48 сағат ішінде қауіпсіз мәміле рәсімдеңіз." : "Вы победили. Оформите безопасную сделку в кабинете, вкладка «Предложения», в течение 48 часов."}</p>}</div>}
      <div className="lines">{a.bids.map((b: any, i: number) => <div key={i} className={`line small${b.mine ? " is-mine" : ""}`}><span className="what">{b.mine ? t.auction.yourBid : t.auction.bids}</span><span className="leader" /><span className="val num">{money(b.amountKzt)} · {new Date(b.at).toLocaleTimeString(locale === "kk" ? "kk-KZ" : "ru-KZ", { hour: "2-digit", minute: "2-digit" })}</span></div>)}</div>
      {a.stream_url && <a className="btn btn--white btn--wide" href={a.stream_url} target="_blank" rel="noopener noreferrer">{locale === "kk" ? "Тікелей эфир" : "Прямая трансляция"}</a>}
    </>;
  }
  return <>
    <h1 className="page-title">{t.auction.title}</h1>
    <p>{locale === "kk" ? "Асыл тұқымды мал, жылқы мен түйе: бастапқы баға, қадам, соңғы минуттарда ұзарту. Қатысу үшін кепілдік төленеді, жеңімпаз 48 сағат ішінде қауіпсіз мәміле жасайды." : "Племенной скот, лошади и верблюды: стартовая цена, шаг, продление при ставке в последние минуты. Для участия вносится депозит, победитель оформляет безопасную сделку за 48 часов."}</p>
    <div className="list-rows">{items.map((x) => <button key={x.id} type="button" onClick={() => router.push(href(`/auctions?id=${x.id}`))} className="rowline" style={{ width: "100%", textAlign: "left" }}>
      <span style={{ flex: 1 }}><b style={{ fontWeight: 500 }}>{lf(x, "title")}</b><br /><span className="sub">{x.quantity} {locale === "kk" ? "бас" : "гол."}, {x.top_region_code}. {x.status === "live" ? `${t.auction.endsAt} ${left(x.ends_at)}` : `${t.auction.scheduled}: ${date(x.starts_at)}`}</span></span>
      <span style={{ textAlign: "right" }}><b className="num">{money(x.current_price_kzt ?? x.start_price_kzt)}</b><br /><span className={`mark ${x.status === "live" ? "mark--yellow" : ""}`}>{(t.auction as any)[x.status]}</span></span>
    </button>)}{items.length === 0 && <div className="panel panel--surface">{t.auction.noAuctions}</div>}</div>
    {user && <CreateAuction onCreated={() => api("/auctions").then((r) => setItems(r.items))} />}
  </>;
}
function CreateAuction({ onCreated }: { onCreated: () => void }) {
  const { t, lf, locale } = useI18n(); const [open, setOpen] = useState(false); const [mine, setMine] = useState<any[]>([]);
  const [f, setF] = useState({ listingId: "", startPriceKzt: "", bidStepKzt: "", depositKzt: "", startsAt: "", endsAt: "", extensionMinutes: "5" });
  useEffect(() => { if (open) api("/users/me/listings").then((r) => setMine(r.items.filter((l: any) => l.status === "active" && l.kind === "livestock"))); }, [open]);
  const submit = async () => { try { await api("/auctions", { body: { listingId: f.listingId, startPriceKzt: Number(f.startPriceKzt), bidStepKzt: Number(f.bidStepKzt), depositKzt: Number(f.depositKzt || 0), startsAt: new Date(f.startsAt).toISOString(), endsAt: new Date(f.endsAt).toISOString(), extensionMinutes: Number(f.extensionMinutes) } }); setOpen(false); onCreated(); toast(t.common.publish); } catch (e: any) { toast(e.code === "verification_required" ? t.verify.level2 : e.code); } };
  if (!open) return <button onClick={() => setOpen(true)} className="btn btn--white btn--wide">{t.auction.create}</button>;
  return <form className="panel panel--surface stack" onSubmit={(e) => { e.preventDefault(); submit(); }}>
    <label><span className="label">{t.admin.listings}</span><select className="field" value={f.listingId} onChange={(e) => setF({ ...f, listingId: e.target.value })} required><option value="">—</option>{mine.map((l) => <option key={l.id} value={l.id}>{lf(l, "title")}</option>)}</select></label>
    <label><span className="label">{locale === "kk" ? "Бастапқы баға, ₸" : "Стартовая цена, ₸"}</span><input className="field" type="number" inputMode="numeric" value={f.startPriceKzt} onChange={(e) => setF({ ...f, startPriceKzt: e.target.value })} required /></label>
    <label><span className="label">{locale === "kk" ? "Қадам, ₸" : "Шаг, ₸"}</span><input className="field" type="number" inputMode="numeric" value={f.bidStepKzt} onChange={(e) => setF({ ...f, bidStepKzt: e.target.value })} required /></label>
    <label><span className="label">{t.auction.deposit}, ₸</span><input className="field" type="number" inputMode="numeric" value={f.depositKzt} onChange={(e) => setF({ ...f, depositKzt: e.target.value })} /></label>
    <label><span className="label">{locale === "kk" ? "Басталуы" : "Начало"}</span><input className="field" type="datetime-local" value={f.startsAt} onChange={(e) => setF({ ...f, startsAt: e.target.value })} required /></label>
    <label><span className="label">{t.auction.endsAt}</span><input className="field" type="datetime-local" value={f.endsAt} onChange={(e) => setF({ ...f, endsAt: e.target.value })} required /></label>
    <label><span className="label">{t.auction.extension}, {locale === "kk" ? "мин" : "мин"}</span><input className="field" type="number" inputMode="numeric" min={0} max={60} value={f.extensionMinutes} onChange={(e) => setF({ ...f, extensionMinutes: e.target.value })} /></label>
    <div className="actions"><button type="button" onClick={() => setOpen(false)} className="btn btn--white">{t.common.cancel}</button><button className="btn">{t.common.publish}</button></div>
  </form>;
}
export default function AuctionsPage() { return <Suspense><AuctionsInner /></Suspense>; }
