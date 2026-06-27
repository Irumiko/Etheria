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
        } catch (error) { logger?.warn('pwa:lifecycle', 'backupState failed:', error?.message || error); }
    }

    async function registerPeriodicBackup() {
        try {
            const registration = await navigator.serviceWorker?.ready;
            if (!registration || !('periodicSync' in registration)) return false;
            await registration.periodicSync.register('backup-sync', {
                minInterval: 24 * 60 * 60 * 1000
            });
            return true;
        } catch (_) {
            return false;
        }
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

    navigator.serviceWorker?.addEventListener?.('message', (event) => {
        if (event?.data?.type === 'PERIODIC_BACKUP_REQUIRED') {
            backupState();
        }
    });

    // Backup de progreso VN cada 30s (best effort)
    setInterval(backupState, 30000);
    registerPeriodicBackup();
})();
