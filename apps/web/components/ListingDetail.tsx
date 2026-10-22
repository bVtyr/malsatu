"use client";
import Link from "next/link";
import { Fragment, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { useAuth } from "@/lib/auth";
import { useGeo } from "@/lib/geo";
import { ListingCard, VerifiedMark } from "./ListingCard";
import { Phone, Chat, Warning, Heart, Stethoscope } from "./Icons";
import { MapPreview } from "./MapView";
import { SPECIES_OF_CATEGORY, slaughterYield, normalizeToPerKg } from "@malsatu/shared";
import { toast } from "./Motion";

/** Карточка объявления: галерея, бирка-цена, действия, предупреждение, продавец, характеристики листом, карта. */
export function ListingDetail({ initial, category }: { initial: any; category: any }) {
  const { t, lf, name, money, heads, date, href, priceUnit, locale } = useI18n();
  const { user } = useAuth(); const { pos } = useGeo(); const router = useRouter();
  const [l, setL] = useState(initial.listing); const seller = initial.seller;
  const [similar, setSimilar] = useState<any[]>([]); const [proxy, setProxy] = useState<string | null>(null);
  const [offer, setOffer] = useState<{ open: boolean; price: string; qty: string }>({ open: false, price: "", qty: "1" });
  const [fav, setFav] = useState(!!l.isFavorite); const [slide, setSlide] = useState(0); const setDone = (m: string) => toast(m);
  useEffect(() => { api(`/listings/${l.id}/similar`).then((r) => setSimilar(r.items)).catch(() => undefined); }, [l.id]);
  useEffect(() => { if (pos) api(`/listings/${l.id}`, { query: { lat: pos.lat, lng: pos.lng } }).then((r) => setL(r.listing)).catch(() => undefined); }, [pos?.lat]);
  const needLogin = () => router.push(href(`/login?next=/listing/${l.id}`));
  const call = async () => { if (!user) return needLogin(); const r = await api(`/listings/${l.id}/call`, { method: "POST", body: {} }); setProxy(r.proxyNumber); window.location.href = `tel:${r.proxyNumber}`; };
  const chat = async () => { if (!user) return needLogin(); const r = await api("/conversations", { body: { listingId: l.id } }); router.push(href(`/chat/${r.conversation.id}`)); };
  const sendOffer = async () => { if (!user) return needLogin(); await api("/offers", { body: { listingId: l.id, priceKzt: Number(offer.price), quantity: Number(offer.qty) } }); setOffer({ open: false, price: "", qty: "1" }); setDone(t.offer.pending); };
  const deal = async (mode: "reservation" | "escrow") => { if (!user) return needLogin(); const r = await api("/deals", { body: { listingId: l.id, mode, quantity: 1 } }); router.push(href(`/deals/${r.deal.id}`)); };
  const vet = async () => { if (!user) return needLogin(); await api("/vet/requests", { body: { listingId: l.id } }); setDone(locale === "kk" ? "Мал дәрігеріне өтінім жіберілді" : "Заявка ветеринару отправлена"); };
  const report = async () => { if (!user) return needLogin(); await api("/reports", { body: { targetType: "listing", targetId: l.id, reason: "fraud" } }); setDone(locale === "kk" ? "Шағым модераторға жіберілді" : "Жалоба отправлена модератору"); };
  const share = async () => { const url = window.location.href; if (navigator.share) await navigator.share({ title: lf(l, "title"), url }); else { await navigator.clipboard.writeText(url); setDone(locale === "kk" ? "Сілтеме көшірілді" : "Ссылка скопирована"); } };
  const toggleFav = async () => { if (!user) return needLogin(); setFav(!fav); await api(`/favorites/${l.id}`, { method: fav ? "DELETE" : "POST", body: {} }); };
  const attrs: Record<string, any> = l.attributes ?? {}; const defs: any[] = category?.attributes ?? [];
  const attrLabel = (code: string) => { const d = defs.find((x) => x.code === code); return d ? (locale === "kk" ? d.labelKk : d.labelRu) : code; };
  const attrValue = (code: string, v: any) => { const d = defs.find((x) => x.code === code); if (Array.isArray(v)) return v.map((x) => d?.options?.find((o: any) => o.value === x)?.[locale] ?? x).join(", "); if (typeof v === "boolean") return v ? t.common.yes : t.common.no; return d?.options?.find((o: any) => o.value === v)?.[locale] ?? String(v); };
  const species = SPECIES_OF_CATEGORY(l.category_code) as any;
  const w = Number(l.avg_weight_kg || attrs.live_weight_kg || 0);
  const y = l.kind === "livestock" && w > 0 && species && species !== "other" ? slaughterYield(species, w, attrs.fatness ?? "medium", !!attrs.fat_tailed) : null;
  const perKg = l.price_kzt ? normalizeToPerKg(l.price_kzt, l.price_type, w || null, l.quantity) : null;
  const isOwner = user?.id === l.owner_user_id;
  const deliveryNames: Record<string, string> = { pickup: t.listing.pickup, seller_delivery: t.listing.sellerDelivery, platform_carrier: t.listing.platformCarrier };
  return (
    <>
      {l.quarantine_flagged && <div className="notice notice--red"><Warning />{t.listing.quarantineFlag}{l.quarantineZones?.map((z: any) => `: ${name(z)}`).join("")}</div>}
      <div className="gallery bleed" onScroll={(e) => setSlide(Math.round(e.currentTarget.scrollLeft / e.currentTarget.clientWidth))}>
        {(l.media ?? []).map((m: any) => m.kind === "video" ? <video key={m.id} src={m.url} controls playsInline preload="metadata" /> : <img key={m.id} src={m.url} alt="" />)}
      </div>
      <div className="dots" aria-hidden="true">{(l.media ?? []).map((_: any, i: number) => <span key={i} className={i === slide ? "is-on" : ""} />)}</div>
      <div>
        <h1 className="h-lead">{lf(l, "title")}</h1>
        {l.auto_translated && <div className="sub">{t.common.autoTranslated}</div>}
        <p className="price-big" style={{ marginTop: "0.6rem" }}>{l.price_type === "negotiable" ? t.common.negotiable : money(l.price_kzt)}{l.price_type !== "negotiable" && <small>{priceUnit(l.price_type)}{l.bargain ? `, ${t.common.bargain}` : ""}</small>}</p>
        <p className="sub" style={{ marginTop: "0.3rem" }}>
          {perKg && l.price_type !== "per_kg_live" ? `≈ ${money(perKg)} ${t.common.perKgLive}. ` : ""}
          {l.kind === "livestock" ? `${heads(l.quantity)}${l.is_lot && l.initial_quantity > l.quantity ? ` ${locale === "kk" ? "қалды" : "осталось"} / ${l.initial_quantity}` : ""}. ` : ""}
          {l.avg_weight_kg ? `~${Math.round(l.avg_weight_kg)} ${t.common.kg}${l.weight_min_kg ? ` (${l.weight_min_kg}–${l.weight_max_kg})` : ""}. ` : ""}
          {l.distanceKm != null ? `${l.distanceKm} ${t.common.km}. ` : ""}{date(l.published_at)}
        </p>
      </div>
      <div className="chips">
        {l.documents?.some((d: any) => d.verified_status === "verified") && <span className="mark mark--green">{locale === "kk" ? "вет. құжаттар тексерілді" : "ветдокументы проверены"}</span>}
        {l.tags?.length > 0 && <span className="mark">ИНЖ: {l.tags.length}</span>}
        {l.halal && <span className="mark">халал</span>}
        {l.escrow_available && <span className="mark">{t.listing.actions.escrow.toLowerCase()}</span>}
        {attrs.slaughter_place === "licensed" && <span className="mark">{locale === "kk" ? "лицензияланған сою орны" : "лицензированная бойня"}</span>}
      </div>
      {!isOwner && l.status !== "sold" && (
        <div className="actions">
          <button onClick={call} className="btn"><Phone size={20} />{t.listing.actions.call}</button>
          <button onClick={chat} className="btn"><Chat size={20} />{t.listing.actions.chat}</button>
          <button onClick={() => setOffer({ ...offer, open: true })} className="btn btn--white">{t.listing.actions.offer}</button>
          <button onClick={() => deal("reservation")} className="btn btn--white">{t.listing.actions.reserve}</button>
          {l.escrow_available && <button onClick={() => deal("escrow")} className="btn btn--green span-2">{t.listing.actions.escrow}</button>}
          {l.kind === "livestock" && <button onClick={vet} className="btn btn--white"><Stethoscope size={20} />{t.listing.actions.vet}</button>}
          <button onClick={share} className="btn btn--white">{t.common.share}</button>
        </div>
      )}
      {isOwner && <Link href={href("/profile?tab=listings")} className="btn btn--white btn--wide">{t.common.edit}</Link>}
      {proxy && <div className="panel panel--yellow"><span className="small">{locale === "kk" ? "Уақытша нөмір, бір тәулік" : "Подменный номер, действует сутки"}</span><br /><a href={`tel:${proxy}`} className="price-big">{proxy}</a></div>}
      {offer.open && (
        <form className="panel panel--surface" onSubmit={(e) => { e.preventDefault(); sendOffer(); }}>
          <div className="h-lead" style={{ fontSize: "var(--step-body)" }}>{t.offer.title}</div>
          <label className="label" htmlFor="offer-price" style={{ marginTop: "0.6rem" }}>{t.offer.yourPrice}</label>
          <input id="offer-price" className="field" type="number" inputMode="numeric" value={offer.price} onChange={(e) => setOffer({ ...offer, price: e.target.value })} required />
          {l.quantity > 1 && <><label className="label" htmlFor="offer-qty" style={{ marginTop: "0.6rem" }}>{t.filters.quantity}</label><input id="offer-qty" className="field" type="number" inputMode="numeric" value={offer.qty} onChange={(e) => setOffer({ ...offer, qty: e.target.value })} /></>}
          <div className="actions" style={{ marginTop: "0.75rem" }}><button type="button" onClick={() => setOffer({ ...offer, open: false })} className="btn btn--white">{t.common.cancel}</button><button className="btn btn--ink">{t.common.publish}</button></div>
        </form>
      )}
      <div className="notice notice--red"><Warning />{t.listing.riskWarning}</div>
      {lf(l, "description") && <p style={{ whiteSpace: "pre-line" }}>{lf(l, "description")}</p>}
      <dl className="kv panel panel--surface">
        {Object.entries(attrs).filter(([, v]) => v !== null && v !== "" && v !== undefined).map(([k, v]) => <Fragment key={k}><dt>{attrLabel(k)}</dt><dd>{attrValue(k, v)}</dd></Fragment>)}
        <dt>{t.listing.delivery}</dt><dd>{(l.delivery_options ?? []).map((d: string) => deliveryNames[d]).join(", ")}</dd>
      </dl>
      {(l.documents?.length > 0 || l.tags?.length > 0) && (
        <div className="panel panel--surface">
          <b>{t.listing.docs}</b>
          {l.documents?.map((d: any) => <div key={d.id} className="line small"><span className="what">{name(d)}{d.number ? ` ${d.number}` : ""}</span><span className="leader" /><span className="val">{d.verified_status === "verified" ? `${t.common.verified}, ${d.verified_role}` : d.verified_status}</span></div>)}
          {l.tags?.length > 0 && <p className="sub" style={{ marginTop: "0.5rem" }}>ИНЖ: {l.tags.slice(0, 6).map((x: any) => x.tag_number).join(", ")}{l.tags.length > 6 ? ` +${l.tags.length - 6}` : ""}</p>}
        </div>
      )}
      {(y || l.deliveryEstimate) && (
        <dl className="kv">
          {y && <><dt>{t.listing.yieldCalc}</dt><dd>≈ {y.carcassKg} {t.common.kg} ({Math.round(y.ratio * 100)} %)</dd></>}
          {l.deliveryEstimate && <><dt>{t.listing.deliveryEstimate}</dt><dd>{money(l.deliveryEstimate.rangeKzt[0])} – {money(l.deliveryEstimate.rangeKzt[1])}</dd></>}
        </dl>
      )}
      {seller && (
        <Link href={href(`/users/${seller.id}`)} className="seller">
          <span className="avatar">{(seller.farmName ?? seller.displayName ?? "?")[0]}</span>
          <span><b>{seller.farmName ?? seller.displayName} <VerifiedMark level={seller.verificationLevel} /></b><span>{(t.verification as any)[`level${seller.verificationLevel}`]}. {seller.rating ? `${locale === "kk" ? "рейтинг" : "рейтинг"} ${seller.rating}, ` : ""}{seller.dealsCount} {t.admin.deals.toLowerCase()}{seller.responseMinutes ? `, ${locale === "kk" ? "жауап" : "ответ"} ${seller.responseMinutes} мин` : ""}</span></span>
        </Link>
      )}
      <MapPreview lat={l.approxLat} lng={l.approxLng} />
      <p className="sub">{l.region_code}. {locale === "kk" ? "Нақты мекенжайды сатушы келіскеннен кейін көрсетеді." : "Точный адрес продавец покажет после договорённости."}</p>
      <button onClick={toggleFav} className="chip" aria-pressed={fav}><Heart size={18} filled={fav} />{t.nav.favorites}</button>
      <button onClick={report} className="muted-link" style={{ display: "block" }}>{t.listing.actions.report}</button>
      {similar.length > 0 && <section><h2 className="page-title">{t.listing.similar}</h2><div className="list" style={{ marginTop: "0.6rem" }}>{similar.map((s) => <ListingCard key={s.id} l={s} />)}</div></section>}
    </>
  );
}
