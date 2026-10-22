"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useGeo } from "@/lib/geo";
import { useI18n } from "@/lib/i18n";
import { ListingCard } from "./ListingCard";
import { MapPin } from "./Icons";
/** «Рядом с вами»: геолокация запрашивается только по кнопке. */
export function NearbyListings() {
  const { pos, denied, busy, request } = useGeo(); const { t, locale } = useI18n();
  const [items, setItems] = useState<any[]>([]);
  useEffect(() => { if (pos) api("/listings", { query: { lat: pos.lat, lng: pos.lng, radiusKm: 100, sort: "near", limit: 6 } }).then((r) => setItems(r.items)).catch(() => undefined); }, [pos?.lat, pos?.lng]);
  return (
    <section className="stack">
      <div className="row between"><h2 className="page-title">{t.home.nearby}</h2>{!pos && <button type="button" onClick={request} className="chip" disabled={busy}><MapPin size={18} />{busy ? t.common.loading : (locale === "kk" ? "Орнымды анықтау" : "Определить")}</button>}</div>
      {denied && !pos && <p className="sub">{locale === "kk" ? "Геолокация қолжетімсіз: іздеуде аймақты қолмен таңдаңыз." : "Геолокация недоступна: выберите регион вручную в поиске."}</p>}
      {pos && items.length === 0 && <p className="sub">{t.common.nothingFound}</p>}
      {items.length > 0 && <div className="list">{items.map((l) => <ListingCard key={l.id} l={l} />)}</div>}
    </section>
  );
}
