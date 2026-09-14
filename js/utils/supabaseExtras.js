// ============================================
// SUPABASE EXTRAS — Activity Log
// ============================================

(function (global) {
    'use strict';

    function _client() { return global.supabaseClient || null; }

    async function _userId() {
        if (typeof global.getEtheriaUserId === 'function') return global.getEtheriaUserId();
        return global._cachedUserId || null;
    }

    // ── ACTIVITY LOG ─────────────────────────────────────────────────────────

    async function logActivity(action, entityType = null, entityId = null, metadata = {}) {
        const userId = await _userId();
        const c = _client();
        if (!userId || !c) return;
        try {
            await c.from('activity_log').insert({
                user_id:     userId,
                action,
                entity_type: entityType,
                entity_id:   entityId ? String(entityId) : null,
                metadata
            });
        } catch (e) {
            global.EtheriaLogger?.warn('extras:activity', e?.message);
        }
    }

    // ── Arranque ─────────────────────────────────────────────────────────────

    global.addEventListener('etheria:auth-changed', function (e) {
        const user = e.detail?.user;
        if (user?.id) {
            // Al hacer login, registrar actividad
            logActivity('login', 'session').catch(() => {});
        }
    });

    // ── API pública ───────────────────────────────────────────────────────────
    // El nombre correcto es SupabaseExtras (todos los llamantes ya lo usan
    // así) — antes se exportaba como EtheriaExtras por error, así que
    // logActivity() nunca se ejecutaba pese a estar "cableada" en 4 archivos.

    global.SupabaseExtras = {
        logActivity
    };

})(window);
