import { Router } from 'express';
import { z } from 'zod';
import type { Post, Prisma, Series } from '@prisma/client';
import { prisma } from '../db';
import { requireRole } from '../lib/auth';
import { cleanHtml, readMinutes, slugify } from '../lib/content';
import { emptyToNull, handle, HttpError, parse } from '../lib/http';

// ─── Shared shapes ───────────────────────────────────────

/** A message counts as live once published, or once its scheduled time has passed. */
export const liveWhere = (): Prisma.PostWhereInput => ({
  publishedAt: { lte: new Date() },
  status: { in: ['PUBLISHED', 'SCHEDULED'] },
});

type PostWithSeries = Post & { series: Series | null };

export function card(p: PostWithSeries) {
  return {
    id: p.id,
    slug: p.slug,
    title: p.title,
    excerpt: p.excerpt,
    scriptureRefs: p.scriptureRefs,
    coverVerse: p.coverVerse,
    coverRef: p.coverRef,
    coverStyle: p.coverStyle,
    series: p.series ? { name: p.series.name, slug: p.series.slug } : null,
    seriesPart: p.seriesPart,
    preachedOn: p.preachedOn,
    publishedAt: p.publishedAt,
    readMinutes: readMinutes(p.body),
  };
}

function full(p: PostWithSeries) {
  return {
    ...card(p),
    body: p.body,
    tags: p.tags,
    discussion: p.discussion ? (JSON.parse(p.discussion) as string[]) : [],
    seoTitle: p.seoTitle,
    seoDescription: p.seoDescription,
    shareCaption: p.shareCaption,
    status: p.status,
    updatedAt: p.updatedAt,
  };
}

// ─── Public ──────────────────────────────────────────────

export const postsRouter = Router();

postsRouter.get(
  '/',
  handle(async (req, res) => {
    const q = typeof req.query.q === 'string' ? req.query.q.trim().slice(0, 80) : '';
    const series = typeof req.query.series === 'string' ? req.query.series : '';
    const take = Math.min(Number(req.query.limit) || 24, 60);
    const where: Prisma.PostWhereInput = {
      ...liveWhere(),
      ...(series ? { series: { slug: series } } : {}),
      ...(q ? { OR: [{ title: { contains: q } }, { excerpt: { contains: q } }, { scriptureRefs: { contains: q } }, { body: { contains: q } }] } : {}),
    };
    const posts = await prisma.post.findMany({ where, include: { series: true }, orderBy: { publishedAt: 'desc' }, take });
    res.json({ posts: posts.map(card) });
  }),
);

postsRouter.get(
  '/series',
  handle(async (_req, res) => {
    const series = await prisma.series.findMany({ include: { posts: { where: liveWhere(), select: { id: true } } }, orderBy: { name: 'asc' } });
    res.json({ series: series.filter((s) => s.posts.length).map((s) => ({ name: s.name, slug: s.slug, description: s.description, count: s.posts.length })) });
  }),
);

postsRouter.get(
  '/:slug',
  handle(async (req, res) => {
    const post = await prisma.post.findFirst({ where: { slug: String(req.params.slug), ...liveWhere() }, include: { series: true } });
    if (!post) throw new HttpError(404, 'This message could not be found.');
    const [inSeries, more] = await Promise.all([
      post.seriesId
        ? prisma.post.findMany({ where: { seriesId: post.seriesId, ...liveWhere() }, include: { series: true }, orderBy: [{ seriesPart: 'asc' }, { publishedAt: 'asc' }] })
        : Promise.resolve([]),
      prisma.post.findMany({ where: { id: { not: post.id }, ...liveWhere() }, include: { series: true }, orderBy: { publishedAt: 'desc' }, take: 3 }),
    ]);
    res.json({ post: full(post), inSeries: inSeries.map(card), more: more.map(card) });
  }),
);

// ─── Dashboard (pastor and secretary) ────────────────────

export const adminPostsRouter = Router();
adminPostsRouter.use(requireRole('OWNER', 'SECRETARY'));

adminPostsRouter.get(
  '/',
  handle(async (_req, res) => {
    const posts = await prisma.post.findMany({ include: { series: true }, orderBy: [{ updatedAt: 'desc' }], take: 300 });
    res.json({ posts: posts.map((p) => ({ ...card(p), status: p.status, updatedAt: p.updatedAt })) });
  }),
);

adminPostsRouter.get(
  '/series',
  handle(async (_req, res) => {
    const series = await prisma.series.findMany({ include: { _count: { select: { posts: true } } }, orderBy: { name: 'asc' } });
    res.json({ series: series.map((s) => ({ id: s.id, name: s.name, slug: s.slug, description: s.description, count: s._count.posts })) });
  }),
);

const seriesSchema = z.object({
  name: z.string().trim().min(2, 'Enter a series name.').max(120),
  description: z.preprocess(emptyToNull, z.string().trim().max(600).nullable()).optional(),
});

adminPostsRouter.post(
  '/series',
  handle(async (req, res) => {
    const data = parse(seriesSchema, req.body);
    const s = await prisma.series.create({ data: { ...data, slug: await uniqueSeriesSlug(slugify(data.name)) } });
    res.status(201).json({ series: s });
  }),
);

