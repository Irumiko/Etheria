// ============================================
// SUPABASE TURN NOTIFICATIONS
// ============================================
// Notifica en tiempo real cuando le toca responder a otro jugador.
// Requiere tabla public.turn_notifications + Realtime habilitado.

(function (global) {
    const cfg = global.SUPABASE_CONFIG || {};
    const logger = global.EtheriaLogger;

    const SB_URL = cfg.url;
    const SB_KEY = cfg.key;

    let _client = null;
    let _channel = null;
    let _subscribedUserId = null; // usuario del canal actualmente activo
    let _subscribing = null;      // promesa en curso — evita carreras entre llamadas simultáneas

    const BASE_HEADERS = {
        apikey: SB_KEY,
        'Content-Type': 'application/json'
    };

    function _getClient() {
        if (_client) return _client;
        try {
            _client = global.supabaseClient || (global.supabase?.createClient
                ? global.supabase.createClient(SB_URL, SB_KEY)
                : null);
        } catch (error) {
            logger?.warn('supabase:turn-notify', 'client init failed:', error?.message || error);
            _client = null;
        }
        return _client;
    }

    async function _getUserId() {
        if (typeof global.getEtheriaUserId === 'function') return global.getEtheriaUserId();
        return global._cachedUserId || null;
    }

    async function _headers() {
        if (global.SupabaseAuthHeaders?.buildAuthHeaders) {
            return global.SupabaseAuthHeaders.buildAuthHeaders({
                apikey: SB_KEY,
                client: global.supabaseClient,
                baseHeaders: BASE_HEADERS,
            });
        }
        return { ...BASE_HEADERS, Authorization: `Bearer ${SB_KEY}` };
    }

    function _toast(text) {
        if (typeof eventBus !== 'undefined') {
            eventBus.emit('ui:show-toast', {
                text,
                action: 'Abrir historia',
                onAction: function () {
                    if (global.currentTopicId && typeof showSection === 'function') {
                        showSection('vn');
                    }
                }
            });
        }
        if (typeof showAutosave === 'function') {
            showAutosave(text, 'info');
        }
    }

    async function notifyTurn(payload = {}) {
        const senderId = await _getUserId();
        if (!senderId) return { ok: false, error: 'Usuario no autenticado' };
        const recipient = String(payload.recipientUserId || '').trim();
        if (!recipient || recipient === senderId) return { ok: false, error: 'Destinatario inválido' };

        const row = {
            story_id: payload.storyId || null,
            topic_id: payload.topicId || null,
            recipient_user_id: recipient,
            sender_user_id: senderId,
            message_id: payload.messageId || null,
            title: payload.title || 'Te toca responder',
            body: payload.body || 'Hay un turno esperando tu respuesta.',
            meta: payload.meta || {}
        };

        try {
            const res = await fetch(`${SB_URL}/rest/v1/turn_notifications`, {
                method: 'POST',
                headers: {
                    ...(await _headers()),
                    Prefer: 'return=representation'
                },
                body: JSON.stringify(row),
                signal: AbortSignal.timeout(5000)
            });

            if (!res.ok) {
                const detail = await res.text().catch(() => String(res.status));
                logger?.warn('supabase:turn-notify', 'notifyTurn failed:', detail);
                return { ok: false, error: detail };
            }

            return { ok: true };
        } catch (error) {
            logger?.warn('supabase:turn-notify', 'notifyTurn error:', error?.message || error);
            return { ok: false, error: error?.message || 'notifyTurn error' };
        }
    }

    async function markAsRead(notificationId) {
        if (!notificationId) return;
        try {
            await fetch(`${SB_URL}/rest/v1/turn_notifications?id=eq.${encodeURIComponent(notificationId)}`, {
                method: 'PATCH',
                headers: {
                    ...(await _headers()),
                    Prefer: 'return=minimal'
                },
                body: JSON.stringify({ is_read: true, read_at: new Date().toISOString() }),
                signal: AbortSignal.timeout(5000)
            });
        } catch (error) {
            logger?.warn('supabase:turn-notify', 'markAsRead failed:', error?.message || error);
        }
    }

    // Dos sitios distintos llaman a subscribe() por el mismo motivo (login /
    // recuperación de sesión al volver a la pestaña): app.js vía ensureProfile()
    // y el propio listener de abajo. Sin proteger esto, dos llamadas casi
    // simultáneas competían por el mismo nombre de canal y supabase-js
    // devolvía el objeto ya suscrito de la otra ("cannot add postgres_changes
    // callbacks ... after subscribe()"). _subscribing hace que la segunda
    // llamada espere a la primera en vez de pisarla.
    function subscribe() {
        if (_subscribing) return _subscribing;
        _subscribing = _doSubscribe().finally(() => { _subscribing = null; });
        return _subscribing;
    }

    async function _doSubscribe() {
        const client = _getClient();
        if (!client?.channel) return false;

        const userId = await _getUserId();
        if (!userId) { await unsubscribe(); return false; }

        // Ya hay un canal activo para este mismo usuario — no recrearlo.
        if (_channel && _subscribedUserId === userId) return true;

        await unsubscribe();

        try {
            _channel = client
                .channel(`turn-notifications:${userId}`)
                .on('postgres_changes', {
                    event: 'INSERT',
                    schema: 'public',
                    table: 'turn_notifications',
                    filter: `recipient_user_id=eq.${userId}`
                }, function (payload) {
                    const row = payload?.new;
                    if (!row || row.is_read) return;
                    _toast(row.title || 'Te toca responder');
                    global.dispatchEvent(new CustomEvent('etheria:turn-notification', {
                        detail: { notification: row }
                    }));
                    if (row.id) markAsRead(row.id);
                })
                .subscribe();

            _subscribedUserId = userId;
            return true;
        } catch (error) {
            logger?.warn('supabase:turn-notify', 'subscribe failed:', error?.message || error);
            _channel = null;
            _subscribedUserId = null;
            return false;
        }
    }

    async function unsubscribe() {
        const client = _getClient();
        if (_channel && client) {
            // removeChannel() es async — sin el await, subscribe() podía crear
            // el canal nuevo con el mismo nombre antes de que el viejo
            // terminara de eliminarse, y supabase-js devolvía el objeto
            // reciclado ya suscrito ("cannot add postgres_changes callbacks
            // ... after subscribe()").
            try { await client.removeChannel(_channel); } catch {}
        }
        _channel = null;
        _subscribedUserId = null;
    }

    if (typeof window !== 'undefined') {
        window.addEventListener('etheria:auth-changed', function (e) {
            if (!e.detail?.user?.id) { unsubscribe(); return; }
            subscribe();
        });
    }

    global.SupabaseTurnNotifications = {
        notifyTurn,
        subscribe,
        unsubscribe,
        markAsRead
    };

})(window);
