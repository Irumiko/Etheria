// ═══════════════════════════════════════════════════════════════════
// SUPABASE JOURNALS — Diarios de historia
// Mueve los journals del blob user_data a su propia tabla.
// ═══════════════════════════════════════════════════════════════════

const SupabaseJournals = (function () {

    let _userId = null;

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

    // ── Cargar todos los journals del usuario ────────────────────────
    async function loadAll() {
        const uid = await _ensureUserId();
        if (!uid) return {};
        try {
            const { data, error } = await _client()
                .from('journals')
                .select('topic_id, content')
                .eq('user_id', uid);
            if (error) { window.EtheriaLogger?.warn('supabaseJournals', 'loadAll:', error.message); return {}; }
            const result = {};
            (data || []).forEach(row => { result[row.topic_id] = row.content; });
            return result;
        } catch (err) {
            window.EtheriaLogger?.warn('supabaseJournals', 'loadAll error:', err?.message);
            return {};
        }
    }

    // ── Guardar o actualizar un journal ─────────────────────────────
    async function upsert(topicId, content) {
        const uid = await _ensureUserId();
        if (!uid || !topicId) return { ok: false };
        try {
            const { error } = await _client()
                .from('journals')
                .upsert({
                    user_id:    uid,
                    topic_id:   String(topicId),
                    content:    content || {},
                    updated_at: new Date().toISOString(),
                }, { onConflict: 'user_id,topic_id' });
            if (error) { window.EtheriaLogger?.warn('supabaseJournals', 'upsert:', error.message); return { ok: false }; }
            return { ok: true };
        } catch (err) {
            window.EtheriaLogger?.warn('supabaseJournals', 'upsert error:', err?.message);
            return { ok: false };
        }
    }

    // ── Migrar journals del blob local ───────────────────────────────
    async function migrateFromBlob() {
        const uid = await _ensureUserId();
        if (!uid || !appData?.journals || !Object.keys(appData.journals).length) return;
        const entries = Object.entries(appData.journals);
        if (!entries.length) return;
        try {
            const rows = entries.map(([topicId, content]) => ({
                user_id:  uid,
                topic_id: String(topicId),
                content:  content || {},
            }));
            const { error } = await _client()
                .from('journals')
                .upsert(rows, { onConflict: 'user_id,topic_id', ignoreDuplicates: true });
            if (error) window.EtheriaLogger?.warn('supabaseJournals', 'migrate:', error.message);
            else window.EtheriaLogger?.info?.('supabaseJournals', `${rows.length} journals migrados`);
        } catch (err) {
            window.EtheriaLogger?.warn('supabaseJournals', 'migrate error:', err?.message);
        }
    }

    // ── Init ─────────────────────────────────────────────────────────
    (function _init() {
        window.addEventListener('etheria:auth-changed', async function (e) {
            if (e.detail?.user) {
                _userId = e.detail.user.id || null;
                if (!_userId) {
                    try { const { data } = await _client().auth.getUser(); _userId = data?.user?.id || null; }
                    catch { _userId = null; }
                }
                if (_userId) {
                    // Cargar journals desde Supabase y fusionar en appData
                    loadAll().then(journals => {
                        if (Object.keys(journals).length > 0) {
                            appData.journals = { ...appData.journals, ...journals };
                        }
                        // Migrar datos locales que no estén en la nube
                        migrateFromBlob().catch(() => {});
                    }).catch(() => {});
                }
            } else {
                _userId = null;
            }
        });
    })();

    return { loadAll, upsert, migrateFromBlob };

})();

window.SupabaseJournals = SupabaseJournals;
