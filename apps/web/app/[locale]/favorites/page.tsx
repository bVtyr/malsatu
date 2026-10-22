"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { useAuth } from "@/lib/auth";
import { ListingCard } from "@/components/ListingCard";
export default function FavoritesPage() {
  const { t } = useI18n(); const { user } = useAuth(); const [items, setItems] = useState<any[]>([]);
  useEffect(() => { if (user) api("/favorites").then((r) => setItems(r.items.map((x: any) => ({ ...x, isFavorite: true })))); }, [user]);
  return <><h1 className="page-title">{t.nav.favorites}</h1>{items.length === 0 && <div className="panel panel--surface">{t.common.nothingFound}</div>}<div className="list">{items.map((l) => <ListingCard key={l.id} l={l} />)}</div></>;
}
