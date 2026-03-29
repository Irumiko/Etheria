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

    function shouldKeepAwake() {
        const vnSection = document.getElementById('vnSection');
        return !!vnSection?.classList.contains('active') && !document.hidden;
    }

    async function requestWakeLock() {
        if (!isStandalone() || !('wakeLock' in navigator) || !shouldKeepAwake()) return false;
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
        if (document.visibilityState === 'visible' && shouldKeepAwake()) requestWakeLock();
        else releaseWakeLock();
    });

    class EtheriaBadging {
        async updateUnreadCount(count) {
            const safe = Math.max(0, Number(count) || 0);
            try {
                if ('setAppBadge' in navigator && safe > 0) await navigator.setAppBadge(safe);
                else if ('clearAppBadge' in navigator) await navigator.clearAppBadge();
                document.title = safe > 0 ? `(${safe}) Etheria` : 'Etheria';
            } catch (_) {
                document.title = safe > 0 ? `(${safe}) Etheria` : 'Etheria';
            }
        }

        bindInboxBadge() {
            const badge = document.getElementById('menuInboxBadge');
            if (!badge) return;
            const readCount = () => Number(String(badge.textContent || '0').trim()) || 0;
            const update = () => {
                if (document.hidden && isStandalone()) this.updateUnreadCount(readCount());
                else this.updateUnreadCount(0);
            };
            const obs = new MutationObserver(update);
            obs.observe(badge, { characterData: true, childList: true, subtree: true, attributes: true });
            document.addEventListener('visibilitychange', update);
            update();
        }
    }

    const badging = new EtheriaBadging();
    badging.bindInboxBadge();

    window.PWACapabilities = {
        isStandalone,
        shouldKeepAwake,
        requestWakeLock,
        releaseWakeLock,
        badging,
    };

    if (shouldKeepAwake()) requestWakeLock();
})();
