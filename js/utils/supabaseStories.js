// ============================================
// SUPABASE STORIES
// ============================================
// Tabla: stories
//   id          uuid PK default gen_random_uuid()
//   title       text NOT NULL
//   created_by  uuid REFERENCES auth.users(id)
//   created_at  timestamptz default now()
//
// La tabla messages ya tiene (o debe añadirse):
//   story_id    uuid REFERENCES stories(id)  (nullable, retrocompatible)
//
// SQL para Supabase:
//   create table public.stories (
//     id         uuid primary key default gen_random_uuid(),
//     title      text not null,
//     created_by uuid references auth.users(id),
//     created_at timestamptz not null default now()
//   );
//   alter table public.messages add column if not exists story_id uuid references public.stories(id);
//   create index if not exists messages_story_id_idx on public.messages(story_id);
// ============================================

(function (global) {

    const cfg = global.SUPABASE_CONFIG || {};
    const logger = global.EtheriaLogger;

    const SB_URL = cfg.url;
    const SB_KEY = cfg.key;

    // ── Auth helpers ──────────────────────────────────────────────────────────

    function _getClient() {
        return global.supabaseClient || null;
    }

    /**
     * Devuelve el JWT del usuario autenticado, o null si no hay sesión.
     * Las peticiones de escritura DEBEN usar este token (no el anon key)
     * para que Supabase RLS identifique al usuario y permita el INSERT/UPDATE.
     */
    async function _getAccessToken() {
        return global.SupabaseAuthHeaders?.getAccessToken
            ? global.SupabaseAuthHeaders.getAccessToken(_getClient())
            : null;
    }

    async function _getUser() {
        const cached = global._cachedUserId || null;
        if (cached) return { id: cached };
        try {
            const client = _getClient();
            if (!client || typeof client.auth?.getUser !== 'function') return null;
            const { data: { user } } = await client.auth.getUser();
            if (user?.id) global._cachedUserId = user.id;
            return user || null;
        } catch (error) {
            logger?.warn('supabase:stories', 'getUser failed:', error?.message || error);
            return null;
        }
    }

    /**
     * Construye cabeceras con el JWT del usuario para peticiones de escritura.
     * Supabase RLS necesita el access_token del usuario (no el anon key) para
     * evaluar auth.uid() en las políticas INSERT/UPDATE/DELETE.
     */
    async function _writeHeaders() {
        if (global.SupabaseAuthHeaders?.buildAuthHeaders) {
            return global.SupabaseAuthHeaders.buildAuthHeaders({
                apikey: SB_KEY,
                client: _getClient(),
                baseHeaders: { 'Content-Type': 'application/json', 'Prefer': 'return=representation' },
            });
        }
        const token = await _getAccessToken();
        return {
            'apikey'       : SB_KEY,
            'Authorization': 'Bearer ' + (token || SB_KEY),
            'Content-Type' : 'application/json',
            'Prefer'       : 'return=representation'
        };
    }

    /**
     * Cabeceras de lectura.
     * Si hay sesión, enviar JWT para que RLS auth.uid() funcione también en SELECT.
     * Si no hay sesión, caer a anon key (solo tablas/policies públicas).
     */
    async function _readHeaders() {
        if (global.SupabaseAuthHeaders?.buildAuthHeaders) {
            return global.SupabaseAuthHeaders.buildAuthHeaders({
                apikey: SB_KEY,
                client: _getClient(),
                baseHeaders: {},
                acceptJson: true,
            });
        }
        const token = await _getAccessToken();
        return {
            'apikey'       : SB_KEY,
            'Authorization': 'Bearer ' + (token || SB_KEY),
            'Accept'       : 'application/json'
        };
    }

    // ── createStory ───────────────────────────────────────────────────────────
    /**
     * Crea una nueva historia en Supabase.
     * @param  {string} title  Nombre de la historia
     * @returns {object|null}  Fila creada { id, title, created_by, created_at } o null si falla
     */
    async function createStory(title) {
        if (!title || !title.trim()) {
            logger?.warn('supabase:stories', 'createStory: título vacío');
            return null;
        }

        try {
            const user = await _getUser();
            if (!user) {
                logger?.warn('supabase:stories', 'createStory: usuario no autenticado — inicia sesión primero');
                if (typeof showAutosave === 'function') showAutosave('Inicia sesión para crear historias en la nube', 'error');
                return null;
            }

            const row = {
                title      : title.trim(),
                created_by : user.id
            };

            // _writeHeaders() usa el JWT del usuario (no el anon key),
            // necesario para que RLS permita el INSERT en la tabla stories.
            const headers = await _writeHeaders();
            const res = await fetch(SB_URL + '/rest/v1/stories', {
                method  : 'POST',
                headers : headers,
                body    : JSON.stringify(row),
                signal  : AbortSignal.timeout(6000)
            });

            if (!res.ok) {
                const detail = await res.text().catch(() => String(res.status));
                logger?.warn('supabase:stories', 'createStory failed (' + res.status + '):', detail);
                // Mostrar mensaje específico para 401/403 (auth/RLS)
                if (res.status === 401 || res.status === 403) {
                    if (typeof showAutosave === 'function') showAutosave('Sin permisos — ¿has iniciado sesión?', 'error');
                } else if (res.status === 404) {
                    if (typeof showAutosave === 'function') showAutosave('Tabla "stories" no encontrada en Supabase — revisa el schema', 'error');
                }
                return null;
            }

            const data = await res.json();
            const story = Array.isArray(data) ? data[0] : data;

            // Cachear en appData
            if (typeof appData !== 'undefined') {
                if (!Array.isArray(appData.stories)) appData.stories = [];
                appData.stories.unshift(story);
            }

            global.dispatchEvent(new CustomEvent('etheria:story-created', { detail: { story } }));
            return story;

        } catch (e) {
            logger?.warn('supabase:stories', 'createStory error:', e.message);
            return null;
        }
    }

    // ── loadStories ───────────────────────────────────────────────────────────
    /**
     * Carga todas las historias desde Supabase, ordenadas por fecha descendente.
     * Actualiza appData.stories y dispara 'etheria:stories-loaded'.
     * @returns {Array}  Array de historias o [] si falla
     */
    async function loadStories() {
        try {
            const res = await fetch(
                SB_URL + '/rest/v1/stories?order=created_at.desc&select=*',
                { headers: await _readHeaders(), signal: AbortSignal.timeout(6000) }
            );

            if (!res.ok) {
                logger?.warn('supabase:stories', 'loadStories failed (' + res.status + ')');
                return [];
            }

            const stories = await res.json();

            if (typeof appData !== 'undefined') {
                appData.stories = Array.isArray(stories) ? stories : [];
            }

            global.dispatchEvent(new CustomEvent('etheria:stories-loaded', {
                detail: { stories: Array.isArray(stories) ? stories : [] }
            }));

            return Array.isArray(stories) ? stories : [];

        } catch (e) {
            logger?.warn('supabase:stories', 'loadStories error:', e.message);
            return [];
        }
    }

    // ── loadStoryParticipants ─────────────────────────────────────────────────
    /**
     * Carga los participantes de una historia (user_ids únicos en sus mensajes).
     * @param  {string} storyId
     * @returns {Array}  Array de { user_id, profile? }
     */
    async function loadStoryParticipants(storyId) {
        if (!storyId) return [];
        try {
            // Obtener user_ids únicos de los mensajes de esta historia
            const res = await fetch(
                SB_URL + '/rest/v1/messages'
                    + '?story_id=eq.' + encodeURIComponent(storyId)
                    + '&select=user_id'
                    + '&order=created_at.asc',
                { headers: await _readHeaders(), signal: AbortSignal.timeout(5000) }
            );

            if (!res.ok) return [];
            const rows = await res.json();

            // Deduplicar user_ids
            const seen = new Set();
            const uniqueUserIds = rows
                .map(r => r.user_id)
                .filter(uid => uid && !seen.has(uid) && seen.add(uid));

            // Cruzar con cloudProfiles si están disponibles
            const participants = uniqueUserIds.map(uid => {
                const profile = Array.isArray(appData?.cloudProfiles)
                    ? appData.cloudProfiles.find(p => p.owner_user_id === uid || p.id === uid)
                    : null;
                return { user_id: uid, profile: profile || null };
            });

            return participants;

        } catch (e) {
            logger?.warn('supabase:stories', 'loadStoryParticipants error:', e.message);
            return [];
        }
    }

    // ── enterStory ────────────────────────────────────────────────────────────
    /**
     * Entra en una historia:
     *   1. Establece currentStoryId
     *   2. Carga sus mensajes desde Supabase (filtrados por story_id)
     *   3. Carga participantes
     *   4. Suscribe al canal realtime filtrado por story_id
     *   5. Renderiza la vista de historia
     *
     * @param  {string} storyId   UUID de la historia
     */
    async function enterStory(storyId) {
        if (!storyId) {
            logger?.warn('supabase:stories', 'enterStory: storyId requerido');
            return;
        }

        // 1. Establecer historia activa
        global.currentStoryId = storyId;

        if (typeof SupabasePresence !== 'undefined' && typeof SupabasePresence.joinStory === 'function') {
            SupabasePresence.joinStory(storyId).catch(() => {});
        }

        const story = (appData?.stories || []).find(s => s.id === storyId) || { id: storyId, title: '...' };

        // Notificar que se está entrando
        global.dispatchEvent(new CustomEvent('etheria:story-entering', { detail: { storyId, story } }));

        // 2. Cancelar suscripción anterior al entrar a una nueva historia
        if (typeof SupabaseMessages !== 'undefined') {
            SupabaseMessages.unsubscribe();
        }

        // 3. Cargar mensajes de la historia (filtrado por story_id)
        let storyMessages = [];
        try {
            storyMessages = await _loadStoryMessages(storyId);
        } catch (e) {
            logger?.warn('supabase:stories', 'enterStory: error cargando mensajes:', e.message);
        }

        // 4. Fusionar con mensajes locales del topic activo (si existe)
        if (global.currentTopicId && typeof appData !== 'undefined') {
            const localMsgs = Array.isArray(appData.messages[global.currentTopicId])
                ? appData.messages[global.currentTopicId]
                : [];
            const localIds = new Set(localMsgs.map(m => String(m.id)));
            const newRemote = storyMessages.filter(m => m.id && !localIds.has(String(m.id)));

            if (newRemote.length > 0) {
                newRemote.forEach(m => localMsgs.push(m));
                localMsgs.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
                appData.messages[global.currentTopicId] = localMsgs;

                if (typeof hasUnsavedChanges !== 'undefined') global.hasUnsavedChanges = true;
                if (typeof save === 'function') save({ silent: true });

                // Actualizar la vista si el topic activo es este
                if (typeof currentMessageIndex !== 'undefined') {
                    global.currentMessageIndex = localMsgs.length - 1;
                    if (typeof syncVnStore === 'function') syncVnStore({ messageIndex: global.currentMessageIndex });
                    if (typeof showCurrentMessage === 'function') showCurrentMessage('forward');
                    eventBus.emit('ui:show-toast', {
                        text: newRemote.length + ' mensaje(s) cargado(s) desde la historia',
                        action: 'OK'
                    });
                }
            }
        }

        // 5. Cargar participantes en paralelo
        loadStoryParticipants(storyId).then(function (participants) {
            global.currentStoryParticipants = participants;
            global.dispatchEvent(new CustomEvent('etheria:story-participants-loaded', {
                detail: { storyId, participants }
            }));
            _renderStoryParticipants(participants);
        });

        // 6. Suscripción realtime filtrada por story_id
        _subscribeToStory(storyId);

        // 7. Notificar que la historia está activa
        global.dispatchEvent(new CustomEvent('etheria:story-entered', {
            detail: { storyId, story, messageCount: storyMessages.length }
        }));

        // 8. Actualizar UI de la historia activa
        _updateActiveStoryUI(story);
    }

    // ── _loadStoryMessages ────────────────────────────────────────────────────

    async function _loadStoryMessages(storyId) {
        const res = await fetch(
            SB_URL + '/rest/v1/messages'
                + '?story_id=eq.' + encodeURIComponent(storyId)
                + '&order=created_at.asc'
                + '&select=*,characters(name)',
            { headers: await _readHeaders(), signal: AbortSignal.timeout(8000) }
        );

        if (!res.ok) return [];

        const rows = await res.json();

        return rows.reduce(function (acc, row) {
            try {
                const msg = JSON.parse(row.content);
                if (!msg.timestamp) msg.timestamp = row.created_at;
                if (msg.metaType === 'typing') return acc;
                if (!msg.isNarrator && row.characters?.name) {
                    msg.charName = row.characters.name.trim() || msg.charName;
                }
                if (row.character_id) msg.supabaseCharacterId = row.character_id;
                // Tag the message with its story
                msg.storyId = storyId;
                acc.push(msg);
            } catch (error) {
                logger?.warn('supabase:stories', 'invalid message row in _loadStoryMessages:', error?.message || error);
            }
            return acc;
        }, []);
    }

    // ── _subscribeToStory ─────────────────────────────────────────────────────

    function _subscribeToStory(storyId) {
        let client;
        try {
            client = global.supabase?.createClient
                ? (global.supabaseClient || global.supabase.createClient(SB_URL, SB_KEY))
                : null;
        } catch (error) {
            logger?.warn('supabase:stories', '_subscribeToStory client init failed:', error?.message || error);
            client = null;
        }

        if (!client) {
            logger?.warn('supabase:stories', '_subscribeToStory: cliente supabase-js no disponible');
            return;
        }

        // Limpiar canal anterior de historia
        if (global._storyRealtimeChannel && client) {
            try { client.removeChannel(global._storyRealtimeChannel); } catch (error) {
                logger?.warn('supabase:stories', 'remove previous story channel failed:', error?.message || error);
            }
            global._storyRealtimeChannel = null;
        }

        try {
            global._storyRealtimeChannel = client
                .channel('story:' + storyId)
                .on(
                    'postgres_changes',
                    {
                        event  : 'INSERT',
                        schema : 'public',
                        table  : 'messages',
                        filter : 'story_id=eq.' + storyId
                    },
                    function (payload) {
                        try {
                            // Solo procesar mensajes si esta historia sigue activa
                            if (global.currentStoryId !== storyId) return;

                            const row = payload.new;
                            if (!row || !row.content) return;

                            const msg = JSON.parse(row.content);
                            if (!msg || !msg.id) return;
                            if (!msg.timestamp) msg.timestamp = row.created_at;
                            if (msg.metaType === 'typing') return;

                            msg.storyId = storyId;

                            // Enriquecer charName desde caché
                            if (!msg.isNarrator && row.character_id) {
                                msg.supabaseCharacterId = row.character_id;
                                try {
                                    const cloudChars = global.appData?.cloudCharacters;
                                    if (cloudChars) {
                                        for (const pid in cloudChars) {
                                            const chars = cloudChars[pid];
                                            if (!Array.isArray(chars)) continue;
                                            const found = chars.find(c => c.id === row.character_id);
                                            if (found?.name) { msg.charName = found.name; break; }
                                        }
                                    }
                                } catch (error) {
                                    logger?.debug('supabase:stories', 'cloud character cache lookup failed:', error?.message || error);
                                }
                            }

                            // Despachar como mensaje realtime estándar
                            global.dispatchEvent(new CustomEvent('etheria:story-message', {
                                detail: { msg, row, storyId }
                            }));

                            // También alimentar al handler estándar si el topic activo coincide
                            _injectRealtimeMessage(msg, row);

                        } catch (e) {
                            logger?.warn('supabase:stories', 'realtime payload error:', e.message);
                        }
                    }
                )
                .subscribe(function (status) {
                    if (status === 'SUBSCRIBED') {
                        logger?.info('supabase:stories', 'Suscrito a historia:', storyId);
                    } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
                        logger?.warn('supabase:stories', 'canal realtime estado:', status);
                        global._storyRealtimeChannel = null;
                    }
                });

        } catch (e) {
            logger?.warn('supabase:stories', '_subscribeToStory error:', e.message);
        }
    }

    // ── _injectRealtimeMessage ────────────────────────────────────────────────
    // Inyecta el mensaje en el flujo de la historia activa (mismo handler que SupabaseMessages.subscribe)

    function _injectRealtimeMessage(msg, row) {
        if (!global.currentTopicId || !msg || !msg.id) return;

        try {
            const msgs = typeof getTopicMessages === 'function'
                ? getTopicMessages(global.currentTopicId)
                : (global.appData?.messages?.[global.currentTopicId] || []);

            const exists = msgs.some(m => String(m.id) === String(msg.id));
            if (exists) return;

            // Fix 4: prefer server user_id for own-message check
            const _ownId = global._cachedUserId || null;
            if (_ownId && msg._supabaseUserId && msg._supabaseUserId === _ownId) return;
            if (!_ownId && String(msg.userIndex) === String(global.currentUserIndex)) return;

            msgs.push(msg);
            msgs.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
            if (global.appData) global.appData.messages[global.currentTopicId] = msgs;
            if (typeof save === 'function') save({ silent: true });

            const isAtEnd = global.currentMessageIndex >= msgs.length - 2;
            if (isAtEnd) {
                global.currentMessageIndex = msgs.length - 1;
                if (typeof syncVnStore === 'function') syncVnStore({ messageIndex: global.currentMessageIndex });
                if (typeof showCurrentMessage === 'function') showCurrentMessage('forward');
                eventBus.emit('ui:show-toast', {
                    text: 'Nuevo mensaje en la historia',
                    action: 'OK'
                });
            } else {
                eventBus.emit('ui:show-toast', {
                    text: 'Nuevo mensaje recibido',
                    action: 'Ver ahora',
                    onAction: function () {
                        global.currentMessageIndex = msgs.length - 1;
                        if (typeof syncVnStore === 'function') syncVnStore({ messageIndex: global.currentMessageIndex });
                        if (typeof showCurrentMessage === 'function') showCurrentMessage('forward');
                    }
                });
            }
        } catch (e) {
            logger?.warn('supabase:stories', '_injectRealtimeMessage error:', e.message);
        }
    }

    // ── UI helpers ────────────────────────────────────────────────────────────

    function _updateActiveStoryUI(story) {
        // Actualizar badge de historia activa en la barra VN
        const badge = document.getElementById('activeStoryBadge');
        if (badge) {
            badge.textContent = '📖 ' + (story.title || 'Historia');
            badge.style.display = 'inline-flex';
        }
        // Resaltar la historia activa en la lista
        document.querySelectorAll('.story-card').forEach(function (card) {
            card.classList.toggle('story-card--active', card.dataset.storyId === story.id);
        });
    }

    function _renderStoryParticipants(participants) {
        const container = document.getElementById('storyParticipantsList');
        if (!container) return;

        if (!participants || participants.length === 0) {
            container.innerHTML = '<span class="story-participants-empty">Sin participantes aún</span>';
            return;
        }

        const isOnline = function (userId) {
            if (!userId) return false;
            return typeof SupabasePresence !== 'undefined'
                && typeof SupabasePresence.isUserOnline === 'function'
                && SupabasePresence.isUserOnline(userId);
        };

        // XSS fix: build participant elements via DOM to avoid name/avatar injection
        container.innerHTML = '';
        participants.forEach(function (p) {
            const name = p.profile?.name || (p.user_id ? String(p.user_id).slice(0, 8) : '?');
            const avatar = p.profile?.avatar_url || '';

            const wrap = document.createElement('span');
            wrap.className = 'story-participant-wrap' + (isOnline(p.user_id) ? ' online' : '');
            wrap.title = isOnline(p.user_id) ? `${name} · En línea` : `${name} · Desconectado`;

            let el;
            if (avatar) {
                el = document.createElement('img');
                el.src = avatar;
                el.className = 'story-participant-avatar';
                el.alt = name;
                el.onerror = function () { this.style.display = 'none'; };
            } else {
                el = document.createElement('span');
                el.className = 'story-participant-chip';
                el.textContent = name;
            }

            const dot = document.createElement('span');
            dot.className = 'story-participant-dot';
            dot.setAttribute('aria-hidden', 'true');

            wrap.appendChild(el);
            wrap.appendChild(dot);
            container.appendChild(wrap);
        });
    }

    // ── leaveStory ────────────────────────────────────────────────────────────
    /**
     * Sale de la historia activa y limpia el canal realtime.
     */
    function leaveStory() {
        const client = global.supabaseClient || null;
        if (global._storyRealtimeChannel && client) {
            try { client.removeChannel(global._storyRealtimeChannel); } catch (error) {
                logger?.warn('supabase:stories', 'leaveStory removeChannel failed:', error?.message || error);
            }
            global._storyRealtimeChannel = null;
        }
        if (typeof SupabasePresence !== 'undefined' && typeof SupabasePresence.leaveStory === 'function') {
            SupabasePresence.leaveStory().catch(() => {});
        }
        global.currentStoryId = null;
        global.currentStoryParticipants = [];

        const badge = document.getElementById('activeStoryBadge');
        if (badge) badge.style.display = 'none';

        document.querySelectorAll('.story-card').forEach(function (card) {
            card.classList.remove('story-card--active');
        });
    }


    // Re-render de participantes cuando cambia la presencia realtime
    global.addEventListener('etheria:story-presence-changed', function (e) {
        const sid = e?.detail?.storyId;
        if (!sid || String(sid) !== String(global.currentStoryId)) return;
        _renderStoryParticipants(global.currentStoryParticipants || []);
    });


    // ── Invitaciones por enlace ───────────────────────────────────────────────

    /**
     * Genera o recupera el token de invitación de una historia.
     * Guarda el token en Supabase y devuelve la URL completa para compartir.
     * @param {string} storyId  UUID de la historia
     * @returns {string|null}   URL de invitación o null si falla
     */
    async function generateInviteLink(storyId) {
        if (!storyId) return null;
        const c = _getClient();
        if (!c) return null;

        try {
            // Primero comprobar si ya tiene token
            const { data: existing } = await c
                .from('stories')
                .select('invite_token')
                .eq('id', storyId)
                .single();

            let token = existing?.invite_token;

            if (!token) {
                // Generar token nuevo via la función SQL
                const { data: tokenData } = await c
                    .rpc('generate_invite_token');
                token = tokenData;

                // Guardar en la historia
                await c
                    .from('stories')
                    .update({ invite_token: token })
                    .eq('id', storyId);
            }

            if (!token) return null;

            const base = global.location.origin + global.location.pathname;
            return `${base}?invite=${token}`;

        } catch (e) {
            logger?.warn('supabase:stories', 'generateInviteLink error:', e?.message);
            return null;
        }
    }

    /**
     * Busca una historia por su token de invitación y la importa al perfil local.
     * Descarga los mensajes de Supabase y crea el topic en appData.
     * @param {string} token  Token de invitación (8 chars hex)
     * @returns {{ ok: boolean, topicId?: string, title?: string, error?: string }}
     */
    async function joinByInviteToken(token) {
        if (!token || token.length < 6) return { ok: false, error: 'Token inválido.' };

        const c = _getClient();
        if (!c) return { ok: false, error: 'Sin conexión a Supabase.' };

        try {
            // Buscar la historia por token
            const { data: story, error: storyErr } = await c
                .from('stories')
                .select('id, title, created_by, created_at, invite_token')
                .eq('invite_token', token)
                .single();

            if (storyErr || !story) {
                return { ok: false, error: 'Enlace de invitación no encontrado o expirado.' };
            }

            const storyId = story.id;

            // Comprobar si el topic ya existe localmente
            if (typeof appData !== 'undefined' && Array.isArray(appData.topics)) {
                const existing = appData.topics.find(t => t.storyId === storyId);
                if (existing) {
                    return { ok: true, topicId: existing.id, title: story.title, alreadyJoined: true };
                }
            }

            // Descargar mensajes de la historia
            const messages = await _loadStoryMessages(storyId);

            // Crear el topic local vinculado a esta historia
            const topicId = storyId; // usar el storyId como topicId para mantener coherencia
            const topic = {
                id:             topicId,
                title:          story.title,
                storyId:        storyId,
                background:     typeof DEFAULT_TOPIC_BACKGROUND !== 'undefined' ? DEFAULT_TOPIC_BACKGROUND : '',
                mode:           'roleplay',
                roleCharacterId: null,
                createdBy:      story.created_by || 'Desconocido',
                createdByIndex: -1,  // -1 = otro usuario
                date:           new Date(story.created_at).toLocaleDateString('es-ES'),
                _fromInvite:    true
            };

            if (typeof appData !== 'undefined') {
                if (!Array.isArray(appData.topics)) appData.topics = [];
                appData.topics.unshift(topic);
                appData.messages = appData.messages || {};
                appData.messages[topicId] = messages;
            }

            if (typeof hasUnsavedChanges !== 'undefined') hasUnsavedChanges = true;
            if (typeof save === 'function') save({ silent: true });
            if (typeof SupabaseSync !== 'undefined') {
                SupabaseSync.uploadProfileData().catch(() => {});
            }
            if (typeof renderTopics === 'function') renderTopics();

            global.currentStoryId = storyId;

            global.dispatchEvent(new CustomEvent('etheria:story-joined', {
                detail: { storyId, topicId, title: story.title, messageCount: messages.length }
            }));

            return { ok: true, topicId, title: story.title, messageCount: messages.length };

        } catch (e) {
            logger?.warn('supabase:stories', 'joinByInviteToken error:', e?.message);
            return { ok: false, error: e?.message || 'Error inesperado al unirse a la historia.' };
        }
    }

    // ── API pública ───────────────────────────────────────────────────────────

    global.SupabaseStories = {
        createStory           : createStory,
        loadStories           : loadStories,
        enterStory            : enterStory,
        leaveStory            : leaveStory,
        loadStoryParticipants : loadStoryParticipants,
        generateInviteLink    : generateInviteLink,
        joinByInviteToken     : joinByInviteToken
    };

}(window));
