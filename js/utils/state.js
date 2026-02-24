// Archivo de estado global (variables y configuración base).
// ============================================
// DATA/STATE.JS
// ============================================
// Este archivo contiene los datos base y el estado global de la aplicación.
// Si quieres cambiar nombres por defecto, claves de guardado o ajustes iniciales,
// este es el lugar correcto.

// ============================================
// DATOS Y CONFIGURACIÓN
// ============================================
const alignments = {
    'LB': 'Legal Bueno', 'LN': 'Legal Neutral', 'LM': 'Legal Malvado',
    'NB': 'Neutral Bueno', 'NN': 'Neutral Neutral', 'NM': 'Neutral Malvado',
    'CB': 'Caótico Bueno', 'CN': 'Caótico Neutral', 'CM': 'Caótico Malvado'
};

// Sistema de rangos de afinidad - Solo nombres, sin mostrar puntos
const affinityRanks = [
    { name: 'Desconocidos', min: 0, max: 15, increment: 5, color: '#ffffff' },
    { name: 'Conocidos', min: 16, max: 35, increment: 4, color: '#9b59b6' },
    { name: 'Amigos', min: 36, max: 60, increment: 3, color: '#3498db' },
    { name: 'Mejores Amigos', min: 61, max: 80, increment: 2, color: '#27ae60' },
    { name: 'Interés Romántico', min: 81, max: 95, increment: 1, color: '#f1c40f' },
    { name: 'Pareja', min: 96, max: 100, increment: 0.5, color: '#e74c3c' }
];

// Emotes manga con símbolos
const emoteConfig = {
    angry: { symbol: '💢', class: 'emote-angry', name: 'Ira' },
    happy: { symbol: '✨', class: 'emote-happy', name: 'Alegría' },
    shock: { symbol: '💦', class: 'emote-shock', name: 'Sorpresa' },
    sad: { symbol: '💧', class: 'emote-sad', name: 'Tristeza' },
    think: { symbol: '💭', class: 'emote-think', name: 'Pensando' },
    love: { symbol: '💕', class: 'emote-love', name: 'Amor' },
    annoyed: { symbol: '💢', class: 'emote-annoyed', name: 'Frustración' },
    embarrassed: { symbol: '〃', class: 'emote-embarrassed', name: 'Vergüenza' },
    idea: { symbol: '💡', class: 'emote-idea', name: 'Idea' },
    sleep: { symbol: '💤', class: 'emote-sleep', name: 'Sueño' }
};

let userNames = ['Jugador 1', 'Jugador 2', 'Jugador 3'];
let currentUserIndex = 0;
let appData = {
    topics: [],
    characters: [],
    messages: {},
    affinities: {}
};
let currentTopicId = null;
let selectedCharId = null;
let currentSheetCharId = null;
let currentMessageIndex = 0;
let isTyping = false;
let typewriterInterval;
let typewriterSessionId = 0;
let isNarratorMode = false;
let pendingContinuation = null;
let hasUnsavedChanges = false;
let isLoading = false;
let currentFilter = 'none';
let textSpeed = 25;
let currentEditorTab = 'identity';
let editingMessageId = null;
let currentAffinity = 0;
let tempBranches = [];
let currentEmote = null;
let currentWeather = 'none';
let currentTopicMode = 'roleplay'; // 'roleplay' o 'fanfic'
let spriteModeClassic = false; // false = modo fanfic persistente, true = modo clásico
let pendingRoleTopicId = null;
let tooltipRoot = null;
let lastFocusedElement = null;
let touchStartX = 0;
let touchStartY = 0;
let gallerySearchDebounceTimer = null;
let galleryImageObserver = null;
let historyVirtualState = null;
const spritePool = [];
const STORAGE_KEYS = {
    legacy: 'etheria_data',
    topics: 'etheria_topics',
    characters: 'etheria_characters',
    affinities: 'etheria_affinities',
    messageTopics: 'etheria_message_topics',
    topicPrefix: 'etheria_messages_'
};
const LAST_PROFILE_KEY = 'lastProfileId';
const LOCAL_PROFILE_UPDATED_PREFIX = 'etheria_profile_updated_';
const AUTO_SYNC_INTERVAL = 30000;
const OFFLINE_SYNC_INTERVAL = 60000;
const JSONBIN_CONFIG = {
    apiKey: '$2a$10$n2fNlNcZYCvkUIkDlR5Z5OSoAJerLFfMYWGdxbVZDrSSHpLhgMzay',
    binId: '6999c9aed0ea881f40ccab53',
    baseUrl: 'https://api.jsonbin.io/v3/b'
};
let cloudSyncStatus = 'idle';
let cloudSyncInterval = null;
let cloudSyncInProgress = false;
let cloudUnsyncedChanges = false;
let lastSyncTimestamp = 0;
let lastKnownServerTimestamp = 0;
let pendingRemoteProfileData = null;
let pendingRemoteTimestamp = 0;
let isOfflineMode = false;
const cloudMigrationPendingProfiles = new Set();
