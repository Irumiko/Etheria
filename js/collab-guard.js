// ============================================
// COLLAB-GUARD.JS
// Sistema de colaboración multi-usuario con merge de conflictos.
//
// Integración con infraestructura existente:
//   - Lee/escribe usando fetchCloudBin() / putCloudBin() (JSONbin)
//   - Merge a nivel de mensajes por ID + timestamp (no reemplaza perfiles enteros)
//   - Usa showSyncToast() / showAutosave() ya existentes para UI
//   - Se activa al entrar a un topic, se detiene al salir
//   - No toca save() ni persistPartitionedData() — sólo añade una capa encima
// ============================================

const CollaborativeGuard = (function () {

    // ── Configuración ────────────────────────────────────────────────────────
    const CFG = {
        POLL_INTERVAL:    8000,   // ms entre checks de cambios remotos
        TYPING_TTL:      10000,   // ms hasta que un indicador "escribiendo" expira
        TYPING_KEY:      'etheria_collab_typing',
        COLLAB_ENABLED:  'etheria_collab_enabled',
    };

    // ── Estado interno ───────────────────────────────────────────────────────
    let _topicId      = null;
    let _profileIdx   = 0;       // currentUserIndex en el momento de init
    let _pollTimer    = null;
    let _lastSeenMsgCount = 0;   // cuántos mensajes había en remoto la última vez
    let _lastRemoteModified = 0; // lastModified del cloud la última vez que checkeamos
    let _merging      = false;   // semáforo para evitar merges concurrentes
    let _typingTimer  = null;    // interval ID for typing indicator — cleared in stop()

    // ── Helpers de acceso a datos ────────────────────────────────────────────

    /**
     * Lee los mensajes locales del topic activo desde appData (ya en memoria).
     */
    function _localMessages() {
        if (!_topicId || typeof getTopicMessages !== 'function') return [];
        return getTopicMessages(_topicId) || [];
    }

    /**
     * Cuenta mensajes de todos los topics en un appData snapshot (igual que
     * countMessagesInProfile existente, por si no está disponible).
     */
    function _countMsgs(profileData) {
        if (typeof countMessagesInProfile === 'function') {
            return countMessagesInProfile(profileData);
        }
        if (!profileData || !profileData.messages) return 0;
        return Object.values(profileData.messages)
            .reduce((sum, arr) => sum + (Array.isArray(arr) ? arr.length : 0), 0);
    }

    /**
     * Extrae los mensajes de un topic específico del snapshot remoto.
     * El cloud guarda { profiles: { "0": { appData: { messages: { topicId: [...] } } } } }
     */
    function _remoteTopicMessages(cloudRecord) {
        try {
            const prof = (cloudRecord?.profiles || {})[String(_profileIdx)];
            const msgs = prof?.appData?.messages?.[String(_topicId)];
            return Array.isArray(msgs) ? msgs : [];
        } catch { return []; }
    }

    /**
     * Extrae el lastModified del perfil en el cloud.
     */
    function _remoteModified(cloudRecord) {
        try {
            const prof = (cloudRecord?.profiles || {})[String(_profileIdx)];
            return Number(prof?.lastModified || 0);
        } catch { return 0; }
    }

    // ── Merge ────────────────────────────────────────────────────────────────

    /**
     * Fusiona mensajes de dos fuentes por ID.
     * En caso de conflicto de ID, gana el más reciente (por timestamp ISO).
     * Devuelve array ordenado cronológicamente.
     */
    function _mergeMessages(local, remote) {
        const byId = new Map();

        const parseTs = (msg) => {
            const t = msg.timestamp || msg.editedAt || msg.ts;
            if (!t) return 0;
            if (typeof t === 'number') return t;
            const d = Date.parse(t);
            return isNaN(d) ? 0 : d;
        };

        for (const msg of [...(local || []), ...(remote || [])]) {
            if (!msg || !msg.id) continue;
            const existing = byId.get(msg.id);
            if (!existing) {
                byId.set(msg.id, { ...msg });
            } else {
                // Gana el más reciente
                if (parseTs(msg) > parseTs(existing)) {
                    byId.set(msg.id, { ...msg, _merged: true });
                }
            }
        }

        return Array.from(byId.values())
            .sort((a, b) => {
                const ta = parseTs(a), tb = parseTs(b);
                return ta - tb;
            });
    }

    // ── Aplicar merge al estado local ────────────────────────────────────────

    /**
     * Aplica los mensajes mergeados a appData y refresca la UI sin perder posición.
     */
    function _applyMergedMessages(merged) {
        if (!_topicId || !Array.isArray(merged)) return;

        // Actualizar appData en memoria
        if (typeof appData !== 'undefined' && appData.messages) {
            appData.messages[String(_topicId)] = merged;
        }

        // Persistir localmente (sin subir a cloud — el sync normal se encarga)
        if (typeof persistPartitionedData === 'function') {
            persistPartitionedData();
        }

        // Refrescar UI sin mover el índice de mensaje actual
        if (typeof showCurrentMessage === 'function') {
            showCurrentMessage();
        }
    }

    // ── Poll ─────────────────────────────────────────────────────────────────

    async function _poll() {
        if (!_topicId || _merging) return;

        // collab-guard aún no está migrado a Supabase.
        // fetchCloudBin existe como stub deprecado que devuelve null,
        // por lo que la guarda anterior no era suficiente.
        // Desactivar el poll hasta que se migre a Supabase Realtime.
        // TODO: reemplazar por suscripción a Supabase Realtime cuando esté disponible.
        return;

        try {
            const cloud = await fetchCloudBin();
            const remoteModified = _remoteModified(cloud);
            const remoteTopicMsgs = _remoteTopicMessages(cloud);
            const remoteCount = remoteTopicMsgs.length;
            const localMsgs = _localMessages();
            const localCount = localMsgs.length;

            // Nada nuevo
            if (remoteModified <= _lastRemoteModified && remoteCount <= _lastSeenMsgCount) return;

            _lastRemoteModified = remoteModified;

            // Calcular mensajes genuinamente nuevos (no están en local por ID)
            const localIds = new Set(localMsgs.map(m => m.id));
            const newRemote = remoteTopicMsgs.filter(m => m.id && !localIds.has(m.id));

            if (newRemote.length === 0) {
                _lastSeenMsgCount = remoteCount;
                return;
            }

            _lastSeenMsgCount = remoteCount;

            // Comprobar si el usuario está escribiendo activamente
            const replyInput = document.getElementById('vnReplyText');
            const hasDraft = replyInput && replyInput.value.trim().length > 0;

            if (hasDraft) {
                // Tiene borrador — notificar sin aplicar, para no interrumpir
                const n = newRemote.length;
                const label = n === 1 ? '1 mensaje nuevo' : `${n} mensajes nuevos`;
                eventBus.emit('ui:show-toast', {
                    text: label + ' de otro jugador',
                    action: 'Ver ahora',
                    onAction: () => { _doMerge(localMsgs, remoteTopicMsgs); }
                });
            } else {
                // Sin borrador — merge silencioso y refresco automático
                _doMerge(localMsgs, remoteTopicMsgs);
                const n = newRemote.length;
                const label = n === 1 ? '1 mensaje nuevo recibido' : `${n} mensajes nuevos recibidos`;
                eventBus.emit('ui:show-autosave', { text: label, state: 'info' });
            }

        } catch (err) {
            // Silencioso — el sync normal ya gestiona errores de red
            console.debug('[CollabGuard] poll error:', err?.message || err);
        }
    }

    function _doMerge(local, remote) {
        if (_merging) return;
        _merging = true;
        try {
            const merged = _mergeMessages(local, remote);
            _applyMergedMessages(merged);
        } finally {
            _merging = false;
        }
    }

    // ── Indicador "escribiendo" ──────────────────────────────────────────────

    function _setTyping(isTyping) {
        if (!_topicId) return;
        try {
            const state = {
                topicId:   String(_topicId),
                userIndex: _profileIdx,
                isTyping,
                ts:        Date.now()
            };
            localStorage.setItem(CFG.TYPING_KEY, JSON.stringify(state));
        } catch { /* localStorage lleno — no crítico */ }
    }

    function _readTyping() {
        try {
            const raw = localStorage.getItem(CFG.TYPING_KEY);
            if (!raw) return null;
            const s = JSON.parse(raw);
            // Expirado o del mismo usuario o de otro topic
            if (!s || Date.now() - s.ts > CFG.TYPING_TTL) return null;
            if (s.topicId !== String(_topicId)) return null;
            if (s.userIndex === _profileIdx) return null;
            return s;
        } catch { return null; }
    }

    function _updateTypingUI() {
        const state = _readTyping();
        const el = document.getElementById('collabTypingIndicator');
        if (!el) return;

        if (state && state.isTyping) {
            el.textContent = 'Alguien está escribiendo…';
            el.classList.add('visible');
        } else {
            el.classList.remove('visible');
            // Limpiar texto con delay para que la animación termine
            setTimeout(() => { if (!el.classList.contains('visible')) el.textContent = ''; }, 400);
        }
    }

    // ── API pública ──────────────────────────────────────────────────────────

    /**
     * Inicializar para un topic.
     * Llamar al entrar a enterTopic().
     */
    function init(topicId, profileIndex) {
        stop(); // limpiar estado previo

        _topicId    = topicId;
        _profileIdx = (typeof profileIndex === 'number') ? profileIndex
                    : (typeof currentUserIndex !== 'undefined' ? currentUserIndex : 0);

        // Snapshot inicial para comparar en polls futuros
        _lastSeenMsgCount    = _localMessages().length;
        _lastRemoteModified  = 0; // se actualizará en el primer poll

        // Iniciar polling
        _poll(); // inmediato
        _pollTimer = setInterval(_poll, CFG.POLL_INTERVAL);

        // Hook: intercepción de emitTypingState (ya existe en vn.js)
        // Sólo enriquece el canal de localStorage con el estado de typing propio
        const _origEmit = window.emitTypingState;
        if (_origEmit && !window._collabEmitPatched) {
            window._collabEmitPatched = true;
            window.emitTypingState = function (active) {
                _setTyping(active);
                _origEmit.call(this, active);
            };
        }

        // Actualizar indicador de typing en cada poll
        _typingTimer = setInterval(_updateTypingUI, 2000);

        console.debug(`[CollabGuard] activo para topic ${topicId}`);
    }

    /**
     * Detener — llamar al salir del topic.
     */
    function stop() {
        if (_pollTimer) { clearInterval(_pollTimer); _pollTimer = null; }
        if (_typingTimer) { clearInterval(_typingTimer); _typingTimer = null; }
        if (_topicId) _setTyping(false); // limpiar indicador propio
        _topicId   = null;
        _merging   = false;
        _lastSeenMsgCount   = 0;
        _lastRemoteModified = 0;

        // Retirar patch de emitTypingState
        if (window._collabEmitPatched) {
            // No revertimos para no romper referencias — simplemente lo dejamos
            // funcionar normalmente (la rama _setTyping es no-op cuando _topicId = null)
        }
    }

    /**
     * Forzar merge manual (útil para botón de "refrescar" si se quiere exponer).
     */
    async function forceMerge() {
        // collab-guard pendiente de migración a Supabase — operación desactivada temporalmente.
        if (!_topicId) return;
        eventBus.emit('ui:show-autosave', { text: 'Colaboración en tiempo real próximamente', state: 'info' });
    }

    function getStatus() {
        return {
            active:     !!_topicId,
            topicId:    _topicId,
            polling:    !!_pollTimer,
            localCount: _localMessages().length,
            lastSeen:   _lastSeenMsgCount
        };
    }

    return { init, stop, forceMerge, getStatus };

})();

window.CollaborativeGuard = CollaborativeGuard;
