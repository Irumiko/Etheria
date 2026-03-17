// ============================================
// SUPABASE SYNC — Sincronización completa de datos
// ============================================
// Reemplaza el sistema JSONBin con sincronización completa vía Supabase.
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
        const topics = Array.isArray(appData?.topics) ? appData.topics : [];
        const topicIds = new Set(topics.map(t => String(t.id)));

        const messages = {};
        Object.keys(appData?.messages || {}).forEach(topicId => {
            if (topicIds.has(String(topicId))) messages[topicId] = appData.messages[topicId];
        });

        const affinities = {};
        Object.keys(appData?.affinities || {}).forEach(topicId => {
            if (topicIds.has(String(topicId))) affinities[topicId] = appData.affinities[topicId];
        });

        const characters = Array.isArray(appData?.characters) ? appData.characters : [];
        const favorites = appData?.favorites || {};
        const journals = appData?.journals || {};
        const reactions = appData?.reactions || {};

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
            userNames: typeof userNames !== 'undefined' ? userNames : ['Jugador 1', 'Jugador 2', 'Jugador 3'],
            topics,
            characters,
            messages,
            affinities,
            favorites,
            journals,
            reactions,
            profileMeta,
            lastMessageIndex: typeof currentMessageIndex !== 'undefined' ? currentMessageIndex : 0,
            settings: {
                textSpeed: typeof textSpeed !== 'undefined' ? textSpeed : 25,
                theme: document.documentElement.getAttribute('data-theme') || 'light',
                fontSize: localStorage.getItem('etheria_font_size') || '19'
            }
        };
    }

    /**
     * Aplica datos sincronizados al estado local
     */
    function _applySyncedData(syncedData) {
        if (!syncedData || typeof syncedData !== 'object') return false;

        // Actualizar nombres de usuario si existen
        if (Array.isArray(syncedData.userNames) && syncedData.userNames.length > 0) {
            if (typeof userNames !== 'undefined') {
                userNames.splice(0, userNames.length, ...syncedData.userNames);
            }
            try {
                localStorage.setItem('etheria_user_names', JSON.stringify(syncedData.userNames));
            } catch (error) { window.EtheriaLogger?.warn('app', 'operation failed:', error?.message || error); }
        }

        const remoteTopics = Array.isArray(syncedData.topics) ? syncedData.topics : [];
        const remoteCharacters = Array.isArray(syncedData.characters) ? syncedData.characters : [];
        const remoteMessages = (syncedData.messages && typeof syncedData.messages === 'object') ? syncedData.messages : {};
        const remoteAffinities = (syncedData.affinities && typeof syncedData.affinities === 'object') ? syncedData.affinities : {};

        appData.topics = remoteTopics;
        appData.characters = remoteCharacters;
        appData.messages = remoteMessages;
        appData.affinities = remoteAffinities;
        appData.favorites = (syncedData.favorites && typeof syncedData.favorites === 'object') ? syncedData.favorites : {};
        appData.journals = (syncedData.journals && typeof syncedData.journals === 'object') ? syncedData.journals : {};
        appData.reactions = (syncedData.reactions && typeof syncedData.reactions === 'object') ? syncedData.reactions : {};

        if (syncedData.profileMeta && typeof syncedData.profileMeta === 'object') {
            try {
                localStorage.setItem('etheria_user_genders', JSON.stringify(Array.isArray(syncedData.profileMeta.genders) ? syncedData.profileMeta.genders : []));
                localStorage.setItem('etheria_user_birthdays', JSON.stringify(Array.isArray(syncedData.profileMeta.birthdays) ? syncedData.profileMeta.birthdays : []));
                localStorage.setItem('etheria_user_avatars', JSON.stringify(Array.isArray(syncedData.profileMeta.avatars) ? syncedData.profileMeta.avatars : []));
            } catch (error) { window.EtheriaLogger?.warn('app', 'operation failed:', error?.message || error); }
        }

        // Guardar en localStorage
        if (typeof persistPartitionedData === 'function') {
            persistPartitionedData(true);
        }

        return true;
    }

    // ── API de Supabase ──────────────────────────────────────────────────────

    /**
     * Sube los datos del perfil a Supabase
     */
    async function uploadProfileData() {
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
                console.error('[SupabaseSync] upload error:', upsertError);
                return { ok: false, error: upsertError.message };
            }

            _lastSyncTime = Date.now();
            _pendingChanges = false;
            
            // Actualizar UI
            eventBus.emit('sync:status-changed', { status: 'online',  message: 'Sincronizado', target: 'indicator' });
            eventBus.emit('sync:status-changed', { status: 'synced',  message: 'Sincronizar',  target: 'button' });

            return { ok: true };
        } catch (err) {
            console.error('[SupabaseSync] upload exception:', err);
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
                console.error('[SupabaseSync] download error:', error);
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
            console.error('[SupabaseSync] download exception:', err);
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
            // 1. Descargar datos del servidor
            const downloadResult = await downloadProfileData();
            
            if (!downloadResult.ok) {
                _isOffline = true;
                if (!silent) {
                    eventBus.emit('ui:show-autosave', { text: 'Error de sincronización', state: 'error' });
                }
                return { status: 'error', error: downloadResult.error };
            }

            // 2. Si es nuevo usuario, subir datos locales
            if (downloadResult.isNew && _hasLocalData()) {
                const uploadResult = await uploadProfileData();
                if (!silent && uploadResult.ok) {
                    eventBus.emit('ui:show-autosave', { text: 'Datos subidos a la nube', state: 'saved' });
                }
                return { status: uploadResult.ok ? 'uploaded' : 'error' };
            }

            // 3. Si hay cambios locales pendientes, subirlos
            if (_pendingChanges || force) {
                const uploadResult = await uploadProfileData();
                if (!silent && uploadResult.ok) {
                    eventBus.emit('ui:show-autosave', { text: 'Sincronización completada', state: 'saved' });
                }
                return { status: uploadResult.ok ? 'synced' : 'error' };
            }

            _isOffline = false;
            return { status: 'synced' };

        } catch (err) {
            console.error('[SupabaseSync] sync error:', err);
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
               (appData?.characters?.length > 0) ||
               Object.keys(appData?.messages || {}).length > 0;
    }

    // ── Auto-sync ────────────────────────────────────────────────────────────

    function startAutoSync() {
        if (_syncInterval) clearInterval(_syncInterval);
        
        _syncInterval = setInterval(async () => {
            const userId = _getUserId();
            if (!userId) return; // No sincronizar si no hay usuario
            
            if (_pendingChanges || hasUnsavedChanges) {
                await sync({ silent: true });
            }
        }, _isOffline ? CFG.OFFLINE_INTERVAL : CFG.SYNC_INTERVAL);
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
                if (result.ok && result.data) {
                    if (typeof renderTopics  === 'function') renderTopics();
                    if (typeof renderGallery === 'function') renderGallery();
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
        // Marcar cambios pendientes cuando se modifican datos
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
            if (result.ok && result.data) {
                if (typeof renderTopics  === 'function') renderTopics();
                if (typeof renderGallery === 'function') renderGallery();
                if (typeof renderUserCards === 'function') renderUserCards();
            }
            // Si además había cambios pendientes, subirlos
            if (_pendingChanges) await uploadProfileData();
        });

        // ── Sync al recuperar conexión ───────────────────────────────────────
        window.addEventListener('online', async () => {
            _isOffline = false;
            const userId = _getUserId();
            if (!userId) return;
            window.EtheriaLogger?.info?.('sync:network', 'Conexión recuperada — sincronizando...');
            eventBus.emit('ui:show-autosave', { text: 'Conexión recuperada — sincronizando...', state: 'info' });
            await sync({ silent: false, force: true });
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
            sync({ silent: true }).catch(() => {});
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

    return {
        init,
        sync,
        uploadProfileData,
        downloadProfileData,
        startAutoSync,
        stopAutoSync,
        markPending: () => { _pendingChanges = true; },
        get isOffline() { return _isOffline; },
        get lastSyncTime() { return _lastSyncTime; },
        get hasPendingChanges() { return _pendingChanges; }
    };

})();

// Exponer globalmente
window.SupabaseSync = SupabaseSync;
