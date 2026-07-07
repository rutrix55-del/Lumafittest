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
const CHECKOUT_URL = 'https://buy.stripe.com/test_14A5kDbHx0hAcme8Pv5Ne00'; // e.g. https://buy.stripe.com/test_abc123

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

// Guard so a half-finished config (CHECKOUT_READY flipped but URL still the
// placeholder) can never send a buyer to a dead link.
const checkoutLive = CHECKOUT_READY && /^https:\/\//.test(CHECKOUT_URL) && !/REPLACE_ME/.test(CHECKOUT_URL);

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
