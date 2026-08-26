# Deploying — and turning on automatic updates

This app is one codebase that serves the marketing site, the customer PWA, the
employee portal, and the admin. Deploying it once puts all of that live; after
that, **every `git push` redeploys automatically**.

---

## The one rule that will bite you if ignored

The app stores its **database (`data.sqlite`) and uploaded photos on disk**.
That means it needs a host with a **persistent disk / volume**:

- ✅ Railway, Render, Fly.io, a VPS — all have persistent volumes.
- ❌ **Vercel and Netlify will silently lose all data on every deploy.** Do not
  use them for this app as-is.

It also needs **Node 24** (the database uses Node's built-in `node:sqlite`). The
included `Dockerfile` pins that, so any host that builds from the Dockerfile is
safe.

---

## Step 1 — Put the code on GitHub (once)

The repository is already initialised and committed locally. Create an **empty
private** repo on github.com (private — the code contains your business contact
details), then, from this folder:

```bash
git remote add origin https://github.com/<you>/<repo>.git
git push -u origin main
```

Private matters: this is your business logic and contact info.

## Step 2 — Create the service on your host

**Railway** (fastest):
1. New Project → Deploy from GitHub repo → pick the repo.
2. It detects the `Dockerfile` and builds.
3. Add a **Volume**, mount path `/data`.
4. Set the environment variables (below).
5. Generate a domain (a free `*.up.railway.app` URL) — done.

**Render**:
1. New → Web Service → connect the repo. Runtime: **Docker**.
2. Add a **Disk**, mount path `/data`, 1 GB is plenty to start.
3. Set the environment variables (below).
4. Deploy.

(There is a `render.yaml` in the repo that pre-declares the disk and variables —
Render can read it as a Blueprint.)

## Step 3 — Environment variables (set on the host, never in the code)

Copy these into your host's Variables/Secrets panel. The secrets currently in
your local `.env.local` (Resend key, IP salt) must be re-entered here — they are
gitignored and never leave your machine.

| Variable | Value | Needed for |
|---|---|---|
| `NEXT_PUBLIC_SITE_URL` | your live URL, e.g. `https://mountolympusdetailing.com` | links, password-reset & booking emails |
| `DATABASE_PATH` | `/data/data.sqlite` | the persistent database |
| `UPLOAD_DIR` | `/data/uploads` | the persistent photo store |
| `IP_HASH_SALT` | a random 64-char hex string | rate limiting survives restarts |
| `RESEND_API_KEY` | your `re_…` key | estimate/booking emails |
| `MAIL_FROM` | `Mount Olympus Detailing <onboarding@resend.dev>` (or your verified domain) | sender |
| `BUSINESS_EMAIL` | `luis.rodriguez621@outlook.com` | who estimate alerts go to |
| `CRON_SECRET` | a random string | appointment reminders (optional) |
| `ANTHROPIC_API_KEY` | your key | AI assistant (optional) |
| `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` | your keys | online payments (optional) |
| `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_SUBJECT` | from `npm run generate-vapid` | push notifications (optional) |

Generate the salt: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`

Also pass `NEXT_PUBLIC_SITE_URL` as a **build arg** (Railway/Render do this from
the same variable automatically) — it is compiled into the client bundle.

## Step 4 — Create your owner login (once, after first deploy)

Open a shell on the host (Railway: the service's shell; Render: the Shell tab) and run:

```bash
npm run create-admin -- "Your Name" luis.rodriguez621@outlook.com
```

It prints a one-time password. Sign in at `/login` and change it.

## Step 5 — Start clean

Before real customers arrive, delete the test data created during development:

```bash
rm -f /data/data.sqlite /data/data.sqlite-wal /data/data.sqlite-shm
```

Then re-run Step 4 to recreate your owner account on the fresh database.

---

## From now on: automatic updates

Once Steps 1–2 are connected, the loop is:

```
change the code  →  git push  →  host rebuilds & redeploys  →  live in ~2 minutes
```

That is the "automatic" part. Any change — a new price, a new service, a copy
tweak — goes live by pushing. Nothing is copied by hand, and the marketing site,
customer app, and admin all update together because they are one app.

## What you can already change WITHOUT a deploy

From `/admin`, live and instantly (no code, no push):

- Business hours, buffer, travel time, minimum notice, cancellation window
- Holidays and closures
- Service areas
- Employees, roles, schedules, time off
- Membership plans, promotions

Pricing and the service menu are currently in code (they deploy). Making those
admin-editable too is a separate enhancement — see the app's issue list / ask.

---

## Custom domain (mountolympusdetailing.com)

Launch on the free host URL first, then point the domain when ready — see
`GODADDY-SETUP.md`. Add the domain in the host's Domains panel, create the DNS
record it gives you at GoDaddy, and update `NEXT_PUBLIC_SITE_URL`. HTTPS is
issued automatically by the host.
