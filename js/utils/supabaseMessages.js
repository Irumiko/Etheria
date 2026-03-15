// ============================================
// SUPABASE REALTIME MESSAGES
// ============================================
// Capa adicional para rol en tiempo real.
// Tabla: id (uuid), session_id (text), author (text),
//        content (text), created_at (timestamp).
//
// No sustituye localStorage ni jsonbin.io.
// Si Supabase falla, la app continúa sin errores.
// ============================================

(function (global) {

    const cfg = global.SUPABASE_CONFIG || {};
    const logger = global.EtheriaLogger;

    const SB_URL = cfg.url;
    const SB_KEY = cfg.key;

    const BASE_REST_HEADERS = {
        'apikey'        : SB_KEY,
        'Content-Type'  : 'application/json',
        'Prefer'        : 'return=minimal'
    };

    const MESSAGES_PAGE_SIZE = 100; // Fix 8: initial load limit per topic/story

    let _client    = null;   // instancia supabase-js (cargada desde CDN)
    let _channel   = null;   // canal realtime activo
    let _available = null;   // null = sin verificar | true | false
    let _cachedUserId = null; // Fix 6: cached auth user ID — avoids getUser() on every send

    // ── Init (lazy) ───────────────────────────────────────────────────────────

    function _init() {
        if (_client) return true;
        try {
            // supabase-js expone window.supabase cuando se carga desde CDN ESM
            const lib = global.supabase;
            if (!lib || typeof lib.createClient !== 'function') return false;
            _client = global.supabaseClient || lib.createClient(SB_URL, SB_KEY);
            return true;
        } catch (e) {
            logger?.warn('supabase:messages', 'init error:', e.message);
            _available = false;
            return false;
        }
    }

    async function _getAccessToken() {
        return global.SupabaseAuthHeaders?.getAccessToken
            ? global.SupabaseAuthHeaders.getAccessToken(global.supabaseClient)
            : null;
    }

    async function _restHeaders() {
        if (global.SupabaseAuthHeaders?.buildAuthHeaders) {
            return global.SupabaseAuthHeaders.buildAuthHeaders({
                apikey: SB_KEY,
                client: global.supabaseClient,
                baseHeaders: BASE_REST_HEADERS,
            });
        }
        const token = await _getAccessToken();
        return { ...BASE_REST_HEADERS, Authorization: 'Bearer ' + (token || SB_KEY) };
    }

    // ── Helpers para character_id ─────────────────────────────────────────────

    /**
     * Resuelve el character_id de Supabase para el personaje activo.
     * Busca en appData.cloudCharacters usando el characterId local (UUID local
     * o ID de appData.characters). Si no hay match, devuelve null — el campo
     * es opcional y los mensajes siguen funcionando sin él.
     *
     * @param  {string|null} localCharId  msgObj.characterId (ID del sistema local)
     * @returns {string|null}             UUID de la tabla Supabase characters, o null
     */
    function _resolveSupabaseCharacterId(localCharId) {
        if (!localCharId) return null;
        try {
            const cloudChars = global.appData?.cloudCharacters;
            if (!cloudChars || typeof cloudChars !== 'object') return null;
            // Recorrer todos los perfiles en caché
            for (const profileChars of Object.values(cloudChars)) {
                if (!Array.isArray(profileChars)) continue;
                const match = profileChars.find(function (c) {
                    return String(c.id) === String(localCharId)
                        || String(c.local_id) === String(localCharId); // por si se guardó mapping
                });
                if (match) return match.id;
            }
        } catch (error) { logger?.warn('supabase:messages', 'resolve character id failed:', error?.message || error); }
        return null;
    }

    /**
     * Extrae el nombre del personaje de una fila de Supabase.
     * Prioridad:
     *   1. characters.name  — del join (dato fresco de Supabase)
     *   2. charName         — del JSON serializado en content (compatibilidad)
     *   3. author           — campo legacy de filas muy antiguas
     *   4. 'Desconocido'    — fallback final
     *
     * @param  {object} row  Fila cruda de Supabase (con join characters)
     * @param  {object} msg  Objeto ya parseado desde row.content
     * @returns {string}
     */
    function _resolveCharacterName(row, msg) {
        // 1. Join fresco desde la tabla characters
        const joinedName = row.characters?.name;
        if (joinedName && typeof joinedName === 'string' && joinedName.trim()) {
            return joinedName.trim();
        }
        // 2. Campo serializado en content (mensajes nuevos y mensajes antiguos con charName)
        if (msg.charName && typeof msg.charName === 'string' && msg.charName.trim()) {
            return msg.charName.trim();
        }
        // 3. Campo author legacy (mensajes muy antiguos que usaban author como nombre)
        if (row.author && typeof row.author === 'string' && row.author.trim()
                && row.author !== '0' && !/^\d+$/.test(row.author.trim())) {
            return row.author.trim();
        }
        // 4. Fallback
        return msg.isNarrator ? 'Narrador' : 'Desconocido';
    }

    // Fix 6: populate _cachedUserId when auth state changes
    if (typeof window !== 'undefined') {
        window.addEventListener('etheria:auth-changed', function (e) {
            _cachedUserId = e.detail?.user?.id || null;
        });
    }

    // ── send ─────────────────────────────────────────────────────────────────
    // Guarda el mensaje completo de Etheria serializado en `content`.
    // Añade character_id (columna nueva) si el personaje activo existe en Supabase.
    // Retrocompatible: si character_id es null, el mensaje funciona igual.

    async function send(sessionId, msgObj) {
        if (_available === false) return false;

        try {
            const sbClient = global.supabaseClient;
            if (!sbClient || !sbClient.auth || typeof sbClient.auth.getUser !== 'function') {
                _available = false;
                return false;
            }

            // Fix 4 + 6: use cached userId; fall back to live getUser() if not yet populated
            let _uid = _cachedUserId;
            if (!_uid) {
                const { data: { user: _u } } = await sbClient.auth.getUser();
                _uid = _u?.id || null;
                if (_uid) _cachedUserId = _uid;
            }
            if (!_uid) { return false; }
            const user = { id: _uid };

            // Resolver character_id de Supabase (null si no hay match o es Narrador)
            const supabaseCharId = msgObj.isNarrator
                ? null
                : _resolveSupabaseCharacterId(msgObj.characterId);

            const row = {
                session_id   : String(sessionId),
                user_id      : user.id,
                author       : String(msgObj.userIndex ?? 0),
                // story_id — null si no hay historia activa (retrocompatible)
                story_id     : global.currentStoryId || null,
                // Nueva columna — null si el personaje no está en Supabase characters
                character_id : supabaseCharId,
                content      : JSON.stringify({
                    id               : msgObj.id,
                    characterId      : msgObj.characterId       || null,
                    charName         : msgObj.charName          || null,
                    charColor        : msgObj.charColor         || null,
                    charAvatar       : msgObj.charAvatar        || null,
                    charSprite       : msgObj.charSprite        || null,
                    text             : msgObj.text              || '',
                    isNarrator       : !!msgObj.isNarrator,
                    isGarrick        : !!msgObj.isGarrick,
                    isGarrickFarewell: !!msgObj.isGarrickFarewell,
                    isOracleResult   : !!msgObj.isOracleResult,
                    chapter          : msgObj.chapter           || undefined,
                    userIndex        : msgObj.userIndex         ?? 0,
                    timestamp        : msgObj.timestamp         || new Date().toISOString(),
                    weather          : msgObj.weather           || undefined,
                    diceRoll         : msgObj.diceRoll          || undefined,
                    options          : msgObj.options           || undefined,
                    oracle           : msgObj.oracle            || undefined,
                    metaType         : msgObj.metaType          || undefined,
                    typing           : msgObj.typing            || undefined
                })
            };

            const res = await fetch(SB_URL + '/rest/v1/messages', {
                method  : 'POST',
                headers : await _restHeaders(),
                body    : JSON.stringify(row),
                signal  : AbortSignal.timeout(5000)
            });

            if (!res.ok) {
                const detail = await res.text().catch(() => String(res.status));
                logger?.warn('supabase:messages', 'send failed (' + res.status + '):', detail);
                _available = false;
                return false;
            }

            _available = true;
            return true;

        } catch (e) {
            logger?.error('supabase:messages', 'send error:', e.message);
            _available = false;
            return false;
        }
    }

    // ── load ──────────────────────────────────────────────────────────────────
    // Devuelve array de objetos mensaje de Etheria, o null si falla.
    // Hace join con characters para obtener el nombre fresco.
    // Retrocompatible con mensajes sin character_id.

    async function load(sessionId, storyId) {
        try {
            // GET no necesita 'Prefer: return=minimal' (eso es para POST/PATCH).
            // Usamos headers limpios para que PostgREST devuelva el join correctamente.
            const loadHeaders = {
                ...(await _restHeaders()),
                'Accept': 'application/json'
            };

            // Si hay story_id activo, filtrar por él; si no, usar session_id (retrocompatible)
            const activeStoryId = storyId || global.currentStoryId || null;
            const filter = activeStoryId
                ? '?story_id=eq.' + encodeURIComponent(activeStoryId)
                : '?session_id=eq.' + encodeURIComponent(sessionId);

            // Fix 8: load most recent MESSAGES_PAGE_SIZE messages (desc), then reverse
            // Pass before= ISO timestamp to load older pages (cursor-based pagination)
            const _beforeCursor = (typeof arguments[2] === 'string') ? arguments[2] : null;
            const _cursorFilter = _beforeCursor ? '&created_at=lt.' + encodeURIComponent(_beforeCursor) : '';
            const res = await fetch(
                SB_URL + '/rest/v1/messages'
                    + filter
                    + '&order=created_at.desc'
                    + '&limit=' + MESSAGES_PAGE_SIZE
                    + _cursorFilter
                    + '&select=*,characters(name)',
                { headers: loadHeaders, signal: AbortSignal.timeout(6000) }
            );

            if (!res.ok) {
                _available = false;
                return null;
            }

            const rows = await res.json();
            _available = true;

            // Fix 8: results come desc (newest first) — reverse for display order
            rows.reverse();
            return rows.reduce(function (acc, row) {
                try {
                    const msg = JSON.parse(row.content);

                    // Usar created_at como timestamp si el mensaje no lo trae
                    if (!msg.timestamp) msg.timestamp = row.created_at;

                    // Filtrar mensajes de typing
                    if (msg.metaType === 'typing') return acc;

                    // Enriquecer charName con el dato fresco del join.
                    // _resolveCharacterName aplica la cadena de prioridad y el fallback.
                    if (!msg.isNarrator) {
                        msg.charName = _resolveCharacterName(row, msg);
                    }

                    // Propagar character_id de Supabase al objeto mensaje
                    // para que el sistema local pueda usarlo si lo necesita.
                    if (row.character_id) {
                        msg.supabaseCharacterId = row.character_id;
                    }

                    acc.push(msg);
                } catch (error) {
                    logger?.warn('supabase:messages', 'invalid row while loading messages:', error?.message || error);
                }
                return acc;
            }, []);

        } catch (e) {
            logger?.warn('supabase:messages', 'load error:', e.message);
            _available = false;
            return null;
        }
    }

    // ── loadOlderMessages (Fix 8: cursor-based pagination) ──────────────────────
    // Loads messages older than `beforeTimestamp` (ISO string).
    // Returns array of messages or null on failure.
    async function loadOlderMessages(sessionId, beforeTimestamp, storyId) {
        return load(sessionId, storyId, beforeTimestamp);
    }

    // ── subscribe ─────────────────────────────────────────────────────────────
    // Usa supabase-js channel().on() para escuchar INSERTs filtrados por session_id.
    // onMessage(msgObj) recibe el objeto mensaje de Etheria deserializado.

    function subscribe(sessionId, onMessage, onTyping, onReconnect) {
        if (!_init()) {
            logger?.warn('supabase:messages', 'subscribe: cliente no disponible');
            return;
        }

        unsubscribe();

        // Si hay una historia activa, el canal de historia (supabaseStories) ya filtra por story_id.
        // El canal session filtra mensajes del topic sin story_id para retrocompatibilidad.
        const activeStoryId = global.currentStoryId || null;
        const channelName = activeStoryId ? 'story-session:' + activeStoryId : 'room:' + sessionId;
        const filterExpr = activeStoryId
            ? 'story_id=eq.' + activeStoryId
            : 'session_id=eq.' + sessionId;

        try {
            _channel = _client
                .channel(channelName)
                .on(
                    'postgres_changes',
                    {
                        event  : 'INSERT',
                        schema : 'public',
                        table  : 'messages',
                        filter : filterExpr
                    },
                    function (payload) {
                        try {
                            var row = payload.new;
                            if (!row || !row.content) return;
                            var msg = JSON.parse(row.content);
                            if (!msg.timestamp) msg.timestamp = row.created_at;
                            if (msg && msg.metaType === 'typing') {
                                if (typeof onTyping === 'function') onTyping(msg);
                                return;
                            }
                            // Realtime no incluye el join — resolver nombre desde caché local
                            // de SupabaseCharacters si está disponible, o usar charName del content
                            if (!msg.isNarrator && row.character_id) {
                                msg.supabaseCharacterId = row.character_id;
                                // Buscar en caché de personajes de Supabase
                                try {
                                    var cloudChars = global.appData && global.appData.cloudCharacters;
                                    if (cloudChars) {
                                        for (var pid in cloudChars) {
                                            var chars = cloudChars[pid];
                                            if (!Array.isArray(chars)) continue;
                                            var found = chars.find(function (c) { return c.id === row.character_id; });
                                            if (found && found.name) {
                                                msg.charName = found.name;
                                                break;
                                            }
                                        }
                                    }
                                } catch (error) { logger?.debug('supabase:messages', 'cloud character cache unavailable:', error?.message || error); }
                            }
                            // Fix 4: attach server-assigned user_id for identity checks
                            if (row.user_id) msg._supabaseUserId = row.user_id;
                            if (typeof onMessage === 'function') onMessage(msg);
                        } catch (error) {
                            logger?.warn('supabase:messages', 'unexpected realtime payload:', error?.message || error);
                        }
                    }
                )
                .subscribe(function (status) {
                    if (status === 'SUBSCRIBED') {
                        _available = true;
                        if (typeof onReconnect === 'function') onReconnect();
                    } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
                        _available = false;
                        logger?.warn('supabase:messages', 'channel status:', status);
                    }
                });

        } catch (e) {
            logger?.warn('supabase:messages', 'subscribe error:', e.message);
            _available = false;
        }
    }

    // ── unsubscribe ───────────────────────────────────────────────────────────

    function unsubscribe() {
        if (_channel && _client) {
            try { _client.removeChannel(_channel); } catch (error) { logger?.warn('supabase:messages', 'unsubscribe removeChannel failed:', error?.message || error); }
            _channel = null;
        }
    }

    
    async function sendTyping(sessionId, payload) {
        if (_available === false) return false;
        const msgObj = {
            id: `typing_${Date.now()}_${Math.random().toString(16).slice(2)}`,
            userIndex: payload?.userIndex ?? 0,
            timestamp: new Date().toISOString(),
            metaType: 'typing',
            typing: {
                active: !!payload?.active,
                characterId: payload?.characterId || null,
                name: payload?.name || null
            }
        };
        return send(sessionId, msgObj);
    }

    // ── handleIncomingMessage ────────────────────────────────────────────────
    // Punto de entrada único para mensajes realtime.
    // Deserializa la fila Supabase y despacha 'etheria:realtime-message'.

    // Triple-channel dedup: track recently-dispatched message IDs to avoid
    // processing the same row from subscribe() + subscribeGlobal() + _subscribeToStory()
    const _recentlyDispatched = new Set();
    const _DISPATCH_TTL_MS = 4000;

    function handleIncomingMessage(row) {
        if (!row || !row.content) return;
        try {
            var msg = JSON.parse(row.content);
            if (!msg || !msg.id) return;
            if (!msg.timestamp) msg.timestamp = row.created_at;
            if (msg.metaType === 'typing') return;
            // Dedup: if this message was already dispatched recently, skip
            const _key = String(msg.id);
            if (_recentlyDispatched.has(_key)) return;
            _recentlyDispatched.add(_key);
            setTimeout(function () { _recentlyDispatched.delete(_key); }, _DISPATCH_TTL_MS);

            // Enriquecer charName desde caché de cloudCharacters
            if (!msg.isNarrator && row.character_id) {
                msg.supabaseCharacterId = row.character_id;
                try {
                    var cloudChars = global.appData && global.appData.cloudCharacters;
                    if (cloudChars) {
                        for (var pid in cloudChars) {
                            var chars = cloudChars[pid];
                            if (!Array.isArray(chars)) continue;
                            var found = chars.find(function (c) { return c.id === row.character_id; });
                            if (found && found.name) { msg.charName = found.name; break; }
                        }
                    }
                } catch (error) { logger?.warn('supabase:messages', 'resolve character id failed:', error?.message || error); }
            }

            global.dispatchEvent(new CustomEvent('etheria:realtime-message', {
                detail: { msg: msg, row: row }
            }));
        } catch (e) {
            logger?.warn('supabase:messages', 'handleIncomingMessage:', e.message);
        }
    }

    // ── Canal global messages-realtime ────────────────────────────────────────
    // Escucha TODOS los INSERTs en messages (sin filtro de session_id).
    // Complementa al canal 'room:{sessionId}' que filtra por topic activo.

    var _globalChannel = null;

    function subscribeGlobal(onMessage, onTyping, sessionId) {
        if (!_init()) return;
        // Allow re-subscribe when story or session context changes
        // (stale channel would filter wrong story_id after enterStory)
        const _newActiveId = global.currentStoryId || sessionId || null;
        if (_globalChannel && _globalChannel.__activeId === _newActiveId) return; // same context — no-op
        if (_globalChannel) unsubscribeGlobal(); // remove stale channel before re-subscribing

        // Fix 7: apply filter so this channel only receives messages for the active
        // session or story — prevents receiving all messages across the entire project.
        const _activeStoryId = global.currentStoryId || null;
        const _sessionId = sessionId || null;
        const _globalFilter = _activeStoryId
            ? 'story_id=eq.' + _activeStoryId
            : (_sessionId ? 'session_id=eq.' + _sessionId : null);
        const _filterObj = _globalFilter
            ? { event: 'INSERT', schema: 'public', table: 'messages', filter: _globalFilter }
            : { event: 'INSERT', schema: 'public', table: 'messages' };

        try {
            const _channelId = _activeStoryId || _sessionId || 'all';
            _globalChannel = _client
                .channel('messages-realtime-' + _channelId)
                .on(
                    'postgres_changes',
                    _filterObj,
                    function (payload) {
                        var row = payload.new;
                        if (!row || !row.content) return;
                        // Fix 7: client-side secondary filter for safety
                        if (_activeStoryId && row.story_id && row.story_id !== _activeStoryId) return;
                        if (!_activeStoryId && _sessionId && row.session_id && row.session_id !== _sessionId) return;
                        try {
                            var msg = JSON.parse(row.content);
                            if (!msg || !msg.id) return;
                            if (!msg.timestamp) msg.timestamp = row.created_at;

                            if (msg.metaType === 'typing') {
                                if (typeof onTyping === 'function') onTyping(msg, row);
                                return;
                            }
                            handleIncomingMessage(row);
                            if (typeof onMessage === 'function') onMessage(msg, row);
                        } catch (error) { logger?.warn('supabase:messages', 'global realtime payload parse failed:', error?.message || error); }
                    }
                )
                .subscribe(function (status) {
                    _available = (status === 'SUBSCRIBED');
                    if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
                        _globalChannel = null;
                    }
                });
            if (_globalChannel) _globalChannel.__activeId = _newActiveId;
        } catch (e) {
            logger?.warn('supabase:messages', 'subscribeGlobal error:', e.message);
            _globalChannel = null;
        }
    }

    function unsubscribeGlobal() {
        if (_globalChannel && _client) {
            try { _client.removeChannel(_globalChannel); } catch (error) { logger?.warn('supabase:messages', 'unsubscribeGlobal removeChannel failed:', error?.message || error); }
            _globalChannel = null;
        }
    }

    // ── API pública ───────────────────────────────────────────────────────────

    global.SupabaseMessages = {
        send                  : send,
        load                  : load,
        loadOlderMessages     : loadOlderMessages,
        subscribe             : subscribe,
        subscribeGlobal       : subscribeGlobal,
        unsubscribeGlobal     : unsubscribeGlobal,
        handleIncomingMessage : handleIncomingMessage,
        sendTyping            : sendTyping,
        unsubscribe           : unsubscribe,
        get available() { return _available; }
    };

}(window));
