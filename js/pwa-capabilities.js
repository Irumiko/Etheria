// PWA capabilities helper: standalone detection + wake lock support.
(function initPwaCapabilities() {
    if (typeof window === 'undefined') return;

    let wakeLock = null;

    function isStandalone() {
        return (
            window.matchMedia?.('(display-mode: standalone)')?.matches ||
            window.matchMedia?.('(display-mode: fullscreen)')?.matches ||
            navigator.standalone === true
        );
    }

    if (!isStandalone()) return;

    async function requestWakeLock() {
        if (!isStandalone() || !('wakeLock' in navigator)) return false;
        try {
            wakeLock = await navigator.wakeLock.request('screen');
            wakeLock.addEventListener('release', () => { wakeLock = null; });
            return true;
        } catch (_) {
            return false;
        }
    }

    function releaseWakeLock() {
        if (wakeLock && typeof wakeLock.release === 'function') wakeLock.release();
        wakeLock = null;
    }

    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') requestWakeLock();
        else releaseWakeLock();
    });

    window.PWACapabilities = {
        isStandalone,
        requestWakeLock,
        releaseWakeLock,
    };

    requestWakeLock();
})();
