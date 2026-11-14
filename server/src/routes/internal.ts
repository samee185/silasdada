import crypto from 'crypto';
import { Router } from 'express';
import { env } from '../env';
import { runMaintenance } from '../lib/bookings';
import { handle, HttpError } from '../lib/http';

/**
 * Called by Hostinger's cron every 10–15 minutes:
 *   curl -s -X POST -H "x-cron-secret: YOUR_SECRET" https://silasdada.com.ng/api/internal/cron
 * The app also runs the same job every 5 minutes on its own while it is awake.
 */
export const internalRouter = Router();

internalRouter.post(
  '/cron',
  handle(async (req, res) => {
    const given = Buffer.from(String(req.get('x-cron-secret') ?? ''));
    const expected = Buffer.from(env.CRON_SECRET);
    if (!env.CRON_SECRET || given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) {
      throw new HttpError(403, 'Forbidden');
    }
    res.json(await runMaintenance());
  }),
);
