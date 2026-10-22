"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { useAuth, hasRole } from "@/lib/auth";
/** Очередь модерации: сигналы автопроверок, решения по шаблонам причин, жалобы. */
export default function ModerationPage() {
  const { t, href, lf, money, locale } = useI18n(); const { user } = useAuth();
  const [items, setItems] = useState<any[]>([]); const [reasons, setReasons] = useState<any[]>([]); const [reports, setReports] = useState<any[]>([]); const [comments, setComments] = useState<Record<string, string>>({});
  const load = () => { api("/moderation/queue").then((r) => setItems(r.items)); api("/moderation/reports").then((r) => setReports(r.items)).catch(() => undefined); };
  useEffect(() => { if (hasRole(user, "moderator", "admin")) { load(); api("/reject-reasons").then((r) => setReasons(r.reasons)); } }, [user]);
  if (!hasRole(user, "moderator", "admin")) return <p className="sub">403</p>;
  const decide = async (id: string, decision: "approve" | "reject", reasonCode?: string) => { await api(`/moderation/queue/${id}/decide`, { body: { decision, reasonCode, comment: decision === "reject" ? comments[id] || undefined : undefined } }); load(); };
  const resolve = async (id: string, action: string) => { await api(`/moderation/reports/${id}/resolve`, { body: { status: "resolved", action } }); load(); };
  const signalName: Record<string, string> = { text: locale === "kk" ? "мәтінде байланыс/сілтеме" : "контакты или ссылки в тексте", price_low: locale === "kk" ? "баға тым төмен" : "цена ниже рынка", duplicate_photos: locale === "kk" ? "фото қайталанады" : "дубликаты фото", mass_posting: locale === "kk" ? "жаппай орналастыру" : "массовое размещение", reports: locale === "kk" ? "шағымдар" : "жалобы" };
  return <>
    <h1 className="page-title">{t.moderation.queue}: {items.length}</h1>
    <div className="stack">{items.map((it) => <div key={it.id} className="panel panel--surface">
      <Link href={href(`/listing/${it.listing_id}`)} className="link" style={{ fontWeight: 500 }}>{lf(it, "title")}</Link>
      <p className="sub">{it.kind}, {it.category_code}, {it.price_kzt ? money(it.price_kzt) : "—"}, {it.region_code}. {it.display_name}, {it.phone}, {locale === "kk" ? "сенім" : "доверие"} {it.trust_score}, L{it.verification_level}</p>
      {Object.keys(it.signals ?? {}).length > 0 && <div className="chips" style={{ marginTop: "0.4rem" }}>{Object.keys(it.signals).map((k) => <span key={k} className="mark mark--red">{signalName[k] ?? k}</span>)}</div>}
      <input className="field" style={{ marginTop: "0.6rem" }} placeholder={t.moderation.comment} value={comments[it.id] ?? ""} onChange={(e) => setComments({ ...comments, [it.id]: e.target.value })} aria-label={t.moderation.comment} />
      <div className="chips" style={{ marginTop: "0.6rem" }}><button onClick={() => decide(it.id, "approve")} className="chip chip--ink">{t.moderation.approve}</button>
        <select className="field" style={{ width: "auto", minHeight: "2.75rem", padding: "0.3rem 2.4rem 0.3rem 0.9rem", fontSize: "var(--step-small)" }} defaultValue="" onChange={(e) => e.target.value && decide(it.id, "reject", e.target.value)} aria-label={t.moderation.reject}><option value="">{t.moderation.reject}: {t.moderation.reason}</option>{reasons.map((r) => <option key={r.code} value={r.code}>{locale === "kk" ? r.kk : r.ru}</option>)}</select></div>
    </div>)}{items.length === 0 && <div className="panel panel--surface">{locale === "kk" ? "Кезек бос" : "Очередь пуста"}</div>}</div>
    {reports.length > 0 && <section><h2 className="page-title">{t.listing.actions.report}: {reports.length}</h2><div className="list-rows">{reports.map((r) => <div key={r.id} className="rowline" style={{ flexWrap: "wrap" }}><span style={{ flex: 1 }}><span className="mark mark--red">{r.reason}</span> {r.target_type} <Link className="link" href={href(r.target_type === "listing" ? `/listing/${r.target_id}` : `/users/${r.target_id}`)}>{locale === "kk" ? "ашу" : "открыть"}</Link> {r.comment}</span><span className="chips"><button onClick={() => resolve(r.id, "none")} className="chip">{locale === "kk" ? "Жабу" : "Закрыть"}</button><button onClick={() => resolve(r.id, "archive_listing")} className="chip">{t.listing.status.archived}</button><button onClick={() => resolve(r.id, "block_user")} className="chip">{t.chat.block}</button></span></div>)}</div></section>}
  </>;
}
