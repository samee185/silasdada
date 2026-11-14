import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db';
import { env } from '../env';
import { requireRole } from '../lib/auth';
import { cleanHtml, slugify } from '../lib/content';
import { handle, HttpError, parse } from '../lib/http';

/**
 * Turns sermon notes into a ready-to-edit message draft using Gemini's free tier.
 * Only the notes pasted here are sent — never bookings or anyone's details.
 * Nothing is published: the result becomes a draft that the pastor edits.
 */
export const aiRouter = Router();
aiRouter.use(requireRole('OWNER', 'SECRETARY'));

const DAILY_LIMIT = 30;

export type SermonDraft = {
  titles: string[];
  excerpt: string;
  bodyHtml: string;
  keyPoints: string[];
  scriptureRefs: string[];
  coverVerse: string;
  coverRef: string;
  discussion: string[];
  seoDescription: string;
  shareCaption: string;
};

const SCHEMA = {
  type: 'OBJECT',
  properties: {
    titles: { type: 'ARRAY', items: { type: 'STRING' }, description: 'Three short title options' },
    excerpt: { type: 'STRING', description: 'Two-sentence summary for the message card' },
    bodyHtml: { type: 'STRING', description: 'The full message as simple HTML using only p, h2, ul, li, blockquote, strong, em' },
    keyPoints: { type: 'ARRAY', items: { type: 'STRING' } },
    scriptureRefs: { type: 'ARRAY', items: { type: 'STRING' }, description: 'Bible references mentioned in the notes, e.g. Isaiah 40:31' },
    coverVerse: { type: 'STRING', description: 'A short line for the cover: verse text only if it appears in the notes, otherwise a key sentence from the message' },
    coverRef: { type: 'STRING', description: 'Reference for coverVerse, or empty if it is a sentence from the message' },
    discussion: { type: 'ARRAY', items: { type: 'STRING' }, description: 'Three questions for cell groups' },
    seoDescription: { type: 'STRING', description: 'Under 155 characters, for Google results' },
    shareCaption: { type: 'STRING', description: 'One or two warm sentences for sharing on WhatsApp' },
  },
  required: ['titles', 'excerpt', 'bodyHtml', 'keyPoints', 'scriptureRefs', 'coverVerse', 'coverRef', 'discussion', 'seoDescription', 'shareCaption'],
};

const INSTRUCTIONS = `You help Rev'd Silas O. Dada, Conference Pastor of the Old Ife Road Conference of New Covenant Church (Ibadan, Nigeria), turn his sermon notes or transcripts into a message for his website.

Rules:
- Keep his voice, his wording and his points. Organise and tidy; do not add new teaching, stories, testimonies, statistics or claims that are not in the notes.
- Use British/Nigerian English spelling.
- Never invent or paraphrase Bible verse text. Only quote verse wording that appears in the notes. List references exactly as given.
- bodyHtml: well-structured with h2 subheadings where the notes have clear sections; short paragraphs; no title at the top (the title is separate).
- Be warm and pastoral, not salesy. No emojis.`;

const inputSchema = z.object({
  notes: z.string().trim().min(80, 'Paste a bit more of the sermon (at least a few sentences).').max(60_000, 'That is too long. Paste up to about 10,000 words.'),
});

