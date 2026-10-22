"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { ListingCard } from "./ListingCard";
import { useI18n } from "@/lib/i18n";
export function SellerListings({ userId }: { userId: string }) {
  const { t } = useI18n(); const [items, setItems] = useState<any[]>([]);
  useEffect(() => { api("/listings", { query: { limit: 50 } }).then((r) => setItems(r.items.filter((l: any) => l.owner_user_id === userId))); }, [userId]);
  return <section><h2 className="page-title">{t.listing.sellerOther}</h2><div className="list" style={{ marginTop: "0.6rem" }}>{items.map((l) => <ListingCard key={l.id} l={l} />)}</div></section>;
}
