# Hosting 10+ apps on one server — the price-efficient setup

This guide stands up **one cheap VPS that hosts ten (or more) apps like this one**,
each on its own domain with automatic HTTPS, isolated data, and backups — for
roughly **$2 per app per month** all-in. That is about a tenth of what
per-app platforms (Railway/Render/Vercel) cost at the same count.

It works because this app is already built for it: it ships a `Dockerfile`, keeps
all its state in one `/data` volume (SQLite file + uploads), and needs no separate
database server. Ten apps = ten containers + ten data folders on one box.

There are **two paths**. Pick one:

- **Path A — Coolify** (recommended): a free, self-hosted dashboard (think
  "your own Vercel"). You deploy each app from GitHub with a few clicks; it
  handles TLS, routing, restarts, env vars, volumes, and updates. Best if you do
  not want to live in a terminal.
- **Path B — Docker Compose + Caddy** (lean/manual): everything from a couple of
  config files in `deploy/`. Lowest overhead, full control, no dashboard. Best
  if you are comfortable with SSH.

Both run on the **same server**, so the hardware choice below is identical.

---

## 1. The server

| Item | Recommendation | ~Cost/mo | Notes |
|---|---|---|---|
| **VPS** | **Hetzner Cloud CPX31** — 4 vCPU, **8 GB RAM**, 160 GB NVMe | **~€14 / ~$15** | Best price/performance available. 8 GB (not 4) is the safe size for 10 apps — see the math below. |
| **Backup storage** | Backblaze B2 or Cloudflare R2 | ~$1–5 | S3-compatible; pairs with Litestream. |
| **Total** | | **~$16–20** | ≈ **$2/app** at ten apps. |

**Alternatives to Hetzner:** Netcup and OVH are similarly cheap (EU); DigitalOcean,
Vultr, and Linode are pricier but have slicker dashboards and US regions. Any of
them works — the setup below is provider-agnostic.

### Why 8 GB, not 4

- This app at runtime: **~150–250 MB idle**, ~350 MB under light traffic.
- Ten of them: **~2.5–4 GB**. Docker + proxy + OS (+ Coolify): **~1.5 GB**.
- Realistic total: **~4–5.5 GB.** 4 GB would be tight and risky; 8 GB gives headroom.
- The real spike is **`next build`** (~1–2 GB, briefly). You deploy one app at a
  time, so 4 vCPU / 8 GB handles serial builds plus ten low-traffic runtimes.
- Start on CPX31. If you outgrow it, Hetzner **resizes in place** in ~1 minute.

### Buy + first boot

1. Create a Hetzner Cloud account and a project.
2. Create a server: **Ubuntu 24.04**, type **CPX31**, add your SSH key.
3. Note its public IPv4. SSH in: `ssh root@YOUR_SERVER_IP`.
4. Basic hardening (5 minutes, do it once):
   ```bash
   apt update && apt upgrade -y
   # A non-root user for day-to-day work:
   adduser deploy && usermod -aG sudo deploy
   # Firewall: allow SSH + web only.
   ufw allow OpenSSH && ufw allow 80 && ufw allow 443 && ufw --force enable
   # Optional but recommended: fail2ban to blunt SSH brute-force.
   apt install -y fail2ban
   ```

---

## 2. DNS — the step that must come first

For **every** app's domain, at your registrar (GoDaddy for
mountolympusdetailing.com — see `GODADDY-SETUP.md`), create:

| Type | Name | Value |
|---|---|---|
| A | `@` | YOUR_SERVER_IP |
| A | `www` | YOUR_SERVER_IP |

TLS certificates are issued by proving you control the domain, so **the A record
must resolve before the certificate can be issued**. Do this for each domain up
front. (Propagation is usually minutes, occasionally up to an hour.)

---

## Path A — Coolify (recommended)

Coolify is an open-source, self-hosted deployment platform: a web dashboard that
turns "ten Docker apps with TLS and git-deploys" into point-and-click.

### Install (one command, ~5 minutes)

```bash
curl -fsSL https://cdn.coollabs.io/coolify/install.sh | bash
```

It installs Docker, its own reverse proxy (Traefik) with automatic HTTPS, and the
dashboard. When it finishes it prints a URL (`http://YOUR_SERVER_IP:8000`) — open
it, create the admin account, and you are in.

### Deploy each app

For each of your ten apps:

1. **Sources → GitHub** → connect the app's private repo (Coolify walks you
   through a GitHub App connection once; after that every repo is one click).
2. **New Resource → Application → from your repo.** Coolify detects the
   `Dockerfile` and uses it.
3. **Persistent storage:** add a volume mounted at **`/data`**. *This is the
   one step that, if skipped, loses all data on every deploy.*
4. **Environment variables:** paste the app's values (see the table in
   `DEPLOY.md` § Step 3). Set `DATABASE_PATH=/data/data.sqlite` and
   `UPLOAD_DIR=/data/uploads`. Add `NEXT_PUBLIC_SITE_URL` as a **build
   variable** too (Coolify has a checkbox for "available at build time").
5. **Domain:** enter the app's domain. Coolify points Traefik at it and issues
   the certificate automatically once DNS resolves.
6. **Deploy.** First build takes a few minutes; subsequent ones are cached.

Repeat for apps 2–10. Each is isolated, on its own domain, with its own volume.

### After first deploy of THIS app

