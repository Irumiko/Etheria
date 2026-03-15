// Edge-swipe protection for PWA immersive interactions.
(function initPwaGestures() {
    if (typeof window === 'undefined' || typeof document === 'undefined') return;

    const isStandalone =
        window.matchMedia?.('(display-mode: standalone)')?.matches ||
        window.matchMedia?.('(display-mode: fullscreen)')?.matches ||
        navigator.standalone === true;

    if (!isStandalone) return;
    const isTouch = window.matchMedia?.('(pointer: coarse)')?.matches;
    if (!isTouch) return;

    const EDGE_GUARD_PX = 18;
    const SCROLLABLE_SELECTORS = [
        '.vn-chat-history',
        '.modal-content',
        '.gallery-grid',
        '.topics-grid',
        '.settings-panel',
        '.scrollable',
    ];

    document.addEventListener('touchstart', (e) => {
        const touch = e.touches && e.touches[0];
        if (!touch) return;
        const target = e.target;
        if (target && target.closest && target.closest(SCROLLABLE_SELECTORS.join(','))) return;
        const x = touch.clientX;
        const nearLeft = x <= EDGE_GUARD_PX;
        const nearRight = x >= (window.innerWidth - EDGE_GUARD_PX);
        if (nearLeft || nearRight) {
            // Prevent accidental swipe-back gesture from triggering app navigation breakage.
            e.preventDefault();
        }
    }, { passive: false });
})();
