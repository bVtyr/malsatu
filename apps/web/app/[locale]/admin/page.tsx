"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { useAuth, hasRole } from "@/lib/auth";
/** Админ: дашборд (пользователи, объявления, сделки, GMV, выручка), разбивка по регионам и категориям, воронка, пользователи. */
export default function AdminPage() {
  const { t, money, href, locale } = useI18n(); const { user } = useAuth();
  const [d, setD] = useState<any>(null); const [days, setDays] = useState(30); const [users, setUsers] = useState<any[]>([]); const [q, setQ] = useState("");
  useEffect(() => { if (hasRole(user, "admin", "moderator", "arbiter", "finance")) api("/admin/dashboard", { query: { days } }).then(setD); }, [user, days]);
  useEffect(() => { if (hasRole(user, "admin", "moderator")) api("/admin/users", { query: { q } }).then((r) => setUsers(r.items)).catch(() => undefined); }, [user, q]);
  if (!hasRole(user, "admin", "moderator", "arbiter", "finance")) return <p className="sub">403</p>;
  const block = async (id: string, isBlocked: boolean) => { await api(`/admin/users/${id}`, { method: "PATCH", body: { isBlocked: !isBlocked, blockedReason: "admin" } }); api("/admin/users", { query: { q } }).then((r) => setUsers(r.items)); };
  return <>
    <div className="chips"><Link href={href("/admin/moderation")} className="chip">{t.moderation.queue}</Link><Link href={href("/admin/quarantine")} className="chip">{t.admin.quarantine}</Link>{[7, 30, 90].map((n) => <button key={n} onClick={() => setDays(n)} className="chip" aria-pressed={days === n}>{n} {locale === "kk" ? "күн" : "дн."}</button>)}</div>
    {d && <>
      <div className="admin-stats">
        <div><b>{d.users.total}</b><span>{t.admin.users}, +{d.users.new_}</span></div>
        <div><b>{d.listings.active}</b><span>{t.admin.listings}, {d.listings.pending} {locale === "kk" ? "модерацияда" : "на модерации"}</span></div>
        <div><b>{d.deals.count}</b><span>{t.admin.deals}, {d.deals.completed} {locale === "kk" ? "аяқталды" : "завершено"}</span></div>
        <div><b>{money(d.deals.gmv)}</b><span>{t.admin.gmv}</span></div>
        <div><b>{money(d.deals.revenue)}</b><span>{t.admin.revenue}</span></div>
        <div><b>{d.funnel.listing_view ?? 0} → {(d.funnel.call ?? 0) + (d.funnel.message ?? 0)} → {d.funnel.deal_created ?? 0}</b><span>{locale === "kk" ? "қарау → байланыс → мәміле" : "просмотр → контакт → сделка"}</span></div>
      </div>
      <h2 className="page-title">{t.admin.regions}</h2>
      <div className="price-rows">{d.byRegion.slice(0, 12).map((r: any) => <div key={r.region} className="line small"><span className="what">{r.region}</span><span className="leader" /><span className="val">{r.listings} / {r.deals} / {money(r.gmv)}</span></div>)}</div>
      <h2 className="page-title">{t.admin.categories}</h2>
      <div className="price-rows">{d.byCategory.slice(0, 12).map((r: any) => <div key={r.category} className="line small"><span className="what">{r.category}</span><span className="leader" /><span className="val">{r.listings} / {money(r.gmv)}</span></div>)}</div>
    </>}
    {hasRole(user, "admin", "moderator") && <section><h2 className="page-title">{t.admin.users}</h2><input className="field" placeholder="+7 / имя" value={q} onChange={(e) => setQ(e.target.value)} aria-label={t.common.search} style={{ marginTop: "0.6rem" }} />
      <div className="list-rows">{users.map((u) => <div key={u.id} className="rowline"><span style={{ flex: 1 }}><b style={{ fontWeight: 500 }}>{u.farm_name ?? u.display_name ?? "—"}</b> <span className="sub">{u.phone}</span><br /><span className="sub">{u.roles.join(", ")}, L{u.verification_level}, {locale === "kk" ? "сенім" : "доверие"} {u.trust_score}</span></span>{hasRole(user, "admin") && <button onClick={() => block(u.id, u.is_blocked)} className="chip" aria-pressed={u.is_blocked}>{u.is_blocked ? (locale === "kk" ? "Ашу" : "Разблокировать") : (locale === "kk" ? "Бұғаттау" : "Заблокировать")}</button>}</div>)}</div></section>}
  </>;
}
