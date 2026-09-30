// LumaFit — landing page interactions

// Nav shadow on scroll
const nav = document.getElementById('nav');
const onScroll = () => {
    if (window.scrollY > 8) nav.classList.add('scrolled');
    else nav.classList.remove('scrolled');
};
window.addEventListener('scroll', onScroll, { passive: true });
onScroll();

// Respect users who prefer reduced motion — skip reveal + count-up animations
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// Reveal-on-scroll for below-the-fold sections. The hero is deliberately not
// in this list: its entrance is a CSS animation (styles.css, "Hero entrance")
// so the first paint never waits for this script to run.
const revealTargets = document.querySelectorAll(
    '.problem-card, .problem-lead, .inside-card, .benefit, ' +
    '.for-who-card, .testimonial, .buy-card, .faq-item'
);

if (!reduceMotion) {
    revealTargets.forEach(el => el.classList.add('reveal'));

    const io = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('visible');
                io.unobserve(entry.target);
            }
        });
    }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });

    revealTargets.forEach(el => io.observe(el));
}

// The 30-day plan sheet: nine days ticked off, today is day 10.
const planGrid = document.querySelector('[data-plan-grid]');
if (planGrid) {
    for (let day = 1; day <= 30; day++) {
        const cell = document.createElement('i');
        cell.textContent = day;
        if (day < 10) cell.className = 'is-done';
        if (day === 10) cell.className = 'is-today';
        planGrid.appendChild(cell);
    }
}

// The hero guide arrives as a flat stack and lifts apart into its layers
// once it's properly in view; after that the pointer tilts it a little.
const stack = document.getElementById('stack');
if (stack) {
    const liftStack = () => stack.classList.add('is-live');

    if (reduceMotion || !('IntersectionObserver' in window)) {
        liftStack();
    } else {
        const stackIO = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (!entry.isIntersecting) return;
                stackIO.unobserve(entry.target);
                // hold it flat for a beat so the lift reads as a moment
                setTimeout(liftStack, 240);
            });
        }, { threshold: 0.55 });
        stackIO.observe(stack);

        const tilt = stack.querySelector('.stack-tilt');
        if (window.matchMedia('(hover: hover)').matches) {
            stack.addEventListener('pointermove', (e) => {
                const r = stack.getBoundingClientRect();
                const x = (e.clientX - r.left) / r.width - 0.5;
                const y = (e.clientY - r.top) / r.height - 0.5;
                tilt.style.setProperty('--tilt-x', `${(-y * 12).toFixed(2)}deg`);
                tilt.style.setProperty('--tilt-z', `${(x * 14).toFixed(2)}deg`);
            });
            stack.addEventListener('pointerleave', () => {
                tilt.style.removeProperty('--tilt-x');
                tilt.style.removeProperty('--tilt-z');
            });
        }
    }
}

// Count-up for hero stats (once, when they scroll into view)
const statNums = document.querySelectorAll('.stat-num');
if (statNums.length && !reduceMotion) {
    const countUp = (el) => {
        const target = parseInt(el.textContent, 10);
        if (Number.isNaN(target)) return;
        const duration = 1100;
        const start = performance.now();
        const tick = (now) => {
            const p = Math.min((now - start) / duration, 1);
            const eased = 1 - Math.pow(1 - p, 3);
            el.textContent = Math.round(target * eased);
            if (p < 1) requestAnimationFrame(tick);
        };
        el.textContent = '0';
        requestAnimationFrame(tick);
    };
    const statIO = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                countUp(entry.target);
                statIO.unobserve(entry.target);
            }
        });
    }, { threshold: 0.6 });
    statNums.forEach(el => statIO.observe(el));
}

// ── Where did this visit come from? ──────────────────────────────────
// First-touch attribution for the session: utm_source/medium/campaign from
// the landing URL, or the referrer's host. It rides along to Stripe as
// client_reference_id, so every payment in the Stripe dashboard says which
// channel produced it. No cookies, nothing sent anywhere but Stripe.
const SRC_KEY = 'lumafit-src';
function captureSource() {
    try {
        const stored = sessionStorage.getItem(SRC_KEY);
        if (stored) return stored;
        const q = new URLSearchParams(location.search);
        let src = ['utm_source', 'utm_medium', 'utm_campaign']
            .map((k) => (q.get(k) || '').trim()).filter(Boolean).join('_');
        if (!src && document.referrer) {
            const host = new URL(document.referrer).hostname.replace(/^www\./, '');
            if (host && host !== location.hostname) src = 'ref_' + host;
        }
        if (src) sessionStorage.setItem(SRC_KEY, src);
        return src;
    } catch (_) { return ''; }
}
const visitSource = captureSource();

// ── Stripe checkout ──────────────────────────────────────────────────
// CHECKOUT_URL is your Stripe Payment Link (https://buy.stripe.com/...).
// Going live — full walkthrough in STRIPE-SETUP.md:
//   1. Create a €9.99 Payment Link in Stripe — in TEST mode first.
//   2. Set its after-payment success URL to  .../thank-you.html?session_id={CHECKOUT_SESSION_ID}
//   3. Paste the link below, set CHECKOUT_READY = true, redeploy.
//   4. Pay with test card 4242 4242 4242 4242 and confirm the redirect works.
//   5. Replace the test link with your LIVE link and redeploy.
// A Payment Link URL is public and safe to ship in client JS. NEVER put a
// Stripe SECRET key (sk_live_… / sk_test_…) anywhere in this file.
const CHECKOUT_READY = true;

