// ============================================
// SUPABASE CONVERSATIONS — Mensajería entre usuarios
// ============================================
// Buzón bidireccional: cualquier usuario registrado puede escribirle a
// cualquier otro (mismo espíritu que la visibilidad abierta de personajes
// y temas). Hilos 1:1, con notificación push reutilizando turn_notifications.
//
// Tablas: conversations, conversation_participants, conversation_messages.
// Crear una conversación pasa siempre por start_or_get_conversation() (RPC),
// que resuelve el owner_user_id real a partir del profile_id elegido en el
// buscador — el cliente nunca ve ids de cuenta ajenos directamente.
// ============================================

(function (global) {
    'use strict';

    const logger = global.EtheriaLogger;

    function _client() { return global.supabaseClient || null; }

    async function _userId() {
        if (typeof global.getEtheriaUserId === 'function') return global.getEtheriaUserId();
        return global._cachedUserId || null;
    }

    function _esc(s) {
        if (typeof global.escapeHtml === 'function') return global.escapeHtml(s);
        return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    // ── Estado local ─────────────────────────────────────────────────────────

    let _conversations   = [];   // [{ conversationId, otherUserId, otherName, otherAvatar, lastMessage, lastMessageAt, lastSenderId, unread }]
    let _unreadCount     = 0;
    let _activeThreadId  = null;
    let _threadMessages  = [];
    let _messagesChannel = null;

    // ── Buscar destinatario (directorio público de perfiles) ──────────────────

    async function searchProfiles(query) {
        const c = _client();
        if (!c) return [];
        const q = String(query || '').trim();
        if (q.length < 1) return [];
        try {
            const { data, error } = await c
                .from('profiles_directory')
                .select('id, name, avatar')
                .ilike('name', `%${q}%`)
                .order('name', { ascending: true })
                .limit(15);
            if (error) { logger?.warn('conversations', 'searchProfiles error:', error.message); return []; }
            return data || [];
        } catch (e) {
            logger?.warn('conversations', 'searchProfiles exception:', e?.message);
            return [];
        }
    }

    // ── Iniciar o recuperar una conversación con un perfil ────────────────────

    async function startConversation(profileId) {
        const c = _client();
        if (!c || !profileId) return { ok: false };
        try {
            const { data, error } = await c.rpc('start_or_get_conversation', { p_other_profile_id: profileId });
            if (error) return { ok: false, error: error.message };
            return { ok: true, conversationId: data };
        } catch (e) {
            return { ok: false, error: e?.message };
        }
    }

    // ── Lista de conversaciones ────────────────────────────────────────────────

    async function loadConversations() {
        const c = _client();
        const uid = await _userId();
        if (!c || !uid) { _conversations = []; return _conversations; }

        try {
            const { data: myParts, error: partsErr } = await c
                .from('conversation_participants')
                .select('conversation_id, last_read_at')
                .eq('user_id', uid);
            if (partsErr || !myParts?.length) { _conversations = []; _recomputeUnread(); return _conversations; }

            const convIds = myParts.map(p => p.conversation_id);

            const [{ data: convs }, { data: others }, { data: allMsgs }] = await Promise.all([
                c.from('conversations').select('id, last_message_at').in('id', convIds).order('last_message_at', { ascending: false }),
                c.from('conversation_participants').select('conversation_id, user_id').in('conversation_id', convIds).neq('user_id', uid),
                c.from('conversation_messages').select('conversation_id, body, created_at, sender_id').in('conversation_id', convIds).order('created_at', { ascending: false })
            ]);

            const otherByConv = new Map((others || []).map(o => [o.conversation_id, o.user_id]));
            const lastMsgByConv = new Map();
            (allMsgs || []).forEach(m => {
                if (!lastMsgByConv.has(m.conversation_id)) lastMsgByConv.set(m.conversation_id, m);
            });
            const readAtByConv = new Map(myParts.map(p => [p.conversation_id, p.last_read_at]));

            const otherIds = [...new Set([...otherByConv.values()])];
            let profilesByUser = new Map();
            if (otherIds.length) {
                const { data: profs } = await c
                    .from('profiles')
                    .select('name, avatar, owner_user_id')
                    .in('owner_user_id', otherIds);
                (profs || []).forEach(p => {
                    if (!profilesByUser.has(p.owner_user_id)) profilesByUser.set(p.owner_user_id, p);
                });
            }

            _conversations = (convs || []).map(conv => {
                const otherUserId = otherByConv.get(conv.id) || null;
                const prof = otherUserId ? profilesByUser.get(otherUserId) : null;
                const lastMsg = lastMsgByConv.get(conv.id) || null;
                const lastReadAt = readAtByConv.get(conv.id) || null;
                const unread = !!lastMsg
                    && lastMsg.sender_id !== uid
                    && (!lastReadAt || new Date(lastMsg.created_at) > new Date(lastReadAt));
                return {
                    conversationId: conv.id,
                    otherUserId,
                    otherName: prof?.name || 'Usuario',
                    otherAvatar: prof?.avatar || '',
                    lastMessage: lastMsg?.body || '',
                    lastMessageAt: lastMsg?.created_at || conv.last_message_at,
                    lastSenderId: lastMsg?.sender_id || null,
                    unread
                };
            });

            _recomputeUnread();
            return _conversations;
        } catch (e) {
            logger?.warn('conversations', 'loadConversations exception:', e?.message);
            return _conversations;
        }
    }

    function _recomputeUnread() {
        _unreadCount = _conversations.filter(c => c.unread).length;
        global.dispatchEvent(new CustomEvent('etheria:conversations-unread-changed', { detail: { count: _unreadCount } }));
    }

    // ── Hilo de mensajes ───────────────────────────────────────────────────────

    async function loadMessages(conversationId) {
        const c = _client();
        if (!c || !conversationId) return [];
        try {
            const { data, error } = await c
                .from('conversation_messages')
                .select('id, sender_id, body, created_at')
                .eq('conversation_id', conversationId)
                .order('created_at', { ascending: true })
                .limit(300);
            if (error) { logger?.warn('conversations', 'loadMessages error:', error.message); return []; }
            return data || [];
        } catch (e) {
            logger?.warn('conversations', 'loadMessages exception:', e?.message);
            return [];
        }
    }

    async function sendMessage(conversationId, body) {
        const c = _client();
        const uid = await _userId();
        const text = String(body || '').trim();
        if (!c || !uid || !conversationId || !text) return { ok: false };
        try {
            const { data, error } = await c
                .from('conversation_messages')
                .insert({ conversation_id: conversationId, sender_id: uid, body: text })
                .select('id, sender_id, body, created_at')
                .single();
            if (error) return { ok: false, error: error.message };
            return { ok: true, message: data };
        } catch (e) {
            return { ok: false, error: e?.message };
        }
    }

    async function markConversationRead(conversationId) {
        const c = _client();
        const uid = await _userId();
        if (!c || !uid || !conversationId) return;
        try {
            await c.from('conversation_participants')
                .update({ last_read_at: new Date().toISOString() })
                .eq('conversation_id', conversationId)
                .eq('user_id', uid);
            const conv = _conversations.find(x => x.conversationId === conversationId);
            if (conv && conv.unread) { conv.unread = false; _recomputeUnread(); }
        } catch (e) {
            logger?.warn('conversations', 'markConversationRead error:', e?.message);
        }
    }

    // ── Realtime: nuevos mensajes en cualquier conversación propia ────────────
    // RLS ya limita lo que llega por el canal a conversaciones donde
    // participo — no hace falta filtrar por conversation_id aquí.

    async function _subscribeMessages() {
        const c = _client();
        const uid = await _userId();
        if (!c?.channel || !uid) return;
        if (_messagesChannel) { try { await c.removeChannel(_messagesChannel); } catch {} }

        _messagesChannel = c
            .channel(`conversations:${uid}`)
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'conversation_messages' }, (payload) => {
                const row = payload?.new;
                if (!row) return;
                if (row.sender_id === uid) return; // ya lo tenemos por el insert optimista propio

                if (_activeThreadId === row.conversation_id) {
                    _threadMessages.push(row);
                    _renderThreadMessages();
                    markConversationRead(row.conversation_id);
                }
                loadConversations().then(_renderConversationsList);
            })
            .subscribe();
    }

    async function _unsubscribeMessages() {
        const c = _client();
        if (_messagesChannel && c) { try { await c.removeChannel(_messagesChannel); } catch {} }
        _messagesChannel = null;
    }

    // ── UI: lista de conversaciones ────────────────────────────────────────────

    function _renderConversationsList() {
        const list = document.getElementById('conversationsList');
        if (!list) return;

        if (_conversations.length === 0) {
            list.innerHTML = '<p class="inbox-empty">Todavía no tienes ninguna conversación.</p>';
            return;
        }

        list.innerHTML = '';
        _conversations.forEach(conv => {
            const date = conv.lastMessageAt ? new Date(conv.lastMessageAt) : null;
            const dateStr = date
                ? date.toLocaleDateString('es-ES', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
                : '';
            const item = document.createElement('div');
            item.className = 'inbox-item conversation-item' + (conv.unread ? ' inbox-item--unread' : '');
            const avatarHtml = conv.otherAvatar
                ? `<img src="${_esc(conv.otherAvatar)}" alt="${_esc(conv.otherName)}" class="conversation-item-avatar">`
                : `<span class="conversation-item-avatar conversation-item-avatar--placeholder">${_esc((conv.otherName || '?')[0])}</span>`;
            item.innerHTML =
                avatarHtml +
                `<div class="inbox-item-body">` +
                `<p class="inbox-item-title">${_esc(conv.otherName)}</p>` +
                `<p class="inbox-item-text">${_esc(conv.lastMessage || 'Sin mensajes todavía')}</p>` +
                (dateStr ? `<p class="inbox-item-date">${_esc(dateStr)}</p>` : '') +
                `</div>`;
            item.addEventListener('click', () => openThread(conv.conversationId, conv.otherName, conv.otherAvatar));
            list.appendChild(item);
        });
    }

    // ── UI: buscador de nueva conversación ──────────────────────────────────────

    let _searchDebounce = null;

    function openNewConversation() {
        document.getElementById('conversationsListView').style.display = 'none';
        document.getElementById('conversationThreadView').style.display = 'none';
        document.getElementById('newConversationSearch').style.display = '';
        const input = document.getElementById('conversationSearchInput');
        if (input) { input.value = ''; input.focus(); }
        document.getElementById('conversationSearchResults').innerHTML = '';
    }

    function closeNewConversation() {
        document.getElementById('newConversationSearch').style.display = 'none';
        document.getElementById('conversationsListView').style.display = '';
    }

    function searchProfilesUI(query) {
        clearTimeout(_searchDebounce);
        _searchDebounce = setTimeout(async () => {
            const results = await searchProfiles(query);
            const container = document.getElementById('conversationSearchResults');
            if (!container) return;
            if (results.length === 0) {
                container.innerHTML = query.trim()
                    ? '<p class="inbox-empty">Nadie con ese nombre.</p>'
                    : '';
                return;
            }
            container.innerHTML = '';
            results.forEach(p => {
                const item = document.createElement('div');
                item.className = 'inbox-item conversation-item';
                const avatarHtml = p.avatar
                    ? `<img src="${_esc(p.avatar)}" alt="${_esc(p.name)}" class="conversation-item-avatar">`
                    : `<span class="conversation-item-avatar conversation-item-avatar--placeholder">${_esc((p.name || '?')[0])}</span>`;
                item.innerHTML = avatarHtml + `<div class="inbox-item-body"><p class="inbox-item-title">${_esc(p.name)}</p></div>`;
                item.addEventListener('click', async () => {
                    const res = await startConversation(p.id);
                    if (!res.ok) {
                        if (typeof showAutosave === 'function') showAutosave(res.error || 'No se pudo iniciar la conversación', 'error');
                        return;
                    }
                    closeNewConversation();
                    await loadConversations();
                    _renderConversationsList();
                    openThread(res.conversationId, p.name, p.avatar);
                });
                container.appendChild(item);
            });
        }, 250);
    }

    // ── UI: hilo de mensajes ─────────────────────────────────────────────────

    async function openThread(conversationId, otherName, otherAvatar) {
        _activeThreadId = conversationId;
        document.getElementById('conversationsListView').style.display = 'none';
        document.getElementById('newConversationSearch').style.display = 'none';
        document.getElementById('conversationThreadView').style.display = '';

        const nameEl = document.getElementById('conversationThreadName');
        const avatarEl = document.getElementById('conversationThreadAvatar');
        if (nameEl) nameEl.textContent = otherName || 'Usuario';
        if (avatarEl) {
            if (otherAvatar) { avatarEl.src = otherAvatar; avatarEl.style.display = ''; }
            else avatarEl.style.display = 'none';
        }

        document.getElementById('conversationMessages').innerHTML = '<p class="inbox-empty">Cargando...</p>';
        _threadMessages = await loadMessages(conversationId);
        _renderThreadMessages();
        markConversationRead(conversationId);

        const input = document.getElementById('conversationComposeInput');
        if (input) input.focus();
    }

    function closeThread() {
        _activeThreadId = null;
        _threadMessages = [];
        document.getElementById('conversationThreadView').style.display = 'none';
        document.getElementById('conversationsListView').style.display = '';
        loadConversations().then(_renderConversationsList);
    }

    function _renderThreadMessages() {
        const container = document.getElementById('conversationMessages');
        if (!container) return;
        const myUid = global._cachedUserId;

        if (_threadMessages.length === 0) {
            container.innerHTML = '<p class="inbox-empty">Todavía no hay mensajes — escribe el primero.</p>';
            return;
        }

        container.innerHTML = _threadMessages.map(m => {
            const mine = m.sender_id === myUid;
            const time = m.created_at
                ? new Date(m.created_at).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })
                : '';
            return `<div class="conversation-bubble ${mine ? 'conversation-bubble--mine' : 'conversation-bubble--theirs'}">` +
                `<p class="conversation-bubble-text">${_esc(m.body)}</p>` +
                `<span class="conversation-bubble-time">${_esc(time)}</span>` +
                `</div>`;
        }).join('');
        container.scrollTop = container.scrollHeight;
    }

    async function sendCurrentMessage() {
        const input = document.getElementById('conversationComposeInput');
        if (!input || !_activeThreadId) return;
        const text = input.value.trim();
        if (!text) return;
        input.value = '';

        const res = await sendMessage(_activeThreadId, text);
        if (!res.ok) {
            if (typeof showAutosave === 'function') showAutosave(res.error || 'No se pudo enviar el mensaje', 'error');
            input.value = text; // devolver el texto para no perderlo
            return;
        }
        _threadMessages.push(res.message);
        _renderThreadMessages();
    }

    // ── Arranque ──────────────────────────────────────────────────────────────

    async function initForMessagesTab() {
        await loadConversations();
        _renderConversationsList();
        await _subscribeMessages();
    }

    global.addEventListener('etheria:auth-changed', function (e) {
        if (!e.detail?.user) {
            _conversations = [];
            _unreadCount = 0;
            _activeThreadId = null;
            _unsubscribeMessages();
        } else {
            // Suscribirse ya para poder mostrar el contador de no leídos en
            // el badge del buzón aunque el usuario no haya abierto la pestaña.
            loadConversations().then(() => _recomputeUnread());
            _subscribeMessages();
        }
    });

    global.EtheriaConversations = {
        initForMessagesTab,
        openNewConversation,
        closeNewConversation,
        searchProfilesUI,
        openThread,
        closeThread,
        sendCurrentMessage,
        get unreadCount() { return _unreadCount; }
    };

})(window);
