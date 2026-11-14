import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import type { Role } from '@prisma/client';
import { env, isProd } from '../env';
import { prisma } from '../db';
import { HttpError } from './http';

const COOKIE = 'sd_session';
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export function setSession(res: Response, userId: string, sessionVersion = 0) {
  const token = jwt.sign({ sub: userId, v: sessionVersion }, env.JWT_SECRET, { expiresIn: '7d' });
  res.cookie(COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: isProd,
    maxAge: MAX_AGE_MS,
    path: '/',
  });
}

export function clearSession(res: Response) {
  res.clearCookie(COOKIE, { path: '/' });
}

/** Reads the session cookie (if any) and attaches req.user. Never blocks. */
export async function loadUser(req: Request, _res: Response, next: NextFunction) {
  const token = req.cookies?.[COOKIE];
  if (!token) return next();
  try {
    const payload = jwt.verify(token, env.JWT_SECRET) as { sub: string; v?: number };
    const user = await prisma.user.findUnique({ where: { id: payload.sub } });
    // a password change elsewhere invalidates older sessions
    if (user && (payload.v ?? 0) === user.sessionVersion) req.user = { id: user.id, role: user.role, name: user.name, email: user.email };
  } catch {
    // expired or tampered: treat as signed out
  }
  next();
}

export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  if (!req.user) return next(new HttpError(401, 'Please sign in.'));
  next();
}

export const requireRole =
  (...roles: Role[]) =>
  (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) return next(new HttpError(401, 'Please sign in.'));
    if (!roles.includes(req.user.role)) return next(new HttpError(403, 'Your account cannot open this page.'));
    next();
  };

/**
 * CSRF guard: every state-changing /api request must carry the x-sd-csrf header.
 * Browsers never add custom headers to cross-site form posts, and the session
 * cookie is SameSite=Lax, so forged requests from other sites are rejected.
 */
export function csrfGuard(req: Request, _res: Response, next: NextFunction) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  if (req.path.startsWith('/internal/')) return next(); // cron uses its own secret
  if (req.get('x-sd-csrf') !== '1') return next(new HttpError(403, 'Request blocked for your security. Refresh and try again.'));
  next();
}
