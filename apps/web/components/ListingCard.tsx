"use client";
import Link from "next/link";
import { useState, type MouseEvent } from "react";
import { useI18n } from "@/lib/i18n";
import { useAuth } from "@/lib/auth";
import { api } from "@/lib/api";
import { Heart } from "./Icons";

export function PriceTag({ l, large }: { l: any; large?: boolean }) {
  const { money, priceUnit, t } = useI18n();
  const cls = `price-tag${large ? " price-tag--lg" : ""}`;
  if (l.price_type === "negotiable") return <span className={`${cls} price-tag--ink`}>{t.common.negotiable}</span>;
  return <span className={cls}>{money(l.price_kzt)}{large && <small>{priceUnit(l.price_type)}{l.bargain ? `, ${t.common.bargain}` : ""}</small>}</span>;
}

/** Карточка объявления: фото с жёлтой ценой, заголовок, факты, отметки. tile = плитка для сетки. */
export function ListingCard({ l, tile }: { l: any; tile?: boolean }) {
  const { lf, href, heads, t, locale } = useI18n();
  const { user } = useAuth();
  const [fav, setFav] = useState<boolean>(!!l.isFavorite);
  const cover = l.media?.find((m: any) => m.is_cover) ?? l.media?.[0];
  const toggleFav = async (e: MouseEvent) => { e.preventDefault(); if (!user) return; setFav(!fav); try { await api(`/favorites/${l.id}`, { method: fav ? "DELETE" : "POST", body: {} }); } catch { setFav(fav); } };
  const owner = l.owner;
  return (
    <Link href={href(`/listing/${l.id}`)} className={`card${tile ? " card--tile" : ""}`}>
      <div className="card-photo">
        {cover ? <img src={cover.thumb_url ?? cover.url} alt="" loading="lazy" width={600} height={600} /> : null}
        <PriceTag l={l} />
        {user && <button type="button" onClick={toggleFav} aria-label={t.nav.favorites} aria-pressed={fav} className="fav"><Heart size={20} filled={fav} /></button>}
      </div>
      <div className="card-body">
        <div className="card-title">{lf(l, "title")}</div>
        <div className="card-meta">
          {l.kind === "livestock" && l.quantity > 0 && <span>{heads(l.quantity)}</span>}
          {l.avg_weight_kg ? <span>~{Math.round(l.avg_weight_kg)} {t.common.kg}</span> : null}
          {l.distance_km != null && <span>{Math.round(l.distance_km)} {t.common.km}</span>}
          {l.status === "sold" && <span>{t.listing.status.sold}</span>}
        </div>
        <div className="card-marks">
          {owner && owner.verification_level >= 2 && <span className="mark mark--green">{t.common.verified}</span>}
          {l.has_docs && <span className="mark">{locale === "kk" ? "Вет. құжат" : "Ветдок"}</span>}
          {l.has_tags && <span className="mark">ИНЖ</span>}
          {l.has_video && <span className="mark">{t.listing.video}</span>}
          {l.bargain && <span className="mark mark--yellow">{t.common.bargain}</span>}
          {l.halal && <span className="mark">Халал</span>}
          {l.quarantine_flagged && <span className="mark mark--red">{locale === "kk" ? "Карантин" : "Карантин"}</span>}
        </div>
      </div>
    </Link>
  );
}
