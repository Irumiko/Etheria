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

// ── Sistema de rangos de afinidad con ramas ──────────────────────────────────
//
// Estructura en árbol:
//   Tronco común    → Desconocido (0-15), Conocido (16-35), Amigo (36-60)
//   [bifurcación al llegar a Amigo — el usuario elige la rama]
//   Rama amistad    → Amigo cercano, Confidente, Mejor amigo
//   Rama romance    → Admiración, Afecto, Devoción, Amor profundo
//   Tronco negativo → Tensión (valor negativo, elecciones negativas)
//   Rama rivalidad  → Rivalidad, Rival declarado, Némesis
//   Rama enemistad  → Antipatía, Enemistad, Enemistad profunda
//
// increment: puntos que mueve cada elección (3 bajos, 2 medios, 1 altos)
// bifurcation: true si este rango desbloquea el selector de rama
// La relación es DIRECCIONAL: cada personaje elige su propia percepción.
// ─────────────────────────────────────────────────────────────────────────────
const affinityRanks = [
    // ── Tronco común (siempre unilateral) ────────────────────────
    { name: 'Desconocidos', branch: 'common',     min: 0,    max: 15,  increment: 3, color: '#8e9196', icon: '○' },
    { name: 'Conocidos',    branch: 'common',     min: 16,   max: 35,  increment: 3, color: '#9b59b6', icon: '◎' },
    { name: 'Amigos',       branch: 'common',     min: 36,   max: 60,  increment: 3, color: '#3498db', icon: '✦', bifurcation: true },

    // ── Rama: Amistad ─────────────────────────────────────────────
    // Techo unilateral: Buen amigo — no requiere reciprocidad
    // Techo bilateral:  Mejor amigo — requiere que el otro también esté en rama amistad con value >= 88
    { name: 'Amigo cercano', branch: 'friendship', min: 61,  max: 74,  increment: 2, color: '#2ecc71', icon: '♦' },
    { name: 'Confidente',    branch: 'friendship', min: 75,  max: 87,  increment: 2, color: '#27ae60', icon: '♦♦' },
    { name: 'Buen amigo',    branch: 'friendship', min: 88,  max: 94,  increment: 1, color: '#1e9e55', icon: '♦♦♦',
      unilateralCap: true },   // techo unilateral: no se puede superar sin reciprocidad
    { name: 'Mejor amigo',   branch: 'friendship', min: 95,  max: 100, increment: 1, color: '#1a8a4a', icon: '♦♦♦♦',
      requiresReciprocity: true, reciprocityBranch: 'friendship', reciprocityMin: 88 },

    // ── Rama: Romance ─────────────────────────────────────────────
    // Techo unilateral: Amor platónico — puede quererte sin ser correspondido
    // Techo bilateral:  Amor profundo — requiere que el otro también esté en rama romance con value >= 91
    { name: 'Admiración',    branch: 'romance',    min: 61,  max: 70,  increment: 2, color: '#f39c12', icon: '♡' },
    { name: 'Afecto',        branch: 'romance',    min: 71,  max: 80,  increment: 2, color: '#e67e22', icon: '♡♡' },
    { name: 'Devoción',      branch: 'romance',    min: 81,  max: 90,  increment: 1, color: '#e74c3c', icon: '♥' },
    { name: 'Amor platónico', branch: 'romance',   min: 91,  max: 95,  increment: 1, color: '#c0392b', icon: '♥♥',
      unilateralCap: true },   // techo unilateral
    { name: 'Amor profundo',  branch: 'romance',   min: 96,  max: 100, increment: 1, color: '#922b21', icon: '♥♥♥',
      requiresReciprocity: true, reciprocityBranch: 'romance', reciprocityMin: 91 },

    // ── Tronco negativo (siempre unilateral) ─────────────────────
    { name: 'Tensión',       branch: 'negative',   min: -20, max: -1,  increment: 3, color: '#e67e22', icon: '⚡' },

    // ── Rama: Rivalidad (toda unilateral — la hostilidad no necesita ser mutua) ──
    { name: 'Rivalidad',       branch: 'rivalry',  min: -50, max: -21, increment: 2, color: '#d35400', icon: '⚔' },
    { name: 'Rival declarado', branch: 'rivalry',  min: -75, max: -51, increment: 2, color: '#e74c3c', icon: '⚔⚔' },
    { name: 'Némesis',         branch: 'rivalry',  min: -100,max: -76, increment: 1, color: '#c0392b', icon: '⚔⚔⚔' },

    // ── Rama: Enemistad (toda unilateral) ────────────────────────
    { name: 'Antipatía',          branch: 'enmity', min: -50, max: -21, increment: 2, color: '#7f8c8d', icon: '✗' },
    { name: 'Enemistad',          branch: 'enmity', min: -75, max: -51, increment: 2, color: '#566573', icon: '✗✗' },
    { name: 'Enemistad profunda',  branch: 'enmity', min: -100,max: -76, increment: 1, color: '#2c3e50', icon: '✗✗✗' },
];

