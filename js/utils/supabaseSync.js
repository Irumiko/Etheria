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
        
        // Filtrar datos por perfil
        const topics = (appData?.topics || []).filter(t => t.createdByIndex === profileIndex);
        const topicIds = new Set(topics.map(t => String(t.id)));
        
        const messages = {};
        Object.keys(appData?.messages || {}).forEach(topicId => {
            if (topicIds.has(String(topicId))) {
                messages[topicId] = appData.messages[topicId];
            }
        });

        const characters = (appData?.characters || []).filter(c => c.userIndex === profileIndex);
        
        const affinities = {};
        Object.keys(appData?.affinities || {}).forEach(topicId => {
            if (topicIds.has(String(topicId))) {
                affinities[topicId] = appData.affinities[topicId];
            }
        });

        const favorites = appData?.favorites || {};
        const journals = appData?.journals || {};
        const reactions = appData?.reactions || {};

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

        const profileIndex = syncedData.profileIndex || 0;

        // Actualizar nombres de usuario si existen
        if (Array.isArray(syncedData.userNames) && syncedData.userNames.length > 0) {
            if (typeof userNames !== 'undefined') {
                userNames.splice(0, userNames.length, ...syncedData.userNames);
            }
            try {
                localStorage.setItem('etheria_user_names', JSON.stringify(syncedData.userNames));
            } catch {}
        }

        // Merge topics (evitar duplicados por ID)
        if (Array.isArray(syncedData.topics)) {
            const existingIds = new Set((appData?.topics || []).map(t => String(t.id)));
            syncedData.topics.forEach(topic => {
                if (!existingIds.has(String(topic.id))) {
                    appData.topics.push(topic);
                } else {
                    // Actualizar topic existente si es más reciente
                    const idx = appData.topics.findIndex(t => String(t.id) === String(topic.id));
                    if (idx !== -1) {
                        const localUpdated = appData.topics[idx].updatedAt || 0;
                        const remoteUpdated = topic.updatedAt || 0;
                        if (remoteUpdated > localUpdated) {
                            appData.topics[idx] = topic;
                        }
                    }
                }
            });
        }

        // Merge characters
        if (Array.isArray(syncedData.characters)) {
            const existingIds = new Set((appData?.characters || []).map(c => String(c.id)));
            syncedData.characters.forEach(char => {
                if (!existingIds.has(String(char.id))) {
                    appData.characters.push(char);
                } else {
                    const idx = appData.characters.findIndex(c => String(c.id) === String(char.id));
                    if (idx !== -1) {
                        const localUpdated = appData.characters[idx].updatedAt || 0;
                        const remoteUpdated = char.updatedAt || 0;
                        if (remoteUpdated > localUpdated) {
                            appData.characters[idx] = char;
                        }
                    }
                }
            });
        }

        // Merge messages por topic
        if (syncedData.messages && typeof syncedData.messages === 'object') {
            Object.keys(syncedData.messages).forEach(topicId => {
                const remoteMsgs = syncedData.messages[topicId];
                if (!Array.isArray(remoteMsgs)) return;

                if (!appData.messages[topicId]) {
                    appData.messages[topicId] = remoteMsgs;
                } else {
                    // Merge por ID de mensaje
                    const localMsgs = appData.messages[topicId];
                    const localIds = new Set(localMsgs.map(m => m.id));
                    
                    remoteMsgs.forEach(msg => {
                        if (!localIds.has(msg.id)) {
                            localMsgs.push(msg);
                        }
                    });

                    // Ordenar por timestamp
                    localMsgs.sort((a, b) => {
                        const ta = new Date(a.timestamp || 0).getTime();
                        const tb = new Date(b.timestamp || 0).getTime();
                        return ta - tb;
                    });
                }
            });
        }

        // Merge affinities
        if (syncedData.affinities && typeof syncedData.affinities === 'object') {
            Object.keys(syncedData.affinities).forEach(topicId => {
                appData.affinities[topicId] = syncedData.affinities[topicId];
            });
        }

        // Merge favorites, journals, reactions
        if (syncedData.favorites) Object.assign(appData.favorites, syncedData.favorites);
        if (syncedData.journals) Object.assign(appData.journals, syncedData.journals);
        if (syncedData.reactions) Object.assign(appData.reactions, syncedData.reactions);

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

            // Intentar UPDATE primero, luego INSERT si no existe
            const { error: updateError } = await _client()
                .from('user_data')
                .update({ 
                    data, 
                    updated_at: now 
                })
                .eq('user_id', userId);

            if (updateError) {
                // Si no existe, hacer INSERT
                const { error: insertError } = await _client()
                    .from('user_data')
                    .insert({ 
                        user_id: userId, 
                        data, 
                        updated_at: now 
                    });

                if (insertError) {
                    console.error('[SupabaseSync] upload error:', insertError);
                    return { ok: false, error: insertError.message };
                }
            }

            _lastSyncTime = Date.now();
            _pendingChanges = false;
            
            // Actualizar UI
            if (typeof updateCloudSyncIndicator === 'function') {
                updateCloudSyncIndicator('online', 'Sincronizado');
            }
            if (typeof updateSyncButtonState === 'function') {
                updateSyncButtonState('synced', 'Sincronizar');
            }

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
                if (typeof updateCloudSyncIndicator === 'function') {
                    updateCloudSyncIndicator('online', 'Sincronizado');
                }
                if (typeof updateSyncButtonState === 'function') {
                    updateSyncButtonState('synced', 'Sincronizar');
                }

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
            if (!silent && typeof showAutosave === 'function') {
                showAutosave('Inicia sesión para sincronizar', 'info');
            }
            return { status: 'no-auth' };
        }

        _syncInProgress = true;
        
        if (!silent && typeof updateSyncButtonState === 'function') {
            updateSyncButtonState('syncing', 'Sincronizando...');
        }

        try {
            // 1. Descargar datos del servidor
            const downloadResult = await downloadProfileData();
            
            if (!downloadResult.ok) {
                _isOffline = true;
                if (!silent && typeof showAutosave === 'function') {
                    showAutosave('Error de sincronización', 'error');
                }
                return { status: 'error', error: downloadResult.error };
            }

            // 2. Si es nuevo usuario, subir datos locales
            if (downloadResult.isNew && _hasLocalData()) {
                const uploadResult = await uploadProfileData();
                if (!silent && uploadResult.ok && typeof showAutosave === 'function') {
                    showAutosave('Datos subidos a la nube', 'saved');
                }
                return { status: uploadResult.ok ? 'uploaded' : 'error' };
            }

            // 3. Si hay cambios locales pendientes, subirlos
            if (_pendingChanges || force) {
                const uploadResult = await uploadProfileData();
                if (!silent && uploadResult.ok && typeof showAutosave === 'function') {
                    showAutosave('Sincronización completada', 'saved');
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

    function _setupEventListeners() {
        // Marcar cambios pendientes cuando se modifican datos
        window.addEventListener('etheria:data-changed', () => {
            _pendingChanges = true;
        });

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
        }
        
        startAutoSync();
    }

    // ── API pública ──────────────────────────────────────────────────────────

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
