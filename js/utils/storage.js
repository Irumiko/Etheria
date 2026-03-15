// Utilidades de persistencia y funciones de apoyo del núcleo.
// ============================================
// CORE/STORAGE.JS
// ============================================
// Aquí viven utilidades del núcleo: lectura/escritura en localStorage,
// preferencias del sistema y helpers generales usados por toda la app.

function getStoredLastProfileId() {
    const stored = Number.parseInt(localStorage.getItem(LAST_PROFILE_KEY), 10);
    return Number.isInteger(stored) && stored >= 0 && stored < userNames.length ? stored : null;
}

function prefersReducedMotion() {
    return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function announceForScreenReader(text) {
    const announcer = document.getElementById('screenReaderAnnouncements');
    if (!announcer) return;
    announcer.textContent = '';
    setTimeout(() => {
        announcer.textContent = text;
    }, 30);
}

function parseStoredJSON(key, fallback) {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    try {
        return JSON.parse(raw);
    } catch (error) {
        console.error(`Error parsing key ${key}:`, error);
        return fallback;
    }
}

function getTopicStorageKey(topicId) {
    return `${STORAGE_KEYS.topicPrefix}${topicId}`;
}

function _migrateTopicModes(topics) {
    // Migración: topics guardados con mode:'fanfic' (nombre interno antiguo)
    // se renombran a mode:'rpg' para consistencia con la UI
    if (!Array.isArray(topics)) return topics;
    let changed = false;
    const migrated = topics.map(t => {
        if (t.mode === 'fanfic') { changed = true; return { ...t, mode: 'rpg' }; }
        return t;
    });
    if (changed) {
        try { localStorage.setItem(STORAGE_KEYS.topics, JSON.stringify(migrated)); } catch (error) { window.EtheriaLogger?.warn('app', 'operation failed:', error?.message || error); }
        console.info('[Etheria] Migración: mode fanfic→rpg aplicada a', migrated.filter(t=>t.mode==='rpg').length, 'topics');
    }
    return migrated;
}

function loadStoredAppData() {
    let topics = parseStoredJSON(STORAGE_KEYS.topics, null);
    const characters = parseStoredJSON(STORAGE_KEYS.characters, null);

    // Migrar topics con modo antiguo 'fanfic' → 'rpg'
    if (Array.isArray(topics)) topics = _migrateTopicModes(topics);

    if (Array.isArray(topics) || Array.isArray(characters)) {
        return {
            topics: Array.isArray(topics) ? topics : [],
            characters: Array.isArray(characters) ? characters : [],
            messages: {},
            affinities: parseStoredJSON(STORAGE_KEYS.affinities, {}) || {},
            favorites: parseStoredJSON('etheria_favorites', {}) || {},
            journals:  parseStoredJSON('etheria_journals', {}) || {},
            reactions: parseStoredJSON('etheria_reactions', {}) || {}
        };
    }

    const legacy = parseStoredJSON(STORAGE_KEYS.legacy, null);
    if (legacy && typeof legacy === 'object') {
        return {
            topics: Array.isArray(legacy.topics) ? legacy.topics : [],
            characters: Array.isArray(legacy.characters) ? legacy.characters : [],
            messages: (legacy.messages && typeof legacy.messages === 'object' && !Array.isArray(legacy.messages)) ? legacy.messages : {},
            affinities: (legacy.affinities && typeof legacy.affinities === 'object' && !Array.isArray(legacy.affinities)) ? legacy.affinities : {},
            favorites: (legacy.favorites && typeof legacy.favorites === 'object') ? legacy.favorites : {},
            journals:  (legacy.journals  && typeof legacy.journals  === 'object') ? legacy.journals  : {},
            reactions: (legacy.reactions && typeof legacy.reactions === 'object') ? legacy.reactions : {}
        };
    }

    return { topics: [], characters: [], messages: {}, affinities: {}, favorites: {}, journals: {}, reactions: {} };
}

function loadTopicMessagesFromStorage(topicId) {
    const msgs = parseStoredJSON(getTopicStorageKey(topicId), null);
    return Array.isArray(msgs) ? msgs : [];
}

function getTopicMessages(topicId) {
    if (!topicId) return [];
    if (Array.isArray(appData.messages[topicId])) return appData.messages[topicId];
    const loaded = loadTopicMessagesFromStorage(topicId);
    appData.messages[topicId] = loaded;
    return loaded;
}

// ── Fix 9: dirty-partition tracking ────────────────────────────────────────
// Instead of serialising every collection on every save(), callers mark only
// the partitions that changed. persistPartitionedData() then flushes only
// those dirty buckets, skipping the rest.
//
// Usage:
//   markDirty('topics');          // after adding/removing/editing a topic
//   markDirty('characters');      // after editing characters
//   markDirty('messages', id);    // after appending/merging messages for topicId
//   markDirty('affinities');
//   markDirty('favorites');
//   markDirty('journals');
//   markDirty('reactions');
//
// Calling persistPartitionedData() without any markDirty() calls is a no-op
// for the partition buckets (legacy snapshot and message-topics index are
// always refreshed for backward-compat, but they are small).
const _dirtyPartitions = new Set();
const _dirtyMessageTopics = new Set();

function markDirty(partition, topicId) {
    _dirtyPartitions.add(partition);
    if (partition === 'messages' && topicId != null) {
        _dirtyMessageTopics.add(String(topicId));
    }
}

function _flushAllDirty() {
    // Force-mark everything — used after bulk imports or cloud downloads
    _dirtyPartitions.add('topics');
    _dirtyPartitions.add('characters');
    _dirtyPartitions.add('affinities');
    _dirtyPartitions.add('favorites');
    _dirtyPartitions.add('journals');
    _dirtyPartitions.add('reactions');
    _dirtyPartitions.add('messages');
    if (appData && Array.isArray(appData.topics)) {
        appData.topics.forEach(t => _dirtyMessageTopics.add(String(t.id)));
    }
}

function persistPartitionedData(forceAll = false) {
    if (forceAll) _flushAllDirty();

    // Flush only changed partitions
    if (_dirtyPartitions.has('topics')) {
        localStorage.setItem(STORAGE_KEYS.topics, JSON.stringify(appData.topics));
    }
    if (_dirtyPartitions.has('characters')) {
        localStorage.setItem(STORAGE_KEYS.characters, JSON.stringify(appData.characters));
    }
    if (_dirtyPartitions.has('affinities')) {
        localStorage.setItem(STORAGE_KEYS.affinities, JSON.stringify(appData.affinities));
    }
    if (_dirtyPartitions.has('favorites')) {
        localStorage.setItem('etheria_favorites', JSON.stringify(appData.favorites || {}));
    }
    if (_dirtyPartitions.has('journals')) {
        localStorage.setItem('etheria_journals', JSON.stringify(appData.journals || {}));
    }
    if (_dirtyPartitions.has('reactions')) {
        localStorage.setItem('etheria_reactions', JSON.stringify(appData.reactions || {}));
    }

    // Always refresh the topic-ID index (tiny — just an array of IDs)
    const topicIds = appData.topics.map(t => String(t.id));
    localStorage.setItem(STORAGE_KEYS.messageTopics, JSON.stringify(topicIds));

    // Flush only the per-topic message partitions that changed
    const topicsToFlush = (_dirtyPartitions.has('messages') && _dirtyMessageTopics.size === 0)
        ? topicIds   // 'messages' marked but no specific topic → flush all (e.g. bulk import)
        : [..._dirtyMessageTopics].filter(id => topicIds.includes(id));

    topicsToFlush.forEach((topicId) => {
        const topicMsgs = Array.isArray(appData.messages[topicId])
            ? appData.messages[topicId]
            : loadTopicMessagesFromStorage(topicId);
        localStorage.setItem(getTopicStorageKey(topicId), JSON.stringify(topicMsgs));
    });

    // Orphan cleanup — only when topic list changed (avoids scanning localStorage every save)
    if (_dirtyPartitions.has('topics')) {
        Object.keys(localStorage)
            .filter((k) => k.startsWith(STORAGE_KEYS.topicPrefix))
            .forEach((k) => {
                const topicId = k.replace(STORAGE_KEYS.topicPrefix, '');
                if (!topicIds.includes(topicId)) {
                    localStorage.removeItem(k);
                }
            });

        if (appData.reactions && typeof appData.reactions === 'object') {
            const orphanReactionTopics = Object.keys(appData.reactions)
                .filter(tid => !topicIds.includes(String(tid)));
            orphanReactionTopics.forEach(tid => { delete appData.reactions[tid]; });
            if (orphanReactionTopics.length > 0) {
                localStorage.setItem('etheria_reactions', JSON.stringify(appData.reactions));
            }
        }
    }

    // Legacy snapshot — only rebuild when structural data changed
    if (_dirtyPartitions.has('topics') || _dirtyPartitions.has('characters') ||
        _dirtyPartitions.has('affinities') || _dirtyPartitions.has('messages')) {
        const legacySnapshot = {
            topics: appData.topics,
            characters: appData.characters,
            messages: appData.messages,
            affinities: appData.affinities,
            favorites: appData.favorites || {},
            journals: appData.journals || {},
            reactions: appData.reactions || {}
        };
        localStorage.setItem(STORAGE_KEYS.legacy, JSON.stringify(legacySnapshot));
    }

    // Reset dirty sets now that everything is flushed
    _dirtyPartitions.clear();
    _dirtyMessageTopics.clear();
}

function updateCloudSyncIndicator(status, message = '') {
    cloudSyncStatus = status;
    if (typeof eventBus !== 'undefined') {
        eventBus.emit('sync:status-changed', { status, message, target: 'indicator' });
    }
}

function updateSyncButtonState(status, message = '') {
    if (typeof eventBus !== 'undefined') {
        eventBus.emit('sync:status-changed', { status, message, target: 'button' });
    }
}

function hideSyncToast() {
    const toast = document.getElementById('syncToast');
    const backdrop = document.getElementById('syncToastBackdrop');
    if (toast) toast.classList.remove('visible');
    if (backdrop) backdrop.classList.remove('visible');
}

function showSyncToast(message, actionText, onAction) {
    const toast = document.getElementById('syncToast');
    const backdrop = document.getElementById('syncToastBackdrop');
    if (!toast) return;

    const textEl = toast.querySelector('.sync-toast-text');
    const button = toast.querySelector('.sync-toast-action');
    if (textEl) textEl.textContent = message;
    if (button) {
        button.textContent = actionText || 'Ver ahora';
        button.onclick = () => {
            hideSyncToast();
            if (typeof onAction === 'function') onAction();
        };
    }

    // Cerrar también al clicar el backdrop
    if (backdrop) {
        backdrop.classList.add('visible');
        backdrop.onclick = hideSyncToast;
    }

    toast.classList.add('visible');
    // Auto-cierre a los 8 segundos
    window.setTimeout(hideSyncToast, 8000);
}

function getLocalProfileUpdatedAt(profileIndex = currentUserIndex) {
    const raw = localStorage.getItem(`${LOCAL_PROFILE_UPDATED_PREFIX}${profileIndex}`);
    const timestamp = Number.parseInt(raw || '0', 10);
    return Number.isFinite(timestamp) ? timestamp : 0;
}

function setLocalProfileUpdatedAt(profileIndex = currentUserIndex, timestamp = Date.now()) {
    localStorage.setItem(`${LOCAL_PROFILE_UPDATED_PREFIX}${profileIndex}`, String(timestamp));
}

function countMessagesInProfile(profileData) {
    return Object.values(profileData?.messages || {}).reduce((acc, list) => acc + (Array.isArray(list) ? list.length : 0), 0);
}

function getProfileScopedAppData(profileIndex = currentUserIndex) {
    const topics = appData.topics.filter(topic => topic.createdByIndex === profileIndex);
    const topicIds = new Set(topics.map(topic => String(topic.id)));
    const messages = {};

    Object.keys(appData.messages).forEach((topicId) => {
        if (topicIds.has(String(topicId))) {
            messages[topicId] = Array.isArray(appData.messages[topicId]) ? appData.messages[topicId] : [];
        }
    });

    const affinities = {};
    Object.keys(appData.affinities || {}).forEach((topicId) => {
        if (topicIds.has(String(topicId))) affinities[topicId] = appData.affinities[topicId];
    });

    const characters = appData.characters.filter(character => character.userIndex === profileIndex);
    return { topics, characters, messages, affinities };
}

function hasProfileLocalData(profileIndex = currentUserIndex) {
    const data = getProfileScopedAppData(profileIndex);
    return data.topics.length > 0 || data.characters.length > 0 || Object.keys(data.messages).length > 0;
}

function applyProfileData(profileIndex, profileData) {
    const sanitizedData = {
        topics: Array.isArray(profileData?.topics) ? profileData.topics : [],
        characters: Array.isArray(profileData?.characters) ? profileData.characters : [],
        messages: (profileData?.messages && typeof profileData.messages === 'object' && !Array.isArray(profileData.messages)) ? profileData.messages : {},
        affinities: (profileData?.affinities && typeof profileData.affinities === 'object' && !Array.isArray(profileData.affinities)) ? profileData.affinities : {}
    };

    const previousTopicIds = appData.topics.filter(topic => topic.createdByIndex === profileIndex).map(topic => String(topic.id));
    appData.topics = appData.topics.filter(topic => topic.createdByIndex !== profileIndex).concat(sanitizedData.topics);
    appData.characters = appData.characters.filter(character => character.userIndex !== profileIndex).concat(sanitizedData.characters);

    previousTopicIds.forEach((topicId) => {
        if (!sanitizedData.messages[topicId]) {
            delete appData.messages[topicId];
            delete appData.affinities[topicId];
        }
    });

    Object.keys(sanitizedData.messages).forEach((topicId) => { appData.messages[topicId] = sanitizedData.messages[topicId]; });
    Object.keys(sanitizedData.affinities).forEach((topicId) => { appData.affinities[topicId] = sanitizedData.affinities[topicId]; });
}

// ============================================
// SINCRONIZACIÓN CON SUPABASE
// ============================================
// Las funciones de JSONBin han sido reemplazadas por SupabaseSync.
// Ver js/utils/supabaseSync.js para la implementación completa.

function ensureCloudConfig() {
    // JSONBin está deshabilitado. Usar SupabaseSync en su lugar.
    // Esta función se mantiene para compatibilidad con código existente.
    console.warn('[Etheria] JSONBin está deshabilitado. Usando Supabase para sincronización.');
}

async function fetchCloudBin() {
    // DEPRECATED: Usar SupabaseSync.downloadProfileData() en su lugar
    console.warn('[Etheria] fetchCloudBin está deprecado. Usando SupabaseSync.');
    if (typeof SupabaseSync !== 'undefined') {
        const result = await SupabaseSync.downloadProfileData();
        if (result.ok && result.data) {
            return { profiles: { [currentUserIndex || 0]: { appData: result.data } } };
        }
    }
    throw new Error('Usar SupabaseSync para sincronización');
}

async function putCloudBin(record) {
    // DEPRECATED: Usar SupabaseSync.uploadProfileData() en su lugar
    console.warn('[Etheria] putCloudBin está deprecado. Usando SupabaseSync.');
    if (typeof SupabaseSync !== 'undefined') {
        const result = await SupabaseSync.uploadProfileData();
        if (!result.ok) throw new Error(result.error);
    } else {
        throw new Error('SupabaseSync no disponible');
    }
}

function openSyncConflictModal() {
    return new Promise((resolve) => {
        const modal = document.getElementById('syncConflictModal');
        const btnLocal  = document.getElementById('syncKeepLocalBtn');
        const btnServer = document.getElementById('syncKeepServerBtn');

        if (!modal || !btnLocal || !btnServer) {
            // Fallback al confirm nativo si el modal no existe aún
            const keepLocal = confirm('Se detectó conflicto: cambios locales y remotos. ¿Conservar cambios locales?');
            resolve(keepLocal ? 'local' : 'server');
            return;
        }

        const cleanup = (choice) => {
            modal.classList.remove('active');
            document.body.classList.remove('modal-open');
            btnLocal.removeEventListener('click', onLocal);
            btnServer.removeEventListener('click', onServer);
            resolve(choice);
        };

        const onLocal  = () => cleanup('local');
        const onServer = () => cleanup('server');

        btnLocal.addEventListener('click', onLocal);
        btnServer.addEventListener('click', onServer);

        modal.classList.add('active');
        document.body.classList.add('modal-open');
        btnLocal.focus();
    });
}

async function saveToCloud(profileIndex = currentUserIndex) {
    // Usar SupabaseSync si está disponible
    if (typeof SupabaseSync !== 'undefined') {
        const result = await SupabaseSync.uploadProfileData();
        if (result.ok) {
            const now = Date.now();
            setLocalProfileUpdatedAt(profileIndex, now);
            lastSyncTimestamp = now;
            lastKnownServerTimestamp = now;
            cloudUnsyncedChanges = false;
            cloudMigrationPendingProfiles.delete(profileIndex);
            updateCloudSyncIndicator('online', 'Conectado');
            updateSyncButtonState('synced', 'Sincronizar');
            isOfflineMode = false;
            return true;
        } else {
            console.error('Cloud save error:', result.error);
            persistPartitionedData();
            isOfflineMode = true;
            updateCloudSyncIndicator('offline', 'Offline');
            updateSyncButtonState('error', 'Error');
            return false;
        }
    }
    
    // Fallback: solo guardar localmente
    persistPartitionedData();
    return false;
}

async function applyServerProfile(profileIndex, cloudProfile, { refreshUI = true } = {}) {
    applyProfileData(profileIndex, cloudProfile.appData);
    persistPartitionedData(true); // Fix 9: bulk download — force-flush all partitions
    const timestamp = Number.parseInt(cloudProfile.lastModified || '0', 10) || Date.parse(cloudProfile.updatedAt || '') || Date.now();
    setLocalProfileUpdatedAt(profileIndex, timestamp);
    lastSyncTimestamp = timestamp;
    lastKnownServerTimestamp = timestamp;
    cloudUnsyncedChanges = false;
    pendingRemoteProfileData = null;
    pendingRemoteTimestamp = 0;
    updateCloudSyncIndicator('online', 'Conectado');
    updateSyncButtonState('synced', 'Sincronizar');
    if (refreshUI && typeof refreshUIAfterCloudLoad === 'function') refreshUIAfterCloudLoad();
}

async function syncBidirectional(options = {}) {
    const {
        profileIndex = currentUserIndex,
        silent = false,
        allowRemotePrompt = true,
        forceApplyRemote = false
    } = options;

    // Usar SupabaseSync si está disponible
    if (typeof SupabaseSync !== 'undefined') {
        const result = await SupabaseSync.sync({ silent, force: forceApplyRemote });
        
        // Mapear estados de SupabaseSync a los esperados por el código existente
        const statusMap = {
            'synced': 'noop',
            'uploaded': 'uploaded',
            'downloaded': 'downloaded',
            'error': 'error',
            'busy': 'busy',
            'no-auth': 'error'
        };
        
        return { 
            status: statusMap[result.status] || result.status,
            error: result.error 
        };
    }

    // Fallback: modo offline
    if (!silent) eventBus.emit('ui:show-autosave', { text: 'Modo offline - datos solo locales', state: 'info' });
    return { status: 'error', error: 'SupabaseSync no disponible' };
}

async function loadFromCloud() {
    // Usar SupabaseSync si está disponible
    if (typeof SupabaseSync !== 'undefined') {
        const result = await SupabaseSync.downloadProfileData();
        return result.ok;
    }
    return false;
}

function startCloudSync() {
    // Usar SupabaseSync si está disponible
    if (typeof SupabaseSync !== 'undefined') {
        SupabaseSync.startAutoSync();
        return;
    }

    // Fallback: intervalo básico con syncBidirectional
    const targetInterval = isOfflineMode ? OFFLINE_SYNC_INTERVAL : AUTO_SYNC_INTERVAL;

    if (cloudSyncInterval && startCloudSync._intervalMs === targetInterval) return;
    if (cloudSyncInterval) clearInterval(cloudSyncInterval);

    startCloudSync._intervalMs = targetInterval;
    cloudSyncInterval = setInterval(async () => {
        if (cloudSyncInProgress) return;

        const nextInterval = isOfflineMode ? OFFLINE_SYNC_INTERVAL : AUTO_SYNC_INTERVAL;
        if (nextInterval !== startCloudSync._intervalMs) {
            startCloudSync();
            return;
        }

        if (hasUnsavedChanges || cloudUnsyncedChanges || cloudMigrationPendingProfiles.has(currentUserIndex)) {
            await syncBidirectional({ silent: true, allowRemotePrompt: true });
        }
    }, targetInterval);
}