// ── Configuración del sistema de ciclos ──────────────────────────────────────
const CYCLE_CONFIG = {
    DURATION_HOURS:          72,   // horas hasta cierre automático del ciclo
    MAX_PARTICIPANTS:         5,
    BIFURCATION_MIN:         36,   // value >= 36 desbloquea el selector de rama
    NEGATIVE_THRESHOLD:      -1,   // value < 0 entra en tronco negativo
    NEGATIVE_BRANCH_UNLOCK: -21,   // value <= -21 bifurca rivalidad/enemistad
};

// Helper: dado un valor y un relation_type, devuelve el rank correcto.
// Reemplaza la antigua getAffinityRankInfo(value) — ahora acepta relationType.
// Retrocompatible: si no se pasa relationType, funciona igual que antes.
function getAffinityRankInfo(value, relationType) {
    const v   = Number(value) || 0;
    const rel = relationType || 'undefined';

    if (v < 0) {
        if (v >= CYCLE_CONFIG.NEGATIVE_THRESHOLD) {
            return affinityRanks.find(r => r.branch === 'negative');
        }
        const negBranch = (rel === 'enmity') ? 'enmity' : 'rivalry';
        const neg = affinityRanks.filter(r => r.branch === negBranch);
        return neg.find(r => v >= r.min && v <= r.max) || neg[0];
    }

    // Tronco común
    const common = affinityRanks.filter(r => r.branch === 'common');
    const inCommon = common.find(r => v >= r.min && v <= r.max);
    if (inCommon) return inCommon;

    // Rama positiva (solo si ya se eligió)
    if (rel === 'undefined') return common[common.length - 1];
    const branch = affinityRanks.filter(r => r.branch === rel);

    // Si el rango exacto requiere reciprocidad y no se tiene, devolver el techo unilateral
    const exact = branch.find(r => v >= r.min && v <= r.max);
    if (exact?.requiresReciprocity) {
        // getAffinityRankInfo no tiene acceso al valor del otro personaje aquí —
        // la comprobación de reciprocidad se hace en getAffinityRankInfoWithReciprocity.
        // Por defecto devolvemos el rango unilateral cap si existe, o el exact.
        const cap = branch.find(r => r.unilateralCap);
        return cap || exact;
    }
    return exact || branch[branch.length - 1];
}

// Versión extendida que comprueba reciprocidad.
// otherValue: valor de afinidad del otro personaje hacia este
// otherRelationType: relation_type del otro personaje
function getAffinityRankInfoWithReciprocity(value, relationType, otherValue, otherRelationType) {
    const v   = Number(value) || 0;
    const rel = relationType || 'undefined';

    if (v < 0 || rel === 'undefined') return getAffinityRankInfo(value, relationType);

    const branch = affinityRanks.filter(r => r.branch === rel);
    const exact  = branch.find(r => v >= r.min && v <= r.max);
    if (!exact) return branch[branch.length - 1];

    // Si requiere reciprocidad, comprobar si el otro la cumple
    if (exact.requiresReciprocity) {
        const otherV   = Number(otherValue) || 0;
        const otherRel = otherRelationType || 'undefined';
        const hasReciprocity = otherRel === exact.reciprocityBranch
            && otherV >= (exact.reciprocityMin || 0);
        if (!hasReciprocity) {
            // Devolver el techo unilateral en su lugar
            const cap = branch.find(r => r.unilateralCap);
            return cap || branch.find(r => !r.requiresReciprocity && r.min <= v) || exact;
        }
    }
    return exact;
}

window.getAffinityRankInfoWithReciprocity = getAffinityRankInfoWithReciprocity;

// Helper: ¿está en el punto de bifurcación positiva?
function isAtBifurcationPoint(value, relationType) {
    return Number(value) >= CYCLE_CONFIG.BIFURCATION_MIN && (!relationType || relationType === 'undefined');
}

// Helper: ¿está en el punto de bifurcación negativa?
function isAtNegativeBifurcation(value, relationType) {
    return Number(value) <= CYCLE_CONFIG.NEGATIVE_BRANCH_UNLOCK && (!relationType || relationType === 'undefined');
}

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

// userNames eliminado — la autenticación es via Supabase Auth.
let currentUserIndex = 0;
let appData = {
    topics: [],
    characters: [],
    messages: {},
    affinities: {},
    favorites: {},
    journals: {},
    cloudProfiles: [],   // Perfiles globales de Supabase (no persisten en local)
    cloudCharacters: {}, // Personajes de Supabase por profileId: { [profileId]: Array }
    stories: []          // Historias de Supabase (cargadas en memoria)
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
let currentTopicMode = 'roleplay'; // 'roleplay' o 'rpg'
let spriteModeClassic = false; // false = modo rpg persistente, true = modo clásico
let oracleModeActive = false; // true cuando el oráculo está activo en el panel de respuesta
let pendingRoleTopicId = null;
let tooltipRoot = null;
let lastFocusedElement = null;
let touchStartX = 0;
let touchStartY = 0;
let gallerySearchDebounceTimer = null;
let galleryImageObserver = null;
let historyVirtualState = null;
let pendingRoomInviteId = null;
let currentStoryId = null;           // UUID de la historia activa en Supabase
let currentStoryParticipants = [];   // Participantes de la historia activa
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
// Persistencia gestionada íntegramente por Supabase.
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