Open the app's terminal (Coolify gives each resource a shell) and create your
owner login, then clear any test data — same as `DEPLOY.md` §4–5:

```bash
npm run create-admin -- "Your Name" luis.rodriguez621@outlook.com
```

### Updates

Enable **automatic deployment on push** per app (a Coolify toggle). From then on:
`git push` → Coolify rebuilds and redeploys that app. Nothing manual.

### Backups

Coolify has **scheduled database backups** built in, but they target managed
databases — this app uses SQLite files, so use the Litestream approach in
§ Backups below, which protects the SQLite files directly regardless of platform.

---

## Path B — Docker Compose + Caddy (lean/manual)

Everything lives in the `deploy/` folder of this repo. No dashboard.

### Install Docker

```bash
curl -fsSL https://get.docker.com | sh
```

### Lay it out

On the server, put each app's repo somewhere (e.g. `/srv/apps/mountolympus`,
`/srv/apps/client-two`, …). In this app's `deploy/` folder:

1. Copy the env template and fill it in — **one per app**:
   ```bash
   cp app-mountolympus.env.example app-mountolympus.env
   # edit app-mountolympus.env — set IP_HASH_SALT, RESEND_API_KEY, etc.
   ```
2. Edit **`Caddyfile`** — one block per domain (a template block is already
   there; uncomment and copy it per app).
3. Edit **`docker-compose.multi.yml`** — one service + one named volume per app
   (again, a commented template service is included).

### Run

```bash
cd deploy
docker compose -f docker-compose.multi.yml up -d --build
```

That builds every app, starts Caddy, and Caddy issues a certificate per domain on
first request. Check it:

```bash
docker compose -f docker-compose.multi.yml ps
docker compose -f docker-compose.multi.yml logs -f app-mountolympus
```

### First-run setup for THIS app

```bash
docker compose -f docker-compose.multi.yml exec app-mountolympus \
  npm run create-admin -- "Your Name" luis.rodriguez621@outlook.com
```

### Updates

```bash
git -C /srv/apps/mountolympus pull
docker compose -f docker-compose.multi.yml up -d --build app-mountolympus
```

Only the one app rebuilds; the other nine keep running untouched.

### Adding app 2…10 — one command

Instead of hand-editing three files, run the helper (it edits the compose file,
the Caddyfile, and creates the env file atomically, and generates the app's
rate-limit salt):

```bash
scripts/new-tenant.sh <slug> <domain> [build-context]

# same app, another client:
scripts/new-tenant.sh client-two clienttwo.com
# a different app in another repo:
scripts/new-tenant.sh acme acme.com ../acme-repo
```

It refuses to run if that slug already exists, so it is safe to re-run. Then:
fill in `deploy/app-<slug>.env`, point DNS, and
`docker compose -f docker-compose.multi.yml up -d --build app-<slug>`.

Each new app is fully isolated: own container, own `/data` volume, own domain +
certificate. (Prefer to do it by hand? The three template blocks are still in
the files, commented, above the `NEW-TENANT-*` markers the script inserts at.)

---

## Backups (both paths) — Litestream + uploads

Two kinds of state, protected two ways:

**1. The SQLite databases → Litestream (continuous).**
A plain nightly `cp` of a live SQLite file can capture a corrupt, half-written
copy. Litestream streams changes to object storage continuously and gives you
point-in-time restore. Copy `deploy/litestream.yml.example` → `litestream.yml`,
add your Backblaze B2 (or R2) bucket + keys, list every app's database, and run
Litestream as a small container/service. Restore is one command per app:

```bash
litestream restore -o /data/data.sqlite s3://your-bucket/mountolympus
```

**2. The uploaded photos → nightly sync.**
Photos are files, not database rows. Add a nightly cron that mirrors each app's
`/data/.../uploads` to the same bucket:

```bash
# /etc/cron.daily/backup-uploads  (chmod +x)
rclone sync /var/lib/docker/volumes /b2:your-backup-bucket/volumes --exclude '*.sqlite*'
```

Test a restore **before** you need it — an untested backup is a guess.

---

## What this buys you, and the honest limits

**You get:** ten independent apps, each on its own domain with auto-renewing
HTTPS, isolated so one crashing never touches the others, no per-app database
cost (SQLite files), and continuous backups — on one ~$15 box.

**The limits, stated plainly:**
- **One box = one basket.** If the server dies, all ten are down until it is
  restored. That is the price/simplicity trade. Mitigation: keep the Litestream
  backups off-box (they are), so a rebuild + restore brings everything back on a
  fresh VPS in under an hour. If any single app ever needs true high
  availability, lift *that one* to a managed host; leave the rest here.
- **SQLite is single-writer per app.** Perfect for small-business traffic (one
  shop, a handful of concurrent users). An app that grows into heavy concurrent
  writes should move to Postgres — the app's `lib/db.ts` is the only file that
  touches SQL, by design, so that migration is contained.
- **Build resources are shared.** Don't rebuild all ten at once on an 8 GB box —
  deploy one at a time (both paths do this naturally).

---

## Quick decision

- **Want a dashboard and the least ops pain?** → Path A (Coolify). Recommended.
- **Comfortable in a terminal and want the leanest possible stack?** → Path B.
- Either way: **Hetzner CPX31, 8 GB, ~$15/mo**, Backblaze B2 for backups,
  ~$2/app all-in.
