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
    let _cachedUserId = null;

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
        if (_cachedUserId || global._cachedUserId) return _cachedUserId || global._cachedUserId;
        const c = _getClient();
        if (!c?.auth?.getUser) return null;
        try {
            const { data, error } = await c.auth.getUser();
            if (error || !data?.user?.id) return null;
            _cachedUserId = data.user.id;
            global._cachedUserId = data.user.id;
            return data.user.id;
        } catch {
            return null;
        }
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

    async function subscribe() {
        const client = _getClient();
        if (!client?.channel) return false;

        await unsubscribe();

        const userId = await _getUserId();
        if (!userId) return false;

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

            return true;
        } catch (error) {
            logger?.warn('supabase:turn-notify', 'subscribe failed:', error?.message || error);
            _channel = null;
            return false;
        }
    }

    async function unsubscribe() {
        const client = _getClient();
        if (_channel && client) {
            try { client.removeChannel(_channel); } catch {}
        }
        _channel = null;
    }

    if (typeof window !== 'undefined') {
        window.addEventListener('etheria:auth-changed', function (e) {
            _cachedUserId = e.detail?.user?.id || null;
            if (!_cachedUserId) {
                unsubscribe();
                return;
            }
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
