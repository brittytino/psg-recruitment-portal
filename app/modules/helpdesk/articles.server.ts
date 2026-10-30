import { z } from "zod";
import { audit } from "~/modules/audit/audit.server";
import { requirePermission } from "~/modules/auth/policy.server";
import type { SessionUser } from "~/modules/auth/session.server";
import { prisma } from "~/modules/core/db.server";
import { ConflictError, NotFoundError, ValidationError } from "~/modules/core/errors";
import { ARTICLE_TOPICS } from "./definitions";
export { ARTICLE_TOPICS };

/**
 * Help articles. Written and published by the Super Admin; candidates only ever see published
 * articles. No article content ships with the system.
 */

export function publishedArticles(search?: string) {
  const term = search?.trim();
  return prisma.helpArticle.findMany({
    where: {
      published: true,
      ...(term
        ? {
            OR: [
              { title: { contains: term, mode: "insensitive" } },
              { summary: { contains: term, mode: "insensitive" } },
              { body: { contains: term, mode: "insensitive" } },
            ],
          }
        : {}),
    },
    orderBy: [{ sortOrder: "asc" }, { title: "asc" }],
    take: 100,
    select: { slug: true, title: true, summary: true, topic: true, updatedAt: true },
  });
}

export async function publishedArticle(slug: string) {
  if (!/^[a-z0-9-]{1,80}$/.test(slug)) throw new NotFoundError("Article");
  const a = await prisma.helpArticle.findFirst({ where: { slug, published: true } });
  if (!a) throw new NotFoundError("Article");
  return a;
}

export function allArticles(user: SessionUser | null) {
  requirePermission(user, "helpdesk:admin");
  return prisma.helpArticle.findMany({ orderBy: [{ sortOrder: "asc" }, { title: "asc" }], take: 200 });
}

const slugify = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "article";

const schema = z.object({
  id: z.string().uuid().optional(),
  title: z.string().trim().min(5, "Give a title").max(150),
  summary: z.string().trim().min(10, "Write a one-line summary").max(300),
  body: z.string().trim().min(30, "Write the article (at least 30 characters)").max(20_000),
  topic: z.enum(ARTICLE_TOPICS),
  published: z.boolean(),
  sortOrder: z.coerce.number().int().min(0).max(999),
});

export async function saveArticle(user: SessionUser | null, input: unknown) {
  const u = requirePermission(user, "helpdesk:admin");
  const p = schema.safeParse(input);
  if (!p.success)
    throw new ValidationError("Please correct the highlighted fields", z.flattenError(p.error).fieldErrors);
  const d = p.data;
  const data = {
    title: d.title,
    summary: d.summary,
    body: d.body,
    topic: d.topic,
    published: d.published,
    sortOrder: d.sortOrder,
    updatedById: u.id,
  };
  if (d.id) {
    const a = await prisma.helpArticle.update({ where: { id: d.id }, data }).catch(() => null);
    if (!a) throw new NotFoundError("Article");
    await audit({
      actorId: u.id,
      action: "helpdesk.article_updated",
      entityType: "help_article",
      entityId: a.id,
      metadata: { published: d.published },
    });
    return a;
  }
  let slug = slugify(d.title);
  if (await prisma.helpArticle.count({ where: { slug } }))
    slug = `${slug.slice(0, 70)}-${Date.now().toString(36).slice(-6)}`;
  const a = await prisma.helpArticle.create({ data: { ...data, slug } }).catch(() => {
    throw new ConflictError("An article with this title already exists");
  });
  await audit({
    actorId: u.id,
    action: "helpdesk.article_created",
    entityType: "help_article",
    entityId: a.id,
    metadata: { published: d.published },
  });
  return a;
}
