import type { FastifyInstance } from "fastify";
import { db } from "../../db/index.js";
import { config } from "../../config.js";
import { AppError } from "../../plugins/errors.js";

export default async function cmsRoutes(app: FastifyInstance) {
  app.get("/cms/pages", async () => ({ items: await db.selectFrom("cms_pages").select(["slug", "title_ru", "title_kk", "kind", "updated_at"]).where("published", "=", true).execute() }));
  app.get<{ Params: { slug: string } }>("/cms/pages/:slug", async (req, reply) => {
    const p = await db.selectFrom("cms_pages").selectAll().where("slug", "=", req.params.slug).where("published", "=", true).executeTakeFirst();
    if (!p) throw new AppError(404, "page_not_found");
    reply.header("cache-control", "public, max-age=300"); return { page: p };
  });
  app.get("/banners", async (req) => {
    const region = (req.query as any).region as string | undefined;
    const rows = await db.selectFrom("banners").selectAll().where("enabled", "=", true).where((eb) => eb.or([eb("ends_at", "is", null), eb("ends_at", ">", new Date())])).execute();
    return { items: rows.filter((b) => !b.region_codes.length || (region && b.region_codes.includes(region))) };
  });

  // SEO: sitemap с человекочитаемыми адресами «регион/категория» на двух языках
  let sitemapCache: { at: number; xml: string } | null = null;
  app.get("/sitemap.xml", async (_req, reply) => {
    reply.header("content-type", "application/xml").header("cache-control", "public, max-age=3600");
    if (sitemapCache && Date.now() - sitemapCache.at < 3600_000) return sitemapCache.xml;
    const [regions, cats, listings] = await Promise.all([
      db.selectFrom("regions").select(["slug_ru", "slug_kk"]).where("parent_code", "is", null).where("enabled", "=", true).execute(),
      db.selectFrom("categories").select(["slug_ru", "slug_kk"]).where("enabled", "=", true).execute(),
      db.selectFrom("listings").select(["id", "updated_at"]).where("status", "=", "active").orderBy("published_at", "desc").limit(20000).execute(),
    ]);
    const base = config.PUBLIC_WEB_URL;
    const urls: string[] = [];
    for (const r of regions) for (const c of cats) { urls.push(`${base}/ru/${r.slug_ru}/${c.slug_ru}`); urls.push(`${base}/kk/${r.slug_kk}/${c.slug_kk}`); }
    for (const l of listings) { urls.push(`${base}/ru/listing/${l.id}`); urls.push(`${base}/kk/listing/${l.id}`); }
    const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map((u) => `  <url><loc>${u}</loc></url>`).join("\n")}\n</urlset>`;
    sitemapCache = { at: Date.now(), xml };
    return xml;
  });
}
