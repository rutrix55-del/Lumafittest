# LumaFit — Stripe setup (the plan we're running)

**Route:** your own **Stripe** (not a Merchant of Record).
**Plan:** **Phase 1 — get test payments flowing today** → **Phase 2 — auto-email the PDFs** → **Phase 3 — go live.**

This supersedes the payment/delivery bits of `LAUNCH.md` Steps 3–4 for the Stripe route. Steps marked
**[you]** need your Stripe/other dashboards — I can't do those. Everything in the repo is already wired.

> Not legal/tax advice. For a €15 info-product this is proportionate; a quick check with a Latvian
> accountant (VAT/OSS) is worth it.

---

## ✅ Already wired in the repo (done)
- **Buy button** (`js/script.js`): sends the buyer to `CHECKOUT_URL`, but only after the **18+ checkbox**
  and only when `CHECKOUT_READY = true` **and** the URL isn't the placeholder (guarded — a half-finished
  config can't send anyone to a dead link).
- **Thank-you page** (`thank-you.html`): now an **email-delivery** page ("check your inbox"), with **no
  public download links** (so the files can't leak from a shared URL). It auto-shows the buyer's **order
  reference** by reading `?session_id=…` from Stripe's redirect.
- **Legal pages**: payment provider set to **Stripe** (privacy + refund). One placeholder remains:
  `[EMAIL DELIVERY PROVIDER]` in `privacy.html` — fill it once you pick the email tool in Phase 2.

---

## Phase 1 — Test payments flowing (do this first) **[you]**
Goal: click "Get instant access" → real Stripe checkout → land back on the thank-you page. No delivery yet.

1. Create a Stripe account (or log in). Stay in **Test mode** (toggle, top-right).
2. **Products → add product**: name "LumaFit", price **$15** one-time. *(Currency: set to what you want
   to charge — USD or EUR. If EUR with EU VAT, see Phase 3.)*
3. **Payment Links → create** for that product. Under **After payment → Redirect to your page**, set:
   ```
   https://YOURDOMAIN/thank-you.html?session_id={CHECKOUT_SESSION_ID}
   ```
   (Use your real domain. `{CHECKOUT_SESSION_ID}` is a literal token Stripe replaces — keep the braces.)
4. Copy the test link (`https://buy.stripe.com/test_…`).
5. In **`js/script.js`** set:
   ```js
   const CHECKOUT_READY = true;
   const CHECKOUT_URL = 'https://buy.stripe.com/test_…';  // your test link
   ```
6. Deploy (or open locally), tick the 18+ box, click buy, pay with test card
   **`4242 4242 4242 4242`**, any future expiry, any CVC/ZIP.
7. Confirm you land on **thank-you.html** and the **order reference** shows. ✅ Phase 1 done.

> ⚠️ Only ever put the **public** Payment Link in `js/script.js`. NEVER a secret key (`sk_test_…` /
> `sk_live_…`) — those are server-only and would let anyone drain the account.

---

## Phase 2 — Auto-email the 3 PDFs after payment **[you]**
Goal: every paid order automatically emails the buyer their download links. Two pieces — **host the files**
and **send the email** — glued by a no-code automation.

1. **Host the 3 PDFs behind unguessable links** (so the URL itself is the gate):
   - **Cloudflare R2** (recommended, you're already on Cloudflare) or a **Google Drive** "anyone with the
     link" file. Upload `product/guide.pdf`, `product/tracker.pdf`, `product/food-list.pdf`.
   - ⚠️ Do **not** put these in the deployed site folder — keep `product/` out of the public site.
2. **Automation** — **Zapier** or **Make** (free tier):
   - Trigger: **Stripe → "Checkout Session Completed"** (or "New Payment").
   - Action: **Send email** (Gmail, or an email API like **Resend**) to the customer's email from the
     event, containing the 3 download links + a short "start with the food list" note.
3. Put the email tool's name into `privacy.html` where it says `[EMAIL DELIVERY PROVIDER]`.
4. Turn on Stripe's own receipt: **Settings → Customer emails → Successful payments**.
5. Re-run a **test-mode** purchase (card `4242…`) and confirm the email with all 3 links arrives.

*(Want this fully automated and self-hosted instead of Zapier — a Stripe webhook on Cloudflare Pages
Functions that verifies payment and emails a signed, expiring link? That's "Option B" from our chat; say
the word and I'll build the serverless code.)*

---

## Phase 3 — Go live **[you]**
1. **Activate live mode**: Settings → Business → complete KYC; add a payout bank account (EUR IBAN).
2. **EU VAT** (selling a digital product): Settings → **Tax** → enable **Stripe Tax**, set the product's
   tax code to digital goods / e-book. If pricing in EUR, create the live Payment Link with **price tax
   behaviour = "Inclusive"** (⚠️ permanent — set at creation so buyers always pay exactly €15). Plan to
   register **EU VAT (OSS)** via Latvia's VID. (Confirm specifics with an accountant.)
3. Recreate the **Payment Link in Live mode** (test links don't work live) with the same success URL.
4. In `js/script.js` swap `CHECKOUT_URL` to the **live** link (`https://buy.stripe.com/…`, no `test_`).
   Redeploy.
5. Make **one real purchase** on the live domain → confirm the email + all 3 downloads arrive → then
   **refund yourself** (Payments → the charge → Refund).
6. Confirm the dashboard reads **Live mode**. Launch. 🚀

---

## Quick reference
| Thing | Where | Value |
|---|---|---|
| Checkout URL + on/off | `js/script.js` | `CHECKOUT_URL` (Payment Link) + `CHECKOUT_READY = true` |
| Success URL (in Stripe) | Stripe Payment Link | `https://YOURDOMAIN/thank-you.html?session_id={CHECKOUT_SESSION_ID}` |
| Test card | Stripe test mode | `4242 4242 4242 4242`, any future date, any CVC |
| Email-tool name | `privacy.html` | replace `[EMAIL DELIVERY PROVIDER]` |
| Files to host (privately) | `product/` | `guide.pdf`, `tracker.pdf`, `food-list.pdf` |
| Never commit/ship | — | any `sk_test_…` / `sk_live_…` secret key |