adminPostsRouter.put(
  '/series/:id',
  handle(async (req, res) => {
    const data = parse(seriesSchema, req.body);
    res.json({ series: await prisma.series.update({ where: { id: String(req.params.id) }, data }) });
  }),
);

adminPostsRouter.delete(
  '/series/:id',
  handle(async (req, res) => {
    await prisma.series.delete({ where: { id: String(req.params.id) } }); // messages stay, just leave the series
    res.json({ ok: true });
  }),
);

adminPostsRouter.get(
  '/:id',
  handle(async (req, res) => {
    const p = await prisma.post.findUnique({ where: { id: String(req.params.id) }, include: { series: true } });
    if (!p) throw new HttpError(404, 'Message not found.');
    res.json({ post: { ...full(p), seriesId: p.seriesId } });
  }),
);

const optStr = (max: number) => z.preprocess(emptyToNull, z.string().trim().max(max).nullable()).optional();

const postSchema = z
  .object({
    title: z.string().trim().min(3, 'Give the message a title.').max(200),
    slug: optStr(90),
    excerpt: optStr(400),
    body: z.string().max(400_000),
    scriptureRefs: optStr(500),
    coverVerse: optStr(400),
    coverRef: optStr(120),
    coverStyle: z.number().int().min(0).max(3).default(0),
    seriesId: optStr(40),
    seriesPart: z.preprocess((v) => (v === '' || v === null ? null : v), z.number().int().min(1).max(200).nullable()).optional(),
    preachedOn: z.preprocess(emptyToNull, z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable()).optional(),
    tags: optStr(500),
    discussion: z.array(z.string().trim().max(300)).max(10).default([]),
    status: z.enum(['DRAFT', 'SCHEDULED', 'PUBLISHED']),
    publishedAt: z.preprocess(emptyToNull, z.string().datetime().nullable()).optional(),
    seoTitle: optStr(120),
    seoDescription: optStr(300),
    shareCaption: optStr(500),
  })
  .refine((p) => p.status !== 'SCHEDULED' || p.publishedAt, { message: 'Choose when to publish.', path: ['publishedAt'] });

async function uniqueSlug(base: string, excludeId?: string) {
  let slug = base;
  for (let i = 2; await prisma.post.findFirst({ where: { slug, ...(excludeId ? { id: { not: excludeId } } : {}) } }); i++) slug = `${base}-${i}`;
  return slug;
}
async function uniqueSeriesSlug(base: string) {
  let slug = base;
  for (let i = 2; await prisma.series.findUnique({ where: { slug } }); i++) slug = `${base}-${i}`;
  return slug;
}

function toData(d: z.infer<typeof postSchema>, existing?: Post) {
  const body = cleanHtml(d.body);
  if (d.status !== 'DRAFT' && body.replace(/<[^>]+>/g, '').trim().length < 20) {
    throw new HttpError(400, 'Some fields need attention.', { body: 'Write the message before publishing.' });
  }
  const publishedAt =
    d.status === 'PUBLISHED' ? existing?.publishedAt && existing.status === 'PUBLISHED' ? existing.publishedAt : new Date() : d.status === 'SCHEDULED' ? new Date(d.publishedAt!) : null;
  return {
    title: d.title,
    excerpt: d.excerpt ?? null,
    body,
    scriptureRefs: d.scriptureRefs ?? null,
    coverVerse: d.coverVerse ?? null,
    coverRef: d.coverRef ?? null,
    coverStyle: d.coverStyle,
    seriesId: d.seriesId ?? null,
    seriesPart: d.seriesPart ?? null,
    preachedOn: d.preachedOn ? new Date(`${d.preachedOn}T00:00:00.000Z`) : null,
    tags: d.tags ?? null,
    discussion: d.discussion.filter(Boolean).length ? JSON.stringify(d.discussion.filter(Boolean)) : null,
    status: d.status,
    publishedAt,
    seoTitle: d.seoTitle ?? null,
    seoDescription: d.seoDescription ?? null,
    shareCaption: d.shareCaption ?? null,
  };
}

adminPostsRouter.post(
  '/',
  handle(async (req, res) => {
    const d = parse(postSchema, req.body);
    const p = await prisma.post.create({ data: { ...toData(d), slug: await uniqueSlug(slugify(d.slug || d.title)) }, include: { series: true } });
    res.status(201).json({ post: { ...full(p), seriesId: p.seriesId } });
  }),
);

adminPostsRouter.put(
  '/:id',
  handle(async (req, res) => {
    const id = String(req.params.id);
    const existing = await prisma.post.findUnique({ where: { id } });
    if (!existing) throw new HttpError(404, 'Message not found.');
    const d = parse(postSchema, req.body);
    const slug = d.slug ? await uniqueSlug(slugify(d.slug), id) : existing.slug;
    const p = await prisma.post.update({ where: { id }, data: { ...toData(d, existing), slug }, include: { series: true } });
    res.json({ post: { ...full(p), seriesId: p.seriesId } });
  }),
);

adminPostsRouter.delete(
  '/:id',
  handle(async (req, res) => {
    await prisma.post.delete({ where: { id: String(req.params.id) } });
    res.json({ ok: true });
  }),
);
