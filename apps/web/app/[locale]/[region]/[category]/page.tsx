import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { api } from "@/lib/api";
import { pickName, type Locale, t as dict, formatKzt } from "@malsatu/shared";
import { ListingCard } from "@/components/ListingCard";
export const revalidate = 300;

/** SEO-страницы /ru/shymkent/barany и /kk/shymkent/qoshqar: регион и категория как вывеска ряда. */
async function resolve(locale: Locale, region: string, category: string) {
  const [r, c] = await Promise.all([api("/regions", { query: { parent: "" }, next: { revalidate: 3600 } }), api("/categories", { next: { revalidate: 600 } })]);
  const reg = (r.regions as any[]).find((x) => x[`slug_${locale}`] === region || x.slug_ru === region || x.slug_kk === region);
  const cat = (c.categories as any[]).find((x) => x[`slug_${locale}`] === category || x.slug_ru === category || x.slug_kk === category);
  return { reg, cat };
}
export async function generateMetadata({ params }: { params: Promise<{ locale: Locale; region: string; category: string }> }): Promise<Metadata> {
  const { locale, region, category } = await params; const { reg, cat } = await resolve(locale, region, category);
  if (!reg || !cat) return {};
  const rn = pickName(reg, locale), cn = pickName(cat, locale);
  return { title: locale === "kk" ? `${rn}: ${cn} сатып алу` : `Купить ${cn.toLowerCase()}: ${rn}`, description: locale === "kk" ? `${rn}: ${cn} бағалары, хабарландырулар, тексерілген сатушылар. MalSatu.` : `${cn} в регионе ${rn}: цены, объявления, проверенные продавцы, безопасная сделка. MalSatu.`, alternates: { languages: { ru: `/ru/${reg.slug_ru}/${cat.slug_ru}`, kk: `/kk/${reg.slug_kk}/${cat.slug_kk}` } } };
}
export default async function SeoLanding({ params }: { params: Promise<{ locale: Locale; region: string; category: string }> }) {
  const { locale, region, category } = await params; const { reg, cat } = await resolve(locale, region, category);
  if (!reg || !cat) notFound();
  const t = dict(locale);
  const [list, prices] = await Promise.all([api("/listings", { query: { region: reg.code, category: cat.code, limit: 30 } }).catch(() => ({ items: [], total: 0 })), api("/price-index", { query: { region: reg.code, category: cat.code } }).catch(() => ({ items: [] }))]);
  const p = (prices.items as any[])[0];
  return <>
    <div className="tile" style={{ marginInline: "calc(var(--margin) * -1)", padding: "1.25rem var(--margin)" }}><span className="tile-title" style={{ fontSize: "1.5rem" }}>{cat.name_kk}</span><span className="tile-sub">{cat.name_ru}. {pickName(reg, locale)}</span></div>
    <h1 className="h-lead">{locale === "kk" ? `${pickName(reg, locale)}: ${pickName(cat, locale)}` : `${pickName(cat, locale)}: ${pickName(reg, locale)}`}</h1>
    {p && <div className="line"><span className="what">{t.home.prices}</span><span className="leader" /><span className="val">{formatKzt(p.median_kzt, locale)} <span className="sub">{p.unit === "per_head" ? t.common.perHead : t.common.perKgMeat}</span></span></div>}
    <p className="sub">{list.total} {locale === "kk" ? "хабарландыру" : "объявлений"}</p>
    <div className="list">{(list.items as any[]).map((l) => <ListingCard key={l.id} l={l} />)}</div>
    <Link href={`/${locale}/search?region=${reg.code}&category=${cat.code}`} className="btn btn--white btn--wide">{t.common.filters}</Link>
  </>;
}
