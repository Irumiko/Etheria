// Core Web Vitals tracking (lightweight, no external dependency)
(function initCoreWebVitalsTracking() {
    if (typeof window === 'undefined' || typeof PerformanceObserver === 'undefined') return;

    const metrics = {};
    const listeners = [];

    function emit(name, value, extra = {}) {
        const payload = {
            name,
            value,
            ts: Date.now(),
            page: location.pathname,
            ...extra,
        };
        metrics[name] = payload;
        listeners.forEach((cb) => {
            try { cb(payload); } catch (error) { window.EtheriaLogger?.warn('app', 'operation failed:', error?.message || error); }
        });
        try {
            const endpoint = window.__ETHERIA_VITALS_ENDPOINT;
            if (endpoint && navigator.sendBeacon) {
                navigator.sendBeacon(endpoint, JSON.stringify(payload));
            }
        } catch (error) { window.EtheriaLogger?.warn('app', 'operation failed:', error?.message || error); }
    }

    function observePaintMetrics() {
        try {
            const po = new PerformanceObserver((list) => {
                list.getEntries().forEach((entry) => {
                    if (entry.name === 'first-contentful-paint') emit('FCP', entry.startTime);
                });
            });
            po.observe({ type: 'paint', buffered: true });
        } catch (error) { window.EtheriaLogger?.warn('app', 'operation failed:', error?.message || error); }

        try {
            const nav = performance.getEntriesByType('navigation')[0];
            if (nav) emit('TTFB', nav.responseStart);
        } catch (error) { window.EtheriaLogger?.warn('app', 'operation failed:', error?.message || error); }

        try {
            const resources = performance.getEntriesByType('resource') || [];
            const cssTimes = resources
                .filter((entry) => entry.initiatorType === 'link' && /\.css(\?|$)/.test(entry.name))
                .map((entry) => entry.responseEnd - entry.startTime)
                .filter((v) => Number.isFinite(v) && v >= 0);
            if (cssTimes.length) {
                const totalCssLoad = cssTimes.reduce((a, b) => a + b, 0);
                emit('CSS_LOAD_TOTAL_MS', totalCssLoad, { samples: cssTimes.length });
            }
        } catch (error) { window.EtheriaLogger?.warn('app', 'operation failed:', error?.message || error); }
    }

    function observeLCP() {
        let last;
        try {
            const po = new PerformanceObserver((list) => {
                const entries = list.getEntries();
                last = entries[entries.length - 1];
            });
            po.observe({ type: 'largest-contentful-paint', buffered: true });
            const flush = () => {
                if (last) emit('LCP', last.startTime);
                po.disconnect();
            };
            document.addEventListener('visibilitychange', () => {
                if (document.visibilityState === 'hidden') flush();
            }, { once: true });
            window.addEventListener('pagehide', flush, { once: true });
        } catch (error) { window.EtheriaLogger?.warn('app', 'operation failed:', error?.message || error); }
    }

    function observeCLS() {
        let cls = 0;
        try {
            const po = new PerformanceObserver((list) => {
                for (const entry of list.getEntries()) {
                    if (!entry.hadRecentInput) cls += entry.value;
                }
                emit('CLS', cls);
            });
            po.observe({ type: 'layout-shift', buffered: true });
        } catch (error) { window.EtheriaLogger?.warn('app', 'operation failed:', error?.message || error); }
    }

    function observeINP() {
        try {
            const po = new PerformanceObserver((list) => {
                let max = 0;
                for (const entry of list.getEntries()) {
                    const duration = entry.duration || 0;
                    if (duration > max) max = duration;
                }
                if (max > 0) emit('INP', max);
            });
            po.observe({ type: 'event', buffered: true, durationThreshold: 40 });
        } catch (error) { window.EtheriaLogger?.warn('app', 'operation failed:', error?.message || error); }
    }

    window.EtheriaVitals = {
        getAll: () => ({ ...metrics }),
        onMetric: (cb) => {
            if (typeof cb !== 'function') return () => {};
            listeners.push(cb);
            return () => {
                const i = listeners.indexOf(cb);
                if (i >= 0) listeners.splice(i, 1);
            };
        },
    };

    observePaintMetrics();
    observeLCP();
    observeCLS();
    observeINP();
})();
