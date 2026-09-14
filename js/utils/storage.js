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


function _localStoryMatchesId(topic, idSet) {
    if (!topic || !idSet || idSet.size === 0) return false;
    return idSet.has(String(topic.id)) || (topic.storyId && idSet.has(String(topic.storyId)));
}

function listLocalStories() {
    const topics = Array.isArray(appData?.topics)
        ? appData.topics
        : parseStoredJSON(STORAGE_KEYS.topics, []) || [];

    return topics.map((topic) => {
        const id = String(topic?.id ?? '');
        const messages = id ? getTopicMessages(id) : [];
        return {
            id,
            storyId: topic?.storyId || null,
            title: topic?.title || 'Sin título',
            mode: topic?.mode || 'roleplay',
            createdBy: topic?.createdBy || null,
            createdByIndex: topic?.createdByIndex ?? null,
            date: topic?.date || null,
            messageCount: Array.isArray(messages) ? messages.length : 0,
            storageKey: id ? getTopicStorageKey(id) : null
        };
    });
}

function deleteLocalStories(topicIds) {
    const ids = Array.isArray(topicIds) ? topicIds : [topicIds];
    const idSet = new Set(ids.map(id => String(id || '').trim()).filter(Boolean));
    if (idSet.size === 0) {
        return { ok: false, removed: [], remaining: Array.isArray(appData?.topics) ? appData.topics.length : 0, error: 'No se indicó ningún id local.' };
    }

    if (!Array.isArray(appData?.topics)) {
        return { ok: false, removed: [], remaining: 0, error: 'appData.topics no está disponible.' };
    }

    const removedTopics = appData.topics.filter(topic => _localStoryMatchesId(topic, idSet));
    if (removedTopics.length === 0) {
        return { ok: false, removed: [], remaining: appData.topics.length, error: 'No se encontró ninguna historia local con ese id/storyId.' };
    }

    appData.topics = appData.topics.filter(topic => !_localStoryMatchesId(topic, idSet));

    removedTopics.forEach((topic) => {
        const topicId = String(topic.id);
        delete appData.messages?.[topicId];
        delete appData.affinities?.[topicId];
        delete appData.favorites?.[topicId];
        delete appData.journals?.[topicId];
        delete appData.reactions?.[topicId];
        try { localStorage.removeItem(getTopicStorageKey(topicId)); } catch (error) { window.EtheriaLogger?.warn('storage', 'local story message cleanup failed:', error?.message || error); }
    });

    if (removedTopics.some(topic => String(topic.id) === String(currentTopicId))) {
        currentTopicId = null;
    }

    if (typeof markDirty === 'function') {
        markDirty('topics');
        markDirty('affinities');
        markDirty('favorites');
        markDirty('journals');
        markDirty('reactions');
        markDirty('messages');
    }
    hasUnsavedChanges = true;
    if (typeof save === 'function') save({ silent: true });

    if (typeof renderTopics === 'function') renderTopics();
    if (typeof showAutosave === 'function') {
        showAutosave(`${removedTopics.length} historia${removedTopics.length !== 1 ? 's' : ''} local${removedTopics.length !== 1 ? 'es' : ''} eliminada${removedTopics.length !== 1 ? 's' : ''}`, 'saved');
    }

    return {
        ok: true,
        removed: removedTopics.map(topic => ({ id: String(topic.id), storyId: topic.storyId || null, title: topic.title || 'Sin título' })),
        remaining: appData.topics.length
    };
}

window.EtheriaLocalStories = {
    list: listLocalStories,
    deleteById: deleteLocalStories
};

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

function setLocalProfileUpdatedAt(profileIndex = currentUserIndex, timestamp = Date.now()) {
    localStorage.setItem(`${LOCAL_PROFILE_UPDATED_PREFIX}${profileIndex}`, String(timestamp));
}

// ============================================
// SINCRONIZACIÓN CON SUPABASE
// ============================================
// Las funciones de JSONBin han sido reemplazadas por SupabaseSync.
// Ver js/utils/supabaseSync.js para la implementación completa.

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

        // La sync principal cubre user_data; topics/characters viven en tablas separadas.
        if (typeof SupabaseStories !== 'undefined' && typeof SupabaseStories.loadStories === 'function') {
            await SupabaseStories.loadStories().catch(() => {});
        }

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
