// ═══════════════════════════════════════════════════════════════════
// SUPABASE FAVORITES — Favoritos de mensajes, historias, personajes
// Mueve los favorites del blob user_data a su propia tabla.
// ═══════════════════════════════════════════════════════════════════

const SupabaseFavorites = (function () {

    let _userId = null;

    function _client() { return window.supabaseClient || null; }

    async function _ensureUserId() {
        if (_userId) return _userId;
        try {
            const { data } = await _client().auth.getUser();
            _userId = data?.user?.id || null;
        } catch { _userId = null; }
        return _userId;
    }

    // ── Cargar todos los favoritos del usuario ───────────────────────
    // Devuelve el mismo formato que appData.favorites:
    // { [entityType]: Set<entityId> } → aquí como { [entityType]: { [entityId]: true } }
    async function loadAll() {
        const uid = await _ensureUserId();
        if (!uid) return {};
        try {
            const { data, error } = await _client()
                .from('favorites')
                .select('entity_type, entity_id')
                .eq('user_id', uid);
            if (error) { window.EtheriaLogger?.warn('supabaseFavorites', 'loadAll:', error.message); return {}; }
            const result = {};
            (data || []).forEach(row => {
                if (!result[row.entity_type]) result[row.entity_type] = {};
                result[row.entity_type][row.entity_id] = true;
            });
            return result;
        } catch (err) {
            window.EtheriaLogger?.warn('supabaseFavorites', 'loadAll error:', err?.message);
            return {};
        }
    }

    // ── Añadir favorito ──────────────────────────────────────────────
    async function add(entityType, entityId) {
        const uid = await _ensureUserId();
        if (!uid || !entityType || !entityId) return { ok: false };
        try {
            const { error } = await _client()
                .from('favorites')
                .upsert({
                    user_id:     uid,
                    entity_type: entityType,
                    entity_id:   String(entityId),
                }, { onConflict: 'user_id,entity_type,entity_id', ignoreDuplicates: true });
            if (error) { window.EtheriaLogger?.warn('supabaseFavorites', 'add:', error.message); return { ok: false }; }
            return { ok: true };
        } catch (err) {
            window.EtheriaLogger?.warn('supabaseFavorites', 'add error:', err?.message);
            return { ok: false };
        }
    }

    // ── Eliminar favorito ────────────────────────────────────────────
    async function remove(entityType, entityId) {
        const uid = await _ensureUserId();
        if (!uid || !entityType || !entityId) return { ok: false };
        try {
            const { error } = await _client()
                .from('favorites')
                .delete()
                .eq('user_id',     uid)
                .eq('entity_type', entityType)
                .eq('entity_id',   String(entityId));
            if (error) { window.EtheriaLogger?.warn('supabaseFavorites', 'remove:', error.message); return { ok: false }; }
            return { ok: true };
        } catch (err) {
            window.EtheriaLogger?.warn('supabaseFavorites', 'remove error:', err?.message);
            return { ok: false };
        }
    }

    // ── Migrar favorites del blob local ──────────────────────────────
    // appData.favorites tiene formato variado según versión — lo normalizamos
    async function migrateFromBlob() {
        const uid = await _ensureUserId();
        if (!uid || !appData?.favorites) return;

        const rows = [];
        const favs = appData.favorites;

        // Formato puede ser: { messageId: true } o { message: { id: true } } o arrays
        Object.entries(favs).forEach(([key, value]) => {
            if (typeof value === 'boolean' && value) {
                // Formato plano: { entityId: true } — asumir tipo 'message'
                rows.push({ user_id: uid, entity_type: 'message', entity_id: String(key) });
            } else if (typeof value === 'object' && value !== null) {
                // Formato agrupado: { entityType: { entityId: true } }
                Object.entries(value).forEach(([entityId, active]) => {
                    if (active) rows.push({ user_id: uid, entity_type: key, entity_id: String(entityId) });
                });
            }
        });

        if (!rows.length) return;
        try {
            const { error } = await _client()
                .from('favorites')
                .upsert(rows, { onConflict: 'user_id,entity_type,entity_id', ignoreDuplicates: true });
            if (error) window.EtheriaLogger?.warn('supabaseFavorites', 'migrate:', error.message);
            else window.EtheriaLogger?.info?.('supabaseFavorites', `${rows.length} favoritos migrados`);
        } catch (err) {
            window.EtheriaLogger?.warn('supabaseFavorites', 'migrate error:', err?.message);
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
                    loadAll().then(favorites => {
                        if (Object.keys(favorites).length > 0) {
                            // Fusionar con los locales (nube tiene prioridad)
                            appData.favorites = { ...appData.favorites, ...favorites };
                        }
                        migrateFromBlob().catch(() => {});
                    }).catch(() => {});
                }
            } else {
                _userId = null;
            }
        });
    })();

    return { loadAll, add, remove, migrateFromBlob };

})();

window.SupabaseFavorites = SupabaseFavorites;
