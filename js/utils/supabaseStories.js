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


    function _isAvailable() {
        return !!SB_URL && !!SB_KEY && !!_getClient();
    }

    function _isRecoverableSchemaError(error) {
        const message = String(error?.message || error || '').toLowerCase();
        return message.includes('column')
            || message.includes('schema cache')
            || message.includes('could not find')
            || message.includes('created_by_index')
            || message.includes('local_id')
            || message.includes('updated_at');
    }

    function _storyRowFromTopic(topic, { basic = false } = {}) {
        const row = { title: String(topic.title || '').trim() };
        if (basic) return row;
        return {
            ...row,
            mode:               topic.mode               || 'classic',
            background:         topic.background         || null,
            weather:            topic.weather            || null,
            created_by_index:   typeof topic.createdByIndex === 'number' ? topic.createdByIndex : null,
            character_locks:    topic.characterLocks     || {},
            rpg_char_locks:     topic.rpgCharacterLocks  || {},
            role_character_id:  topic.roleCharacterId    || null,
            local_id:           String(topic.id),
            updated_at:         new Date().toISOString(),
            // ── Campos de gestión de turnos ──────────────────────────────────
            turn_mode:          topic.turnMode           || 'off',
            turn_order:         Array.isArray(topic.turnOrder) ? topic.turnOrder : null,
            turn_last_at:       topic.turnLastAt         || null
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
            if (!Array.isArray(stories)) return [];

            if (typeof appData !== 'undefined') {
                appData.stories = stories;

                // ── Sincronización completa de topics con Supabase ───────────
                // La nube (tabla stories) es la fuente de verdad.
                // 1. Topics en nube pero no locales → añadir.
                // 2. Topics locales que ya existen en nube → actualizar metadatos si la nube es más reciente.
                // 3. Topics locales sin storyId (nunca subidos) → conservar tal cual.
                // 4. Topics locales con storyId que ya NO están en nube → fueron borrados en otro
                //    dispositivo, eliminarlos también aquí.
                if (!Array.isArray(appData.topics)) appData.topics = [];

                const cloudIds = new Set(stories.map(s => String(s.id)));

                // Paso 4: eliminar topics cuyo storyId ya no existe en la nube
                const beforeCount = appData.topics.length;
                appData.topics = appData.topics.filter(t =>
                    !t.storyId || cloudIds.has(String(t.storyId))
                );
                const removedCount = beforeCount - appData.topics.length;
                if (removedCount > 0) {
                    logger?.info('supabase:stories', `Eliminados ${removedCount} topics borrados en otro dispositivo`);
                }

                // Pasos 1 y 2: recorrer stories de la nube
                let addedCount = 0;
                stories.forEach(s => {
                    const local = appData.topics.find(t =>
                        String(t.storyId) === String(s.id) ||
                        String(t.id) === String(s.local_id)
                    );
                    if (local) {
                        // Paso 2: actualizar storyId y metadatos si la nube es más reciente
                        if (!local.storyId) local.storyId = s.id;
                        if (s.updated_at && (!local.updatedAt || s.updated_at > local.updatedAt)) {
                            if (s.mode)            local.mode              = s.mode;
                            if (s.background)      local.background        = s.background;
                            if (s.weather)         local.weather           = s.weather;
                            if (s.character_locks) local.characterLocks    = s.character_locks;
                            if (s.rpg_char_locks)  local.rpgCharacterLocks = s.rpg_char_locks;
                            // Campos de turno: siempre sincronizar desde la nube (la cola la gestiona el servidor)
                            local.turnMode    = s.turn_mode    || 'off';
                            local.turnOrder   = Array.isArray(s.turn_order) ? s.turn_order : null;
                            local.turnLastAt  = s.turn_last_at || null;
                            local.updatedAt   = s.updated_at;
                        }
                    } else {
                        // Paso 1: topic existe en nube pero no localmente → añadir
                        appData.topics.push(_storyToTopic(s));
                        addedCount++;
                    }
                });

                if (addedCount > 0) {
                    logger?.info('supabase:stories', `Añadidos ${addedCount} topics nuevos desde otro dispositivo`);
                }

                if (addedCount > 0 || removedCount > 0) {
                    if (typeof markDirty === 'function') markDirty('topics');
                    if (typeof persistPartitionedData === 'function') persistPartitionedData();
                }
            }

            global.dispatchEvent(new CustomEvent('etheria:stories-loaded', {
                detail: { stories }
            }));

            return stories;

        } catch (e) {
            logger?.warn('supabase:stories', 'loadStories error:', e.message);
            return [];
        }
    }

    // Convierte una fila de la tabla stories en un objeto topic compatible con appData.topics.
    // Usa todos los campos nuevos que se añadieron a la tabla stories.
    function _storyToTopic(story) {
        return {
            id:                 story.local_id || story.id,
            storyId:            story.id,
            title:              story.title,
            mode:               story.mode               || 'classic',
            background:         story.background         || null,
            weather:            story.weather            || null,
            createdByIndex:     story.created_by_index   ?? 0,
            characterLocks:     story.character_locks    || {},
            rpgCharacterLocks:  story.rpg_char_locks     || {},
            roleCharacterId:    story.role_character_id  || null,
            date:               story.created_at
                                    ? new Date(story.created_at).toLocaleDateString()
                                    : new Date().toLocaleDateString(),
            updatedAt:          story.updated_at         || null,
            // ── Campos de gestión de turnos ──────────────────────────────────
            turnMode:           story.turn_mode          || 'off',
            turnOrder:          Array.isArray(story.turn_order) ? story.turn_order : null,
            turnLastAt:         story.turn_last_at       || null
        };
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
                // ── Reacciones en tiempo real ──────────────────────────
                .on(
                    'postgres_changes',
                    {
                        event  : '*',          // INSERT, UPDATE, DELETE
                        schema : 'public',
                        table  : 'message_reactions',
                        filter : 'story_id=eq.' + storyId
                    },
                    function (payload) {
                        try {
                            if (global.currentStoryId !== storyId) return;
                            const row      = payload.new || payload.old;
                            const eventType = payload.eventType; // INSERT | UPDATE | DELETE
                            if (!row?.message_id) return;

                            const msgId     = String(row.message_id);
                            const userIndex = String(row.user_index ?? '');
                            const emoji     = row.emoji || null;
                            const topicId   = global.currentTopicId;

                            if (!topicId) return;
                            if (!global.appData) return;
                            if (!global.appData.reactions) global.appData.reactions = {};
                            if (!global.appData.reactions[topicId]) global.appData.reactions[topicId] = {};
                            if (!global.appData.reactions[topicId][msgId]) global.appData.reactions[topicId][msgId] = {};

                            if (eventType === 'DELETE' || !emoji) {
                                delete global.appData.reactions[topicId][msgId][userIndex];
                                if (Object.keys(global.appData.reactions[topicId][msgId]).length === 0) {
                                    delete global.appData.reactions[topicId][msgId];
                                }
                            } else {
                                global.appData.reactions[topicId][msgId][userIndex] = emoji;
                            }

                            // Refrescar la visualización si el mensaje activo es este
                            if (typeof updateReactionDisplay === 'function') {
                                updateReactionDisplay();
                            }
                        } catch (e) {
                            logger?.warn('supabase:stories', 'reaction realtime error:', e.message);
                        }
                    }
                )
                // ── Cambios de turno en tiempo real ───────────────────────
                .on(
                    'postgres_changes',
                    {
                        event  : 'UPDATE',
                        schema : 'public',
                        table  : 'stories',
                        filter : 'id=eq.' + storyId
                    },
                    function (payload) {
                        try {
                            if (global.currentStoryId !== storyId) return;
                            const row = payload.new;
                            if (!row) return;
                            // Solo procesar si cambiaron campos de turno
                            if (row.turn_order === undefined && row.turn_mode === undefined) return;
                            // Actualizar topic local
                            if (typeof appData !== 'undefined' && Array.isArray(appData.topics)) {
                                const local = appData.topics.find(t => String(t.storyId) === String(storyId));
                                if (local) {
                                    if (row.turn_order !== undefined)  local.turnOrder  = Array.isArray(row.turn_order) ? row.turn_order : null;
                                    if (row.turn_mode  !== undefined)  local.turnMode   = row.turn_mode;
                                    if (row.turn_last_at !== undefined) local.turnLastAt = row.turn_last_at;
                                }
                            }
                            // Re-renderizar HUD para co-autores
                            _renderStoryParticipants(global.currentStoryParticipants || []);
                            global.dispatchEvent(new CustomEvent('etheria:turn-updated', {
                                detail: { storyId, turnOrder: row.turn_order, turnMode: row.turn_mode }
                            }));
                        } catch (e) {
                            logger?.warn('supabase:stories', 'turn realtime update error:', e?.message);
                        }
                    }
                )
                // ── Mensajes nuevos ────────────────────────────────────────
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

            // Pieza B: efectos RPG de un solo personaje (Oracle, HP directo, condiciones)
            if (msg.rpgEffects && typeof applyRpgEffectsFromMessage === 'function') {
                try {
                    applyRpgEffectsFromMessage(msg.rpgEffects, global.currentTopicId);
                } catch (_e) {
                    logger?.warn('supabase:stories', 'rpgEffects apply error:', _e?.message);
                }
            }
            // Pieza C.1: efectos RPG múltiples (descanso corto, etc.)
            if (Array.isArray(msg.rpgEffectsMulti) && typeof applyRpgEffectsFromMessage === 'function') {
                msg.rpgEffectsMulti.forEach(function (eff) {
                    try {
                        applyRpgEffectsFromMessage(eff, global.currentTopicId);
                    } catch (_e) {
                        logger?.warn('supabase:stories', 'rpgEffectsMulti apply error:', _e?.message);
                    }
                });
            }
            // Pieza C.2c: forzar escena/clima del DM para co-autores
            if (msg.isDmSystem) {
                if (msg.sceneChange && typeof applySceneChangeToTopic === 'function') {
                    try {
                        const _t = global.appData?.topics?.find(function (t) {
                            return String(t.id) === String(global.currentTopicId);
                        });
                        if (_t) applySceneChangeToTopic(_t, msg.sceneChange);
                    } catch (_e) {
                        logger?.warn('supabase:stories', 'sceneChange apply error:', _e?.message);
                    }
                }
                if (msg.weatherChange && msg.weatherChange.weather && typeof setWeather === 'function') {
                    try {
                        setWeather(msg.weatherChange.weather);
                    } catch (_e) {
                        logger?.warn('supabase:stories', 'weatherChange apply error:', _e?.message);
                    }
                }
            }

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
        document.querySelectorAll('[data-vn-control-badge="active-story"]').forEach((badge) => {
            badge.textContent = '📖 ' + (story.title || 'Historia');
            badge.style.display = 'inline-flex';
            const slot = badge.closest('[data-vn-control-slot="active-story"]');
            if (slot) slot.style.display = '';
        });
        // Resaltar la historia activa en la lista
        document.querySelectorAll('.story-card').forEach(function (card) {
            card.classList.toggle('story-card--active', card.dataset.storyId === story.id);
        });
    }

    function _renderStoryParticipants(participants) {
        const panel = document.getElementById('vnPresencePanel');
        const container = document.getElementById('storyParticipantsList') || document.getElementById('vnPresenceList');
        if (!container) return;

        // Mostrar el panel solo si hay participantes
        if (panel) panel.style.display = participants?.length ? '' : 'none';

        if (!participants || participants.length === 0) {
            container.innerHTML = '';
            return;
        }

        const isOnline = function (userId) {
            if (!userId) return false;
            return typeof SupabasePresence !== 'undefined'
                && typeof SupabasePresence.isUserOnline === 'function'
                && SupabasePresence.isUserOnline(userId);
        };

        // Para cada participante buscar su personaje bloqueado en el topic activo
        const topic = typeof appData !== 'undefined' && global.currentTopicId
            ? (appData.topics || []).find(t => String(t.id) === String(global.currentTopicId))
            : null;
        const lockMap = topic
            ? { ...(topic.characterLocks || {}), ...(topic.rpgCharacterLocks || {}) }
            : {};

        container.innerHTML = '';
        participants.forEach(function (p) {
            const online = isOnline(p.user_id);

            // Buscar el personaje que este usuario tiene bloqueado en el topic
            const charId = lockMap[p.user_index] || lockMap[String(p.user_index)];
            const char   = charId && typeof appData !== 'undefined'
                ? (appData.characters || []).find(c => String(c.id) === String(charId))
                : null;

            const displayName = char?.name
                || p.profile?.name
                || (p.user_id ? String(p.user_id).slice(0, 8) : '?');
            const avatar = char?.avatar || char?.sprite || p.profile?.avatar_url || '';
            const color  = char?.color || 'rgba(201,168,108,0.6)';

            const isActiveTurn = topic?.turnMode && topic.turnMode !== 'off'
                && Array.isArray(topic.turnOrder) && topic.turnOrder[0] === p.user_id;
            const isRpgMode = document.body.classList.contains('mode-rpg');

            const wrap = document.createElement('span');
            let wrapClass = 'story-participant-wrap';
            if (online)       wrapClass += ' online';
            if (isActiveTurn) wrapClass += ' turn-active';
            wrap.className = wrapClass;
            wrap.title = isActiveTurn
                ? `${displayName} · Turno activo`
                : (online ? `${displayName} · En línea` : `${displayName} · Desconectado`);

            // Avatar del personaje si existe, si no iniciales
            let el;
            if (avatar) {
                el = document.createElement('img');
                el.src = avatar;
                el.className = 'story-participant-avatar';
                el.alt = displayName;
                el.onerror = function () {
                    this.style.display = 'none';
                    const init = document.createElement('span');
                    init.className = 'story-participant-initial';
                    init.textContent = displayName[0]?.toUpperCase() || '?';
                    init.style.borderColor = color;
                    wrap.insertBefore(init, wrap.firstChild);
                };
            } else {
                el = document.createElement('span');
                el.className = 'story-participant-initial';
                el.textContent = displayName[0]?.toUpperCase() || '?';
                el.style.borderColor = color;
            }

            // Nombre del personaje en texto pequeño bajo el avatar
            const nameEl = document.createElement('span');
            nameEl.className = 'story-participant-name';
            nameEl.textContent = displayName;

            // Punto de presencia (verde = online, gris = offline)
            const dot = document.createElement('span');
            dot.className = 'story-participant-dot';
            dot.setAttribute('aria-hidden', 'true');

            wrap.appendChild(el);
            wrap.appendChild(dot);
            wrap.appendChild(nameEl);

            // Icono de turno activo (✦ clásico / ⚜ RPG) — esquina superior izquierda
            if (isActiveTurn) {
                const turnIcon = document.createElement('span');
                turnIcon.className = 'story-participant-turn-icon';
                turnIcon.setAttribute('aria-label', 'Turno activo');
                turnIcon.textContent = isRpgMode ? '⚜' : '✦';
                wrap.appendChild(turnIcon);
            }

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

        document.querySelectorAll('[data-vn-control-badge="active-story"]').forEach((badge) => {
            badge.style.display = 'none';
            const slot = badge.closest('[data-vn-control-slot="active-story"]');
            if (slot) slot.style.display = 'none';
        });

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

    // ── Upsert de un topic local completo en stories ────────────────────────
    // Convierte un objeto topic local a una fila de stories en Supabase.
    // Usa storyId como clave si existe; si no, intenta resolver por local_id.
    async function upsertStory(topic) {
        if (!_isAvailable() || !topic?.title) return { ok: false, error: 'Supabase no disponible o título vacío' };
        const client = _getClient();
        const user = await _getUser();
        if (!user?.id) return { ok: false, error: 'Usuario no autenticado' };

        async function insertStory(row) {
            return client.from('stories')
                .insert({ ...row, created_by: user.id })
                .select('id')
                .single();
        }

        async function updateStory(row) {
            return client.from('stories')
                .update(row)
                .eq('id', topic.storyId)
                .select('id')
                .single();
        }

        try {
            const fullRow = _storyRowFromTopic(topic);
            const basicRow = _storyRowFromTopic(topic, { basic: true });

            if (topic.storyId) {
                let { error } = await updateStory(fullRow);
                if (error && _isRecoverableSchemaError(error)) {
                    logger?.warn('supabase:stories', 'upsertStory update: usando schema básico por:', error.message);
                    ({ error } = await updateStory(basicRow));
                }
                if (error) return { ok: false, error: error.message };
                return { ok: true, storyId: topic.storyId };
            }

            let { data, error } = await insertStory(fullRow);
            if (error && _isRecoverableSchemaError(error)) {
                logger?.warn('supabase:stories', 'upsertStory insert: usando schema básico por:', error.message);
                ({ data, error } = await insertStory(basicRow));
            }
            if (error) return { ok: false, error: error.message };
            return { ok: true, storyId: data?.id };
        } catch (e) {
            logger?.warn('supabase:stories', 'upsertStory error:', e?.message);
            return { ok: false, error: e?.message || 'Error inesperado' };
        }
    }

    // Elimina una historia de Supabase por su storyId (UUID).
    // Devuelve { ok: true } si se borró o no existía, { ok: false, error } si hubo error real.
    async function deleteStory(storyId) {
        if (!storyId) return { ok: false, error: 'storyId requerido' };
        const client = _getClient();
        if (!client) return { ok: false, error: 'Cliente no disponible' };
        try {
            // Primero eliminar mensajes vinculados: si la FK messages.story_id no tiene
            // ON DELETE CASCADE, borrar la historia directamente falla y luego se "resucita".
            const { error: msgError } = await client
                .from('messages')
                .delete()
                .eq('story_id', storyId);
            if (msgError) {
                logger?.warn('supabase:stories', 'deleteStory messages error:', msgError.message);
                return { ok: false, error: msgError.message };
            }

            const { error } = await client
                .from('stories')
                .delete()
                .eq('id', storyId);
            if (error) {
                logger?.warn('supabase:stories', 'deleteStory error:', error.message);
                return { ok: false, error: error.message };
            }
            return { ok: true };
        } catch (e) {
            logger?.warn('supabase:stories', 'deleteStory exception:', e?.message);
            return { ok: false, error: e?.message };
        }
    }

    // Sube todos los topics locales a Supabase que no tengan storyId todavía
    // o que hayan sido modificados. Pensado para ejecutarse al hacer login.
    async function syncAllLocalTopics(topics) {
        if (!_isAvailable() || !Array.isArray(topics)) return;
        const pending = topics.filter(t => !t.storyId || t._dirty);
        if (!pending.length) return;

        for (const topic of pending) {
            const result = await upsertStory(topic).catch(() => ({ ok: false }));
            if (result.ok && result.storyId && !topic.storyId) {
                topic.storyId = result.storyId;
            }
        }
    }

    function _getUserId() {
        return window._cachedUserId || null;
    }

    // ── Sistema de gestión de turnos ──────────────────────────────────────────

    /**
     * Activa o reconfigura el sistema de turnos de una historia.
     * Solo puede llamarla el creador (usa UPDATE directo que la RLS permite).
     *
     * @param {string}   storyId  UUID de la historia
     * @param {object}   opts
     * @param {string}   opts.mode    'off' | 'strict' | 'soft'
     * @param {string[]} opts.order   Array de user_ids en el orden inicial deseado.
     *                                Si se omite, se construye desde los participantes actuales.
     * @returns {{ ok: boolean, error?: string }}
     */
    async function setTurnConfig(storyId, { mode = 'soft', order = null } = {}) {
        if (!storyId) return { ok: false, error: 'storyId requerido' };
        const client = _getClient();
        if (!client) return { ok: false, error: 'Sin conexión' };

        try {
            // Si no se pasa un orden inicial, construirlo desde los participantes reales
            let turnOrder = order;
            if (!turnOrder) {
                const participants = await loadStoryParticipants(storyId);
                turnOrder = participants
                    .map(p => p?.user_id)
                    .filter(Boolean)
                    .filter((uid, i, arr) => arr.indexOf(uid) === i);
            }

            const { error } = await client
                .from('stories')
                .update({
                    turn_mode:    mode,
                    turn_order:   turnOrder.length > 0 ? turnOrder : null,
                    turn_last_at: new Date().toISOString(),
                    updated_at:   new Date().toISOString()
                })
                .eq('id', storyId);

            if (error) return { ok: false, error: error.message };

            // Actualizar topic local para que el guard reaccione inmediatamente
            if (typeof appData !== 'undefined' && Array.isArray(appData.topics)) {
                const local = appData.topics.find(t => String(t.storyId) === String(storyId));
                if (local) {
                    local.turnMode   = mode;
                    local.turnOrder  = turnOrder.length > 0 ? turnOrder : null;
                    local.turnLastAt = new Date().toISOString();
                }
            }

            logger?.info('supabase:stories', `Turnos configurados en ${storyId}: modo=${mode}, cola=${JSON.stringify(turnOrder)}`);
            return { ok: true, mode, order: turnOrder };

        } catch (e) {
            logger?.warn('supabase:stories', 'setTurnConfig error:', e?.message);
            return { ok: false, error: e?.message || 'Error inesperado' };
        }
    }

    /**
     * Rota la cola de turnos: mueve el primer user_id al final.
     * Llama a la RPC rotate_story_turn (SECURITY DEFINER — permite a cualquier participante).
     * Actualiza el topic local inmediatamente para que el guard reaccione sin esperar loadStories.
     *
     * @param {string} storyId  UUID de la historia
     * @returns {{ ok: boolean, order?: string[], error?: string }}
     */
    async function rotateTurn(storyId) {
        if (!storyId) return { ok: false, error: 'storyId requerido' };
        const client = _getClient();
        if (!client) return { ok: false, error: 'Sin conexión' };

        try {
            const now = new Date().toISOString();
            const { data, error } = await client.rpc('rotate_story_turn', {
                p_story_id:     storyId,
                p_turn_last_at: now
            });

            if (error) {
                logger?.warn('supabase:stories', 'rotateTurn RPC error:', error.message);
                return { ok: false, error: error.message };
            }

            // Aplicar nueva cola al topic local
            const newOrder = data?.order ? (Array.isArray(data.order) ? data.order : JSON.parse(data.order)) : null;
            if (typeof appData !== 'undefined' && Array.isArray(appData.topics)) {
                const local = appData.topics.find(t => String(t.storyId) === String(storyId));
                if (local && newOrder) {
                    local.turnOrder  = newOrder;
                    local.turnLastAt = now;
                }
            }

            logger?.info('supabase:stories', `Turno rotado en ${storyId}:`, newOrder);
            // Refrescar HUD local y notificar
            _renderStoryParticipants(global.currentStoryParticipants || []);
            global.dispatchEvent(new CustomEvent('etheria:turn-rotated', {
                detail: { storyId, order: newOrder }
            }));
            return { ok: true, rotated: !!data?.rotated, order: newOrder };

        } catch (e) {
            logger?.warn('supabase:stories', 'rotateTurn error:', e?.message);
            return { ok: false, error: e?.message || 'Error inesperado' };
        }
    }

    /**
     * Salta el turno del usuario activo por inactividad.
     * Llama a skip_story_turn (SECURITY DEFINER — cualquier participante puede invocarla).
     * Umbral recomendado: 24 horas (aplicado en el caller, no aquí).
     *
     * @param {string} storyId
     * @returns {{ ok: boolean, skippedUser?: string, order?: string[], error?: string }}
     */
    async function skipTurn(storyId) {
        if (!storyId) return { ok: false, error: 'storyId requerido' };
        const client = _getClient();
        if (!client) return { ok: false, error: 'Sin conexión' };

        try {
            const now = new Date().toISOString();
            const { data, error } = await client.rpc('skip_story_turn', {
                p_story_id:     storyId,
                p_turn_last_at: now
            });

            if (error) {
                logger?.warn('supabase:stories', 'skipTurn RPC error:', error.message);
                return { ok: false, error: error.message };
            }

            const newOrder = data?.order ? (Array.isArray(data.order) ? data.order : JSON.parse(data.order)) : null;
            if (typeof appData !== 'undefined' && Array.isArray(appData.topics)) {
                const local = appData.topics.find(t => String(t.storyId) === String(storyId));
                if (local && newOrder) {
                    local.turnOrder  = newOrder;
                    local.turnLastAt = now;
                }
            }

            logger?.info('supabase:stories', `Turno saltado en ${storyId}. Usuario omitido: ${data?.skipped_user}`);
            // Refrescar HUD local y notificar
            _renderStoryParticipants(global.currentStoryParticipants || []);
            global.dispatchEvent(new CustomEvent('etheria:turn-skipped', {
                detail: { storyId, skippedUser: data?.skipped_user, order: newOrder }
            }));
            return { ok: true, skipped: !!data?.skipped, skippedUser: data?.skipped_user, order: newOrder };

        } catch (e) {
            logger?.warn('supabase:stories', 'skipTurn error:', e?.message);
            return { ok: false, error: e?.message || 'Error inesperado' };
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
        joinByInviteToken     : joinByInviteToken,
        upsertStory           : upsertStory,
        syncAllLocalTopics    : syncAllLocalTopics,
        deleteStory           : deleteStory,
        // Gestión de turnos
        setTurnConfig         : setTurnConfig,
        rotateTurn            : rotateTurn,
        skipTurn              : skipTurn
    };

}(window));
