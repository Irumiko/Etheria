// ═══════════════════════════════════════════════════════════════════
// SUPABASE CYCLES — Ciclos narrativos del modo clásico
//
// Gestiona la tabla `topic_cycles`:
//   - Obtener o crear el ciclo abierto de un tema
//   - Registrar qué usuarios han respondido en el ciclo
//   - Cerrar el ciclo cuando todos han respondido o han pasado 72h
//   - Abrir inmediatamente un ciclo nuevo al cerrar
//
// No bloquea la UI. Si Supabase no está disponible, la app sigue
// funcionando sin ciclos (sin errores visibles).
// ═══════════════════════════════════════════════════════════════════

const SupabaseCycles = (function () {

    const CYCLE_DURATION_MS = 72 * 60 * 60 * 1000; // 72 horas en ms

    // Ciclo en memoria para el topic activo.
    // Forma: { id, topic_id, started_at, closes_at, participants: number[] }
    let _cachedCycle   = null;
    let _cachedTopicId = null;

    // ── Helpers ──────────────────────────────────────────────────────

    function _client() { return window.supabaseClient || null; }
    function _isAvailable() { return !!_client(); }

    function _log(...args) {
        window.EtheriaLogger?.info?.('supabaseCycles', ...args);
    }
    function _warn(...args) {
        window.EtheriaLogger?.warn('supabaseCycles', ...args);
    }

    // ── Fetch: ciclo abierto de un topic ─────────────────────────────

    async function _fetchOpenCycle(topicId) {
        if (!_isAvailable() || !topicId) return null;
        try {
            const { data, error } = await _client()
                .from('topic_cycles')
                .select('*')
                .eq('topic_id', String(topicId))
                .eq('status', 'open')
                .order('started_at', { ascending: false })
                .limit(1)
                .maybeSingle();

            if (error) { _warn('fetchOpenCycle error:', error.message); return null; }
            return data || null;
        } catch (e) {
            _warn('fetchOpenCycle exception:', e.message);
            return null;
        }
    }

    // ── Create: nuevo ciclo ───────────────────────────────────────────

    async function _createCycle(topicId, participants) {
        if (!_isAvailable() || !topicId) return null;
        const now      = new Date();
        const closesAt = new Date(now.getTime() + CYCLE_DURATION_MS);
        try {
            const { data, error } = await _client()
                .from('topic_cycles')
                .insert({
                    topic_id:     String(topicId),
                    started_at:   now.toISOString(),
                    closes_at:    closesAt.toISOString(),
                    status:       'open',
                    participants: JSON.stringify(participants || []),
                })
                .select()
                .single();

            if (error) { _warn('createCycle error:', error.message); return null; }
            _log(`Ciclo creado: ${data.id} (topic ${topicId}, ${participants.length} participantes)`);
            return data;
        } catch (e) {
            _warn('createCycle exception:', e.message);
            return null;
        }
    }

    // ── Close: cerrar ciclo existente ─────────────────────────────────

    async function _closeCycle(cycleId) {
        if (!_isAvailable() || !cycleId) return;
        try {
            const { error } = await _client()
                .from('topic_cycles')
                .update({
                    status:    'closed',
                    closed_at: new Date().toISOString(),
                })
                .eq('id', cycleId);

            if (error) { _warn('closeCycle error:', error.message); return; }
            _log(`Ciclo cerrado: ${cycleId}`);
        } catch (e) {
            _warn('closeCycle exception:', e.message);
        }
    }

    // ── Update participants in Supabase ───────────────────────────────
    // Sincroniza el array de participantes del ciclo (solo si cambió).

    async function _updateParticipants(cycleId, participants) {
        if (!_isAvailable() || !cycleId) return;
        try {
            await _client()
                .from('topic_cycles')
                .update({ participants: JSON.stringify(participants) })
                .eq('id', cycleId);
        } catch (e) {
            _warn('updateParticipants exception:', e.message);
        }
    }

    // ── Derivar participantes de los mensajes del topic ───────────────
    // Solo usuarios con al menos un mensaje real (no opciones-resultado).

    function _deriveParticipants(topicMessages) {
        const seen = new Set();
        (topicMessages || []).forEach(m => {
            if (m.userIndex !== undefined && !m.isOptionResult) {
                seen.add(Number(m.userIndex));
            }
        });
        return [...seen];
    }

    // ── Public: init ──────────────────────────────────────────────────
    // Llamado al entrar en un topic en modo clásico.
    // Busca el ciclo abierto o crea uno nuevo.

    async function init(topicId, topicMessages) {
        if (!topicId) return;
        _cachedTopicId = String(topicId);
        _cachedCycle   = null;

        const participants = _deriveParticipants(topicMessages);

        let cycle = await _fetchOpenCycle(topicId);

        if (!cycle) {
            // No hay ciclo abierto: crear el primero
            cycle = await _createCycle(topicId, participants);
        } else {
            // Hay ciclo abierto: comprobar si ya expiró por tiempo
            if (new Date() > new Date(cycle.closes_at)) {
                await _closeCycle(cycle.id);
                cycle = await _createCycle(topicId, participants);
            }
        }

        _cachedCycle = cycle;
        _log(`Ciclo activo para topic ${topicId}:`, _cachedCycle?.id || 'ninguno');
    }

    // ── Public: getActiveCycleId ──────────────────────────────────────

    function getActiveCycleId() {
        return _cachedCycle?.id || null;
    }

    // ── Public: onMessageSent ─────────────────────────────────────────
    // Llamado después de enviar un mensaje en modo clásico.
    // Comprueba si el ciclo debe cerrarse. Si sí: cierra, llama onClose,
    // abre un ciclo nuevo.
    //
    // @param {number}   userIndex      — quién envió el mensaje
    // @param {Array}    topicMessages  — todos los mensajes del topic
    // @param {string}   topicId
    // @param {Function} onClose        — callback(cycleId) al cerrarse

    async function onMessageSent(userIndex, topicMessages, topicId, onClose) {
        if (!_cachedCycle || String(_cachedTopicId) !== String(topicId)) return;

        const cycle = _cachedCycle;

        // Añadir userIndex a participants si aún no está
        const participantsArr = Array.isArray(cycle.participants)
            ? cycle.participants
            : (JSON.parse(cycle.participants || '[]'));

        if (!participantsArr.includes(Number(userIndex))) {
            participantsArr.push(Number(userIndex));
            cycle.participants = participantsArr;
            _updateParticipants(cycle.id, participantsArr).catch(() => {});
        }

        // ── Comprobar cierre ─────────────────────────────────────────
        const cycleMsgs = topicMessages.filter(
            m => m.cycle_id === cycle.id && !m.isOptionResult
        );
        const responders = new Set(cycleMsgs.map(m => Number(m.userIndex)));
        const allResponded = participantsArr.every(p => responders.has(p));
        const expired      = new Date() > new Date(cycle.closes_at);

        if (!allResponded && !expired) return;

        // ── Cerrar ciclo ─────────────────────────────────────────────
        _cachedCycle = null;
        await _closeCycle(cycle.id);

        // Notificar al caller para que resuelva affinidades
        if (typeof onClose === 'function') {
            try { onClose(cycle.id); } catch (e) { _warn('onClose error:', e.message); }
        }

        // ── Abrir ciclo nuevo ────────────────────────────────────────
        const newParticipants = _deriveParticipants(topicMessages);
        const newCycle = await _createCycle(topicId, newParticipants);
        _cachedCycle = newCycle;
    }

    // ── Public: reset (al salir del topic) ───────────────────────────

    function reset() {
        _cachedCycle   = null;
        _cachedTopicId = null;
    }

    // ── Public API ────────────────────────────────────────────────────

    return { init, getActiveCycleId, onMessageSent, reset };

})();

window.SupabaseCycles = SupabaseCycles;
