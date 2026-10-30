/** robots.txt with the absolute sitemap address of this deployment (APP_ORIGIN). */
export function loader({ request }: { request: Request }) {
  const url = new URL(request.url);
  const origin = (process.env.APP_ORIGIN || `${url.protocol}//${url.host}`).replace(/\/$/, "");
  const body = `# PSG College of Technology — faculty and research recruitment
User-agent: *
Allow: /
Allow: /vacancies
Allow: /help
Allow: /help-desk
Allow: /help-desk/articles
Allow: /privacy

# Candidate, staff and sign-in pages are private (also sent as X-Robots-Tag: noindex)
Disallow: /account
Disallow: /apply/
Disallow: /applications/
Disallow: /help-desk/new
Disallow: /help-desk/tickets
Disallow: /help-desk/files/
Disallow: /staff
Disallow: /admin
Disallow: /login
Disallow: /register
Disallow: /logout
Disallow: /verify-email
Disallow: /forgot-password
Disallow: /reset-password
Disallow: /notifications
Disallow: /files/
Disallow: /healthz/

Sitemap: ${origin}/sitemap.xml
`;
  return new Response(body, {
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, max-age=3600" },
  });
}
