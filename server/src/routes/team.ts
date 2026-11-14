import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from '../db';
import { requireRole } from '../lib/auth';
import { handle, HttpError, parse } from '../lib/http';

/** Rev'd Dada adds or removes his secretary's login. */
export const teamRouter = Router();
teamRouter.use(requireRole('OWNER'));

teamRouter.get(
  '/',
  handle(async (_req, res) => {
    const users = await prisma.user.findMany({
      select: { id: true, name: true, email: true, role: true, createdAt: true },
      orderBy: { createdAt: 'asc' },
    });
    res.json({ users });
  }),
);

const createSchema = z.object({
  name: z.string().trim().min(2, 'Enter her name.'),
  email: z.string().trim().toLowerCase().email('Enter a valid email address.'),
  password: z.string().min(10, 'Use at least 10 characters.'),
});

teamRouter.post(
  '/',
  handle(async (req, res) => {
    const data = parse(createSchema, req.body);
    if (await prisma.user.findUnique({ where: { email: data.email } })) throw new HttpError(409, 'That email already has an account.');
    const user = await prisma.user.create({
      data: { name: data.name, email: data.email, role: 'SECRETARY', passwordHash: await bcrypt.hash(data.password, 12) },
      select: { id: true, name: true, email: true, role: true, createdAt: true },
    });
    res.status(201).json({ user });
  }),
);

teamRouter.delete(
  '/:id',
  handle(async (req, res) => {
    const id = String(req.params.id);
    const user = await prisma.user.findUnique({ where: { id } });
    if (!user) throw new HttpError(404, 'Account not found.');
    if (user.role === 'OWNER') throw new HttpError(400, "The pastor's own account can't be removed here.");
    await prisma.user.delete({ where: { id } });
    res.json({ ok: true });
  }),
);
