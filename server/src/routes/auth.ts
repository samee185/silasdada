import crypto from 'crypto';
import { Router } from 'express';
import bcrypt from 'bcryptjs';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { prisma } from '../db';
import { env } from '../env';
import { clearSession, requireAuth, setSession } from '../lib/auth';
import { handle, HttpError, parse } from '../lib/http';
import { toHtml, toPlain } from '../lib/messages';
import { sendEmail } from '../lib/outbox';

export const authRouter = Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many sign-in attempts. Please wait 15 minutes and try again.' },
});

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email('Enter a valid email address.'),
  password: z.string().min(1, 'Enter your password.'),
});

authRouter.post(
  '/login',
  loginLimiter,
  handle(async (req, res) => {
    const { email, password } = parse(loginSchema, req.body);
    const user = await prisma.user.findUnique({ where: { email } });
    const ok = user ? await bcrypt.compare(password, user.passwordHash) : false;
    if (!user || !ok) throw new HttpError(401, 'That email and password do not match.');
    setSession(res, user.id, user.sessionVersion);
    res.json({ user: publicUser(user) });
  }),
);

authRouter.post('/logout', (_req, res) => {
  clearSession(res);
  res.json({ ok: true });
});

authRouter.get(
  '/me',
  handle(async (req, res) => {
    if (!req.user) return res.json({ user: null });
    const profile = await prisma.siteProfile.findUnique({ where: { id: 1 } });
    res.json({ user: req.user, onboarded: Boolean(profile?.onboardedAt) });
  }),
);

const passwordSchema = z.object({
  current: z.string().min(1, 'Enter your current password.'),
  next: z.string().min(10, 'Use at least 10 characters.'),
});

authRouter.post(
  '/password',
  requireAuth,
  handle(async (req, res) => {
    const { current, next } = parse(passwordSchema, req.body);
    const user = await prisma.user.findUniqueOrThrow({ where: { id: req.user!.id } });
    if (!(await bcrypt.compare(current, user.passwordHash))) throw new HttpError(400, 'Your current password is not correct.');
    if (current === next) throw new HttpError(400, 'Some fields need attention.', { next: 'Choose a password different from the current one.' });
    const updated = await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: await bcrypt.hash(next, 12), sessionVersion: { increment: 1 } },
    });
    setSession(res, updated.id, updated.sessionVersion); // stay signed in here, signed out everywhere else
    res.json({ ok: true });
  }),
);

/** Is the browser claim page available? (only while SETUP_TOKEN is set and no owner exists) */
authRouter.get(
  '/claim',
  handle(async (_req, res) => {
    const owners = await prisma.user.count({ where: { role: 'OWNER' } });
    res.json({ available: Boolean(env.SETUP_TOKEN) && owners === 0 });
  }),
);

const claimSchema = z.object({
  token: z.string().min(1, 'Enter the setup code.'),
  name: z.string().trim().min(2, 'Enter a name.'),
  email: z.string().trim().toLowerCase().email('Enter a valid email address.'),
  password: z.string().min(10, 'Use at least 10 characters.'),
});

authRouter.post(
  '/claim',
  loginLimiter,
  handle(async (req, res) => {
    const data = parse(claimSchema, req.body);
    if (!env.SETUP_TOKEN || data.token !== env.SETUP_TOKEN) throw new HttpError(403, 'That setup code is not correct.');
    if ((await prisma.user.count({ where: { role: 'OWNER' } })) > 0) throw new HttpError(409, 'The owner account already exists. Please sign in.');
    const user = await prisma.user.create({
      data: { name: data.name, email: data.email, role: 'OWNER', passwordHash: await bcrypt.hash(data.password, 12) },
    });
    setSession(res, user.id, user.sessionVersion);
    res.json({ user: publicUser(user) });
  }),
);

// ─── Forgot / reset password ─────────────────────────────

const RESET_MINUTES = 60;
const hashToken = (t: string) => crypto.createHash('sha256').update(t).digest('hex');

/** Always answers the same way, so nobody can use it to find out which emails have accounts. */
authRouter.post(
  '/forgot',
  loginLimiter,
  handle(async (req, res) => {
    const { email } = parse(z.object({ email: z.string().trim().toLowerCase().email('Enter a valid email address.') }), req.body);
    const user = await prisma.user.findUnique({ where: { email } });
    if (user) {
      const token = crypto.randomBytes(32).toString('base64url');
      await prisma.passwordReset.create({
        data: { userId: user.id, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + RESET_MINUTES * 60_000) },
      });
      const site = await prisma.siteProfile.findUniqueOrThrow({ where: { id: 1 } });
      const r = {
        subject: 'Reset your password',
        lines: [
          `Hello ${user.name.split(' ')[0]},`,
          'Someone (hopefully you) asked to reset the password for your dashboard.',
          `This link works once and expires in ${RESET_MINUTES} minutes. If you did not ask for it, you can ignore this email; your password stays the same.`,
        ],
        cta: { label: 'Choose a new password', url: `${env.APP_URL}/admin/reset/${token}` },
      };
      try {
        await sendEmail({ to: user.email, subject: r.subject, text: toPlain(r), html: toHtml(r, site) });
      } catch (e) {
        console.error('Password reset email failed:', e);
      }
    }
    res.json({ ok: true });
  }),
);

const resetSchema = z.object({
  token: z.string().min(20),
  password: z.string().min(10, 'Use at least 10 characters.'),
});

authRouter.post(
  '/reset',
  loginLimiter,
  handle(async (req, res) => {
    const { token, password } = parse(resetSchema, req.body);
    const reset = await prisma.passwordReset.findUnique({ where: { tokenHash: hashToken(token) } });
    if (!reset || reset.usedAt || reset.expiresAt < new Date()) {
      throw new HttpError(400, 'This reset link has expired or was already used. Please ask for a new one.');
    }
    const user = await prisma.$transaction(async (tx) => {
      await tx.passwordReset.updateMany({ where: { userId: reset.userId, usedAt: null }, data: { usedAt: new Date() } });
      return tx.user.update({
        where: { id: reset.userId },
        data: { passwordHash: await bcrypt.hash(password, 12), sessionVersion: { increment: 1 } },
      });
    });
    setSession(res, user.id, user.sessionVersion);
    res.json({ user: publicUser(user) });
  }),
);

function publicUser(u: { id: string; name: string; email: string; role: string }) {
  return { id: u.id, name: u.name, email: u.email, role: u.role };
}
