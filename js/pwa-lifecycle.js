// PWA lifecycle hooks and periodic state backups.
(function initPwaLifecycle() {
    if (typeof window === 'undefined' || typeof document === 'undefined') return;
    const isStandalone =
        window.matchMedia?.('(display-mode: standalone)')?.matches ||
        window.matchMedia?.('(display-mode: fullscreen)')?.matches ||
        navigator.standalone === true;
    if (!isStandalone) return;
    const logger = window.EtheriaLogger;

    function backupState() {
        try {
            if (typeof save === 'function') save({ silent: true });

            const backup = {
                ts: Date.now(),
                currentTopicId: (typeof currentTopicId !== 'undefined') ? currentTopicId : null,
                affinities: (typeof appData !== 'undefined' && appData?.affinities) ? appData.affinities : {},
                rpg: (typeof RPGState !== 'undefined' && typeof RPGState.getSnapshot === 'function')
                    ? RPGState.getSnapshot()
                    : null,
            };
            localStorage.setItem('etheria_pwa_backup', JSON.stringify(backup));
        } catch (error) { logger?.warn('pwa:lifecycle', 'backupState failed:', error?.message || error); }
    }

    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') backupState();
    });

    window.addEventListener('pagehide', backupState, { passive: true });
    window.addEventListener('pageshow', () => {
        const standalone = window.matchMedia?.('(display-mode: standalone)')?.matches || navigator.standalone === true;
        document.body.classList.toggle('is-standalone', standalone);
        document.body.classList.toggle('pwa-standalone', standalone);
        document.documentElement.classList.toggle('pwa-standalone', standalone);
    }, { passive: true });

    // Backup de progreso VN cada 30s (best effort)
    setInterval(backupState, 30000);
})();
