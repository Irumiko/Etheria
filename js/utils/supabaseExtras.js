// ============================================
// SUPABASE EXTRAS — Activity Log, Backups y Web Push
// ============================================

(function (global) {
    'use strict';

    function _client() { return global.supabaseClient || null; }

    async function _userId() {
        if (typeof global.getEtheriaUserId === 'function') return global.getEtheriaUserId();
        return global._cachedUserId || null;
    }

    // ── 1. ACTIVITY LOG ──────────────────────────────────────────────────────

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

    // ── 2. BACKUP EXPORTABLE ─────────────────────────────────────────────────

    async function exportBackup() {
        const userId = await _userId();
        const c = _client();
        if (!userId || !c) {
            if (typeof showAutosave === 'function')
                showAutosave('Inicia sesión para exportar un backup', 'error');
            return null;
        }

        if (typeof showAutosave === 'function')
            showAutosave('Generando backup...', 'info');

        try {
            const { data, error } = await c.rpc('generate_user_backup', {
                p_user_id: userId
            });

            if (error) {
                if (typeof showAutosave === 'function')
                    showAutosave('Error al generar backup: ' + error.message, 'error');
                return null;
            }

            // Descargar el JSON automáticamente
            const blob    = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
            const url     = URL.createObjectURL(blob);
            const link    = document.createElement('a');
            const dateStr = new Date().toISOString().slice(0, 10);
            link.href     = url;
            link.download = `etheria-backup-${dateStr}.json`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);

            if (typeof showAutosave === 'function')
                showAutosave('✓ Backup descargado correctamente', 'saved');

            return data;
        } catch (e) {
            if (typeof showAutosave === 'function')
                showAutosave('Error inesperado al exportar', 'error');
            global.EtheriaLogger?.warn('extras:backup', e?.message);
            return null;
        }
    }

    async function importBackup(jsonFile) {
        if (!jsonFile) return;
        const userId = await _userId();
        const c = _client();
        if (!userId || !c) {
            if (typeof showAutosave === 'function')
                showAutosave('Inicia sesión para importar un backup', 'error');
            return;
        }

        try {
            const text = await jsonFile.text();
            const data = JSON.parse(text);

            if (!data.version || !data.user_data) {
                if (typeof showAutosave === 'function')
                    showAutosave('Archivo de backup inválido', 'error');
                return;
            }

            if (typeof showAutosave === 'function')
                showAutosave('Importando backup...', 'info');

            // Restaurar user_data en Supabase
            const { error } = await c.from('user_data').upsert({
                user_id:    userId,
                data:       data.user_data,
                updated_at: new Date().toISOString()
            }, { onConflict: 'user_id' });

            if (error) {
                if (typeof showAutosave === 'function')
                    showAutosave('Error al importar: ' + error.message, 'error');
                return;
            }

            // Registrar en activity_log
            await logActivity('backup_imported', 'session', null, {
                backup_date: data.exported_at
            });

            // Aplicar localmente
            if (data.user_data && typeof SupabaseSync?.downloadProfileData === 'function') {
                await SupabaseSync.downloadProfileData();
                if (typeof renderTopics  === 'function') renderTopics();
                if (typeof renderGallery === 'function') renderGallery();
            }

            if (typeof showAutosave === 'function')
                showAutosave('✓ Backup importado correctamente', 'saved');

        } catch (e) {
            if (typeof showAutosave === 'function')
                showAutosave('Error al leer el archivo', 'error');
            global.EtheriaLogger?.warn('extras:import', e?.message);
        }
    }

    // Nota: el registro de Web Push real vive en js/utils/pushNotifications.js
    // (EtheriaPush) con la clave VAPID inyectada desde js/config/supabase.js.
    // Aquí había una segunda implementación, nunca funcional (clave de
    // marcador de posición sin sustituir), que se autoejecutaba en cada
    // etheria:auth-changed y llenaba la consola de avisos — eliminada.

    // ── 4. RATE LIMIT (cliente) ───────────────────────────────────────────────

    async function checkRateLimit(action, maxRequests = 30, windowMinutes = 60) {
        const userId = await _userId();
        const c = _client();
        if (!userId || !c) return true; // si no hay usuario, no limitar

        try {
            const { data, error } = await c.rpc('check_rate_limit', {
                p_user_id:        userId,
                p_action:         action,
                p_max_requests:   maxRequests,
                p_window_minutes: windowMinutes
            });
            if (error) return true; // ante error, permitir
            return data === true;
        } catch { return true; }
    }

    async function getRateLimitRemaining(action, maxRequests = 30, windowMinutes = 60) {
        const userId = await _userId();
        const c = _client();
        if (!userId || !c) return maxRequests;

        try {
            const { data } = await c.rpc('get_rate_limit_remaining', {
                p_user_id:        userId,
                p_action:         action,
                p_max_requests:   maxRequests,
                p_window_minutes: windowMinutes
            });
            return data ?? maxRequests;
        } catch { return maxRequests; }
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

    global.EtheriaExtras = {
        logActivity,
        exportBackup,
        importBackup,
        checkRateLimit,
        getRateLimitRemaining
    };

})(window);
