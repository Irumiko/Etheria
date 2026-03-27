(function loadLegacyUiEntry() {
    const legacyTarget = 'js/ui/ui.js';
    const currentSrc = document.currentScript?.getAttribute('src') || 'ui.js';
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
