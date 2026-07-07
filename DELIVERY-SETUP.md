# LumaFit — Automated delivery (Stripe → Cloudflare → R2 → Resend)

This is the **self-hosted, ~$0/month** delivery route. When someone pays, Stripe calls a
Cloudflare Pages Function, which emails the buyer **three signed, expiring download links**.
The PDFs live in a **private** R2 bucket and are streamed by a second Function — they are never
public and are never uploaded with the website.

> Built & unit-tested in this repo. Steps marked **[you]** need your Cloudflare / Stripe / Resend
> dashboards — I can't do those. Code is done.

## How it works
```
Buyer pays (Stripe Payment Link)
        │  Stripe sends "checkout.session.completed"
        ▼
/api/stripe-webhook   ── verifies Stripe signature
        │              ── mints 3 signed links (HMAC + 72h expiry)
        │              ── emails them via Resend
        ▼
Buyer clicks a link → /api/download?token=…
        │              ── verifies token (signature + not expired + allow-listed file)
        ▼
Streams guide.pdf / tracker.pdf / food-list.pdf  from the PRIVATE R2 bucket
```

Files in this repo:
- `functions/api/stripe-webhook.js` — the webhook handler (POST).
- `functions/api/download.js` — the gated download endpoint (GET).
- `functions/utils/delivery.js` — shared crypto/token/email helpers (no npm deps).
- `test/delivery.test.mjs` — run `node test/delivery.test.mjs` (15 checks; all pass).

---

## Setup

### 1. Private R2 bucket + upload the PDFs **[you]**
- Cloudflare dashboard → **R2** → **Create bucket**, e.g. `lumafit-files`. **Keep it private**
  (do NOT enable a public `r2.dev` URL or a public custom domain).
- Upload `product/guide.pdf`, `product/tracker.pdf`, `product/food-list.pdf` — keep the **exact**
  filenames (the code's allow-list is `guide.pdf`, `tracker.pdf`, `food-list.pdf`).

### 2. Resend account + verified sending domain **[you]**
- Sign up at resend.com (free tier: 3,000 emails/mo, 100/day — ample).
- **Domains → Add domain** `lumafit.org`, then add the **SPF + DKIM DNS records** it shows you in
  Cloudflare DNS. Wait for "Verified".
- **API Keys → Create** → copy the `re_…` key.
- Pick a from-address on the verified domain, e.g. `hello@lumafit.org`.

### 3. Deploy the site **with** the `functions/` folder **[you]**
Cloudflare → **Workers & Pages → Create → Pages**. Deploy the project so that `functions/` sits
next to `index.html` (Pages auto-detects `functions/` and turns it into routes).

**Upload only:** `index.html`, `css/`, `js/`, `assets/`, `terms.html`, `privacy.html`,
`refund.html`, `thank-you.html`, **and `functions/`**.
**Never upload:** `product/`, `course/`, `test/`, the `.md` docs, `lumafit-site.zip`, or the
redundant `dist/` copy. (Easiest: deploy with `npx wrangler pages deploy .` after removing the
excluded folders, or use Git integration with a `.gitignore`/`.cfignore`.)

### 4. Bindings + secrets on the Pages project **[you]**
Pages project → **Settings**. Add to **Production** (and Preview if you use it):

| Type | Name | Value |
|---|---|---|
| **R2 bucket binding** | `PRODUCT_BUCKET` | → your `lumafit-files` bucket |
| KV namespace binding *(optional, recommended)* | `DEDUPE` | a new KV namespace (stops duplicate emails on Stripe retries) |
| Secret (env var) | `STRIPE_WEBHOOK_SECRET` | `whsec_…` (from step 5) |
| Secret (env var) | `RESEND_API_KEY` | `re_…` (from step 2) |
| Secret (env var) | `DOWNLOAD_SECRET` | a long random string — generate with `openssl rand -hex 32` |
| Plain var | `FROM_EMAIL` | `LumaFit <hello@lumafit.org>` |
| Plain var | `SITE_ORIGIN` | `https://lumafit.org` |

⚠️ All secrets live **only** here (Cloudflare env). They are never in the website, client JS, or git.
Note there is **no Stripe secret key** needed — delivery reads the buyer's email straight from the
verified webhook event, so the only Stripe secret is the webhook signing secret.

### 5. Register the Stripe webhook **[you]**
Stripe Dashboard → **Developers → Webhooks → Add endpoint**:
- URL: `https://lumafit.org/api/stripe-webhook`
- Event: **`checkout.session.completed`**
- Create it, then **reveal the Signing secret** (`whsec_…`) → put it in `STRIPE_WEBHOOK_SECRET` (step 4) and redeploy.
- Do this in **Test mode** first, then again in **Live mode** (separate endpoint + separate `whsec_…`).

### 6. End-to-end test **[you]**
1. With the Stripe **test** Payment Link wired in `js/script.js`, buy with card `4242 4242 4242 4242`.
2. Confirm: redirect to `thank-you.html`, **and** the email with 3 working download links arrives.
3. Click a link → the PDF downloads. Wait past 72h (or temporarily lower `LINK_TTL_SEC`) → confirm it
   then shows the "expired" message.
4. In Stripe → the webhook should show a **200**. (Use "Resend" on the event to confirm idempotency:
   a second delivery should not send a second email if `DEDUPE` is bound.)
5. Repeat once in **Live mode** with a real card, then refund yourself.

---

## Tuning
- **Link lifetime:** `LINK_TTL_SEC` in `functions/api/stripe-webhook.js` (default 72h).
- **Add/rename a file:** update the `FILES` allow-list in `functions/utils/delivery.js` (and the R2
  filenames + the labels in `buildEmail`).
- **Email design:** `buildEmail()` in `functions/utils/delivery.js`.
