// PWA viewport helper: exposes --vh / --vvh with visualViewport support.
(function initPwaViewport() {
    if (typeof window === 'undefined' || typeof document === 'undefined') return;

    const isStandalone =
        window.matchMedia?.('(display-mode: standalone)')?.matches ||
        window.matchMedia?.('(display-mode: fullscreen)')?.matches ||
        navigator.standalone === true;
    if (!isStandalone) return;

    const docEl = document.documentElement;
    document.body.classList.add('pwa-standalone');
    docEl.classList.add('pwa-standalone');

    const updateViewportVars = () => {
        const innerVh = window.innerHeight * 0.01;
        docEl.style.setProperty('--vh', `${innerVh}px`);

        const vv = window.visualViewport;
        const visualHeight = vv?.height || window.innerHeight;
        docEl.style.setProperty('--vvh', `${visualHeight * 0.01}px`);
    };

    let raf = null;
    const schedule = () => {
        if (raf) cancelAnimationFrame(raf);
        raf = requestAnimationFrame(() => {
            updateViewportVars();
            raf = null;
        });
    };

    updateViewportVars();
    window.addEventListener('resize', schedule, { passive: true });
    window.addEventListener('orientationchange', () => setTimeout(schedule, 120), { passive: true });
    if (window.visualViewport) {
        window.visualViewport.addEventListener('resize', schedule, { passive: true });
        window.visualViewport.addEventListener('scroll', schedule, { passive: true });
    }
})();
