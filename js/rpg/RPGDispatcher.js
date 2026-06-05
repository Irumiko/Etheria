// ============================================================
// RPG DISPATCHER
// Registro de handlers para consecuencias de eventos narrativos.
//
// Responsabilidades:
//   - Mantener un mapa de { acción → función }
//   - Ejecutar consecuencias de forma asíncrona y segura
//   - Registrar cada ejecución en activity_log (Supabase)
//   - NO sabe cuándo disparar — eso es trabajo de RPGTriggerEvaluator
//
// Límites de arquitectura:
//   ✅ Puede usar: RPGState, eventBus, window.supabaseClient
//   ❌ No puede usar: nada de ui/, nada de SceneLoader
// ============================================================

const RPGDispatcher = (function () {

    const _registry = new Map();

    // ── API pública ─────────────────────────────────────────────

    /**
     * Registra un handler para una acción.
     * Los handlers built-in se registran al final de este archivo.
     * Los módulos externos pueden añadir los suyos con RPGDispatcher.register().
     *
     * @param {string}   action  Nombre de la acción (ej. 'modify_hp')
     * @param {Function} fn      async (consequence, context) => void
     */
    function register(action, fn) {
        if (_registry.has(action)) {
            console.warn(`[RPGDispatcher] Reemplazando handler existente para: "${action}"`);
        }
        _registry.set(action, fn);
    }

    /**
     * Ejecuta una consecuencia individual.
     * Captura errores para que el resto de consecuencias del evento no se bloqueen.
     *
     * @param {object} consequence  { action, ...params }
     * @param {object} context      { storyId, userId, eventId, profileIndex? }
     */
    async function dispatch(consequence, context) {
        if (!consequence || !consequence.action) {
            console.warn('[RPGDispatcher] Consecuencia sin acción:', consequence);
            return;
        }

        const handler = _registry.get(consequence.action);
        if (!handler) {
            console.warn(`[RPGDispatcher] Sin handler para acción: "${consequence.action}"`);
            _log(consequence, context, 'unknown_action');
            return;
        }

        const t0 = Date.now();
        try {
            await handler(consequence, context);
            _log(consequence, context, 'ok', Date.now() - t0);
        } catch (err) {
            console.error(`[RPGDispatcher] Error en "${consequence.action}":`, err);
            _log(consequence, context, 'error', Date.now() - t0, err.message);
        }
    }

    /**
     * Ejecuta todas las consecuencias de un evento en orden.
     */
    async function dispatchAll(consequences, context) {
        if (!Array.isArray(consequences)) return;
        for (const c of consequences) {
            await dispatch(c, context);
        }
    }

    // ── Observabilidad ──────────────────────────────────────────

    function _log(consequence, context, status, durationMs, errorMsg) {
        const sb = window.supabaseClient;
        if (!sb || !context?.userId) return;

        sb.from('activity_log').insert({
            user_id:     context.userId,
            action:      `rpg_event:${consequence.action}`,
            entity_type: 'rpg_event',
            entity_id:   context.eventId || null,
            metadata:    {
                consequence: consequence,
                story_id:    context.storyId || null,
                status:      status,
                duration_ms: durationMs || 0,
                error:       errorMsg || null
            }
        }).then(() => {}).catch(() => {});  // fire-and-forget, nunca bloquear
    }

    // ── Handlers built-in ───────────────────────────────────────
    //
    // Cada handler recibe (consequence, context).
    // Los nombres de parámetros en `consequence` siguen el schema
    // documentado en js/scenes/events/arc_base.json.

    // modify_hp — delta puede ser negativo (daño) o positivo (cura)
    register('modify_hp', async (c) => {
        if (typeof RPGState === 'undefined') return;
        const delta = Number(c.delta);
        if (!Number.isFinite(delta)) throw new Error(`modify_hp: delta inválido (${c.delta})`);
        RPGState.modifyHp(delta);
    });

    // set_hp — valor absoluto
    register('set_hp', async (c) => {
        if (typeof RPGState === 'undefined') return;
        const current = RPGState.getHp();
        const delta   = Number(c.value) - current.current;
        if (!Number.isFinite(delta)) throw new Error(`set_hp: value inválido (${c.value})`);
        RPGState.modifyHp(delta);
    });

    // modify_stat — stat: 'STR'|'DEX'|'CON'|'INT'|'WIS'|'CHA', delta: número
    register('modify_stat', async (c) => {
        if (typeof RPGState === 'undefined') return;
        const stat  = String(c.stat || '').toUpperCase();
        const delta = Number(c.delta);
        if (!stat || !Number.isFinite(delta)) throw new Error(`modify_stat: parámetros inválidos`);
        RPGState.modifyStat(stat, delta);
    });

    // set_flag — key: string, value: any
    register('set_flag', async (c) => {
        if (typeof RPGState === 'undefined') return;
        if (!c.key) throw new Error('set_flag: falta key');
        RPGState.setFlag(String(c.key), c.value !== undefined ? c.value : true);
    });

    // clear_flag — equivalente a set_flag con value: false
    register('clear_flag', async (c) => {
        if (typeof RPGState === 'undefined') return;
        if (!c.key) throw new Error('clear_flag: falta key');
        RPGState.setFlag(String(c.key), false);
    });

    // give_item — item: { id, name, qty?, description? }
    register('give_item', async (c) => {
        if (typeof RPGState === 'undefined') return;
        const item = c.item || { id: c.id, name: c.name };
        if (!item.id) throw new Error('give_item: falta item.id');
        // Sanitizar nombre para evitar XSS si llega a mostrarse en UI
        if (item.name) item.name = String(item.name).replace(/<[^>]+>/g, '');
        RPGState.addItem(item);
    });

    // remove_item
    register('remove_item', async (c) => {
        if (typeof RPGState === 'undefined') return;
        if (!c.id) throw new Error('remove_item: falta id');
        RPGState.removeItem(String(c.id), Number(c.qty) || 1);
    });

    // add_xp
    register('add_xp', async (c) => {
        if (typeof RPGState === 'undefined') return;
        const amount = Number(c.amount);
        if (!Number.isFinite(amount) || amount < 0) throw new Error(`add_xp: amount inválido (${c.amount})`);
        RPGState.addXp(amount);
    });

    // send_message — emite un mensaje narrativo al log de la historia.
    // El texto pasa por escapeHtml antes de persistir.
    register('send_message', async (c, ctx) => {
        // Sanitizar
        const rawText = String(c.template || c.text || '');
        const text    = typeof escapeHtml === 'function' ? escapeHtml(rawText) : rawText;

        // Emitir por el bus para que vn.js / RPGRenderer lo puedan mostrar
        if (window.eventBus) {
            eventBus.emit('rpg:narrator-message', {
                text:    text,
                storyId: ctx?.storyId,
                eventId: ctx?.eventId,
                author:  'narrator'
            });
        }

        // Intentar persistir en Supabase si está disponible
        const sb = window.supabaseClient;
        if (sb && ctx?.storyId && ctx?.userId) {
            await sb.from('messages').insert({
                story_id: ctx.storyId,
                user_id:  ctx.userId,
                author:   'narrator',
                content:  text
            });
        }
    });

    // play_sound — delega en el bus de audio existente
    register('play_sound', async (c) => {
        if (window.eventBus) {
            eventBus.emit('scene:sound', {
                action: c.action || 'play',
                track:  c.track,
                volume: c.volume
            });
        }
    });

    // goto_scene — carga una escena RPG
    register('goto_scene', async (c) => {
        if (typeof RPGEngine !== 'undefined' && c.scene) {
            await RPGEngine.loadScene(String(c.scene));
        }
    });

    // wait_ms — pausa de N milisegundos (útil para secuenciar consecuencias)
    register('wait_ms', async (c) => {
        const ms = Math.min(Number(c.ms) || 0, 10000); // máximo 10s
        if (ms > 0) await new Promise(resolve => setTimeout(resolve, ms));
    });

    // ── Exports ──────────────────────────────────────────────────

    return { register, dispatch, dispatchAll };

})();

window.RPGDispatcher = RPGDispatcher;
