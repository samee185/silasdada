# silasdada.com.ng

Rev'd Silas O. Dada's website: messages and appointments.
Node.js + Express + TypeScript (server), React + TypeScript + Vite (client), MySQL through Prisma.

```
server/   API, database schema (prisma/schema.prisma), serves the built site
client/   React app: public site + Pastor's Desk dashboard
```

## What's in this build (stages 1–5, deployment still to do)

- Home page with every approved animation: preloader, hero load sequence, cursor spotlight and parallax, drifting glows, light rays, sweeping beam, stars, rising lights, scroll reveals, button shine
- Light and dark mode on every page, remembered per browser, no flash on load
- Sign-in, and a one-time page to create Rev'd Dada's account (`/admin/claim`)
- First-time setup wizard (`/admin/setup`): profile and photos, contacts and socials, meeting rules, usual week
- Dashboard shell with roles: the pastor sees everything; the secretary sees only messages and website content
- Website content editor and secretary access page
- Photos are shrunk in the browser and stored in MySQL, so redeploys never lose them
- Server-side page titles and previews for Google and WhatsApp links

**Accounts**
- **Forgot your password?** on the sign-in page emails a one-time link to `/admin/reset/<token>`. The link expires after 1 hour, and only a hash of it is stored.
- **My account** in the dashboard (pastor and secretary): change password.
- Changing or resetting a password signs that account out on every other device.
- `npm run create-admin` still works as a terminal fallback.

**Stage 2: booking and scheduler**
- Public booking page `/book`:
  - two-week calendar showing only free times, with an in-person / WhatsApp call filter
  - details form with the privacy note
  - instant confirmation, or "request sent" if approval is switched on
- Manage page `/booking/<token>` (the link in every email): view, change the time, or cancel
- Slot engine:
  - usual week plus single-day changes
  - meeting length, break between meetings, minimum notice, booking window and daily limit
  - all times in Africa/Lagos
- No double bookings: each date is locked while a booking is written, and a unique start-time key backs this up
- Dashboard → Appointments:
  - tabs: upcoming, waiting for approval, asked to reschedule, past
  - actions: approve, decline, cancel, ask to reschedule, mark completed
  - "Call on WhatsApp" button
  - booking reasons are hidden until tapped
  - add a booking by hand, with an overlap warning
- Dashboard → My schedule:
  - change a day or a date range (usual hours, different hours, or closed)
  - live check of affected bookings: keep, ask to reschedule, or cancel each one, with an optional message
  - usual week and meeting rules editors
- Dashboard home: today's meetings, new bookings, approvals, and the WhatsApp send list

**Stage 3: email, reminders and WhatsApp**
- Emails, sent through Hostinger SMTP:
  - booked or requested, approved, declined, cancelled, reschedule request, moved, expired
  - reminders 24 hours before (only when booked more than 24 hours ahead) and 1 hour before
  - a calendar invite (.ics) with every confirmation
- The pastor gets an email for each new booking and each cancellation
- WhatsApp send list on the dashboard: one tap opens WhatsApp with the message typed, and it's ticked off
- Outbox:
  - every message is queued first and claimed before sending, so nothing goes out twice
  - failed emails retry after 5 minutes, 30 minutes and 2 hours
- Housekeeping, every 5 minutes inside the app plus Hostinger's cron as a backup:
  - expire unanswered requests and mark past meetings completed
  - delete booking reasons 90 days after the meeting

**Stage 4: messages**
- `/messages`:
  - latest message featured, then a grid
  - series filter chips and search by title or scripture
- `/messages/<slug>`:
  - scripture cover whose verse appears word by word
  - **Listen** player that reads the message aloud with the device's own voice: play/pause, speed 1×/1.25×/1.5×, moving sound wave
  - reading progress bar
  - WhatsApp-first share buttons, cell-group questions, author card, "in this series", keep reading
- Home page shows the latest four messages. The hero's floating card links to the newest, and the scrolling band shows series names once there are three.
- Dashboard → Messages:
  - list with draft / scheduled / published filters, and series management
  - editor with headings, lists, scripture quote blocks and links
  - cover verse with four colour styles and a live preview
  - series and part, date preached, discussion questions, WhatsApp caption, Google title and description, web address
  - publish now, save as draft, or schedule for a Lagos date and time (the 5-minute housekeeping publishes it)
- Rev'd Dada and the secretary can both write and publish messages.
- SEO:
  - each message page is sent with its own title, description and WhatsApp/Facebook preview
  - Article structured data, plus the message text inside the page for search engines
  - `/sitemap.xml` (all live messages) and `/robots.txt` (keeps /admin and booking links out of Google)
