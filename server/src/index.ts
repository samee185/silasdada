import express from 'express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { env } from './env';
import { prisma } from './db';
import { csrfGuard, loadUser } from './lib/auth';
import { ensureDefaults } from './lib/defaults';
import { errorHandler } from './lib/http';
import { mountSpa } from './lib/spa';
import { runMaintenance } from './lib/bookings';
import { appointmentsRouter } from './routes/appointments';
import { authRouter } from './routes/auth';
import { internalRouter } from './routes/internal';
import { publicRouter } from './routes/public';
import { adminPostsRouter, postsRouter } from './routes/posts';
import { aiRouter } from './routes/ai';
import { mediaApiRouter, mediaPublicRouter } from './routes/media';
import { scheduleRouter } from './routes/schedule';
import { siteRouter } from './routes/site';
import { teamRouter } from './routes/team';

const app = express();
app.set('trust proxy', 1); // Hostinger sits behind a proxy: needed for secure cookies and rate limits

app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'"], // the tiny no-flash theme script in index.html
        styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
        fontSrc: ["'self'", 'https://fonts.gstatic.com'],
        imgSrc: ["'self'", 'data:', 'blob:'],
        connectSrc: ["'self'"],
        frameAncestors: ["'none'"],
      },
    },
    crossOriginEmbedderPolicy: false,
  }),
);
app.use(express.json({ limit: '3mb' }));
app.use(cookieParser());
app.use(loadUser);

app.get('/health', async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ ok: true });
  } catch {
    res.status(503).json({ ok: false });
  }
});

const api = express.Router();
api.use(csrfGuard);
api.use('/auth', authRouter);
api.use('/site', siteRouter);
api.use('/media', mediaApiRouter);
api.use('/schedule', scheduleRouter);
api.use('/team', teamRouter);
api.use('/public', publicRouter);
api.use('/appointments', appointmentsRouter);
api.use('/internal', internalRouter);
api.use('/posts', postsRouter);
api.use('/admin/posts', adminPostsRouter);
api.use('/ai', aiRouter);
api.use((_req, res) => res.status(404).json({ error: 'Not found' }));
app.use('/api', api);
app.use('/media', mediaPublicRouter);

mountSpa(app); // serves client/dist when it has been built
app.use(errorHandler);

async function main() {
  await ensureDefaults();
  app.listen(env.PORT, () => {
    console.log(`✔ Server ready on port ${env.PORT} (${env.NODE_ENV})`);
  });
  // Reminders, expiries and email retries every 5 minutes while the app is running.
  // Hostinger's cron calls /api/internal/cron as a backup in case the app was asleep.
  const tick = () => runMaintenance().catch((e) => console.error('Maintenance failed:', e));
  setTimeout(tick, 20_000);
  setInterval(tick, 5 * 60_000).unref();
}

main().catch((e) => {
  console.error('✖ Could not start:', e);
  process.exit(1);
});
