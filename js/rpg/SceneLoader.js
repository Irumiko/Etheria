// ============================================================
// SCENE LOADER
// Carga scripts JSON de forma lazy (solo cuando se necesitan),
// los cachea en memoria y hace prefetch de las escenas enlazadas
// en segundo plano para que las transiciones sean instantáneas.
// ============================================================

const SceneLoader = (function () {

    const _cache   = new Map();   // sceneId → objeto parseado
    let   _index   = null;        // contenido de _index.json
    const _pending = new Map();   // sceneId → Promise en vuelo

    const INDEX_PATH = 'js/scenes/_index.json';
    const SCENES_PATH = 'js/scenes/';

    // ── API pública ─────────────────────────────────────────────

    /**
     * Carga una escena por ID.
     * Primero comprueba caché, luego el índice, luego hace fetch.
     * Lanza Error si la escena no existe o el JSON es inválido.
     */
    async function load(sceneId) {
        if (_cache.has(sceneId)) {
            return _cache.get(sceneId);
        }

        if (_pending.has(sceneId)) {
            return _pending.get(sceneId);
        }

        const promise = _fetchScene(sceneId);
        _pending.set(sceneId, promise);

        try {
            const scene = await promise;
            _cache.set(sceneId, scene);
            _pending.delete(sceneId);
            _prefetchLinked(scene);
            return scene;
        } catch (err) {
            _pending.delete(sceneId);
            // No relanzar — emitir evento y devolver null para que el engine se detenga limpiamente
            console.error('[SceneLoader]', err.message);
            eventBus.emit('scene:error', { sceneId: sceneId, message: err.message });
            return null;
        }
    }

    /**
     * Precarga una escena sin necesitarla aún.
     * Útil para precargar antes de que el usuario llegue.
     * No lanza errores — falla silenciosamente.
     */
    function prefetch(sceneId) {
        if (!_cache.has(sceneId) && !_pending.has(sceneId)) {
            load(sceneId).catch(() => {});
        }
    }

    /**
     * Comprueba si una escena ya está en caché.
     */
    function isCached(sceneId) {
        return _cache.has(sceneId);
    }

    /**
     * Limpia la caché — toda o solo una escena.
     */
    function clearCache(sceneId) {
        if (sceneId) {
            _cache.delete(sceneId);
        } else {
            _cache.clear();
            _index = null;
        }
    }

    /**
     * Devuelve el índice completo (metadatos de todas las escenas).
     */
    async function getIndex() {
        if (_index) return _index;
        return _loadIndex();
    }

    // ── Lógica interna ──────────────────────────────────────────

    async function _fetchScene(sceneId) {
        // Obtener la ruta del archivo desde el índice
        const index = await _loadIndex();
        const entry = index[sceneId];

        let filePath;
        if (entry && entry.file) {
            filePath = SCENES_PATH + entry.file;
        } else {
            // Fallback: asumir nombre de archivo igual al ID
            filePath = SCENES_PATH + sceneId + '.json';
        }

        const response = await fetch(filePath);

        if (!response.ok) {
            throw new Error(
                `[SceneLoader] No se pudo cargar "${sceneId}" desde "${filePath}" (HTTP ${response.status})`
            );
        }

        let scene;
        try {
            scene = await response.json();
        } catch (e) {
            throw new Error(`[SceneLoader] JSON inválido en "${filePath}": ${e.message}`);
        }

        return scene;
    }

    async function _loadIndex() {
        if (_index) return _index;

        try {
            const res = await fetch(INDEX_PATH);
            if (!res.ok) {
                // Si no hay índice, trabajar sin él (modo degradado)
                console.warn('[SceneLoader] No se encontró _index.json — usando nombres de archivo directamente');
                _index = {};
                return _index;
            }
            _index = await res.json();
        } catch (e) {
            console.warn('[SceneLoader] Error cargando índice:', e.message);
            _index = {};
        }

        return _index;
    }

    // Máximo de escenas a precargar en background desde una sola escena
    const MAX_PREFETCH = 3;

    // Analiza una escena ya cargada y precarga las escenas a las que
    // puede saltar, sin bloquear la ejecución actual.
    function _prefetchLinked(scene) {
        const linked = new Set();

        function scan(steps) {
            if (!Array.isArray(steps)) return;
            steps.forEach(step => {
                if (step.type === 'goto_scene' && step.scene) {
                    linked.add(step.scene);
                }
                if (step.type === 'choice' && Array.isArray(step.options)) {
                    step.options.forEach(opt => {
                        if (opt.goto && !scene.branches?.[opt.goto]) {
                            linked.add(opt.goto);
                        }
                    });
                }
                if (step.type === 'stat_check') {
                    [step.on_success, step.on_fail].forEach(target => {
                        if (target && !scene.branches?.[target]) linked.add(target);
                    });
                }
            });
        }

        scan(scene.steps);
        Object.values(scene.branches || {}).forEach(scan);

        // Limitar a MAX_PREFETCH escenas para no saturar la red
        const candidates = Array.from(linked)
            .filter(id => id !== scene.id)
            .filter(id => !_cache.has(id))
            .slice(0, MAX_PREFETCH);

        candidates.forEach(id => {
            setTimeout(() => prefetch(id), 300);
        });
    }

    return { load, prefetch, isCached, clearCache, getIndex };
})();
