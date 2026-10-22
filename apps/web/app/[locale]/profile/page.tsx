"use client";
import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { useAuth, hasRole } from "@/lib/auth";
import { listDrafts, syncDrafts, type Draft } from "@/lib/offline";
import { submitDraft } from "@/components/wizard/submit";
import { ListingCard, VerifiedMark } from "@/components/ListingCard";

/** Кабинет: объявления (с офлайн-черновиками и статистикой), сделки, офферы, сохранённые поиски, складчины, настройки. */
function ProfileInner() {
  const { t, href, lf, money, date, locale } = useI18n(); const { user, loading, logout, refresh } = useAuth(); const router = useRouter(); const sp = useSearchParams();
  const tab = sp.get("tab") ?? "listings";
  const [listings, setListings] = useState<any[]>([]); const [drafts, setDrafts] = useState<Draft[]>([]); const [deals, setDeals] = useState<any[]>([]); const [offers, setOffers] = useState<any[]>([]); const [saved, setSaved] = useState<any[]>([]); const [shares, setShares] = useState<any[]>([]); const [stats, setStats] = useState<Record<string, any>>({});
  useEffect(() => { if (!loading && !user) router.replace(href("/login?next=/profile")); }, [user, loading]);
  useEffect(() => {
    if (!user) return;
    if (tab === "listings") { api("/users/me/listings").then((r) => { setListings(r.items); setStats(Object.fromEntries(r.items.map((l: any) => [l.id, l.stats]))); }); listDrafts(user.id).then(setDrafts).catch(() => undefined); }
    if (tab === "deals") api("/deals").then((r) => setDeals(r.items));
    if (tab === "offers") api("/offers").then((r) => setOffers(r.items));
    if (tab === "saved") api("/saved-searches").then((r) => setSaved(r.items));
    if (tab === "sogym") api("/users/me/pool-shares").then((r) => setShares(r.items));
  }, [user, tab]);
  if (!user) return null;
  const [soldFor, setSoldFor] = useState<{ id: string; qty: string } | null>(null);
  const setStatus = async (id: string, status: string, soldQty?: number) => { await api(`/listings/${id}/status`, { body: { status, soldQty } }); setSoldFor(null); api("/users/me/listings").then((r) => setListings(r.items)); };
  const act = async (id: string, action: string) => { await api(`/offers/${id}`, { body: { action } }); api("/offers").then((r) => setOffers(r.items)); };
  const tabs = [["listings", t.admin.listings], ["deals", t.admin.deals], ["offers", t.offer.title], ["saved", t.filters.saveSearch], ["sogym", t.home.sogym], ["settings", locale === "kk" ? "Баптаулар" : "Настройки"]];
  return (
    <>
      <div className="profile-head"><span className="avatar">{(user.farmName ?? user.displayName ?? user.phone)[0]}</span><span><b>{user.farmName ?? user.displayName ?? user.phone}</b><span>{(t.verification as any)[`level${user.verificationLevel}`]}</span></span></div>
      <div className="stat-row"><span><b>{user.dealsCount}</b> {t.admin.deals.toLowerCase()}</span><span><b>{user.rating || "—"}</b> {locale === "kk" ? "рейтинг" : "рейтинг"}</span><span><b>{user.trustScore}</b> {locale === "kk" ? "сенім" : "доверие"}</span><button onClick={async () => { await logout(); router.push(href("/")); }} className="muted-link">{t.auth.logout}</button></div>
      {user.verificationLevel < 2 && <div className="panel panel--surface small">{locale === "kk" ? "ЖСН/БСН растаңыз: сенім деңгейі мен лимиттер өседі." : "Подтвердите ИИН/БИН: вырастут уровень доверия и лимиты объявлений."}</div>}
      <div className="chips chips--scroll">{tabs.map(([k, label]) => <Link key={k} href={href(`/profile?tab=${k}`)} className="chip" aria-current={tab === k ? "page" : undefined}>{label}</Link>)}</div>

      {tab === "listings" && <div className="stack">
        {drafts.filter((d) => d.status !== "sent").map((d) => <div key={d.clientDraftId} className="panel panel--surface row between"><span><b>{d.payload.titleRu ?? d.payload.titleKk}</b><br /><span className="small">{d.status === "error" ? d.error : (locale === "kk" ? "телефондағы жоба, желі пайда болғанда жіберіледі" : "черновик в телефоне, уйдёт при появлении сети")}</span></span><button onClick={() => syncDrafts(submitDraft, user.id).then(() => listDrafts(user.id).then(setDrafts))} className="chip">{locale === "kk" ? "Жіберу" : "Отправить"}</button></div>)}
        {listings.map((l) => <div key={l.id} className="list">
          <ListingCard l={l} />
          <div className="stat-row" style={{ padding: "0.4rem 0.75rem" }}><span className="mark">{(t.listing.status as any)[l.status]}</span>{stats[l.id] && <><span><b>{stats[l.id].views}</b> {locale === "kk" ? "қаралды" : "просмотров"}</span><span><b>{stats[l.id].calls}</b> {locale === "kk" ? "қоңырау" : "звонков"}</span><span><b>{stats[l.id].messages}</b> {locale === "kk" ? "хабарлама" : "сообщений"}</span><span><b>{stats[l.id].offers}</b> {locale === "kk" ? "ұсыныс" : "офферов"}</span><span><b>{stats[l.id].conversion} %</b></span></>}{l.expires_at && <span>{t.listing.expires} {date(l.expires_at)}</span>}</div>
          <div className="chips" style={{ padding: "0 0.75rem 0.75rem" }}>
            {["draft", "rejected", "expired"].includes(l.status) && <button onClick={() => setStatus(l.id, "active")} className="chip chip--ink">{t.common.publish}</button>}
            {l.status === "active" && <button onClick={() => setStatus(l.id, "reserved")} className="chip">{t.listing.status.reserved}</button>}
            {["active", "reserved"].includes(l.status) && <button onClick={() => setSoldFor({ id: l.id, qty: "" })} className="chip">{t.listing.status.sold}</button>}
            {soldFor?.id === l.id && <form className="row" onSubmit={(e) => { e.preventDefault(); setStatus(l.id, "sold", soldFor.qty ? Number(soldFor.qty) : undefined); }}><input className="field" style={{ width: "8rem", minHeight: 40 }} type="number" inputMode="numeric" min={1} max={l.quantity} placeholder={locale === "kk" ? "бас саны" : "голов"} value={soldFor.qty} onChange={(e) => setSoldFor({ id: l.id, qty: e.target.value })} aria-label={t.filters.quantity} /><button className="chip chip--ink">{t.common.save}</button><button type="button" className="chip" onClick={() => setSoldFor(null)}>{t.common.cancel}</button></form>}
            {["active", "expired"].includes(l.status) && <button onClick={() => api(`/listings/${l.id}/extend`, { method: "POST", body: {} }).then(() => api("/users/me/listings").then((r) => setListings(r.items)))} className="chip">{t.listing.extend}</button>}
            {l.status !== "archived" && <button onClick={() => setStatus(l.id, "archived")} className="chip">{t.listing.status.archived}</button>}
            {l.reject_comment && <span className="small text-red">{l.reject_reason_code}: {l.reject_comment}</span>}
          </div>
        </div>)}
        <Link href={href("/new")} className="btn btn--wide">{t.listing.new}</Link>
      </div>}

      {tab === "deals" && <div className="list-rows">{deals.map((d) => <Link key={d.id} href={href(`/deals/${d.id}`)} className="rowline"><span style={{ flex: 1 }}><b style={{ fontWeight: 500 }}>{lf(d, "title")}</b><br /><span className="sub">{d.mode}, {d.quantity}, {date(d.created_at)}</span></span><span style={{ textAlign: "right" }}><b className="num">{money(d.amount_kzt)}</b><br /><span className="mark">{(t.deal.status as any)[d.status]}</span></span></Link>)}{deals.length === 0 && <div className="panel panel--surface">{t.common.nothingFound}</div>}</div>}

      {tab === "offers" && <div className="list-rows">{offers.map((o) => <div key={o.id} className="rowline" style={{ flexWrap: "wrap" }}><span style={{ flex: 1 }}><b style={{ fontWeight: 500 }}>{lf(o, "title")}</b><br /><span className="sub">{money(o.price_kzt)} × {o.quantity}. {(t.offer as any)[o.status]}</span></span>
        {o.status === "pending" && o.seller_id === user.id && <span className="chips"><button onClick={() => act(o.id, "accept")} className="chip chip--ink">{t.offer.accept}</button><button onClick={() => act(o.id, "reject")} className="chip">{t.offer.reject}</button></span>}
        {o.status === "accepted" && o.buyer_id === user.id && <button onClick={async () => { const r = await api("/deals", { body: { listingId: o.listing_id, mode: "escrow", quantity: o.quantity, offerId: o.id } }); router.push(href(`/deals/${r.deal.id}`)); }} className="chip chip--ink">{t.listing.actions.escrow}</button>}</div>)}{offers.length === 0 && <div className="panel panel--surface">{t.common.nothingFound}</div>}</div>}

      {tab === "saved" && <div className="list-rows">{saved.map((s) => <div key={s.id} className="rowline"><Link href={href(`/search?${new URLSearchParams(s.query as any)}`)} className="link" style={{ flex: 1 }}>{s.name}</Link><button onClick={() => api(`/saved-searches/${s.id}`, { method: "DELETE" }).then(() => setSaved(saved.filter((x) => x.id !== s.id)))} className="chip">{t.common.delete}</button></div>)}{saved.length === 0 && <div className="panel panel--surface">{t.common.nothingFound}</div>}</div>}

      {tab === "sogym" && <div className="list-rows">{shares.map((s) => <Link key={s.id} href={href(`/sogym?pool=${s.pool_id}`)} className="rowline"><span style={{ flex: 1 }}><b style={{ fontWeight: 500 }}>{lf(s, "title")}</b><br /><span className="sub">{s.units}/8, {money(s.amount_kzt)}, {s.status}, {s.pool_status}</span></span></Link>)}{shares.length === 0 && <div className="panel panel--surface">{t.common.nothingFound}</div>}</div>}

      {tab === "settings" && <Settings onSaved={refresh} />}
      {hasRole(user, "carrier") && <Link href={href("/transport")} className="btn btn--white btn--wide">{t.listing.platformCarrier}</Link>}
    </>
  );
}
function Settings({ onSaved }: { onSaved: () => Promise<void> }) {
  const { t, locale } = useI18n(); const { user } = useAuth();
  const [p, setP] = useState({ displayName: user?.displayName ?? "", farmName: user?.farmName ?? "", accountType: user?.accountType ?? "individual", about: "" });
  const [ns, setNs] = useState<any>({ quietFrom: "", quietTo: "" }); const [ok, setOk] = useState(false);
  useEffect(() => { api("/notifications/settings").then((r) => setNs({ quietFrom: r.settings?.quiet_from?.slice(0, 5) ?? "", quietTo: r.settings?.quiet_to?.slice(0, 5) ?? "" })); }, []);
  const save = async () => { await api("/users/me", { method: "PATCH", body: { displayName: p.displayName, farmName: p.farmName, accountType: p.accountType, about: p.about || undefined } }); await api("/notifications/settings", { method: "PUT", body: { quietFrom: ns.quietFrom || null, quietTo: ns.quietTo || null } }); await onSaved(); setOk(true); };
  const [confirmDel, setConfirmDel] = useState(false);
  const del = async () => { if (!confirmDel) { setConfirmDel(true); return; } await api("/users/me", { method: "DELETE" }); location.href = "/"; };
  const exportData = async () => { const d = await api("/users/me/export"); const b = new Blob([JSON.stringify(d, null, 2)], { type: "application/json" }); const a = document.createElement("a"); a.href = URL.createObjectURL(b); a.download = "malsatu-export.json"; a.click(); };
  return <form className="stack" onSubmit={(e) => { e.preventDefault(); save(); }}>
    <label><span className="label">{t.auth.name}</span><input className="field" value={p.displayName} onChange={(e) => setP({ ...p, displayName: e.target.value })} /></label>
    <label><span className="label">{locale === "kk" ? "Шаруашылық" : "Хозяйство"}</span><input className="field" value={p.farmName} onChange={(e) => setP({ ...p, farmName: e.target.value })} /></label>
    <label><span className="label">{t.auth.accountType}</span><select className="field" value={p.accountType} onChange={(e) => setP({ ...p, accountType: e.target.value })}><option value="individual">{t.auth.individual}</option><option value="ip">{t.auth.ip}</option><option value="kh">{t.auth.kh}</option><option value="too">{t.auth.too}</option></select></label>
    <label><span className="label">{locale === "kk" ? "Шаруашылық туралы" : "О хозяйстве"}</span><textarea className="field" value={p.about} onChange={(e) => setP({ ...p, about: e.target.value })} /></label>
    <span className="label">{locale === "kk" ? "Тыныш сағаттар" : "Тихие часы"}</span>
    <div className="actions"><input className="field" type="time" value={ns.quietFrom} onChange={(e) => setNs({ ...ns, quietFrom: e.target.value })} aria-label={t.common.from} /><input className="field" type="time" value={ns.quietTo} onChange={(e) => setNs({ ...ns, quietTo: e.target.value })} aria-label={t.common.to} /></div>
    <button className="btn btn--wide">{ok ? t.common.verified : t.common.save}</button>
    <div className="actions"><button type="button" onClick={exportData} className="btn btn--white">{locale === "kk" ? "Деректерді жүктеу" : "Скачать данные"}</button><button type="button" onClick={del} className={`btn ${confirmDel ? "btn--ink" : "btn--white"} text-red`}>{confirmDel ? (locale === "kk" ? "Иә, жою" : "Да, удалить навсегда") : t.common.delete}</button></div>
    {confirmDel && <p className="small text-red">{locale === "kk" ? "Хабарландырулар мұрағатталады, деректер анонимделеді. Қайтару мүмкін емес." : "Объявления уйдут в архив, данные будут анонимизированы. Отменить нельзя."}</p>}
  </form>;
}
export default function ProfilePage() { return <Suspense><ProfileInner /></Suspense>; }
