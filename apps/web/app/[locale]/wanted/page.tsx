"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { Price } from "@/components/ListingCard";
/** «Куплю»: запросы покупателей; продавцы региона получают уведомление и откликаются. */
export default function WantedPage() {
  const { t, lf, href, date, heads, locale } = useI18n(); const [items, setItems] = useState<any[]>([]);
  useEffect(() => { api("/listings", { query: { kind: "wanted", limit: 50 } }).then((r) => setItems(r.items)); }, []);
  return <>
    <div className="row between"><h1 className="page-title">{t.home.wanted}</h1><Link href={href("/new")} className="chip chip--ink">{t.listing.wanted}</Link></div>
    <div className="list-rows">{items.map((l) => <Link key={l.id} href={href(`/listing/${l.id}`)} className="rowline" style={{ display: "block" }}><b style={{ fontWeight: 500 }}>{lf(l, "title")}</b><div className="card-meta"><Price l={l} />{l.quantity > 1 && <span>{heads(l.quantity)}</span>}{l.needed_by && <span>{locale === "kk" ? "дейін" : "до"} {date(l.needed_by)}</span>}<span>{l.region_code}</span>{l.owner && <span>{l.owner.farm_name ?? l.owner.display_name}</span>}</div></Link>)}</div>
    {items.length === 0 && <div className="panel panel--surface">{t.common.nothingFound}</div>}
    <p className="sub">{locale === "kk" ? "Сұранысқа сәйкес сатушылар хабарлама алып, ұсыныспен жауап береді." : "Подходящие продавцы получают уведомление и откликаются предложениями."}</p>
  </>;
}
