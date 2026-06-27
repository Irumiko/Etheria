// ============================================
// SUPABASE SYNC — Sincronización completa de datos
// ============================================
// Sincronización completa vía Supabase.
// Sincroniza: perfiles, topics, characters, mensajes, afinidades, favoritos.
//
// Tablas requeridas en Supabase:
//   - user_data: id (uuid), user_id (uuid), data (jsonb), updated_at (timestamp)
//   - messages: (ya existente)
//
// RLS: SELECT/INSERT/UPDATE solo para el propio user_id
// ============================================

const SupabaseSync = (function () {

    // ── Configuración ────────────────────────────────────────────────────────
    const CFG = {
        SYNC_INTERVAL: 30000,      // 30 segundos entre sincronizaciones
        OFFLINE_INTERVAL: 60000,   // 1 minuto en modo offline
        CONFLICT_THRESHOLD: 5000,  // 5 segundos de diferencia para considerar conflicto
    };

    // ── Estado interno ───────────────────────────────────────────────────────
    let _syncInProgress = false;
    let _lastSyncTime = 0;
    let _syncInterval = null;
    let _isOffline = false;
    let _pendingChanges = false;
    let _cachedUserId = null;
    let _quickSyncTimer = null; // timer para subir ~2 s después de un touchField

    // ── Merge con timestamps por campo ───────────────────────────────────────
    // Cada campo sincronizable tiene su propio timestamp local. Al descargar
    // datos del servidor, se aplica solo el campo cuyo timestamp remoto es más
    // reciente que el local (Last Write Wins por campo, no por blob completo).
    // Así, cambiar el nombre en el móvil offline y el tema en el PC no se pisarán.
    const _FIELD_TS_KEY = 'etheria_field_timestamps';

    function _loadFieldTimestamps() {
        try { return JSON.parse(localStorage.getItem(_FIELD_TS_KEY) || '{}'); }
        catch { return {}; }
    }
    function _saveFieldTimestamps(ts) {
        try { localStorage.setItem(_FIELD_TS_KEY, JSON.stringify(ts)); }
        catch {}
    }

    /**
     * Marca que un campo concreto fue modificado localmente ahora mismo.
     * Llamar desde el código que muta cada campo antes de guardar en localStorage.
     * @param {string} fieldName — 'userNames' | 'profileMeta' | 'settings' | 'rpgStateSnapshot'
     */
    function touchField(fieldName) {
        if (!fieldName) return;
        const ts = _loadFieldTimestamps();
        ts[fieldName] = new Date().toISOString();
        _saveFieldTimestamps(ts);
        _pendingChanges = true;
        // Subir automáticamente ~2 s después sin esperar el intervalo de 30 s.
        // Si se llama varias veces seguidas (p.ej. nombre + avatar), el timer
        // se resetea y solo se hace una sola subida.
        clearTimeout(_quickSyncTimer);
        _quickSyncTimer = setTimeout(function () {
            if (_pendingChanges && _isAvailable() && _getUserId()) {
                uploadProfileData().catch(function () {});
            }
        }, 2000);
    }

    // ── Helpers ──────────────────────────────────────────────────────────────

    function _client() {
        return window.supabaseClient || null;
    }

    function _isAvailable() {
        return !!_client();
    }

    function _getUserId() {
        return _cachedUserId || window._cachedUserId || null;
    }

    // Escuchar cambios de autenticación
    window.addEventListener('etheria:auth-changed', (e) => {
        _cachedUserId = e.detail?.user?.id || null;
    });

    // ── Serialización de datos ───────────────────────────────────────────────

    /**
     * Obtiene todos los datos del perfil actual para sincronizar
     */
    function _getProfileDataForSync() {
        const profileIndex = typeof currentUserIndex !== 'undefined' ? currentUserIndex : 0;

        // affinities, favorites y journals ya viven en sus propias tablas de Supabase.
        // Se excluyen del blob para no duplicar datos ni crecer innecesariamente.

        // Incluir inventario y estado RPG (flags, nivel, HP) del motor de escenas.
        const rpgStateSnapshot = (() => {
            try {
                if (typeof RPGState !== 'undefined' && typeof RPGState.getSnapshot === 'function') {
                    return RPGState.getSnapshot();
                }
                const raw = localStorage.getItem(`etheria_rpg_state_${profileIndex}`);
                return raw ? JSON.parse(raw) : null;
            } catch { return null; }
        })();

        const profileMeta = {
            genders: (() => {
                try { return JSON.parse(localStorage.getItem('etheria_user_genders') || '[]'); } catch { return []; }
            })(),
            birthdays: (() => {
                try { return JSON.parse(localStorage.getItem('etheria_user_birthdays') || '[]'); } catch { return []; }
            })(),
            avatars: (() => {
                try { return JSON.parse(localStorage.getItem('etheria_user_avatars') || '[]'); } catch { return []; }
            })()
        };

        return {
            profileIndex,
            userNames:        typeof userNames !== 'undefined' ? userNames : ['Jugador 1', 'Jugador 2', 'Jugador 3'],
            rpgStateSnapshot,
            profileMeta,
            lastMessageIndex: typeof currentMessageIndex !== 'undefined' ? currentMessageIndex : 0,
            settings: {
                textSpeed: typeof textSpeed !== 'undefined' ? textSpeed : 25,
                theme:     document.documentElement.getAttribute('data-theme') || 'light',
                fontSize:  localStorage.getItem('etheria_font_size') || '19'
            },
            // Timestamps por campo — usados por _applySyncedData() para merge LWW
            _fieldTimestamps: _loadFieldTimestamps()
        };
    }

    /**
     * Aplica datos sincronizados al estado local usando merge Last-Write-Wins por campo.
     *
     * Lógica de decisión para cada campo:
     *   - Sin timestamps en ningún lado  → aplicar (primera sincronización)
     *   - Solo timestamp local           → conservar local (el servidor no conocía este dato)
     *   - Solo timestamp remoto          → aplicar remoto (el dispositivo no tiene historial)
     *   - Ambos timestamps               → gana el más reciente (LWW)
     */
    function _applySyncedData(syncedData) {
        if (!syncedData || typeof syncedData !== 'object') return false;

        const localTs  = _loadFieldTimestamps();
        const remoteTs = syncedData._fieldTimestamps || {};

        /**
         * Devuelve true si el campo remoto debe aplicarse localmente.
         * @param {string} fieldName
         */
        function _shouldApply(fieldName) {
            const localMs  = localTs[fieldName]  ? new Date(localTs[fieldName]).getTime()  : 0;
            const remoteMs = remoteTs[fieldName] ? new Date(remoteTs[fieldName]).getTime() : 0;
            if (localMs === 0 && remoteMs === 0) return true;  // primera sync → aplicar
            if (localMs  >  0 && remoteMs === 0) return false; // sólo dato local → conservar
            return remoteMs >= localMs;                         // LWW: remoto gana si ≥ local
        }

        // ── userNames ────────────────────────────────────────────────────────
        // topics/characters/messages/affinities/favorites/journals NO están en el
        // blob — se cargan desde sus tablas propias de Supabase.
        if (Array.isArray(syncedData.userNames) && syncedData.userNames.length > 0) {
            if (_shouldApply('userNames')) {
                if (typeof userNames !== 'undefined') {
                    userNames.splice(0, userNames.length, ...syncedData.userNames);
                }
                try {
                    localStorage.setItem('etheria_user_names', JSON.stringify(syncedData.userNames));
                } catch (error) { window.EtheriaLogger?.warn('app', 'operation failed:', error?.message || error); }
            } else {
                window.EtheriaLogger?.info('[sync:merge]', 'userNames: local más reciente → conservado');
            }
        }

        // ── profileMeta ──────────────────────────────────────────────────────
        if (syncedData.profileMeta && typeof syncedData.profileMeta === 'object') {
            if (_shouldApply('profileMeta')) {
                try {
                    localStorage.setItem('etheria_user_genders',   JSON.stringify(Array.isArray(syncedData.profileMeta.genders)   ? syncedData.profileMeta.genders   : []));
                    localStorage.setItem('etheria_user_birthdays', JSON.stringify(Array.isArray(syncedData.profileMeta.birthdays) ? syncedData.profileMeta.birthdays : []));
                    localStorage.setItem('etheria_user_avatars',   JSON.stringify(Array.isArray(syncedData.profileMeta.avatars)   ? syncedData.profileMeta.avatars   : []));
                } catch (error) { window.EtheriaLogger?.warn('app', 'operation failed:', error?.message || error); }
            } else {
                window.EtheriaLogger?.info('[sync:merge]', 'profileMeta: local más reciente → conservado');
            }
        }

        // Persistir datos fusionados (sólo campos que fueron aplicados)
        if (typeof persistPartitionedData === 'function') {
            persistPartitionedData(true);
        }

        // ── rpgStateSnapshot ─────────────────────────────────────────────────
        if (syncedData.rpgStateSnapshot && typeof syncedData.rpgStateSnapshot === 'object') {
            if (_shouldApply('rpgStateSnapshot')) {
                try {
                    const profileIndex = typeof currentUserIndex !== 'undefined' ? currentUserIndex : 0;
                    localStorage.setItem(
                        `etheria_rpg_state_${profileIndex}`,
                        JSON.stringify(syncedData.rpgStateSnapshot)
                    );
                    if (typeof RPGState !== 'undefined' && typeof RPGState.loadSnapshot === 'function') {
                        RPGState.loadSnapshot(syncedData.rpgStateSnapshot);
                    }
                } catch (e) {
                    window.EtheriaLogger?.warn('supabaseSync', 'No se pudo restaurar rpgStateSnapshot:', e?.message);
                }
            } else {
                window.EtheriaLogger?.info('[sync:merge]', 'rpgStateSnapshot: local más reciente → conservado');
            }
        }

        // ── settings ─────────────────────────────────────────────────────────
        if (syncedData.settings && typeof syncedData.settings === 'object') {
            if (_shouldApply('settings')) {
                try {
                    const s = syncedData.settings;
                    if (s.theme) {
                        document.documentElement.setAttribute('data-theme', s.theme);
                        localStorage.setItem('etheria_theme', s.theme);
                    }
                    if (s.fontSize) {
                        localStorage.setItem('etheria_font_size', String(s.fontSize));
                        document.documentElement.style.setProperty('--font-size-base', s.fontSize + 'px');
                    }
                    if (s.textSpeed != null && typeof textSpeed !== 'undefined') {
                        textSpeed = Number(s.textSpeed);
                        localStorage.setItem('etheria_text_speed', String(s.textSpeed));
                    }
                } catch (e) {
                    window.EtheriaLogger?.warn('supabaseSync', 'No se pudo restaurar settings:', e?.message);
                }
            } else {
                window.EtheriaLogger?.info('[sync:merge]', 'settings: local más reciente → conservado');
            }
        }

        // ── Actualizar timestamps locales con el máximo de cada campo ────────
        // Después del merge, el registro local conoce el timestamp más alto visto,
        // ya sea del servidor o del propio dispositivo.
        const mergedTs = { ...localTs };
        for (const [field, remoteTime] of Object.entries(remoteTs)) {
            if (!remoteTime) continue;
            const localTime = localTs[field];
            if (!localTime || new Date(remoteTime) > new Date(localTime)) {
                mergedTs[field] = remoteTime;
            }
        }
        _saveFieldTimestamps(mergedTs);

        return true;
    }

    // ── API de Supabase ──────────────────────────────────────────────────────

    /**
     * Sube los datos del perfil a Supabase
     */
    // Debounce: evitar múltiples subidas en ráfaga (ej. guardar personaje + guardar topic al mismo tiempo).
    // Todos los callers que coincidan en la ventana de 400ms reciben el mismo resultado
    // (los resolvers se acumulan y se notifican todos cuando la subida termina).
    let _uploadDebounceTimer   = null;
    let _uploadPendingResolvers = [];
    function uploadProfileData() {
        return new Promise((resolve) => {
            _uploadPendingResolvers.push(resolve);
            clearTimeout(_uploadDebounceTimer);
            _uploadDebounceTimer = setTimeout(async () => {
                const result    = await _doUploadProfileData();
                const resolvers = _uploadPendingResolvers.splice(0);
                for (const r of resolvers) r(result);
            }, 400);
        });
    }

    async function _doUploadProfileData() {
        if (!_isAvailable()) return { ok: false, error: 'Supabase no disponible' };
        
        const userId = _getUserId();
        if (!userId) return { ok: false, error: 'Usuario no autenticado' };

        try {
            const data = _getProfileDataForSync();
            const now = new Date().toISOString();

            // Upsert directo para cubrir creación de cuenta nueva y actualizaciones.
            // UPDATE+INSERT puede fallar silenciosamente cuando UPDATE afecta 0 filas.
            const { error: upsertError } = await _client()
                .from('user_data')
                .upsert({
                    user_id: userId,
                    data,
                    updated_at: now
                }, { onConflict: 'user_id' });

            if (upsertError) {
                window.EtheriaLogger?.warn('[SupabaseSync]', 'upload error:', upsertError);
                return { ok: false, error: upsertError.message };
            }

            _lastSyncTime = Date.now();
            _pendingChanges = false;
            
            // Actualizar UI
            eventBus.emit('sync:status-changed', { status: 'online',  message: 'Sincronizado', target: 'indicator' });
            eventBus.emit('sync:status-changed', { status: 'synced',  message: 'Sincronizar',  target: 'button' });

            return { ok: true };
        } catch (err) {
            window.EtheriaLogger?.warn('[SupabaseSync]', 'upload exception:', err);
            return { ok: false, error: err.message };
        }
    }

    /**
     * Descarga los datos del perfil desde Supabase
     */
    async function downloadProfileData() {
        if (!_isAvailable()) return { ok: false, error: 'Supabase no disponible' };
        
        const userId = _getUserId();
        if (!userId) return { ok: false, error: 'Usuario no autenticado' };

        try {
            const { data, error } = await _client()
                .from('user_data')
                .select('*')
                .eq('user_id', userId)
                .single();

            if (error) {
                if (error.code === 'PGRST116') {
                    // No hay datos aún (no es error)
                    return { ok: true, data: null, isNew: true };
                }
                window.EtheriaLogger?.warn('[SupabaseSync]', 'download error:', error);
                return { ok: false, error: error.message };
            }

            if (data?.data) {
                _applySyncedData(data.data);
                _lastSyncTime = Date.now();
                
                // Actualizar UI
                eventBus.emit('sync:status-changed', { status: 'online', message: 'Sincronizado', target: 'indicator' });
                eventBus.emit('sync:status-changed', { status: 'synced', message: 'Sincronizar',  target: 'button' });

                return { ok: true, data: data.data };
            }

            return { ok: true, data: null };
        } catch (err) {
            window.EtheriaLogger?.warn('[SupabaseSync]', 'download exception:', err);
            return { ok: false, error: err.message };
        }
    }

    /**
     * Sincronización bidireccional completa
     */
    async function sync(options = {}) {
        const { silent = false, force = false } = options;

        if (_syncInProgress && !force) return { status: 'busy' };
        
        const userId = _getUserId();
        if (!userId) {
            if (!silent) {
                eventBus.emit('ui:show-autosave', { text: 'Inicia sesión para sincronizar', state: 'info' });
            }
            return { status: 'no-auth' };
        }

        _syncInProgress = true;
        
        if (!silent) {
            eventBus.emit('sync:status-changed', { status: 'syncing', message: 'Sincronizando...', target: 'button' });
        }

        try {
            // Fix 2: si hay cambios locales pendientes, SUBIR PRIMERO.
            // El orden anterior (descargar → subir) sobreescribía los datos locales
            // antes de subirlos, causando pérdida silenciosa de cambios offline.
            let didUpload = false;
            if (_pendingChanges || force) {
                const uploadResult = await uploadProfileData();
                if (!uploadResult.ok) {
                    _isOffline = true;
                    if (!silent) {
                        eventBus.emit('ui:show-autosave', { text: 'Error al guardar cambios locales', state: 'error' });
                    }
                    return { status: 'error', error: uploadResult.error };
                }
                didUpload = true;
            }

            // 2. Descargar datos del servidor (seguro: cambios locales ya subidos)
            const downloadResult = await downloadProfileData();

            if (!downloadResult.ok) {
                _isOffline = true;
                if (!silent) {
                    eventBus.emit('ui:show-autosave', { text: 'Error de sincronización', state: 'error' });
                }
                return { status: 'error', error: downloadResult.error };
            }

            // 3. Si es usuario nuevo (sin datos en la nube), subir datos locales
            if (downloadResult.isNew && _hasLocalData()) {
                const uploadResult = await uploadProfileData();
                if (!silent && uploadResult.ok) {
                    eventBus.emit('ui:show-autosave', { text: 'Datos subidos a la nube', state: 'saved' });
                }
                return { status: uploadResult.ok ? 'uploaded' : 'error' };
            }

            _isOffline = false;
            if (!silent && didUpload) {
                eventBus.emit('ui:show-autosave', { text: 'Sincronización completada', state: 'saved' });
            }
            return { status: 'synced' };

        } catch (err) {
            window.EtheriaLogger?.warn('[SupabaseSync]', 'sync error:', err);
            _isOffline = true;
            return { status: 'error', error: err.message };
        } finally {
            _syncInProgress = false;
        }
    }

    /**
     * Verifica si hay datos locales para sincronizar
     */
    function _hasLocalData() {
        return (appData?.topics?.length > 0) || 
               (appData?.characters?.length > 0);
    }

    // ── Auto-sync ────────────────────────────────────────────────────────────

    function startAutoSync() {
        if (_syncInterval) clearInterval(_syncInterval);

        const intervalMs = _isOffline ? CFG.OFFLINE_INTERVAL : CFG.SYNC_INTERVAL;

        _syncInterval = setInterval(async () => {
            const userId = _getUserId();
            if (!userId) return; // No sincronizar si no hay usuario

            // Reajustar intervalo si el estado offline cambió desde la última vez
            const expectedMs = _isOffline ? CFG.OFFLINE_INTERVAL : CFG.SYNC_INTERVAL;
            if (expectedMs !== intervalMs) {
                startAutoSync(); // reiniciar con el intervalo correcto
                return;
            }

            if (_pendingChanges || hasUnsavedChanges) {
                await sync({ silent: true });
            }
        }, intervalMs);
    }

    function stopAutoSync() {
        if (_syncInterval) {
            clearInterval(_syncInterval);
            _syncInterval = null;
        }
    }

    // ── Event listeners ──────────────────────────────────────────────────────

    // ── Canal Realtime para detectar cambios desde otros dispositivos ────────
    let _realtimeChannel = null;

    async function _subscribeRealtimeChanges() {
        const userId = _getUserId();
        const c = _client();
        if (!userId || !c?.channel) return;

        // Evitar duplicados
        if (_realtimeChannel) {
            try { c.removeChannel(_realtimeChannel); } catch {}
            _realtimeChannel = null;
        }

        _realtimeChannel = c
            .channel(`user_data:${userId}`)
            .on('postgres_changes', {
                event: 'UPDATE',
                schema: 'public',
                table: 'user_data',
                filter: `user_id=eq.${userId}`
            }, async (payload) => {
                // Solo descargar si la actualización viene de otro dispositivo
                // (diferencia de timestamp mayor a 2s para ignorar nuestros propios upserts)
                const remoteTs = payload?.new?.updated_at
                    ? new Date(payload.new.updated_at).getTime()
                    : 0;
                const msSinceOurLastSync = Date.now() - _lastSyncTime;
                if (msSinceOurLastSync < 2000) return; // fue nuestro propio upsert

                window.EtheriaLogger?.info?.('sync:realtime', 'Cambio detectado desde otro dispositivo — descargando...');
                const result = await downloadProfileData();
                if (result.ok) {
                    // Recargar topics desde su tabla propia (no viajan en el blob)
                    if (typeof SupabaseStories !== 'undefined' && typeof SupabaseStories.loadStories === 'function') {
                        await SupabaseStories.loadStories().catch(() => {});
                    }
                    const _rtActiveProfileId = (typeof SupabaseProfiles !== 'undefined' && typeof SupabaseProfiles.getActiveProfileId === 'function')
                        ? SupabaseProfiles.getActiveProfileId()
                        : null;
                    if (_rtActiveProfileId && typeof SupabaseCharacters !== 'undefined' && typeof SupabaseCharacters.loadCharacters === 'function') {
                        await SupabaseCharacters.loadCharacters(_rtActiveProfileId).catch(() => {});
                    }
                    if (typeof renderTopics   === 'function') renderTopics();
                    if (typeof renderGallery  === 'function') renderGallery();
                    if (typeof renderUserCards === 'function') renderUserCards();
                    eventBus.emit('ui:show-autosave', { text: 'Datos actualizados desde otro dispositivo', state: 'info' });
                }
            })
            .subscribe();
    }

    function _unsubscribeRealtime() {
        const c = _client();
        if (_realtimeChannel && c) {
            try { c.removeChannel(_realtimeChannel); } catch {}
            _realtimeChannel = null;
        }
    }

    function _setupEventListeners() {
        // Marcar cambios pendientes cuando se modifican datos.
        // NOTA: etheria:data-changed no tiene emisor activo — nadie llama
        // dispatchEvent('etheria:data-changed') en el codebase actual.
        // Las mutaciones reales usan touchField() o markPending() directamente.
        // Este listener existe como hook para código futuro; no eliminarlo.
        window.addEventListener('etheria:data-changed', () => {
            _pendingChanges = true;
        });

        // ── Sync al volver de segundo plano (móvil/PWA) ──────────────────────
        // visibilitychange cubre tanto PWA como navegador estándar
        document.addEventListener('visibilitychange', async () => {
            if (document.visibilityState !== 'visible') return;
            const userId = _getUserId();
            if (!userId) return;
            const msSinceLastSync = Date.now() - _lastSyncTime;
            // Solo descargar si han pasado más de 10s desde el último sync
            // (evita descargas innecesarias al alternar ventanas rápido)
            if (msSinceLastSync < 10000) return;
            window.EtheriaLogger?.info?.('sync:visibility', 'App visible de nuevo — sincronizando...');
            const result = await downloadProfileData();

            // Recargar topics y characters desde sus tablas propias,
            // ya que no viajan en el blob de user_data
            if (typeof SupabaseStories !== 'undefined' && typeof SupabaseStories.loadStories === 'function') {
                await SupabaseStories.loadStories().catch(() => {});
            }
            const _visActiveProfileId = (typeof SupabaseProfiles !== 'undefined' && typeof SupabaseProfiles.getActiveProfileId === 'function')
                ? SupabaseProfiles.getActiveProfileId()
                : null;
            if (_visActiveProfileId && typeof SupabaseCharacters !== 'undefined' && typeof SupabaseCharacters.loadCharacters === 'function') {
                await SupabaseCharacters.loadCharacters(_visActiveProfileId).catch(() => {});
            }

            if (result.ok) {
                if (typeof renderTopics  === 'function') renderTopics();
                if (typeof renderGallery === 'function') renderGallery();
                if (typeof renderUserCards === 'function') renderUserCards();
            }
            // Si además había cambios pendientes, subirlos
            if (_pendingChanges) await uploadProfileData();

            // ── Detección de inactividad y oferta de skip de turno ───────────
            // Si el tema activo tiene turno activado y el jugador con turno lleva
            // más de 24 horas sin responder, emitir un evento para que la UI
            // ofrezca el botón de skip. No hacemos skip automático (sería intrusivo).
            const SKIP_THRESHOLD_MS = 24 * 60 * 60 * 1000; // 24 h
            try {
                const _activeTopic = (typeof getCurrentTopic === 'function') ? getCurrentTopic() : null;
                if (_activeTopic?.turnMode && _activeTopic.turnMode !== 'off'
                        && _activeTopic.turnLastAt) {
                    const _msSinceLastMsg = Date.now() - new Date(_activeTopic.turnLastAt).getTime();
                    const _myId = _getUserId();
                    // Solo ofrecer skip si somos participantes (hay cola) y NO somos el que tiene el turno
                    const _isMyTurn = Array.isArray(_activeTopic.turnOrder)
                        && _activeTopic.turnOrder.length > 0
                        && _activeTopic.turnOrder[0] === _myId;
                    if (_msSinceLastMsg >= SKIP_THRESHOLD_MS && !_isMyTurn && _myId) {
                        window.EtheriaLogger?.info?.('sync:turns', 'Inactividad ≥24h detectada — ofreciendo skip');
                        window.dispatchEvent(new CustomEvent('etheria:turn-inactive', {
                            detail: {
                                topicId:       _activeTopic.id,
                                storyId:       _activeTopic.storyId,
                                inactiveUserId: _activeTopic.turnOrder?.[0] || null,
                                msInactive:    _msSinceLastMsg
                            }
                        }));
                    }
                }
            } catch (_) {}
        });

        // ── Sync al recuperar conexión ───────────────────────────────────────
        window.addEventListener('online', async () => {
            _isOffline = false;
            const userId = _getUserId();
            if (!userId) return;
            window.EtheriaLogger?.info?.('sync:network', 'Conexión recuperada — sincronizando...');
            eventBus.emit('ui:show-autosave', { text: 'Conexión recuperada — sincronizando...', state: 'info' });
            await sync({ silent: false, force: true });
            // Recargar topics y characters que no viajan en el blob
            if (typeof SupabaseStories !== 'undefined' && typeof SupabaseStories.loadStories === 'function') {
                await SupabaseStories.loadStories().catch(() => {});
            }
            const _onlineActiveProfileId = (typeof SupabaseProfiles !== 'undefined' && typeof SupabaseProfiles.getActiveProfileId === 'function')
                ? SupabaseProfiles.getActiveProfileId()
                : null;
            if (_onlineActiveProfileId && typeof SupabaseCharacters !== 'undefined' && typeof SupabaseCharacters.loadCharacters === 'function') {
                await SupabaseCharacters.loadCharacters(_onlineActiveProfileId).catch(() => {});
            }
            if (typeof renderTopics  === 'function') renderTopics();
            if (typeof renderGallery === 'function') renderGallery();
            // Reconectar canal Realtime (se desconecta al perder red)
            _subscribeRealtimeChanges();
        });

        window.addEventListener('offline', () => {
            _isOffline = true;
            eventBus.emit('sync:status-changed', { status: 'degraded', message: 'Sin conexión', target: 'indicator' });
        });

        // ── Sync al cerrar/salir ─────────────────────────────────────────────
        // beforeunload: sync síncrono con sendBeacon como fallback
        window.addEventListener('beforeunload', () => {
            const userId = _getUserId();
            if (!userId || !_pendingChanges) return;
            // Intentar sync rápido (puede no completarse, pero lo intentamos)
            uploadProfileData().catch(() => {});
            // Fallback: sendBeacon para garantizar que al menos el flag queda registrado
            // (el Service Worker puede usar esto para reintentar al volver)
            if (navigator.sendBeacon) {
                try {
                    navigator.sendBeacon('/sw-sync-ping', JSON.stringify({ userId, ts: Date.now() }));
                } catch {}
            }
        });

        // pagehide: más fiable que beforeunload en móvil iOS
        window.addEventListener('pagehide', () => {
            const userId = _getUserId();
            if (!userId || !_pendingChanges) return;
            uploadProfileData().catch(() => {});
        }, { passive: true });

        // Escuchar mensajes del Service Worker
        navigator.serviceWorker?.addEventListener('message', (event) => {
            if (event.data?.type === 'SYNC_REQUIRED') {
                sync({ silent: true });
            }
        });
    }

    // ── Init ─────────────────────────────────────────────────────────────────

    function init() {
        _setupEventListeners();
        
        // Sincronización inicial silenciosa
        const userId = _getUserId();
        if (userId && _isAvailable()) {
            sync({ silent: true })
                .then(async () => {
                    // Cargar topics desde su tabla propia (no viajan en el blob de user_data).
                    // Los personajes (characters) los gestiona el listener etheria:active-profile-changed
                    // en app.js, que se dispara cuando SupabaseProfiles resuelve el perfil activo
                    // (siempre ocurre después de que este init() se ejecute).
                    if (typeof SupabaseStories !== 'undefined' && typeof SupabaseStories.loadStories === 'function') {
                        await SupabaseStories.loadStories().catch(() => {});
                    }
                    if (typeof renderTopics  === 'function') renderTopics();
                    if (typeof renderGallery === 'function') renderGallery();
                })
                .catch(() => {});
            // Suscribir al canal Realtime para detectar cambios desde otros dispositivos
            _subscribeRealtimeChanges().catch(() => {});
        }
        
        startAutoSync();
    }

    // ── API pública ──────────────────────────────────────────────────────────

    // Reconectar realtime cuando cambia el usuario autenticado
    window.addEventListener('etheria:auth-changed', (e) => {
        const user = e.detail?.user;
        if (user?.id) {
            _subscribeRealtimeChanges().catch(() => {});
        } else {
            _unsubscribeRealtime();
        }
    });

    // Auto-touch rpgStateSnapshot cuando el motor RPG cambia su estado.
    // Esto evita tener que llamar touchField desde RPGState.js manualmente.
    window.addEventListener('rpg:state-updated', () => {
        touchField('rpgStateSnapshot');
    });

    return {
        init,
        sync,
        uploadProfileData,
        downloadProfileData,
        startAutoSync,
        stopAutoSync,
        markPending: () => { _pendingChanges = true; },
        touchField,
        get isOffline() { return _isOffline; },
        get lastSyncTime() { return _lastSyncTime; },
        get hasPendingChanges() { return _pendingChanges; }
    };

})();

// Exponer globalmente
window.SupabaseSync = SupabaseSync;
