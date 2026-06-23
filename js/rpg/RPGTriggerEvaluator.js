// ============================================================
// RPG TRIGGER EVALUATOR
// El "Director de Escena": decide CUÁNDO disparar eventos narrativos.
//
// Responsabilidades:
//   - Mantener un snapshot anterior del estado RPG
//   - Escuchar rpg:state-changed (emitido por RPGState en cada cambio)
//   - Comparar snapshot anterior vs actual para detectar cruces de umbral
//   - Delegar la ejecución de consecuencias a RPGDispatcher
//   - Recordar qué eventos ya se dispararon (por historia) para no repetir
//
// Límites de arquitectura:
//   ✅ Puede usar: RPGState, RPGDispatcher, SceneLoader, eventBus
//   ❌ No puede usar: nada de ui/, nada de vn.js directamente
//
// Integración con modo VN clásico:
//   Llama a RPGTriggerEvaluator.onVNContext(storyId, messageIndex, sceneTag)
//   desde vn.js cuando avanza un mensaje con metadatos de escena.
// ============================================================

const RPGTriggerEvaluator = (function () {

    let _storyId         = null;      // historia activa
    let _prevSnapshot    = null;      // último snapshot evaluado
    let _messageCount    = 0;         // mensajes avanzados en modo VN
    let _activeSceneTag  = null;      // etiqueta de escena actual (modo VN)
    let _evaluating      = false;     // guard para evitar reentrancia
    let _initialized     = false;

    // Persistir eventos disparados en localStorage para sobrevivir recargas
    const FIRED_KEY_PREFIX = 'etheria_rpg_fired_';

    // ── Ciclo de vida ───────────────────────────────────────────

    /**
     * Inicializa el evaluador para una historia concreta.
     * Llamar cuando el usuario entra en una historia con modo RPG activo.
     */
    function init(storyId) {
        _storyId = storyId || null;
        _prevSnapshot = typeof RPGState !== 'undefined' ? RPGState.getSnapshot() : null;
        _messageCount = 0;
        _activeSceneTag = null;
        _evaluating = false;

        if (_initialized) return;   // listeners solo se registran una vez
        _initialized = true;

        // Escuchar cambios de estado RPG → evaluar triggers automáticamente
        if (window.eventBus) {
            eventBus.on('rpg:state-changed', function () {
                if (_storyId) _scheduleEvaluation();
            });

            // Cuando el motor de escenas termina un paso, también evaluar
            eventBus.on('scene:step', function () {
                if (_storyId) _scheduleEvaluation();
            });

            // Cuando una variable de escena cambia (retransmitido por RPGRenderer)
            // reevaluar triggers por si alguna condición depende de esa variable
            eventBus.on('rpg:variable-updated', function () {
                if (_storyId) _scheduleEvaluation();
            });
        }
    }

    /**
     * Señal desde el modo VN clásico: un mensaje ha avanzado.
     * Si el mensaje lleva metadatos de escena, actualizar el contexto.
     *
     * @param {string} storyId      ID de la historia activa
     * @param {number} msgIndex     Índice del mensaje actual
     * @param {string} [sceneTag]   Etiqueta de escena del mensaje (opcional)
     */
    function onVNContext(storyId, msgIndex, sceneTag) {
        _storyId = storyId || _storyId;
        _messageCount = msgIndex || 0;

        if (sceneTag && sceneTag !== _activeSceneTag) {
            _activeSceneTag = sceneTag;
            // El cambio de escena puede disparar eventos 'scene_tag' y 'scene_entered'
            _scheduleEvaluation();
        } else if (storyId) {
            _scheduleEvaluation();
        }
    }

    /**
     * Limpia el estado al salir de una historia.
     */
    function clear() {
        _storyId = null;
        _prevSnapshot = null;
        _messageCount = 0;
        _activeSceneTag = null;
    }

    // ── Evaluación ──────────────────────────────────────────────

    // Debounce ligero: si llegan varios cambios en el mismo tick, evaluar una vez
    let _evalTimer = null;
    function _scheduleEvaluation() {
        if (_evalTimer) return;
        _evalTimer = setTimeout(async function () {
            _evalTimer = null;
            await _runEvaluation();
        }, 50);
    }

    async function _runEvaluation() {
        if (_evaluating || !_storyId) return;
        _evaluating = true;

        try {
            const currentSnapshot = _buildCurrentSnapshot();
            const events = await SceneLoader.getActiveEvents(_storyId);

            for (const event of events) {
                if (!event || !event.id || !event.trigger) continue;

                const alreadyFired = !event.repeatable && _wasFired(event.id, _storyId);
                if (alreadyFired) continue;

                // Comprobar condición de guarda (opcional)
                if (event.condition && typeof RPGState !== 'undefined') {
                    if (!RPGState.evalCondition(event.condition)) continue;
                }

                if (_shouldFire(event.trigger, currentSnapshot, _prevSnapshot)) {
                    _markFired(event.id, _storyId);
                    await _executeEvent(event, currentSnapshot);
                }
            }

            _prevSnapshot = currentSnapshot;

        } catch (err) {
            console.error('[RPGTriggerEvaluator] Error en evaluación:', err);
        } finally {
            _evaluating = false;
        }
    }

    // ── Lógica de triggers ───────────────────────────────────────

    function _shouldFire(trigger, current, prev) {
        if (!trigger || !trigger.type) return false;
        if (!prev) return false;   // primera evaluación sin estado anterior

        switch (trigger.type) {

            // HP cae POR DEBAJO del umbral (cruza hacia abajo)
            case 'hp_threshold':
                return prev.hp.current > trigger.value
                    && current.hp.current <= trigger.value;

            // HP sube POR ENCIMA del umbral (cruza hacia arriba)
            case 'hp_threshold_above':
                return prev.hp.current < trigger.value
                    && current.hp.current >= trigger.value;

            // Una flag pasa de falsy a truthy
            case 'flag_set': {
                const wasSet = _isTruthy(prev.flags[trigger.flag]);
                const nowSet = _isTruthy(current.flags[trigger.flag]);
                return !wasSet && nowSet;
            }

            // Una flag pasa de truthy a falsy
            case 'flag_cleared': {
                const wasSet = _isTruthy(prev.flags[trigger.flag]);
                const nowSet = _isTruthy(current.flags[trigger.flag]);
                return wasSet && !nowSet;
            }

            // Un objeto aparece en el inventario
            case 'item_acquired': {
                const hadItem = prev.inventory.some(i => i.id === trigger.item && (i.qty || 1) > 0);
                const hasItem = current.inventory.some(i => i.id === trigger.item && (i.qty || 1) > 0);
                return !hadItem && hasItem;
            }

            // El jugador sube de nivel
            case 'level_up':
                return current.level > prev.level;

            // Un stat cae POR DEBAJO del umbral
            case 'stat_threshold': {
                const statKey  = String(trigger.stat || '').toUpperCase();
                const prevVal  = prev.stats[statKey] !== undefined ? prev.stats[statKey] : 8;
                const currVal  = current.stats[statKey] !== undefined ? current.stats[statKey] : 8;
                return prevVal > trigger.value && currVal <= trigger.value;
            }

            // Un stat sube POR ENCIMA del umbral
            case 'stat_threshold_above': {
                const statKey  = String(trigger.stat || '').toUpperCase();
                const prevVal  = prev.stats[statKey] !== undefined ? prev.stats[statKey] : 8;
                const currVal  = current.stats[statKey] !== undefined ? current.stats[statKey] : 8;
                return prevVal < trigger.value && currVal >= trigger.value;
            }

            // El contador de mensajes VN llega a un número concreto
            case 'message_count':
                return current.messageCount >= trigger.value
                    && prev.messageCount < trigger.value;

            // El jugador entra en una escena VN con una etiqueta específica
            case 'scene_tag':
                return current.activeSceneTag === trigger.tag
                    && prev.activeSceneTag !== trigger.tag;

            // Alias más semántico de scene_tag
            case 'scene_entered':
                return current.activeSceneTag === trigger.scene
                    && prev.activeSceneTag !== trigger.scene;

            default:
                console.warn(`[RPGTriggerEvaluator] Tipo de trigger desconocido: "${trigger.type}"`);
                return false;
        }
    }

    function _isTruthy(v) {
        return v !== undefined && v !== null && v !== false && v !== 0 && v !== '';
    }

    // ── Ejecución de evento ──────────────────────────────────────

    async function _executeEvent(event, currentSnapshot) {
        const context = {
            storyId:      _storyId,
            userId:       window._cachedUserId || null,
            profileIndex: typeof currentUserIndex !== 'undefined' ? currentUserIndex : 0,
            eventId:      event.id
        };

        eventBus.emit('rpg:event-fired', {
            eventId: event.id,
            storyId: _storyId,
            trigger: event.trigger
        });

        if (typeof RPGDispatcher !== 'undefined') {
            await RPGDispatcher.dispatchAll(event.consequences || [], context);
        }
    }

    // ── Snapshot enriquecido ─────────────────────────────────────
    // Añade campos de contexto VN al snapshot de RPGState

    function _buildCurrentSnapshot() {
        const base = typeof RPGState !== 'undefined'
            ? RPGState.getSnapshot()
            : { stats: {}, inventory: [], flags: {}, xp: 0, level: 1, hp: { current: 20, max: 20 } };

        return {
            ...base,
            messageCount:   _messageCount,
            activeSceneTag: _activeSceneTag
        };
    }

    // ── Memoria de eventos disparados ────────────────────────────

    function _firedKey(storyId) {
        return FIRED_KEY_PREFIX + String(storyId);
    }

    function _wasFired(eventId, storyId) {
        try {
            const fired = JSON.parse(localStorage.getItem(_firedKey(storyId)) || '{}');
            return !!fired[eventId];
        } catch { return false; }
    }

    function _markFired(eventId, storyId) {
        try {
            const key   = _firedKey(storyId);
            const fired = JSON.parse(localStorage.getItem(key) || '{}');
            fired[eventId] = true;
            localStorage.setItem(key, JSON.stringify(fired));
        } catch { /* silencioso */ }
    }

    /**
     * Reinicia el historial de eventos disparados para una historia.
     * Útil para testear o si el GM quiere re-ejecutar arcos completos.
     */
    function resetFiredEvents(storyId) {
        try {
            localStorage.removeItem(_firedKey(storyId || _storyId));
        } catch { /* silencioso */ }
    }

    // ── Exports ──────────────────────────────────────────────────

    return { init, onVNContext, clear, resetFiredEvents };

})();

window.RPGTriggerEvaluator = RPGTriggerEvaluator;

