import { notFound } from "next/navigation";
import { api } from "@/lib/api";
import type { Locale } from "@malsatu/shared";
export const revalidate = 300;
export default async function CmsPage({ params }: { params: Promise<{ locale: Locale; slug: string }> }) {
  const { locale, slug } = await params;
  let page: any; try { page = (await api(`/cms/pages/${slug}`)).page; } catch { notFound(); }
  const body: string = locale === "kk" ? page.body_kk : page.body_ru;
  return <article><h1 className="h-lead" style={{ fontSize: "2rem" }}>{locale === "kk" ? page.title_kk : page.title_ru}</h1>
    {body.split("\n").map((line, i) => line.startsWith("## ") ? <h2 key={i} className="page-title" style={{ marginTop: "1.5rem" }}>{line.slice(3)}</h2> : line.startsWith("### ") ? <h3 key={i} style={{ marginTop: "1rem", fontWeight: 600 }}>{line.slice(4)}</h3> : <p key={i} style={{ marginTop: "0.5rem" }}>{line}</p>)}</article>;
}
