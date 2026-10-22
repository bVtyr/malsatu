import Link from "next/link";
import { api } from "@/lib/api";
import { t as dict, type Locale } from "@malsatu/shared";
import { KurbanTimer } from "@/components/KurbanTimer";
import { ListingCard } from "@/components/ListingCard";
export const revalidate = 300;
export default async function KurbanPage({ params }: { params: Promise<{ locale: Locale }> }) {
  const { locale } = await params; const t = dict(locale);
  const list = await api("/listings", { query: { purpose: "kurban", limit: 30 } }).catch(() => ({ items: [] }));
  return (
    <>
      <section className="panel panel--yellow" style={{ padding: "1.5rem var(--margin)" }}>
        <h1 className="h-lead" style={{ fontSize: "2rem" }}>{t.home.kurban}</h1>
        <KurbanTimer />
        <p style={{ marginTop: "0.6rem" }}>{locale === "kk" ? "Қошқарды мерзімге дейін броньдаңыз: шариғат бойынша сою, мүшелеу және бірнеше мекенжайға жеткізу." : "Забронируйте барана к дате: забой по обряду, разделка и доставка частей по нескольким адресам."}</p>
      </section>
      <div className="line"><span className="what">{locale === "kk" ? "Шариғат бойынша сою" : "Забой по обряду"}</span><span className="leader" /><span className="val">{locale === "kk" ? "кіреді" : "включено"}</span></div>
      <div className="line"><span className="what">{locale === "kk" ? "Мүшелеу және орау" : "Разделка и упаковка"}</span><span className="leader" /><span className="val">{locale === "kk" ? "сұраныс бойынша" : "по запросу"}</span></div>
      <div className="line"><span className="what">{locale === "kk" ? "Бірнеше мекенжайға жеткізу" : "Доставка по адресам"}</span><span className="leader" /><span className="val">{locale === "kk" ? "3-ке дейін" : "до 3 адресов"}</span></div>
      <div className="list">{(list.items as any[]).map((l) => <ListingCard key={l.id} l={l} />)}</div>
      <Link href={`/${locale}/search?purpose=kurban`} className="btn btn--white btn--wide">{t.common.all}</Link>
    </>
  );
}
