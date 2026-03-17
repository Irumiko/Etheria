// ============================================
// COLLAB-GUARD.JS  v2 — Supabase Realtime
// ============================================
// Capa de coordinación colaborativa multi-usuario.
//
// Arquitectura:
//   - Ya NO hace polling ni peticiones propias
//   - Se engancha a los eventos que SupabaseMessages y SupabaseSync
//     ya disparan, añadiendo solo la lógica de merge de conflictos
//   - Canal Realtime propio para user_data (detecta cuando otro
//     dispositivo/usuario actualiza el perfil compartido)
//   - Merge de mensajes por ID + timestamp (la lógica buena del v1)
//   - Broadcast ligero para ediciones y borrados remotos
//
// Flujo:
//   1. Al entrar a un topic → init(topicId)
//      → suscribe canal Broadcast (edits/deletes del topic)
//      → suscribe canal user_data para merge desde otro dispositivo
//      → escucha etheria:realtime-message (ya disparado por SupabaseMessages)
//   2. Al salir del topic → stop()
//      → limpia canales y listeners
// ============================================

const CollaborativeGuard = (function () {
    'use strict';

    const logger = window.EtheriaLogger;

    // ── Estado interno ────────────────────────────────────────────────────────
    let _topicId          = null;
    let _profileIdx       = 0;
    let _merging          = false;
    let _broadcastChannel = null;   // Broadcast: ediciones/borrados en tiempo real
    let _userDataChannel  = null;   // Realtime: user_data de otro dispositivo
    let _realtimeHandler  = null;   // listener etheria:realtime-message
    let _lastRemoteDataTs = 0;      // evitar reprocesar el mismo update de user_data

    // ── Helpers ───────────────────────────────────────────────────────────────

    function _client() {
        return window.supabaseClient || null;
    }

    function _localMessages() {
        if (!_topicId || typeof getTopicMessages !== 'function') return [];
        return getTopicMessages(_topicId) || [];
    }

    function _isOwnMessage(msg, row) {
        const ownId = window._cachedUserId || null;
        if (ownId && (msg._supabaseUserId || row?.user_id)) {
            return (msg._supabaseUserId || row?.user_id) === ownId;
        }
        return String(msg.userIndex) === String(_profileIdx);
    }

    // ── Merge de mensajes ─────────────────────────────────────────────────────
    // Fusión por ID: en conflicto gana el mensaje con timestamp más reciente.

    function _parseTs(msg) {
        const t = msg.timestamp || msg.editedAt || msg.ts;
        if (!t) return 0;
        if (typeof t === 'number') return t;
        const d = Date.parse(t);
        return isNaN(d) ? 0 : d;
    }

    function _mergeMessages(local, remote) {
        const byId = new Map();
        for (const msg of [...(local || []), ...(remote || [])]) {
            if (!msg || !msg.id) continue;
            const existing = byId.get(msg.id);
            if (!existing || _parseTs(msg) > _parseTs(existing)) {
                byId.set(msg.id, { ...msg });
            }
        }
        return Array.from(byId.values())
            .sort((a, b) => _parseTs(a) - _parseTs(b));
    }

    function _applyMergedMessages(merged) {
        if (!_topicId || !Array.isArray(merged)) return;
        if (typeof appData !== 'undefined' && appData.messages) {
            appData.messages[String(_topicId)] = merged;
        }
        if (typeof persistPartitionedData === 'function') {
            persistPartitionedData();
        }
    }

    function _doMerge(remote) {
        if (_merging) return;
        _merging = true;
        try {
            const merged = _mergeMessages(_localMessages(), remote);
            _applyMergedMessages(merged);
        } finally {
            _merging = false;
        }
    }

    // ── Canal Broadcast: ediciones y borrados remotos ─────────────────────────
    // Ligero y sin latencia de BD. Se activa cuando alguien edita o borra
    // un mensaje para que el resto de participantes lo vean al instante.

    function _subscribeBroadcast(topicId) {
        const c = _client();
        if (!c?.channel) return;

        try {
            _broadcastChannel = c
                .channel(`collab:topic:${topicId}`)
                .on('broadcast', { event: 'msg_edit' }, (payload) => {
                    _handleRemoteEdit(payload?.payload);
                })
                .on('broadcast', { event: 'msg_delete' }, (payload) => {
                    _handleRemoteDelete(payload?.payload);
                })
                .subscribe((status) => {
                    if (status === 'SUBSCRIBED') {
                        logger?.info('collab', `broadcast activo — topic ${topicId}`);
                    } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
                        logger?.warn('collab', `broadcast error: ${status}`);
                    }
                });
        } catch (e) {
            logger?.warn('collab', 'error canal broadcast:', e?.message);
        }
    }

    // ── Canal Realtime: user_data de otro dispositivo ─────────────────────────
    // Complementa el canal de supabaseSync.js. Mientras ese canal descarga
    // el perfil completo, aquí solo mergeamos los mensajes del topic activo
    // para no sobreescribir borradores o cambios locales no guardados.

    function _subscribeUserDataRealtime() {
        const c = _client();
        const uid = window._cachedUserId;
        if (!c?.channel || !uid) return;

        try {
            _userDataChannel = c
                .channel(`collab-userdata:${uid}`)
                .on('postgres_changes', {
                    event: 'UPDATE',
                    schema: 'public',
                    table: 'user_data',
                    filter: `user_id=eq.${uid}`
                }, async (payload) => {
                    const remoteTs = payload?.new?.updated_at
                        ? new Date(payload.new.updated_at).getTime()
                        : 0;

                    // Ignorar si es nuestro propio upsert reciente (< 3s)
                    const lastOwnSync = (typeof SupabaseSync !== 'undefined')
                        ? SupabaseSync.lastSyncTime : 0;
                    if (Date.now() - lastOwnSync < 3000) return;

                    // Ignorar timestamp ya procesado
                    if (remoteTs <= _lastRemoteDataTs) return;
                    _lastRemoteDataTs = remoteTs;

                    try {
                        const remoteData = payload?.new?.data;
                        if (!remoteData || !_topicId) return;

                        const remoteMsgs = remoteData?.messages?.[String(_topicId)];
                        if (!Array.isArray(remoteMsgs) || remoteMsgs.length === 0) return;

                        const local = _localMessages();
                        const localIds = new Set(local.map(m => m.id));
                        const newMsgs = remoteMsgs.filter(m => m?.id && !localIds.has(m.id));
                        if (newMsgs.length === 0) return;

                        logger?.info('collab', `${newMsgs.length} msg(s) desde otro dispositivo`);

                        const replyInput = document.getElementById('vnReplyText');
                        const hasDraft = replyInput && replyInput.value.trim().length > 0;

                        if (hasDraft) {
                            // Tiene borrador — ofrecer sin interrumpir
                            if (typeof eventBus !== 'undefined') {
                                eventBus.emit('ui:show-toast', {
                                    text: `${newMsgs.length} mensaje(s) de otro dispositivo`,
                                    action: 'Cargar',
                                    onAction: () => { _doMerge(remoteMsgs); _refreshUI(); }
                                });
                            }
                        } else {
                            _doMerge(remoteMsgs);
                            _refreshUI();
                            const n = newMsgs.length;
                            if (typeof eventBus !== 'undefined') {
                                eventBus.emit('ui:show-autosave', {
                                    text: `${n} mensaje${n !== 1 ? 's' : ''} sincronizado${n !== 1 ? 's' : ''} desde otro dispositivo`,
                                    state: 'info'
                                });
                            }
                        }
                    } catch (e) {
                        logger?.warn('collab', 'error procesando user_data remoto:', e?.message);
                    }
                })
                .subscribe((status) => {
                    logger?.info('collab', `user_data realtime: ${status}`);
                });
        } catch (e) {
            logger?.warn('collab', 'error canal user_data:', e?.message);
        }
    }

    // ── Handler etheria:realtime-message ─────────────────────────────────────
    // SupabaseMessages.subscribe ya integra los mensajes nuevos.
    // Aquí solo resolvemos conflictos de ID (mismo ID, versiones distintas).

    function _onRealtimeMessage(e) {
        const msg = e.detail?.msg;
        const row = e.detail?.row;
        if (!msg || !msg.id || !_topicId) return;

        // Ignorar si es de otro topic
        if (row?.session_id && String(row.session_id) !== String(_topicId)) return;

        // Ignorar mensajes propios
        if (_isOwnMessage(msg, row)) return;

        // Solo intervenir si hay conflicto de ID
        const local = _localMessages();
        const existing = local.find(m => String(m.id) === String(msg.id));
        if (!existing) return; // mensaje nuevo — supabaseMessages.subscribe ya lo maneja

        // Conflicto — gana el más reciente
        if (_parseTs(msg) > _parseTs(existing)) {
            logger?.info('collab', `conflicto msg ${msg.id} — aplicando versión remota más reciente`);
            _doMerge([...local.filter(m => m.id !== msg.id), msg]);
            _refreshUI();
        }
    }

    // ── Ediciones y borrados remotos ──────────────────────────────────────────

    function _handleRemoteEdit(payload) {
        if (!payload?.msgId || !_topicId) return;
        const msgs = _localMessages();
        const idx = msgs.findIndex(m => String(m.id) === String(payload.msgId));
        if (idx === -1) return;

        const existing = msgs[idx];
        if (_parseTs(payload) <= _parseTs(existing)) return; // nuestra versión es más reciente

        msgs[idx] = { ...existing, ...payload.changes, _remoteEdit: true };
        if (typeof appData !== 'undefined') {
            appData.messages[String(_topicId)] = msgs;
        }
        _refreshUI();
        logger?.info('collab', `edición remota aplicada — msg ${payload.msgId}`);
    }

    function _handleRemoteDelete(payload) {
        if (!payload?.msgId || !_topicId) return;
        const msgs = _localMessages();
        const filtered = msgs.filter(m => String(m.id) !== String(payload.msgId));
        if (filtered.length === msgs.length) return;

        if (typeof appData !== 'undefined') {
            appData.messages[String(_topicId)] = filtered;
        }
        if (typeof hasUnsavedChanges !== 'undefined') hasUnsavedChanges = true;
        if (typeof save === 'function') save({ silent: true });
        _refreshUI();
        logger?.info('collab', `borrado remoto aplicado — msg ${payload.msgId}`);
    }

    // ── Broadcast de cambios propios ──────────────────────────────────────────
    // Llamar desde vn.js al editar o borrar un mensaje propio,
    // para que otros participantes lo vean sin esperar al sync de 30s.

    function broadcastEdit(msgId, changes) {
        if (!_broadcastChannel || !msgId) return;
        try {
            _broadcastChannel.send({
                type: 'broadcast',
                event: 'msg_edit',
                payload: { msgId, changes, timestamp: new Date().toISOString() }
            });
        } catch (e) {
            logger?.warn('collab', 'broadcastEdit failed:', e?.message);
        }
    }

    function broadcastDelete(msgId) {
        if (!_broadcastChannel || !msgId) return;
        try {
            _broadcastChannel.send({
                type: 'broadcast',
                event: 'msg_delete',
                payload: { msgId }
            });
        } catch (e) {
            logger?.warn('collab', 'broadcastDelete failed:', e?.message);
        }
    }

    // ── UI ────────────────────────────────────────────────────────────────────

    function _refreshUI() {
        if (typeof showCurrentMessage === 'function') {
            showCurrentMessage();
        }
    }

    // ── API pública ───────────────────────────────────────────────────────────

    function init(topicId, profileIndex) {
        stop();

        _topicId    = topicId;
        _profileIdx = (typeof profileIndex === 'number') ? profileIndex
            : (typeof currentUserIndex !== 'undefined' ? currentUserIndex : 0);
        _lastRemoteDataTs = 0;

        _subscribeBroadcast(topicId);
        _subscribeUserDataRealtime();

        _realtimeHandler = _onRealtimeMessage;
        window.addEventListener('etheria:realtime-message', _realtimeHandler);

        logger?.info('collab', `collab-guard v2 activo — topic ${topicId}`);
    }

    function stop() {
        const c = _client();

        if (_broadcastChannel && c) {
            try { c.removeChannel(_broadcastChannel); } catch {}
            _broadcastChannel = null;
        }
        if (_userDataChannel && c) {
            try { c.removeChannel(_userDataChannel); } catch {}
            _userDataChannel = null;
        }
        if (_realtimeHandler) {
            window.removeEventListener('etheria:realtime-message', _realtimeHandler);
            _realtimeHandler = null;
        }

        _topicId          = null;
        _merging          = false;
        _lastRemoteDataTs = 0;
    }

    async function forceMerge() {
        if (!_topicId) return;
        if (typeof SupabaseMessages === 'undefined') return;

        const topic = (typeof appData !== 'undefined')
            ? appData.topics?.find(t => String(t.id) === String(_topicId))
            : null;
        const storyId = topic?.storyId || window.currentStoryId || null;

        const remote = await SupabaseMessages.load(_topicId, storyId);
        if (Array.isArray(remote) && remote.length > 0) {
            _doMerge(remote);
            _refreshUI();
            if (typeof eventBus !== 'undefined') {
                eventBus.emit('ui:show-autosave', { text: 'Mensajes actualizados', state: 'info' });
            }
        }
    }

    function getStatus() {
        return {
            active:         !!_topicId,
            topicId:        _topicId,
            broadcastReady: !!_broadcastChannel,
            userDataReady:  !!_userDataChannel,
            localCount:     _localMessages().length
        };
    }

    return { init, stop, forceMerge, getStatus, broadcastEdit, broadcastDelete };

})();

window.CollaborativeGuard = CollaborativeGuard;
