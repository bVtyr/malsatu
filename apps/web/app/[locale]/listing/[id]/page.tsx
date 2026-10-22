import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { api } from "@/lib/api";
import { pickName, formatKzt, type Locale } from "@malsatu/shared";
import { ListingDetail } from "@/components/ListingDetail";

export async function generateMetadata({ params }: { params: Promise<{ locale: Locale; id: string }> }): Promise<Metadata> {
  const { locale, id } = await params;
  try {
    const { listing } = await api("/listings/" + id, { next: { revalidate: 60 } });
    const title = listing[`title_${locale}`] ?? listing.title_ru;
    const price = listing.price_kzt ? formatKzt(listing.price_kzt, locale) : "";
    return { title: `${title} — ${price}`, description: (listing[`description_${locale}`] ?? listing.description_ru ?? "").slice(0, 160), openGraph: { title, images: listing.media?.[0]?.url ? [listing.media[0].url] : [] } };
  } catch { return { title: "MalSatu" }; }
}

export default async function ListingPage({ params }: { params: Promise<{ locale: Locale; id: string }> }) {
  const { locale, id } = await params;
  let data: any;
  try { data = await api("/listings/" + id, { cache: "no-store" }); } catch { notFound(); }
  const cat = await api("/categories/" + data.listing.category_code, { next: { revalidate: 600 } }).catch(() => ({ category: null }));
  const jsonLd = {
    "@context": "https://schema.org", "@type": "Product", name: data.listing[`title_${locale}`] ?? data.listing.title_ru, image: data.listing.media?.map((m: any) => m.url) ?? [],
    description: data.listing[`description_${locale}`] ?? data.listing.description_ru, category: cat.category ? pickName(cat.category, locale) : undefined,
    offers: data.listing.price_kzt ? { "@type": "Offer", priceCurrency: "KZT", price: data.listing.price_kzt, availability: data.listing.status === "active" ? "https://schema.org/InStock" : "https://schema.org/SoldOut" } : undefined,
  };
  return (<>
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
    <ListingDetail initial={data} category={cat.category} />
  </>);
}
