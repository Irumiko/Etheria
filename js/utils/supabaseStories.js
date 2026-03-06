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
        'Prefer'        : 'return=representation'
    };

    const READ_HEADERS = {
        'apikey'        : SB_KEY,
        'Authorization' : 'Bearer ' + SB_KEY,
        'Accept'        : 'application/json'
    };

    // ── Helpers ───────────────────────────────────────────────────────────────

    function _getClient() {
        return global.supabaseClient || null;
    }

    async function _getUser() {
        // Fix 6: use global auth cache to avoid network round-trip on each operation
        const cached = global._cachedUserId || null;
        if (cached) return { id: cached };
        try {
            const client = _getClient();
            if (!client || typeof client.auth?.getUser !== 'function') return null;
            const { data: { user } } = await client.auth.getUser();
            if (user?.id) global._cachedUserId = user.id;
            return user || null;
        } catch { return null; }
    }

    // ── createStory ───────────────────────────────────────────────────────────
    /**
     * Crea una nueva historia en Supabase.
     * @param  {string} title  Nombre de la historia
     * @returns {object|null}  Fila creada { id, title, created_by, created_at } o null si falla
     */
    async function createStory(title) {
        if (!title || !title.trim()) {
            console.warn('[Stories] createStory: título vacío');
            return null;
        }

        try {
            const user = await _getUser();
            const row = {
                title      : title.trim(),
                created_by : user ? user.id : null
            };

            const res = await fetch(SB_URL + '/rest/v1/stories', {
                method  : 'POST',
                headers : REST_HEADERS,
                body    : JSON.stringify(row),
                signal  : AbortSignal.timeout(6000)
            });

            if (!res.ok) {
                const detail = await res.text().catch(() => String(res.status));
                console.warn('[Stories] createStory failed (' + res.status + '):', detail);
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
            console.warn('[Stories] createStory error:', e.message);
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
                { headers: READ_HEADERS, signal: AbortSignal.timeout(6000) }
            );

            if (!res.ok) {
                console.warn('[Stories] loadStories failed (' + res.status + ')');
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
            console.warn('[Stories] loadStories error:', e.message);
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
                { headers: READ_HEADERS, signal: AbortSignal.timeout(5000) }
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
            console.warn('[Stories] loadStoryParticipants error:', e.message);
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
            console.warn('[Stories] enterStory: storyId requerido');
            return;
        }

        // 1. Establecer historia activa
        global.currentStoryId = storyId;

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
            console.warn('[Stories] enterStory: error cargando mensajes:', e.message);
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
                    if (typeof showSyncToast === 'function') {
                        showSyncToast(newRemote.length + ' mensaje(s) cargado(s) desde la historia', 'OK');
                    }
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
        const loadHeaders = {
            'apikey'        : SB_KEY,
            'Authorization' : 'Bearer ' + SB_KEY,
            'Accept'        : 'application/json'
        };

        const res = await fetch(
            SB_URL + '/rest/v1/messages'
                + '?story_id=eq.' + encodeURIComponent(storyId)
                + '&order=created_at.asc'
                + '&select=*,characters(name)',
            { headers: loadHeaders, signal: AbortSignal.timeout(8000) }
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
            } catch { /* fila inválida */ }
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
        } catch { client = null; }

        if (!client) {
            console.warn('[Stories] _subscribeToStory: cliente supabase-js no disponible');
            return;
        }

        // Limpiar canal anterior de historia
        if (global._storyRealtimeChannel && client) {
            try { client.removeChannel(global._storyRealtimeChannel); } catch { /* ignorar */ }
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
                                } catch { /* caché no disponible */ }
                            }

                            // Despachar como mensaje realtime estándar
                            global.dispatchEvent(new CustomEvent('etheria:story-message', {
                                detail: { msg, row, storyId }
                            }));

                            // También alimentar al handler estándar si el topic activo coincide
                            _injectRealtimeMessage(msg, row);

                        } catch (e) {
                            console.warn('[Stories] realtime payload error:', e.message);
                        }
                    }
                )
                .subscribe(function (status) {
                    if (status === 'SUBSCRIBED') {
                        console.info('[Stories] Suscrito a historia:', storyId);
                    } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
                        console.warn('[Stories] canal realtime estado:', status);
                        global._storyRealtimeChannel = null;
                    }
                });

        } catch (e) {
            console.warn('[Stories] _subscribeToStory error:', e.message);
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
                if (typeof showSyncToast === 'function') {
                    showSyncToast('Nuevo mensaje en la historia', 'OK');
                }
            } else {
                if (typeof showSyncToast === 'function') {
                    showSyncToast('Nuevo mensaje recibido', 'Ver ahora', function () {
                        global.currentMessageIndex = msgs.length - 1;
                        if (typeof syncVnStore === 'function') syncVnStore({ messageIndex: global.currentMessageIndex });
                        if (typeof showCurrentMessage === 'function') showCurrentMessage('forward');
                    });
                }
            }
        } catch (e) {
            console.warn('[Stories] _injectRealtimeMessage error:', e.message);
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

        // XSS fix: build participant elements via DOM to avoid name/avatar injection
        container.innerHTML = '';
        participants.forEach(function (p) {
            const name = p.profile?.name || (p.user_id ? String(p.user_id).slice(0, 8) : '?');
            const avatar = p.profile?.avatar_url || '';
            let el;
            if (avatar) {
                el = document.createElement('img');
                el.src = avatar;
                el.className = 'story-participant-avatar';
                el.title = name;
                el.alt = name;
                el.onerror = function () { this.style.display = 'none'; };
            } else {
                el = document.createElement('span');
                el.className = 'story-participant-chip';
                el.textContent = name;
            }
            container.appendChild(el);
        });
    }

    // ── leaveStory ────────────────────────────────────────────────────────────
    /**
     * Sale de la historia activa y limpia el canal realtime.
     */
    function leaveStory() {
        const client = global.supabaseClient || null;
        if (global._storyRealtimeChannel && client) {
            try { client.removeChannel(global._storyRealtimeChannel); } catch { /* ignorar */ }
            global._storyRealtimeChannel = null;
        }
        global.currentStoryId = null;
        global.currentStoryParticipants = [];

        const badge = document.getElementById('activeStoryBadge');
        if (badge) badge.style.display = 'none';

        document.querySelectorAll('.story-card').forEach(function (card) {
            card.classList.remove('story-card--active');
        });
    }

    // ── API pública ───────────────────────────────────────────────────────────

    global.SupabaseStories = {
        createStory           : createStory,
        loadStories           : loadStories,
        enterStory            : enterStory,
        leaveStory            : leaveStory,
        loadStoryParticipants : loadStoryParticipants
    };

}(window));
