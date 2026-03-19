// ═══════════════════════════════════════════════════════════════════
// SUPABASE AFFINITIES — Afinidad direccional en tiempo real
// Gestiona la tabla `affinities`:
//   - Escritura cuando el usuario modifica la afinidad
//   - Suscripción Realtime para recibir cambios de otros usuarios
//   - Carga inicial al entrar en un topic
// ═══════════════════════════════════════════════════════════════════

const SupabaseAffinities = (function () {

    let _userId       = null;
    let _channel      = null;   // canal Realtime activo
    let _currentTopic = null;   // topic al que estamos suscritos

    // ── Helpers ──────────────────────────────────────────────────────
    function _client() { return window.supabaseClient || null; }
    function _isAvailable() { return !!_client() && !!_userId; }

    async function _ensureUserId() {
        if (_userId) return _userId;
        try {
            const { data } = await _client().auth.getUser();
            _userId = data?.user?.id || null;
        } catch { _userId = null; }
        return _userId;
    }

    // ── Escribir afinidad ────────────────────────────────────────────
    // Llamado cada vez que el valor cambia en el cliente.
    async function upsert(fromCharId, toCharId, topicId, value) {
        const uid = await _ensureUserId();
        if (!uid || !fromCharId || !toCharId || !topicId) return;

        try {
            const { error } = await _client()
                .from('affinities')
                .upsert({
                    from_char_id:  String(fromCharId),
                    to_char_id:    String(toCharId),
                    topic_id:      String(topicId),
                    owner_user_id: uid,
                    value:         Math.max(0, Math.min(100, Number(value) || 0)),
                    updated_at:    new Date().toISOString(),
                }, { onConflict: 'from_char_id,to_char_id,topic_id' });

            if (error) {
                window.EtheriaLogger?.warn('supabaseAffinities', 'upsert failed:', error.message);
            }
        } catch (err) {
            window.EtheriaLogger?.warn('supabaseAffinities', 'upsert error:', err?.message);
        }
    }

    // ── Cargar afinidades de un topic ────────────────────────────────
    // Al entrar en un topic, carga todas las afinidades (propias y ajenas)
    // y las fusiona en appData.affinities para que la UI las muestre.
    async function loadForTopic(topicId) {
        if (!_client() || !topicId) return;

        try {
            const { data, error } = await _client()
                .from('affinities')
                .select('from_char_id, to_char_id, value')
                .eq('topic_id', String(topicId));

            if (error) {
                window.EtheriaLogger?.warn('supabaseAffinities', 'loadForTopic:', error.message);
                return;
            }

            if (!Array.isArray(data) || data.length === 0) return;

            // Fusionar en appData.affinities[topicId]
            if (!appData.affinities) appData.affinities = {};
            if (!appData.affinities[topicId]) appData.affinities[topicId] = {};

            data.forEach(row => {
                const key = `${row.from_char_id}_${row.to_char_id}`;
                appData.affinities[topicId][key] = Number(row.value) || 0;
            });

            window.EtheriaLogger?.info?.('supabaseAffinities',
                `${data.length} afinidades cargadas para topic ${topicId}`);

            // Refrescar la UI si está activa
            if (String(topicId) === String(currentTopicId) &&
                typeof updateAffinityDisplay === 'function') {
                updateAffinityDisplay();
            }
        } catch (err) {
            window.EtheriaLogger?.warn('supabaseAffinities', 'loadForTopic error:', err?.message);
        }
    }

    // ── Suscripción Realtime ─────────────────────────────────────────
    // Escucha cambios en affinities del topic activo.
    // Cuando otro usuario modifica su afinidad, se refleja inmediatamente.
    function subscribeToTopic(topicId) {
        if (!_client() || !topicId) return;
        if (_currentTopic === String(topicId) && _channel) return; // ya suscrito

        _unsubscribe();
        _currentTopic = String(topicId);

        _channel = _client()
            .channel(`affinities:${topicId}`)
            .on('postgres_changes', {
                event:  '*',
                schema: 'public',
                table:  'affinities',
                filter: `topic_id=eq.${topicId}`,
            }, _onRealtimeChange)
            .subscribe(status => {
                if (status === 'SUBSCRIBED') {
                    window.EtheriaLogger?.info?.('supabaseAffinities',
                        `Realtime activo para topic ${topicId}`);
                }
            });
    }

    function _onRealtimeChange(payload) {
        const row = payload.new || payload.old;
        if (!row) return;

        const { from_char_id, to_char_id, topic_id, value } = row;
        if (!topic_id || !from_char_id || !to_char_id) return;

        // Actualizar appData
        if (!appData.affinities) appData.affinities = {};
        if (!appData.affinities[topic_id]) appData.affinities[topic_id] = {};

        const key = `${from_char_id}_${to_char_id}`;

        if (payload.eventType === 'DELETE') {
            delete appData.affinities[topic_id][key];
        } else {
            appData.affinities[topic_id][key] = Number(value) || 0;
        }

        // Refrescar UI si estamos viendo este topic
        if (String(topic_id) === String(currentTopicId) &&
            typeof updateAffinityDisplay === 'function') {
            updateAffinityDisplay();
        }

        // Actualizar también el vínculo en character_bonds
        if (typeof SupabaseBonds !== 'undefined') {
            SupabaseBonds.syncAffinity(from_char_id, to_char_id, Number(value) || 0).catch(() => {});
        }

        window.EtheriaLogger?.info?.('supabaseAffinities',
            `Realtime: ${from_char_id}→${to_char_id} = ${value}`);
    }

    function _unsubscribe() {
        if (_channel && _client()) {
            try { _client().removeChannel(_channel); } catch {}
            _channel = null;
        }
        _currentTopic = null;
    }

    // ── Migrar afinidades del blob local a Supabase ──────────────────
    // Se llama una sola vez al hacer login si hay datos locales.
    // Sube las afinidades que estaban guardadas en appData.affinities (blob).
    async function migrateLocalAffinities() {
        const uid = await _ensureUserId();
        if (!uid || !appData?.affinities) return;

        const rows = [];
        Object.entries(appData.affinities).forEach(([topicId, pairs]) => {
            if (typeof pairs !== 'object') return;
            Object.entries(pairs).forEach(([key, value]) => {
                // key puede ser "fromId_toId" (nuevo) o "id1_id2" ordenado (legacy simétrico)
                const parts = key.split('_');
                if (parts.length < 2) return;
                // Para datos legacy simétricos tomamos el valor tal cual
                // (no podemos saber la dirección, así que lo subimos como está)
                const fromId = parts[0];
                const toId   = parts.slice(1).join('_'); // por si el id tiene guiones
                rows.push({
                    from_char_id:  String(fromId),
                    to_char_id:    String(toId),
                    topic_id:      String(topicId),
                    owner_user_id: uid,
                    value:         Math.max(0, Math.min(100, Number(value) || 0)),
                });
            });
        });

        if (rows.length === 0) return;

        try {
            const { error } = await _client()
                .from('affinities')
                .upsert(rows, {
                    onConflict:      'from_char_id,to_char_id,topic_id',
                    ignoreDuplicates: true, // no sobreescribir datos más recientes
                });
            if (error) {
                window.EtheriaLogger?.warn('supabaseAffinities', 'migrate failed:', error.message);
            } else {
                window.EtheriaLogger?.info?.('supabaseAffinities',
                    `${rows.length} afinidades migradas a Supabase`);
            }
        } catch (err) {
            window.EtheriaLogger?.warn('supabaseAffinities', 'migrate error:', err?.message);
        }
    }

    // ── Init ─────────────────────────────────────────────────────────
    (function _init() {
        // Cachear userId al autenticarse
        window.addEventListener('etheria:auth-changed', async function (e) {
            if (e.detail?.user) {
                _userId = e.detail.user.id || null;
                if (!_userId) {
                    try {
                        const { data } = await _client().auth.getUser();
                        _userId = data?.user?.id || null;
                    } catch { _userId = null; }
                }
                // Migrar datos locales si existen
                if (_userId) migrateLocalAffinities().catch(() => {});
            } else {
                _userId = null;
                _unsubscribe();
            }
        });

        // Suscribirse al topic cuando se entra
        window.addEventListener('etheria:topic-enter', function (e) {
            const topicId = e.detail?.topicId;
            if (!topicId) return;
            loadForTopic(topicId).catch(() => {});
            subscribeToTopic(topicId);
        });

        // Desuscribirse al salir
        window.addEventListener('etheria:topic-leave', function () {
            _unsubscribe();
        });

        // Sincronizar con Supabase cuando la afinidad cambia en el cliente
        if (typeof eventBus !== 'undefined') {
            _bindAffinityEvent();
        } else {
            // eventBus puede no estar disponible aún — esperar
            window.addEventListener('etheria:section-changed', function _waitBus() {
                if (typeof eventBus !== 'undefined') {
                    _bindAffinityEvent();
                    window.removeEventListener('etheria:section-changed', _waitBus);
                }
            });
        }
    })();

    function _bindAffinityEvent() {
        eventBus.on('affinity:changed', function (detail) {
            const { activeCharId, targetCharId, newValue, topicId } = detail || {};
            if (!activeCharId || !targetCharId || !topicId) return;
            upsert(activeCharId, targetCharId, topicId, newValue).catch(() => {});
        });
    }

    return {
        upsert,
        loadForTopic,
        subscribeToTopic,
        unsubscribe: _unsubscribe,
        migrateLocalAffinities,
    };

})();

window.SupabaseAffinities = SupabaseAffinities;
