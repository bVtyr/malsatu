"use client";
import { Fragment, use, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { useAuth } from "@/lib/auth";

const FLOW = ["created", "paid", "preparing", "in_transit", "inspection", "confirmed", "completed"];
/** Сделка: статус полем, шаги квитанцией, суммы листом, действия по роли, спор, отзыв. */
export default function DealPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params); const { t, money, date, locale } = useI18n(); const { user } = useAuth();
  const [d, setD] = useState<any>(null); const [err, setErr] = useState<string | null>(null); const [dispute, setDispute] = useState<{ open: boolean; reason: string }>({ open: false, reason: "" });
  const load = () => api(`/deals/${id}`).then(setD).catch((e) => setErr(e.code));
  useEffect(() => { if (user) load(); }, [user, id]);
  if (!d) return <p>{err ?? t.common.loading}</p>;
  const deal = d.deal; const isBuyer = deal.buyer_id === user?.id; const isSeller = deal.seller_id === user?.id;
  const act = async (action: string, comment?: string) => { try { if (action === "pay") { const r = await api(`/deals/${id}/pay`, { method: "POST", body: {} }); if (r.payUrl) { window.location.href = r.payUrl; return; } } else await api(`/deals/${id}/action`, { body: { action, comment } }); setDispute({ open: false, reason: "" }); await load(); } catch (e: any) { setErr(e.code); } };
  const idx = FLOW.indexOf(deal.status);
  const buttons: Array<[string, string, boolean, string]> = [
    ["pay", locale === "kk" ? "Төлеу" : "Оплатить", isBuyer && deal.status === "created" && deal.mode !== "direct", "btn"],
    ["start_preparing", locale === "kk" ? "Дайындауды бастау" : "Начать подготовку", isSeller && deal.status === "paid", "btn btn--ink"],
    ["ship", locale === "kk" ? "Жолға шықты" : "Отправлено", isSeller && deal.status === "preparing", "btn btn--ink"],
    ["arrive", locale === "kk" ? "Жеткізілді, тексеру" : "Доставлено, осмотр", (isSeller || isBuyer) && ["preparing", "in_transit"].includes(deal.status), "btn btn--ink"],
    ["confirm", locale === "kk" ? "Алғанымды растаймын" : "Подтвердить получение", isBuyer && deal.status === "inspection", "btn btn--green"],
    ["open_dispute", locale === "kk" ? "Дау ашу" : "Открыть спор с фото", isBuyer && ["paid", "preparing", "in_transit", "inspection"].includes(deal.status), "btn btn--white"],
    ["cancel", t.common.cancel, (isBuyer && deal.status === "created") || (isSeller && ["created", "paid", "preparing"].includes(deal.status)), "btn btn--white"],
  ];
  const modeName = deal.mode === "escrow" ? t.listing.actions.escrow : deal.mode === "reservation" ? t.listing.actions.reserve : (locale === "kk" ? "Тікелей мәміле" : "Прямая сделка");
  const ended = ["cancelled", "disputed", "refunded", "partially_refunded", "released_to_seller"].includes(deal.status);
  return (
    <>
      <div className={`panel ${ended ? "panel--red" : "panel--green"}`}><div className="deal-sum"><div><span className="small">{modeName}</span><div className="h-lead" style={{ marginTop: "0.2rem" }}>{(t.deal.status as any)[deal.status]}</div></div><b>{money(deal.amount_kzt)}</b></div>
        {deal.status === "inspection" && isBuyer && <p className="small" style={{ marginTop: "0.6rem", maxWidth: "none" }}>{locale === "kk" ? `Ақша платформада. Малды тексеріп, сырғаларды салыстырыңыз. ${deal.inspection_window_hours} сағат өткен соң мәміле өздігінен расталады.` : `Деньги у платформы. Осмотрите животных и сверьте бирки. Через ${deal.inspection_window_hours} ч сделка подтвердится сама.`}</p>}
      </div>
      <div className="steps" aria-hidden="true">{FLOW.map((s, i) => <span key={s} className={i < idx ? "is-done" : i === idx ? "is-now" : ""} />)}</div>
      <div>
        {d.events.map((e: any) => <div key={e.id} className="line small"><span className="what">{(t.deal.status as any)[e.to_status]}{e.comment ? `: ${e.comment}` : ""}</span><span className="leader" /><span className="val">{date(e.created_at)}</span></div>)}
      </div>
      <dl className="kv panel panel--surface">
        <dt>{t.filters.quantity}</dt><dd>{deal.quantity} × {money(deal.unit_price_kzt)}</dd>
        <dt>{locale === "kk" ? "Сомасы" : "Сумма"}</dt><dd>{money(deal.amount_kzt)}</dd>
        {deal.mode === "reservation" && <><dt>{locale === "kk" ? "Алдын ала төлем" : "Предоплата"}</dt><dd>{money(deal.prepayment_kzt)}</dd></>}
        {isSeller && <><dt>{locale === "kk" ? "Платформа комиссиясы" : "Комиссия платформы"}</dt><dd>{money(deal.commission_kzt)}</dd></>}
        <dt>{locale === "kk" ? "Тексеру терезесі" : "Окно осмотра"}</dt><dd>{deal.inspection_window_hours} ч</dd>
        <dt>{t.listing.delivery}</dt><dd>{deal.delivery_option}</dd>
        {d.vetReports?.map((v: any) => <Fragment key={v.id}><dt>{t.listing.actions.vet}</dt><dd>{v.conclusion ?? v.status}</dd></Fragment>)}
      </dl>
      <div className="actions">{buttons.filter(([, , ok]) => ok).map(([a, label, , cls]) => <button key={a} type="button" onClick={() => (a === "open_dispute" ? setDispute({ open: true, reason: "" }) : act(a))} className={`${cls} span-2`}>{label}</button>)}</div>
      {dispute.open && <form className="panel panel--red inline-form" onSubmit={(e) => { e.preventDefault(); if (dispute.reason.trim().length >= 10) act("open_dispute", dispute.reason.trim()); }}>
        <label className="label" htmlFor="dispute-reason">{locale === "kk" ? "Дау себебі (кемінде 10 таңба)" : "Причина спора (минимум 10 символов)"}</label>
        <textarea id="dispute-reason" className="field" required minLength={10} value={dispute.reason} onChange={(e) => setDispute({ ...dispute, reason: e.target.value })} placeholder={locale === "kk" ? "Не сәйкес келмеді: салмағы, саны, күйі…" : "Что не так: вес, количество, состояние…"} />
        <div className="actions"><button type="button" className="btn btn--white" onClick={() => setDispute({ open: false, reason: "" })}>{t.common.cancel}</button><button className="btn btn--ink" disabled={dispute.reason.trim().length < 10}>{t.deal.status.disputed}</button></div>
      </form>}
      {err && <p className="text-red small">{err}</p>}
      {d.dispute && <div className="panel panel--surface"><b>{t.deal.status.disputed}: {d.dispute.status}</b><p className="small">{d.dispute.reason}{d.dispute.resolution ? `. ${d.dispute.resolution}${d.dispute.refund_kzt ? `, ${money(d.dispute.refund_kzt)}` : ""}` : ""}</p></div>}
      {deal.status === "completed" && <ReviewForm dealId={id} />}
    </>
  );
}
function ReviewForm({ dealId }: { dealId: string }) {
  const { t, locale } = useI18n(); const [s, setS] = useState(5); const [text, setText] = useState(""); const [done, setDone] = useState(false);
  if (done) return <div className="panel panel--surface">{t.common.verified}</div>;
  return <form className="panel panel--surface stack" onSubmit={async (e) => { e.preventDefault(); await api(`/deals/${dealId}/review`, { body: { scoreOverall: s, text } }); setDone(true); }}>
    <b>{locale === "kk" ? "Пікір қалдыру" : "Оставить отзыв"}</b>
    <div className="chips">{[1, 2, 3, 4, 5].map((n) => <button key={n} type="button" onClick={() => setS(n)} className="chip" aria-pressed={n <= s}>{n}</button>)}</div>
    <textarea className="field" value={text} onChange={(e) => setText(e.target.value)} placeholder={locale === "kk" ? "Сипаттамаға сәйкестігі, малдың күйі, уақыт, қарым-қатынас" : "Соответствие описанию, состояние животных, пунктуальность, общение"} />
    <button className="btn">{t.common.publish}</button>
  </form>;
}
