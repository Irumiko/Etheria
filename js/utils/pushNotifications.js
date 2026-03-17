// ============================================
// ETHERIA — Push Notifications (cliente)
// ============================================
// Gestiona el ciclo completo de Web Push en el navegador:
//   1. Comprueba soporte y permiso
//   2. Suscribe al navegador con la clave VAPID pública
//   3. Guarda / actualiza la suscripción en push_subscriptions
//   4. Ofrece método para desuscribirse
//
// Uso desde app.js o desde el menú de Opciones:
//   await EtheriaPush.requestPermissionAndSubscribe();
//
// Requiere:
//   - Service Worker registrado (sw.js) con listener 'push'
//   - Variable window.ETHERIA_VAPID_PUBLIC_KEY con la clave pública VAPID
// ============================================

(function (global) {
    'use strict';

    const logger = global.EtheriaLogger;

    // ── Clave pública VAPID ───────────────────────────────────────────────────
    // Se inyecta desde js/config/supabase.js o desde __ETHERIA_ENV__
    function _vapidPublicKey() {
        return global.__ETHERIA_ENV__?.vapidPublicKey
            || global.ETHERIA_VAPID_PUBLIC_KEY
            || null;
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    function _client() {
        return global.supabaseClient || null;
    }

    async function _getUserId() {
        if (global._cachedUserId) return global._cachedUserId;
        const c = _client();
        if (!c?.auth?.getUser) return null;
        try {
            const { data, error } = await c.auth.getUser();
            if (error || !data?.user?.id) return null;
            global._cachedUserId = data.user.id;
            return data.user.id;
        } catch { return null; }
    }

    function _urlBase64ToUint8Array(base64String) {
        const padding = '='.repeat((4 - base64String.length % 4) % 4);
        const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
        const rawData = atob(base64);
        return Uint8Array.from([...rawData].map(c => c.charCodeAt(0)));
    }

    function _isSupported() {
        return 'serviceWorker' in navigator
            && 'PushManager' in global
            && 'Notification' in global;
    }

    // ── Estado de permiso ─────────────────────────────────────────────────────

    function getPermissionState() {
        if (!_isSupported()) return 'unsupported';
        return Notification.permission; // 'default' | 'granted' | 'denied'
    }

    // ── Suscribir ─────────────────────────────────────────────────────────────

    async function requestPermissionAndSubscribe() {
        if (!_isSupported()) {
            logger?.warn('push', 'Web Push no soportado en este navegador');
            return { ok: false, reason: 'unsupported' };
        }

        const vapidKey = _vapidPublicKey();
        if (!vapidKey) {
            logger?.warn('push', 'VAPID_PUBLIC_KEY no configurada');
            return { ok: false, reason: 'no-vapid-key' };
        }

        const userId = await _getUserId();
        if (!userId) {
            return { ok: false, reason: 'not-authenticated' };
        }

        // Pedir permiso al usuario
        let permission = Notification.permission;
        if (permission === 'default') {
            permission = await Notification.requestPermission();
        }
        if (permission !== 'granted') {
            logger?.info('push', 'Permiso denegado:', permission);
            return { ok: false, reason: 'permission-denied' };
        }

        try {
            // Obtener registro del Service Worker
            const reg = await navigator.serviceWorker.ready;

            // Suscribirse (o recuperar suscripción existente)
            const subscription = await reg.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey: _urlBase64ToUint8Array(vapidKey),
            });

            const subJson = subscription.toJSON();
            const endpoint = subJson.endpoint;
            const p256dh   = subJson.keys?.p256dh;
            const authKey  = subJson.keys?.auth;

            if (!endpoint || !p256dh || !authKey) {
                return { ok: false, reason: 'invalid-subscription' };
            }

            // Guardar en Supabase (upsert por endpoint)
            const deviceHint = _getDeviceHint();
            const c = _client();
            if (c) {
                const { error } = await c
                    .from('push_subscriptions')
                    .upsert({
                        user_id: userId,
                        endpoint,
                        p256dh,
                        auth_key: authKey,
                        device_hint: deviceHint,
                        last_used_at: new Date().toISOString(),
                    }, { onConflict: 'endpoint' });

                if (error) {
                    logger?.warn('push', 'Error guardando suscripción:', error.message);
                    return { ok: false, reason: 'save-failed', error: error.message };
                }
            }

            logger?.info('push', 'Suscripción registrada correctamente');
            return { ok: true, endpoint };

        } catch (err) {
            logger?.warn('push', 'Error al suscribir:', err?.message || err);
            return { ok: false, reason: 'subscribe-error', error: err?.message };
        }
    }

    // ── Desuscribir ───────────────────────────────────────────────────────────

    async function unsubscribe() {
        if (!_isSupported()) return { ok: false };

        try {
            const reg = await navigator.serviceWorker.ready;
            const subscription = await reg.pushManager.getSubscription();
            if (!subscription) return { ok: true }; // ya desuscrito

            const endpoint = subscription.endpoint;
            await subscription.unsubscribe();

            // Borrar de Supabase
            const c = _client();
            if (c) {
                await c.from('push_subscriptions').delete().eq('endpoint', endpoint);
            }

            logger?.info('push', 'Desuscrito correctamente');
            return { ok: true };
        } catch (err) {
            logger?.warn('push', 'Error al desuscribir:', err?.message || err);
            return { ok: false, error: err?.message };
        }
    }

    // ── Helpers UI ────────────────────────────────────────────────────────────

    function _getDeviceHint() {
        const ua = navigator.userAgent;
        if (/iPhone|iPad|iPod/.test(ua)) return 'ios';
        if (/Android/.test(ua)) return 'android';
        if (/Windows/.test(ua)) return 'windows';
        if (/Mac/.test(ua)) return 'mac';
        return 'desktop';
    }

    // Sincroniza el estado visual del toggle en Opciones (si existe)
    async function syncToggleUI() {
        const toggle = document.getElementById('pushNotifToggle');
        const label  = document.getElementById('pushNotifLabel');
        if (!toggle) return;

        const state = getPermissionState();
        if (state === 'unsupported') {
            toggle.disabled = true;
            if (label) label.textContent = 'No soportado en este navegador';
            return;
        }
        if (state === 'denied') {
            toggle.disabled = true;
            toggle.checked = false;
            if (label) label.textContent = 'Bloqueado en ajustes del navegador';
            return;
        }

        // Comprobar si hay suscripción activa
        try {
            const reg = await navigator.serviceWorker.ready;
            const sub = await reg.pushManager.getSubscription();
            toggle.checked = !!sub && state === 'granted';
            toggle.disabled = false;
            if (label) label.textContent = toggle.checked ? 'Activadas' : 'Desactivadas';
        } catch {
            toggle.checked = false;
        }
    }

    // ── Auto-init: suscribir silenciosamente si ya tiene permiso ─────────────
    // Si el usuario ya concedió permiso antes, renovar la suscripción
    // al arrancar (puede haberse expirado).

    async function _autoRenew() {
        if (!_isSupported()) return;
        if (Notification.permission !== 'granted') return;
        const userId = await _getUserId();
        if (!userId) return;

        const vapidKey = _vapidPublicKey();
        if (!vapidKey) return;

        try {
            const reg = await navigator.serviceWorker.ready;
            const existing = await reg.pushManager.getSubscription();
            if (existing) {
                // Asegurar que está guardada en Supabase (puede faltar tras borrar BD)
                const subJson = existing.toJSON();
                const c = _client();
                if (c && subJson.keys) {
                    await c.from('push_subscriptions').upsert({
                        user_id: userId,
                        endpoint: subJson.endpoint,
                        p256dh: subJson.keys.p256dh,
                        auth_key: subJson.keys.auth,
                        device_hint: _getDeviceHint(),
                        last_used_at: new Date().toISOString(),
                    }, { onConflict: 'endpoint' });
                }
            }
        } catch (err) {
            logger?.warn('push', 'autoRenew error:', err?.message);
        }
    }

    // Escuchar login para auto-renovar
    global.addEventListener('etheria:auth-changed', function (e) {
        if (e.detail?.user?.id) {
            _autoRenew().catch(() => {});
            syncToggleUI().catch(() => {});
        }
    });

    // ── API pública ───────────────────────────────────────────────────────────

    global.EtheriaPush = {
        requestPermissionAndSubscribe,
        unsubscribe,
        getPermissionState,
        syncToggleUI,
        get isSupported() { return _isSupported(); },
    };

})(window);
