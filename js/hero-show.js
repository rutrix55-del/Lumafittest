// LumaFit — hero showcase (index.html #show).
//
// Three frames that move on by themselves: the result (before and after),
// the guide (the food list, week one), the system (the tracker). The first
// frame is active in the markup and the others share its grid cell, so the
// hero paints without this file. This adds the swapping (the outgoing frame
// is marked is-leaving for the length of its exit animation, so the two
// overlap for a beat), the progress bars under the tab labels, the pause
// button and the stage buttons.
//
// The clock only ever restarts when a frame changes. Everything else is a
// freeze in place: scrolling the card off screen, hiding the tab, the pause
// button and keyboard focus on a control all stop the clock where it is and
// let it carry on from there, with the bar frozen alongside (styles.css
// pauses the fill under .is-paused). A finger on the card does nothing, so
// a swipe never touches the timeline. Pressing a stage shows that frame and
// stops the auto-advance; the pause button becomes play and resumes it.
// Reduced-motion users never auto-advance (the stages still work).
(() => {
    const root = document.getElementById('show');
    if (!root) return;
    const frames = Array.from(root.querySelectorAll('[data-show-frame]'));
    const tabs = Array.from(root.querySelectorAll('[data-show-tab]'));
    const pauseBtn = root.querySelector('[data-show-pause]');
    if (frames.length < 2 || tabs.length !== frames.length) return;

    const interval = parseInt(root.dataset.interval, 10) || 4000;
    const LEAVE_MS = 650; // a little longer than the exit animation in styles.css
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    root.style.setProperty('--show-ms', interval + 'ms');

    let index = Math.max(0, frames.findIndex((f) => f.classList.contains('is-active')));
    let timer = 0;
    let leaveTimer = 0;
    let inView = false;
    let held = false;         // a control focused by keyboard
    let stopped = reduce;     // the pause button or a stage press; always on under reduced motion
    let remaining = interval; // ms left on the current frame's clock
    let startedAt = 0;        // wall time the clock last started (fallback accounting only)
    let running = false;

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

    // How far the active tab's bar has got, in ms of the interval, read from
    // the fill animation itself. The bar is the one source of truth for
    // progress: a CSS animation starts on the next rendered frame, not when
    // the class lands, so a wall clock would run ahead of it.
    function shown() {
        const bar = tabs[index].querySelector('i');
        if (!bar || !bar.getAnimations) return null;
        const a = bar.getAnimations({ subtree: true }).find((x) => x.animationName === 'show-fill');
        const p = a && a.effect.getComputedTiming().progress;
        return p == null ? null : p * interval;
    }

    // Start the active tab's fill from the clock's position: a fresh animation
    // (the class is dropped and re-added) with a negative delay equal to the
    // time already spent, so a resume carries on exactly where the bar froze.
    function startFill() {
        root.style.setProperty('--show-offset', (remaining - interval) + 'ms');
        const tab = tabs[index];
        tab.classList.remove('is-active');
        void tab.offsetWidth;
        tab.classList.add('is-active');
    }

    // Run the clock if we may, else freeze it where the bar is.
    function sync() {
        paint();
        if (playing() && !running) {
            startFill();
            running = true;
            startedAt = performance.now();
            timer = setTimeout(() => go(index + 1), remaining);
        } else if (!playing() && running) {
            running = false;
            clearTimeout(timer);
            const done = shown();
            remaining = Math.max(0, done == null ? remaining - (performance.now() - startedAt) : interval - done);
        }
    }

    // A frame change: the clock and the bar start over.
    function go(i) {
        const next = (i + frames.length) % frames.length;
        if (next !== index) {
            const leaving = frames[index];
            frames.forEach((f) => f.classList.remove('is-leaving'));
            leaving.classList.add('is-leaving');
            clearTimeout(leaveTimer);
            leaveTimer = setTimeout(() => leaving.classList.remove('is-leaving'), LEAVE_MS);
            index = next;
        }
        clearTimeout(timer);
        running = false;
        remaining = interval;
        root.style.setProperty('--show-offset', '0ms'); // a paused new tab shows an empty bar
        sync();
    }

    function setStopped(on) {
        stopped = on;
        if (!pauseBtn) return;
        pauseBtn.setAttribute('aria-pressed', String(on));
        pauseBtn.setAttribute('aria-label', on ? 'Play' : 'Pause');
    }

    // A stage press is the one deliberate stop: show that frame and hold it.
    tabs.forEach((t, i) => t.addEventListener('click', () => { setStopped(true); go(i); }));

    if (pauseBtn) {
        if (reduce) pauseBtn.hidden = true;
        pauseBtn.addEventListener('click', () => { setStopped(!stopped); sync(); });
    }

    // Keyboard focus freezes the clock so a control can be read and used; a
    // mouse click's focus does not, or "play" could never resume.
    root.addEventListener('focusin', (e) => {
        if (e.target.matches && e.target.matches(':focus-visible')) { held = true; sync(); }
    });
    root.addEventListener('focusout', () => { held = false; sync(); });

    // Run while a fair part of the card is on screen and the tab is visible.
    // A fifth is enough: on a phone the card starts below the fold, and it
    // should already be moving by the time the eye reaches it.
    if ('IntersectionObserver' in window) {
        new IntersectionObserver((entries) => {
            inView = entries.some((e) => e.isIntersecting);
            sync();
        }, { threshold: 0.2 }).observe(root);
    } else {
        inView = true;
        sync();
    }
    document.addEventListener('visibilitychange', sync);

    paint();
})();
