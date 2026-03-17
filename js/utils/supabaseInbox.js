// ============================================
// SUPABASE INBOX — Buzón, Presencia y Typing
// ============================================
// Gestiona tres funcionalidades en tiempo real:
//
// 1. BUZÓN: notificaciones no leídas de turn_notifications
//    - Carga al login, escucha inserts en tiempo real
//    - Actualiza el badge del menú principal
//    - Abre un modal con la lista de notificaciones
//
// 2. PRESENCIA EN TEMAS: muestra quién está online
//    - Al entrar en un topic, une al canal de presencia
//    - Renderiza avatares/nicks iluminados u oscuros en el panel VN
//    - Se actualiza en tiempo real cuando alguien entra o sale
//
// 3. TYPING INDICATOR REAL: burbuja "está escribiendo"
//    - Usa Supabase Broadcast (sin tabla) en el canal del topic
//    - Emite cuando el usuario escribe, limpia tras 3s de silencio
//    - Muestra "Nombre está escribiendo…" en el indicador existente
// ============================================

(function (global) {
    'use strict';

    const logger = global.EtheriaLogger;

    // ── Helpers ──────────────────────────────────────────────────────────────

    function _client() {
        return global.supabaseClient || null;
    }

    async function _userId() {
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

    function _myDisplayName() {
        try {
            const idx = Number(global.currentUserIndex || 0);
            const names = Array.isArray(global.userNames) ? global.userNames : [];
            return (names[idx] || names[0] || 'Jugador').trim() || 'Jugador';
        } catch { return 'Jugador'; }
    }

    function _myAvatar() {
        try {
            const idx = Number(global.currentUserIndex || 0);
            const avatars = JSON.parse(localStorage.getItem('etheria_user_avatars') || '[]');
            return avatars[idx] || localStorage.getItem('etheria_cloud_avatar_url') || '';
        } catch { return ''; }
    }

    // ── 1. BUZÓN ─────────────────────────────────────────────────────────────

    let _inboxChannel = null;
    let _unreadCount  = 0;
    let _notifications = [];  // cache local

    async function _loadUnread() {
        const uid = await _userId();
        if (!uid) return;
        const c = _client();
        if (!c) return;

        try {
            const { data, error } = await c
                .from('turn_notifications')
                .select('id, title, body, created_at, is_read, story_id, topic_id, sender_user_id')
                .eq('recipient_user_id', uid)
                .order('created_at', { ascending: false })
                .limit(50);

            if (error) { logger?.warn('inbox', 'loadUnread error:', error.message); return; }

            _notifications = data || [];
            _unreadCount   = _notifications.filter(n => !n.is_read).length;
            _updateBadge();
        } catch (e) {
            logger?.warn('inbox', 'loadUnread exception:', e?.message);
        }
    }

    function _updateBadge() {
        const btn   = document.getElementById('menuInboxBtn');
        const badge = document.getElementById('menuInboxBadge');
        if (!btn) return;

        // Mostrar el botón solo si hay al menos una notificación alguna vez
        if (_notifications.length > 0) btn.style.display = '';

        // Clase visual cuando hay no leídas
        if (_unreadCount > 0) {
            btn.classList.add('has-unread');
        } else {
            btn.classList.remove('has-unread');
        }

        if (!badge) return;
        if (_unreadCount > 0) {
            badge.textContent = _unreadCount > 9 ? '9+' : String(_unreadCount);
            badge.style.display = '';
        } else {
            badge.style.display = 'none';
        }
    }

    async function _subscribeInbox() {
        const uid = await _userId();
        if (!uid) return;
        const c = _client();
        if (!c?.channel) return;

        if (_inboxChannel) { try { c.removeChannel(_inboxChannel); } catch {} }

        _inboxChannel = c
            .channel(`inbox:${uid}`)
            .on('postgres_changes', {
                event: 'INSERT',
                schema: 'public',
                table: 'turn_notifications',
                filter: `recipient_user_id=eq.${uid}`
            }, function (payload) {
                const row = payload?.new;
                if (!row) return;
                _notifications.unshift(row);
                if (!row.is_read) {
                    _unreadCount++;
                    _updateBadge();
                    // Pulsar el badge brevemente
                    const badge = document.getElementById('menuInboxBadge');
                    if (badge) {
                        badge.classList.add('inbox-badge-pulse');
                        setTimeout(() => badge.classList.remove('inbox-badge-pulse'), 600);
                    }
                }
                global.dispatchEvent(new CustomEvent('etheria:inbox-new', { detail: { notification: row } }));
            })
            .subscribe();
    }

    async function openInboxModal() {
        const modal = document.getElementById('inboxModal');
        if (!modal) return;
        modal.style.display = 'flex';
        _renderInboxList();

        // Marcar todas como leídas al abrir
        const unread = _notifications.filter(n => !n.is_read);
        if (unread.length > 0) {
            _unreadCount = 0;
            _updateBadge();
            unread.forEach(n => { n.is_read = true; });
            // Persistir en Supabase en background
            _markAllRead(unread.map(n => n.id));
        }
    }

    function closeInboxModal() {
        const modal = document.getElementById('inboxModal');
        if (modal) modal.style.display = 'none';
    }

    function _renderInboxList() {
        const list = document.getElementById('inboxList');
        if (!list) return;

        if (_notifications.length === 0) {
            list.innerHTML = '<p class="inbox-empty">No hay notificaciones todavía.</p>';
            return;
        }

        list.innerHTML = _notifications.map(n => {
            const date = n.created_at ? new Date(n.created_at) : null;
            const dateStr = date
                ? date.toLocaleDateString('es-ES', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
                : '';
            const unreadClass = !n.is_read ? 'inbox-item--unread' : '';
            return `
                <div class="inbox-item ${unreadClass}" onclick="EtheriaInbox.goToTopic('${n.topic_id || ''}')">
                    <div class="inbox-item-icon">${n.is_read ? '✉' : '📬'}</div>
                    <div class="inbox-item-body">
                        <p class="inbox-item-title">${escapeHtml(n.title || 'Nueva notificación')}</p>
                        <p class="inbox-item-text">${escapeHtml(n.body || '')}</p>
                        ${dateStr ? `<p class="inbox-item-date">${dateStr}</p>` : ''}
                    </div>
                </div>
            `;
        }).join('');
    }

    async function _markAllRead(ids) {
        const c = _client();
        if (!c || !ids?.length) return;
        try {
            await c
                .from('turn_notifications')
                .update({ is_read: true, read_at: new Date().toISOString() })
                .in('id', ids);
        } catch (e) {
            logger?.warn('inbox', 'markAllRead error:', e?.message);
        }
    }

    function goToTopic(topicId) {
        closeInboxModal();
        if (!topicId) return;
        if (typeof showSection === 'function') showSection('topics');
        setTimeout(() => {
            if (typeof enterTopic === 'function') enterTopic(topicId);
        }, 300);
    }

    // ── 2. PRESENCIA VISIBLE EN EL TOPIC ─────────────────────────────────────

    let _presenceTopicId = null;
    let _presenceChannel = null;
    let _presenceState   = new Map(); // user_id → { name, avatar_url, online_at }

    async function joinTopicPresence(topicId) {
        if (!topicId) return;
        await leaveTopicPresence();

        const uid = await _userId();
        if (!uid) return;
        const c = _client();
        if (!c?.channel) return;

        _presenceTopicId = String(topicId);
        _presenceState.clear();

        try {
            _presenceChannel = c
                .channel(`presence:topic:${_presenceTopicId}`, {
                    config: { presence: { key: String(uid) } }
                })
                .on('presence', { event: 'sync' }, _onPresenceSync)
                .on('presence', { event: 'join' }, _onPresenceSync)
                .on('presence', { event: 'leave' }, _onPresenceSync)
                // Typing broadcast en el mismo canal
                .on('broadcast', { event: 'typing' }, _onTypingBroadcast);

            _presenceChannel.subscribe(async (status) => {
                if (status !== 'SUBSCRIBED') return;
                try {
                    await _presenceChannel.track({
                        user_id: String(uid),
                        name: _myDisplayName(),
                        avatar_url: _myAvatar() || null,
                        online_at: new Date().toISOString()
                    });
                } catch (e) {
                    logger?.warn('inbox:presence', 'track failed:', e?.message);
                }
            });
        } catch (e) {
            logger?.warn('inbox:presence', 'joinTopicPresence failed:', e?.message);
        }
    }

    async function leaveTopicPresence() {
        const c = _client();
        if (_presenceChannel && c) {
            try { await _presenceChannel.untrack(); } catch {}
            try { c.removeChannel(_presenceChannel); } catch {}
        }
        _presenceChannel = null;
        _presenceTopicId = null;
        _presenceState.clear();
        _renderPresencePanel();
        _clearTypingUI();
    }

    function _onPresenceSync() {
        if (!_presenceChannel) return;
        const state = _presenceChannel.presenceState ? _presenceChannel.presenceState() : {};
        _presenceState.clear();
        Object.values(state || {}).forEach(metas => {
            (Array.isArray(metas) ? metas : []).forEach(meta => {
                if (meta?.user_id) _presenceState.set(String(meta.user_id), meta);
            });
        });
        _renderPresencePanel();
    }

    function _renderPresencePanel() {
        const panel = document.getElementById('vnPresencePanel');
        const list  = document.getElementById('vnPresenceList');
        if (!panel || !list) return;

        if (_presenceState.size === 0) {
            panel.style.display = 'none';
            return;
        }

        panel.style.display = '';
        list.innerHTML = [..._presenceState.values()].map(meta => {
            const name      = escapeHtml(meta.name || 'Jugador');
            const initials  = (meta.name || '?')[0].toUpperCase();
            const avatarHtml = meta.avatar_url
                ? `<img src="${escapeHtml(meta.avatar_url)}" alt="${name}" class="vn-presence-avatar-img">`
                : `<span class="vn-presence-avatar-initials">${initials}</span>`;
            return `
                <div class="vn-presence-user" title="${name} — en línea">
                    <div class="vn-presence-avatar">
                        ${avatarHtml}
                        <span class="vn-presence-dot"></span>
                    </div>
                    <span class="vn-presence-name">${name}</span>
                </div>
            `;
        }).join('');
    }

    // ── 3. TYPING INDICATOR REAL ─────────────────────────────────────────────

    let _typingTimer      = null;   // debounce para dejar de emitir
    let _typingClearTimer = null;   // limpiar UI si no llegan más eventos
    let _lastTypingUser   = null;

    // Llamar desde el textarea del VN cuando el usuario escribe
    async function emitTyping() {
        if (!_presenceChannel) return;
        const uid = await _userId();
        if (!uid) return;

        // Enviar broadcast
        try {
            await _presenceChannel.send({
                type: 'broadcast',
                event: 'typing',
                payload: {
                    user_id: String(uid),
                    name: _myDisplayName(),
                    ts: Date.now()
                }
            });
        } catch (e) {
            logger?.warn('inbox:typing', 'emitTyping failed:', e?.message);
        }

        // Dejar de emitir tras 3s de silencio
        clearTimeout(_typingTimer);
        _typingTimer = setTimeout(async () => {
            try {
                await _presenceChannel.send({
                    type: 'broadcast',
                    event: 'typing',
                    payload: { user_id: String(uid), name: _myDisplayName(), ts: Date.now(), stopped: true }
                });
            } catch {}
        }, 3000);
    }

    function _onTypingBroadcast(payload) {
        const data = payload?.payload;
        if (!data?.user_id) return;

        // Ignorar si soy yo mismo
        if (data.user_id === global._cachedUserId) return;

        if (data.stopped) {
            if (_lastTypingUser === data.user_id) _clearTypingUI();
            return;
        }

        _lastTypingUser = data.user_id;
        _showTypingUI(data.name || 'Alguien');

        // Auto-limpiar si no llega más señal en 4s
        clearTimeout(_typingClearTimer);
        _typingClearTimer = setTimeout(_clearTypingUI, 4000);
    }

    function _showTypingUI(name) {
        const el = document.getElementById('collabTypingIndicator');
        if (!el) return;
        el.innerHTML = `<span class="typing-name">${escapeHtml(name)}</span> está escribiendo<span class="typing-dots"><span></span><span></span><span></span></span>`;
        el.classList.add('visible');
    }

    function _clearTypingUI() {
        _lastTypingUser = null;
        const el = document.getElementById('collabTypingIndicator');
        if (!el) return;
        el.classList.remove('visible');
        setTimeout(() => { if (!el.classList.contains('visible')) el.innerHTML = ''; }, 400);
    }

    // ── Arranque y escucha de eventos de la app ───────────────────────────────

    function _init() {
        // Comprobación activa: si ya hay usuario cacheado al arrancar (sesión existente),
        // inicializar el buzón directamente sin esperar al evento auth-changed.
        // Esto cubre el caso de recarga de página con sesión activa.
        if (global._cachedUserId) {
            _loadUnread();
            _subscribeInbox();
            const btn = document.getElementById('menuInboxBtn');
            if (btn) btn.style.display = '';
        }

        // Al hacer login (o cuando ensureProfile dispara auth-changed)
        global.addEventListener('etheria:auth-changed', function (e) {
            const user = e.detail?.user;
            if (user?.id) {
                global._cachedUserId = user.id;
                _loadUnread();
                _subscribeInbox();
                const btn = document.getElementById('menuInboxBtn');
                if (btn) btn.style.display = '';
            } else {
                global._cachedUserId = null;
                _unreadCount = 0;
                _notifications = [];
                _updateBadge();
                if (_inboxChannel) {
                    try { _client()?.removeChannel(_inboxChannel); } catch {}
                    _inboxChannel = null;
                }
                const btn = document.getElementById('menuInboxBtn');
                if (btn) btn.style.display = 'none';
            }
        });

        // Al entrar en un topic (el collab-guard ya dispara esto)
        global.addEventListener('etheria:topic-enter', function (e) {
            const topicId = e.detail?.topicId;
            if (topicId) joinTopicPresence(topicId);
        });

        // Al salir del topic
        global.addEventListener('etheria:topic-leave', function () {
            leaveTopicPresence();
        });

        // Conectar el textarea del VN al typing emitter
        // Usamos delegación para no depender del orden de carga
        document.addEventListener('input', function (e) {
            if (e.target && (
                e.target.id === 'vnInput' ||
                e.target.classList.contains('vn-input') ||
                e.target.classList.contains('message-input')
            )) {
                emitTyping();
            }
        });
    }

    // Helper escapeHtml por si no está disponible globalmente en este scope
    function escapeHtml(str) {
        if (typeof global.escapeHtml === 'function') return global.escapeHtml(str);
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    // ── API pública ───────────────────────────────────────────────────────────

    global.EtheriaInbox = {
        openInboxModal,
        closeInboxModal,
        goToTopic,
        joinTopicPresence,
        leaveTopicPresence,
        emitTyping,
        get unreadCount() { return _unreadCount; }
    };

    // Alias globales para los onclick del HTML
    global.openInboxModal  = openInboxModal;
    global.closeInboxModal = closeInboxModal;

    // Arrancar cuando el DOM esté listo
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', _init);
    } else {
        _init();
    }

})(window);
