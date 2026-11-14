import fs from 'fs';
import path from 'path';
import type { Express, Request, Response } from 'express';
import express from 'express';
import { prisma } from '../db';
import { env } from '../env';
import { textFromHtml } from './content';
import { getPublicProfile } from '../routes/site';
import { liveWhere } from '../routes/posts';

const CLIENT_DIST = path.resolve(__dirname, '../../../client/dist');

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const abs = (p: string) => new URL(p, env.APP_URL).toString();

type Meta = { title: string; description: string; image?: string | null; url: string; type?: string; jsonLd?: object; body?: string; noindex?: boolean };

function headTags(m: Meta) {
  const image = m.image ? abs(m.image) : null;
  return [
    `<title>${esc(m.title)}</title>`,
    `<meta name="description" content="${esc(m.description)}">`,
    `<link rel="canonical" href="${esc(m.url)}">`,
    m.noindex ? '<meta name="robots" content="noindex">' : '',
    `<meta property="og:type" content="${m.type ?? 'website'}">`,
    `<meta property="og:site_name" content="silasdada.com.ng">`,
    `<meta property="og:title" content="${esc(m.title)}">`,
    `<meta property="og:description" content="${esc(m.description)}">`,
    `<meta property="og:url" content="${esc(m.url)}">`,
    image ? `<meta property="og:image" content="${esc(image)}">` : '',
    `<meta name="twitter:card" content="${image ? 'summary_large_image' : 'summary'}">`,
    m.jsonLd ? `<script type="application/ld+json">${JSON.stringify(m.jsonLd).replace(/</g, '\\u003c')}</script>` : '',
  ]
    .filter(Boolean)
    .join('\n    ');
}

const clip = (s: string, n = 155) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);

/** Titles, previews and readable content for each page, so Google and WhatsApp see real text. */
async function metaFor(req: Request): Promise<Meta> {
  const p = await getPublicProfile();
  const url = abs(req.path);
  const role = p.titleLine.split('·')[0].trim();
  const person = { '@type': 'Person', name: p.displayName, jobTitle: role, worksFor: { '@type': 'Organization', name: 'New Covenant Church' }, image: p.portraitUrl ? abs(p.portraitUrl) : undefined, url: abs('/') };

  const m = req.path.match(/^\/messages\/([a-z0-9-]+)\/?$/);
  if (m) {
    const post = await prisma.post.findFirst({ where: { slug: m[1], ...liveWhere() }, include: { series: true } });
    if (post) {
      const description = clip(post.seoDescription ?? post.excerpt ?? textFromHtml(post.body));
      return {
        title: `${post.seoTitle ?? post.title} · ${p.displayName}`,
        description,
        image: p.portraitUrl,
        url,
        type: 'article',
        jsonLd: {
          '@context': 'https://schema.org',
          '@type': 'Article',
          headline: post.title,
          description,
          datePublished: post.publishedAt?.toISOString(),
          dateModified: post.updatedAt.toISOString(),
          author: person,
          image: p.portraitUrl ? abs(p.portraitUrl) : undefined,
          mainEntityOfPage: url,
        },
        // Shown to crawlers and before the app loads; React replaces it instantly.
        body: `<article style="max-width:720px;margin:40px auto;padding:0 20px;font-family:Georgia,serif"><h1>${esc(post.title)}</h1>${post.body}</article>`,
      };
    }
  }
  if (req.path.startsWith('/messages')) {
    return { title: `Messages · ${p.displayName}`, description: `Messages from ${p.displayName}, ${p.titleLine}.`, image: p.portraitUrl, url };
  }
  if (req.path.startsWith('/book')) {
    return { title: `Book a meeting · ${p.displayName}`, description: `Book a meeting with ${p.displayName}, in person or by WhatsApp call.`, image: p.portraitUrl, url };
  }
  if (req.path.startsWith('/admin') || req.path.startsWith('/booking/')) {
    return { title: p.displayName, description: p.titleLine, url, noindex: true };
  }
  return {
    title: `${p.displayName} — ${role}`,
    description: clip(p.welcomeLine ?? `Messages and appointments with ${p.displayName}, ${p.titleLine}.`),
    image: p.portraitUrl,
    url,
    jsonLd: { '@context': 'https://schema.org', ...person },
  };
}

/** Serves the built React app with each page's meta tags filled in on the server. */
export function mountSpa(app: Express) {
  app.get('/robots.txt', (_req, res) => {
    res.type('text/plain').send(`User-agent: *\nDisallow: /admin\nDisallow: /booking/\nSitemap: ${abs('/sitemap.xml')}\n`);
  });

  app.get('/sitemap.xml', async (_req, res, next) => {
    try {
      const posts = await prisma.post.findMany({ where: liveWhere(), select: { slug: true, updatedAt: true }, orderBy: { publishedAt: 'desc' } });
      const urls = [
        { loc: abs('/'), lastmod: undefined },
        { loc: abs('/messages'), lastmod: posts[0]?.updatedAt },
        { loc: abs('/book'), lastmod: undefined },
        ...posts.map((p) => ({ loc: abs(`/messages/${p.slug}`), lastmod: p.updatedAt })),
      ];
      res.type('application/xml').send(
        `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls
          .map((u) => `  <url><loc>${esc(u.loc)}</loc>${u.lastmod ? `<lastmod>${u.lastmod.toISOString()}</lastmod>` : ''}</url>`)
          .join('\n')}\n</urlset>`,
      );
    } catch (e) {
      next(e);
    }
  });

  const indexPath = path.join(CLIENT_DIST, 'index.html');
  if (!fs.existsSync(indexPath)) {
    console.warn('client/dist not found: run `npm run build` (in development use `npm run dev`).');
    return;
  }
  const template = fs.readFileSync(indexPath, 'utf8');

  app.use('/assets', express.static(path.join(CLIENT_DIST, 'assets'), { immutable: true, maxAge: '1y', index: false }));
  app.use(express.static(CLIENT_DIST, { index: false, maxAge: '1h' }));

  app.use(async (req: Request, res: Response, next) => {
    if (req.method !== 'GET' || req.path.startsWith('/api') || req.path.startsWith('/media')) return next();
    try {
      const meta = await metaFor(req);
      let html = template.replace('<!--app-meta-->', headTags(meta));
      if (meta.body) html = html.replace('<div id="root"></div>', `<div id="root">${meta.body}</div>`);
      res.set('Cache-Control', 'no-cache');
      res.type('html').send(html);
    } catch (e) {
      next(e);
    }
  });
}
