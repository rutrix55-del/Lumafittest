// LumaFit — hero showcase (index.html #show).
//
// Three frames that swap on a timer: the result (before and after), the
// guide (the food list, week one), the system (the tracker). The first frame
// is active in the markup and the others share its grid cell, so the hero
// paints without this file. This adds the swapping, the segmented progress
// bar under the tab labels, the pause button, and the holds: a finger down
// on the card or a keyboard-focused control keeps the current frame up. It
// only runs while the card is on screen and the tab is visible, loops, and
// never auto-advances for reduced-motion users (the tabs still work).
(() => {
    const root = document.getElementById('show');
    if (!root) return;
    const frames = Array.from(root.querySelectorAll('[data-show-frame]'));
    const tabs = Array.from(root.querySelectorAll('[data-show-tab]'));
    const pauseBtn = root.querySelector('[data-show-pause]');
    if (frames.length < 2 || tabs.length !== frames.length) return;

    const interval = parseInt(root.dataset.interval, 10) || 3600;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    root.style.setProperty('--show-ms', interval + 'ms');

    let index = Math.max(0, frames.findIndex((f) => f.classList.contains('is-active')));
    let timer = 0;
    let inView = false;
    let held = false;      // a finger down on the card, or a control focused by keyboard
    let stopped = reduce;  // the pause button; always on under reduced motion

    const playing = () => !stopped && !held && inView && !document.hidden;

    function paint() {
        frames.forEach((f, i) => f.classList.toggle('is-active', i === index));
        tabs.forEach((t, i) => {
            t.classList.toggle('is-active', i === index);
            t.classList.toggle('is-done', i < index);
            if (i === index) t.setAttribute('aria-current', 'true');
            else t.removeAttribute('aria-current');
        });
        root.classList.toggle('is-paused', !playing());
    }

    // The fill animation lives on the active tab's bar, so dropping and
    // re-adding the class is what restarts it from zero, in step with the timer.
    function restartFill() {
        const tab = tabs[index];
        tab.classList.remove('is-active');
        void tab.offsetWidth;
        tab.classList.add('is-active');
    }

    function schedule() {
        clearTimeout(timer);
        paint();
        if (!playing()) return;
        restartFill();
        timer = setTimeout(() => go(index + 1), interval);
    }

    function go(i) {
        index = (i + frames.length) % frames.length;
        schedule();
    }

    tabs.forEach((t, i) => t.addEventListener('click', () => go(i)));

    if (pauseBtn) {
        if (reduce) pauseBtn.hidden = true;
        pauseBtn.addEventListener('click', () => {
            stopped = !stopped;
            pauseBtn.setAttribute('aria-pressed', String(stopped));
            pauseBtn.setAttribute('aria-label', stopped ? 'Play' : 'Pause');
            schedule();
        });
    }

    // A finger on the card holds the frame; lifting it lets the timer run again.
    const hold = () => { held = true; schedule(); };
    const release = () => { held = false; schedule(); };
    const touchOnly = (fn) => (e) => { if (e.pointerType !== 'mouse') fn(); };
    root.addEventListener('pointerdown', touchOnly(hold), { passive: true });
    root.addEventListener('pointerup', touchOnly(release), { passive: true });
    root.addEventListener('pointercancel', touchOnly(release), { passive: true });

    // Keyboard focus holds too, so a tab or the pause button can be read and
    // used; a mouse click's focus does not, or "play" could never resume.
    root.addEventListener('focusin', (e) => {
        if (e.target.matches && e.target.matches(':focus-visible')) hold();
    });
    root.addEventListener('focusout', release);

    // Only play while the card is actually on screen and the tab is visible.
    if ('IntersectionObserver' in window) {
        new IntersectionObserver((entries) => {
            inView = entries.some((e) => e.isIntersecting);
            schedule();
        }, { threshold: 0.5 }).observe(root);
    } else {
        inView = true;
        schedule();
    }
    document.addEventListener('visibilitychange', schedule);

    paint();
})();