- Message HTML is cleaned on the server: only safe formatting is kept.

**Stage 5: AI drafts (Gemini free tier)**
- Dashboard home and **AI drafts**: paste sermon notes or a transcript, then tap **Draft with AI** (about 20–40 seconds)
- The draft contains:
  - three title options, a summary and key points
  - the full message in his words, with headings
  - scriptures mentioned (flagged for checking) and a cover line
  - three cell-group questions, a WhatsApp caption and a Google description
- **Create message from this draft** turns it into a draft message in the editor. Nothing is ever published automatically.
- The instructions to the AI: keep his wording, add no stories or claims, never invent Bible verse text, use Nigerian/British spelling.
- Only the pasted notes are sent to Google; no booking or personal data ever is. Limit of 30 drafts per person per day.
- Setup: get a free key at https://aistudio.google.com → **Get API key**, then set `GEMINI_API_KEY`. `GEMINI_MODEL` defaults to `gemini-3.8-flash`; if Google renames its free models, change it to any model marked "Free" in AI Studio.

## Run it on your computer (Windows, PowerShell)

1. **Install** Node.js 20 or newer and MySQL (MySQL Installer or XAMPP). Create an empty database called `silasdada`.
2. **Configure:**
   ```powershell
   Copy-Item .env.example .env
   node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
   ```
   Open `.env` and fill in `DATABASE_URL`. Paste the long string from the second command into `JWT_SECRET`, and put any code you like in `SETUP_TOKEN`.
3. **Install and create the tables:**
   ```powershell
   npm install
   npm run db:push
   ```
4. **Start:**
   ```powershell
   npm run dev
   ```
   Open http://localhost:5173. The API runs on port 3000 behind it.
5. **Create the pastor's account:** go to http://localhost:5173/admin/claim and enter your `SETUP_TOKEN`. You land in first-time setup.
   (Or from the terminal: `npm run create-admin`.)

## Deploy to Hostinger (Business plan, Node.js web app)

1. **Database:** in hPanel → Databases → MySQL, create a database and user. Note the host, name, user and password.
2. **Add the app:** in hPanel → Websites → Add website → Node.js app → connect the GitHub repo (or upload a zip without `node_modules`).
3. **Build settings:**
   - Build command: `npm run build:hostinger` (builds the site and creates/updates the tables)
   - Start command / entry file: `npm start` / `server/dist/index.js`
   - Node version: 20 or newer
4. **Environment variables:** add everything from `.env.example`, with:
   - `NODE_ENV=production`
   - `APP_URL=https://silasdada.com.ng`
   - your Hostinger `DATABASE_URL`
   - a new `JWT_SECRET`
   - a `SETUP_TOKEN`
5. **Email:** create a mailbox in hPanel → Emails (e.g. `appointments@silasdada.com.ng`). Set `SMTP_HOST=smtp.hostinger.com`, `SMTP_PORT=465`, `SMTP_USER` (the full address), `SMTP_PASS` and `MAIL_FROM`. In hPanel → Emails → DNS records, make sure SPF, DKIM and DMARC are set, so emails don't land in spam.
6. **Cron:** set `CRON_SECRET` to a long random string. Then in hPanel → Advanced → Cron Jobs, add a custom command that runs every 10 minutes:
   ```
   curl -s -X POST -H "x-cron-secret: YOUR_CRON_SECRET" https://silasdada.com.ng/api/internal/cron
   ```
7. **Deploy,** then open `https://your-domain/admin/claim` to create Rev'd Dada's account. Afterwards remove `SETUP_TOKEN` and redeploy.
8. **Check it's running:** `https://your-domain/health` should return `{"ok":true}`.

If the build can't reach the database, deploy with `npm run build` instead and run `npm run db:push` once over SSH.

## Without email set up

If `SMTP_HOST` is empty, emails are written to the server log instead of being sent ("[email not configured] To …"). Bookings and the WhatsApp send list still work, which is handy for testing on your computer.

## Useful commands

| Command | What it does |
| --- | --- |
| `npm run dev` | Server + client with live reload |
| `npm run build` | Production build (client → `client/dist`, server → `server/dist`) |
| `npm start` | Run the production build |
| `npm run db:push` | Create or update the MySQL tables from `server/prisma/schema.prisma` |
| `npm run create-admin` | Create or reset a login from the terminal |
| `npm run typecheck` | Type-check server and client |
