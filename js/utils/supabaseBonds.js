// ═══════════════════════════════════════════════════════════════════
// SUPABASE BONDS — Vínculos direccionales entre personajes
// Gestiona la tabla character_bonds:
//   - Creación automática al participar en una historia
//   - Sincronización de afinidad cuando cambia
//   - Edición de notas por el dueño del personaje
// ═══════════════════════════════════════════════════════════════════

const SupabaseBonds = (function () {

    function _client() { return window.supabaseClient || null; }
    function _isAvailable() { return !!_client() && !!_currentUserId(); }
    function _currentUserId() {
        return window.supabaseClient?.auth?.getUser
            ? window.__bondsCurrentUserId || null
            : null;
    }

    // Cachear el userId para no llamar a getUser en cada operación
    let _userId = null;
    async function _ensureUserId() {
        if (_userId) return _userId;
        try {
            const { data } = await _client().auth.getUser();
            _userId = data?.user?.id || null;
        } catch { _userId = null; }
        return _userId;
    }

    // ── Rango desde valor numérico ───────────────────────────────────
    function _rankName(affinity) {
        if (!window.affinityRanks) return 'Desconocidos';
        const rank = window.affinityRanks.find(r =>
            affinity >= r.min && affinity <= r.max
        );
        return rank ? rank.name : 'Desconocidos';
    }

    // ── Upsert de un vínculo individual ─────────────────────────────
    // Crea o actualiza el vínculo from_char → to_char para el usuario actual.
    async function upsertBond({ fromCharId, toCharId, storyId = null, affinity = 0, note = null }) {
        const uid = await _ensureUserId();
        if (!uid || !fromCharId || !toCharId || fromCharId === toCharId) return { ok: false };

        const row = {
            from_char_id:  String(fromCharId),
            to_char_id:    String(toCharId),
            owner_user_id: uid,
            story_id:      storyId || null,
            affinity:      Math.max(0, Math.min(100, Number(affinity) || 0)),
            rank_name:     _rankName(affinity),
        };
        // Solo incluir note si se pasa explícitamente
        if (note !== null) row.note = note;

        try {
            const { error } = await _client()
                .from('character_bonds')
                .upsert(row, { onConflict: 'from_char_id,to_char_id', ignoreDuplicates: false });
            if (error) {
                window.EtheriaLogger?.warn('supabaseBonds', 'upsertBond failed:', error.message);
                return { ok: false, error: error.message };
            }
            return { ok: true };
        } catch (err) {
            window.EtheriaLogger?.warn('supabaseBonds', 'upsertBond error:', err?.message);
            return { ok: false };
        }
    }

    // ── Crear vínculos automáticos al entrar a una historia ──────────
    // Para cada par de personajes (A, B) presentes en la historia,
    // crea A→B y B→A si no existen ya. Solo crea los vínculos donde
    // from_char pertenece al usuario actual.
    async function ensureStoryBonds(storyId, participantCharIds) {
        const uid = await _ensureUserId();
        if (!uid || !storyId || !Array.isArray(participantCharIds) || participantCharIds.length < 2) return;

        // Personajes que pertenecen al usuario actual
        const myChars = (appData?.characters || [])
            .filter(c => c.userIndex === currentUserIndex)
            .map(c => String(c.id));

        const myParticipants = participantCharIds
            .map(String)
            .filter(id => myChars.includes(id));

        if (myParticipants.length === 0) return;

        // Para cada uno de mis personajes, crear vínculo hacia todos los demás
        const others = participantCharIds.map(String).filter(id => !myChars.includes(id) || myParticipants.includes(id));

        const tasks = [];
        for (const fromId of myParticipants) {
            for (const toId of participantCharIds.map(String)) {
                if (fromId === toId) continue;
                // Verificar si ya existe (evitar sobrescribir afinidad con 0)
                tasks.push(_ensureBondExists(fromId, toId, storyId, uid));
            }
        }
        await Promise.allSettled(tasks);
    }

    async function _ensureBondExists(fromCharId, toCharId, storyId, uid) {
        try {
            // Intentar insertar solo si no existe (ignoreDuplicates: true)
            const { error } = await _client()
                .from('character_bonds')
                .upsert({
                    from_char_id:  fromCharId,
                    to_char_id:    toCharId,
                    owner_user_id: uid,
                    story_id:      storyId,
                    affinity:      0,
                    rank_name:     'Desconocidos',
                }, { onConflict: 'from_char_id,to_char_id', ignoreDuplicates: true });
            if (error) window.EtheriaLogger?.warn('supabaseBonds', '_ensureBondExists:', error.message);
        } catch (err) {
            window.EtheriaLogger?.warn('supabaseBonds', '_ensureBondExists error:', err?.message);
        }
    }

    // ── Sincronizar afinidad cuando cambia ───────────────────────────
    async function syncAffinity(fromCharId, toCharId, affinity) {
        const uid = await _ensureUserId();
        if (!uid || !fromCharId || !toCharId) return;

        try {
            const { error } = await _client()
                .from('character_bonds')
                .update({
                    affinity:  Math.max(0, Math.min(100, Number(affinity) || 0)),
                    rank_name: _rankName(affinity),
                    updated_at: new Date().toISOString(),
                })
                .eq('from_char_id', String(fromCharId))
                .eq('to_char_id',   String(toCharId))
                .eq('owner_user_id', uid);
            if (error) window.EtheriaLogger?.warn('supabaseBonds', 'syncAffinity:', error.message);
        } catch (err) {
            window.EtheriaLogger?.warn('supabaseBonds', 'syncAffinity error:', err?.message);
        }
    }

    // ── Actualizar nota (solo el dueño) ──────────────────────────────
    async function updateNote(fromCharId, toCharId, note) {
        const uid = await _ensureUserId();
        if (!uid || !fromCharId || !toCharId) return { ok: false };

        try {
            const { error } = await _client()
                .from('character_bonds')
                .update({ note, updated_at: new Date().toISOString() })
                .eq('from_char_id',  String(fromCharId))
                .eq('to_char_id',    String(toCharId))
                .eq('owner_user_id', uid);
            if (error) return { ok: false, error: error.message };
            return { ok: true };
        } catch (err) {
            return { ok: false, error: err?.message };
        }
    }

    // ── Cargar todos los vínculos relevantes para la sección ─────────
    // Devuelve todos los vínculos donde from_char es un personaje del usuario,
    // más todos los vínculos de otros usuarios hacia esos mismos personajes
    // (para ver la perspectiva recíproca).
    async function loadBondsForUser() {
        const uid = await _ensureUserId();
        if (!uid) return [];

        try {
            const myCharIds = (appData?.characters || [])
                .filter(c => c.userIndex === currentUserIndex)
                .map(c => String(c.id));

            if (myCharIds.length === 0) return [];

            // Vínculos salientes (mis personajes → otros)
            const { data: outgoing, error: e1 } = await _client()
                .from('character_bonds')
                .select('*')
                .in('from_char_id', myCharIds);

            // Vínculos entrantes (otros → mis personajes), para ver la perspectiva recíproca
            const { data: incoming, error: e2 } = await _client()
                .from('character_bonds')
                .select('*')
                .in('to_char_id', myCharIds);

            if (e1) window.EtheriaLogger?.warn('supabaseBonds', 'loadBonds outgoing:', e1.message);
            if (e2) window.EtheriaLogger?.warn('supabaseBonds', 'loadBonds incoming:', e2.message);

            return {
                outgoing: outgoing || [],
                incoming: incoming || [],
            };
        } catch (err) {
            window.EtheriaLogger?.warn('supabaseBonds', 'loadBondsForUser error:', err?.message);
            return { outgoing: [], incoming: [] };
        }
    }

    // ── Inicialización: cachear userId, escuchar afinidad y Realtime ──
    let _bondsChannel = null;

    function _subscribeBondsRealtime(myCharIds) {
        if (!_client() || !myCharIds?.length) return;
        if (_bondsChannel) {
            try { _client().removeChannel(_bondsChannel); } catch {}
            _bondsChannel = null;
        }
        // Escuchar cambios en vínculos donde to_char_id es uno de mis personajes
        // (para ver en tiempo real cuando alguien actualiza su perspectiva hacia mí)
        _bondsChannel = _client()
            .channel('character_bonds:incoming')
            .on('postgres_changes', {
                event:  '*',
                schema: 'public',
                table:  'character_bonds',
            }, function (payload) {
                const row = payload.new || payload.old;
                if (!row) return;
                // Solo nos importa si involucra a uno de nuestros personajes
                const relevant = myCharIds.includes(String(row.to_char_id)) ||
                                 myCharIds.includes(String(row.from_char_id));
                if (!relevant) return;
                // Notificar a BondsUI para que recargue si está abierto
                window.dispatchEvent(new CustomEvent('etheria:bonds-changed', { detail: row }));
            })
            .subscribe();
    }

    (function _init() {
        // Cachear userId cuando cambia la auth
        window.addEventListener('etheria:auth-changed', async function (e) {
            if (e.detail?.user) {
                _userId = e.detail.user.id || null;
                if (!_userId) {
                    try {
                        const { data } = await _client().auth.getUser();
                        _userId = data?.user?.id || null;
                    } catch { _userId = null; }
                }
                // Suscribir Realtime con los personajes del usuario activo
                const myCharIds = (appData?.characters || [])
                    .filter(c => c.userIndex === currentUserIndex)
                    .map(c => String(c.id));
                _subscribeBondsRealtime(myCharIds);
            } else {
                _userId = null;
                if (_bondsChannel && _client()) {
                    try { _client().removeChannel(_bondsChannel); } catch {}
                    _bondsChannel = null;
                }
            }
        });

        // Re-suscribir cuando cambian los personajes cargados
        window.addEventListener('etheria:cloud-characters-loaded', function () {
            const myCharIds = (appData?.characters || [])
                .filter(c => c.userIndex === currentUserIndex)
                .map(c => String(c.id));
            _subscribeBondsRealtime(myCharIds);
        });

        // Sincronizar afinidad con Supabase cuando cambia (ya lo hace SupabaseAffinities,
        // pero bonds también necesita actualizar rank_name)
        if (typeof eventBus !== 'undefined') {
            eventBus.on('affinity:changed', function (detail) {
                const { activeCharId, targetCharId, newValue } = detail || {};
                if (!activeCharId || !targetCharId) return;
                syncAffinity(activeCharId, targetCharId, newValue).catch(() => {});
            });
        } else {
            window.addEventListener('etheria:section-changed', function _waitBus() {
                if (typeof eventBus !== 'undefined') {
                    eventBus.on('affinity:changed', function (detail) {
                        const { activeCharId, targetCharId, newValue } = detail || {};
                        if (!activeCharId || !targetCharId) return;
                        syncAffinity(activeCharId, targetCharId, newValue).catch(() => {});
                    });
                    window.removeEventListener('etheria:section-changed', _waitBus);
                }
            });
        }
    })();

    return {
        upsertBond,
        ensureStoryBonds,
        syncAffinity,
        updateNote,
        loadBondsForUser,
    };

})();

window.SupabaseBonds = SupabaseBonds;
