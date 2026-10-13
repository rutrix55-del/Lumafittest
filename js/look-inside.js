// LumaFit — "Look inside" slideshow (index.html #look).
//
// Native horizontal scroll with snap does the swiping, so it works without
// this file. This adds the photo-mode feel: a segmented progress bar, a page
// counter, arrows (beside the stage on wide screens, under it on phones),
// and auto-advance that starts when the slideshow scrolls into view, pauses
// while a finger is down, keeps going after a manual swipe, and stops on the
// last page (the offer) instead of looping. Two hints that the pages go
// sideways: the pages nudge once, a peek at page two, when the show first
// comes into view (is-nudging, styles.css), and the cover's "swipe" pill
// stays until the first page change (has-moved). Reduced-motion users get
// no auto-advance and no nudge.
(() => {
    const root = document.getElementById('look');
    if (!root) return;
    const track = root.querySelector('[data-look-track]');
    const bar = root.querySelector('.look-bar');
    const current = root.querySelector('[data-look-current]');
    const total = root.querySelector('[data-look-total]');
    if (!track || !bar) return;

    const slides = Array.from(track.children);
    const interval = parseInt(root.dataset.interval, 10) || 3800;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    root.style.setProperty('--look-ms', interval + 'ms');
    if (total) total.textContent = String(slides.length);

    const segs = slides.map(() => bar.appendChild(document.createElement('i')));

    let index = 0;
    let timer = 0;
    let programmatic = 0;
    let inView = false;
    let ended = false;

    const playing = () => !reduce && !ended && inView && !document.hidden && !root.classList.contains('is-paused');

    function paint() {
        segs.forEach((seg, i) => {
            seg.classList.toggle('is-done', i < index);
            const active = i === index && playing();
            if (active && !seg.classList.contains('is-active')) {
                // restart the fill from zero every time this segment becomes active
                seg.style.animation = 'none';
                void seg.offsetWidth;
                seg.style.animation = '';
            }
            seg.classList.toggle('is-active', active);
        });
        if (current) current.textContent = String(index + 1);
        root.classList.toggle('on-dark', slides[index].dataset.tone === 'dark');
        root.classList.toggle('is-first', index === 0);
        root.classList.toggle('is-last', index === slides.length - 1);
    }

    function go(i, smooth = true) {
        i = Math.max(0, Math.min(slides.length - 1, i));
        settle();
        clearTimeout(programmatic);
        programmatic = setTimeout(() => { programmatic = 0; }, 800);
        track.scrollTo({ left: i * track.clientWidth, behavior: smooth && !reduce ? 'smooth' : 'auto' });
    }

    function schedule() {
        clearTimeout(timer);
        paint();
        if (!playing()) return;
        timer = setTimeout(() => {
            if (index >= slides.length - 1) { ended = true; paint(); return; }
            go(index + 1);
        }, interval);
    }

    // Scroll position is the source of truth for which page is showing.
    let raf = 0;
    track.addEventListener('scroll', () => {
        if (raf) return;
        raf = requestAnimationFrame(() => {
            raf = 0;
            const i = Math.round(track.scrollLeft / Math.max(1, track.clientWidth));
            if (i === index) return;
            index = i;
            settle();
            root.classList.add('has-moved');
            if (index < slides.length - 1) ended = false; // swiping back re-arms auto-advance
            schedule();
        });
    }, { passive: true });

    // One nudge of the pages the first time the show is in view on the cover.
    // Any page move cancels it (a finger down, an arrow, the auto-advance):
    // the moved slides shift the snap points, and a scroll that ends while
    // they are still moving snaps back to where it started.
    let nudged = reduce;
    function nudge() {
        if (nudged || index !== 0) return;
        nudged = true;
        root.classList.add('is-nudging');
    }
    function settle() { nudged = true; root.classList.remove('is-nudging'); }
    track.addEventListener('animationend', (e) => { if (e.animationName === 'look-nudge') root.classList.remove('is-nudging'); });

    // A finger on the slideshow holds it; lifting it lets the timer run again.
    const hold = () => { root.classList.add('is-paused'); settle(); clearTimeout(timer); paint(); };
    const release = () => { root.classList.remove('is-paused'); schedule(); };
    track.addEventListener('pointerdown', hold, { passive: true });
    track.addEventListener('pointerup', release, { passive: true });
    track.addEventListener('pointercancel', release, { passive: true });

    root.querySelectorAll('[data-look-prev]').forEach((b) => b.addEventListener('click', () => go(index - 1)));
    root.querySelectorAll('[data-look-next]').forEach((b) => b.addEventListener('click', () => go(index + 1)));

    // Only play while the slideshow is actually on screen and the tab is visible.
    if ('IntersectionObserver' in window) {
        new IntersectionObserver((entries) => {
            inView = entries.some((e) => e.isIntersecting);
            if (inView) nudge();
            schedule();
        }, { threshold: 0.6 }).observe(root);
    } else {
        inView = true;
        schedule();
    }
    document.addEventListener('visibilitychange', schedule);

    // Keep the current page aligned when the viewport changes size.
    let resizeTimer = 0;
    window.addEventListener('resize', () => {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => go(index, false), 120);
    });

    paint();
})();
