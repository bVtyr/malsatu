import { notFound } from "next/navigation";
import { api } from "@/lib/api";
import { t as dict, type Locale } from "@malsatu/shared";
import { SellerListings } from "@/components/SellerListings";
export default async function UserPage({ params }: { params: Promise<{ locale: Locale; id: string }> }) {
  const { locale, id } = await params; const t = dict(locale);
  let d: any; try { d = await api(`/users/${id}`, { cache: "no-store" }); } catch { notFound(); }
  const u = d.user; const herd: Record<string, string> = { cattle: locale === "kk" ? "ІҚМ" : "КРС", sheep: locale === "kk" ? "қой" : "овцы", horse: locale === "kk" ? "жылқы" : "лошади", camel: locale === "kk" ? "түйе" : "верблюды", goat: locale === "kk" ? "ешкі" : "козы", poultry: locale === "kk" ? "құс" : "птица" };
  return <>
    <div className="profile-head"><span className="avatar">{(u.farmName ?? u.displayName ?? "?")[0]}</span><span><b>{u.farmName ?? u.displayName}</b><span>{(t.verification as any)[`level${u.verificationLevel}`]}. {u.regionCode}, {locale === "kk" ? "платформада" : "на платформе с"} {new Date(u.createdAt).getFullYear()}</span></span></div>
    <div className="stat-row"><span><b>{u.rating || "—"}</b> ({u.reviewsCount})</span><span><b>{u.dealsCount}</b> {t.admin.deals.toLowerCase()}</span>{u.responseMinutes && <span><b>{u.responseMinutes} мин</b> {locale === "kk" ? "жауап" : "ответ"}</span>}</div>
    {u.about && <p>{u.about}</p>}
    {u.herdSummary && Object.keys(u.herdSummary).length > 0 && <div className="chips">{Object.entries(u.herdSummary).map(([k, v]) => <span key={k} className="chip">{herd[k] ?? k}: {v as number}</span>)}</div>}
    <SellerListings userId={id} />
    {d.reviews.length > 0 && <section><h2 className="page-title">{locale === "kk" ? "Пікірлер" : "Отзывы"}</h2><div className="list-rows">{d.reviews.map((r: any) => <div key={r.id} className="rowline" style={{ display: "block" }}><b className="num">{r.score_overall} / 5</b> {r.text}{r.reply_text && <p className="sub" style={{ marginTop: "0.3rem" }}>{locale === "kk" ? "Жауап" : "Ответ"}: {r.reply_text}</p>}</div>)}</div></section>}
  </>;
}
