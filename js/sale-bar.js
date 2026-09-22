// LumaFit — 50% off sale bar with a live countdown.
//
// SALE_ENDS is the one thing to edit. It is an absolute moment (the trailing
// `Z` means UTC), so every visitor sees the same deadline and the bar retires
// itself for everyone at once — never a per-visitor timer that quietly
// restarts. Once it passes the bar simply never shows; the price in the buy
// card is separate and stays whatever index.html says.
const SALE_ENDS = new Date('2026-09-27T23:59:59Z');

// Dismissal is per tab (sessionStorage), so a closed bar stays closed while
// the visitor reads but comes back on their next visit.
const SALE_DISMISS_KEY = 'lumafit-sale-dismissed';

(() => {
    const bar = document.getElementById('saleBar');
    if (!bar) return;

    let dismissed = false;
    try { dismissed = sessionStorage.getItem(SALE_DISMISS_KEY) === '1'; } catch (_) { /* storage blocked */ }
    if (dismissed || Number.isNaN(SALE_ENDS.getTime()) || SALE_ENDS <= Date.now()) return;

    const num = {};
    bar.querySelectorAll('.sale-num').forEach(el => { num[el.dataset.unit] = el; });
    if (!(num.d && num.h && num.m && num.s)) return;

    // Screen readers get the deadline as a date, not a stream of ticking digits.
    const endsText = document.getElementById('saleEndsText');
    if (endsText) {
        endsText.textContent = 'Sale ends ' +
            SALE_ENDS.toLocaleString(undefined, { dateStyle: 'long', timeStyle: 'short' }) + '.';
    }

    let timer = 0;
    const pad = n => String(n).padStart(2, '0');

    const retire = () => {
        clearInterval(timer);
        bar.hidden = true;
        document.body.classList.remove('has-sale');
    };

    const tick = () => {
        const left = SALE_ENDS - Date.now();
        if (left <= 0) { retire(); return; }
        const s = Math.floor(left / 1000);
        num.d.textContent = pad(Math.floor(s / 86400));
        num.h.textContent = pad(Math.floor(s / 3600) % 24);
        num.m.textContent = pad(Math.floor(s / 60) % 60);
        num.s.textContent = pad(s % 60);
    };

    tick();
    bar.hidden = false;
    document.body.classList.add('has-sale');
    timer = setInterval(tick, 1000);

    const close = document.getElementById('saleClose');
    if (close) {
        close.addEventListener('click', () => {
            try { sessionStorage.setItem(SALE_DISMISS_KEY, '1'); } catch (_) { /* storage blocked */ }
            retire();
        });
    }
})();
