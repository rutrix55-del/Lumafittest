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

// Reveal-on-scroll for major elements
const revealTargets = document.querySelectorAll(
    '.hero-title, .hero-sub, .hero-cta, .hero-visual, .hero-stats, ' +
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

// The hero guide arrives closed and opens itself once it's properly in view.
const ebook = document.getElementById('ebook');
if (ebook) {
    const openBook = () => ebook.classList.add('is-open');

    if (reduceMotion || !('IntersectionObserver' in window)) {
        openBook();
    } else {
        const bookIO = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (!entry.isIntersecting) return;
                bookIO.unobserve(entry.target);
                // hold the cover shut for a beat so the opening reads as a beat
                setTimeout(openBook, 240);
            });
        }, { threshold: 0.55 });
        bookIO.observe(ebook);
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

// ── Stripe checkout ──────────────────────────────────────────────────
// CHECKOUT_URL is your Stripe Payment Link (https://buy.stripe.com/...).
// Going live — full walkthrough in STRIPE-SETUP.md:
//   1. Create a $15 Payment Link in Stripe — in TEST mode first.
//   2. Set its after-payment success URL to  .../thank-you.html?session_id={CHECKOUT_SESSION_ID}
//   3. Paste the link below, set CHECKOUT_READY = true, redeploy.
//   4. Pay with test card 4242 4242 4242 4242 and confirm the redirect works.
//   5. Replace the test link with your LIVE link and redeploy.
// A Payment Link URL is public and safe to ship in client JS. NEVER put a
// Stripe SECRET key (sk_live_… / sk_test_…) anywhere in this file.
const CHECKOUT_READY = true;
// Live Payment Link (live mode — no `test_`). Verify with one real purchase on
// the live domain before announcing; that is the only check that proves the
// link, the success redirect and the delivery email all work end to end.
//
// Proved end to end on 2026-09-22 with a $1 live purchase: button → Stripe →
// success redirect → webhook → delivery email → all three R2 downloads.
const CHECKOUT_URL = 'https://buy.stripe.com/14A5kDbHx0hAcme8Pv5Ne00';

const buyBtn = document.getElementById('buyBtn');
const ageConfirm = document.getElementById('ageConfirm');

// Buyer must confirm they're 18+/a guardian before the button enables.
function syncBuyState() {
    if (!buyBtn) return;
    const ok = !ageConfirm || ageConfirm.checked;
    buyBtn.disabled = !ok;
    buyBtn.classList.toggle('is-disabled', !ok);
}
if (ageConfirm) ageConfirm.addEventListener('change', syncBuyState);
syncBuyState();

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

if (buyBtn) {
    buyBtn.addEventListener('click', () => {
        if (ageConfirm && !ageConfirm.checked) {
            ageConfirm.focus();
            return;
        }
        if (checkoutLive) {
            window.location.href = CHECKOUT_URL;
        } else {
            alert('Checkout opens soon — LumaFit is launching shortly.');
        }
    });
}
