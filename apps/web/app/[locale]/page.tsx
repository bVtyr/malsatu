import Link from "next/link";
import { api } from "@/lib/api";
import { pickName, t as dict, type Locale, formatKzt } from "@malsatu/shared";
import { NearbyListings } from "@/components/NearbyListings";
import { CategoryIcon } from "@/components/Icons";
import { ListingCard } from "@/components/ListingCard";

export const revalidate = 60;

/** Главная: жёлтая афиша «Мал базары», цветные плитки категорий, цены, рядом с вами, новые объявления. */
export default async function Home({ params }: { params: Promise<{ locale: Locale }> }) {
  const { locale } = await params;
  const t = dict(locale);
  const [cats, fresh, prices] = await Promise.all([
    api("/categories", { next: { revalidate: 600 } }).catch(() => ({ categories: [] })),
    api("/listings", { query: { sort: "new", limit: 8 }, next: { revalidate: 60 } }).catch(() => ({ items: [], total: 0 })),
    api("/price-index", { query: { region: "kz" }, next: { revalidate: 900 } }).catch(() => ({ items: [] })),
  ]);
  const all = cats.categories as any[];
  const top = all.filter((c) => !c.parent_code);
  const href = (p: string) => `/${locale}${p}`;
  const picks = (prices.items as any[]).filter((p) => ["cattle_bull", "cattle_feeder", "sheep_ram", "horse_sogym", "meat_mutton", "meat_beef", "meat_horse", "meat_national"].includes(p.category_code) && p.unit !== "per_lot").slice(0, 8);
  const catName = (code: string) => { const c = all.find((x) => x.code === code); return c ? pickName(c, locale) : code; };
  const tone: Record<string, string> = { cattle: "tile--green", sheep: "tile--yellow", horse: "tile--ink", camel: "", poultry: "", other_livestock: "tile--surface", breeding: "tile--surface", meat: "", service: "tile--surface" };
  const unitName = (u: string) => u === "per_head" ? t.common.perHead : u === "per_kg_live" ? t.common.perKgLive : t.common.perKgMeat;
  return (
    <>
      <section className="home-hero">
        <div className="stack">
          <h1 className="display lines"><span className="line-mask"><span className="line-in" style={{ ["--i" as any]: 0 }}>Мал</span></span><span className="line-mask"><span className="line-in" style={{ ["--i" as any]: 1 }}>базары</span></span></h1>
          <p className="lead" data-rise style={{ ["--i" as any]: 0 }}>{t.app.tagline}</p>
          <div className="chips" data-rise style={{ ["--i" as any]: 1 }}><Link href={href("/new")} className="btn btn--ink">{t.nav.create}</Link><Link href={href("/prices")} className="btn btn--white">{t.home.prices}</Link></div>
        </div>
        <div className="hero-photo"><img src="/img/steppe-herdsman.jpg" width={1920} height={1282} alt={locale === "kk" ? "Кешкі далада отарымен малшы" : "Чабан с отарой в вечерней степи"} fetchPriority="high" /></div>
      </section>

      <section className="stack">
        <h2 className="page-title" data-reveal>{t.home.categories}</h2>
        <div className="grid-4">
          {top.map((c, i) => (
            <Link key={c.code} data-reveal="scale" style={{ ["--i" as any]: i }} href={href(`/search?category=${c.code}`)} className={`tile ${tone[c.code] ?? ""}`}><CategoryIcon icon={c.icon} className="tile-icon" /><span><span className="tile-title">{pickName(c, locale)}</span><span className="tile-sub">{locale === "kk" ? c.name_ru : c.name_kk}</span></span></Link>
          ))}
          <Link href={href("/wanted")} className="tile tile--yellow" data-reveal="scale" style={{ ["--i" as any]: top.length }}><span><span className="tile-title">{t.home.wanted}</span><span className="tile-sub">{locale === "kk" ? "Ет комбинаттары мен мейрамханалардың сұраныстары" : "Запросы мясокомбинатов и ресторанов"}</span></span></Link>
        </div>
      </section>

      <section className="season" data-reveal>
        <Link href={href("/kurban")} className="is-green"><b>{t.home.kurban}</b><span>{locale === "kk" ? "Қошқарды мерзімге дейін броньдау" : "Бараны с бронью к дате"}</span></Link>
        <Link href={href("/sogym")}><b>{t.home.sogym}</b><span>{locale === "kk" ? "Ұшаны ½, ¼, ⅛ үлеспен" : "Туша вскладчину по ½, ¼, ⅛"}</span></Link>
        <Link href={href("/auctions")} className="is-ink"><b>{t.auction.title}</b><span>{locale === "kk" ? "Асыл тұқымды мал: ұсыныс қадамымен" : "Племенной скот: ставки с шагом"}</span></Link>
        <Link href={href("/tenders")}><b>{t.tender.title}</b><span>{locale === "kk" ? "Комбинаттар мен мейрамханалар сұранысы" : "Запросы комбинатов и ресторанов"}</span></Link>
      </section>

      <NearbyListings />

      <section className="stack">
        <div className="row between"><h2 className="page-title">{t.home.prices}</h2><Link href={href("/prices")} className="chip">{t.common.more}</Link></div>
        <div className="panel price-rows" data-reveal="left">
          {picks.length === 0 && <p className="sub">{t.common.nothingFound}</p>}
          {picks.map((p) => <div key={`${p.category_code}-${p.unit}`} className="line"><span className="what">{catName(p.category_code)} <span className="sub">{unitName(p.unit)}</span></span><span className="val">{formatKzt(p.median_kzt, locale)}</span></div>)}
        </div>
      </section>

      <section className="stack">
        <div className="row between"><h2 className="page-title">{locale === "kk" ? "Жаңа хабарландырулар" : "Новые объявления"}</h2><Link href={href("/search")} className="chip">{t.common.all}</Link></div>
        <div className="cards-grid">{(fresh.items as any[]).map((l, i) => <div key={l.id} data-reveal style={{ ["--i" as any]: i }}><ListingCard l={l} tile /></div>)}</div>
      </section>
    </>
  );
}
