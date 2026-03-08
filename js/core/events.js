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
