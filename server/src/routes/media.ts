import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db';
import { requireAuth } from '../lib/auth';
import { handle, HttpError, parse } from '../lib/http';

/** POST /api/media — the browser has already resized the photo to a JPEG/WebP. */
export const mediaApiRouter = Router();

const uploadSchema = z.object({
  mime: z.enum(['image/jpeg', 'image/webp', 'image/png']),
  data: z.string().min(10), // base64, no data: prefix
  width: z.number().int().positive().max(4000),
  height: z.number().int().positive().max(4000),
  alt: z.string().trim().max(200).optional(),
});

const MAX_BYTES = 1_500_000;

mediaApiRouter.post(
  '/',
  requireAuth,
  handle(async (req, res) => {
    const body = parse(uploadSchema, req.body);
    const bytes = Buffer.from(body.data, 'base64');
    if (bytes.length > MAX_BYTES) throw new HttpError(413, 'That photo is still too large after resizing. Try a smaller one.');
    const ok =
      (body.mime === 'image/jpeg' && bytes[0] === 0xff && bytes[1] === 0xd8) ||
      (body.mime === 'image/png' && bytes[0] === 0x89 && bytes[1] === 0x50) ||
      (body.mime === 'image/webp' && bytes.subarray(8, 12).toString() === 'WEBP');
    if (!ok) throw new HttpError(400, 'That file is not a supported photo.');
    const media = await prisma.media.create({
      data: { mime: body.mime, bytes, width: body.width, height: body.height, alt: body.alt },
    });
    res.status(201).json({ id: media.id, url: `/media/${media.id}` });
  }),
);

/** GET /media/:id — public, cached forever (ids never change). */
export const mediaPublicRouter = Router();

mediaPublicRouter.get(
  '/:id',
  handle(async (req, res) => {
    const id = String(req.params.id);
    const media = await prisma.media.findUnique({ where: { id }, select: { mime: true, bytes: true } });
    if (!media) throw new HttpError(404, 'Not found');
    res.set('Content-Type', media.mime);
    res.set('Cache-Control', 'public, max-age=31536000, immutable');
    res.send(Buffer.from(media.bytes));
  }),
);
