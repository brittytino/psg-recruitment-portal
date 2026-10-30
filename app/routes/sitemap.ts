import { publishedArticles } from "~/modules/helpdesk/articles.server";
import { listPublishedVacancies } from "~/modules/recruitment/service.server";

export async function loader({ request }: { request: Request }) {
  const url = new URL(request.url);
  const origin = (process.env.APP_ORIGIN || `${url.protocol}//${url.host}`).replace(/\/$/, "");
  const [vacancies, articles] = await Promise.all([
    listPublishedVacancies().catch(() => []),
    publishedArticles().catch(() => []),
  ]);

  const today = new Date().toISOString().split("T")[0];

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>${origin}/</loc>
    <lastmod>${today}</lastmod>
    <changefreq>daily</changefreq>
    <priority>1.0</priority>
  </url>
  <url>
    <loc>${origin}/vacancies</loc>
    <lastmod>${today}</lastmod>
    <changefreq>daily</changefreq>
    <priority>0.9</priority>
  </url>
${vacancies
  .map(
    (v) => `  <url>
    <loc>${origin}/vacancies/${encodeURIComponent(v.code)}</loc>
    <lastmod>${v.updatedAt ? new Date(v.updatedAt).toISOString().split("T")[0] : today}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
  </url>`,
  )
  .join("\n")}
  <url>
    <loc>${origin}/help</loc>
    <changefreq>monthly</changefreq>
    <priority>0.5</priority>
  </url>
  <url>
    <loc>${origin}/help-desk</loc>
    <changefreq>weekly</changefreq>
    <priority>0.5</priority>
  </url>
  <url>
    <loc>${origin}/help-desk/articles</loc>
    <changefreq>weekly</changefreq>
    <priority>0.4</priority>
  </url>
${articles
  .map(
    (a) => `  <url>
    <loc>${origin}/help-desk/articles/${encodeURIComponent(a.slug)}</loc>
    <lastmod>${new Date(a.updatedAt).toISOString().split("T")[0]}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.4</priority>
  </url>`,
  )
  .join("\n")}
  <url>
    <loc>${origin}/privacy</loc>
    <changefreq>monthly</changefreq>
    <priority>0.3</priority>
  </url>
</urlset>`;

  return new Response(xml, {
    status: 200,
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, max-age=3600, s-maxage=3600",
    },
  });
}