async function callGemini(notes: string): Promise<{ draft: SermonDraft; tokens?: number }> {
  if (!env.GEMINI_API_KEY) {
    throw new HttpError(503, 'AI drafts are not switched on yet. Add a free Gemini API key (GEMINI_API_KEY) to the server settings.');
  }
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(env.GEMINI_MODEL)}:generateContent`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 90_000); // Hostinger stops requests at 120s
  try {
    const res = await fetch(url, {
      method: 'POST',
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': env.GEMINI_API_KEY },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: INSTRUCTIONS }] },
        contents: [{ role: 'user', parts: [{ text: `Sermon notes:\n\n${notes}` }] }],
        generationConfig: { responseMimeType: 'application/json', responseSchema: SCHEMA, temperature: 0.4 },
      }),
    });
    const data = (await res.json().catch(() => ({}))) as {
      candidates?: { content?: { parts?: { text?: string }[] } }[];
      usageMetadata?: { totalTokenCount?: number };
      error?: { message?: string; status?: string };
    };
    if (!res.ok) {
      if (res.status === 429) throw new HttpError(429, "The free AI allowance is used up for now. Please try again in a few minutes.");
      throw new HttpError(502, `The AI service returned an error: ${data.error?.message ?? res.statusText}`);
    }
    const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? '';
    const draft = JSON.parse(text) as SermonDraft;
    draft.bodyHtml = cleanHtml(draft.bodyHtml ?? '');
    return { draft, tokens: data.usageMetadata?.totalTokenCount };
  } catch (e) {
    if (e instanceof HttpError) throw e;
    if (e instanceof Error && e.name === 'AbortError') throw new HttpError(504, 'The AI took too long. Try with shorter notes.');
    throw new HttpError(502, 'The AI reply could not be read. Please try again.');
  } finally {
    clearTimeout(timer);
  }
}

aiRouter.post(
  '/sermon-draft',
  handle(async (req, res) => {
    const { notes } = parse(inputSchema, req.body);
    const used = await prisma.aiDraft.count({ where: { createdById: req.user!.id, createdAt: { gte: new Date(Date.now() - 864e5) } } });
    if (used >= DAILY_LIMIT) throw new HttpError(429, `You've made ${DAILY_LIMIT} drafts in the last 24 hours. Please try again tomorrow.`);
    const { draft, tokens } = await callGemini(notes);
    const saved = await prisma.aiDraft.create({
      data: { input: notes, output: draft as unknown as object, model: env.GEMINI_MODEL, tokens: tokens ?? null, createdById: req.user!.id },
    });
    res.status(201).json({ id: saved.id, draft });
  }),
);

aiRouter.get(
  '/drafts',
  handle(async (_req, res) => {
    const rows = await prisma.aiDraft.findMany({ orderBy: { createdAt: 'desc' }, take: 50 });
    res.json({
      drafts: rows.map((r) => ({ id: r.id, createdAt: r.createdAt, postId: r.postId, title: (r.output as unknown as SermonDraft).titles?.[0] ?? 'Untitled', preview: r.input.slice(0, 160) })),
    });
  }),
);

aiRouter.get(
  '/drafts/:id',
  handle(async (req, res) => {
    const r = await prisma.aiDraft.findUnique({ where: { id: String(req.params.id) } });
    if (!r) throw new HttpError(404, 'Draft not found.');
    res.json({ id: r.id, createdAt: r.createdAt, postId: r.postId, notes: r.input, draft: r.output });
  }),
);

/** Turns an AI draft into a message draft and returns its id for the editor. */
aiRouter.post(
  '/drafts/:id/post',
  handle(async (req, res) => {
    const { titleIndex } = parse(z.object({ titleIndex: z.number().int().min(0).max(5).default(0) }), req.body);
    const r = await prisma.aiDraft.findUnique({ where: { id: String(req.params.id) } });
    if (!r) throw new HttpError(404, 'Draft not found.');
    if (r.postId && (await prisma.post.findUnique({ where: { id: r.postId } }))) return res.json({ postId: r.postId });
    const d = r.output as unknown as SermonDraft;
    const title = d.titles?.[titleIndex] ?? d.titles?.[0] ?? 'New message';
    let slug = slugify(title);
    for (let i = 2; await prisma.post.findUnique({ where: { slug } }); i++) slug = `${slugify(title)}-${i}`;
    const post = await prisma.post.create({
      data: {
        title,
        slug,
        excerpt: d.excerpt || null,
        body: d.bodyHtml || '<p></p>',
        scriptureRefs: d.scriptureRefs?.join('; ') || null,
        coverVerse: d.coverVerse || null,
        coverRef: d.coverRef || null,
        coverStyle: Math.floor(Math.random() * 4),
        discussion: d.discussion?.length ? JSON.stringify(d.discussion) : null,
        seoDescription: d.seoDescription || null,
        shareCaption: d.shareCaption || null,
        status: 'DRAFT',
      },
    });
    await prisma.aiDraft.update({ where: { id: r.id }, data: { postId: post.id } });
    res.status(201).json({ postId: post.id });
  }),
);
