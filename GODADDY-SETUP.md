# GoDaddy / DNS Setup — mountolympusdetailing.com

Everything below was verified against the **public** registry and DNS on 2026-07-21 using
`node scripts/check-domain.mjs`. No account access was used or required. Re-run that script any
time to re-check.

---

## ⚠️ Read this first

**There is a live website on your domain right now**, built with GoDaddy Website Builder
("Detailing for the champions." + a contact form). It is served from GoDaddy's A records.

**The moment you repoint the A records at the new app, that site goes down.** That's the
intended outcome eventually — but do not do it as your first step. Stage on a subdomain,
confirm the new site works end to end, then cut the root over. Sequence is in §4.

---

## 1. What you already have ✅

| Item | Status |
|---|---|
| Domain registered | ✅ `mountolympusdetailing.com`, registered 2025-02-18, **expires 2028-02-18** |
| Registrar | ✅ GoDaddy.com, LLC |
| DNS hosting | ✅ GoDaddy (`ns03`/`ns04.domaincontrol.com`) — **all records below go in GoDaddy DNS** |
| `www` → root | ✅ CNAME already in place |
| Email receiving | ✅ Microsoft 365 (`MX → mountolympusdetailing-com.mail.protection.outlook.com`) |
| SPF | ✅ Correct — see note below |

**SPF note.** The record is `v=spf1 include:secureserver.net -all`, which looks like it would
break Microsoft 365 mail. I resolved the full include chain to check:

```
secureserver.net → spf-0.secureserver.net → spf.protection.outlook.com
```

Microsoft **is** covered, at 3 of the 10 permitted DNS lookups. Nothing to fix. Leave it alone.

---

## 2. What's missing ❌

| Item | Impact |
|---|---|
| **Resend DKIM records** | **Customer confirmation emails cannot send.** Resend will not send from an unverified domain |
| **DMARC record** | No protection against spoofing; Google/Yahoo increasingly penalise its absence |
| **Anything pointing at the new app** | The domain still serves the old Website Builder page |

---

## 3. Records to add in GoDaddy

**Where:** GoDaddy → *My Products* → domain → **DNS** → *Manage Zones* → *Add Record*.

### 3a. Resend — required for customer email

Do this in Resend first: **Domains → Add Domain → enter `send.mountolympusdetailing.com`.**

> **Use the `send.` subdomain, not the root.** Your root domain already carries Microsoft 365
> mail with a `-all` hard-fail SPF. Verifying a subdomain keeps Resend entirely separate from
> your business email — no chance of breaking inbound M365 mail, and no edits to the working
> SPF record.

Resend then shows you 3 records. They are unique to your account, so I can't pre-fill the
values — copy them across exactly:

| Type | Name (as typed in GoDaddy) | Value |
|---|---|---|
| TXT | `send` | `v=spf1 include:amazonses.com ~all` *(Resend shows the exact string)* |
| TXT | `resend._domainkey.send` | the long `p=MIGf...` key from Resend |
| MX | `send` | `feedback-smtp.us-east-1.amazonses.com` (priority 10) |

⚠️ GoDaddy appends the domain automatically. Enter `send`, **not**
`send.mountolympusdetailing.com` — otherwise you create `send.mountolympusdetailing.com.mountolympusdetailing.com`. This is the single most common mistake here.

Then in `.env.local`:

```
MAIL_FROM=Mount Olympus Detailing <hello@send.mountolympusdetailing.com>
```

Verification usually completes in minutes; GoDaddy can take up to an hour to propagate.

### 3b. DMARC — recommended

| Type | Name | Value | TTL |
|---|---|---|---|
| TXT | `_dmarc` | `v=DMARC1; p=none; rua=mailto:Luis.rodriguez621@outlook.com; fo=1` | 1 hour |

`p=none` monitors without affecting delivery. Once Resend and M365 are both passing for a few
weeks, tighten to `p=quarantine`.

### 3c. Pointing the domain at the new app

**Cannot be filled in until hosting is chosen** — the values come from the host.

- **Vercel:** `A` on `@` → `76.76.21.21`, and `CNAME` on `www` → `cname.vercel-dns.com`
- **Render / Railway:** they issue a per-service hostname; `CNAME` on `www`, `A` or `ALIAS` on `@`
- **VPS:** `A` on `@` → your server's IP

⚠️ Whichever it is, this replaces the two existing A records
(`13.248.243.5`, `76.223.105.230`) and takes the Website Builder site offline.

---

## 4. Recommended cutover sequence

1. **Deploy the new app** to the chosen host. It gets a temporary URL (e.g.
   `mount-olympus.onrender.com`).
2. **Add a staging subdomain** in GoDaddy — `CNAME` on `app` → the host's hostname. Set
   `NEXT_PUBLIC_SITE_URL=https://app.mountolympusdetailing.com`.
3. **Test everything on the staging URL**: submit a real estimate, confirm the row lands in the
   database, confirm the email arrives, confirm Stripe (once added) charges correctly.
4. **Add the Resend records** (§3a) and verify. Confirm a customer email actually arrives.
5. **Only then repoint the root.** Replace the two A records, keep the `www` CNAME.
   Set `NEXT_PUBLIC_SITE_URL=https://mountolympusdetailing.com`.
6. **Flip `robots` to index** in `app/layout.tsx` — it is currently `noindex` on purpose.
7. **Cancel the GoDaddy Website Builder subscription** once you're happy. It is a separate
   paid product from the domain registration, and it is no longer doing anything.

Keep TTL low (600s) on the records you're about to change, a day beforehand — it makes
rollback fast if anything is wrong.

---

## 5. Things worth knowing

- **`olympusdetailing.com` is registered to someone else** (DomainRegistry.com, May 2026,
  different nameservers). Not yours, not a conflict, but be aware it exists if you were
  planning to acquire it.
- **`mountolympusdetailing.net`, `mtolympusdetailing.com`, and `mountolympusdetail.com` are all
  still available** — worth registering defensively and redirecting to the main domain.
- **Your existing tagline is "Detailing for the champions."** — pulled from the current site.
  The new site currently uses per-industry headlines instead; say the word and I'll work the
  real tagline in.
- **The current site has no real content to migrate** — no address, no hours, no reviews, no
  photos, no social links. Nothing will be lost.
- **You have Microsoft 365 on the domain**, so `luis@mountolympusdetailing.com` is likely
  available to you. Using it instead of the Outlook.com address would look more established on
  quotes and invoices. The site's contact address is one line in `lib/business.ts`.

---

## 6. Quick re-check

```bash
node scripts/check-domain.mjs                      # the default candidate list
node scripts/check-domain.mjs mountolympusdetailing.com
```

Reports registration, registrar, nameservers, A/CNAME/MX, SPF, DMARC, and Resend DKIM status.
