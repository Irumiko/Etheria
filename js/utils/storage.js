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
