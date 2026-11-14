import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db';
import { requireRole } from '../lib/auth';
import { emptyToNull, handle, parse } from '../lib/http';

export const siteRouter = Router();

const mediaUrl = (id: string | null) => (id ? `/media/${id}` : null);

export async function getPublicProfile() {
  const p = await prisma.siteProfile.findUniqueOrThrow({ where: { id: 1 } });
  return {
    displayName: p.displayName,
    titleLine: p.titleLine,
    welcomeLine: p.welcomeLine,
    story: p.story,
    scripture: p.scripture,
    scriptureRef: p.scriptureRef,
    portraitUrl: mediaUrl(p.portraitId),
    aboutPhotoUrl: mediaUrl(p.aboutPhotoId),
    casualPhotoUrl: mediaUrl(p.casualPhotoId),
    publicEmail: p.publicEmail,
    publicPhone: p.publicPhone,
    meetingAddress: p.meetingAddress,
    mapsUrl: p.mapsUrl,
    socials: { youtube: p.youtube, facebook: p.facebook, instagram: p.instagram, tiktok: p.tiktok, x: p.x },
    onboarded: Boolean(p.onboardedAt),
  };
}

siteRouter.get(
  '/',
  handle(async (_req, res) => {
    res.set('Cache-Control', 'no-cache');
    res.json(await getPublicProfile());
  }),
);

const optText = (max: number) => z.preprocess(emptyToNull, z.string().trim().max(max).nullable()).optional();
const optUrl = z
  .preprocess(emptyToNull, z.string().trim().url('Enter a full link starting with https://').max(500).nullable())
  .optional();
const optId = z.preprocess(emptyToNull, z.string().max(40).nullable()).optional();

const profileSchema = z.object({
  displayName: z.string().trim().min(2, 'Enter the name to show.').max(120).optional(),
  titleLine: z.string().trim().min(2).max(255).optional(),
  welcomeLine: optText(300),
  story: optText(6000),
  scripture: optText(600),
  scriptureRef: optText(80),
  portraitId: optId,
  aboutPhotoId: optId,
  casualPhotoId: optId,
  publicEmail: z.preprocess(emptyToNull, z.string().trim().email('Enter a valid email address.').nullable()).optional(),
  publicPhone: optText(40),
  meetingAddress: optText(500),
  mapsUrl: optUrl,
  youtube: optUrl,
  facebook: optUrl,
  instagram: optUrl,
  tiktok: optUrl,
  x: optUrl,
});

// Website content: Rev'd Dada and his secretary can both edit it.
siteRouter.put(
  '/',
  requireRole('OWNER', 'SECRETARY'),
  handle(async (req, res) => {
    const data = parse(profileSchema, req.body);
    await prisma.siteProfile.update({ where: { id: 1 }, data });
    res.json(await getPublicProfile());
  }),
);

siteRouter.post(
  '/onboarded',
  requireRole('OWNER'),
  handle(async (_req, res) => {
    await prisma.siteProfile.update({ where: { id: 1 }, data: { onboardedAt: new Date() } });
    res.json({ ok: true });
  }),
);
