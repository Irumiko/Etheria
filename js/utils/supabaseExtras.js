// ============================================
// SUPABASE EXTRAS — Activity Log, Backups y Web Push
// ============================================

(function (global) {
    'use strict';

    function _client() { return global.supabaseClient || null; }

    async function _userId() {
        if (global._cachedUserId) return global._cachedUserId;
        const c = _client();
        if (!c?.auth?.getUser) return null;
        try {
            const { data } = await c.auth.getUser();
            return data?.user?.id || null;
        } catch { return null; }
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

    // ── 3. WEB PUSH ──────────────────────────────────────────────────────────

    // VAPID public key — debes sustituir esto por tu clave VAPID real
    // Genérala en: https://web-push-codelab.glitch.me/
    // o con: npx web-push generate-vapid-keys
    const VAPID_PUBLIC_KEY = 'YOUR_VAPID_PUBLIC_KEY_HERE';

    function _urlBase64ToUint8Array(base64String) {
        const padding = '='.repeat((4 - base64String.length % 4) % 4);
        const base64  = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
        const raw     = atob(base64);
        return Uint8Array.from([...raw].map(c => c.charCodeAt(0)));
    }

    async function registerPushSubscription() {
        if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
            global.EtheriaLogger?.warn('extras:push', 'Web Push no soportado en este navegador');
            return false;
        }

        if (VAPID_PUBLIC_KEY === 'YOUR_VAPID_PUBLIC_KEY_HERE') {
            global.EtheriaLogger?.warn('extras:push', 'Configura tu VAPID_PUBLIC_KEY en supabaseExtras.js');
            return false;
        }

        const userId = await _userId();
        const c = _client();
        if (!userId || !c) return false;

        try {
            // Pedir permiso al usuario
            const permission = await Notification.requestPermission();
            if (permission !== 'granted') return false;

            // Obtener el Service Worker registrado
            const registration = await navigator.serviceWorker.ready;

            // Suscribir al push service del navegador
            const subscription = await registration.pushManager.subscribe({
                userVisibleOnly:      true,
                applicationServerKey: _urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
            });

            const subJson = subscription.toJSON();

            // Detectar tipo de dispositivo
            const isMobile    = /Android|iPhone|iPad/i.test(navigator.userAgent);
            const isStandalone = window.matchMedia('(display-mode: standalone)').matches
                              || navigator.standalone === true;
            const deviceHint  = isStandalone ? 'pwa' : isMobile ? 'mobile' : 'desktop';

            // Guardar en Supabase
            const { error } = await c.from('push_subscriptions').upsert({
                user_id:      userId,
                endpoint:     subJson.endpoint,
                p256dh:       subJson.keys.p256dh,
                auth_key:     subJson.keys.auth,
                device_hint:  deviceHint,
                last_used_at: new Date().toISOString()
            }, { onConflict: 'user_id, endpoint' });

            if (error) {
                global.EtheriaLogger?.warn('extras:push', 'Error guardando suscripción:', error.message);
                return false;
            }

            await logActivity('push_subscribed', 'session', null, { device_hint: deviceHint });
            global.EtheriaLogger?.info?.('extras:push', 'Suscripción push registrada:', deviceHint);
            return true;

        } catch (e) {
            global.EtheriaLogger?.warn('extras:push', 'Error registrando push:', e?.message);
            return false;
        }
    }

    async function unregisterPushSubscription() {
        const userId = await _userId();
        const c = _client();
        if (!userId || !c) return;

        try {
            const registration = await navigator.serviceWorker.ready;
            const subscription = await registration.pushManager.getSubscription();

            if (subscription) {
                await subscription.unsubscribe();
                await c.from('push_subscriptions')
                    .delete()
                    .eq('user_id', userId)
                    .eq('endpoint', subscription.endpoint);
            }
        } catch (e) {
            global.EtheriaLogger?.warn('extras:push', 'Error eliminando push:', e?.message);
        }
    }

    async function isPushSubscribed() {
        if (!('serviceWorker' in navigator) || !('PushManager' in window)) return false;
        try {
            const registration = await navigator.serviceWorker.ready;
            const sub = await registration.pushManager.getSubscription();
            return !!sub;
        } catch { return false; }
    }

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
            // Al hacer login, registrar actividad e intentar registrar push
            logActivity('login', 'session').catch(() => {});
            // Intentar registrar push si el usuario ya dio permiso antes
            if (Notification.permission === 'granted') {
                registerPushSubscription().catch(() => {});
            }
        }
    });

    // ── API pública ───────────────────────────────────────────────────────────

    global.EtheriaExtras = {
        logActivity,
        exportBackup,
        importBackup,
        registerPushSubscription,
        unregisterPushSubscription,
        isPushSubscribed,
        checkRateLimit,
        getRateLimitRemaining
    };

})(window);