// Two live Payment Links, both EUR and tax-inclusive, both redirecting to
// /thank-you?session_id=…, both requiring the terms / 18+ / withdrawal-waiver
// checkbox and accepting promotion codes:
//   sale     €9.99   plink_1ULQWlImD5UPqxzVQjjfLeQA   the 50%-off launch price
//   regular  €19.99  plink_1ULSPWImD5UPqxzVF610yZV2
// SALE_ENDS is defined in js/sale-bar.js, which loads first. While it is ahead
// the page shows €19.99 struck through and €9.99 live and sends buyers to the
// sale link; once it passes, every price on the page and the checkout link
// switch to €19.99 on their own, so the "was" price is one we really charge.
// Retired links: …cme8Pv5Ne00 (€15, never redirected) and …3vb5Ne02 (€10, one hour).
//
// The redirect → webhook → email → R2 download path was proved end to end on
// 2026-09-22 with a live €1 purchase on a test link and the thank-you download
// endpoint was verified against that paid session on 2026-09-30. Neither live
// link has had a real purchase yet.
const OFFERS = {
    sale:    { amount: '€9.99',  url: 'https://buy.stripe.com/28E6oHh1R1lEeum8Pv5Ne03' },
    regular: { amount: '€19.99', url: 'https://buy.stripe.com/7sYaEXbHxggy0Dw0iZ5Ne04' },
};
const saleOn = typeof SALE_ENDS !== 'undefined' && SALE_ENDS instanceof Date &&
    !Number.isNaN(SALE_ENDS.getTime()) && SALE_ENDS.getTime() > Date.now();
const offer = saleOn ? OFFERS.sale : OFFERS.regular;
const CHECKOUT_URL = offer.url;

// Every price on the page follows the offer, so nothing needs editing by hand
// when the sale ends. The HTML ships in the sale state for no-JS visitors.
document.querySelectorAll('[data-price]').forEach((el) => { el.textContent = offer.amount; });
document.querySelectorAll('[data-sale-only]').forEach((el) => { el.hidden = !saleOn; });
document.querySelectorAll('[data-regular-only]').forEach((el) => { el.hidden = saleOn; });

const buyBtn = document.getElementById('buyBtn');

// Guard so a half-finished config can never send a buyer somewhere they can't
// pay. A live Payment Link is https://buy.stripe.com/<id>; Stripe's TEST links
// carry a `test_` prefix on that id. Shipping a test link is the failure that
// actually happened here, so the URL has to prove itself rather than being
// trusted because CHECKOUT_READY was flipped.
//
// Note: if you ever move Payment Links onto a custom domain, widen the host
// pattern below or the guard will (correctly) refuse to recognise it.
const STRIPE_LIVE_LINK = /^https:\/\/buy\.stripe\.com\/(?!test_)[A-Za-z0-9]+(?:\?[^\s]*)?$/;
const checkoutLive = CHECKOUT_READY && STRIPE_LIVE_LINK.test(CHECKOUT_URL);

if (CHECKOUT_READY && !checkoutLive) {
    // Loud on purpose: this is the state where the Buy button looks armed but
    // isn't, so it should never pass a deploy unnoticed.
    console.warn(
        '[LumaFit] Checkout is NOT live: CHECKOUT_URL is not a live Stripe Payment Link.\n' +
        '  got: ' + CHECKOUT_URL + '\n' +
        '  expected: https://buy.stripe.com/<id>  (a `test_` prefix means test mode)'
    );
}

// Stripe accepts client_reference_id as a URL parameter on Payment Links:
// letters, digits, dashes and underscores, up to 200 characters.
function checkoutHref() {
    const ref = visitSource.replace(/[^A-Za-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
    if (!ref) return CHECKOUT_URL;
    return CHECKOUT_URL + (CHECKOUT_URL.includes('?') ? '&' : '?') + 'client_reference_id=' + encodeURIComponent(ref);
}

// Age and withdrawal-right consent is collected by Stripe Checkout itself (the
// Payment Link requires the terms checkbox), so nothing stands between this
// button and the payment page.
if (buyBtn) {
    buyBtn.addEventListener('click', () => {
        if (checkoutLive) {
            window.location.href = checkoutHref();
        } else {
            alert('Checkout opens soon — LumaFit is launching shortly.');
        }
    });
}

// ── Mobile sticky CTA ────────────────────────────────────────────────
// Shown once the hero has scrolled away and until the buy card is on screen.
// CSS keeps it display:none above 720px, so on desktop none of this is visible.
const mobileCta = document.getElementById('mobileCta');
const heroEl = document.querySelector('.hero');
const buyEl = document.getElementById('buy');
if (mobileCta && heroEl && buyEl && 'IntersectionObserver' in window) {
    const ctaLink = mobileCta.querySelector('a');
    let heroVisible = true;
    let buyVisible = false;
    const sync = () => {
        const on = !heroVisible && !buyVisible;
        mobileCta.classList.toggle('is-on', on);
        mobileCta.setAttribute('aria-hidden', on ? 'false' : 'true');
        if (ctaLink) ctaLink.tabIndex = on ? 0 : -1;
        document.body.classList.toggle('has-mobile-cta', on);
    };
    const ctaIO = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
            if (entry.target === heroEl) heroVisible = entry.isIntersecting;
            if (entry.target === buyEl) buyVisible = entry.isIntersecting;
        });
        sync();
    }, { threshold: 0.05 });
    ctaIO.observe(heroEl);
    ctaIO.observe(buyEl);
}
