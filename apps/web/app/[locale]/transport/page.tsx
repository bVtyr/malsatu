"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { useAuth, hasRole } from "@/lib/auth";
/** Биржа перевозок: мои заявки с откликами и открытые заявки для перевозчика. */
export default function TransportPage() {
  const { t, money, date, locale } = useI18n(); const { user } = useAuth();
  const [open, setOpen] = useState<any[]>([]); const [mine, setMine] = useState<any[]>([]); const [bids, setBids] = useState<Record<string, any[]>>({}); const [bidFor, setBidFor] = useState<string | null>(null); const [price, setPrice] = useState("");
  const load = () => { api("/transport/requests").then((r) => setOpen(r.items)); api("/transport/requests", { query: { mine: "true" } }).then((r) => { setMine(r.items); r.items.forEach((x: any) => api(`/transport/requests/${x.id}/bids`).then((b) => setBids((o) => ({ ...o, [x.id]: b.items })))); }); };
  useEffect(() => { if (user) load(); }, [user]);
  const bid = async (id: string) => { await api(`/transport/requests/${id}/bids`, { body: { priceKzt: Number(price), vehicleType: "livestock_truck" } }); setBidFor(null); setPrice(""); load(); };
  const choose = async (id: string, bidId: string) => { await api(`/transport/requests/${id}/choose`, { body: { bidId } }); load(); };
  const cargo = (r: any) => `${r.from_region ?? "?"} → ${r.to_region ?? "?"}, ${r.distance_km} ${t.common.km}, ${r.heads ? `${r.heads} ${locale === "kk" ? "бас" : "гол."}` : `${r.tons} т`}, ${date(r.date_from)}`;
  return <>
    <h1 className="page-title">{t.listing.platformCarrier}</h1>
    {mine.length > 0 && <section><h2 className="sub">{locale === "kk" ? "Менің өтінімдерім" : "Мои заявки"}</h2><div className="stack">{mine.map((r) => <div key={r.id} className="panel panel--surface"><b>{cargo(r)}</b> <span className="mark">{r.status}</span>
      <div style={{ marginTop: "0.5rem" }}>{(bids[r.id] ?? []).map((b) => <div key={b.id} className="line small"><span className="what">{b.display_name}{b.rating ? `, ${b.rating}` : ""}{b.comment ? `. ${b.comment}` : ""}</span><span className="leader" /><span className="val">{money(b.price_kzt)}{r.status === "open" && <button onClick={() => choose(r.id, b.id)} className="chip chip--ink" style={{ marginLeft: "0.5rem" }}>{locale === "kk" ? "Таңдау" : "Выбрать"}</button>}{b.status === "accepted" ? ` (${t.common.verified})` : ""}</span></div>)}</div></div>)}</div></section>}
    {hasRole(user, "carrier") && <section><h2 className="sub">{locale === "kk" ? "Ашық өтінімдер" : "Открытые заявки"}</h2><div className="list-rows">{open.map((r) => <div key={r.id} className="rowline" style={{ flexWrap: "wrap" }}><span style={{ flex: 1 }}>{cargo(r)}{r.requires_temp ? (locale === "kk" ? ", рефрижератор" : ", рефрижератор") : ""}</span>
      {bidFor === r.id ? <form onSubmit={(e) => { e.preventDefault(); bid(r.id); }} className="chips"><input className="field" style={{ width: "9rem", minHeight: "2.75rem" }} type="number" inputMode="numeric" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="₸" required /><button className="chip chip--ink">{t.common.publish}</button></form> : <button onClick={() => setBidFor(r.id)} className="chip">{locale === "kk" ? "Баға ұсыну" : "Предложить цену"}</button>}</div>)}</div></section>}
  </>;
}
