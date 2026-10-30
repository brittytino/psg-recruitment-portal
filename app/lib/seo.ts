/**
 * One place for page metadata. Every public page calls `seo()` so titles, descriptions, canonical
 * addresses and sharing cards are consistent. Private pages (sign-in, account, staff, admin) are kept
 * out of search engines by the `X-Robots-Tag: noindex` header (see entry.server.tsx) and robots.txt.
 */
export const SITE_NAME = "PSG College of Technology Recruitment";
const DEFAULT_DESCRIPTION =
  "Faculty and research recruitment at PSG College of Technology, Coimbatore. Read the open positions and apply online.";

interface SeoInput {
  title: string;
  description?: string;
  /** Path of the canonical address, e.g. "/vacancies". Query strings are left out. */
  path: string;
  /** Absolute site address (root loader `origin`). */
  origin?: string;
  type?: "website" | "article";
  noindex?: boolean;
}

/** Root loader data carries the public site address. */
export function originFrom(matches: readonly unknown[]): string {
  for (const m of matches as { id?: string; data?: { origin?: string } }[])
    if (m?.id === "root" && m.data?.origin) return m.data.origin;
  return "";
}

export function seo({
  title,
  description = DEFAULT_DESCRIPTION,
  path,
  origin = "",
  type = "website",
  noindex,
}: SeoInput) {
  const fullTitle = title.includes("PSG") ? title : `${title} | ${SITE_NAME}`;
  const desc = description.replace(/\s+/g, " ").trim().slice(0, 160);
  const url = `${origin}${path}`;
  const image = `${origin}/images/psg_logo.png`;
  return [
    { title: fullTitle },
    { name: "description", content: desc },
    {
      name: "robots",
      content: noindex ? "noindex, nofollow" : "index, follow, max-snippet:-1, max-image-preview:large",
    },
    ...(noindex ? [] : [{ tagName: "link", rel: "canonical", href: url }]),
    { property: "og:site_name", content: SITE_NAME },
    { property: "og:type", content: type },
    { property: "og:title", content: fullTitle },
    { property: "og:description", content: desc },
    { property: "og:url", content: url },
    { property: "og:image", content: image },
    { property: "og:locale", content: "en_IN" },
    { name: "twitter:card", content: "summary" },
    { name: "twitter:title", content: fullTitle },
    { name: "twitter:description", content: desc },
    { name: "twitter:image", content: image },
  ];
}

/** Paths that must never appear in search results (sent as X-Robots-Tag: noindex). */
export const PRIVATE_PATHS =
  /^\/(staff|admin|account|applications|apply|login|register|logout|verify-email|forgot-password|reset-password|notifications|files|healthz|help-desk\/(new|tickets|files))(\/|$)/;
