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

function loadStoredAppData() {
    const topics = parseStoredJSON(STORAGE_KEYS.topics, null);
    const characters = parseStoredJSON(STORAGE_KEYS.characters, null);

    if (Array.isArray(topics) || Array.isArray(characters)) {
        return {
            topics: Array.isArray(topics) ? topics : [],
            characters: Array.isArray(characters) ? characters : [],
            messages: {},
            affinities: parseStoredJSON(STORAGE_KEYS.affinities, {}) || {}
        };
    }

    const legacy = parseStoredJSON(STORAGE_KEYS.legacy, null);
    if (legacy && typeof legacy === 'object') {
        return {
            topics: Array.isArray(legacy.topics) ? legacy.topics : [],
            characters: Array.isArray(legacy.characters) ? legacy.characters : [],
            messages: (legacy.messages && typeof legacy.messages === 'object' && !Array.isArray(legacy.messages)) ? legacy.messages : {},
            affinities: (legacy.affinities && typeof legacy.affinities === 'object' && !Array.isArray(legacy.affinities)) ? legacy.affinities : {}
        };
    }

    return { topics: [], characters: [], messages: {}, affinities: {} };
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

function persistPartitionedData() {
    localStorage.setItem(STORAGE_KEYS.topics, JSON.stringify(appData.topics));
    localStorage.setItem(STORAGE_KEYS.characters, JSON.stringify(appData.characters));
    localStorage.setItem(STORAGE_KEYS.affinities, JSON.stringify(appData.affinities));

    const topicIds = appData.topics.map(t => String(t.id));
    localStorage.setItem(STORAGE_KEYS.messageTopics, JSON.stringify(topicIds));

    topicIds.forEach((topicId) => {
        const topicMsgs = Array.isArray(appData.messages[topicId])
            ? appData.messages[topicId]
            : loadTopicMessagesFromStorage(topicId);
        localStorage.setItem(getTopicStorageKey(topicId), JSON.stringify(topicMsgs));
    });

    Object.keys(localStorage)
        .filter((k) => k.startsWith(STORAGE_KEYS.topicPrefix))
        .forEach((k) => {
            const topicId = k.replace(STORAGE_KEYS.topicPrefix, '');
            if (!topicIds.includes(topicId)) {
                localStorage.removeItem(k);
            }
        });

    const legacySnapshot = {
        topics: appData.topics,
        characters: appData.characters,
        messages: appData.messages,
        affinities: appData.affinities
    };
    localStorage.setItem(STORAGE_KEYS.legacy, JSON.stringify(legacySnapshot));
}

function updateCloudSyncIndicator(status, message = '') {
    cloudSyncStatus = status;
    const indicator = document.getElementById('cloudSyncIndicator');
    if (!indicator) return;

    const iconEl = indicator.querySelector('.cloud-sync-icon');
    const textEl = indicator.querySelector('.cloud-sync-text');

    indicator.className = `cloud-sync-indicator ${status}`;
    if (iconEl) {
        if (status === 'online') iconEl.textContent = '🟢';
        else if (status === 'degraded') iconEl.textContent = '🟠';
        else iconEl.textContent = '🔺';
    }
    if (textEl) {
        const fallbackText = status === 'online' ? 'Conectado' : status === 'degraded' ? 'Cambios pendientes' : 'Offline';
        textEl.textContent = message || fallbackText;
    }
}

function updateSyncButtonState(status, message = '') {
    const btn = document.getElementById('syncNowBtn');
    if (!btn) return;

    btn.classList.remove('is-synced', 'is-syncing', 'is-upload-pending', 'is-download-pending', 'is-error');
    const icon = btn.querySelector('.vn-control-icon');
    const label = btn.querySelector('.vn-control-label');

    if (status === 'syncing') {
        btn.classList.add('is-syncing');
        if (icon) icon.textContent = '🔄';
    } else if (status === 'pending-upload') {
        btn.classList.add('is-upload-pending');
        if (icon) icon.textContent = '⬆️';
    } else if (status === 'pending-download') {
        btn.classList.add('is-download-pending');
        if (icon) icon.textContent = '⬇️';
    } else if (status === 'error') {
        btn.classList.add('is-error');
        if (icon) icon.textContent = '⚠️';
    } else {
        btn.classList.add('is-synced');
        if (icon) icon.textContent = '☁️↻';
    }

    if (label) label.textContent = message || 'Sincronizar';
}

function showSyncToast(message, actionText, onAction) {
    const toast = document.getElementById('syncToast');
    if (!toast) return;

    const textEl = toast.querySelector('.sync-toast-text');
    const button = toast.querySelector('.sync-toast-action');
    if (textEl) textEl.textContent = message;
    if (button) {
        button.textContent = actionText || 'Ver ahora';
        button.onclick = () => {
            toast.classList.remove('visible');
            if (typeof onAction === 'function') onAction();
        };
    }

    toast.classList.add('visible');
    window.setTimeout(() => toast.classList.remove('visible'), 5500);
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

function ensureCloudConfig() {
    if (!JSONBIN_CONFIG.apiKey) {
        throw new Error('Cloud sync disabled: missing JSONBin API key');
    }
}

async function fetchCloudBin() {
    ensureCloudConfig();
    const response = await fetch(`${JSONBIN_CONFIG.baseUrl}/${JSONBIN_CONFIG.binId}/latest`, {
        method: 'GET',
        headers: { 'X-Master-Key': JSONBIN_CONFIG.apiKey }
    });

    if (!response.ok) throw new Error(`Error cloud GET (${response.status})`);
    const payload = await response.json();
    const record = payload?.record;
    return (record && typeof record === 'object') ? record : { profiles: {} };
}

async function putCloudBin(record) {
    ensureCloudConfig();
    const response = await fetch(`${JSONBIN_CONFIG.baseUrl}/${JSONBIN_CONFIG.binId}`, {
        method: 'PUT',
        headers: {
            'Content-Type': 'application/json',
            'X-Master-Key': JSONBIN_CONFIG.apiKey
        },
        body: JSON.stringify(record)
    });

    if (!response.ok) throw new Error(`Error cloud PUT (${response.status})`);
}

function openSyncConflictModal() {
    return new Promise((resolve) => {
        const keepLocal = confirm('Se detectó conflicto: cambios locales y remotos. ¿Conservar cambios locales?');
        resolve(keepLocal ? 'local' : 'server');
    });
}

async function saveToCloud(profileIndex = currentUserIndex) {
    try {
        const cloudRecord = await fetchCloudBin().catch(() => ({ version: 1, profiles: {} }));
        const profiles = (cloudRecord.profiles && typeof cloudRecord.profiles === 'object') ? cloudRecord.profiles : {};
        const now = Date.now();

        profiles[String(profileIndex)] = {
            profileIndex,
            updatedAt: new Date(now).toISOString(),
            lastModified: now,
            appData: getProfileScopedAppData(profileIndex)
        };

        await putCloudBin({ ...cloudRecord, version: 1, profiles, updatedAt: new Date(now).toISOString() });
        setLocalProfileUpdatedAt(profileIndex, now);
        lastSyncTimestamp = now;
        lastKnownServerTimestamp = now;
        cloudUnsyncedChanges = false;
        cloudMigrationPendingProfiles.delete(profileIndex);
        updateCloudSyncIndicator('online', 'Conectado');
        updateSyncButtonState('synced', 'Sincronizar');
        isOfflineMode = false;
        return true;
    } catch (error) {
        console.error('Cloud save error:', error);
        persistPartitionedData();
        isOfflineMode = true;
        updateCloudSyncIndicator('offline', 'Offline');
        updateSyncButtonState('error', 'Error');
        return false;
    }
}

async function applyServerProfile(profileIndex, cloudProfile, { refreshUI = true } = {}) {
    applyProfileData(profileIndex, cloudProfile.appData);
    persistPartitionedData();
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

    if (cloudSyncInProgress) return { status: 'busy' };
    cloudSyncInProgress = true;
    updateSyncButtonState('syncing', 'Sincronizando...');

    try {
        const localData = getProfileScopedAppData(profileIndex);
        const localTimestamp = getLocalProfileUpdatedAt(profileIndex);
        const cloudRecord = await fetchCloudBin();
        const profiles = (cloudRecord.profiles && typeof cloudRecord.profiles === 'object') ? cloudRecord.profiles : {};
        const cloudProfile = profiles[String(profileIndex)] || null;

        isOfflineMode = false;

        if (!cloudProfile) {
            if (hasProfileLocalData(profileIndex)) {
                cloudMigrationPendingProfiles.add(profileIndex);
                const uploaded = await saveToCloud(profileIndex);
                if (uploaded && !silent) showAutosave('Sincronización inicial completada', 'saved');
                return { status: uploaded ? 'uploaded' : 'error' };
            }
            updateSyncButtonState('synced', 'Sincronizar');
            updateCloudSyncIndicator('online', 'Conectado');
            return { status: 'noop' };
        }

        const serverTimestamp = Number.parseInt(cloudProfile.lastModified || '0', 10) || Date.parse(cloudProfile.updatedAt || '') || 0;
        lastKnownServerTimestamp = serverTimestamp;
        const bothModified = localTimestamp > lastSyncTimestamp && serverTimestamp > lastSyncTimestamp && localTimestamp !== serverTimestamp;

        if (bothModified && !forceApplyRemote) {
            const choice = allowRemotePrompt ? await openSyncConflictModal() : 'server';
            if (choice === 'local') {
                const ok = await saveToCloud(profileIndex);
                if (!silent && ok) showAutosave('Cambios locales sincronizados', 'saved');
                return { status: ok ? 'uploaded' : 'error' };
            }
            await applyServerProfile(profileIndex, cloudProfile, { refreshUI: true });
            if (!silent) showAutosave('Cambios del servidor aplicados', 'info');
            return { status: 'downloaded' };
        }

        if (serverTimestamp > localTimestamp || forceApplyRemote) {
            const remoteCount = countMessagesInProfile(cloudProfile.appData);
            const localCount = countMessagesInProfile(localData);

            if (silent && allowRemotePrompt && remoteCount > localCount) {
                pendingRemoteProfileData = cloudProfile;
                pendingRemoteTimestamp = serverTimestamp;
                updateSyncButtonState('pending-download', 'Descargar');
                updateCloudSyncIndicator('degraded', 'Cambios remotos');
                showSyncToast('Hay mensajes nuevos', 'Ver ahora', async () => {
                    await applyServerProfile(profileIndex, pendingRemoteProfileData, { refreshUI: true });
                });
                return { status: 'remote-pending' };
            }

            await applyServerProfile(profileIndex, cloudProfile, { refreshUI: true });
            if (!silent) showAutosave('Cambios sincronizados', 'saved');
            return { status: 'downloaded' };
        }

        if (localTimestamp > serverTimestamp || cloudUnsyncedChanges || cloudMigrationPendingProfiles.has(profileIndex)) {
            updateSyncButtonState('pending-upload', 'Subir cambios');
            updateCloudSyncIndicator('degraded', 'Pendiente de subida');
            const ok = await saveToCloud(profileIndex);
            if (!silent && ok) showAutosave('Cambios sincronizados', 'saved');
            return { status: ok ? 'uploaded' : 'error' };
        }

        lastSyncTimestamp = Math.max(lastSyncTimestamp, localTimestamp, serverTimestamp);
        updateSyncButtonState('synced', 'Sincronizar');
        updateCloudSyncIndicator('online', 'Conectado');
        return { status: 'noop' };
    } catch (error) {
        console.error('Cloud sync error:', error);
        isOfflineMode = true;
        updateCloudSyncIndicator('offline', 'Offline');
        updateSyncButtonState('error', 'Offline');
        if (!silent) showAutosave('Sin conexión. Continuando en local.', 'info');
        return { status: 'error', error };
    } finally {
        cloudSyncInProgress = false;
    }
}

async function loadFromCloud() {
    const result = await syncBidirectional({ silent: true, allowRemotePrompt: true });
    return result.status !== 'error';
}

function startCloudSync() {
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
