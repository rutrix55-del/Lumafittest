# LumaFit — Launch Checklist

Everything needed to take LumaFit live, in the order to do it. Steps marked **[you]** need your
accounts/dashboards (I can't do them for you); the rest is already built into this repo.

> This is practical guidance, not legal or tax advice. For a €15 info-product it's proportionate,
> but consider a quick review with a Latvian accountant (VAT) and a lawyer/template service (policies).

---

## ✅ Already done (in this repo)

- **Landing page de-risked** (`index.html`): fabricated testimonials removed and replaced with an
  honest "brand new, here's our guarantee" block; health claims softened to defensible language;
  **18+/parent purchase gate** added (checkbox must be ticked before the buy button works); "I'm 14"
  FAQ rerouted through a parent; footer now links Terms/Privacy/Refunds/Contact; added `og:image`,
  favicon, canonical + Twitter-card meta.
- **Checkout logic rewritten** (`js/script.js`): route-agnostic `CHECKOUT_URL` + `CHECKOUT_READY`
  config — works with a Stripe Payment Link **or** Lemon Squeezy/Gumroad. Wired to the age gate.
- **The product** (`product/`, *not* for public deploy): `guide.pdf` (~40–44 pp), `tracker.pdf`
  (printable 30-day tracker), `food-list.pdf` (Skin Reset food list) — generated from your course
  content. The matching `.html` sources are there too, to regenerate after edits.
- **Legal pages** at site root: `terms.html`, `privacy.html`, `refund.html` (brand-styled, with the
  EU 14-day withdrawal + 30-day guarantee logic baked in). Placeholders highlighted in gold.
- **Thank-you / download page**: `thank-you.html` (noindexed) + brand assets `assets/favicon.svg`,
  `assets/og.svg`, `assets/og.png` (1200×630, for social shares).

---

## Go-live sequence

### Step 1 — Review the product PDFs **[you]**
- [ ] Open `product/guide.pdf`, `product/tracker.pdf`, `product/food-list.pdf` and read through them.
- [ ] To regenerate after any edit: open the matching `product/*.html` in **Chrome → Print →
      Save as PDF**, with **"Background graphics" ON** (so gradients/tints render).

### Step 2 — Fill in the placeholders **[you]**
Search each file for `[` to find them. See the table at the bottom. Minimum to fill:
- [ ] `[LEGAL NAME]` + `[REGISTERED ADDRESS, Latvia]` — your trader identity (legal pages).
- [ ] `[SUPPORT EMAIL]` — currently defaults to `edgars@ideajetlab.com`; swap to a branded
      `support@yourdomain` once you have the domain.
- [ ] `[DATE]` — "Last updated" on each legal page.

### Step 3 — Choose your payment + delivery route **[you]**

**Route A — Merchant of Record (recommended).** A platform that *is* the seller of record, so it
collects **and remits your EU VAT**, issues invoices, and **emails the files automatically**. You give
up using your own Stripe directly, and pay a bigger cut — worth it to make the VAT + delivery problem
disappear for a solo seller.
- **Lemon Squeezy** ≈ 5% + $0.50/sale (~$1.25 on $15) · full MoR.
- **Gumroad** ≈ 10% + $0.50/sale (~$2 on $15) · simplest, full MoR since 2025.
- Steps: sign up → create a $15 product → **upload `guide.pdf` + `tracker.pdf` + `food-list.pdf`** →
  enable email delivery + a 30-day refund window → copy the product's **checkout URL**.

**Route B — Your own Stripe** (cheapest fees; you handle VAT + delivery yourself).
- [ ] Activate **Live mode**: Settings → Business → complete KYC; add a **EUR IBAN** payout account.
- [ ] Settings → **Tax**: enable Stripe Tax, set the product's tax code to digital goods/e-book;
      plan to register for **EU VAT Union OSS** via Latvia's VID (one return covers all EU).
- [ ] Create a **$15 Payment Link** — set **price tax behavior = "Inclusive"** (⚠️ permanent, set it at
      creation so buyers always pay exactly €15). After-payment → redirect to your `thank-you.html`.
- [ ] Copy the `https://buy.stripe.com/...` URL.
- [ ] **NEVER** put a Stripe secret key (`sk_live_…`) in the site — only the public link.

> Tip: as an EU seller you have a €10,000/yr cross-border threshold below which you may just charge
> Latvian VAT (no OSS yet) — but VAT is owed from sale #1. Confirm with an accountant.

### Step 4 — Set up delivery **[you]**
- **Route A:** done by the platform (it hosts + emails the files). Nothing else needed.
- **Route B:** host the 3 PDFs behind **unguessable/expiring links** (Cloudflare R2 signed URLs, or a
  private Google Drive link), put those URLs into `thank-you.html`
  (`[DOWNLOAD_LINK_GUIDE]` / `[DOWNLOAD_LINK_TRACKER]` / `[DOWNLOAD_LINK_FOODLIST]`), **and** add an
  email-delivery automation (Zapier/Make on Stripe's `checkout.session.completed` → email the links).
  Also turn on Stripe's receipt email (Settings → Customer emails → Successful payments).

### Step 5 — Deploy the site + domain **[you]**
- [ ] **Deploy these only:** `index.html`, `css/`, `js/`, `assets/`, `terms.html`, `privacy.html`,
      `refund.html`, `thank-you.html`.
- [ ] ⚠️ **Do NOT upload `product/` or `course/`** — those are your paid source files. If they're on
      the public site, the product is free to anyone.
- [ ] Host: **Cloudflare Pages** (free, unmetered bandwidth, can run a delivery webhook later) →
      Workers & Pages → Create → Pages → Upload assets → drag the (cleaned) folder. *Not Vercel Hobby —
      its terms forbid e-commerce.*
- [ ] Buy a domain (Cloudflare Registrar ~€10/yr, at-cost) → Pages → Custom domains → add it → HTTPS
      is automatic.
- [ ] Replace `https://lumafit.example` in `index.html` (3 meta tags) and `[DOMAIN]` in the legal
      pages with your real domain. Export `assets/og.svg` is already done → `og.png` (regenerate if you
      tweak it).

### Step 6 — Wire the checkout URL **[you]**
- [ ] In `js/script.js`: set `CHECKOUT_URL = '<your checkout URL from Step 3>'` and
      `CHECKOUT_READY = true`. Redeploy.

### Step 7 — Test before driving traffic **[you]**
- [ ] **Route B:** first point `CHECKOUT_URL` at a Stripe **test-mode** link, pay with test card
      `4242 4242 4242 4242`, confirm redirect + receipt + delivery email all fire. Then swap to the
      **live** link.
- [ ] Make **one real purchase** on the live domain; confirm the email + all 3 downloads arrive; then
      **refund yourself**.
- [ ] Confirm the dashboard reads **Live mode** (not Test) before promoting. Then launch. 🚀

---

## Placeholders to fill

| Placeholder | Where | What |
|---|---|---|
| `[LEGAL NAME]` | terms, privacy, refund | Your registered trader/seller name (GDPR data controller) |
| `[REGISTERED ADDRESS, Latvia]` | terms, privacy | Geographic seller address (EU consumer-info + GDPR) |
| `[SUPPORT EMAIL]` | all legal + tracker/food-list/thank-you | Branded support address (defaults to `edgars@ideajetlab.com`) |
| `[DATE]` | terms, privacy, refund | "Last updated" date |
| `[DOMAIN]` | terms, privacy + `index.html` head (`lumafit.example`) | Your real public domain |
| `[PAYMENT PLATFORM]` | privacy, refund | Stripe **or** the MoR you chose |
| `[ORDER_REF]`, `[DOWNLOAD_LINK_*]` | thank-you.html | Injected by the platform / your hosted file URLs (Route B) |
| `CHECKOUT_URL`, `CHECKOUT_READY` | js/script.js | Your checkout URL + flip to `true` |

## Rough costs

| Item | Cost |
|---|---|
| Domain | ~€10/yr |
| Hosting (Cloudflare Pages) | Free |
| Route A fees | Lemon Squeezy ~5%+$0.50 / Gumroad ~10%+$0.50 per sale — **VAT handled** |
| Route B fees | Stripe ~1.5%+€0.25 (EEA cards) up to 2.9%+$0.30 (intl) + Stripe Tax 0.5% — **you file OSS** |
| Optional | Zapier (free tier), Resend email (free tier), legal templates (€0–60) |

## Top risks (already mitigated in the build, keep in mind)
- Don't enable checkout until the PDFs exist and delivery works — ✅ PDFs built; delivery is Step 4.
- No fabricated testimonials / no hard health claims — ✅ fixed in `index.html`.
- Purchase gated to 18+ — ✅ added; keep it.
- EU VAT owed from sale #1 — handled by Route A, or Stripe Tax + OSS in Route B.
- Keep your editable course sources + a buyer email list so you can honor "lifetime updates".
