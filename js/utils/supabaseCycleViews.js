// ═══════════════════════════════════════════════════════════════════
// SUPABASE CYCLE VIEWS — Registro personal de Ecos del ciclo vistos
//
// Gestiona la tabla `cycle_views`:
//   - getUnseenForTopic(topicId) → ciclos cerrados no vistos por el
//     usuario activo en ese tema
//   - markSeen(cycleId) → registra la visualización del panel
//
// Si Supabase no está disponible la app continúa sin errores.
// ═══════════════════════════════════════════════════════════════════

const SupabaseCycleViews = (function () {

    function _client()      { return window.supabaseClient || null; }
    function _isAvailable() { return !!_client(); }

    function _warn(...args) {
        window.EtheriaLogger?.warn('supabaseCycleViews', ...args);
    }

    // ── userId en caché ───────────────────────────────────────────────

    let _userId = null;

    async function _ensureUserId() {
        if (_userId) return _userId;
        try {
            const { data } = await _client().auth.getUser();
            _userId = data?.user?.id || null;
        } catch { _userId = null; }
        return _userId;
    }

    window.addEventListener('etheria:auth-changed', function (e) {
        _userId = e.detail?.user?.id || null;
    });

    // ── getUnseenForTopic ─────────────────────────────────────────────
    // Devuelve los ciclos cerrados del topic que el usuario actual
    // no ha marcado como vistos todavía.

    async function getUnseenForTopic(topicId) {
        if (!_isAvailable() || !topicId) return [];

        const uid = await _ensureUserId();
        if (!uid) return [];

        try {
            // 1. Ciclos cerrados del topic
            const { data: cycles, error: cyclesErr } = await _client()
                .from('topic_cycles')
                .select('id')
                .eq('topic_id', String(topicId))
                .eq('status', 'closed');

            if (cyclesErr) { _warn('getUnseen cycles error:', cyclesErr.message); return []; }
            if (!cycles || cycles.length === 0) return [];

            const cycleIds = cycles.map(c => c.id);

            // 2. De esos ciclos, cuáles ya ha visto este usuario
            const { data: views, error: viewsErr } = await _client()
                .from('cycle_views')
                .select('cycle_id')
                .eq('user_id', uid)
                .in('cycle_id', cycleIds);

            if (viewsErr) { _warn('getUnseen views error:', viewsErr.message); return []; }

            const seenIds = new Set((views || []).map(v => v.cycle_id));
            return cycleIds.filter(id => !seenIds.has(id));

        } catch (e) {
            _warn('getUnseenForTopic exception:', e.message);
            return [];
        }
    }

    // ── markSeen ──────────────────────────────────────────────────────
    // Registra que el usuario actual ha visto el panel de un ciclo.
    // Usa upsert para respetar la restricción única (cycle_id, user_id).

    async function markSeen(cycleId) {
        if (!_isAvailable() || !cycleId) return;

        const uid = await _ensureUserId();
        if (!uid) return;

        try {
            const { error } = await _client()
                .from('cycle_views')
                .upsert(
                    { cycle_id: cycleId, user_id: uid, viewed_at: new Date().toISOString() },
                    { onConflict: 'cycle_id,user_id' }
                );

            if (error) _warn('markSeen error:', error.message);
        } catch (e) {
            _warn('markSeen exception:', e.message);
        }
    }

    // ── Public API ────────────────────────────────────────────────────

    return { getUnseenForTopic, markSeen };

})();

window.SupabaseCycleViews = SupabaseCycleViews;
