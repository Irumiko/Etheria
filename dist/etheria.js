/* js/core/events.js */
// Bus de eventos desacoplado para módulos UI.
(function initEtheriaEvents(global) {
    const EVENT_PREFIX = 'etheria:';

    // ── Debug logging ────────────────────────────────────────────
    // Activar desde la consola del navegador (persiste entre recargas):
    //   localStorage.setItem('etheria_debug_events', '1')      → todos los eventos
    //   localStorage.setItem('etheria_debug_events', 'scene')  → solo eventos 'scene:*'
    //   localStorage.setItem('etheria_debug_events', 'ui,rpg') → múltiples namespaces
    //   localStorage.removeItem('etheria_debug_events')        → desactivar
    //
    // Formato del log:
    //   [etheria] 14:32:12.453  scene:step  {sceneId, stepIndex, step}
    //   [scene forest_intro] 14:32:14.210  scene:choice-shown  {...}
    //
    // Cuando hay una escena RPG activa, el prefijo muestra su id.
    // window.__etheriaScene se actualiza automáticamente con scene:started/ended.
    //
    // Eventos de alta frecuencia excluidos por defecto del log sin filtro:
    //   rpg:state-updated  (cada cambio de HP/XP)
    //   audio:play-sfx     (cada efecto de sonido)

    const HIGH_FREQ = { 'rpg:state-updated': true, 'audio:play-sfx': true };

    function _timestamp() {
        // HH:MM:SS.mmm  — suficiente para correlacionar timers y waits de escena
        return new Date().toISOString().slice(11, 23);
    }

    function _prefix() {
        var scene = global.__etheriaScene;
        return scene ? '[scene ' + scene + ']' : '[etheria]';
    }

    function _trackSceneContext(type, payload) {
        if (type === 'scene:started' && payload && payload.sceneId) {
            global.__etheriaScene     = payload.sceneId;
            global.__etheriaSceneStep = 0;
        } else if (type === 'scene:step' && payload) {
            global.__etheriaSceneStep = payload.stepIndex;
        } else if (type === 'scene:ended' || type === 'scene:stopped') {
            global.__etheriaScene     = null;
            global.__etheriaSceneStep = null;
        }
    }

    function _shouldLog(type, setting) {
        if (setting === '1' || setting === 'true') {
            return !HIGH_FREQ[type];
        }
        var filters = setting.split(',');
        for (var i = 0; i < filters.length; i++) {
            var ns = filters[i].trim();
            if (ns && type.indexOf(ns) === 0) return true;
        }
        return false;
    }

    function _debugLog(type, payload) {
        // Actualizar contexto de escena siempre, independientemente del filtro
        _trackSceneContext(type, payload);

        var setting = localStorage.getItem('etheria_debug_events');
        if (!setting) return;
        if (!_shouldLog(type, setting)) return;

        console.log(_prefix(), _timestamp(), ' ', type, payload);
    }

    const eventBus = {
        emit: function emit(type, payload) {
            _debugLog(type, payload);
            document.dispatchEvent(new CustomEvent(EVENT_PREFIX + type, { detail: payload }));
        },
        on: function on(type, handler) {
            const wrapped = function wrapped(e) {
                handler(e.detail);
            };
            document.addEventListener(EVENT_PREFIX + type, wrapped);
            return function off() {
                document.removeEventListener(EVENT_PREFIX + type, wrapped);
            };
        },
        once: function once(type, handler) {
            const off = this.on(type, function(payload) {
                handler(payload);
                off();
            });
            return off;
        }
    };

    // ── Contrato canónico de payloads ────────────────────────────
    // Fuente de verdad para todos los emisores y listeners.
    // Cualquier cambio de schema debe hacerse aquí primero.
    //
    // ui:show-autosave  →  { text: string, state: 'saved'|'error'|'info' }
    // ui:show-toast     →  { text: string, action?: string, onAction?: fn }
    // ui:reset-vn-state →  {}
    //
    // sync:status-changed → { status: string, message: string, target: 'indicator'|'button' }
    //   status valores:
    //     indicator → 'online' | 'degraded' | 'offline'
    //     button    → 'synced' | 'syncing'  | 'pending-upload' | 'pending-download' | 'error'
    //
    // audio:start-menu-music  →  {}
    // audio:stop-menu-music   →  { fadeOut?: boolean }
    // audio:start-rain        →  {}
    // audio:stop-rain         →  {}
    // audio:play-sfx          →  { sfx: string }
    //
    // scene:started           →  { sceneId: string }
    // scene:step              →  { sceneId, stepIndex, step }
    // scene:choice-shown      →  { sceneId, stepIndex, step, options[] }
    // scene:choice-made       →  { sceneId, optionIndex }
    // scene:background        →  { asset, transition?, duration? }
    // scene:sound             →  { action: 'start'|'stop', track }
    // scene:camera            →  { effect, duration? }
    // scene:stat-check-result →  { stat, roll, modifier, total, difficulty, result }
    // scene:ended             →  { sceneId, outcome? }
    // scene:error             →  { sceneId?, error }
    // scene:input:advance     →  {}
    // scene:input:choice      →  { index: number }
    //
    // rpg:state-changed       →  { type }
    // rpg:state-updated       →  { hp: {current, max}, xp, level }
    //
    // weather:changed         →  { weather: 'none'|'rain'|'fog' }
    // vn:background-changed   →  { asset: string, transition?: string, duration?: number, scene?: string }
    //
    // ── Pendiente (no implementado) ──────────────────────────────
    // Wildcards:  eventBus.on('scene:*', handler)
    //   Útil para debug overlay, analytics y logging global.
    //   Requiere cambiar el mecanismo interno de addEventListener
    //   por un mapa de handlers propio. Sin dependencias externas.
    //   Prioritario cuando haya un sistema de analytics o replay.

    global.eventBus = eventBus;
})(window);

// ── Helper de debug global ───────────────────────────────────────────────────
// Solo para uso en consola del navegador durante desarrollo.
// No debe usarse en lógica de la aplicación.
//
//   etheriaDebug.scene()   → { scene: 'forest_intro', step: 3 }
//   etheriaDebug.enable()  → activa todos los logs
//   etheriaDebug.enable('scene')  → filtra por namespace
//   etheriaDebug.disable() → desactiva los logs
//
window.etheriaDebug = {
    scene: function() {
        return {
            scene: window.__etheriaScene     ?? null,
            step:  window.__etheriaSceneStep ?? null
        };
    },
    enable: function(filter) {
        localStorage.setItem('etheria_debug_events', filter || '1');
        console.log('[etheriaDebug] logging activo' + (filter ? ' (filtro: ' + filter + ')' : ''));
    },
    disable: function() {
        localStorage.removeItem('etheria_debug_events');
        console.log('[etheriaDebug] logging desactivado');
    }
};

/* js/utils/state.js */
// Archivo de estado global (variables y configuración base).
// ============================================
// DATA/STATE.JS
// ============================================
// Este archivo contiene los datos base y el estado global de la aplicación.
// Si quieres cambiar nombres por defecto, claves de guardado o ajustes iniciales,
// este es el lugar correcto.

// ============================================
// DATOS Y CONFIGURACIÓN
// ============================================
const alignments = {
    'LB': 'Legal Bueno', 'LN': 'Legal Neutral', 'LM': 'Legal Malvado',
    'NB': 'Neutral Bueno', 'NN': 'Neutral Neutral', 'NM': 'Neutral Malvado',
    'CB': 'Caótico Bueno', 'CN': 'Caótico Neutral', 'CM': 'Caótico Malvado'
};

// Sistema de rangos de afinidad - Solo nombres, sin mostrar puntos
const affinityRanks = [
    { name: 'Desconocidos', min: 0, max: 15, increment: 5, color: '#ffffff' },
    { name: 'Conocidos', min: 16, max: 35, increment: 4, color: '#9b59b6' },
    { name: 'Amigos', min: 36, max: 60, increment: 3, color: '#3498db' },
    { name: 'Mejores Amigos', min: 61, max: 80, increment: 2, color: '#27ae60' },
    { name: 'Interés Romántico', min: 81, max: 95, increment: 1, color: '#f1c40f' },
    { name: 'Pareja', min: 96, max: 100, increment: 0.5, color: '#e74c3c' }
];

// Emotes manga con símbolos
const emoteConfig = {
    angry: { symbol: '💢', class: 'emote-angry', name: 'Ira' },
    happy: { symbol: '✨', class: 'emote-happy', name: 'Alegría' },
    shock: { symbol: '💦', class: 'emote-shock', name: 'Sorpresa' },
    sad: { symbol: '💧', class: 'emote-sad', name: 'Tristeza' },
    think: { symbol: '💭', class: 'emote-think', name: 'Pensando' },
    love: { symbol: '💕', class: 'emote-love', name: 'Amor' },
    annoyed: { symbol: '💢', class: 'emote-annoyed', name: 'Frustración' },
    embarrassed: { symbol: '〃', class: 'emote-embarrassed', name: 'Vergüenza' },
    idea: { symbol: '💡', class: 'emote-idea', name: 'Idea' },
    sleep: { symbol: '💤', class: 'emote-sleep', name: 'Sueño' }
};

let userNames = ['Jugador 1', 'Jugador 2', 'Jugador 3'];
let currentUserIndex = 0;
let appData = {
    topics: [],
    characters: [],
    messages: {},
    affinities: {},
    favorites: {},
    journals: {},
    cloudProfiles: [],   // Perfiles globales de Supabase (no persisten en local)
    cloudCharacters: {}, // Personajes de Supabase por profileId: { [profileId]: Array }
    stories: []          // Historias de Supabase (cargadas en memoria)
};
let currentTopicId = null;
let selectedCharId = null;
let currentSheetCharId = null;
let currentMessageIndex = 0;
let isTyping = false;
let typewriterInterval;
let typewriterSessionId = 0;
let isNarratorMode = false;
let pendingContinuation = null;
let hasUnsavedChanges = false;
let isLoading = false;
let currentFilter = 'none';
let textSpeed = 25;
let currentEditorTab = 'identity';
let editingMessageId = null;
let currentAffinity = 0;
let tempBranches = [];
let currentEmote = null;
let currentWeather = 'none';
let currentTopicMode = 'roleplay'; // 'roleplay' o 'rpg'
let spriteModeClassic = false; // false = modo rpg persistente, true = modo clásico
let oracleModeActive = false; // true cuando el oráculo está activo en el panel de respuesta
let pendingRoleTopicId = null;
let tooltipRoot = null;
let lastFocusedElement = null;
let touchStartX = 0;
let touchStartY = 0;
let gallerySearchDebounceTimer = null;
let galleryImageObserver = null;
let historyVirtualState = null;
let pendingRoomInviteId = null;
let currentStoryId = null;           // UUID de la historia activa en Supabase
let currentStoryParticipants = [];   // Participantes de la historia activa
const spritePool = [];
const STORAGE_KEYS = {
    legacy: 'etheria_data',
    topics: 'etheria_topics',
    characters: 'etheria_characters',
    affinities: 'etheria_affinities',
    messageTopics: 'etheria_message_topics',
    topicPrefix: 'etheria_messages_'
};
const LAST_PROFILE_KEY = 'lastProfileId';
const LOCAL_PROFILE_UPDATED_PREFIX = 'etheria_profile_updated_';
const AUTO_SYNC_INTERVAL = 30000;
const OFFLINE_SYNC_INTERVAL = 60000;
// Fix 5: JSONBin is DISABLED — Supabase handles all cloud persistence.
// The config is kept as a stub so callers don't crash; ensureCloudConfig() blocks all calls.
const JSONBIN_CONFIG = {
    apiKey: '',
    binId: '',
    baseUrl: 'https://api.jsonbin.io/v3/b'
};
let cloudSyncStatus = 'idle';
let cloudSyncInterval = null;
let cloudSyncInProgress = false;
let cloudUnsyncedChanges = false;
let lastSyncTimestamp = 0;
let lastKnownServerTimestamp = 0;
let pendingRemoteProfileData = null;
let pendingRemoteTimestamp = 0;
let isOfflineMode = false;
const cloudMigrationPendingProfiles = new Set();

/* js/pwa-viewport.js */
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

    const viewportMeta = document.querySelector('meta[name="viewport"]');
    if (viewportMeta) {
        viewportMeta.setAttribute(
            'content',
            'width=device-width, initial-scale=1.0, viewport-fit=cover, maximum-scale=1.0, user-scalable=no'
        );
    }

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

/* js/pwa-gestures.js */
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

/* js/pwa-lifecycle.js */
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

/* js/pwa-capabilities.js */
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

/* js/utils/webVitals.js */
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

/* js/utils/logger.js */
// Central logger with levels and context tags.
(function initEtheriaLogger(global) {
    const LEVELS = { error: 0, warn: 1, info: 2, debug: 3 };
    const stored = (typeof localStorage !== 'undefined' && localStorage.getItem('etheria_log_level')) || 'warn';
    let currentLevel = LEVELS[stored] ?? LEVELS.warn;

    function shouldLog(level) {
        const n = LEVELS[level] ?? LEVELS.info;
        return n <= currentLevel;
    }

    function fmt(level, tag, args) {
        const ts = new Date().toISOString();
        return [`[${ts}] [${level.toUpperCase()}]${tag ? ` [${tag}]` : ''}`, ...args];
    }

    const logger = {
        setLevel(level) {
            if (!(level in LEVELS)) return;
            currentLevel = LEVELS[level];
            try { localStorage.setItem('etheria_log_level', level); } catch (error) { console.warn('[EtheriaLogger] localStorage set failed:', error?.message || error); }
        },
        getLevel() {
            return Object.keys(LEVELS).find((k) => LEVELS[k] === currentLevel) || 'warn';
        },
        error(tag, ...args) { if (shouldLog('error')) console.error(...fmt('error', tag, args)); },
        warn(tag, ...args) { if (shouldLog('warn')) console.warn(...fmt('warn', tag, args)); },
        info(tag, ...args) { if (shouldLog('info')) console.info(...fmt('info', tag, args)); },
        debug(tag, ...args) { if (shouldLog('debug')) console.debug(...fmt('debug', tag, args)); },
    };

    global.EtheriaLogger = logger;
})(window);

/* js/config/supabase.js */
(function initSupabaseConfig(global) {
    const DEFAULT_SUPABASE_CONFIG = {
        url: 'https://timtqdrfeuzwwixfnudj.supabase.co',
        key: 'sb_publishable_imGaxAfo_z1NuG6NV8pDtQ_A6Wp3DH3'
    };

    const fromGlobal = global.SUPABASE_CONFIG || {};
    const fromEnv = global.__ETHERIA_ENV__?.supabase || {};

    global.SUPABASE_CONFIG = {
        url: fromEnv.url || fromGlobal.url || DEFAULT_SUPABASE_CONFIG.url,
        key: fromEnv.key || fromGlobal.key || DEFAULT_SUPABASE_CONFIG.key
    };
})(window);

/* js/utils/supabaseAuthHeaders.js */
(function initSupabaseAuthHeaders(global) {
    async function getAccessToken(client) {
        try {
            if (!client || typeof client.auth?.getSession !== 'function') return null;
            const { data: { session } } = await client.auth.getSession();
            return session?.access_token || null;
        } catch (_) {
            return null;
        }
    }

    async function buildAuthHeaders({ apikey, client, baseHeaders = {}, acceptJson = false }) {
        const token = await getAccessToken(client);
        const headers = {
            apikey,
            Authorization: `Bearer ${token || apikey}`,
            ...baseHeaders,
        };
        if (acceptJson) headers.Accept = 'application/json';
        return headers;
    }

    global.SupabaseAuthHeaders = { getAccessToken, buildAuthHeaders };
})(window);

/* js/core/store.js */
// Store centralizado mínimo para migración incremental sin romper globals.
(function initEtheriaStore(global) {
    function createStore(initialState) {
        let state = { ...initialState };
        const listeners = new Set();

        return {
            get: function getState() {
                return state;
            },
            set: function setState(updater) {
                const prev = state;
                const patch = (typeof updater === 'function') ? updater(prev) : updater;
                const next = (patch && typeof patch === 'object') ? { ...prev, ...patch } : prev;
                if (next === prev) return prev;
                state = next;
                listeners.forEach(function notify(listener) {
                    listener(prev, next);
                });
                return next;
            },
            subscribe: function subscribe(listener) {
                listeners.add(listener);
                return function unsubscribe() {
                    listeners.delete(listener);
                };
            }
        };
    }

    const vnStore = createStore({
        topicId: null,
        selectedCharId: null,
        messageIndex: 0,
        isTyping: false,
        weather: 'none'
    });

    function syncVnStore(partial) {
        return vnStore.set(partial);
    }

    global.createStore = createStore;
    global.vnStore = vnStore;
    global.syncVnStore = syncVnStore;
})(window);

/* js/utils/storage.js */
// Utilidades de persistencia y funciones de apoyo del núcleo.
// ============================================
// CORE/STORAGE.JS
// ============================================
// Aquí viven utilidades del núcleo: lectura/escritura en localStorage,
// preferencias del sistema y helpers generales usados por toda la app.

function getStoredLastProfileId() {
    const stored = Number.parseInt(localStorage.getItem(LAST_PROFILE_KEY), 10);
    return Number.isInteger(stored) && stored >= 0 && stored < userNames.length ? stored : null;
}

function prefersReducedMotion() {
    return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function announceForScreenReader(text) {
    const announcer = document.getElementById('screenReaderAnnouncements');
    if (!announcer) return;
    announcer.textContent = '';
    setTimeout(() => {
        announcer.textContent = text;
    }, 30);
}

function parseStoredJSON(key, fallback) {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    try {
        return JSON.parse(raw);
    } catch (error) {
        console.error(`Error parsing key ${key}:`, error);
        return fallback;
    }
}

function getTopicStorageKey(topicId) {
    return `${STORAGE_KEYS.topicPrefix}${topicId}`;
}

function _migrateTopicModes(topics) {
    // Migración: topics guardados con mode:'fanfic' (nombre interno antiguo)
    // se renombran a mode:'rpg' para consistencia con la UI
    if (!Array.isArray(topics)) return topics;
    let changed = false;
    const migrated = topics.map(t => {
        if (t.mode === 'fanfic') { changed = true; return { ...t, mode: 'rpg' }; }
        return t;
    });
    if (changed) {
        try { localStorage.setItem(STORAGE_KEYS.topics, JSON.stringify(migrated)); } catch (error) { window.EtheriaLogger?.warn('app', 'operation failed:', error?.message || error); }
        console.info('[Etheria] Migración: mode fanfic→rpg aplicada a', migrated.filter(t=>t.mode==='rpg').length, 'topics');
    }
    return migrated;
}

function loadStoredAppData() {
    let topics = parseStoredJSON(STORAGE_KEYS.topics, null);
    const characters = parseStoredJSON(STORAGE_KEYS.characters, null);

    // Migrar topics con modo antiguo 'fanfic' → 'rpg'
    if (Array.isArray(topics)) topics = _migrateTopicModes(topics);

    if (Array.isArray(topics) || Array.isArray(characters)) {
        return {
            topics: Array.isArray(topics) ? topics : [],
            characters: Array.isArray(characters) ? characters : [],
            messages: {},
            affinities: parseStoredJSON(STORAGE_KEYS.affinities, {}) || {},
            favorites: parseStoredJSON('etheria_favorites', {}) || {},
            journals:  parseStoredJSON('etheria_journals', {}) || {},
            reactions: parseStoredJSON('etheria_reactions', {}) || {}
        };
    }

    const legacy = parseStoredJSON(STORAGE_KEYS.legacy, null);
    if (legacy && typeof legacy === 'object') {
        return {
            topics: Array.isArray(legacy.topics) ? legacy.topics : [],
            characters: Array.isArray(legacy.characters) ? legacy.characters : [],
            messages: (legacy.messages && typeof legacy.messages === 'object' && !Array.isArray(legacy.messages)) ? legacy.messages : {},
            affinities: (legacy.affinities && typeof legacy.affinities === 'object' && !Array.isArray(legacy.affinities)) ? legacy.affinities : {},
            favorites: (legacy.favorites && typeof legacy.favorites === 'object') ? legacy.favorites : {},
            journals:  (legacy.journals  && typeof legacy.journals  === 'object') ? legacy.journals  : {},
            reactions: (legacy.reactions && typeof legacy.reactions === 'object') ? legacy.reactions : {}
        };
    }

    return { topics: [], characters: [], messages: {}, affinities: {}, favorites: {}, journals: {}, reactions: {} };
}

function loadTopicMessagesFromStorage(topicId) {
    const msgs = parseStoredJSON(getTopicStorageKey(topicId), null);
    return Array.isArray(msgs) ? msgs : [];
}

function getTopicMessages(topicId) {
    if (!topicId) return [];
    if (Array.isArray(appData.messages[topicId])) return appData.messages[topicId];
    const loaded = loadTopicMessagesFromStorage(topicId);
    appData.messages[topicId] = loaded;
    return loaded;
}

// ── Fix 9: dirty-partition tracking ────────────────────────────────────────
// Instead of serialising every collection on every save(), callers mark only
// the partitions that changed. persistPartitionedData() then flushes only
// those dirty buckets, skipping the rest.
//
// Usage:
//   markDirty('topics');          // after adding/removing/editing a topic
//   markDirty('characters');      // after editing characters
//   markDirty('messages', id);    // after appending/merging messages for topicId
//   markDirty('affinities');
//   markDirty('favorites');
//   markDirty('journals');
//   markDirty('reactions');
//
// Calling persistPartitionedData() without any markDirty() calls is a no-op
// for the partition buckets (legacy snapshot and message-topics index are
// always refreshed for backward-compat, but they are small).
const _dirtyPartitions = new Set();
const _dirtyMessageTopics = new Set();

function markDirty(partition, topicId) {
    _dirtyPartitions.add(partition);
    if (partition === 'messages' && topicId != null) {
        _dirtyMessageTopics.add(String(topicId));
    }
}

function _flushAllDirty() {
    // Force-mark everything — used after bulk imports or cloud downloads
    _dirtyPartitions.add('topics');
    _dirtyPartitions.add('characters');
    _dirtyPartitions.add('affinities');
    _dirtyPartitions.add('favorites');
    _dirtyPartitions.add('journals');
    _dirtyPartitions.add('reactions');
    _dirtyPartitions.add('messages');
    if (appData && Array.isArray(appData.topics)) {
        appData.topics.forEach(t => _dirtyMessageTopics.add(String(t.id)));
    }
}

function persistPartitionedData(forceAll = false) {
    if (forceAll) _flushAllDirty();

    // Flush only changed partitions
    if (_dirtyPartitions.has('topics')) {
        localStorage.setItem(STORAGE_KEYS.topics, JSON.stringify(appData.topics));
    }
    if (_dirtyPartitions.has('characters')) {
        localStorage.setItem(STORAGE_KEYS.characters, JSON.stringify(appData.characters));
    }
    if (_dirtyPartitions.has('affinities')) {
        localStorage.setItem(STORAGE_KEYS.affinities, JSON.stringify(appData.affinities));
    }
    if (_dirtyPartitions.has('favorites')) {
        localStorage.setItem('etheria_favorites', JSON.stringify(appData.favorites || {}));
    }
    if (_dirtyPartitions.has('journals')) {
        localStorage.setItem('etheria_journals', JSON.stringify(appData.journals || {}));
    }
    if (_dirtyPartitions.has('reactions')) {
        localStorage.setItem('etheria_reactions', JSON.stringify(appData.reactions || {}));
    }

    // Always refresh the topic-ID index (tiny — just an array of IDs)
    const topicIds = appData.topics.map(t => String(t.id));
    localStorage.setItem(STORAGE_KEYS.messageTopics, JSON.stringify(topicIds));

    // Flush only the per-topic message partitions that changed
    const topicsToFlush = (_dirtyPartitions.has('messages') && _dirtyMessageTopics.size === 0)
        ? topicIds   // 'messages' marked but no specific topic → flush all (e.g. bulk import)
        : [..._dirtyMessageTopics].filter(id => topicIds.includes(id));

    topicsToFlush.forEach((topicId) => {
        const topicMsgs = Array.isArray(appData.messages[topicId])
            ? appData.messages[topicId]
            : loadTopicMessagesFromStorage(topicId);
        localStorage.setItem(getTopicStorageKey(topicId), JSON.stringify(topicMsgs));
    });

    // Orphan cleanup — only when topic list changed (avoids scanning localStorage every save)
    if (_dirtyPartitions.has('topics')) {
        Object.keys(localStorage)
            .filter((k) => k.startsWith(STORAGE_KEYS.topicPrefix))
            .forEach((k) => {
                const topicId = k.replace(STORAGE_KEYS.topicPrefix, '');
                if (!topicIds.includes(topicId)) {
                    localStorage.removeItem(k);
                }
            });

        if (appData.reactions && typeof appData.reactions === 'object') {
            const orphanReactionTopics = Object.keys(appData.reactions)
                .filter(tid => !topicIds.includes(String(tid)));
            orphanReactionTopics.forEach(tid => { delete appData.reactions[tid]; });
            if (orphanReactionTopics.length > 0) {
                localStorage.setItem('etheria_reactions', JSON.stringify(appData.reactions));
            }
        }
    }

    // Legacy snapshot — only rebuild when structural data changed
    if (_dirtyPartitions.has('topics') || _dirtyPartitions.has('characters') ||
        _dirtyPartitions.has('affinities') || _dirtyPartitions.has('messages')) {
        const legacySnapshot = {
            topics: appData.topics,
            characters: appData.characters,
            messages: appData.messages,
            affinities: appData.affinities,
            favorites: appData.favorites || {},
            journals: appData.journals || {},
            reactions: appData.reactions || {}
        };
        localStorage.setItem(STORAGE_KEYS.legacy, JSON.stringify(legacySnapshot));
    }

    // Reset dirty sets now that everything is flushed
    _dirtyPartitions.clear();
    _dirtyMessageTopics.clear();
}

function updateCloudSyncIndicator(status, message = '') {
    cloudSyncStatus = status;
    if (typeof eventBus !== 'undefined') {
        eventBus.emit('sync:status-changed', { status, message, target: 'indicator' });
    }
}

function updateSyncButtonState(status, message = '') {
    if (typeof eventBus !== 'undefined') {
        eventBus.emit('sync:status-changed', { status, message, target: 'button' });
    }
}

function hideSyncToast() {
    const toast = document.getElementById('syncToast');
    const backdrop = document.getElementById('syncToastBackdrop');
    if (toast) toast.classList.remove('visible');
    if (backdrop) backdrop.classList.remove('visible');
}

function showSyncToast(message, actionText, onAction) {
    const toast = document.getElementById('syncToast');
    const backdrop = document.getElementById('syncToastBackdrop');
    if (!toast) return;

    const textEl = toast.querySelector('.sync-toast-text');
    const button = toast.querySelector('.sync-toast-action');
    if (textEl) textEl.textContent = message;
    if (button) {
        button.textContent = actionText || 'Ver ahora';
        button.onclick = () => {
            hideSyncToast();
            if (typeof onAction === 'function') onAction();
        };
    }

    // Cerrar también al clicar el backdrop
    if (backdrop) {
        backdrop.classList.add('visible');
        backdrop.onclick = hideSyncToast;
    }

    toast.classList.add('visible');
    // Auto-cierre a los 8 segundos
    window.setTimeout(hideSyncToast, 8000);
}

function getLocalProfileUpdatedAt(profileIndex = currentUserIndex) {
    const raw = localStorage.getItem(`${LOCAL_PROFILE_UPDATED_PREFIX}${profileIndex}`);
    const timestamp = Number.parseInt(raw || '0', 10);
    return Number.isFinite(timestamp) ? timestamp : 0;
}

function setLocalProfileUpdatedAt(profileIndex = currentUserIndex, timestamp = Date.now()) {
    localStorage.setItem(`${LOCAL_PROFILE_UPDATED_PREFIX}${profileIndex}`, String(timestamp));
}

function countMessagesInProfile(profileData) {
    return Object.values(profileData?.messages || {}).reduce((acc, list) => acc + (Array.isArray(list) ? list.length : 0), 0);
}

function getProfileScopedAppData(profileIndex = currentUserIndex) {
    const topics = appData.topics.filter(topic => topic.createdByIndex === profileIndex);
    const topicIds = new Set(topics.map(topic => String(topic.id)));
    const messages = {};

    Object.keys(appData.messages).forEach((topicId) => {
        if (topicIds.has(String(topicId))) {
            messages[topicId] = Array.isArray(appData.messages[topicId]) ? appData.messages[topicId] : [];
        }
    });

    const affinities = {};
    Object.keys(appData.affinities || {}).forEach((topicId) => {
        if (topicIds.has(String(topicId))) affinities[topicId] = appData.affinities[topicId];
    });

    const characters = appData.characters.filter(character => character.userIndex === profileIndex);
    return { topics, characters, messages, affinities };
}

function hasProfileLocalData(profileIndex = currentUserIndex) {
    const data = getProfileScopedAppData(profileIndex);
    return data.topics.length > 0 || data.characters.length > 0 || Object.keys(data.messages).length > 0;
}

function applyProfileData(profileIndex, profileData) {
    const sanitizedData = {
        topics: Array.isArray(profileData?.topics) ? profileData.topics : [],
        characters: Array.isArray(profileData?.characters) ? profileData.characters : [],
        messages: (profileData?.messages && typeof profileData.messages === 'object' && !Array.isArray(profileData.messages)) ? profileData.messages : {},
        affinities: (profileData?.affinities && typeof profileData.affinities === 'object' && !Array.isArray(profileData.affinities)) ? profileData.affinities : {}
    };

    const previousTopicIds = appData.topics.filter(topic => topic.createdByIndex === profileIndex).map(topic => String(topic.id));
    appData.topics = appData.topics.filter(topic => topic.createdByIndex !== profileIndex).concat(sanitizedData.topics);
    appData.characters = appData.characters.filter(character => character.userIndex !== profileIndex).concat(sanitizedData.characters);

    previousTopicIds.forEach((topicId) => {
        if (!sanitizedData.messages[topicId]) {
            delete appData.messages[topicId];
            delete appData.affinities[topicId];
        }
    });

    Object.keys(sanitizedData.messages).forEach((topicId) => { appData.messages[topicId] = sanitizedData.messages[topicId]; });
    Object.keys(sanitizedData.affinities).forEach((topicId) => { appData.affinities[topicId] = sanitizedData.affinities[topicId]; });
}

// ============================================
// SINCRONIZACIÓN CON SUPABASE
// ============================================
// Las funciones de JSONBin han sido reemplazadas por SupabaseSync.
// Ver js/utils/supabaseSync.js para la implementación completa.

function ensureCloudConfig() {
    // JSONBin está deshabilitado. Usar SupabaseSync en su lugar.
    // Esta función se mantiene para compatibilidad con código existente.
    console.warn('[Etheria] JSONBin está deshabilitado. Usando Supabase para sincronización.');
}

async function fetchCloudBin() {
    // DEPRECATED: Usar SupabaseSync.downloadProfileData() en su lugar
    console.warn('[Etheria] fetchCloudBin está deprecado. Usando SupabaseSync.');
    if (typeof SupabaseSync !== 'undefined') {
        const result = await SupabaseSync.downloadProfileData();
        if (result.ok && result.data) {
            return { profiles: { [currentUserIndex || 0]: { appData: result.data } } };
        }
    }
    throw new Error('Usar SupabaseSync para sincronización');
}

async function putCloudBin(record) {
    // DEPRECATED: Usar SupabaseSync.uploadProfileData() en su lugar
    console.warn('[Etheria] putCloudBin está deprecado. Usando SupabaseSync.');
    if (typeof SupabaseSync !== 'undefined') {
        const result = await SupabaseSync.uploadProfileData();
        if (!result.ok) throw new Error(result.error);
    } else {
        throw new Error('SupabaseSync no disponible');
    }
}

function openSyncConflictModal() {
    return new Promise((resolve) => {
        const modal = document.getElementById('syncConflictModal');
        const btnLocal  = document.getElementById('syncKeepLocalBtn');
        const btnServer = document.getElementById('syncKeepServerBtn');

        if (!modal || !btnLocal || !btnServer) {
            // Fallback al confirm nativo si el modal no existe aún
            const keepLocal = confirm('Se detectó conflicto: cambios locales y remotos. ¿Conservar cambios locales?');
            resolve(keepLocal ? 'local' : 'server');
            return;
        }

        const cleanup = (choice) => {
            modal.classList.remove('active');
            document.body.classList.remove('modal-open');
            btnLocal.removeEventListener('click', onLocal);
            btnServer.removeEventListener('click', onServer);
            resolve(choice);
        };

        const onLocal  = () => cleanup('local');
        const onServer = () => cleanup('server');

        btnLocal.addEventListener('click', onLocal);
        btnServer.addEventListener('click', onServer);

        modal.classList.add('active');
        document.body.classList.add('modal-open');
        btnLocal.focus();
    });
}

async function saveToCloud(profileIndex = currentUserIndex) {
    // Usar SupabaseSync si está disponible
    if (typeof SupabaseSync !== 'undefined') {
        const result = await SupabaseSync.uploadProfileData();
        if (result.ok) {
            const now = Date.now();
            setLocalProfileUpdatedAt(profileIndex, now);
            lastSyncTimestamp = now;
            lastKnownServerTimestamp = now;
            cloudUnsyncedChanges = false;
            cloudMigrationPendingProfiles.delete(profileIndex);
            updateCloudSyncIndicator('online', 'Conectado');
            updateSyncButtonState('synced', 'Sincronizar');
            isOfflineMode = false;
            return true;
        } else {
            console.error('Cloud save error:', result.error);
            persistPartitionedData();
            isOfflineMode = true;
            updateCloudSyncIndicator('offline', 'Offline');
            updateSyncButtonState('error', 'Error');
            return false;
        }
    }
    
    // Fallback: solo guardar localmente
    persistPartitionedData();
    return false;
}

async function applyServerProfile(profileIndex, cloudProfile, { refreshUI = true } = {}) {
    applyProfileData(profileIndex, cloudProfile.appData);
    persistPartitionedData(true); // Fix 9: bulk download — force-flush all partitions
    const timestamp = Number.parseInt(cloudProfile.lastModified || '0', 10) || Date.parse(cloudProfile.updatedAt || '') || Date.now();
    setLocalProfileUpdatedAt(profileIndex, timestamp);
    lastSyncTimestamp = timestamp;
    lastKnownServerTimestamp = timestamp;
    cloudUnsyncedChanges = false;
    pendingRemoteProfileData = null;
    pendingRemoteTimestamp = 0;
    updateCloudSyncIndicator('online', 'Conectado');
    updateSyncButtonState('synced', 'Sincronizar');
    if (refreshUI && typeof refreshUIAfterCloudLoad === 'function') refreshUIAfterCloudLoad();
}

async function syncBidirectional(options = {}) {
    const {
        profileIndex = currentUserIndex,
        silent = false,
        allowRemotePrompt = true,
        forceApplyRemote = false
    } = options;

    // Usar SupabaseSync si está disponible
    if (typeof SupabaseSync !== 'undefined') {
        const result = await SupabaseSync.sync({ silent, force: forceApplyRemote });
        
        // Mapear estados de SupabaseSync a los esperados por el código existente
        const statusMap = {
            'synced': 'noop',
            'uploaded': 'uploaded',
            'downloaded': 'downloaded',
            'error': 'error',
            'busy': 'busy',
            'no-auth': 'error'
        };
        
        return { 
            status: statusMap[result.status] || result.status,
            error: result.error 
        };
    }

    // Fallback: modo offline
    if (!silent) eventBus.emit('ui:show-autosave', { text: 'Modo offline - datos solo locales', state: 'info' });
    return { status: 'error', error: 'SupabaseSync no disponible' };
}

async function loadFromCloud() {
    // Usar SupabaseSync si está disponible
    if (typeof SupabaseSync !== 'undefined') {
        const result = await SupabaseSync.downloadProfileData();
        return result.ok;
    }
    return false;
}

function startCloudSync() {
    // Usar SupabaseSync si está disponible
    if (typeof SupabaseSync !== 'undefined') {
        SupabaseSync.startAutoSync();
        return;
    }

    // Fallback: intervalo básico con syncBidirectional
    const targetInterval = isOfflineMode ? OFFLINE_SYNC_INTERVAL : AUTO_SYNC_INTERVAL;

    if (cloudSyncInterval && startCloudSync._intervalMs === targetInterval) return;
    if (cloudSyncInterval) clearInterval(cloudSyncInterval);

    startCloudSync._intervalMs = targetInterval;
    cloudSyncInterval = setInterval(async () => {
        if (cloudSyncInProgress) return;

        const nextInterval = isOfflineMode ? OFFLINE_SYNC_INTERVAL : AUTO_SYNC_INTERVAL;
        if (nextInterval !== startCloudSync._intervalMs) {
            startCloudSync();
            return;
        }

        if (hasUnsavedChanges || cloudUnsyncedChanges || cloudMigrationPendingProfiles.has(currentUserIndex)) {
            await syncBidirectional({ silent: true, allowRemotePrompt: true });
        }
    }, targetInterval);
}

/* js/ui/sounds.js */
// Sistema de sonido ambiental y efectos de audio.
// Todos los sonidos se generan con la Web Audio API (sin archivos externos).
// El volumen general es muy bajo — sirven como apoyo sutil, no protagonistas.

let audioCtx = null;
let rainGainNode = null;
let rainSourceNode = null;
let masterVolume = 0.18; // Volumen general: muy sutil

function getAudioContext() {
    if (!audioCtx) {
        try {
            audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        } catch (e) {
            return null;
        }
    }
    // Reanudar si el navegador lo pausó por política de autoplay
    if (audioCtx.state === 'suspended') audioCtx.resume();
    return audioCtx;
}

// ============================================
// EFECTOS DE UI (clicks, afinidad, etc.)
// ============================================

// Click suave al avanzar diálogo
function playSoundClick() {
    const ctx = getAudioContext();
    if (!ctx) return;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.type = 'sine';
    osc.frequency.setValueAtTime(820, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(580, ctx.currentTime + 0.08);

    gain.gain.setValueAtTime(masterVolume * 0.5, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.1);

    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.1);
}

// Subir afinidad: nota ascendente cálida
function playSoundAffinityUp() {
    const ctx = getAudioContext();
    if (!ctx) return;

    [523, 659, 784].forEach((freq, i) => {
        const osc  = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);

        const t = ctx.currentTime + i * 0.07;
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, t);

        gain.gain.setValueAtTime(0, t);
        gain.gain.linearRampToValueAtTime(masterVolume * 0.45, t + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.22);

        osc.start(t);
        osc.stop(t + 0.25);
    });
}

// Bajar afinidad: nota descendente fría
function playSoundAffinityDown() {
    const ctx = getAudioContext();
    if (!ctx) return;

    [440, 349, 262].forEach((freq, i) => {
        const osc  = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);

        const t = ctx.currentTime + i * 0.07;
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, t);

        gain.gain.setValueAtTime(0, t);
        gain.gain.linearRampToValueAtTime(masterVolume * 0.35, t + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.2);

        osc.start(t);
        osc.stop(t + 0.22);
    });
}

// Guardar: campana suave
function playSoundSave() {
    const ctx = getAudioContext();
    if (!ctx) return;

    const osc  = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.type = 'sine';
    osc.frequency.setValueAtTime(1046, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.35);

    gain.gain.setValueAtTime(masterVolume * 0.4, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);

    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.4);
}

// ============================================
// SONIDO AMBIENTAL: LLUVIA
// ============================================

function startRainSound() {
    const ctx = getAudioContext();
    if (!ctx || rainSourceNode) return; // ya está sonando

    // Ruido blanco filtrado = lluvia
    const bufferSize = ctx.sampleRate * 2;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
        data[i] = Math.random() * 2 - 1;
    }

    rainSourceNode = ctx.createBufferSource();
    rainSourceNode.buffer = buffer;
    rainSourceNode.loop = true;

    // Filtro paso-banda: frecuencia más baja = lluvia lejana sobre techo
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 900;
    filter.Q.value = 0.35;

    // Filtro de graves muy suave
    const lowFilter = ctx.createBiquadFilter();
    lowFilter.type = 'lowshelf';
    lowFilter.frequency.value = 150;
    lowFilter.gain.value = 1.5;

    rainGainNode = ctx.createGain();
    rainGainNode.gain.setValueAtTime(0, ctx.currentTime);
    // Volumen muy sutil: 0.12 del master — sonido de fondo, apenas perceptible
    rainGainNode.gain.linearRampToValueAtTime(masterVolume * 0.12, ctx.currentTime + 3.5);

    rainSourceNode.connect(filter);
    filter.connect(lowFilter);
    lowFilter.connect(rainGainNode);
    rainGainNode.connect(ctx.destination);

    rainSourceNode.start();
}

function stopRainSound() {
    if (!rainGainNode || !rainSourceNode) return;
    const ctx = getAudioContext();
    if (!ctx) return;

    rainGainNode.gain.linearRampToValueAtTime(0, ctx.currentTime + 1.5);
    const srcToStop = rainSourceNode;
    setTimeout(() => {
        try { srcToStop.stop(); } catch (error) { window.EtheriaLogger?.warn('app', 'operation failed:', error?.message || error); }
    }, 1600);

    rainSourceNode = null;
    rainGainNode = null;
}

// Nota: la integración con setWeather está en effects.js directamente.
// playSoundSave, playSoundClick, playSoundAffinityUp/Down
// se llaman desde app-ui.js, vn.js y roleplay.js respectivamente.

// ============================================
// MELODÍA DEL MENÚ PRINCIPAL — estilo 16-bit
// Generada íntegramente con Web Audio API
// ============================================

let _menuMusicNodes = [];
let _menuMusicPlaying = false;
let _menuMusicScheduleId = null;
let _menuMusicGain = null;

// Escala pentatónica menor en Do — aire oriental/fantástico tranquilo
// Notas: C4 D4 Eb4 G4 A4 C5 D5 Eb5 G5
const _MENU_NOTES = {
    C4: 261.63, D4: 293.66, Eb4: 311.13, F4: 349.23,
    G4: 392.00, Ab4: 415.30, Bb4: 466.16,
    C5: 523.25, D5: 587.33, Eb5: 622.25, F5: 698.46,
    G5: 783.99, Ab5: 830.61,
    C3: 130.81, G3: 196.00, Bb3: 233.08,
    REST: 0
};

// Melodía: [nota, duración_beats]  (tempo ~68bpm, beat = 0.88s)
const _MENU_MELODY = [
    // Frase A — suave ascendente
    ['C4',1],['REST',0.5],['Eb4',0.5],['G4',1],['Ab4',0.5],['G4',0.5],
    ['F4',1],['Eb4',1],['REST',1],
    ['D4',0.5],['Eb4',0.5],['G4',1],['Ab4',1],
    ['Bb4',0.5],['Ab4',0.5],['G4',1],['REST',1],
    // Frase B — sube un poco
    ['C5',1],['Bb4',0.5],['Ab4',0.5],['G4',1],['F4',0.5],['Eb4',0.5],
    ['D4',1.5],['C4',0.5],['REST',1],
    ['Eb4',0.5],['F4',0.5],['G4',1],['Ab4',0.5],['G4',0.5],
    ['F4',1],['Eb4',1.5],['REST',0.5],
    // Frase C — reposo
    ['C4',0.5],['D4',0.5],['Eb4',1],['G4',0.5],['Ab4',0.5],
    ['Bb4',1],['Ab4',0.5],['G4',0.5],['F4',1],
    ['Eb4',0.5],['D4',0.5],['C4',2],['REST',1],
];

// Bajo en arpegios sutiles
const _MENU_BASS = [
    ['C3',2],['G3',2],['Bb3',2],['C3',2],
    ['F4',2],['C3',2],['G3',2],['C3',2],
    ['Bb3',2],['F4',2],['C3',4],
];

function _playMenuNote(ctx, masterGain, freq, startTime, duration, opts) {
    if (!freq || freq === 0) return; // REST
    const o = opts || {};
    const type    = o.type    || 'square';
    const vol     = o.vol     || 0.08;
    const detune  = o.detune  || 0;
    const attack  = o.attack  || 0.01;
    const release = o.release || Math.min(duration * 0.6, 0.25);

    const osc  = ctx.createOscillator();
    const gain = ctx.createGain();

    // Filtro pasabaja para suavizar el square y darle calidez 16-bit
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = o.filterFreq || 2200;
    filter.Q.value = 0.5;

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(masterGain);

    osc.type = type;
    osc.frequency.setValueAtTime(freq, startTime);
    if (detune) osc.detune.setValueAtTime(detune, startTime);

    gain.gain.setValueAtTime(0, startTime);
    gain.gain.linearRampToValueAtTime(vol, startTime + attack);
    gain.gain.setValueAtTime(vol, startTime + duration - release);
    gain.gain.linearRampToValueAtTime(0, startTime + duration);

    osc.start(startTime);
    osc.stop(startTime + duration + 0.05);
    _menuMusicNodes.push(osc);
    _menuMusicNodes.push(gain);
}

function startMenuMusic() {
    if (_menuMusicPlaying) return;
    const ctx = getAudioContext();
    if (!ctx) return;

    _menuMusicPlaying = true;
    _menuMusicNodes = [];

    // Nodo master de la música — fade in suave
    _menuMusicGain = ctx.createGain();
    _menuMusicGain.gain.setValueAtTime(0, ctx.currentTime);
    _menuMusicGain.gain.linearRampToValueAtTime(masterVolume * 0.55, ctx.currentTime + 2.5);
    _menuMusicGain.connect(ctx.destination);

    const BEAT = 0.88; // segundos por beat a ~68bpm

    function scheduleLoop() {
        if (!_menuMusicPlaying) return;
        const now = ctx.currentTime;
        let t = now + 0.05;

        // --- Melodía principal (square suavizado = 16-bit) ---
        _MENU_MELODY.forEach(([note, beats]) => {
            const freq = _MENU_NOTES[note];
            const dur  = beats * BEAT;
            _playMenuNote(ctx, _menuMusicGain, freq, t, dur, {
                type: 'square', vol: 0.065, filterFreq: 1800, attack: 0.012, release: 0.18
            });
            t += dur;
        });

        // --- Armónico suave (triangle una octava arriba) ---
        t = now + 0.05;
        _MENU_MELODY.forEach(([note, beats]) => {
            const freq = _MENU_NOTES[note];
            const dur  = beats * BEAT;
            if (freq && Math.random() > 0.45) {
                _playMenuNote(ctx, _menuMusicGain, freq * 2, t, dur * 0.7, {
                    type: 'triangle', vol: 0.022, filterFreq: 3500, attack: 0.02, release: 0.12
                });
            }
            t += dur;
        });

        // --- Bajo en arpegios (sine) ---
        let bt = now + 0.05;
        _MENU_BASS.forEach(([note, beats]) => {
            const freq = _MENU_NOTES[note];
            const dur  = beats * BEAT;
            _playMenuNote(ctx, _menuMusicGain, freq, bt, dur * 0.55, {
                type: 'sine', vol: 0.045, filterFreq: 600, attack: 0.015, release: 0.2
            });
            bt += dur;
        });

        // Total duración del loop
        const totalBeats = _MENU_MELODY.reduce((sum, [,b]) => sum + b, 0);
        const loopDuration = totalBeats * BEAT;

        // Reprogramar el siguiente loop con una pequeña pausa entre repeticiones
        _menuMusicScheduleId = setTimeout(scheduleLoop, (loopDuration - 0.5) * 1000);
    }

    scheduleLoop();
}

function stopMenuMusic(fadeOut) {
    if (!_menuMusicPlaying) return;
    _menuMusicPlaying = false;
    clearTimeout(_menuMusicScheduleId);

    const ctx = getAudioContext();
    const fadeDur = (fadeOut !== false) ? 1.2 : 0.15;

    if (_menuMusicGain && ctx) {
        _menuMusicGain.gain.cancelScheduledValues(ctx.currentTime);
        _menuMusicGain.gain.setValueAtTime(_menuMusicGain.gain.value, ctx.currentTime);
        _menuMusicGain.gain.linearRampToValueAtTime(0, ctx.currentTime + fadeDur);
    }

    setTimeout(() => {
        _menuMusicNodes.forEach(n => { try { n.disconnect(); } catch (error) { window.EtheriaLogger?.warn('ui:sounds', 'disconnect failed:', error?.message || error); } });
        _menuMusicNodes = [];
        _menuMusicGain = null;
    }, (fadeDur + 0.1) * 1000);
}


// ============================================
// GESTIÓN DE CICLO DE VIDA — PWA / fondo
// ============================================
// Cuando la PWA pasa a segundo plano (swipe para cerrar, botón home,
// pantalla bloqueada) el audio sigue sonando en Web Audio API
// a menos que lo paremos explícitamente.

(function _registerAudioLifecycle() {

    // ── Page Visibility API ──────────────────────────────────────
    // Se dispara cuando el usuario cambia de pestaña/app o cierra.
    document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
            // App en fondo: pausar todo el audio
            _suspendAllAudio();
        } else {
            // App de vuelta al frente: reanudar si hacía falta
            _resumeAllAudio();
        }
    });

    // ── pagehide — iOS Safari / PWA swipe-close ──────────────────
    // Complementa visibilitychange en iOS donde puede no dispararse.
    window.addEventListener('pagehide', () => {
        _suspendAllAudio(true); // parada rápida, sin fade
    });

    // ── freeze (Page Lifecycle API) — Android Chrome background ──
    // Cuando Chrome "congela" la pestaña para ahorrar batería.
    window.addEventListener('freeze', () => {
        _suspendAllAudio(true);
    });

    // ── resume — volver de congelado ──────────────────────────────
    window.addEventListener('resume', () => {
        if (!document.hidden) _resumeAllAudio();
    });

    function _suspendAllAudio(fast) {
        // Parar música del menú
        if (_menuMusicPlaying) {
            stopMenuMusic(fast ? false : true); // false = fade rápido
        }
        // Parar lluvia
        if (rainSourceNode) {
            stopRainSound();
        }
        // Suspender el AudioContext completo — libera recursos del SO
        if (audioCtx && audioCtx.state === 'running') {
            audioCtx.suspend().catch(() => {});
        }
    }

    function _resumeAllAudio() {
        // Solo reanudar el contexto — la música no se reinicia sola
        // para no sorprender al usuario. Si quiere música tiene que
        // volver a la pantalla del menú.
        if (audioCtx && audioCtx.state === 'suspended') {
            audioCtx.resume().catch(() => {});
        }
    }

})();

/* js/ui/ui.js */
// Funciones de interfaz (menús, modales, renderizado visual).
// ============================================
// UI/INTERFACE.JS
// ============================================
// Este archivo agrupa funciones de interfaz:
// navegación, modales, historial, paneles, temas y renderizado visual.
// Aunque contiene bastante lógica, se mantiene separado del arranque para
// que editar la UI sea más sencillo.

function initSmartTooltips() {
    if (!tooltipRoot) {
        tooltipRoot = document.createElement('div');
        tooltipRoot.className = 'smart-tooltip';
        document.body.appendChild(tooltipRoot);
    }

    let tooltipTimer = null;

    const showTooltip = (el) => {
        const text = el?.getAttribute('data-tooltip');
        if (!text || !tooltipRoot) return;

        tooltipRoot.textContent = text;
        tooltipRoot.classList.add('visible');
        tooltipRoot.style.left = '-9999px';
        tooltipRoot.style.top = '-9999px';

        const rect = el.getBoundingClientRect();
        const tipRect = tooltipRoot.getBoundingClientRect();
        const spacing = 10;
        const canShowTop = rect.top >= tipRect.height + spacing;
        const placement = canShowTop ? 'top' : 'bottom';
        tooltipRoot.dataset.placement = placement;

        let left = rect.left + (rect.width / 2) - (tipRect.width / 2);
        left = Math.max(8, Math.min(left, window.innerWidth - tipRect.width - 8));

        const top = placement === 'top'
            ? rect.top - tipRect.height - spacing
            : rect.bottom + spacing;

        tooltipRoot.style.left = `${left}px`;
        tooltipRoot.style.top = `${top}px`;
    };

    const hideTooltip = () => {
        if (tooltipTimer) {
            clearTimeout(tooltipTimer);
            tooltipTimer = null;
        }
        if (tooltipRoot) tooltipRoot.classList.remove('visible');
    };

    const queueTooltip = (target) => {
        if (!target) return;
        if (tooltipTimer) clearTimeout(tooltipTimer);
        const delayMs = Number(target.getAttribute('data-tooltip-delay') || 0);
        tooltipTimer = setTimeout(() => {
            showTooltip(target);
            tooltipTimer = null;
        }, Math.max(0, delayMs));
    };

    document.addEventListener('mouseover', (e) => {
        const target = e.target.closest('[data-tooltip]');
        if (!target) return;
        queueTooltip(target);
    });

    document.addEventListener('focusin', (e) => {
        const target = e.target.closest('[data-tooltip]');
        if (!target) return;
        queueTooltip(target);
    });

    document.addEventListener('mouseout', (e) => {
        if (!e.target.closest('[data-tooltip]')) return;
        hideTooltip();
    });

    document.addEventListener('focusout', (e) => {
        if (!e.target.closest('[data-tooltip]')) return;
        hideTooltip();
    });

    window.addEventListener('scroll', hideTooltip, true);
    window.addEventListener('resize', hideTooltip);
}

function setupKeyboardListeners() {
    document.addEventListener('keydown', (e) => {
        const vnSection = document.getElementById('vnSection');
        if (!vnSection || !vnSection.classList.contains('active')) return;

        const replyPanel = document.getElementById('vnReplyPanel');
        const settingsPanel = document.getElementById('settingsPanel');
        const continuationOverlay = document.getElementById('continuationOverlay');
        const optionsContainer = document.getElementById('vnOptionsContainer');
        const emotePicker = document.getElementById('emotePicker');

        if (e.code === 'Space') {
            if (replyPanel && replyPanel.style.display === 'flex') return;
            if (settingsPanel && settingsPanel.classList.contains('active')) return;
            if (optionsContainer && optionsContainer.classList.contains('active')) return;
            if (emotePicker && emotePicker.classList.contains('active')) return;
            e.preventDefault();
            handleDialogueClick();
        }

        if (e.code === 'Escape') {
            if (continuationOverlay && continuationOverlay.classList.contains('active')) {
                closeContinuation();
            } else if (replyPanel && replyPanel.style.display === 'flex') {
                closeReplyPanel();
            } else if (document.getElementById('historyModal')?.classList.contains('active')) {
                closeModal('historyModal');
            } else if (document.getElementById('sheetModal')?.classList.contains('active')) {
                closeModal('sheetModal');
            } else if (settingsPanel && settingsPanel.classList.contains('active')) {
                closeSettings();
            } else if (document.getElementById('branchEditorModal')?.classList.contains('active')) {
                closeModal('branchEditorModal');
            } else if (document.getElementById('shortcutsModal')?.classList.contains('active')) {
                closeModal('shortcutsModal');
            } else if (emotePicker && emotePicker.classList.contains('active')) {
                toggleEmotePicker();
            }
        }

        const isTypingField = ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName);

        if (!isTypingField && e.code === 'ArrowLeft') {
            e.preventDefault();
            previousMessage();
        }

        if (!isTypingField && e.code === 'ArrowRight') {
            e.preventDefault();
            nextMessage();
        }

        if (!isTypingField && e.key === '?') {
            e.preventDefault();
            openModal('shortcutsModal');
        }
    });

    // Trampa de foco para accesibilidad: Tab no sale de un modal abierto
    document.addEventListener('keydown', (e) => {
        if (e.key !== 'Tab') return;

        const activeModal = document.querySelector('.modal-overlay.active');
        if (!activeModal) return;

        const focusable = activeModal.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
        if (!focusable.length) return;

        const first = focusable[0];
        const last = focusable[focusable.length - 1];

        if (e.shiftKey && document.activeElement === first) {
            e.preventDefault();
            last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
            e.preventDefault();
            first.focus();
        }
    });
}


function setupTouchGestures() {
    const vnSection = document.getElementById('vnSection');
    if (!vnSection) return;
    const hasCoarse = typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches;
    if (!hasCoarse) return;

    const EXCLUDED_ZONES = [
        '.vn-dialogue-box',
        '.vn-options-container',
        '.vn-reply-panel',
        '.vn-controls'
    ];

    const isInExcludedZone = (x, y) => {
        return EXCLUDED_ZONES.some((selector) => {
            const el = document.querySelector(selector);
            if (!el) return false;
            const rect = el.getBoundingClientRect();
            return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
        });
    };

    let startX = 0;
    let startY = 0;
    let startTime = 0;

    vnSection.addEventListener('touchstart', (e) => {
        if (e.touches.length !== 1) return;
        startX = e.touches[0].clientX;
        startY = e.touches[0].clientY;
        startTime = Date.now();

        if (document.body.classList.contains('immersive-mode') && typeof revealImmersiveUiTemporarily === 'function') {
            revealImmersiveUiTemporarily();
        }
    }, { passive: true });

    vnSection.addEventListener('touchend', (e) => {
        if (!vnSection.classList.contains('active') || e.changedTouches.length !== 1) return;
        const target = e.target;
        if (target && target.closest('#vnReplyPanel, .vn-controls, .vn-mobile-fab-nav, #settingsPanel, #vnOptionsContainer')) return;

        const replyPanel = document.getElementById('vnReplyPanel');
        const panelOpen = replyPanel?.style.display === 'flex';
        const endX = e.changedTouches[0].clientX;
        const endY = e.changedTouches[0].clientY;
        if (isInExcludedZone(endX, endY)) return;
        const dx = endX - startX;
        const dy = endY - startY;
        const absDx = Math.abs(dx);
        const absDy = Math.abs(dy);
        const elapsed = Date.now() - startTime;

        if (absDx < 12 && absDy < 12) {
            handleDialogueClick();
            if (document.body.classList.contains('immersive-mode')) {
                if (typeof revealImmersiveUiTemporarily === "function") revealImmersiveUiTemporarily();
            }
            return;
        }

        if (absDx > absDy && absDx > 45) {
            if (dx < 0) nextMessage();
            else previousMessage();
            return;
        }

        if (startY < 88 && dy > 70 && absDy > absDx) {
            if (!panelOpen && typeof openReplyPanel === 'function') {
                openReplyPanel();
                if (typeof setReplyDrawerExpanded === 'function') setReplyDrawerExpanded(false);
            }
            return;
        }

        if (panelOpen && dy > 60 && absDy > absDx) {
            if (typeof setReplyDrawerExpanded === 'function') {
                setReplyDrawerExpanded(false);
            } else if (typeof closeReplyPanel === 'function') {
                closeReplyPanel();
            }
            return;
        }

        if (elapsed < 260 && absDy < 35 && absDx < 35) {
            handleDialogueClick();
        }
    }, { passive: true });
}

/* js/ui/effects.js */
// Efectos visuales: clima y emotes manga.
// ============================================
// EFECTOS CLIMA
// ============================================
function createRainEffect() {
    const container = document.createElement('div');
    container.className = 'weather-rain';
    container.id = 'rainEffect';

    // Cantidad y velocidad según capacidad del dispositivo
    const isLowSpec = document.body.classList.contains('low-spec');
    const isMobile  = document.body.classList.contains('is-mobile');
    const dropCount = isLowSpec ? 12 : isMobile ? 22 : 60;
    // En mobile las gotas van más despacio = menos frames GPU por segundo
    const durationBase  = isMobile ? 0.85 : 0.5;
    const durationRange = isMobile ? 0.65 : 0.5;

    for (let i = 0; i < dropCount; i++) {
        const drop = document.createElement('div');
        drop.className = 'rain-drop';
        drop.style.left = Math.random() * 100 + '%';
        drop.style.height = (10 + Math.random() * 20) + 'px';
        drop.style.animationDuration = (durationBase + Math.random() * durationRange) + 's';
        drop.style.animationDelay = Math.random() * 2 + 's';
        drop.style.opacity = 0.3 + Math.random() * 0.4;
        container.appendChild(drop);
    }

    return container;
}

function createFogEffect() {
    const container = document.createElement('div');
    container.className = 'weather-fog';
    container.id = 'fogEffect';

    // 3 capas de niebla
    for (let i = 0; i < 3; i++) {
        const layer = document.createElement('div');
        layer.className = 'fog-layer';
        container.appendChild(layer);
    }

    return container;
}

function setWeather(weather) {
    currentWeather = weather;
    if (typeof syncVnStore === 'function') syncVnStore({ weather: currentWeather });
    if (typeof eventBus !== 'undefined') eventBus.emit('weather:changed', { weather: currentWeather });
    // Notificar a Ethy del cambio de clima
    window.dispatchEvent(new CustomEvent('etheria:weather-changed', { detail: { weather } }));

    // Actualizar botones
    // Actualizar botones de clima — tanto los legacy como los nuevos vrp
    document.querySelectorAll('#weatherSelectorContainer .weather-btn, .vrp-weather-btn').forEach(btn => {
        btn.classList.remove('active');
        const dw = btn.dataset.weather;
        if (dw) {
            // Nuevo sistema: data-weather attribute
            if (dw === weather || (dw === 'none' && (weather === 'none' || !weather))) {
                btn.classList.add('active');
            }
        } else {
            // Legacy: comparar textContent
            if (btn.textContent.toLowerCase().includes(weather === 'rain' ? 'lluvia' : weather === 'fog' ? 'niebla' : 'normal')) {
                btn.classList.add('active');
            }
        }
    });

    // Limpiar efectos anteriores
    const weatherContainer = document.getElementById('weatherContainer');
    if (weatherContainer) {
        weatherContainer.innerHTML = '';
    }

    // Aplicar nuevo efecto visual
    if (weather === 'rain') {
        weatherContainer.appendChild(createRainEffect());
    } else if (weather === 'fog') {
        weatherContainer.appendChild(createFogEffect());
    }

    // Sonido ambiental de lluvia (definido en sounds.js)
    if (weather === 'rain') {
        if (typeof startRainSound === 'function') startRainSound();
    } else {
        if (typeof stopRainSound  === 'function') stopRainSound();
    }
}

function setTopicWeather(weather, button = null) {
    document.getElementById('topicWeatherInput').value = weather;

    const buttons = document.querySelectorAll('#topicModal .topic-weather-btn');
    buttons.forEach(btn => btn.classList.remove('active'));

    const activeButton = button || document.querySelector(`#topicModal .topic-weather-btn[data-weather="${weather}"]`);
    if (activeButton) activeButton.classList.add('active');
}

// ============================================
// EMOTES MANGA
// ============================================
function toggleEmotePicker() {
    const picker = document.getElementById('emotePicker');
    if (picker) {
        picker.classList.toggle('active');
    }
}

function insertEmoteInReplyText(emoteType) {
    const replyText = document.getElementById('vnReplyText');
    const replyPanel = document.getElementById('vnReplyPanel');
    if (!replyText || replyPanel?.style.display !== 'flex') return;

    const cursorPos = replyText.selectionStart;
    const textBefore = replyText.value.substring(0, cursorPos);
    const textAfter = replyText.value.substring(cursorPos);
    replyText.value = textBefore + `/${emoteType} ` + textAfter;
    replyText.focus();
    replyText.setSelectionRange(cursorPos + emoteType.length + 2, cursorPos + emoteType.length + 2);
}

function selectEmote(emoteType) {
    currentEmote = emoteType;
    toggleEmotePicker();
    insertEmoteInReplyText(emoteType);
    _fireEmoteOnActiveSprite(emoteType, true);
}

function toggleReplyEmotePopover(event) {
    event?.stopPropagation();

    const popover = document.getElementById('replyEmotePopover');
    const button = document.getElementById('replyEmoteToggle');
    if (!popover || !button) return;

    const willOpen = !popover.classList.contains('active');
    popover.classList.toggle('active', willOpen);
    popover.setAttribute('aria-hidden', willOpen ? 'false' : 'true');
    button.classList.toggle('active', willOpen);
}

function closeReplyEmotePopover() {
    const popover = document.getElementById('replyEmotePopover');
    const button = document.getElementById('replyEmoteToggle');
    if (!popover || !button) return;

    popover.classList.remove('active');
    popover.setAttribute('aria-hidden', 'true');
    button.classList.remove('active');
}

function selectReplyEmote(emoteType) {
    currentEmote = emoteType;
    insertEmoteInReplyText(emoteType);
    closeReplyEmotePopover();
    // Disparar emote en sprite inmediatamente (preview visual)
    _fireEmoteOnActiveSprite(emoteType, true);
}

// ── Dispara el emote visualmente en el sprite activo ─────────────────────
// isPreview=true → solo visual local, sin sync; isPreview=false → viene de msg recibido
function _fireEmoteOnActiveSprite(emoteType, isPreview = false) {
    if (!emoteType) return;
    const config = emoteConfig[emoteType];
    if (!config) return;

    // Buscar el sprite activo
    const activeSprite = document.querySelector('.vn-sprite.active');
    if (!activeSprite) {
        console.warn('[Etheria emote] No hay sprite activo para mostrar el emote:', emoteType);
        return;
    }
    console.log(`[Etheria emote] ${emoteType} → sprite .active`, activeSprite.dataset?.charId);

    // Limpiar emotes anteriores en TODOS los sprites
    document.querySelectorAll('.manga-emote').forEach(e => e.remove());

    const emoteNode = document.createElement('div');
    emoteNode.className = `manga-emote ${config.class}`;
    emoteNode.textContent = config.symbol;
    emoteNode.title = config.name;
    activeSprite.appendChild(emoteNode);

    // Auto-remover con fade-out a los 2.5s (0.5s de fade)
    setTimeout(() => {
        if (emoteNode.parentElement) {
            emoteNode.style.animation = 'emote-disappear 0.5s ease-out forwards';
            setTimeout(() => emoteNode.remove(), 500);
        }
    }, 2500);
}

function setupReplyEmotePopover() {
    document.addEventListener('click', (event) => {
        const popover = document.getElementById('replyEmotePopover');
        const button = document.getElementById('replyEmoteToggle');
        if (!popover || !button || !popover.classList.contains('active')) return;

        const target = event.target;
        if (target instanceof Element && (target.closest('#replyEmotePopover') || target.closest('#replyEmoteToggle'))) {
            return;
        }

        closeReplyEmotePopover();
    });
}

function parseEmotes(text) {
    // Buscar comandos de emote /tipo
    const emoteRegex = /\/(angry|happy|shock|sad|think|love|annoyed|embarrassed|idea|sleep)\b/gi;
    const matches = [];
    let match;

    while ((match = emoteRegex.exec(text)) !== null) {
        matches.push(match[1].toLowerCase());
    }

    // Eliminar comandos del texto visible
    const cleanText = text.replace(emoteRegex, '').trim();

    return { emotes: matches, text: cleanText };
}

function showEmoteOnSprite(emoteType, spriteElement) {
    if (!emoteType || !spriteElement) return;

    const config = emoteConfig[emoteType];
    if (!config) return;

    // Limpiar emotes anteriores
    const existingEmote = spriteElement.querySelector('.manga-emote');
    if (existingEmote) {
        existingEmote.remove();
    }

    // Crear nuevo emote
    const emote = document.createElement('div');
    emote.className = `manga-emote ${config.class}`;
    emote.textContent = config.symbol;
    emote.title = config.name;

    spriteElement.appendChild(emote);

    // Auto-remover después de 3 segundos
    setTimeout(() => {
        if (emote.parentElement) {
            emote.style.animation = 'emote-disappear 0.5s ease-out forwards';
            setTimeout(() => emote.remove(), 500);
        }
    }, 3000);
}

function showEmoteOnAvatar(emoteType) {
    if (!emoteType) return;

    const config = emoteConfig[emoteType];
    if (!config) return;

    const avatarBox = document.getElementById('vnSpeakerAvatar');
    if (!avatarBox) return;

    // Limpiar emotes anteriores
    const existingEmote = avatarBox.querySelector('.manga-emote');
    if (existingEmote) {
        existingEmote.remove();
    }

    // Crear nuevo emote posicionado en esquina superior izquierda del avatar
    const emote = document.createElement('div');
    emote.className = `manga-emote ${config.class}`;
    emote.textContent = config.symbol;
    emote.title = config.name;
    emote.style.position = 'absolute';
    emote.style.top = '-10px';
    emote.style.left = '-10px';
    emote.style.fontSize = '2rem';

    avatarBox.appendChild(emote);

    // Auto-remover después de 3 segundos
    setTimeout(() => {
        if (emote.parentElement) {
            emote.style.opacity = '0';
            setTimeout(() => emote.remove(), 500);
        }
    }, 3000);
}

// ── Listeners EventBus ───────────────────────────────────────────────────────
// weather:changed → delega en setWeather(), que ya gestiona DOM, audio y store.
// Permite que módulos externos cambien el clima sin llamar setWeather() directo.
(function _initEffectsListeners() {
    if (window._effectsListenersReady) return;
    window._effectsListenersReady = true;
    if (typeof eventBus !== 'undefined') {
        eventBus.on('weather:changed', function(data) {
            if (data && data.weather) setWeather(data.weather);
        });
    }
})();


/* js/ui/utils-ui.js */
// Utilidades de formato y validación para la UI.
// ============================================
// UTILIDADES
// ============================================

/**
 * escapeHtml — Fix B: moved here from characters.js so all modules can rely on
 * it regardless of load order. characters.js keeps a compatibility stub.
 * Uses the DOM-based approach (creates a text node) which is the canonical,
 * browser-native way to escape HTML entities.
 */
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function formatText(text) {
    if (!text) return '';
    const escaped = String(text)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');

    return escaped
        .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.+?)\*/g, '<em>$1</em>');
}

function stripHtml(html) {
    if (!html) return '';
    const tmp = document.createElement('div');
    tmp.innerHTML = html;
    return tmp.textContent || tmp.innerText || '';
}

function isValidHttpUrl(value) {
    if (!value) return true;
    try {
        const parsed = new URL(value);
        return parsed.protocol === 'http:' || parsed.protocol === 'https:';
    } catch {
        return false;
    }
}

function validateImageUrlField(value, label) {
    if (!value) return true;
    if (!isValidHttpUrl(value)) {
        showAutosave(`${label}: debe ser una URL válida (http o https)`, 'error');
        return false;
    }
    return true;
}

function validateImportedData(data) {
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
        throw new Error('El archivo no contiene un objeto de datos válido');
    }

    if (!Array.isArray(data.topics) || !Array.isArray(data.characters)) {
        throw new Error('Faltan colecciones obligatorias (topics/characters)');
    }

    if (data.messages !== undefined && (typeof data.messages !== 'object' || Array.isArray(data.messages))) {
        throw new Error('messages debe ser un objeto');
    }

    if (data.affinities !== undefined && (typeof data.affinities !== 'object' || Array.isArray(data.affinities))) {
        throw new Error('affinities debe ser un objeto');
    }

    return true;
}

// ============================================

/* js/ui/roleplay.js */
// Sistema de modo rpg y afinidad entre personajes.
// ============================================
// MODO RPG VS ROLEPLAY
// ============================================
const TOPIC_MODE_STORAGE_KEY = 'etheria_topic_mode';
let roleCharacterModalContext = null;

function updateTopicModeUI() {
    const modeRoleplay = document.getElementById('modeRoleplay');
    const modeRpg = document.getElementById('modeRpg');

    const persistedMode = localStorage.getItem(TOPIC_MODE_STORAGE_KEY);
    let selectedMode = currentTopicMode === 'rpg' ? 'rpg' : 'roleplay';

    if (modeRpg && modeRpg.checked) selectedMode = 'rpg';
    else if (modeRoleplay && modeRoleplay.checked) selectedMode = 'roleplay';
    else if (persistedMode === 'rpg' || persistedMode === 'roleplay') selectedMode = persistedMode;

    currentTopicMode = selectedMode;
    localStorage.setItem(TOPIC_MODE_STORAGE_KEY, selectedMode);

    if (modeRoleplay) modeRoleplay.checked = selectedMode === 'roleplay';
    if (modeRpg) modeRpg.checked = selectedMode === 'rpg';

    // Actualizar estilos visuales
    const roleplayLabel = modeRoleplay?.parentElement;
    const rpgLabel = modeRpg?.parentElement;

    roleplayLabel?.classList.toggle('active', selectedMode === 'roleplay');
    rpgLabel?.classList.toggle('active', selectedMode === 'rpg');
}

function openRoleCharacterModal(topicId, options = {}) {
    const grid = document.getElementById('roleCharacterGrid');
    if (!grid) return;

    const topic = appData.topics.find(t => t.id === topicId);
    const isRpgMode = topic?.mode === 'rpg' || options.mode === 'rpg';

    roleCharacterModalContext = {
        topicId,
        isRpgMode,
        enterOnSelect: !!options.enterOnSelect,
        preservePendingTopicId: !!options.preservePendingTopicId
    };

    if (!roleCharacterModalContext.preservePendingTopicId) {
        pendingRoleTopicId = null;
    }

    const title = document.getElementById('roleCharacterTitle');
    const subtitle = document.getElementById('roleCharacterSubtitle');
    if (title) title.textContent = isRpgMode ? 'Selecciona tu personaje para modo RPG' : 'Selecciona tu personaje activo';
    if (subtitle) subtitle.textContent = isRpgMode
        ? 'En modo RPG también debes elegir un personaje al entrar.'
        : 'En modo clásico solo puedes usar un personaje por historia.';

    const mine = appData.characters.filter(c => c.userIndex === currentUserIndex);
    if (!mine.length) {
        roleCharacterModalContext = null;
        if (!isRpgMode && pendingRoleTopicId) {
            // Sin personajes en modo clásico: entrar como Narrador en vez de eliminar la historia
            const topicIdToEnter = pendingRoleTopicId;
            pendingRoleTopicId = null;
            showAutosave('No tienes personajes — entrando como Narrador. Crea uno desde la Galería.', 'info');
            enterTopic(topicIdToEnter);
        } else {
            showAutosave(`Necesitas al menos un personaje para modo ${isRpgMode ? 'RPG' : 'clásico'}`, 'error');
        }
        return;
    }

    grid.innerHTML = mine.map(c => {
        const visual = c.avatar
            ? `<img src="${escapeHtml(c.avatar)}" alt="Avatar de ${escapeHtml(c.name)}">`
            : `<div class="placeholder">${escapeHtml((c.name || '?')[0])}</div>`;
        return `<button type="button" class="role-char-bubble" title="${escapeHtml(c.name)}" onclick="selectRoleCharacterForTopic('${topicId}', '${c.id}')">${visual}</button>`;
    }).join('');

    openModal('roleCharacterModal');
}

function selectRoleCharacterForTopic(topicId, charId) {
    const topic = appData.topics.find(t => t.id === topicId);
    if (!topic) return;

    const context = roleCharacterModalContext || { isRpgMode: topic.mode === 'rpg', enterOnSelect: false };

    if (context.isRpgMode || topic.mode === 'rpg') {
        topic.characterLocks = topic.characterLocks || {};
        topic.characterLocks[currentUserIndex] = charId;
        topic.rpgCharacterLocks = topic.rpgCharacterLocks || {};
        topic.rpgCharacterLocks[currentUserIndex] = charId;
    } else {
        topic.roleCharacterId = charId;
    }

    selectedCharId = charId;
    localStorage.setItem(`etheria_selected_char_${currentUserIndex}`, charId);

    hasUnsavedChanges = true;
    save({ silent: true });

    pendingRoleTopicId = null;
    roleCharacterModalContext = null;
    closeModal('roleCharacterModal');

    if (context.enterOnSelect) {
        enterTopic(topicId);
    }
}

function isRpgModeMode() {
    if (!currentTopicId) return false;
    const topic = appData.topics.find(t => t.id === currentTopicId);
    return topic && topic.mode === 'rpg';
}

function shouldShowAffinity() {
    // No mostrar afinidad en modo rpg
    if (isRpgModeMode()) return false;

    if (!currentTopicId) return false;

    const msgs = getTopicMessages(currentTopicId);
    if (msgs.length === 0) return false;

    const currentMsg = msgs[currentMessageIndex];
    if (!currentMsg || currentMsg.isNarrator || !currentMsg.characterId) return false;

    const targetChar = appData.characters.find(c => c.id === currentMsg.characterId);
    if (!targetChar) return false;

    if (targetChar.userIndex === currentUserIndex) return false;

    return true;
}

// ============================================
// SISTEMA DE AFINIDAD MEJORADO
// ============================================
function getAffinityRankInfo(value) {
    for (let rank of affinityRanks) {
        if (value >= rank.min && value <= rank.max) {
            return rank;
        }
    }
    return affinityRanks[0];
}

function getAffinityIncrement(currentValue, direction) {
    const rankInfo = getAffinityRankInfo(currentValue);
    const increment = direction > 0 ? rankInfo.increment : -rankInfo.increment;

    let newValue = currentValue + increment;

    // Al llegar al tope de un rango, seguir dando + para subir al siguiente
    if (direction > 0 && newValue > rankInfo.max && rankInfo.max < 100) {
        // Buscar siguiente rango
        const nextRank = affinityRanks.find(r => r.min > rankInfo.max);
        if (nextRank) {
            newValue = nextRank.min;
        } else {
            newValue = rankInfo.max;
        }
    }

    if (direction < 0 && newValue < rankInfo.min && rankInfo.min > 0) {
        // Buscar rango anterior
        const prevRank = [...affinityRanks].reverse().find(r => r.max < rankInfo.min);
        if (prevRank) {
            newValue = prevRank.max;
        } else {
            newValue = 0;
        }
    }

    if (newValue < 0) newValue = 0;
    if (newValue > 100) newValue = 100;

    return newValue;
}

function getAffinityKey(charId1, charId2) {
    const ids = [charId1, charId2].sort();
    return `${ids[0]}_${ids[1]}`;
}

function getCurrentAffinity() {
    if (!shouldShowAffinity()) return -1;

    const msgs = getTopicMessages(currentTopicId);
    const currentMsg = msgs[currentMessageIndex];

    const targetCharId = currentMsg.characterId;
    const userChars = appData.characters.filter(c => c.userIndex === currentUserIndex);

    if (userChars.length === 0) return -1;

    const activeCharId = selectedCharId || userChars[0].id;

    if (activeCharId === targetCharId) return -1;

    const key = getAffinityKey(activeCharId, targetCharId);
    const topicAffinities = appData.affinities[currentTopicId] || {};

    return topicAffinities[key] || 0;
}

function updateAffinityDisplay() {
    const affinityDisplay = document.getElementById('affinityDisplay');
    const affinityControls = document.querySelector('.affinity-controls-inline');
    const infoName     = document.getElementById('vnInfoName');
    const infoSubtitle = document.getElementById('vnInfoSubtitle');
    const infoAvatar   = document.getElementById('vnInfoAvatar');
    const vnInfoAffection = document.getElementById('vnInfoAffection');
    const vnInfoRpg = document.getElementById('vnInfoRpg');
    const vnInfoRpgSummary = document.getElementById('vnInfoRpgSummary');

    // Elementos de píldoras
    const pillAge    = document.getElementById('vnInfoPillAge');
    const pillSep1   = document.getElementById('vnInfoPillSep1');
    const pillRace   = document.getElementById('vnInfoPillRace');
    const pillSep2   = document.getElementById('vnInfoPillSep2');
    const pillGender = document.getElementById('vnInfoPillGender');

    const msgs = getTopicMessages(currentTopicId);
    const currentMsg = msgs[currentMessageIndex];
    const currentTopic = appData.topics.find(t => t.id === currentTopicId);
    const isRpgModeModeActive = currentTopicMode === 'rpg';

    function getPersistentRpgCharacter() {
        if (!isRpgModeModeActive || !currentTopic) return null;

        const lockMap = currentTopic.characterLocks || currentTopic.rpgCharacterLocks || {};
        const lockedCharId = lockMap[currentUserIndex];
        if (lockedCharId) {
            const lockedChar = appData.characters.find(c => String(c.id) === String(lockedCharId));
            if (lockedChar) return lockedChar;
        }

        if (selectedCharId) {
            const selectedChar = appData.characters.find(c => String(c.id) === String(selectedCharId));
            if (selectedChar) return selectedChar;
        }

        return appData.characters.find(c => c.userIndex === currentUserIndex) || null;
    }

    function setAvatar(char) {
        if (!infoAvatar) return;
        infoAvatar.innerHTML = '';
        if (char && char.avatar) {
            // XSS fix: DOM creation avoids char.name[0] injection in onerror attribute
            const _imgAvatar = document.createElement('img');
            _imgAvatar.src = char.avatar;
            _imgAvatar.alt = 'Avatar de ' + char.name;
            _imgAvatar.onerror = function () {
                this.style.display = 'none';
                const _fb = document.createElement('div');
                _fb.className = 'placeholder';
                _fb.style.cssText = 'width:100%;height:100%;display:flex;align-items:center;justify-content:center;font-size:2rem;';
                _fb.textContent = (char.name || '?')[0];
                this.parentElement.appendChild(_fb);
            };
            infoAvatar.appendChild(_imgAvatar);
        } else {
            const _ph = document.createElement('div');
            _ph.className = 'placeholder';
            _ph.style.cssText = 'width:100%;height:100%;display:flex;align-items:center;justify-content:center;font-size:2rem;';
            _ph.textContent = char ? (char.name || '?')[0] : '👤';
            infoAvatar.appendChild(_ph);
        }
    }


    function setRpgCard(char, isRpgMode) {
        if (!vnInfoRpg) return;
        if (!isRpgMode || !char || typeof ensureCharacterRpgProfile !== 'function') {
            vnInfoRpg.classList.add('hidden');
            return;
        }

        const profile = ensureCharacterRpgProfile(char);
        // Barra HP inline
        const hpFill = document.getElementById('vnInfoHpFill');
        const hpVal  = document.getElementById('vnInfoHpVal');
        const hpPct  = Math.max(0, Math.min(100, (profile.hp / 10) * 100));
        if (hpFill) hpFill.style.width = `${hpPct}%`;
        if (hpVal)  hpVal.textContent  = `${profile.hp}/10`;

        vnInfoRpg.dataset.charId = char.id;
        vnInfoRpg.classList.remove('hidden');
    }

    function setPills(char) {
        if (!char) {
            if (pillAge)    pillAge.textContent    = '';
            if (pillRace)   pillRace.textContent   = '';
            if (pillGender) pillGender.textContent = '';
            if (pillSep1)   pillSep1.textContent   = '';
            if (pillSep2)   pillSep2.textContent   = '';
            return;
        }
        if (pillAge)    pillAge.textContent    = char.age    ? `${char.age} años` : '';
        if (pillRace)   pillRace.textContent   = char.race   ? char.race          : '';
        if (pillGender) pillGender.textContent = char.gender ? char.gender        : '';
        // Separadores: solo si ambos lados tienen contenido
        if (pillSep1)   pillSep1.textContent   = (char.age && char.race)    ? '·' : '';
        if (pillSep2)   pillSep2.textContent   = (char.race && char.gender) ? '·' : '';
    }

    if (isRpgModeModeActive) {
        const rpgChar = getPersistentRpgCharacter();
        affinityDisplay?.classList.add('hidden');
        if (vnInfoAffection) vnInfoAffection.style.display = 'none';

        if (!rpgChar) {
            if (infoName) infoName.textContent = 'Sin personaje RPG';
            if (infoSubtitle) infoSubtitle.textContent = '';
            setAvatar(null);
            setPills(null);
            setRpgCard(null, true);
            updateInfoHoverDetails(null);
            return;
        }

        if (infoName) infoName.textContent = rpgChar.name;
        if (infoSubtitle && typeof ensureCharacterRpgProfile === 'function') {
            const profile = ensureCharacterRpgProfile(rpgChar);
            const title = typeof getRpgTitleByLevel === 'function' ? getRpgTitleByLevel(profile.level) : 'Aprendiz';
            infoSubtitle.textContent = `⚔ Nivel ${profile.level} · ${title}`;
        }
        setAvatar(rpgChar);
        setPills(null);
        setRpgCard(rpgChar, true);
        updateInfoHoverDetails(rpgChar);
        return;
    }

    // Narrador
    if (!currentMsg || currentMsg.isNarrator) {
        affinityDisplay?.classList.add('hidden');
        if (vnInfoAffection) vnInfoAffection.style.display = 'none';
        if (infoName)     infoName.textContent     = 'Narrador';
        if (infoSubtitle) infoSubtitle.textContent = '';
        if (infoAvatar)   infoAvatar.innerHTML = '<div class="placeholder" style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;font-size:2rem;">📖</div>';
        setPills(null);
        setRpgCard(null, false);
        updateInfoHoverDetails(null);
        return;
    }

    if (currentMsg.characterId) {
        const char = appData.characters.find(c => c.id === currentMsg.characterId);
        if (char) {
            if (infoName) infoName.textContent = char.name;
            const isOwnChar = char.userIndex === currentUserIndex;
            const isRpgMode  = isRpgModeModeActive;
            if (infoSubtitle) {
                if (isRpgMode && typeof ensureCharacterRpgProfile === 'function') {
                    const profile = ensureCharacterRpgProfile(char);
                    const title = typeof getRpgTitleByLevel === 'function' ? getRpgTitleByLevel(profile.level) : 'Aprendiz';
                    infoSubtitle.textContent = `⚔ Nivel ${profile.level} · ${title}`;
                } else {
                    // Modo clásico: mostrar ocupación como subtítulo si existe
                    infoSubtitle.textContent = char.job || '';
                }
            }
            setAvatar(char);
            setPills(char);
            setRpgCard(char, isRpgMode);
            updateInfoHoverDetails(char);

            // Modo historia: sin afinidad de ningún tipo
            if (isRpgMode) {
                affinityDisplay?.classList.add('hidden');
                if (vnInfoAffection) vnInfoAffection.style.display = 'none';
                return;
            }

            // Modo rol — personaje propio: etiqueta sin controles
            if (isOwnChar) {
                affinityDisplay?.classList.remove('hidden');
                if (affinityControls) affinityControls.style.display = 'none';
                if (vnInfoAffection) vnInfoAffection.style.display = 'none';
                const rankNameEl = document.getElementById('affinityRankName');
                if (rankNameEl) {
                    rankNameEl.textContent = '✦ Tu personaje';
                    rankNameEl.style.color = 'var(--accent-sage)';
                    rankNameEl.style.textShadow = '0 0 8px rgba(107, 142, 125, 0.5)';
                }
                return;
            }

            // Modo rol — personaje ajeno: sistema completo
            const affinityValue = getCurrentAffinity();
            if (affinityValue !== -1) {
                affinityDisplay?.classList.remove('hidden');
                if (affinityControls) affinityControls.style.display = '';
                if (vnInfoAffection) vnInfoAffection.style.display = 'none';
                const rankInfo = getAffinityRankInfo(affinityValue);
                const rankNameEl = document.getElementById('affinityRankName');
                if (rankNameEl) {
                    rankNameEl.textContent = rankInfo.name;
                    rankNameEl.style.color = rankInfo.color;
                    rankNameEl.style.textShadow = `0 0 10px ${rankInfo.color}`;
                }
                currentAffinity = affinityValue;
                return;
            }
        }
    }

    // Por defecto
    affinityDisplay?.classList.add('hidden');
    if (vnInfoAffection) vnInfoAffection.style.display = 'none';
    if (infoName)     infoName.textContent     = 'Sin personaje';
    if (infoSubtitle) infoSubtitle.textContent = '';
    if (infoAvatar)   infoAvatar.innerHTML = '<div class="placeholder" style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;font-size:2rem;">👤</div>';
    setPills(null);
    setRpgCard(null, false);
    updateInfoHoverDetails(null);
    // Panel literario (modo clásico)
    if (typeof updateClassicLiteraryPanel === 'function') updateClassicLiteraryPanel();
}

// ── Estado del IHP (Info Hover Panel) ──────────────────────────────
// 'hidden': solo visible en hover CSS
// 'pinned': fijo, independiente del hover
let _ihpPinnedChar = null;

function toggleIhpPin() {
    const panel = document.getElementById('vnInfoHoverPanel');
    if (!panel) return;
    const isPinned = panel.dataset.state === 'pinned';
    if (isPinned) {
        unpinIhp();
    } else {
        pinIhp();
    }
}

function pinIhp() {
    const panel = document.getElementById('vnInfoHoverPanel');
    const card  = document.getElementById('vnInfoCard');
    if (!panel) return;
    panel.dataset.state = 'pinned';
    card?.classList.add('ihp-pinned');
    // Renderizar contenido completo (con relaciones/oráculo)
    if (_ihpPinnedChar) updateInfoHoverDetails(_ihpPinnedChar, true);
    // ESC para cerrar
    document.addEventListener('keydown', _ihpEscHandler);
    // Click fuera para cerrar (con delay para no cerrarlo inmediatamente)
    setTimeout(() => {
        document.addEventListener('click', _ihpOutsideHandler, { capture: true });
    }, 150);
}

function unpinIhp() {
    const panel = document.getElementById('vnInfoHoverPanel');
    const card  = document.getElementById('vnInfoCard');
    if (!panel) return;
    panel.dataset.state = 'hidden';
    card?.classList.remove('ihp-pinned');
    document.removeEventListener('keydown', _ihpEscHandler);
    document.removeEventListener('click', _ihpOutsideHandler, { capture: true });
    // Re-renderizar sin contenido pinned-only
    if (_ihpPinnedChar) updateInfoHoverDetails(_ihpPinnedChar, false);
}

function _ihpEscHandler(e) {
    if (e.key === 'Escape') unpinIhp();
}

function _ihpOutsideHandler(e) {
    const card = document.getElementById('vnInfoCard');
    if (card && !card.contains(e.target)) {
        unpinIhp();
    }
}

function updateInfoHoverDetails(char, isPinned = false) {
    const panel = document.getElementById('vnInfoHoverPanel');
    if (!panel) return;

    // Guardar char para re-renders (pin/unpin)
    _ihpPinnedChar = char || null;

    // Sin personaje → ocultar todo excepto si hay estado pinned que preservar
    if (!char) {
        if (panel.dataset.state !== 'pinned') {
            panel.dataset.empty = 'true';
        }
        return;
    }
    panel.dataset.empty = 'false';

    const isRpg   = (currentTopicMode === 'rpg');
    const pinned  = isPinned || panel.dataset.state === 'pinned';

    // ── Emblema ──────────────────────────────────────────────────────
    const ihpEmblem = document.getElementById('ihpEmblem');
    if (ihpEmblem) {
        ihpEmblem.innerHTML = isRpg ? _getRpgClassEmblem(char.job) : _getClassicSealChar(char.name);
        ihpEmblem.title = char.job || '';
    }

    // ── Nombre ───────────────────────────────────────────────────────
    const ihpName = document.getElementById('ihpName');
    if (ihpName) ihpName.textContent = char.lastName ? `${char.name} ${char.lastName}` : char.name;

    // ── Datos básicos ─────────────────────────────────────────────────
    const ihpData = document.getElementById('ihpData');
    if (ihpData) {
        const rows = [
            char.race      && ['Raza',   char.race],
            char.age       && ['Edad',   `${char.age} años`],
            char.gender    && ['Género', char.gender],
            char.alignment && ['Alin.',  (window.alignments?.[char.alignment] || char.alignment)],
            char.job       && !isRpg && ['Ocup.', char.job],
            isRpg && char.job && ['Clase', char.job],
        ].filter(Boolean);
        ihpData.innerHTML = rows.map(([lbl, val]) =>
            `<div class="ihp-row"><span class="ihp-lbl">${lbl}</span><span class="ihp-val">${escapeHtml(String(val))}</span></div>`
        ).join('');
    }

    // ── Descripción (siempre en RPG; en Clásico solo en pinned) ──────
    const ihpDesc = document.getElementById('ihpDesc');
    if (ihpDesc) {
        const text = char.basic || char.personality || '';
        ihpDesc.textContent = (isRpg || pinned) ? text : '';
    }

    // ── Barras HP/EXP en panel (RPG siempre; Clásico nunca) ──────────
    const ihpRpgBars = document.getElementById('ihpRpgBars');
    if (ihpRpgBars) {
        if (isRpg && typeof ensureCharacterRpgProfile === 'function') {
            const profile = ensureCharacterRpgProfile(char, currentTopicId);
            const hpPct = Math.max(0, Math.min(100, (profile.hp / 10) * 100));
            const expPct = Math.max(0, Math.min(100, (profile.exp / 10) * 100));
            ihpRpgBars.innerHTML = `
                <div class="ihp-bar-row">
                    <span class="ihp-bar-lbl hp">HP</span>
                    <div class="ihp-bar-track"><div class="ihp-bar-fill hp" style="width:${hpPct}%"></div></div>
                    <span class="ihp-bar-val">${profile.hp}/10</span>
                </div>
                <div class="ihp-bar-row">
                    <span class="ihp-bar-lbl exp">EXP</span>
                    <div class="ihp-bar-track"><div class="ihp-bar-fill exp" style="width:${expPct}%"></div></div>
                    <span class="ihp-bar-val">${profile.exp}/10</span>
                </div>`;
        } else {
            ihpRpgBars.innerHTML = '';
        }
    }

    // ── Stats grid (RPG) ─────────────────────────────────────────────
    const ihpStats = document.getElementById('ihpStats');
    if (ihpStats) {
        if (isRpg && typeof ensureCharacterRpgProfile === 'function') {
            const profile   = ensureCharacterRpgProfile(char, currentTopicId);
            const baseStats = window.RPG_BASE_STATS || { STR: 5, VIT: 5, INT: 5, AGI: 5 };
            const totalStats = {};
            for (const k of Object.keys(baseStats)) totalStats[k] = baseStats[k] + (profile.stats?.[k] || 0);
            ihpStats.innerHTML = Object.keys(baseStats).map(k =>
                `<div class="ihp-stat-cell"><span class="ihp-stat-key">${k}</span><span class="ihp-stat-num">${totalStats[k]}</span></div>`
            ).join('');
        } else {
            ihpStats.innerHTML = '';
        }
    }

    // ── Relaciones (Clásico pinned) ───────────────────────────────────
    const ihpRelations = document.getElementById('ihpRelations');
    if (ihpRelations) {
        if (!isRpg && pinned && currentTopicId && typeof getAffinity === 'function') {
            const msgs  = getTopicMessages(currentTopicId);
            const chars = [...new Set(msgs.filter(m => m.characterId).map(m => String(m.characterId)))]
                .filter(id => String(id) !== String(char.id));
            if (chars.length > 0) {
                const relRows = chars.map(otherId => {
                    const other = appData.characters.find(c => String(c.id) === otherId);
                    if (!other) return '';
                    const aff  = getAffinity(String(char.id), otherId, currentTopicId);
                    const stars = affinityToStars ? affinityToStars(aff) : '';
                    const rank  = typeof getAffinityRankInfo === 'function' ? getAffinityRankInfo(aff)?.name || '' : '';
                    return `<div class="ihp-rel-row">
                        <span class="ihp-rel-name">${escapeHtml(other.name)}</span>
                        <span class="ihp-rel-stars">${stars}</span>
                        <span class="ihp-rel-rank">${escapeHtml(rank)}</span>
                    </div>`;
                }).filter(Boolean).join('');
                ihpRelations.innerHTML = `<span class="ihp-relations-title">Relaciones</span>${relRows}`;
            } else {
                ihpRelations.innerHTML = '';
            }
        } else {
            ihpRelations.innerHTML = '';
        }
    }

    // ── Botón oráculo (RPG pinned) ────────────────────────────────────
    const ihpOracle = document.getElementById('ihpOracleHint');
    if (ihpOracle) {
        ihpOracle.style.display = (isRpg && pinned) ? '' : 'none';
    }
}

// Elige un SVG temático de clase RPG según el trabajo del personaje
function _getRpgClassEmblem(job) {
    if (!job) return _svgRpgDefault();
    const j = job.toLowerCase();
    if (/guerrero|soldier|warrior|paladin|caballero|knight/.test(j))
        return `<svg width="18" height="18" viewBox="0 0 18 18" fill="none"><path d="M3 15 L13 5" stroke="rgba(220,180,80,0.9)" stroke-width="1.8" stroke-linecap="round"/><path d="M13 5 L15 3 L15 5 L13 5Z" fill="rgba(220,180,80,0.8)"/><path d="M7 13 L5 11" stroke="rgba(220,180,80,0.6)" stroke-width="1.2" stroke-linecap="round"/></svg>`;
    if (/mago|mage|wizard|brujo|hechicero|warlock|arcano/.test(j))
        return `<svg width="18" height="18" viewBox="0 0 18 18" fill="none"><polygon points="9,2 11,7 16,7 12,11 14,16 9,13 4,16 6,11 2,7 7,7" stroke="rgba(220,180,80,0.85)" stroke-width="1.2" fill="none"/></svg>`;
    if (/bardo|bard|músico|musician|cantor/.test(j))
        return `<svg width="18" height="18" viewBox="0 0 18 18" fill="none"><path d="M6 14 Q5 8 10 5 Q14 8 13 14" stroke="rgba(220,180,80,0.85)" stroke-width="1.2" fill="none" stroke-linecap="round"/><circle cx="5" cy="14" r="2" stroke="rgba(220,180,80,0.7)" stroke-width="1.1" fill="none"/><circle cx="12" cy="14" r="2" stroke="rgba(220,180,80,0.7)" stroke-width="1.1" fill="none"/></svg>`;
    if (/ladrón|rogue|asesino|assassin|pícaro|sombra/.test(j))
        return `<svg width="18" height="18" viewBox="0 0 18 18" fill="none"><path d="M9 3 L15 15 L9 12 L3 15 Z" stroke="rgba(220,180,80,0.8)" stroke-width="1.2" fill="none" stroke-linejoin="round"/></svg>`;
    if (/cler|healer|clérigo|sacerdot|priest|monk|monje/.test(j))
        return `<svg width="18" height="18" viewBox="0 0 18 18" fill="none"><path d="M9 3 L9 15 M4 9 L14 9" stroke="rgba(220,180,80,0.85)" stroke-width="1.6" stroke-linecap="round"/></svg>`;
    if (/arquero|archer|ranger|explorador|scout/.test(j))
        return `<svg width="18" height="18" viewBox="0 0 18 18" fill="none"><path d="M4 14 L13 5 M11 4 L14 4 L14 7" stroke="rgba(220,180,80,0.85)" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/><path d="M5 13 L3 15" stroke="rgba(220,180,80,0.6)" stroke-width="1.2" stroke-linecap="round"/></svg>`;
    return _svgRpgDefault();
}

function _svgRpgDefault() {
    return `<svg width="18" height="18" viewBox="0 0 18 18" fill="none"><polygon points="9,2 11,7 16,8.5 11,10 9,15 7,10 2,8.5 7,7" stroke="rgba(220,180,80,0.8)" stroke-width="1.1" fill="none"/></svg>`;
}

// Sello de cera: primera letra del nombre en estilo serif
function _getClassicSealChar(name) {
    const letter = (name || '?')[0].toUpperCase();
    return `<span style="font-family:'Cinzel',serif;font-size:1rem;font-weight:700;color:rgba(80,40,5,0.9);text-shadow:0 1px 1px rgba(255,200,80,0.4);">${letter}</span>`;
}


function modifyAffinity(direction) {
    if (!currentTopicId) return;

    const msgs = getTopicMessages(currentTopicId);
    const currentMsg = msgs[currentMessageIndex];
    if (!currentMsg || !currentMsg.characterId) return;

    const targetCharId = currentMsg.characterId;
    const targetChar = appData.characters.find(c => c.id === targetCharId);

    if (targetChar && targetChar.userIndex === currentUserIndex) {
        showAutosave('No puedes modificar afinidad con tu propio personaje', 'error');
        return;
    }

    const userChars = appData.characters.filter(c => c.userIndex === currentUserIndex);
    const activeCharId = selectedCharId || userChars[0]?.id;

    if (!activeCharId || activeCharId === targetCharId) return;

    const key = getAffinityKey(activeCharId, targetCharId);

    if (!appData.affinities[currentTopicId]) {
        appData.affinities[currentTopicId] = {};
    }

    const currentValue = appData.affinities[currentTopicId][key] || 0;
    const newValue = getAffinityIncrement(currentValue, direction);

    if (newValue === currentValue) {
        if (direction > 0 && currentValue >= 100) {
            showAutosave('Afinidad máxima alcanzada', 'saved');
        } else if (direction < 0 && currentValue <= 0) {
            showAutosave('Afinidad mínima alcanzada', 'saved');
        }
        return;
    }

    // Detectar cruce de umbral de rango (solo al subir)
    const oldRank = getAffinityRankInfo(currentValue);
    const newRank = getAffinityRankInfo(newValue);
    const crossedMilestone = direction > 0 && newRank.name !== oldRank.name;

    appData.affinities[currentTopicId][key] = newValue;

    hasUnsavedChanges = true;
    save({ silent: true });

    if (typeof eventBus !== 'undefined') {
        eventBus.emit('affinity:changed', {
            direction,
            newValue,
            topicId: currentTopicId,
            targetCharId,
            activeCharId
        });
    } else {
        updateAffinityDisplay();
        if (direction > 0) eventBus.emit('audio:play-sfx', { sfx: 'affinity-up' });
        if (direction < 0) eventBus.emit('audio:play-sfx', { sfx: 'affinity-down' });
    }

    const rankInfo = getAffinityRankInfo(newValue);

    // Mostrar hito de afinidad si se cruzó un umbral
    if (crossedMilestone) {
        showAffinityMilestone(newRank, activeCharId, targetCharId);
    }

    // Mostrar feedback INLINE dentro del card de afinidad (no en esquina)
    const feedbackEl = document.getElementById('affinityFeedback');
    if (feedbackEl) {
        feedbackEl.className = 'affinity-feedback';
        feedbackEl.textContent = direction > 0
            ? `▲ ${rankInfo.name}`
            : `▼ ${rankInfo.name}`;
        void feedbackEl.offsetWidth;
        feedbackEl.classList.add('visible', direction > 0 ? 'up' : 'down');
        clearTimeout(feedbackEl._timer);
        feedbackEl._timer = setTimeout(() => {
            feedbackEl.classList.remove('visible');
        }, 1800);
    }
}



if (typeof eventBus !== 'undefined') {
    eventBus.on('affinity:changed', function onAffinityChanged(payload) {
        updateAffinityDisplay();
        if (payload && payload.direction > 0) eventBus.emit('audio:play-sfx', { sfx: 'affinity-up' });
        if (payload && payload.direction < 0) eventBus.emit('audio:play-sfx', { sfx: 'affinity-down' });
    });
}

function openCurrentVnCharacterSheet() {
    const panel = document.getElementById('vnInfoRpg');
    if (!panel) return;
    const charId = panel.dataset.charId;
    if (!charId || typeof openRpgStatsModal !== 'function') return;
    openRpgStatsModal(charId);
}


const RELATIONSHIP_LEVELS = [
    { threshold: 0,  name: 'Desconocidos', color: '#888' },
    { threshold: 20, name: 'Conocidos', color: '#9b59b6' },
    { threshold: 40, name: 'Asociados', color: '#3498db' },
    { threshold: 60, name: 'Aliados', color: '#27ae60' },
    { threshold: 80, name: 'Confianza', color: '#f1c40f' },
    { threshold: 95, name: 'Vínculo', color: '#e74c3c' }
];

function getAffinity(charId1, charId2, topicId = currentTopicId) {
    if (!topicId || !charId1 || !charId2 || String(charId1) === String(charId2)) return 0;
    const topicAffinities = appData.affinities[topicId] || {};
    return Number(topicAffinities[getAffinityKey(charId1, charId2)] || 0);
}

function affinityToStars(value) {
    const stars = Math.max(0, Math.min(5, Math.round((Number(value) || 0) / 20)));
    return `${'★'.repeat(stars)}${'☆'.repeat(5 - stars)}`;
}

function calculateAverageAffinity(charId, topicId) {
    const msgs = getTopicMessages(topicId);
    const chars = [...new Set(msgs.filter(m => m.characterId).map(m => String(m.characterId)))];
    const others = chars.filter(id => String(id) !== String(charId));
    if (others.length === 0) return 0;
    const sum = others.reduce((acc, id) => acc + getAffinity(charId, id, topicId), 0);
    return Math.round(sum / others.length);
}

function countRecentInteractions(charId1, charId2, msgs, lookback = 10) {
    const slice = msgs.slice(Math.max(0, msgs.length - lookback));
    let count = 0;
    for (let i = 1; i < slice.length; i++) {
        const a = slice[i - 1];
        const b = slice[i];
        if (!a?.characterId || !b?.characterId) continue;
        const pair = [String(a.characterId), String(b.characterId)].sort().join('_');
        const target = [String(charId1), String(charId2)].sort().join('_');
        if (pair === target) count++;
    }
    return count;
}

function buildRelationshipGraph(topicId) {
    const msgs = getTopicMessages(topicId);
    const chars = [...new Set(msgs.filter(m => m.characterId).map(m => String(m.characterId)))];

    const nodes = chars.map((id) => {
        const char = appData.characters.find(c => String(c.id) === id);
        return {
            id,
            name: char?.name || 'Desconocido',
            avatar: char?.avatar || '',
            avgAffinity: calculateAverageAffinity(id, topicId)
        };
    });

    const edges = [];
    for (let i = 0; i < chars.length; i++) {
        for (let j = i + 1; j < chars.length; j++) {
            const affinity = getAffinity(chars[i], chars[j], topicId);
            if (affinity > 0) {
                edges.push({
                    source: chars[i],
                    target: chars[j],
                    affinity,
                    recentInteractions: countRecentInteractions(chars[i], chars[j], msgs, 10)
                });
            }
        }
    }

    return { nodes, edges };
}

function renderConstellation(graph, container) {
    if (!container) return;
    const w = Math.max(560, container.clientWidth || 560);
    const h = Math.max(420, container.clientHeight || 420);
    const cx = w / 2;
    const cy = h / 2;
    const radius = Math.min(w, h) * 0.33;

    const positionedNodes = graph.nodes.map((node, idx) => {
        const angle = (Math.PI * 2 * idx) / Math.max(1, graph.nodes.length);
        return {
            ...node,
            x: cx + Math.cos(angle) * radius,
            y: cy + Math.sin(angle) * radius,
            stars: affinityToStars(node.avgAffinity)
        };
    });

    const nodeById = new Map(positionedNodes.map(n => [String(n.id), n]));

    const lineSvg = `
<svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none">
${graph.edges.map((edge) => {
        const a = nodeById.get(String(edge.source));
        const b = nodeById.get(String(edge.target));
        if (!a || !b) return '';
        const width = 1 + Math.min(4, edge.recentInteractions);
        const alpha = 0.2 + Math.min(0.7, edge.affinity / 120);
        return `<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" stroke="rgba(201,168,108,${alpha.toFixed(2)})" stroke-width="${width}" />`;
    }).join('')}
</svg>`;

    container.innerHTML = lineSvg + positionedNodes.map((node) => `
        <div class="relationship-node" data-char-id="${escapeHtml(String(node.id))}" style="left:${node.x}px;top:${node.y}px" title="${escapeHtml(node.name)} · Afinidad media ${node.avgAffinity}">
            <div class="relationship-node-avatar">${node.avatar ? `<img src="${escapeHtml(node.avatar)}" alt="Avatar de ${escapeHtml(node.name)}">` : escapeHtml(node.name[0] || '?')}</div>
            <div class="relationship-node-name">${escapeHtml(node.name)}</div>
            <div class="relationship-node-stars">${node.stars}</div>
        </div>
    `).join('');

    container.querySelectorAll('.relationship-node').forEach((el) => {
        el.addEventListener('click', () => {
            const charId = el.getAttribute('data-char-id');
            const node = positionedNodes.find((n) => String(n.id) === String(charId));
            if (!node) return;

            const related = graph.edges
                .filter((e) => String(e.source) === String(charId) || String(e.target) === String(charId))
                .sort((a, b) => b.affinity - a.affinity)
                .slice(0, 3)
                .map((edge) => {
                    const otherId = String(edge.source) === String(charId) ? edge.target : edge.source;
                    const other = nodeById.get(String(otherId));
                    const otherName = other?.name || 'Desconocido';
                    return `${otherName}: ${Math.round(edge.affinity)} (${edge.recentInteractions} interacciones)`;
                });

            const summary = related.length
                ? related.join(' · ')
                : 'Sin vínculos recientes.';
            showAutosave(`${node.name} → ${summary}`, 'info');
        });
    });

}

let relationshipGraphResizeBound = false;
let relationshipGraphRaf = null;

function renderRelationshipGraphForActiveTopic() {
    if (!currentTopicId) return;
    const graph = buildRelationshipGraph(currentTopicId);
    const container = document.getElementById('relationshipGraphCanvas');
    if (!container) return;

    if (!graph.nodes.length) {
        container.innerHTML = '<div style="padding:1.2rem; color:var(--text-muted);">Aún no hay interacciones entre personajes en esta historia.</div>';
        return;
    }

    renderConstellation(graph, container);
}

function openRelationshipGraph() {
    if (!currentTopicId) {
        showAutosave('Abre una historia para ver su grafo de relaciones.', 'info');
        return;
    }

    const subtitle = document.getElementById('relationshipGraphSubtitle');
    const topic = appData.topics.find(t => String(t.id) === String(currentTopicId));
    if (subtitle) subtitle.textContent = topic ? `RELACIONES EN "${topic.title.toUpperCase()}"` : 'Relaciones';

    // Mostrar controles +/- para el personaje activo en el diálogo
    _updateGraphAffinityControls();

    if (typeof openModal === 'function') openModal('relationshipGraphModal');

    if (relationshipGraphRaf) cancelAnimationFrame(relationshipGraphRaf);
    relationshipGraphRaf = requestAnimationFrame(() => {
        relationshipGraphRaf = null;
        renderRelationshipGraphForActiveTopic();
    });

    if (!relationshipGraphResizeBound) {
        relationshipGraphResizeBound = true;
        window.addEventListener('resize', () => {
            const modal = document.getElementById('relationshipGraphModal');
            if (!modal || modal.classList.contains('hidden')) return;
            if (relationshipGraphRaf) cancelAnimationFrame(relationshipGraphRaf);
            relationshipGraphRaf = requestAnimationFrame(() => {
                relationshipGraphRaf = null;
                renderRelationshipGraphForActiveTopic();
            });
        }, { passive: true });
    }
}

function _updateGraphAffinityControls() {
    const controlsEl   = document.getElementById('graphAffinityControls');
    const targetNameEl = document.getElementById('graphAffinityTargetName');
    const rankNameEl   = document.getElementById('graphAffinityRankName');
    if (!controlsEl) return;

    const msgs = getTopicMessages(currentTopicId);
    const msg  = msgs[currentMessageIndex];
    if (!msg || !msg.characterId) {
        controlsEl.classList.add('hidden');
        return;
    }

    const targetChar = appData.characters.find(c => String(c.id) === String(msg.characterId));
    if (!targetChar) { controlsEl.classList.add('hidden'); return; }

    // Solo mostrar si el personaje activo es ajeno
    const userChars = appData.characters.filter(c => c.userIndex === currentUserIndex);
    const isOwn = targetChar.userIndex === currentUserIndex;
    if (isOwn) { controlsEl.classList.add('hidden'); return; }

    const affVal = getCurrentAffinity();
    if (affVal === -1) { controlsEl.classList.add('hidden'); return; }

    const rankInfo = getAffinityRankInfo(affVal);
    if (targetNameEl) targetNameEl.textContent = targetChar.name;
    if (rankNameEl) {
        rankNameEl.textContent = rankInfo.name;
        rankNameEl.style.color = rankInfo.color;
    }
    controlsEl.classList.remove('hidden');
}

function refreshRelationshipGraph() {
    _updateGraphAffinityControls();
    if (typeof renderRelationshipGraphForActiveTopic === 'function') {
        renderRelationshipGraphForActiveTopic();
    }
}

// ============================================
// HITOS DE AFINIDAD — OVERLAY CINEMATOGRÁFICO
// ============================================

const AFFINITY_RANK_ICONS = {
    'Conocidos':          { icon: '🤝', color: '#9b59b6' },
    'Amigos':             { icon: '💙', color: '#3498db' },
    'Mejores Amigos':     { icon: '💚', color: '#27ae60' },
    'Interés Romántico':  { icon: '💛', color: '#f1c40f' },
    'Pareja':             { icon: '❤️', color: '#e74c3c' },
};

let _affinityMilestoneTimer = null;

function showAffinityMilestone(rankInfo, activeCharId, targetCharId) {
    const overlay   = document.getElementById('vnAffinityMilestone');
    const iconEl    = document.getElementById('vnAffinityMilestoneIcon');
    const rankEl    = document.getElementById('vnAffinityMilestoneRank');
    if (!overlay || !iconEl || !rankEl) return;

    const meta = AFFINITY_RANK_ICONS[rankInfo.name] || { icon: '✦', color: rankInfo.color || '#c49a3c' };

    iconEl.textContent  = meta.icon;
    rankEl.textContent  = rankInfo.name;
    rankEl.style.color  = meta.color;
    overlay.style.setProperty('--milestone-color', meta.color);

    // Nombre de los personajes en el subtítulo si están disponibles
    const activeChar = appData.characters.find(c => String(c.id) === String(activeCharId));
    const targetChar = appData.characters.find(c => String(c.id) === String(targetCharId));
    const labelEl = overlay.querySelector('.vn-affinity-milestone-label');
    if (labelEl && activeChar && targetChar) {
        labelEl.textContent = `${activeChar.name} & ${targetChar.name}`;
    } else if (labelEl) {
        labelEl.textContent = 'Nueva etapa de la relación';
    }

    // Mostrar con animación
    overlay.classList.remove('milestone-out');
    overlay.classList.add('milestone-in');

    clearTimeout(_affinityMilestoneTimer);
    _affinityMilestoneTimer = setTimeout(() => {
        overlay.classList.remove('milestone-in');
        overlay.classList.add('milestone-out');
        setTimeout(() => overlay.classList.remove('milestone-out'), 600);
    }, 2800);
}

/* js/ui/characters.js */
// Editor de personajes, tarjetas de perfil y efectos del menú principal.
// EDITOR SPLIT-SCREEN
// ============================================
function openCharacterEditor(charId = null) {
    resetCharForm();

    if (charId) {
        const c = appData.characters.find(ch => ch.id === charId);
        if (!c || c.userIndex !== currentUserIndex) return;

        document.getElementById('editCharacterId').value = c.id;
        document.getElementById('charName').value = c.name || '';
        document.getElementById('charLastName').value = c.lastName || '';
        document.getElementById('charAge').value = c.age || '';
        document.getElementById('charRace').value = c.race || '';
        document.getElementById('charGender').value = c.gender || '';
        document.getElementById('charAlignment').value = c.alignment || '';
        document.getElementById('charJob').value = c.job || '';
        document.getElementById('charColor').value = c.color || '#8b7355';
        document.getElementById('charAvatar').value = c.avatar || '';
        document.getElementById('charSprite').value = c.sprite || '';
        document.getElementById('charBasic').value = c.basic || '';
        document.getElementById('charPersonality').value = c.personality || '';
        document.getElementById('charHistory').value = c.history || '';
        document.getElementById('charNotes').value = c.notes || '';

        const deleteBtn = document.getElementById('deleteCharBtn');
        if (deleteBtn) deleteBtn.style.display = 'inline-block';

        document.querySelectorAll('.gender-option').forEach(opt => opt.classList.remove('selected'));
        const genderMap = { 'Femenino': 0, 'Masculino': 1, 'No Binario': 2 };
        const genderIdx = genderMap[c.gender];
        if (genderIdx !== undefined) {
            const options = document.querySelectorAll('.gender-option');
            if (options[genderIdx]) options[genderIdx].classList.add('selected');
        }
    } else {
        document.getElementById('editCharacterId').value = '';
        const deleteBtn = document.getElementById('deleteCharBtn');
        if (deleteBtn) deleteBtn.style.display = 'none';
    }

    updatePreview();
    switchEditorTab('identity', document.querySelector('.editor-tab'));
    openModal('characterModal');
}

function switchEditorTab(tabName, element) {
    currentEditorTab = tabName;

    document.querySelectorAll('.editor-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.editor-panel').forEach(p => p.classList.remove('active'));

    if (element) element.classList.add('active');

    const panel = document.getElementById(`editor-tab-${tabName}`);
    if (panel) panel.classList.add('active');
}

function selectGender(gender, element) {
    document.querySelectorAll('.gender-option').forEach(opt => opt.classList.remove('selected'));
    element.classList.add('selected');
    document.getElementById('charGender').value = gender;
}

function updatePreview() {
    const name = document.getElementById('charName')?.value || 'Nuevo Personaje';
    const avatar = document.getElementById('charAvatar')?.value;

    const previewName = document.getElementById('editorPreviewName');
    if (previewName) previewName.textContent = name;

    const previewImg = document.getElementById('editorPreviewImage');
    if (previewImg) {
        if (avatar) {
            // XSS fix: DOM creation even though fallback is static (consistent pattern)
            const _imgPrev = document.createElement('img');
            _imgPrev.src = avatar;
            _imgPrev.alt = 'Vista previa del avatar';
            _imgPrev.style.cssText = 'width:100%;height:100%;object-fit:cover;';
            _imgPrev.onerror = function () {
                this.style.display = 'none';
                const _sp = document.createElement('span');
                _sp.style.fontSize = '5rem';
                _sp.textContent = '👤';
                this.parentElement.appendChild(_sp);
            };
            previewImg.innerHTML = '';
            previewImg.appendChild(_imgPrev);
        } else {
            previewImg.innerHTML = '<span style="font-size: 5rem;">👤</span>';
        }
    }
}

// ============================================
// CARGA AUTOMÁTICA
// ============================================
async function selectUser(idx, options = {}) {
    if (idx < 0 || idx >= userNames.length) return;

    const safeOptions = { instant: false, autoLoad: false, ...options };

    const previousProfileIndex = currentUserIndex;
    if (previousProfileIndex !== idx && !safeOptions.autoLoad) {
        await syncBidirectional({ profileIndex: previousProfileIndex, silent: true, allowRemotePrompt: false });
    }

    currentUserIndex = idx;
    localStorage.setItem(LAST_PROFILE_KEY, String(idx));

    const savedCharId = localStorage.getItem(`etheria_selected_char_${currentUserIndex}`);
    selectedCharId = savedCharId || null;

    highlightActiveProfile(idx);
    toggleWelcomeOverlay(false);

    const loadingOverlay = document.getElementById('loadingOverlay');
    if (loadingOverlay && !safeOptions.instant) loadingOverlay.classList.add('active');
    isLoading = true;

    if (!safeOptions.instant) {
        await new Promise(resolve => setTimeout(resolve, 220));
    }

    const userSelectScreen = document.getElementById('userSelectScreen');
    const mainMenu = document.getElementById('mainMenu');
    const currentUserDisplay = document.getElementById('currentUserDisplay');

    // Transición suave: fade out de la pantalla de perfiles, fade in del menú
    if (userSelectScreen && !safeOptions.instant) {
        userSelectScreen.style.transition = 'opacity 0.35s ease';
        userSelectScreen.style.opacity = '0';
        await new Promise(resolve => setTimeout(resolve, 350));
    }
    if (userSelectScreen) {
        userSelectScreen.classList.add('hidden');
        userSelectScreen.style.opacity = '';
        userSelectScreen.style.transition = '';
    }
    // Ocultar botón de tema al salir de la pantalla de selección
    const profileThemeBtn = document.getElementById('profileThemeBtn');
    if (profileThemeBtn) profileThemeBtn.style.display = 'none';
    if (mainMenu) {
        mainMenu.classList.remove('hidden');
        mainMenu.style.opacity = '0';
        mainMenu.style.transition = 'opacity 0.3s ease';
        void mainMenu.offsetWidth;
        mainMenu.style.opacity = '1';
        setTimeout(() => { mainMenu.style.transition = ''; mainMenu.style.opacity = ''; }, 320);
        // Arrancar parallax ahora que el menú es visible
        menuParallaxBound = false;
        if (menuParallaxAnimationId) { cancelAnimationFrame(menuParallaxAnimationId); menuParallaxAnimationId = null; }
        initMenuParallax();
        eventBus.emit('audio:start-menu-music');
        // Onboarding paso 1: menú principal
        const _ob = parseInt(localStorage.getItem('etheria_onboarding_step') || '0', 10);
        if (_ob === 1 && typeof maybeShowOnboarding === 'function') {
            setTimeout(maybeShowOnboarding, 600);
        }
    }
    if (currentUserDisplay) currentUserDisplay.textContent = userNames[idx] || 'Jugador';

    // Ocultar overlay y liberar isLoading ANTES de loadFromCloud.
    // Esto permite que los botones del menú respondan aunque la sync de red tarde.
    if (loadingOverlay) loadingOverlay.classList.remove('active');
    isLoading = false;
    generateParticles();
    if (typeof syncMenuFooterAvatar === 'function') syncMenuFooterAvatar();
    if (!safeOptions.autoLoad) showAutosave('Sesión iniciada', 'info');

    // Sincronización en background — no bloquea la UI
    loadFromCloud().catch(() => {});
}

// Generar tarjetas de usuario dinámicamente
function renderUserCards() {
    const container = document.getElementById('userCardsContainer');
    if (!container) return;

    container.innerHTML = '';

    userNames.forEach((name, idx) => {
        const card = document.createElement('div');
        card.className = 'user-card';
        card.dataset.profileIndex = idx;

        // Calcular estadísticas por perfil
        const ownTopics = appData.topics.filter(t => t.createdByIndex === idx);
        const ownChars  = appData.characters.filter(c => c.userIndex === idx);
        let totalMsgs = 0;
        ownTopics.forEach(t => {
            // Solo usar mensajes ya en memoria — no forzar carga desde storage en la pantalla de perfiles
            const msgs = Array.isArray(appData.messages[t.id]) ? appData.messages[t.id] : [];
            totalMsgs += msgs.length;
        });

        // Última sesión
        const lastUpdatedKey = `etheria_profile_updated_${idx}`;
        const lastUpdatedRaw = parseInt(localStorage.getItem(lastUpdatedKey) || '0', 10);
        let lastSessionText = 'Sin sesiones';
        if (lastUpdatedRaw > 0) {
            const d = new Date(lastUpdatedRaw);
            const now = new Date();
            const diffDays = Math.floor((now - d) / 86400000);
            if (diffDays === 0) lastSessionText = 'Hoy';
            else if (diffDays === 1) lastSessionText = 'Ayer';
            else if (diffDays < 7) lastSessionText = `Hace ${diffDays} días`;
            else lastSessionText = d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
        }

        // Última historia activa
        const lastTopic = ownTopics[ownTopics.length - 1] || null;

        // Avatar guardado
        let avatars = [];
        try { avatars = JSON.parse(localStorage.getItem('etheria_user_avatars') || '[]'); } catch (error) { window.EtheriaLogger?.warn('app', 'operation failed:', error?.message || error); }
        const avatarSrc = avatars[idx] || '';
        const avatarHtml = avatarSrc
            ? `<div class="user-avatar-wrap"><img src="${avatarSrc}" alt="Avatar" loading="lazy"></div>`
            : `<div class="user-avatar-wrap"><span class="user-avatar-initials">${(name||'?')[0].toUpperCase()}</span></div>`;

        // Género
        let genders = [];
        try { genders = JSON.parse(localStorage.getItem('etheria_user_genders') || '[]'); } catch (error) { window.EtheriaLogger?.warn('app', 'operation failed:', error?.message || error); }
        const gender = genders[idx] || '';
        const genderMap = { masculino:'Masculino', femenino:'Femenino', 'no-binario':'No binario', otro:'Otro' };
        const genderBadge = gender ? `<div class="user-gender-badge">${genderMap[gender] || gender}</div>` : '';

        // Cumpleaños
        let birthdays = [];
        try { birthdays = JSON.parse(localStorage.getItem('etheria_user_birthdays') || '[]'); } catch (error) { window.EtheriaLogger?.warn('app', 'operation failed:', error?.message || error); }
        const bday = birthdays[idx] || '';
        let bdayHtml = '';
        if (bday) {
            try {
                const [, m, d] = bday.split('-').map(Number);
                const today = new Date();
                const next = new Date(today.getFullYear(), m - 1, d);
                if (next < today) next.setFullYear(today.getFullYear() + 1);
                const diff = Math.round((next - today) / 86400000);
                bdayHtml = diff === 0
                    ? `<div class="user-birthday-row">🎂 ¡Hoy es tu cumpleaños!</div>`
                    : diff <= 7
                        ? `<div class="user-birthday-row">🎂 Cumpleaños en ${diff} día${diff>1?'s':''}</div>`
                        : '';
            } catch (error) { window.EtheriaLogger?.warn('app', 'operation failed:', error?.message || error); }
        }

        card.innerHTML = `
            <div class="save-slot-number">Archivo ${String(idx + 1).padStart(2, '0')}</div>
            ${avatarHtml}
            ${genderBadge}
            ${bdayHtml}
            <div class="user-name">${escapeHtml(name)}</div>
            <div class="user-card-divider"></div>
            <div class="user-card-stats">
                <div class="user-stat">
                    <span class="user-stat-val">${ownTopics.length}</span>
                    <span class="user-stat-lbl">Historias</span>
                </div>
                <div class="user-stat-sep"></div>
                <div class="user-stat">
                    <span class="user-stat-val">${ownChars.length}</span>
                    <span class="user-stat-lbl">Personajes</span>
                </div>
                <div class="user-stat-sep"></div>
                <div class="user-stat">
                    <span class="user-stat-val">${totalMsgs}</span>
                    <span class="user-stat-lbl">Mensajes</span>
                </div>
            </div>
            <div class="user-card-footer">
                <div class="user-last-session">${lastSessionText}</div>
                ${lastTopic ? `<div class="user-last-topic">📖 ${escapeHtml(lastTopic.title)}</div>` : ''}
                ${lastTopic ? `<button class="user-continue-btn">▶ Continuar</button>` : ''}
            </div>
        `;

        // Botón continuar — stopPropagation para no activar selectUser a la vez
        const btn = card.querySelector('.user-continue-btn');
        if (btn) {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                selectUser(idx).then(() => {
                    if (typeof _skipNextFadeTransition !== 'undefined') _skipNextFadeTransition = true;
                    eventBus.emit('audio:stop-menu-music');
                    enterTopic(lastTopic.id);
                });
            });
        }

        card.onclick = () => {
            // Al entrar al perfil sin ir directo a un topic, también suprimir el overlay
            if (typeof _skipNextFadeTransition !== 'undefined') _skipNextFadeTransition = true;
            selectUser(idx);
        };
        container.appendChild(card);
    });

    // Botón para agregar nuevo perfil (máximo 10)
    if (userNames.length < 10) {
        const addCard = document.createElement('div');
        addCard.className = 'add-profile-card';
        addCard.id = 'addProfileCard';
        addCard.onclick = addNewProfile;
        addCard.innerHTML = `
            <div class="add-profile-icon" style="font-size:2.4rem;line-height:1;">+</div>
            <div class="add-profile-text" style="font-family:'Cinzel',serif;font-size:0.78rem;letter-spacing:0.15em;text-transform:uppercase;">Nuevo Archivo</div>
        `;
        container.appendChild(addCard);
    }

    const lastProfileId = getStoredLastProfileId();
    if (lastProfileId !== null) {
        highlightActiveProfile(lastProfileId);
        toggleWelcomeOverlay(false);
    } else {
        localStorage.removeItem(LAST_PROFILE_KEY);
        highlightActiveProfile(null);
        toggleWelcomeOverlay(true);
    }
}

function highlightActiveProfile(idx) {
    document.querySelectorAll('.user-card').forEach(card => {
        const cardIndex = Number.parseInt(card.dataset.profileIndex, 10);
        card.classList.toggle('active', Number.isInteger(idx) && cardIndex === idx);
    });
}

function toggleWelcomeOverlay(shouldShow) {
    const overlay = document.getElementById('welcomeOverlay');
    const addCard = document.getElementById('addProfileCard');
    const canCreateProfile = Boolean(addCard);

    if (overlay) overlay.classList.toggle('active', shouldShow && canCreateProfile);
    if (addCard) addCard.classList.toggle('highlight', shouldShow);
}

function generateProfileParticles() {
    const container = document.getElementById('profileParticles');
    if (!container) return;

    // En móvil: 6 partículas (vs 18 en desktop) y duraciones más largas.
    // body.low-spec oculta el contenedor vía CSS — no generamos nada.
    if (document.body.classList.contains('low-spec')) return;

    const isMobile = document.body.classList.contains('is-mobile');
    const count = isMobile ? 6 : 18;
    const durationBase = isMobile ? 10 : 6;
    const durationRange = isMobile ? 5 : 7;

    container.innerHTML = '';
    for (let i = 0; i < count; i++) {
        const particle = document.createElement('div');
        particle.className = 'profile-particle';
        particle.style.left = (Math.random() * 100) + '%';
        particle.style.top = (60 + Math.random() * 45) + '%';
        particle.style.animationDuration = (durationBase + Math.random() * durationRange) + 's';
        particle.style.animationDelay = (Math.random() * 4) + 's';
        particle.style.setProperty('--float-x', ((Math.random() * 90) - 45) + 'px');
        container.appendChild(particle);
    }
}

// Fix B: escapeHtml moved to utils-ui.js (loaded earlier, no deps).
// Safety stub: if load order ever changes, this ensures escapeHtml is still available.
// Uses var so it becomes a global assignment, not a block-scoped function declaration.
if (typeof escapeHtml === 'undefined') {
    var escapeHtml = function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    };
}


const menuMouseState = {
    x: 0,
    y: 0,
    targetX: 0,
    targetY: 0,
    px: window.innerWidth * 0.5,
    py: window.innerHeight * 0.5
};
let menuParallaxBound = false;
let menuParallaxAnimationId = null;
let fireflyAnimationId = null;
let fireflyEntities = []; // kept for compat
// Flag: true en cuanto el giroscopio entrega un evento real
let _gyroActive = false;

// ── Canvas particle system ────────────────────────────────────────────────
let _pCanvas = null, _pCtx = null;
let _pAnimId = null;
let _pFireflies = [], _pPetals = [];
let _pAlpha = 1, _pTarget = 1; // 1=night(fireflies), 0=day(petals)

class _Firefly {
    constructor() { this.reset(true); }
    reset(init) {
        const W = _pCanvas ? _pCanvas.width : window.innerWidth;
        const H = _pCanvas ? _pCanvas.height : window.innerHeight;
        this.x  = Math.random() * W;
        this.y  = init ? Math.random() * H : H + 10;
        this.r  = Math.random() * 2.2 + 1;
        this.vx = (Math.random() - 0.5) * 0.5;
        this.vy = -(Math.random() * 0.55 + 0.18);
        this.phase = Math.random() * Math.PI * 2;
        this.spd   = Math.random() * 0.022 + 0.01;
        this.maxA  = Math.random() * 0.7 + 0.25;
        this.alpha = 0;
        this.fadeIn = true;
        this.h = Math.random() * 50 + 85; // verde-lima a ámbar
    }
    update() {
        const W = _pCanvas.width, H = _pCanvas.height;
        this.phase += this.spd;
        this.x += this.vx + Math.sin(this.phase * 0.7) * 0.9;
        this.y += this.vy + Math.cos(this.phase * 0.5) * 0.3;

        // Huida suave del cursor
        if (typeof menuMouseState !== 'undefined') {
            const mdx = this.x - menuMouseState.px;
            const mdy = this.y - menuMouseState.py;
            const mdist = Math.hypot(mdx, mdy);
            const fleeR = 90;
            if (mdist < fleeR && mdist > 0.1) {
                const push = (1 - mdist / fleeR) * 0.28;
                this.vx += (mdx / mdist) * push;
                this.vy += (mdy / mdist) * push;
            }
        }
        this.vx *= 0.94;
        this.vy *= 0.94;

        if (this.fadeIn) {
            this.alpha = Math.min(this.alpha + 0.01, this.maxA * (0.5 + 0.5 * Math.sin(this.phase)));
            if (this.alpha >= this.maxA * 0.85) this.fadeIn = false;
        } else {
            this.alpha = this.maxA * (0.25 + 0.75 * Math.abs(Math.sin(this.phase)));
        }
        if (this.y < -20 || this.x < -30 || this.x > W + 30) this.reset(false);
    }
    draw(ctx) {
        const g = ctx.createRadialGradient(this.x, this.y, 0, this.x, this.y, this.r * 7);
        g.addColorStop(0,   `hsla(${this.h},88%,70%,${this.alpha.toFixed(3)})`);
        g.addColorStop(0.3, `hsla(${this.h},88%,65%,${(this.alpha*0.45).toFixed(3)})`);
        g.addColorStop(0.7, `hsla(${this.h+15},80%,55%,${(this.alpha*0.14).toFixed(3)})`);
        g.addColorStop(1,   'transparent');
        ctx.beginPath(); ctx.arc(this.x, this.y, this.r * 7, 0, Math.PI * 2);
        ctx.fillStyle = g; ctx.fill();
        ctx.beginPath(); ctx.arc(this.x, this.y, this.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255,255,220,${Math.min(this.alpha*1.4,1).toFixed(3)})`; ctx.fill();
    }
}

class _Petal {
    constructor() { this.reset(true); }
    reset(init) {
        const W = _pCanvas ? _pCanvas.width : window.innerWidth;
        const H = _pCanvas ? _pCanvas.height : window.innerHeight;
        this.x    = Math.random() * W;
        this.y    = init ? Math.random() * H : -20;
        this.sz   = Math.random() * 5 + 2.5;
        this.rot  = Math.random() * Math.PI * 2;
        this.rotV = (Math.random() - 0.5) * 0.04;
        this.vx   = (Math.random() - 0.4) * 0.9;
        this.vy   = Math.random() * 0.55 + 0.22;
        this.phase = Math.random() * Math.PI * 2;
        this.spd   = Math.random() * 0.018 + 0.008;
        this.alpha = Math.random() * 0.5 + 0.28;
        this.isSeed = Math.random() < 0.3;
        const hue = this.isSeed ? 50 : (Math.random() < 0.5 ? 340 + Math.random() * 30 : 30 + Math.random() * 20);
        this.color = `hsl(${hue},${this.isSeed?'80%':'65%'},${this.isSeed?'90%':'82%'})`;
    }
    update() {
        const W = _pCanvas.width, H = _pCanvas.height;
        this.phase += this.spd;
        this.x += this.vx + Math.sin(this.phase) * 0.65;
        this.y += this.vy + Math.cos(this.phase * 0.6) * 0.2;
        this.rot += this.rotV;
        if (this.y > H + 20 || this.x < -30 || this.x > W + 30) this.reset(false);
    }
    draw(ctx) {
        ctx.save(); ctx.translate(this.x, this.y); ctx.rotate(this.rot); ctx.globalAlpha = this.alpha;
        if (this.isSeed) {
            ctx.strokeStyle = this.color; ctx.lineWidth = 0.9;
            ctx.beginPath(); ctx.moveTo(0, this.sz*1.4); ctx.lineTo(0, -this.sz*0.5); ctx.stroke();
            for (let i = 0; i < 6; i++) {
                const a = (i/6)*Math.PI*2;
                ctx.beginPath(); ctx.moveTo(0, -this.sz*0.5);
                ctx.lineTo(Math.cos(a)*this.sz, (-this.sz*0.5)+Math.sin(a)*this.sz*1.1-this.sz*0.4); ctx.stroke();
            }
            ctx.beginPath(); ctx.arc(0, this.sz*1.4, this.sz*0.32, 0, Math.PI*2);
            ctx.fillStyle = this.color; ctx.fill();
        } else {
            ctx.fillStyle = this.color;
            ctx.beginPath(); ctx.ellipse(0, 0, this.sz*0.45, this.sz, 0, 0, Math.PI*2); ctx.fill();
        }
        ctx.restore(); ctx.globalAlpha = 1;
    }
}

function _initParticleCanvas() {
    _pCanvas = document.getElementById('particlesContainer');
    if (!_pCanvas || !(_pCanvas instanceof HTMLCanvasElement)) return false;
    _pCtx = _pCanvas.getContext('2d');
    _pCanvas.width  = window.innerWidth;
    _pCanvas.height = window.innerHeight;
    window.addEventListener('resize', () => {
        if (!_pCanvas) return;
        _pCanvas.width  = window.innerWidth;
        _pCanvas.height = window.innerHeight;
    }, { passive: true });
    return true;
}

function _runParticleLoop() {
    if (_pAnimId) cancelAnimationFrame(_pAnimId);
    const loop = () => {
        if (!_pCtx || !_pCanvas) return;
        _pCtx.clearRect(0, 0, _pCanvas.width, _pCanvas.height);
        _pAlpha += (_pTarget - _pAlpha) * 0.028;
        const nA = _pAlpha, dA = 1 - _pAlpha;
        if (nA > 0.01) {
            _pFireflies.forEach(f => f.update());
            _pCtx.globalAlpha = nA;
            _pFireflies.forEach(f => f.draw(_pCtx));
            _pCtx.globalAlpha = 1;
        }
        if (dA > 0.01) {
            _pPetals.forEach(p => p.update());
            _pCtx.globalAlpha = dA;
            _pPetals.forEach(p => p.draw(_pCtx));
            _pCtx.globalAlpha = 1;
        }
        _pAnimId = requestAnimationFrame(loop);
    };
    _pAnimId = requestAnimationFrame(loop);
}

function initMenuParallax() {
    if (!_pCanvas) _initParticleCanvas();
    const parallax = document.getElementById('menuParallax');
    if (!parallax || parallax.closest('.hidden')) return;
    if (menuParallaxBound) return;

    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
        menuParallaxBound = true; return;
    }

    let mouseX = window.innerWidth / 2;
    let mouseY = window.innerHeight / 2;
    const layers = parallax.querySelectorAll('.parallax-layer');

    function tick() {
        const centerX = window.innerWidth  / 2;
        const centerY = window.innerHeight / 2;
        const offsetX = (mouseX - centerX) / centerX;
        const offsetY = (mouseY - centerY) / centerY;
        layers.forEach(layer => {
            const speed = parseFloat(layer.dataset.speed || '0.05');
            const x = offsetX * speed * -100;
            const y = offsetY * speed * -50;
            layer.style.transform = `translate3d(${x}px, ${y}px, 0)`;
        });
        menuParallaxAnimationId = requestAnimationFrame(tick);
    }

    window.addEventListener('mousemove', e => {
        mouseX = e.clientX;
        mouseY = e.clientY;
        menuMouseState.px = e.clientX;
        menuMouseState.py = e.clientY;
    }, { passive: true });

    window.addEventListener('mouseleave', () => {
        mouseX = window.innerWidth  / 2;
        mouseY = window.innerHeight / 2;
    });

    const coarse = window.matchMedia?.('(pointer: coarse)').matches;
    if (coarse && typeof DeviceOrientationEvent !== 'undefined') {
        const handler = e => {
            if (e.gamma == null) return;
            _gyroActive = true;
            mouseX = window.innerWidth  / 2 + (e.gamma || 0) * 10;
            mouseY = window.innerHeight / 2 - (e.beta  || 0) *  6;
        };
        if (typeof DeviceOrientationEvent.requestPermission === 'function') {
            document.addEventListener('touchend', async function _r() {
                document.removeEventListener('touchend', _r);
                try { if (await DeviceOrientationEvent.requestPermission() === 'granted')
                    window.addEventListener('deviceorientation', handler, { passive: true });
                } catch(e) {}
            }, { once: true });
        } else {
            window.addEventListener('deviceorientation', handler, { passive: true });
        }
    }

    menuParallaxBound = true;
    menuParallaxAnimationId = requestAnimationFrame(tick);
}

// animateFireflies — replaced by Canvas system (_runParticleLoop)
// Kept as no-op stub so legacy call sites don't throw
function animateFireflies() { /* no-op: Canvas system active */ }

function addNewProfile() {
    if (userNames.length >= 10) {
        showAutosave('Máximo de 10 perfiles alcanzado', 'error');
        return;
    }
    const newName = prompt('Nombre del nuevo perfil:');
    if (newName && newName.trim()) {
        userNames.push(newName.trim());
        localStorage.setItem('etheria_user_names', JSON.stringify(userNames));
        renderUserCards();
    }
}

// Generar partículas — sistema Canvas (luciérnagas noche / pétalos día)
function generateParticles() {
    const isLowSpec = document.body.classList.contains('low-spec');
    if (isLowSpec) return;

    // Init canvas once
    if (!_pCanvas) {
        if (!_initParticleCanvas()) return;
    }

    const isMobile = document.body.classList.contains('is-mobile')
        || (typeof window.matchMedia === 'function' && window.matchMedia('(pointer:coarse)').matches);

    // Pool sizes
    const ffCount  = isMobile ? 20 : 55;
    const petCount = isMobile ? 20 : 48;

    _pFireflies = Array.from({ length: ffCount },  () => new _Firefly());
    _pPetals    = Array.from({ length: petCount }, () => new _Petal());

    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';

    // Transición suave: noche=luciérnagas, día=pétalos
    _pTarget = isDark ? 1 : 0;
    // Snap inmediato en la primera carga (sin fade)
    _pAlpha  = _pTarget;

    // Arrancar loop si no está activo
    if (!_pAnimId) _runParticleLoop();
}

// ============================================

/* js/ui/navigation.js */

// VisibilityManager — sincroniza --section-animations con la sección activa
// Más preciso que el selector CSS :not(.active) para transiciones con delay
const _sectionAnimControl = {
    pause(sectionEl) {
        if (!sectionEl) return;
        sectionEl.style.setProperty('--section-animations', 'paused');
        sectionEl.querySelectorAll('.vn-sprite img').forEach(img => {
            img.style.animationPlayState = 'paused';
        });
    },
    resume(sectionEl) {
        if (!sectionEl) return;
        sectionEl.style.removeProperty('--section-animations');
        sectionEl.querySelectorAll('.vn-sprite img').forEach(img => {
            img.style.animationPlayState = '';
        });
    },
    sync() {
        document.querySelectorAll('.game-section').forEach(s => {
            if (s.classList.contains('active')) this.resume(s);
            else this.pause(s);
        });
    }
};

// ── Transición suave entre secciones (absorbido de mejoras.js) ───────────────
// _skipNextFadeTransition: characters.js lo activa al volver de selección de perfil
// para evitar el overlay negro innecesario.
var _skipNextFadeTransition = false;
var _fadeTransitionInProgress = false;

function _clearFadeOverlay(overlay, delay) {
    setTimeout(function() {
        if (overlay) {
            overlay.classList.remove('fade-out');
            overlay.style.transition = '';
        }
        _fadeTransitionInProgress = false;
    }, delay);
}

function fadeTransition(callback, duration) {
    duration = duration || 280;
    if (_skipNextFadeTransition) {
        _skipNextFadeTransition = false;
        try { callback(); } catch(e) { console.error('[fadeTransition]', e); }
        return;
    }
    if (_fadeTransitionInProgress) {
        try { callback(); } catch(e) { console.error('[fadeTransition]', e); }
        return;
    }
    var overlay = document.getElementById('sectionTransitionOverlay');
    if (!overlay) {
        try { callback(); } catch(e) { console.error('[fadeTransition]', e); }
        return;
    }
    _fadeTransitionInProgress = true;
    overlay.style.transition = 'opacity ' + duration + 'ms ease';
    overlay.classList.add('fade-out');
    setTimeout(function() {
        try { callback(); } catch(e) { console.error('[fadeTransition]', e); }
        finally { _clearFadeOverlay(overlay, Math.round(duration * 0.6)); }
    }, duration);
}

// Navegación entre secciones y galería de personajes.
// NAVEGACIÓN
// ============================================
function confirmUnsavedChanges(callback) {
    if (!hasUnsavedChanges) {
        callback();
        return;
    }
    // Primero: ¿guardar antes de salir?
    openConfirmModal('Tienes cambios sin guardar. ¿Guardar antes de salir?', 'Guardar').then(wantsSave => {
        if (wantsSave) {
            save({ silent: true });
            callback();
        } else {
            // Segundo: ¿descartar?
            openConfirmModal('¿Descartar los cambios sin guardar?', 'Descartar').then(wantsDiscard => {
                if (wantsDiscard) {
                    hasUnsavedChanges = false;
                    callback();
                }
                // Si cancela en ambos, no hace nada
            });
        }
    });
}

function resetVNTransientState({ clearTopic = false } = {}) {
    stopTypewriter();
    closeReplyPanel();
    closeContinuation();
    closeSettings();

    const optionsContainer = document.getElementById('vnOptionsContainer');
    if (optionsContainer) optionsContainer.classList.remove('active');

    const emotePicker = document.getElementById('emotePicker');
    if (emotePicker) emotePicker.classList.remove('active');

    if (typeof cleanupVnRuntimeResources === 'function') {
        cleanupVnRuntimeResources({ disconnectObserver: true, clearSpritePool: clearTopic, stopSpriteBlink: true });
    }

    const vnSpriteContainer = document.getElementById('vnSpriteContainer');
    if (vnSpriteContainer) vnSpriteContainer.innerHTML = '';

    const weatherContainer = document.getElementById('weatherContainer');
    if (weatherContainer) weatherContainer.innerHTML = '';

    // Detener sonido ambiental de lluvia si estaba activo
    eventBus.emit('audio:stop-rain');

    editingMessageId = null;
    pendingContinuation = null;
    currentWeather = 'none';
    currentFilter = 'none';
    document.body.classList.remove('mode-rpg');
    document.body.classList.remove('mode-classic');
    // Cerrar mini-panel del oráculo si está abierto
    const oracleMini = document.getElementById('vnOracleMiniPanel');
    if (oracleMini) oracleMini.style.display = 'none';

    if (clearTopic) {
        // Cancelar suscripción realtime al salir de una historia
        if (typeof SupabaseMessages !== 'undefined' && typeof SupabaseMessages.unsubscribe === 'function') {
            SupabaseMessages.unsubscribe();
        }
        if (typeof clearTypingState === 'function') clearTypingState();
        if (typeof cancelContinuousRead === 'function') cancelContinuousRead('exit-topic');
        if (typeof updateRoomCodeUI === 'function') updateRoomCodeUI(null);
        window.dispatchEvent(new CustomEvent('etheria:topic-leave'));
        currentTopicId = null;
        currentMessageIndex = 0;
    }
}

// ── Listener EventBus: ui:reset-vn-state ─────────────────────────────────────
// vn.js emite este evento al entrar a un tema para limpiar el estado transitorio.
// navigation.js es el dueño de resetVNTransientState — este listener es el
// único punto de entrada desde módulos externos.
(function _initNavigationListeners() {
    if (window._navigationListenersReady) return;
    window._navigationListenersReady = true;
    if (typeof eventBus !== 'undefined') {
        eventBus.on('ui:reset-vn-state', function() {
            resetVNTransientState();
        });
    }
})();

function closeActiveModals() {
    document.querySelectorAll('.modal-overlay.active').forEach((modal) => {
        modal.classList.remove('active');
    });
    document.body.classList.remove('modal-open');
}

function getCurrentVisibleSection() {
    const mainMenu = document.getElementById('mainMenu');
    if (mainMenu && !mainMenu.classList.contains('hidden')) return 'mainMenu';

    if (document.getElementById('topicsSection')?.classList.contains('active')) return 'topics';
    if (document.getElementById('gallerySection')?.classList.contains('active')) return 'gallery';
    if (document.getElementById('optionsSection')?.classList.contains('active')) return 'options';

    return null;
}

function showSection(section) {
    if (isLoading) return;
    if (_fadeTransitionInProgress) return;

    const currentSection = getCurrentVisibleSection();
    if (currentSection === section) return;

    // transición visual absorbida de mejoras.js (Mejora 9)
    fadeTransition(function() {
        const mainMenu = document.getElementById('mainMenu');
        if (mainMenu) mainMenu.classList.add('hidden');
        eventBus.emit('audio:stop-menu-music');

        resetVNTransientState({ clearTopic: true });
        closeActiveModals();

        document.querySelectorAll('.game-section').forEach(s => s.classList.remove('active'));
        requestAnimationFrame(() => _sectionAnimControl.sync());

        if(section === 'topics') {
            const topicsSection = document.getElementById('topicsSection');
            if (topicsSection) topicsSection.classList.add('active');
            renderTopics();
            window.dispatchEvent(new CustomEvent('etheria:section-changed', { detail: { section: 'topics' } }));
        } else if(section === 'gallery') {
            const gallerySection = document.getElementById('gallerySection');
            if (gallerySection) gallerySection.classList.add('active');
            renderGallery();
            window.dispatchEvent(new CustomEvent('etheria:section-changed', { detail: { section: 'gallery' } }));
        } else if(section === 'options') {
            const optionsSection = document.getElementById('optionsSection');
            if (optionsSection) optionsSection.classList.add('active');
            if (typeof syncOptionsSection === 'function') syncOptionsSection();
            window.dispatchEvent(new CustomEvent('etheria:section-changed', { detail: { section: 'options' } }));
        }
    }, 150);
}

function backToMenu() {
    confirmUnsavedChanges(() => {
        // transición visual absorbida de mejoras.js (Mejora 9)
        fadeTransition(function() {
            resetVNTransientState({ clearTopic: true });
            closeActiveModals();
            document.querySelectorAll('.game-section').forEach(s => s.classList.remove('active'));
            const mainMenu = document.getElementById('mainMenu');
            if (mainMenu) {
                mainMenu.classList.remove('hidden');
                generateParticles();
                eventBus.emit('audio:start-menu-music');
                const particles = document.getElementById('particlesContainer');
                if (particles) particles.style.transform = '';
            }
            window.dispatchEvent(new CustomEvent('etheria:section-changed', { detail: { section: 'mainMenu' } }));
        }, 150);
    });
}

function backToTopics() {
    confirmUnsavedChanges(() => {
        // transición visual absorbida de mejoras.js (Mejora 9)
        fadeTransition(function() {
            if (typeof CollaborativeGuard !== 'undefined') CollaborativeGuard.stop();
            if (typeof SupabaseMessages !== 'undefined' && typeof SupabaseMessages.unsubscribeGlobal === 'function') {
                SupabaseMessages.unsubscribeGlobal();
            }
            if (typeof _globalRealtimeHandlerRef !== 'undefined' && _globalRealtimeHandlerRef) {
                window.removeEventListener('etheria:realtime-message', _globalRealtimeHandlerRef);
                _globalRealtimeHandlerRef = null;
            }
            resetVNTransientState({ clearTopic: true });
            // Limpiar TODAS las secciones activas (no solo vnSection)
            // para evitar que options/gallery queden visibles encima de topics
            document.querySelectorAll('.game-section').forEach(s => s.classList.remove('active'));
            const topicsSection = document.getElementById('topicsSection');
            if (topicsSection) topicsSection.classList.add('active');
            renderTopics();
        }, 150);
    });
}

// ============================================
// GALERÍA
// ============================================
function setupGallerySearchListeners() {
    const searchInput = document.getElementById('gallerySearch');
    if (!searchInput || searchInput.dataset.debounceBound === '1') return;

    searchInput.dataset.debounceBound = '1';
    searchInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            renderGallery();
        }
    });
}

function debounceRenderGallery() {
    window.clearTimeout(gallerySearchDebounceTimer);
    gallerySearchDebounceTimer = window.setTimeout(() => {
        renderGallery();
    }, 300);
}

function initGalleryLazyImages() {
    if (galleryImageObserver) {
        galleryImageObserver.disconnect();
    }

    galleryImageObserver = new IntersectionObserver((entries, observer) => {
        entries.forEach((entry) => {
            if (!entry.isIntersecting) return;

            const image = entry.target;
            const src = image.dataset.src;
            if (src) {
                // Blur-up: mostrar shimmer, luego transición suave
                image.classList.add('gallery-img-loading');
                const tmp = new Image();
                tmp.onload = () => {
                    image.src = src;
                    image.removeAttribute('data-src');
                    requestAnimationFrame(() => {
                        image.classList.remove('gallery-img-loading');
                        image.classList.add('gallery-img-loaded');
                    });
                };
                tmp.onerror = () => {
                    image.classList.remove('gallery-img-loading');
                    image.removeAttribute('data-src');
                };
                tmp.src = src;
            }
            observer.unobserve(image);
        });
    }, { rootMargin: '200px 0px', threshold: 0.01 });

    document.querySelectorAll('#galleryGrid img[data-src]').forEach((img) => {
        // XSS fix: bind onerror here where we have DOM access (data-fallback set in template)
        if (!img._onerrorBound) {
            img._onerrorBound = true;
            img.onerror = function () {
                this.style.display = 'none';
                const _fb = document.createElement('div');
                _fb.className = 'char-card-initial';
                _fb.textContent = this.dataset.fallback || '?';
                this.parentElement.appendChild(_fb);
            };
        }
        galleryImageObserver.observe(img);
    });
}

function fuzzySearch(query, items) {
    const terms = String(query || "").toLowerCase().trim().split(/\s+/).filter(Boolean);
    if (!terms.length) return items;
    return items.filter((item) => {
        const text = `${item.name || ""} ${item.race || ""} ${item.ownerName || ""}`.toLowerCase();
        return terms.every((term) => text.includes(term));
    });
}

// REEMPLAZO COMPLETO de la lógica de galería
let _gallerySortMode = 'default';
let _galleryActiveRaces = new Set();

function setGallerySort(mode, btn) {
    _gallerySortMode = mode;
    document.querySelectorAll('.gallery-sort-pill').forEach(p => p.classList.remove('active'));
    if (btn) btn.classList.add('active');
    renderGallery();
}

function onGallerySearch(val) {
    const suggestions = document.getElementById('gallerySuggestions');
    if (!suggestions) return;
    if (!val.trim()) { suggestions.style.display = 'none'; renderGallery(); return; }
    renderGallery();

    // Sugerencias predictivas
    const lower = val.toLowerCase();
    const allNames = appData.characters.flatMap(c => [c.name, c.race, c.job, userNames[c.userIndex]].filter(Boolean));
    const matches = [...new Set(allNames)].filter(n => n.toLowerCase().includes(lower) && n.toLowerCase() !== lower).slice(0, 5);

    if (matches.length) {
        // XSS/injection fix: use data attribute + safe click handler
        // (inline onclick with escapeHtml can break on apostrophes in JS string context)
        suggestions.innerHTML = '';
        matches.forEach(m => {
            const div = document.createElement('div');
            div.className = 'gallery-suggestion';
            div.textContent = m;
            div.addEventListener('click', function () {
                const searchInput = document.getElementById('gallerySearch');
                if (searchInput) searchInput.value = m;
                suggestions.style.display = 'none';
                renderGallery();
            });
            suggestions.appendChild(div);
        });
        suggestions.style.display = 'block';
    } else {
        suggestions.style.display = 'none';
    }
}

function toggleRaceFilter(race) {
    if (_galleryActiveRaces.has(race)) _galleryActiveRaces.delete(race);
    else _galleryActiveRaces.add(race);
    renderRaceTagPills();
    renderGallery();
}

function renderRaceTagPills() {
    const container = document.getElementById('galleryRaceTags');
    if (!container) return;
    const allRaces = [...new Set(appData.characters.map(c => c.race).filter(Boolean))].sort();
    if (allRaces.length === 0) { container.innerHTML = ''; return; }
    container.innerHTML = allRaces.map(r => `
        <button class="race-pill ${_galleryActiveRaces.has(r) ? 'active' : ''}" onclick="toggleRaceFilter('${escapeHtml(r)}')">${escapeHtml(r)}</button>
    `).join('');
}


function updateGalleryControlsState(totalChars) {
    const disableSort = Number(totalChars || 0) <= 1;
    document.querySelectorAll('.gallery-sort-pill').forEach((pill) => {
        pill.disabled = disableSort;
        pill.classList.toggle('is-disabled', disableSort);
        pill.title = disableSort ? 'Disponible al tener más personajes' : '';
    });
}

function renderGallery() {
    const grid = document.getElementById('galleryGrid');
    if (!grid) return;

    document.getElementById('gallerySuggestions')?.style && (document.getElementById('gallerySuggestions').style.display = 'none');

    const searchTerm = (document.getElementById('gallerySearch')?.value || '').toLowerCase().trim();

    let chars = [...appData.characters];

    if (searchTerm) chars = fuzzySearch(searchTerm, chars.map(c => ({ ...c, ownerName: userNames[c.userIndex] || '' })));
    if (_galleryActiveRaces.size > 0) chars = chars.filter(c => _galleryActiveRaces.has(c.race));

    if (_gallerySortMode === 'owner')  chars.sort((a, b) => a.userIndex - b.userIndex || a.name.localeCompare(b.name));
    else if (_gallerySortMode === 'name')  chars.sort((a, b) => a.name.localeCompare(b.name));
    else if (_gallerySortMode === 'race')  chars.sort((a, b) => (a.race||'').localeCompare(b.race||''));

    const galleryCount = document.getElementById('galleryCount');
    if (galleryCount) galleryCount.textContent = `${chars.length} personaje${chars.length !== 1 ? 's' : ''}`;

    updateGalleryControlsState(appData.characters.length);
    renderRaceTagPills();

    if (chars.length === 0) {
        const isEmpty = appData.characters.length === 0;
        grid.innerHTML = isEmpty
            ? `<div class="gallery-empty">
                <div class="gallery-empty-icon">
                    <svg width="80" height="80" viewBox="0 0 80 80" fill="none" class="etheria-mascot">
                        <ellipse cx="40" cy="68" rx="22" ry="6" class="mascot-shadow"/>
                        <rect x="14" y="18" width="52" height="42" rx="4" class="mascot-body"/>
                        <path d="M28 34 Q40 20 52 34" class="mascot-arc" stroke-width="1.5" stroke-linecap="round" fill="none"/>
                        <path d="M35 42 Q37 38 40 42 Q43 38 45 42" class="mascot-mouth" stroke-width="1.2" stroke-linecap="round" fill="none"/>
                        <circle cx="33" cy="38" r="1.5" class="mascot-eye"/>
                        <circle cx="47" cy="38" r="1.5" class="mascot-eye"/>
                        <path d="M58 10 C58 10 62 22 55 24" class="mascot-antenna" stroke-width="1.2" stroke-linecap="round" fill="none"/>
                        <path d="M56 10 L60 8 L58 12" class="mascot-antenna-tip"/>
                    </svg>
                </div>
                <p class="gallery-empty-text">Ningún alma ha sido plasmada todavía…</p>
                <p class="gallery-empty-sub">El libro de personajes aguarda su primera historia.</p>
                <button class="gallery-empty-btn" onclick="openCharacterEditor()">
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M7 1v12M1 7h12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
                    Crear primer personaje
                </button>
            </div>`
            : `<div class="gallery-empty"><p class="gallery-empty-text" style="font-size:1rem;">Sin resultados para esa búsqueda</p></div>`;
        return;
    }

    grid.innerHTML = chars.map((c, i) => {
        const ownerName = userNames[c.userIndex] || 'Desconocido';
        const isOwn = c.userIndex === currentUserIndex;
        const charColor = c.color || '#8b7355';
        const genderLabel = c.gender === 'Femenino' ? '♀' : c.gender === 'Masculino' ? '♂' : '◇';

        return `
        <div class="char-card-v2" onclick="openSheet('${c.id}')" style="--card-color:${charColor}; animation-delay:${i * 0.03}s">
            <div class="char-card-avatar">
                ${c.avatar
                    ? `<img data-src="${escapeHtml(c.avatar)}" alt="${escapeHtml(c.name)}" loading="lazy" data-fallback="${escapeHtml((c.name || '?')[0])}" class="char-card-img">`
                    : `<div class="char-card-initial">${escapeHtml((c.name || '?')[0])}</div>`}
            </div>
            <div class="char-card-overlay">
                <div class="char-card-top-badge ${isOwn ? 'own' : 'other'}">
                    ${isOwn ? '✦ Tu personaje' : escapeHtml(ownerName)}
                </div>
                <div class="char-card-info">
                    <div class="char-card-name">${escapeHtml(c.name)}</div>
                    <div class="char-card-meta">
                        <span class="char-card-gender">${genderLabel}</span>
                        ${c.race ? `<span class="char-card-race">${escapeHtml(c.race)}</span>` : ''}
                        ${c.age ? `<span class="char-card-age">${c.age} años</span>` : ''}
                    </div>
                </div>
                <div class="char-card-hover-extra">
                    ${c.job ? `<div class="char-card-job">${escapeHtml(c.job)}</div>` : ''}
                    ${c.basic ? `<div class="char-card-desc">${escapeHtml(c.basic.slice(0, 90))}${c.basic.length > 90 ? '…' : ''}</div>` : ''}
                </div>
            </div>
        </div>`;
    }).join('');

    if (appData.characters.length > 0 && appData.characters.length < 6) {
        grid.insertAdjacentHTML('beforeend', `
            <button class="char-card-v2 char-card-v2--new" onclick="openCharacterEditor()" type="button" aria-label="Crear personaje">
                <span class="char-card-new-plus">+</span>
                <span class="char-card-new-text">Crear nuevo personaje</span>
            </button>
        `);
    }

    initGalleryLazyImages();
}


// ============================================

/* js/ui/sheets.js */
// Fichas de personaje (vista detallada).
// FICHA DE PERSONAJE
// ============================================
const RPG_BASE_STATS = Object.freeze({ STR: 5, VIT: 5, INT: 5, AGI: 5 });
const RPG_POINTS_POOL = 14;
const RPG_HP_MAX = 10;
const RPG_EXP_PER_LEVEL = 10;

function getRpgTitleByLevel(level) {
    if (level >= 7) return 'Maestro';
    if (level >= 4) return 'Adepto';
    return 'Aprendiz';
}

function sanitizeRpgProfile(raw) {
    const existingStats = raw?.stats || {};
    const profile = {
        stats: {
            STR: Math.max(0, Number(existingStats.STR) || 0),
            VIT: Math.max(0, Number(existingStats.VIT) || 0),
            INT: Math.max(0, Number(existingStats.INT) || 0),
            AGI: Math.max(0, Number(existingStats.AGI) || 0)
        },
        hp: Math.max(0, Math.min(RPG_HP_MAX, Number(raw?.hp) || RPG_HP_MAX)),
        exp: Math.max(0, Math.min(RPG_EXP_PER_LEVEL - 1, Number(raw?.exp) || 0)),
        level: Math.max(1, Number(raw?.level) || 1),
        knockedOutTurns: Math.max(0, Number(raw?.knockedOutTurns) || 0)
    };

    const spent = profile.stats.STR + profile.stats.VIT + profile.stats.INT + profile.stats.AGI;
    if (spent > RPG_POINTS_POOL) {
        const overflow = spent - RPG_POINTS_POOL;
        profile.stats.AGI = Math.max(0, profile.stats.AGI - overflow);
    }
    return profile;
}

function ensureCharacterRpgProfile(char, topicId = null) {
    if (!char) return null;

    const baseProfile = sanitizeRpgProfile(char.rpgProfile || {});
    char.rpgProfile = baseProfile;

    const activeTopicId = topicId || currentTopicId;
    const topic = appData.topics.find((t) => String(t.id) === String(activeTopicId));
    if (!topic || topic.mode !== 'rpg') {
        return baseProfile;
    }

    topic.rpgProfiles = topic.rpgProfiles || {};
    const topicSeedProfile = topic.rpgProfiles[char.id] || {
        stats: baseProfile.stats,
        hp: RPG_HP_MAX,
        exp: 0,
        level: 1,
        knockedOutTurns: 0
    };
    topic.rpgProfiles[char.id] = sanitizeRpgProfile(topicSeedProfile);
    return topic.rpgProfiles[char.id];
}

function getRpgSpentPoints(profile) {
    if (!profile || !profile.stats) return 0;
    return ['STR', 'VIT', 'INT', 'AGI'].reduce((sum, key) => sum + (Number(profile.stats[key]) || 0), 0);
}

function openSheet(id) {
    currentSheetCharId = id;
    const c = appData.characters.find(ch => String(ch.id) === String(id));
    if(!c) return;

    // Avatar con color de borde del personaje
    const sheetAvatar = document.getElementById('sheetAvatar');
    if (sheetAvatar) {
        const color = c.color || 'var(--accent-gold)';
        sheetAvatar.style.setProperty('--sheet-char-color', color);
        // XSS fix: DOM creation avoids c.name[0] injection in onerror attribute
        sheetAvatar.innerHTML = '';
        if (c.avatar) {
            const _imgSheet = document.createElement('img');
            _imgSheet.src = c.avatar;
            _imgSheet.alt = c.name;
            _imgSheet.onerror = function () {
                this.style.display = 'none';
                const _sp = document.createElement('span');
                _sp.className = 'sheet-avatar-initial';
                _sp.textContent = (c.name || '?')[0];
                this.parentElement.appendChild(_sp);
            };
            sheetAvatar.appendChild(_imgSheet);
        } else {
            const _sp = document.createElement('span');
            _sp.className = 'sheet-avatar-initial';
            _sp.textContent = (c.name || '?')[0];
            sheetAvatar.appendChild(_sp);
        }
    }

    // Nombre y apellido
    const nameEl = document.getElementById('sheetName');
    const lastNameBadge = document.getElementById('sheetLastNameBadge');
    if (nameEl) nameEl.textContent = c.name;
    if (lastNameBadge) {
        lastNameBadge.textContent = c.lastName || '';
        lastNameBadge.style.display = c.lastName ? '' : 'none';
    }

    // Propietario
    const ownerEl = document.getElementById('sheetOwner');
    if (ownerEl) {
        const isOwn = c.userIndex === currentUserIndex;
        ownerEl.innerHTML = isOwn
            ? `<span class="sheet-own-badge">✦ Tu personaje</span>`
            : `<span>Por <strong>${escapeHtml(c.owner || userNames[c.userIndex] || '—')}</strong></span>`;
    }

    // Cinta de ocupación
    const ribbon = document.getElementById('sheetJobRibbon');
    if (ribbon) {
        ribbon.textContent = c.job || '';
        ribbon.style.display = c.job ? '' : 'none';
        ribbon.style.background = c.color || 'var(--accent-wood)';
    }

    // Quick stats (raza, género, edad, alineamiento)
    const sheetQuickStats = document.getElementById('sheetQuickStats');
    if (sheetQuickStats) {
        sheetQuickStats.innerHTML = [
            c.race      && `<span class="quick-stat-v2">${escapeHtml(c.race)}</span>`,
            c.gender    && `<span class="quick-stat-v2">${c.gender}</span>`,
            c.age       && `<span class="quick-stat-v2">${c.age} años</span>`,
            c.alignment && `<span class="quick-stat-v2 qs-align" style="--align-color:${getAlignmentColor(c.alignment)}">${alignments[c.alignment] || c.alignment}</span>`,
        ].filter(Boolean).join('');
    }

    // Tab Perfil: columna izquierda (tarjetas de datos) y derecha (descripción física)
    const profileGrid = document.getElementById('profileGrid');
    if (profileGrid) {
        const dataFields = [
            { label: 'Nombre',      val: c.name },
            c.lastName  && { label: 'Apellido',    val: c.lastName },
            c.age       && { label: 'Edad',         val: `${c.age} años` },
            c.race      && { label: 'Raza',          val: c.race },
            c.gender    && { label: 'Género',        val: c.gender },
            c.alignment && { label: 'Alineamiento',  val: alignments[c.alignment] || c.alignment },
            c.job       && { label: 'Ocupación',     val: c.job },
        ].filter(Boolean);
        profileGrid.innerHTML = dataFields.map(f => `
            <div class="profile-card-item">
                <div class="profile-card-label">${f.label}</div>
                <div class="profile-card-value">${escapeHtml(String(f.val))}</div>
            </div>
        `).join('');
    }
    const profilePhysical = document.getElementById('profilePhysical');
    if (profilePhysical) {
        profilePhysical.innerHTML = c.basic
            ? `<div class="profile-physical-label">Descripción física</div><div class="profile-physical-text">${escapeHtml(c.basic)}</div>`
            : `<div class="profile-physical-empty">Sin descripción física. Describe su rasgo más memorable.</div>`;
    }

    // Tabs de texto
    const profilePersonality = document.getElementById('profilePersonality');
    const profileHistory     = document.getElementById('profileHistory');
    const profileNotes       = document.getElementById('profileNotes');
    if (profilePersonality) profilePersonality.textContent = c.personality || 'Sin datos de personalidad.';
    if (profileHistory)     profileHistory.textContent     = c.history     || 'Sin trasfondo registrado todavía.';
    if (profileNotes)       profileNotes.textContent       = c.notes       || 'Sin notas del jugador.';

    // Botón editar
    const sheetEditBtn = document.getElementById('sheetEditBtn');
    if (sheetEditBtn) sheetEditBtn.style.display = c.userIndex === currentUserIndex ? 'inline-flex' : 'none';

    // Reset tabs
    document.querySelectorAll('.sheet-tab-v2').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
    const firstTab = document.querySelector('.sheet-tab-v2');
    if (firstTab) firstTab.classList.add('active');
    const tabProfile = document.getElementById('tab-profile');
    if (tabProfile) tabProfile.classList.add('active');

    openModal('sheetModal');
}

function getRpgSheetData(c, topicId = null) {
    const profile = ensureCharacterRpgProfile(c, topicId);
    const spent = getRpgSpentPoints(profile);
    const freePoints = Math.max(0, RPG_POINTS_POOL - spent);
    const totalStats = {
        STR: RPG_BASE_STATS.STR + profile.stats.STR,
        VIT: RPG_BASE_STATS.VIT + profile.stats.VIT,
        INT: RPG_BASE_STATS.INT + profile.stats.INT,
        AGI: RPG_BASE_STATS.AGI + profile.stats.AGI
    };
    return {
        profile,
        freePoints,
        totalStats,
        title: getRpgTitleByLevel(profile.level)
    };
}

function renderRpgStatsModal(c) {
    const titleEl = document.getElementById('rpgStatsTitle');
    const bodyEl = document.getElementById('rpgStatsBody');
    if (!titleEl || !bodyEl) return;

    const data = getRpgSheetData(c, currentTopicId || null);
    const hpWidth = (data.profile.hp / RPG_HP_MAX) * 100;
    const expWidth = (data.profile.exp / RPG_EXP_PER_LEVEL) * 100;
    const isOwn = c.userIndex === currentUserIndex;

    titleEl.textContent = `⚔ Nv.${data.profile.level} · ${data.title}`;

    bodyEl.innerHTML = `
        <div class="rpg-stats-progress-row">
            <span class="rpg-stats-progress-label">HP</span>
            <div class="sheet-rpg-progress"><div class="sheet-rpg-progress-fill hp" style="width:${hpWidth}%;"></div></div>
            <span class="rpg-stats-progress-value">${data.profile.hp}/${RPG_HP_MAX}</span>
        </div>
        <div class="rpg-stats-progress-row">
            <span class="rpg-stats-progress-label">EXP</span>
            <div class="sheet-rpg-progress"><div class="sheet-rpg-progress-fill exp" style="width:${expWidth}%;"></div></div>
            <span class="rpg-stats-progress-value">${data.profile.exp}/${RPG_EXP_PER_LEVEL}</span>
        </div>
        <div class="rpg-stats-grid">
            ${[
                ['STR', 'Fuerza'],
                ['VIT', 'Vida'],
                ['INT', 'Intel'],
                ['AGI', 'Veloc']
            ].map(([key, desc]) => {
                const base  = RPG_BASE_STATS[key];
                const bonus = data.profile.stats[key];
                const total = data.totalStats[key];
                const canAdd = isOwn && data.freePoints > 0;
                const canSub = isOwn && bonus > 0;
                return `
                <div class="rpg-stats-card">
                    <span class="rpg-stats-card-key">${key}</span>
                    <span class="rpg-stats-card-desc">${desc}</span>
                    <span class="rpg-stats-card-value" id="rpgStat_${key}">${total}</span>
                    ${isOwn ? `
                    <button class="rpg-stat-btn" onclick="adjustRpgStat('${c.id}','${key}',-1)" ${canSub?'':'disabled'} title="Quitar punto">−</button>
                    <button class="rpg-stat-btn" onclick="adjustRpgStat('${c.id}','${key}',1)" ${canAdd?'':'disabled'} title="Añadir punto">+</button>
                    ` : '<span></span><span></span>'}
                </div>`;
            }).join('')}
        </div>
        <div class="rpg-stats-points" id="rpgFreePoints">
            ${isOwn ? `✦ Puntos libres: <strong>${data.freePoints}</strong> / ${RPG_POINTS_POOL}` : `Puntos asignados: ${RPG_POINTS_POOL - data.freePoints} / ${RPG_POINTS_POOL}`}
        </div>
    `;
}

function openRpgStatsModal(charId) {
    const char = appData.characters.find(ch => String(ch.id) === String(charId));
    if (!char) return;
    renderRpgStatsModal(char);
    openModal('rpgStatsModal');
}

// Ajusta un stat RPG del personaje en +1 o -1 y actualiza el modal en tiempo real
function adjustRpgStat(charId, stat, delta) {
    const char = appData.characters.find(ch => String(ch.id) === String(charId));
    if (!char || char.userIndex !== currentUserIndex) return;

    const profile = ensureCharacterRpgProfile(char, currentTopicId);
    const current = profile.stats[stat] || 0;
    const spent   = getRpgSpentPoints(profile);

    if (delta > 0 && spent >= RPG_POINTS_POOL) return; // sin puntos libres
    if (delta < 0 && current <= 0) return;              // ya en mínimo

    profile.stats[stat] = current + delta;

    // Persistir
    if (currentTopicId) {
        const topic = appData.topics.find(t => String(t.id) === String(currentTopicId));
        if (topic && topic.mode === 'rpg') {
            topic.rpgProfiles = topic.rpgProfiles || {};
            topic.rpgProfiles[charId] = profile;
        }
    }
    char.rpgProfile = profile;
    hasUnsavedChanges = true;
    if (typeof save === 'function') save({ silent: true });

    // Re-renderizar el modal sin cerrarlo
    renderRpgStatsModal(char);
    // Actualizar también el resumen de la info-card
    if (typeof updateAffinityDisplay === 'function') updateAffinityDisplay();
}

function getAlignmentColor(code) {
    const colors = {
        'LB': '#4a90e2', 'LN': '#7f8c8d', 'LM': '#2c3e50',
        'NB': '#f39c12', 'NN': '#95a5a6', 'NM': '#8e44ad',
        'CB': '#e74c3c', 'CN': '#e67e22', 'CM': '#c0392b'
    };
    return colors[code] || '#95a5a6';
}

function switchTab(tabName, element) {
    // Soporta tanto .sheet-tab (legacy) como .sheet-tab-v2 (nuevo modal)
    document.querySelectorAll('.sheet-tab, .sheet-tab-v2').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));

    const btn = element
        || document.querySelector(`.sheet-tab-v2[data-tab="${tabName}"]`)
        || document.querySelector(`.sheet-tab[onclick*="'${tabName}'"]`);
    if (btn) btn.classList.add('active');

    const tab = document.getElementById(`tab-${tabName}`);
    if (tab) tab.classList.add('active');
}

// ============================================
// CREAR/EDITAR PERSONAJE
// ============================================
function saveCharacter() {
    const nameInput = document.getElementById('charName');
    const name = nameInput?.value.trim();
    if(!name) { showAutosave('El nombre es obligatorio', 'error'); return; }

    const id = document.getElementById('editCharacterId')?.value || Date.now().toString();

    const avatarUrl = document.getElementById('charAvatar')?.value.trim() || '';
    const spriteUrl = document.getElementById('charSprite')?.value.trim() || '';

    if (!validateImageUrlField(avatarUrl, 'La URL del avatar')) return;
    if (!validateImageUrlField(spriteUrl, 'La URL del sprite')) return;

    const charObj = {
        id,
        userIndex: currentUserIndex,
        owner: userNames[currentUserIndex],
        name,
        lastName: document.getElementById('charLastName')?.value.trim() || '',
        age: document.getElementById('charAge')?.value.trim() || '',
        race: document.getElementById('charRace')?.value.trim() || '',
        gender: document.getElementById('charGender')?.value || '',
        alignment: document.getElementById('charAlignment')?.value || '',
        job: document.getElementById('charJob')?.value.trim() || '',
        color: document.getElementById('charColor')?.value || '#8b7355',
        avatar: avatarUrl,
        sprite: spriteUrl,
        basic: document.getElementById('charBasic')?.value.trim() || '',
        personality: document.getElementById('charPersonality')?.value.trim() || '',
        history: document.getElementById('charHistory')?.value.trim() || '',
        notes: document.getElementById('charNotes')?.value.trim() || ''
    };

    const prevChar = appData.characters.find(c => String(c.id) === String(id));
    if (prevChar?.rpgProfile) charObj.rpgProfile = prevChar.rpgProfile;


    const idx = appData.characters.findIndex(c => String(c.id) === String(id));
    if(idx > -1) appData.characters[idx] = charObj;
    else appData.characters.push(charObj);

    hasUnsavedChanges = true;
    save({ silent: true });
    closeModal('characterModal');
    resetCharForm();
    // Sincronizar avatar_url con Supabase si el personaje tiene ID de Supabase
    if (typeof SupabaseAvatars !== 'undefined') {
        const savedChar = appData.characters.find(c => String(c.id) === String(id));
        if (savedChar && savedChar.avatar) {
            // El personaje tiene URL de avatar — puede ser local o de Supabase Storage
            // No hacemos nada aquí; uploadAvatarForChar() se llama manualmente desde UI
        }
    }

    renderGallery();
}

/**
 * Sube un archivo de imagen como avatar de un personaje de Supabase.
 * Se llama desde el input type="file" del editor de personajes.
 * @param {HTMLInputElement} fileInput
 */
async function uploadAvatarForChar(fileInput) {
    const file = fileInput?.files?.[0];
    if (!file) return;

    if (typeof SupabaseAvatars === 'undefined') {
        showAutosave('Supabase no disponible para subir avatar', 'error');
        return;
    }

    // Obtener el ID del personaje activo en el editor
    const charId = document.getElementById('editCharacterId')?.value;
    if (!charId) {
        showAutosave('Guarda el personaje antes de subir el avatar', 'error');
        return;
    }

    // Intentar resolver el UUID de Supabase para este personaje
    let supabaseCharId = charId;
    if (typeof appData !== 'undefined' && appData.cloudCharacters) {
        for (const chars of Object.values(appData.cloudCharacters)) {
            if (!Array.isArray(chars)) continue;
            const match = chars.find(c => String(c.id) === String(charId));
            if (match) { supabaseCharId = match.id; break; }
        }
    }

    showAutosave('Subiendo avatar...', 'info');
    const result = await SupabaseAvatars.uploadCharacterAvatar(supabaseCharId, file);

    if (!result.ok) {
        showAutosave(result.error || 'Error al subir avatar', 'error');
        return;
    }

    // Actualizar el campo de avatar URL en el editor
    const avatarInput = document.getElementById('charAvatar');
    if (avatarInput) {
        avatarInput.value = result.url;
        if (typeof updatePreview === 'function') updatePreview();
    }

    showAutosave('Avatar subido correctamente', 'saved');
    fileInput.value = '';  // limpiar el input
}

/**
 * Sube un archivo de imagen como sprite de un personaje a Supabase Storage.
 * Se llama desde el input type="file" del editor de personajes.
 * @param {HTMLInputElement} fileInput
 */
async function uploadSpriteForChar(fileInput) {
    const file = fileInput?.files?.[0];
    if (!file) return;

    if (typeof SupabaseSprites === 'undefined') {
        showAutosave('Supabase no disponible para subir sprite', 'error');
        return;
    }

    const charId = document.getElementById('editCharacterId')?.value;
    if (!charId) {
        showAutosave('Guarda el personaje antes de subir el sprite', 'error');
        return;
    }

    // Resolver UUID de Supabase si existe
    let supabaseCharId = charId;
    if (typeof appData !== 'undefined' && appData.cloudCharacters) {
        for (const chars of Object.values(appData.cloudCharacters)) {
            if (!Array.isArray(chars)) continue;
            const match = chars.find(c => String(c.id) === String(charId));
            if (match) { supabaseCharId = match.id; break; }
        }
    }

    showAutosave('Subiendo sprite...', 'info');
    const result = await SupabaseSprites.uploadCharacterSprite(supabaseCharId, file);

    if (!result.ok) {
        showAutosave(result.error || 'Error al subir sprite', 'error');
        return;
    }

    // El módulo ya actualiza charSprite en el DOM y en appData
    showAutosave('Sprite subido correctamente', 'saved');
    fileInput.value = '';
}

function resetCharForm() {
    const editId = document.getElementById('editCharacterId');
    if (editId) editId.value = '';

    const deleteBtn = document.getElementById('deleteCharBtn');
    if (deleteBtn) deleteBtn.style.display = 'none';

    document.querySelectorAll('#characterModal input:not([type="color"]), #characterModal textarea, #characterModal select').forEach(i => i.value = '');

    const colorInput = document.getElementById('charColor');
    if (colorInput) colorInput.value = '#8b7355';

    document.querySelectorAll('.gender-option').forEach(opt => opt.classList.remove('selected'));
}

function editFromSheet() {
    closeModal('sheetModal');
    openCharacterEditor(currentSheetCharId);
}

/* js/utils/supabaseClient.js */
// ============================================
// SUPABASE CLIENT GLOBAL
// ============================================
// Cliente único para Auth y operaciones generales.
// Reutiliza configuración pública para evitar duplicación.

(function (global) {
    const config = global.SUPABASE_CONFIG || {};
    const logger = global.EtheriaLogger;

    global.SUPABASE_CONFIG = config;

    try {
        if (!global.supabase || typeof global.supabase.createClient !== 'function') {
            logger?.warn('supabase', 'Librería supabase-js no disponible para inicializar cliente global.');
            return;
        }

        if (!global.supabaseClient) {
            if (!config.url || !config.key) {
                logger?.error('supabase', 'Configuración Supabase incompleta.');
                return;
            }
            global.supabaseClient = global.supabase.createClient(config.url, config.key);
        }
    } catch (error) {
        logger?.error('supabase', 'Error al crear cliente global:', error?.message || error);
    }
}(window));

/* js/utils/supabaseSync.js */
// ============================================
// SUPABASE SYNC — Sincronización completa de datos
// ============================================
// Reemplaza el sistema JSONBin con sincronización completa vía Supabase.
// Sincroniza: perfiles, topics, characters, mensajes, afinidades, favoritos.
//
// Tablas requeridas en Supabase:
//   - user_data: id (uuid), user_id (uuid), data (jsonb), updated_at (timestamp)
//   - messages: (ya existente)
//
// RLS: SELECT/INSERT/UPDATE solo para el propio user_id
// ============================================

const SupabaseSync = (function () {

    // ── Configuración ────────────────────────────────────────────────────────
    const CFG = {
        SYNC_INTERVAL: 30000,      // 30 segundos entre sincronizaciones
        OFFLINE_INTERVAL: 60000,   // 1 minuto en modo offline
        CONFLICT_THRESHOLD: 5000,  // 5 segundos de diferencia para considerar conflicto
    };

    // ── Estado interno ───────────────────────────────────────────────────────
    let _syncInProgress = false;
    let _lastSyncTime = 0;
    let _syncInterval = null;
    let _isOffline = false;
    let _pendingChanges = false;
    let _cachedUserId = null;

    // ── Helpers ──────────────────────────────────────────────────────────────

    function _client() {
        return window.supabaseClient || null;
    }

    function _isAvailable() {
        return !!_client();
    }

    function _getUserId() {
        return _cachedUserId || window._cachedUserId || null;
    }

    // Escuchar cambios de autenticación
    window.addEventListener('etheria:auth-changed', (e) => {
        _cachedUserId = e.detail?.user?.id || null;
    });

    // ── Serialización de datos ───────────────────────────────────────────────

    /**
     * Obtiene todos los datos del perfil actual para sincronizar
     */
    function _getProfileDataForSync() {
        const profileIndex = typeof currentUserIndex !== 'undefined' ? currentUserIndex : 0;
        const topics = Array.isArray(appData?.topics) ? appData.topics : [];
        const topicIds = new Set(topics.map(t => String(t.id)));

        const messages = {};
        Object.keys(appData?.messages || {}).forEach(topicId => {
            if (topicIds.has(String(topicId))) messages[topicId] = appData.messages[topicId];
        });

        const affinities = {};
        Object.keys(appData?.affinities || {}).forEach(topicId => {
            if (topicIds.has(String(topicId))) affinities[topicId] = appData.affinities[topicId];
        });

        const characters = Array.isArray(appData?.characters) ? appData.characters : [];
        const favorites = appData?.favorites || {};
        const journals = appData?.journals || {};
        const reactions = appData?.reactions || {};

        const profileMeta = {
            genders: (() => {
                try { return JSON.parse(localStorage.getItem('etheria_user_genders') || '[]'); } catch { return []; }
            })(),
            birthdays: (() => {
                try { return JSON.parse(localStorage.getItem('etheria_user_birthdays') || '[]'); } catch { return []; }
            })(),
            avatars: (() => {
                try { return JSON.parse(localStorage.getItem('etheria_user_avatars') || '[]'); } catch { return []; }
            })()
        };

        return {
            profileIndex,
            userNames: typeof userNames !== 'undefined' ? userNames : ['Jugador 1', 'Jugador 2', 'Jugador 3'],
            topics,
            characters,
            messages,
            affinities,
            favorites,
            journals,
            reactions,
            profileMeta,
            lastMessageIndex: typeof currentMessageIndex !== 'undefined' ? currentMessageIndex : 0,
            settings: {
                textSpeed: typeof textSpeed !== 'undefined' ? textSpeed : 25,
                theme: document.documentElement.getAttribute('data-theme') || 'light',
                fontSize: localStorage.getItem('etheria_font_size') || '19'
            }
        };
    }

    /**
     * Aplica datos sincronizados al estado local
     */
    function _applySyncedData(syncedData) {
        if (!syncedData || typeof syncedData !== 'object') return false;

        // Actualizar nombres de usuario si existen
        if (Array.isArray(syncedData.userNames) && syncedData.userNames.length > 0) {
            if (typeof userNames !== 'undefined') {
                userNames.splice(0, userNames.length, ...syncedData.userNames);
            }
            try {
                localStorage.setItem('etheria_user_names', JSON.stringify(syncedData.userNames));
            } catch (error) { window.EtheriaLogger?.warn('app', 'operation failed:', error?.message || error); }
        }

        const remoteTopics = Array.isArray(syncedData.topics) ? syncedData.topics : [];
        const remoteCharacters = Array.isArray(syncedData.characters) ? syncedData.characters : [];
        const remoteMessages = (syncedData.messages && typeof syncedData.messages === 'object') ? syncedData.messages : {};
        const remoteAffinities = (syncedData.affinities && typeof syncedData.affinities === 'object') ? syncedData.affinities : {};

        appData.topics = remoteTopics;
        appData.characters = remoteCharacters;
        appData.messages = remoteMessages;
        appData.affinities = remoteAffinities;
        appData.favorites = (syncedData.favorites && typeof syncedData.favorites === 'object') ? syncedData.favorites : {};
        appData.journals = (syncedData.journals && typeof syncedData.journals === 'object') ? syncedData.journals : {};
        appData.reactions = (syncedData.reactions && typeof syncedData.reactions === 'object') ? syncedData.reactions : {};

        if (syncedData.profileMeta && typeof syncedData.profileMeta === 'object') {
            try {
                localStorage.setItem('etheria_user_genders', JSON.stringify(Array.isArray(syncedData.profileMeta.genders) ? syncedData.profileMeta.genders : []));
                localStorage.setItem('etheria_user_birthdays', JSON.stringify(Array.isArray(syncedData.profileMeta.birthdays) ? syncedData.profileMeta.birthdays : []));
                localStorage.setItem('etheria_user_avatars', JSON.stringify(Array.isArray(syncedData.profileMeta.avatars) ? syncedData.profileMeta.avatars : []));
            } catch (error) { window.EtheriaLogger?.warn('app', 'operation failed:', error?.message || error); }
        }

        // Guardar en localStorage
        if (typeof persistPartitionedData === 'function') {
            persistPartitionedData(true);
        }

        return true;
    }

    // ── API de Supabase ──────────────────────────────────────────────────────

    /**
     * Sube los datos del perfil a Supabase
     */
    async function uploadProfileData() {
        if (!_isAvailable()) return { ok: false, error: 'Supabase no disponible' };
        
        const userId = _getUserId();
        if (!userId) return { ok: false, error: 'Usuario no autenticado' };

        try {
            const data = _getProfileDataForSync();
            const now = new Date().toISOString();

            // Upsert directo para cubrir creación de cuenta nueva y actualizaciones.
            // UPDATE+INSERT puede fallar silenciosamente cuando UPDATE afecta 0 filas.
            const { error: upsertError } = await _client()
                .from('user_data')
                .upsert({
                    user_id: userId,
                    data,
                    updated_at: now
                }, { onConflict: 'user_id' });

            if (upsertError) {
                console.error('[SupabaseSync] upload error:', upsertError);
                return { ok: false, error: upsertError.message };
            }

            _lastSyncTime = Date.now();
            _pendingChanges = false;
            
            // Actualizar UI
            eventBus.emit('sync:status-changed', { status: 'online',  message: 'Sincronizado', target: 'indicator' });
            eventBus.emit('sync:status-changed', { status: 'synced',  message: 'Sincronizar',  target: 'button' });

            return { ok: true };
        } catch (err) {
            console.error('[SupabaseSync] upload exception:', err);
            return { ok: false, error: err.message };
        }
    }

    /**
     * Descarga los datos del perfil desde Supabase
     */
    async function downloadProfileData() {
        if (!_isAvailable()) return { ok: false, error: 'Supabase no disponible' };
        
        const userId = _getUserId();
        if (!userId) return { ok: false, error: 'Usuario no autenticado' };

        try {
            const { data, error } = await _client()
                .from('user_data')
                .select('*')
                .eq('user_id', userId)
                .single();

            if (error) {
                if (error.code === 'PGRST116') {
                    // No hay datos aún (no es error)
                    return { ok: true, data: null, isNew: true };
                }
                console.error('[SupabaseSync] download error:', error);
                return { ok: false, error: error.message };
            }

            if (data?.data) {
                _applySyncedData(data.data);
                _lastSyncTime = Date.now();
                
                // Actualizar UI
                eventBus.emit('sync:status-changed', { status: 'online', message: 'Sincronizado', target: 'indicator' });
                eventBus.emit('sync:status-changed', { status: 'synced', message: 'Sincronizar',  target: 'button' });

                return { ok: true, data: data.data };
            }

            return { ok: true, data: null };
        } catch (err) {
            console.error('[SupabaseSync] download exception:', err);
            return { ok: false, error: err.message };
        }
    }

    /**
     * Sincronización bidireccional completa
     */
    async function sync(options = {}) {
        const { silent = false, force = false } = options;

        if (_syncInProgress && !force) return { status: 'busy' };
        
        const userId = _getUserId();
        if (!userId) {
            if (!silent) {
                eventBus.emit('ui:show-autosave', { text: 'Inicia sesión para sincronizar', state: 'info' });
            }
            return { status: 'no-auth' };
        }

        _syncInProgress = true;
        
        if (!silent) {
            eventBus.emit('sync:status-changed', { status: 'syncing', message: 'Sincronizando...', target: 'button' });
        }

        try {
            // 1. Descargar datos del servidor
            const downloadResult = await downloadProfileData();
            
            if (!downloadResult.ok) {
                _isOffline = true;
                if (!silent) {
                    eventBus.emit('ui:show-autosave', { text: 'Error de sincronización', state: 'error' });
                }
                return { status: 'error', error: downloadResult.error };
            }

            // 2. Si es nuevo usuario, subir datos locales
            if (downloadResult.isNew && _hasLocalData()) {
                const uploadResult = await uploadProfileData();
                if (!silent && uploadResult.ok) {
                    eventBus.emit('ui:show-autosave', { text: 'Datos subidos a la nube', state: 'saved' });
                }
                return { status: uploadResult.ok ? 'uploaded' : 'error' };
            }

            // 3. Si hay cambios locales pendientes, subirlos
            if (_pendingChanges || force) {
                const uploadResult = await uploadProfileData();
                if (!silent && uploadResult.ok) {
                    eventBus.emit('ui:show-autosave', { text: 'Sincronización completada', state: 'saved' });
                }
                return { status: uploadResult.ok ? 'synced' : 'error' };
            }

            _isOffline = false;
            return { status: 'synced' };

        } catch (err) {
            console.error('[SupabaseSync] sync error:', err);
            _isOffline = true;
            return { status: 'error', error: err.message };
        } finally {
            _syncInProgress = false;
        }
    }

    /**
     * Verifica si hay datos locales para sincronizar
     */
    function _hasLocalData() {
        return (appData?.topics?.length > 0) || 
               (appData?.characters?.length > 0) ||
               Object.keys(appData?.messages || {}).length > 0;
    }

    // ── Auto-sync ────────────────────────────────────────────────────────────

    function startAutoSync() {
        if (_syncInterval) clearInterval(_syncInterval);
        
        _syncInterval = setInterval(async () => {
            const userId = _getUserId();
            if (!userId) return; // No sincronizar si no hay usuario
            
            if (_pendingChanges || hasUnsavedChanges) {
                await sync({ silent: true });
            }
        }, _isOffline ? CFG.OFFLINE_INTERVAL : CFG.SYNC_INTERVAL);
    }

    function stopAutoSync() {
        if (_syncInterval) {
            clearInterval(_syncInterval);
            _syncInterval = null;
        }
    }

    // ── Event listeners ──────────────────────────────────────────────────────

    // ── Canal Realtime para detectar cambios desde otros dispositivos ────────
    let _realtimeChannel = null;

    async function _subscribeRealtimeChanges() {
        const userId = _getUserId();
        const c = _client();
        if (!userId || !c?.channel) return;

        // Evitar duplicados
        if (_realtimeChannel) {
            try { c.removeChannel(_realtimeChannel); } catch {}
            _realtimeChannel = null;
        }

        _realtimeChannel = c
            .channel(`user_data:${userId}`)
            .on('postgres_changes', {
                event: 'UPDATE',
                schema: 'public',
                table: 'user_data',
                filter: `user_id=eq.${userId}`
            }, async (payload) => {
                // Solo descargar si la actualización viene de otro dispositivo
                // (diferencia de timestamp mayor a 2s para ignorar nuestros propios upserts)
                const remoteTs = payload?.new?.updated_at
                    ? new Date(payload.new.updated_at).getTime()
                    : 0;
                const msSinceOurLastSync = Date.now() - _lastSyncTime;
                if (msSinceOurLastSync < 2000) return; // fue nuestro propio upsert

                window.EtheriaLogger?.info?.('sync:realtime', 'Cambio detectado desde otro dispositivo — descargando...');
                const result = await downloadProfileData();
                if (result.ok && result.data) {
                    if (typeof renderTopics  === 'function') renderTopics();
                    if (typeof renderGallery === 'function') renderGallery();
                    if (typeof renderUserCards === 'function') renderUserCards();
                    eventBus.emit('ui:show-autosave', { text: 'Datos actualizados desde otro dispositivo', state: 'info' });
                }
            })
            .subscribe();
    }

    function _unsubscribeRealtime() {
        const c = _client();
        if (_realtimeChannel && c) {
            try { c.removeChannel(_realtimeChannel); } catch {}
            _realtimeChannel = null;
        }
    }

    function _setupEventListeners() {
        // Marcar cambios pendientes cuando se modifican datos
        window.addEventListener('etheria:data-changed', () => {
            _pendingChanges = true;
        });

        // ── Sync al volver de segundo plano (móvil/PWA) ──────────────────────
        // visibilitychange cubre tanto PWA como navegador estándar
        document.addEventListener('visibilitychange', async () => {
            if (document.visibilityState !== 'visible') return;
            const userId = _getUserId();
            if (!userId) return;
            const msSinceLastSync = Date.now() - _lastSyncTime;
            // Solo descargar si han pasado más de 10s desde el último sync
            // (evita descargas innecesarias al alternar ventanas rápido)
            if (msSinceLastSync < 10000) return;
            window.EtheriaLogger?.info?.('sync:visibility', 'App visible de nuevo — sincronizando...');
            const result = await downloadProfileData();
            if (result.ok && result.data) {
                if (typeof renderTopics  === 'function') renderTopics();
                if (typeof renderGallery === 'function') renderGallery();
                if (typeof renderUserCards === 'function') renderUserCards();
            }
            // Si además había cambios pendientes, subirlos
            if (_pendingChanges) await uploadProfileData();
        });

        // ── Sync al recuperar conexión ───────────────────────────────────────
        window.addEventListener('online', async () => {
            _isOffline = false;
            const userId = _getUserId();
            if (!userId) return;
            window.EtheriaLogger?.info?.('sync:network', 'Conexión recuperada — sincronizando...');
            eventBus.emit('ui:show-autosave', { text: 'Conexión recuperada — sincronizando...', state: 'info' });
            await sync({ silent: false, force: true });
            // Reconectar canal Realtime (se desconecta al perder red)
            _subscribeRealtimeChanges();
        });

        window.addEventListener('offline', () => {
            _isOffline = true;
            eventBus.emit('sync:status-changed', { status: 'degraded', message: 'Sin conexión', target: 'indicator' });
        });

        // ── Sync al cerrar/salir ─────────────────────────────────────────────
        // beforeunload: sync síncrono con sendBeacon como fallback
        window.addEventListener('beforeunload', () => {
            const userId = _getUserId();
            if (!userId || !_pendingChanges) return;
            // Intentar sync rápido (puede no completarse, pero lo intentamos)
            uploadProfileData().catch(() => {});
            // Fallback: sendBeacon para garantizar que al menos el flag queda registrado
            // (el Service Worker puede usar esto para reintentar al volver)
            if (navigator.sendBeacon) {
                try {
                    navigator.sendBeacon('/sw-sync-ping', JSON.stringify({ userId, ts: Date.now() }));
                } catch {}
            }
        });

        // pagehide: más fiable que beforeunload en móvil iOS
        window.addEventListener('pagehide', () => {
            const userId = _getUserId();
            if (!userId || !_pendingChanges) return;
            uploadProfileData().catch(() => {});
        }, { passive: true });

        // Escuchar mensajes del Service Worker
        navigator.serviceWorker?.addEventListener('message', (event) => {
            if (event.data?.type === 'SYNC_REQUIRED') {
                sync({ silent: true });
            }
        });
    }

    // ── Init ─────────────────────────────────────────────────────────────────

    function init() {
        _setupEventListeners();
        
        // Sincronización inicial silenciosa
        const userId = _getUserId();
        if (userId && _isAvailable()) {
            sync({ silent: true }).catch(() => {});
            // Suscribir al canal Realtime para detectar cambios desde otros dispositivos
            _subscribeRealtimeChanges().catch(() => {});
        }
        
        startAutoSync();
    }

    // ── API pública ──────────────────────────────────────────────────────────

    // Reconectar realtime cuando cambia el usuario autenticado
    window.addEventListener('etheria:auth-changed', (e) => {
        const user = e.detail?.user;
        if (user?.id) {
            _subscribeRealtimeChanges().catch(() => {});
        } else {
            _unsubscribeRealtime();
        }
    });

    return {
        init,
        sync,
        uploadProfileData,
        downloadProfileData,
        startAutoSync,
        stopAutoSync,
        markPending: () => { _pendingChanges = true; },
        get isOffline() { return _isOffline; },
        get lastSyncTime() { return _lastSyncTime; },
        get hasPendingChanges() { return _pendingChanges; }
    };

})();

// Exponer globalmente
window.SupabaseSync = SupabaseSync;

/* js/utils/supabaseMessages.js */
// ============================================
// SUPABASE REALTIME MESSAGES
// ============================================
// Capa adicional para rol en tiempo real.
// Tabla: id (uuid), session_id (text), author (text),
//        content (text), created_at (timestamp).
//
// No sustituye localStorage ni jsonbin.io.
// Si Supabase falla, la app continúa sin errores.
// ============================================

(function (global) {

    const cfg = global.SUPABASE_CONFIG || {};
    const logger = global.EtheriaLogger;

    const SB_URL = cfg.url;
    const SB_KEY = cfg.key;

    const BASE_REST_HEADERS = {
        'apikey'        : SB_KEY,
        'Content-Type'  : 'application/json',
        'Prefer'        : 'return=minimal'
    };

    const MESSAGES_PAGE_SIZE = 100; // Fix 8: initial load limit per topic/story

    let _client    = null;   // instancia supabase-js (cargada desde CDN)
    let _channel   = null;   // canal realtime activo
    let _available = null;   // null = sin verificar | true | false
    let _cachedUserId = null; // Fix 6: cached auth user ID — avoids getUser() on every send

    // ── Init (lazy) ───────────────────────────────────────────────────────────

    function _init() {
        if (_client) return true;
        try {
            // supabase-js expone window.supabase cuando se carga desde CDN ESM
            const lib = global.supabase;
            if (!lib || typeof lib.createClient !== 'function') return false;
            _client = global.supabaseClient || lib.createClient(SB_URL, SB_KEY);
            return true;
        } catch (e) {
            logger?.warn('supabase:messages', 'init error:', e.message);
            _available = false;
            return false;
        }
    }

    async function _getAccessToken() {
        return global.SupabaseAuthHeaders?.getAccessToken
            ? global.SupabaseAuthHeaders.getAccessToken(global.supabaseClient)
            : null;
    }

    async function _restHeaders() {
        if (global.SupabaseAuthHeaders?.buildAuthHeaders) {
            return global.SupabaseAuthHeaders.buildAuthHeaders({
                apikey: SB_KEY,
                client: global.supabaseClient,
                baseHeaders: BASE_REST_HEADERS,
            });
        }
        const token = await _getAccessToken();
        return { ...BASE_REST_HEADERS, Authorization: 'Bearer ' + (token || SB_KEY) };
    }

    // ── Helpers para character_id ─────────────────────────────────────────────

    /**
     * Resuelve el character_id de Supabase para el personaje activo.
     * Busca en appData.cloudCharacters usando el characterId local (UUID local
     * o ID de appData.characters). Si no hay match, devuelve null — el campo
     * es opcional y los mensajes siguen funcionando sin él.
     *
     * @param  {string|null} localCharId  msgObj.characterId (ID del sistema local)
     * @returns {string|null}             UUID de la tabla Supabase characters, o null
     */
    function _resolveSupabaseCharacterId(localCharId) {
        if (!localCharId) return null;
        try {
            const cloudChars = global.appData?.cloudCharacters;
            if (!cloudChars || typeof cloudChars !== 'object') return null;
            // Recorrer todos los perfiles en caché
            for (const profileChars of Object.values(cloudChars)) {
                if (!Array.isArray(profileChars)) continue;
                const match = profileChars.find(function (c) {
                    return String(c.id) === String(localCharId)
                        || String(c.local_id) === String(localCharId); // por si se guardó mapping
                });
                if (match) return match.id;
            }
        } catch (error) { logger?.warn('supabase:messages', 'resolve character id failed:', error?.message || error); }
        return null;
    }

    /**
     * Extrae el nombre del personaje de una fila de Supabase.
     * Prioridad:
     *   1. characters.name  — del join (dato fresco de Supabase)
     *   2. charName         — del JSON serializado en content (compatibilidad)
     *   3. author           — campo legacy de filas muy antiguas
     *   4. 'Desconocido'    — fallback final
     *
     * @param  {object} row  Fila cruda de Supabase (con join characters)
     * @param  {object} msg  Objeto ya parseado desde row.content
     * @returns {string}
     */
    function _resolveCharacterName(row, msg) {
        // 1. Join fresco desde la tabla characters
        const joinedName = row.characters?.name;
        if (joinedName && typeof joinedName === 'string' && joinedName.trim()) {
            return joinedName.trim();
        }
        // 2. Campo serializado en content (mensajes nuevos y mensajes antiguos con charName)
        if (msg.charName && typeof msg.charName === 'string' && msg.charName.trim()) {
            return msg.charName.trim();
        }
        // 3. Campo author legacy (mensajes muy antiguos que usaban author como nombre)
        if (row.author && typeof row.author === 'string' && row.author.trim()
                && row.author !== '0' && !/^\d+$/.test(row.author.trim())) {
            return row.author.trim();
        }
        // 4. Fallback
        return msg.isNarrator ? 'Narrador' : 'Desconocido';
    }

    // Fix 6: populate _cachedUserId when auth state changes
    if (typeof window !== 'undefined') {
        window.addEventListener('etheria:auth-changed', function (e) {
            _cachedUserId = e.detail?.user?.id || null;
        });
    }

    // ── send ─────────────────────────────────────────────────────────────────
    // Guarda el mensaje completo de Etheria serializado en `content`.
    // Añade character_id (columna nueva) si el personaje activo existe en Supabase.
    // Retrocompatible: si character_id es null, el mensaje funciona igual.

    async function send(sessionId, msgObj) {
        if (_available === false) return false;

        try {
            const sbClient = global.supabaseClient;
            if (!sbClient || !sbClient.auth || typeof sbClient.auth.getUser !== 'function') {
                _available = false;
                return false;
            }

            // Fix 4 + 6: use cached userId; fall back to live getUser() if not yet populated
            let _uid = _cachedUserId;
            if (!_uid) {
                const { data: { user: _u } } = await sbClient.auth.getUser();
                _uid = _u?.id || null;
                if (_uid) _cachedUserId = _uid;
            }
            if (!_uid) { return false; }
            const user = { id: _uid };

            // Resolver character_id de Supabase (null si no hay match o es Narrador)
            const supabaseCharId = msgObj.isNarrator
                ? null
                : _resolveSupabaseCharacterId(msgObj.characterId);

            const row = {
                session_id   : String(sessionId),
                user_id      : user.id,
                author       : String(msgObj.userIndex ?? 0),
                // story_id — null si no hay historia activa (retrocompatible)
                story_id     : global.currentStoryId || null,
                // Nueva columna — null si el personaje no está en Supabase characters
                character_id : supabaseCharId,
                content      : JSON.stringify({
                    id               : msgObj.id,
                    characterId      : msgObj.characterId       || null,
                    charName         : msgObj.charName          || null,
                    charColor        : msgObj.charColor         || null,
                    charAvatar       : msgObj.charAvatar        || null,
                    charSprite       : msgObj.charSprite        || null,
                    text             : msgObj.text              || '',
                    isNarrator       : !!msgObj.isNarrator,
                    isGarrick        : !!msgObj.isGarrick,
                    isGarrickFarewell: !!msgObj.isGarrickFarewell,
                    isOracleResult   : !!msgObj.isOracleResult,
                    chapter          : msgObj.chapter           || undefined,
                    userIndex        : msgObj.userIndex         ?? 0,
                    timestamp        : msgObj.timestamp         || new Date().toISOString(),
                    weather          : msgObj.weather           || undefined,
                    diceRoll         : msgObj.diceRoll          || undefined,
                    options          : msgObj.options           || undefined,
                    oracle           : msgObj.oracle            || undefined,
                    metaType         : msgObj.metaType          || undefined,
                    typing           : msgObj.typing            || undefined
                })
            };

            const res = await fetch(SB_URL + '/rest/v1/messages', {
                method  : 'POST',
                headers : await _restHeaders(),
                body    : JSON.stringify(row),
                signal  : AbortSignal.timeout(5000)
            });

            if (!res.ok) {
                const detail = await res.text().catch(() => String(res.status));
                logger?.warn('supabase:messages', 'send failed (' + res.status + '):', detail);
                _available = false;
                return false;
            }

            _available = true;
            return true;

        } catch (e) {
            logger?.error('supabase:messages', 'send error:', e.message);
            _available = false;
            return false;
        }
    }

    // ── load ──────────────────────────────────────────────────────────────────
    // Devuelve array de objetos mensaje de Etheria, o null si falla.
    // Hace join con characters para obtener el nombre fresco.
    // Retrocompatible con mensajes sin character_id.

    async function load(sessionId, storyId) {
        try {
            // GET no necesita 'Prefer: return=minimal' (eso es para POST/PATCH).
            // Usamos headers limpios para que PostgREST devuelva el join correctamente.
            const loadHeaders = {
                ...(await _restHeaders()),
                'Accept': 'application/json'
            };

            // Si hay story_id activo, filtrar por él; si no, usar session_id (retrocompatible)
            const activeStoryId = storyId || global.currentStoryId || null;
            const filter = activeStoryId
                ? '?story_id=eq.' + encodeURIComponent(activeStoryId)
                : '?session_id=eq.' + encodeURIComponent(sessionId);

            // Fix 8: load most recent MESSAGES_PAGE_SIZE messages (desc), then reverse
            // Pass before= ISO timestamp to load older pages (cursor-based pagination)
            const _beforeCursor = (typeof arguments[2] === 'string') ? arguments[2] : null;
            const _cursorFilter = _beforeCursor ? '&created_at=lt.' + encodeURIComponent(_beforeCursor) : '';
            const res = await fetch(
                SB_URL + '/rest/v1/messages'
                    + filter
                    + '&order=created_at.desc'
                    + '&limit=' + MESSAGES_PAGE_SIZE
                    + _cursorFilter
                    + '&select=*,characters(name)',
                { headers: loadHeaders, signal: AbortSignal.timeout(6000) }
            );

            if (!res.ok) {
                _available = false;
                return null;
            }

            const rows = await res.json();
            _available = true;

            // Fix 8: results come desc (newest first) — reverse for display order
            rows.reverse();
            return rows.reduce(function (acc, row) {
                try {
                    const msg = JSON.parse(row.content);

                    // Usar created_at como timestamp si el mensaje no lo trae
                    if (!msg.timestamp) msg.timestamp = row.created_at;

                    // Filtrar mensajes de typing
                    if (msg.metaType === 'typing') return acc;

                    // Enriquecer charName con el dato fresco del join.
                    // _resolveCharacterName aplica la cadena de prioridad y el fallback.
                    if (!msg.isNarrator) {
                        msg.charName = _resolveCharacterName(row, msg);
                    }

                    // Propagar character_id de Supabase al objeto mensaje
                    // para que el sistema local pueda usarlo si lo necesita.
                    if (row.character_id) {
                        msg.supabaseCharacterId = row.character_id;
                    }

                    acc.push(msg);
                } catch (error) {
                    logger?.warn('supabase:messages', 'invalid row while loading messages:', error?.message || error);
                }
                return acc;
            }, []);

        } catch (e) {
            logger?.warn('supabase:messages', 'load error:', e.message);
            _available = false;
            return null;
        }
    }

    // ── loadOlderMessages (Fix 8: cursor-based pagination) ──────────────────────
    // Loads messages older than `beforeTimestamp` (ISO string).
    // Returns array of messages or null on failure.
    async function loadOlderMessages(sessionId, beforeTimestamp, storyId) {
        return load(sessionId, storyId, beforeTimestamp);
    }

    // ── subscribe ─────────────────────────────────────────────────────────────
    // Usa supabase-js channel().on() para escuchar INSERTs filtrados por session_id.
    // onMessage(msgObj) recibe el objeto mensaje de Etheria deserializado.

    function subscribe(sessionId, onMessage, onTyping, onReconnect) {
        if (!_init()) {
            logger?.warn('supabase:messages', 'subscribe: cliente no disponible');
            return;
        }

        unsubscribe();

        // Si hay una historia activa, el canal de historia (supabaseStories) ya filtra por story_id.
        // El canal session filtra mensajes del topic sin story_id para retrocompatibilidad.
        const activeStoryId = global.currentStoryId || null;
        const channelName = activeStoryId ? 'story-session:' + activeStoryId : 'room:' + sessionId;
        const filterExpr = activeStoryId
            ? 'story_id=eq.' + activeStoryId
            : 'session_id=eq.' + sessionId;

        try {
            _channel = _client
                .channel(channelName)
                .on(
                    'postgres_changes',
                    {
                        event  : 'INSERT',
                        schema : 'public',
                        table  : 'messages',
                        filter : filterExpr
                    },
                    function (payload) {
                        try {
                            var row = payload.new;
                            if (!row || !row.content) return;
                            var msg = JSON.parse(row.content);
                            if (!msg.timestamp) msg.timestamp = row.created_at;
                            if (msg && msg.metaType === 'typing') {
                                if (typeof onTyping === 'function') onTyping(msg);
                                return;
                            }
                            // Realtime no incluye el join — resolver nombre desde caché local
                            // de SupabaseCharacters si está disponible, o usar charName del content
                            if (!msg.isNarrator && row.character_id) {
                                msg.supabaseCharacterId = row.character_id;
                                // Buscar en caché de personajes de Supabase
                                try {
                                    var cloudChars = global.appData && global.appData.cloudCharacters;
                                    if (cloudChars) {
                                        for (var pid in cloudChars) {
                                            var chars = cloudChars[pid];
                                            if (!Array.isArray(chars)) continue;
                                            var found = chars.find(function (c) { return c.id === row.character_id; });
                                            if (found && found.name) {
                                                msg.charName = found.name;
                                                break;
                                            }
                                        }
                                    }
                                } catch (error) { logger?.debug('supabase:messages', 'cloud character cache unavailable:', error?.message || error); }
                            }
                            // Fix 4: attach server-assigned user_id for identity checks
                            if (row.user_id) msg._supabaseUserId = row.user_id;
                            if (typeof onMessage === 'function') onMessage(msg);
                        } catch (error) {
                            logger?.warn('supabase:messages', 'unexpected realtime payload:', error?.message || error);
                        }
                    }
                )
                .subscribe(function (status) {
                    if (status === 'SUBSCRIBED') {
                        _available = true;
                        if (typeof onReconnect === 'function') onReconnect();
                    } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
                        _available = false;
                        logger?.warn('supabase:messages', 'channel status:', status);
                    }
                });

        } catch (e) {
            logger?.warn('supabase:messages', 'subscribe error:', e.message);
            _available = false;
        }
    }

    // ── unsubscribe ───────────────────────────────────────────────────────────

    function unsubscribe() {
        if (_channel && _client) {
            try { _client.removeChannel(_channel); } catch (error) { logger?.warn('supabase:messages', 'unsubscribe removeChannel failed:', error?.message || error); }
            _channel = null;
        }
    }

    
    async function sendTyping(sessionId, payload) {
        if (_available === false) return false;
        const msgObj = {
            id: `typing_${Date.now()}_${Math.random().toString(16).slice(2)}`,
            userIndex: payload?.userIndex ?? 0,
            timestamp: new Date().toISOString(),
            metaType: 'typing',
            typing: {
                active: !!payload?.active,
                characterId: payload?.characterId || null,
                name: payload?.name || null
            }
        };
        return send(sessionId, msgObj);
    }

    // ── handleIncomingMessage ────────────────────────────────────────────────
    // Punto de entrada único para mensajes realtime.
    // Deserializa la fila Supabase y despacha 'etheria:realtime-message'.

    // Triple-channel dedup: track recently-dispatched message IDs to avoid
    // processing the same row from subscribe() + subscribeGlobal() + _subscribeToStory()
    const _recentlyDispatched = new Set();
    const _DISPATCH_TTL_MS = 4000;

    function handleIncomingMessage(row) {
        if (!row || !row.content) return;
        try {
            var msg = JSON.parse(row.content);
            if (!msg || !msg.id) return;
            if (!msg.timestamp) msg.timestamp = row.created_at;
            if (msg.metaType === 'typing') return;
            // Dedup: if this message was already dispatched recently, skip
            const _key = String(msg.id);
            if (_recentlyDispatched.has(_key)) return;
            _recentlyDispatched.add(_key);
            setTimeout(function () { _recentlyDispatched.delete(_key); }, _DISPATCH_TTL_MS);

            // Enriquecer charName desde caché de cloudCharacters
            if (!msg.isNarrator && row.character_id) {
                msg.supabaseCharacterId = row.character_id;
                try {
                    var cloudChars = global.appData && global.appData.cloudCharacters;
                    if (cloudChars) {
                        for (var pid in cloudChars) {
                            var chars = cloudChars[pid];
                            if (!Array.isArray(chars)) continue;
                            var found = chars.find(function (c) { return c.id === row.character_id; });
                            if (found && found.name) { msg.charName = found.name; break; }
                        }
                    }
                } catch (error) { logger?.warn('supabase:messages', 'resolve character id failed:', error?.message || error); }
            }

            global.dispatchEvent(new CustomEvent('etheria:realtime-message', {
                detail: { msg: msg, row: row }
            }));
        } catch (e) {
            logger?.warn('supabase:messages', 'handleIncomingMessage:', e.message);
        }
    }

    // ── Canal global messages-realtime ────────────────────────────────────────
    // Escucha TODOS los INSERTs en messages (sin filtro de session_id).
    // Complementa al canal 'room:{sessionId}' que filtra por topic activo.

    var _globalChannel = null;

    function subscribeGlobal(onMessage, onTyping, sessionId) {
        if (!_init()) return;
        // Allow re-subscribe when story or session context changes
        // (stale channel would filter wrong story_id after enterStory)
        const _newActiveId = global.currentStoryId || sessionId || null;
        if (_globalChannel && _globalChannel.__activeId === _newActiveId) return; // same context — no-op
        if (_globalChannel) unsubscribeGlobal(); // remove stale channel before re-subscribing

        // Fix 7: apply filter so this channel only receives messages for the active
        // session or story — prevents receiving all messages across the entire project.
        const _activeStoryId = global.currentStoryId || null;
        const _sessionId = sessionId || null;
        const _globalFilter = _activeStoryId
            ? 'story_id=eq.' + _activeStoryId
            : (_sessionId ? 'session_id=eq.' + _sessionId : null);
        const _filterObj = _globalFilter
            ? { event: 'INSERT', schema: 'public', table: 'messages', filter: _globalFilter }
            : { event: 'INSERT', schema: 'public', table: 'messages' };

        try {
            const _channelId = _activeStoryId || _sessionId || 'all';
            _globalChannel = _client
                .channel('messages-realtime-' + _channelId)
                .on(
                    'postgres_changes',
                    _filterObj,
                    function (payload) {
                        var row = payload.new;
                        if (!row || !row.content) return;
                        // Fix 7: client-side secondary filter for safety
                        if (_activeStoryId && row.story_id && row.story_id !== _activeStoryId) return;
                        if (!_activeStoryId && _sessionId && row.session_id && row.session_id !== _sessionId) return;
                        try {
                            var msg = JSON.parse(row.content);
                            if (!msg || !msg.id) return;
                            if (!msg.timestamp) msg.timestamp = row.created_at;

                            if (msg.metaType === 'typing') {
                                if (typeof onTyping === 'function') onTyping(msg, row);
                                return;
                            }
                            handleIncomingMessage(row);
                            if (typeof onMessage === 'function') onMessage(msg, row);
                        } catch (error) { logger?.warn('supabase:messages', 'global realtime payload parse failed:', error?.message || error); }
                    }
                )
                .subscribe(function (status) {
                    _available = (status === 'SUBSCRIBED');
                    if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
                        _globalChannel = null;
                    }
                });
            if (_globalChannel) _globalChannel.__activeId = _newActiveId;
        } catch (e) {
            logger?.warn('supabase:messages', 'subscribeGlobal error:', e.message);
            _globalChannel = null;
        }
    }

    function unsubscribeGlobal() {
        if (_globalChannel && _client) {
            try { _client.removeChannel(_globalChannel); } catch (error) { logger?.warn('supabase:messages', 'unsubscribeGlobal removeChannel failed:', error?.message || error); }
            _globalChannel = null;
        }
    }

    // ── API pública ───────────────────────────────────────────────────────────

    global.SupabaseMessages = {
        send                  : send,
        load                  : load,
        loadOlderMessages     : loadOlderMessages,
        subscribe             : subscribe,
        subscribeGlobal       : subscribeGlobal,
        unsubscribeGlobal     : unsubscribeGlobal,
        handleIncomingMessage : handleIncomingMessage,
        sendTyping            : sendTyping,
        unsubscribe           : unsubscribe,
        get available() { return _available; }
    };

}(window));

/* js/utils/supabasePresence.js */
// ============================================
// SUPABASE PRESENCE — presencia en historias
// ============================================
// Usa canales Realtime Presence (sin tabla) para indicar
// qué usuarios están activos en cada historia en este momento.

(function (global) {
    const logger = global.EtheriaLogger;

    let _client = null;
    let _channel = null;
    let _storyId = null;
    let _online = new Map(); // user_id -> metadata

    function _getClient() {
        if (_client) return _client;
        try {
            _client = global.supabaseClient || (global.supabase?.createClient
                ? global.supabase.createClient(global.SUPABASE_CONFIG?.url, global.SUPABASE_CONFIG?.key)
                : null);
        } catch (error) {
            logger?.warn('supabase:presence', 'client init failed:', error?.message || error);
            _client = null;
        }
        return _client;
    }

    async function _getCurrentUserId() {
        if (global._cachedUserId) return global._cachedUserId;
        const client = _getClient();
        if (!client?.auth?.getUser) return null;
        try {
            const { data, error } = await client.auth.getUser();
            if (error || !data?.user?.id) return null;
            global._cachedUserId = data.user.id;
            return data.user.id;
        } catch {
            return null;
        }
    }

    function _emitPresenceChange() {
        const userIds = [..._online.keys()];
        global.dispatchEvent(new CustomEvent('etheria:story-presence-changed', {
            detail: {
                storyId: _storyId,
                userIds,
                state: Object.fromEntries(_online.entries())
            }
        }));
    }

    function _readLocalIdentity() {
        let avatarUrl = '';
        let displayName = 'Jugador';

        try {
            const idx = Number(global.currentUserIndex || 0);
            const names = Array.isArray(global.userNames) ? global.userNames : [];
            displayName = (names[idx] || names[0] || 'Jugador').trim() || 'Jugador';
            const avatars = JSON.parse(localStorage.getItem('etheria_user_avatars') || '[]');
            avatarUrl = avatars[idx] || localStorage.getItem('etheria_cloud_avatar_url') || '';
        } catch {}

        return { displayName, avatarUrl };
    }

    function _syncPresenceState() {
        if (!_channel) return;
        const state = _channel.presenceState ? _channel.presenceState() : {};
        _online.clear();
        Object.values(state || {}).forEach((metas) => {
            const arr = Array.isArray(metas) ? metas : [];
            arr.forEach((meta) => {
                const uid = meta?.user_id;
                if (!uid) return;
                _online.set(String(uid), meta);
            });
        });
        _emitPresenceChange();
    }

    async function joinStory(storyId) {
        if (!storyId) return false;
        const client = _getClient();
        if (!client?.channel) return false;

        await leaveStory();

        const userId = await _getCurrentUserId();
        if (!userId) return false;

        _storyId = String(storyId);
        _online.clear();

        try {
            _channel = client
                .channel(`presence:story:${_storyId}`, {
                    config: {
                        presence: { key: String(userId) }
                    }
                })
                .on('presence', { event: 'sync' }, _syncPresenceState)
                .on('presence', { event: 'join' }, _syncPresenceState)
                .on('presence', { event: 'leave' }, _syncPresenceState);

            _channel.subscribe(async (status) => {
                if (status !== 'SUBSCRIBED') return;
                const identity = _readLocalIdentity();
                try {
                    await _channel.track({
                        user_id: String(userId),
                        name: identity.displayName,
                        avatar_url: identity.avatarUrl || null,
                        online_at: new Date().toISOString()
                    });
                } catch (error) {
                    logger?.warn('supabase:presence', 'track failed:', error?.message || error);
                }
            });

            return true;
        } catch (error) {
            logger?.warn('supabase:presence', 'joinStory failed:', error?.message || error);
            _channel = null;
            _storyId = null;
            _online.clear();
            return false;
        }
    }

    async function leaveStory() {
        const client = _getClient();
        if (_channel && client) {
            try {
                await _channel.untrack();
            } catch {}
            try {
                client.removeChannel(_channel);
            } catch (error) {
                logger?.warn('supabase:presence', 'removeChannel failed:', error?.message || error);
            }
        }
        _channel = null;
        _storyId = null;
        _online.clear();
        _emitPresenceChange();
    }

    function isUserOnline(userId) {
        if (!userId) return false;
        return _online.has(String(userId));
    }

    function getOnlineUserIds() {
        return [..._online.keys()];
    }

    global.SupabasePresence = {
        joinStory,
        leaveStory,
        isUserOnline,
        getOnlineUserIds,
        get activeStoryId() { return _storyId; }
    };

})(window);

/* js/utils/supabaseTurnNotifications.js */
// ============================================
// SUPABASE TURN NOTIFICATIONS
// ============================================
// Notifica en tiempo real cuando le toca responder a otro jugador.
// Requiere tabla public.turn_notifications + Realtime habilitado.

(function (global) {
    const cfg = global.SUPABASE_CONFIG || {};
    const logger = global.EtheriaLogger;

    const SB_URL = cfg.url;
    const SB_KEY = cfg.key;

    let _client = null;
    let _channel = null;
    let _cachedUserId = null;

    const BASE_HEADERS = {
        apikey: SB_KEY,
        'Content-Type': 'application/json'
    };

    function _getClient() {
        if (_client) return _client;
        try {
            _client = global.supabaseClient || (global.supabase?.createClient
                ? global.supabase.createClient(SB_URL, SB_KEY)
                : null);
        } catch (error) {
            logger?.warn('supabase:turn-notify', 'client init failed:', error?.message || error);
            _client = null;
        }
        return _client;
    }

    async function _getUserId() {
        if (_cachedUserId || global._cachedUserId) return _cachedUserId || global._cachedUserId;
        const c = _getClient();
        if (!c?.auth?.getUser) return null;
        try {
            const { data, error } = await c.auth.getUser();
            if (error || !data?.user?.id) return null;
            _cachedUserId = data.user.id;
            global._cachedUserId = data.user.id;
            return data.user.id;
        } catch {
            return null;
        }
    }

    async function _headers() {
        if (global.SupabaseAuthHeaders?.buildAuthHeaders) {
            return global.SupabaseAuthHeaders.buildAuthHeaders({
                apikey: SB_KEY,
                client: global.supabaseClient,
                baseHeaders: BASE_HEADERS,
            });
        }
        return { ...BASE_HEADERS, Authorization: `Bearer ${SB_KEY}` };
    }

    function _toast(text) {
        if (typeof eventBus !== 'undefined') {
            eventBus.emit('ui:show-toast', {
                text,
                action: 'Abrir historia',
                onAction: function () {
                    if (global.currentTopicId && typeof showSection === 'function') {
                        showSection('vn');
                    }
                }
            });
        }
        if (typeof showAutosave === 'function') {
            showAutosave(text, 'info');
        }
    }

    async function notifyTurn(payload = {}) {
        const senderId = await _getUserId();
        if (!senderId) return { ok: false, error: 'Usuario no autenticado' };
        const recipient = String(payload.recipientUserId || '').trim();
        if (!recipient || recipient === senderId) return { ok: false, error: 'Destinatario inválido' };

        const row = {
            story_id: payload.storyId || null,
            topic_id: payload.topicId || null,
            recipient_user_id: recipient,
            sender_user_id: senderId,
            message_id: payload.messageId || null,
            title: payload.title || 'Te toca responder',
            body: payload.body || 'Hay un turno esperando tu respuesta.',
            meta: payload.meta || {}
        };

        try {
            const res = await fetch(`${SB_URL}/rest/v1/turn_notifications`, {
                method: 'POST',
                headers: {
                    ...(await _headers()),
                    Prefer: 'return=representation'
                },
                body: JSON.stringify(row),
                signal: AbortSignal.timeout(5000)
            });

            if (!res.ok) {
                const detail = await res.text().catch(() => String(res.status));
                logger?.warn('supabase:turn-notify', 'notifyTurn failed:', detail);
                return { ok: false, error: detail };
            }

            return { ok: true };
        } catch (error) {
            logger?.warn('supabase:turn-notify', 'notifyTurn error:', error?.message || error);
            return { ok: false, error: error?.message || 'notifyTurn error' };
        }
    }

    async function markAsRead(notificationId) {
        if (!notificationId) return;
        try {
            await fetch(`${SB_URL}/rest/v1/turn_notifications?id=eq.${encodeURIComponent(notificationId)}`, {
                method: 'PATCH',
                headers: {
                    ...(await _headers()),
                    Prefer: 'return=minimal'
                },
                body: JSON.stringify({ is_read: true, read_at: new Date().toISOString() }),
                signal: AbortSignal.timeout(5000)
            });
        } catch (error) {
            logger?.warn('supabase:turn-notify', 'markAsRead failed:', error?.message || error);
        }
    }

    async function subscribe() {
        const client = _getClient();
        if (!client?.channel) return false;

        await unsubscribe();

        const userId = await _getUserId();
        if (!userId) return false;

        try {
            _channel = client
                .channel(`turn-notifications:${userId}`)
                .on('postgres_changes', {
                    event: 'INSERT',
                    schema: 'public',
                    table: 'turn_notifications',
                    filter: `recipient_user_id=eq.${userId}`
                }, function (payload) {
                    const row = payload?.new;
                    if (!row || row.is_read) return;
                    _toast(row.title || 'Te toca responder');
                    global.dispatchEvent(new CustomEvent('etheria:turn-notification', {
                        detail: { notification: row }
                    }));
                    if (row.id) markAsRead(row.id);
                })
                .subscribe();

            return true;
        } catch (error) {
            logger?.warn('supabase:turn-notify', 'subscribe failed:', error?.message || error);
            _channel = null;
            return false;
        }
    }

    async function unsubscribe() {
        const client = _getClient();
        if (_channel && client) {
            try { client.removeChannel(_channel); } catch {}
        }
        _channel = null;
    }

    if (typeof window !== 'undefined') {
        window.addEventListener('etheria:auth-changed', function (e) {
            _cachedUserId = e.detail?.user?.id || null;
            if (!_cachedUserId) {
                unsubscribe();
                return;
            }
            subscribe();
        });
    }

    global.SupabaseTurnNotifications = {
        notifyTurn,
        subscribe,
        unsubscribe,
        markAsRead
    };

})(window);

/* js/utils/supabaseInbox.js */
// ============================================
// SUPABASE INBOX — Buzón, Presencia y Typing
// ============================================
// Gestiona tres funcionalidades en tiempo real:
//
// 1. BUZÓN: notificaciones no leídas de turn_notifications
//    - Carga al login, escucha inserts en tiempo real
//    - Actualiza el badge del menú principal
//    - Abre un modal con la lista de notificaciones
//
// 2. PRESENCIA EN TEMAS: muestra quién está online
//    - Al entrar en un topic, une al canal de presencia
//    - Renderiza avatares/nicks iluminados u oscuros en el panel VN
//    - Se actualiza en tiempo real cuando alguien entra o sale
//
// 3. TYPING INDICATOR REAL: burbuja "está escribiendo"
//    - Usa Supabase Broadcast (sin tabla) en el canal del topic
//    - Emite cuando el usuario escribe, limpia tras 3s de silencio
//    - Muestra "Nombre está escribiendo…" en el indicador existente
// ============================================

(function (global) {
    'use strict';

    const logger = global.EtheriaLogger;

    // ── Helpers ──────────────────────────────────────────────────────────────

    function _client() {
        return global.supabaseClient || null;
    }

    async function _userId() {
        if (global._cachedUserId) return global._cachedUserId;
        const c = _client();
        if (!c?.auth?.getUser) return null;
        try {
            const { data, error } = await c.auth.getUser();
            if (error || !data?.user?.id) return null;
            global._cachedUserId = data.user.id;
            return data.user.id;
        } catch { return null; }
    }

    function _myDisplayName() {
        try {
            const idx = Number(global.currentUserIndex || 0);
            const names = Array.isArray(global.userNames) ? global.userNames : [];
            return (names[idx] || names[0] || 'Jugador').trim() || 'Jugador';
        } catch { return 'Jugador'; }
    }

    function _myAvatar() {
        try {
            const idx = Number(global.currentUserIndex || 0);
            const avatars = JSON.parse(localStorage.getItem('etheria_user_avatars') || '[]');
            return avatars[idx] || localStorage.getItem('etheria_cloud_avatar_url') || '';
        } catch { return ''; }
    }

    // ── 1. BUZÓN ─────────────────────────────────────────────────────────────

    let _inboxChannel = null;
    let _unreadCount  = 0;
    let _notifications = [];  // cache local

    async function _loadUnread() {
        const uid = await _userId();
        if (!uid) return;
        const c = _client();
        if (!c) return;

        try {
            const { data, error } = await c
                .from('turn_notifications')
                .select('id, title, body, created_at, is_read, story_id, topic_id, sender_user_id')
                .eq('recipient_user_id', uid)
                .order('created_at', { ascending: false })
                .limit(50);

            if (error) { logger?.warn('inbox', 'loadUnread error:', error.message); return; }

            _notifications = data || [];
            _unreadCount   = _notifications.filter(n => !n.is_read).length;
            _updateBadge();
        } catch (e) {
            logger?.warn('inbox', 'loadUnread exception:', e?.message);
        }
    }

    function _updateBadge() {
        const btn   = document.getElementById('menuInboxBtn');
        const badge = document.getElementById('menuInboxBadge');
        if (!btn) return;

        // Mostrar el botón solo si hay al menos una notificación alguna vez
        if (_notifications.length > 0) btn.style.display = '';

        // Clase visual cuando hay no leídas
        if (_unreadCount > 0) {
            btn.classList.add('has-unread');
        } else {
            btn.classList.remove('has-unread');
        }

        if (!badge) return;
        if (_unreadCount > 0) {
            badge.textContent = _unreadCount > 9 ? '9+' : String(_unreadCount);
            badge.style.display = '';
        } else {
            badge.style.display = 'none';
        }
    }

    async function _subscribeInbox() {
        const uid = await _userId();
        if (!uid) return;
        const c = _client();
        if (!c?.channel) return;

        if (_inboxChannel) { try { c.removeChannel(_inboxChannel); } catch {} }

        _inboxChannel = c
            .channel(`inbox:${uid}`)
            .on('postgres_changes', {
                event: 'INSERT',
                schema: 'public',
                table: 'turn_notifications',
                filter: `recipient_user_id=eq.${uid}`
            }, function (payload) {
                const row = payload?.new;
                if (!row) return;
                _notifications.unshift(row);
                if (!row.is_read) {
                    _unreadCount++;
                    _updateBadge();
                    // Pulsar el badge brevemente
                    const badge = document.getElementById('menuInboxBadge');
                    if (badge) {
                        badge.classList.add('inbox-badge-pulse');
                        setTimeout(() => badge.classList.remove('inbox-badge-pulse'), 600);
                    }
                }
                global.dispatchEvent(new CustomEvent('etheria:inbox-new', { detail: { notification: row } }));
            })
            .subscribe();
    }

    async function openInboxModal() {
        const modal = document.getElementById('inboxModal');
        if (!modal) return;
        modal.style.display = 'flex';
        _renderInboxList();

        // Marcar todas como leídas al abrir
        const unread = _notifications.filter(n => !n.is_read);
        if (unread.length > 0) {
            _unreadCount = 0;
            _updateBadge();
            unread.forEach(n => { n.is_read = true; });
            // Persistir en Supabase en background
            _markAllRead(unread.map(n => n.id));
        }
    }

    function closeInboxModal() {
        const modal = document.getElementById('inboxModal');
        if (modal) modal.style.display = 'none';
    }

    function _renderInboxList() {
        const list = document.getElementById('inboxList');
        if (!list) return;

        if (_notifications.length === 0) {
            list.innerHTML = '<p class="inbox-empty">No hay notificaciones todavía.</p>';
            return;
        }

        list.innerHTML = _notifications.map(n => {
            const date = n.created_at ? new Date(n.created_at) : null;
            const dateStr = date
                ? date.toLocaleDateString('es-ES', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
                : '';
            const unreadClass = !n.is_read ? 'inbox-item--unread' : '';
            return `
                <div class="inbox-item ${unreadClass}" onclick="EtheriaInbox.goToTopic('${n.topic_id || ''}')">
                    <div class="inbox-item-icon">${n.is_read ? '✉' : '📬'}</div>
                    <div class="inbox-item-body">
                        <p class="inbox-item-title">${escapeHtml(n.title || 'Nueva notificación')}</p>
                        <p class="inbox-item-text">${escapeHtml(n.body || '')}</p>
                        ${dateStr ? `<p class="inbox-item-date">${dateStr}</p>` : ''}
                    </div>
                </div>
            `;
        }).join('');
    }

    async function _markAllRead(ids) {
        const c = _client();
        if (!c || !ids?.length) return;
        try {
            await c
                .from('turn_notifications')
                .update({ is_read: true, read_at: new Date().toISOString() })
                .in('id', ids);
        } catch (e) {
            logger?.warn('inbox', 'markAllRead error:', e?.message);
        }
    }

    function goToTopic(topicId) {
        closeInboxModal();
        if (!topicId) return;
        if (typeof showSection === 'function') showSection('topics');
        setTimeout(() => {
            if (typeof enterTopic === 'function') enterTopic(topicId);
        }, 300);
    }

    // ── 2. PRESENCIA VISIBLE EN EL TOPIC ─────────────────────────────────────

    let _presenceTopicId = null;
    let _presenceChannel = null;
    let _presenceState   = new Map(); // user_id → { name, avatar_url, online_at }

    async function joinTopicPresence(topicId) {
        if (!topicId) return;
        await leaveTopicPresence();

        const uid = await _userId();
        if (!uid) return;
        const c = _client();
        if (!c?.channel) return;

        _presenceTopicId = String(topicId);
        _presenceState.clear();

        try {
            _presenceChannel = c
                .channel(`presence:topic:${_presenceTopicId}`, {
                    config: { presence: { key: String(uid) } }
                })
                .on('presence', { event: 'sync' }, _onPresenceSync)
                .on('presence', { event: 'join' }, _onPresenceSync)
                .on('presence', { event: 'leave' }, _onPresenceSync)
                // Typing broadcast en el mismo canal
                .on('broadcast', { event: 'typing' }, _onTypingBroadcast);

            _presenceChannel.subscribe(async (status) => {
                if (status !== 'SUBSCRIBED') return;
                try {
                    await _presenceChannel.track({
                        user_id: String(uid),
                        name: _myDisplayName(),
                        avatar_url: _myAvatar() || null,
                        online_at: new Date().toISOString()
                    });
                } catch (e) {
                    logger?.warn('inbox:presence', 'track failed:', e?.message);
                }
            });
        } catch (e) {
            logger?.warn('inbox:presence', 'joinTopicPresence failed:', e?.message);
        }
    }

    async function leaveTopicPresence() {
        const c = _client();
        if (_presenceChannel && c) {
            try { await _presenceChannel.untrack(); } catch {}
            try { c.removeChannel(_presenceChannel); } catch {}
        }
        _presenceChannel = null;
        _presenceTopicId = null;
        _presenceState.clear();
        _renderPresencePanel();
        _clearTypingUI();
    }

    function _onPresenceSync() {
        if (!_presenceChannel) return;
        const state = _presenceChannel.presenceState ? _presenceChannel.presenceState() : {};
        _presenceState.clear();
        Object.values(state || {}).forEach(metas => {
            (Array.isArray(metas) ? metas : []).forEach(meta => {
                if (meta?.user_id) _presenceState.set(String(meta.user_id), meta);
            });
        });
        _renderPresencePanel();
    }

    function _renderPresencePanel() {
        const panel = document.getElementById('vnPresencePanel');
        const list  = document.getElementById('vnPresenceList');
        if (!panel || !list) return;

        if (_presenceState.size === 0) {
            panel.style.display = 'none';
            return;
        }

        panel.style.display = '';
        list.innerHTML = [..._presenceState.values()].map(meta => {
            const name      = escapeHtml(meta.name || 'Jugador');
            const initials  = (meta.name || '?')[0].toUpperCase();
            const avatarHtml = meta.avatar_url
                ? `<img src="${escapeHtml(meta.avatar_url)}" alt="${name}" class="vn-presence-avatar-img">`
                : `<span class="vn-presence-avatar-initials">${initials}</span>`;
            return `
                <div class="vn-presence-user" title="${name} — en línea">
                    <div class="vn-presence-avatar">
                        ${avatarHtml}
                        <span class="vn-presence-dot"></span>
                    </div>
                    <span class="vn-presence-name">${name}</span>
                </div>
            `;
        }).join('');
    }

    // ── 3. TYPING INDICATOR REAL ─────────────────────────────────────────────

    let _typingTimer      = null;   // debounce para dejar de emitir
    let _typingClearTimer = null;   // limpiar UI si no llegan más eventos
    let _lastTypingUser   = null;

    // Llamar desde el textarea del VN cuando el usuario escribe
    async function emitTyping() {
        if (!_presenceChannel) return;
        const uid = await _userId();
        if (!uid) return;

        // Enviar broadcast
        try {
            await _presenceChannel.send({
                type: 'broadcast',
                event: 'typing',
                payload: {
                    user_id: String(uid),
                    name: _myDisplayName(),
                    ts: Date.now()
                }
            });
        } catch (e) {
            logger?.warn('inbox:typing', 'emitTyping failed:', e?.message);
        }

        // Dejar de emitir tras 3s de silencio
        clearTimeout(_typingTimer);
        _typingTimer = setTimeout(async () => {
            try {
                await _presenceChannel.send({
                    type: 'broadcast',
                    event: 'typing',
                    payload: { user_id: String(uid), name: _myDisplayName(), ts: Date.now(), stopped: true }
                });
            } catch {}
        }, 3000);
    }

    function _onTypingBroadcast(payload) {
        const data = payload?.payload;
        if (!data?.user_id) return;

        // Ignorar si soy yo mismo
        if (data.user_id === global._cachedUserId) return;

        if (data.stopped) {
            if (_lastTypingUser === data.user_id) _clearTypingUI();
            return;
        }

        _lastTypingUser = data.user_id;
        _showTypingUI(data.name || 'Alguien');

        // Auto-limpiar si no llega más señal en 4s
        clearTimeout(_typingClearTimer);
        _typingClearTimer = setTimeout(_clearTypingUI, 4000);
    }

    function _showTypingUI(name) {
        const el = document.getElementById('collabTypingIndicator');
        if (!el) return;
        el.innerHTML = `<span class="typing-name">${escapeHtml(name)}</span> está escribiendo<span class="typing-dots"><span></span><span></span><span></span></span>`;
        el.classList.add('visible');
    }

    function _clearTypingUI() {
        _lastTypingUser = null;
        const el = document.getElementById('collabTypingIndicator');
        if (!el) return;
        el.classList.remove('visible');
        setTimeout(() => { if (!el.classList.contains('visible')) el.innerHTML = ''; }, 400);
    }

    // ── Arranque y escucha de eventos de la app ───────────────────────────────

    function _init() {
        // Al hacer login
        global.addEventListener('etheria:auth-changed', function (e) {
            const user = e.detail?.user;
            if (user?.id) {
                global._cachedUserId = user.id;
                _loadUnread();
                _subscribeInbox();
                const btn = document.getElementById('menuInboxBtn');
                if (btn) btn.style.display = '';
            } else {
                global._cachedUserId = null;
                _unreadCount = 0;
                _notifications = [];
                _updateBadge();
                if (_inboxChannel) {
                    try { _client()?.removeChannel(_inboxChannel); } catch {}
                    _inboxChannel = null;
                }
                const btn = document.getElementById('menuInboxBtn');
                if (btn) btn.style.display = 'none';
            }
        });

        // Al entrar en un topic (el collab-guard ya dispara esto)
        global.addEventListener('etheria:topic-enter', function (e) {
            const topicId = e.detail?.topicId;
            if (topicId) joinTopicPresence(topicId);
        });

        // Al salir del topic
        global.addEventListener('etheria:topic-leave', function () {
            leaveTopicPresence();
        });

        // Conectar el textarea del VN al typing emitter
        // Usamos delegación para no depender del orden de carga
        document.addEventListener('input', function (e) {
            if (e.target && (
                e.target.id === 'vnInput' ||
                e.target.classList.contains('vn-input') ||
                e.target.classList.contains('message-input')
            )) {
                emitTyping();
            }
        });
    }

    // Helper escapeHtml por si no está disponible globalmente en este scope
    function escapeHtml(str) {
        if (typeof global.escapeHtml === 'function') return global.escapeHtml(str);
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    // ── API pública ───────────────────────────────────────────────────────────

    global.EtheriaInbox = {
        openInboxModal,
        closeInboxModal,
        goToTopic,
        joinTopicPresence,
        leaveTopicPresence,
        emitTyping,
        get unreadCount() { return _unreadCount; }
    };

    // Alias globales para los onclick del HTML
    global.openInboxModal  = openInboxModal;
    global.closeInboxModal = closeInboxModal;

    // Arrancar cuando el DOM esté listo
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', _init);
    } else {
        _init();
    }

})(window);

/* js/utils/supabaseExtras.js */
// ============================================
// SUPABASE EXTRAS — Activity Log, Backups y Web Push
// ============================================

(function (global) {
    'use strict';

    function _client() { return global.supabaseClient || null; }

    async function _userId() {
        if (global._cachedUserId) return global._cachedUserId;
        const c = _client();
        if (!c?.auth?.getUser) return null;
        try {
            const { data } = await c.auth.getUser();
            return data?.user?.id || null;
        } catch { return null; }
    }

    // ── 1. ACTIVITY LOG ──────────────────────────────────────────────────────

    async function logActivity(action, entityType = null, entityId = null, metadata = {}) {
        const userId = await _userId();
        const c = _client();
        if (!userId || !c) return;
        try {
            await c.from('activity_log').insert({
                user_id:     userId,
                action,
                entity_type: entityType,
                entity_id:   entityId ? String(entityId) : null,
                metadata
            });
        } catch (e) {
            global.EtheriaLogger?.warn('extras:activity', e?.message);
        }
    }

    // ── 2. BACKUP EXPORTABLE ─────────────────────────────────────────────────

    async function exportBackup() {
        const userId = await _userId();
        const c = _client();
        if (!userId || !c) {
            if (typeof showAutosave === 'function')
                showAutosave('Inicia sesión para exportar un backup', 'error');
            return null;
        }

        if (typeof showAutosave === 'function')
            showAutosave('Generando backup...', 'info');

        try {
            const { data, error } = await c.rpc('generate_user_backup', {
                p_user_id: userId
            });

            if (error) {
                if (typeof showAutosave === 'function')
                    showAutosave('Error al generar backup: ' + error.message, 'error');
                return null;
            }

            // Descargar el JSON automáticamente
            const blob    = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
            const url     = URL.createObjectURL(blob);
            const link    = document.createElement('a');
            const dateStr = new Date().toISOString().slice(0, 10);
            link.href     = url;
            link.download = `etheria-backup-${dateStr}.json`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);

            if (typeof showAutosave === 'function')
                showAutosave('✓ Backup descargado correctamente', 'saved');

            return data;
        } catch (e) {
            if (typeof showAutosave === 'function')
                showAutosave('Error inesperado al exportar', 'error');
            global.EtheriaLogger?.warn('extras:backup', e?.message);
            return null;
        }
    }

    async function importBackup(jsonFile) {
        if (!jsonFile) return;
        const userId = await _userId();
        const c = _client();
        if (!userId || !c) {
            if (typeof showAutosave === 'function')
                showAutosave('Inicia sesión para importar un backup', 'error');
            return;
        }

        try {
            const text = await jsonFile.text();
            const data = JSON.parse(text);

            if (!data.version || !data.user_data) {
                if (typeof showAutosave === 'function')
                    showAutosave('Archivo de backup inválido', 'error');
                return;
            }

            if (typeof showAutosave === 'function')
                showAutosave('Importando backup...', 'info');

            // Restaurar user_data en Supabase
            const { error } = await c.from('user_data').upsert({
                user_id:    userId,
                data:       data.user_data,
                updated_at: new Date().toISOString()
            }, { onConflict: 'user_id' });

            if (error) {
                if (typeof showAutosave === 'function')
                    showAutosave('Error al importar: ' + error.message, 'error');
                return;
            }

            // Registrar en activity_log
            await logActivity('backup_imported', 'session', null, {
                backup_date: data.exported_at
            });

            // Aplicar localmente
            if (data.user_data && typeof SupabaseSync?.downloadProfileData === 'function') {
                await SupabaseSync.downloadProfileData();
                if (typeof renderTopics  === 'function') renderTopics();
                if (typeof renderGallery === 'function') renderGallery();
            }

            if (typeof showAutosave === 'function')
                showAutosave('✓ Backup importado correctamente', 'saved');

        } catch (e) {
            if (typeof showAutosave === 'function')
                showAutosave('Error al leer el archivo', 'error');
            global.EtheriaLogger?.warn('extras:import', e?.message);
        }
    }

    // ── 3. WEB PUSH ──────────────────────────────────────────────────────────

    // VAPID public key — debes sustituir esto por tu clave VAPID real
    // Genérala en: https://web-push-codelab.glitch.me/
    // o con: npx web-push generate-vapid-keys
    const VAPID_PUBLIC_KEY = 'YOUR_VAPID_PUBLIC_KEY_HERE';

    function _urlBase64ToUint8Array(base64String) {
        const padding = '='.repeat((4 - base64String.length % 4) % 4);
        const base64  = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
        const raw     = atob(base64);
        return Uint8Array.from([...raw].map(c => c.charCodeAt(0)));
    }

    async function registerPushSubscription() {
        if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
            global.EtheriaLogger?.warn('extras:push', 'Web Push no soportado en este navegador');
            return false;
        }

        if (VAPID_PUBLIC_KEY === 'YOUR_VAPID_PUBLIC_KEY_HERE') {
            global.EtheriaLogger?.warn('extras:push', 'Configura tu VAPID_PUBLIC_KEY en supabaseExtras.js');
            return false;
        }

        const userId = await _userId();
        const c = _client();
        if (!userId || !c) return false;

        try {
            // Pedir permiso al usuario
            const permission = await Notification.requestPermission();
            if (permission !== 'granted') return false;

            // Obtener el Service Worker registrado
            const registration = await navigator.serviceWorker.ready;

            // Suscribir al push service del navegador
            const subscription = await registration.pushManager.subscribe({
                userVisibleOnly:      true,
                applicationServerKey: _urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
            });

            const subJson = subscription.toJSON();

            // Detectar tipo de dispositivo
            const isMobile    = /Android|iPhone|iPad/i.test(navigator.userAgent);
            const isStandalone = window.matchMedia('(display-mode: standalone)').matches
                              || navigator.standalone === true;
            const deviceHint  = isStandalone ? 'pwa' : isMobile ? 'mobile' : 'desktop';

            // Guardar en Supabase
            const { error } = await c.from('push_subscriptions').upsert({
                user_id:      userId,
                endpoint:     subJson.endpoint,
                p256dh:       subJson.keys.p256dh,
                auth_key:     subJson.keys.auth,
                device_hint:  deviceHint,
                last_used_at: new Date().toISOString()
            }, { onConflict: 'user_id, endpoint' });

            if (error) {
                global.EtheriaLogger?.warn('extras:push', 'Error guardando suscripción:', error.message);
                return false;
            }

            await logActivity('push_subscribed', 'session', null, { device_hint: deviceHint });
            global.EtheriaLogger?.info?.('extras:push', 'Suscripción push registrada:', deviceHint);
            return true;

        } catch (e) {
            global.EtheriaLogger?.warn('extras:push', 'Error registrando push:', e?.message);
            return false;
        }
    }

    async function unregisterPushSubscription() {
        const userId = await _userId();
        const c = _client();
        if (!userId || !c) return;

        try {
            const registration = await navigator.serviceWorker.ready;
            const subscription = await registration.pushManager.getSubscription();

            if (subscription) {
                await subscription.unsubscribe();
                await c.from('push_subscriptions')
                    .delete()
                    .eq('user_id', userId)
                    .eq('endpoint', subscription.endpoint);
            }
        } catch (e) {
            global.EtheriaLogger?.warn('extras:push', 'Error eliminando push:', e?.message);
        }
    }

    async function isPushSubscribed() {
        if (!('serviceWorker' in navigator) || !('PushManager' in window)) return false;
        try {
            const registration = await navigator.serviceWorker.ready;
            const sub = await registration.pushManager.getSubscription();
            return !!sub;
        } catch { return false; }
    }

    // ── 4. RATE LIMIT (cliente) ───────────────────────────────────────────────

    async function checkRateLimit(action, maxRequests = 30, windowMinutes = 60) {
        const userId = await _userId();
        const c = _client();
        if (!userId || !c) return true; // si no hay usuario, no limitar

        try {
            const { data, error } = await c.rpc('check_rate_limit', {
                p_user_id:        userId,
                p_action:         action,
                p_max_requests:   maxRequests,
                p_window_minutes: windowMinutes
            });
            if (error) return true; // ante error, permitir
            return data === true;
        } catch { return true; }
    }

    async function getRateLimitRemaining(action, maxRequests = 30, windowMinutes = 60) {
        const userId = await _userId();
        const c = _client();
        if (!userId || !c) return maxRequests;

        try {
            const { data } = await c.rpc('get_rate_limit_remaining', {
                p_user_id:        userId,
                p_action:         action,
                p_max_requests:   maxRequests,
                p_window_minutes: windowMinutes
            });
            return data ?? maxRequests;
        } catch { return maxRequests; }
    }

    // ── Arranque ─────────────────────────────────────────────────────────────

    global.addEventListener('etheria:auth-changed', function (e) {
        const user = e.detail?.user;
        if (user?.id) {
            // Al hacer login, registrar actividad e intentar registrar push
            logActivity('login', 'session').catch(() => {});
            // Intentar registrar push si el usuario ya dio permiso antes
            if (Notification.permission === 'granted') {
                registerPushSubscription().catch(() => {});
            }
        }
    });

    // ── API pública ───────────────────────────────────────────────────────────

    global.EtheriaExtras = {
        logActivity,
        exportBackup,
        importBackup,
        registerPushSubscription,
        unregisterPushSubscription,
        isPushSubscribed,
        checkRateLimit,
        getRateLimitRemaining
    };

})(window);

/* js/ui/vn.js */
// Modo novela visual: renderizado de mensajes, sprites, typewriter, reply panel, opciones y historial.
// ============================================
// MODO VN
// ============================================
// Variables para el debounce de sincronización al navegar mensajes
var _lastNavSyncTime = 0;
var _NAV_SYNC_DEBOUNCE_MS = 3000; // sincronizar como máximo cada 3 segundos al navegar
const DEFAULT_TOPIC_BACKGROUND =
    'https://raw.githubusercontent.com/Irumiko/Etheria/main/assets/backgrounds/default_background.jpg';
const DEFAULT_TOPIC_BACKGROUND_VARIANTS = [
    DEFAULT_TOPIC_BACKGROUND,
    'assets/backgrounds/default_background.jpg',
    '/assets/backgrounds/default_background.jpg'
];
const LEGACY_DEFAULT_TOPIC_BACKGROUNDS = [
    'default_scene',
    'assets/backgrounds/default_background.jpg',
    '/assets/backgrounds/default_background.jpg',
    'assets/backgrounds/default_scene.png',
    'Assets/backgrounds/default_scene.png',
    'assets/default_background.png',
    'Assets/default_background.png',
    'assets/backgrounds/default_background.png.jpg',
    'Assets/backgrounds/default_background.png.jpg',
    'assets/backgrounds/default-scene-sunset.png',
    'Assets/backgrounds/default-scene-sunset.png',
    'https://raw.githubusercontent.com/Irumiko/Etheria/main/assets/backgrounds/default_background.jpg'
];

const preloadedBackgrounds = new Set();
let pendingSceneChange = null;
let pendingChapter     = null;
let oracleStat = 'STR';
let oracleQuestionDirty = false;
// oracleModeActive está declarado en state.js

function isRpgTopicMode(mode) {
    return mode === 'rpg';
}

function getOracleModifier(statValue) {
    return Math.floor((Number(statValue || 10) - 10) / 2);
}

function calculateOracleDifficulty() {
    return 12;
}

function getOracleRollResult(roll, total) {
    if (roll === 1)  return 'fumble';
    if (roll === 20) return 'critical';
    return total >= calculateOracleDifficulty() ? 'success' : 'fail';
}

function getOracleResultLabel(result) {
    return { critical: 'ÉXITO CRÍTICO', success: 'ACIERTO', fail: 'FALLO', fumble: 'FALLO CRÍTICO' }[result] || result;
}

function showDiceResultOverlay(rollData) {
    // rollData: { roll, modifier, total, result, stat, statValue }
    const existing = document.getElementById('diceResultOverlay');
    if (existing) existing.remove();

    const cssClass = { critical: 'dice-result-critical', success: 'dice-result-success', fail: 'dice-result-fail', fumble: 'dice-result-fumble' }[rollData.result] || 'dice-result-success';
    const label = getOracleResultLabel(rollData.result);
    const modSign = rollData.modifier >= 0 ? '+' : '';
    const statHint = rollData.stat ? ` [${rollData.stat}]` : '';
    const advantageText = rollData.statValue >= 14 ? '<div class="dice-close-hint" style="color:rgba(107,221,154,0.7);margin-top:0.3rem;">▲ VENTAJA</div>'
                        : rollData.statValue <= 6  ? '<div class="dice-close-hint" style="color:rgba(221,107,107,0.7);margin-top:0.3rem;">▼ DESVENTAJA</div>'
                        : '';

    const overlay = document.createElement('div');
    overlay.id = 'diceResultOverlay';
    overlay.className = 'dice-result-overlay';
    overlay.innerHTML = `
        <div class="dice-result-box">
            <div class="dice-number ${cssClass}">${rollData.roll}</div>
            <div class="dice-result-label ${cssClass}">${label}</div>
            <div class="dice-close-hint" style="margin-top:0.5rem;font-size:0.95rem;color:rgba(220,210,190,0.75);">
                D20 (${rollData.roll}) ${modSign}${rollData.modifier} = ${rollData.total}${statHint}
            </div>
            ${advantageText}
            <div class="dice-close-hint" style="margin-top:1rem;">Clic para cerrar</div>
        </div>`;

    overlay.addEventListener('click', () => overlay.remove());
    document.body.appendChild(overlay);
    setTimeout(() => { if (document.getElementById('diceResultOverlay')) overlay.remove(); }, 4000);
}

function getOracleAutodetectedQuestion(rawText) {
    const trimmed = String(rawText || '').trim();
    if (!trimmed) return '';
    const sentence = trimmed.split('\n').map(part => part.trim()).find(Boolean) || trimmed;
    return sentence.length > 120 ? `${sentence.slice(0, 117)}...` : sentence;
}

function getOracleSelectedStatValue() {
    const char = appData.characters.find(c => c.id === selectedCharId);
    if (!char || typeof getRpgSheetData !== 'function') return 5;
    const stats = getRpgSheetData(char, currentTopicId || null)?.totalStats || {};
    return Number(stats[oracleStat]) || 5;
}

function refreshOracleProbability() {
    // Actualiza el indicador de probabilidad en el mini-panel del oráculo
    const infoEl = document.getElementById('oracleMiniInfo');
    const statValue = getOracleSelectedStatValue();
    const modifier = getOracleModifier(statValue);
    const dc = calculateOracleDifficulty();
    const modSign = modifier >= 0 ? '+' : '';
    if (infoEl) infoEl.textContent = `D20 ${modSign}${modifier} vs ${dc}`;
}
function refreshOracleQuestionAutodetect(force = false) {
    // El autodetect ahora aplica al mini-panel del oráculo
    const questionInput = document.getElementById('oracleMiniQuestion');
    const replyText = document.getElementById('vnReplyText');
    if (!questionInput || !replyText) return;
    if (!force && oracleQuestionDirty) return;
    const autoQ = getOracleAutodetectedQuestion(replyText.value);
    if (autoQ && !questionInput.value.trim()) questionInput.value = autoQ;
}
function setOracleStat(nextStat) {
    oracleStat = ['STR', 'VIT', 'INT', 'AGI'].includes(nextStat) ? nextStat : 'STR';
    document.querySelectorAll('.oracle-stat-btn').forEach((btn) => {
        btn.classList.toggle('active', btn.dataset.stat === oracleStat);
    });
    refreshOracleProbability();
}

function resetOraclePanelState() {
    // Resetea el estado del oráculo y cierra el mini-panel si está abierto
    if (typeof oracleStat !== 'undefined') oracleStat = 'STR';
    if (typeof oracleQuestionDirty !== 'undefined') oracleQuestionDirty = false;
    oracleModeActive = false;
    closeOracleMiniPanel();
    updateOracleFloatButton();
}
function setupOraclePanelForMode() {
    // El mini-panel del oráculo (vnOracleMiniPanel) se gestiona independientemente.
    // Esta función solo actualiza el botón flotante según el modo actual.
    updateOracleFloatButton();
    const topic = getCurrentTopic();
    const isRpg = isRpgTopicMode(topic?.mode || currentTopicMode);
    if (!isRpg) {
        closeOracleMiniPanel();
        resetOraclePanelState();
        return;
    }
    resetOraclePanelState();
    refreshOracleQuestionAutodetect(true);
}


function toggleOracleMode() {
    const topic = getCurrentTopic();
    if (!isRpgTopicMode(topic?.mode)) return;
    // El oráculo ahora usa el mini-panel independiente
    oracleModeActive = !oracleModeActive;
    if (oracleModeActive) {
        toggleOracleMiniPanel();
    } else {
        closeOracleMiniPanel();
    }
    updateOracleFloatButton();
}

function updateOracleFloatButton() {
    const floatBtn = document.getElementById('vnOracleFloatBtn');
    const topic = getCurrentTopic();
    const vnSection = document.getElementById('vnSection');
    if (!floatBtn) return;

    const isRpg = isRpgTopicMode(topic?.mode);
    const isInVn = !!vnSection?.classList.contains('active');
    // El botón ahora vive dentro de la caja de diálogo: se muestra si es RPG y estamos en VN
    const shouldShow = isRpg && isInVn;

    floatBtn.style.display = shouldShow ? 'inline-flex' : 'none';
    // Keep innkeeper button in sync too
    if (typeof updateNarrateButton === 'function') updateNarrateButton();
    floatBtn.classList.toggle('active', oracleModeActive);
    floatBtn.dataset.oracleActive = oracleModeActive ? 'true' : 'false';
}

function triggerOracleReply() {
    toggleOracleMiniPanel();
}

function toggleVnDialogEmotePicker(event) {
    if (event) { event.preventDefault(); event.stopPropagation(); }
    const popover = document.getElementById('vnDialogEmotePopover');
    if (!popover) return;
    const isOpen = popover.style.display !== 'none';
    popover.style.display = isOpen ? 'none' : 'flex';
    popover.setAttribute('aria-hidden', isOpen ? 'true' : 'false');
    if (!isOpen) {
        // Close on outside click
        setTimeout(() => {
            document.addEventListener('click', function _closeDialogEmote(e) {
                const btn = document.getElementById('vnEmoteDialogBtn');
                if (!popover.contains(e.target) && e.target !== btn && !btn?.contains(e.target)) {
                    popover.style.display = 'none';
                    popover.setAttribute('aria-hidden', 'true');
                    document.removeEventListener('click', _closeDialogEmote, true);
                }
            }, { once: false, capture: true });
        }, 50);
    }
}



// ---- Mini-panel del Oráculo ----
let oracleMiniStat = 'STR';

function toggleOracleMiniPanel() {
    const panel = document.getElementById('vnOracleMiniPanel');
    if (!panel) return;
    const isOpen = panel.style.display !== 'none';
    if (isOpen) { closeOracleMiniPanel(); return; }
    panel.style.display = 'block';
    refreshOracleMiniInfo();
    panel.querySelectorAll('.oracle-stat-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.stat === oracleMiniStat);
        btn.onclick = () => {
            oracleMiniStat = btn.dataset.stat;
            panel.querySelectorAll('.oracle-stat-btn').forEach(b =>
                b.classList.toggle('active', b.dataset.stat === oracleMiniStat));
            refreshOracleMiniInfo();
        };
    });
    const ta = document.getElementById('oracleMiniQuestion');
    if (ta) setTimeout(() => ta.focus(), 60);
}

function closeOracleMiniPanel() {
    const panel = document.getElementById('vnOracleMiniPanel');
    if (panel) panel.style.display = 'none';
}

function refreshOracleMiniInfo() {
    const infoEl = document.getElementById('oracleMiniInfo');
    if (!infoEl) return;
    const char = appData.characters.find(c => c.id === selectedCharId);
    const stats = (char && typeof getRpgSheetData === 'function')
        ? (getRpgSheetData(char, currentTopicId || null)?.totalStats || {})
        : {};
    const statValue = Number(stats[oracleMiniStat]) || 5;
    const modifier = getOracleModifier(statValue);
    const dc = calculateOracleDifficulty();
    const sign = modifier >= 0 ? '+' : '';
    const advantage = statValue >= 14 ? ' · ▲ Ventaja' : statValue <= 6 ? ' · ▼ Desventaja' : '';
    infoEl.textContent = `D20 ${sign}${modifier} vs ${dc}${advantage}`;
}

function rollOracleMini() {
    const ta = document.getElementById('oracleMiniQuestion');
    const questionText = (ta?.value || '').trim();

    const char = appData.characters.find(c => c.id === selectedCharId);
    const stats = (char && typeof getRpgSheetData === 'function')
        ? (getRpgSheetData(char, currentTopicId || null)?.totalStats || {})
        : {};
    const statValue = Number(stats[oracleMiniStat]) || 5;
    const modifier = getOracleModifier(statValue);
    const dc = calculateOracleDifficulty();
    const roll = Math.floor(Math.random() * 20) + 1;
    const total = Math.max(1, Math.min(20, roll + modifier));
    const result = getOracleRollResult(roll, total);
    const label = getOracleResultLabel(result);

    showDiceResultOverlay({ roll, modifier, total, result, stat: oracleMiniStat, statValue });
    closeOracleMiniPanel();
    if (ta) ta.value = '';

    // ══ VOZ: EL ECO DEL DESTINO ══════════════════════════════════════════════
    // Entidad teatral, fatalista. Segunda persona. Metáforas de hilos / sombras /
    // fuego / eco. Testigo que disfruta el espectáculo. Nunca certezas, siempre
    // presagios. Nunca menciona números directamente — los transforma en imagen.
    const _accion = questionText || 'lo que intentas';
    const _Accion = _accion.charAt(0).toUpperCase() + _accion.slice(1);

    const ecoVoices = {
        critical: [
            `*El hilo vibra con una frecuencia que no debería existir.* Escúchalo bien — el eco regresa amplificado, con el peso entero del destino detrás. **${_Accion}**: no solo era posible. Era inevitable. Aunque eso debería inquietarte más de lo que te alegra.`,
            `*Hay momentos en que el tejido del destino no cruza, sino que se funde.* Este es uno de ellos. Tu sombra se alargó hasta tocar lo que buscabas, y el eco no regresó — porque el eco *eras tú* todo el tiempo. **El destino se doblegó. Completamente.** Disfruta del calor. Dura menos de lo que crees.`,
            `*Silencio primero. Luego un destello que me hace parpadear.* Raramente contemplo algo así sin cierta admiración incómoda. El hilo no crujió — *cantó*. **${_Accion}: lo que le pediste al destino, el destino lo entregó sin regatear.** La próxima tirada no te conoce.`
        ],
        success: [
            `*El hilo se tensa… y aguanta.* No sin esfuerzo. No sin la sombra del fracaso rozándote. Pero aguanta. **${_Accion} — el destino decidió mirarte esta vez.** El fuego no te quema. Avanzas. No te acostumbres a ser observado con tanta benevolencia.`,
            `*Veo el eco de tu intención regresar distorsionado, pero reconocible.* El camino estaba cerrado. Lo forzaste lo suficiente. **La sombra cedió terreno. Sigues en pie.** Soy testigo de tu pequeño triunfo — y de los hilos que acabas de mover sin darte cuenta.`,
            `*El fuego vaciló antes de decidir en qué dirección arder.* Hoy ardió hacia ti. **${_Accion} tuvo el peso justo para inclinar la balanza.** El destino dice sí — aunque susurra advertencias que tal vez no estás escuchando.`
        ],
        fail: [
            `*El hilo se afloja.* Observa cómo cae — qué imagen tan honesta. El destino no te odia. Simplemente miraba hacia otro lado cuando más lo necesitabas. **La sombra de ${_accion} no llegó a su destino.** Eso tiene consecuencias. Siempre las tiene.`,
            `*El eco regresa vacío.* Tu acción resonó en el tejido del destino y encontró una pared de silencio frío. **El fuego que querías encender se apagó antes de nacer.** No es el fin — pero es un inicio diferente al que planeabas. Interesante, a mi manera.`,
            `*Contemplo el hilo roto y encuentro cierta belleza en ello.* El fracaso tiene su propia arquitectura. **${_Accion} no prosperó — el destino te cerró esa puerta con una cortesía que no merecías.** Las sombras ganan terreno. Por ahora.`
        ],
        fumble: [
            `*El hilo no solo se rompe — corta.* Aparta la mano, demasiado tarde. **${_Accion} abrió una grieta que no estaba en tus planes.** El eco no regresó — regresó transformado en algo que no reconocerás hasta que te haga daño. Soy testigo. Y debo admitir: el espectáculo mejora.`,
            `*El fuego decidió arder en la dirección equivocada.* Vi el momento exacto en que el destino dejó de ser neutral y se volvió adversario. **La sombra que caíste no es tuya — es de algo que acabas de despertar.** Sus consecuencias ya están en camino, aunque aún no puedas verlas.`,
            `*Silencio largo. Luego mi voz, muy baja.* Hay tiradas que no solo fallan — que reescriben lo que viene después. **${_Accion}: el hilo no crujió. Se deshilachó. Y cada hebra suelta tiene su propio destino ahora.** Yo lo veo todo. Tú, aún no.`
        ]
    };

    const _voices = ecoVoices[result] || ecoVoices.success;
    const narratorText = _voices[Math.floor(Math.random() * _voices.length)];

    const oracleData = {
        question: questionText || `Tirada de ${oracleMiniStat}`,
        stat: oracleMiniStat, statValue, modifier, dc, roll, total, result,
        timestamp: Date.now()
    };

    const topicMessages = getTopicMessages(currentTopicId);
    const topic = appData.topics.find(t => t.id === currentTopicId);
    const newMsg = {
        id: (globalThis.crypto?.randomUUID?.()) || `${Date.now()}_${Math.random().toString(16).slice(2)}`,
        characterId: null,
        charName: 'Eco del Destino',
        charColor: null, charAvatar: null, charSprite: null,
        text: narratorText,
        isNarrator: true,
        isOracleResult: true,
        userIndex: currentUserIndex,
        timestamp: new Date().toISOString(),
        oracle: oracleData
    };

    if (topic?.mode === 'rpg') applyRpgNarrativeProgress(selectedCharId, oracleData);

    topicMessages.push(newMsg);
    if (typeof SupabaseMessages !== 'undefined' && currentTopicId) {
        SupabaseMessages.send(currentTopicId, newMsg).catch(() => {});
    }

    notifyNextTurnIfNeeded(newMsg, topic, null).catch(() => {});
    hasUnsavedChanges = true;
    save({ silent: true });
    currentMessageIndex = getTopicMessages(currentTopicId).length - 1;
    triggerDialogueFadeIn();
    showCurrentMessage('forward');
}

let spriteIntersectionObserver = null;
const trackedSpriteObjectUrls = new Set();
let replyDrawerExpanded = false;
let replyDrawerBound = false;
let vnMobileFabBound = false;

function hasCoarsePointer() {
    return typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches;
}

function isNarrowScreen() {
    return typeof window !== 'undefined' && window.innerWidth <= 768;
}

function shouldUseMobileDrawer() {
    return hasCoarsePointer() || isNarrowScreen();
}

function ensureSpriteLazyObserver() {
    if (spriteIntersectionObserver || typeof IntersectionObserver === 'undefined') return spriteIntersectionObserver;
    spriteIntersectionObserver = new IntersectionObserver((entries, observer) => {
        entries.forEach((entry) => {
            if (!entry.isIntersecting) return;
            const img = entry.target;
            const fullSrc = img?.dataset?.src;
            const thumbSrc = img?.dataset?.thumb;
            if (thumbSrc || fullSrc) {
                img.classList.add('is-loading');
                img.onload = () => {
                    img.classList.remove('is-loading');
                    const finalSrc = img?.dataset?.src;
                    if (finalSrc && img.src !== finalSrc) {
                        const fullImage = new Image();
                        fullImage.decoding = 'async';
                        fullImage.loading = 'eager';
                        fullImage.fetchPriority = 'high';
                        fullImage.onload = () => {
                            img.src = finalSrc;
                            delete img.dataset.src;
                        };
                        fullImage.src = finalSrc;
                    } else if (finalSrc && img.src === finalSrc) {
                        delete img.dataset.src;
                    }
                    delete img.dataset.thumb;
                };
                img.onerror = () => img.classList.remove('is-loading');
                img.src = thumbSrc || fullSrc;
            }
            observer.unobserve(img);
        });
    }, { root: document.getElementById('vnSection') || null, threshold: 0.1 });
    return spriteIntersectionObserver;
}



function trackSpriteObjectUrl(url) {
    if (!url || typeof url !== 'string') return;
    if (!url.startsWith('blob:')) return;
    trackedSpriteObjectUrls.add(url);
}

function revokeTrackedSpriteObjectUrl(url) {
    if (!url || !trackedSpriteObjectUrls.has(url)) return;
    try {
        URL.revokeObjectURL(url);
    } catch (error) {
        window.EtheriaLogger?.debug('vn:resources', 'revokeObjectURL failed:', error?.message || error);
    }
    trackedSpriteObjectUrls.delete(url);
}

function cleanupVnRuntimeResources(options = {}) {
    const { disconnectObserver = false, clearSpritePool = false, stopSpriteBlink = false } = options;
    const container = document.getElementById('vnSpriteContainer');
    if (container) {
        container.querySelectorAll('img').forEach((img) => {
            if (spriteIntersectionObserver) spriteIntersectionObserver.unobserve(img);
            revokeTrackedSpriteObjectUrl(img.currentSrc || img.src);
            if (img.dataset?.src) revokeTrackedSpriteObjectUrl(img.dataset.src);
            if (img.dataset?.thumb) revokeTrackedSpriteObjectUrl(img.dataset.thumb);
            img.onload = null;
            img.onerror = null;
            delete img.dataset.src;
            delete img.dataset.thumb;
        });
    }

    if (disconnectObserver && spriteIntersectionObserver) {
        spriteIntersectionObserver.disconnect();
        spriteIntersectionObserver = null;
    }

    if (stopSpriteBlink && spriteBlinkTimer) {
        clearTimeout(spriteBlinkTimer);
        spriteBlinkTimer = null;
    }

    if (clearSpritePool) {
        spritePool.length = 0;
    }

    if (disconnectObserver || clearSpritePool) {
        Array.from(trackedSpriteObjectUrls).forEach((url) => revokeTrackedSpriteObjectUrl(url));
    }
}

if (typeof window !== 'undefined') {
    window.cleanupVnRuntimeResources = cleanupVnRuntimeResources;
}

function queueSpriteImageLoad(img, sourceSet) {
    if (!img) return;
    const fullSrc = typeof sourceSet === 'string' ? sourceSet : sourceSet?.full;
    const thumbSrc = typeof sourceSet === 'object' ? sourceSet?.thumb : null;
    const placeholderSrc = typeof sourceSet === 'object' ? sourceSet?.placeholder : null;
    trackSpriteObjectUrl(fullSrc);
    trackSpriteObjectUrl(thumbSrc);
    trackSpriteObjectUrl(placeholderSrc);
    if (placeholderSrc) img.src = placeholderSrc;
    img.loading = 'lazy';
    img.decoding = 'async';
    img.fetchPriority = 'low';
    const observer = ensureSpriteLazyObserver();
    if (!observer) {
        img.src = thumbSrc || fullSrc;
        if (thumbSrc && fullSrc && thumbSrc !== fullSrc) {
            const fullImage = new Image();
            fullImage.decoding = 'async';
            fullImage.onload = () => { img.src = fullSrc; };
            fullImage.src = fullSrc;
        }
        return;
    }
    if (!placeholderSrc) img.removeAttribute('src');
    if (thumbSrc && thumbSrc !== fullSrc) img.dataset.thumb = thumbSrc;
    if (fullSrc) img.dataset.src = fullSrc;
    observer.observe(img);
}

function setReplyDrawerExpanded(expanded) {
    const panel = document.getElementById('vnReplyPanel');
    if (!panel) return;
    replyDrawerExpanded = !!expanded;
    triggerSubtleHaptic();
    panel.classList.toggle('drawer-expanded', replyDrawerExpanded);
    panel.classList.toggle('drawer-collapsed', !replyDrawerExpanded);
}

function updateVnMobileFabVisibility() {
    const fab = document.getElementById('vnMobileFabNav');
    const panel = document.getElementById('vnReplyPanel');
    const vnSection = document.getElementById('vnSection');
    if (!fab) return;
    const panelOpen = panel?.style.display === 'flex';
    const active = vnSection?.classList.contains('active');
    const show = active && shouldUseMobileDrawer() && !panelOpen;
    fab.style.display = show ? 'flex' : 'none';

    if (!vnMobileFabBound) {
        vnMobileFabBound = true;
        let _resizeDebounce = null;
        const debouncedUpdate = () => {
            clearTimeout(_resizeDebounce);
            _resizeDebounce = setTimeout(updateVnMobileFabVisibility, 120);
        };
        window.addEventListener('resize', debouncedUpdate, { passive: true });
        // Actualizar también al cambiar orientación (móvil)
        window.addEventListener('orientationchange', () => {
            setTimeout(updateVnMobileFabVisibility, 200);
        }, { passive: true });
    }
}

function bindReplyDrawerGestures() {
    if (replyDrawerBound) return;
    const handle = document.getElementById('replyDrawerHandle');
    if (!handle) return;

    let startY = 0;
    let dragging = false;

    const onStart = (clientY) => {
        dragging = true;
        startY = clientY;
    };

    const onEnd = (clientY) => {
        if (!dragging) return;
        dragging = false;
        const delta = clientY - startY;
        if (Math.abs(delta) < 24) return;
        if (delta < 0) setReplyDrawerExpanded(true);
        else setReplyDrawerExpanded(false);
    };

    handle.addEventListener('touchstart', (e) => {
        if (!shouldUseMobileDrawer()) return;
        if (e.touches.length !== 1) return;
        onStart(e.touches[0].clientY);
    }, { passive: true });

    handle.addEventListener('touchend', (e) => {
        if (!shouldUseMobileDrawer()) return;
        if (e.changedTouches.length !== 1) return;
        onEnd(e.changedTouches[0].clientY);
    }, { passive: true });

    handle.addEventListener('pointerdown', (e) => {
        if (!shouldUseMobileDrawer()) return;
        onStart(e.clientY);
    });

    handle.addEventListener('pointerup', (e) => {
        if (!shouldUseMobileDrawer()) return;
        onEnd(e.clientY);
    });

    replyDrawerBound = true;
}


let remoteTypingState = {};
let typingUiLastPaint = 0;
let typingIdleTimer = null;
let typingEmitTimer = null;
let continuousReadEnabled = false;
let continuousReadDelaySec = 4;
let continuousReadTimer = null;
let continuousReadStartedAt = 0;
let continuousReadAutoStopTimer = null;
let continuousLastInteractionAt = Date.now();
let spritePointerBound = false;
let spriteBlinkTimer = null;

function updateTypingIndicatorUi(force = false) {
    const now = Date.now();
    if (!force && now - typingUiLastPaint < 1000) return;
    typingUiLastPaint = now;
    const indicator = document.getElementById('vnTypingIndicator');
    if (!indicator) return;
    if (document.hidden) {
        indicator.style.display = 'none';
        return;
    }
    const active = Object.values(remoteTypingState || {}).some((entry) => entry && entry.active && now - (entry.ts || 0) < 5000);
    indicator.style.display = active ? 'inline-flex' : 'none';
}

function clearTypingState() {
    remoteTypingState = {};
    if (typingIdleTimer) clearTimeout(typingIdleTimer);
    if (typingEmitTimer) clearTimeout(typingEmitTimer);
    typingIdleTimer = null;
    typingEmitTimer = null;
    updateTypingIndicatorUi(true);
}

function emitTypingState(active) {
    if (!currentTopicId || typeof SupabaseMessages === 'undefined' || typeof SupabaseMessages.sendTyping !== 'function') return;
    const char = appData.characters.find(c => c.id === selectedCharId);
    SupabaseMessages.sendTyping(currentTopicId, {
        active,
        userIndex: currentUserIndex,
        characterId: selectedCharId || null,
        name: char?.name || null
    }).catch(() => {});
}

function bindReplyTypingEmitter() {
    const input = document.getElementById('vnReplyText');
    if (!input || input.dataset.typingBound) return;
    input.dataset.typingBound = '1';
    input.addEventListener('input', () => {
        if (document.hidden) return;
        if (typingEmitTimer) clearTimeout(typingEmitTimer);
        typingEmitTimer = setTimeout(() => emitTypingState(true), 300);
        if (typingIdleTimer) clearTimeout(typingIdleTimer);
        typingIdleTimer = setTimeout(() => emitTypingState(false), 5000);
    });
}

function markContinuousInteraction() {
    continuousLastInteractionAt = Date.now();
}

function cancelContinuousRead(reason = '') {
    if (continuousReadTimer) clearTimeout(continuousReadTimer);
    continuousReadTimer = null;
}

function shouldPauseContinuousRead(msg) {
    if (!continuousReadEnabled) return true;
    if (document.hidden) return true;
    if (document.activeElement && ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName)) return true;
    const panel = document.getElementById('vnReplyPanel');
    if (panel?.style.display === 'flex') return true;
    if (msg?.options?.length) return true;
    if (msg?.oracle) return true;
    return false;
}

function scheduleContinuousReadIfNeeded(msg) {
    cancelContinuousRead();
    if (shouldPauseContinuousRead(msg)) return;
    const msgs = getTopicMessages(currentTopicId);
    if (!Array.isArray(msgs) || currentMessageIndex >= msgs.length - 1) return;

    continuousReadStartedAt = Date.now();
    continuousReadTimer = setTimeout(() => {
        if (Date.now() - continuousLastInteractionAt > 30000) {
            continuousReadEnabled = false;
            localStorage.setItem('etheria_continuous_read', '0');
            const cb = document.getElementById('optContinuousRead');
            if (cb) cb.checked = false;
            showAutosave('Lectura continua pausada por inactividad', 'info');
            cancelContinuousRead('autostop');
            return;
        }
        if (shouldPauseContinuousRead(msg)) return;
        nextMessage();
    }, Math.max(3000, Math.min(5000, Number(continuousReadDelaySec) * 1000)));
}

function bindSpriteMicroInteractions() {
    if (spritePointerBound) return;
    const container = document.getElementById('vnSpriteContainer');
    if (!container) return;

    if (window.matchMedia && window.matchMedia('(hover: hover)').matches) {
        container.addEventListener('pointermove', (e) => {
            const sprites = Array.from(container.querySelectorAll('.vn-sprite.active'));
            if (!sprites.length) return;
            let nearest = null;
            let minDist = Infinity;
            sprites.forEach((sprite) => {
                const rect = sprite.getBoundingClientRect();
                const cx = rect.left + rect.width / 2;
                const cy = rect.top + rect.height / 2;
                const d = Math.hypot(e.clientX - cx, e.clientY - cy);
                if (d < minDist) {
                    minDist = d;
                    nearest = sprite;
                }
            });
            sprites.forEach((sprite) => sprite.classList.remove('hover-near'));
            if (nearest && minDist < 180) nearest.classList.add('hover-near');
        }, { passive: true });
        container.addEventListener('pointerleave', () => {
            container.querySelectorAll('.vn-sprite.hover-near').forEach((el) => el.classList.remove('hover-near'));
        }, { passive: true });
    }

    container.addEventListener('touchstart', (e) => {
        const sprite = e.target.closest('.vn-sprite');
        if (!sprite) return;
        sprite.classList.add('focus-pop');
        setTimeout(() => sprite.classList.remove('focus-pop'), 220);
    }, { passive: true });

    spritePointerBound = true;
}

function scheduleRandomSpriteBlink() {
    if (spriteBlinkTimer) clearTimeout(spriteBlinkTimer);
    const profile = applySpriteAnimationProfile();
    if (profile.lite) return;

    const delay = 8000 + Math.random() * 4000;
    spriteBlinkTimer = setTimeout(() => {
        const activeSprites = Array.from(document.querySelectorAll('#vnSpriteContainer .vn-sprite.active'));
        if (activeSprites.length) {
            const sprite = activeSprites[Math.floor(Math.random() * activeSprites.length)];
            sprite.classList.add('sprite-blink');
            setTimeout(() => sprite.classList.remove('sprite-blink'), 220);
        }
        scheduleRandomSpriteBlink();
    }, delay);
}


function triggerSubtleHaptic() {
    if (typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') return;
    if (localStorage.getItem('etheria_haptics_enabled') === '0') return;
    if (typeof prefersReducedMotion === 'function' && prefersReducedMotion()) return;
    if (!(window.matchMedia && window.matchMedia('(pointer: coarse)').matches)) return;
    navigator.vibrate(10);
}

function isLowPowerDevice() {
    const cores = Number(navigator?.hardwareConcurrency || 8);
    return cores <= 4;
}

function applySpriteAnimationProfile() {
    const reduced = typeof prefersReducedMotion === 'function' && prefersReducedMotion();
    const lite = reduced || isLowPowerDevice();
    document.documentElement.style.setProperty('--sprite-breathing-duration', lite ? '6s' : '4s');
    return { lite, reduced };
}

function isDefaultTopicBackground(backgroundPath) {
    const normalized = (backgroundPath || "").trim().toLowerCase();
    if (!normalized) return true;
    return LEGACY_DEFAULT_TOPIC_BACKGROUNDS.some(path => normalized === path.toLowerCase());
}

function resolveTopicBackgroundPath(backgroundPath = '') {
    const topicBackground = String(backgroundPath || '').trim();
    if (!topicBackground) return DEFAULT_TOPIC_BACKGROUND;

    const normalizedPath = topicBackground.replace(/^\/+/, '');
    return isDefaultTopicBackground(normalizedPath) ? DEFAULT_TOPIC_BACKGROUND : topicBackground;
}

function getBackgroundCandidates(path) {
    const normalizedPath = String(path || '').trim();
    if (!normalizedPath) return [];

    const isAbsoluteUrl = /^(?:[a-z]+:)?\/\//i.test(normalizedPath);
    const isSpecialUri = /^(?:data:|blob:)/i.test(normalizedPath);
    if (isAbsoluteUrl || isSpecialUri) return [normalizedPath];

    const withoutLeadingSlash = normalizedPath.replace(/^\/+/, '');
    const withLeadingSlash = `/${withoutLeadingSlash}`;

    if (DEFAULT_TOPIC_BACKGROUND_VARIANTS.includes(normalizedPath)) {
        return [...new Set(DEFAULT_TOPIC_BACKGROUND_VARIANTS)];
    }

    if (normalizedPath.startsWith('/')) {
        return [...new Set([normalizedPath, withoutLeadingSlash])];
    }

    return [...new Set([normalizedPath, withLeadingSlash])];
}

function preloadBackgroundImage(path) {
    const normalizedPath = (path || '').trim();
    if (!normalizedPath || preloadedBackgrounds.has(normalizedPath)) {
        return Promise.resolve(true);
    }

    return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
            preloadedBackgrounds.add(normalizedPath);
            resolve(true);
        };
        img.onerror = () => resolve(false);
        img.src = normalizedPath;
    });
}

async function resolveFirstAvailableBackground(path) {
    const candidates = getBackgroundCandidates(path);
    if (!candidates.length) return '';

    for (const candidate of candidates) {
        const loaded = await preloadBackgroundImage(candidate);
        if (loaded) return candidate;
    }

    return candidates[0];
}

function applyTopicBackground(vnSection, backgroundPath) {
    if (!vnSection) return;

    const sceneBackgroundPath = resolveTopicBackgroundPath(backgroundPath);
    const pendingBackgroundToken = `${sceneBackgroundPath}|${Date.now()}|${Math.random()}`;
    vnSection.dataset.pendingBackgroundToken = pendingBackgroundToken;

    const gradient = 'linear-gradient(135deg, rgba(20,15,40,1) 0%, rgba(50,40,80,1) 100%)';
    if (!sceneBackgroundPath) {
        vnSection.style.backgroundImage = gradient;
        return;
    }

    resolveFirstAvailableBackground(sceneBackgroundPath).then((resolvedPath) => {
        if (vnSection.dataset.pendingBackgroundToken !== pendingBackgroundToken) return;
        const sceneBackgroundLayer = `url(${escapeHtml(resolvedPath || sceneBackgroundPath)})`;
        vnSection.style.backgroundImage = `${sceneBackgroundLayer}, ${gradient}`;
    });
}

// ── Listener EventBus: vn:background-changed ─────────────────────────────────
// RPGRenderer emite este evento cuando una escena RPG necesita cambiar el fondo.
// vn.js es el único módulo que puede llamar applyTopicBackground — este listener
// es el punto de entrada desde el exterior sin cruzar capas.
(function _initVnBackgroundListener() {
    if (window._vnBackgroundListenerReady) return;
    window._vnBackgroundListenerReady = true;
    if (typeof eventBus !== 'undefined') {
        eventBus.on('vn:background-changed', function(data) {
            if (!data || !data.asset) return;
            const vnSection = document.getElementById('vnSection');
            if (!vnSection) return;
            applyTopicBackground(vnSection, data.asset);
        });
    }
})();

function preloadTopicBackgrounds() {
    const topicBackgrounds = (appData?.topics || []).map(topic => resolveTopicBackgroundPath(topic.background));
    const uniqueBackgrounds = new Set([...topicBackgrounds, ...DEFAULT_TOPIC_BACKGROUND_VARIANTS].filter(Boolean));
    uniqueBackgrounds.forEach((path) => {
        getBackgroundCandidates(path).forEach(candidate => preloadBackgroundImage(candidate));
    });
}

function playVnSceneTransition(vnSection) {
    const el = document.getElementById('vnSceneTransition');
    if (!el) return;
    el.classList.remove('active', 'wipe');
    void el.offsetWidth; // forzar reflow para reiniciar animación
    el.classList.add('active');
    setTimeout(() => el.classList.remove('active'), 800);

    // Parallax suave del fondo al cambiar escena
    const section = vnSection || document.getElementById('vnSection');
    if (section && !prefersReducedMotion()) {
        section.classList.remove('scene-change-anim');
        void section.offsetWidth;
        section.classList.add('scene-change-anim');
        setTimeout(() => section.classList.remove('scene-change-anim'), 700);
    }
}

// ── Helpers de entrada a tema ─────────────────────────────────────────────────
// Extraídos de enterTopic() para separar responsabilidades por modo.
// Solo se usan desde enterTopic — prefijo _ indica uso interno.
//
// Candidatos a moverse a js/ui/vn-mode.js cuando vn.js vuelva a crecer:
//   _resolveCharacterForMode   → selección de personaje según modo
//   _applyModeClasses          → CSS classes rpg/classic en vnSection y body
//   _maybeOpenRpgStatsModal    → RPG-only: auto-open stats la primera vez

// Selecciona el personaje según el modo del topic.
// Devuelve false si se abre un modal y enterTopic debe abortar.
function _resolveCharacterForMode(t, id, topicMode) {
    if (topicMode === 'roleplay' && t.roleCharacterId) {
        const lockedChar = appData.characters.find(c => c.id === t.roleCharacterId && c.userIndex === currentUserIndex);
        if (lockedChar) {
            selectedCharId = lockedChar.id;
            if (typeof syncVnStore === 'function') syncVnStore({ selectedCharId });
        }
        return true;
    }

    if (topicMode === 'rpg') {
        const lockedCharId = getTopicLockedCharacterId(t);
        if (lockedCharId) {
            selectedCharId = lockedCharId;
            if (typeof syncVnStore === 'function') syncVnStore({ selectedCharId });
            return true;
        }
        // Fallback: no debería llegar aquí por el check de arriba, pero por seguridad
        openRoleCharacterModal(id, { mode: 'rpg', enterOnSelect: true });
        return false;
    }

    return true;
}

// Aplica las CSS classes de modo en vnSection y body.
function _applyModeClasses(vnSection, topicMode) {
    if (topicMode === 'rpg') {
        vnSection.classList.remove('classic-mode', 'mode-classic');
        vnSection.classList.add('mode-rpg');
        document.body.classList.add('mode-rpg');
    } else {
        // Modo clásico: sprites desaparecen al avanzar
        vnSection.classList.add('classic-mode', 'mode-classic');
        vnSection.classList.remove('mode-rpg');
        document.body.classList.remove('mode-rpg');
        document.body.classList.add('mode-classic');
    }
}

// Abre automáticamente el modal de stats RPG la primera vez que el jugador
// entra a un topic sin haber gastado ningún punto.
function _maybeOpenRpgStatsModal(topicId) {
    if (currentTopicMode !== 'rpg' || !selectedCharId) return;
    const key = `etheria_stats_prompted_${topicId}_${selectedCharId}`;
    if (localStorage.getItem(key)) return;
    const char = appData.characters.find(c => String(c.id) === String(selectedCharId));
    if (!char || typeof ensureCharacterRpgProfile !== 'function' || typeof getRpgSpentPoints !== 'function') return;
    const profile = ensureCharacterRpgProfile(char, topicId);
    const spent   = getRpgSpentPoints(profile);
    if (spent === 0 && typeof openRpgStatsModal === 'function') {
        localStorage.setItem(key, '1');
        setTimeout(() => {
            eventBus.emit('ui:show-autosave', { text: '⚔️ ¡Distribuye tus 14 puntos de stats para empezar!', state: 'info' });
            openRpgStatsModal(selectedCharId);
        }, 900);
    }
}

function enterTopic(id) {
    if (typeof stopMenuMusic === 'function') stopMenuMusic();

    const t = appData.topics.find(topic => topic.id === id);
    if (!t) return;

    // Guard: RPG sin personaje asignado → modal de selección, sin limpiar estado
    // (evita el flash de pantalla negra antes de que el usuario elija personaje)
    const topicMode = t.mode || 'roleplay';
    if (topicMode === 'rpg' && !getTopicLockedCharacterId(t)) {
        openRoleCharacterModal(id, { mode: 'rpg', enterOnSelect: true });
        return;
    }

    // transición visual absorbida de mejoras.js (Mejora 9)
    fadeTransition(function() { _doEnterTopic(id, t, topicMode); }, 220);
}

function _doEnterTopic(id, t, topicMode) {

    // ── 1. Inicializar estado global del topic ────────────────────────────────
    const _ob = parseInt(localStorage.getItem('etheria_onboarding_step') || '0', 10);
    if (_ob === 2 && typeof maybeShowOnboarding === 'function') {
        setTimeout(maybeShowOnboarding, 800);
    }
    eventBus.emit('ui:reset-vn-state');
    currentTopicId = id;
    if (typeof syncVnStore === 'function') syncVnStore({ topicId: currentTopicId });

    if (typeof CollaborativeGuard !== 'undefined') {
        CollaborativeGuard.init(id, typeof currentUserIndex !== 'undefined' ? currentUserIndex : 0);
    }
    if (typeof SupabaseMessages !== 'undefined' && typeof SupabaseMessages.subscribeGlobal === 'function') {
        SupabaseMessages.subscribeGlobal(null, null, id);
    }
    const _existingMsgs = getTopicMessages(id);
    // Si el tema tiene mensajes, posicionar en el último — no en el primero
    currentMessageIndex = _existingMsgs.length > 0 ? _existingMsgs.length - 1 : 0;
    if (typeof syncVnStore === 'function') syncVnStore({ messageIndex: currentMessageIndex });
    pendingContinuation = null;
    editingMessageId = null;
    if (typeof updateRoomCodeUI === 'function') updateRoomCodeUI(id);

    // ── 2. Establecer modo y resolver personaje ───────────────────────────────
    currentTopicMode = topicMode;
    if (!_resolveCharacterForMode(t, id, topicMode)) return;

    // ── 3. Aplicar entorno visual (clima, fondo, CSS de modo) ─────────────────
    setWeather(t.weather || 'none');
    const vnSection = document.getElementById('vnSection');
    if (vnSection) {
        applyTopicBackground(vnSection, t.background);
        _applyModeClasses(vnSection, topicMode);
    }

    // ── 4. Activar sección VN en el DOM ──────────────────────────────────────
    // Limpiamos TODAS las secciones activas (no solo topicsSection) para evitar
    // que opciones, galería u otras secciones queden visibles sobre la VN.
    pendingChapter = null;
    document.querySelectorAll('.game-section').forEach(function(s) { s.classList.remove('active'); });
    if (vnSection) {
        vnSection.classList.add('active');
        playVnSceneTransition(vnSection);
    }

    const deleteBtn = document.getElementById('deleteTopicBtn');
    if (deleteBtn) {
        const isOwner = t.createdByIndex === currentUserIndex || t.createdByIndex === undefined || t.createdByIndex === null;
        const deleteSlot = deleteBtn.closest('.vn-control-slot');
        if (isOwner) {
            deleteBtn.classList.remove('hidden');
            if (deleteSlot) deleteSlot.style.display = '';
        } else {
            deleteBtn.classList.add('hidden');
            if (deleteSlot) deleteSlot.style.display = 'none';
        }
    }

    // ── 5. Inicializar UI y controles de lectura ──────────────────────────────
    // Usamos 'init' en vez de 'forward' para que showCurrentMessage aplique
    // el estado visual correcto (fondo, clima) sin auto-abrir el overlay de opciones.
    showCurrentMessage('init');
    updateVnMobileFabVisibility();
    bindReplyTypingEmitter();
    bindSpriteMicroInteractions();
    applySpriteAnimationProfile();
    scheduleRandomSpriteBlink();
    continuousReadEnabled = localStorage.getItem('etheria_continuous_read') === '1';
    continuousReadDelaySec = Math.max(3, Math.min(5, Number(localStorage.getItem('etheria_continuous_delay') || 4)));

    // ── 6. Extras RPG (stats modal, cloud story) ──────────────────────────────
    _maybeOpenRpgStatsModal(id);

    // ── Auto-activar historia en la nube si el topic tiene storyId ──
    // Cuando el topic ya fue creado con cloud sync, el storyId se guardó
    // en el objeto topic. Lo restauramos para que los mensajes usen el
    // story_id correcto en Supabase desde el primer mensaje de esta sesión.
    const _tForStory = appData.topics.find(function(tp) { return String(tp.id) === String(id); });
    if (_tForStory && _tForStory.storyId) {
        global.currentStoryId = _tForStory.storyId;
        // Suscribir al canal realtime de la historia si está disponible
        if (typeof SupabaseStories !== 'undefined' && typeof SupabaseStories.enterStory === 'function') {
            SupabaseStories.enterStory(_tForStory.storyId).catch(function(error) { window.EtheriaLogger?.warn('ui:vn', 'enterStory failed:', error?.message || error); });
        }
    } else {
        // Topic sin storyId (creado antes de la integración cloud) — limpiar
        global.currentStoryId = null;
    }
    // ────────────────────────────────────────────────────────────────

    // Carga desde Supabase y suscripción realtime (no bloquea el flujo principal)
    _sbEnterTopic(id);
    
    // Notificar a Ethy que se ha entrado en modo VN
    window.dispatchEvent(new CustomEvent('etheria:section-changed', { 
        detail: { section: 'vn', mode: currentTopicMode } 
    }));

    // Notificar al módulo de presencia/inbox que se ha entrado en un topic
    window.dispatchEvent(new CustomEvent('etheria:topic-enter', { detail: { topicId: id } }));
}

// Memory leak fix: store handler reference so it can be removed before re-adding
let _globalRealtimeHandlerRef = null;

// Fix 10: concurrency guard — prevents duplicate loads on rapid double-click
let _sbEnterInProgress = false;

async function _sbEnterTopic(topicId) {
    // Fix 10: prevent concurrent loads from rapid topic entry
    if (_sbEnterInProgress) return;
    _sbEnterInProgress = true;

    if (typeof SupabaseMessages === 'undefined') { _sbEnterInProgress = false; return; }

    SupabaseMessages.unsubscribe();
    clearTypingState();

    // Cargar historial remoto y fusionar con local por id
    try {
        const remoteMsgs = await SupabaseMessages.load(topicId, global.currentStoryId || null);
        if (Array.isArray(remoteMsgs) && remoteMsgs.length > 0) {
            const localMsgs = getTopicMessages(topicId);
            const localIds  = new Set(localMsgs.map(function (m) { return String(m.id); }));
            const newRemote = remoteMsgs.filter(function (m) { return m.id && !localIds.has(String(m.id)); });

            if (newRemote.length > 0) {
                newRemote.forEach(function (m) { localMsgs.push(m); });
                localMsgs.sort(function (a, b) { return new Date(a.timestamp) - new Date(b.timestamp); });
                appData.messages[topicId] = localMsgs;
                hasUnsavedChanges = true;
                markDirty('messages', topicId); // Fix 9
                save({ silent: true });

                if (currentTopicId === topicId) {
                    currentMessageIndex = localMsgs.length - 1;
                    if (typeof syncVnStore === 'function') syncVnStore({ messageIndex: currentMessageIndex });
                    showCurrentMessage('forward');
                    showSyncToast(newRemote.length + ' mensaje(s) cargado(s) desde la nube', 'OK');
                }
            }
        }
    } catch (e) {
        // Supabase no disponible — el sistema sigue con local
        _sbEnterInProgress = false; // Fix 10: release guard on error path
        return;
    }

    // Suscripción realtime: recibir mensajes del otro jugador en tiempo real
    SupabaseMessages.subscribe(topicId, function (remoteMsg) {
        if (currentTopicId !== topicId) return;
        if (!remoteMsg || !remoteMsg.id) return;

        const msgs = getTopicMessages(topicId);
        const exists = msgs.some(function (m) { return String(m.id) === String(remoteMsg.id); });
        if (exists) return;

        // Fix 4: prefer server-assigned user_id for own-message detection;
        // fall back to client userIndex for backward compat
        const _ownUserId = typeof _cachedUserId !== 'undefined' ? _cachedUserId : null;
        if (_ownUserId && remoteMsg._supabaseUserId && remoteMsg._supabaseUserId === _ownUserId) return;
        if (!_ownUserId && String(remoteMsg.userIndex) === String(currentUserIndex)) return;

        msgs.push(remoteMsg);
        msgs.sort(function (a, b) { return new Date(a.timestamp) - new Date(b.timestamp); });
        appData.messages[topicId] = msgs;
        hasUnsavedChanges = true;
        markDirty('messages', topicId); // Fix 9
        save({ silent: true });

        if (continuousReadEnabled) {
            toggleContinuousReading(false);
        }

        const isAtEnd = currentMessageIndex >= msgs.length - 2;
        if (isAtEnd) {
            currentMessageIndex = msgs.length - 1;
            showCurrentMessage('forward');
            showSyncToast('Nuevo mensaje recibido. Lectura continua pausada.', 'Continuar auto', function () {
                toggleContinuousReading(true);
            });
        } else {
            showSyncToast('Nuevo mensaje recibido', 'Ver ahora', function () {
                currentMessageIndex = msgs.length - 1;
                showCurrentMessage('forward');
            });
        }
    }, function (typingMsg) {
        if (!typingMsg || String(typingMsg.userIndex) === String(currentUserIndex)) return;
        remoteTypingState[String(typingMsg.userIndex)] = { active: !!typingMsg.typing?.active, ts: Date.now() };
        updateTypingIndicatorUi();
        setTimeout(() => updateTypingIndicatorUi(true), 5200);
    }, function () {
        clearTypingState();
    });

    // Escuchar mensajes del canal global (messages-realtime) para el topic activo.
    // Memory leak fix: remove previous handler before registering a new one.
    if (_globalRealtimeHandlerRef) {
        window.removeEventListener('etheria:realtime-message', _globalRealtimeHandlerRef);
        _globalRealtimeHandlerRef = null;
    }
    _globalRealtimeHandlerRef = function (e) {
        const remoteMsg = e.detail?.msg;
        const remoteRow = e.detail?.row;

        // Solo procesar si el mensaje pertenece al topic activo
        if (!remoteMsg || !remoteMsg.id) return;
        if (remoteRow && remoteRow.session_id && String(remoteRow.session_id) !== String(topicId)) return;
        if (currentTopicId !== topicId) return;

        // Si hay historia activa, solo procesar mensajes de esa historia
        if (currentStoryId && remoteRow && remoteRow.story_id && remoteRow.story_id !== currentStoryId) return;

        const msgs = getTopicMessages(topicId);
        const exists = msgs.some(function (m) { return String(m.id) === String(remoteMsg.id); });
        if (exists) return;

        // Fix 4: use server user_id for own-message detection when available
        const _ownId = typeof _cachedUserId !== 'undefined' ? _cachedUserId : null;
        if (_ownId && remoteMsg._supabaseUserId && remoteMsg._supabaseUserId === _ownId) return;
        if (!_ownId && String(remoteMsg.userIndex) === String(currentUserIndex)) return;

        msgs.push(remoteMsg);
        msgs.sort(function (a, b) { return new Date(a.timestamp) - new Date(b.timestamp); });
        appData.messages[topicId] = msgs;
        hasUnsavedChanges = true;
        markDirty('messages', topicId); // Fix 9
        save({ silent: true });

        const isAtEnd = currentMessageIndex >= msgs.length - 2;
        if (isAtEnd) {
            currentMessageIndex = msgs.length - 1;
            showCurrentMessage('forward');
        }
        // Limpiar listener cuando salgamos del topic
        if (currentTopicId !== topicId) {
            window.removeEventListener('etheria:realtime-message', _globalRealtimeHandler);
        }
    };
    window.addEventListener('etheria:realtime-message', _globalRealtimeHandlerRef);

    // Fix 10: release guard so the next enterTopic() call can proceed
    _sbEnterInProgress = false;
}

function stopTypewriter() {
    if (typeof typewriterInterval === 'number') {
        window.cancelAnimationFrame(typewriterInterval);
        clearInterval(typewriterInterval);
        typewriterInterval = null;
    }
    typewriterSessionId++;
    isTyping = false;
    // Resetear opacity inline por si quedó en 0 del modo HTML
    const el = document.getElementById('vnDialogueText');
    if (el && el.style.opacity === '0') {
        el.style.transition = '';
        el.style.opacity = '';
    }
}

function triggerDialogueFadeIn() {
    const dialogueBox = document.querySelector('.vn-dialogue-box');
    if (!dialogueBox) return;
    dialogueBox.classList.remove('fade-in');
    void dialogueBox.offsetWidth;
    dialogueBox.classList.add('fade-in');
}


function detectOracleCategory(question = '', stat = '') {
    const q = String(question || '').toLowerCase();
    const statKey = String(stat || '').toUpperCase();
    if (statKey === 'INT' || /analizar|descifrar|investigar|leer|pensar|recordar/.test(q)) return 'analysis';
    if (statKey === 'STR' || /forzar|romper|empujar|levantar|golpear/.test(q)) return 'force';
    if (statKey === 'AGI' || /esquivar|correr|saltar|huir|sigilo/.test(q)) return 'agility';
    if (statKey === 'VIT' || /resistir|aguantar|soportar|mantener/.test(q)) return 'endurance';
    if (/convencer|negociar|persuadir|mentir|pedir/.test(q)) return 'negotiation';
    return 'generic';
}

function generateConsequence(oracle) {
    // VOZ: El Eco del Destino — teatral, fatalista, segunda persona directa.
    // Metáforas de hilos, sombras, fuego y eco. Nunca certezas — siempre presagios.
    const category = detectOracleCategory(oracle?.question || '', oracle?.stat || '');
    const isSuccess  = (oracle?.result === 'success' || oracle?.result === 'critical');
    const isCritical = oracle?.result === 'critical';
    const isFumble   = oracle?.result === 'fumble';

    const voices = {
        negotiation: {
            cara: isCritical
                ? `*La palabra que pronunciaste atravesó el silencio como una flecha que ya sabía su destino.* El otro hilo cedió — no por convicción, sino porque el tejido lo exigía. **Tu voz fue el fuego esta vez.** Úsala con cuidado.`
                : `*El eco de tus palabras llegó — distorsionado, pero llegó.* La sombra del rechazo retrocedió un paso. **El hilo de la negociación aguantó.** Por ahora. Las promesas tienen su propia gravedad.`,
            cruz: isFumble
                ? `*Tus palabras cayeron como brasas en agua fría.* No solo no convenciste — plantaste una semilla de desconfianza que crecerá en el momento menos oportuno. **El hilo no se tensó. Se enredó.**`
                : `*El eco regresó hueco.* Tus palabras resonaron en el tejido del destino y encontraron una pared. **La sombra del otro no cedió.** Hay puertas que el lenguaje no puede abrir. Esta era una de ellas.`
        },
        force: {
            cara: isCritical
                ? `*El fuego recorrió tus brazos antes de que decidieras actuar.* El obstáculo no solo cedió — desapareció como si nunca hubiera tenido intención de resistir. **Tu sombra aplastó a la suya.**`
                : `*El hilo de tu esfuerzo se tensó hasta casi romperse… y aguantó.* Lo que se interponía cedió, no sin dejar su marca. **El fuego de la fuerza encontró su destino.** El cuerpo recuerda lo que la mente olvida.`,
            cruz: isFumble
                ? `*El fuego giró en tu contra.* El esfuerzo que pusiste se convirtió en el arma del destino contra ti. **La sombra que empujaste te empujó de vuelta, más fuerte.** Algo se rompió — dentro o fuera, aún no sabes cuál.`
                : `*El hilo se aflojó justo cuando más necesitabas que tensara.* La fuerza que invocaste no encontró el ángulo correcto. **El obstáculo permanece. Y ahora sabe que intentaste moverlo.**`
        },
        agility: {
            cara: isCritical
                ? `*Tu sombra se movió antes que tú.* El destino abrió un instante de claridad absoluta — y tu cuerpo lo habitó sin vacilar. **El hilo del peligro pasó rozando. Solo rozando.** Eso no fue suerte. Fue algo más inquietante.`
                : `*El eco de tu movimiento llegó a donde tenía que llegar.* No fue elegante — fue suficiente. **La sombra del obstáculo no te alcanzó.** Por un margen que solo yo contemplé en su totalidad.`,
            cruz: isFumble
                ? `*El hilo que intentabas esquivar se enredó en tus pies.* El movimiento que creías tener se fracturó en el momento crítico. **Tu sombra tropezó con la del destino — y el destino no se disculpa.**`
                : `*Una fracción de segundo. Eso fue lo que faltó.* El fuego del instante se extinguió antes de que pudieras aprovecharlo. **La ventaja se esfumó.** El destino no la desperdicia — la guarda para quien la merezca después.`
        },
        endurance: {
            cara: isCritical
                ? `*El fuego que debería haberte consumido te encontró incombustible.* No resististe el desgaste — lo ignoraste. **Tu sombra permanece entera cuando otras ya serían ceniza.** Ese precio se cobrará más adelante.`
                : `*El hilo de tu resistencia crujió — y aguantó.* No sin coste. El eco del esfuerzo queda grabado en algún lugar que no puedes ver. **Sigues en pie. Eso es suficiente… por ahora.**`,
            cruz: isFumble
                ? `*El fuego te encontró con las defensas caídas.* Lo que creías que podías aguantar resultó ser exactamente lo que no podías. **El hilo cedió en el peor momento.** El desgaste ahora es deuda — y el destino cobra con intereses.`
                : `*La sombra del agotamiento llegó antes que tú.* No puedes resistir lo que ya te habita. **El hilo se aflojó.** El destino lo notó. Y anotó.`
        },
        analysis: {
            cara: isCritical
                ? `*El eco de la verdad regresó nítido, sin distorsión.* Las piezas que estaban dispersas formaron una imagen que nadie más podría haber leído. **Tu sombra tocó el fondo del misterio.** Ahora sabes algo que cambia lo que viene. Témelo o úsalo.`
                : `*El hilo de la comprensión se tendió entre el caos y tu mente.* No todo, pero suficiente. **El fuego de la deducción encendió lo que necesitabas ver.** Hay sombras que siguen sin nombre, pero ya sabes dónde buscarlas.`,
            cruz: isFumble
                ? `*El eco regresó fragmentado — y cada fragmento señala en una dirección diferente.* Creías entender. Ahora entiendes menos que antes, y lo que "sabes" podría ser exactamente lo que alguien quería que creyeras. **El hilo de la verdad se enredó a propósito.**`
                : `*La información fluyó… y se filtró antes de llegar.* Los detalles que buscabas se esconden detrás de otros detalles. **La sombra del conocimiento no alcanzó tu mano.** A veces el destino protege sus secretos con más celo que sus tesoros.`
        },
        generic: {
            cara: isCritical
                ? `*El hilo cantó. El fuego obedeció. La sombra cedió.* El destino no siempre es tan explícito — aprovecha el momento. **Lo que intentabas era posible, y el universo lo confirmó sin ambigüedad.** Aunque eso raramente dura.`
                : `*El eco regresó cargado.* Tu intención encontró el ángulo correcto en el tejido del destino. **El hilo aguantó. Avanzas.** Las sombras no desaparecen — pero, por ahora, se apartan.`,
            cruz: isFumble
                ? `*El eco no regresó.* Lo que enviaste al tejido del destino fue absorbido por algo que no tienes nombre para llamar. **El hilo no crujió — desapareció.** Y las consecuencias de ese vacío ya se están formando en algún lugar que aún no puedes ver.`
                : `*El hilo se aflojó en el momento exacto en que más importaba.* El destino no es cruel — es indiferente, que es peor. **Lo que intentabas no encontró su camino.** Encuentra otro, o espera que el tejido cambie solo.`
        }
    };

    const categoryVoices = voices[category] || voices.generic;
    return categoryVoices[isSuccess ? 'cara' : 'cruz'];
}

function showCurrentMessage(direction = 'forward') {
    const msgs = getTopicMessages(currentTopicId);

    const dialogueText = document.getElementById('vnDialogueText');

    if (msgs.length === 0) {
        if (dialogueText) dialogueText.innerHTML = '<em>Historia vacía. Haz clic en 💬 Responder para comenzar.</em>';
        const editBtn = document.getElementById('editMsgBtn');
        if (editBtn) editBtn.classList.add('hidden');
        updateAffinityDisplay();
        return;
    }

    if (currentMessageIndex >= msgs.length) currentMessageIndex = msgs.length - 1;
    if (currentMessageIndex < 0) currentMessageIndex = 0;

    const msg = msgs[currentMessageIndex];
    const namePlate = document.getElementById('vnSpeakerPlate');
    const avatarBox = document.getElementById('vnSpeakerAvatar');

    // Parsear emotes del mensaje
    const { emotes, text: cleanText } = parseEmotes(msg.text);
    const activeEmote = emotes.length > 0 ? emotes[0] : null;

    // Actualizar sprites y mostrar emote
    updateSprites(msg, activeEmote);

    let charExists = true;
    let charData = null;
    if (msg.characterId) {
        charData = appData.characters.find(c => c.id === msg.characterId);
        if (!charData) charExists = false;
    }

    // Aplicar/quitar atributo data-garrick en la caja de diálogo
    const dialogueBox = document.querySelector('.vn-dialogue-box');
    if (dialogueBox) {
        dialogueBox.dataset.garrick = msg.isGarrick ? 'true' : 'false';
    }

    if (msg.isNarrator || !msg.characterId) {
        if (namePlate) {
            if (msg.isGarrick) {
                // Posadero Garrick — nameplate especial
                namePlate.textContent = 'Garrick';
                namePlate.dataset.garrick = 'true';
                namePlate.style.background = 'linear-gradient(135deg, #1c0f04, #3d1e08, #1c0f04)';
                namePlate.style.borderColor = 'rgba(180, 110, 40, 0.6)';
                namePlate.style.color = 'rgba(240, 195, 120, 0.95)';
            } else if (msg.isOracleResult) {
                namePlate.textContent = 'Eco del Destino';
                namePlate.dataset.garrick = 'false';
                namePlate.style.background = 'linear-gradient(135deg, #1a1008, #3a2010)';
                namePlate.style.borderColor = 'rgba(180,130,40,0.6)';
                namePlate.style.color = '';
            } else {
                namePlate.textContent = msg.charName || 'Narrador';
                namePlate.dataset.garrick = 'false';
                namePlate.style.background = 'linear-gradient(135deg, #4a4540, #2a2724)';
                namePlate.style.borderColor = '';
                namePlate.style.color = '';
            }
        }
        if (avatarBox) avatarBox.innerHTML = msg.isGarrick ? '🍺' : (msg.isOracleResult ? '🌀' : '📖');
        const accentColor = msg.isGarrick
            ? 'rgba(160, 100, 40, 0.75)'
            : msg.isOracleResult ? 'rgba(160, 100, 20, 0.7)' : 'rgba(139, 115, 85, 0.6)';
        const accentFull = msg.isGarrick ? '#a06428'
            : msg.isOracleResult ? '#a06414' : '#8b7355';
        document.documentElement.style.setProperty('--char-color', accentColor);
        document.documentElement.style.setProperty('--char-color-full', accentFull);
        const oracleColor = accentColor;
    } else if (!charExists) {
        if (namePlate) {
            namePlate.textContent = msg.charName || 'Desconocido';
            namePlate.style.background = msg.charColor || 'var(--accent-wood)';
        }
        if (avatarBox) {
            // XSS fix: build img via DOM to avoid charName injection in onerror attribute
            if (msg.charAvatar) {
                const _img1 = document.createElement('img');
                _img1.src = msg.charAvatar;
                _img1.alt = 'Avatar de ' + (msg.charName || 'Desconocido');
                _img1.onerror = function () {
                    this.style.display = 'none';
                    this.parentElement.textContent = (msg.charName || '?')[0];
                };
                avatarBox.innerHTML = '';
                avatarBox.appendChild(_img1);
            } else {
                avatarBox.textContent = (msg.charName || '?')[0];
            }
        }
        applyCharColor(msg.charColor);
    } else {
        if (namePlate) {
            namePlate.textContent = msg.charName;
            namePlate.style.background = msg.charColor || 'var(--accent-wood)';
        }
        if (avatarBox) {
            // XSS fix: build img via DOM to avoid charName injection in onerror attribute
            if (msg.charAvatar) {
                const _img2 = document.createElement('img');
                _img2.src = msg.charAvatar;
                _img2.alt = 'Avatar de ' + msg.charName;
                _img2.onerror = function () {
                    this.style.display = 'none';
                    this.parentElement.textContent = (msg.charName || '?')[0];
                };
                avatarBox.innerHTML = '';
                avatarBox.appendChild(_img2);
            } else {
                avatarBox.textContent = (msg.charName || '?')[0];
            }
        }
        applyCharColor(msg.charColor);
    }

    if (avatarBox) avatarBox.classList.toggle('is-speaking', !(msg.isNarrator || !msg.characterId));


    const hasOpt = msg.options && msg.options.length > 0 && msg.selectedOptionIndex === undefined;
    const optionsIndicator = document.getElementById('messageHasOptions');
    if (optionsIndicator) {
        optionsIndicator.classList.toggle('hidden', !hasOpt || isRpgModeMode());
    }

    const formattedText = formatText(cleanText);
    if (dialogueText) typeWriter(formattedText, dialogueText);

    // ── Oracle consequence badge ────────────────────────────────────────────
    const oracleBadge = document.getElementById('vnOracleConsequenceBadge');
    if (oracleBadge) {
        // Solo mostramos consecuencia en mensajes que NO son del propio oráculo
        // (los mensajes isOracleResult ya tienen el texto completo como narratorText)
        if (msg.oracle && !msg.isOracleResult) {
            const consequence = generateConsequence(msg.oracle);
            oracleBadge.textContent = consequence;
            oracleBadge.style.display = '';
        } else {
            oracleBadge.style.display = 'none';
        }
    }

    const diceBadge = document.getElementById('vnDiceBadge');
    if (diceBadge && msg.oracle) {
        const roll    = Number(msg.oracle.roll) || 0;
        const total   = Number(msg.oracle.total) || 0;
        const dc      = Number(msg.oracle.dc) || calculateOracleDifficulty();
        const mod     = Number(msg.oracle.modifier) || 0;
        const modSign = mod >= 0 ? '+' : '';
        const stat    = msg.oracle.stat || '';
        const result  = msg.oracle.result || 'success';

        const resultMeta = {
            critical: { label: 'ÉXITO CRÍTICO', cls: 'badge-critical', icon: '✦', borderColor: '#f1c40f' },
            success:  { label: 'ACIERTO',        cls: 'badge-success',  icon: '◆', borderColor: '#27ae60' },
            fail:     { label: 'FALLO',           cls: 'badge-fail',     icon: '◇', borderColor: '#c0392b' },
            fumble:   { label: 'FALLO CRÍTICO',   cls: 'badge-fumble',   icon: '✕', borderColor: '#ff4444' }
        }[result] || { label: result.toUpperCase(), cls: 'badge-success', icon: '◆', borderColor: '#27ae60' };

        diceBadge.innerHTML = `<span style="margin-right:0.35rem;">${resultMeta.icon}</span><strong>${resultMeta.label}</strong><span style="opacity:0.7;margin-left:0.5rem;font-size:0.85em;">D20(${roll}) ${modSign}${mod} = ${total} vs ${dc}${stat ? ' [' + stat + ']' : ''}</span>`;
        diceBadge.className = `vn-dice-badge ${resultMeta.cls}`;
        diceBadge.style.borderLeft = `3px solid ${resultMeta.borderColor}`;
        diceBadge.style.display = 'inline-flex';
    } else if (diceBadge) {
        diceBadge.style.display = 'none';
        diceBadge.style.borderLeft = '';
    }

    const msgCounter = document.getElementById('vnMessageCounter');
    if (msgCounter) msgCounter.textContent = `${currentMessageIndex + 1} / ${msgs.length}`;

    const liveSpeaker = (msg.isNarrator || !msg.characterId) ? 'Narrador' : (msg.charName || 'Personaje');
    announceForScreenReader(`Nuevo mensaje de ${liveSpeaker}: ${stripHtml(formatText(cleanText)).slice(0, 180)}`);

    const editBtn = document.getElementById('editMsgBtn');
    if (editBtn) {
        if (msg.userIndex === currentUserIndex) {
            editBtn.classList.remove('hidden');
        } else {
            editBtn.classList.add('hidden');
        }
    }

    const optionsContainer = document.getElementById('vnOptionsContainer');
    // 'init' = primera carga al entrar al topic. No auto-abrimos el overlay de opciones
    // para que el usuario no se encuentre con el menú de elección sin pedirlo.
    // El indicador #messageHasOptions ya avisa de que hay opciones pendientes.
    if (currentMessageIndex === msgs.length - 1 && hasOpt && !isRpgModeMode() && direction !== 'init') {
        showOptions(msg.options);
    } else {
        if (optionsContainer) optionsContainer.classList.remove('active');
    }

    updateAffinityDisplay();
    updateOracleFloatButton();
    scheduleContinuousReadIfNeeded(msg);
    if (typeof updateFavButton === "function") updateFavButton();

    // Modo clásico: panel de personaje
    if (typeof updateClassicLiteraryPanel === 'function') updateClassicLiteraryPanel();
    // Botón de narración flotante
    if (typeof updateNarrateButton === 'function') updateNarrateButton();

    // Mostrar banner de capítulo al avanzar a un mensaje que abre capítulo
    if (direction === 'forward' && msg.chapter) {
        showChapterReveal(msg.chapter);
    }

    // Reacciones
    if (typeof updateReactionDisplay === 'function') updateReactionDisplay();

    // Aplicar cambio de escena dinámico si el mensaje lo contiene
    if (direction === 'forward') {
        if (msg.sceneChange) {
            const vnSection = document.getElementById('vnSection');
            const sceneBackground = resolveTopicBackgroundPath(msg.sceneChange.background || '');
            cleanupVnRuntimeResources({ disconnectObserver: false, clearSpritePool: false, stopSpriteBlink: true });
            applyTopicBackground(vnSection, sceneBackground);
            playVnSceneTransition(vnSection);
        }
    } else {
        const topic = getCurrentTopic();
        let lastBackground = resolveTopicBackgroundPath(topic?.background || '');
        for (let i = 0; i <= currentMessageIndex; i++) {
            if (msgs[i] && msgs[i].sceneChange) {
                lastBackground = resolveTopicBackgroundPath(msgs[i].sceneChange.background || '');
            }
        }
        const vnSection = document.getElementById('vnSection');
        applyTopicBackground(vnSection, lastBackground);
    }

    // Mejora 3: clima solo al avanzar (no al retroceder)
    // Al retroceder, se busca el último clima activo hasta el índice actual
    if (direction === 'forward') {
        // Aplicar clima del mensaje actual
        const newWeather = msg.weather || 'none';
        if (newWeather !== currentWeather) {
            setWeather(newWeather);
        }
    } else {
        // Al retroceder: calcular cuál es el último clima aplicado hasta aquí
        let lastWeather = 'none';
        for (let i = 0; i <= currentMessageIndex; i++) {
            if (msgs[i] && msgs[i].weather) {
                lastWeather = msgs[i].weather;
            } else if (msgs[i] && msgs[i].weather === undefined) {
                // Sin clima en este mensaje — no cambia
            }
        }
        // Solo cambiar si difiere del actual para evitar resets innecesarios
        if (lastWeather !== currentWeather) {
            setWeather(lastWeather);
        }
    }
}

function getPooledSpriteElement(container) {
    if (spritePool.length > 0) {
        return spritePool.pop();
    }

    const spriteNode = document.createElement('div');
    spriteNode.className = 'vn-sprite';
    const img = document.createElement('img');
    spriteNode.appendChild(img);
    return spriteNode;
}

function recycleActiveSprites(container) {
    Array.from(container.children).forEach((child) => {
        child.className = 'vn-sprite';
        child.removeAttribute('data-char-id');
        child.classList.remove('no-sprite');
        const img = child.querySelector('img');
        if (img) {
            if (spriteIntersectionObserver) spriteIntersectionObserver.unobserve(img);
            revokeTrackedSpriteObjectUrl(img.currentSrc || img.src);
            if (img.dataset?.src) revokeTrackedSpriteObjectUrl(img.dataset.src);
            if (img.dataset?.thumb) revokeTrackedSpriteObjectUrl(img.dataset.thumb);
            img.removeAttribute('src');
            img.removeAttribute('alt');
            delete img.dataset.src;
            delete img.dataset.thumb;
            img.onload = null;
            img.onerror = null;
        }
        child.querySelectorAll('.vn-sprite-hitbox, .manga-emote, .sprite-shadow').forEach((el) => el.remove());
        // Limitar el pool a 20 elementos para evitar memory leak
        if (spritePool.length < 20) spritePool.push(child);
    });
    container.innerHTML = '';
}

// ── Normaliza el campo gender de un personaje a la clase CSS de sombra ──────
function getShadowGenderClass(gender) {
    const g = String(gender || '').toLowerCase().trim();
    if (['male', 'm', 'masculino', 'hombre', 'masculine', 'masc'].includes(g)) return 'shadow-masc';
    if (['female', 'f', 'femenino', 'mujer', 'feminine', 'fem'].includes(g)) return 'shadow-fem';
    return null; // neutral / no especificado → silueta base etérea
}

// ── SVG paths para siluetas humanas realistas ────────────────────────────────
const SHADOW_SVG_FEM = `<svg viewBox="0 0 200 520" xmlns="http://www.w3.org/2000/svg">
  <g fill="currentColor">
    <!-- Cabeza -->
    <ellipse cx="100" cy="36" rx="26" ry="32"/>
    <!-- Cuello -->
    <rect x="91" y="64" width="18" height="20" rx="4"/>
    <!-- Torso + cintura -->
    <path d="M72,82 C60,88 54,100 54,116 L56,148 C56,160 62,170 72,175 L78,188 C82,196 80,206 76,214 L68,240 C64,252 66,264 72,274 L76,300 L124,300 L128,274 C134,264 136,252 132,240 L124,214 C120,206 118,196 122,188 L128,175 C138,170 144,160 144,148 L146,116 C146,100 140,88 128,82 C120,78 108,76 100,76 C92,76 80,78 72,82 Z"/>
    <!-- Caderas más anchas -->
    <path d="M68,296 C58,298 50,306 48,316 L44,340 C42,352 46,364 54,372 L58,400 L88,400 L90,370 L100,365 L110,370 L112,400 L142,400 L146,372 C154,364 158,352 156,340 L152,316 C150,306 142,298 132,296 Z"/>
    <!-- Pierna izquierda -->
    <path d="M58,396 L60,440 C60,452 58,464 56,476 L52,508 C51,514 55,520 61,520 L80,520 C86,520 89,514 88,508 L86,476 C84,464 84,452 86,440 L88,396 Z"/>
    <!-- Pierna derecha -->
    <path d="M112,396 L114,440 C116,452 116,464 114,476 L112,508 C111,514 114,520 120,520 L139,520 C145,520 149,514 148,508 L144,476 C142,464 140,452 140,440 L142,396 Z"/>
    <!-- Brazos -->
    <path d="M70,82 L48,86 C38,90 32,100 34,110 L42,158 C44,166 52,170 60,168 L68,166 L62,120 C60,106 64,92 70,82 Z"/>
    <path d="M130,82 L152,86 C162,90 168,100 166,110 L158,158 C156,166 148,170 140,168 L132,166 L138,120 C140,106 136,92 130,82 Z"/>
  </g>
</svg>`;

const SHADOW_SVG_MASC = `<svg viewBox="0 0 220 520" xmlns="http://www.w3.org/2000/svg">
  <g fill="currentColor">
    <!-- Cabeza -->
    <ellipse cx="110" cy="34" rx="28" ry="30"/>
    <!-- Cuello -->
    <rect x="100" y="60" width="20" height="22" rx="3"/>
    <!-- Torso ancho + hombros cuadrados -->
    <path d="M62,80 C48,84 38,96 38,112 L40,152 C40,166 48,176 60,180 L64,200 C66,210 64,220 60,230 L54,258 C50,270 52,282 60,290 L66,316 L154,316 L160,290 C168,282 170,270 166,258 L160,230 C156,220 154,210 156,200 L160,180 C172,176 180,166 180,152 L182,112 C182,96 172,84 158,80 C144,74 128,72 110,72 C92,72 76,74 62,80 Z"/>
    <!-- Caderas -->
    <path d="M64,312 C54,314 46,322 44,332 L40,356 C38,368 42,380 50,388 L54,416 L86,416 L88,384 L110,380 L132,384 L134,416 L166,416 L170,388 C178,380 182,368 180,356 L176,332 C174,322 166,314 156,312 Z"/>
    <!-- Pierna izquierda -->
    <path d="M52,412 L54,455 C54,468 52,480 50,492 L46,514 C45,518 48,522 52,522 L80,522 C84,522 87,518 86,514 L84,492 C82,480 82,468 84,455 L88,412 Z"/>
    <!-- Pierna derecha -->
    <path d="M132,412 L136,455 C138,468 138,480 136,492 L134,514 C133,518 136,522 140,522 L168,522 C172,522 175,518 174,514 L170,492 C168,480 166,468 166,455 L168,412 Z"/>
    <!-- Brazo izquierdo — más separado del cuerpo -->
    <path d="M60,80 L32,88 C20,94 14,108 16,122 L26,170 C28,180 38,186 48,182 L62,178 L56,128 C54,110 56,92 60,80 Z"/>
    <!-- Mano izquierda -->
    <ellipse cx="40" cy="186" rx="10" ry="14"/>
    <!-- Brazo derecho -->
    <path d="M160,80 L188,88 C200,94 206,108 204,122 L194,170 C192,180 182,186 172,182 L158,178 L164,128 C166,110 164,92 160,80 Z"/>
    <!-- Mano derecha -->
    <ellipse cx="180" cy="186" rx="10" ry="14"/>
  </g>
</svg>`;

const SHADOW_SVG_NEUTRAL = `<svg viewBox="0 0 210 520" xmlns="http://www.w3.org/2000/svg">
  <g fill="currentColor">
    <!-- Cabeza -->
    <ellipse cx="105" cy="35" rx="27" ry="31"/>
    <!-- Cuello -->
    <rect x="95" y="62" width="20" height="21" rx="3"/>
    <!-- Torso -->
    <path d="M66,80 C54,86 46,98 46,114 L48,152 C48,164 56,174 66,178 L70,196 C72,206 70,216 66,226 L60,252 C56,264 58,276 66,284 L70,310 L140,310 L144,284 C152,276 154,264 150,252 L144,226 C140,216 138,206 140,196 L144,178 C154,174 162,164 162,152 L164,114 C164,98 156,86 144,80 C132,74 118,72 105,72 C92,72 78,74 66,80 Z"/>
    <!-- Caderas -->
    <path d="M66,306 C56,308 48,316 46,326 L42,350 C40,362 44,374 52,382 L56,410 L88,410 L90,378 L105,374 L120,378 L122,410 L154,410 L158,382 C166,374 170,362 168,350 L164,326 C162,316 154,308 144,306 Z"/>
    <!-- Pierna izquierda -->
    <path d="M54,406 L56,450 C56,462 54,474 52,486 L48,514 C47,518 50,522 54,522 L82,522 C86,522 89,518 88,514 L86,486 C84,474 84,462 86,450 L90,406 Z"/>
    <!-- Pierna derecha -->
    <path d="M120,406 L124,450 C126,462 126,474 124,486 L122,514 C121,518 124,522 128,522 L156,522 C160,522 163,518 162,514 L158,486 C156,474 154,462 154,450 L156,406 Z"/>
    <!-- Brazos -->
    <path d="M64,80 L40,88 C28,94 22,108 24,120 L34,166 C36,176 46,182 56,178 L66,174 L60,124 C58,106 60,90 64,80 Z"/>
    <path d="M146,80 L170,88 C182,94 188,108 186,120 L176,166 C174,176 164,182 154,178 L144,174 L150,124 C152,106 150,90 146,80 Z"/>
  </g>
</svg>`;

// ── URLs de siluetas por defecto — SVG inline como data URI (sin fondo blanco) ──
const _svgToDataUri = (svg) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;

const _SILO_FEM_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 520">
  <g fill="rgba(20,14,8,0.85)">
    <ellipse cx="100" cy="38" rx="28" ry="32"/>
    <rect x="88" y="66" width="24" height="20" rx="5"/>
    <path d="M68,84 C52,92 46,108 48,126 L52,160 C54,172 62,180 72,184 L78,200 C82,212 80,224 74,234 L64,264 C60,278 62,292 70,300 L74,328 L126,328 L130,300 C138,292 140,278 136,264 L126,234 C120,224 118,212 122,200 L128,184 C138,180 146,172 148,160 L152,126 C154,108 148,92 132,84 C122,78 112,76 100,76 C88,76 78,78 68,84 Z"/>
    <path d="M66,322 C54,326 46,336 44,348 L40,374 C38,388 44,402 54,408 L58,440 L90,440 L92,406 L100,400 L108,406 L110,440 L142,440 L146,408 C156,402 162,388 160,374 L156,348 C154,336 146,326 134,322 Z"/>
    <path d="M56,436 L58,486 C58,500 56,514 54,524 L50,516 C52,504 52,490 50,476 L48,436 Z M60,436 L88,436 L88,476 C88,492 86,506 84,516 L80,524 L76,516 C78,506 78,492 78,476 L76,436 Z"/>
    <path d="M112,436 L114,476 C114,492 114,506 116,516 L112,524 L108,516 C106,506 106,492 106,476 L104,436 Z M116,436 L144,436 L144,476 C142,490 142,504 144,516 L140,524 L136,516 C134,506 134,492 134,476 L134,436 Z"/>
    <path d="M66,84 L42,90 C30,96 22,112 24,126 L32,178 C34,190 44,196 56,192 L68,188 L60,130 C58,110 60,94 66,84 Z"/>
    <path d="M134,84 L158,90 C170,96 178,112 176,126 L168,178 C166,190 156,196 144,192 L132,188 L140,130 C142,110 140,94 134,84 Z"/>
  </g>
</svg>`;

const _SILO_MASC_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 220 520">
  <g fill="rgba(20,14,8,0.85)">
    <ellipse cx="110" cy="36" rx="30" ry="32"/>
    <rect x="98" y="64" width="24" height="22" rx="4"/>
    <path d="M56,80 C38,88 28,106 30,124 L34,166 C36,180 46,190 58,194 L64,214 C66,226 64,238 58,250 L50,280 C46,294 48,308 58,316 L64,344 L156,344 L162,316 C172,308 174,294 170,280 L162,250 C156,238 154,226 156,214 L162,194 C174,190 184,180 186,166 L190,124 C192,106 182,88 164,80 C150,74 132,72 110,72 C88,72 70,74 56,80 Z"/>
    <path d="M60,338 C48,342 38,354 36,368 L32,396 C30,412 36,428 48,434 L52,466 L88,466 L90,430 L110,424 L130,430 L132,466 L168,466 L172,434 C184,428 190,412 188,396 L184,368 C182,354 172,342 160,338 Z"/>
    <path d="M50,462 L52,510 C54,516 58,520 64,520 L84,520 C90,520 94,516 94,510 L92,462 Z"/>
    <path d="M126,462 L128,510 C128,516 132,520 138,520 L158,520 C164,520 168,516 168,510 L166,462 Z"/>
    <path d="M54,80 L24,90 C10,96 2,114 4,130 L14,184 C16,198 28,206 42,200 L58,194 L50,130 C48,108 50,90 54,80 Z"/>
    <ellipse cx="20" cy="208" rx="12" ry="16"/>
    <path d="M166,80 L196,90 C210,96 218,114 216,130 L206,184 C204,198 192,206 178,200 L162,194 L170,130 C172,108 170,90 166,80 Z"/>
    <ellipse cx="200" cy="208" rx="12" ry="16"/>
  </g>
</svg>`;

const DEFAULT_SPRITE_FEM     = _svgToDataUri(_SILO_FEM_SVG);
const DEFAULT_SPRITE_MASC    = _svgToDataUri(_SILO_MASC_SVG);
const DEFAULT_SPRITE_NEUTRAL = DEFAULT_SPRITE_FEM;

// ── Construye la estructura DOM completa de una silueta-sombra ───────────────
// Usa imágenes PNG externas por género, con glow y hitbox idénticos al sistema anterior
function _buildSpriteShadow(characterId) {
    const char = characterId
        ? appData.characters.find(c => String(c.id) === String(characterId))
        : null;

    const genderClass = char ? getShadowGenderClass(char.gender) : null;

    const shadow = document.createElement('div');
    shadow.className = 'sprite-shadow';
    shadow.setAttribute('aria-hidden', 'true');

    // Elegir URL según género
    let spriteUrl;
    if (genderClass === 'shadow-fem')   spriteUrl = DEFAULT_SPRITE_FEM;
    else if (genderClass === 'shadow-masc') spriteUrl = DEFAULT_SPRITE_MASC;
    else spriteUrl = DEFAULT_SPRITE_NEUTRAL;

    // Wrapper con la imagen
    const wrapper = document.createElement('div');
    wrapper.className = 'shadow-silhouette' + (genderClass ? ` ${genderClass}` : '');

    const img = document.createElement('img');
    img.src = spriteUrl;
    img.alt = '';
    img.className = 'shadow-silhouette-img';
    img.draggable = false;
    // Fallback de seguridad — usar SVG del mismo inline set
    img.onerror = function () {
        this.onerror = null;
        const g = genderClass === 'shadow-masc' ? _SILO_MASC_SVG
                : genderClass === 'shadow-fem'  ? _SILO_FEM_SVG
                : _SILO_FEM_SVG;
        this.src = _svgToDataUri(g);
    };
    wrapper.appendChild(img);

    const glow = document.createElement('div');
    glow.className = 'shadow-glow' + (genderClass ? ` ${genderClass}` : '');

    const hitbox = document.createElement('div');
    hitbox.className = 'vn-sprite-hitbox';

    shadow.appendChild(wrapper);
    shadow.appendChild(glow);
    shadow.appendChild(hitbox);

    return shadow;
}

function updateSprites(currentMsg, activeEmote = null) {
    const container = document.getElementById('vnSpriteContainer');
    if (!container) return;

    const msgs = getTopicMessages(currentTopicId);
    const isRpgMode = isRpgModeMode();

    let charsToShow = [];

    if (isRpgMode) {
        const recentChars = [];
        const seen = new Set();

        for (let i = msgs.length - 1; i >= 0 && seen.size < 5; i--) {
            const m = msgs[i];
            if (m.characterId && !seen.has(m.characterId)) {
                const charExists = appData.characters.find(c => c.id === m.characterId);
                if (charExists) {
                    seen.add(m.characterId);
                    recentChars.push(m);
                }
            }
        }

        // Crear copias shallow para no mutar los objetos de mensaje originales
        const sliced = recentChars.slice(0, 3);
        if (sliced.length === 1) {
            charsToShow = [{ ...sliced[0], position: 'center' }];
        } else if (sliced.length === 2) {
            charsToShow = [{ ...sliced[0], position: 'left' }, { ...sliced[1], position: 'right' }];
        } else if (sliced.length >= 3) {
            charsToShow = [{ ...sliced[0], position: 'left' }, { ...sliced[1], position: 'center' }, { ...sliced[2], position: 'right' }];
        }
    } else if (currentMsg.characterId) {
        const charExists = appData.characters.find(c => c.id === currentMsg.characterId);
        if (charExists) {
            // Crear copia para no mutar el mensaje original con .position
            charsToShow.push({ ...currentMsg, position: 'center' });
        }
    }

    recycleActiveSprites(container);

    charsToShow.forEach((char) => {
        const spriteNode = getPooledSpriteElement(container);
        const isCurrent = char.characterId === currentMsg.characterId;
        const position = char.position || 'center';

        spriteNode.className = `vn-sprite position-${position} ${isCurrent ? 'active' : 'inactive'}`;
        spriteNode.dataset.charId = char.characterId;

        const existingPlaceholder = spriteNode.querySelector('.vn-sprite-hitbox');
        if (existingPlaceholder) existingPlaceholder.remove();

        const hasSprite = typeof char.charSprite === 'string' && char.charSprite.trim().length > 0;
        let img = spriteNode.querySelector('img');

        if (hasSprite) {
            if (!img) {
                img = document.createElement('img');
                spriteNode.appendChild(img);
            }
            img.loading = 'lazy';
            img.decoding = 'async';
            img.fetchPriority = isCurrent ? 'high' : 'low';
            queueSpriteImageLoad(img, {
                placeholder: char.charAvatar ? escapeHtml(char.charAvatar) : null,
                thumb: char.charAvatar ? escapeHtml(char.charAvatar) : null,
                full: escapeHtml(char.charSprite),
            });
            img.alt = escapeHtml(char.charName || 'Sprite');
            img.onerror = function () {
                this.style.display = 'none';
                const parent = this.parentElement;
                if (parent) {
                    parent.classList.add('no-sprite');
                    // Construir sombra como fallback si no existe ya
                    if (!parent.querySelector('.sprite-shadow')) {
                        const shadow = _buildSpriteShadow(parent.dataset.charId);
                        parent.appendChild(shadow);
                    }
                }
            };
            img.style.display = 'block';
            spriteNode.classList.remove('no-sprite');
        } else {
            if (img) img.remove();
            spriteNode.classList.add('no-sprite');

            // ── Silueta sombra (en lugar de hitbox vacío) ────────────────
            const shadow = _buildSpriteShadow(char.characterId);
            spriteNode.appendChild(shadow);
        }

        if (isCurrent && activeEmote) {
            // showEmoteOnSprite handles animation + fade-out (defined in effects.js)
            if (typeof showEmoteOnSprite === 'function') {
                showEmoteOnSprite(activeEmote, spriteNode);
            } else {
                // Fallback
                const emoteNode = document.createElement('div');
                emoteNode.className = `manga-emote emote-${activeEmote}`;
                emoteNode.textContent = emoteConfig[activeEmote]?.symbol || '';
                spriteNode.appendChild(emoteNode);
            }
        }

        container.appendChild(spriteNode);
    });
}


function typeWriter(text, element) {
    stopTypewriter();

    isTyping = true;
    if (typeof syncVnStore === 'function') syncVnStore({ isTyping: true });
    element.innerHTML = '';
    const sessionId = typewriterSessionId;

    const indicator = document.getElementById('vnContinueIndicator');
    if (indicator) indicator.style.opacity = '0';

    const hasHtml = /<[^>]*>/g.test(text);

    if (prefersReducedMotion()) {
        element.innerHTML = text;
        isTyping = false;
        if (typeof syncVnStore === 'function') syncVnStore({ isTyping: false });
        if (indicator) indicator.style.opacity = '1';
        scheduleContinuousReadIfNeeded(getTopicMessages(currentTopicId)[currentMessageIndex]);
        return;
    }

    if (hasHtml) {
        element.innerHTML = text;
        element.style.opacity = '0';
        element.style.transition = 'opacity 0.4s ease';
        setTimeout(() => {
            if (sessionId !== typewriterSessionId) return;
            element.style.opacity = '1';
            isTyping = false;
            if (typeof syncVnStore === 'function') syncVnStore({ isTyping: false });
            if (indicator) indicator.style.opacity = '1';
            scheduleContinuousReadIfNeeded(getTopicMessages(currentTopicId)[currentMessageIndex]);
        }, 100);
        return;
    }

    // ── Typewriter dramático ──────────────────────────────────────
    // Divide el texto en tokens: palabras para modo rápido, chars para lento
    const wordsFastMode = textSpeed <= 25;
    const tokens = wordsFastMode ? (text.match(/\S+\s*/g) || [text]) : text.split('');
    let i = 0;
    let lastTick = 0;

    // Cada carácter se envuelve en un <span> que hace fade+slide in
    // Para no destruir el DOM en cada frame, usamos un DocumentFragment
    // y añadimos spans de uno en uno.
    const addToken = (token) => {
        // Los espacios se añaden sin span para no crear saltos
        if (token.trim() === '') {
            element.appendChild(document.createTextNode(token));
            return;
        }
        const span = document.createElement('span');
        span.className = 'tw-char';
        span.textContent = token;
        element.appendChild(span);
        // Forzar reflow para que la animación arranque
        void span.offsetWidth;
        span.classList.add('tw-char--in');
    };

    const step = (timestamp) => {
        if (sessionId !== typewriterSessionId) {
            typewriterInterval = null;
            return;
        }

        if (!lastTick || timestamp - lastTick >= textSpeed) {
            const chunkSize = wordsFastMode ? 2 : 1;
            let consumed = 0;
            while (consumed < chunkSize && i < tokens.length) {
                addToken(tokens[i]);
                i++;
                consumed++;
            }
            lastTick = timestamp;
        }

        if (i >= tokens.length) {
            stopTypewriter();
            if (indicator) indicator.style.opacity = '1';
            scheduleContinuousReadIfNeeded(getTopicMessages(currentTopicId)[currentMessageIndex]);
            return;
        }

        typewriterInterval = window.requestAnimationFrame(step);
    };

    typewriterInterval = window.requestAnimationFrame(step);
}

function handleDialogueClick() {
    // BUG-02: Si hay una escena RPG activa, el motor gestiona el avance
    // a través de _bindAdvanceOnce (scene:input:advance). No ejecutar la
    // lógica de navegación clásica para evitar efectos secundarios.
    if (typeof RPGEngine !== 'undefined' && RPGEngine.isRunning()) return;

    markContinuousInteraction();
    cancelContinuousRead('touch');
    const replyPanel = document.getElementById('vnReplyPanel');
    const optionsContainer = document.getElementById('vnOptionsContainer');
    const settingsPanel = document.getElementById('settingsPanel');
    const emotePicker = document.getElementById('emotePicker');

    if (replyPanel && replyPanel.style.display === 'flex') return;
    if (optionsContainer && optionsContainer.classList.contains('active')) return;
    if (settingsPanel && settingsPanel.classList.contains('active')) return;
    if (emotePicker && emotePicker.classList.contains('active')) return;

    const msgs = getTopicMessages(currentTopicId);

    if (isTyping) {
        stopTypewriter();
        const msg = msgs[currentMessageIndex];
        const dialogueText = document.getElementById('vnDialogueText');
        if (msg && dialogueText) {
            const { text: cleanText } = parseEmotes(msg.text);
            dialogueText.innerHTML = formatText(cleanText);
        }
        const indicator = document.getElementById('vnContinueIndicator');
        if (indicator) indicator.style.opacity = '1';
        scheduleContinuousReadIfNeeded(getTopicMessages(currentTopicId)[currentMessageIndex]);
        return;
    }

    if (pendingContinuation) {
        showContinuation(pendingContinuation);
        pendingContinuation = null;
        return;
    }

    if (currentMessageIndex < msgs.length - 1) {
        currentMessageIndex++;
        if (typeof syncVnStore === 'function') syncVnStore({ messageIndex: currentMessageIndex });
        if (typeof playSoundClick === 'function') playSoundClick();
        showCurrentMessage('forward');
        const _now1 = Date.now();
        if (_now1 - _lastNavSyncTime > _NAV_SYNC_DEBOUNCE_MS) {
            _lastNavSyncTime = _now1;
            syncBidirectional({ silent: true, allowRemotePrompt: true });
        }
    }
}

function previousMessage() {
    markContinuousInteraction();
    if (currentMessageIndex > 0) {
        currentMessageIndex--;
        if (typeof syncVnStore === 'function') syncVnStore({ messageIndex: currentMessageIndex });
        showCurrentMessage('backward');
    }
}

function firstMessage() {
    markContinuousInteraction();
    currentMessageIndex = 0;
    if (typeof syncVnStore === 'function') syncVnStore({ messageIndex: currentMessageIndex });
    showCurrentMessage('backward');
}

function nextMessage() {
    markContinuousInteraction();
    const msgs = getTopicMessages(currentTopicId);
    if (currentMessageIndex < msgs.length - 1) {
        currentMessageIndex++;
        if (typeof syncVnStore === 'function') syncVnStore({ messageIndex: currentMessageIndex });
        if (typeof playSoundClick === 'function') playSoundClick();
        showCurrentMessage('forward');
        const _now2 = Date.now();
        if (_now2 - _lastNavSyncTime > _NAV_SYNC_DEBOUNCE_MS) {
            _lastNavSyncTime = _now2;
            syncBidirectional({ silent: true, allowRemotePrompt: true });
        }
    }
}

function lastMessage() {
    markContinuousInteraction();
    const msgs = getTopicMessages(currentTopicId);
    if (msgs.length === 0) return;
    currentMessageIndex = msgs.length - 1;
    if (typeof syncVnStore === 'function') syncVnStore({ messageIndex: currentMessageIndex });
    showCurrentMessage('forward');
}

function handleActionButtonClick(event) {
    if (event) {
        event.preventDefault();
        event.stopPropagation();
    }
}

function deleteCurrentMessage() {
    const msgs = getTopicMessages(currentTopicId);
    if (msgs.length === 0 || currentMessageIndex >= msgs.length) return;

    openConfirmModal('¿Borrar este mensaje?', 'Borrar').then(ok => {
        if (!ok) return;
        msgs.splice(currentMessageIndex, 1);
        if (currentMessageIndex >= msgs.length) {
            currentMessageIndex = Math.max(0, msgs.length - 1);
        }
        hasUnsavedChanges = true;
        save({ silent: true });
        showCurrentMessage('forward');
    });
}

// ============================================
// EDICIÓN DE MENSAJES
// ============================================
function editCurrentMessage() {
    const msgs = getTopicMessages(currentTopicId);
    if (currentMessageIndex >= msgs.length) return;

    const msg = msgs[currentMessageIndex];
    if (msg.userIndex !== currentUserIndex) {
        showAutosave('Solo puedes editar tus propios mensajes', 'error');
        return;
    }

    editingMessageId = msg.id;

    // Setear selectedCharId ANTES de openReplyPanel para que updateCharSelector use el correcto
    if (!msg.isNarrator && msg.characterId) {
        selectedCharId = msg.characterId;
    }

    openReplyPanel();

    const replyText = document.getElementById('vnReplyText');
    if (replyText) replyText.value = msg.text || '';

    const narratorMode = document.getElementById('narratorMode');
    if (narratorMode) {
        narratorMode.checked = !!msg.isNarrator;
        toggleNarratorMode();
    }

    if (!msg.isNarrator && msg.characterId) {
        updateCharSelector();
    }

    setWeather(msg.weather || 'none');

    if (msg.options && msg.options.length > 0 && !isRpgModeMode()) {
        const enableOptions = document.getElementById('enableOptions');
        const optionsFields = document.getElementById('optionsFields');

        if (enableOptions) enableOptions.checked = true;
        if (optionsFields) optionsFields.classList.add('active');

        tempBranches = [...msg.options];

        msg.options.forEach((opt, idx) => {
            if (idx < 3) {
                const textInput = document.getElementById(`option${idx + 1}Text`);
                const contInput = document.getElementById(`option${idx + 1}Continuation`);
                if (textInput) textInput.value = opt.text || '';
                if (contInput) contInput.value = opt.continuation || '';
            }
        });
    }

    const replyPanelTitle = document.getElementById('replyPanelTitle');
    const submitBtn = document.getElementById('submitReplyBtn');

    if (replyPanelTitle) replyPanelTitle.textContent = '✏️ Editar Mensaje';
    if (submitBtn) {
        submitBtn.textContent = '💾 Guardar Cambios';
        submitBtn.onclick = saveEditedMessage;
    }
}

function saveEditedMessage() {
    const replyText = document.getElementById('vnReplyText');
    const text = replyText?.value.trim();
    emitTypingState(false);
    if(!text) { showAutosave('Escribe algo primero', 'error'); return; }

    const msgs = getTopicMessages(currentTopicId);
    const msgIndex = msgs.findIndex(m => m.id === editingMessageId);
    if (msgIndex === -1) return;

    const topic = getCurrentTopic();

    if (isNarratorMode && !canUseNarratorMode(topic)) { showAutosave('Solo quien crea la historia puede usar Narrador en modo RPG', 'error'); return; }

    let char = null;
    if(!isNarratorMode) {
        if(!selectedCharId) { showAutosave('Selecciona un personaje', 'error'); return; }
        char = appData.characters.find(c => c.id === selectedCharId);
        if (!char) { showAutosave('Personaje no encontrado', 'error'); return; }
        if (topic?.mode === 'rpg' && typeof ensureCharacterRpgProfile === 'function') {
            const profile = ensureCharacterRpgProfile(char, currentTopicId || null);
            if (profile.knockedOutTurns > 0) {
                showAutosave(`Este personaje está fuera de escena por ${profile.knockedOutTurns} turnos`, 'error');
                return;
            }
        }
        persistTopicLockedCharacter(topic, selectedCharId);
    }

    let options = null;
    const enableOptions = document.getElementById('enableOptions');
    if(enableOptions && enableOptions.checked && !isRpgModeMode()) {
        options = [];
        for(let i=1; i<=3; i++) {
            const textInput = document.getElementById(`option${i}Text`);
            const contInput = document.getElementById(`option${i}Continuation`);
            const t = textInput?.value.trim() || '';
            const c = contInput?.value.trim() || '';
            if(t && c) options.push({text: t, continuation: c});
        }
    }

    // Preservar el clima del mensaje original; solo actualizarlo si el usuario lo cambió explícitamente
    // (se detecta comparando currentWeather con el clima original del mensaje)
    const originalWeather = msgs[msgIndex].weather;
    const weatherChanged = currentWeather !== (originalWeather || 'none');
    const finalWeather = weatherChanged ? (currentWeather !== 'none' ? currentWeather : undefined) : originalWeather;

    msgs[msgIndex] = {
        ...msgs[msgIndex],
        characterId: isNarratorMode ? null : selectedCharId,
        charName: isNarratorMode ? 'Narrador' : char.name,
        charColor: isNarratorMode ? null : char.color,
        charAvatar: isNarratorMode ? null : char.avatar,
        charSprite: isNarratorMode ? null : char.sprite,
        text,
        isNarrator: isNarratorMode,
        options: options && options.length > 0 ? options : undefined,
        selectedOptionIndex: undefined,
        edited: true,
        editedAt: new Date().toISOString(),
        weather: finalWeather
    };

    hasUnsavedChanges = true;
    save({ silent: true });
    closeReplyPanel();

    editingMessageId = null;
    showCurrentMessage('forward');
}

// ============================================
// OPCIONES Y CONTINUACIÓN
// ============================================
function showOptions(options) {
    const container = document.getElementById('vnOptionsContainer');
    if (!container) return;

    const msgs = getTopicMessages(currentTopicId);
    const currentMsg = msgs[currentMessageIndex];

    if (!options || options.length === 0 || isRpgModeMode()) {
        container.classList.remove('active');
        return;
    }

    // Guard: normalizar opciones que vengan en formatos legacy o corruptos
    const normalizedOptions = options.map((opt, i) => {
        if (opt && typeof opt === 'object' && typeof opt.text === 'string') return opt;
        // Si es string simple o número, usarlo como texto
        if (typeof opt === 'string' || typeof opt === 'number') {
            return { text: String(opt), continuation: '' };
        }
        // Si tiene text pero no es string
        if (opt && opt.text !== undefined) {
            return { text: String(opt.text), continuation: String(opt.continuation || '') };
        }
        return { text: `Opción ${i + 1}`, continuation: '' };
    });

    const total = normalizedOptions.length;
    container.innerHTML = normalizedOptions.map((opt, idx) => {
        const selected = currentMsg.selectedOptionIndex === idx;
        const disabled = currentMsg.selectedOptionIndex !== undefined;
        const optionLabel = `${opt.text}, opción ${idx + 1} de ${total}`;
        return `
        <button class="vn-option-btn ${selected ? 'chosen' : ''}"
                role="button"
                aria-pressed="${selected ? 'true' : 'false'}"
                aria-label="${escapeHtml(optionLabel)}"
                onclick="selectOption(${idx})"
                ${disabled ? 'disabled' : ''}>
            ${escapeHtml(opt.text)}
        </button>
    `;
    }).join('');

    container.classList.add('active');
    // Efecto suspense al mostrar opciones (absorbido de mejoras.js)
    const vnSection = document.getElementById('vnSection');
    if (vnSection) vnSection.classList.add('suspense-mode');
}

function selectOption(idx) {
    // Quitar efecto suspense al seleccionar (absorbido de mejoras.js)
    const vnSectionEl = document.getElementById('vnSection');
    if (vnSectionEl) vnSectionEl.classList.remove('suspense-mode');
    const msgs = getTopicMessages(currentTopicId);
    const msg = msgs[currentMessageIndex];

    if (!msg.options || msg.selectedOptionIndex !== undefined) return;

    msg.selectedOptionIndex = idx;
    msg.selectedBy = currentUserIndex;

    hasUnsavedChanges = true;
    save({ silent: true });

    const selectedOption = msg.options[idx];

    if (selectedOption && selectedOption.continuation) {
        // El resultado lo dice el personaje activo del mensaje que tenía las opciones,
        // no el narrador — a menos que el mensaje original fuera del narrador.
        const sourceIsNarrator = msg.isNarrator || !msg.characterId;
        const resultChar = sourceIsNarrator
            ? null
            : appData.characters.find(c => c.id === msg.characterId) || null;

        const newMsg = {
            id: (globalThis.crypto && typeof globalThis.crypto.randomUUID === 'function')
            ? globalThis.crypto.randomUUID()
            : `${Date.now()}_${Math.random().toString(16).slice(2)}`,
            characterId: resultChar ? resultChar.id : null,
            charName:    resultChar ? resultChar.name   : 'Narrador',
            charColor:   resultChar ? resultChar.color  : null,
            charAvatar:  resultChar ? resultChar.avatar : null,
            charSprite:  resultChar ? resultChar.sprite : null,
            text: selectedOption.continuation,
            isNarrator: !resultChar,
            userIndex: currentUserIndex,
            timestamp: new Date().toISOString(),
            isOptionResult: true,
            parentOptionIndex: idx
        };

        const topicMessages = getTopicMessages(currentTopicId);
        topicMessages.push(newMsg);
        hasUnsavedChanges = true;
        save({ silent: true });
    }

    const optionsContainer = document.getElementById('vnOptionsContainer');
    if (optionsContainer) optionsContainer.classList.remove('active');

    const optionsIndicator = document.getElementById('messageHasOptions');
    if (optionsIndicator) optionsIndicator.classList.add('hidden');

    currentMessageIndex = getTopicMessages(currentTopicId).length - 1;
    triggerDialogueFadeIn();
    showCurrentMessage('forward');
}

function showContinuation(text) {
    const contText = document.getElementById('continuationText');
    const overlay = document.getElementById('continuationOverlay');

    if (contText) contText.textContent = text;
    if (overlay) overlay.classList.add('active');
}

function closeContinuation() {
    const overlay = document.getElementById('continuationOverlay');
    if (overlay) overlay.classList.remove('active');
}

// ============================================
// HISTORIAL
// ============================================
function buildHistoryEntry(msg, idx, showFavBadge = false) {
    const isNarrator = msg.isNarrator || !msg.characterId;
    const speaker = isNarrator ? 'Narrador' : msg.charName;
    const date = new Date(msg.timestamp).toLocaleString();
    const edited = msg.edited ? ' (editado)' : '';
    const optionResult = msg.isOptionResult ? ' [Respuesta elegida]' : '';
    const isFav = showFavBadge && currentTopicId && isMessageFavorite(currentTopicId, String(msg.id));
    const favBadge = isFav ? '<span class="history-entry-fav" title="Favorito">⭐</span>' : '';

    // Separador de capítulo (modo clásico)
    const chapterDivider = msg.chapter ? `
        <div class="history-chapter-divider">
            <div class="history-chapter-divider-line"></div>
            <div class="history-chapter-divider-text">✦ ${escapeHtml(msg.chapter.title)} ✦</div>
            <div class="history-chapter-divider-line"></div>
        </div>` : '';

    // Reacciones en el historial
    let reactionRow = '';
    if (currentTopicId && typeof getReactionSummary === 'function') {
        const summary = getReactionSummary(currentTopicId, String(msg.id));
        const chips = Object.entries(summary)
            .sort((a, b) => b[1] - a[1])
            .map(([emoji, count]) => `<span class="history-reaction-chip">${emoji}${count > 1 ? `<span class="reaction-count">${count}</span>` : ''}</span>`)
            .join('');
        if (chips) reactionRow = `<div class="history-reactions">${chips}</div>`;
    }

    return `${chapterDivider}
        <div class="history-entry ${isNarrator ? 'narrator' : ''} ${msg.isOptionResult ? 'option-result' : ''}${isFav ? ' is-favorite' : ''}">
            <div class="history-speaker">
                ${msg.charAvatar && !isNarrator ? `<img src="${escapeHtml(msg.charAvatar)}" alt="Avatar en historial de ${escapeHtml(speaker)}" style="width: 35px; height: 35px; border-radius: 50%; object-fit: cover; border: 2px solid var(--accent-gold);">` : ''}
                ${escapeHtml(speaker)}${edited}${optionResult}${favBadge}
            </div>
            <div class="history-text">${formatText(msg.text)}</div>
            ${reactionRow}
            <div class="history-timestamp">${date} • Mensaje ${idx + 1}</div>
        </div>
    `;
}

function renderVirtualizedHistory(msgs, container) {
    const rowHeight = 140;
    const overscan = 10;

    container.innerHTML = '<div id="historyVirtualSpacer" style="position: relative; width: 100%;"></div>';
    const spacer = container.querySelector('#historyVirtualSpacer');
    if (!spacer) return;

    spacer.style.height = `${msgs.length * rowHeight}px`;
    historyVirtualState = { rowHeight, overscan, msgs, spacer, container };

    const paint = () => {
        const state = historyVirtualState;
        if (!state) return;

        const viewportHeight = state.container.clientHeight || 500;
        const scrollTop = state.container.scrollTop;
        const firstVisible = Math.floor(scrollTop / state.rowHeight);
        const visibleCount = Math.ceil(viewportHeight / state.rowHeight);

        const start = Math.max(0, firstVisible - state.overscan);
        const end = Math.min(state.msgs.length, firstVisible + visibleCount + state.overscan);

        const html = state.msgs.slice(start, end).map((msg, relativeIdx) => {
            const absoluteIdx = start + relativeIdx;
            return `<div style="position:absolute;left:0;right:0;top:${absoluteIdx * state.rowHeight}px;">${buildHistoryEntry(msg, absoluteIdx)}</div>`;
        }).join('');

        state.spacer.innerHTML = html;
    };

    container.onscroll = paint;

    // Fix 8: when user scrolls to the very top, attempt to load older messages from Supabase
    container.addEventListener('scroll', function _olderMsgsHandler() {
        if (container.scrollTop > 40) return;
        if (!currentTopicId || typeof SupabaseMessages === 'undefined') return;
        if (!SupabaseMessages.loadOlderMessages) return;
        if (container.dataset.loadingOlder === '1') return;
        const allMsgs = getTopicMessages(currentTopicId);
        if (!allMsgs.length) return;
        const oldest = allMsgs[0].timestamp;
        if (!oldest) return;
        container.dataset.loadingOlder = '1';
        SupabaseMessages.loadOlderMessages(currentTopicId, oldest)
            .then(function (older) {
                if (!Array.isArray(older) || older.length === 0) return;
                const existingIds = new Set(allMsgs.map(function (m) { return String(m.id); }));
                const novel = older.filter(function (m) { return m.id && !existingIds.has(String(m.id)); });
                if (novel.length > 0) {
                    novel.forEach(function (m) { allMsgs.unshift(m); });
                    allMsgs.sort(function (a, b) { return new Date(a.timestamp) - new Date(b.timestamp); });
                    appData.messages[currentTopicId] = allMsgs;
                    if (historyVirtualState) {
                        historyVirtualState.msgs = allMsgs;
                        historyVirtualState.spacer.style.height = (allMsgs.length * historyVirtualState.rowHeight) + 'px';
                        paint();
                    }
                    showSyncToast(novel.length + ' mensaje(s) anteriores cargados', 'OK');
                }
            })
            .finally(function () { container.dataset.loadingOlder = '0'; });
    }, { passive: true });
    paint();
}

function openHistoryLog() {
    // Resetear a pestaña "Todos" al abrir para consistencia
    if (typeof currentHistoryTab !== 'undefined') {
        currentHistoryTab = 'all';
        document.getElementById('histTabAll')?.classList.add('active');
        document.getElementById('histTabFav')?.classList.remove('active');
    }

    // Usar renderHistoryContent si está disponible (soporta pestañas favoritos)
    if (typeof renderHistoryContent === 'function') {
        openModal('historyModal');
        renderHistoryContent();
        return;
    }

    // Fallback: renderizado directo sin pestañas
    const msgs = getTopicMessages(currentTopicId);
    const container = document.getElementById('historyContent');
    if (!container) return;

    if (msgs.length === 0) {
        container.onscroll = null;
        container.innerHTML = '<div style="text-align: center; color: var(--text-muted); padding: 2rem;">No hay mensajes en esta historia.</div>';
    } else {
        renderVirtualizedHistory(msgs, container);
    }
    openModal('historyModal');
}


// ============================================
// RESPUESTAS (Reply Panel)
// ============================================
function getCurrentTopic() {
    return appData.topics.find(t => t.id === currentTopicId);
}

function canUseNarratorMode(topic) {
    if (!topic || topic.mode !== 'rpg') return true;
    return topic.createdByIndex === currentUserIndex;
}

function getTopicLockedCharacterId(topic) {
    if (!topic) return null;
    const locks = topic.characterLocks || {};
    const lockByUser = locks[currentUserIndex];
    if (lockByUser) return lockByUser;

    // Compatibilidad con lock RPG legado
    const legacyRpgLocks = topic.rpgCharacterLocks || {};
    if (legacyRpgLocks[currentUserIndex]) return legacyRpgLocks[currentUserIndex];

    // Compatibilidad con lock clásico legado del creador
    if (topic.mode === 'roleplay' && topic.roleCharacterId && topic.createdByIndex === currentUserIndex) {
        return topic.roleCharacterId;
    }

    return null;
}

function persistTopicLockedCharacter(topic, charId) {
    if (!topic || !charId) return;
    topic.characterLocks = topic.characterLocks || {};
    if (topic.characterLocks[currentUserIndex]) return;
    topic.characterLocks[currentUserIndex] = charId;

    // Mantener compatibilidad con lector legacy RPG
    if (topic.mode === 'rpg') {
        topic.rpgCharacterLocks = topic.rpgCharacterLocks || {};
        if (!topic.rpgCharacterLocks[currentUserIndex]) {
            topic.rpgCharacterLocks[currentUserIndex] = charId;
        }
    }

    hasUnsavedChanges = true;
    save({ silent: true });
}

function getCharacterById(charId) {
    return appData.characters.find(c => c.id === charId);
}

function tickRpgKnockoutTurns(excludedCharId) {
    let anyChanged = false;
    appData.characters.forEach((ch) => {
        const profile = typeof ensureCharacterRpgProfile === 'function' ? ensureCharacterRpgProfile(ch, currentTopicId || null) : null;
        if (!profile || profile.knockedOutTurns <= 0) return;
        if (excludedCharId && String(ch.id) === String(excludedCharId)) return;
        profile.knockedOutTurns = Math.max(0, profile.knockedOutTurns - 1);
        anyChanged = true;
    });
    if (anyChanged) { hasUnsavedChanges = true; save({ silent: true }); }
}

function applyRpgNarrativeProgress(charId, oracleRoll) {
    if (!charId || !oracleRoll) return;
    const char = getCharacterById(charId);
    if (!char || typeof ensureCharacterRpgProfile !== 'function') return;

    const profile = ensureCharacterRpgProfile(char, currentTopicId || null);

    if (oracleRoll.result === 'fumble') {
        profile.hp = Math.max(0, profile.hp - 2);
        if (profile.hp === 0) profile.knockedOutTurns = 5;
    } else if (oracleRoll.result === 'fail') {
        profile.hp = Math.max(0, profile.hp - 1);
        if (profile.hp === 0) profile.knockedOutTurns = 5;
    } else if (oracleRoll.result === 'success') {
        profile.exp += 1;
        if (profile.exp >= 10) { profile.exp = 0; profile.level += 1; }
    } else if (oracleRoll.result === 'critical') {
        profile.exp += 2;
        if (profile.exp >= 10) { profile.exp = 0; profile.level += 1; }
    }
    // Persistir cambios de perfil RPG inmediatamente
    hasUnsavedChanges = true;
    save({ silent: true });
}

// ============================================
// ============================================
// MODO CLÁSICO — CAPÍTULOS
// ============================================
function getNextChapterNumber() {
    const msgs = getTopicMessages(currentTopicId);
    return msgs.filter(m => m.chapter).length + 1;
}

function updateChapterPreview() {
    const preview = document.getElementById('chapterPreview');
    if (!preview) return;
    if (!pendingChapter) {
        preview.style.display = 'none';
        preview.textContent = '';
        return;
    }
    preview.style.display = 'inline-flex';
    preview.textContent = `${pendingChapter.title}`;
}

function prepareChapter() {
    const topic = getCurrentTopic();
    if (!canUseNarratorMode(topic)) {
        showAutosave('Activa Modo Narrador para marcar capítulos', 'error');
        return;
    }
    const num    = getNextChapterNumber();
    const def    = `Capítulo ${['I','II','III','IV','V','VI','VII','VIII','IX','X'][num - 1] || num}`;
    const titleRaw = window.prompt(`Título del capítulo ${num}:`, def);
    if (titleRaw === null) return;
    const title = String(titleRaw || '').trim() || def;

    // Opcionalmente cambiar el fondo de escena
    const backgroundRaw = window.prompt('URL del fondo para este capítulo (opcional, deja vacío para mantener el actual):', '');
    if (backgroundRaw === null) return;
    const background = backgroundRaw.trim()
        ? resolveTopicBackgroundPath(backgroundRaw.trim())
        : null;

    pendingChapter = { title, number: num };
    if (background) {
        pendingSceneChange = { title, background, at: new Date().toISOString() };
        updateSceneChangePreview();
    }
    updateChapterPreview();
    if (typeof _updateNarratePending === 'function') _updateNarratePending();
    showAutosave(`📖 ${title} preparado`, 'saved');
}

function showChapterReveal(chapterData) {
    if (!chapterData) return;
    const banner = document.getElementById('vnChapterReveal');
    const titleEl = document.getElementById('vnChapterRevealTitle');
    if (!banner || !titleEl) return;
    titleEl.textContent = chapterData.title;
    banner.classList.add('active');
    setTimeout(() => { banner.classList.remove('active'); }, 2400);
}

// ============================================
// MODO CLÁSICO — PANEL DE FICHA DE PERSONAJE
// ============================================

function updateClassicLiteraryPanel() {
    // El badge 📋 está en la name-row — lo controlamos por su ID
    const badge = document.getElementById('vnInfoClassicToggleBtn');
    if (!badge) return;

    if (currentTopicMode === 'rpg') {
        badge.classList.add('hidden');
        return;
    }

    const msgs = getTopicMessages(currentTopicId);
    const msg  = msgs[currentMessageIndex];
    if (!msg || msg.isNarrator || !msg.characterId) {
        badge.classList.add('hidden');
        return;
    }

    const char = appData.characters.find(c => String(c.id) === String(msg.characterId));
    badge.classList.toggle('hidden', !char);
}

// Abre el fichaModal compacto (tipo Stats RPG) con el personaje del diálogo activo
function openVnActiveCharSheet() {
    const msgs = getTopicMessages(currentTopicId);
    const msg  = msgs[currentMessageIndex];
    if (!msg || !msg.characterId) return;
    const char = appData.characters.find(c => String(c.id) === String(msg.characterId));
    if (!char) return;

    // Rellenar avatar
    const avatarEl = document.getElementById('fichaModalAvatar');
    if (avatarEl) {
        // XSS fix: DOM construction avoids name injection in onerror
        if (char.avatar) {
            const _imgFicha = document.createElement('img');
            _imgFicha.src = char.avatar;
            _imgFicha.alt = char.name;
            _imgFicha.onerror = function () {
                this.style.display = 'none';
                this.parentElement.textContent = (char.name || '?')[0];
            };
            avatarEl.innerHTML = '';
            avatarEl.appendChild(_imgFicha);
        } else {
            avatarEl.textContent = (char.name || '?')[0];
        }
    }

    // Nombre y propietario
    const nameEl  = document.getElementById('fichaModalName');
    const ownerEl = document.getElementById('fichaModalOwner');
    if (nameEl)  nameEl.textContent  = `${char.name}${char.lastName ? ' ' + char.lastName : ''}`;
    if (ownerEl) ownerEl.textContent = `Por ${char.owner || (typeof userNames !== 'undefined' && userNames[char.userIndex]) || '—'}`;

    // Cuerpo: grid de datos básicos
    const bodyEl = document.getElementById('fichaModalBody');
    if (bodyEl) {
        const rows = [
            char.age       && { label: 'Edad',       val: char.age,        full: false },
            char.race      && { label: 'Raza',        val: char.race,       full: false },
            char.gender    && { label: 'Género',      val: char.gender,     full: false },
            char.alignment && { label: 'Alineación',  val: (typeof alignments !== 'undefined' && alignments[char.alignment]) || char.alignment, full: false },
            char.job       && { label: 'Ocupación',   val: char.job,        full: false },
            char.basic     && { label: 'Descripción', val: char.basic.slice(0, 180) + (char.basic.length > 180 ? '…' : ''), full: true, italic: true },
        ].filter(Boolean);

        bodyEl.innerHTML = rows.map(r => `
            <div class="ficha-modal-row${r.full ? ' full-width' : ''}">
                <span class="ficha-modal-label">${r.label}</span>
                <span class="ficha-modal-value${r.italic ? ' italic' : ''}">${escapeHtml(String(r.val))}</span>
            </div>
        `).join('');
    }

    if (typeof openModal === 'function') openModal('fichaModal');
}

function toggleCharacterInfoPanel() {
    const panel = document.getElementById('vnCharInfoPanel');
    if (!panel) return;
    if (panel.style.display !== 'none') {
        closeCharacterInfoPanel();
    } else {
        openCharacterInfoPanel();
    }
}

function openCharacterInfoPanel() {
    const msgs = getTopicMessages(currentTopicId);
    const msg  = msgs[currentMessageIndex];
    if (!msg || !msg.characterId) return;
    const char = appData.characters.find(c => String(c.id) === String(msg.characterId));
    if (!char) return;

    _renderCharInfoPanel(char);
    const panel = document.getElementById('vnCharInfoPanel');
    if (panel) {
        panel.style.display = 'flex';
        setTimeout(() => panel.classList.add('char-panel-visible'), 10);
    }

    setTimeout(() => {
        document.addEventListener('click', _closeCharPanelOnOutside, { once: true, capture: true });
    }, 50);
}

function closeCharacterInfoPanel() {
    const panel = document.getElementById('vnCharInfoPanel');
    if (panel) {
        panel.classList.remove('char-panel-visible');
        setTimeout(() => {
            if (!panel.classList.contains('char-panel-visible')) {
                panel.style.display = 'none';
            }
        }, 220);
    }
}

function _closeCharPanelOnOutside(e) {
    const panel = document.getElementById('vnCharInfoPanel');
    const btn   = document.getElementById('vnInfoClassicToggleBtn');
    if (!panel) return;
    if (!panel.contains(e.target) && e.target !== btn && !btn?.contains(e.target)) {
        closeCharacterInfoPanel();
    }
}

function _renderCharInfoPanel(char) {
    if (!char) return;
    const nameEl = document.getElementById('vnCharInfoName');
    const bodyEl = document.getElementById('vnCharInfoBody');
    const relEl  = document.getElementById('vnCharInfoRelations');

    if (nameEl) nameEl.textContent = `${char.name}${char.lastName ? ' ' + char.lastName : ''}`;

    // ── DATOS DE LA FICHA ─────────────────────
    if (bodyEl) {
        const fields = [
            char.age       && { label: 'Edad',       val: char.age },
            char.race      && { label: 'Raza',       val: char.race },
            char.gender    && { label: 'Género',     val: char.gender },
            char.job       && { label: 'Ocupación',  val: char.job },
            char.alignment && { label: 'Alineación', val: (typeof alignments !== 'undefined' && alignments[char.alignment]) || char.alignment },
        ].filter(Boolean);

        const fieldsHtml = fields.map(f =>
            `<div class="cip-row"><span class="cip-label">${f.label}</span><span class="cip-val">${escapeHtml(String(f.val))}</span></div>`
        ).join('');

        const basicHtml = char.basic
            ? `<div class="cip-basic">"${escapeHtml(char.basic.slice(0, 200))}${char.basic.length > 200 ? '…' : ''}"</div>`
            : '';

        bodyEl.innerHTML = fieldsHtml + basicHtml;
    }

    // ── TODAS LAS RELACIONES EN LA PARTIDA ─────
    if (relEl && currentTopicId) {
        const msgs = getTopicMessages(currentTopicId);
        const topicAffinities = (appData.affinities || {})[currentTopicId] || {};
        const charIdStr = String(char.id);

        const appearedIds = [...new Set(msgs.filter(m => m.characterId).map(m => String(m.characterId)))];
        const relations = appearedIds
            .filter(id => id !== charIdStr)
            .map(id => {
                const key   = [charIdStr, id].sort().join('_');
                const value = Number(topicAffinities[key] || 0);
                const other = appData.characters.find(c => String(c.id) === id);
                return other ? { char: other, value } : null;
            })
            .filter(Boolean)
            .sort((a, b) => b.value - a.value);

        if (!relations.length) {
            relEl.innerHTML = '<div class="cip-no-rel">Sin relaciones registradas aún</div>';
        } else {
            const getR = (v) => (typeof affinityRanks !== 'undefined')
                ? (affinityRanks.find(r => v >= r.min && v <= r.max) || { name: 'Desconocidos', color: '#888' })
                : { name: '—', color: '#888' };

            const rowsHtml = relations.map(({ char: other, value }) => {
                const r   = getR(value);
                const pct = Math.max(4, value);
                // XSS fix: use data-fallback; onerror wired after relEl.innerHTML
                const avatar = other.avatar
                    ? `<img src="${escapeHtml(other.avatar)}" alt="${escapeHtml(other.name)}" data-fallback="${escapeHtml((other.name || '?')[0])}" class="cip-rel-img">`
                    : `<span>${escapeHtml((other.name || '?')[0])}</span>`;
                return `
                <div class="cip-rel-row">
                    <div class="cip-rel-avatar" style="border-color:${r.color}">${avatar}</div>
                    <div class="cip-rel-info">
                        <div class="cip-rel-name">${escapeHtml(other.name)}</div>
                        <div class="cip-rel-rank" style="color:${r.color}">${r.name}</div>
                        <div class="cip-rel-bar"><div class="cip-rel-fill" style="width:${pct}%;background:${r.color}"></div></div>
                    </div>
                </div>`;
            }).join('');

            relEl.innerHTML = `<div class="cip-rel-header">Relaciones en esta historia</div>${rowsHtml}`;
            // XSS fix: bind onerror after DOM insertion
            relEl.querySelectorAll('img.cip-rel-img').forEach(function (img) {
                img.onerror = function () {
                    this.style.display = 'none';
                    this.parentElement.textContent = this.dataset.fallback || '?';
                };
            });
        }
    }
}

// ============================================
// BOTÓN DE NARRACIÓN FLOTANTE (escena/capítulo)
// ============================================

function updateNarrateButton() {
    const topic = getCurrentTopic();
    const isOwner = !topic || topic.createdByIndex === currentUserIndex
        || topic.createdByIndex === undefined
        || topic.createdByIndex === null;
    const isRpg = topic?.mode === 'rpg';

    // 🍺 Posada: caja de diálogo, solo RPG + owner
    const innBtn = document.getElementById('vnInnkeeperBtn');
    if (innBtn) innBtn.style.display = (isRpg && isOwner) ? 'inline-flex' : 'none';

    // ✒ Nueva escena: caja de diálogo, solo clásico + owner
    const narrateDialogBtn = document.getElementById('vnNarrateDialogBtn');
    if (narrateDialogBtn) narrateDialogBtn.style.display = (!isRpg && isOwner) ? 'inline-flex' : 'none';

    // ⚔️ Stats fijo: eliminado de la caja de diálogo — ahora solo en IHP panel (fijado)

    // ✒ Narrar en barra de controles: ya no necesario, quitar si existe
    const narrateCtrl = document.getElementById('vnNarrateBtn');
    if (narrateCtrl) narrateCtrl.style.display = 'none';

    _updateNarratePending();
}

function _updateNarratePending() {
    const el = document.getElementById('vnNarratePending');
    if (!el) return;
    const parts = [];
    if (pendingSceneChange) parts.push(`🎬 ${pendingSceneChange.title}`);
    if (pendingChapter)     parts.push(`📖 ${pendingChapter.title}`);
    if (parts.length) {
        el.style.display = 'block';
        el.innerHTML = parts.map(p => `<div class="narrate-pending-item">${escapeHtml(p)}</div>`).join('');
    } else {
        el.style.display = 'none';
    }
}

function openNarratePanel() {
    const panel = document.getElementById('vnNarratePanel');
    if (!panel) return;
    if (panel.style.display !== 'none') { closeNarratePanel(); return; }

    // En modo RPG el panel no se usa (Garrick tiene su propio botón)
    // En modo clásico solo mostramos la opción de escena libre
    const topic = getCurrentTopic();
    const isRpg = topic?.mode === 'rpg';
    const innkeeperOption = panel.querySelector('.vn-narrate-option[data-option="innkeeper"]');
    const freeOption      = panel.querySelector('.vn-narrate-option[data-option="free"]');
    if (innkeeperOption) innkeeperOption.style.display = isRpg ? 'flex' : 'none';
    if (freeOption)      freeOption.style.display      = 'flex'; // siempre visible

    panel.style.display = 'flex';
    _updateNarratePending();
    setTimeout(() => {
        document.addEventListener('click', _closeNarratePanelOnOutside, { once: true, capture: true });
    }, 50);
}

function closeNarratePanel() {
    const panel = document.getElementById('vnNarratePanel');
    if (panel) panel.style.display = 'none';
}

function _closeNarratePanelOnOutside(e) {
    const panel  = document.getElementById('vnNarratePanel');
    const trigger = document.querySelector('.vn-narrate-btn-inner');
    if (!panel) return;
    if (!panel.contains(e.target) && e.target !== trigger && !trigger?.contains(e.target)) {
        closeNarratePanel();
    }
}

function updateSceneChangePreview() {
    const preview = document.getElementById('sceneChangePreview');
    if (!preview) return;

    if (!pendingSceneChange) {
        preview.style.display = 'none';
        preview.textContent = '';
        return;
    }

    preview.style.display = 'inline-flex';
    preview.textContent = `Próxima escena: ${pendingSceneChange.title}`;
}

function prepareSceneChange() {
    const topic = getCurrentTopic();
    if (!topic) return;

    if (!isNarratorMode) {
        showAutosave('Activa Modo Narrador para cambiar de escena', 'error');
        return;
    }

    if (!canUseNarratorMode(topic)) {
        showAutosave('Solo quien crea la historia puede narrar en modo RPG', 'error');
        return;
    }

    const replyText = document.getElementById('vnReplyText');
    if (!replyText || !replyText.value.trim()) {
        showAutosave('Escribe el mensaje narrativo antes de cambiar escena', 'error');
        return;
    }

    const titleRaw = window.prompt('Nombre de la nueva escena (ej: Playa al atardecer):', 'Nueva escena');
    if (titleRaw === null) return;
    const title = String(titleRaw || '').trim() || 'Nueva escena';

    const backgroundRaw = window.prompt('URL de fondo para la escena (opcional, deja vacío para usar el fondo por defecto):', '');
    if (backgroundRaw === null) return;
    const background = resolveTopicBackgroundPath(String(backgroundRaw || '').trim());

    pendingSceneChange = {
        title,
        background,
        at: new Date().toISOString()
    };

    updateSceneChangePreview();
    if (typeof _updateNarratePending === 'function') _updateNarratePending();
    showAutosave(`Escena preparada: ${title}`, 'saved');
}

function applySceneChangeToTopic(topic, sceneChange) {
    if (!topic || !sceneChange) return;

    if (sceneChange.background) {
        topic.background = sceneChange.background;
    }

    if (topic.mode === 'rpg') {
        appData.characters.forEach((char) => {
            if (typeof ensureCharacterRpgProfile !== 'function') return;
            const profile = ensureCharacterRpgProfile(char, topic.id);
            if (!profile) return;
            profile.hp = 10;
            profile.knockedOutTurns = 0;
        });
    }

    const vnSection = document.getElementById('vnSection');
    applyTopicBackground(vnSection, topic.background || DEFAULT_TOPIC_BACKGROUND);
    playVnSceneTransition(vnSection);
}

function openReplyPanel() {
    markContinuousInteraction();
    const panel = document.getElementById('vnReplyPanel');
    if (!panel) return;

    // ── Mover el panel al <body> si sigue dentro de vnSection ────────────
    // position:fixed se rompe cuando un ancestro tiene filter: o transform:.
    // Al moverlo a body se garantiza que el overlay cubre el viewport real.
    if (panel.parentElement !== document.body) {
        document.body.appendChild(panel);
    }

    panel.style.display = 'flex';
    cancelContinuousRead('reply-open');
    // Drawer gestures no aplican al nuevo modal, pero mantenemos la llamada por compatibilidad
    bindReplyDrawerGestures();
    panel.classList.remove('drawer-expanded', 'drawer-collapsed');
    updateVnMobileFabVisibility();
    updateOracleFloatButton();

    const replyPanelTitle  = document.getElementById('replyPanelTitle');
    const submitBtn        = document.getElementById('submitReplyBtn');
    const optionsToggleContainer  = document.getElementById('optionsToggleContainer');
    const weatherSelectorContainer = document.getElementById('weatherSelectorContainer');
    const narratorToggle   = document.getElementById('narratorToggle');
    const vrpCharBadge     = document.getElementById('vrpCharBadge');

    // Título según contexto (editar vs responder)
    if (replyPanelTitle) replyPanelTitle.textContent = editingMessageId ? 'Editar Mensaje' : 'Responder';
    if (submitBtn) {
        const sendSpan = submitBtn.querySelector('span');
        if (sendSpan) sendSpan.textContent = editingMessageId ? 'Guardar Cambios' : 'Enviar Mensaje';
        submitBtn.onclick = editingMessageId ? saveEditedMessage : postVNReply;
    }

    // Badge con nombre del personaje activo
    if (vrpCharBadge && selectedCharId) {
        const activeChar = appData.characters.find(c => String(c.id) === String(selectedCharId));
        if (activeChar) vrpCharBadge.textContent = activeChar.name;
    }

    // Mostrar/ocultar opciones según modo
    if (optionsToggleContainer) {
        optionsToggleContainer.style.display = isRpgModeMode() ? 'none' : 'flex';
    }

    // Mostrar selector de clima siempre
    if (weatherSelectorContainer) {
        weatherSelectorContainer.style.display = 'block';
    }

    const topic = getCurrentTopic();
    setupOraclePanelForMode();
    const narratorAllowed = canUseNarratorMode(topic);
    if (narratorToggle) {
        narratorToggle.style.display = narratorAllowed ? 'flex' : 'none';
    }
    if (!narratorAllowed) {
        isNarratorMode = false;
        const narratorMode = document.getElementById('narratorMode');
        if (narratorMode) narratorMode.checked = false;
        if (narratorToggle) narratorToggle.classList.remove('active');
    }

    if (!editingMessageId) {
        const replyText = document.getElementById('vnReplyText');
        if (replyText) {
            replyText.value = '';
            vrpUpdatePreview();
            vrpAutoResize(replyText);
        }

        const enableOptions = document.getElementById('enableOptions');
        const optionsFields = document.getElementById('optionsFields');
        if (enableOptions) enableOptions.checked = false;
        if (optionsFields) optionsFields.classList.remove('active');

        for (let i = 1; i <= 3; i++) {
            const textInput = document.getElementById(`option${i}Text`);
            const contInput = document.getElementById(`option${i}Continuation`);
            if (textInput) textInput.value = '';
            if (contInput) contInput.value = '';
        }
        tempBranches = [];
    }

    updateCharSelector();
    updateSceneChangePreview();

    // Actualizar botones de clima (nuevos vrp-weather-btn)
    vrpSyncWeatherButtons();

    // Foco al textarea después de la animación de entrada
    setTimeout(() => {
        const replyText = document.getElementById('vnReplyText');
        if (replyText) replyText.focus();
    }, 240);
}

function closeReplyPanel() {
    const panel = document.getElementById('vnReplyPanel');
    if (panel) panel.style.display = 'none';
    emitTypingState(false);
    updateVnMobileFabVisibility();
    closeReplyEmotePopover();

    const replyText = document.getElementById('vnReplyText');
    if (replyText) replyText.value = '';

    isNarratorMode = false;
    editingMessageId = null;
    tempBranches = [];
    pendingSceneChange = null;
    updateSceneChangePreview();

    const narratorMode = document.getElementById('narratorMode');
    const charSelector = document.getElementById('charSelectorContainer');
    const narratorToggle = document.getElementById('narratorToggle');

    if (narratorMode) narratorMode.checked = false;
    if (charSelector) charSelector.style.display = 'flex';
    if (narratorToggle) narratorToggle.classList.remove('active');
    resetOraclePanelState();
    updateOracleFloatButton();
}

function toggleCharGrid() {
    if (isNarratorMode) return;
    const topic = getCurrentTopic();
    if (getTopicLockedCharacterId(topic)) return;
    const grid = document.getElementById('charGridDropdown');
    if (grid) grid.classList.toggle('active');
}

function updateCharSelector() {
    const mine = appData.characters.filter(c => c.userIndex === currentUserIndex);
    const display = document.getElementById('charSelectedDisplay');
    const nameEl = document.getElementById('charSelectedName');
    const grid = document.getElementById('charGridDropdown');

    if(!nameEl) return;

    if(mine.length === 0) {
        nameEl.textContent = 'Crea un personaje primero';
        if (grid) grid.innerHTML = '';
        return;
    }

    if (!selectedCharId) {
        const savedCharId = localStorage.getItem(`etheria_selected_char_${currentUserIndex}`);
        selectedCharId = savedCharId || mine[0]?.id;
    }

    const topic = getCurrentTopic();
    const lockedCharId = getTopicLockedCharacterId(topic);
    const isCharLocked = !!lockedCharId;

    if (isCharLocked) {
        const lockedChar = mine.find(c => c.id === lockedCharId);
        if (lockedChar) selectedCharId = lockedChar.id;
    }

    const currentChar = mine.find(c => c.id === selectedCharId) || mine[0];
    if (!currentChar) return;

    selectedCharId = currentChar.id;

    nameEl.textContent = currentChar.name;

    if (grid && !isCharLocked) {
        grid.innerHTML = mine.map(c => `
            <div class="char-grid-item ${c.id === selectedCharId ? 'selected' : ''}" onclick="selectCharFromGrid('${c.id}')">
                ${c.avatar ?
                    `<img src="${escapeHtml(c.avatar)}" alt="Avatar de ${escapeHtml(c.name)}" data-fallback="${escapeHtml((c.name || '?')[0])}" class="char-grid-img">` :
                    `<div class="placeholder">${c.name[0]}</div>`
                }
            </div>
        `).join('');
        // XSS fix: bind onerror on grid images after DOM insertion
        grid.querySelectorAll('img.char-grid-img').forEach(function (img) {
            img.onerror = function () {
                this.style.display = 'none';
                const _ph = document.createElement('div');
                _ph.className = 'placeholder';
                _ph.textContent = this.dataset.fallback || '?';
                this.parentElement.appendChild(_ph);
            };
        });
    } else if (grid) {
        grid.innerHTML = '';
        grid.classList.remove('active');
    }
}

function selectCharFromGrid(charId) {
    const topic = getCurrentTopic();
    if (getTopicLockedCharacterId(topic)) return;

    selectedCharId = charId;
    localStorage.setItem(`etheria_selected_char_${currentUserIndex}`, charId);
    updateCharSelector();

    const grid = document.getElementById('charGridDropdown');
    if (grid) grid.classList.remove('active');
}

function openSelectedCharacterStats() {
    const topic = getCurrentTopic();
    if (topic?.mode !== 'rpg') return;
    if (!selectedCharId || typeof openRpgStatsModal !== 'function') return;
    openRpgStatsModal(selectedCharId);
}

function toggleOptionsFields() {
    const cb = document.getElementById('enableOptions');
    const fields = document.getElementById('optionsFields');

    if (!fields) return;

    if (fields.classList.contains('active')) {
        fields.classList.remove('active');
        if (cb) cb.checked = false;
    } else {
        fields.classList.add('active');
        if (cb) cb.checked = true;

        if (tempBranches.length > 0) {
            tempBranches.forEach((branch, idx) => {
                if (idx < 3) {
                    const textInput = document.getElementById(`option${idx + 1}Text`);
                    const contInput = document.getElementById(`option${idx + 1}Continuation`);
                    if (textInput) textInput.value = branch.text || '';
                    if (contInput) contInput.value = branch.continuation || '';
                }
            });
        }
    }
}

function toggleNarratorMode() {
    const topic = getCurrentTopic();
    if (!canUseNarratorMode(topic)) return;

    const narratorMode = document.getElementById('narratorMode');
    const toggle       = document.getElementById('narratorToggle');

    // Toggle state: si el switch está activo se desactiva y viceversa
    isNarratorMode = toggle ? !toggle.classList.contains('active') : false;
    if (narratorMode) narratorMode.checked = isNarratorMode;

    const container = document.getElementById('charSelectorContainer');

    if (isNarratorMode) {
        if (container) container.style.display = 'none';
        if (toggle) toggle.classList.add('active');
        selectedCharId = null;
    } else {
        if (container) container.style.display = 'flex';
        if (toggle) toggle.classList.remove('active');
        updateCharSelector();
    }
}


async function notifyNextTurnIfNeeded(newMsg, topic, char) {
    if (!currentStoryId) return;
    if (typeof SupabaseTurnNotifications === 'undefined' || typeof SupabaseTurnNotifications.notifyTurn !== 'function') return;

    const participants = Array.isArray(currentStoryParticipants) ? currentStoryParticipants : [];
    const userIds = participants
        .map(p => p?.user_id)
        .filter(Boolean)
        .filter((uid, idx, arr) => arr.indexOf(uid) === idx);

    if (userIds.length < 2) return;

    const me = window._cachedUserId || null;
    if (!me) return;

    const myIndex = userIds.indexOf(me);
    if (myIndex === -1) return;

    const recipientUserId = userIds[(myIndex + 1) % userIds.length];
    if (!recipientUserId || recipientUserId === me) return;

    const topicTitle = topic?.title || 'historia colaborativa';
    const speaker = newMsg?.isNarrator ? 'Narrador' : (char?.name || newMsg?.charName || 'Jugador');
    const preview = String(newMsg?.text || '').replace(/\s+/g, ' ').slice(0, 110);

    await SupabaseTurnNotifications.notifyTurn({
        storyId: currentStoryId,
        topicId: currentTopicId,
        messageId: newMsg?.id || null,
        recipientUserId,
        title: '🎯 Te toca responder',
        body: `${speaker} respondió en ${topicTitle}: ${preview}${preview.length >= 110 ? '…' : ''}`,
        meta: {
            speaker,
            topicTitle,
            weather: currentWeather || null
        }
    });
}

function postVNReply() {
    const replyText = document.getElementById('vnReplyText');
    const text = replyText?.value.trim();
    emitTypingState(false);
    if(!text) { showAutosave('Escribe algo primero', 'error'); return; }

    const topic = getCurrentTopic();

    if (isNarratorMode && !canUseNarratorMode(topic)) { showAutosave('Solo quien crea la historia puede usar Narrador en modo RPG', 'error'); return; }

    let char = null;
    if(!isNarratorMode) {
        if(!selectedCharId) { showAutosave('Selecciona un personaje', 'error'); return; }
        char = appData.characters.find(c => c.id === selectedCharId);
        if (!char) { showAutosave('Personaje no encontrado', 'error'); return; }
        if (topic?.mode === 'rpg' && typeof ensureCharacterRpgProfile === 'function') {
            const profile = ensureCharacterRpgProfile(char, currentTopicId || null);
            if (profile.knockedOutTurns > 0) {
                showAutosave(`Este personaje está fuera de escena por ${profile.knockedOutTurns} turnos`, 'error');
                return;
            }
        }
        persistTopicLockedCharacter(topic, selectedCharId);
    }

    let options = null;
    const enableOptions = document.getElementById('enableOptions');
    if(enableOptions && enableOptions.checked && !isRpgModeMode()) {
        options = [];
        for(let i=1; i<=3; i++) {
            const textInput = document.getElementById(`option${i}Text`);
            const contInput = document.getElementById(`option${i}Continuation`);
            const t = textInput?.value.trim() || '';
            const c = contInput?.value.trim() || '';
            if(t && c) options.push({text: t, continuation: c});
        }
        if(options.length === 0) { showAutosave('Rellena al menos una opción con texto y continuación', 'error'); return; }
    }

    const topicMessages = getTopicMessages(currentTopicId);

    const sceneChange = pendingSceneChange || undefined;
    pendingSceneChange = null;
    updateSceneChangePreview();

    const finalText = sceneChange ? `🎬 **Escena: ${sceneChange.title}**\n${text}` : text;
    const oracleQuestionInput = document.getElementById('oracleMiniQuestion'); // fix: id correcto
    const shouldApplyOracle = oracleModeActive && isRpgTopicMode(topic?.mode);
    let oracleData;
    if (shouldApplyOracle) {
        const statValue = getOracleSelectedStatValue();
        const modifier = getOracleModifier(statValue);
        const dc = calculateOracleDifficulty();
        const roll = Math.floor(Math.random() * 20) + 1;
        const total = Math.max(1, Math.min(20, roll + modifier));
        const result = getOracleRollResult(roll, total);
        oracleData = {
            question: (oracleQuestionInput?.value || '').trim() || getOracleAutodetectedQuestion(text) || 'Pregunta al destino',
            stat: oracleStat,
            statValue,
            modifier,
            dc,
            roll,
            total,
            result,
            timestamp: Date.now()
        };
        showDiceResultOverlay({ roll, modifier, total, result, stat: oracleStat, statValue });
    }

    const newMsg = {
        id: (globalThis.crypto && typeof globalThis.crypto.randomUUID === 'function')
            ? globalThis.crypto.randomUUID()
            : `${Date.now()}_${Math.random().toString(16).slice(2)}`,
        characterId: isNarratorMode ? null : selectedCharId,
        charName: isNarratorMode ? 'Narrador' : char.name,
        charColor: isNarratorMode ? null : char.color,
        charAvatar: isNarratorMode ? null : char.avatar,
        charSprite: isNarratorMode ? null : char.sprite,
        text: finalText,
        isNarrator: isNarratorMode,
        userIndex: currentUserIndex,
        timestamp: new Date().toISOString(),
        options: options && options.length > 0 ? options : undefined,
        weather: currentWeather !== 'none' ? currentWeather : undefined,
        sceneChange: sceneChange,
        oracle: oracleData,
        tone: undefined,
        chapter: (topic?.mode !== 'rpg' && pendingChapter) ? pendingChapter : undefined,
    };

    if (sceneChange) {
        applySceneChangeToTopic(topic, sceneChange);
    }

    // Limpiar capítulo pendiente después de usarlo
    if (newMsg.chapter) {
        pendingChapter = null;
        updateChapterPreview();
    }

    if (topic?.mode === 'rpg') {
        tickRpgKnockoutTurns(isNarratorMode ? null : selectedCharId);
        applyRpgNarrativeProgress(isNarratorMode ? null : selectedCharId, oracleData);
    }

    topicMessages.push(newMsg);

    // Envío a Supabase (no bloquea — fallback local automático si falla)
    if (typeof SupabaseMessages !== 'undefined' && currentTopicId) {
        SupabaseMessages.send(currentTopicId, newMsg).catch(() => {});
    }

    notifyNextTurnIfNeeded(newMsg, topic, char).catch(() => {});

    // Notificar a Ethy del mensaje enviado
    window.dispatchEvent(new CustomEvent('etheria:message-sent', {
        detail: { text: newMsg.text || '' }
    }));

    hasUnsavedChanges = true;
    save({ silent: true });
    closeReplyPanel();
    currentMessageIndex = getTopicMessages(currentTopicId).length - 1;
    triggerDialogueFadeIn();
    showCurrentMessage('forward');
}

// ============================================

function toggleContinuousReading(enabled) {
    continuousReadEnabled = !!enabled;
    markContinuousInteraction();
    localStorage.setItem('etheria_continuous_read', continuousReadEnabled ? '1' : '0');
    if (!continuousReadEnabled) {
        cancelContinuousRead('disabled');
        return;
    }
    scheduleContinuousReadIfNeeded(getTopicMessages(currentTopicId)[currentMessageIndex]);
}

function updateContinuousReadDelay(seconds) {
    continuousReadDelaySec = Math.max(3, Math.min(5, Number(seconds) || 4));
    localStorage.setItem('etheria_continuous_delay', String(continuousReadDelaySec));
    const valEl = document.getElementById('optContinuousDelayVal');
    if (valEl) valEl.textContent = `${continuousReadDelaySec}s`;
}

if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
            cancelContinuousRead('hidden');
            return;
        }
        if (continuousReadEnabled) scheduleContinuousReadIfNeeded(getTopicMessages(currentTopicId)[currentMessageIndex]);
    });
}

if (typeof window !== 'undefined') {
    window.etheriaDebug = window.etheriaDebug || {};
    window.etheriaDebug.logRenderTimes = false;
    window.etheriaDebug.simulateLowMemory = function () {
        document.querySelectorAll('.vn-sprite').forEach((s) => { s.style.animation = 'none'; });
    };
    window.etheriaDebug.simulateOffline = function () {
        if (typeof SupabaseMessages !== 'undefined') SupabaseMessages.unsubscribe();
        if (typeof isOfflineMode !== 'undefined') isOfflineMode = true;
    };
};

// ============================================
// SISTEMA DEL POSADERO — GARRICK
// La Chimenea Rota
// ============================================

const GARRICK = {
    id: '__garrick__',
    name: 'Garrick',
    subtitle: 'La Chimenea Rota',
    color: 'rgba(160, 100, 40, 0.9)',
    colorFull: '#a06428',
};

// Diálogos por fase — cada uno con variantes aleatorias
// fase: 'arrival' | 'night' | 'morning' | 'hp_full' | 'hp_low' | 'farewell'
const GARRICK_DIALOGUES = {

    arrival: [
        `*La puerta cruje. El fuego en la chimenea no se inmuta.* El camino os ha dejado su firma encima. No hace falta que lo digáis. **Las camas están al fondo. La sopa, en el caldero.** Si queréis algo más, decídmelo antes de que me siente.`,
        `*Deja el paño sobre la barra sin mirar hacia la puerta.* El fuego arde. Las camas existen. Lo que traéis de afuera, dejadlo en el umbral — aquí no entra el camino. **Hay sitio para todos los que paguen o para los que no molesten.** Vosotros parecéis de los segundos.`,
        `*Lleva años leyendo llegadas en la forma en que se abre una puerta.* Cansancio real, no el de los que buscan excusa. **Bien.** Eso significa que esta noche dormiréis. La chimenea no hace preguntas, el colchón tampoco.`,
        `*Alza los ojos del libro de cuentas. Los baja otra vez.* Hay espacio. Hay fuego. Hay silencio, si se lo cuidáis. **Lo que necesitéis está donde siempre ha estado.** Lo que no esté, no lo tengo.`,
    ],

    night: [
        `*El fuego ya es brasas. La posada respira despacio.* Las heridas que no arden ya no sangran. Las que sí... el sueño las conoce mejor que yo. **Descansad.** El camino no os espera esta noche — eso es suficiente.`,
        `*Apaga la última vela de la barra sin mirar hacia las habitaciones.* He visto a gente marcharse de aquí peor de como llegó por no saber cuándo parar. **Vosotros paráis esta noche.** Eso ya es saber algo que muchos no aprenden nunca.`,
        `*Solo queda el crepitar de las brasas y el peso del silencio.* El cuerpo recuerda lo que la cabeza olvida cuando está ocupada. **Esta noche, recordad.** Mañana el camino tendrá opinión. Ahora, no.`,
        `*Pone el pestillo sin hacer ruido.* Los que duermen aquí suelen salir mejor de como entraron. No es magia — es lo que hace el silencio cuando se le da tiempo. **Buenas noches. O lo que quede de ellas.**`,
    ],

    morning: [
        `*El olor a pan recién hecho llega antes que la luz.* Las brasas llevan horas trabajando para vosotros. **Levantaos.** El camino os devuelve lo que le disteis anoche — solo que con intereses.`,
        `*Ya tiene la bolsa de provisiones en la barra cuando bajáis.* No tengo discursos de despedida. **El fuego os ha hecho el favor que podía.** Lo que hagáis con eso es cosa vuestra.`,
        `*Sirve el desayuno sin que se lo pidan.* He visto partir a suficiente gente como para saber que los que se van bien desayunados duran más. **Comed. Luego salid. En ese orden.**`,
        `*Limpia el mostrador sin mirar hacia las escaleras.* El camino os espera igual que os dejó anoche — solo que vosotros ya no sois exactamente los mismos. **Eso, a veces, es suficiente ventaja.**`,
    ],

    hp_full: [
        `*Os mira de arriba abajo. Apenas una fracción de segundo.* No estáis heridos. **Entonces el fuego esta noche es lujo, no necesidad.** Igual de bienvenido. Pero que conste que lo sé.`,
        `*Deja la llave encima de la barra sin comentario.* Venís enteros. Raro, pero existe. **Aprovechadlo — el camino tiene memoria y la usa cuando menos conviene.**`,
    ],

    hp_low: [
        `*Hace un gesto mínimo hacia las sillas más cercanas al fuego.* Las heridas que entran aquí tienen la costumbre de quedarse un poco menos cuando salen. **Sentaos cerca del calor.** No lo explico, solo lo he visto.`,
        `*Sin drama, sin comentario. Solo deja vendas limpias en la habitación.* He aprendido a no preguntar cómo. Solo cuenta el cuánto y el ahora. **El fuego sabe lo que hace. Dejad que trabaje.**`,
        `*El fuego arde un poco más alto esta noche. No es coincidencia.* El camino os ha cobrado. **La chimenea os devuelve lo que puede.** El resto, el sueño.`,
    ],

    farewell: [
        `*No levanta la vista del libro de cuentas.* El camino os llama. **Bien.** Aquí estará cuando volváis — o cuando llegue quien venga después. La chimenea no tiene favoritos.`,
        `*Un gesto seco con la barbilla hacia la puerta.* Habéis descansado lo que necesitabais. **Eso ya es más de lo que muchos consiguen.** Id.`,
        `*Solo dice esto, sin mirar:* Las cenizas de esta noche fueron vuestras. Las del camino que viene... esas aún no tienen nombre. **Bien. Así debe ser.**`,
        `*Coloca algo en la barra — provisiones, sin pedir nada a cambio.* Por si el camino se alarga más de lo previsto. **No es generosidad. Es pragmatismo.** Un cliente que llega es mejor que uno que no llega.`,
    ],
};

function _garrickPick(phase) {
    const pool = GARRICK_DIALOGUES[phase] || GARRICK_DIALOGUES.arrival;
    return pool[Math.floor(Math.random() * pool.length)];
}

function _garrickHpPhase() {
    // Evalúa el HP del personaje activo del usuario actual
    const char = appData.characters.find(c => c.id === selectedCharId);
    if (!char || typeof ensureCharacterRpgProfile !== 'function') return 'arrival';
    const profile = ensureCharacterRpgProfile(char, currentTopicId || null);
    const hp = profile?.hp ?? 10;
    const maxHp = 10;
    if (hp >= maxHp) return 'hp_full';
    if (hp <= 4)  return 'hp_low';
    return null; // herido pero moderado — no cambia el diálogo de llegada
}

function _postGarrickMessage(text, isLast = false) {
    const topicMessages = getTopicMessages(currentTopicId);
    const newMsg = {
        id: (globalThis.crypto?.randomUUID?.()) || `${Date.now()}_${Math.random().toString(16).slice(2)}`,
        characterId: null,
        charName: GARRICK.name,
        charColor: GARRICK.color,
        charAvatar: null,
        charSprite: null,
        text,
        isNarrator: true,
        isGarrick: true,
        isGarrickFarewell: isLast,
        userIndex: currentUserIndex,
        timestamp: new Date().toISOString(),
    };
    topicMessages.push(newMsg);
    if (typeof SupabaseMessages !== 'undefined' && currentTopicId) {
        SupabaseMessages.send(currentTopicId, newMsg).catch(() => {});
    }
    return newMsg;
}

function triggerInnkeeperScene() {
    const topic = getCurrentTopic();
    if (!topic || !canUseNarratorMode(topic)) {
        showAutosave('Solo el narrador puede invocar al posadero', 'error');
        return;
    }
    if (topic.mode !== 'rpg') {
        showAutosave('El posadero solo aparece en partidas RPG', 'error');
        return;
    }

    // 1. Pedir título del nuevo capítulo (igual que prepareChapter)
    const num = getNextChapterNumber();
    const def = `Capítulo ${['I','II','III','IV','V','VI','VII','VIII','IX','X'][num - 1] || num}`;
    const titleRaw = window.prompt(`Título del capítulo ${num}:`, def);
    if (titleRaw === null) return;
    const title = String(titleRaw || '').trim() || def;

    // 2. Fondo de escena opcional
    const backgroundRaw = window.prompt('URL del fondo para esta escena (opcional — deja vacío para el fondo actual):', '');
    if (backgroundRaw === null) return;
    const background = backgroundRaw.trim()
        ? resolveTopicBackgroundPath(backgroundRaw.trim())
        : null;

    // 3. Preparar el capítulo como siempre (restaura HP en applySceneChangeToTopic)
    pendingChapter = { title, number: num };
    if (background) {
        pendingSceneChange = { title, background, at: new Date().toISOString() };
    }
    updateChapterPreview();

    // 4. Calcular estado del personaje activo ANTES de restaurar HP
    const char = appData.characters.find(c => c.id === selectedCharId);
    let hpPhase = 'arrival';
    let hpBefore = 10;
    if (char && typeof ensureCharacterRpgProfile === 'function') {
        const profile = ensureCharacterRpgProfile(char, currentTopicId || null);
        hpBefore = profile?.hp ?? 10;
        const override = _garrickHpPhase();
        if (override) hpPhase = override;
    }

    // 5. Publicar los tres mensajes de Garrick en secuencia
    hasUnsavedChanges = true;

    // Aplicar el cambio de escena YA (restaura HP, cambia fondo)
    if (pendingSceneChange) {
        applySceneChangeToTopic(topic, pendingSceneChange);
        pendingSceneChange = null;
        updateSceneChangePreview();
    } else {
        // Sin cambio de fondo pero igual restaurar HP
        if (topic.mode === 'rpg') {
            appData.characters.forEach((ch) => {
                if (typeof ensureCharacterRpgProfile !== 'function') return;
                const p = ensureCharacterRpgProfile(ch, topic.id);
                if (p) { p.hp = 10; p.knockedOutTurns = 0; }
            });
        }
    }

    // Mensaje 1: llegada
    const arrivalText = _garrickPick(hpPhase === 'hp_full' ? 'hp_full' : hpPhase === 'hp_low' ? 'hp_low' : 'arrival');
    const arrivalMsg = _postGarrickMessage(arrivalText);
    // Vincular el capítulo al primer mensaje de Garrick
    arrivalMsg.chapter = pendingChapter;
    pendingChapter = null;
    updateChapterPreview();

    // Mensaje 2: noche
    const nightMsg = _postGarrickMessage(_garrickPick('night'));

    // Mensaje 3: despedida (mañana) — marca que el HP ya está restaurado
    const farewellMsg = _postGarrickMessage(_garrickPick(hpBefore < 10 ? 'morning' : 'farewell'), true);

    save({ silent: true });

    // Mostrar el primer mensaje y dejar que el líder narrador continúe
    currentMessageIndex = getTopicMessages(currentTopicId).length - 3; // ir al primer mensaje de Garrick
    triggerDialogueFadeIn();
    showCurrentMessage('forward');

    showAutosave(`🍺 Garrick ha hablado — HP restaurado. Ahora usa el Narrador para continuar.`, 'saved');
    if (typeof updateAffinityDisplay === 'function') updateAffinityDisplay();
    if (typeof updateNarrateButton === 'function') updateNarrateButton();
}

// ═══════════════════════════════════════════════════════════════════════════
// VRP (Modal Responder v2) — helpers: Markdown preview, auto-resize, clima
// ═══════════════════════════════════════════════════════════════════════════

/** Mapa de emotes para el preview */
const _VRP_EMOTE_MAP = {
    angry: '💢', happy: '✨', shock: '💦', sad: '💧', think: '💭',
    love: '💕', annoyed: '💢', embarrassed: '😳', idea: '💡', sleep: '💤'
};

/**
 * Convierte texto con Markdown básico y comandos /emote a HTML para el preview.
 * No usa dependencias externas — regex ligero.
 */
function vrpRenderMarkdown(text) {
    if (!text) return '';

    let html = text
        // Escapar HTML básico para evitar XSS
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        // Negrita: **texto** o __texto__
        .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
        .replace(/__(.+?)__/g, '<strong>$1</strong>')
        // Cursiva: *texto* o _texto_ (no seguido de otro *)
        .replace(/\*(?!\*)(.+?)(?<!\*)\*/g, '<em>$1</em>')
        .replace(/_(?!_)(.+?)(?<!_)_/g, '<em>$1</em>')
        // Comandos de emote: /angry → 💢 con clase animada
        .replace(/\/(angry|happy|shock|sad|think|love|annoyed|embarrassed|idea|sleep)\b/gi,
            (_, cmd) => {
                const sym = _VRP_EMOTE_MAP[cmd.toLowerCase()] || '';
                return `<span class="emote-tag" title="/${cmd}">${sym}</span>`;
            })
        // Saltos de línea
        .replace(/\n/g, '<br>');

    return html;
}

/** Actualiza el panel de preview con el contenido actual del textarea */
function vrpUpdatePreview() {
    const textarea = document.getElementById('vnReplyText');
    const preview  = document.getElementById('vrpPreviewContent');
    const hint     = document.getElementById('vrpPreviewHint');
    if (!textarea || !preview) return;

    const raw = textarea.value;
    const rendered = vrpRenderMarkdown(raw);
    preview.innerHTML = rendered || '';

    if (hint) {
        hint.textContent = raw.length > 0
            ? `${raw.length} car.`
            : 'Empieza a escribir…';
    }
}

/** Auto-resize del textarea: crece con el contenido hasta max-height CSS */
function vrpAutoResize(el) {
    if (!el) return;
    // Reset para calcular correctamente scrollHeight
    el.style.height = 'auto';
    // Aplicar la altura real del contenido (respeta max-height del CSS)
    const maxH = parseInt(getComputedStyle(el).maxHeight || '260', 10);
    const newH = Math.min(el.scrollHeight, maxH);
    el.style.height = newH + 'px';
    // Si el contenido supera el max, activar scroll interno
    el.style.overflowY = el.scrollHeight > maxH ? 'auto' : 'hidden';
}

/** Toggle de preview en portrait: muestra/oculta el preview pane */
function vrpTogglePreview() {
    const previewPane   = document.getElementById('vrpPreviewPane');
    const toggleBtn     = document.getElementById('vrpPreviewToggle');
    if (!previewPane || !toggleBtn) return;

    const isVisible = previewPane.classList.contains('vrp-preview-visible');
    previewPane.classList.toggle('vrp-preview-visible', !isVisible);
    toggleBtn.classList.toggle('active', !isVisible);

    if (!isVisible) {
        // Al abrir el preview, actualizar contenido
        vrpUpdatePreview();
        toggleBtn.textContent = '✕ Cerrar vista previa';
    } else {
        toggleBtn.innerHTML = '<span>👁</span> Ver vista previa';
    }
}

/** Sincroniza los botones de clima del nuevo modal con el estado actual */
function vrpSyncWeatherButtons() {
    document.querySelectorAll('.vrp-weather-btn').forEach(btn => {
        const w = btn.dataset.weather;
        const isActive = (w === 'none' && (currentWeather === 'none' || !currentWeather))
                      || (w === currentWeather);
        btn.classList.toggle('active', isActive);
    });
}

/** Marca el botón de clima clicado como activo (llamado desde onclick del HTML) */
function vrpSetWeatherBtn(clickedBtn) {
    document.querySelectorAll('.vrp-weather-btn').forEach(b => b.classList.remove('active'));
    if (clickedBtn) clickedBtn.classList.add('active');
}

/* js/ui/journal.js */
// ============================================
// SISTEMA DE FAVORITOS
// ============================================
// Los favoritos se guardan en appData.favorites: { topicId: Set<messageId> }
// Se serializa como { topicId: [msgId, ...] }

function getFavoritesForTopic(topicId) {
    if (!appData.favorites) appData.favorites = {};
    const raw = appData.favorites[topicId];
    if (!raw) return new Set();
    return new Set(Array.isArray(raw) ? raw : []);
}

function saveFavoritesForTopic(topicId, favSet) {
    if (!appData.favorites) appData.favorites = {};
    appData.favorites[topicId] = Array.from(favSet);
}

function isMessageFavorite(topicId, messageId) {
    return getFavoritesForTopic(topicId).has(String(messageId));
}

function toggleFavoriteCurrentMessage() {
    if (!currentTopicId) return;
    const msgs = getTopicMessages(currentTopicId);
    const msg  = msgs[currentMessageIndex];
    if (!msg) return;

    const favs = getFavoritesForTopic(currentTopicId);
    const msgId = String(msg.id);

    if (favs.has(msgId)) {
        favs.delete(msgId);
        showAutosave('Favorito eliminado', 'info');
    } else {
        favs.add(msgId);
        showAutosave('⭐ Marcado como favorito', 'saved');
    }

    saveFavoritesForTopic(currentTopicId, favs);
    save({ silent: true });
    updateFavButton();
}

function updateFavButton() {
    const icon = document.getElementById('favMsgIcon');
    if (!icon) return;
    const SVG_EMPTY = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><polygon points="8,2 10,6 14,6.5 11,9.5 11.8,13.5 8,11.5 4.2,13.5 5,9.5 2,6.5 6,6"/></svg>';
    const SVG_FULL  = '<svg viewBox="0 0 16 16" fill="currentColor" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><polygon points="8,2 10,6 14,6.5 11,9.5 11.8,13.5 8,11.5 4.2,13.5 5,9.5 2,6.5 6,6"/></svg>';
    if (!currentTopicId) { icon.innerHTML = SVG_EMPTY; return; }
    const msgs = getTopicMessages(currentTopicId);
    const msg  = msgs[currentMessageIndex];
    if (!msg) { icon.innerHTML = SVG_EMPTY; return; }
    icon.innerHTML = isMessageFavorite(currentTopicId, String(msg.id)) ? SVG_FULL : SVG_EMPTY;
}

// ============================================
// HISTORIAL CON PESTAÑAS (TODOS / FAVORITOS)
// ============================================

let currentHistoryTab = 'all';

function switchHistoryTab(tab) {
    currentHistoryTab = tab;
    document.getElementById('histTabAll')?.classList.toggle('active', tab === 'all');
    document.getElementById('histTabFav')?.classList.toggle('active', tab === 'favorites');
    document.getElementById('histTabChapters')?.classList.toggle('active', tab === 'chapters');
    renderHistoryContent();
}

function renderHistoryContent() {
    const container = document.getElementById('historyContent');
    if (!container) return;

    const allMsgs = getTopicMessages(currentTopicId);
    let msgs = allMsgs;

    if (currentHistoryTab === 'favorites') {
        const favs = getFavoritesForTopic(currentTopicId);
        msgs = allMsgs.filter(m => favs.has(String(m.id)));
    }

    // ── Pestaña Capítulos ──────────────────────────
    if (currentHistoryTab === 'chapters') {
        renderChaptersNav(allMsgs, container);
        return;
    }

    if (msgs.length === 0) {
        container.onscroll = null;
        const emptyText = currentHistoryTab === 'favorites'
            ? 'No hay favoritos en esta historia.<br><span style="font-size:0.9rem;opacity:0.6">Usa el botón ☆ en los controles para marcar momentos.</span>'
            : 'No hay mensajes en esta historia.';
        container.innerHTML = `<div style="text-align:center;color:var(--text-muted);padding:3rem;line-height:2">${emptyText}</div>`;
        return;
    }

    // Renderizado virtualizado o simple según tamaño
    if (msgs.length > 50 && currentHistoryTab === 'all') {
        renderVirtualizedHistory(msgs, container);
    } else {
        // Para favoritos (generalmente pocos), renderizado simple con índice real
        container.onscroll = null;
        container.innerHTML = msgs.map((msg, i) => {
            const realIdx = allMsgs.indexOf(msg);
            return buildHistoryEntry(msg, realIdx, true);
        }).join('');
    }
}

// Sobrescribir openHistoryLog para que use el nuevo sistema
function openHistoryLog() {
    currentHistoryTab = 'all';
    document.getElementById('histTabAll')?.classList.add('active');
    document.getElementById('histTabFav')?.classList.remove('active');
    renderHistoryContent();
    openModal('historyModal');
}

// ============================================
// DIARIO DE SESIÓN
// ============================================
// Se guarda en appData.journals: { topicId: string }

function openJournal() {
    if (!currentTopicId) {
        showAutosave('Abre una historia primero', 'error');
        return;
    }

    const topic = appData.topics.find(t => t.id === currentTopicId);
    const meta  = document.getElementById('journalMeta');
    const textarea = document.getElementById('journalTextarea');
    const indicator = document.getElementById('journalSavedIndicator');

    if (meta) meta.textContent = topic ? `📖 ${topic.title}` : '';
    if (indicator) indicator.textContent = '';

    if (!appData.journals) appData.journals = {};
    if (textarea) textarea.value = appData.journals[currentTopicId] || '';

    openModal('journalModal');
    setTimeout(() => textarea?.focus(), 100);
}

function closeJournal() {
    closeModal('journalModal');
}

function saveJournal() {
    if (!currentTopicId) return;
    const textarea = document.getElementById('journalTextarea');
    if (!textarea) return;

    if (!appData.journals) appData.journals = {};
    appData.journals[currentTopicId] = textarea.value;

    save({ silent: true });

    const indicator = document.getElementById('journalSavedIndicator');
    if (indicator) {
        indicator.textContent = '✓ Guardado';
        indicator.style.color = 'var(--accent-sage)';
        setTimeout(() => { indicator.textContent = ''; }, 2500);
    }
}

function clearJournal() {
    const textarea = document.getElementById('journalTextarea');
    if (!textarea || !textarea.value.trim()) return;
    openConfirmModal('¿Limpiar todas las notas de esta historia?', 'Limpiar').then(ok => {
        if (!ok) return;
        textarea.value = '';
        if (!appData.journals) appData.journals = {};
        appData.journals[currentTopicId] = '';
        save({ silent: true });
        const indicator = document.getElementById('journalSavedIndicator');
        if (indicator) { indicator.textContent = 'Notas limpiadas'; indicator.style.color = 'var(--text-muted)'; setTimeout(() => { indicator.textContent = ''; }, 2000); }
    });
}

// Autoguardado del diario al escribir (debounced 1.5s)
let journalSaveTimer = null;
document.addEventListener('DOMContentLoaded', () => {
    const textarea = document.getElementById('journalTextarea');
    if (!textarea) return;
    textarea.addEventListener('input', () => {
        clearTimeout(journalSaveTimer);
        const indicator = document.getElementById('journalSavedIndicator');
        if (indicator) { indicator.textContent = '...'; indicator.style.color = 'var(--text-muted)'; }
        journalSaveTimer = setTimeout(() => {
            if (currentTopicId) {
                if (!appData.journals) appData.journals = {};
                appData.journals[currentTopicId] = textarea.value;
                save({ silent: true });
                if (indicator) { indicator.textContent = '✓ Guardado'; indicator.style.color = 'var(--accent-sage)'; setTimeout(() => { indicator.textContent = ''; }, 2000); }
            }
        }, 1500);
    });
});

// ============================================
// SISTEMA DE REACCIONES
// ============================================
// appData.reactions: { topicId: { msgId: { userIndex: emoji } } }
// Un emoji por usuario por mensaje. Toggle: misma emoji = quitar, otra = cambiar.

const REACTION_EMOJIS = ['❤️','😂','😱','🔥','👏','😢'];

function getReactionsForTopic(topicId) {
    if (!appData.reactions) appData.reactions = {};
    if (!appData.reactions[topicId]) appData.reactions[topicId] = {};
    return appData.reactions[topicId];
}

function getMyReactionForMessage(topicId, msgId) {
    const topicReactions = getReactionsForTopic(topicId);
    const msgReactions   = topicReactions[String(msgId)] || {};
    return msgReactions[String(currentUserIndex)] || null;
}

function getReactionSummary(topicId, msgId) {
    const topicReactions = getReactionsForTopic(topicId);
    const msgReactions   = topicReactions[String(msgId)] || {};
    const counts = {};
    Object.values(msgReactions).forEach(emoji => {
        counts[emoji] = (counts[emoji] || 0) + 1;
    });
    return counts; // { '❤️': 2, '🔥': 1, ... }
}

function toggleReaction(emoji) {
    if (!currentTopicId) return;
    const msgs = getTopicMessages(currentTopicId);
    const msg  = msgs[currentMessageIndex];
    if (!msg) return;

    const topicReactions = getReactionsForTopic(currentTopicId);
    const msgId = String(msg.id);
    if (!topicReactions[msgId]) topicReactions[msgId] = {};

    const current = topicReactions[msgId][String(currentUserIndex)];
    if (current === emoji) {
        // Quitar reacción
        delete topicReactions[msgId][String(currentUserIndex)];
        if (Object.keys(topicReactions[msgId]).length === 0) delete topicReactions[msgId];
    } else {
        // Añadir o cambiar
        topicReactions[msgId][String(currentUserIndex)] = emoji;
    }

    if (!appData.reactions) appData.reactions = {};
    appData.reactions[currentTopicId] = topicReactions;
    save({ silent: true });

    updateReactionDisplay();
    closeReactionPicker();
}

function toggleReactionPicker() {
    const picker = document.getElementById('vnReactionPicker');
    if (!picker) return;
    const isOpen = picker.style.display !== 'none';
    if (isOpen) {
        closeReactionPicker();
    } else {
        openReactionPicker();
    }
}

function openReactionPicker() {
    const picker = document.getElementById('vnReactionPicker');
    if (!picker) return;

    // Resaltar la reacción actual del usuario
    if (currentTopicId) {
        const msgs = getTopicMessages(currentTopicId);
        const msg  = msgs[currentMessageIndex];
        const myReaction = msg ? getMyReactionForMessage(currentTopicId, String(msg.id)) : null;
        picker.querySelectorAll('.reaction-pick-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.emoji === myReaction);
        });
    }

    picker.style.display = 'flex';
    picker.classList.add('reaction-picker-in');
    setTimeout(() => picker.classList.remove('reaction-picker-in'), 300);

    // Cerrar al hacer clic fuera
    setTimeout(() => {
        document.addEventListener('click', _closeReactionPickerOnOutsideClick, { once: true, capture: true });
    }, 50);
}

function closeReactionPicker() {
    const picker = document.getElementById('vnReactionPicker');
    if (picker) picker.style.display = 'none';
}

function _closeReactionPickerOnOutsideClick(e) {
    const picker    = document.getElementById('vnReactionPicker');
    const cornerBtn = document.getElementById('vnReactionCornerBtn');
    if (!picker) return;
    if (!picker.contains(e.target) && !cornerBtn?.contains(e.target)) {
        closeReactionPicker();
    }
}

function updateReactionDisplay() {
    const display = document.getElementById('vnReactionDisplay');
    const btnIcon = document.getElementById('vnReactionBtnIcon');
    if (!display) return;

    if (!currentTopicId) { display.innerHTML = ''; return; }
    const msgs = getTopicMessages(currentTopicId);
    const msg  = msgs[currentMessageIndex];
    if (!msg) { display.innerHTML = ''; return; }

    const summary    = getReactionSummary(currentTopicId, String(msg.id));
    const myReaction = getMyReactionForMessage(currentTopicId, String(msg.id));

    // Actualizar ícono oculto (legacy)
    if (btnIcon) btnIcon.textContent = myReaction || '🙂';
    // Actualizar corner badge
    const cornerBtn  = document.getElementById('vnReactionCornerBtn');
    const cornerActive = document.getElementById('vnReactionCornerActive');
    if (cornerActive) {
        if (myReaction) {
            cornerActive.textContent = myReaction;
            cornerActive.style.display = 'inline';
            if (cornerBtn) {
                cornerBtn.style.borderColor = 'rgba(201,168,108,0.7)';
                cornerBtn.style.color = 'rgba(220,180,80,0.9)';
            }
        } else {
            cornerActive.style.display = 'none';
            if (cornerBtn) {
                cornerBtn.style.borderColor = '';
                cornerBtn.style.color = '';
            }
        }
    }

    const entries = Object.entries(summary);
    if (entries.length === 0) {
        display.innerHTML = '';
        return;
    }

    display.innerHTML = entries
        .sort((a, b) => b[1] - a[1])
        .map(([emoji, count]) => {
            const isMine = emoji === myReaction;
            return `<span class="vn-reaction-chip${isMine ? ' mine' : ''}" onclick="toggleReaction('${emoji}')" title="${count} reacción${count > 1 ? 'es' : ''}">${emoji}${count > 1 ? `<span class="reaction-count">${count}</span>` : ''}</span>`;
        })
        .join('');
}

// ============================================
// EXPORTAR HISTORIA COMO DOCUMENTO
// ============================================

function exportHistoryAsDocument() {
    if (!currentTopicId) {
        showAutosave('Abre una historia primero', 'error');
        return;
    }

    const topic = appData.topics.find(t => t.id === currentTopicId);
    const msgs  = getTopicMessages(currentTopicId);

    if (!msgs.length) {
        showAutosave('La historia está vacía', 'info');
        return;
    }

    const title   = topic?.title  || 'Historia sin título';
    const mode    = topic?.mode === 'rpg' ? 'RPG' : 'Clásico';
    const created = topic?.createdAt ? new Date(topic.createdAt).toLocaleDateString('es-ES') : '';
    const wordCount = msgs.reduce((acc, m) => acc + (m.text || '').split(/\s+/).filter(Boolean).length, 0);

    const lines = [];

    // Cabecera
    lines.push(`${'═'.repeat(60)}`);
    lines.push(title.toUpperCase());
    lines.push(`${'═'.repeat(60)}`);
    lines.push(`Modo: ${mode}${created ? `  ·  Creada: ${created}` : ''}`);
    lines.push(`Mensajes: ${msgs.length}  ·  Palabras: ${wordCount.toLocaleString()}`);
    lines.push('');

    // Mensajes
    msgs.forEach((msg, i) => {
        // Separador de capítulo
        if (msg.chapter) {
            lines.push('');
            lines.push(`${'─'.repeat(50)}`);
            lines.push(`  ✦  ${msg.chapter.title.toUpperCase()}  ✦`);
            lines.push(`${'─'.repeat(50)}`);
            lines.push('');
        }

        // Separador de escena
        if (msg.sceneChange) {
            lines.push('');
            lines.push(`  [ ${msg.sceneChange.title} ]`);
            lines.push('');
        }

        const speaker  = msg.isNarrator || !msg.characterId ? 'Narrador' : (msg.charName || 'Personaje');
        const isNarrator = msg.isNarrator || !msg.characterId;

        // Texto: si es narrador, sangría; si es personaje, "Nombre: texto"
        const rawText = (msg.text || '')
            .replace(/\*\*(.*?)\*\*/g, '$1')   // quitar negrita markdown
            .replace(/\*(.*?)\*/g, '$1')        // quitar cursiva
            .trim();

        if (isNarrator) {
            // Párrafo narrativo sangrado
            rawText.split('\n').forEach(line => {
                if (line.trim()) lines.push(`    ${line.trim()}`);
            });
        } else {
            lines.push(`${speaker}:`);
            rawText.split('\n').forEach(line => {
                if (line.trim()) lines.push(`    "${line.trim()}"`);
            });
        }

        // Reacciones
        const summary = getReactionSummary(currentTopicId, String(msg.id));
        const reactionStr = Object.entries(summary).map(([e, c]) => c > 1 ? `${e}×${c}` : e).join(' ');
        if (reactionStr) lines.push(`    [ ${reactionStr} ]`);

        lines.push('');
    });

    // Pie
    lines.push(`${'─'.repeat(60)}`);
    lines.push(`Fin de "${title}"`);
    lines.push(`Exportado desde Etheria · ${new Date().toLocaleDateString('es-ES')}`);

    const content  = lines.join('\n');
    const safeName = title.replace(/[^a-zA-Z0-9áéíóúüñÁÉÍÓÚÜÑ\s_-]/g, '').replace(/\s+/g, '_').slice(0, 60);
    const filename = `${safeName}.txt`;

    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 1000);

    showAutosave(`📄 "${filename}" descargado`, 'saved');
}

// ============================================
// NAVEGADOR DE CAPÍTULOS Y ESCENAS
// ============================================

function renderChaptersNav(msgs, container) {
    container.onscroll = null;

    // Recolectar todos los puntos de inflexión (escenas + capítulos)
    const waypoints = [];

    // Primer mensaje como punto de inicio
    if (msgs.length > 0) {
        waypoints.push({
            type:  'start',
            title: 'Inicio',
            idx:   0,
            msg:   msgs[0],
        });
    }

    msgs.forEach((msg, idx) => {
        if (msg.sceneChange) {
            waypoints.push({ type: 'scene',   title: msg.sceneChange.title, idx, msg });
        }
        if (msg.chapter) {
            waypoints.push({ type: 'chapter', title: msg.chapter.title,     idx, msg });
        }
    });

    if (waypoints.length <= 1) {
        container.innerHTML = `<div style="text-align:center;color:var(--text-muted);padding:3rem;line-height:2">
            No hay capítulos ni escenas marcados aún.<br>
            <span style="font-size:0.85rem;opacity:0.6">Usa el botón ✒ para añadir capítulos o escenas a la historia.</span>
        </div>`;
        return;
    }

    const itemsHtml = waypoints.map((wp, wi) => {
        const icon  = wp.type === 'chapter' ? '📖' : (wp.type === 'start' ? '▶' : '🎬');
        const date  = wp.msg ? new Date(wp.msg.timestamp).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' }) : '';
        const msgCount = wi < waypoints.length - 1
            ? waypoints[wi + 1].idx - wp.idx
            : msgs.length - wp.idx;
        const badge = msgCount > 0
            ? `<span class="chapter-nav-badge">${msgCount} msg</span>`
            : '';

        return `
        <div class="chapter-nav-item chapter-nav-${wp.type}" onclick="jumpToChapterWaypoint(${wp.idx})">
            <div class="chapter-nav-icon">${icon}</div>
            <div class="chapter-nav-content">
                <div class="chapter-nav-title">${escapeHtml(wp.title)}</div>
                <div class="chapter-nav-meta">${date ? `${date} · ` : ''}Mensaje ${wp.idx + 1}${badge}</div>
            </div>
            <div class="chapter-nav-arrow">›</div>
        </div>`;
    }).join('');

    container.innerHTML = `
        <div class="chapter-nav-intro">Haz clic en cualquier punto para ir directamente.</div>
        ${itemsHtml}
    `;
}

function jumpToChapterWaypoint(msgIdx) {
    closeModal('historyModal');
    currentMessageIndex = Math.max(0, Math.min(msgIdx, getTopicMessages(currentTopicId).length - 1));
    showCurrentMessage('forward');
}

/* js/ui/topics.js */
// Gestión de historias (topics): crear, listar, entrar.
// EDITOR DE RAMAS
// ============================================
function openBranchEditor() {
    tempBranches = [];
    for(let i=1; i<=3; i++) {
        const textInput = document.getElementById(`option${i}Text`);
        const contInput = document.getElementById(`option${i}Continuation`);
        const t = textInput?.value.trim() || '';
        const c = contInput?.value.trim() || '';
        if(t || c) {
            tempBranches.push({
                id: i,
                text: t,
                continuation: c
            });
        }
    }

    renderBranchEditor();
    openModal('branchEditorModal');
}

function renderBranchEditor() {
    const container = document.getElementById('branchList');
    if (!container) return;

    if (tempBranches.length === 0) {
        container.innerHTML = '<div style="text-align: center; color: var(--text-muted); padding: 2rem;">No hay ramas. Agrega una nueva.</div>';
    } else {
        container.innerHTML = tempBranches.map((branch, idx) => `
            <div class="branch-item">
                <div class="branch-item-header">
                    <span class="branch-item-number">Rama ${idx + 1}</span>
                    <button class="branch-delete-btn" onclick="deleteBranch(${branch.id})">🗑️ Eliminar</button>
                </div>
                <input type="text" class="branch-input" placeholder="Texto de la opción" value="${escapeHtml(branch.text)}" onchange="updateBranch(${branch.id}, 'text', this.value)">
                <textarea class="branch-textarea" placeholder="Continuación narrativa..." onchange="updateBranch(${branch.id}, 'continuation', this.value)">${escapeHtml(branch.continuation)}</textarea>
            </div>
        `).join('');
    }
}

function addNewBranch() {
    const newId = tempBranches.length > 0 ? Math.max(...tempBranches.map(b => b.id)) + 1 : 1;
    tempBranches.push({
        id: newId,
        text: '',
        continuation: ''
    });
    renderBranchEditor();
}

function deleteBranch(id) {
    tempBranches = tempBranches.filter(b => b.id !== id);
    renderBranchEditor();
}

function updateBranch(id, field, value) {
    const branch = tempBranches.find(b => b.id === id);
    if (branch) {
        branch[field] = value;
    }
}

function saveBranches() {
    const validBranches = tempBranches.filter(b => b.text.trim() && b.continuation.trim());

    if (validBranches.length === 0 && tempBranches.length > 0) {
        showAutosave('Cada rama necesita texto y continuación', 'error');
        return;
    }

    for(let i=0; i<3; i++) {
        const textInput = document.getElementById(`option${i+1}Text`);
        const contInput = document.getElementById(`option${i+1}Continuation`);

        if (i < validBranches.length) {
            if (textInput) textInput.value = validBranches[i].text;
            if (contInput) contInput.value = validBranches[i].continuation;
        } else {
            if (textInput) textInput.value = '';
            if (contInput) contInput.value = '';
        }
    }

    closeModal('branchEditorModal');
}

// ============================================
// TEMAS (Topics)
// ============================================
let _topicsFilter = 'all';
let _topicsSearch = '';


function formatRelativeDayLabel(dateValue) {
    if (!dateValue) return 'Sin actividad reciente';
    const date = new Date(dateValue);
    if (Number.isNaN(date.getTime())) return 'Sin actividad reciente';
    const now = new Date();
    const diffDays = Math.floor((now - date) / 86400000);
    if (diffDays <= 0) return 'Última actividad: hoy';
    if (diffDays === 1) return 'Última actividad: ayer';
    if (diffDays < 7) return `Última actividad: hace ${diffDays} días`;
    return `Última actividad: ${date.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}`;
}

function getStoryModeLabel(mode) {
    const isRol = mode === 'rpg' || mode === 'fanfic';
    return isRol ? '🎲 Modo RPG' : '🪶 Modo Clásico';
}

function normalizeCreatorName(name) {
    const trimmed = String(name || '').trim();
    if (!trimmed || /^jugador\s*\d*$/i.test(trimmed)) return 'Cronista local';
    return trimmed;
}


function setTopicFilter(filter, btn) {
    _topicsFilter = filter;
    document.querySelectorAll('.topic-filter-btn').forEach(b => b.classList.remove('active'));
    if (btn) btn.classList.add('active');
    renderTopics();
}

// Debounce timer para búsqueda de historias
let _filterTopicsTimer = null;

function filterTopics() {
    clearTimeout(_filterTopicsTimer);
    _filterTopicsTimer = setTimeout(function() {
        const input = document.getElementById('topicsSearch');
        _topicsSearch = (input?.value || '').toLowerCase().trim();
        renderTopics();
    }, 180);
}

function renderTopics() {
    const container = document.getElementById('topicsList');
    if (!container) return;

    let topics = appData.topics;

    // Aplicar filtro de modo
    if (_topicsFilter === 'rpg') {
        topics = topics.filter(t => t.mode === 'rpg' || t.mode === 'fanfic');
    } else if (_topicsFilter === 'roleplay') {
        topics = topics.filter(t => t.mode === 'roleplay' || !t.mode);
    }

    // Aplicar búsqueda
    if (_topicsSearch) {
        topics = topics.filter(t =>
            (t.title || '').toLowerCase().includes(_topicsSearch) ||
            (t.createdBy || '').toLowerCase().includes(_topicsSearch)
        );
    }

    if (appData.topics.length === 0) {
        container.innerHTML = '<div class="topics-empty">No hay historias todavía.<br><span>Crea la primera con el botón de arriba.</span></div>';
    } else if (topics.length === 0) {
        container.innerHTML = '<div class="topics-empty">No hay historias que coincidan.<br><span>Prueba con otro filtro o búsqueda.</span></div>';
    } else {
        container.innerHTML = topics.map(t => {
            // Usar mensajes en memoria si están cargados, evitar cargar desde storage en cada render
            const msgs = Array.isArray(appData.messages[t.id]) ? appData.messages[t.id] : [];
            const last = msgs[msgs.length - 1];
            const lastText = last ? stripHtml(formatText(last.text)).substring(0, 80) : '';
            const isRol    = t.mode === 'rpg' || t.mode === 'fanfic';
            const modeLabel = getStoryModeLabel(t.mode);
            const weatherBadge = t.weather === 'rain'
                ? '<span class="topic-badge weather">🌧 Lluvia</span>'
                : t.weather === 'fog'
                ? '<span class="topic-badge weather">🌫 Niebla</span>'
                : '';

            // SVG de ornamento de esquina — acero para RPG, tinta sepia para Clásico
            const cornerColor = isRol ? 'rgba(190,165,120,0.6)' : 'rgba(139,100,55,0.45)';
            const cornerSvg = `<svg width="22" height="22" viewBox="0 0 22 22" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M2 11 L2 2 L11 2" stroke="${cornerColor}" stroke-width="1.3" fill="none" stroke-linecap="round"/>
                <circle cx="2" cy="2" r="1.8" fill="${cornerColor}"/>
                <path d="M6 2 L6 4.5 M2 6 L4.5 6" stroke="${cornerColor}" stroke-width="0.9" opacity="0.6"/>
            </svg>`;

            // SVG de marca de agua — escudo para RPG, libro para Clásico
            const watermarkColor = isRol ? 'rgba(210,185,145,1)' : 'rgba(160,115,55,1)';
            const watermarkSvg = isRol
                ? `<svg viewBox="0 0 80 90" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M40 5 L72 18 L72 45 C72 63 57 78 40 85 C23 78 8 63 8 45 L8 18 Z" stroke="${watermarkColor}" stroke-width="2.5" fill="none"/>
                    <path d="M40 5 L72 18 L72 45 C72 63 57 78 40 85 C23 78 8 63 8 45 L8 18 Z" fill="${watermarkColor}" fill-opacity="0.06"/>
                    <line x1="40" y1="18" x2="40" y2="72" stroke="${watermarkColor}" stroke-width="1.5"/>
                    <line x1="12" y1="38" x2="68" y2="38" stroke="${watermarkColor}" stroke-width="1.5"/>
                    <circle cx="40" cy="38" r="7" stroke="${watermarkColor}" stroke-width="1.5" fill="none"/>
                    <path d="M26 24 L40 18 L54 24" stroke="${watermarkColor}" stroke-width="1" fill="none" opacity="0.6"/>
                  </svg>`
                : `<svg viewBox="0 0 90 75" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M45 10 C35 6 18 8 8 14 L8 68 C18 62 35 60 45 64 C55 60 72 62 82 68 L82 14 C72 8 55 6 45 10 Z" stroke="${watermarkColor}" stroke-width="2" fill="none"/>
                    <line x1="45" y1="10" x2="45" y2="64" stroke="${watermarkColor}" stroke-width="1.5"/>
                    <line x1="16" y1="28" x2="40" y2="28" stroke="${watermarkColor}" stroke-width="1" opacity="0.5"/>
                    <line x1="16" y1="36" x2="40" y2="36" stroke="${watermarkColor}" stroke-width="1" opacity="0.5"/>
                    <line x1="16" y1="44" x2="38" y2="44" stroke="${watermarkColor}" stroke-width="1" opacity="0.5"/>
                    <line x1="50" y1="28" x2="74" y2="28" stroke="${watermarkColor}" stroke-width="1" opacity="0.5"/>
                    <line x1="50" y1="36" x2="74" y2="36" stroke="${watermarkColor}" stroke-width="1" opacity="0.5"/>
                    <line x1="50" y1="44" x2="72" y2="44" stroke="${watermarkColor}" stroke-width="1" opacity="0.5"/>
                  </svg>`;

            // Personaje principal si tiene roleCharacterId
            let charAvatarHtml = '';
            if (t.roleCharacterId) {
                const char = appData.characters.find(c => String(c.id) === String(t.roleCharacterId));
                if (char && char.avatar) {
                    charAvatarHtml = `<img src="${escapeHtml(char.avatar)}" class="topic-card-char-avatar" alt="${escapeHtml(char.name)}">`;
                }
            }

            const msgWord = msgs.length === 1 ? 'mensaje' : 'mensajes';
            const creatorName = normalizeCreatorName(t.createdBy);
            const lastActivityDate = last?.timestamp || t.createdAt || t.date || null;
            const lastActivityLabel = formatRelativeDayLabel(lastActivityDate);
            const progressCurrent = Math.min(msgs.length, 10);
            const progressPct = Math.min(100, Math.round((progressCurrent / 10) * 100));

            return `
                <div class="topic-card ${isRol ? 'topic-card--rol' : 'topic-card--historia'}" onclick="enterTopic('${t.id}')">
                    <div class="topic-card-accent"></div>
                    <div class="topic-card-watermark">${watermarkSvg}</div>
                    <span class="topic-card-corner topic-card-corner--tl">${cornerSvg}</span>
                    <span class="topic-card-corner topic-card-corner--tr">${cornerSvg}</span>
                    <span class="topic-card-corner topic-card-corner--bl">${cornerSvg}</span>
                    <span class="topic-card-corner topic-card-corner--br">${cornerSvg}</span>
                    <div class="topic-card-inner">
                        <div class="topic-card-top">
                            <div class="topic-card-badges">
                                <span class="topic-badge mode">${modeLabel}</span>
                                ${weatherBadge}
                            </div>
                        </div>
                        <h3 class="topic-card-title">${escapeHtml(t.title)}</h3>
                        <p class="topic-card-author">por ${escapeHtml(creatorName)}</p>
                        <p class="topic-card-excerpt topic-card-excerpt--meta">${escapeHtml(lastActivityLabel)}</p>
                        ${lastText ? `<p class="topic-card-excerpt">"${escapeHtml(lastText)}${lastText.length >= 80 ? '…' : ''}"</p>` : '<p class="topic-card-excerpt topic-card-excerpt--empty">Sin mensajes aún. <strong>Escribe el primer capítulo</strong>.</p>'}
                    </div>
                    <div class="topic-card-footer">
                        <span class="topic-card-footer-msgs">
                            <span class="topic-card-footer-msgs-icon">${isRol ? '⚔' : '✦'}</span>
                            ${msgs.length > 0 ? `${msgs.length} ${msgWord}` : '—'}
                        </span>
                        <div class="topic-card-progress" title="Progreso de introducción">
                            <div class="topic-card-progress-bar" style="width:${progressPct}%"></div>
                            <span class="topic-card-progress-text">${progressCurrent}/10</span>
                        </div>
                        ${charAvatarHtml}
                    </div>
                </div>
            `;
        }).join('');
    }

    const statTopics = document.getElementById('statTopics');
    const statMsgs = document.getElementById('statMsgs');

    if (statTopics) statTopics.textContent = appData.topics.filter(t => t.createdByIndex === currentUserIndex).length;

    let msgCount = 0;
    appData.topics.forEach((topic) => {
        // Usar solo mensajes en memoria para el conteo, sin forzar carga desde storage
        const topicMsgs = Array.isArray(appData.messages[topic.id]) ? appData.messages[topic.id] : [];
        msgCount += topicMsgs.filter(m => m.userIndex === currentUserIndex).length;
    });

    preloadTopicBackgrounds();

    if (statMsgs) statMsgs.textContent = msgCount;
}

function generateTopicId() {
    if (globalThis.crypto && typeof globalThis.crypto.randomUUID === 'function') {
        return globalThis.crypto.randomUUID();
    }
    return `${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function normalizeRoomId(value) {
    const raw = String(value || '').trim();
    if (!raw || raw.length > 128) return '';
    return /^[A-Za-z0-9_-]+$/.test(raw) ? raw : '';
}

function getRoomIdFromQuery() {
    try {
        const room = new URLSearchParams(window.location.search).get('room');
        return normalizeRoomId(room);
    } catch {
        return '';
    }
}

function ensureTopicByRoomId(roomId) {
    const normalizedRoomId = normalizeRoomId(roomId);
    if (!normalizedRoomId) return null;

    let topic = appData.topics.find(t => String(t.id) === normalizedRoomId);
    if (topic) return topic;

    topic = {
        id: normalizedRoomId,
        title: `Sala ${normalizedRoomId.slice(0, 8)}`,
        background: DEFAULT_TOPIC_BACKGROUND,
        mode: 'roleplay',
        roleCharacterId: null,
        createdBy: userNames[currentUserIndex] || 'Jugador',
        createdByIndex: currentUserIndex,
        date: new Date().toLocaleDateString()
    };

    appData.topics.push(topic);
    if (typeof markDirty === 'function') markDirty('topics'); // Fix 9
    appData.messages[normalizedRoomId] = Array.isArray(appData.messages[normalizedRoomId])
        ? appData.messages[normalizedRoomId]
        : [];

    hasUnsavedChanges = true;
    save({ silent: true });
    renderTopics();
    return topic;
}

function copyCurrentRoomCode() {
    if (!currentTopicId) return;
    const roomCode = String(currentTopicId);

    const onSuccess = () => showAutosave('Código de sala copiado', 'saved');
    const onFailure = () => showAutosave('No se pudo copiar el código', 'error');

    if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
        navigator.clipboard.writeText(roomCode).then(onSuccess).catch(onFailure);
        return;
    }

    try {
        const fallback = document.createElement('textarea');
        fallback.value = roomCode;
        fallback.setAttribute('readonly', 'readonly');
        fallback.style.position = 'fixed';
        fallback.style.opacity = '0';
        document.body.appendChild(fallback);
        fallback.select();
        const ok = document.execCommand('copy');
        document.body.removeChild(fallback);
        if (ok) onSuccess();
        else onFailure();
    } catch {
        onFailure();
    }
}

function updateRoomCodeUI(topicId) {
    const wrap = document.getElementById('roomCodeWrap');
    const valueEl = document.getElementById('roomCodeValue');
    if (!wrap || !valueEl) return;

    if (!topicId) {
        wrap.style.display = 'none';
        valueEl.textContent = '';
        return;
    }

    // Mostrar código de sala siempre — útil en ambos modos para colaborar
    valueEl.textContent = String(topicId);
    wrap.style.display = 'flex';
}

async function tryJoinRoomFromUrl() {
    const roomId = pendingRoomInviteId || getRoomIdFromQuery();
    if (!roomId) return false;

    pendingRoomInviteId = null;
    const topic = ensureTopicByRoomId(roomId);
    if (!topic) return false;

    if (typeof showSection === 'function') {
        showSection('topics');
    } else {
        document.querySelectorAll('.game-section').forEach(s => s.classList.remove('active'));
        const topicsSection = document.getElementById('topicsSection');
        if (topicsSection) topicsSection.classList.add('active');
    }

    enterTopic(topic.id);
    return true;
}

function createTopic() {
    const titleInput = document.getElementById('topicTitleInput');
    const firstMsgInput = document.getElementById('topicFirstMsg');
    const weatherInput = document.getElementById('topicWeatherInput');

    const title = titleInput?.value.trim();
    const text = firstMsgInput?.value.trim();
    const weather = weatherInput?.value || 'none';
    const topicBackground = DEFAULT_TOPIC_BACKGROUND;

    if(!title || !text) { showAutosave('Completa todos los campos obligatorios', 'error'); return; }

    const genericTitles = ['prueba', 'test', 'historia', 'nueva historia'];
    if (genericTitles.includes((title || '').toLowerCase())) {
        showAutosave('Elige un título más descriptivo para la historia', 'error');
        return;
    }

    const id = generateTopicId();
    appData.topics.push({
        id,
        title,
        background: topicBackground,
        weather: weather !== 'none' ? weather : undefined,
        mode: currentTopicMode,
        roleCharacterId: null,
        createdBy: userNames[currentUserIndex] || 'Jugador',
        createdByIndex: currentUserIndex,
        date: new Date().toLocaleDateString()
    });

    appData.messages[id] = [{
        id: (globalThis.crypto && typeof globalThis.crypto.randomUUID === 'function')
            ? globalThis.crypto.randomUUID()
            : `${Date.now()}_${Math.random().toString(16).slice(2)}`,
        characterId: null,
        charName: 'Narrador',
        charColor: null,
        charAvatar: null,
        charSprite: null,
        text,
        isNarrator: true,
        userIndex: currentUserIndex,
        timestamp: new Date().toISOString(),
        weather: weather !== 'none' ? weather : undefined
    }];

    hasUnsavedChanges = true;
    save({ silent: true });
    closeModal('topicModal');
    renderTopics();

    // ── Sincronización automática con la nube ─────────────────────
    // Si Supabase está disponible, crear la historia en la nube en
    // background y guardar el storyId en el topic para que todos los
    // mensajes queden vinculados a ella desde el primer momento.
    if (typeof SupabaseStories !== 'undefined' && typeof SupabaseStories.createStory === 'function') {
        SupabaseStories.createStory(title).then(function(story) {
            if (story && story.id) {
                const t = appData.topics.find(function(tp) { return String(tp.id) === String(id); });
                if (t) {
                    t.storyId = story.id;
                    hasUnsavedChanges = true;
                    save({ silent: true });
                    // Activar la historia en el contexto global
                    global.currentStoryId = story.id;
                }
            }
        }).catch(function() { /* Sin conexión — continúa en local */ });
    }
    // ─────────────────────────────────────────────────────────────

    if (currentTopicMode === 'roleplay') {
        pendingRoleTopicId = id;
        openRoleCharacterModal(id, { mode: 'roleplay', preservePendingTopicId: true, enterOnSelect: true });
    } else {
        enterTopic(id);
    }
}

// ============================================

/* js/ui/app-ui.js */
// Utilidades generales de app: guardado, modales, tema visual y ajustes de lectura.
// UTILIDADES
// ============================================

// ── Salir de la PWA ──────────────────────────────────────────────────────────
// Para el audio, limpia recursos y cierra la ventana (PWA).
// En navegador normal solo para el audio (no puede cerrar la pestaña).
function exitApp() {
    // 1. Parar todo el audio inmediatamente (sin fade)
    eventBus.emit('audio:stop-menu-music', { fadeOut: false });
    eventBus.emit('audio:stop-rain');
    // Suspender AudioContext para liberar recursos del SO
    if (typeof audioCtx !== 'undefined' && audioCtx) {
        try { audioCtx.close(); } catch (error) { window.EtheriaLogger?.warn('app', 'operation failed:', error?.message || error); }
    }

    // 2. En PWA (standalone) intentar cerrar la ventana
    const isPWA = window.matchMedia('(display-mode: standalone)').matches ||
                  window.matchMedia('(display-mode: fullscreen)').matches  ||
                  navigator.standalone === true;

    if (isPWA) {
        // Pequeña demora para que el fade del audio arranque
        setTimeout(() => {
            try { window.close(); } catch (error) { window.EtheriaLogger?.warn('app', 'operation failed:', error?.message || error); }
            // Fallback si window.close() no funciona (Android Chrome):
            // llevar al usuario a una pantalla en blanco de "cerrado"
            setTimeout(() => {
                document.body.innerHTML =
                    '<div style="display:flex;align-items:center;justify-content:center;' +
                    'height:100vh;background:#1a1815;color:#c9a86c;font-family:serif;' +
                    'flex-direction:column;gap:1rem;text-align:center;">' +
                    '<div style="font-size:2rem;">✦</div>' +
                    '<div style="font-family:Cinzel,serif;letter-spacing:.2em;font-size:.9rem;">ETHERIA</div>' +
                    '<div style="opacity:.5;font-size:.8rem;">Puedes cerrar esta ventana</div>' +
                    '</div>';
            }, 300);
        }, 150);
    }
    // En navegador: solo para el audio, no intentamos cerrar la pestaña
}

function save(opts = {}) {
    const wasUnsaved = hasUnsavedChanges;
    const { silent = false } = opts;

    try {
        // Fix 9: if no partition has been explicitly marked dirty, assume everything
        // changed (backward-compat with legacy call sites that don't yet call markDirty).
        if (typeof _dirtyPartitions !== 'undefined' && _dirtyPartitions.size === 0) {
            _flushAllDirty();
        }
        persistPartitionedData();
        setLocalProfileUpdatedAt(currentUserIndex);
        hasUnsavedChanges = false;
        cloudUnsyncedChanges = true;
        // Informar al motor de sync cloud: hay cambios locales listos para subir.
        if (typeof SupabaseSync !== 'undefined' && typeof SupabaseSync.markPending === 'function') {
            SupabaseSync.markPending();
        }
        eventBus.emit('sync:status-changed', { status: 'pending-upload', message: 'Subir cambios',       target: 'button' });
        eventBus.emit('sync:status-changed', { status: 'degraded',       message: 'Pendiente de subida', target: 'indicator' });
        showAutosave('Guardado', 'saved');
        // Solo reproducir sonido en guardados manuales explícitos, no en autoguardado
        if (!silent) eventBus.emit('audio:play-sfx', { sfx: 'save' });
        return true;
    } catch (e) {
        hasUnsavedChanges = wasUnsaved;
        console.error('Error saving:', e);
        showAutosave('Error al guardar: almacenamiento lleno o no disponible', 'error');
        return false;
    }
}


function refreshUIAfterCloudLoad() {
    if (typeof renderTopics === 'function') renderTopics();
    if (typeof renderGallery === 'function') renderGallery();
    if (currentTopicId && typeof showCurrentMessage === 'function') showCurrentMessage();
}

function showAutosave(text, state) {
    const indicator = document.getElementById('autosaveIndicator');
    if (!indicator) return;

    const textEl = indicator.querySelector('.autosave-text');
    const iconEl = indicator.querySelector('.autosave-icon');

    if (textEl) textEl.textContent = text;
    indicator.className = `autosave-indicator visible ${state}`;

    if (iconEl) {
        if (state === 'saved') iconEl.textContent = '🜚';
        else if (state === 'error') iconEl.textContent = '🜄';
        else if (state === 'info') iconEl.textContent = '🜃';
        else iconEl.textContent = '🜂';
    }

    setTimeout(() => {
        indicator.classList.remove('visible');
    }, state === 'error' ? 4000 : 2000);
}

// ── Listeners EventBus para UI pequeña ──────────────────────────────────────
// Los listeners se registran UNA SOLA VEZ al cargar el archivo.
// La guarda _uiListenersReady impide duplicados si el archivo se ejecutara
// más de una vez por algún motivo futuro (hot-reload, tests, etc.).
//
// Payload canónico (ver js/core/events.js para la lista completa):
//   ui:show-autosave    →  { text: string, state: 'saved'|'error'|'info' }
//   ui:show-toast       →  { text: string, action?: string, onAction?: fn }
//   sync:status-changed →  { status, message, target: 'indicator'|'button' }
//
(function _initUIListeners() {
    if (window._uiListenersReady) return;
    window._uiListenersReady = true;

    eventBus.on('ui:show-autosave', function(data) {
        if (data) showAutosave(data.text, data.state);
    });

    eventBus.on('ui:show-toast', function(data) {
        if (data) showSyncToast(data.text, data.action, data.onAction);
    });

    eventBus.on('sync:status-changed', function(data) {
        if (!data) return;
        if (data.target === 'indicator') {
            _updateCloudSyncIndicatorDOM(data.status, data.message);
            // Mostrar el indicador brevemente cuando vuelve a online (absorbido de mejoras.js)
            if (data.status === 'online') _showCloudIndicatorTemporarily();
        }
        if (data.target === 'button') _updateSyncButtonStateDOM(data.status, data.message);
    });

    // Mostrar indicador al arrancar si ya está online
    setTimeout(_showCloudIndicatorTemporarily, 1500);
})();

// Muestra el indicador cloud brevemente cuando el estado es online,
// luego lo oculta. No actúa si el estado es degraded u offline.
var _cloudHideTimer = null;
function _showCloudIndicatorTemporarily() {
    var indicator = document.getElementById('cloudSyncIndicator');
    if (!indicator) return;
    if (indicator.classList.contains('degraded') || indicator.classList.contains('offline')) return;
    indicator.classList.add('visible');
    clearTimeout(_cloudHideTimer);
    _cloudHideTimer = setTimeout(function() {
        indicator.classList.remove('visible');
    }, 3000);
}

// ── Renderizadores de UI de sincronización ───────────────────────────────────
// Solo se llaman desde el listener sync:status-changed.
// Nadie fuera de app-ui.js debe llamarlas directamente.

function _updateCloudSyncIndicatorDOM(status, message) {
    const indicator = document.getElementById('cloudSyncIndicator');
    if (!indicator) return;
    const iconEl = indicator.querySelector('.cloud-sync-icon');
    const textEl = indicator.querySelector('.cloud-sync-text');
    indicator.className = `cloud-sync-indicator ${status}`;
    if (iconEl) {
        if (status === 'online')        iconEl.textContent = '🟢';
        else if (status === 'degraded') iconEl.textContent = '🟠';
        else                            iconEl.textContent = '🔺';
    }
    if (textEl) {
        const fallback = status === 'online' ? 'Conectado' : status === 'degraded' ? 'Cambios pendientes' : 'Offline';
        textEl.textContent = message || fallback;
    }
}

function _updateSyncButtonStateDOM(status, message) {
    const btn = document.getElementById('syncNowBtn');
    if (!btn) return;
    btn.classList.remove('is-synced', 'is-syncing', 'is-upload-pending', 'is-download-pending', 'is-error');
    const icon  = btn.querySelector('.vn-control-icon');
    const label = btn.querySelector('.vn-control-label');

    const SVG_SYNC = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M3 8 a5 5 0 0 1 9-3"/><path d="M13 8 a5 5 0 0 1-9 3"/><polyline points="12,2 12,5 15,5"/><polyline points="4,11 4,14 1,14"/></svg>';
    const SVG_UP   = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><polyline points="8,3 8,13"/><polyline points="4,7 8,3 12,7"/><line x1="3" y1="13" x2="13" y2="13"/></svg>';
    const SVG_DOWN = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><polyline points="8,13 8,3"/><polyline points="4,9 8,13 12,9"/><line x1="3" y1="3" x2="13" y2="3"/></svg>';
    const SVG_WARN = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M8 2 L14.5 13 H1.5 Z"/><line x1="8" y1="6.5" x2="8" y2="10"/><circle cx="8" cy="11.8" r="0.6" fill="currentColor" stroke="none"/></svg>';

    if (status === 'syncing') {
        btn.classList.add('is-syncing');
        if (icon) { icon.innerHTML = SVG_SYNC; btn.style.animation = 'syncSpin 1.2s linear infinite'; }
    } else if (status === 'pending-upload') {
        btn.classList.add('is-upload-pending');
        if (icon) icon.innerHTML = SVG_UP;
        btn.style.animation = '';
    } else if (status === 'pending-download') {
        btn.classList.add('is-download-pending');
        if (icon) icon.innerHTML = SVG_DOWN;
        btn.style.animation = '';
    } else if (status === 'error') {
        btn.classList.add('is-error');
        if (icon) icon.innerHTML = SVG_WARN;
        btn.style.animation = '';
    } else {
        btn.classList.add('is-synced');
        if (icon) icon.innerHTML = SVG_SYNC;
        btn.style.animation = '';
    }
    if (label) label.textContent = message || 'Sincronizar';
}

// Modal de confirmación genérico — reemplaza confirm() nativo
function openConfirmModal(message, okLabel = 'Confirmar') {
    return new Promise((resolve) => {
        const modal     = document.getElementById('confirmModal');
        const titleEl   = document.getElementById('confirmModalTitle');
        const btnOk     = document.getElementById('confirmModalOk');
        const btnCancel = document.getElementById('confirmModalCancel');

        if (!modal || !titleEl || !btnOk || !btnCancel) {
            resolve(confirm(message));
            return;
        }

        titleEl.textContent = message;
        btnOk.textContent = okLabel;

        const cleanup = (result) => {
            modal.classList.remove('active');
            document.body.classList.remove('modal-open');
            btnOk.removeEventListener('click', onOk);
            btnCancel.removeEventListener('click', onCancel);
            resolve(result);
        };
        const onOk     = () => cleanup(true);
        const onCancel = () => cleanup(false);

        btnOk.addEventListener('click', onOk);
        btnCancel.addEventListener('click', onCancel);
        modal.classList.add('active');
        document.body.classList.add('modal-open');
        btnOk.focus();
    });
}

function openModal(id) {
    if(id === 'topicModal') {
        // Limpiar el formulario al abrir para que no queden datos del topic anterior
        const titleInput   = document.getElementById('topicTitleInput');
        const firstMsgInput = document.getElementById('topicFirstMsg');
        if (titleInput)    titleInput.value = '';
        if (firstMsgInput) firstMsgInput.value = '';
        if (typeof setTopicWeather === 'function') setTopicWeather('none');
        updateTopicModeUI();
    }
    const modal = document.getElementById(id);
    if (modal) {
        lastFocusedElement = document.activeElement;
        modal.classList.add('active');
        document.body.classList.add('modal-open');

        const firstFocusable = modal.querySelector('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
        if (firstFocusable) firstFocusable.focus();
    }
}

function closeModal(id) {
    const modal = document.getElementById(id);
    if (modal) modal.classList.remove('active');

    if (id === 'roleCharacterModal' && pendingRoleTopicId) {
        appData.topics = appData.topics.filter(t => t.id !== pendingRoleTopicId);
        delete appData.messages[pendingRoleTopicId];
        pendingRoleTopicId = null;
        hasUnsavedChanges = true;
        save({ silent: true });
        renderTopics();
    }

    const anyModalOpen = document.querySelector('.modal-overlay.active');
    if (!anyModalOpen) {
        document.body.classList.remove('modal-open');
        if (lastFocusedElement && typeof lastFocusedElement.focus === 'function') {
            lastFocusedElement.focus();
        }
    }
}

function changeUser() {
    const newName = prompt('Nuevo nombre:', userNames[currentUserIndex]);
    if(newName?.trim()) {
        userNames[currentUserIndex] = newName.trim();
        localStorage.setItem('etheria_user_names', JSON.stringify(userNames));

        const currentUserDisplay = document.getElementById('currentUserDisplay');
        if (currentUserDisplay) currentUserDisplay.textContent = newName.trim();

        save({ silent: true });
        renderUserCards();
    }
}

// Propaga el color del personaje activo como variable CSS global
// para que la caja de diálogo y el avatar ring lo reflejen
function normalizeCssColor(input) {
    if (!input || typeof input !== 'string') return null;
    const value = input.trim();
    const HEX = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;
    const RGB = /^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})(?:\s*,\s*(0|1|0?\.\d+))?\s*\)$/i;

    if (HEX.test(value)) {
        const raw = value.slice(1);
        const full = raw.length === 3 ? raw.split('').map(ch => ch + ch).join('') : raw;
        return {
            fullHex: `#${full}`.toLowerCase(),
            rgb: [
                parseInt(full.slice(0, 2), 16),
                parseInt(full.slice(2, 4), 16),
                parseInt(full.slice(4, 6), 16),
            ],
        };
    }

    const rgbMatch = value.match(RGB);
    if (rgbMatch) {
        const rgb = [rgbMatch[1], rgbMatch[2], rgbMatch[3]].map((n) => Math.max(0, Math.min(255, parseInt(n, 10))));
        const fullHex = `#${rgb.map((n) => n.toString(16).padStart(2, '0')).join('')}`;
        return { fullHex, rgb };
    }

    return null;
}

function setThemeMetaColor(theme) {
    const metaTheme = document.querySelector('meta[name="theme-color"]');
    if (!metaTheme) return;
    metaTheme.setAttribute('content', theme === 'dark' ? '#1a1815' : '#f5f1e8');
}

function applyCharColor(hexColor) {
    const normalized = normalizeCssColor(hexColor || '');
    if (!normalized) {
        document.documentElement.style.setProperty('--char-color', 'rgba(139, 115, 85, 0.6)');
        document.documentElement.style.setProperty('--char-color-full', '#8b7355');
        document.documentElement.style.setProperty('--char-color-rgb', '139, 115, 85');
        return;
    }
    const [r, g, b] = normalized.rgb;
    document.documentElement.style.setProperty('--char-color', `rgba(${r}, ${g}, ${b}, 0.55)`);
    document.documentElement.style.setProperty('--char-color-full', normalized.fullHex);
    document.documentElement.style.setProperty('--char-color-rgb', `${r}, ${g}, ${b}`);
}

function toggleTheme() {
    const html = document.documentElement;
    const currentTheme = html.getAttribute('data-theme');
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    html.setAttribute('data-theme', newTheme);
    setThemeMetaColor(newTheme);
    localStorage.setItem('etheria_theme', newTheme);
    if (typeof SupabaseSettings !== 'undefined') SupabaseSettings.syncCurrentSettings().catch(() => {});
    // Botón menú ajustes: texto descriptivo
    const themeBtn = document.getElementById('themeToggleBtn');
    if (themeBtn) themeBtn.textContent = newTheme === 'dark' ? '☀️ Claro' : '🌙 Oscuro';
    // Botón circular perfil: icono del modo actual
    const profileBtn = document.getElementById('profileThemeBtn');
    if (profileBtn) profileBtn.textContent = newTheme === 'dark' ? '🌙' : '☀️';
    // Botón toggle del menú principal
    const menuIcon = document.getElementById('menuThemeIcon');
    if (menuIcon) menuIcon.textContent = newTheme === 'dark' ? '☀️' : '🌙';
    generateParticles();
}

function updateProfileThemeBtn() {
    const theme = document.documentElement.getAttribute('data-theme') || 'light';
    setThemeMetaColor(theme);
    // Botón menú ajustes
    const themeBtn = document.getElementById('themeToggleBtn');
    if (themeBtn) themeBtn.textContent = theme === 'dark' ? '☀️ Claro' : '🌙 Oscuro';
    // Botón circular perfil: muestra el icono del modo en que SE ESTÁ actualmente
    const profileBtn = document.getElementById('profileThemeBtn');
    if (profileBtn) profileBtn.textContent = theme === 'dark' ? '🌙' : '☀️';
}

function toggleHaptics(enabled) {
    try { localStorage.setItem('etheria_haptics_enabled', enabled ? '1' : '0'); } catch (error) { window.EtheriaLogger?.warn('app', 'operation failed:', error?.message || error); }
}

function updateMasterVolume(val) {
    if (typeof masterVolume !== 'undefined') masterVolume = parseInt(val) / 100 * 0.36;
    localStorage.setItem('etheria_master_volume', val);
    if (typeof SupabaseSettings !== 'undefined') SupabaseSettings.syncCurrentSettings().catch(() => {});
    const el = document.getElementById('optMasterVolVal');
    if (el) el.textContent = val + '%';
}

function updateRainVolume(val) {
    const gain = (parseInt(val) / 100) * 0.08;
    if (typeof rainGainNode !== 'undefined' && rainGainNode && typeof audioCtx !== 'undefined' && audioCtx) {
        try { rainGainNode.gain.linearRampToValueAtTime(gain, audioCtx.currentTime + 0.4); } catch (error) { window.EtheriaLogger?.warn('app', 'operation failed:', error?.message || error); }
    }
    localStorage.setItem('etheria_rain_volume', val);
    if (typeof SupabaseSettings !== 'undefined') SupabaseSettings.syncCurrentSettings().catch(() => {});
    const el = document.getElementById('optRainVolVal');
    if (el) el.textContent = val + '%';
}

function updateUiSounds(enabled) {
    localStorage.setItem('etheria_ui_sounds', enabled ? '1' : '0');
}

function syncSpeedLabel(val) {
    const el = document.getElementById('optSpeedVal');
    if (!el) return;
    const v = parseInt(val);
    el.textContent = v < 40 ? 'Rápido' : v < 70 ? 'Normal' : 'Lento';
}

function saveProfileNameFromOptions() {
    const input = document.getElementById('optProfileName');
    if (!input) return;
    const name = input.value.trim();
    if (!name) { showAutosave('Escribe un nombre', 'error'); return; }
    userNames[currentUserIndex] = name;
    localStorage.setItem('etheria_user_names', JSON.stringify(userNames));
    const display = document.getElementById('currentUserDisplay');
    if (display) display.textContent = name;
    if (typeof SupabaseSync !== 'undefined' && typeof SupabaseSync.markPending === 'function') {
        SupabaseSync.markPending();
    }
    showAutosave('Nombre actualizado', 'saved');
    // Actualizar initial del avatar si no hay foto
    _syncAvatarInitials();
}

// ── Tab switcher del menú de opciones ────────────────────────────────────
function switchOptTab(tabId, btn) {
    // Desactivar todos
    document.querySelectorAll('.opt-tab').forEach(t => {
        t.classList.remove('active');
        t.setAttribute('aria-selected', 'false');
    });
    document.querySelectorAll('.opt-panel').forEach(p => p.classList.remove('active'));
    // Activar el elegido
    if (btn) { btn.classList.add('active'); btn.setAttribute('aria-selected', 'true'); }
    const panel = document.getElementById('optPanel-' + tabId);
    if (panel) panel.classList.add('active');
    // Sincronizar perfil al entrar en esa pestaña
    if (tabId === 'profile' || tabId === 'account') _syncProfileTab();
}

// ── Avatar helpers ────────────────────────────────────────────────────────

function _getAvatars() {
    try { return JSON.parse(localStorage.getItem('etheria_user_avatars') || '[]'); } catch { return []; }
}
function _saveAvatars(arr) {
    try { localStorage.setItem('etheria_user_avatars', JSON.stringify(arr)); } catch (error) { window.EtheriaLogger?.warn('app', 'operation failed:', error?.message || error); }
    if (typeof SupabaseSync !== 'undefined' && typeof SupabaseSync.markPending === 'function') SupabaseSync.markPending();
}
function _getGenders() {
    try { return JSON.parse(localStorage.getItem('etheria_user_genders') || '[]'); } catch { return []; }
}
function _saveGenders(arr) {
    try { localStorage.setItem('etheria_user_genders', JSON.stringify(arr)); } catch (error) { window.EtheriaLogger?.warn('app', 'operation failed:', error?.message || error); }
    if (typeof SupabaseSync !== 'undefined' && typeof SupabaseSync.markPending === 'function') SupabaseSync.markPending();
}
function _getBirthdays() {
    try { return JSON.parse(localStorage.getItem('etheria_user_birthdays') || '[]'); } catch { return []; }
}
function _saveBirthdays(arr) {
    try { localStorage.setItem('etheria_user_birthdays', JSON.stringify(arr)); } catch (error) { window.EtheriaLogger?.warn('app', 'operation failed:', error?.message || error); }
    if (typeof SupabaseSync !== 'undefined' && typeof SupabaseSync.markPending === 'function') SupabaseSync.markPending();
}

function _getCurrentProfileAvatar() {
    const avatars = _getAvatars();
    return avatars[currentUserIndex] || localStorage.getItem('etheria_cloud_avatar_url') || '';
}

async function _getAuthenticatedUserIdForAvatar() {
    if (window._cachedUserId) return window._cachedUserId;
    if (!window.supabaseClient || typeof window.supabaseClient.auth?.getUser !== 'function') return null;
    try {
        const { data, error } = await window.supabaseClient.auth.getUser();
        if (error || !data?.user?.id) return null;
        window._cachedUserId = data.user.id;
        return data.user.id;
    } catch {
        return null;
    }
}

function _saveAvatarInLocalProfile(url) {
    const avatars = _getAvatars();
    while (avatars.length <= currentUserIndex) avatars.push('');
    avatars[currentUserIndex] = url || '';
    _saveAvatars(avatars);
}

async function _uploadProfileAvatarToCloud(file) {
    const userId = await _getAuthenticatedUserIdForAvatar();
    if (!userId) return { ok: false, error: 'Inicia sesión para sincronizar el avatar en la nube.' };
    if (!window.supabaseClient) return { ok: false, error: 'Supabase no disponible.' };

    const extMatch = (file?.name || '').match(/\.(png|jpg|jpeg|gif|webp)$/i);
    const ext = extMatch ? extMatch[1].toLowerCase() : 'png';
    const contentType = file?.type || (ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : `image/${ext}`);
    const path = `${userId}/profile.${ext}`;

    const { error: uploadError } = await window.supabaseClient.storage
        .from('user-avatars')
        .upload(path, file, { upsert: true, contentType });

    if (uploadError) {
        return { ok: false, error: uploadError.message || 'No se pudo subir el avatar a la nube.' };
    }

    const { data: urlData } = window.supabaseClient.storage
        .from('user-avatars')
        .getPublicUrl(path);

    const publicUrl = urlData?.publicUrl || '';
    if (!publicUrl) return { ok: false, error: 'No se pudo obtener la URL pública del avatar.' };

    if (typeof SupabaseSettings !== 'undefined' && typeof SupabaseSettings.saveUserSettings === 'function') {
        await SupabaseSettings.saveUserSettings({ avatar_url: publicUrl });
    }
    localStorage.setItem('etheria_cloud_avatar_url', publicUrl);
    return { ok: true, url: publicUrl };
}

async function _removeProfileAvatarFromCloud() {
    const userId = await _getAuthenticatedUserIdForAvatar();
    if (!userId || !window.supabaseClient) return;

    const paths = ['png', 'jpg', 'jpeg', 'gif', 'webp'].map(ext => `${userId}/profile.${ext}`);
    try { await window.supabaseClient.storage.from('user-avatars').remove(paths); } catch {}
    if (typeof SupabaseSettings !== 'undefined' && typeof SupabaseSettings.saveUserSettings === 'function') {
        await SupabaseSettings.saveUserSettings({ avatar_url: '' });
    }
    localStorage.setItem('etheria_cloud_avatar_url', '');
}

function _syncAvatarInitials() {
    const initEl = document.getElementById('optAvatarInitials');
    if (initEl) initEl.textContent = (userNames[currentUserIndex] || '?')[0].toUpperCase();
}

function _syncProfileTab() {
    // Nombre
    const nameInput = document.getElementById('optProfileName');
    if (nameInput) nameInput.value = userNames[currentUserIndex] || '';
    _syncAvatarInitials();

    // Avatar
    const avatar  = _getCurrentProfileAvatar();
    const imgEl   = document.getElementById('optAvatarImg');
    const removeBtn = document.getElementById('optAvatarRemoveBtn');
    if (imgEl) {
        if (avatar) {
            imgEl.src = avatar;
            imgEl.style.display = 'block';
            if (removeBtn) removeBtn.style.display = 'inline-block';
        } else {
            imgEl.src = '';
            imgEl.style.display = 'none';
            if (removeBtn) removeBtn.style.display = 'none';
        }
    }

    // Género
    const genders = _getGenders();
    const genderSel = document.getElementById('optProfileGender');
    if (genderSel) genderSel.value = genders[currentUserIndex] || '';

    // Cumpleaños
    const birthdays = _getBirthdays();
    const bday = birthdays[currentUserIndex] || '';
    const bdayInput = document.getElementById('optProfileBirthday');
    if (bdayInput) bdayInput.value = bday;
    _updateBirthdayHint(bday);
}

function _updateBirthdayHint(bday) {
    const hint = document.getElementById('optBirthdayHint');
    if (!hint) return;
    if (!bday) { hint.textContent = ''; return; }
    try {
        const [y, m, d] = bday.split('-').map(Number);
        const today = new Date();
        const thisYear = today.getFullYear();
        const next = new Date(thisYear, m - 1, d);
        if (next < today) next.setFullYear(thisYear + 1);
        const diff = Math.round((next - today) / 86400000);
        const age = thisYear - y;
        if (diff === 0) hint.textContent = `🎂 ¡Hoy cumples ${age} años!`;
        else if (diff <= 7) hint.textContent = `🎂 En ${diff} día${diff > 1 ? 's' : ''}`;
        else hint.textContent = `${age} años`;
    } catch { hint.textContent = ''; }
}

async function handleAvatarUpload(input) {
    const file = input.files[0];
    if (!file) return;
    if (file.size > 1.2 * 1024 * 1024) {
        showAutosave('La imagen es demasiado grande (máx. 1 MB)', 'error');
        return;
    }

    showAutosave('Guardando avatar...', 'info');
    const userId = await _getAuthenticatedUserIdForAvatar();

    if (userId) {
        const cloud = await _uploadProfileAvatarToCloud(file);
        if (!cloud.ok) {
            showAutosave(cloud.error || 'Error al subir avatar a la nube', 'error');
            input.value = '';
            return;
        }
        _saveAvatarInLocalProfile(cloud.url);
        _syncProfileTab();
        showAutosave('Avatar guardado en la nube', 'saved');
    } else {
        const reader = new FileReader();
        reader.onload = (e) => {
            const data = e.target.result;
            _saveAvatarInLocalProfile(data);
            _syncProfileTab();
            showAutosave('Avatar guardado localmente', 'saved');
            if (typeof renderUserCards === 'function') renderUserCards();
        };
        reader.readAsDataURL(file);
        input.value = '';
        return;
    }

    if (typeof renderUserCards === 'function') renderUserCards();
    input.value = '';
}

async function removeProfileAvatar() {
    _saveAvatarInLocalProfile('');
    await _removeProfileAvatarFromCloud();
    _syncProfileTab();
    showAutosave('Avatar eliminado', 'saved');
    if (typeof renderUserCards === 'function') renderUserCards();
}

function saveProfileGender(value) {
    const genders = _getGenders();
    while (genders.length <= currentUserIndex) genders.push('');
    genders[currentUserIndex] = value;
    _saveGenders(genders);
    if (typeof renderUserCards === 'function') renderUserCards();
}

function saveProfileBirthday(value) {
    const birthdays = _getBirthdays();
    while (birthdays.length <= currentUserIndex) birthdays.push('');
    birthdays[currentUserIndex] = value;
    _saveBirthdays(birthdays);
    _updateBirthdayHint(value);
    if (typeof renderUserCards === 'function') renderUserCards();
}

function syncOptionsSection() {
    const savedSpeed = localStorage.getItem('etheria_text_speed');
    const savedSize  = localStorage.getItem('etheria_font_size');
    const savedMasterVol = parseInt(localStorage.getItem('etheria_master_volume') || '50');
    const savedRainVol   = parseInt(localStorage.getItem('etheria_rain_volume') || '30');
    const uiSounds = localStorage.getItem('etheria_ui_sounds') !== '0';
    const theme = document.documentElement.getAttribute('data-theme') || 'light';

    const speedSlider  = document.getElementById('optTextSpeed');
    const sizeSlider   = document.getElementById('optFontSize');
    const masterSlider = document.getElementById('optMasterVol');
    const rainSlider   = document.getElementById('optRainVol');
    const uiCheck  = document.getElementById('optUiSounds');
    const themeBtn = document.getElementById('themeToggleBtn');
    const nameInput = document.getElementById('optProfileName');
    const immersiveCheck = document.getElementById('optImmersiveMode');
    const hapticCheck = document.getElementById('hapticToggle');
    const continuousCheck = document.getElementById('optContinuousRead');
    const continuousDelay = document.getElementById('optContinuousDelay');

    if (speedSlider && savedSpeed) {
        const sliderVal = 110 - parseInt(savedSpeed);
        speedSlider.value = sliderVal;
        syncSpeedLabel(sliderVal);
    }
    if (sizeSlider && savedSize) {
        sizeSlider.value = savedSize;
        const valEl = document.getElementById('optFontSizeVal');
        if (valEl) valEl.textContent = savedSize + 'px';
    }
    if (masterSlider) { masterSlider.value = savedMasterVol; const mvEl = document.getElementById('optMasterVolVal'); if (mvEl) mvEl.textContent = savedMasterVol + '%'; }
    if (rainSlider)   { rainSlider.value = savedRainVol;     const rvEl = document.getElementById('optRainVolVal');   if (rvEl) rvEl.textContent = savedRainVol   + '%'; }
    if (uiCheck)  uiCheck.checked = uiSounds;
    if (themeBtn) themeBtn.textContent = theme === 'dark' ? '☀️ Claro' : '🌙 Oscuro';
    if (nameInput) nameInput.value = userNames[currentUserIndex] || '';
    if (immersiveCheck) immersiveCheck.checked = localStorage.getItem('etheria_immersive_mode') === '1';
    if (hapticCheck) hapticCheck.checked = localStorage.getItem('etheria_haptics_enabled') !== '0';
    const savedContinuous = localStorage.getItem('etheria_continuous_read') === '1';
    const savedContinuousDelay = Math.max(3, Math.min(5, Number(localStorage.getItem('etheria_continuous_delay') || 4)));
    if (continuousCheck) continuousCheck.checked = savedContinuous;
    if (continuousDelay) continuousDelay.value = savedContinuousDelay;
    const continuousDelayLabel = document.getElementById('optContinuousDelayVal');
    if (continuousDelayLabel) continuousDelayLabel.textContent = `${savedContinuousDelay}s`;

    const statsEl = document.getElementById('optProfileStats');
    if (statsEl) {
        const myTopics = appData.topics.filter(t => t.createdByIndex === currentUserIndex).length;
        const myChars  = appData.characters.filter(c => c.userIndex === currentUserIndex).length;
        statsEl.textContent = `${myTopics} historias · ${myChars} personajes`;
    }
    // Sincronizar pestaña de perfil siempre que se abra opciones
    _syncProfileTab();
}

function deleteCurrentTopic() {
    openConfirmModal('¿Borrar esta historia? Esta acción no se puede deshacer.', 'Borrar').then(ok => {
        if (!ok) return;
        appData.topics = appData.topics.filter(t => t.id !== currentTopicId);
        delete appData.messages[currentTopicId];
        delete appData.affinities[currentTopicId];
        currentTopicId = null;
        hasUnsavedChanges = true;
        save({ silent: true });
        // Marcar como sin cambios pendientes para que backToTopics no pregunte
        // (el guardado ya ocurrió o falló, pero el topic ya no existe en memoria)
        hasUnsavedChanges = false;
        backToTopics();
    });
}

async function manualSyncFromScene() {
    if (hasUnsavedChanges) save({ silent: true });
    await syncBidirectional({ silent: false, allowRemotePrompt: true });
}

function quickSave() {
    const saved = save();
    showAutosave(saved ? 'Guardado rápido' : 'Error al guardar rápido', saved ? 'saved' : 'error');
}

function openSaveHubModal() {
    openModal('saveHubModal');
    // Actualizar estado de última sincronización al abrir
    _updateSaveHubCloudStatus();
    window.dispatchEvent(new CustomEvent('etheria:section-changed', { detail: { section: 'saveHub' } }));
}

function _updateSaveHubCloudStatus() {
    const el = document.getElementById('saveHubCloudStatus');
    if (!el) return;
    const userId = window._cachedUserId;
    if (!userId) {
        el.textContent = 'Sin sesión activa';
        el.dataset.state = 'offline';
        return;
    }
    if (typeof SupabaseSync === 'undefined') {
        el.textContent = 'Sync no disponible';
        el.dataset.state = 'offline';
        return;
    }
    const last = SupabaseSync.lastSyncTime;
    if (!last) {
        el.textContent = 'Sin sincronizar aún';
        el.dataset.state = 'pending';
    } else {
        const mins = Math.round((Date.now() - last) / 60000);
        el.textContent = mins < 1 ? 'Sincronizado hace un momento' : `Última sync: hace ${mins} min`;
        el.dataset.state = 'ok';
    }
}

async function forceCloudDownload() {
    if (!window._cachedUserId) {
        showAutosave('Inicia sesión para usar la nube', 'error');
        return;
    }
    const ok = await openConfirmModal(
        '¿Cargar datos desde la nube? Esto reemplazará todos los datos locales con la versión guardada en tu cuenta.',
        'Cargar desde nube'
    );
    if (!ok) return;

    showAutosave('Descargando desde la nube…', 'info');
    try {
        const result = await SupabaseSync.downloadProfileData();
        if (result.ok && result.data) {
            if (typeof renderTopics === 'function')    renderTopics();
            if (typeof renderGallery === 'function')   renderGallery();
            if (typeof renderUserCards === 'function') renderUserCards();
            showAutosave('✓ Datos cargados desde la nube', 'saved');
            eventBus.emit('audio:play-sfx', { sfx: 'save' });
            _updateSaveHubCloudStatus();
        } else if (result.isNew) {
            showAutosave('No hay datos en la nube para esta cuenta', 'info');
        } else {
            showAutosave('Error al descargar: ' + (result.error || 'desconocido'), 'error');
        }
    } catch (err) {
        showAutosave('Error inesperado: ' + err.message, 'error');
    }
}

async function forceCloudUpload() {
    if (!window._cachedUserId) {
        showAutosave('Inicia sesión para usar la nube', 'error');
        return;
    }
    const ok = await openConfirmModal(
        '¿Subir datos locales a la nube? Esto reemplazará la versión guardada en tu cuenta con los datos actuales de este dispositivo.',
        'Subir a la nube'
    );
    if (!ok) return;

    showAutosave('Subiendo a la nube…', 'info');
    try {
        const result = await SupabaseSync.uploadProfileData();
        if (result.ok) {
            showAutosave('✓ Datos subidos a la nube', 'saved');
            eventBus.emit('audio:play-sfx', { sfx: 'save' });
            _updateSaveHubCloudStatus();
        } else {
            showAutosave('Error al subir: ' + (result.error || 'desconocido'), 'error');
        }
    } catch (err) {
        showAutosave('Error inesperado: ' + err.message, 'error');
    }
}

function saveGameFromMenu() {
    // Recopilar mensajes de todos los topics para el archivo completo
    const allMessages = {};
    appData.topics.forEach(t => {
        allMessages[t.id] = getTopicMessages(t.id);
    });

    const exportPayload = {
        version: 2,
        exportedAt: new Date().toISOString(),
        profileName: userNames[currentUserIndex] || 'Jugador',
        topics: appData.topics,
        characters: appData.characters,
        messages: allMessages,
        affinities: appData.affinities
    };

    const blob = new Blob([JSON.stringify(exportPayload, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    const safeName = (userNames[currentUserIndex] || 'partida').replace(/[^a-z0-9]/gi, '_').toLowerCase();
    a.href = URL.createObjectURL(blob);
    a.download = `etheria_${safeName}_${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(a.href);

    showAutosave('Archivo de guardado descargado', 'saved');
    eventBus.emit('audio:play-sfx', { sfx: 'save' });
}

function loadGameFromMenu() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = e => {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = event => {
            try {
                const data = JSON.parse(event.target.result);
                validateImportedData(data);

                const profileInfo = data.profileName ? ` (perfil: ${data.profileName})` : '';
                const exportDate = data.exportedAt ? ` · guardado el ${new Date(data.exportedAt).toLocaleString()}` : '';
                const msg = `¿Cargar el archivo${profileInfo}${exportDate}? Esto reemplazará todos los datos actuales.`;

                openConfirmModal(msg, 'Cargar').then(ok => {
                    if (!ok) return;
                    appData.topics     = Array.isArray(data.topics)     ? data.topics     : [];
                    appData.characters = Array.isArray(data.characters) ? data.characters : [];
                    appData.messages   = (data.messages   && typeof data.messages   === 'object' && !Array.isArray(data.messages))   ? data.messages   : {};
                    appData.affinities = (data.affinities && typeof data.affinities === 'object' && !Array.isArray(data.affinities)) ? data.affinities : {};

                    hasUnsavedChanges = true;
                    save({ silent: true });
                    showAutosave('Partida cargada correctamente', 'saved');
                    renderTopics();
                    renderGallery();
                });
            } catch (err) {
                showAutosave('Error al cargar el archivo: ' + err.message, 'error');
            }
        };
        reader.readAsText(file);
    };
    input.click();
}



function _storyCodeStorageKey(code) {
    return `etheria_story_code_${code}`;
}

const STORY_CODE_BLOCKLIST = new Set(['PUTO', 'CACA', 'KKK']);

function _generateStoryCode() {
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let out = '';
    do {
        out = '';
        for (let i = 0; i < 6; i++) out += alphabet[Math.floor(Math.random() * alphabet.length)];
    } while (STORY_CODE_BLOCKLIST.has(out));
    return out;
}

function _drawStoryCodeQr(code) {
    const canvas = document.getElementById('storyCodeQrCanvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const size = 22;
    const cell = Math.floor(canvas.width / size);
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    let seed = 0;
    for (let i = 0; i < code.length; i++) seed = (seed * 31 + code.charCodeAt(i)) >>> 0;
    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
            const v = (x * 73856093) ^ (y * 19349663) ^ seed;
            const on = ((v >>> 2) & 1) === 1 || x < 2 || y < 2 || x > size - 3 || y > size - 3;
            if (on) {
                ctx.fillStyle = '#111';
                ctx.fillRect(x * cell, y * cell, cell - 1, cell - 1);
            }
        }
    }
}

function _lzCompress(str) {
    // Compresión simple run-length para reducir tamaño del código exportado
    try {
        // Intentar usar CompressionStream si está disponible (navegadores modernos)
        return str; // fallback: sin compresión adicional (btoa ya es suficiente)
    } catch { return str; }
}

function _trimMessagesForExport(messages) {
    // Recortar a los últimos 200 mensajes para no sobrepasar localStorage (~5MB)
    const MAX = 200;
    if (!Array.isArray(messages)) return [];
    const msgs = messages.slice(-MAX);
    // Eliminar campos pesados opcionales que se pueden reconstruir
    return msgs.map(m => {
        const out = { ...m };
        // charSprite puede ser una URL muy larga - conservar solo si es corta
        if (out.charSprite && out.charSprite.length > 300) delete out.charSprite;
        return out;
    });
}

function exportCurrentStoryAsCode() {
    if (!currentTopicId) {
        showAutosave('Abre una historia primero', 'error');
        return;
    }
    const topic = appData.topics.find(t => String(t.id) === String(currentTopicId));
    if (!topic) return;

    const messages = _trimMessagesForExport(getTopicMessages(currentTopicId));

    // Solo incluir personajes que aparecen en esta historia
    const charIdsInTopic = new Set(messages.map(m => m.characterId).filter(Boolean));
    const relevantChars = appData.characters.filter(c => charIdsInTopic.has(c.id));

    // Clonar topic sin campos de caché que engordan el payload
    const topicClean = { ...topic };
    delete topicClean._cachedMessages;

    const payload = {
        v: 2,
        topic: topicClean,
        messages,
        chars: relevantChars
    };

    const serialized = btoa(unescape(encodeURIComponent(JSON.stringify(payload))));
    const kb = Math.round(serialized.length / 1024);
    if (kb > 4000) {
        showAutosave(`Historia muy grande (${kb}KB). Solo se exportarán los últimos 200 mensajes.`, 'error');
    }
    let code = _generateStoryCode();
    let retries = 0;
    while (localStorage.getItem(_storyCodeStorageKey(code)) && retries < 10) {
        code = _generateStoryCode();
        retries++;
    }
    try {
        localStorage.setItem(_storyCodeStorageKey(code), serialized);
        localStorage.setItem('etheria_last_story_code', code);
    } catch (e) {
        showAutosave('No se pudo guardar el código: almacenamiento lleno', 'error');
        return;
    }

    const codeEl = document.getElementById('storyCodeValue');
    if (codeEl) codeEl.textContent = code;
    _drawStoryCodeQr(code);
    openModal('storyCodeModal');
    showAutosave('Código de historia generado', 'saved');
}

function importStoryFromCode() {
    const code = (window.prompt('Introduce el código de 6 caracteres:') || '').trim().toUpperCase();
    if (!code) return;
    const raw = localStorage.getItem(_storyCodeStorageKey(code));
    if (!raw) {
        showAutosave('Código no encontrado en este dispositivo', 'error');
        return;
    }

    try {
        const payload = JSON.parse(decodeURIComponent(escape(atob(raw))));
        if (!payload || !payload.topic) throw new Error('Payload inválido');

        const importedTopic = { ...payload.topic, id: `${payload.topic.id}_${Date.now()}` };
        appData.topics.push(importedTopic);
        appData.messages[importedTopic.id] = Array.isArray(payload.messages) ? payload.messages.map((m) => ({ ...m, id: `${m.id}_${Math.random().toString(16).slice(2)}` })) : [];

        if (Array.isArray(payload.chars)) {
            const known = new Set(appData.characters.map(c => String(c.id)));
            payload.chars.forEach((c) => {
                if (!known.has(String(c.id))) appData.characters.push(c);
            });
        }

        hasUnsavedChanges = true;
        save({ silent: true });
        renderTopics();
        showAutosave('Historia importada desde código', 'saved');
    } catch (err) {
        showAutosave('No se pudo importar el código', 'error');
    }
}

function exportData() {
    const blob = new Blob([JSON.stringify(appData, null, 2)], {type: 'application/json'});
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `etheria_${new Date().toISOString().split('T')[0]}.json`;
    a.click();
}

function deleteCharFromModal() {
    const id = document.getElementById('editCharacterId')?.value;
    if(!id) return;

    openConfirmModal('¿Borrar este personaje? Esta acción no se puede deshacer.', 'Borrar').then(ok => {
        if (!ok) return;
        if (selectedCharId === id) {
            selectedCharId = null;
            localStorage.removeItem(`etheria_selected_char_${currentUserIndex}`);
        }
        appData.characters = appData.characters.filter(c => c.id !== id);
        hasUnsavedChanges = true;
        save({ silent: true });
        closeModal('characterModal');
        resetCharForm();
        renderGallery();
    });
}

let immersiveUiHideTimer = null;
let immersiveUiShowTimer = null;
const IMMERSIVE_REVEAL_DELAY = 200;
const IMMERSIVE_HIDE_AFTER_MS = 3000;

function toggleImmersiveModeSetting(enabled) {
    const active = !!enabled;
    try { localStorage.setItem('etheria_immersive_mode', active ? '1' : '0'); } catch (error) { window.EtheriaLogger?.warn('app', 'operation failed:', error?.message || error); }
    document.body.classList.toggle('immersive-mode', active);
    if (active) revealImmersiveUiTemporarily();
}

function revealImmersiveUiTemporarily() {
    if (!document.body.classList.contains('immersive-mode')) return;
    const vnSection = document.getElementById('vnSection');
    if (!vnSection || !vnSection.classList.contains('active')) return;

    if (immersiveUiShowTimer) clearTimeout(immersiveUiShowTimer);
    immersiveUiShowTimer = setTimeout(() => {
        document.body.classList.add('immersive-reveal');
    }, IMMERSIVE_REVEAL_DELAY);

    if (immersiveUiHideTimer) clearTimeout(immersiveUiHideTimer);
    immersiveUiHideTimer = setTimeout(() => {
        document.body.classList.remove('immersive-reveal');
    }, IMMERSIVE_HIDE_AFTER_MS);
}

// ============================================
// AJUSTES
// ============================================
function openSettings() {
    const panel = document.getElementById('settingsPanel');
    if (panel) panel.classList.add('active');
}

function closeSettings() {
    const panel = document.getElementById('settingsPanel');
    if (panel) panel.classList.remove('active');
}

function updateTextSpeed(val) {
    textSpeed = 110 - parseInt(val);
    localStorage.setItem('etheria_text_speed', textSpeed);
    if (typeof SupabaseSettings !== 'undefined') SupabaseSettings.syncCurrentSettings().catch(() => {});

    const speedValue = document.getElementById('speedValue');
    if (speedValue) {
        const labels = ['Rápido', 'Normal', 'Lento'];
        const idx = val < 40 ? 0 : val < 70 ? 1 : 2;
        speedValue.textContent = labels[idx];
    }
}

function updateFontSize(val) {
    document.documentElement.style.setProperty('--font-size-base', val + 'px');
    localStorage.setItem('etheria_font_size', val);
    if (typeof SupabaseSettings !== 'undefined') SupabaseSettings.syncCurrentSettings().catch(() => {});
}

function setAtmosphere(filter, element) {
    const vnSection = document.getElementById('vnSection');
    if (!vnSection) return;

    vnSection.classList.remove('sepia', 'bw', 'cinematic');
    if (filter !== 'none') vnSection.classList.add(filter);

    document.querySelectorAll('.filter-btn').forEach(btn => btn.classList.remove('active'));
    const btn = element || document.querySelector(`.filter-btn[onclick*="'${filter}'"]`);
    if (btn) btn.classList.add('active');
}

// ── ONBOARDING PRIMER ACCESO ──────────────────────────────
const _ONBOARDING_KEY = 'etheria_onboarding_done';

const _ONBOARDING_MESSAGES = [
    'Bienvenida a Etheria.\n\nElige un perfil para comenzar. Cada perfil guarda tu propio universo de historias y personajes, completamente separado del de los demás.',
    'Aquí encontrarás tus historias en curso.\n\nPuedes crear nuevas, retomar las existentes o explorar lo que han escrito otros. Todo a tu ritmo.',
    'Cuando estés dentro de una historia, pulsa en la caja de diálogo para avanzar.\n\nUsa el botón "Responder" para añadir tu voz a la narrativa.'
];

function maybeShowOnboarding() {
    if (localStorage.getItem(_ONBOARDING_KEY)) return;
    const step = parseInt(localStorage.getItem('etheria_onboarding_step') || '0', 10);
    if (step >= _ONBOARDING_MESSAGES.length) {
        localStorage.setItem(_ONBOARDING_KEY, '1');
        return;
    }
    const overlay = document.getElementById('onboardingOverlay');
    const textEl  = document.getElementById('onboardingText');
    if (!overlay || !textEl) return;
    textEl.textContent = _ONBOARDING_MESSAGES[step];
    overlay.style.display = 'flex';
}

function closeOnboarding() {
    const overlay = document.getElementById('onboardingOverlay');
    if (overlay) overlay.style.display = 'none';
    const step = parseInt(localStorage.getItem('etheria_onboarding_step') || '0', 10);
    const next = step + 1;
    if (next >= _ONBOARDING_MESSAGES.length) {
        localStorage.setItem(_ONBOARDING_KEY, '1');
    } else {
        localStorage.setItem('etheria_onboarding_step', String(next));
    }
}


function syncMenuProfileHint() {
    const hint = document.getElementById('menuProfileHint');
    if (!hint) return;
    const isDesktop = typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(pointer:fine)').matches;
    hint.textContent = isDesktop ? 'Haz clic para editar perfil' : 'Toca para editar perfil';
}

function applyPersistedImmersiveMode() {
    const enabled = localStorage.getItem('etheria_immersive_mode') === '1';
    document.body.classList.toggle('immersive-mode', enabled);
}

if (typeof window !== 'undefined') {
    window.addEventListener('DOMContentLoaded', () => {
        applyPersistedImmersiveMode();
        syncMenuProfileHint();
    });
    window.addEventListener('resize', syncMenuProfileHint, { passive: true });
}

// ══════════════════════════════════════════════════════════════════════════
// MODAL DE PERFIL RÁPIDO — acceso directo desde el menú principal
// ══════════════════════════════════════════════════════════════════════════

function openProfileModal() {
    _syncProfileModal();
    const modal = document.getElementById('profileModal');
    if (modal) modal.classList.add('active');
}

function closeProfileModal() {
    const modal = document.getElementById('profileModal');
    if (modal) modal.classList.remove('active');
}

function _syncProfileModal() {
    const name     = userNames[currentUserIndex] || '';
    const genders  = _getGenders();
    const birthdays = _getBirthdays();
    const avatar   = _getCurrentProfileAvatar();

    // Nombre
    const nameInput = document.getElementById('pmName');
    if (nameInput) nameInput.value = name;

    // Initial
    const initEl = document.getElementById('pmInitial');
    if (initEl) initEl.textContent = (name || '?')[0].toUpperCase();

    // Avatar
    const imgEl     = document.getElementById('pmAvatarImg');
    const removeBtn = document.getElementById('pmRemoveAvatar');
    if (imgEl) {
        if (avatar) {
            imgEl.src = avatar;
            imgEl.style.display = 'block';
            if (removeBtn) removeBtn.style.display = 'inline-block';
        } else {
            imgEl.src = '';
            imgEl.style.display = 'none';
            if (removeBtn) removeBtn.style.display = 'none';
        }
    }

    // Género
    const genderSel = document.getElementById('pmGender');
    if (genderSel) genderSel.value = genders[currentUserIndex] || '';

    // Cumpleaños
    const bdayInput = document.getElementById('pmBirthday');
    if (bdayInput) bdayInput.value = birthdays[currentUserIndex] || '';

    // Sincronizar también el avatar del footer
    syncMenuFooterAvatar();
}

function saveProfileModalName() {
    const input = document.getElementById('pmName');
    if (!input) return;
    const name = input.value.trim();
    if (!name) { showAutosave('Escribe un nombre', 'error'); return; }
    userNames[currentUserIndex] = name;
    localStorage.setItem('etheria_user_names', JSON.stringify(userNames));
    const display = document.getElementById('currentUserDisplay');
    if (display) display.textContent = name;
    showAutosave('Nombre actualizado', 'saved');
    // Actualizar initial en el modal y en el footer
    const initEl = document.getElementById('pmInitial');
    if (initEl) initEl.textContent = name[0].toUpperCase();
    syncMenuFooterAvatar();
    if (typeof renderUserCards === 'function') renderUserCards();
    // Sync opt panel also if open
    const optName = document.getElementById('optProfileName');
    if (optName) optName.value = name;
    _syncAvatarInitials();
}

async function handleProfileModalAvatar(input) {
    const file = input.files[0];
    if (!file) return;
    if (file.size > 1.2 * 1024 * 1024) {
        showAutosave('La imagen es demasiado grande (máx. 1 MB)', 'error');
        return;
    }

    showAutosave('Guardando avatar...', 'info');
    const userId = await _getAuthenticatedUserIdForAvatar();

    if (userId) {
        const cloud = await _uploadProfileAvatarToCloud(file);
        if (!cloud.ok) {
            showAutosave(cloud.error || 'Error al subir avatar a la nube', 'error');
            input.value = '';
            return;
        }
        _saveAvatarInLocalProfile(cloud.url);
    } else {
        const reader = new FileReader();
        reader.onload = (e) => {
            const data = e.target.result;
            _saveAvatarInLocalProfile(data);
            _syncProfileModal();
            _syncProfileTab();
            showAutosave('Avatar guardado localmente', 'saved');
            if (typeof renderUserCards === 'function') renderUserCards();
        };
        reader.readAsDataURL(file);
        input.value = '';
        return;
    }

    _syncProfileModal();
    _syncProfileTab();
    showAutosave('Avatar guardado en la nube', 'saved');
    if (typeof renderUserCards === 'function') renderUserCards();
    input.value = '';
}

async function removeProfileModalAvatar() {
    _saveAvatarInLocalProfile('');
    await _removeProfileAvatarFromCloud();
    _syncProfileModal();
    _syncProfileTab();
    showAutosave('Avatar eliminado', 'saved');
    if (typeof renderUserCards === 'function') renderUserCards();
}

// Sincroniza el mini-avatar del footer con los datos actuales del perfil
function syncMenuFooterAvatar() {
    const name    = userNames[currentUserIndex] || '?';
    const avatar  = _getCurrentProfileAvatar();

    // Nombre en el footer
    const nameEl = document.getElementById('currentUserDisplay');
    if (nameEl) nameEl.textContent = name;
    syncMenuProfileHint();

    // Initial en el footer
    const initEl = document.getElementById('menuProfileInitial');
    if (initEl) initEl.textContent = name[0].toUpperCase();

    // Imagen en el footer
    const imgEl = document.getElementById('menuProfileImg');
    if (imgEl) {
        if (avatar) {
            imgEl.src = avatar;
            imgEl.style.display = 'block';
        } else {
            imgEl.src = '';
            imgEl.style.display = 'none';
        }
    }
}

/* js/utils/supabaseProfiles.js */
// ============================================
// SUPABASE PROFILES — Perfiles globales
// ============================================
// Tabla `profiles`:
//   id             uuid  PK
//   name           text  UNIQUE
//   stats          jsonb
//   owner_user_id  uuid  → auth.users.id (null = perfil libre)
//   created_at     timestamp
//
// RLS esperado: SELECT de perfiles libres o propios / INSERT+UPDATE solo owner
// ============================================

const SupabaseProfiles = (function () {

    let _initDone = false;   // guard contra init() múltiple
    const ACTIVE_PROFILE_STORAGE_KEY = 'etheria_active_cloud_profile_id';

    // ── Helpers internos ─────────────────────────────────────────────────────

    function _client() {
        return window.supabaseClient || null;
    }

    // supabase-js v2: userId solo disponible async via getUser().
    // Guardamos el último userId conocido en caché local para comparaciones síncronas.
    let _cachedUserId = null;
    let _activeProfileId = null;

    async function _getCurrentUser() {
        const sb = _client();
        if (!sb) return null;
        try {
            const { data, error } = await sb.auth.getUser();
            if (error || !data?.user) return null;
            _cachedUserId = data.user.id;
            return data.user;
        } catch { return null; }
    }

    function _currentUserId() {
        return _cachedUserId;
    }

    function _isAvailable() {
        return !!_client();
    }

    function _ensureCloudProfilesKey() {
        if (typeof appData !== 'undefined' && !Array.isArray(appData.cloudProfiles)) {
            appData.cloudProfiles = [];
        }
    }

    function _readStoredActiveProfileId() {
        try {
            return localStorage.getItem(ACTIVE_PROFILE_STORAGE_KEY) || null;
        } catch {
            return null;
        }
    }

    function _storeActiveProfileId(profileId) {
        try {
            if (profileId) localStorage.setItem(ACTIVE_PROFILE_STORAGE_KEY, profileId);
            else localStorage.removeItem(ACTIVE_PROFILE_STORAGE_KEY);
        } catch {
            // ignore storage failures
        }
    }

    function _emitActiveProfileChanged(profileId, reason = 'manual') {
        window.dispatchEvent(new CustomEvent('etheria:active-profile-changed', {
            detail: { profileId: profileId || null, reason }
        }));
    }

    // ── Perfiles ─────────────────────────────────────────────────────────────

    async function loadCloudProfiles() {
        if (!_isAvailable()) return [];
        _ensureCloudProfilesKey();
        try {
            const user = await _getCurrentUser();
            const userId = user?.id || null;

            let query = _client()
                .from('profiles')
                .select('*')
                .order('name', { ascending: true });

            // Evitar exponer perfiles ocupados por terceros en la UI.
            // - Usuario autenticado: ver libres + propios.
            // - Usuario no autenticado: ver solo libres.
            query = userId
                ? query.or(`owner_user_id.is.null,owner_user_id.eq.${userId}`)
                : query.is('owner_user_id', null);

            const { data, error } = await query;

            if (error) {
                console.error('[SupabaseProfiles] loadCloudProfiles:', error.message);
                return [];
            }
            appData.cloudProfiles = Array.isArray(data) ? data : [];
            window.dispatchEvent(new CustomEvent('etheria:cloud-profiles-loaded', {
                detail: { profiles: appData.cloudProfiles }
            }));
            return appData.cloudProfiles;
        } catch (err) {
            console.error('[SupabaseProfiles] loadCloudProfiles exception:', err);
            return [];
        }
    }

    async function createCloudProfile(name, stats = {}) {
        if (!_isAvailable()) return { ok: false, error: 'Sin conexión a Supabase.' };

        const user = await _getCurrentUser();
        if (!user) return { ok: false, error: 'Debes iniciar sesión para crear un perfil.' };

        const trimmedName = String(name || '').trim();
        if (!trimmedName) return { ok: false, error: 'El nombre del perfil no puede estar vacío.' };

        try {
            const { data, error } = await _client()
                .from('profiles')
                .insert({ name: trimmedName, stats: stats || {}, owner_user_id: user.id })
                .select()
                .single();

            if (error) {
                const isDup = error.code === '23505'
                    || (error.message || '').toLowerCase().includes('unique')
                    || (error.message || '').toLowerCase().includes('duplicate')
                    || (error.details || '').toLowerCase().includes('name');
                return { ok: false, error: isDup ? 'Ya existe un perfil con ese nombre.' : (error.message || 'Error al crear el perfil.') };
            }

            _ensureCloudProfilesKey();
            appData.cloudProfiles.push(data);
            appData.cloudProfiles.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
            window.dispatchEvent(new CustomEvent('etheria:cloud-profile-created', { detail: { profile: data } }));
            return { ok: true, profile: data };
        } catch (err) {
            return { ok: false, error: err?.message || 'Error inesperado.' };
        }
    }

    async function updateCloudProfileStats(profileId, stats) {
        if (!_isAvailable()) return { ok: false, error: 'Sin conexión a Supabase.' };
        const user = await _getCurrentUser();
        if (!user) return { ok: false, error: 'No autenticado.' };
        try {
            const { data, error } = await _client()
                .from('profiles')
                .update({ stats })
                .eq('id', profileId)
                .eq('owner_user_id', user.id)
                .select()
                .single();
            if (error) return { ok: false, error: error.message };
            _ensureCloudProfilesKey();
            const idx = appData.cloudProfiles.findIndex(p => p.id === profileId);
            if (idx !== -1) appData.cloudProfiles[idx] = data;
            return { ok: true, profile: data };
        } catch (err) {
            return { ok: false, error: err?.message || 'Error inesperado.' };
        }
    }

    async function claimCloudProfile(profileId) {
        if (!_isAvailable()) return { ok: false, error: 'Sin conexión a Supabase.' };
        const user = await _getCurrentUser();
        if (!user) return { ok: false, error: 'No autenticado.' };
        try {
            // Claim atómico: solo funciona si sigue libre en servidor.
            const { data, error } = await _client()
                .from('profiles')
                .update({ owner_user_id: user.id })
                .eq('id', profileId)
                .is('owner_user_id', null)
                .select()
                .single();

            if (error) return { ok: false, error: error.message || 'No se pudo reclamar el perfil.' };

            _ensureCloudProfilesKey();
            const idx = appData.cloudProfiles.findIndex(p => p.id === profileId);
            if (idx !== -1) {
                appData.cloudProfiles[idx] = data;
            } else {
                appData.cloudProfiles.push(data);
            }
            return { ok: true, profile: data };
        } catch (err) {
            return { ok: false, error: err?.message || 'Error inesperado.' };
        }
    }

    async function releaseCloudProfile(profileId) {
        if (!_isAvailable()) return { ok: false, error: 'Sin conexión a Supabase.' };
        const user = await _getCurrentUser();
        if (!user) return { ok: false, error: 'No autenticado.' };
        try {
            const { data, error } = await _client()
                .from('profiles')
                .update({ owner_user_id: null })
                .eq('id', profileId)
                .eq('owner_user_id', user.id)
                .select()
                .single();
            if (error) return { ok: false, error: error.message };
            _ensureCloudProfilesKey();
            const idx = appData.cloudProfiles.findIndex(p => p.id === profileId);
            if (idx !== -1) appData.cloudProfiles[idx] = data;
            return { ok: true, profile: data };
        } catch (err) {
            return { ok: false, error: err?.message || 'Error inesperado.' };
        }
    }

    // ── Helpers de estado ────────────────────────────────────────────────────

    function isProfileTaken(profile) {
        return profile != null
            && profile.owner_user_id !== null
            && profile.owner_user_id !== undefined;
    }

    function getProfileStatus(profile) {
        if (!isProfileTaken(profile)) return 'free';
        const uid = _currentUserId();
        if (uid && profile.owner_user_id === uid) return 'mine';
        return 'taken';
    }

    function getProfileStatusLabel(profile) {
        const s = getProfileStatus(profile);
        if (s === 'free') return 'Libre';
        if (s === 'mine') return 'Tu personaje';
        return 'Ocupado';
    }

    function getProfileStatusClass(profile) {
        return `profile-${getProfileStatus(profile)}`;
    }

    function getMyProfiles() {
        const uid = _currentUserId();
        if (!uid || !Array.isArray(appData?.cloudProfiles)) return [];
        return appData.cloudProfiles.filter(p => p.owner_user_id === uid);
    }

    function getFreeProfiles() {
        if (!Array.isArray(appData?.cloudProfiles)) return [];
        return appData.cloudProfiles.filter(p => !isProfileTaken(p));
    }

    function getActiveProfileId() {
        return _activeProfileId;
    }

    function getActiveProfile() {
        if (!_activeProfileId || !Array.isArray(appData?.cloudProfiles)) return null;
        return appData.cloudProfiles.find(p => p.id === _activeProfileId) || null;
    }

    async function activateProfile(profileId, options = {}) {
        const { claimIfFree = true } = options;
        if (!profileId) {
            _activeProfileId = null;
            _storeActiveProfileId(null);
            _emitActiveProfileChanged(null, 'cleared');
            return { ok: true, profile: null };
        }

        const profile = (appData.cloudProfiles || []).find(p => p.id === profileId);
        if (!profile) return { ok: false, error: 'Perfil no encontrado.' };

        let resolved = profile;
        const status = getProfileStatus(profile);

        if (status === 'taken') {
            return { ok: false, error: 'Este perfil ya está ocupado por otro usuario.' };
        }

        if (status === 'free' && claimIfFree) {
            const claim = await claimCloudProfile(profileId);
            if (!claim.ok) {
                await loadCloudProfiles();
                return { ok: false, error: claim.error || 'No se pudo reclamar el perfil.' };
            }
            resolved = claim.profile || profile;
        }

        _activeProfileId = resolved.id;
        _storeActiveProfileId(_activeProfileId);
        _emitActiveProfileChanged(_activeProfileId, 'activated');
        return { ok: true, profile: resolved };
    }

    // ── Render ───────────────────────────────────────────────────────────────

    function renderCloudProfileList(container, { onSelect, showStats = false } = {}) {
        if (!container) return;
        _ensureCloudProfilesKey();

        const profiles = appData.cloudProfiles;
        if (!profiles.length) {
            container.innerHTML = '<p class="cloud-profiles-empty">No hay perfiles globales aún.</p>';
            return;
        }

        container.innerHTML = profiles.map(p => {
            const status   = getProfileStatus(p);
            const label    = getProfileStatusLabel(p);
            const cssClass = getProfileStatusClass(p);
            const initial  = (p.name || '?')[0].toUpperCase();
            const disabled = status === 'taken' ? 'disabled' : '';
            const statsHtml = showStats && p.stats
                ? `<div class="cloud-profile-stats">${
                    Object.entries(p.stats).slice(0, 4).map(([k, v]) =>
                        `<span class="cloud-stat"><em>${escapeHtml(String(k))}</em> ${escapeHtml(String(v))}</span>`
                    ).join('')
                  }</div>`
                : '';

            return `
            <div class="cloud-profile-card ${cssClass}" data-profile-id="${escapeHtml(p.id)}">
                <div class="cloud-profile-avatar">${initial}</div>
                <div class="cloud-profile-info">
                    <span class="cloud-profile-name">${escapeHtml(p.name || '')}</span>
                    ${statsHtml}
                </div>
                <span class="cloud-profile-status-badge ${cssClass}">${label}</span>
                ${onSelect && status !== 'taken' ? `
                <button type="button" class="cloud-profile-select-btn"
                        onclick="SupabaseProfiles._handleSelect(this)"
                        data-profile-id="${escapeHtml(p.id)}"
                        ${disabled}>
                    ${status === 'mine' ? 'Ver' : 'Usar'}
                </button>` : ''}
            </div>`;
        }).join('');

        if (onSelect) SupabaseProfiles._onSelectCallback = onSelect;
    }

    async function _handleSelect(btn) {
        const profileId = btn?.dataset?.profileId;
        if (!profileId || !SupabaseProfiles._onSelectCallback) return;

        const result = await activateProfile(profileId, { claimIfFree: true });
        if (!result.ok) {
            if (typeof eventBus !== 'undefined') {
                eventBus.emit('ui:show-autosave', {
                    text: result.error || 'No se pudo activar el perfil.',
                    state: 'error'
                });
            }
            return;
        }

        if (result.profile) SupabaseProfiles._onSelectCallback(result.profile);
    }

    // ── Init ─────────────────────────────────────────────────────────────────

    function init() {
        _ensureCloudProfilesKey();

        // Cargar userId en caché para comparaciones síncronas
        _getCurrentUser().catch(() => {});

        // Cargar perfiles y restaurar perfil activo previo si sigue accesible
        if (_isAvailable()) {
            loadCloudProfiles().then(() => {
                const storedProfileId = _readStoredActiveProfileId();
                if (!storedProfileId) return;
                const profile = (appData.cloudProfiles || []).find(p => p.id === storedProfileId);
                if (profile) {
                    _activeProfileId = storedProfileId;
                    _emitActiveProfileChanged(_activeProfileId, 'restored');
                } else {
                    _activeProfileId = null;
                    _storeActiveProfileId(null);
                }
            }).catch(() => {});
        }

        // Registrar listeners solo una vez
        if (_initDone) return;
        _initDone = true;

        // Re-cargar cuando el usuario cambia de sesión
        window.addEventListener('etheria:auth-changed', (e) => {
            const userId = e.detail?.user?.id || null;
            if (!userId) {
                _cachedUserId = null;
                _activeProfileId = null;
                _storeActiveProfileId(null);
                _emitActiveProfileChanged(null, 'signed-out');
            }
            _getCurrentUser().then(() => loadCloudProfiles()).catch(() => {});
        });

        // Cargar personajes cuando se activa un perfil
        window.addEventListener('etheria:active-profile-changed', (e) => {
            const profileId = e.detail?.profileId;
            if (profileId && typeof SupabaseCharacters !== 'undefined') {
                SupabaseCharacters.setActiveProfile(profileId).catch(() => {});
            }
        });
    }

    // ── API pública ──────────────────────────────────────────────────────────

    return {
        init,
        loadCloudProfiles,
        createCloudProfile,
        updateCloudProfileStats,
        claimCloudProfile,
        releaseCloudProfile,
        isProfileTaken,
        getProfileStatus,
        getProfileStatusLabel,
        getProfileStatusClass,
        getMyProfiles,
        getFreeProfiles,
        getActiveProfileId,
        getActiveProfile,
        activateProfile,
        renderCloudProfileList,
        _handleSelect,
        _onSelectCallback: null
    };

})();

window.SupabaseProfiles = SupabaseProfiles;

/* js/utils/supabaseCharacters.js */
// ============================================
// SUPABASE CHARACTERS — Personajes por perfil
// ============================================
// Tabla `characters`:
//   id          uuid  PK
//   profile_id  uuid  → profiles.id
//   name        text
//   stats       jsonb
//   created_at  timestamp
//
// Los personajes se cargan solo para el perfil activo.
// No modifica appData.characters ni el sistema local.
// ============================================

const SupabaseCharacters = (function () {

    // profileId → Array<character>
    const _cache = new Map();
    let _activeProfileId = null;

    // ── Helpers ──────────────────────────────────────────────────────────────

    function _client() {
        return window.supabaseClient || null;
    }

    function _isAvailable() {
        return !!_client();
    }

    // Fix C: cached user id — populated on etheria:auth-changed to avoid getUser() per-operation
    let _cachedUserId = window._cachedUserId || null;
    window.addEventListener('etheria:auth-changed', function (e) {
        _cachedUserId = e.detail?.user?.id || window._cachedUserId || null;
    });

    async function _getCurrentUser() {
        const cachedId = _cachedUserId || window._cachedUserId || null;
        if (cachedId) return { id: cachedId }; // Fix C: fast-path, no network
        const sb = _client();
        if (!sb) return null;
        try {
            const { data, error } = await sb.auth.getUser();
            if (error || !data?.user) return null;
            _cachedUserId = data.user.id;
            return data.user;
        } catch { return null; }
    }

    async function _isProfileOwner(profileId) {
        const user = await _getCurrentUser();
        if (!user) return false;

        // Buscar en caché de perfiles primero (evita petición extra)
        if (Array.isArray(appData?.cloudProfiles)) {
            const prof = appData.cloudProfiles.find(p => p.id === profileId);
            if (prof) return prof.owner_user_id === user.id;
        }

        // Fallback: consultar Supabase directamente
        try {
            const { data } = await _client()
                .from('profiles')
                .select('owner_user_id')
                .eq('id', profileId)
                .single();
            return data?.owner_user_id === user.id;
        } catch { return false; }
    }

    function _updateAppDataCache(profileId, chars) {
        if (typeof appData === 'undefined') return;
        if (!appData.cloudCharacters) appData.cloudCharacters = {};
        appData.cloudCharacters[profileId] = chars;
    }

    // ── API pública ───────────────────────────────────────────────────────────

    async function loadCharacters(profileId) {
        if (!_isAvailable() || !profileId) return [];
        try {
            const { data, error } = await _client()
                .from('characters')
                .select('*')
                .eq('profile_id', profileId)
                .order('created_at', { ascending: true });

            if (error) {
                console.error('[SupabaseCharacters] loadCharacters:', error.message);
                return [];
            }

            const chars = Array.isArray(data) ? data : [];
            _cache.set(profileId, chars);
            _activeProfileId = profileId;
            _updateAppDataCache(profileId, chars);

            window.dispatchEvent(new CustomEvent('etheria:cloud-characters-loaded', {
                detail: { profileId, characters: chars }
            }));
            return chars;
        } catch (err) {
            console.error('[SupabaseCharacters] loadCharacters exception:', err);
            return [];
        }
    }

    async function createCharacter(profileId, name, stats = {}) {
        if (!_isAvailable()) return { ok: false, error: 'Sin conexión a Supabase.' };
        if (!profileId)       return { ok: false, error: 'Se requiere un perfil activo.' };

        const trimmedName = String(name || '').trim();
        if (!trimmedName) return { ok: false, error: 'El nombre del personaje no puede estar vacío.' };

        const isOwner = await _isProfileOwner(profileId);
        if (!isOwner) return { ok: false, error: 'Solo el dueño del perfil puede añadir personajes.' };

        try {
            const { data, error } = await _client()
                .from('characters')
                .insert({ profile_id: profileId, name: trimmedName, stats: stats || {} })
                .select()
                .single();

            if (error) return { ok: false, error: error.message || 'Error al crear el personaje.' };

            // Actualizar caché
            const list = _cache.get(profileId) || [];
            list.push(data);
            _cache.set(profileId, list);
            _updateAppDataCache(profileId, list);

            window.dispatchEvent(new CustomEvent('etheria:cloud-character-created', {
                detail: { profileId, character: data }
            }));
            return { ok: true, character: data };
        } catch (err) {
            return { ok: false, error: err?.message || 'Error inesperado.' };
        }
    }

    async function updateCharacter(characterId, stats) {
        if (!_isAvailable()) return { ok: false, error: 'Sin conexión a Supabase.' };
        try {
            const { data, error } = await _client()
                .from('characters')
                .update({ stats })
                .eq('id', characterId)
                .select()
                .single();

            if (error) return { ok: false, error: error.message };

            const profileId = data.profile_id;
            const list = _cache.get(profileId);
            if (list) {
                const idx = list.findIndex(c => c.id === characterId);
                if (idx !== -1) { list[idx] = data; _updateAppDataCache(profileId, list); }
            }
            return { ok: true, character: data };
        } catch (err) {
            return { ok: false, error: err?.message || 'Error inesperado.' };
        }
    }

    async function deleteCharacter(characterId, profileId) {
        if (!_isAvailable()) return { ok: false, error: 'Sin conexión a Supabase.' };
        try {
            const { error } = await _client()
                .from('characters')
                .delete()
                .eq('id', characterId);

            if (error) return { ok: false, error: error.message };

            if (profileId && _cache.has(profileId)) {
                const updated = _cache.get(profileId).filter(c => c.id !== characterId);
                _cache.set(profileId, updated);
                _updateAppDataCache(profileId, updated);
            }
            return { ok: true };
        } catch (err) {
            return { ok: false, error: err?.message || 'Error inesperado.' };
        }
    }

    async function setActiveProfile(profileId) {
        _activeProfileId = profileId;
        return loadCharacters(profileId);
    }

    function getActiveCharacters() {
        if (!_activeProfileId) return [];
        return _cache.get(_activeProfileId) || [];
    }

    function getCachedCharacters(profileId) {
        return _cache.get(profileId) || [];
    }

    function clearCache(profileId) {
        if (profileId) {
            _cache.delete(profileId);
            if (appData?.cloudCharacters) delete appData.cloudCharacters[profileId];
        } else {
            _cache.clear();
            if (typeof appData !== 'undefined') appData.cloudCharacters = {};
        }
    }

    return {
        loadCharacters,
        createCharacter,
        updateCharacter,
        deleteCharacter,
        setActiveProfile,
        getActiveCharacters,
        getCachedCharacters,
        clearCache,
        get activeProfileId() { return _activeProfileId; }
    };

})();

window.SupabaseCharacters = SupabaseCharacters;

/* js/utils/supabaseSettings.js */
// ============================================
// SUPABASE USER SETTINGS
// ============================================
// Tabla `user_settings`:
//   user_id     uuid  PK (references auth.users.id)
//   font_size   int
//   text_speed  int
//   theme       text  ('light' | 'dark')
//   ui_volume   int   (0-100) → etheria_master_volume
//   rain_volume int   (0-100) → etheria_rain_volume
//   avatar_url  text  (URL pública del avatar de perfil)
//
// Flujo: login → loadUserSettings() → aplicar a UI + localStorage
// Cuando un slider cambia → saveUserSettings() persiste en Supabase
// ============================================

const SupabaseSettings = (function () {

    const DEFAULTS = {
        font_size  : 19,
        text_speed : 25,    // valor textSpeed real (no el slider invertido)
        theme      : 'light',
        ui_volume  : 50,
        rain_volume: 30,
        avatar_url : ''
    };

    // ── Helpers ──────────────────────────────────────────────────────────────

    function _client() { return window.supabaseClient || null; }
    function _isAvailable() { return !!_client(); }

    async function _getUserId() {
        // Fix 6: use global auth cache — avoids network round-trip on every settings save
        if (window._cachedUserId) return window._cachedUserId;
        const sb = _client();
        if (!sb) return null;
        try {
            const { data, error } = await sb.auth.getUser();
            if (error || !data?.user) return null;
            window._cachedUserId = data.user.id;
            return data.user.id;
        } catch { return null; }
    }

    // ── Leer desde localStorage (fuente de verdad local) ────────────────────

    function _readLocal() {
        const rawSpeed = localStorage.getItem('etheria_text_speed');
        const rawSize  = localStorage.getItem('etheria_font_size');
        return {
            font_size  : rawSize  ? parseInt(rawSize,  10) : DEFAULTS.font_size,
            text_speed : rawSpeed ? parseInt(rawSpeed, 10) : DEFAULTS.text_speed,
            theme      : localStorage.getItem('etheria_theme') || DEFAULTS.theme,
            ui_volume  : parseInt(localStorage.getItem('etheria_master_volume') || DEFAULTS.ui_volume,  10),
            rain_volume: parseInt(localStorage.getItem('etheria_rain_volume')   || DEFAULTS.rain_volume, 10),
            avatar_url : localStorage.getItem('etheria_cloud_avatar_url') || ''
        };
    }

    // ── Aplicar ajustes a localStorage y sliders/UI ──────────────────────────

    function _applyToUI(settings) {
        const s = Object.assign({}, DEFAULTS, settings);

        // 1. font_size
        localStorage.setItem('etheria_font_size', String(s.font_size));
        document.documentElement.style.setProperty('--font-size-base', s.font_size + 'px');
        const szSlider = document.getElementById('fontSizeSlider') || document.getElementById('optFontSize');
        if (szSlider) szSlider.value = s.font_size;
        const szVal = document.getElementById('optFontSizeVal');
        if (szVal) szVal.textContent = s.font_size + 'px';

        // 2. text_speed  (textSpeed es el valor real; el slider está invertido: slider = 110 - speed)
        localStorage.setItem('etheria_text_speed', String(s.text_speed));
        if (typeof textSpeed !== 'undefined') {
            // eslint-disable-next-line no-undef
            window.textSpeed = s.text_speed;
        }
        const spSlider = document.getElementById('textSpeedSlider') || document.getElementById('optTextSpeed');
        if (spSlider) {
            const sliderVal = 110 - s.text_speed;
            spSlider.value = sliderVal;
            if (typeof syncSpeedLabel === 'function') syncSpeedLabel(sliderVal);
        }

        // 3. theme
        localStorage.setItem('etheria_theme', s.theme);
        document.documentElement.setAttribute('data-theme', s.theme);
        const themeBtn = document.getElementById('themeToggleBtn');
        if (themeBtn) themeBtn.textContent = s.theme === 'dark' ? '☀️ Claro' : '🌙 Oscuro';
        if (typeof updateProfileThemeBtn === 'function') updateProfileThemeBtn();

        // 4. ui_volume (master volume)
        localStorage.setItem('etheria_master_volume', String(s.ui_volume));
        if (typeof masterVolume !== 'undefined') {
            window.masterVolume = s.ui_volume / 100 * 0.36;
        }
        const mvSlider = document.getElementById('optMasterVol');
        if (mvSlider) mvSlider.value = s.ui_volume;
        const mvVal = document.getElementById('optMasterVolVal');
        if (mvVal) mvVal.textContent = s.ui_volume + '%';

        // 5. rain_volume
        localStorage.setItem('etheria_rain_volume', String(s.rain_volume));
        const rvSlider = document.getElementById('optRainVol');
        if (rvSlider) rvSlider.value = s.rain_volume;
        const rvVal = document.getElementById('optRainVolVal');
        if (rvVal) rvVal.textContent = s.rain_volume + '%';

        // 6. avatar_url de perfil (fallback cloud si no hay avatar local del perfil actual)
        localStorage.setItem('etheria_cloud_avatar_url', String(s.avatar_url || ''));

        // Notificar para que otros módulos puedan reaccionar
        window.dispatchEvent(new CustomEvent('etheria:settings-applied', { detail: s }));
    }

    // ── API pública ──────────────────────────────────────────────────────────

    /**
     * Carga los ajustes del usuario desde Supabase.
     * Si no existe fila, crea una con los valores actuales del localStorage.
     * Aplica los ajustes cargados a la UI.
     */
    async function loadUserSettings() {
        if (!_isAvailable()) return;
        const userId = await _getUserId();
        if (!userId) return;

        try {
            const { data, error } = await _client()
                .from('user_settings')
                .select('*')
                .eq('user_id', userId)
                .maybeSingle();

            if (error) {
                console.error('[SupabaseSettings] loadUserSettings:', error.message);
                return;
            }

            if (data) {
                // Fila existente — aplicar a UI
                _applyToUI(data);
            } else {
                // Primera vez — guardar los valores locales actuales en Supabase
                const local = _readLocal();
                await saveUserSettings(local);
            }
        } catch (err) {
            console.error('[SupabaseSettings] loadUserSettings exception:', err);
        }
    }

    /**
     * Persiste un objeto de ajustes en Supabase (upsert).
     * @param {object} settings  Puede ser parcial — se mezcla con los locales
     */
    async function saveUserSettings(settings) {
        if (!_isAvailable()) return;
        const userId = await _getUserId();
        if (!userId) return;

        const merged = Object.assign(_readLocal(), settings || {});

        const row = {
            user_id    : userId,
            font_size  : Number(merged.font_size)   || DEFAULTS.font_size,
            text_speed : Number(merged.text_speed)  || DEFAULTS.text_speed,
            theme      : String(merged.theme        || DEFAULTS.theme),
            ui_volume  : Number(merged.ui_volume)   || DEFAULTS.ui_volume,
            rain_volume: Number(merged.rain_volume) || DEFAULTS.rain_volume,
            avatar_url : String(merged.avatar_url || '')
        };

        try {
            const { error } = await _client()
                .from('user_settings')
                .upsert(row, { onConflict: 'user_id' });

            if (error) {
                console.error('[SupabaseSettings] saveUserSettings:', error.message);
            }
        } catch (err) {
            console.error('[SupabaseSettings] saveUserSettings exception:', err);
        }
    }

    /**
     * Guarda los ajustes actuales (lee de localStorage).
     * Atajo para llamar después de cualquier cambio de slider.
     */
    async function syncCurrentSettings() {
        return saveUserSettings(_readLocal());
    }

    /**
     * Devuelve los ajustes actuales desde localStorage (síncrono).
     */
    function getCurrentSettings() {
        return _readLocal();
    }

    return {
        loadUserSettings,
        saveUserSettings,
        syncCurrentSettings,
        getCurrentSettings
    };

})();

window.SupabaseSettings = SupabaseSettings;

/* js/utils/supabaseAvatars.js */
// ============================================
// SUPABASE AVATARS — Avatares en Storage
// ============================================
// Bucket: "avatars" (público)
// Path:   avatars/{characterId}.png
//
// uploadCharacterAvatar(characterId, file)
//   1. Sube imagen al bucket
//   2. Obtiene URL pública
//   3. Guarda avatar_url en characters
//   4. Actualiza el campo local appData.characters[*].avatar
// ============================================

const SupabaseAvatars = (function () {

    const BUCKET = 'avatars';

    // ── Helpers ──────────────────────────────────────────────────────────────

    function _client() { return window.supabaseClient || null; }
    function _isAvailable() { return !!_client(); }

    function _ext(file) {
        const name = file?.name || '';
        const m = name.match(/\.(png|jpg|jpeg|gif|webp)$/i);
        return m ? m[1].toLowerCase() : 'png';
    }

    function _mimeForExt(ext) {
        const map = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp' };
        return map[ext] || 'image/png';
    }

    // ── API pública ──────────────────────────────────────────────────────────

    /**
     * Sube un archivo de imagen como avatar de un personaje.
     *
     * @param {string}  characterId  UUID del personaje (tabla Supabase characters)
     *                               o ID local si no tiene UUID de Supabase.
     * @param {File}    file         Archivo de imagen seleccionado por el usuario.
     * @returns {Promise<{ok: boolean, url?: string, error?: string}>}
     */
    async function uploadCharacterAvatar(characterId, file) {
        if (!_isAvailable()) {
            return { ok: false, error: 'Sin conexión a Supabase.' };
        }
        if (!characterId) {
            return { ok: false, error: 'characterId requerido.' };
        }
        if (!file || !file.type.startsWith('image/')) {
            return { ok: false, error: 'El archivo debe ser una imagen.' };
        }
        if (file.size > 5 * 1024 * 1024) {
            return { ok: false, error: 'La imagen no puede superar 5 MB.' };
        }

        const ext  = _ext(file);
        const path = `${characterId}.${ext}`;

        try {
            const sb = _client();

            // 1. Subir al bucket (upsert para sobreescribir si ya existe)
            const { error: uploadError } = await sb.storage
                .from(BUCKET)
                .upload(path, file, {
                    contentType : _mimeForExt(ext),
                    upsert      : true
                });

            if (uploadError) {
                console.error('[SupabaseAvatars] upload error:', uploadError.message);
                return { ok: false, error: uploadError.message || 'Error al subir la imagen.' };
            }

            // 2. Obtener URL pública
            const { data: urlData } = sb.storage
                .from(BUCKET)
                .getPublicUrl(path);

            const publicUrl = urlData?.publicUrl;
            if (!publicUrl) {
                return { ok: false, error: 'No se pudo obtener la URL pública del avatar.' };
            }

            // 3. Guardar avatar_url en la tabla characters de Supabase
            const { error: updateError } = await sb
                .from('characters')
                .update({ avatar_url: publicUrl })
                .eq('id', characterId);

            if (updateError) {
                const msg = updateError.message || 'No se pudo guardar avatar_url en BD.';
                console.warn('[SupabaseAvatars] No se pudo guardar avatar_url en BD:', msg);

                const missingColumn = msg.toLowerCase().includes('avatar_url')
                    && msg.toLowerCase().includes('column');

                return {
                    ok: false,
                    error: missingColumn
                        ? 'La imagen se subió, pero falta la columna avatar_url en la tabla characters. Ejecuta la migración de SUPABASE_SETUP.'
                        : `La imagen se subió, pero no se pudo vincular al personaje: ${msg}`
                };
            }

            // 4. Actualizar caché local de cloudCharacters
            if (typeof appData !== 'undefined' && appData.cloudCharacters) {
                for (const profileId of Object.keys(appData.cloudCharacters)) {
                    const chars = appData.cloudCharacters[profileId];
                    if (!Array.isArray(chars)) continue;
                    const idx = chars.findIndex(c => c.id === characterId);
                    if (idx !== -1) {
                        chars[idx].avatar_url = publicUrl;
                        break;
                    }
                }
            }

            // 5. Actualizar appData.characters (personajes locales, por si el ID coincide)
            if (typeof appData !== 'undefined' && Array.isArray(appData.characters)) {
                const localChar = appData.characters.find(c => String(c.id) === String(characterId));
                if (localChar) {
                    localChar.avatar = publicUrl;
                    if (typeof persistPartitionedData === 'function') persistPartitionedData();
                }
            }

            // 6. Actualizar SupabaseCharacters cache si está disponible
            if (typeof SupabaseCharacters !== 'undefined') {
                const cachedChar = SupabaseCharacters.getActiveCharacters()
                    .find(c => c.id === characterId);
                if (cachedChar) cachedChar.avatar_url = publicUrl;
            }

            window.dispatchEvent(new CustomEvent('etheria:avatar-uploaded', {
                detail: { characterId, url: publicUrl }
            }));

            return { ok: true, url: publicUrl };

        } catch (err) {
            console.error('[SupabaseAvatars] uploadCharacterAvatar exception:', err);
            return { ok: false, error: err?.message || 'Error inesperado.' };
        }
    }

    /**
     * Elimina el avatar de un personaje del bucket.
     * @param {string} characterId
     * @returns {Promise<{ok: boolean, error?: string}>}
     */
    async function deleteCharacterAvatar(characterId) {
        if (!_isAvailable() || !characterId) {
            return { ok: false, error: 'characterId requerido.' };
        }
        try {
            const sb = _client();
            // Intentar borrar tanto .png como otras extensiones comunes
            const paths = ['png', 'jpg', 'jpeg', 'webp', 'gif'].map(ext => `${characterId}.${ext}`);
            await sb.storage.from(BUCKET).remove(paths); // falla silencioso si no existen

            await sb.from('characters').update({ avatar_url: null }).eq('id', characterId);
            return { ok: true };
        } catch (err) {
            return { ok: false, error: err?.message || 'Error inesperado.' };
        }
    }

    /**
     * Devuelve la URL del avatar de un personaje (desde caché o null).
     * Busca primero en cloudCharacters, luego en appData.characters.
     * @param {string} characterId
     * @returns {string|null}
     */
    function getAvatarUrl(characterId) {
        if (!characterId) return null;

        // Buscar en cloudCharacters
        if (typeof appData !== 'undefined' && appData.cloudCharacters) {
            for (const chars of Object.values(appData.cloudCharacters)) {
                if (!Array.isArray(chars)) continue;
                const c = chars.find(ch => ch.id === characterId);
                if (c?.avatar_url) return c.avatar_url;
            }
        }

        // Buscar en personajes locales
        if (typeof appData !== 'undefined' && Array.isArray(appData.characters)) {
            const local = appData.characters.find(c => String(c.id) === String(characterId));
            if (local?.avatar) return local.avatar;
        }

        return null;
    }

    return {
        uploadCharacterAvatar,
        deleteCharacterAvatar,
        getAvatarUrl
    };

})();

window.SupabaseAvatars = SupabaseAvatars;

/* js/utils/supabaseSprites.js */
// ============================================
// SUPABASE SPRITES — Sprites en Storage
// ============================================
// Bucket: "sprites" (público)
// Path:   sprites/{characterId}.{ext}
//
// uploadCharacterSprite(characterId, file)
//   1. Sube imagen al bucket sprites
//   2. Obtiene URL pública
//   3. Guarda sprite_url en la tabla characters
//   4. Actualiza el campo local appData.characters[*].sprite
// ============================================

const SupabaseSprites = (function () {

    const BUCKET = 'sprites';

    function _client() { return window.supabaseClient || null; }
    function _isAvailable() { return !!_client(); }

    function _ext(file) {
        const name = file?.name || '';
        const m = name.match(/\.(png|jpg|jpeg|gif|webp)$/i);
        return m ? m[1].toLowerCase() : 'png';
    }

    function _mimeForExt(ext) {
        const map = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp' };
        return map[ext] || 'image/png';
    }

    // ── API pública ──────────────────────────────────────────────────────────

    /**
     * Sube un archivo de imagen como sprite de un personaje.
     *
     * @param {string} characterId  UUID del personaje (tabla Supabase characters) o ID local.
     * @param {File}   file         Archivo de imagen seleccionado por el usuario.
     * @returns {Promise<{ok: boolean, url?: string, error?: string}>}
     */
    async function uploadCharacterSprite(characterId, file) {
        if (!_isAvailable()) {
            return { ok: false, error: 'Sin conexión a Supabase.' };
        }
        if (!characterId) {
            return { ok: false, error: 'characterId requerido.' };
        }
        if (!file || !file.type.startsWith('image/')) {
            return { ok: false, error: 'El archivo debe ser una imagen.' };
        }
        if (file.size > 10 * 1024 * 1024) {
            return { ok: false, error: 'La imagen no puede superar 10 MB.' };
        }

        const ext  = _ext(file);
        const path = `${characterId}.${ext}`;

        try {
            const sb = _client();

            // 1. Subir al bucket (upsert para sobreescribir si ya existe)
            const { error: uploadError } = await sb.storage
                .from(BUCKET)
                .upload(path, file, {
                    contentType : _mimeForExt(ext),
                    upsert      : true
                });

            if (uploadError) {
                console.error('[SupabaseSprites] upload error:', uploadError.message);
                return { ok: false, error: uploadError.message || 'Error al subir la imagen.' };
            }

            // 2. Obtener URL pública
            const { data: urlData } = sb.storage
                .from(BUCKET)
                .getPublicUrl(path);

            const publicUrl = urlData?.publicUrl;
            if (!publicUrl) {
                return { ok: false, error: 'No se pudo obtener la URL pública del sprite.' };
            }

            // 3. Guardar sprite_url en la tabla characters de Supabase
            const { error: updateError } = await sb
                .from('characters')
                .update({ sprite_url: publicUrl })
                .eq('id', characterId);

            if (updateError) {
                const msg = updateError.message || 'No se pudo guardar sprite_url en BD.';
                console.warn('[SupabaseSprites] No se pudo guardar sprite_url en BD:', msg);
                return {
                    ok: false,
                    error: `La imagen se subió, pero no se pudo vincular al personaje: ${msg}`
                };
            }

            // 4. Actualizar caché local de cloudCharacters
            if (typeof appData !== 'undefined' && appData.cloudCharacters) {
                for (const profileId of Object.keys(appData.cloudCharacters)) {
                    const chars = appData.cloudCharacters[profileId];
                    if (!Array.isArray(chars)) continue;
                    const idx = chars.findIndex(c => c.id === characterId);
                    if (idx !== -1) {
                        chars[idx].sprite_url = publicUrl;
                        break;
                    }
                }
            }

            // 5. Actualizar appData.characters (personajes locales)
            if (typeof appData !== 'undefined' && Array.isArray(appData.characters)) {
                const localChar = appData.characters.find(c => String(c.id) === String(characterId));
                if (localChar) {
                    localChar.sprite = publicUrl;
                    if (typeof persistPartitionedData === 'function') persistPartitionedData();
                }
            }

            // 6. Actualizar SupabaseCharacters cache si está disponible
            if (typeof SupabaseCharacters !== 'undefined') {
                const cachedChar = SupabaseCharacters.getActiveCharacters()
                    .find(c => c.id === characterId);
                if (cachedChar) cachedChar.sprite_url = publicUrl;
            }

            // 7. Actualizar el campo sprite en el editor si está abierto
            const spriteInput = document.getElementById('charSprite');
            if (spriteInput) {
                spriteInput.value = publicUrl;
            }

            window.dispatchEvent(new CustomEvent('etheria:sprite-uploaded', {
                detail: { characterId, url: publicUrl }
            }));

            return { ok: true, url: publicUrl };

        } catch (err) {
            console.error('[SupabaseSprites] uploadCharacterSprite exception:', err);
            return { ok: false, error: err?.message || 'Error inesperado.' };
        }
    }

    /**
     * Elimina el sprite de un personaje del bucket.
     * @param {string} characterId
     * @returns {Promise<{ok: boolean, error?: string}>}
     */
    async function deleteCharacterSprite(characterId) {
        if (!_isAvailable() || !characterId) {
            return { ok: false, error: 'characterId requerido.' };
        }
        try {
            const sb = _client();
            const paths = ['png', 'jpg', 'jpeg', 'webp', 'gif'].map(ext => `${characterId}.${ext}`);
            await sb.storage.from(BUCKET).remove(paths);
            await sb.from('characters').update({ sprite_url: null }).eq('id', characterId);
            return { ok: true };
        } catch (err) {
            return { ok: false, error: err?.message || 'Error inesperado.' };
        }
    }

    /**
     * Devuelve la URL del sprite de un personaje desde caché local.
     * @param {string} characterId
     * @returns {string|null}
     */
    function getSpriteUrl(characterId) {
        if (!characterId) return null;

        if (typeof appData !== 'undefined' && appData.cloudCharacters) {
            for (const chars of Object.values(appData.cloudCharacters)) {
                if (!Array.isArray(chars)) continue;
                const c = chars.find(ch => ch.id === characterId);
                if (c?.sprite_url) return c.sprite_url;
            }
        }

        if (typeof appData !== 'undefined' && Array.isArray(appData.characters)) {
            const local = appData.characters.find(c => String(c.id) === String(characterId));
            if (local?.sprite) return local.sprite;
        }

        return null;
    }

    return {
        uploadCharacterSprite,
        deleteCharacterSprite,
        getSpriteUrl
    };

})();

window.SupabaseSprites = SupabaseSprites;

/* js/collab-guard.js */
// ============================================
// COLLAB-GUARD.JS
// Sistema de colaboración multi-usuario con merge de conflictos.
//
// Integración con infraestructura existente:
//   - Lee/escribe usando fetchCloudBin() / putCloudBin() (JSONbin)
//   - Merge a nivel de mensajes por ID + timestamp (no reemplaza perfiles enteros)
//   - Usa showSyncToast() / showAutosave() ya existentes para UI
//   - Se activa al entrar a un topic, se detiene al salir
//   - No toca save() ni persistPartitionedData() — sólo añade una capa encima
// ============================================

const CollaborativeGuard = (function () {

    // ── Configuración ────────────────────────────────────────────────────────
    const CFG = {
        POLL_INTERVAL:    8000,   // ms entre checks de cambios remotos
        TYPING_TTL:      10000,   // ms hasta que un indicador "escribiendo" expira
        TYPING_KEY:      'etheria_collab_typing',
        COLLAB_ENABLED:  'etheria_collab_enabled',
    };

    // ── Estado interno ───────────────────────────────────────────────────────
    let _topicId      = null;
    let _profileIdx   = 0;       // currentUserIndex en el momento de init
    let _pollTimer    = null;
    let _lastSeenMsgCount = 0;   // cuántos mensajes había en remoto la última vez
    let _lastRemoteModified = 0; // lastModified del cloud la última vez que checkeamos
    let _merging      = false;   // semáforo para evitar merges concurrentes
    let _typingTimer  = null;    // interval ID for typing indicator — cleared in stop()

    // ── Helpers de acceso a datos ────────────────────────────────────────────

    /**
     * Lee los mensajes locales del topic activo desde appData (ya en memoria).
     */
    function _localMessages() {
        if (!_topicId || typeof getTopicMessages !== 'function') return [];
        return getTopicMessages(_topicId) || [];
    }

    /**
     * Cuenta mensajes de todos los topics en un appData snapshot (igual que
     * countMessagesInProfile existente, por si no está disponible).
     */
    function _countMsgs(profileData) {
        if (typeof countMessagesInProfile === 'function') {
            return countMessagesInProfile(profileData);
        }
        if (!profileData || !profileData.messages) return 0;
        return Object.values(profileData.messages)
            .reduce((sum, arr) => sum + (Array.isArray(arr) ? arr.length : 0), 0);
    }

    /**
     * Extrae los mensajes de un topic específico del snapshot remoto.
     * El cloud guarda { profiles: { "0": { appData: { messages: { topicId: [...] } } } } }
     */
    function _remoteTopicMessages(cloudRecord) {
        try {
            const prof = (cloudRecord?.profiles || {})[String(_profileIdx)];
            const msgs = prof?.appData?.messages?.[String(_topicId)];
            return Array.isArray(msgs) ? msgs : [];
        } catch { return []; }
    }

    /**
     * Extrae el lastModified del perfil en el cloud.
     */
    function _remoteModified(cloudRecord) {
        try {
            const prof = (cloudRecord?.profiles || {})[String(_profileIdx)];
            return Number(prof?.lastModified || 0);
        } catch { return 0; }
    }

    // ── Merge ────────────────────────────────────────────────────────────────

    /**
     * Fusiona mensajes de dos fuentes por ID.
     * En caso de conflicto de ID, gana el más reciente (por timestamp ISO).
     * Devuelve array ordenado cronológicamente.
     */
    function _mergeMessages(local, remote) {
        const byId = new Map();

        const parseTs = (msg) => {
            const t = msg.timestamp || msg.editedAt || msg.ts;
            if (!t) return 0;
            if (typeof t === 'number') return t;
            const d = Date.parse(t);
            return isNaN(d) ? 0 : d;
        };

        for (const msg of [...(local || []), ...(remote || [])]) {
            if (!msg || !msg.id) continue;
            const existing = byId.get(msg.id);
            if (!existing) {
                byId.set(msg.id, { ...msg });
            } else {
                // Gana el más reciente
                if (parseTs(msg) > parseTs(existing)) {
                    byId.set(msg.id, { ...msg, _merged: true });
                }
            }
        }

        return Array.from(byId.values())
            .sort((a, b) => {
                const ta = parseTs(a), tb = parseTs(b);
                return ta - tb;
            });
    }

    // ── Aplicar merge al estado local ────────────────────────────────────────

    /**
     * Aplica los mensajes mergeados a appData y refresca la UI sin perder posición.
     */
    function _applyMergedMessages(merged) {
        if (!_topicId || !Array.isArray(merged)) return;

        // Actualizar appData en memoria
        if (typeof appData !== 'undefined' && appData.messages) {
            appData.messages[String(_topicId)] = merged;
        }

        // Persistir localmente (sin subir a cloud — el sync normal se encarga)
        if (typeof persistPartitionedData === 'function') {
            persistPartitionedData();
        }

        // Refrescar UI sin mover el índice de mensaje actual
        if (typeof showCurrentMessage === 'function') {
            showCurrentMessage();
        }
    }

    // ── Poll ─────────────────────────────────────────────────────────────────

    async function _poll() {
        if (!_topicId || _merging) return;

        // collab-guard aún no está migrado a Supabase.
        // fetchCloudBin existe como stub deprecado que devuelve null,
        // por lo que la guarda anterior no era suficiente.
        // Desactivar el poll hasta que se migre a Supabase Realtime.
        // TODO: reemplazar por suscripción a Supabase Realtime cuando esté disponible.
        return;

        try {
            const cloud = await fetchCloudBin();
            const remoteModified = _remoteModified(cloud);
            const remoteTopicMsgs = _remoteTopicMessages(cloud);
            const remoteCount = remoteTopicMsgs.length;
            const localMsgs = _localMessages();
            const localCount = localMsgs.length;

            // Nada nuevo
            if (remoteModified <= _lastRemoteModified && remoteCount <= _lastSeenMsgCount) return;

            _lastRemoteModified = remoteModified;

            // Calcular mensajes genuinamente nuevos (no están en local por ID)
            const localIds = new Set(localMsgs.map(m => m.id));
            const newRemote = remoteTopicMsgs.filter(m => m.id && !localIds.has(m.id));

            if (newRemote.length === 0) {
                _lastSeenMsgCount = remoteCount;
                return;
            }

            _lastSeenMsgCount = remoteCount;

            // Comprobar si el usuario está escribiendo activamente
            const replyInput = document.getElementById('vnReplyText');
            const hasDraft = replyInput && replyInput.value.trim().length > 0;

            if (hasDraft) {
                // Tiene borrador — notificar sin aplicar, para no interrumpir
                const n = newRemote.length;
                const label = n === 1 ? '1 mensaje nuevo' : `${n} mensajes nuevos`;
                eventBus.emit('ui:show-toast', {
                    text: label + ' de otro jugador',
                    action: 'Ver ahora',
                    onAction: () => { _doMerge(localMsgs, remoteTopicMsgs); }
                });
            } else {
                // Sin borrador — merge silencioso y refresco automático
                _doMerge(localMsgs, remoteTopicMsgs);
                const n = newRemote.length;
                const label = n === 1 ? '1 mensaje nuevo recibido' : `${n} mensajes nuevos recibidos`;
                eventBus.emit('ui:show-autosave', { text: label, state: 'info' });
            }

        } catch (err) {
            // Silencioso — el sync normal ya gestiona errores de red
            console.debug('[CollabGuard] poll error:', err?.message || err);
        }
    }

    function _doMerge(local, remote) {
        if (_merging) return;
        _merging = true;
        try {
            const merged = _mergeMessages(local, remote);
            _applyMergedMessages(merged);
        } finally {
            _merging = false;
        }
    }

    // ── Indicador "escribiendo" ──────────────────────────────────────────────

    function _setTyping(isTyping) {
        if (!_topicId) return;
        try {
            const state = {
                topicId:   String(_topicId),
                userIndex: _profileIdx,
                isTyping,
                ts:        Date.now()
            };
            localStorage.setItem(CFG.TYPING_KEY, JSON.stringify(state));
        } catch { /* localStorage lleno — no crítico */ }
    }

    function _readTyping() {
        try {
            const raw = localStorage.getItem(CFG.TYPING_KEY);
            if (!raw) return null;
            const s = JSON.parse(raw);
            // Expirado o del mismo usuario o de otro topic
            if (!s || Date.now() - s.ts > CFG.TYPING_TTL) return null;
            if (s.topicId !== String(_topicId)) return null;
            if (s.userIndex === _profileIdx) return null;
            return s;
        } catch { return null; }
    }

    function _updateTypingUI() {
        const state = _readTyping();
        const el = document.getElementById('collabTypingIndicator');
        if (!el) return;

        if (state && state.isTyping) {
            el.textContent = 'Alguien está escribiendo…';
            el.classList.add('visible');
        } else {
            el.classList.remove('visible');
            // Limpiar texto con delay para que la animación termine
            setTimeout(() => { if (!el.classList.contains('visible')) el.textContent = ''; }, 400);
        }
    }

    // ── API pública ──────────────────────────────────────────────────────────

    /**
     * Inicializar para un topic.
     * Llamar al entrar a enterTopic().
     */
    function init(topicId, profileIndex) {
        stop(); // limpiar estado previo

        _topicId    = topicId;
        _profileIdx = (typeof profileIndex === 'number') ? profileIndex
                    : (typeof currentUserIndex !== 'undefined' ? currentUserIndex : 0);

        // Snapshot inicial para comparar en polls futuros
        _lastSeenMsgCount    = _localMessages().length;
        _lastRemoteModified  = 0; // se actualizará en el primer poll

        // Iniciar polling
        _poll(); // inmediato
        _pollTimer = setInterval(_poll, CFG.POLL_INTERVAL);

        // Hook: intercepción de emitTypingState (ya existe en vn.js)
        // Sólo enriquece el canal de localStorage con el estado de typing propio
        const _origEmit = window.emitTypingState;
        if (_origEmit && !window._collabEmitPatched) {
            window._collabEmitPatched = true;
            window.emitTypingState = function (active) {
                _setTyping(active);
                _origEmit.call(this, active);
            };
        }

        // Actualizar indicador de typing en cada poll
        _typingTimer = setInterval(_updateTypingUI, 2000);

        console.debug(`[CollabGuard] activo para topic ${topicId}`);
    }

    /**
     * Detener — llamar al salir del topic.
     */
    function stop() {
        if (_pollTimer) { clearInterval(_pollTimer); _pollTimer = null; }
        if (_typingTimer) { clearInterval(_typingTimer); _typingTimer = null; }
        if (_topicId) _setTyping(false); // limpiar indicador propio
        _topicId   = null;
        _merging   = false;
        _lastSeenMsgCount   = 0;
        _lastRemoteModified = 0;

        // Retirar patch de emitTypingState
        if (window._collabEmitPatched) {
            // No revertimos para no romper referencias — simplemente lo dejamos
            // funcionar normalmente (la rama _setTyping es no-op cuando _topicId = null)
        }
    }

    /**
     * Forzar merge manual (útil para botón de "refrescar" si se quiere exponer).
     */
    async function forceMerge() {
        // collab-guard pendiente de migración a Supabase — operación desactivada temporalmente.
        if (!_topicId) return;
        eventBus.emit('ui:show-autosave', { text: 'Colaboración en tiempo real próximamente', state: 'info' });
    }

    function getStatus() {
        return {
            active:     !!_topicId,
            topicId:    _topicId,
            polling:    !!_pollTimer,
            localCount: _localMessages().length,
            lastSeen:   _lastSeenMsgCount
        };
    }

    return { init, stop, forceMerge, getStatus };

})();

window.CollaborativeGuard = CollaborativeGuard;

/* js/rpg/SceneLoader.js */
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

/* js/rpg/SceneValidator.js */
// ============================================================
// SCENE VALIDATOR
// Valida la estructura de un script JSON antes de ejecutarlo.
// Detecta errores de formato, campos obligatorios y referencias
// rotas — sin lanzar excepciones: devuelve { ok, errors }.
// ============================================================

const SceneValidator = (function () {

    // Campos obligatorios por tipo de paso
    const REQUIRED = {
        background:   ['asset'],
        dialogue:     ['character', 'text'],
        choice:       ['options'],
        set_variable: ['key', 'value'],
        check_variable: ['key', 'equals', 'goto_true'],
        goto_scene:   ['scene'],
        goto_branch:  ['branch'],
        modify_stat:  ['stat', 'amount'],
        give_item:    ['item'],
        remove_item:  ['item'],
        stat_check:   ['stat', 'difficulty', 'on_success', 'on_fail'],
        sound:        ['action'],
        camera:       ['effect'],
        wait:         ['duration'],
        end:          []
    };

    // ── API pública ─────────────────────────────────────────────
    function validate(scene) {
        const errors = [];

        if (!scene || typeof scene !== 'object') {
            return { ok: false, errors: ['El script no es un objeto válido'] };
        }

        // Campos raíz obligatorios
        if (!scene.id)    errors.push('Falta campo "id"');
        if (!scene.steps) errors.push('Falta campo "steps"');
        if (scene.steps && !Array.isArray(scene.steps)) {
            errors.push('"steps" debe ser un array');
        }

        // Validar steps principales
        if (Array.isArray(scene.steps)) {
            _validateStepArray(scene.steps, 'steps', scene.branches || {}, errors);
        }

        // Validar branches
        if (scene.branches && typeof scene.branches === 'object') {
            Object.entries(scene.branches).forEach(([branchId, steps]) => {
                if (!Array.isArray(steps)) {
                    errors.push(`Branch "${branchId}" debe ser un array`);
                } else {
                    _validateStepArray(steps, `branches.${branchId}`, scene.branches, errors);
                }
            });
        }

        if (errors.length > 0) {
            console.error(`[SceneValidator] "${scene.id || '?'}" tiene ${errors.length} error(es):`, errors);
        }

        return { ok: errors.length === 0, errors };
    }

    // ── Helpers internos ────────────────────────────────────────
    function _validateStepArray(steps, path, branches, errors) {
        steps.forEach((step, i) => {
            const loc = `${path}[${i}]`;

            if (!step.type) {
                errors.push(`${loc}: falta "type"`);
                return;
            }

            const requiredFields = REQUIRED[step.type];
            if (requiredFields === undefined) {
                // Tipo desconocido — advertencia, no error bloqueante
                console.warn(`[SceneValidator] ${loc}: tipo desconocido "${step.type}"`);
                return;
            }

            requiredFields.forEach(field => {
                if (step[field] === undefined || step[field] === null) {
                    errors.push(`${loc} (${step.type}): falta campo "${field}"`);
                }
            });

            // Validaciones específicas por tipo
            if (step.type === 'choice') {
                if (!Array.isArray(step.options) || step.options.length === 0) {
                    errors.push(`${loc}: "options" debe ser un array no vacío`);
                } else {
                    step.options.forEach((opt, j) => {
                        if (!opt.text) {
                            errors.push(`${loc}.options[${j}]: falta "text"`);
                        }
                        // "goto" es opcional: sin él el engine avanza al siguiente paso linealmente.
                        // Solo advertir, no bloquear.
                        if (!opt.goto) {
                            console.warn(`[SceneValidator] ${loc}.options[${j}]: sin "goto" — avanzará al paso siguiente`);
                        }
                    });
                }
            }

            if (step.type === 'stat_check') {
                if (typeof step.difficulty !== 'number') {
                    errors.push(`${loc}: "difficulty" debe ser un número`);
                }
            }

            if (step.type === 'modify_stat') {
                if (typeof step.amount !== 'number') {
                    errors.push(`${loc}: "amount" debe ser un número`);
                }
            }
        });
    }

    return { validate };
})();

/* js/rpg/RPGState.js */
// ============================================================
// RPG STATE
// Estado local de una sesión RPG: stats, inventario y flags
// persistentes entre escenas.
// Completamente independiente del estado global de Etheria
// (appData, currentUserIndex, etc.) — solo lee el profileIndex
// para saber dónde guardar en localStorage.
// ============================================================

const RPGState = (function () {

    const STORAGE_PREFIX = 'etheria_rpg_state_';

    // Estado en memoria durante la sesión
    let _profileIndex = 0;
    let _stats        = {};  // { STR: 10, DEX: 8, ... }
    let _inventory    = [];  // [{ id: 'sword', name: 'Espada', qty: 1, data: {} }]
    let _flags        = {};  // variables persistentes entre escenas: { met_kazuma: true, ... }
    let _xp           = 0;
    let _level        = 1;
    let _hp           = { current: 20, max: 20 };

    // Stats base por defecto (sistema D&D simplificado)
    const DEFAULT_STATS = {
        STR: 10,  // Fuerza
        DEX: 10,  // Destreza
        CON: 10,  // Constitución
        INT: 10,  // Inteligencia
        WIS: 10,  // Sabiduría
        CHA: 10   // Carisma
    };

    // ── Ciclo de vida ───────────────────────────────────────────

    function init(profileIndex) {
        _profileIndex = profileIndex || 0;
        _load();
    }

    function reset() {
        _stats     = { ...DEFAULT_STATS };
        _inventory = [];
        _flags     = {};
        _xp        = 0;
        _level     = 1;
        _hp        = { current: 20, max: 20 };
        _save();
    }

    // ── Stats ───────────────────────────────────────────────────

    function getStat(key) {
        return _stats[key] !== undefined ? _stats[key] : DEFAULT_STATS[key] ?? 10;
    }

    function setStat(key, value) {
        _stats[key] = Math.max(1, Math.min(30, Number(value) || 10));
        _save();
        _emitChange('stats');
    }

    function modifyStat(key, delta) {
        setStat(key, getStat(key) + delta);
    }

    function getStats() {
        return { ...DEFAULT_STATS, ..._stats };
    }

    // Modificador D&D: (stat - 10) / 2 redondeado hacia abajo
    function getModifier(key) {
        return Math.floor((getStat(key) - 10) / 2);
    }

    // ── HP ──────────────────────────────────────────────────────

    function getHp()    { return { ..._hp }; }
    function getMaxHp() { return _hp.max; }

    function setMaxHp(max) {
        _hp.max = Math.max(1, max);
        _hp.current = Math.min(_hp.current, _hp.max);
        _save();
        _emitChange('hp');
    }

    function modifyHp(delta) {
        _hp.current = Math.max(0, Math.min(_hp.max, _hp.current + delta));
        _save();
        _emitChange('hp');
    }

    function isDead() { return _hp.current <= 0; }

    // ── XP y nivel ─────────────────────────────────────────────

    function getXp()    { return _xp; }
    function getLevel() { return _level; }

    function addXp(amount) {
        _xp += amount;
        const newLevel = _calculateLevel(_xp);
        if (newLevel > _level) {
            _level = newLevel;
            _emitChange('level-up', { level: _level, xp: _xp });
        }
        _save();
        _emitChange('xp');
    }

    function _calculateLevel(xp) {
        // Curva simple: nivel = 1 + floor(xp / 100)
        return Math.max(1, 1 + Math.floor(xp / 100));
    }

    // ── Inventario ──────────────────────────────────────────────

    function hasItem(itemId) {
        return _inventory.some(i => i.id === itemId && i.qty > 0);
    }

    function getItem(itemId) {
        return _inventory.find(i => i.id === itemId) || null;
    }

    function getInventory() {
        return _inventory.map(i => ({ ...i }));
    }

    function addItem(item) {
        // item: { id, name, qty?, description?, data? }
        if (!item || !item.id) return;

        const existing = _inventory.find(i => i.id === item.id);
        if (existing) {
            existing.qty = (existing.qty || 1) + (item.qty || 1);
        } else {
            _inventory.push({
                id:          item.id,
                name:        item.name || item.id,
                qty:         item.qty || 1,
                description: item.description || '',
                data:        item.data || {}
            });
        }
        _save();
        _emitChange('inventory');
    }

    function removeItem(itemId, qty = 1) {
        const idx = _inventory.findIndex(i => i.id === itemId);
        if (idx === -1) return false;

        _inventory[idx].qty -= qty;
        if (_inventory[idx].qty <= 0) {
            _inventory.splice(idx, 1);
        }
        _save();
        _emitChange('inventory');
        return true;
    }

    // ── Flags (variables persistentes entre escenas) ─────────────

    function getFlag(key)         { return _flags[key]; }
    function setFlag(key, value)  { _flags[key] = value; _save(); }
    function hasFlag(key)         { return _flags[key] !== undefined && _flags[key] !== false && _flags[key] !== null; }

    // ── Condiciones (para evaluar en scripts) ───────────────────

    /**
     * Evalúa una condición del script.
     * Ejemplos de condición:
     *   { has_item: 'sword' }
     *   { flag: 'met_kazuma' }
     *   { flag_equals: { key: 'times_visited', value: 3 } }
     *   { stat_gte: { stat: 'STR', value: 14 } }
     *   { stat_lte: { stat: 'HP_current', value: 5 } }
     *   { level_gte: 3 }
     */
    function evalCondition(condition) {
        if (!condition) return true;

        if (condition.has_item)    return hasItem(condition.has_item);
        if (condition.not_item)    return !hasItem(condition.not_item);
        if (condition.flag)        return hasFlag(condition.flag);
        if (condition.not_flag)    return !hasFlag(condition.not_flag);

        if (condition.flag_equals) {
            return getFlag(condition.flag_equals.key) === condition.flag_equals.value;
        }
        if (condition.stat_gte) {
            const val = condition.stat_gte.stat === 'HP'
                ? _hp.current
                : getStat(condition.stat_gte.stat);
            return val >= condition.stat_gte.value;
        }
        if (condition.stat_lte) {
            const val = condition.stat_lte.stat === 'HP'
                ? _hp.current
                : getStat(condition.stat_lte.stat);
            return val <= condition.stat_lte.value;
        }
        if (condition.level_gte)  return _level >= condition.level_gte;
        if (condition.xp_gte)     return _xp >= condition.xp_gte;

        console.warn('[RPGState] Condición desconocida:', condition);
        return true;
    }

    // ── Snapshot (para guardar/cargar con el topic) ─────────────

    function getSnapshot() {
        return {
            stats:     { ..._stats },
            inventory: _inventory.map(i => ({ ...i })),
            flags:     { ..._flags },
            xp:        _xp,
            level:     _level,
            hp:        { ..._hp }
        };
    }

    function loadSnapshot(snapshot) {
        if (!snapshot || typeof snapshot !== 'object') return;
        _stats     = snapshot.stats     || {};
        _inventory = snapshot.inventory || [];
        _flags     = snapshot.flags     || {};
        _xp        = snapshot.xp        || 0;
        _level     = snapshot.level     || 1;
        _hp        = snapshot.hp        || { current: 20, max: 20 };
        _save();
    }

    // ── Persistencia ────────────────────────────────────────────

    function _save() {
        try {
            localStorage.setItem(
                STORAGE_PREFIX + _profileIndex,
                JSON.stringify(getSnapshot())
            );
        } catch (e) {
            console.warn('[RPGState] No se pudo guardar estado:', e);
        }
    }

    function _load() {
        try {
            const raw = localStorage.getItem(STORAGE_PREFIX + _profileIndex);
            if (raw) {
                loadSnapshot(JSON.parse(raw));
            } else {
                reset();
            }
        } catch (e) {
            console.warn('[RPGState] No se pudo cargar estado:', e);
            reset();
        }
    }

    // ── Emisión de eventos ───────────────────────────────────────
    // Usa el eventBus si está disponible; si no, silencioso.

    function _emitChange(type, extra) {
        if (!window.eventBus) return;
        eventBus.emit('rpg:state-changed', { type, ...extra });

        // Para cambios que afectan la barra de stats, emitir también
        // rpg:state-updated con los valores ya calculados.
        // Así el renderer no necesita consultar RPGState manualmente.
        if (type === 'hp' || type === 'xp' || type === 'level-up') {
            eventBus.emit('rpg:state-updated', {
                hp:    { ..._hp },
                xp:    _xp,
                level: _level
            });
        }
    }

    return {
        // Ciclo de vida
        init, reset,
        // Stats
        getStat, setStat, modifyStat, getStats, getModifier,
        // HP
        getHp, getMaxHp, setMaxHp, modifyHp, isDead,
        // XP / Level
        getXp, getLevel, addXp,
        // Inventario
        hasItem, getItem, getInventory, addItem, removeItem,
        // Flags
        getFlag, setFlag, hasFlag,
        // Condiciones
        evalCondition,
        // Snapshot
        getSnapshot, loadSnapshot
    };
})();

/* js/rpg/RPGEngine.js */
// ============================================================
// RPG ENGINE
// Intérprete de scripts narrativos JSON.
//
// Responsabilidades:
//   - Cargar y validar escenas via SceneLoader + SceneValidator
//   - Ejecutar pasos automáticos (background, sound, variables...)
//   - Pausar en pasos con input (dialogue, choice, stat_check)
//   - Comunicar todo al exterior SOLO via eventBus
//   - NO toca el DOM (eso es trabajo de RPGRenderer)
//
// Límites de arquitectura:
//   ✅ Puede usar: SceneLoader, SceneValidator, RPGState, eventBus
//   ❌ No puede usar: nada de ui/, nada de classic/
// ============================================================

const RPGEngine = (function () {

    // ── Estado privado ──────────────────────────────────────────
    let _scene     = null;
    let _stepIndex = 0;
    let _branch    = null;   // null → _scene.steps  |  string → rama activa
    let _variables = {};     // variables locales a esta sesión de escena
    let _running   = false;
    let _paused    = false;
    let _waitTimer = null;

    // Tipos de paso que el engine ejecuta solo, sin input del usuario
    const AUTO_TYPES = new Set([
        'background', 'sound', 'camera',
        'set_variable', 'set_flag', 'check_variable',
        'modify_stat', 'give_item', 'remove_item', 'add_xp',
        'wait', 'goto_scene', 'goto_branch',
        'stat_check', 'end'
    ]);

    // ── API pública ─────────────────────────────────────────────

    async function loadScene(sceneId) {
        if (_running) {
            console.warn('[RPGEngine] Escena en curso. Llama stop() antes de cargar otra.');
            return;
        }
        _reset();

        // SceneLoader emite scene:error y devuelve null si falla —
        // no lanza, así que no necesitamos try/catch aquí.
        const scene = await SceneLoader.load(sceneId);
        if (!scene) { _reset(); return; }   // el error ya fue emitido por el loader

        const { ok, errors } = SceneValidator.validate(scene);
        if (!ok) {
            console.error('[RPGEngine] Script inválido:', errors[0]);
            eventBus.emit('scene:error', { sceneId: sceneId, message: errors[0] });
            _reset();
            return;
        }

        _scene     = scene;
        _variables = Object.assign({}, scene.variables || {});
        _running   = true;

        eventBus.emit('scene:started', {
            sceneId:  scene.id,
            version:  scene.version || null,
            title:    scene.title   || scene.id,
            requires: scene.requires || []
        });

        _tick();
    }

    function advance() {
        if (!_running || _paused) return;
        _stepIndex++;
        _tick();
    }

    function choiceMade(optionIndex) {
        if (!_running || _paused) return;
        var step = _currentStep();
        if (!step || step.type !== 'choice') return;

        var visible = getVisibleOptions(step.options);
        var option  = visible[optionIndex];
        if (!option) return;

        if (option.set_flag)     RPGState.setFlag(option.set_flag.key, option.set_flag.value);
        if (option.set_variable) _variables[option.set_variable.key] = option.set_variable.value;
        if (option.give_item)    RPGState.addItem(option.give_item);
        if (option.add_xp)       RPGState.addXp(option.add_xp);

        eventBus.emit('scene:choice-made', {
            sceneId: _scene.id, stepIndex: _stepIndex,
            optionIndex: optionIndex, optionText: option.text, goto: option.goto
        });

        if (option.goto) {
            _jumpTo(option.goto);
        } else {
            _next();
        }
    }

    function pause() {
        if (!_running) return;
        _paused = true;
        if (_waitTimer) { clearTimeout(_waitTimer); _waitTimer = null; }
        eventBus.emit('scene:paused', { sceneId: _scene && _scene.id });
    }

    function resume() {
        if (!_running || !_paused) return;
        _paused = false;
        eventBus.emit('scene:resumed', { sceneId: _scene && _scene.id });
        _tick();
    }

    function stop() {
        var sceneId = _scene && _scene.id;
        _reset();
        eventBus.emit('scene:stopped', { sceneId: sceneId });
    }

    function getVariable(key)        { return _variables[key]; }
    function setVariable(key, value) {
        _variables[key] = value;
        eventBus.emit('scene:variable-changed', { key: key, value: value });
    }

    function getVisibleOptions(options) {
        if (!Array.isArray(options)) return [];
        return options.filter(function(opt) {
            return !opt.condition || RPGState.evalCondition(opt.condition);
        });
    }

    function isRunning()      { return _running; }
    function isPaused()       { return _paused; }
    function currentSceneId() { return _scene ? _scene.id : null; }

    // ── Motor interno ───────────────────────────────────────────

    function _tick() {
        if (!_running || _paused) return;

        var steps = _activeSteps();
        if (_stepIndex >= steps.length) { _finish(); return; }

        var step = steps[_stepIndex];

        eventBus.emit('scene:step', {
            step: step, index: _stepIndex,
            sceneId: _scene.id, branch: _branch,
            total: steps.length
        });

        if (AUTO_TYPES.has(step.type)) {
            _executeStep(step);
        } else if (step.type === 'choice') {
            // Se detiene aquí — el renderer escucha scene:input:choice para responder.
            eventBus.emit('scene:choice-shown', {
                sceneId:   _scene.id,
                stepIndex: _stepIndex,
                step:      step,
                options:   getVisibleOptions(step.options)
            });
        } else if (step.type !== 'dialogue') {
            // Tipo desconocido: advertir y avanzar para no bloquear el motor
            console.warn('[RPGEngine] Paso no reconocido, avanzando:', step.type);
            _next();
        }
        // 'dialogue' → se detiene; RPGRenderer llama advance() al hacer clic.
    }

    function _executeStep(step) {
        switch (step.type) {

            case 'background':
                eventBus.emit('scene:background', {
                    asset: step.asset,
                    transition: step.transition || 'fade',
                    duration:   step.duration   || 600
                });
                _next();
                break;

            case 'sound':
                eventBus.emit('scene:sound', {
                    action: step.action, track: step.track, volume: step.volume
                });
                _next();
                break;

            case 'camera':
                eventBus.emit('scene:camera', { effect: step.effect, duration: step.duration || 400 });
                _next();
                break;

            case 'set_variable':
                setVariable(step.key, step.value);
                _next();
                break;

            case 'set_flag':
                RPGState.setFlag(step.key, step.value);
                _next();
                break;

            case 'check_variable': {
                var val   = _variables[step.key];
                var match = Array.isArray(step.equals)
                    ? step.equals.indexOf(val) !== -1
                    : val === step.equals;
                _jumpTo(match ? step.goto_true : (step.goto_false || null));
                break;
            }

            case 'modify_stat':
                RPGState.modifyStat(step.stat, step.amount);
                _next();
                break;

            case 'give_item':
                RPGState.addItem(
                    typeof step.item === 'string'
                        ? { id: step.item, name: step.item }
                        : step.item
                );
                _next();
                break;

            case 'remove_item':
                RPGState.removeItem(step.item, step.qty || 1);
                _next();
                break;

            case 'add_xp':
                RPGState.addXp(step.amount || 0);
                _next();
                break;

            case 'wait':
                eventBus.emit('scene:wait-start', { duration: step.duration || 1000 });
                _waitTimer = setTimeout(function() {
                    _waitTimer = null;
                    _next();
                }, step.duration || 1000);
                break;

            case 'goto_branch':
                _jumpTo(step.branch);
                break;

            case 'goto_scene':
                stop();
                loadScene(step.scene);
                break;

            case 'stat_check':
                _resolveStatCheck(step);
                break;

            case 'end':
                _finish(step.outcome);
                break;

            default:
                console.warn('[RPGEngine] Tipo de paso desconocido:', step.type);
                _next();
        }
    }

    function _resolveStatCheck(step) {
        var roll     = Math.ceil(Math.random() * 20);
        var modifier = RPGState.getModifier(step.stat);
        var total    = roll + modifier;
        var success  = roll === 20 || (roll !== 1 && total >= step.difficulty);
        var result   = roll === 1  ? 'fumble'
                     : roll === 20 ? 'critical'
                     : success     ? 'success'
                                   : 'fail';

        eventBus.emit('scene:stat-check-result', {
            sceneId: _scene.id, stat: step.stat,
            statValue: RPGState.getStat(step.stat),
            roll: roll, modifier: modifier, total: total,
            difficulty: step.difficulty, result: result, success: success
        });

        var delay = step.delay || 1800;
        _waitTimer = setTimeout(function() {
            _waitTimer = null;
            if (!_running) return;
            _jumpTo(success ? step.on_success : step.on_fail);
        }, delay);
    }

    // ── Navegación ───────────────────────────────────────────────

    function _next() {
        _stepIndex++;
        _tick();
    }

    function _jumpTo(target) {
        if (!_running) return;   // ignorar si el motor ya se detuvo
        if (!target) { _finish(); return; }
        var branches = _scene.branches || {};
        if (branches[target]) {
            _branch    = target;
            _stepIndex = 0;
            _tick();
        } else {
            stop();
            loadScene(target);
        }
    }

    function _finish(outcome) {
        var sceneId   = _scene.id;
        var variables = Object.assign({}, _variables);
        _running = false;

        eventBus.emit('scene:ended', {
            sceneId:   sceneId,
            outcome:   outcome || 'end',
            variables: variables
        });

        _reset();   // limpiar estado residual después de emitir
    }

    function _activeSteps() {
        var branches = _scene.branches || {};
        return (_branch && branches[_branch]) ? branches[_branch] : (_scene.steps || []);
    }

    function _currentStep() {
        return _activeSteps()[_stepIndex] || null;
    }

    function _reset() {
        if (_waitTimer) { clearTimeout(_waitTimer); _waitTimer = null; }
        _scene = null; _stepIndex = 0; _branch = null;
        _variables = {}; _running = false; _paused = false;
    }

    // ── Listeners de input desde el renderer ─────────────────────
    // El renderer emite estos eventos; el engine los escucha.
    // Así el renderer nunca llama al engine directamente.
    eventBus.on('scene:input:advance', function() {
        if (_running && !_paused) advance();
    });
    eventBus.on('scene:input:choice', function(data) {
        if (_running && !_paused) choiceMade(data.index);
    });

    // ── Exports ──────────────────────────────────────────────────
    return {
        loadScene:         loadScene,
        advance:           advance,
        choiceMade:        choiceMade,
        pause:             pause,
        resume:            resume,
        stop:              stop,
        reset:             _reset,          // limpia el estado sin emitir eventos
        isRunning:         isRunning,
        isPaused:          isPaused,
        currentSceneId:    currentSceneId,
        getVariable:       getVariable,
        setVariable:       setVariable,
        getVisibleOptions: getVisibleOptions
    };
})();

/* js/rpg/RPGRenderer.js */
// ============================================================
// RPG RENDERER
// Escucha eventos del RPGEngine y actualiza el DOM del VN.
//
// Es el ÚNICO módulo RPG que toca el DOM.
// Nunca llama lógica directamente: solo emite eventos de vuelta
// (advance, choiceMade) como respuesta al input del usuario.
//
// Depende de:
//   - eventBus          (escucha scene:* y emite respuestas)
//   - El DOM del VN     (vnSection, vnDialogue, vnBackground, etc.)
// ============================================================

const RPGRenderer = (function () {

    // IDs de los elementos DOM del VN que este renderer usa
    // Los primeros 4 son IDs existentes en index.html — no cambiar.
    // vnChoiceArea y vnRpgStatBar son elementos nuevos inyectados por este módulo.
    const DOM = {
        vnSection:    'vnSection',
        background:   'vnBackground',
        dialogueBox:  'vnDialogBox',       // clase .vn-dialogue-box, sin ID → se busca por clase
        charName:     'vnSpeakerPlate',    // ID real en index.html
        dialogueText: 'vnDialogueText',    // ID real en index.html
        choiceArea:   'vnChoiceArea',      // elemento nuevo — inyectado en init()
        statBar:      'vnRpgStatBar'       // elemento nuevo — inyectado en init()
    };

    let _unsubs     = [];    // funciones de unsuscripción del eventBus
    let _active     = false;
    let _charCache  = {};    // nombre → color

    // ── Inicialización ──────────────────────────────────────────

    function init() {
        if (_active) return;
        _active = true;

        // Inyectar elementos DOM nuevos si no existen aún
        _ensureChoiceArea();
        _ensureStatBar();

        _unsubs = [
            eventBus.on('scene:started',          _onSceneStarted),
            eventBus.on('scene:step',              _onStep),
            eventBus.on('scene:choice-shown',      _onChoiceShown),
            eventBus.on('scene:background',        _onBackground),
            eventBus.on('scene:sound',             _onSound),
            eventBus.on('scene:camera',            _onCamera),
            eventBus.on('scene:stat-check-result', _onStatCheckResult),
            eventBus.on('scene:choice-made',       _onChoiceMade),
            eventBus.on('scene:ended',             _onSceneEnded),
            eventBus.on('scene:error',             _onError),
            eventBus.on('rpg:state-updated',       _onStateUpdated)
        ];
    }

    function _ensureChoiceArea() {
        if (document.getElementById(DOM.choiceArea)) return;
        var vnSection = document.getElementById(DOM.vnSection);
        if (!vnSection) return;
        var el = document.createElement('div');
        el.id = DOM.choiceArea;
        el.style.display = 'none';
        vnSection.appendChild(el);
    }

    function _ensureStatBar() {
        if (document.getElementById(DOM.statBar)) return;
        var vnSection = document.getElementById(DOM.vnSection);
        if (!vnSection) return;
        var el = document.createElement('div');
        el.id = DOM.statBar;
        vnSection.appendChild(el);
    }

    // Obtener la caja de diálogo — tiene clase pero no ID
    function _dialogueBox() {
        return document.querySelector('.vn-dialogue-box') || null;
    }

    function destroy() {
        _unsubs.forEach(function(unsub) { unsub(); });
        _unsubs  = [];
        _active  = false;
        _charCache = {};
    }

    // ── Manejadores de eventos del engine ───────────────────────

    function _onSceneStarted(data) {
        _clearChoices();
        _hideStatCheck();
        var vnSection = document.getElementById(DOM.vnSection);
        if (vnSection) vnSection.classList.add('rpg-scene-active');
    }

    function _onStep(data) {
        var step = data.step;
        if (!step) return;

        // Solo renderizar diálogos aquí.
        // Las elecciones llegan por scene:choice-shown con opciones ya filtradas.
        if (step.type === 'dialogue') {
            _renderDialogue(step);
        }
    }

    function _onChoiceShown(data) {
        // data.options ya vienen filtradas por RPGEngine.getVisibleOptions()
        _renderChoice(data.step || {}, data.options);
    }

    function _onBackground(data) {
        // Emitir evento — vn.js escucha vn:background-changed y aplica el fondo.
        // RPGRenderer nunca llama funciones de vn.js directamente.
        eventBus.emit('vn:background-changed', {
            asset:      data.asset,
            transition: data.transition,
            duration:   data.duration,
            scene:      window.__etheriaScene || null
        });
    }

    function _onSound(data) {
        if (!data || !data.action) return;
        if (data.track === 'rain') {
            eventBus.emit(data.action === 'start' ? 'audio:start-rain' : 'audio:stop-rain');
        }
        // Otros tracks de escena se pueden ampliar aquí
    }

    function _onCamera(data) {
        var vnSection = document.getElementById(DOM.vnSection);
        if (!vnSection) return;

        if (data.effect === 'shake') {
            vnSection.classList.add('vn-shake');
            setTimeout(function() { vnSection.classList.remove('vn-shake'); }, data.duration || 400);
        } else if (data.effect === 'flash') {
            vnSection.classList.add('vn-flash');
            setTimeout(function() { vnSection.classList.remove('vn-flash'); }, data.duration || 300);
        }
    }

    function _onStatCheckResult(data) {
        _showStatCheck(data);
    }

    function _onChoiceMade(data) {
        _clearChoices();
    }

    function _onSceneEnded(data) {
        _clearChoices();
        _hideStatCheck();
        var vnSection = document.getElementById(DOM.vnSection);
        if (vnSection) vnSection.classList.remove('rpg-scene-active');

        // Si hay un callback registrado externamente, llamarlo
        if (typeof window._rpgSceneEndCallback === 'function') {
            window._rpgSceneEndCallback(data);
        }
    }

    function _onError(data) {
        console.error('[RPGRenderer] Error de escena:', data.error);
        var box = _dialogueBox();
        if (box) {
            _setText(DOM.charName, 'Error');
            _setText(DOM.dialogueText, 'No se pudo cargar la escena: ' + data.error);
            box.style.display = 'flex';
        }
    }

    function _onStateUpdated(data) {
        _updateStatBar(data);
    }

    // ── Renderizado de diálogo ───────────────────────────────────

    function _renderDialogue(step) {
        var box = _dialogueBox();
        if (!box) return;

        _clearChoices();
        _hideStatCheck();

        // Nombre del personaje
        var nameEl = document.getElementById(DOM.charName);
        if (nameEl) {
            nameEl.textContent = step.character || '';
            nameEl.style.color = _charColor(step.character);
        }

        // Texto con typewriter si existe la función global, sino directo
        var textEl = document.getElementById(DOM.dialogueText);
        if (textEl) {
            if (typeof typewriterWrite === 'function') {
                typewriterWrite(textEl, step.text || '', { speed: window.textSpeed || 25 });
            } else {
                textEl.textContent = step.text || '';
            }
        }

        // Expresión del sprite si hay personaje seleccionado
        if (step.expression && typeof showEmoteOnSprite === 'function') {
            showEmoteOnSprite(step.expression);
        }

        box.style.display = 'flex';

        // El click en la caja avanza al siguiente paso
        _bindAdvanceOnce(box);
    }

    // ── Renderizado de elecciones ────────────────────────────────

    // step: objeto del paso (para leer .prompt)
    // options: array ya filtrado por RPGEngine (llega desde scene:choice-shown)
    function _renderChoice(step, options) {
        var area = document.getElementById(DOM.choiceArea);
        if (!area) return;

        // Usar _dialogueBox() porque el elemento solo tiene clase CSS, no ID
        var box = _dialogueBox();
        if (box) box.style.display = 'none';

        area.innerHTML = '';
        area.style.display = 'flex';

        if (step.prompt) {
            var prompt = document.createElement('div');
            prompt.className = 'rpg-choice-prompt';
            prompt.textContent = step.prompt;
            area.appendChild(prompt);
        }

        (options || []).forEach(function(opt, i) {
            var btn = document.createElement('button');
            btn.className = 'rpg-choice-btn';
            btn.textContent = opt.text;

            // Indicador de coste si existe
            if (opt.cost_hp) {
                var badge = document.createElement('span');
                badge.className = 'rpg-choice-cost';
                badge.textContent = '-' + opt.cost_hp + ' HP';
                btn.appendChild(badge);
            }

            btn.addEventListener('click', function() {
                eventBus.emit('scene:input:choice', { index: i });
            });
            area.appendChild(btn);
        });
    }

    // ── Tirada de dados ──────────────────────────────────────────

    function _showStatCheck(data) {
        // Reutilizar showDiceResultOverlay si existe (ya implementado en vn.js)
        if (typeof showDiceResultOverlay === 'function') {
            showDiceResultOverlay(data);
            return;
        }

        // Fallback mínimo
        var existing = document.getElementById('rpgStatCheckOverlay');
        if (existing) existing.remove();

        var overlay = document.createElement('div');
        overlay.id = 'rpgStatCheckOverlay';
        overlay.className = 'rpg-stat-check-overlay';

        var cssClass = { critical: 'dice-result-critical', success: 'dice-result-success',
                         fail: 'dice-result-fail', fumble: 'dice-result-fumble' }[data.result]
                       || 'dice-result-success';

        var label = { critical: 'ÉXITO CRÍTICO', success: 'ACIERTO',
                      fail: 'FALLO', fumble: 'FALLO CRÍTICO' }[data.result] || data.result;

        var sign = data.modifier >= 0 ? '+' : '';
        overlay.innerHTML =
            '<div class="dice-result-box">' +
                '<div class="dice-number ' + cssClass + '">' + data.roll + '</div>' +
                '<div class="dice-result-label ' + cssClass + '">' + label + '</div>' +
                '<div style="font-size:0.85rem;margin-top:0.4rem;opacity:0.75;">' +
                    'D20 (' + data.roll + ') ' + sign + data.modifier + ' = ' + data.total +
                    ' vs CD ' + data.difficulty +
                '</div>' +
            '</div>';

        document.body.appendChild(overlay);
        setTimeout(function() { if (overlay.parentNode) overlay.remove(); }, 2000);
    }

    function _hideStatCheck() {
        var el = document.getElementById('rpgStatCheckOverlay');
        if (el) el.remove();
    }

    // ── Barra de stats ───────────────────────────────────────────

    // data: payload de rpg:state-updated  { hp: {current, max}, xp, level }
    // Si no llega payload (p.ej. llamada directa al init) lee de RPGState como fallback.
    function _updateStatBar(data) {
        var bar = document.getElementById(DOM.statBar);
        if (!bar) return;

        var hp  = (data && data.hp)    || RPGState.getHp();
        var xp  = (data && data.xp  != null) ? data.xp  : RPGState.getXp();
        var lvl = (data && data.level != null) ? data.level : RPGState.getLevel();

        bar.innerHTML =
            '<span class="rpg-stat-hp">❤ ' + hp.current + '/' + hp.max + '</span>' +
            '<span class="rpg-stat-xp">✦ Nv.' + lvl + ' (' + xp + ' XP)</span>';
    }

    // ── Helpers ──────────────────────────────────────────────────

    function _bindAdvanceOnce(element) {
        // Quitar listeners anteriores clonando el nodo
        var fresh = element.cloneNode(true);
        element.parentNode.replaceChild(fresh, element);

        function handler(e) {
            // No disparar si se ha hecho clic en un botón interno
            if (e.target.closest && e.target.closest('button')) return;
            fresh.removeEventListener('click', handler);
            eventBus.emit('scene:input:advance');
        }
        fresh.addEventListener('click', handler);
    }

    function _clearChoices() {
        var area = document.getElementById(DOM.choiceArea);
        if (area) { area.innerHTML = ''; area.style.display = 'none'; }
    }

    function _setText(domId, text) {
        var el = document.getElementById(domId);
        if (el) el.textContent = text;
    }

    function _resolveAsset(asset) {
        if (!asset) return '';
        if (asset.startsWith('http') || asset.startsWith('/') || asset.startsWith('./')) return asset;
        return 'assets/backgrounds/' + asset + '.jpg';
    }

    // Asignar un color consistente por nombre de personaje
    var CHAR_COLORS = [
        '#e8c97a', '#7ab8e8', '#e87a7a', '#7ae8b8',
        '#c87ae8', '#e8a87a', '#7ae8e8', '#e87ab8'
    ];

    function _charColor(name) {
        if (!name) return '#e8dcc8';
        if (!_charCache[name]) {
            var hash = 0;
            for (var i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) | 0;
            _charCache[name] = CHAR_COLORS[Math.abs(hash) % CHAR_COLORS.length];
        }
        return _charCache[name];
    }

    return { init: init, destroy: destroy, updateStatBar: _updateStatBar };
})();

/* js/app.js */
// Punto de entrada: inicializa la app cuando carga el DOM.
// ============================================
// CORE/BOOT.JS
// ============================================
// Punto de arranque de Etheria.
// Se ejecuta cuando el HTML termina de cargar (DOMContentLoaded).

// ============================================
// AUTH + INICIALIZACIÓN
// ============================================

const logger = window.EtheriaLogger;

// Verificar si hay una sesión existente
async function checkExistingSession() {
    if (!window.supabaseClient) return false;
    
    try {
        const { data: { session } } = await window.supabaseClient.auth.getSession();
        return !!session;
    } catch (e) {
        logger?.warn('app:auth', 'checkExistingSession failed:', e?.message || e);
        return false;
    }
}

function setAuthStatus(message, isError, targetId = 'authStatus') {
    const statusEl = document.getElementById(targetId);
    if (!statusEl) return;
    statusEl.textContent = message || '';
    statusEl.className = 'auth-status' + (isError ? ' error' : isError === false ? ' success' : '');
}

function showLoginScreen() {
    const loginScreen = document.getElementById('authScreen');
    if (loginScreen) {
        loginScreen.style.display = 'flex';
        loginScreen.classList.remove('hidden');
    }
}

function hideLoginScreen() {
    const loginScreen = document.getElementById('authScreen');
    if (loginScreen) {
        loginScreen.classList.add('hidden');
        setTimeout(() => {
            loginScreen.style.display = 'none';
        }, 500);
    }
}

// Navegación entre vistas de autenticación
function showAuthForm(view) {
    document.querySelectorAll('.auth-view').forEach(v => v.classList.remove('active'));
    if (view === 'login') {
        document.getElementById('authLoginView').classList.add('active');
    } else if (view === 'register') {
        document.getElementById('authRegisterView').classList.add('active');
    }
}

function showAuthMain() {
    document.querySelectorAll('.auth-view').forEach(v => v.classList.remove('active'));
    document.getElementById('authMainView').classList.add('active');
    setAuthStatus('', null, 'authStatus');
    setAuthStatus('', null, 'authRegStatus');
}

function continueAsGuest() {
    hideLoginScreen();
    initializeApp();
    isOfflineMode = true;
}

async function logout() {
    if (!window.supabaseClient) {
        setAuthStatus('Sin conexión. No se pudo cerrar sesión.', true);
        return;
    }

    try {
        await window.supabaseClient.auth.signOut();
    } catch (error) {
        logger?.warn('app:auth', 'logout failed:', error?.message || error);
    }

    // Limpiar cache de usuario para evitar que módulos de sync crean que hay sesión activa.
    window._cachedUserId = null;
    window.dispatchEvent(new CustomEvent('etheria:auth-changed', {
        detail: { user: null }
    }));

    if (typeof SupabaseSync !== 'undefined' && typeof SupabaseSync.stopAutoSync === 'function') {
        SupabaseSync.stopAutoSync();
    }

    showLoginScreen();
    showAuthMain();
    setAuthStatus('Sesión cerrada. Introduce email y contraseña para entrar.', false);
    setTimeout(() => {
        const emailInput = document.getElementById('authEmail');
        if (emailInput) emailInput.focus();
    }, 30);
}

async function login() {
    const email = (document.getElementById('authEmail')?.value || '').trim();
    const password = document.getElementById('authPassword')?.value || '';

    if (!email || !password) {
        setAuthStatus('Completa email y contraseña.', true);
        return;
    }

    if (!window.supabaseClient) {
        setAuthStatus('Sin conexión. Usa el modo local.', true);
        return;
    }

    setAuthStatus('Iniciando sesión...');
    const { error } = await window.supabaseClient.auth.signInWithPassword({ email, password });

    if (error) {
        setAuthStatus(error.message || 'No se pudo iniciar sesión.', true);
        return;
    }

    hideLoginScreen();
    initializeApp();
    await ensureProfile();  // inicializa SupabaseProfiles + dispara auth-changed

    // La nube siempre gana al iniciar sesión: descargar y reemplazar datos locales.
    // Resuelve la desincronización entre dispositivos (PWA vs navegador) con el mismo login.
    if (typeof SupabaseSync !== 'undefined') {
        const result = await SupabaseSync.downloadProfileData();
        if (result.ok && result.data) {
            if (typeof renderTopics === 'function')   renderTopics();
            if (typeof renderGallery === 'function')  renderGallery();
            if (typeof renderUserCards === 'function') renderUserCards();
        }
    }
}

async function register() {
    const email = (document.getElementById('authRegEmail')?.value || '').trim();
    const password = document.getElementById('authRegPassword')?.value || '';
    const passwordConfirm = document.getElementById('authRegPasswordConfirm')?.value || '';

    if (!email || !password) {
        setAuthStatus('Completa email y contraseña.', true, 'authRegStatus');
        return;
    }
    
    if (password !== passwordConfirm) {
        setAuthStatus('Las contraseñas no coinciden.', true, 'authRegStatus');
        return;
    }
    
    if (password.length < 6) {
        setAuthStatus('La contraseña debe tener al menos 6 caracteres.', true, 'authRegStatus');
        return;
    }

    if (!window.supabaseClient) {
        setAuthStatus('Sin conexión. Usa el modo local.', true, 'authRegStatus');
        return;
    }

    setAuthStatus('Creando cuenta...', null, 'authRegStatus');
    const { data, error } = await window.supabaseClient.auth.signUp({ email, password });

    if (error) {
        setAuthStatus(error.message || 'No se pudo registrar.', true, 'authRegStatus');
        return;
    }

    const needsConfirmation = !data?.session;
    setAuthStatus(needsConfirmation
        ? 'Cuenta creada. Revisa tu email para confirmar.'
        : 'Cuenta creada correctamente.', false, 'authRegStatus');

    if (!needsConfirmation) {
        hideLoginScreen();
        initializeApp();
        await ensureProfile();  // inicializa SupabaseProfiles + dispara auth-changed

        // Nube gana también en registro (puede haber datos de otro dispositivo)
        if (typeof SupabaseSync !== 'undefined') {
            const result = await SupabaseSync.downloadProfileData();
            if (result.ok && result.data) {
                if (typeof renderTopics === 'function')   renderTopics();
                if (typeof renderGallery === 'function')  renderGallery();
                if (typeof renderUserCards === 'function') renderUserCards();
            }
        }
    }
}

async function ensureProfile() {
    // ensureProfile ya no crea perfiles automáticamente.
    // Los perfiles globales se crean explícitamente por el usuario via SupabaseProfiles.
    // Esta función solo inicializa los módulos Supabase tras el login.
    try {
        const { data: userData, error: userError } = await window.supabaseClient.auth.getUser();
        if (userError || !userData?.user) return;

        // Inicializar módulos de perfiles y personajes
        if (typeof SupabaseProfiles !== 'undefined') {
            SupabaseProfiles.init();
        }

        // Cargar ajustes del usuario desde Supabase y aplicar a UI
        if (typeof SupabaseSettings !== 'undefined') {
            SupabaseSettings.loadUserSettings().catch(() => {});
        }

        // Suscribirse a notificaciones de turno en tiempo real
        if (typeof SupabaseTurnNotifications !== 'undefined' && typeof SupabaseTurnNotifications.subscribe === 'function') {
            SupabaseTurnNotifications.subscribe().catch(() => {});
        }

        // Fix 6: cache user globally so Supabase modules avoid repeated getUser() calls
        window._cachedUserId = userData.user.id;
        // Disparar evento para que otros módulos sepan que hay usuario autenticado
        window.dispatchEvent(new CustomEvent('etheria:auth-changed', {
            detail: { user: userData.user }
        }));
    } catch {
        // Silencioso para no bloquear la app
    }
}

let appInitialized = false;

function initializeApp() {
    if (appInitialized) return;
    appInitialized = true;

    appData = loadStoredAppData();

    const savedNames = localStorage.getItem('etheria_user_names');
    if (savedNames) {
        try {
            const parsedNames = JSON.parse(savedNames);
            if (Array.isArray(parsedNames)) {
                const sanitizedNames = parsedNames
                    .map(name => String(name || '').trim())
                    .filter(Boolean)
                    .slice(0, 10);
                if (sanitizedNames.length > 0) {
                    userNames = sanitizedNames;
                }
            }
        } catch (e) {
            console.error('Error parsing user names:', e);
        }
    }

    const savedCharId = localStorage.getItem(`etheria_selected_char_${currentUserIndex}`);
    if (savedCharId) selectedCharId = savedCharId;

    if (typeof syncVnStore === 'function') {
        syncVnStore({
            topicId: currentTopicId,
            selectedCharId,
            messageIndex: currentMessageIndex,
            isTyping,
            weather: currentWeather
        });
    }

    const savedSpeed = localStorage.getItem('etheria_text_speed');
    if (savedSpeed) {
        textSpeed = parseInt(savedSpeed);
        const slider = document.getElementById('textSpeedSlider');
        if (slider) slider.value = 110 - textSpeed;
    }

    const savedSize = localStorage.getItem('etheria_font_size');
    if (savedSize) {
        document.documentElement.style.setProperty('--font-size-base', savedSize + 'px');
        const slider = document.getElementById('fontSizeSlider');
        if (slider) slider.value = savedSize;
    }

    const savedTheme = localStorage.getItem('etheria_theme');
    if (savedTheme) {
        document.documentElement.setAttribute('data-theme', savedTheme);
    } else {
        document.documentElement.setAttribute('data-theme', 'light');
    }
    // Sincronizar botón de tema en pantalla de perfiles
    if (typeof updateProfileThemeBtn === 'function') updateProfileThemeBtn();

    renderUserCards();
    generateProfileParticles();
    if (typeof maybeShowOnboarding === 'function') maybeShowOnboarding();
    initMenuParallax();
    updateCloudSyncIndicator('online', 'Conectado');
    updateSyncButtonState('synced', 'Sincronizar');
    
    // Inicializar sincronización con Supabase
    if (typeof SupabaseSync !== 'undefined') {
        SupabaseSync.init();
    }
    startCloudSync();

    // Inicializar motor RPG de escenas narrativas
    if (typeof RPGState !== 'undefined')    RPGState.init(currentUserIndex);
    if (typeof RPGRenderer !== 'undefined') RPGRenderer.init();

    // renderUserCards() ya gestiona el welcomeOverlay internamente.

    // Setup keyboard listeners
    setupKeyboardListeners();
    setupTouchGestures();
    initSmartTooltips();
    setupReplyEmotePopover();
    setupGallerySearchListeners();


    pendingRoomInviteId = (typeof getRoomIdFromQuery === 'function') ? getRoomIdFromQuery() : null;
    if (pendingRoomInviteId) {
        const defaultProfile = getStoredLastProfileId();
        selectUser(defaultProfile !== null ? defaultProfile : 0, { autoLoad: true })
            .then(() => {
                if (typeof tryJoinRoomFromUrl === 'function') return tryJoinRoomFromUrl();
                return false;
            })
            .catch((err) => {
                console.warn('No se pudo abrir la sala compartida:', err);
            });
    } else {
        const lastProfileId = getStoredLastProfileId();
        if (lastProfileId !== null && Number.isInteger(lastProfileId) && userNames[lastProfileId]) {
            selectUser(lastProfileId, { autoLoad: true, instant: true })
                .catch((err) => {
                    console.warn('No se pudo cargar el último perfil activo:', err);
                });
        }
    }

    window.addEventListener('beforeunload', (e) => {
        if (hasUnsavedChanges) {
            e.preventDefault();
            e.returnValue = 'Tienes cambios sin guardar. ¿Seguro que quieres salir?';
        }
    });
}

document.addEventListener('DOMContentLoaded', async () => {
    // ── Detección de dispositivo para optimizaciones de rendimiento ──────────
    // Añadimos clases al <body> que mobile-perf.css usa para reducir
    // partículas, animaciones y efectos GPU en dispositivos de gama media/baja.
    // ── Detección de modo PWA (standalone) ──────────────────────────────────
    (function detectPWAMode() {
        const isStandalone =
            window.matchMedia('(display-mode: standalone)').matches ||
            window.matchMedia('(display-mode: fullscreen)').matches ||
            navigator.standalone === true; // iOS Safari

        if (isStandalone) {
            document.body.classList.add('is-pwa');
            document.body.classList.add('pwa-standalone');
            document.documentElement.classList.add('pwa-standalone');

            // ── Forzar orientación landscape ──────────────────────────
            // El manifest ya pide landscape, pero algunos Android ignoran
            // el manifest hasta que el usuario rota. La API Screen Orientation
            // lo forza activamente en navegadores que la soportan.
            // Intentar lock inmediato
            function _tryOrientationLock() {
                try {
                    if (screen.orientation && screen.orientation.lock) {
                        screen.orientation.lock('landscape').catch((error) => {
                            logger?.debug('app:pwa', 'orientation lock rejected:', error?.message || error);
                        });
                    }
                } catch (e) {
                    logger?.debug('app:pwa', 'orientation lock unavailable:', e?.message || e);
                }
            }
            _tryOrientationLock();

            // Re-intentar en el primer gesto del usuario (algunos Android
            // requieren interacción previa para permitir el lock)
            const _onFirstInteraction = () => {
                _tryOrientationLock();
                document.removeEventListener('touchstart', _onFirstInteraction);
                document.removeEventListener('click', _onFirstInteraction);
            };
            document.addEventListener('touchstart', _onFirstInteraction, { once: true });
            document.addEventListener('click', _onFirstInteraction, { once: true });

            window.matchMedia('(display-mode: standalone)').addEventListener('change', (e) => {
                document.body.classList.toggle('is-pwa', e.matches);
                document.body.classList.toggle('pwa-standalone', e.matches);
                document.documentElement.classList.toggle('pwa-standalone', e.matches);
            });
        }
    })();
    // ─────────────────────────────────────────────────────────────────────────

    (function detectDeviceCapabilities() {
        const ua = navigator.userAgent || '';
        const isMobileUA = /Mobi|Android|iPhone|iPad|iPod|IEMobile|Opera Mini/i.test(ua);
        const isCoarsePointer = typeof window.matchMedia === 'function'
            && window.matchMedia('(pointer: coarse)').matches;

        if (isMobileUA || isCoarsePointer) {
            document.body.classList.add('is-mobile');
        }

        // low-spec: RAM < 4 GB o menos de 4 hilos lógicos
        const mem = navigator.deviceMemory;        // undefined en Firefox/Safari
        const cpu = navigator.hardwareConcurrency; // undefined en algunos móviles
        if ((mem !== undefined && mem < 4) || (cpu !== undefined && cpu < 4)) {
            document.body.classList.add('low-spec');
        }

        // Refleja prefers-reduced-motion como clase de body para CSS condicional
        if (typeof window.matchMedia === 'function'
                && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
            document.body.classList.add('prefers-reduced-motion');
        }
    })();
    // ─────────────────────────────────────────────────────────────────────────

    // ── Forzar orientación landscape en móviles (PWA) ─────────────────────
    // Etheria está diseñado para horizontal. Intentamos bloquear landscape en
    // móviles reales. En tablets grandes y desktop no hacemos nada (ya son
    // landscape por naturaleza, y Android 12L+ prohíbe el lock en pantallas
    // ≥ 600 dp de ancho menor).
    //
    // Compatibilidad 2025-2026:
    //   • screen.orientation.lock() es parte del W3C Screen Orientation API.
    //   • Chrome Android ≥ 93 lo soporta en modo standalone/fullscreen PWA.
    //   • Safari iOS ≥ 16.4 lo soporta parcialmente (requiere interacción previa).
    //   • Firefox Android lo soporta desde v112.
    //   • En navegador normal (no PWA instalada) puede rechazarlo — se captura.
    //   • En tablets/Chromebooks con ventana redimensionable Chrome lanza
    //     NotSupportedError; lo capturamos y no hacemos nada.
    (function initOrientationLock() {
        const ua = navigator.userAgent || '';

        // Solo actuar en móviles / handhelds reales.
        // Usamos pointer:coarse + viewport estrecho como doble guardia para
        // evitar lockear accidentalmente tablets en modo split-window.
        const isMobileUA   = /Mobi|Android.*Mobile|iPhone|iPod|IEMobile|Opera Mini/i.test(ua);
        const isCoarse     = typeof window.matchMedia === 'function'
                             && window.matchMedia('(pointer: coarse)').matches;
        const isNarrowPort = window.innerWidth < window.innerHeight  // arrancó en portrait
                             && Math.min(window.innerWidth, window.innerHeight) < 600;

        // Tablets grandes (≥ 600px lado corto): dejamos que el SO gestione
        const isLargeTablet = Math.min(window.innerWidth, window.innerHeight) >= 600;

        const shouldLock = (isMobileUA || isCoarse) && !isLargeTablet;
        if (!shouldLock) return; // desktop / tablet grande → sin lock

        // Clave localStorage para mostrar el toast SOLO la primera vez
        const TOAST_KEY = 'etheria_landscape_hint_shown';

        // ── Función principal de lock ───────────────────────────────────────
        async function lockLandscape() {
            // screen.orientation no disponible (navegador antiguo o iOS < 16.4)
            if (!screen?.orientation?.lock) {
                _showLandscapeHint();
                return;
            }

            try {
                await screen.orientation.lock('landscape');
                // Lock exitoso → quitar hint si estaba visible, marcar como hecho
                localStorage.setItem(TOAST_KEY, '1');
                _hideLandscapeHint();
            } catch (err) {
                // Razones habituales de fallo:
                //   SecurityError  → no estamos en standalone / fullscreen
                //   NotSupportedError → tablet en modo ventana, Chromebook, etc.
                //   AbortError     → pantalla ya en landscape cuando se intentó
                console.warn('[Etheria] Orientation lock falló:', err.name, err.message);

                // Si ya estamos en landscape no hace falta el hint
                const alreadyLandscape = window.innerWidth >= window.innerHeight;
                if (!alreadyLandscape) {
                    _showLandscapeHint();
                }
            }
        }

        // ── Toast / hint sutil ──────────────────────────────────────────────
        // Se muestra UNA sola vez (hasta que el usuario instale la PWA y el
        // lock empiece a funcionar).
        function _showLandscapeHint() {
            if (localStorage.getItem(TOAST_KEY)) return; // ya lo vio
            if (window.innerWidth >= window.innerHeight)  return; // ya landscape

            // Usar el sistema de toasts nativo de Etheria si está disponible,
            // de lo contrario crear un elemento temporal propio.
            eventBus.emit('ui:show-autosave', { text: 'Gira el móvil horizontal para mejor experiencia 🔄', state: 'info' });
            if (typeof showAutosave !== 'function') {
                _injectHintElement();
            }
            localStorage.setItem(TOAST_KEY, '1');
        }

        function _hideLandscapeHint() {
            const el = document.getElementById('_etheriaLandscapeHint');
            if (el) el.remove();
        }

        // Fallback mínimo si showAutosave aún no está disponible (raro)
        function _injectHintElement() {
            if (document.getElementById('_etheriaLandscapeHint')) return;
            const hint = document.createElement('div');
            hint.id = '_etheriaLandscapeHint';
            hint.setAttribute('aria-live', 'polite');
            hint.style.cssText = [
                'position:fixed', 'bottom:1.2rem', 'left:50%',
                'transform:translateX(-50%)',
                'background:rgba(20,15,8,0.92)',
                'color:rgba(220,190,120,0.95)',
                'font-family:"Cinzel",serif',
                'font-size:0.8rem', 'letter-spacing:0.05em',
                'padding:0.55rem 1.1rem', 'border-radius:8px',
                'border:1px solid rgba(201,168,108,0.4)',
                'box-shadow:0 4px 20px rgba(0,0,0,0.6)',
                'z-index:9999', 'white-space:nowrap',
                'pointer-events:none',
                'animation:etheriaHintFade 4s ease forwards'
            ].join(';');
            hint.textContent = 'Gira el móvil horizontal para mejor experiencia 🔄';

            // Inyectar keyframe si no existe
            if (!document.getElementById('_etheriaHintStyle')) {
                const style = document.createElement('style');
                style.id = '_etheriaHintStyle';
                style.textContent = '@keyframes etheriaHintFade{0%{opacity:0;transform:translateX(-50%) translateY(6px)}15%{opacity:1;transform:translateX(-50%) translateY(0)}80%{opacity:1}100%{opacity:0}}';
                document.head.appendChild(style);
            }
            document.body.appendChild(hint);
            setTimeout(() => hint.remove(), 4200);
        }

        // ── Escuchar cambios de orientación ─────────────────────────────────
        // Si el usuario rota manualmente a portrait después de que el lock
        // haya fallado, recordamos intentarlo de nuevo (por si la PWA ya está
        // instalada y ahora el lock sí funciona).
        if (screen?.orientation) {
            screen.orientation.addEventListener('change', () => {
                const type = screen.orientation.type || '';
                if (type.startsWith('portrait')) {
                    // Reintentar lock silencioso
                    lockLandscape();
                }
            });
        }

        // Intentar lock inicial — en standalone ya tenemos contexto de pantalla.
        // Usamos un pequeño delay para asegurarnos de que el DOM está listo y
        // la PWA ha completado su transición de startup.
        if (document.readyState === 'complete') {
            lockLandscape();
        } else {
            window.addEventListener('load', lockLandscape, { once: true });
        }
    })();
    // ── Fin orientación landscape ─────────────────────────────────────────
    
    // Verificar si hay sesión activa
    const hasExistingSession = await checkExistingSession();
    
    if (hasExistingSession) {
        // Sesión existente, inicializar directamente
        hideLoginScreen();
        initializeApp();
    } else {
        // Mostrar pantalla de autenticación
        showLoginScreen();
    }

    // Configurar listeners de autenticación
    if (window.supabaseClient) {
        window.supabaseClient.auth.onAuthStateChange((event, session) => {
            if (event === 'SIGNED_IN' && session) {
                ensureProfile().catch(() => {});
                return;
            }

            if (event === 'SIGNED_OUT') {
                window._cachedUserId = null;
                window.dispatchEvent(new CustomEvent('etheria:auth-changed', { detail: { user: null } }));
                showLoginScreen();
                showAuthMain();
            }
        });
    } else {
        isOfflineMode = true;
    }

    // ── Registro del Service Worker (PWA) ────────────────────────
    // Solo en HTTPS (obligatorio) y si el navegador lo soporta.
    // No bloquea el arranque de la app — se registra en background.
    if ('serviceWorker' in navigator) {
        window.addEventListener('load', () => {
            navigator.serviceWorker.register('./sw.js', { scope: './' })
                .then((reg) => {
                    // Manejar actualizaciones del Service Worker
                    reg.addEventListener('updatefound', () => {
                        const newWorker = reg.installing;
                        newWorker.addEventListener('statechange', () => {
                            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                                // Nueva versión disponible
                                console.log('[PWA] Nueva versión disponible');
                                eventBus.emit('ui:show-autosave', { text: 'Nueva versión disponible. Recarga para actualizar.', state: 'info' });
                                // Forzar activación de la nueva versión
                                newWorker.postMessage('skipWaiting');
                            }
                        });
                    });

                    // Escuchar mensajes del SW
                    navigator.serviceWorker.addEventListener('message', (event) => {
                        if (event.data?.type === 'SYNC_REQUIRED') {
                            if (typeof SupabaseSync !== 'undefined') {
                                SupabaseSync.sync({ silent: true });
                            }
                        } else if (event.data?.type === 'SW_UPDATED') {
                            eventBus.emit('ui:show-autosave', {
                                text: '✨ Actualización lista. Recarga para aplicar mejoras.',
                                state: 'success',
                            });
                        }
                    });

                    // SW registrado; el scope es el directorio actual
                    if (reg.installing) {
                        console.log('[PWA] Service Worker instalando…');
                    } else if (reg.waiting) {
                        console.log('[PWA] Service Worker en espera.');
                        // Forzar activación si hay una versión esperando
                        reg.waiting.postMessage('skipWaiting');
                    } else if (reg.active) {
                        console.log('[PWA] Service Worker activo.');
                    }
                })
                .catch((err) => {
                    // Fallo no crítico — la app funciona igual sin SW
                    console.warn('[PWA] Service Worker no pudo registrarse:', err);
                });
        });
    }
    // ── Frase aleatoria en el subtítulo del menú principal ───────────────────
    // (absorbido de mejoras.js — Mejora 1)
    (function _initMenuSubtitle() {
        var phrases = [
            'Un mundo al borde del olvido',
            'Cada elección deja una cicatriz',
            'El destino se escribe con tinta y dados',
            'Las historias no terminan, se transforman',
            'Cada personaje guarda un secreto',
            'El pasado elige quiénes somos',
            'Algunos hilos no deberían cortarse',
            'La magia no perdona a los imprudentes',
            'Hasta los héroes sangran en silencio',
            'El azar es la firma de los dioses',
            'Ningún mapa llega hasta el final del camino',
            'Lo que se escribe, permanece'
        ];
        var el = document.querySelector('.menu-subtitle');
        if (el) el.textContent = phrases[Math.floor(Math.random() * phrases.length)];
    })();
    // ─────────────────────────────────────────────────────────────

    // ── Auth: mostrar vista "olvidé contraseña" ──────────────────
    const _origShowAuthForm = showAuthForm;
    window.showAuthForm = function(view) {
        if (view === 'forgot') {
            document.querySelectorAll('.auth-view').forEach(v => v.classList.remove('active'));
            document.getElementById('authForgotView').classList.add('active');
            setAuthStatus('', null, 'authForgotStatus');
        } else {
            _origShowAuthForm(view);
        }
    };

    // ── Enviar email de recuperación de contraseña ───────────────
    window.sendPasswordReset = async function() {
        const email = (document.getElementById('authForgotEmail')?.value || '').trim();
        if (!email) {
            setAuthStatus('Introduce tu email.', true, 'authForgotStatus');
            return;
        }
        setAuthStatus('Enviando enlace...', null, 'authForgotStatus');
        const { error } = await window.supabaseClient.auth.resetPasswordForEmail(email, {
            redirectTo: window.location.origin + window.location.pathname
        });
        if (error) {
            setAuthStatus('No se pudo enviar. Comprueba el email.', true, 'authForgotStatus');
        } else {
            setAuthStatus('\u2713 Enlace enviado. Revisa tu bandeja de entrada.', false, 'authForgotStatus');
            document.getElementById('authForgotEmail').value = '';
        }
    };

    // ── Cambiar email (con verificación) ────────────────────────
    window.requestEmailChange = async function() {
        const newEmail = (document.getElementById('optNewEmail')?.value || '').trim();
        const statusEl = document.getElementById('optEmailStatus');
        if (!newEmail) {
            if (statusEl) { statusEl.textContent = 'Introduce el nuevo email.'; statusEl.className = 'opt-security-status error'; }
            return;
        }
        if (statusEl) { statusEl.textContent = 'Enviando verificación...'; statusEl.className = 'opt-security-status info'; }
        const { error } = await window.supabaseClient.auth.updateUser({ email: newEmail });
        if (error) {
            if (statusEl) { statusEl.textContent = error.message || 'No se pudo solicitar el cambio.'; statusEl.className = 'opt-security-status error'; }
        } else {
            if (statusEl) { statusEl.textContent = '\u2713 Revisa ' + newEmail + ' para confirmar el cambio.'; statusEl.className = 'opt-security-status success'; }
            document.getElementById('optNewEmail').value = '';
        }
    };

    // ── Cambiar contraseña (sesión activa) ───────────────────────
    window.requestPasswordChange = async function() {
        const newPass     = document.getElementById('optNewPassword')?.value || '';
        const confirmPass = document.getElementById('optNewPasswordConfirm')?.value || '';
        const statusEl    = document.getElementById('optPasswordStatus');
        if (!newPass || !confirmPass) {
            if (statusEl) { statusEl.textContent = 'Completa ambos campos.'; statusEl.className = 'opt-security-status error'; }
            return;
        }
        if (newPass !== confirmPass) {
            if (statusEl) { statusEl.textContent = 'Las contraseñas no coinciden.'; statusEl.className = 'opt-security-status error'; }
            return;
        }
        if (newPass.length < 6) {
            if (statusEl) { statusEl.textContent = 'Mínimo 6 caracteres.'; statusEl.className = 'opt-security-status error'; }
            return;
        }
        if (statusEl) { statusEl.textContent = 'Actualizando...'; statusEl.className = 'opt-security-status info'; }
        const { error } = await window.supabaseClient.auth.updateUser({ password: newPass });
        if (error) {
            if (statusEl) { statusEl.textContent = error.message || 'No se pudo actualizar la contraseña.'; statusEl.className = 'opt-security-status error'; }
        } else {
            if (statusEl) { statusEl.textContent = '\u2713 Contraseña actualizada correctamente.'; statusEl.className = 'opt-security-status success'; }
            document.getElementById('optNewPassword').value = '';
            document.getElementById('optNewPasswordConfirm').value = '';
        }
    };



});

/* js/ethy.js */
// ============================================
// ETHY - La mascota guía de Etheria
// ============================================
// Sistema de guía interactiva con múltiples expresiones y tutoriales
// para cada sección de la aplicación.
// ============================================

const Ethy = (function() {
    'use strict';

    const logger = window.EtheriaLogger;

    // ── Configuración ────────────────────────────────────────────────────────
    const CONFIG = {
        STORAGE_KEY: 'etheria_ethy_seen',
        TUTORIAL_KEY: 'etheria_ethy_tutorials',
        ANIMATION_DURATION: 400,
        TYPING_SPEED: 30, // ms por carácter
    };

    // ── Estado interno ───────────────────────────────────────────────────────
    let _container = null;
    let _body = null;
    let _floatWrapper = null;
    let _bubble = null;
    let _currentExpression = 'neutral';
    let _isTyping = false;
    let _typingTimeout = null;
    let _currentTutorial = null;
    let _tutorialStep = 0;
    let _seenTutorials = new Set();
    let _isVisible = false;
    let _isMinimized = false;
    let _tutorialPanel = null;
    let _tutorialPanelVisible = false;
    let _isDragging = false;
    let _wasDragging = false;   // true if mousedown moved enough to be a real drag
    let _dragStartX = 0;
    let _dragStartY = 0;
    let _clickCount = 0;
    let _clickTimer = null;
    let _sleepTimeout = null;
    let _isSleeping = false;
    const SLEEP_DELAY = 150000; // 2.5 minutos sin interacción
    const POSITION_KEY = 'etheria_ethy_pos';
    const MINIMIZED_KEY = 'etheria_ethy_minimized';

    // ── Expresiones disponibles ──────────────────────────────────────────────
    const EXPRESSIONS = {
        neutral: { class: 'ethy-expression-neutral', emoji: 'ㆆ_ㆆ' },
        sad: { class: 'ethy-expression-sad', emoji: '˘︹˘' },
        happy: { class: 'ethy-expression-happy', emoji: '─‿‿─' },
        excited: { class: 'ethy-expression-excited', emoji: '≧◉◡◉≦' },
        surprised: { class: 'ethy-expression-surprised', emoji: '◉_◉' },
        thoughtful: { class: 'ethy-expression-thoughtful', emoji: '¬‿¬' },
        wink: { class: 'ethy-expression-wink', emoji: '◠‿◠' },
        love: { class: 'ethy-expression-love', emoji: '♥‿♥' }
    };

    // ── Tutoriales por sección ───────────────────────────────────────────────
    const TUTORIALS = {

        // ── Menú Principal ───────────────────────────────────────────────────
        mainMenu: {
            title: '¡Bienvenido a Etheria!',
            expression: 'excited',
            steps: [
                {
                    text: '¡Hola! Soy Ethy, tu guía en Etheria. Estoy aquí para ayudarte a crear historias increíbles. ✨',
                    expression: 'excited',
                    action: null
                },
                {
                    text: 'En "Nueva Partida" empieza todo. Puedes crear una historia en modo Clásico —roleplay libre— o en modo RPG con dados y stats. ¡Tú eliges!',
                    expression: 'happy',
                    action: () => highlightElement('.menu-button-console.primary')
                },
                {
                    text: 'En "Personajes" gestionas las fichas de todos tus personajes: avatar, trasfondo, stats y mucho más.',
                    expression: 'thoughtful',
                    action: () => highlightElement('.menu-button-console:nth-child(2)')
                },
                {
                    text: 'En "Opciones" ajustas el tema visual, tamaño de fuente, velocidad de texto... todo para que la experiencia sea tuya.',
                    expression: 'neutral',
                    action: () => highlightElement('.menu-button-console:nth-child(3)')
                },
                {
                    text: 'Abajo tienes tu perfil. Tócalo para cambiar tu nombre, avatar y demás datos en cualquier momento.',
                    expression: 'wink',
                    action: () => highlightElement('.menu-profile-btn')
                },
                {
                    text: 'El pequeño icono junto al perfil sirve para importar o exportar tu partida. ¡Así nunca pierdes tus historias!',
                    expression: 'surprised',
                    action: () => highlightElement('.menu-save-btn')
                },
                {
                    text: '¡Todo listo! Haz clic en mí siempre que quieras orientación. ¡Buena suerte, aventurera! 🌿',
                    expression: 'love',
                    action: null
                }
            ]
        },

        // ── Galería de Personajes ────────────────────────────────────────────
        gallery: {
            title: 'Personajes',
            expression: 'happy',
            steps: [
                {
                    text: '¡Aquí viven todos tus personajes! Puedes buscarlos, filtrarlos por raza o jugador, y ver sus fichas completas.',
                    expression: 'happy',
                    action: null
                },
                {
                    text: 'Pulsa "Nuevo personaje" para crear una ficha desde cero: nombre, raza, edad, descripción física, personalidad, historia y notas libres.',
                    expression: 'excited',
                    action: () => highlightElement('.gallery-new-btn')
                },
                {
                    text: 'En modo RPG cada personaje tendrá también stats (STR, INT, VIT, AGI) y un nivel que crece con la experiencia.',
                    expression: 'thoughtful',
                    action: null
                },
                {
                    text: 'Puedes subir un avatar propio o usar una URL. Cada personaje tiene su color de acento para la caja de diálogo. 🎨',
                    expression: 'wink',
                    action: null
                },
                {
                    text: '¿Quién será tu próximo personaje? Las mejores historias nacen de personajes bien construidos. 🎭',
                    expression: 'love',
                    action: null
                }
            ]
        },

        // ── Crear Historia ───────────────────────────────────────────────────
        createTopic: {
            title: 'Nueva Historia',
            expression: 'excited',
            steps: [
                {
                    text: '¡Vamos a crear algo especial! Lo primero es elegir el modo de juego.',
                    expression: 'excited',
                    action: null
                },
                {
                    text: 'El modo Clásico es roleplay puro: narración libre sin mecánicas. Perfecto cuando el foco es el diálogo y la escritura.',
                    expression: 'happy',
                    action: () => highlightElement('#modeRoleplay')
                },
                {
                    text: 'El modo RPG añade stats, tiradas de dados y el Oráculo del Destino. Las acciones tienen consecuencias reales. ¡El azar da forma a la historia! 🎲',
                    expression: 'surprised',
                    action: () => highlightElement('#modeRpg')
                },
                {
                    text: 'Ponle un título y escribe el primer mensaje: ese es el arranque de tu historia. Puedes usar **negrita** y *cursiva* para darle estilo.',
                    expression: 'thoughtful',
                    action: () => highlightElement('#topicTitleInput')
                },
                {
                    text: '¡Todo listo! Una vez creada podrás compartirla con otros jugadores en tiempo real. ✨',
                    expression: 'love',
                    action: null
                }
            ]
        },

        // ── Modo VN Clásico ──────────────────────────────────────────────────
        vnClassic: {
            title: 'Historia — Modo Clásico',
            expression: 'happy',
            steps: [
                {
                    text: '¡Tu historia está en marcha! En modo Clásico el protagonismo es del texto y las decisiones.',
                    expression: 'happy',
                    action: null
                },
                {
                    text: 'Haz clic en la caja de diálogo o pulsa ESPACIO para avanzar. Las flechas ← → navegan entre mensajes.',
                    expression: 'neutral',
                    action: () => highlightElement('.vn-dialogue-box')
                },
                {
                    text: 'El botón "Responder" abre el panel de escritura. Elige tu personaje y escribe tu próxima intervención.',
                    expression: 'excited',
                    action: () => highlightElement('.reply-btn')
                },
                {
                    text: 'Añade emociones con emotes: escribe /happy, /sad, /angry, /love... y el personaje reaccionará visualmente. 🎭',
                    expression: 'wink',
                    action: null
                },
                {
                    text: 'También puedes crear opciones de elección para bifurcar la historia y dejar que los lectores decidan su rumbo.',
                    expression: 'thoughtful',
                    action: null
                },
                {
                    text: 'La barra de controles te permite navegar por el historial, marcar favoritos y exportar la historia completa. 📜',
                    expression: 'surprised',
                    action: () => highlightElement('.vn-controls')
                }
            ]
        },

        // ── Modo VN RPG ──────────────────────────────────────────────────────
        vnRPG: {
            title: 'Historia — Modo RPG',
            expression: 'excited',
            steps: [
                {
                    text: '¡Modo RPG activo! Cada decisión puede tener consecuencias marcadas por los dados. 🎲',
                    expression: 'excited',
                    action: null
                },
                {
                    text: 'La ficha de tu personaje aparece arriba a la izquierda. Muestra HP, stats y rango de afinidad con otros personajes.',
                    expression: 'thoughtful',
                    action: () => highlightElement('.vn-info-card')
                },
                {
                    text: 'El Oráculo del Destino aparece cuando un personaje intenta algo difícil. Tiras un D20 sumando tu stat relevante contra una dificultad.',
                    expression: 'surprised',
                    action: () => highlightElement('#vnOracleFloatBtn')
                },
                {
                    text: '¡El resultado del dado determina si la acción tiene éxito o falla! El narrador describe las consecuencias en el siguiente mensaje.',
                    expression: 'happy',
                    action: null
                },
                {
                    text: 'El HP puede bajar por combate o consecuencias del Oráculo. Si llega a cero... algo malo pasará. 💀',
                    expression: 'sad',
                    action: () => highlightElement('.vn-info-hp-bar')
                },
                {
                    text: '¡Que los dados te sean favorables, aventurera! 🎲✨',
                    expression: 'love',
                    action: null
                }
            ]
        },

        // ── Opciones ─────────────────────────────────────────────────────────
        options: {
            title: 'Opciones',
            expression: 'neutral',
            steps: [
                {
                    text: 'Aquí ajustas Etheria a tu gusto. Hay tres pestañas: Apariencia, Lectura y Sonido.',
                    expression: 'neutral',
                    action: () => highlightElement('.opt-tab-bar')
                },
                {
                    text: 'En Apariencia puedes cambiar entre modo Claro y Oscuro, ajustar el tamaño de fuente y aplicar filtros de atmósfera a las escenas. 🌙',
                    expression: 'thoughtful',
                    action: () => highlightElement('#themeToggleBtn')
                },
                {
                    text: 'En Lectura controlas la velocidad del texto, el texto instantáneo y el modo inmersivo para leer sin distracciones.',
                    expression: 'happy',
                    action: () => highlightElement('[data-tab="reading"]')
                },
                {
                    text: 'Desde Sonido ajustas el volumen general y el de los efectos de lluvia y ambiente. 🔊',
                    expression: 'wink',
                    action: () => highlightElement('[data-tab="sound"]')
                },
                {
                    text: '¡Experimenta hasta encontrar la combinación que más te guste!',
                    expression: 'excited',
                    action: null
                }
            ]
        },

        // ── Importar / Exportar ──────────────────────────────────────────────
        saveHub: {
            title: 'Importar y Exportar',
            expression: 'thoughtful',
            steps: [
                {
                    text: 'Este panel sirve para mover tus datos hacia fuera o hacia dentro de Etheria.',
                    expression: 'thoughtful',
                    action: null
                },
                {
                    text: '"Descargar partida" exporta toda tu información a un archivo JSON. Es tu copia de seguridad local.',
                    expression: 'neutral',
                    action: () => highlightElement('.save-hub-primary')
                },
                {
                    text: '"Cargar partida" importa ese archivo JSON. Úsalo para restaurar datos o llevarlos de un dispositivo a otro.',
                    expression: 'happy',
                    action: null
                },
                {
                    text: 'Con "Generar código" creas un código de 6 caracteres para compartir una historia concreta con otro jugador.',
                    expression: 'excited',
                    action: null
                },
                {
                    text: 'Y con "Importar código" recibes la historia que alguien te compartió. ¡Así de fácil es colaborar! 🌿',
                    expression: 'love',
                    action: null
                }
            ]
        }
    };

    // ── Inicialización ───────────────────────────────────────────────────────

    function init() {
        _loadSeenTutorials();
        _createElements();
        _setupEventListeners();
        
        // Mostrar Ethy con animación de entrada
        setTimeout(() => {
            show();
            _setSectionExpression('mainMenu'); // expresión inicial aleatoria
            _startIdleSystem();               // arrancar idle dinámico
            _resetSleepTimer();               // arrancar sleep timer
        }, 1000);
    }

    function _createElements() {
        // Verificar si ya existe
        if (document.getElementById('ethyContainer')) {
            _container = document.getElementById('ethyContainer');
            _floatWrapper = _container.querySelector('.ethy-float-wrapper');
            _body = _container.querySelector('.ethy-body');
            _bubble = _container.querySelector('.ethy-speech-bubble');
            return;
        }

        // Crear contenedor principal
        _container = document.createElement('div');
        _container.className = 'ethy-container';
        _container.id = 'ethyContainer';
        _container.style.opacity = '1';
        _container.style.transform = 'scale(1)';

        // Crear wrapper de flotación (separa animation:ethyFloat del body
        // para que los transform de expresión no sean anulados por la animación)
        _floatWrapper = document.createElement('div');
        _floatWrapper.className = 'ethy-float-wrapper';

        // Crear cuerpo de Ethy — HTML inline con partes de cara animables
        _body = document.createElement('div');
        _body.className = 'ethy-body ethy-expression-neutral';
        _body.innerHTML = `
            <svg class="ethy-svg" viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg">
                <!-- Sombra en el suelo -->
                <ellipse cx="40" cy="68" rx="22" ry="6" fill="#c4b49a" opacity="0.35"/>
                <!-- Cuerpo / carcasa -->
                <rect x="14" y="18" width="52" height="42" rx="4" fill="none" stroke="#9c8870" stroke-width="1.5"/>
                <!-- Antena -->
                <g class="ethy-part-antenna">
                    <path d="M58 10 C58 10 62 22 55 24" stroke="#9c8870" stroke-width="1.2" stroke-linecap="round" fill="none"/>
                    <path d="M56 10 L60 8 L58 12" fill="#9c8870"/>
                </g>
                <!-- Ojos -->
                <g class="ethy-part-eyes">
                    <circle class="ethy-eye-left"  cx="33" cy="38" r="4" fill="none" stroke="#9c8870" stroke-width="1.3"/>
                    <circle class="ethy-eye-right" cx="47" cy="38" r="4" fill="none" stroke="#9c8870" stroke-width="1.3"/>
                    <circle class="ethy-pupil-left"  cx="33" cy="38" r="1.5" fill="#9c8870"/>
                    <circle class="ethy-pupil-right" cx="47" cy="38" r="1.5" fill="#9c8870"/>
                </g>
                <!-- Boca — cada expresión tiene su propio path, solo uno visible -->
                <g class="ethy-part-mouth">
                    <path class="ethy-mouth-neutral"   d="M35 44 Q40 46 45 44"            stroke="#9c8870" stroke-width="1.2" stroke-linecap="round" fill="none"/>
                    <path class="ethy-mouth-happy"     d="M33 43 Q40 50 47 43"            stroke="#9c8870" stroke-width="1.4" stroke-linecap="round" fill="none" opacity="0"/>
                    <path class="ethy-mouth-sad"       d="M33 47 Q40 42 47 47"            stroke="#9c8870" stroke-width="1.4" stroke-linecap="round" fill="none" opacity="0"/>
                    <path class="ethy-mouth-excited"   d="M32 43 Q40 52 48 43"            stroke="#9c8870" stroke-width="1.5" stroke-linecap="round" fill="none" opacity="0"/>
                    <path class="ethy-mouth-surprised" d="M37 43 Q40 49 43 43 Q40 51 37 43" stroke="#9c8870" stroke-width="1.2" stroke-linecap="round" fill="none" opacity="0"/>
                    <path class="ethy-mouth-thoughtful" d="M35 44 Q37 43 40 44 Q43 45 45 44" stroke="#9c8870" stroke-width="1.2" stroke-linecap="round" fill="none" opacity="0"/>
                    <path class="ethy-mouth-wink"      d="M34 43 Q40 49 46 44"            stroke="#9c8870" stroke-width="1.3" stroke-linecap="round" fill="none" opacity="0"/>
                    <path class="ethy-mouth-love"      d="M33 42 Q36 50 40 51 Q44 50 47 42" stroke="#9c8870" stroke-width="1.4" stroke-linecap="round" fill="none" opacity="0"/>
                    <!-- Lengua del amor — solo visible en love -->
                    <ellipse class="ethy-mouth-love-tongue" cx="40" cy="51" rx="3" ry="2" fill="#c9a86c" opacity="0"/>
                </g>
                <!-- Mejillas — solo visibles en happy/love/excited -->
                <g class="ethy-part-cheeks" opacity="0">
                    <ellipse cx="24" cy="43" rx="4" ry="2.5" fill="#d4899a" opacity="0.45"/>
                    <ellipse cx="56" cy="43" rx="4" ry="2.5" fill="#d4899a" opacity="0.45"/>
                </g>
            </svg>
        `;

        // Crear burbuja de diálogo
        _bubble = document.createElement('div');
        _bubble.className = 'ethy-speech-bubble';
        _bubble.innerHTML = `
            <div class="ethy-title">Ethy</div>
            <div class="ethy-content"></div>
            <div class="ethy-actions"></div>
            <div class="ethy-steps"></div>
        `;

        // Botón de minimizar (✕ pequeño sobre la cabeza de Ethy)
        const _minimizeBtn = document.createElement('button');
        _minimizeBtn.className = 'ethy-minimize-btn';
        _minimizeBtn.title = 'Minimizar / expandir';
        _minimizeBtn.innerHTML = '−';
        _minimizeBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            toggleMinimize();
        });

        _floatWrapper.appendChild(_body);
        _container.appendChild(_bubble);
        _container.appendChild(_floatWrapper);
        _container.appendChild(_minimizeBtn);
        document.body.appendChild(_container);

        // Evento click en Ethy
        _body.addEventListener('click', _onEthyClick);

        // Arrastre
        _setupDrag();

        // Restaurar posición y estado guardados
        _loadPosition();
        if (localStorage.getItem(MINIMIZED_KEY) === '1') {
            _isMinimized = true;
            _container.classList.add('ethy-minimized');
            _minimizeBtn.innerHTML = '+';
        }
        
        console.log('[Ethy] Elementos creados correctamente');
    }

    let _bubbleJustOpened = false;

    function _setupEventListeners() {
        // Cerrar burbuja y panel de tutoriales al hacer clic fuera
        document.addEventListener('click', (e) => {
            if (_bubbleJustOpened) return; // ignorar el click que abrió la burbuja
            if (!_container.contains(e.target)) {
                if (_bubble.classList.contains('visible')) hideBubble();
                if (_tutorialPanelVisible) endTutorial();
            }
        });

        // Detectar cambios de sección
        window.addEventListener('hashchange', _onSectionChange);
        
        // Escuchar eventos personalizados de la app
        window.addEventListener('etheria:section-changed', (e) => {
            const section = e.detail?.section;
            const mode = e.detail?.mode;
            if (section) {
                onEnterSection(section, mode);
            }
        });

        // ── Actividad del usuario → resetear sleep timer ─────────────────
        ['mousemove', 'keydown', 'touchstart', 'click'].forEach(ev => {
            document.addEventListener(ev, _onUserActivity, { passive: true });
        });

        // ── Reacción al clima del VN ──────────────────────────────────────
        window.addEventListener('etheria:weather-changed', (e) => {
            _onWeatherChange(e.detail?.weather);
        });

        // ── Reacción a mensaje enviado ────────────────────────────────────
        window.addEventListener('etheria:message-sent', (e) => {
            const len = (e.detail?.text || '').length;
            if (len > 200 && !_isSleeping && !_bubble.classList.contains('visible')) {
                const msgs = [
                    '¡Vaya, menuda novela! 📖✨',
                    '¡Eso sí que es un mensaje largo! 💬',
                    '¡Con todo ese texto podrías escribir un capítulo entero! 🖊️'
                ];
                setTimeout(() => {
                    say(msgs[Math.floor(Math.random() * msgs.length)], {
                        expression: 'excited', duration: 4000
                    });
                }, 800);
            }
        });

        // ── EventBus — reacciones a eventos del sistema ───────────────────
        // Cooldown: Ethy no reacciona más de una vez cada 3 segundos
        // para evitar spam de expresiones o frases en escenas rápidas.
        if (typeof eventBus === 'undefined') return;

        let _lastEventReaction = 0;
        function _canReact() {
            const now = Date.now();
            if (now - _lastEventReaction < 3000) return false;
            _lastEventReaction = now;
            return true;
        }

        // El jugador ve una elección → Ethy reflexiona
        eventBus.on('scene:choice-shown', () => {
            if (!_canReact()) return;
            setExpression('thoughtful');
            // Frase ocasional — solo 30% de las veces para no saturar
            if (Math.random() < 0.3) {
                const msgs = ['Hmm...', 'Interesante...', '¿Qué harás?', 'Elige con cuidado.'];
                say(msgs[Math.floor(Math.random() * msgs.length)], {
                    expression: 'thoughtful', duration: 2500
                });
            }
        });

        // Escena terminada → satisfacción
        eventBus.on('scene:ended', () => {
            if (!_canReact()) return;
            const msgs = [
                'La historia continúa...',
                'Cada final es un nuevo comienzo.',
                'Bien hecho.'
            ];
            say(msgs[Math.floor(Math.random() * msgs.length)], {
                expression: 'happy', duration: 3000
            });
        });

        // Error en escena → preocupación
        eventBus.on('scene:error', () => {
            if (!_canReact()) return;
            const msgs = [
                'Algo no salió como esperaba...',
                'Eso fue extraño.',
                'A veces el destino también duda.'
            ];
            say(msgs[Math.floor(Math.random() * msgs.length)], {
                expression: 'sad', duration: 3500
            });
        });

        // Guardado → confirmación tranquila
        eventBus.on('ui:show-autosave', (data) => {
            if (!_canReact()) return;
            if (data?.state === 'error') {
                say('No pude guardar tu historia...', { expression: 'sad', duration: 3000 });
                return;
            }
            setExpression('happy');
        });

        // Sincronización completada → frase breve
        eventBus.on('sync:status-changed', (data) => {
            if (data?.target !== 'button') return;
            if (data?.status !== 'synced') return;
            if (!_canReact()) return;
            say('Tu historia está a salvo.', { expression: 'happy', duration: 3000 });
        });

        // Navegación → expresión neutra curiosa
        eventBus.on('ui:navigate', () => {
            if (!_canReact()) return;
            setExpression('wink');
        });
    }

    // ── Sistema de expresiones idle dinámicas ────────────────────────────────
    //
    // Cada vez que Ethy entra en una sección cambia a una expresión
    // temática aleatoria entre un conjunto de candidatas para esa sección.
    // Además, cada N segundos hace un "micro-cambio" idle: parpadea con una
    // expresión distinta unos instantes y vuelve a la expresión base.

    // Expresiones candidatas por sección (varias para que el azar tenga sentido)
    const SECTION_EXPRESSIONS = {
        mainMenu : ['excited', 'happy',      'love',        'wink'       ],
        gallery  : ['thoughtful', 'happy',   'wink',        'surprised'  ],
        topics   : ['happy',      'excited', 'thoughtful',  'wink'       ],
        vn       : ['love',       'excited', 'thoughtful',  'wink'       ],
        options  : ['thoughtful', 'neutral', 'wink',        'happy'      ],
        saveHub  : ['thoughtful', 'happy',   'wink',        'neutral'    ],
        default  : ['neutral',    'happy',   'thoughtful',  'wink', 'surprised']
    };

    // Expresiones breves (idle flicker) — más emocionales para que se note
    const IDLE_FLICKER = ['surprised', 'love', 'excited', 'wink', 'thoughtful'];

    let _idleBaseExpression = 'neutral'; // expresión base de la sección actual
    let _idleInterval  = null;

    function _pickRandom(arr) {
        return arr[Math.floor(Math.random() * arr.length)];
    }

    /**
     * Cambia a la expresión base de la sección con una pequeña animación
     * de "sacudida" para que el cambio se note.
     */
    function _setSectionExpression(section) {
        const pool = SECTION_EXPRESSIONS[section] || SECTION_EXPRESSIONS.default;
        let candidates = pool.filter(e => e !== _currentExpression);
        if (candidates.length === 0) candidates = pool;
        const chosen = _pickRandom(candidates);
        _idleBaseExpression = chosen;
        // No animar ni cambiar expresión si está minimizado
        if (_isMinimized) return;
        if (_body) {
            _body.classList.add('ethy-hello');
            setTimeout(() => _body.classList.remove('ethy-hello'), 500);
        }
        setExpression(chosen);
    }

    /**
     * Tick idle: cada 8-14 s cambia momentáneamente a una expresión aleatoria
     * y a los 1.5 s vuelve a la expresión base.
     */
    function _idleTick() {
        // No interrumpir si minimizado, burbuja activa o tutorial en curso
        if (_isMinimized) return;
        if (_bubble && _bubble.classList.contains('visible')) return;
        if (_tutorialPanelVisible) return;

        const flicker = _pickRandom(IDLE_FLICKER.filter(e => e !== _idleBaseExpression));
        setExpression(flicker);

        setTimeout(() => {
            // Solo restaurar si no hay burbuja abierta ahora
            if (!_bubble || !_bubble.classList.contains('visible')) {
                setExpression(_idleBaseExpression);
            }
        }, 1500);
    }

    function _startIdleSystem() {
        if (_idleInterval) clearInterval(_idleInterval);
        // Intervalo aleatorio entre 8 y 14 segundos para cambio de expresión
        const randomInterval = () => Math.floor(Math.random() * 6000) + 8000;

        function scheduleNext() {
            _idleInterval = setTimeout(() => {
                _idleTick();
                scheduleNext();
            }, randomInterval());
        }
        scheduleNext();

        // ── Parpadeo automático ────────────────────────────────────────────
        // Parpadea cada 3-7 segundos de forma aleatoria y natural
        function scheduleBlink() {
            const delay = Math.floor(Math.random() * 4000) + 3000;
            setTimeout(() => {
                _doBlink();
                scheduleBlink();
            }, delay);
        }
        scheduleBlink();
    }

    function _doBlink() {
        if (!_body || _isMinimized) return;
        // Doble parpadeo ocasional (30% de las veces)
        _body.classList.add('ethy-blinking');
        setTimeout(() => {
            _body.classList.remove('ethy-blinking');
            if (Math.random() < 0.3) {
                setTimeout(() => {
                    _body.classList.add('ethy-blinking');
                    setTimeout(() => _body.classList.remove('ethy-blinking'), 180);
                }, 220);
            }
        }, 180);
    }

    // ── Sistema de arrastre ───────────────────────────────────────────────────

    function _setupDrag() {
        let startX, startY, startRight, startBottom;

        function onStart(ex, ey) {
            _isDragging = true;
            _wasDragging = false;
            _dragStartX = ex;
            _dragStartY = ey;
            startX = ex;
            startY = ey;
            const style = window.getComputedStyle(_container);
            // Trabajamos con right/bottom para no romper el layout habitual
            startRight  = parseInt(style.right)  || 20;
            startBottom = parseInt(style.bottom) || 20;
            _container.style.transition = 'none';
            _container.classList.add('ethy-dragging');
        }

        function onMove(ex, ey) {
            if (!_isDragging) return;
            // Only mark as a real drag after 5px of movement
            if (!_wasDragging) {
                const dist = Math.hypot(ex - _dragStartX, ey - _dragStartY);
                if (dist < 5) return;
                _wasDragging = true;
            }
            const dx = startX - ex;
            const dy = startY - ey;
            const newRight  = Math.max(0, Math.min(window.innerWidth  - 80, startRight  + dx));
            const newBottom = Math.max(0, Math.min(window.innerHeight - 80, startBottom + dy));
            _container.style.right  = newRight  + 'px';
            _container.style.bottom = newBottom + 'px';
            _container.style.left   = 'auto';
            _container.style.top    = 'auto';
        }

        function onEnd() {
            if (!_isDragging) return;
            _isDragging = false;
            _container.style.transition = '';
            _container.classList.remove('ethy-dragging');
            _savePosition();
        }

        // Mouse
        _body.addEventListener('mousedown', (e) => { e.preventDefault(); onStart(e.clientX, e.clientY); });
        document.addEventListener('mousemove', (e) => onMove(e.clientX, e.clientY));
        document.addEventListener('mouseup', onEnd);

        // Touch
        _body.addEventListener('touchstart', (e) => {
            const t = e.touches[0];
            onStart(t.clientX, t.clientY);
        }, { passive: true });
        document.addEventListener('touchmove', (e) => {
            if (!_isDragging) return;
            e.preventDefault();
            const t = e.touches[0];
            onMove(t.clientX, t.clientY);
        }, { passive: false });
        document.addEventListener('touchend', onEnd);
    }

    function _savePosition() {
        try {
            localStorage.setItem(POSITION_KEY, JSON.stringify({
                right:  _container.style.right,
                bottom: _container.style.bottom
            }));
        } catch (error) { logger?.warn('ethy', 'position save failed:', error?.message || error); }
    }

    function _loadPosition() {
        try {
            const saved = JSON.parse(localStorage.getItem(POSITION_KEY) || 'null');
            if (saved && saved.right && saved.bottom) {
                const maxRight = Math.max(12, window.innerWidth - 100);
                const maxBottom = Math.max(12, window.innerHeight - 100);
                const parsedRight = Number.parseFloat(saved.right);
                const parsedBottom = Number.parseFloat(saved.bottom);
                const safeRight = Number.isFinite(parsedRight)
                    ? `${Math.min(Math.max(parsedRight, 12), maxRight)}px`
                    : saved.right;
                const safeBottom = Number.isFinite(parsedBottom)
                    ? `${Math.min(Math.max(parsedBottom, 12), maxBottom)}px`
                    : saved.bottom;

                _container.style.right  = safeRight;
                _container.style.bottom = safeBottom;
                _container.style.left   = 'auto';
                _container.style.top    = 'auto';
            }
        } catch (error) { logger?.warn('ethy', 'position load failed:', error?.message || error); }
    }

    // ── Minimizar ─────────────────────────────────────────────────────────────

    function toggleMinimize() {
        _isMinimized = !_isMinimized;
        _container.classList.toggle('ethy-minimized', _isMinimized);
        const btn = _container.querySelector('.ethy-minimize-btn');
        if (btn) btn.innerHTML = _isMinimized ? '+' : '−';
        if (_isMinimized) {
            hideBubble();
            // Cerrar también el panel de tutoriales si estaba abierto
            if (_tutorialPanel) _tutorialPanel.classList.remove('visible');
            _tutorialPanelVisible = false;
            removeHighlight();
            // Si estaba durmiendo, despertar para evitar ZZZ invisible
            if (_isSleeping) _wakeUp(true);
        }
        try { localStorage.setItem(MINIMIZED_KEY, _isMinimized ? '1' : '0'); } catch (error) { logger?.warn('ethy', 'minimize state save failed:', error?.message || error); }
    }

    // ── Sistema de duermevela ─────────────────────────────────────────────────

    let _activityThrottleTimer = null;
    function _onUserActivity() {
        if (_isSleeping) {
            _wakeUp();
            _resetSleepTimer();
            return;
        }
        // Throttle to once every 10 seconds for mousemove-heavy paths
        if (_activityThrottleTimer) return;
        _activityThrottleTimer = setTimeout(() => {
            _activityThrottleTimer = null;
            _resetSleepTimer();
        }, 10000);
    }

    function _resetSleepTimer() {
        if (_sleepTimeout) clearTimeout(_sleepTimeout);
        _sleepTimeout = setTimeout(_goToSleep, SLEEP_DELAY);
    }

    function _goToSleep() {
        if (_isMinimized || _bubble.classList.contains('visible') || _isSleeping) return;
        _isSleeping = true;
        setExpression('neutral');
        _container.classList.add('ethy-sleeping');
        // Mostrar ZZZ flotantes en el body
        _body.classList.add('ethy-zzz');
    }

    function _wakeUp(silent = false) {
        if (!_isSleeping) return;
        _isSleeping = false;
        _container.classList.remove('ethy-sleeping');
        _body.classList.remove('ethy-zzz');
        if (!silent) {
            _body.classList.add('ethy-hello');
            setTimeout(() => _body.classList.remove('ethy-hello'), 600);
            setExpression(_idleBaseExpression);
            say('¡Oh! ¡Ya estás de vuelta! 😊', { expression: 'surprised', duration: 3000 });
        }
        _resetSleepTimer();
    }

    // ── Easter eggs — clics múltiples ─────────────────────────────────────────

    const EASTER_EGGS = [
        { text: '¡Ay! ¡Para, para! 😣', expression: 'sad' },
        { text: '¡Oye, que me haces cosquillas! 😅', expression: 'surprised' },
        { text: 'Está bien, ya veo que tienes energía... 🙄', expression: 'thoughtful' },
        { text: '¡Me rindo! ¡Tú ganas! 🏳️', expression: 'sad' },
        { text: '...¿Enserio? ¿No tienes nada mejor que hacer? 👀', expression: 'wink' },
        { text: 'Muy bien. Seguiré aquí, ignorándote con dignidad. 😤', expression: 'neutral' },
    ];
    let _easterEggIndex = 0;

    function _handleMultiClick() {
        _clickCount++;
        if (_clickTimer) clearTimeout(_clickTimer);

        if (_clickCount >= 3) {
            const egg = EASTER_EGGS[_easterEggIndex % EASTER_EGGS.length];
            _easterEggIndex++;
            say(egg.text, { expression: egg.expression, duration: 4000 });
            _clickCount = 0;
            return true; // egg fired — caller should skip other actions
        } else {
            _clickTimer = setTimeout(() => { _clickCount = 0; }, 600);
            return false;
        }
    }

    // ── Reacciones al clima ───────────────────────────────────────────────────

    const WEATHER_REACTIONS = {
        rain: [
            { text: '¡Qué lluvia más bonita... aunque yo no me mojo! ☔', expression: 'happy' },
            { text: 'Me encanta la lluvia. Tan melancólica... 🌧️', expression: 'thoughtful' },
        ],
        fog:  [
            { text: 'Oooh, qué misterioso con tanta niebla... 👀', expression: 'surprised' },
            { text: 'Con esta niebla casi no se me ve. ¡Perfecto para esconderme! 🌫️', expression: 'wink' },
        ],
        none: [
            { text: '¡Qué día más despejado! ☀️', expression: 'happy' },
            { text: 'Un clima tranquilo para una historia tranquila. 🌤️', expression: 'wink' },
        ],
    };
    let _lastWeather = null;

    function _onWeatherChange(weather) {
        if (!weather || weather === _lastWeather) return;
        _lastWeather = weather;
        if (_isMinimized || _isSleeping || _bubble.classList.contains('visible')) return;
        const reactions = WEATHER_REACTIONS[weather] || WEATHER_REACTIONS.none;
        const r = reactions[Math.floor(Math.random() * reactions.length)];
        setTimeout(() => {
            say(r.text, { expression: r.expression, duration: 5000 });
        }, 600);
    }

    // ── Funciones de expresión ───────────────────────────────────────────────

    function setExpression(expression) {
        if (!EXPRESSIONS[expression]) {
            console.warn(`[Ethy] Expresión "${expression}" no existe`);
            return;
        }
        if (!_body) return;

        // ── Quitar clases de expresión anteriores ──────────────────────────
        Object.values(EXPRESSIONS).forEach(exp => {
            _body.classList.remove(exp.class);
        });
        _body.classList.add(EXPRESSIONS[expression].class);
        _currentExpression = expression;

        // ── Actualizar cara inline ─────────────────────────────────────────
        _updateFace(expression);
    }

    // Mapeo de expresión → estado de cada parte de la cara
    const FACE_STATES = {
        neutral:    { mouth: 'neutral',    eyeScale: 1,    pupilY: 0,  cheeks: false, blink: false, squint: false, winkLeft: false },
        happy:      { mouth: 'happy',      eyeScale: 0.85, pupilY: 1,  cheeks: true,  blink: false, squint: true,  winkLeft: false },
        excited:    { mouth: 'excited',    eyeScale: 1.1,  pupilY: -1, cheeks: true,  blink: false, squint: false, winkLeft: false },
        sad:        { mouth: 'sad',        eyeScale: 0.8,  pupilY: 2,  cheeks: false, blink: false, squint: false, winkLeft: false },
        surprised:  { mouth: 'surprised',  eyeScale: 1.3,  pupilY: -2, cheeks: false, blink: false, squint: false, winkLeft: false },
        thoughtful: { mouth: 'thoughtful', eyeScale: 0.9,  pupilY: -1, cheeks: false, blink: false, squint: false, winkLeft: false },
        wink:       { mouth: 'wink',       eyeScale: 1,    pupilY: 1,  cheeks: false, blink: false, squint: false, winkLeft: true  },
        love:       { mouth: 'love',       eyeScale: 0.75, pupilY: 2,  cheeks: true,  blink: false, squint: true,  winkLeft: false },
    };

    function _updateFace(expression) {
        const state = FACE_STATES[expression] || FACE_STATES.neutral;
        const svg = _body.querySelector('.ethy-svg');
        if (!svg) return;

        // ── Ocultar todas las bocas, mostrar solo la activa ────────────────
        svg.querySelectorAll('[class^="ethy-mouth-"]').forEach(el => {
            el.setAttribute('opacity', '0');
            el.style.transition = 'opacity 0.25s ease';
        });
        const activeMouth = svg.querySelector(`.ethy-mouth-${expression}`);
        if (activeMouth) {
            activeMouth.setAttribute('opacity', '1');
        }
        // Lengua en love
        const tongue = svg.querySelector('.ethy-mouth-love-tongue');
        if (tongue) tongue.setAttribute('opacity', expression === 'love' ? '1' : '0');

        // ── Mejillas ───────────────────────────────────────────────────────
        const cheeks = svg.querySelector('.ethy-part-cheeks');
        if (cheeks) {
            cheeks.setAttribute('opacity', state.cheeks ? '1' : '0');
            cheeks.style.transition = 'opacity 0.3s ease';
        }

        // ── Ojos: escala y squint ──────────────────────────────────────────
        const eyeLeft  = svg.querySelector('.ethy-eye-left');
        const eyeRight = svg.querySelector('.ethy-eye-right');
        const pupilLeft  = svg.querySelector('.ethy-pupil-left');
        const pupilRight = svg.querySelector('.ethy-pupil-right');

        if (eyeLeft && eyeRight) {
            const baseR = 4;
            const rx = (baseR * state.eyeScale).toFixed(2);
            const rySquint = state.squint ? (baseR * 0.4).toFixed(2) : rx;

            // Eye circles → use rx/ry for ellipse-like squint via transform scaleY
            [eyeLeft, eyeRight].forEach(el => {
                el.style.transition = 'transform 0.25s cubic-bezier(0.34,1.56,0.64,1)';
                el.style.transformOrigin = 'center';
                const scaleX = state.eyeScale;
                const scaleY = state.squint ? 0.45 : state.eyeScale;
                el.style.transform = `scale(${scaleX}, ${scaleY})`;
            });

            // Wink: left eye closed
            if (eyeLeft && state.winkLeft) {
                eyeLeft.style.transform = 'scale(1, 0.1)';
            }
        }

        // ── Pupila: desplazamiento vertical según estado ───────────────────
        if (pupilLeft && pupilRight) {
            [pupilLeft, pupilRight].forEach(el => {
                el.style.transition = 'transform 0.2s ease';
                el.style.transform = `translateY(${state.pupilY}px)`;
            });
        }

        // ── Antena: vibra en excited ───────────────────────────────────────
        const antenna = svg.querySelector('.ethy-part-antenna');
        if (antenna) {
            antenna.style.transition = 'transform 0.25s ease';
            antenna.style.transformOrigin = '55px 22px';
            if (expression === 'excited') {
                antenna.classList.add('ethy-antenna-excited');
            } else {
                antenna.classList.remove('ethy-antenna-excited');
                antenna.style.transform = expression === 'happy'   ? 'rotate(8deg)'  :
                                           expression === 'sad'     ? 'rotate(-15deg)' :
                                           expression === 'surprised' ? 'rotate(-8deg) translateY(-3px)' :
                                           '';
            }
        }
    }

    // ── Funciones de diálogo ─────────────────────────────────────────────────

    // Referencia al texto y botones del mensaje actual (para poder hacer skip)
    let _currentSayText = '';
    let _currentSayButtons = [];
    let _currentSayDuration = 0;
    let _autocloseTimeout = null;

    function _renderButtons(actions, buttons) {
        actions.innerHTML = '';
        buttons.forEach(btn => {
            const button = document.createElement('button');
            button.className = 'ethy-btn' + (btn.primary ? ' primary' : '');
            button.textContent = btn.text;
            button.onclick = (e) => {
                e.stopPropagation(); // evitar que el click llegue al document y cierre la burbuja
                if (btn.action) btn.action();
                if (btn.close !== false) hideBubble();
            };
            actions.appendChild(button);
        });
    }

    function _completeTyping() {
        if (!_isTyping) return;
        if (_typingTimeout) { clearTimeout(_typingTimeout); _typingTimeout = null; }
        _isTyping = false;
        const content = _bubble.querySelector('.ethy-content');
        const actions = _bubble.querySelector('.ethy-actions');
        content.textContent = _currentSayText;
        _renderButtons(actions, _currentSayButtons);
        if (_currentSayDuration > 0) {
            if (_autocloseTimeout) clearTimeout(_autocloseTimeout);
            _autocloseTimeout = setTimeout(hideBubble, _currentSayDuration);
        }
    }

    function say(text, options = {}) {
        const { expression = 'neutral', duration = 0, buttons = [] } = options;

        // Cancelar auto-cierre anterior
        if (_autocloseTimeout) { clearTimeout(_autocloseTimeout); _autocloseTimeout = null; }
        // Cancelar tipeo anterior
        if (_typingTimeout) { clearTimeout(_typingTimeout); _typingTimeout = null; }

        setExpression(expression);

        // Guardar para skip
        _currentSayText = text;
        _currentSayButtons = buttons;
        _currentSayDuration = duration;

        const content = _bubble.querySelector('.ethy-content');
        const actions = _bubble.querySelector('.ethy-actions');

        actions.innerHTML = '';

        // Mostrar burbuja — marcar flag para evitar cierre inmediato
        _bubbleJustOpened = true;
        _bubble.classList.add('visible');
        setTimeout(() => { _bubbleJustOpened = false; }, 50);

        // Efecto de escritura
        _isTyping = true;
        content.innerHTML = '<span class="ethy-typing"><span></span><span></span><span></span></span>';

        let charIndex = 0;
        const typeChar = () => {
            if (!_isTyping) return; // cancelado externamente
            if (charIndex < text.length) {
                content.textContent = text.substring(0, charIndex + 1);
                const cursor = document.createElement('span');
                cursor.className = 'ethy-cursor';
                cursor.textContent = '|';
                content.appendChild(cursor);
                charIndex++;
                _typingTimeout = setTimeout(typeChar, CONFIG.TYPING_SPEED);
            } else {
                _typingTimeout = null;
                _isTyping = false;
                content.textContent = text;
                _renderButtons(actions, buttons);
                if (duration > 0) {
                    _autocloseTimeout = setTimeout(hideBubble, duration);
                }
            }
        };

        typeChar();
    }

    function hideBubble() {
        _bubble.classList.remove('visible');
        if (_typingTimeout) { clearTimeout(_typingTimeout); _typingTimeout = null; }
        if (typeof _autocloseTimeout !== 'undefined' && _autocloseTimeout) {
            clearTimeout(_autocloseTimeout); _autocloseTimeout = null;
        }
        _isTyping = false;
    }

    // ── Sistema de tutoriales — panel independiente ──────────────────────────
    //
    // Los tutoriales viven en su propio panel DOM, completamente separado
    // de say() / _bubble. Sin animación de tipeo, sin timers, sin conflictos
    // de estado con los mensajes normales de Ethy.

    function _createTutorialPanel() {
        if (_tutorialPanel) return;
        _tutorialPanel = document.createElement('div');
        _tutorialPanel.className = 'ethy-tutorial-panel';
        _tutorialPanel.setAttribute('aria-live', 'polite');
        _tutorialPanel.innerHTML = `
            <div class="ethy-tp-header">
                <span class="ethy-tp-icon">✦</span>
                <span class="ethy-tp-title"></span>
                <button class="ethy-tp-close" title="Cerrar tutorial" aria-label="Cerrar">✕</button>
            </div>
            <div class="ethy-tp-content"></div>
            <div class="ethy-tp-footer">
                <div class="ethy-tp-dots"></div>
                <div class="ethy-tp-nav">
                    <button class="ethy-tp-btn ethy-tp-prev" aria-label="Paso anterior">←</button>
                    <button class="ethy-tp-btn ethy-tp-next ethy-tp-primary" aria-label="Siguiente paso">Siguiente →</button>
                </div>
            </div>
            <button class="ethy-tp-skip">Saltar tutorial</button>
        `;
        _container.appendChild(_tutorialPanel);

        _tutorialPanel.querySelector('.ethy-tp-close').addEventListener('click', endTutorial);
        _tutorialPanel.querySelector('.ethy-tp-skip').addEventListener('click', endTutorial);
        _tutorialPanel.querySelector('.ethy-tp-prev').addEventListener('click', () => {
            if (_tutorialStep > 0) { _tutorialStep--; _renderTutorialStep(); }
        });
        _tutorialPanel.querySelector('.ethy-tp-next').addEventListener('click', () => {
            if (_currentTutorial && _tutorialStep < _currentTutorial.steps.length - 1) {
                _tutorialStep++;
                _renderTutorialStep();
            } else {
                endTutorial();
            }
        });
    }

    function _renderTutorialStep() {
        if (!_currentTutorial || !_tutorialPanel) return;
        const step = _currentTutorial.steps[_tutorialStep];
        const total = _currentTutorial.steps.length;

        // Título
        _tutorialPanel.querySelector('.ethy-tp-title').textContent = _currentTutorial.title;

        // Contenido — sin tipeo, texto completo inmediato
        _tutorialPanel.querySelector('.ethy-tp-content').textContent = step.text;

        // Dots navegables
        const dotsEl = _tutorialPanel.querySelector('.ethy-tp-dots');
        dotsEl.innerHTML = '';
        for (let i = 0; i < total; i++) {
            const dot = document.createElement('button');
            dot.className = 'ethy-tp-dot' +
                (i === _tutorialStep ? ' active' : '') +
                (i < _tutorialStep ? ' done' : '');
            dot.setAttribute('aria-label', 'Ir al paso ' + (i + 1));
            const stepI = i;
            dot.addEventListener('click', () => { _tutorialStep = stepI; _renderTutorialStep(); });
            dotsEl.appendChild(dot);
        }

        // Botones de navegación
        const prev = _tutorialPanel.querySelector('.ethy-tp-prev');
        const next = _tutorialPanel.querySelector('.ethy-tp-next');
        prev.style.visibility = _tutorialStep > 0 ? 'visible' : 'hidden';

        if (_tutorialStep === total - 1) {
            next.textContent = '¡Entendido! ✓';
            next.classList.add('ethy-tp-finish');
        } else {
            next.textContent = 'Siguiente →';
            next.classList.remove('ethy-tp-finish');
        }

        // Expresión de Ethy para este paso
        if (!_isMinimized && step.expression) {
            setExpression(step.expression);
            _body.classList.add('ethy-hello');
            setTimeout(() => _body.classList.remove('ethy-hello'), 400);
        }

        // Highlight de elemento si lo hay
        if (step.action) step.action();
        else removeHighlight();
    }

    function startTutorial(tutorialKey) {
        const tutorial = TUTORIALS[tutorialKey];
        if (!tutorial) {
            console.warn(`[Ethy] Tutorial "${tutorialKey}" no existe`);
            return;
        }
        if (_seenTutorials.has(tutorialKey) && !tutorial.force) return;

        _currentTutorial = tutorial;
        _tutorialStep = 0;
        _seenTutorials.add(tutorialKey);
        _saveSeenTutorials();

        // Asegurar panel creado
        _createTutorialPanel();

        // Ocultar burbuja normal si estaba abierta
        hideBubble();

        // Mostrar panel
        _tutorialPanel.classList.add('visible');
        _tutorialPanelVisible = true;

        _renderTutorialStep();
    }

    function endTutorial() {
        if (!_currentTutorial) return;
        _currentTutorial = null;
        _tutorialStep = 0;

        // Ocultar panel
        if (_tutorialPanel) {
            _tutorialPanel.classList.remove('visible');
        }
        _tutorialPanelVisible = false;
        removeHighlight();

        // Mensaje breve de despedida (solo si no está minimizado)
        if (!_isMinimized) {
            setTimeout(() => {
                say('¡Estoy aquí si me necesitas! Solo haz clic en mí. 😊', {
                    expression: 'wink',
                    duration: 3000
                });
            }, 200);
        }
    }

    // Compatibilidad: _showTutorialStep y _updateStepIndicators
    // ya no se usan externamente pero los dejamos vacíos por si
    // algún código externo los llama.
    function _showTutorialStep() { _renderTutorialStep(); }
    function _updateStepIndicators() {}

    // ── Funciones de sección ─────────────────────────────────────────────────

    function onEnterSection(section, mode) {
        // Pequeña demora para que la UI se actualice
        setTimeout(() => {
            // Ajustar posición de Ethy según la sección
            if (_container) {
                if (section === 'mainMenu') {
                    _container.classList.add('near-profile');
                } else {
                    _container.classList.remove('near-profile');
                }
            }
            
            // Expresión aleatoria al entrar en cada sección (siempre, no solo tutoriales)
            _setSectionExpression(section);

            switch (section) {
                case 'mainMenu':
                    if (!_seenTutorials.has('mainMenu')) {
                        startTutorial('mainMenu');
                    }
                    break;
                case 'gallery':
                    if (!_seenTutorials.has('gallery')) {
                        startTutorial('gallery');
                    }
                    break;
                case 'topics':
                    if (!_seenTutorials.has('createTopic')) {
                        startTutorial('createTopic');
                    }
                    break;
                case 'vn':
                    const isRPG = mode === 'rpg' || (typeof currentTopicMode !== 'undefined' && currentTopicMode === 'rpg');
                    const tutorialKey = isRPG ? 'vnRPG' : 'vnClassic';
                    if (!_seenTutorials.has(tutorialKey)) {
                        startTutorial(tutorialKey);
                    }
                    break;
                case 'options':
                    if (!_seenTutorials.has('options')) {
                        startTutorial('options');
                    }
                    break;
                case 'saveHub':
                    if (!_seenTutorials.has('saveHub')) {
                        startTutorial('saveHub');
                    }
                    break;
            }
        }, 500);
    }

    function _onSectionChange() {
        // Detectar sección actual por URL o estado
        const hash = window.location.hash;
        // Implementar lógica según la estructura de la app
    }

    function _onEthyClick() {
        _onUserActivity(); // resetear sleep timer en cualquier click

        // If the mouse moved enough to be a real drag, ignore this click
        if (_wasDragging) { _wasDragging = false; return; }

        if (_isMinimized) {
            toggleMinimize();
            return;
        }

        if (_isSleeping) {
            _wakeUp();
            return;
        }

        if (_tutorialPanelVisible) {
            endTutorial();
            return;
        }
        if (_isTyping) {
            _completeTyping();
        } else if (_bubble.classList.contains('visible')) {
            hideBubble();
        } else {
            // Easter egg takes priority: if it fires, skip the help menu
            if (_handleMultiClick()) return;
            showHelpMenu();
        }
    }

    function showHelpMenu() {
        const currentSection = _detectCurrentSection();
        
        say('¿En qué puedo ayudarte? 🎭', {
            expression: 'happy',
            buttons: [
                { text: 'Ver tutorial', primary: true, close: false, action: () => {
                    if (currentSection && TUTORIALS[currentSection]) {
                        // Fix: usar _seenTutorials.delete() en vez de mutar el objeto tutorial
                        _seenTutorials.delete(currentSection);
                        startTutorial(currentSection);
                    } else {
                        say('No hay tutorial disponible para esta sección. 😅', { expression: 'sad', duration: 3000 });
                    }
                }},
                { text: 'Consejo rápido', close: false, action: () => showRandomTip() },
                { text: 'Cerrar' }
            ]
        });
    }

    function _detectCurrentSection() {
        // Fix: comprobar tanto .hidden como display:none y la clase 'active'
        function _isVisible(id) {
            const el = document.getElementById(id);
            if (!el) return false;
            if (el.classList.contains('hidden')) return false;
            if (el.style.display === 'none') return false;
            return true;
        }
        function _isActive(id) {
            const el = document.getElementById(id);
            if (!el) return false;
            return el.classList.contains('active') || _isVisible(id);
        }
        if (_isVisible('mainMenu') || _isActive('mainMenu')) return 'mainMenu';
        if (_isActive('gallerySection')) return 'gallery';
        if (_isActive('topicsSection')) return 'topics';
        if (_isActive('vnSection')) return 'vn';
        if (_isActive('optionsSection')) return 'options';
        if (_isActive('saveHubSection')) return 'saveHub';
        return null;
    }

    // ── Consejos aleatorios ──────────────────────────────────────────────────

    const TIPS = [
        { text: 'Puedes usar **negrita** y *cursiva* al escribir tus mensajes. ¡Dale estilo a la narrativa!', expression: 'excited' },
        { text: 'Los emotes /happy, /sad, /angry, /love y más dan vida a tus personajes. ¡Pruébalos!', expression: 'happy' },
        { text: 'En modo RPG, el Oráculo del Destino resuelve las acciones difíciles con un D20 + tu stat. ¡El azar manda!', expression: 'surprised' },
        { text: 'Puedes compartir una historia con un código de 6 caracteres. Búscalo en el botón de exportar del menú. 🔑', expression: 'love' },
        { text: 'Las flechas ← → o los botones de navegación permiten saltar entre mensajes rápidamente.', expression: 'neutral' },
        { text: 'Pulsa ESPACIO o haz clic en el diálogo para completar la animación de texto al instante.', expression: 'wink' },
        { text: 'Toca tu perfil en la parte inferior del menú para cambiar tu nombre, avatar y datos personales.', expression: 'happy' },
        { text: 'El diario de sesión guarda tus notas y resúmenes de partida. ¡Úsalo para no perder el hilo!', expression: 'thoughtful' },
        { text: 'En el panel de respuesta puedes crear opciones de elección para que la historia se ramifique. 🌿', expression: 'excited' },
        { text: 'El historial guarda todos los mensajes de la historia. Puedes marcarlos como favoritos con la estrella. ⭐', expression: 'thoughtful' },
        { text: 'Para hacer una copia de seguridad, usa el pequeño botón de exportar junto a tu perfil en el menú.', expression: 'neutral' },
        { text: 'En la ficha de personaje puedes añadir descripción física, personalidad, trasfondo y notas libres.', expression: 'happy' },
        { text: 'Puedes cambiar el clima de una escena desde el panel de respuesta: lluvia, niebla o despejado. 🌧️', expression: 'thoughtful' },
        { text: 'El modo inmersivo oculta los controles para leer la historia sin distracciones. ¡Búscalo en Opciones!', expression: 'wink' }
    ];

    function showRandomTip() {
        const tip = TIPS[Math.floor(Math.random() * TIPS.length)];
        say(tip.text, {
            expression: tip.expression,
            duration: 6000
        });
    }

    // ── Funciones de utilidad ────────────────────────────────────────────────

    function show() {
        _container.style.opacity = '1';
        _container.style.transform = 'scale(1)';
        _isVisible = true;
        
        // Animación de entrada
        _body.classList.add('ethy-hello');
        setTimeout(() => _body.classList.remove('ethy-hello'), 600);
    }

    function hide() {
        _container.style.opacity = '0';
        _container.style.transform = 'scale(0)';
        _isVisible = false;
    }

    function highlightElement(selector) {
        const element = document.querySelector(selector);
        if (!element) return;

        // Crear overlay de enfoque
        let overlay = document.getElementById('ethyFocusOverlay');
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.id = 'ethyFocusOverlay';
            overlay.className = 'ethy-focus-overlay';
            document.body.appendChild(overlay);
        }

        // Crear highlight
        const rect = element.getBoundingClientRect();
        const highlight = document.createElement('div');
        highlight.className = 'ethy-highlight';
        highlight.style.cssText = `
            top: ${rect.top - 10}px;
            left: ${rect.left - 10}px;
            width: ${rect.width + 20}px;
            height: ${rect.height + 20}px;
        `;

        overlay.innerHTML = '';
        overlay.appendChild(highlight);
        overlay.classList.add('active');

        // Scroll al elemento
        element.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }

    function removeHighlight() {
        const overlay = document.getElementById('ethyFocusOverlay');
        if (overlay) {
            overlay.classList.remove('active');
            setTimeout(() => {
                if (overlay.parentNode) {
                    overlay.parentNode.removeChild(overlay);
                }
            }, 400);
        }
    }

    // ── Persistencia ─────────────────────────────────────────────────────────

    function _loadSeenTutorials() {
        try {
            const stored = localStorage.getItem(CONFIG.TUTORIAL_KEY);
            if (stored) {
                const parsed = JSON.parse(stored);
                _seenTutorials = new Set(parsed);
            }
        } catch (e) {
            console.warn('[Ethy] Error cargando tutoriales vistos:', e);
        }
    }

    function _saveSeenTutorials() {
        try {
            localStorage.setItem(CONFIG.TUTORIAL_KEY, JSON.stringify([..._seenTutorials]));
        } catch (e) {
            console.warn('[Ethy] Error guardando tutoriales vistos:', e);
        }
    }

    function resetTutorials() {
        _seenTutorials.clear();
        _saveSeenTutorials();
        say('¡Tutoriales reiniciados! Volveré a explicarlo todo. 😊', {
            expression: 'happy',
            duration: 3000
        });
    }

    // ── API pública ──────────────────────────────────────────────────────────

    return {
        init,
        show,
        hide,
        say,
        hideBubble,
        setExpression,
        startTutorial,
        endTutorial,
        showHelpMenu,
        showRandomTip,
        highlightElement,
        removeHighlight,
        onEnterSection,
        resetTutorials,
        toggleMinimize,
        get isMinimized() { return _isMinimized; },
        get isVisible() { return _isVisible; },
        get currentExpression() { return _currentExpression; },
        get seenTutorials() { return [..._seenTutorials]; },
        EXPRESSIONS: Object.keys(EXPRESSIONS),
        TUTORIALS: Object.keys(TUTORIALS)
    };

})();

// Inicializar cuando el DOM esté listo
document.addEventListener('DOMContentLoaded', () => {
    // Pequeña demora para asegurar que otros scripts estén cargados
    setTimeout(() => {
        Ethy.init();
    }, 500);
});

// Exponer globalmente
window.Ethy = Ethy;

/* js/utils/supabaseStories.js */
// ============================================
// SUPABASE STORIES
// ============================================
// Tabla: stories
//   id          uuid PK default gen_random_uuid()
//   title       text NOT NULL
//   created_by  uuid REFERENCES auth.users(id)
//   created_at  timestamptz default now()
//
// La tabla messages ya tiene (o debe añadirse):
//   story_id    uuid REFERENCES stories(id)  (nullable, retrocompatible)
//
// SQL para Supabase:
//   create table public.stories (
//     id         uuid primary key default gen_random_uuid(),
//     title      text not null,
//     created_by uuid references auth.users(id),
//     created_at timestamptz not null default now()
//   );
//   alter table public.messages add column if not exists story_id uuid references public.stories(id);
//   create index if not exists messages_story_id_idx on public.messages(story_id);
// ============================================

(function (global) {

    const cfg = global.SUPABASE_CONFIG || {};
    const logger = global.EtheriaLogger;

    const SB_URL = cfg.url;
    const SB_KEY = cfg.key;

    // ── Auth helpers ──────────────────────────────────────────────────────────

    function _getClient() {
        return global.supabaseClient || null;
    }

    /**
     * Devuelve el JWT del usuario autenticado, o null si no hay sesión.
     * Las peticiones de escritura DEBEN usar este token (no el anon key)
     * para que Supabase RLS identifique al usuario y permita el INSERT/UPDATE.
     */
    async function _getAccessToken() {
        return global.SupabaseAuthHeaders?.getAccessToken
            ? global.SupabaseAuthHeaders.getAccessToken(_getClient())
            : null;
    }

    async function _getUser() {
        const cached = global._cachedUserId || null;
        if (cached) return { id: cached };
        try {
            const client = _getClient();
            if (!client || typeof client.auth?.getUser !== 'function') return null;
            const { data: { user } } = await client.auth.getUser();
            if (user?.id) global._cachedUserId = user.id;
            return user || null;
        } catch (error) {
            logger?.warn('supabase:stories', 'getUser failed:', error?.message || error);
            return null;
        }
    }

    /**
     * Construye cabeceras con el JWT del usuario para peticiones de escritura.
     * Supabase RLS necesita el access_token del usuario (no el anon key) para
     * evaluar auth.uid() en las políticas INSERT/UPDATE/DELETE.
     */
    async function _writeHeaders() {
        if (global.SupabaseAuthHeaders?.buildAuthHeaders) {
            return global.SupabaseAuthHeaders.buildAuthHeaders({
                apikey: SB_KEY,
                client: _getClient(),
                baseHeaders: { 'Content-Type': 'application/json', 'Prefer': 'return=representation' },
            });
        }
        const token = await _getAccessToken();
        return {
            'apikey'       : SB_KEY,
            'Authorization': 'Bearer ' + (token || SB_KEY),
            'Content-Type' : 'application/json',
            'Prefer'       : 'return=representation'
        };
    }

    /**
     * Cabeceras de lectura.
     * Si hay sesión, enviar JWT para que RLS auth.uid() funcione también en SELECT.
     * Si no hay sesión, caer a anon key (solo tablas/policies públicas).
     */
    async function _readHeaders() {
        if (global.SupabaseAuthHeaders?.buildAuthHeaders) {
            return global.SupabaseAuthHeaders.buildAuthHeaders({
                apikey: SB_KEY,
                client: _getClient(),
                baseHeaders: {},
                acceptJson: true,
            });
        }
        const token = await _getAccessToken();
        return {
            'apikey'       : SB_KEY,
            'Authorization': 'Bearer ' + (token || SB_KEY),
            'Accept'       : 'application/json'
        };
    }

    // ── createStory ───────────────────────────────────────────────────────────
    /**
     * Crea una nueva historia en Supabase.
     * @param  {string} title  Nombre de la historia
     * @returns {object|null}  Fila creada { id, title, created_by, created_at } o null si falla
     */
    async function createStory(title) {
        if (!title || !title.trim()) {
            logger?.warn('supabase:stories', 'createStory: título vacío');
            return null;
        }

        try {
            const user = await _getUser();
            if (!user) {
                logger?.warn('supabase:stories', 'createStory: usuario no autenticado — inicia sesión primero');
                if (typeof showAutosave === 'function') showAutosave('Inicia sesión para crear historias en la nube', 'error');
                return null;
            }

            const row = {
                title      : title.trim(),
                created_by : user.id
            };

            // _writeHeaders() usa el JWT del usuario (no el anon key),
            // necesario para que RLS permita el INSERT en la tabla stories.
            const headers = await _writeHeaders();
            const res = await fetch(SB_URL + '/rest/v1/stories', {
                method  : 'POST',
                headers : headers,
                body    : JSON.stringify(row),
                signal  : AbortSignal.timeout(6000)
            });

            if (!res.ok) {
                const detail = await res.text().catch(() => String(res.status));
                logger?.warn('supabase:stories', 'createStory failed (' + res.status + '):', detail);
                // Mostrar mensaje específico para 401/403 (auth/RLS)
                if (res.status === 401 || res.status === 403) {
                    if (typeof showAutosave === 'function') showAutosave('Sin permisos — ¿has iniciado sesión?', 'error');
                } else if (res.status === 404) {
                    if (typeof showAutosave === 'function') showAutosave('Tabla "stories" no encontrada en Supabase — revisa el schema', 'error');
                }
                return null;
            }

            const data = await res.json();
            const story = Array.isArray(data) ? data[0] : data;

            // Cachear en appData
            if (typeof appData !== 'undefined') {
                if (!Array.isArray(appData.stories)) appData.stories = [];
                appData.stories.unshift(story);
            }

            global.dispatchEvent(new CustomEvent('etheria:story-created', { detail: { story } }));
            return story;

        } catch (e) {
            logger?.warn('supabase:stories', 'createStory error:', e.message);
            return null;
        }
    }

    // ── loadStories ───────────────────────────────────────────────────────────
    /**
     * Carga todas las historias desde Supabase, ordenadas por fecha descendente.
     * Actualiza appData.stories y dispara 'etheria:stories-loaded'.
     * @returns {Array}  Array de historias o [] si falla
     */
    async function loadStories() {
        try {
            const res = await fetch(
                SB_URL + '/rest/v1/stories?order=created_at.desc&select=*',
                { headers: await _readHeaders(), signal: AbortSignal.timeout(6000) }
            );

            if (!res.ok) {
                logger?.warn('supabase:stories', 'loadStories failed (' + res.status + ')');
                return [];
            }

            const stories = await res.json();

            if (typeof appData !== 'undefined') {
                appData.stories = Array.isArray(stories) ? stories : [];
            }

            global.dispatchEvent(new CustomEvent('etheria:stories-loaded', {
                detail: { stories: Array.isArray(stories) ? stories : [] }
            }));

            return Array.isArray(stories) ? stories : [];

        } catch (e) {
            logger?.warn('supabase:stories', 'loadStories error:', e.message);
            return [];
        }
    }

    // ── loadStoryParticipants ─────────────────────────────────────────────────
    /**
     * Carga los participantes de una historia (user_ids únicos en sus mensajes).
     * @param  {string} storyId
     * @returns {Array}  Array de { user_id, profile? }
     */
    async function loadStoryParticipants(storyId) {
        if (!storyId) return [];
        try {
            // Obtener user_ids únicos de los mensajes de esta historia
            const res = await fetch(
                SB_URL + '/rest/v1/messages'
                    + '?story_id=eq.' + encodeURIComponent(storyId)
                    + '&select=user_id'
                    + '&order=created_at.asc',
                { headers: await _readHeaders(), signal: AbortSignal.timeout(5000) }
            );

            if (!res.ok) return [];
            const rows = await res.json();

            // Deduplicar user_ids
            const seen = new Set();
            const uniqueUserIds = rows
                .map(r => r.user_id)
                .filter(uid => uid && !seen.has(uid) && seen.add(uid));

            // Cruzar con cloudProfiles si están disponibles
            const participants = uniqueUserIds.map(uid => {
                const profile = Array.isArray(appData?.cloudProfiles)
                    ? appData.cloudProfiles.find(p => p.owner_user_id === uid || p.id === uid)
                    : null;
                return { user_id: uid, profile: profile || null };
            });

            return participants;

        } catch (e) {
            logger?.warn('supabase:stories', 'loadStoryParticipants error:', e.message);
            return [];
        }
    }

    // ── enterStory ────────────────────────────────────────────────────────────
    /**
     * Entra en una historia:
     *   1. Establece currentStoryId
     *   2. Carga sus mensajes desde Supabase (filtrados por story_id)
     *   3. Carga participantes
     *   4. Suscribe al canal realtime filtrado por story_id
     *   5. Renderiza la vista de historia
     *
     * @param  {string} storyId   UUID de la historia
     */
    async function enterStory(storyId) {
        if (!storyId) {
            logger?.warn('supabase:stories', 'enterStory: storyId requerido');
            return;
        }

        // 1. Establecer historia activa
        global.currentStoryId = storyId;

        if (typeof SupabasePresence !== 'undefined' && typeof SupabasePresence.joinStory === 'function') {
            SupabasePresence.joinStory(storyId).catch(() => {});
        }

        const story = (appData?.stories || []).find(s => s.id === storyId) || { id: storyId, title: '...' };

        // Notificar que se está entrando
        global.dispatchEvent(new CustomEvent('etheria:story-entering', { detail: { storyId, story } }));

        // 2. Cancelar suscripción anterior al entrar a una nueva historia
        if (typeof SupabaseMessages !== 'undefined') {
            SupabaseMessages.unsubscribe();
        }

        // 3. Cargar mensajes de la historia (filtrado por story_id)
        let storyMessages = [];
        try {
            storyMessages = await _loadStoryMessages(storyId);
        } catch (e) {
            logger?.warn('supabase:stories', 'enterStory: error cargando mensajes:', e.message);
        }

        // 4. Fusionar con mensajes locales del topic activo (si existe)
        if (global.currentTopicId && typeof appData !== 'undefined') {
            const localMsgs = Array.isArray(appData.messages[global.currentTopicId])
                ? appData.messages[global.currentTopicId]
                : [];
            const localIds = new Set(localMsgs.map(m => String(m.id)));
            const newRemote = storyMessages.filter(m => m.id && !localIds.has(String(m.id)));

            if (newRemote.length > 0) {
                newRemote.forEach(m => localMsgs.push(m));
                localMsgs.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
                appData.messages[global.currentTopicId] = localMsgs;

                if (typeof hasUnsavedChanges !== 'undefined') global.hasUnsavedChanges = true;
                if (typeof save === 'function') save({ silent: true });

                // Actualizar la vista si el topic activo es este
                if (typeof currentMessageIndex !== 'undefined') {
                    global.currentMessageIndex = localMsgs.length - 1;
                    if (typeof syncVnStore === 'function') syncVnStore({ messageIndex: global.currentMessageIndex });
                    if (typeof showCurrentMessage === 'function') showCurrentMessage('forward');
                    eventBus.emit('ui:show-toast', {
                        text: newRemote.length + ' mensaje(s) cargado(s) desde la historia',
                        action: 'OK'
                    });
                }
            }
        }

        // 5. Cargar participantes en paralelo
        loadStoryParticipants(storyId).then(function (participants) {
            global.currentStoryParticipants = participants;
            global.dispatchEvent(new CustomEvent('etheria:story-participants-loaded', {
                detail: { storyId, participants }
            }));
            _renderStoryParticipants(participants);
        });

        // 6. Suscripción realtime filtrada por story_id
        _subscribeToStory(storyId);

        // 7. Notificar que la historia está activa
        global.dispatchEvent(new CustomEvent('etheria:story-entered', {
            detail: { storyId, story, messageCount: storyMessages.length }
        }));

        // 8. Actualizar UI de la historia activa
        _updateActiveStoryUI(story);
    }

    // ── _loadStoryMessages ────────────────────────────────────────────────────

    async function _loadStoryMessages(storyId) {
        const res = await fetch(
            SB_URL + '/rest/v1/messages'
                + '?story_id=eq.' + encodeURIComponent(storyId)
                + '&order=created_at.asc'
                + '&select=*,characters(name)',
            { headers: await _readHeaders(), signal: AbortSignal.timeout(8000) }
        );

        if (!res.ok) return [];

        const rows = await res.json();

        return rows.reduce(function (acc, row) {
            try {
                const msg = JSON.parse(row.content);
                if (!msg.timestamp) msg.timestamp = row.created_at;
                if (msg.metaType === 'typing') return acc;
                if (!msg.isNarrator && row.characters?.name) {
                    msg.charName = row.characters.name.trim() || msg.charName;
                }
                if (row.character_id) msg.supabaseCharacterId = row.character_id;
                // Tag the message with its story
                msg.storyId = storyId;
                acc.push(msg);
            } catch (error) {
                logger?.warn('supabase:stories', 'invalid message row in _loadStoryMessages:', error?.message || error);
            }
            return acc;
        }, []);
    }

    // ── _subscribeToStory ─────────────────────────────────────────────────────

    function _subscribeToStory(storyId) {
        let client;
        try {
            client = global.supabase?.createClient
                ? (global.supabaseClient || global.supabase.createClient(SB_URL, SB_KEY))
                : null;
        } catch (error) {
            logger?.warn('supabase:stories', '_subscribeToStory client init failed:', error?.message || error);
            client = null;
        }

        if (!client) {
            logger?.warn('supabase:stories', '_subscribeToStory: cliente supabase-js no disponible');
            return;
        }

        // Limpiar canal anterior de historia
        if (global._storyRealtimeChannel && client) {
            try { client.removeChannel(global._storyRealtimeChannel); } catch (error) {
                logger?.warn('supabase:stories', 'remove previous story channel failed:', error?.message || error);
            }
            global._storyRealtimeChannel = null;
        }

        try {
            global._storyRealtimeChannel = client
                .channel('story:' + storyId)
                .on(
                    'postgres_changes',
                    {
                        event  : 'INSERT',
                        schema : 'public',
                        table  : 'messages',
                        filter : 'story_id=eq.' + storyId
                    },
                    function (payload) {
                        try {
                            // Solo procesar mensajes si esta historia sigue activa
                            if (global.currentStoryId !== storyId) return;

                            const row = payload.new;
                            if (!row || !row.content) return;

                            const msg = JSON.parse(row.content);
                            if (!msg || !msg.id) return;
                            if (!msg.timestamp) msg.timestamp = row.created_at;
                            if (msg.metaType === 'typing') return;

                            msg.storyId = storyId;

                            // Enriquecer charName desde caché
                            if (!msg.isNarrator && row.character_id) {
                                msg.supabaseCharacterId = row.character_id;
                                try {
                                    const cloudChars = global.appData?.cloudCharacters;
                                    if (cloudChars) {
                                        for (const pid in cloudChars) {
                                            const chars = cloudChars[pid];
                                            if (!Array.isArray(chars)) continue;
                                            const found = chars.find(c => c.id === row.character_id);
                                            if (found?.name) { msg.charName = found.name; break; }
                                        }
                                    }
                                } catch (error) {
                                    logger?.debug('supabase:stories', 'cloud character cache lookup failed:', error?.message || error);
                                }
                            }

                            // Despachar como mensaje realtime estándar
                            global.dispatchEvent(new CustomEvent('etheria:story-message', {
                                detail: { msg, row, storyId }
                            }));

                            // También alimentar al handler estándar si el topic activo coincide
                            _injectRealtimeMessage(msg, row);

                        } catch (e) {
                            logger?.warn('supabase:stories', 'realtime payload error:', e.message);
                        }
                    }
                )
                .subscribe(function (status) {
                    if (status === 'SUBSCRIBED') {
                        logger?.info('supabase:stories', 'Suscrito a historia:', storyId);
                    } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
                        logger?.warn('supabase:stories', 'canal realtime estado:', status);
                        global._storyRealtimeChannel = null;
                    }
                });

        } catch (e) {
            logger?.warn('supabase:stories', '_subscribeToStory error:', e.message);
        }
    }

    // ── _injectRealtimeMessage ────────────────────────────────────────────────
    // Inyecta el mensaje en el flujo de la historia activa (mismo handler que SupabaseMessages.subscribe)

    function _injectRealtimeMessage(msg, row) {
        if (!global.currentTopicId || !msg || !msg.id) return;

        try {
            const msgs = typeof getTopicMessages === 'function'
                ? getTopicMessages(global.currentTopicId)
                : (global.appData?.messages?.[global.currentTopicId] || []);

            const exists = msgs.some(m => String(m.id) === String(msg.id));
            if (exists) return;

            // Fix 4: prefer server user_id for own-message check
            const _ownId = global._cachedUserId || null;
            if (_ownId && msg._supabaseUserId && msg._supabaseUserId === _ownId) return;
            if (!_ownId && String(msg.userIndex) === String(global.currentUserIndex)) return;

            msgs.push(msg);
            msgs.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
            if (global.appData) global.appData.messages[global.currentTopicId] = msgs;
            if (typeof save === 'function') save({ silent: true });

            const isAtEnd = global.currentMessageIndex >= msgs.length - 2;
            if (isAtEnd) {
                global.currentMessageIndex = msgs.length - 1;
                if (typeof syncVnStore === 'function') syncVnStore({ messageIndex: global.currentMessageIndex });
                if (typeof showCurrentMessage === 'function') showCurrentMessage('forward');
                eventBus.emit('ui:show-toast', {
                    text: 'Nuevo mensaje en la historia',
                    action: 'OK'
                });
            } else {
                eventBus.emit('ui:show-toast', {
                    text: 'Nuevo mensaje recibido',
                    action: 'Ver ahora',
                    onAction: function () {
                        global.currentMessageIndex = msgs.length - 1;
                        if (typeof syncVnStore === 'function') syncVnStore({ messageIndex: global.currentMessageIndex });
                        if (typeof showCurrentMessage === 'function') showCurrentMessage('forward');
                    }
                });
            }
        } catch (e) {
            logger?.warn('supabase:stories', '_injectRealtimeMessage error:', e.message);
        }
    }

    // ── UI helpers ────────────────────────────────────────────────────────────

    function _updateActiveStoryUI(story) {
        // Actualizar badge de historia activa en la barra VN
        const badge = document.getElementById('activeStoryBadge');
        if (badge) {
            badge.textContent = '📖 ' + (story.title || 'Historia');
            badge.style.display = 'inline-flex';
        }
        // Resaltar la historia activa en la lista
        document.querySelectorAll('.story-card').forEach(function (card) {
            card.classList.toggle('story-card--active', card.dataset.storyId === story.id);
        });
    }

    function _renderStoryParticipants(participants) {
        const container = document.getElementById('storyParticipantsList');
        if (!container) return;

        if (!participants || participants.length === 0) {
            container.innerHTML = '<span class="story-participants-empty">Sin participantes aún</span>';
            return;
        }

        const isOnline = function (userId) {
            if (!userId) return false;
            return typeof SupabasePresence !== 'undefined'
                && typeof SupabasePresence.isUserOnline === 'function'
                && SupabasePresence.isUserOnline(userId);
        };

        // XSS fix: build participant elements via DOM to avoid name/avatar injection
        container.innerHTML = '';
        participants.forEach(function (p) {
            const name = p.profile?.name || (p.user_id ? String(p.user_id).slice(0, 8) : '?');
            const avatar = p.profile?.avatar_url || '';

            const wrap = document.createElement('span');
            wrap.className = 'story-participant-wrap' + (isOnline(p.user_id) ? ' online' : '');
            wrap.title = isOnline(p.user_id) ? `${name} · En línea` : `${name} · Desconectado`;

            let el;
            if (avatar) {
                el = document.createElement('img');
                el.src = avatar;
                el.className = 'story-participant-avatar';
                el.alt = name;
                el.onerror = function () { this.style.display = 'none'; };
            } else {
                el = document.createElement('span');
                el.className = 'story-participant-chip';
                el.textContent = name;
            }

            const dot = document.createElement('span');
            dot.className = 'story-participant-dot';
            dot.setAttribute('aria-hidden', 'true');

            wrap.appendChild(el);
            wrap.appendChild(dot);
            container.appendChild(wrap);
        });
    }

    // ── leaveStory ────────────────────────────────────────────────────────────
    /**
     * Sale de la historia activa y limpia el canal realtime.
     */
    function leaveStory() {
        const client = global.supabaseClient || null;
        if (global._storyRealtimeChannel && client) {
            try { client.removeChannel(global._storyRealtimeChannel); } catch (error) {
                logger?.warn('supabase:stories', 'leaveStory removeChannel failed:', error?.message || error);
            }
            global._storyRealtimeChannel = null;
        }
        if (typeof SupabasePresence !== 'undefined' && typeof SupabasePresence.leaveStory === 'function') {
            SupabasePresence.leaveStory().catch(() => {});
        }
        global.currentStoryId = null;
        global.currentStoryParticipants = [];

        const badge = document.getElementById('activeStoryBadge');
        if (badge) badge.style.display = 'none';

        document.querySelectorAll('.story-card').forEach(function (card) {
            card.classList.remove('story-card--active');
        });
    }


    // Re-render de participantes cuando cambia la presencia realtime
    global.addEventListener('etheria:story-presence-changed', function (e) {
        const sid = e?.detail?.storyId;
        if (!sid || String(sid) !== String(global.currentStoryId)) return;
        _renderStoryParticipants(global.currentStoryParticipants || []);
    });

    // ── API pública ───────────────────────────────────────────────────────────

    global.SupabaseStories = {
        createStory           : createStory,
        loadStories           : loadStories,
        enterStory            : enterStory,
        leaveStory            : leaveStory,
        loadStoryParticipants : loadStoryParticipants
    };

}(window));

/*# sourceMappingURL=etheria.js.map */
