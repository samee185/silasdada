import fs from 'fs';
import path from 'path';
import { prisma } from '../db';

/** JPEG dimensions from the SOF marker, so seed photos need no image library. */
function jpegSize(buf: Buffer): { width: number; height: number } {
  let i = 2;
  while (i < buf.length) {
    if (buf[i] !== 0xff) break;
    const marker = buf[i + 1];
    const len = buf.readUInt16BE(i + 2);
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
      return { height: buf.readUInt16BE(i + 5), width: buf.readUInt16BE(i + 7) };
    }
    i += 2 + len;
  }
  return { width: 0, height: 0 };
}

async function seedPhoto(file: string, alt: string) {
  const full = path.resolve(__dirname, '../../seed-assets', file);
  if (!fs.existsSync(full)) return null;
  const bytes = fs.readFileSync(full);
  const { width, height } = jpegSize(bytes);
  const media = await prisma.media.create({ data: { mime: 'image/jpeg', bytes, width, height, alt } });
  return media.id;
}

/**
 * Runs on every start and only fills what is missing, so the site works the
 * moment the database is created. Everything here can be changed from the dashboard.
 */
export async function ensureDefaults() {
  const profile = await prisma.siteProfile.findUnique({ where: { id: 1 } });
  if (!profile) {
    const portraitId = await seedPhoto('portrait.jpg', "Rev'd Silas O. Dada preaching");
    const aboutPhotoId = await seedPhoto('pulpit.jpg', "Rev'd Silas O. Dada ministering at New Covenant Church");
    await prisma.siteProfile.create({
      data: {
        id: 1,
        displayName: "Rev'd Silas O. Dada",
        titleLine: 'Conference Pastor, Old Ife Road Conference · New Covenant Church',
        portraitId,
        aboutPhotoId,
      },
    });
  }
  await prisma.settings.upsert({ where: { id: 1 }, update: {}, create: { id: 1 } });
}
