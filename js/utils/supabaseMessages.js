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

    const cfg = global.SUPABASE_CONFIG || {
        url: 'https://timtqdrfeuzwwixfnudj.supabase.co',
        key: 'sb_publishable_imGaxAfo_z1NuG6NV8pDtQ_A6Wp3DH3'
    };

    const SB_URL = cfg.url;
    const SB_KEY = cfg.key;

    const REST_HEADERS = {
        'apikey'        : SB_KEY,
        'Authorization' : 'Bearer ' + SB_KEY,
        'Content-Type'  : 'application/json',
        'Prefer'        : 'return=minimal'
    };

    let _client    = null;   // instancia supabase-js (cargada desde CDN)
    let _channel   = null;   // canal realtime activo
    let _available = null;   // null = sin verificar | true | false

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
            console.warn('[Supabase] init error:', e.message);
            _available = false;
            return false;
        }
    }

    // ── send ─────────────────────────────────────────────────────────────────
    // Guarda el mensaje completo de Etheria serializado en `content`.
    // Solo escribe las tres columnas que existen: session_id, author, content.

    async function send(sessionId, msgObj) {
        if (_available === false) return false;

        try {
            const sbClient = global.supabaseClient;
            if (!sbClient || !sbClient.auth || typeof sbClient.auth.getUser !== 'function') {
                _available = false;
                return false;
            }

            const { data: { user } } = await sbClient.auth.getUser();
            if (!user || !user.id) {
                return false;
            }

            const row = {
                session_id : String(sessionId),
                user_id    : user.id,
                author     : String(msgObj.userIndex ?? 0),
                content    : JSON.stringify({
                    id          : msgObj.id,
                    characterId : msgObj.characterId  || null,
                    charName    : msgObj.charName      || null,
                    charColor   : msgObj.charColor     || null,
                    charAvatar  : msgObj.charAvatar    || null,
                    charSprite  : msgObj.charSprite    || null,
                    text        : msgObj.text          || '',
                    isNarrator  : !!msgObj.isNarrator,
                    userIndex   : msgObj.userIndex     ?? 0,
                    timestamp   : msgObj.timestamp     || new Date().toISOString(),
                    weather     : msgObj.weather       || undefined,
                    diceRoll    : msgObj.diceRoll      || undefined,
                    options     : msgObj.options       || undefined
                })
            };

            const res = await fetch(SB_URL + '/rest/v1/messages', {
                method  : 'POST',
                headers : REST_HEADERS,
                body    : JSON.stringify(row),
                signal  : AbortSignal.timeout(5000)
            });

            if (!res.ok) {
                const detail = await res.text().catch(() => String(res.status));
                console.warn('[Supabase] send failed (' + res.status + '):', detail);
                _available = false;
                return false;
            }

            _available = true;
            return true;

        } catch (e) {
            console.warn('[Supabase] send error:', e.message);
            _available = false;
            return false;
        }
    }

    // ── load ──────────────────────────────────────────────────────────────────
    // Devuelve array de objetos mensaje de Etheria, o null si falla.
    // Ordena por created_at (timestamp oficial de la tabla).

    async function load(sessionId) {
        try {
            const res = await fetch(
                SB_URL + '/rest/v1/messages'
                    + '?session_id=eq.' + encodeURIComponent(sessionId)
                    + '&order=created_at.asc',
                { headers: REST_HEADERS, signal: AbortSignal.timeout(6000) }
            );

            if (!res.ok) {
                _available = false;
                return null;
            }

            const rows = await res.json();
            _available = true;

            return rows.reduce(function (acc, row) {
                try {
                    const msg = JSON.parse(row.content);
                    // Usar created_at como timestamp si el mensaje no lo trae
                    if (!msg.timestamp) msg.timestamp = row.created_at;
                    acc.push(msg);
                } catch {
                    // Fila con content inválido — ignorar silenciosamente
                }
                return acc;
            }, []);

        } catch (e) {
            console.warn('[Supabase] load error:', e.message);
            _available = false;
            return null;
        }
    }

    // ── subscribe ─────────────────────────────────────────────────────────────
    // Usa supabase-js channel().on() para escuchar INSERTs filtrados por session_id.
    // onMessage(msgObj) recibe el objeto mensaje de Etheria deserializado.

    function subscribe(sessionId, onMessage) {
        if (!_init()) {
            console.warn('[Supabase] subscribe: cliente no disponible');
            return;
        }

        unsubscribe();

        try {
            _channel = _client
                .channel('room:' + sessionId)
                .on(
                    'postgres_changes',
                    {
                        event  : 'INSERT',
                        schema : 'public',
                        table  : 'messages',
                        filter : 'session_id=eq.' + sessionId
                    },
                    function (payload) {
                        try {
                            var row = payload.new;
                            if (!row || !row.content) return;
                            var msg = JSON.parse(row.content);
                            if (!msg.timestamp) msg.timestamp = row.created_at;
                            if (typeof onMessage === 'function') onMessage(msg);
                        } catch {
                            // payload inesperado — ignorar
                        }
                    }
                )
                .subscribe(function (status) {
                    if (status === 'SUBSCRIBED') {
                        _available = true;
                    } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
                        _available = false;
                        console.warn('[Supabase] channel status:', status);
                    }
                });

        } catch (e) {
            console.warn('[Supabase] subscribe error:', e.message);
            _available = false;
        }
    }

    // ── unsubscribe ───────────────────────────────────────────────────────────

    function unsubscribe() {
        if (_channel && _client) {
            try { _client.removeChannel(_channel); } catch { /* ignorar */ }
            _channel = null;
        }
    }

    // ── API pública ───────────────────────────────────────────────────────────

    global.SupabaseMessages = {
        send        : send,
        load        : load,
        subscribe   : subscribe,
        unsubscribe : unsubscribe,
        get available() { return _available; }
    };

}(window));
