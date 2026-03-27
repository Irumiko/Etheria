(function loadLegacyAppEntry() {
    const legacyTarget = 'js/app.js';
    const currentSrc = document.currentScript?.getAttribute('src') || 'app.js';
    const alreadyLoaded = Array.from(document.scripts).some((script) => {
        if (script === document.currentScript) return false;
        const src = script.getAttribute('src') || '';
        return src === legacyTarget || src.endsWith(`/${legacyTarget}`);
    });

    if (alreadyLoaded) return;

    const script = document.createElement('script');
    script.src = legacyTarget;
    script.dataset.etheriaCompat = currentSrc;
    document.head.appendChild(script);
})();
