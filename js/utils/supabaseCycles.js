// ═══════════════════════════════════════════════════════════════════
// SUPABASE CYCLES — Sistema de ciclos, elecciones y bifurcación de ramas
//
// Gestiona:
//   - Ciclos de tema (topic_cycles): apertura, cierre, participantes
//   - Elecciones (cycle_choices + cycle_choice_options): crear, responder
//   - Respuestas (cycle_choice_responses): ocultas hasta cierre del ciclo
//   - Panel "Ecos del ciclo": muestra cambios de afinidad al cerrar
//   - Bifurcación de rama: modal de selección cuando value >= BIFURCATION_MIN
//   - Sincronización Realtime de ciclos y elecciones abiertas
//
// Arquitectura:
//   - No importa nada de classic/ ni rpg/
//   - Comunica cambios vía eventBus ('cycle:opened', 'cycle:closed',
//     'cycle:choice-created', 'cycle:response-saved', 'cycle:branch-chosen')
//   - La UI (roleplay.js / vn.js) escucha esos eventos para refrescar
// ═══════════════════════════════════════════════════════════════════

const SupabaseCycles = (function () {

    let _userId       = null;
    let _channel      = null;
    let _currentTopic = null;

    function _client() { return window.supabaseClient || null; }
    function _cfg()    { return window.CYCLE_CONFIG || {}; }

    async function _ensureUserId() {
        if (_userId) return _userId;
        try {
            const { data } = await _client().auth.getUser();
            _userId = data?.user?.id || null;
        } catch { _userId = null; }
        return _userId;
    }

    // ── Ciclos ───────────────────────────────────────────────────────────────

    // Abre un nuevo ciclo para un topic. Solo si no hay uno abierto.
    async function openCycle(topicId, participantUserIds = []) {
        const uid = await _ensureUserId();
        if (!uid || !topicId) return null;

        // Comprobar si ya hay uno abierto
        const existing = await getOpenCycle(topicId);
        if (existing) return existing;

        const closesAt = new Date(Date.now() + (_cfg().DURATION_HOURS || 72) * 3600 * 1000);

        const { data, error } = await _client()
            .from('topic_cycles')
            .insert({
                topic_id:     String(topicId),
                created_by:   uid,
                closes_at:    closesAt.toISOString(),
                status:       'open',
                participants: participantUserIds,
            })
            .select()
            .single();

        if (error) {
            window.EtheriaLogger?.warn('SupabaseCycles', 'openCycle error:', error.message);
            return null;
        }

        if (typeof eventBus !== 'undefined') {
            eventBus.emit('cycle:opened', { topicId, cycle: data });
        }

        window.EtheriaLogger?.info?.('SupabaseCycles', `Ciclo abierto: ${data.id}`);
        return data;
    }

    // Devuelve el ciclo abierto de un topic, o null si no hay ninguno.
    async function getOpenCycle(topicId) {
        if (!_client() || !topicId) return null;
        const { data, error } = await _client()
            .from('topic_cycles')
            .select('*')
            .eq('topic_id', String(topicId))
            .eq('status', 'open')
            .order('started_at', { ascending: false })
            .limit(1)
            .maybeSingle();

        if (error) {
            window.EtheriaLogger?.warn('SupabaseCycles', 'getOpenCycle error:', error.message);
            return null;
        }
        return data;
    }

    // Cierra un ciclo y emite el evento para mostrar los "Ecos del ciclo".
    async function closeCycle(cycleId, topicId) {
        if (!_client() || !cycleId) return false;

        const { error } = await _client()
            .from('topic_cycles')
            .update({ status: 'closed', closed_at: new Date().toISOString() })
            .eq('id', cycleId);

        if (error) {
            window.EtheriaLogger?.warn('SupabaseCycles', 'closeCycle error:', error.message);
            return false;
        }

        // Resolver todas las elecciones abiertas del ciclo
        await _client()
            .from('cycle_choices')
            .update({ status: 'resolved', resolved_at: new Date().toISOString() })
            .eq('cycle_id', cycleId)
            .eq('status', 'open');

        // Calcular y aplicar los impactos de afinidad del ciclo
        await _applyAffinityImpacts(cycleId, topicId);

        if (typeof eventBus !== 'undefined') {
            eventBus.emit('cycle:closed', { cycleId, topicId });
        }

        if (window.SupabaseExtras?.logActivity) {
            window.SupabaseExtras.logActivity('cycle_closed', 'story', String(topicId),
                { cycleId }).catch(() => {});
        }

        window.EtheriaLogger?.info?.('SupabaseCycles', `Ciclo cerrado: ${cycleId}`);
        return true;
    }

    // Comprueba si todos los participantes han respondido → cierre automático.
    async function checkAutoClose(cycleId, topicId) {
        if (!_client() || !cycleId) return;

        const cycle = await _client()
            .from('topic_cycles')
            .select('participants, status')
            .eq('id', cycleId)
            .single();

        if (cycle.error || cycle.data?.status !== 'open') return;

        const participants = cycle.data.participants || [];
        if (participants.length === 0) return;

        // Ver si todos los participantes tienen al menos un mensaje en este ciclo
        // (simplificado: verificar via cycle_choice_responses o mensajes desde started_at)
        // Por ahora: cierre por tiempo (closes_at) lo maneja el backend/cron.
        // El cierre manual lo puede triggerar el creador del topic.

        // Cierre automático por tiempo — comparar closes_at con now()
        const { data: cycleData } = await _client()
            .from('topic_cycles')
            .select('closes_at')
            .eq('id', cycleId)
            .single();

        if (cycleData && new Date(cycleData.closes_at) < new Date()) {
            await closeCycle(cycleId, topicId);
        }
    }

    // ── Elecciones ───────────────────────────────────────────────────────────

    // Crea una elección en el ciclo activo.
    // options: [{ label: 'A', text: '...', affinity_impact: 2 }, ...]
    async function createChoice(cycleId, topicId, authorCharId, questionText, options = []) {
        const uid = await _ensureUserId();
        if (!uid || !cycleId) return null;

        // Validar que el usuario no haya lanzado ya una elección en este ciclo
        const canCreate = await canLaunchChoice(cycleId);
        if (!canCreate) {
            window.EtheriaLogger?.warn('SupabaseCycles', 'Ya lanzaste una elección en este ciclo');
            return null;
        }

        // Crear la elección
        const { data: choice, error: choiceErr } = await _client()
            .from('cycle_choices')
            .insert({
                cycle_id:       cycleId,
                topic_id:       String(topicId),
                author_char_id: String(authorCharId),
                author_user_id: uid,
                question_text:  questionText,
                status:         'open',
            })
            .select()
            .single();

        if (choiceErr) {
            window.EtheriaLogger?.warn('SupabaseCycles', 'createChoice error:', choiceErr.message);
            return null;
        }

        // Crear las opciones
        const optRows = options.map((opt, i) => ({
            choice_id:       choice.id,
            label:           opt.label || String.fromCharCode(65 + i), // A, B, C...
            option_text:     opt.text,
            affinity_impact: Math.max(-3, Math.min(3, Number(opt.affinity_impact) || 0)),
            display_order:   i,
        }));

        const { error: optsErr } = await _client()
            .from('cycle_choice_options')
            .insert(optRows);

        if (optsErr) {
            window.EtheriaLogger?.warn('SupabaseCycles', 'createOptions error:', optsErr.message);
        }

        if (typeof eventBus !== 'undefined') {
            eventBus.emit('cycle:choice-created', { topicId, cycleId, choice });
        }

        if (window.SupabaseExtras?.logActivity) {
            window.SupabaseExtras.logActivity('choice_launched', 'story', String(topicId),
                { cycleId, choiceId: choice.id, authorCharId }).catch(() => {});
        }

        window.EtheriaLogger?.info?.('SupabaseCycles', `Elección creada: ${choice.id}`);
        return choice;
    }

    // Guarda la respuesta de un personaje a una elección.
    async function saveResponse(choiceId, optionId, cycleId, topicId, responderCharId) {
        const uid = await _ensureUserId();
        if (!uid || !choiceId || !optionId) return false;

        const { error } = await _client()
            .from('cycle_choice_responses')
            .upsert({
                choice_id:          choiceId,
                option_id:          optionId,
                cycle_id:           cycleId,
                topic_id:           String(topicId),
                responder_char_id:  String(responderCharId),
                responder_user_id:  uid,
            }, { onConflict: 'choice_id,responder_char_id' });

        if (error) {
            window.EtheriaLogger?.warn('SupabaseCycles', 'saveResponse error:', error.message);
            return false;
        }

        if (typeof eventBus !== 'undefined') {
            eventBus.emit('cycle:response-saved', { choiceId, optionId, topicId });
        }

        if (window.SupabaseExtras?.logActivity) {
            window.SupabaseExtras.logActivity('choice_responded', 'story', String(topicId),
                { choiceId, cycleId, responderCharId }).catch(() => {});
        }

        return true;
    }

    // Carga las elecciones abiertas de un ciclo (visibles para todos).
    async function loadChoicesForCycle(cycleId) {
        if (!_client() || !cycleId) return [];

        const { data, error } = await _client()
            .from('cycle_choices')
            .select(`
                *,
                cycle_choice_options (*)
            `)
            .eq('cycle_id', cycleId)
            .order('created_at', { ascending: true });

        if (error) {
            window.EtheriaLogger?.warn('SupabaseCycles', 'loadChoices error:', error.message);
            return [];
        }

        return data || [];
    }

    // Carga las respuestas visibles del ciclo.
    // Mientras el ciclo está abierto: RLS solo devuelve las propias.
    // Cuando está cerrado: devuelve todas.
    async function loadResponsesForCycle(cycleId) {
        if (!_client() || !cycleId) return [];

        const { data, error } = await _client()
            .from('cycle_choice_responses')
            .select('*')
            .eq('cycle_id', cycleId);

        if (error) {
            window.EtheriaLogger?.warn('SupabaseCycles', 'loadResponses error:', error.message);
            return [];
        }

        return data || [];
    }

    // ¿Puede el usuario actual lanzar una elección en este ciclo?
    // Regla: solo si no ha lanzado ya una en este ciclo.
    async function canLaunchChoice(cycleId) {
        const uid = await _ensureUserId();
        if (!uid || !cycleId) return false;

        const { data, error } = await _client()
            .from('cycle_choices')
            .select('id')
            .eq('cycle_id', cycleId)
            .eq('author_user_id', uid)
            .limit(1);

        if (error) return false;
        return !data || data.length === 0;
    }

    // ── Impactos de afinidad al cerrar el ciclo ──────────────────────────────
    // Solo afecta al autor de la elección y a quienes respondieron.
    async function _applyAffinityImpacts(cycleId, topicId) {
        const uid = await _ensureUserId();
        if (!uid) return;

        // Cargar elecciones y respuestas del ciclo
        const choices = await loadChoicesForCycle(cycleId);
        const responses = await loadResponsesForCycle(cycleId);

        if (!choices.length || !responses.length) return;

        // Para cada elección, calcular el impacto entre el autor y cada respondedor
        const affinityChanges = []; // { fromCharId, toCharId, delta }

        for (const choice of choices) {
            const opts = (choice.cycle_choice_options || []).reduce((acc, o) => {
                acc[o.id] = o;
                return acc;
            }, {});

            const choiceResponses = responses.filter(r => r.choice_id === choice.id);

            for (const resp of choiceResponses) {
                const opt = opts[resp.option_id];
                if (!opt) continue;

                // La afinidad cambia entre el autor de la elección y el respondedor
                affinityChanges.push({
                    fromCharId: choice.author_char_id,
                    toCharId:   resp.responder_char_id,
                    delta:      opt.affinity_impact,
                });
            }
        }

        // Aplicar los cambios acumulados en la tabla affinities
        for (const change of affinityChanges) {
            if (typeof SupabaseAffinities !== 'undefined') {
                const key    = `${change.fromCharId}_${change.toCharId}`;
                const topicAff = (window.appData?.affinities?.[topicId] || {});
                const current  = Number(topicAff[key]) || 0;
                const newVal   = Math.max(-100, Math.min(100, current + change.delta));

                await SupabaseAffinities.upsert(
                    change.fromCharId,
                    change.toCharId,
                    topicId,
                    newVal
                );

                // Actualizar en memoria para el panel de Ecos
                if (window.appData?.affinities?.[topicId]) {
                    window.appData.affinities[topicId][key] = newVal;
                }
            }
        }

        // Emitir los cambios para el panel "Ecos del ciclo"
        if (typeof eventBus !== 'undefined' && affinityChanges.length > 0) {
            eventBus.emit('cycle:affinity-impacts', {
                cycleId,
                topicId,
                changes: affinityChanges,
            });
        }
    }

    // ── Bifurcación de rama ──────────────────────────────────────────────────
    // Guarda la elección de rama del usuario para un par de personajes.
    async function chooseBranch(fromCharId, toCharId, topicId, relationType) {
        const uid = await _ensureUserId();
        if (!uid || !fromCharId || !toCharId || !topicId) return false;

        const validTypes = ['friendship', 'romance', 'rivalry', 'enmity'];
        if (!validTypes.includes(relationType)) return false;

        const { error } = await _client()
            .from('affinities')
            .update({
                relation_type:    relationType,
                branch_chosen_at: new Date().toISOString(),
            })
            .eq('from_char_id', String(fromCharId))
            .eq('to_char_id',   String(toCharId))
            .eq('topic_id',     String(topicId))
            .eq('owner_user_id', uid);

        if (error) {
            window.EtheriaLogger?.warn('SupabaseCycles', 'chooseBranch error:', error.message);
            return false;
        }

        // Actualizar en memoria
        const key = `${fromCharId}_${toCharId}`;
        if (window.appData?.affinities?.[topicId]) {
            // Guardar el relation_type en memoria junto al valor
            if (!window.appData.affinityTypes) window.appData.affinityTypes = {};
            if (!window.appData.affinityTypes[topicId]) window.appData.affinityTypes[topicId] = {};
            window.appData.affinityTypes[topicId][key] = relationType;
        }

        if (typeof eventBus !== 'undefined') {
            eventBus.emit('cycle:branch-chosen', {
                fromCharId, toCharId, topicId, relationType
            });
        }

        if (window.SupabaseExtras?.logActivity) {
            window.SupabaseExtras.logActivity('branch_chosen', 'story', String(topicId),
                { fromCharId, toCharId, relationType }).catch(() => {});
        }

        window.EtheriaLogger?.info?.('SupabaseCycles',
            `Rama elegida: ${fromCharId}→${toCharId} = ${relationType}`);
        return true;
    }

    // Carga los relation_types del topic activo junto con los valores.
    async function loadRelationTypesForTopic(topicId) {
        if (!_client() || !topicId) return;

        const { data, error } = await _client()
            .from('affinities')
            .select('from_char_id, to_char_id, relation_type')
            .eq('topic_id', String(topicId))
            .neq('relation_type', 'undefined');

        if (error || !data) return;

        if (!window.appData.affinityTypes) window.appData.affinityTypes = {};
        if (!window.appData.affinityTypes[topicId]) window.appData.affinityTypes[topicId] = {};

        data.forEach(row => {
            const key = `${row.from_char_id}_${row.to_char_id}`;
            window.appData.affinityTypes[topicId][key] = row.relation_type;
        });
    }

    // ── Realtime ─────────────────────────────────────────────────────────────
    // Escucha nuevas elecciones en el topic activo para mostrarlas en tiempo real.
    function subscribeToTopic(topicId) {
        if (!_client() || !topicId) return;
        if (_currentTopic === String(topicId) && _channel) return;

        _unsubscribe();
        _currentTopic = String(topicId);

        _channel = _client()
            .channel(`cycles:${topicId}`)
            .on('postgres_changes', {
                event:  'INSERT',
                schema: 'public',
                table:  'cycle_choices',
                filter: `topic_id=eq.${topicId}`,
            }, _onNewChoice)
            .on('postgres_changes', {
                event:  'UPDATE',
                schema: 'public',
                table:  'topic_cycles',
                filter: `topic_id=eq.${topicId}`,
            }, _onCycleUpdate)
            .subscribe();
    }

    function _onNewChoice(payload) {
        const choice = payload.new;
        if (!choice) return;
        if (typeof eventBus !== 'undefined') {
            eventBus.emit('cycle:choice-created', {
                topicId: choice.topic_id,
                cycleId: choice.cycle_id,
                choice,
                fromRealtime: true,
            });
        }
    }

    function _onCycleUpdate(payload) {
        const cycle = payload.new;
        if (!cycle) return;
        if (cycle.status === 'closed' && typeof eventBus !== 'undefined') {
            eventBus.emit('cycle:closed', {
                cycleId:      cycle.id,
                topicId:      cycle.topic_id,
                fromRealtime: true,
            });
        }
    }

    function _unsubscribe() {
        if (_channel && _client()) {
            try { _client().removeChannel(_channel); } catch {}
            _channel = null;
        }
        _currentTopic = null;
    }

    // ── Init ─────────────────────────────────────────────────────────────────
    (function _init() {
        window.addEventListener('etheria:auth-changed', async function (e) {
            if (e.detail?.user) {
                _userId = e.detail.user.id || null;
            } else {
                _userId = null;
                _unsubscribe();
            }
        });

        window.addEventListener('etheria:topic-enter', function (e) {
            const topicId = e.detail?.topicId;
            if (!topicId) return;
            loadRelationTypesForTopic(topicId).catch(() => {});
            subscribeToTopic(topicId);
        });

        window.addEventListener('etheria:topic-leave', function () {
            _unsubscribe();
        });
    })();

    return {
        openCycle,
        getOpenCycle,
        closeCycle,
        checkAutoClose,
        createChoice,
        saveResponse,
        loadChoicesForCycle,
        loadResponsesForCycle,
        canLaunchChoice,
        chooseBranch,
        loadRelationTypesForTopic,
        subscribeToTopic,
    };

})();

window.SupabaseCycles = SupabaseCycles;

