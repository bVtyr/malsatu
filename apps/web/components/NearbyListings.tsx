"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useGeo } from "@/lib/geo";
import { useI18n } from "@/lib/i18n";
import { ListingCard } from "./ListingCard";
export function NearbyListings() {
  const { pos } = useGeo(); const { t } = useI18n();
  const [items, setItems] = useState<any[]>([]);
  useEffect(() => { if (pos) api("/listings", { query: { lat: pos.lat, lng: pos.lng, radiusKm: 100, sort: "near", limit: 6 } }).then((r) => setItems(r.items)).catch(() => undefined); }, [pos?.lat, pos?.lng]);
  if (!pos || !items.length) return null;
  return <section><h2 className="page-title">{t.home.nearby}</h2><div className="list" style={{ marginTop: "0.6rem" }}>{items.map((l) => <ListingCard key={l.id} l={l} />)}</div></section>;
}
