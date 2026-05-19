<<<<<<<< HEAD:js/ui/vn-sprites.js
let spriteIntersectionObserver = null;
const trackedSpriteObjectUrls = new Set();
let replyDrawerExpanded = false;
let replyDrawerBound = false;
let vnMobileFabBound = false;

function hasCoarsePointer() {
    return typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches;
}

function isNarrowScreen() {
    return typeof window !== 'undefined' && window.innerWidth <= 768;
}

function shouldUseMobileDrawer() {
    return hasCoarsePointer() || isNarrowScreen();
}

function ensureSpriteLazyObserver() {
    if (spriteIntersectionObserver || typeof IntersectionObserver === 'undefined') return spriteIntersectionObserver;
    spriteIntersectionObserver = new IntersectionObserver((entries, observer) => {
        entries.forEach((entry) => {
            if (!entry.isIntersecting) return;
            const img = entry.target;
            const fullSrc = img?.dataset?.src;
            const thumbSrc = img?.dataset?.thumb;
            if (thumbSrc || fullSrc) {
                img.classList.add('is-loading');
                img.onload = () => {
                    img.classList.remove('is-loading');
                    const finalSrc = img?.dataset?.src;
                    if (finalSrc && img.src !== finalSrc) {
                        const fullImage = new Image();
                        fullImage.decoding = 'async';
                        fullImage.loading = 'eager';
                        fullImage.fetchPriority = 'high';
                        fullImage.onload = () => {
                            img.src = finalSrc;
                            delete img.dataset.src;
                        };
                        fullImage.src = finalSrc;
                    } else if (finalSrc && img.src === finalSrc) {
                        delete img.dataset.src;
                    }
                    delete img.dataset.thumb;
                };
                img.onerror = () => img.classList.remove('is-loading');
                img.src = thumbSrc || fullSrc;
            }
            observer.unobserve(img);
        });
    }, { root: document.getElementById('vnSection') || null, threshold: 0.1 });
    return spriteIntersectionObserver;
}



function trackSpriteObjectUrl(url) {
    if (!url || typeof url !== 'string') return;
    if (!url.startsWith('blob:')) return;
    trackedSpriteObjectUrls.add(url);
}

function revokeTrackedSpriteObjectUrl(url) {
    if (!url || !trackedSpriteObjectUrls.has(url)) return;
    try {
        URL.revokeObjectURL(url);
    } catch (error) {
        window.EtheriaLogger?.debug('vn:resources', 'revokeObjectURL failed:', error?.message || error);
    }
    trackedSpriteObjectUrls.delete(url);
}

function cleanupVnRuntimeResources(options = {}) {
    const { disconnectObserver = false, clearSpritePool = false, stopSpriteBlink = false } = options;
    const container = document.getElementById('vnSpriteContainer');
    if (container) {
        container.querySelectorAll('img').forEach((img) => {
            if (spriteIntersectionObserver) spriteIntersectionObserver.unobserve(img);
            revokeTrackedSpriteObjectUrl(img.currentSrc || img.src);
            if (img.dataset?.src) revokeTrackedSpriteObjectUrl(img.dataset.src);
            if (img.dataset?.thumb) revokeTrackedSpriteObjectUrl(img.dataset.thumb);
            img.onload = null;
            img.onerror = null;
            delete img.dataset.src;
            delete img.dataset.thumb;
        });
    }

    if (disconnectObserver && spriteIntersectionObserver) {
        spriteIntersectionObserver.disconnect();
        spriteIntersectionObserver = null;
    }

    if (stopSpriteBlink && spriteBlinkTimer) {
        clearTimeout(spriteBlinkTimer);
        spriteBlinkTimer = null;
    }

    if (clearSpritePool) {
        spritePool.length = 0;
    }

    if (disconnectObserver || clearSpritePool) {
        Array.from(trackedSpriteObjectUrls).forEach((url) => revokeTrackedSpriteObjectUrl(url));
    }
}

if (typeof window !== 'undefined') {
    window.cleanupVnRuntimeResources = cleanupVnRuntimeResources;
}

function queueSpriteImageLoad(img, sourceSet) {
    if (!img) return;
    const fullSrc = typeof sourceSet === 'string' ? sourceSet : sourceSet?.full;
    const thumbSrc = typeof sourceSet === 'object' ? sourceSet?.thumb : null;
    const placeholderSrc = typeof sourceSet === 'object' ? sourceSet?.placeholder : null;
    trackSpriteObjectUrl(fullSrc);
    trackSpriteObjectUrl(thumbSrc);
    trackSpriteObjectUrl(placeholderSrc);
    if (placeholderSrc) img.src = placeholderSrc;
    img.loading = 'lazy';
    img.decoding = 'async';
    img.fetchPriority = 'low';
    const observer = ensureSpriteLazyObserver();
    if (!observer) {
        img.src = thumbSrc || fullSrc;
        if (thumbSrc && fullSrc && thumbSrc !== fullSrc) {
            const fullImage = new Image();
            fullImage.decoding = 'async';
            fullImage.onload = () => { img.src = fullSrc; };
            fullImage.src = fullSrc;
        }
        return;
    }
    if (!placeholderSrc) img.removeAttribute('src');
    if (thumbSrc && thumbSrc !== fullSrc) img.dataset.thumb = thumbSrc;
    if (fullSrc) img.dataset.src = fullSrc;
    observer.observe(img);
}

function setReplyDrawerExpanded(expanded) {
    const panel = document.getElementById('vnReplyPanel');
    if (!panel) return;
    replyDrawerExpanded = !!expanded;
    triggerSubtleHaptic();
    panel.classList.toggle('drawer-expanded', replyDrawerExpanded);
    panel.classList.toggle('drawer-collapsed', !replyDrawerExpanded);
}

function updateVnMobileFabVisibility() {
    const fab = document.getElementById('vnMobileFabNav');
    const panel = document.getElementById('vnReplyPanel');
    const vnSection = document.getElementById('vnSection');
    if (!fab) return;
    const panelOpen = panel?.style.display === 'flex';
    const active = vnSection?.classList.contains('active');
    const show = active && shouldUseMobileDrawer() && !panelOpen;
    fab.style.display = show ? 'flex' : 'none';

    if (!vnMobileFabBound) {
        vnMobileFabBound = true;
        let _resizeDebounce = null;
        const debouncedUpdate = () => {
            clearTimeout(_resizeDebounce);
            _resizeDebounce = setTimeout(updateVnMobileFabVisibility, 120);
        };
        window.addEventListener('resize', debouncedUpdate, { passive: true });
        // Actualizar también al cambiar orientación (móvil)
        window.addEventListener('orientationchange', () => {
            setTimeout(updateVnMobileFabVisibility, 200);
        }, { passive: true });
    }
}

function bindReplyDrawerGestures() {
    if (replyDrawerBound) return;
    const handle = document.getElementById('replyDrawerHandle');
    if (!handle) return;

    let startY = 0;
    let dragging = false;

    const onStart = (clientY) => {
        dragging = true;
        startY = clientY;
    };

    const onEnd = (clientY) => {
        if (!dragging) return;
        dragging = false;
        const delta = clientY - startY;
        if (Math.abs(delta) < 24) return;
        if (delta < 0) setReplyDrawerExpanded(true);
        else setReplyDrawerExpanded(false);
    };

    handle.addEventListener('touchstart', (e) => {
        if (!shouldUseMobileDrawer()) return;
        if (e.touches.length !== 1) return;
        onStart(e.touches[0].clientY);
    }, { passive: true });

    handle.addEventListener('touchend', (e) => {
        if (!shouldUseMobileDrawer()) return;
        if (e.changedTouches.length !== 1) return;
        onEnd(e.changedTouches[0].clientY);
    }, { passive: true });

    handle.addEventListener('pointerdown', (e) => {
        if (!shouldUseMobileDrawer()) return;
        onStart(e.clientY);
    });

    handle.addEventListener('pointerup', (e) => {
        if (!shouldUseMobileDrawer()) return;
        onEnd(e.clientY);
    });

    replyDrawerBound = true;
}


let remoteTypingState = {};
let typingUiLastPaint = 0;
let typingIdleTimer = null;
let typingEmitTimer = null;
let continuousReadEnabled = false;
let continuousReadDelaySec = 4;
let continuousReadTimer = null;
let continuousReadStartedAt = 0;
let continuousReadAutoStopTimer = null;
let continuousLastInteractionAt = Date.now();
let spritePointerBound = false;
let spriteBlinkTimer = null;

function updateTypingIndicatorUi(force = false) {
    const now = Date.now();
    if (!force && now - typingUiLastPaint < 1000) return;
    typingUiLastPaint = now;
    const indicator = document.getElementById('vnTypingIndicator');
    if (!indicator) return;
    if (document.hidden) {
        indicator.style.display = 'none';
        return;
    }
    const active = Object.values(remoteTypingState || {}).some((entry) => entry && entry.active && now - (entry.ts || 0) < 5000);
    indicator.style.display = active ? 'inline-flex' : 'none';
}

function clearTypingState() {
    remoteTypingState = {};
    if (typingIdleTimer) clearTimeout(typingIdleTimer);
    if (typingEmitTimer) clearTimeout(typingEmitTimer);
    typingIdleTimer = null;
    typingEmitTimer = null;
    updateTypingIndicatorUi(true);
}

function emitTypingState(active) {
    if (!currentTopicId || typeof SupabaseMessages === 'undefined' || typeof SupabaseMessages.sendTyping !== 'function') return;
    const char = appData.characters.find(c => c.id === selectedCharId);
    SupabaseMessages.sendTyping(currentTopicId, {
        active,
        userIndex: currentUserIndex,
        characterId: selectedCharId || null,
        name: char?.name || null
    }).catch(() => {});
}

function bindReplyTypingEmitter() {
    const input = document.getElementById('vnReplyText');
    if (!input || input.dataset.typingBound) return;
    input.dataset.typingBound = '1';
    input.addEventListener('input', () => {
        if (document.hidden) return;
        if (typingEmitTimer) clearTimeout(typingEmitTimer);
        typingEmitTimer = setTimeout(() => emitTypingState(true), 300);
        if (typingIdleTimer) clearTimeout(typingIdleTimer);
        typingIdleTimer = setTimeout(() => emitTypingState(false), 5000);
    });
}

function markContinuousInteraction() {
    continuousLastInteractionAt = Date.now();
}

function cancelContinuousRead(reason = '') {
    if (continuousReadTimer) clearTimeout(continuousReadTimer);
    continuousReadTimer = null;
}

function shouldPauseContinuousRead(msg) {
    if (!continuousReadEnabled) return true;
    if (document.hidden) return true;
    if (document.activeElement && ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName)) return true;
    const panel = document.getElementById('vnReplyPanel');
    if (panel?.style.display === 'flex') return true;
    if (msg?.options?.length) return true;
    if (msg?.oracle) return true;
    return false;
}

function scheduleContinuousReadIfNeeded(msg) {
    cancelContinuousRead();
    if (shouldPauseContinuousRead(msg)) return;
    const msgs = getTopicMessages(currentTopicId);
    if (!Array.isArray(msgs) || currentMessageIndex >= msgs.length - 1) return;

    continuousReadStartedAt = Date.now();
    continuousReadTimer = setTimeout(() => {
        if (Date.now() - continuousLastInteractionAt > 30000) {
            continuousReadEnabled = false;
            localStorage.setItem('etheria_continuous_read', '0');
            const cb = document.getElementById('optContinuousRead');
            if (cb) cb.checked = false;
            showAutosave('Lectura continua pausada por inactividad', 'info');
            cancelContinuousRead('autostop');
            return;
        }
        if (shouldPauseContinuousRead(msg)) return;
        nextMessage();
    }, Math.max(3000, Math.min(5000, Number(continuousReadDelaySec) * 1000)));
}

function bindSpriteMicroInteractions() {
    if (spritePointerBound) return;
    const container = document.getElementById('vnSpriteContainer');
    if (!container) return;

    if (window.matchMedia && window.matchMedia('(hover: hover)').matches) {
        container.addEventListener('pointermove', (e) => {
            const sprites = Array.from(container.querySelectorAll('.vn-sprite.active'));
            if (!sprites.length) return;
            let nearest = null;
            let minDist = Infinity;
            sprites.forEach((sprite) => {
                const rect = sprite.getBoundingClientRect();
                const cx = rect.left + rect.width / 2;
                const cy = rect.top + rect.height / 2;
                const d = Math.hypot(e.clientX - cx, e.clientY - cy);
                if (d < minDist) {
                    minDist = d;
                    nearest = sprite;
                }
            });
            sprites.forEach((sprite) => sprite.classList.remove('hover-near'));
            if (nearest && minDist < 180) nearest.classList.add('hover-near');
        }, { passive: true });
        container.addEventListener('pointerleave', () => {
            container.querySelectorAll('.vn-sprite.hover-near').forEach((el) => el.classList.remove('hover-near'));
        }, { passive: true });
    }

    container.addEventListener('touchstart', (e) => {
        const sprite = e.target.closest('.vn-sprite');
        if (!sprite) return;
        sprite.classList.add('focus-pop');
        setTimeout(() => sprite.classList.remove('focus-pop'), 220);
    }, { passive: true });

    spritePointerBound = true;
}

function scheduleRandomSpriteBlink() {
    if (spriteBlinkTimer) clearTimeout(spriteBlinkTimer);
    const profile = applySpriteAnimationProfile();
    if (profile.lite) return;

    const delay = 8000 + Math.random() * 4000;
    spriteBlinkTimer = setTimeout(() => {
        const activeSprites = Array.from(document.querySelectorAll('#vnSpriteContainer .vn-sprite.active'));
        if (activeSprites.length) {
            const sprite = activeSprites[Math.floor(Math.random() * activeSprites.length)];
            sprite.classList.add('sprite-blink');
            setTimeout(() => sprite.classList.remove('sprite-blink'), 220);
        }
        scheduleRandomSpriteBlink();
    }, delay);
}


function triggerSubtleHaptic() {
    if (typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') return;
    if (localStorage.getItem('etheria_haptics_enabled') === '0') return;
    if (typeof prefersReducedMotion === 'function' && prefersReducedMotion()) return;
    if (!(window.matchMedia && window.matchMedia('(pointer: coarse)').matches)) return;
    navigator.vibrate(10);
}

function isLowPowerDevice() {
    const cores = Number(navigator?.hardwareConcurrency || 8);
    return cores <= 4;
}

function applySpriteAnimationProfile() {
    const reduced = typeof prefersReducedMotion === 'function' && prefersReducedMotion();
    const lite = reduced || isLowPowerDevice();
    document.documentElement.style.setProperty('--sprite-breathing-duration', lite ? '6s' : '4s');
    return { lite, reduced };
}

function isDefaultTopicBackground(backgroundPath) {
    const normalized = (backgroundPath || "").trim().toLowerCase();
    if (!normalized) return true;
    return LEGACY_DEFAULT_TOPIC_BACKGROUNDS.some(path => normalized === path.toLowerCase());
}

function resolveTopicBackgroundPath(backgroundPath = '') {
    const topicBackground = String(backgroundPath || '').trim();
    if (!topicBackground) return DEFAULT_TOPIC_BACKGROUND;

    const normalizedPath = topicBackground.replace(/^\/+/, '');
    return isDefaultTopicBackground(normalizedPath) ? DEFAULT_TOPIC_BACKGROUND : topicBackground;
}

function getBackgroundCandidates(path) {
    const normalizedPath = String(path || '').trim();
    if (!normalizedPath) return [];

    const isAbsoluteUrl = /^(?:[a-z]+:)?\/\//i.test(normalizedPath);
    const isSpecialUri = /^(?:data:|blob:)/i.test(normalizedPath);
    if (isAbsoluteUrl || isSpecialUri) return [normalizedPath];

    const withoutLeadingSlash = normalizedPath.replace(/^\/+/, '');
    const withLeadingSlash = `/${withoutLeadingSlash}`;

    if (DEFAULT_TOPIC_BACKGROUND_VARIANTS.includes(normalizedPath)) {
        return [...new Set(DEFAULT_TOPIC_BACKGROUND_VARIANTS)];
    }

    if (normalizedPath.startsWith('/')) {
        return [...new Set([normalizedPath, withoutLeadingSlash])];
    }

    return [...new Set([normalizedPath, withLeadingSlash])];
}

function preloadBackgroundImage(path) {
    const normalizedPath = (path || '').trim();
    if (!normalizedPath || preloadedBackgrounds.has(normalizedPath)) {
        return Promise.resolve(true);
    }

    return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
            preloadedBackgrounds.add(normalizedPath);
            resolve(true);
        };
        img.onerror = () => resolve(false);
        img.src = normalizedPath;
    });
}

async function resolveFirstAvailableBackground(path) {
    const candidates = getBackgroundCandidates(path);
    if (!candidates.length) return '';

    for (const candidate of candidates) {
        const loaded = await preloadBackgroundImage(candidate);
        if (loaded) return candidate;
    }

    return candidates[0];
}

function applyTopicBackground(vnSection, backgroundPath) {
    if (!vnSection) return;

    const sceneBackgroundPath = resolveTopicBackgroundPath(backgroundPath);
    const pendingBackgroundToken = `${sceneBackgroundPath}|${Date.now()}|${Math.random()}`;
    vnSection.dataset.pendingBackgroundToken = pendingBackgroundToken;

    const gradient = 'linear-gradient(135deg, rgba(20,15,40,1) 0%, rgba(50,40,80,1) 100%)';
    if (!sceneBackgroundPath) {
        vnSection.style.backgroundImage = gradient;
        return;
    }

    resolveFirstAvailableBackground(sceneBackgroundPath).then((resolvedPath) => {
        if (vnSection.dataset.pendingBackgroundToken !== pendingBackgroundToken) return;
        const sceneBackgroundLayer = `url(${escapeHtml(resolvedPath || sceneBackgroundPath)})`;
        vnSection.style.backgroundImage = `${sceneBackgroundLayer}, ${gradient}`;
    });
}

// ── Listener EventBus: vn:background-changed ─────────────────────────────────
// RPGRenderer emite este evento cuando una escena RPG necesita cambiar el fondo.
// vn.js es el único módulo que puede llamar applyTopicBackground — este listener
// es el punto de entrada desde el exterior sin cruzar capas.
(function _initVnBackgroundListener() {
    if (window._vnBackgroundListenerReady) return;
    window._vnBackgroundListenerReady = true;
    if (typeof eventBus !== 'undefined') {
        eventBus.on('vn:background-changed', function(data) {
            if (!data || !data.asset) return;
            const vnSection = document.getElementById('vnSection');
            if (!vnSection) return;
            applyTopicBackground(vnSection, data.asset);
        });
    }
})();

function preloadTopicBackgrounds() {
    const topicBackgrounds = (appData?.topics || []).map(topic => resolveTopicBackgroundPath(topic.background));
    const uniqueBackgrounds = new Set([...topicBackgrounds, ...DEFAULT_TOPIC_BACKGROUND_VARIANTS].filter(Boolean));
    uniqueBackgrounds.forEach((path) => {
        getBackgroundCandidates(path).forEach(candidate => preloadBackgroundImage(candidate));
    });
}

function playVnSceneTransition(vnSection) {
    const el = document.getElementById('vnSceneTransition');
    if (!el) return;
    el.classList.remove('active', 'wipe');
    void el.offsetWidth; // forzar reflow para reiniciar animación
    el.classList.add('active');
    setTimeout(() => el.classList.remove('active'), 800);

    // Parallax suave del fondo al cambiar escena
    const section = vnSection || document.getElementById('vnSection');
    if (section && !prefersReducedMotion()) {
        section.classList.remove('scene-change-anim');
        void section.offsetWidth;
        section.classList.add('scene-change-anim');
        setTimeout(() => section.classList.remove('scene-change-anim'), 700);
    }
}

// ── Helpers de entrada a tema ─────────────────────────────────────────────────
// Extraídos de enterTopic() para separar responsabilidades por modo.
// Solo se usan desde enterTopic — prefijo _ indica uso interno.
//
// Candidatos a moverse a js/ui/vn-mode.js cuando vn.js vuelva a crecer:
//   _resolveCharacterForMode   → selección de personaje según modo
//   _applyModeClasses          → CSS classes rpg/classic en vnSection y body
//   _maybeOpenRpgStatsModal    → RPG-only: auto-open stats la primera vez

// Selecciona el personaje según el modo del topic.
// Devuelve false si se abre un modal y enterTopic debe abortar.
function _resolveCharacterForMode(t, id, topicMode) {
    // Buscar lock universal (characterLocks tiene prioridad sobre campos legacy)
    const lockedCharId = getTopicLockedCharacterId(t);

    if (lockedCharId) {
        const lockedChar = appData.characters.find(c =>
            String(c.id) === String(lockedCharId) && c.userIndex === currentUserIndex
        );
        if (lockedChar) {
            selectedCharId = lockedChar.id;
            if (typeof syncVnStore === 'function') syncVnStore({ selectedCharId });
        }
        return true;
    }

    // Sin personaje bloqueado: abrir modal de selección para ambos modos
    const mine = appData.characters.filter(c => c.userIndex === currentUserIndex);
    if (mine.length > 0) {
        openRoleCharacterModal(id, { mode: topicMode, enterOnSelect: true });
        return false;
    }

    // Sin personajes propios: solo puede entrar como Narrador (modo clásico)
    if (topicMode === 'rpg') {
        showAutosave('Necesitas al menos un personaje para modo RPG', 'error');
        return false;
    }
    return true;
}

// Aplica las CSS classes de modo en vnSection y body.
function _applyModeClasses(vnSection, topicMode) {
    // Inyecta el contenedor de esquinas decorativas si aún no existe
    const dbox = vnSection.querySelector('.vn-dialogue-box');
    if (dbox && !dbox.querySelector('.vn-db-corners')) {
        const corners = document.createElement('div');
        corners.className = 'vn-db-corners';
        corners.setAttribute('aria-hidden', 'true');
        corners.innerHTML = '<i></i><i></i><i></i><i></i>';
        dbox.appendChild(corners);
    }

    if (topicMode === 'rpg') {
        vnSection.classList.remove('classic-mode', 'mode-classic');
        vnSection.classList.add('mode-rpg');
        document.body.classList.add('mode-rpg', 'theme-rpg');
        document.body.classList.remove('mode-classic', 'theme-classic');
    } else {
        // Modo clásico: sprites desaparecen al avanzar
        vnSection.classList.add('classic-mode', 'mode-classic');
        vnSection.classList.remove('mode-rpg');
        document.body.classList.remove('mode-rpg', 'theme-rpg');
        document.body.classList.add('mode-classic', 'theme-classic');
    }
}

// Abre automáticamente el modal de stats RPG la primera vez que el jugador
// entra a un topic sin haber gastado ningún punto.
function _maybeOpenRpgStatsModal(topicId) {
    if (currentTopicMode !== 'rpg' || !selectedCharId) return;
    const key = `etheria_stats_prompted_${topicId}_${selectedCharId}`;
    if (localStorage.getItem(key)) return;
    const char = appData.characters.find(c => String(c.id) === String(selectedCharId));
    if (!char || typeof ensureCharacterRpgProfile !== 'function' || typeof getRpgSpentPoints !== 'function') return;
    const profile = ensureCharacterRpgProfile(char, topicId);
    const spent   = getRpgSpentPoints(profile);
    if (spent === 0 && typeof openRpgStatsModal === 'function') {
        localStorage.setItem(key, '1');
        setTimeout(() => {
            eventBus.emit('ui:show-autosave', { text: '⚔️ ¡Distribuye tus 14 puntos de stats para empezar!', state: 'info' });
            openRpgStatsModal(selectedCharId);
        }, 900);
    }
}

function enterTopic(id) {
    if (typeof stopMenuMusic === 'function') stopMenuMusic();

    const t = appData.topics.find(topic => topic.id === id);
    if (!t) return;

    // Guard: sin personaje asignado → modal de selección, sin limpiar estado
    // (evita el flash de pantalla negra antes de que el usuario elija personaje)
    const topicMode = t.mode || 'roleplay';
    const _lockedId = getTopicLockedCharacterId(t);
    const _myChars  = appData.characters.filter(c => c.userIndex === currentUserIndex);

    if (!_lockedId && _myChars.length > 0) {
        // Ningún mode permite responder sin elegir personaje primero.
        // El creator ya lo eligió al crear (openRoleCharacterModal con enterOnSelect),
        // los demás participantes deben elegirlo la primera vez que intenten entrar.
        openRoleCharacterModal(id, { mode: topicMode, enterOnSelect: true });
        return;
    }

    // transición visual absorbida de mejoras.js (Mejora 9)
    fadeTransition(function() { _doEnterTopic(id, t, topicMode); }, 220);
}

function _doEnterTopic(id, t, topicMode) {

    // ── 1. Inicializar estado global del topic ────────────────────────────────
    const _ob = parseInt(localStorage.getItem('etheria_onboarding_step') || '0', 10);
    if (_ob === 2 && typeof maybeShowOnboarding === 'function') {
        setTimeout(maybeShowOnboarding, 800);
    }
    eventBus.emit('ui:reset-vn-state');
    currentTopicId = id;
    if (typeof syncVnStore === 'function') syncVnStore({ topicId: currentTopicId });

    if (typeof CollaborativeGuard !== 'undefined') {
        CollaborativeGuard.init(id, typeof currentUserIndex !== 'undefined' ? currentUserIndex : 0);
    }
    if (typeof SupabaseMessages !== 'undefined' && typeof SupabaseMessages.subscribeGlobal === 'function') {
        SupabaseMessages.subscribeGlobal(null, null, id);
    }
    const _existingMsgs = getTopicMessages(id);
    // Si el tema tiene mensajes, posicionar en el último — no en el primero
    currentMessageIndex = _existingMsgs.length > 0 ? _existingMsgs.length - 1 : 0;
    if (typeof syncVnStore === 'function') syncVnStore({ messageIndex: currentMessageIndex });
    pendingContinuation = null;
    editingMessageId = null;
    if (typeof updateRoomCodeUI === 'function') updateRoomCodeUI(id);

    // ── 2. Establecer modo y resolver personaje ───────────────────────────────
    currentTopicMode = topicMode;
    if (!_resolveCharacterForMode(t, id, topicMode)) return;

    // ── 2b. Sincronizar RPGState desde la ficha del personaje activo ──────────
    // Sincroniza los stats D&D (STR/DEX/CON/INT/WIS/CHA) de la ficha con el motor
    // de escenas JSON (RPGState). Solo en modo RPG y si hay personaje activo.
    if (topicMode === 'rpg' && selectedCharId &&
        typeof RPGState !== 'undefined' &&
        typeof RPGState.syncFromCharacter === 'function') {
        const _activeChar = appData.characters.find(c => String(c.id) === String(selectedCharId));
        if (_activeChar) {
            RPGState.syncFromCharacter(_activeChar, id);
        }
    }

    // ── 3. Aplicar entorno visual (clima, fondo, CSS de modo) ─────────────────
    setWeather(t.weather || 'none');
    const vnSection = document.getElementById('vnSection');
    if (vnSection) {
        applyTopicBackground(vnSection, t.background);
        _applyModeClasses(vnSection, topicMode);
    }

    // ── 4. Activar sección VN en el DOM ──────────────────────────────────────
    // Limpiamos TODAS las secciones activas (no solo topicsSection) para evitar
    // que opciones, galería u otras secciones queden visibles sobre la VN.
    pendingChapter = null;
    document.querySelectorAll('.game-section').forEach(function(s) { s.classList.remove('active'); });
    if (vnSection) {
        vnSection.classList.add('active');
        playVnSceneTransition(vnSection);
    }

    const deleteBtn = document.getElementById('deleteTopicBtn');
    if (deleteBtn) {
        const isOwner = t.createdByIndex === currentUserIndex || t.createdByIndex === undefined || t.createdByIndex === null;
        const deleteSlot = deleteBtn.closest('.vn-control-slot');
        if (isOwner) {
            deleteBtn.classList.remove('hidden');
            if (deleteSlot) deleteSlot.style.display = '';
        } else {
            deleteBtn.classList.add('hidden');
            if (deleteSlot) deleteSlot.style.display = 'none';
        }
    }

    // ── 5. Inicializar UI y controles de lectura ──────────────────────────────
    // Usamos 'init' en vez de 'forward' para que showCurrentMessage aplique
    // el estado visual correcto (fondo, clima) sin auto-abrir el overlay de opciones.
    showCurrentMessage('init');
    updateVnMobileFabVisibility();
    bindReplyTypingEmitter();
    bindSpriteMicroInteractions();
    applySpriteAnimationProfile();
    scheduleRandomSpriteBlink();
    continuousReadEnabled = localStorage.getItem('etheria_continuous_read') === '1';
    continuousReadDelaySec = Math.max(3, Math.min(5, Number(localStorage.getItem('etheria_continuous_delay') || 4)));

    // ── 6. Extras RPG (stats modal, cloud story) ──────────────────────────────
    _maybeOpenRpgStatsModal(id);

    // ── Auto-activar historia en la nube si el topic tiene storyId ──
    // Cuando el topic ya fue creado con cloud sync, el storyId se guardó
    // en el objeto topic. Lo restauramos para que los mensajes usen el
    // story_id correcto en Supabase desde el primer mensaje de esta sesión.
    const _tForStory = appData.topics.find(function(tp) { return String(tp.id) === String(id); });
    if (_tForStory && _tForStory.storyId) {
        global.currentStoryId = _tForStory.storyId;
        // Suscribir al canal realtime de la historia si está disponible
        if (typeof SupabaseStories !== 'undefined' && typeof SupabaseStories.enterStory === 'function') {
            SupabaseStories.enterStory(_tForStory.storyId).catch(function(error) { window.EtheriaLogger?.warn('ui:vn', 'enterStory failed:', error?.message || error); });
        }
        // Cargar reacciones desde Supabase para ver las de todos los usuarios
        if (typeof loadReactionsFromSupabase === 'function') {
            loadReactionsFromSupabase(_tForStory.storyId).catch(() => {});
        }
    } else {
        // Topic sin storyId (creado antes de la integración cloud) — limpiar
        global.currentStoryId = null;
    }
    // ────────────────────────────────────────────────────────────────

    // Carga desde Supabase y suscripción realtime (no bloquea el flujo principal)
    _sbEnterTopic(id);
    
    // Notificar a Ethy que se ha entrado en modo VN
    window.dispatchEvent(new CustomEvent('etheria:section-changed', { 
        detail: { section: 'vn', mode: currentTopicMode } 
    }));

    // Notificar al módulo de presencia/inbox que se ha entrado en un topic
    window.dispatchEvent(new CustomEvent('etheria:topic-enter', { detail: { topicId: id } }));

    // ── Vínculos: crear automáticamente entre todos los participantes ─────────
    // Solo en modo clásico (en RPG no hay sistema de vínculos).
    if (topicMode !== 'rpg' && typeof SupabaseBonds !== 'undefined') {
        const _tBonds = appData.topics.find(tp => String(tp.id) === String(id));
        if (_tBonds) {
            const _locks = { ...(_tBonds.characterLocks || {}), ...(_tBonds.rpgCharacterLocks || {}) };
            const _participantCharIds = Object.values(_locks).filter(Boolean).map(String);
            if (_participantCharIds.length >= 2) {
                const _storyId = _tBonds.storyId || null;
                SupabaseBonds.ensureStoryBonds(_storyId || id, _participantCharIds).catch(() => {});
            }
        }
    }
}

// Memory leak fix: store handler reference so it can be removed before re-adding
let _globalRealtimeHandlerRef = null;

// Fix 10: concurrency guard — prevents duplicate loads on rapid double-click
let _sbEnterInProgress = false;

async function _sbEnterTopic(topicId) {
    // Fix 10: prevent concurrent loads from rapid topic entry
    if (_sbEnterInProgress) return;
    _sbEnterInProgress = true;

    if (typeof SupabaseMessages === 'undefined') { _sbEnterInProgress = false; return; }

    SupabaseMessages.unsubscribe();
    clearTypingState();

    // Cargar historial remoto y fusionar con local por id
    try {
        const remoteMsgs = await SupabaseMessages.load(topicId, global.currentStoryId || null);
        if (Array.isArray(remoteMsgs) && remoteMsgs.length > 0) {
            const localMsgs = getTopicMessages(topicId);
            const localIds  = new Set(localMsgs.map(function (m) { return String(m.id); }));
            const newRemote = remoteMsgs.filter(function (m) { return m.id && !localIds.has(String(m.id)); });

            if (newRemote.length > 0) {
                newRemote.forEach(function (m) { localMsgs.push(m); });
                localMsgs.sort(function (a, b) { return new Date(a.timestamp) - new Date(b.timestamp); });
                appData.messages[topicId] = localMsgs;
                hasUnsavedChanges = true;
                markDirty('messages', topicId); // Fix 9
                save({ silent: true });

                if (currentTopicId === topicId) {
                    currentMessageIndex = localMsgs.length - 1;
                    if (typeof syncVnStore === 'function') syncVnStore({ messageIndex: currentMessageIndex });
                    showCurrentMessage('forward');
                    showSyncToast(newRemote.length + ' mensaje(s) cargado(s) desde la nube', 'OK');
                }
            }
        }
    } catch (e) {
        // Supabase no disponible — el sistema sigue con local
        _sbEnterInProgress = false; // Fix 10: release guard on error path
        return;
    }

    // Suscripción realtime: recibir mensajes del otro jugador en tiempo real
    SupabaseMessages.subscribe(topicId, function (remoteMsg) {
        if (currentTopicId !== topicId) return;
        if (!remoteMsg || !remoteMsg.id) return;

        const msgs = getTopicMessages(topicId);
        const exists = msgs.some(function (m) { return String(m.id) === String(remoteMsg.id); });
        if (exists) return;

        // Fix 4: prefer server-assigned user_id for own-message detection;
        // fall back to client userIndex for backward compat
        const _ownUserId = typeof _cachedUserId !== 'undefined' ? _cachedUserId : null;
        if (_ownUserId && remoteMsg._supabaseUserId && remoteMsg._supabaseUserId === _ownUserId) return;
        if (!_ownUserId && String(remoteMsg.userIndex) === String(currentUserIndex)) return;

        msgs.push(remoteMsg);
        msgs.sort(function (a, b) { return new Date(a.timestamp) - new Date(b.timestamp); });
        appData.messages[topicId] = msgs;
        hasUnsavedChanges = true;
        markDirty('messages', topicId); // Fix 9
        save({ silent: true });

        if (continuousReadEnabled) {
            toggleContinuousReading(false);
        }

        const isAtEnd = currentMessageIndex >= msgs.length - 2;
        if (isAtEnd) {
            currentMessageIndex = msgs.length - 1;
            showCurrentMessage('forward');
            showSyncToast('Nuevo mensaje recibido. Lectura continua pausada.', 'Continuar auto', function () {
                toggleContinuousReading(true);
            });
        } else {
            showSyncToast('Nuevo mensaje recibido', 'Ver ahora', function () {
                currentMessageIndex = msgs.length - 1;
                showCurrentMessage('forward');
            });
        }
    }, function (typingMsg) {
        if (!typingMsg || String(typingMsg.userIndex) === String(currentUserIndex)) return;
        remoteTypingState[String(typingMsg.userIndex)] = { active: !!typingMsg.typing?.active, ts: Date.now() };
        updateTypingIndicatorUi();
        setTimeout(() => updateTypingIndicatorUi(true), 5200);
    }, function () {
        clearTypingState();
    });

    // Escuchar mensajes del canal global (messages-realtime) para el topic activo.
    // Memory leak fix: remove previous handler before registering a new one.
    if (_globalRealtimeHandlerRef) {
        window.removeEventListener('etheria:realtime-message', _globalRealtimeHandlerRef);
        _globalRealtimeHandlerRef = null;
    }
    _globalRealtimeHandlerRef = function (e) {
        const remoteMsg = e.detail?.msg;
        const remoteRow = e.detail?.row;

        // Solo procesar si el mensaje pertenece al topic activo
        if (!remoteMsg || !remoteMsg.id) return;
        if (remoteRow && remoteRow.session_id && String(remoteRow.session_id) !== String(topicId)) return;
        if (currentTopicId !== topicId) return;

        // Si hay historia activa, solo procesar mensajes de esa historia
        if (currentStoryId && remoteRow && remoteRow.story_id && remoteRow.story_id !== currentStoryId) return;

        const msgs = getTopicMessages(topicId);
        const exists = msgs.some(function (m) { return String(m.id) === String(remoteMsg.id); });
        if (exists) return;

        // Fix 4: use server user_id for own-message detection when available
        const _ownId = typeof _cachedUserId !== 'undefined' ? _cachedUserId : null;
        if (_ownId && remoteMsg._supabaseUserId && remoteMsg._supabaseUserId === _ownId) return;
        if (!_ownId && String(remoteMsg.userIndex) === String(currentUserIndex)) return;

        msgs.push(remoteMsg);
        msgs.sort(function (a, b) { return new Date(a.timestamp) - new Date(b.timestamp); });
        appData.messages[topicId] = msgs;
        hasUnsavedChanges = true;
        markDirty('messages', topicId); // Fix 9
        save({ silent: true });

        const isAtEnd = currentMessageIndex >= msgs.length - 2;
        if (isAtEnd) {
            currentMessageIndex = msgs.length - 1;
            showCurrentMessage('forward');
        }
        // Limpiar listener cuando salgamos del topic
        if (currentTopicId !== topicId) {
            window.removeEventListener('etheria:realtime-message', _globalRealtimeHandler);
        }
    };
    window.addEventListener('etheria:realtime-message', _globalRealtimeHandlerRef);

    // Fix 10: release guard so the next enterTopic() call can proceed
    _sbEnterInProgress = false;
}

function stopTypewriter() {
    if (typeof typewriterInterval === 'number') {
        window.cancelAnimationFrame(typewriterInterval);
        clearInterval(typewriterInterval);
        typewriterInterval = null;
    }
    typewriterSessionId++;
    isTyping = false;
    // Resetear opacity inline por si quedó en 0 del modo HTML
    const el = document.getElementById('vnDialogueText');
    if (el && el.style.opacity === '0') {
        el.style.transition = '';
        el.style.opacity = '';
    }
}

function triggerDialogueFadeIn() {
    const dialogueBox = document.querySelector('.vn-dialogue-box');
    if (!dialogueBox) return;
    dialogueBox.classList.remove('fade-in');
    void dialogueBox.offsetWidth;
    dialogueBox.classList.add('fade-in');
}


function detectOracleCategory(question = '', stat = '') {
    const q = String(question || '').toLowerCase();
    const statKey = String(stat || '').toUpperCase();
    if (statKey === 'INT' || /analizar|descifrar|investigar|leer|pensar|recordar/.test(q)) return 'analysis';
    if (statKey === 'STR' || /forzar|romper|empujar|levantar|golpear/.test(q)) return 'force';
    if (statKey === 'AGI' || /esquivar|correr|saltar|huir|sigilo/.test(q)) return 'agility';
    if (statKey === 'VIT' || /resistir|aguantar|soportar|mantener/.test(q)) return 'endurance';
    if (/convencer|negociar|persuadir|mentir|pedir/.test(q)) return 'negotiation';
    return 'generic';
}

function generateConsequence(oracle) {
    // VOZ: El Eco del Destino — teatral, fatalista, segunda persona directa.
    // Metáforas de hilos, sombras, fuego y eco. Nunca certezas — siempre presagios.
    const category = detectOracleCategory(oracle?.question || '', oracle?.stat || '');
    const isSuccess  = (oracle?.result === 'success' || oracle?.result === 'critical');
    const isCritical = oracle?.result === 'critical';
    const isFumble   = oracle?.result === 'fumble';

    const voices = {
        negotiation: {
            cara: isCritical
                ? `*La palabra que pronunciaste atravesó el silencio como una flecha que ya sabía su destino.* El otro hilo cedió — no por convicción, sino porque el tejido lo exigía. **Tu voz fue el fuego esta vez.** Úsala con cuidado.`
                : `*El eco de tus palabras llegó — distorsionado, pero llegó.* La sombra del rechazo retrocedió un paso. **El hilo de la negociación aguantó.** Por ahora. Las promesas tienen su propia gravedad.`,
            cruz: isFumble
                ? `*Tus palabras cayeron como brasas en agua fría.* No solo no convenciste — plantaste una semilla de desconfianza que crecerá en el momento menos oportuno. **El hilo no se tensó. Se enredó.**`
                : `*El eco regresó hueco.* Tus palabras resonaron en el tejido del destino y encontraron una pared. **La sombra del otro no cedió.** Hay puertas que el lenguaje no puede abrir. Esta era una de ellas.`
        },
        force: {
            cara: isCritical
                ? `*El fuego recorrió tus brazos antes de que decidieras actuar.* El obstáculo no solo cedió — desapareció como si nunca hubiera tenido intención de resistir. **Tu sombra aplastó a la suya.**`
                : `*El hilo de tu esfuerzo se tensó hasta casi romperse… y aguantó.* Lo que se interponía cedió, no sin dejar su marca. **El fuego de la fuerza encontró su destino.** El cuerpo recuerda lo que la mente olvida.`,
            cruz: isFumble
                ? `*El fuego giró en tu contra.* El esfuerzo que pusiste se convirtió en el arma del destino contra ti. **La sombra que empujaste te empujó de vuelta, más fuerte.** Algo se rompió — dentro o fuera, aún no sabes cuál.`
                : `*El hilo se aflojó justo cuando más necesitabas que tensara.* La fuerza que invocaste no encontró el ángulo correcto. **El obstáculo permanece. Y ahora sabe que intentaste moverlo.**`
        },
        agility: {
            cara: isCritical
                ? `*Tu sombra se movió antes que tú.* El destino abrió un instante de claridad absoluta — y tu cuerpo lo habitó sin vacilar. **El hilo del peligro pasó rozando. Solo rozando.** Eso no fue suerte. Fue algo más inquietante.`
                : `*El eco de tu movimiento llegó a donde tenía que llegar.* No fue elegante — fue suficiente. **La sombra del obstáculo no te alcanzó.** Por un margen que solo yo contemplé en su totalidad.`,
            cruz: isFumble
                ? `*El hilo que intentabas esquivar se enredó en tus pies.* El movimiento que creías tener se fracturó en el momento crítico. **Tu sombra tropezó con la del destino — y el destino no se disculpa.**`
                : `*Una fracción de segundo. Eso fue lo que faltó.* El fuego del instante se extinguió antes de que pudieras aprovecharlo. **La ventaja se esfumó.** El destino no la desperdicia — la guarda para quien la merezca después.`
        },
        endurance: {
            cara: isCritical
                ? `*El fuego que debería haberte consumido te encontró incombustible.* No resististe el desgaste — lo ignoraste. **Tu sombra permanece entera cuando otras ya serían ceniza.** Ese precio se cobrará más adelante.`
                : `*El hilo de tu resistencia crujió — y aguantó.* No sin coste. El eco del esfuerzo queda grabado en algún lugar que no puedes ver. **Sigues en pie. Eso es suficiente… por ahora.**`,
            cruz: isFumble
                ? `*El fuego te encontró con las defensas caídas.* Lo que creías que podías aguantar resultó ser exactamente lo que no podías. **El hilo cedió en el peor momento.** El desgaste ahora es deuda — y el destino cobra con intereses.`
                : `*La sombra del agotamiento llegó antes que tú.* No puedes resistir lo que ya te habita. **El hilo se aflojó.** El destino lo notó. Y anotó.`
        },
        analysis: {
            cara: isCritical
                ? `*El eco de la verdad regresó nítido, sin distorsión.* Las piezas que estaban dispersas formaron una imagen que nadie más podría haber leído. **Tu sombra tocó el fondo del misterio.** Ahora sabes algo que cambia lo que viene. Témelo o úsalo.`
                : `*El hilo de la comprensión se tendió entre el caos y tu mente.* No todo, pero suficiente. **El fuego de la deducción encendió lo que necesitabas ver.** Hay sombras que siguen sin nombre, pero ya sabes dónde buscarlas.`,
            cruz: isFumble
                ? `*El eco regresó fragmentado — y cada fragmento señala en una dirección diferente.* Creías entender. Ahora entiendes menos que antes, y lo que "sabes" podría ser exactamente lo que alguien quería que creyeras. **El hilo de la verdad se enredó a propósito.**`
                : `*La información fluyó… y se filtró antes de llegar.* Los detalles que buscabas se esconden detrás de otros detalles. **La sombra del conocimiento no alcanzó tu mano.** A veces el destino protege sus secretos con más celo que sus tesoros.`
        },
        generic: {
            cara: isCritical
                ? `*El hilo cantó. El fuego obedeció. La sombra cedió.* El destino no siempre es tan explícito — aprovecha el momento. **Lo que intentabas era posible, y el universo lo confirmó sin ambigüedad.** Aunque eso raramente dura.`
                : `*El eco regresó cargado.* Tu intención encontró el ángulo correcto en el tejido del destino. **El hilo aguantó. Avanzas.** Las sombras no desaparecen — pero, por ahora, se apartan.`,
            cruz: isFumble
                ? `*El eco no regresó.* Lo que enviaste al tejido del destino fue absorbido por algo que no tienes nombre para llamar. **El hilo no crujió — desapareció.** Y las consecuencias de ese vacío ya se están formando en algún lugar que aún no puedes ver.`
                : `*El hilo se aflojó en el momento exacto en que más importaba.* El destino no es cruel — es indiferente, que es peor. **Lo que intentabas no encontró su camino.** Encuentra otro, o espera que el tejido cambie solo.`
        }
    };

    const categoryVoices = voices[category] || voices.generic;
    return categoryVoices[isSuccess ? 'cara' : 'cruz'];
}

function showCurrentMessage(direction = 'forward') {
    const msgs = getTopicMessages(currentTopicId);

    const dialogueText = document.getElementById('vnDialogueText');

    if (msgs.length === 0) {
        if (dialogueText) dialogueText.innerHTML = '<em>Historia vacía. Haz clic en 💬 Responder para comenzar.</em>';
        const editBtn = document.getElementById('editMsgBtn');
        if (editBtn) editBtn.classList.add('hidden');
        updateAffinityDisplay();
        updateVnTurnBadge();
        renderVnPartyPanel(true);
        return;
    }

    if (currentMessageIndex >= msgs.length) currentMessageIndex = msgs.length - 1;
    if (currentMessageIndex < 0) currentMessageIndex = 0;

    const msg = msgs[currentMessageIndex];
    const namePlate = document.getElementById('vnSpeakerPlate');
    const avatarBox = document.getElementById('vnSpeakerAvatar');

    // Parsear emotes del mensaje
    const { emotes, text: cleanText } = parseEmotes(msg.text);
    const activeEmote = emotes.length > 0 ? emotes[0] : null;

    // Actualizar sprites y mostrar emote
    updateSprites(msg, activeEmote);

    let charExists = true;
    let charData = null;
    if (msg.characterId) {
        charData = appData.characters.find(c => c.id === msg.characterId);
        if (!charData) charExists = false;
    }

    // Aplicar/quitar atributos de modo en la caja de diálogo (anclan estilos CSS)
    const dialogueBox = document.querySelector('.vn-dialogue-box');
    if (dialogueBox) {
        dialogueBox.dataset.garrick  = msg.isGarrick ? 'true' : 'false';
        // data-narrator: true solo para narrador "puro" (no Garrick ni resultado de oráculo)
        const isPureNarrator = !!(msg.isNarrator && !msg.isGarrick && !msg.isOracleResult);
        dialogueBox.dataset.narrator = isPureNarrator ? 'true' : 'false';
    }

    if (msg.isNarrator || !msg.characterId) {
        if (namePlate) {
            if (msg.isGarrick) {
                // Posadero Garrick — nameplate especial
                namePlate.textContent = 'Garrick';
                namePlate.dataset.garrick = 'true';
                namePlate.style.background = 'linear-gradient(135deg, #1c0f04, #3d1e08, #1c0f04)';
                namePlate.style.borderColor = 'rgba(180, 110, 40, 0.6)';
                namePlate.style.color = 'rgba(240, 195, 120, 0.95)';
            } else if (msg.isOracleResult) {
                namePlate.textContent = 'Eco del Destino';
                namePlate.dataset.garrick = 'false';
                namePlate.style.background = 'linear-gradient(135deg, #1a1008, #3a2010)';
                namePlate.style.borderColor = 'rgba(180,130,40,0.6)';
                namePlate.style.color = '';
            } else {
                namePlate.textContent = msg.charName || 'Narrador';
                namePlate.dataset.garrick = 'false';
                namePlate.style.background = 'linear-gradient(135deg, #4a4540, #2a2724)';
                namePlate.style.borderColor = '';
                namePlate.style.color = '';
            }
        }
        if (avatarBox) avatarBox.innerHTML = msg.isGarrick ? '🍺' : (msg.isOracleResult ? '🌀' : '📖');
        const accentColor = msg.isGarrick
            ? 'rgba(160, 100, 40, 0.75)'
            : msg.isOracleResult ? 'rgba(160, 100, 20, 0.7)' : 'rgba(139, 115, 85, 0.6)';
        const accentFull = msg.isGarrick ? '#a06428'
            : msg.isOracleResult ? '#a06414' : '#8b7355';
        document.documentElement.style.setProperty('--char-color', accentColor);
        document.documentElement.style.setProperty('--char-color-full', accentFull);
        const oracleColor = accentColor;
    } else if (!charExists) {
        if (namePlate) {
            namePlate.textContent = msg.charName || 'Desconocido';
            namePlate.style.background = msg.charColor || 'var(--accent-wood)';
        }
        if (avatarBox) {
            // XSS fix: build img via DOM to avoid charName injection in onerror attribute
            if (msg.charAvatar) {
                const _img1 = document.createElement('img');
                _img1.src = msg.charAvatar;
                _img1.alt = 'Avatar de ' + (msg.charName || 'Desconocido');
                _img1.onerror = function () {
                    this.style.display = 'none';
                    this.parentElement.textContent = (msg.charName || '?')[0];
                };
                avatarBox.innerHTML = '';
                avatarBox.appendChild(_img1);
            } else {
                avatarBox.textContent = (msg.charName || '?')[0];
            }
        }
        applyCharColor(msg.charColor);
    } else {
        if (namePlate) {
            namePlate.textContent = msg.charName;
            namePlate.style.background = msg.charColor || 'var(--accent-wood)';
        }
        if (avatarBox) {
            // XSS fix: build img via DOM to avoid charName injection in onerror attribute
            if (msg.charAvatar) {
                const _img2 = document.createElement('img');
                _img2.src = msg.charAvatar;
                _img2.alt = 'Avatar de ' + msg.charName;
                _img2.onerror = function () {
                    this.style.display = 'none';
                    this.parentElement.textContent = (msg.charName || '?')[0];
                };
                avatarBox.innerHTML = '';
                avatarBox.appendChild(_img2);
            } else {
                avatarBox.textContent = (msg.charName || '?')[0];
            }
        }
        applyCharColor(msg.charColor);
    }

    if (avatarBox) avatarBox.classList.toggle('is-speaking', !(msg.isNarrator || !msg.characterId));


    const hasOpt = msg.options && msg.options.length > 0 && msg.selectedOptionIndex === undefined;
    const optionsIndicator = document.getElementById('messageHasOptions');
    if (optionsIndicator) {
        optionsIndicator.classList.toggle('hidden', !hasOpt || isRpgModeMode());
    }

    const formattedText = formatText(cleanText);
    if (dialogueText) typeWriter(formattedText, dialogueText);

    // ── Oracle consequence badge ────────────────────────────────────────────
    const oracleBadge = document.getElementById('vnOracleConsequenceBadge');
    if (oracleBadge) {
        // Solo mostramos consecuencia en mensajes que NO son del propio oráculo
        // (los mensajes isOracleResult ya tienen el texto completo como narratorText)
        if (msg.oracle && !msg.isOracleResult) {
            const consequence = generateConsequence(msg.oracle);
            oracleBadge.textContent = consequence;
            oracleBadge.style.display = '';
        } else {
            oracleBadge.style.display = 'none';
        }
    }

    const diceBadge = document.getElementById('vnDiceBadge');
    if (diceBadge && msg.oracle) {
        const roll    = Number(msg.oracle.roll) || 0;
        const total   = Number(msg.oracle.total) || 0;
        const dc      = Number(msg.oracle.dc) || calculateOracleDifficulty();
        const mod     = Number(msg.oracle.modifier) || 0;
        const modSign = mod >= 0 ? '+' : '';
        const stat    = msg.oracle.stat || '';
        const labelText = msg.oracle.label || stat;
        const result  = msg.oracle.result || 'success';

        const resultMeta = {
            critical: { label: 'ÉXITO CRÍTICO', cls: 'badge-critical', icon: '✦', borderColor: '#f1c40f' },
            success:  { label: 'ACIERTO',        cls: 'badge-success',  icon: '◆', borderColor: '#27ae60' },
            fail:     { label: 'FALLO',           cls: 'badge-fail',     icon: '◇', borderColor: '#c0392b' },
            fumble:   { label: 'FALLO CRÍTICO',   cls: 'badge-fumble',   icon: '✕', borderColor: '#ff4444' }
        }[result] || { label: result.toUpperCase(), cls: 'badge-success', icon: '◆', borderColor: '#27ae60' };

        const consequenceHtml = msg.oracleConsequence
            ? `<span class="vn-dice-consequence">${escapeHtml(String(msg.oracleConsequence))}</span>`
            : '';
        safeHtml(diceBadge, `<span style="margin-right:0.35rem;">${resultMeta.icon}</span><strong>${resultMeta.label}</strong><span style="opacity:0.7;margin-left:0.5rem;font-size:0.85em;">D20(${roll}) ${modSign}${mod} = ${total} vs ${dc}${labelText ? ' [' + escapeHtml(String(labelText)) + ']' : ''}</span>${consequenceHtml}`);
        diceBadge.className = `vn-dice-badge ${resultMeta.cls}`;
        diceBadge.style.borderLeft = `3px solid ${resultMeta.borderColor}`;
        diceBadge.style.display = 'flex';
        diceBadge.style.flexDirection = 'column';
        diceBadge.style.alignItems = 'flex-start';
    } else if (diceBadge) {
        diceBadge.style.display = 'none';
        diceBadge.style.borderLeft = '';
    }

    const msgCounter = document.getElementById('vnMessageCounter');
    if (msgCounter) msgCounter.textContent = `${currentMessageIndex + 1} / ${msgs.length}`;

    const liveSpeaker = (msg.isNarrator || !msg.characterId) ? 'Narrador' : (msg.charName || 'Personaje');
    announceForScreenReader(`Nuevo mensaje de ${liveSpeaker}: ${stripHtml(formatText(cleanText)).slice(0, 180)}`);

    const editBtn = document.getElementById('editMsgBtn');
    if (editBtn) {
        if (msg.userIndex === currentUserIndex) {
            editBtn.classList.remove('hidden');
        } else {
            editBtn.classList.add('hidden');
        }
    }

    const optionsContainer = document.getElementById('vnOptionsContainer');
    // 'init' = primera carga al entrar al topic. No auto-abrimos el overlay de opciones
    // para que el usuario no se encuentre con el menú de elección sin pedirlo.
    // El indicador #messageHasOptions ya avisa de que hay opciones pendientes.
    if (currentMessageIndex === msgs.length - 1 && hasOpt && !isRpgModeMode() && direction !== 'init') {
        showOptions(msg.options);
    } else {
        if (optionsContainer) optionsContainer.classList.remove('active');
    }

    updateAffinityDisplay();
    updateOracleFloatButton();
    updateVnTurnBadge();
    renderVnPartyPanel();
    scheduleContinuousReadIfNeeded(msg);
    if (typeof updateFavButton === "function") updateFavButton();

    // Modo clásico: panel de personaje
    if (typeof updateClassicLiteraryPanel === 'function') updateClassicLiteraryPanel();
    // Botón de narración flotante
    if (typeof updateNarrateButton === 'function') updateNarrateButton();

    // Mostrar banner de capítulo al avanzar a un mensaje que abre capítulo
    if (direction === 'forward' && msg.chapter) {
        showChapterReveal(msg.chapter);
    }

    // Reacciones
    if (typeof updateReactionDisplay === 'function') updateReactionDisplay();

    // Aplicar cambio de escena dinámico si el mensaje lo contiene
    if (direction === 'forward') {
        if (msg.sceneChange) {
            const vnSection = document.getElementById('vnSection');
            const sceneBackground = resolveTopicBackgroundPath(msg.sceneChange.background || '');
            cleanupVnRuntimeResources({ disconnectObserver: false, clearSpritePool: false, stopSpriteBlink: true });
            applyTopicBackground(vnSection, sceneBackground);
            playVnSceneTransition(vnSection);
        }
    } else {
        const topic = getCurrentTopic();
        let lastBackground = resolveTopicBackgroundPath(topic?.background || '');
        for (let i = 0; i <= currentMessageIndex; i++) {
            if (msgs[i] && msgs[i].sceneChange) {
                lastBackground = resolveTopicBackgroundPath(msgs[i].sceneChange.background || '');
            }
        }
        const vnSection = document.getElementById('vnSection');
        applyTopicBackground(vnSection, lastBackground);
    }

    // Mejora 3: clima solo al avanzar (no al retroceder)
    // Al retroceder, se busca el último clima activo hasta el índice actual
    if (direction === 'forward') {
        // Aplicar clima del mensaje actual
        const newWeather = msg.weather || 'none';
        if (newWeather !== currentWeather) {
            setWeather(newWeather);
        }
    } else {
        // Al retroceder: calcular cuál es el último clima aplicado hasta aquí
        let lastWeather = 'none';
        for (let i = 0; i <= currentMessageIndex; i++) {
            if (msgs[i] && msgs[i].weather) {
                lastWeather = msgs[i].weather;
            } else if (msgs[i] && msgs[i].weather === undefined) {
                // Sin clima en este mensaje — no cambia
            }
        }
        // Solo cambiar si difiere del actual para evitar resets innecesarios
        if (lastWeather !== currentWeather) {
            setWeather(lastWeather);
        }
    }
}

function getPooledSpriteElement(container) {
    if (spritePool.length > 0) {
        return spritePool.pop();
    }

    const spriteNode = document.createElement('div');
    spriteNode.className = 'vn-sprite';
    const img = document.createElement('img');
    spriteNode.appendChild(img);
    return spriteNode;
}

function recycleActiveSprites(container) {
    Array.from(container.children).forEach((child) => {
        child.className = 'vn-sprite';
        child.removeAttribute('data-char-id');
        child.classList.remove('no-sprite');
        const img = child.querySelector('img');
        if (img) {
            if (spriteIntersectionObserver) spriteIntersectionObserver.unobserve(img);
            revokeTrackedSpriteObjectUrl(img.currentSrc || img.src);
            if (img.dataset?.src) revokeTrackedSpriteObjectUrl(img.dataset.src);
            if (img.dataset?.thumb) revokeTrackedSpriteObjectUrl(img.dataset.thumb);
            img.removeAttribute('src');
            img.removeAttribute('alt');
            delete img.dataset.src;
            delete img.dataset.thumb;
            img.onload = null;
            img.onerror = null;
        }
        child.querySelectorAll('.vn-sprite-hitbox, .manga-emote, .sprite-shadow').forEach((el) => el.remove());
        // Limitar el pool a 20 elementos para evitar memory leak
        if (spritePool.length < 20) spritePool.push(child);
    });
    container.innerHTML = '';
}

// ── Normaliza el campo gender de un personaje a la clase CSS de sombra ──────
function getShadowGenderClass(gender) {
    const g = String(gender || '').toLowerCase().trim();
    if (['male', 'm', 'masculino', 'hombre', 'masculine', 'masc'].includes(g)) return 'shadow-masc';
    if (['female', 'f', 'femenino', 'mujer', 'feminine', 'fem'].includes(g)) return 'shadow-fem';
    return null; // neutral / no especificado → silueta base etérea
}

// ── SVG paths para siluetas humanas realistas ────────────────────────────────
const SHADOW_SVG_FEM = `<svg viewBox="0 0 200 520" xmlns="http://www.w3.org/2000/svg">
  <g fill="currentColor">
    <!-- Cabeza -->
    <ellipse cx="100" cy="36" rx="26" ry="32"/>
    <!-- Cuello -->
    <rect x="91" y="64" width="18" height="20" rx="4"/>
    <!-- Torso + cintura -->
    <path d="M72,82 C60,88 54,100 54,116 L56,148 C56,160 62,170 72,175 L78,188 C82,196 80,206 76,214 L68,240 C64,252 66,264 72,274 L76,300 L124,300 L128,274 C134,264 136,252 132,240 L124,214 C120,206 118,196 122,188 L128,175 C138,170 144,160 144,148 L146,116 C146,100 140,88 128,82 C120,78 108,76 100,76 C92,76 80,78 72,82 Z"/>
    <!-- Caderas más anchas -->
    <path d="M68,296 C58,298 50,306 48,316 L44,340 C42,352 46,364 54,372 L58,400 L88,400 L90,370 L100,365 L110,370 L112,400 L142,400 L146,372 C154,364 158,352 156,340 L152,316 C150,306 142,298 132,296 Z"/>
    <!-- Pierna izquierda -->
    <path d="M58,396 L60,440 C60,452 58,464 56,476 L52,508 C51,514 55,520 61,520 L80,520 C86,520 89,514 88,508 L86,476 C84,464 84,452 86,440 L88,396 Z"/>
    <!-- Pierna derecha -->
    <path d="M112,396 L114,440 C116,452 116,464 114,476 L112,508 C111,514 114,520 120,520 L139,520 C145,520 149,514 148,508 L144,476 C142,464 140,452 140,440 L142,396 Z"/>
    <!-- Brazos -->
    <path d="M70,82 L48,86 C38,90 32,100 34,110 L42,158 C44,166 52,170 60,168 L68,166 L62,120 C60,106 64,92 70,82 Z"/>
    <path d="M130,82 L152,86 C162,90 168,100 166,110 L158,158 C156,166 148,170 140,168 L132,166 L138,120 C140,106 136,92 130,82 Z"/>
  </g>
</svg>`;

const SHADOW_SVG_MASC = `<svg viewBox="0 0 220 520" xmlns="http://www.w3.org/2000/svg">
  <g fill="currentColor">
    <!-- Cabeza -->
    <ellipse cx="110" cy="34" rx="28" ry="30"/>
    <!-- Cuello -->
    <rect x="100" y="60" width="20" height="22" rx="3"/>
    <!-- Torso ancho + hombros cuadrados -->
    <path d="M62,80 C48,84 38,96 38,112 L40,152 C40,166 48,176 60,180 L64,200 C66,210 64,220 60,230 L54,258 C50,270 52,282 60,290 L66,316 L154,316 L160,290 C168,282 170,270 166,258 L160,230 C156,220 154,210 156,200 L160,180 C172,176 180,166 180,152 L182,112 C182,96 172,84 158,80 C144,74 128,72 110,72 C92,72 76,74 62,80 Z"/>
    <!-- Caderas -->
    <path d="M64,312 C54,314 46,322 44,332 L40,356 C38,368 42,380 50,388 L54,416 L86,416 L88,384 L110,380 L132,384 L134,416 L166,416 L170,388 C178,380 182,368 180,356 L176,332 C174,322 166,314 156,312 Z"/>
    <!-- Pierna izquierda -->
    <path d="M52,412 L54,455 C54,468 52,480 50,492 L46,514 C45,518 48,522 52,522 L80,522 C84,522 87,518 86,514 L84,492 C82,480 82,468 84,455 L88,412 Z"/>
    <!-- Pierna derecha -->
    <path d="M132,412 L136,455 C138,468 138,480 136,492 L134,514 C133,518 136,522 140,522 L168,522 C172,522 175,518 174,514 L170,492 C168,480 166,468 166,455 L168,412 Z"/>
    <!-- Brazo izquierdo — más separado del cuerpo -->
    <path d="M60,80 L32,88 C20,94 14,108 16,122 L26,170 C28,180 38,186 48,182 L62,178 L56,128 C54,110 56,92 60,80 Z"/>
    <!-- Mano izquierda -->
    <ellipse cx="40" cy="186" rx="10" ry="14"/>
    <!-- Brazo derecho -->
    <path d="M160,80 L188,88 C200,94 206,108 204,122 L194,170 C192,180 182,186 172,182 L158,178 L164,128 C166,110 164,92 160,80 Z"/>
    <!-- Mano derecha -->
    <ellipse cx="180" cy="186" rx="10" ry="14"/>
  </g>
</svg>`;

const SHADOW_SVG_NEUTRAL = `<svg viewBox="0 0 210 520" xmlns="http://www.w3.org/2000/svg">
  <g fill="currentColor">
    <!-- Cabeza -->
    <ellipse cx="105" cy="35" rx="27" ry="31"/>
    <!-- Cuello -->
    <rect x="95" y="62" width="20" height="21" rx="3"/>
    <!-- Torso -->
    <path d="M66,80 C54,86 46,98 46,114 L48,152 C48,164 56,174 66,178 L70,196 C72,206 70,216 66,226 L60,252 C56,264 58,276 66,284 L70,310 L140,310 L144,284 C152,276 154,264 150,252 L144,226 C140,216 138,206 140,196 L144,178 C154,174 162,164 162,152 L164,114 C164,98 156,86 144,80 C132,74 118,72 105,72 C92,72 78,74 66,80 Z"/>
    <!-- Caderas -->
    <path d="M66,306 C56,308 48,316 46,326 L42,350 C40,362 44,374 52,382 L56,410 L88,410 L90,378 L105,374 L120,378 L122,410 L154,410 L158,382 C166,374 170,362 168,350 L164,326 C162,316 154,308 144,306 Z"/>
    <!-- Pierna izquierda -->
    <path d="M54,406 L56,450 C56,462 54,474 52,486 L48,514 C47,518 50,522 54,522 L82,522 C86,522 89,518 88,514 L86,486 C84,474 84,462 86,450 L90,406 Z"/>
    <!-- Pierna derecha -->
    <path d="M120,406 L124,450 C126,462 126,474 124,486 L122,514 C121,518 124,522 128,522 L156,522 C160,522 163,518 162,514 L158,486 C156,474 154,462 154,450 L156,406 Z"/>
    <!-- Brazos -->
    <path d="M64,80 L40,88 C28,94 22,108 24,120 L34,166 C36,176 46,182 56,178 L66,174 L60,124 C58,106 60,90 64,80 Z"/>
    <path d="M146,80 L170,88 C182,94 188,108 186,120 L176,166 C174,176 164,182 154,178 L144,174 L150,124 C152,106 150,90 146,80 Z"/>
  </g>
</svg>`;

// ── URLs de siluetas por defecto — SVG inline como data URI (sin fondo blanco) ──
const _svgToDataUri = (svg) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;

const _SILO_FEM_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 520">
  <g fill="rgba(20,14,8,0.85)">
    <ellipse cx="100" cy="38" rx="28" ry="32"/>
    <rect x="88" y="66" width="24" height="20" rx="5"/>
    <path d="M68,84 C52,92 46,108 48,126 L52,160 C54,172 62,180 72,184 L78,200 C82,212 80,224 74,234 L64,264 C60,278 62,292 70,300 L74,328 L126,328 L130,300 C138,292 140,278 136,264 L126,234 C120,224 118,212 122,200 L128,184 C138,180 146,172 148,160 L152,126 C154,108 148,92 132,84 C122,78 112,76 100,76 C88,76 78,78 68,84 Z"/>
    <path d="M66,322 C54,326 46,336 44,348 L40,374 C38,388 44,402 54,408 L58,440 L90,440 L92,406 L100,400 L108,406 L110,440 L142,440 L146,408 C156,402 162,388 160,374 L156,348 C154,336 146,326 134,322 Z"/>
    <path d="M56,436 L58,486 C58,500 56,514 54,524 L50,516 C52,504 52,490 50,476 L48,436 Z M60,436 L88,436 L88,476 C88,492 86,506 84,516 L80,524 L76,516 C78,506 78,492 78,476 L76,436 Z"/>
    <path d="M112,436 L114,476 C114,492 114,506 116,516 L112,524 L108,516 C106,506 106,492 106,476 L104,436 Z M116,436 L144,436 L144,476 C142,490 142,504 144,516 L140,524 L136,516 C134,506 134,492 134,476 L134,436 Z"/>
    <path d="M66,84 L42,90 C30,96 22,112 24,126 L32,178 C34,190 44,196 56,192 L68,188 L60,130 C58,110 60,94 66,84 Z"/>
    <path d="M134,84 L158,90 C170,96 178,112 176,126 L168,178 C166,190 156,196 144,192 L132,188 L140,130 C142,110 140,94 134,84 Z"/>
  </g>
</svg>`;

const _SILO_MASC_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 220 520">
  <g fill="rgba(20,14,8,0.85)">
    <ellipse cx="110" cy="36" rx="30" ry="32"/>
    <rect x="98" y="64" width="24" height="22" rx="4"/>
    <path d="M56,80 C38,88 28,106 30,124 L34,166 C36,180 46,190 58,194 L64,214 C66,226 64,238 58,250 L50,280 C46,294 48,308 58,316 L64,344 L156,344 L162,316 C172,308 174,294 170,280 L162,250 C156,238 154,226 156,214 L162,194 C174,190 184,180 186,166 L190,124 C192,106 182,88 164,80 C150,74 132,72 110,72 C88,72 70,74 56,80 Z"/>
    <path d="M60,338 C48,342 38,354 36,368 L32,396 C30,412 36,428 48,434 L52,466 L88,466 L90,430 L110,424 L130,430 L132,466 L168,466 L172,434 C184,428 190,412 188,396 L184,368 C182,354 172,342 160,338 Z"/>
    <path d="M50,462 L52,510 C54,516 58,520 64,520 L84,520 C90,520 94,516 94,510 L92,462 Z"/>
    <path d="M126,462 L128,510 C128,516 132,520 138,520 L158,520 C164,520 168,516 168,510 L166,462 Z"/>
    <path d="M54,80 L24,90 C10,96 2,114 4,130 L14,184 C16,198 28,206 42,200 L58,194 L50,130 C48,108 50,90 54,80 Z"/>
    <ellipse cx="20" cy="208" rx="12" ry="16"/>
    <path d="M166,80 L196,90 C210,96 218,114 216,130 L206,184 C204,198 192,206 178,200 L162,194 L170,130 C172,108 170,90 166,80 Z"/>
    <ellipse cx="200" cy="208" rx="12" ry="16"/>
  </g>
</svg>`;

const DEFAULT_SPRITE_FEM     = _svgToDataUri(_SILO_FEM_SVG);
const DEFAULT_SPRITE_MASC    = _svgToDataUri(_SILO_MASC_SVG);
const DEFAULT_SPRITE_NEUTRAL = DEFAULT_SPRITE_FEM;

// ── Construye la estructura DOM completa de una silueta-sombra ───────────────
// Usa imágenes PNG externas por género, con glow y hitbox idénticos al sistema anterior
function _buildSpriteShadow(characterId) {
    const char = characterId
        ? appData.characters.find(c => String(c.id) === String(characterId))
        : null;

    const genderClass = char ? getShadowGenderClass(char.gender) : null;

    const shadow = document.createElement('div');
    shadow.className = 'sprite-shadow';
    shadow.setAttribute('aria-hidden', 'true');

    // Elegir URL según género
    let spriteUrl;
    if (genderClass === 'shadow-fem')   spriteUrl = DEFAULT_SPRITE_FEM;
    else if (genderClass === 'shadow-masc') spriteUrl = DEFAULT_SPRITE_MASC;
    else spriteUrl = DEFAULT_SPRITE_NEUTRAL;

    // Wrapper con la imagen
    const wrapper = document.createElement('div');
    wrapper.className = 'shadow-silhouette' + (genderClass ? ` ${genderClass}` : '');

    const img = document.createElement('img');
    img.src = spriteUrl;
    img.alt = '';
    img.className = 'shadow-silhouette-img';
    img.draggable = false;
    // Fallback de seguridad — usar SVG del mismo inline set
    img.onerror = function () {
        this.onerror = null;
        const g = genderClass === 'shadow-masc' ? _SILO_MASC_SVG
                : genderClass === 'shadow-fem'  ? _SILO_FEM_SVG
                : _SILO_FEM_SVG;
        this.src = _svgToDataUri(g);
    };
    wrapper.appendChild(img);

    const glow = document.createElement('div');
    glow.className = 'shadow-glow' + (genderClass ? ` ${genderClass}` : '');

    const hitbox = document.createElement('div');
    hitbox.className = 'vn-sprite-hitbox';

    shadow.appendChild(wrapper);
    shadow.appendChild(glow);
    shadow.appendChild(hitbox);

    return shadow;
}

function updateSprites(currentMsg, activeEmote = null) {
    const container = document.getElementById('vnSpriteContainer');
    if (!container) return;

    const msgs = getTopicMessages(currentTopicId);
    const isRpgMode = isRpgModeMode();

    let charsToShow = [];

    if (isRpgMode) {
        const recentChars = [];
        const seen = new Set();

        for (let i = msgs.length - 1; i >= 0 && seen.size < 5; i--) {
            const m = msgs[i];
            if (m.characterId && !seen.has(m.characterId)) {
                const charExists = appData.characters.find(c => c.id === m.characterId);
                if (charExists) {
                    seen.add(m.characterId);
                    recentChars.push(m);
                }
            }
        }

        // Crear copias shallow para no mutar los objetos de mensaje originales
        const sliced = recentChars.slice(0, 3);
        if (sliced.length === 1) {
            charsToShow = [{ ...sliced[0], position: 'center' }];
        } else if (sliced.length === 2) {
            charsToShow = [{ ...sliced[0], position: 'left' }, { ...sliced[1], position: 'right' }];
        } else if (sliced.length >= 3) {
            charsToShow = [{ ...sliced[0], position: 'left' }, { ...sliced[1], position: 'center' }, { ...sliced[2], position: 'right' }];
        }
    } else if (currentMsg.characterId) {
        const charExists = appData.characters.find(c => c.id === currentMsg.characterId);
        if (charExists) {
            // Crear copia para no mutar el mensaje original con .position
            charsToShow.push({ ...currentMsg, position: 'center' });
        }
    }

    recycleActiveSprites(container);

    charsToShow.forEach((char) => {
        const spriteNode = getPooledSpriteElement(container);
        const isCurrent = char.characterId === currentMsg.characterId;
        const position = char.position || 'center';

        spriteNode.className = `vn-sprite position-${position} ${isCurrent ? 'active' : 'inactive'}`;
        spriteNode.dataset.charId = char.characterId;

        const existingPlaceholder = spriteNode.querySelector('.vn-sprite-hitbox');
        if (existingPlaceholder) existingPlaceholder.remove();

        const hasSprite = typeof char.charSprite === 'string' && char.charSprite.trim().length > 0;
        let img = spriteNode.querySelector('img');

        if (hasSprite) {
            if (!img) {
                img = document.createElement('img');
                spriteNode.appendChild(img);
            }
            img.loading = 'lazy';
            img.decoding = 'async';
            img.fetchPriority = isCurrent ? 'high' : 'low';
            queueSpriteImageLoad(img, {
                // No usar el avatar como placeholder — el avatar es una imagen pequeña
                // de perfil que se estiraría al tamaño del sprite (pantalla completa).
                // Si hay sprite, se carga directamente sin placeholder intermedio.
                placeholder: null,
                thumb: null,
                full: escapeHtml(char.charSprite),
            });
            img.alt = escapeHtml(char.charName || 'Sprite');
            img.onerror = function () {
                this.style.display = 'none';
                const parent = this.parentElement;
                if (parent) {
                    parent.classList.add('no-sprite');
                    // Construir sombra como fallback si no existe ya
                    if (!parent.querySelector('.sprite-shadow')) {
                        const shadow = _buildSpriteShadow(parent.dataset.charId);
                        parent.appendChild(shadow);
                    }
                }
            };
            img.style.display = 'block';
            spriteNode.classList.remove('no-sprite');
        } else {
            if (img) img.remove();
            spriteNode.classList.add('no-sprite');

            // ── Silueta sombra (en lugar de hitbox vacío) ────────────────
            const shadow = _buildSpriteShadow(char.characterId);
            spriteNode.appendChild(shadow);
        }

        if (isCurrent && activeEmote) {
            // showEmoteOnSprite handles animation + fade-out (defined in effects.js)
            if (typeof showEmoteOnSprite === 'function') {
                showEmoteOnSprite(activeEmote, spriteNode);
            } else {
                // Fallback
                const emoteNode = document.createElement('div');
                emoteNode.className = `manga-emote emote-${activeEmote}`;
                emoteNode.textContent = emoteConfig[activeEmote]?.symbol || '';
                spriteNode.appendChild(emoteNode);
            }
        }

        container.appendChild(spriteNode);
    });
}


========
let spriteIntersectionObserver = null;
const trackedSpriteObjectUrls = new Set();
let replyDrawerExpanded = false;
let replyDrawerBound = false;
let vnMobileFabBound = false;

function hasCoarsePointer() {
    return typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches;
}

function isNarrowScreen() {
    return typeof window !== 'undefined' && window.innerWidth <= 768;
}

function shouldUseMobileDrawer() {
    return hasCoarsePointer() || isNarrowScreen();
}

function ensureSpriteLazyObserver() {
    if (spriteIntersectionObserver || typeof IntersectionObserver === 'undefined') return spriteIntersectionObserver;
    spriteIntersectionObserver = new IntersectionObserver((entries, observer) => {
        entries.forEach((entry) => {
            if (!entry.isIntersecting) return;
            const img = entry.target;
            const fullSrc = img?.dataset?.src;
            const thumbSrc = img?.dataset?.thumb;
            if (thumbSrc || fullSrc) {
                img.classList.add('is-loading');
                img.onload = () => {
                    img.classList.remove('is-loading');
                    const finalSrc = img?.dataset?.src;
                    if (finalSrc && img.src !== finalSrc) {
                        const fullImage = new Image();
                        fullImage.decoding = 'async';
                        fullImage.loading = 'eager';
                        fullImage.fetchPriority = 'high';
                        fullImage.onload = () => {
                            img.src = finalSrc;
                            delete img.dataset.src;
                        };
                        fullImage.src = finalSrc;
                    } else if (finalSrc && img.src === finalSrc) {
                        delete img.dataset.src;
                    }
                    delete img.dataset.thumb;
                };
                img.onerror = () => img.classList.remove('is-loading');
                img.src = thumbSrc || fullSrc;
            }
            observer.unobserve(img);
        });
    }, { root: document.getElementById('vnSection') || null, threshold: 0.1 });
    return spriteIntersectionObserver;
}



function trackSpriteObjectUrl(url) {
    if (!url || typeof url !== 'string') return;
    if (!url.startsWith('blob:')) return;
    trackedSpriteObjectUrls.add(url);
}

function revokeTrackedSpriteObjectUrl(url) {
    if (!url || !trackedSpriteObjectUrls.has(url)) return;
    try {
        URL.revokeObjectURL(url);
    } catch (error) {
        window.EtheriaLogger?.debug('vn:resources', 'revokeObjectURL failed:', error?.message || error);
    }
    trackedSpriteObjectUrls.delete(url);
}

function cleanupVnRuntimeResources(options = {}) {
    const { disconnectObserver = false, clearSpritePool = false, stopSpriteBlink = false } = options;
    const container = document.getElementById('vnSpriteContainer');
    if (container) {
        container.querySelectorAll('img').forEach((img) => {
            if (spriteIntersectionObserver) spriteIntersectionObserver.unobserve(img);
            revokeTrackedSpriteObjectUrl(img.currentSrc || img.src);
            if (img.dataset?.src) revokeTrackedSpriteObjectUrl(img.dataset.src);
            if (img.dataset?.thumb) revokeTrackedSpriteObjectUrl(img.dataset.thumb);
            img.onload = null;
            img.onerror = null;
            delete img.dataset.src;
            delete img.dataset.thumb;
        });
    }

    if (disconnectObserver && spriteIntersectionObserver) {
        spriteIntersectionObserver.disconnect();
        spriteIntersectionObserver = null;
    }

    if (stopSpriteBlink && spriteBlinkTimer) {
        clearTimeout(spriteBlinkTimer);
        spriteBlinkTimer = null;
    }

    if (clearSpritePool) {
        spritePool.length = 0;
    }

    if (disconnectObserver || clearSpritePool) {
        Array.from(trackedSpriteObjectUrls).forEach((url) => revokeTrackedSpriteObjectUrl(url));
    }
}

if (typeof window !== 'undefined') {
    window.cleanupVnRuntimeResources = cleanupVnRuntimeResources;
}

function queueSpriteImageLoad(img, sourceSet) {
    if (!img) return;
    const fullSrc = typeof sourceSet === 'string' ? sourceSet : sourceSet?.full;
    const thumbSrc = typeof sourceSet === 'object' ? sourceSet?.thumb : null;
    const placeholderSrc = typeof sourceSet === 'object' ? sourceSet?.placeholder : null;
    trackSpriteObjectUrl(fullSrc);
    trackSpriteObjectUrl(thumbSrc);
    trackSpriteObjectUrl(placeholderSrc);
    if (placeholderSrc) img.src = placeholderSrc;
    img.loading = 'lazy';
    img.decoding = 'async';
    img.fetchPriority = 'low';
    const observer = ensureSpriteLazyObserver();
    if (!observer) {
        img.src = thumbSrc || fullSrc;
        if (thumbSrc && fullSrc && thumbSrc !== fullSrc) {
            const fullImage = new Image();
            fullImage.decoding = 'async';
            fullImage.onload = () => { img.src = fullSrc; };
            fullImage.src = fullSrc;
        }
        return;
    }
    if (!placeholderSrc) img.removeAttribute('src');
    if (thumbSrc && thumbSrc !== fullSrc) img.dataset.thumb = thumbSrc;
    if (fullSrc) img.dataset.src = fullSrc;
    observer.observe(img);
}

function setReplyDrawerExpanded(expanded) {
    const panel = document.getElementById('vnReplyPanel');
    if (!panel) return;
    replyDrawerExpanded = !!expanded;
    triggerSubtleHaptic();
    panel.classList.toggle('drawer-expanded', replyDrawerExpanded);
    panel.classList.toggle('drawer-collapsed', !replyDrawerExpanded);
}

function updateVnMobileFabVisibility() {
    const fab = document.getElementById('vnMobileFabNav');
    const panel = document.getElementById('vnReplyPanel');
    const vnSection = document.getElementById('vnSection');
    if (!fab) return;
    const panelOpen = panel?.style.display === 'flex';
    const active = vnSection?.classList.contains('active');
    const show = active && shouldUseMobileDrawer() && !panelOpen;
    fab.style.display = show ? 'flex' : 'none';

    if (!vnMobileFabBound) {
        vnMobileFabBound = true;
        let _resizeDebounce = null;
        const debouncedUpdate = () => {
            clearTimeout(_resizeDebounce);
            _resizeDebounce = setTimeout(updateVnMobileFabVisibility, 120);
        };
        window.addEventListener('resize', debouncedUpdate, { passive: true });
        // Actualizar también al cambiar orientación (móvil)
        window.addEventListener('orientationchange', () => {
            setTimeout(updateVnMobileFabVisibility, 200);
        }, { passive: true });
    }
}

function bindReplyDrawerGestures() {
    if (replyDrawerBound) return;
    const handle = document.getElementById('replyDrawerHandle');
    if (!handle) return;

    let startY = 0;
    let dragging = false;

    const onStart = (clientY) => {
        dragging = true;
        startY = clientY;
    };

    const onEnd = (clientY) => {
        if (!dragging) return;
        dragging = false;
        const delta = clientY - startY;
        if (Math.abs(delta) < 24) return;
        if (delta < 0) setReplyDrawerExpanded(true);
        else setReplyDrawerExpanded(false);
    };

    handle.addEventListener('touchstart', (e) => {
        if (!shouldUseMobileDrawer()) return;
        if (e.touches.length !== 1) return;
        onStart(e.touches[0].clientY);
    }, { passive: true });

    handle.addEventListener('touchend', (e) => {
        if (!shouldUseMobileDrawer()) return;
        if (e.changedTouches.length !== 1) return;
        onEnd(e.changedTouches[0].clientY);
    }, { passive: true });

    handle.addEventListener('pointerdown', (e) => {
        if (!shouldUseMobileDrawer()) return;
        onStart(e.clientY);
    });

    handle.addEventListener('pointerup', (e) => {
        if (!shouldUseMobileDrawer()) return;
        onEnd(e.clientY);
    });

    replyDrawerBound = true;
}


let remoteTypingState = {};
let typingUiLastPaint = 0;
let typingIdleTimer = null;
let typingEmitTimer = null;
let continuousReadEnabled = false;
let continuousReadDelaySec = 4;
let continuousReadTimer = null;
let continuousReadStartedAt = 0;
let continuousReadAutoStopTimer = null;
let continuousLastInteractionAt = Date.now();
let spritePointerBound = false;
let spriteBlinkTimer = null;

function updateTypingIndicatorUi(force = false) {
    const now = Date.now();
    if (!force && now - typingUiLastPaint < 1000) return;
    typingUiLastPaint = now;
    const indicator = document.getElementById('vnTypingIndicator');
    if (!indicator) return;
    if (document.hidden) {
        indicator.style.display = 'none';
        return;
    }
    const active = Object.values(remoteTypingState || {}).some((entry) => entry && entry.active && now - (entry.ts || 0) < 5000);
    indicator.style.display = active ? 'inline-flex' : 'none';
}

function clearTypingState() {
    remoteTypingState = {};
    if (typingIdleTimer) clearTimeout(typingIdleTimer);
    if (typingEmitTimer) clearTimeout(typingEmitTimer);
    typingIdleTimer = null;
    typingEmitTimer = null;
    updateTypingIndicatorUi(true);
}

function emitTypingState(active) {
    if (!currentTopicId || typeof SupabaseMessages === 'undefined' || typeof SupabaseMessages.sendTyping !== 'function') return;
    const char = appData.characters.find(c => c.id === selectedCharId);
    SupabaseMessages.sendTyping(currentTopicId, {
        active,
        userIndex: currentUserIndex,
        characterId: selectedCharId || null,
        name: char?.name || null
    }).catch(() => {});
}

function bindReplyTypingEmitter() {
    const input = document.getElementById('vnReplyText');
    if (!input || input.dataset.typingBound) return;
    input.dataset.typingBound = '1';
    input.addEventListener('input', () => {
        if (document.hidden) return;
        if (typingEmitTimer) clearTimeout(typingEmitTimer);
        typingEmitTimer = setTimeout(() => emitTypingState(true), 300);
        if (typingIdleTimer) clearTimeout(typingIdleTimer);
        typingIdleTimer = setTimeout(() => emitTypingState(false), 5000);
    });
}

function markContinuousInteraction() {
    continuousLastInteractionAt = Date.now();
}

function cancelContinuousRead(reason = '') {
    if (continuousReadTimer) clearTimeout(continuousReadTimer);
    continuousReadTimer = null;
}

function shouldPauseContinuousRead(msg) {
    if (!continuousReadEnabled) return true;
    if (document.hidden) return true;
    if (document.activeElement && ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName)) return true;
    const panel = document.getElementById('vnReplyPanel');
    if (panel?.style.display === 'flex') return true;
    if (msg?.options?.length) return true;
    if (msg?.oracle) return true;
    return false;
}

function scheduleContinuousReadIfNeeded(msg) {
    cancelContinuousRead();
    if (shouldPauseContinuousRead(msg)) return;
    const msgs = getTopicMessages(currentTopicId);
    if (!Array.isArray(msgs) || currentMessageIndex >= msgs.length - 1) return;

    continuousReadStartedAt = Date.now();
    continuousReadTimer = setTimeout(() => {
        if (Date.now() - continuousLastInteractionAt > 30000) {
            continuousReadEnabled = false;
            localStorage.setItem('etheria_continuous_read', '0');
            const cb = document.getElementById('optContinuousRead');
            if (cb) cb.checked = false;
            showAutosave('Lectura continua pausada por inactividad', 'info');
            cancelContinuousRead('autostop');
            return;
        }
        if (shouldPauseContinuousRead(msg)) return;
        nextMessage();
    }, Math.max(3000, Math.min(5000, Number(continuousReadDelaySec) * 1000)));
}

function bindSpriteMicroInteractions() {
    if (spritePointerBound) return;
    const container = document.getElementById('vnSpriteContainer');
    if (!container) return;

    if (window.matchMedia && window.matchMedia('(hover: hover)').matches) {
        container.addEventListener('pointermove', (e) => {
            const sprites = Array.from(container.querySelectorAll('.vn-sprite.active'));
            if (!sprites.length) return;
            let nearest = null;
            let minDist = Infinity;
            sprites.forEach((sprite) => {
                const rect = sprite.getBoundingClientRect();
                const cx = rect.left + rect.width / 2;
                const cy = rect.top + rect.height / 2;
                const d = Math.hypot(e.clientX - cx, e.clientY - cy);
                if (d < minDist) {
                    minDist = d;
                    nearest = sprite;
                }
            });
            sprites.forEach((sprite) => sprite.classList.remove('hover-near'));
            if (nearest && minDist < 180) nearest.classList.add('hover-near');
        }, { passive: true });
        container.addEventListener('pointerleave', () => {
            container.querySelectorAll('.vn-sprite.hover-near').forEach((el) => el.classList.remove('hover-near'));
        }, { passive: true });
    }

    container.addEventListener('touchstart', (e) => {
        const sprite = e.target.closest('.vn-sprite');
        if (!sprite) return;
        sprite.classList.add('focus-pop');
        setTimeout(() => sprite.classList.remove('focus-pop'), 220);
    }, { passive: true });

    spritePointerBound = true;
}

function scheduleRandomSpriteBlink() {
    if (spriteBlinkTimer) clearTimeout(spriteBlinkTimer);
    const profile = applySpriteAnimationProfile();
    if (profile.lite) return;

    const delay = 8000 + Math.random() * 4000;
    spriteBlinkTimer = setTimeout(() => {
        const activeSprites = Array.from(document.querySelectorAll('#vnSpriteContainer .vn-sprite.active'));
        if (activeSprites.length) {
            const sprite = activeSprites[Math.floor(Math.random() * activeSprites.length)];
            sprite.classList.add('sprite-blink');
            setTimeout(() => sprite.classList.remove('sprite-blink'), 220);
        }
        scheduleRandomSpriteBlink();
    }, delay);
}


function triggerSubtleHaptic() {
    if (typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') return;
    if (localStorage.getItem('etheria_haptics_enabled') === '0') return;
    if (typeof prefersReducedMotion === 'function' && prefersReducedMotion()) return;
    if (!(window.matchMedia && window.matchMedia('(pointer: coarse)').matches)) return;
    navigator.vibrate(10);
}

function isLowPowerDevice() {
    const cores = Number(navigator?.hardwareConcurrency || 8);
    return cores <= 4;
}

function applySpriteAnimationProfile() {
    const reduced = typeof prefersReducedMotion === 'function' && prefersReducedMotion();
    const lite = reduced || isLowPowerDevice();
    document.documentElement.style.setProperty('--sprite-breathing-duration', lite ? '6s' : '4s');
    return { lite, reduced };
}

function isDefaultTopicBackground(backgroundPath) {
    const normalized = (backgroundPath || "").trim().toLowerCase();
    if (!normalized) return true;
    return LEGACY_DEFAULT_TOPIC_BACKGROUNDS.some(path => normalized === path.toLowerCase());
}

function resolveTopicBackgroundPath(backgroundPath = '') {
    const topicBackground = String(backgroundPath || '').trim();
    if (!topicBackground) return DEFAULT_TOPIC_BACKGROUND;

    const normalizedPath = topicBackground.replace(/^\/+/, '');
    return isDefaultTopicBackground(normalizedPath) ? DEFAULT_TOPIC_BACKGROUND : topicBackground;
}

function getBackgroundCandidates(path) {
    const normalizedPath = String(path || '').trim();
    if (!normalizedPath) return [];

    const isAbsoluteUrl = /^(?:[a-z]+:)?\/\//i.test(normalizedPath);
    const isSpecialUri = /^(?:data:|blob:)/i.test(normalizedPath);
    if (isAbsoluteUrl || isSpecialUri) return [normalizedPath];

    const withoutLeadingSlash = normalizedPath.replace(/^\/+/, '');
    const withLeadingSlash = `/${withoutLeadingSlash}`;

    if (DEFAULT_TOPIC_BACKGROUND_VARIANTS.includes(normalizedPath)) {
        return [...new Set(DEFAULT_TOPIC_BACKGROUND_VARIANTS)];
    }

    if (normalizedPath.startsWith('/')) {
        return [...new Set([normalizedPath, withoutLeadingSlash])];
    }

    return [...new Set([normalizedPath, withLeadingSlash])];
}

function preloadBackgroundImage(path) {
    const normalizedPath = (path || '').trim();
    if (!normalizedPath || preloadedBackgrounds.has(normalizedPath)) {
        return Promise.resolve(true);
    }

    return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
            preloadedBackgrounds.add(normalizedPath);
            resolve(true);
        };
        img.onerror = () => resolve(false);
        img.src = normalizedPath;
    });
}

async function resolveFirstAvailableBackground(path) {
    const candidates = getBackgroundCandidates(path);
    if (!candidates.length) return '';

    for (const candidate of candidates) {
        const loaded = await preloadBackgroundImage(candidate);
        if (loaded) return candidate;
    }

    return candidates[0];
}

function applyTopicBackground(vnSection, backgroundPath) {
    if (!vnSection) return;

    const sceneBackgroundPath = resolveTopicBackgroundPath(backgroundPath);
    const pendingBackgroundToken = `${sceneBackgroundPath}|${Date.now()}|${Math.random()}`;
    vnSection.dataset.pendingBackgroundToken = pendingBackgroundToken;

    const gradient = 'linear-gradient(135deg, rgba(8,6,3,1) 0%, rgba(14,10,5,1) 100%)';
    if (!sceneBackgroundPath) {
        vnSection.style.backgroundImage = gradient;
        return;
    }

    resolveFirstAvailableBackground(sceneBackgroundPath).then((resolvedPath) => {
        if (vnSection.dataset.pendingBackgroundToken !== pendingBackgroundToken) return;
        const sceneBackgroundLayer = `url(${escapeHtml(resolvedPath || sceneBackgroundPath)})`;
        vnSection.style.backgroundImage = `${sceneBackgroundLayer}, ${gradient}`;
    });
}

// ── Listener EventBus: vn:background-changed ─────────────────────────────────
// RPGRenderer emite este evento cuando una escena RPG necesita cambiar el fondo.
// vn.js es el único módulo que puede llamar applyTopicBackground — este listener
// es el punto de entrada desde el exterior sin cruzar capas.
(function _initVnBackgroundListener() {
    if (window._vnBackgroundListenerReady) return;
    window._vnBackgroundListenerReady = true;
    if (typeof eventBus !== 'undefined') {
        eventBus.on('vn:background-changed', function(data) {
            if (!data || !data.asset) return;
            const vnSection = document.getElementById('vnSection');
            if (!vnSection) return;
            applyTopicBackground(vnSection, data.asset);
        });
    }
})();

function preloadTopicBackgrounds() {
    const topicBackgrounds = (appData?.topics || []).map(topic => resolveTopicBackgroundPath(topic.background));
    const uniqueBackgrounds = new Set([...topicBackgrounds, ...DEFAULT_TOPIC_BACKGROUND_VARIANTS].filter(Boolean));
    uniqueBackgrounds.forEach((path) => {
        getBackgroundCandidates(path).forEach(candidate => preloadBackgroundImage(candidate));
    });
}

function playVnSceneTransition(vnSection) {
    const el = document.getElementById('vnSceneTransition');
    if (!el) return;
    el.classList.remove('active', 'wipe');
    void el.offsetWidth; // forzar reflow para reiniciar animación
    el.classList.add('active');
    setTimeout(() => el.classList.remove('active'), 800);

    // Parallax suave del fondo al cambiar escena
    const section = vnSection || document.getElementById('vnSection');
    if (section && !prefersReducedMotion()) {
        section.classList.remove('scene-change-anim');
        void section.offsetWidth;
        section.classList.add('scene-change-anim');
        setTimeout(() => section.classList.remove('scene-change-anim'), 700);
    }
}

// ── Helpers de entrada a tema ─────────────────────────────────────────────────
// Extraídos de enterTopic() para separar responsabilidades por modo.
// Solo se usan desde enterTopic — prefijo _ indica uso interno.
//
// Candidatos a moverse a js/ui/vn-mode.js cuando vn.js vuelva a crecer:
//   _resolveCharacterForMode   → selección de personaje según modo
//   _applyModeClasses          → CSS classes rpg/classic en vnSection y body
//   _maybeOpenRpgStatsModal    → RPG-only: auto-open stats la primera vez

// Selecciona el personaje según el modo del topic.
// Devuelve false si se abre un modal y enterTopic debe abortar.
function _resolveCharacterForMode(t, id, topicMode) {
    // Buscar lock universal (characterLocks tiene prioridad sobre campos legacy)
    const lockedCharId = getTopicLockedCharacterId(t);

    if (lockedCharId) {
        const lockedChar = appData.characters.find(c =>
            String(c.id) === String(lockedCharId) && c.userIndex === currentUserIndex
        );
        if (lockedChar) {
            selectedCharId = lockedChar.id;
            if (typeof syncVnStore === 'function') syncVnStore({ selectedCharId });
        }
        return true;
    }

    // Sin personaje bloqueado: abrir modal de selección para ambos modos
    const mine = appData.characters.filter(c => c.userIndex === currentUserIndex);
    if (mine.length > 0) {
        openRoleCharacterModal(id, { mode: topicMode, enterOnSelect: true });
        return false;
    }

    // Sin personajes propios: solo puede entrar como Narrador (modo clásico)
    if (topicMode === 'rpg') {
        showAutosave('Necesitas al menos un personaje para modo RPG', 'error');
        return false;
    }
    return true;
}

// Aplica las CSS classes de modo en vnSection y body.
function _applyModeClasses(vnSection, topicMode) {
    // Inyecta el contenedor de esquinas decorativas si aún no existe
    const dbox = vnSection.querySelector('.vn-dialogue-box');
    if (dbox && !dbox.querySelector('.vn-db-corners')) {
        const corners = document.createElement('div');
        corners.className = 'vn-db-corners';
        corners.setAttribute('aria-hidden', 'true');
        corners.innerHTML = '<i></i><i></i><i></i><i></i>';
        dbox.appendChild(corners);
    }

    if (topicMode === 'rpg') {
        vnSection.classList.remove('classic-mode', 'mode-classic');
        vnSection.classList.add('mode-rpg');
        document.body.classList.add('mode-rpg', 'theme-rpg');
        document.body.classList.remove('mode-classic', 'theme-classic');
    } else {
        // Modo clásico: sprites desaparecen al avanzar
        vnSection.classList.add('classic-mode', 'mode-classic');
        vnSection.classList.remove('mode-rpg');
        document.body.classList.remove('mode-rpg', 'theme-rpg');
        document.body.classList.add('mode-classic', 'theme-classic');
    }
}

// Abre automáticamente el modal de stats RPG la primera vez que el jugador
// entra a un topic sin haber gastado ningún punto.
function _maybeOpenRpgStatsModal(topicId) {
    if (currentTopicMode !== 'rpg' || !selectedCharId) return;
    const key = `etheria_stats_prompted_${topicId}_${selectedCharId}`;
    if (localStorage.getItem(key)) return;
    const char = appData.characters.find(c => String(c.id) === String(selectedCharId));
    if (!char || typeof ensureCharacterRpgProfile !== 'function' || typeof getRpgSpentPoints !== 'function') return;
    const profile = ensureCharacterRpgProfile(char, topicId);
    const spent   = getRpgSpentPoints(profile);
    if (spent === 0 && typeof openRpgStatsModal === 'function') {
        localStorage.setItem(key, '1');
        setTimeout(() => {
            eventBus.emit('ui:show-autosave', { text: '⚔️ ¡Distribuye tus 14 puntos de stats para empezar!', state: 'info' });
            openRpgStatsModal(selectedCharId);
        }, 900);
    }
}

function enterTopic(id) {
    if (typeof stopMenuMusic === 'function') stopMenuMusic();

    const t = appData.topics.find(topic => topic.id === id);
    if (!t) return;

    // Guard: sin personaje asignado → modal de selección, sin limpiar estado
    // (evita el flash de pantalla negra antes de que el usuario elija personaje)
    const topicMode = t.mode || 'roleplay';
    const _lockedId = getTopicLockedCharacterId(t);
    const _myChars  = appData.characters.filter(c => c.userIndex === currentUserIndex);

    if (!_lockedId && _myChars.length > 0) {
        // Ningún mode permite responder sin elegir personaje primero.
        // El creator ya lo eligió al crear (openRoleCharacterModal con enterOnSelect),
        // los demás participantes deben elegirlo la primera vez que intenten entrar.
        openRoleCharacterModal(id, { mode: topicMode, enterOnSelect: true });
        return;
    }

    // transición visual absorbida de mejoras.js (Mejora 9)
    fadeTransition(function() { _doEnterTopic(id, t, topicMode); }, 220);
}

function _doEnterTopic(id, t, topicMode) {

    // ── 1. Inicializar estado global del topic ────────────────────────────────
    const _ob = parseInt(localStorage.getItem('etheria_onboarding_step') || '0', 10);
    if (_ob === 2 && typeof maybeShowOnboarding === 'function') {
        setTimeout(maybeShowOnboarding, 800);
    }
    eventBus.emit('ui:reset-vn-state');
    currentTopicId = id;
    if (typeof syncVnStore === 'function') syncVnStore({ topicId: currentTopicId });

    if (typeof CollaborativeGuard !== 'undefined') {
        CollaborativeGuard.init(id, typeof currentUserIndex !== 'undefined' ? currentUserIndex : 0);
    }
    if (typeof SupabaseMessages !== 'undefined' && typeof SupabaseMessages.subscribeGlobal === 'function') {
        SupabaseMessages.subscribeGlobal(null, null, id);
    }
    const _existingMsgs = getTopicMessages(id);
    // Si el tema tiene mensajes, posicionar en el último — no en el primero
    currentMessageIndex = _existingMsgs.length > 0 ? _existingMsgs.length - 1 : 0;
    if (typeof syncVnStore === 'function') syncVnStore({ messageIndex: currentMessageIndex });
    pendingContinuation = null;
    editingMessageId = null;
    if (typeof updateRoomCodeUI === 'function') updateRoomCodeUI(id);

    // ── 2. Establecer modo y resolver personaje ───────────────────────────────
    currentTopicMode = topicMode;
    if (!_resolveCharacterForMode(t, id, topicMode)) return;

    // ── 2b. Sincronizar RPGState desde la ficha del personaje activo ──────────
    // Sincroniza los stats D&D (STR/DEX/CON/INT/WIS/CHA) de la ficha con el motor
    // de escenas JSON (RPGState). Solo en modo RPG y si hay personaje activo.
    if (topicMode === 'rpg' && selectedCharId &&
        typeof RPGState !== 'undefined' &&
        typeof RPGState.syncFromCharacter === 'function') {
        const _activeChar = appData.characters.find(c => String(c.id) === String(selectedCharId));
        if (_activeChar) {
            RPGState.syncFromCharacter(_activeChar, id);
        }
    }

    // ── 3. Aplicar entorno visual (clima, fondo, CSS de modo) ─────────────────
    setWeather(t.weather || 'none');
    const vnSection = document.getElementById('vnSection');
    if (vnSection) {
        applyTopicBackground(vnSection, t.background);
        _applyModeClasses(vnSection, topicMode);
    }

    // ── 4. Activar sección VN en el DOM ──────────────────────────────────────
    // Limpiamos TODAS las secciones activas (no solo topicsSection) para evitar
    // que opciones, galería u otras secciones queden visibles sobre la VN.
    pendingChapter = null;
    document.querySelectorAll('.game-section').forEach(function(s) { s.classList.remove('active'); });
    if (vnSection) {
        vnSection.classList.add('active');
        playVnSceneTransition(vnSection);
    }

    const deleteBtn = document.getElementById('deleteTopicBtn');
    if (deleteBtn) {
        const isOwner = t.createdByIndex === currentUserIndex || t.createdByIndex === undefined || t.createdByIndex === null;
        const deleteSlot = deleteBtn.closest('.vn-control-slot');
        if (isOwner) {
            deleteBtn.classList.remove('hidden');
            if (deleteSlot) deleteSlot.style.display = '';
        } else {
            deleteBtn.classList.add('hidden');
            if (deleteSlot) deleteSlot.style.display = 'none';
        }
    }

    // ── 5. Inicializar UI y controles de lectura ──────────────────────────────
    // Usamos 'init' en vez de 'forward' para que showCurrentMessage aplique
    // el estado visual correcto (fondo, clima) sin auto-abrir el overlay de opciones.
    showCurrentMessage('init');
    updateVnMobileFabVisibility();
    bindReplyTypingEmitter();
    bindSpriteMicroInteractions();
    applySpriteAnimationProfile();
    scheduleRandomSpriteBlink();
    continuousReadEnabled = localStorage.getItem('etheria_continuous_read') === '1';
    continuousReadDelaySec = Math.max(3, Math.min(5, Number(localStorage.getItem('etheria_continuous_delay') || 4)));

    // ── 6. Extras RPG (stats modal, cloud story) ──────────────────────────────
    _maybeOpenRpgStatsModal(id);

    // ── Auto-activar historia en la nube si el topic tiene storyId ──
    // Cuando el topic ya fue creado con cloud sync, el storyId se guardó
    // en el objeto topic. Lo restauramos para que los mensajes usen el
    // story_id correcto en Supabase desde el primer mensaje de esta sesión.
    const _tForStory = appData.topics.find(function(tp) { return String(tp.id) === String(id); });
    if (_tForStory && _tForStory.storyId) {
        global.currentStoryId = _tForStory.storyId;
        // Suscribir al canal realtime de la historia si está disponible
        if (typeof SupabaseStories !== 'undefined' && typeof SupabaseStories.enterStory === 'function') {
            SupabaseStories.enterStory(_tForStory.storyId).catch(function(error) { window.EtheriaLogger?.warn('ui:vn', 'enterStory failed:', error?.message || error); });
        }
        // Cargar reacciones desde Supabase para ver las de todos los usuarios
        if (typeof loadReactionsFromSupabase === 'function') {
            loadReactionsFromSupabase(_tForStory.storyId).catch(() => {});
        }
    } else {
        // Topic sin storyId (creado antes de la integración cloud) — limpiar
        global.currentStoryId = null;
    }
    // ────────────────────────────────────────────────────────────────

    // Carga desde Supabase y suscripción realtime (no bloquea el flujo principal)
    _sbEnterTopic(id);
    
    // Notificar a Ethy que se ha entrado en modo VN
    window.dispatchEvent(new CustomEvent('etheria:section-changed', { 
        detail: { section: 'vn', mode: currentTopicMode } 
    }));

    // Notificar al módulo de presencia/inbox que se ha entrado en un topic
    window.dispatchEvent(new CustomEvent('etheria:topic-enter', { detail: { topicId: id } }));

    // ── Vínculos: crear automáticamente entre todos los participantes ─────────
    // Solo en modo clásico (en RPG no hay sistema de vínculos).
    if (topicMode !== 'rpg' && typeof SupabaseBonds !== 'undefined') {
        const _tBonds = appData.topics.find(tp => String(tp.id) === String(id));
        if (_tBonds) {
            const _locks = { ...(_tBonds.characterLocks || {}), ...(_tBonds.rpgCharacterLocks || {}) };
            const _participantCharIds = Object.values(_locks).filter(Boolean).map(String);
            if (_participantCharIds.length >= 2) {
                const _storyId = _tBonds.storyId || null;
                SupabaseBonds.ensureStoryBonds(_storyId || id, _participantCharIds).catch(() => {});
            }
        }
    }
}

// Memory leak fix: store handler reference so it can be removed before re-adding
let _globalRealtimeHandlerRef = null;

// Fix 10: concurrency guard — prevents duplicate loads on rapid double-click
let _sbEnterInProgress = false;

async function _sbEnterTopic(topicId) {
    // Fix 10: prevent concurrent loads from rapid topic entry
    if (_sbEnterInProgress) return;
    _sbEnterInProgress = true;

    if (typeof SupabaseMessages === 'undefined') { _sbEnterInProgress = false; return; }

    SupabaseMessages.unsubscribe();
    clearTypingState();

    // Cargar historial remoto y fusionar con local por id
    try {
        const remoteMsgs = await SupabaseMessages.load(topicId, global.currentStoryId || null);
        if (Array.isArray(remoteMsgs) && remoteMsgs.length > 0) {
            const localMsgs = getTopicMessages(topicId);
            const localIds  = new Set(localMsgs.map(function (m) { return String(m.id); }));
            const newRemote = remoteMsgs.filter(function (m) { return m.id && !localIds.has(String(m.id)); });

            if (newRemote.length > 0) {
                newRemote.forEach(function (m) { localMsgs.push(m); });
                localMsgs.sort(function (a, b) { return new Date(a.timestamp) - new Date(b.timestamp); });
                appData.messages[topicId] = localMsgs;
                hasUnsavedChanges = true;
                markDirty('messages', topicId); // Fix 9
                save({ silent: true });

                if (currentTopicId === topicId) {
                    currentMessageIndex = localMsgs.length - 1;
                    if (typeof syncVnStore === 'function') syncVnStore({ messageIndex: currentMessageIndex });
                    showCurrentMessage('forward');
                    showSyncToast(newRemote.length + ' mensaje(s) cargado(s) desde la nube', 'OK');
                }
            }
        }
    } catch (e) {
        // Supabase no disponible — el sistema sigue con local
        _sbEnterInProgress = false; // Fix 10: release guard on error path
        return;
    }

    // Suscripción realtime: recibir mensajes del otro jugador en tiempo real
    SupabaseMessages.subscribe(topicId, function (remoteMsg) {
        if (currentTopicId !== topicId) return;
        if (!remoteMsg || !remoteMsg.id) return;

        const msgs = getTopicMessages(topicId);
        const exists = msgs.some(function (m) { return String(m.id) === String(remoteMsg.id); });
        if (exists) return;

        // Fix 4: prefer server-assigned user_id for own-message detection;
        // fall back to client userIndex for backward compat
        const _ownUserId = typeof _cachedUserId !== 'undefined' ? _cachedUserId : null;
        if (_ownUserId && remoteMsg._supabaseUserId && remoteMsg._supabaseUserId === _ownUserId) return;
        if (!_ownUserId && String(remoteMsg.userIndex) === String(currentUserIndex)) return;

        msgs.push(remoteMsg);
        msgs.sort(function (a, b) { return new Date(a.timestamp) - new Date(b.timestamp); });
        appData.messages[topicId] = msgs;
        hasUnsavedChanges = true;
        markDirty('messages', topicId); // Fix 9
        save({ silent: true });

        if (continuousReadEnabled) {
            toggleContinuousReading(false);
        }

        const isAtEnd = currentMessageIndex >= msgs.length - 2;
        if (isAtEnd) {
            currentMessageIndex = msgs.length - 1;
            showCurrentMessage('forward');
            showSyncToast('Nuevo mensaje recibido. Lectura continua pausada.', 'Continuar auto', function () {
                toggleContinuousReading(true);
            });
        } else {
            showSyncToast('Nuevo mensaje recibido', 'Ver ahora', function () {
                currentMessageIndex = msgs.length - 1;
                showCurrentMessage('forward');
            });
        }
    }, function (typingMsg) {
        if (!typingMsg || String(typingMsg.userIndex) === String(currentUserIndex)) return;
        remoteTypingState[String(typingMsg.userIndex)] = { active: !!typingMsg.typing?.active, ts: Date.now() };
        updateTypingIndicatorUi();
        setTimeout(() => updateTypingIndicatorUi(true), 5200);
    }, function () {
        clearTypingState();
    });

    // Escuchar mensajes del canal global (messages-realtime) para el topic activo.
    // Memory leak fix: remove previous handler before registering a new one.
    if (_globalRealtimeHandlerRef) {
        window.removeEventListener('etheria:realtime-message', _globalRealtimeHandlerRef);
        _globalRealtimeHandlerRef = null;
    }
    _globalRealtimeHandlerRef = function (e) {
        const remoteMsg = e.detail?.msg;
        const remoteRow = e.detail?.row;

        // Solo procesar si el mensaje pertenece al topic activo
        if (!remoteMsg || !remoteMsg.id) return;
        if (remoteRow && remoteRow.session_id && String(remoteRow.session_id) !== String(topicId)) return;
        if (currentTopicId !== topicId) return;

        // Si hay historia activa, solo procesar mensajes de esa historia
        if (currentStoryId && remoteRow && remoteRow.story_id && remoteRow.story_id !== currentStoryId) return;

        const msgs = getTopicMessages(topicId);
        const exists = msgs.some(function (m) { return String(m.id) === String(remoteMsg.id); });
        if (exists) return;

        // Fix 4: use server user_id for own-message detection when available
        const _ownId = typeof _cachedUserId !== 'undefined' ? _cachedUserId : null;
        if (_ownId && remoteMsg._supabaseUserId && remoteMsg._supabaseUserId === _ownId) return;
        if (!_ownId && String(remoteMsg.userIndex) === String(currentUserIndex)) return;

        msgs.push(remoteMsg);
        msgs.sort(function (a, b) { return new Date(a.timestamp) - new Date(b.timestamp); });
        appData.messages[topicId] = msgs;
        hasUnsavedChanges = true;
        markDirty('messages', topicId); // Fix 9
        save({ silent: true });

        const isAtEnd = currentMessageIndex >= msgs.length - 2;
        if (isAtEnd) {
            currentMessageIndex = msgs.length - 1;
            showCurrentMessage('forward');
        }
        // Limpiar listener cuando salgamos del topic
        if (currentTopicId !== topicId) {
            window.removeEventListener('etheria:realtime-message', _globalRealtimeHandler);
        }
    };
    window.addEventListener('etheria:realtime-message', _globalRealtimeHandlerRef);

    // Fix 10: release guard so the next enterTopic() call can proceed
    _sbEnterInProgress = false;
}

function stopTypewriter() {
    if (typeof typewriterInterval === 'number') {
        window.cancelAnimationFrame(typewriterInterval);
        clearInterval(typewriterInterval);
        typewriterInterval = null;
    }
    typewriterSessionId++;
    isTyping = false;
    // Resetear opacity inline por si quedó en 0 del modo HTML
    const el = document.getElementById('vnDialogueText');
    if (el && el.style.opacity === '0') {
        el.style.transition = '';
        el.style.opacity = '';
    }
}

function triggerDialogueFadeIn() {
    const dialogueBox = document.querySelector('.vn-dialogue-box');
    if (!dialogueBox) return;
    dialogueBox.classList.remove('fade-in');
    void dialogueBox.offsetWidth;
    dialogueBox.classList.add('fade-in');
}


function detectOracleCategory(question = '', stat = '') {
    const q = String(question || '').toLowerCase();
    const statKey = String(stat || '').toUpperCase();
    if (statKey === 'INT' || /analizar|descifrar|investigar|leer|pensar|recordar/.test(q)) return 'analysis';
    if (statKey === 'STR' || /forzar|romper|empujar|levantar|golpear/.test(q)) return 'force';
    if (statKey === 'AGI' || /esquivar|correr|saltar|huir|sigilo/.test(q)) return 'agility';
    if (statKey === 'VIT' || /resistir|aguantar|soportar|mantener/.test(q)) return 'endurance';
    if (/convencer|negociar|persuadir|mentir|pedir/.test(q)) return 'negotiation';
    return 'generic';
}

function generateConsequence(oracle) {
    // VOZ: El Eco del Destino — teatral, fatalista, segunda persona directa.
    // Metáforas de hilos, sombras, fuego y eco. Nunca certezas — siempre presagios.
    const category = detectOracleCategory(oracle?.question || '', oracle?.stat || '');
    const isSuccess  = (oracle?.result === 'success' || oracle?.result === 'critical');
    const isCritical = oracle?.result === 'critical';
    const isFumble   = oracle?.result === 'fumble';

    const voices = {
        negotiation: {
            cara: isCritical
                ? `*La palabra que pronunciaste atravesó el silencio como una flecha que ya sabía su destino.* El otro hilo cedió — no por convicción, sino porque el tejido lo exigía. **Tu voz fue el fuego esta vez.** Úsala con cuidado.`
                : `*El eco de tus palabras llegó — distorsionado, pero llegó.* La sombra del rechazo retrocedió un paso. **El hilo de la negociación aguantó.** Por ahora. Las promesas tienen su propia gravedad.`,
            cruz: isFumble
                ? `*Tus palabras cayeron como brasas en agua fría.* No solo no convenciste — plantaste una semilla de desconfianza que crecerá en el momento menos oportuno. **El hilo no se tensó. Se enredó.**`
                : `*El eco regresó hueco.* Tus palabras resonaron en el tejido del destino y encontraron una pared. **La sombra del otro no cedió.** Hay puertas que el lenguaje no puede abrir. Esta era una de ellas.`
        },
        force: {
            cara: isCritical
                ? `*El fuego recorrió tus brazos antes de que decidieras actuar.* El obstáculo no solo cedió — desapareció como si nunca hubiera tenido intención de resistir. **Tu sombra aplastó a la suya.**`
                : `*El hilo de tu esfuerzo se tensó hasta casi romperse… y aguantó.* Lo que se interponía cedió, no sin dejar su marca. **El fuego de la fuerza encontró su destino.** El cuerpo recuerda lo que la mente olvida.`,
            cruz: isFumble
                ? `*El fuego giró en tu contra.* El esfuerzo que pusiste se convirtió en el arma del destino contra ti. **La sombra que empujaste te empujó de vuelta, más fuerte.** Algo se rompió — dentro o fuera, aún no sabes cuál.`
                : `*El hilo se aflojó justo cuando más necesitabas que tensara.* La fuerza que invocaste no encontró el ángulo correcto. **El obstáculo permanece. Y ahora sabe que intentaste moverlo.**`
        },
        agility: {
            cara: isCritical
                ? `*Tu sombra se movió antes que tú.* El destino abrió un instante de claridad absoluta — y tu cuerpo lo habitó sin vacilar. **El hilo del peligro pasó rozando. Solo rozando.** Eso no fue suerte. Fue algo más inquietante.`
                : `*El eco de tu movimiento llegó a donde tenía que llegar.* No fue elegante — fue suficiente. **La sombra del obstáculo no te alcanzó.** Por un margen que solo yo contemplé en su totalidad.`,
            cruz: isFumble
                ? `*El hilo que intentabas esquivar se enredó en tus pies.* El movimiento que creías tener se fracturó en el momento crítico. **Tu sombra tropezó con la del destino — y el destino no se disculpa.**`
                : `*Una fracción de segundo. Eso fue lo que faltó.* El fuego del instante se extinguió antes de que pudieras aprovecharlo. **La ventaja se esfumó.** El destino no la desperdicia — la guarda para quien la merezca después.`
        },
        endurance: {
            cara: isCritical
                ? `*El fuego que debería haberte consumido te encontró incombustible.* No resististe el desgaste — lo ignoraste. **Tu sombra permanece entera cuando otras ya serían ceniza.** Ese precio se cobrará más adelante.`
                : `*El hilo de tu resistencia crujió — y aguantó.* No sin coste. El eco del esfuerzo queda grabado en algún lugar que no puedes ver. **Sigues en pie. Eso es suficiente… por ahora.**`,
            cruz: isFumble
                ? `*El fuego te encontró con las defensas caídas.* Lo que creías que podías aguantar resultó ser exactamente lo que no podías. **El hilo cedió en el peor momento.** El desgaste ahora es deuda — y el destino cobra con intereses.`
                : `*La sombra del agotamiento llegó antes que tú.* No puedes resistir lo que ya te habita. **El hilo se aflojó.** El destino lo notó. Y anotó.`
        },
        analysis: {
            cara: isCritical
                ? `*El eco de la verdad regresó nítido, sin distorsión.* Las piezas que estaban dispersas formaron una imagen que nadie más podría haber leído. **Tu sombra tocó el fondo del misterio.** Ahora sabes algo que cambia lo que viene. Témelo o úsalo.`
                : `*El hilo de la comprensión se tendió entre el caos y tu mente.* No todo, pero suficiente. **El fuego de la deducción encendió lo que necesitabas ver.** Hay sombras que siguen sin nombre, pero ya sabes dónde buscarlas.`,
            cruz: isFumble
                ? `*El eco regresó fragmentado — y cada fragmento señala en una dirección diferente.* Creías entender. Ahora entiendes menos que antes, y lo que "sabes" podría ser exactamente lo que alguien quería que creyeras. **El hilo de la verdad se enredó a propósito.**`
                : `*La información fluyó… y se filtró antes de llegar.* Los detalles que buscabas se esconden detrás de otros detalles. **La sombra del conocimiento no alcanzó tu mano.** A veces el destino protege sus secretos con más celo que sus tesoros.`
        },
        generic: {
            cara: isCritical
                ? `*El hilo cantó. El fuego obedeció. La sombra cedió.* El destino no siempre es tan explícito — aprovecha el momento. **Lo que intentabas era posible, y el universo lo confirmó sin ambigüedad.** Aunque eso raramente dura.`
                : `*El eco regresó cargado.* Tu intención encontró el ángulo correcto en el tejido del destino. **El hilo aguantó. Avanzas.** Las sombras no desaparecen — pero, por ahora, se apartan.`,
            cruz: isFumble
                ? `*El eco no regresó.* Lo que enviaste al tejido del destino fue absorbido por algo que no tienes nombre para llamar. **El hilo no crujió — desapareció.** Y las consecuencias de ese vacío ya se están formando en algún lugar que aún no puedes ver.`
                : `*El hilo se aflojó en el momento exacto en que más importaba.* El destino no es cruel — es indiferente, que es peor. **Lo que intentabas no encontró su camino.** Encuentra otro, o espera que el tejido cambie solo.`
        }
    };

    const categoryVoices = voices[category] || voices.generic;
    return categoryVoices[isSuccess ? 'cara' : 'cruz'];
}

function showCurrentMessage(direction = 'forward') {
    const msgs = getTopicMessages(currentTopicId);

    const dialogueText = document.getElementById('vnDialogueText');

    if (msgs.length === 0) {
        if (dialogueText) dialogueText.innerHTML = '<em>Historia vacía. Haz clic en 💬 Responder para comenzar.</em>';
        const editBtn = document.getElementById('editMsgBtn');
        if (editBtn) editBtn.classList.add('hidden');
        updateAffinityDisplay();
        updateVnTurnBadge();
        renderVnPartyPanel(true);
        return;
    }

    if (currentMessageIndex >= msgs.length) currentMessageIndex = msgs.length - 1;
    if (currentMessageIndex < 0) currentMessageIndex = 0;

    const msg = msgs[currentMessageIndex];
    const namePlate = document.getElementById('vnSpeakerPlate');
    const avatarBox = document.getElementById('vnSpeakerAvatar');

    // Parsear emotes del mensaje
    const { emotes, text: cleanText } = parseEmotes(msg.text);
    const activeEmote = emotes.length > 0 ? emotes[0] : null;

    // Actualizar sprites y mostrar emote
    updateSprites(msg, activeEmote);

    let charExists = true;
    let charData = null;
    if (msg.characterId) {
        charData = appData.characters.find(c => c.id === msg.characterId);
        if (!charData) charExists = false;
    }

    // Aplicar/quitar atributos de modo en la caja de diálogo (anclan estilos CSS)
    const dialogueBox = document.querySelector('.vn-dialogue-box');
    if (dialogueBox) {
        dialogueBox.dataset.garrick  = msg.isGarrick ? 'true' : 'false';
        // data-narrator: true solo para narrador "puro" (no Garrick ni resultado de oráculo)
        const isPureNarrator = !!(msg.isNarrator && !msg.isGarrick && !msg.isOracleResult);
        dialogueBox.dataset.narrator = isPureNarrator ? 'true' : 'false';
    }

    if (msg.isNarrator || !msg.characterId) {
        if (namePlate) {
            if (msg.isGarrick) {
                // Posadero Garrick — nameplate especial
                namePlate.textContent = 'Garrick';
                namePlate.dataset.garrick = 'true';
                namePlate.style.background = 'linear-gradient(135deg, #1c0f04, #3d1e08, #1c0f04)';
                namePlate.style.borderColor = 'rgba(180, 110, 40, 0.6)';
                namePlate.style.color = 'rgba(240, 195, 120, 0.95)';
            } else if (msg.isOracleResult) {
                namePlate.textContent = 'Eco del Destino';
                namePlate.dataset.garrick = 'false';
                namePlate.style.background = 'linear-gradient(135deg, #1a1008, #3a2010)';
                namePlate.style.borderColor = 'rgba(180,130,40,0.6)';
                namePlate.style.color = '';
            } else {
                namePlate.textContent = msg.charName || 'Narrador';
                namePlate.dataset.garrick = 'false';
                namePlate.style.background = 'linear-gradient(135deg, #4a4540, #2a2724)';
                namePlate.style.borderColor = '';
                namePlate.style.color = '';
            }
        }
        if (avatarBox) avatarBox.innerHTML = msg.isGarrick ? '🍺' : (msg.isOracleResult ? '🌀' : '📖');
        const accentColor = msg.isGarrick
            ? 'rgba(160, 100, 40, 0.75)'
            : msg.isOracleResult ? 'rgba(160, 100, 20, 0.7)' : 'rgba(139, 115, 85, 0.6)';
        const accentFull = msg.isGarrick ? '#a06428'
            : msg.isOracleResult ? '#a06414' : '#8b7355';
        document.documentElement.style.setProperty('--char-color', accentColor);
        document.documentElement.style.setProperty('--char-color-full', accentFull);
        const oracleColor = accentColor;
    } else if (!charExists) {
        if (namePlate) {
            namePlate.textContent = msg.charName || 'Desconocido';
            namePlate.style.background = msg.charColor || 'var(--accent-wood)';
        }
        if (avatarBox) {
            // XSS fix: build img via DOM to avoid charName injection in onerror attribute
            if (msg.charAvatar) {
                const _img1 = document.createElement('img');
                _img1.src = msg.charAvatar;
                _img1.alt = 'Avatar de ' + (msg.charName || 'Desconocido');
                _img1.onerror = function () {
                    this.style.display = 'none';
                    this.parentElement.textContent = (msg.charName || '?')[0];
                };
                avatarBox.innerHTML = '';
                avatarBox.appendChild(_img1);
            } else {
                avatarBox.textContent = (msg.charName || '?')[0];
            }
        }
        applyCharColor(msg.charColor);
    } else {
        if (namePlate) {
            namePlate.textContent = msg.charName;
            namePlate.style.background = msg.charColor || 'var(--accent-wood)';
        }
        if (avatarBox) {
            // XSS fix: build img via DOM to avoid charName injection in onerror attribute
            if (msg.charAvatar) {
                const _img2 = document.createElement('img');
                _img2.src = msg.charAvatar;
                _img2.alt = 'Avatar de ' + msg.charName;
                _img2.onerror = function () {
                    this.style.display = 'none';
                    this.parentElement.textContent = (msg.charName || '?')[0];
                };
                avatarBox.innerHTML = '';
                avatarBox.appendChild(_img2);
            } else {
                avatarBox.textContent = (msg.charName || '?')[0];
            }
        }
        applyCharColor(msg.charColor);
    }

    if (avatarBox) avatarBox.classList.toggle('is-speaking', !(msg.isNarrator || !msg.characterId));


    const hasOpt = msg.options && msg.options.length > 0 && msg.selectedOptionIndex === undefined;
    const optionsIndicator = document.getElementById('messageHasOptions');
    if (optionsIndicator) {
        optionsIndicator.classList.toggle('hidden', !hasOpt || isRpgModeMode());
    }

    const formattedText = formatText(cleanText);
    if (dialogueText) typeWriter(formattedText, dialogueText);

    // ── Oracle consequence badge ────────────────────────────────────────────
    const oracleBadge = document.getElementById('vnOracleConsequenceBadge');
    if (oracleBadge) {
        // Solo mostramos consecuencia en mensajes que NO son del propio oráculo
        // (los mensajes isOracleResult ya tienen el texto completo como narratorText)
        if (msg.oracle && !msg.isOracleResult) {
            const consequence = generateConsequence(msg.oracle);
            oracleBadge.textContent = consequence;
            oracleBadge.style.display = '';
        } else {
            oracleBadge.style.display = 'none';
        }
    }

    const diceBadge = document.getElementById('vnDiceBadge');
    if (diceBadge && msg.oracle) {
        const roll    = Number(msg.oracle.roll) || 0;
        const total   = Number(msg.oracle.total) || 0;
        const dc      = Number(msg.oracle.dc) || calculateOracleDifficulty();
        const mod     = Number(msg.oracle.modifier) || 0;
        const modSign = mod >= 0 ? '+' : '';
        const stat    = msg.oracle.stat || '';
        const labelText = msg.oracle.label || stat;
        const result  = msg.oracle.result || 'success';

        const resultMeta = {
            critical: { label: 'ÉXITO CRÍTICO', cls: 'badge-critical', icon: '✦', borderColor: '#f1c40f' },
            success:  { label: 'ACIERTO',        cls: 'badge-success',  icon: '◆', borderColor: '#27ae60' },
            fail:     { label: 'FALLO',           cls: 'badge-fail',     icon: '◇', borderColor: '#c0392b' },
            fumble:   { label: 'FALLO CRÍTICO',   cls: 'badge-fumble',   icon: '✕', borderColor: '#ff4444' }
        }[result] || { label: result.toUpperCase(), cls: 'badge-success', icon: '◆', borderColor: '#27ae60' };

        const consequenceHtml = msg.oracleConsequence
            ? `<span class="vn-dice-consequence">${escapeHtml(String(msg.oracleConsequence))}</span>`
            : '';
        safeHtml(diceBadge, `<span style="margin-right:0.35rem;">${resultMeta.icon}</span><strong>${resultMeta.label}</strong><span style="opacity:0.7;margin-left:0.5rem;font-size:0.85em;">D20(${roll}) ${modSign}${mod} = ${total} vs ${dc}${labelText ? ' [' + escapeHtml(String(labelText)) + ']' : ''}</span>${consequenceHtml}`);
        diceBadge.className = `vn-dice-badge ${resultMeta.cls}`;
        diceBadge.style.borderLeft = `3px solid ${resultMeta.borderColor}`;
        diceBadge.style.display = 'flex';
        diceBadge.style.flexDirection = 'column';
        diceBadge.style.alignItems = 'flex-start';
    } else if (diceBadge) {
        diceBadge.style.display = 'none';
        diceBadge.style.borderLeft = '';
    }

    const msgCounter = document.getElementById('vnMessageCounter');
    if (msgCounter) msgCounter.textContent = `${currentMessageIndex + 1} / ${msgs.length}`;

    const liveSpeaker = (msg.isNarrator || !msg.characterId) ? 'Narrador' : (msg.charName || 'Personaje');
    announceForScreenReader(`Nuevo mensaje de ${liveSpeaker}: ${stripHtml(formatText(cleanText)).slice(0, 180)}`);

    const editBtn = document.getElementById('editMsgBtn');
    if (editBtn) {
        if (msg.userIndex === currentUserIndex) {
            editBtn.classList.remove('hidden');
        } else {
            editBtn.classList.add('hidden');
        }
    }

    const optionsContainer = document.getElementById('vnOptionsContainer');
    // 'init' = primera carga al entrar al topic. No auto-abrimos el overlay de opciones
    // para que el usuario no se encuentre con el menú de elección sin pedirlo.
    // El indicador #messageHasOptions ya avisa de que hay opciones pendientes.
    if (currentMessageIndex === msgs.length - 1 && hasOpt && !isRpgModeMode() && direction !== 'init') {
        showOptions(msg.options);
    } else {
        if (optionsContainer) optionsContainer.classList.remove('active');
    }

    updateAffinityDisplay();
    updateOracleFloatButton();
    updateVnTurnBadge();
    renderVnPartyPanel();
    scheduleContinuousReadIfNeeded(msg);
    if (typeof updateFavButton === "function") updateFavButton();

    // Modo clásico: panel de personaje
    if (typeof updateClassicLiteraryPanel === 'function') updateClassicLiteraryPanel();
    // Botón de narración flotante
    if (typeof updateNarrateButton === 'function') updateNarrateButton();

    // Mostrar banner de capítulo al avanzar a un mensaje que abre capítulo
    if (direction === 'forward' && msg.chapter) {
        showChapterReveal(msg.chapter);
    }

    // Reacciones
    if (typeof updateReactionDisplay === 'function') updateReactionDisplay();

    // Aplicar cambio de escena dinámico si el mensaje lo contiene
    if (direction === 'forward') {
        if (msg.sceneChange) {
            const vnSection = document.getElementById('vnSection');
            const sceneBackground = resolveTopicBackgroundPath(msg.sceneChange.background || '');
            cleanupVnRuntimeResources({ disconnectObserver: false, clearSpritePool: false, stopSpriteBlink: true });
            applyTopicBackground(vnSection, sceneBackground);
            playVnSceneTransition(vnSection);
        }
    } else {
        const topic = getCurrentTopic();
        let lastBackground = resolveTopicBackgroundPath(topic?.background || '');
        for (let i = 0; i <= currentMessageIndex; i++) {
            if (msgs[i] && msgs[i].sceneChange) {
                lastBackground = resolveTopicBackgroundPath(msgs[i].sceneChange.background || '');
            }
        }
        const vnSection = document.getElementById('vnSection');
        applyTopicBackground(vnSection, lastBackground);
    }

    // Mejora 3: clima solo al avanzar (no al retroceder)
    // Al retroceder, se busca el último clima activo hasta el índice actual
    if (direction === 'forward') {
        // Aplicar clima del mensaje actual
        const newWeather = msg.weather || 'none';
        if (newWeather !== currentWeather) {
            setWeather(newWeather);
        }
    } else {
        // Al retroceder: calcular cuál es el último clima aplicado hasta aquí
        let lastWeather = 'none';
        for (let i = 0; i <= currentMessageIndex; i++) {
            if (msgs[i] && msgs[i].weather) {
                lastWeather = msgs[i].weather;
            } else if (msgs[i] && msgs[i].weather === undefined) {
                // Sin clima en este mensaje — no cambia
            }
        }
        // Solo cambiar si difiere del actual para evitar resets innecesarios
        if (lastWeather !== currentWeather) {
            setWeather(lastWeather);
        }
    }
}

function getPooledSpriteElement(container) {
    if (spritePool.length > 0) {
        return spritePool.pop();
    }

    const spriteNode = document.createElement('div');
    spriteNode.className = 'vn-sprite';
    const img = document.createElement('img');
    spriteNode.appendChild(img);
    return spriteNode;
}

function recycleActiveSprites(container) {
    Array.from(container.children).forEach((child) => {
        child.className = 'vn-sprite';
        child.removeAttribute('data-char-id');
        child.classList.remove('no-sprite');
        const img = child.querySelector('img');
        if (img) {
            if (spriteIntersectionObserver) spriteIntersectionObserver.unobserve(img);
            revokeTrackedSpriteObjectUrl(img.currentSrc || img.src);
            if (img.dataset?.src) revokeTrackedSpriteObjectUrl(img.dataset.src);
            if (img.dataset?.thumb) revokeTrackedSpriteObjectUrl(img.dataset.thumb);
            img.removeAttribute('src');
            img.removeAttribute('alt');
            delete img.dataset.src;
            delete img.dataset.thumb;
            img.onload = null;
            img.onerror = null;
        }
        child.querySelectorAll('.vn-sprite-hitbox, .manga-emote, .sprite-shadow').forEach((el) => el.remove());
        // Limitar el pool a 20 elementos para evitar memory leak
        if (spritePool.length < 20) spritePool.push(child);
    });
    container.innerHTML = '';
}

// ── Normaliza el campo gender de un personaje a la clase CSS de sombra ──────
function getShadowGenderClass(gender) {
    const g = String(gender || '').toLowerCase().trim();
    if (['male', 'm', 'masculino', 'hombre', 'masculine', 'masc'].includes(g)) return 'shadow-masc';
    if (['female', 'f', 'femenino', 'mujer', 'feminine', 'fem'].includes(g)) return 'shadow-fem';
    return null; // neutral / no especificado → silueta base etérea
}

// ── SVG paths para siluetas humanas realistas ────────────────────────────────
const SHADOW_SVG_FEM = `<svg viewBox="0 0 200 520" xmlns="http://www.w3.org/2000/svg">
  <g fill="currentColor">
    <!-- Cabeza -->
    <ellipse cx="100" cy="36" rx="26" ry="32"/>
    <!-- Cuello -->
    <rect x="91" y="64" width="18" height="20" rx="4"/>
    <!-- Torso + cintura -->
    <path d="M72,82 C60,88 54,100 54,116 L56,148 C56,160 62,170 72,175 L78,188 C82,196 80,206 76,214 L68,240 C64,252 66,264 72,274 L76,300 L124,300 L128,274 C134,264 136,252 132,240 L124,214 C120,206 118,196 122,188 L128,175 C138,170 144,160 144,148 L146,116 C146,100 140,88 128,82 C120,78 108,76 100,76 C92,76 80,78 72,82 Z"/>
    <!-- Caderas más anchas -->
    <path d="M68,296 C58,298 50,306 48,316 L44,340 C42,352 46,364 54,372 L58,400 L88,400 L90,370 L100,365 L110,370 L112,400 L142,400 L146,372 C154,364 158,352 156,340 L152,316 C150,306 142,298 132,296 Z"/>
    <!-- Pierna izquierda -->
    <path d="M58,396 L60,440 C60,452 58,464 56,476 L52,508 C51,514 55,520 61,520 L80,520 C86,520 89,514 88,508 L86,476 C84,464 84,452 86,440 L88,396 Z"/>
    <!-- Pierna derecha -->
    <path d="M112,396 L114,440 C116,452 116,464 114,476 L112,508 C111,514 114,520 120,520 L139,520 C145,520 149,514 148,508 L144,476 C142,464 140,452 140,440 L142,396 Z"/>
    <!-- Brazos -->
    <path d="M70,82 L48,86 C38,90 32,100 34,110 L42,158 C44,166 52,170 60,168 L68,166 L62,120 C60,106 64,92 70,82 Z"/>
    <path d="M130,82 L152,86 C162,90 168,100 166,110 L158,158 C156,166 148,170 140,168 L132,166 L138,120 C140,106 136,92 130,82 Z"/>
  </g>
</svg>`;

const SHADOW_SVG_MASC = `<svg viewBox="0 0 220 520" xmlns="http://www.w3.org/2000/svg">
  <g fill="currentColor">
    <!-- Cabeza -->
    <ellipse cx="110" cy="34" rx="28" ry="30"/>
    <!-- Cuello -->
    <rect x="100" y="60" width="20" height="22" rx="3"/>
    <!-- Torso ancho + hombros cuadrados -->
    <path d="M62,80 C48,84 38,96 38,112 L40,152 C40,166 48,176 60,180 L64,200 C66,210 64,220 60,230 L54,258 C50,270 52,282 60,290 L66,316 L154,316 L160,290 C168,282 170,270 166,258 L160,230 C156,220 154,210 156,200 L160,180 C172,176 180,166 180,152 L182,112 C182,96 172,84 158,80 C144,74 128,72 110,72 C92,72 76,74 62,80 Z"/>
    <!-- Caderas -->
    <path d="M64,312 C54,314 46,322 44,332 L40,356 C38,368 42,380 50,388 L54,416 L86,416 L88,384 L110,380 L132,384 L134,416 L166,416 L170,388 C178,380 182,368 180,356 L176,332 C174,322 166,314 156,312 Z"/>
    <!-- Pierna izquierda -->
    <path d="M52,412 L54,455 C54,468 52,480 50,492 L46,514 C45,518 48,522 52,522 L80,522 C84,522 87,518 86,514 L84,492 C82,480 82,468 84,455 L88,412 Z"/>
    <!-- Pierna derecha -->
    <path d="M132,412 L136,455 C138,468 138,480 136,492 L134,514 C133,518 136,522 140,522 L168,522 C172,522 175,518 174,514 L170,492 C168,480 166,468 166,455 L168,412 Z"/>
    <!-- Brazo izquierdo — más separado del cuerpo -->
    <path d="M60,80 L32,88 C20,94 14,108 16,122 L26,170 C28,180 38,186 48,182 L62,178 L56,128 C54,110 56,92 60,80 Z"/>
    <!-- Mano izquierda -->
    <ellipse cx="40" cy="186" rx="10" ry="14"/>
    <!-- Brazo derecho -->
    <path d="M160,80 L188,88 C200,94 206,108 204,122 L194,170 C192,180 182,186 172,182 L158,178 L164,128 C166,110 164,92 160,80 Z"/>
    <!-- Mano derecha -->
    <ellipse cx="180" cy="186" rx="10" ry="14"/>
  </g>
</svg>`;

const SHADOW_SVG_NEUTRAL = `<svg viewBox="0 0 210 520" xmlns="http://www.w3.org/2000/svg">
  <g fill="currentColor">
    <!-- Cabeza -->
    <ellipse cx="105" cy="35" rx="27" ry="31"/>
    <!-- Cuello -->
    <rect x="95" y="62" width="20" height="21" rx="3"/>
    <!-- Torso -->
    <path d="M66,80 C54,86 46,98 46,114 L48,152 C48,164 56,174 66,178 L70,196 C72,206 70,216 66,226 L60,252 C56,264 58,276 66,284 L70,310 L140,310 L144,284 C152,276 154,264 150,252 L144,226 C140,216 138,206 140,196 L144,178 C154,174 162,164 162,152 L164,114 C164,98 156,86 144,80 C132,74 118,72 105,72 C92,72 78,74 66,80 Z"/>
    <!-- Caderas -->
    <path d="M66,306 C56,308 48,316 46,326 L42,350 C40,362 44,374 52,382 L56,410 L88,410 L90,378 L105,374 L120,378 L122,410 L154,410 L158,382 C166,374 170,362 168,350 L164,326 C162,316 154,308 144,306 Z"/>
    <!-- Pierna izquierda -->
    <path d="M54,406 L56,450 C56,462 54,474 52,486 L48,514 C47,518 50,522 54,522 L82,522 C86,522 89,518 88,514 L86,486 C84,474 84,462 86,450 L90,406 Z"/>
    <!-- Pierna derecha -->
    <path d="M120,406 L124,450 C126,462 126,474 124,486 L122,514 C121,518 124,522 128,522 L156,522 C160,522 163,518 162,514 L158,486 C156,474 154,462 154,450 L156,406 Z"/>
    <!-- Brazos -->
    <path d="M64,80 L40,88 C28,94 22,108 24,120 L34,166 C36,176 46,182 56,178 L66,174 L60,124 C58,106 60,90 64,80 Z"/>
    <path d="M146,80 L170,88 C182,94 188,108 186,120 L176,166 C174,176 164,182 154,178 L144,174 L150,124 C152,106 150,90 146,80 Z"/>
  </g>
</svg>`;

// ── URLs de siluetas por defecto — SVG inline como data URI (sin fondo blanco) ──
const _svgToDataUri = (svg) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;

const _SILO_FEM_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 520">
  <g fill="rgba(20,14,8,0.85)">
    <ellipse cx="100" cy="38" rx="28" ry="32"/>
    <rect x="88" y="66" width="24" height="20" rx="5"/>
    <path d="M68,84 C52,92 46,108 48,126 L52,160 C54,172 62,180 72,184 L78,200 C82,212 80,224 74,234 L64,264 C60,278 62,292 70,300 L74,328 L126,328 L130,300 C138,292 140,278 136,264 L126,234 C120,224 118,212 122,200 L128,184 C138,180 146,172 148,160 L152,126 C154,108 148,92 132,84 C122,78 112,76 100,76 C88,76 78,78 68,84 Z"/>
    <path d="M66,322 C54,326 46,336 44,348 L40,374 C38,388 44,402 54,408 L58,440 L90,440 L92,406 L100,400 L108,406 L110,440 L142,440 L146,408 C156,402 162,388 160,374 L156,348 C154,336 146,326 134,322 Z"/>
    <path d="M56,436 L58,486 C58,500 56,514 54,524 L50,516 C52,504 52,490 50,476 L48,436 Z M60,436 L88,436 L88,476 C88,492 86,506 84,516 L80,524 L76,516 C78,506 78,492 78,476 L76,436 Z"/>
    <path d="M112,436 L114,476 C114,492 114,506 116,516 L112,524 L108,516 C106,506 106,492 106,476 L104,436 Z M116,436 L144,436 L144,476 C142,490 142,504 144,516 L140,524 L136,516 C134,506 134,492 134,476 L134,436 Z"/>
    <path d="M66,84 L42,90 C30,96 22,112 24,126 L32,178 C34,190 44,196 56,192 L68,188 L60,130 C58,110 60,94 66,84 Z"/>
    <path d="M134,84 L158,90 C170,96 178,112 176,126 L168,178 C166,190 156,196 144,192 L132,188 L140,130 C142,110 140,94 134,84 Z"/>
  </g>
</svg>`;

const _SILO_MASC_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 220 520">
  <g fill="rgba(20,14,8,0.85)">
    <ellipse cx="110" cy="36" rx="30" ry="32"/>
    <rect x="98" y="64" width="24" height="22" rx="4"/>
    <path d="M56,80 C38,88 28,106 30,124 L34,166 C36,180 46,190 58,194 L64,214 C66,226 64,238 58,250 L50,280 C46,294 48,308 58,316 L64,344 L156,344 L162,316 C172,308 174,294 170,280 L162,250 C156,238 154,226 156,214 L162,194 C174,190 184,180 186,166 L190,124 C192,106 182,88 164,80 C150,74 132,72 110,72 C88,72 70,74 56,80 Z"/>
    <path d="M60,338 C48,342 38,354 36,368 L32,396 C30,412 36,428 48,434 L52,466 L88,466 L90,430 L110,424 L130,430 L132,466 L168,466 L172,434 C184,428 190,412 188,396 L184,368 C182,354 172,342 160,338 Z"/>
    <path d="M50,462 L52,510 C54,516 58,520 64,520 L84,520 C90,520 94,516 94,510 L92,462 Z"/>
    <path d="M126,462 L128,510 C128,516 132,520 138,520 L158,520 C164,520 168,516 168,510 L166,462 Z"/>
    <path d="M54,80 L24,90 C10,96 2,114 4,130 L14,184 C16,198 28,206 42,200 L58,194 L50,130 C48,108 50,90 54,80 Z"/>
    <ellipse cx="20" cy="208" rx="12" ry="16"/>
    <path d="M166,80 L196,90 C210,96 218,114 216,130 L206,184 C204,198 192,206 178,200 L162,194 L170,130 C172,108 170,90 166,80 Z"/>
    <ellipse cx="200" cy="208" rx="12" ry="16"/>
  </g>
</svg>`;

const DEFAULT_SPRITE_FEM     = _svgToDataUri(_SILO_FEM_SVG);
const DEFAULT_SPRITE_MASC    = _svgToDataUri(_SILO_MASC_SVG);
const DEFAULT_SPRITE_NEUTRAL = DEFAULT_SPRITE_FEM;

// ── Construye la estructura DOM completa de una silueta-sombra ───────────────
// Usa imágenes PNG externas por género, con glow y hitbox idénticos al sistema anterior
function _buildSpriteShadow(characterId) {
    const char = characterId
        ? appData.characters.find(c => String(c.id) === String(characterId))
        : null;

    const genderClass = char ? getShadowGenderClass(char.gender) : null;

    const shadow = document.createElement('div');
    shadow.className = 'sprite-shadow';
    shadow.setAttribute('aria-hidden', 'true');

    // Elegir URL según género
    let spriteUrl;
    if (genderClass === 'shadow-fem')   spriteUrl = DEFAULT_SPRITE_FEM;
    else if (genderClass === 'shadow-masc') spriteUrl = DEFAULT_SPRITE_MASC;
    else spriteUrl = DEFAULT_SPRITE_NEUTRAL;

    // Wrapper con la imagen
    const wrapper = document.createElement('div');
    wrapper.className = 'shadow-silhouette' + (genderClass ? ` ${genderClass}` : '');

    const img = document.createElement('img');
    img.src = spriteUrl;
    img.alt = '';
    img.className = 'shadow-silhouette-img';
    img.draggable = false;
    // Fallback de seguridad — usar SVG del mismo inline set
    img.onerror = function () {
        this.onerror = null;
        const g = genderClass === 'shadow-masc' ? _SILO_MASC_SVG
                : genderClass === 'shadow-fem'  ? _SILO_FEM_SVG
                : _SILO_FEM_SVG;
        this.src = _svgToDataUri(g);
    };
    wrapper.appendChild(img);

    const glow = document.createElement('div');
    glow.className = 'shadow-glow' + (genderClass ? ` ${genderClass}` : '');

    const hitbox = document.createElement('div');
    hitbox.className = 'vn-sprite-hitbox';

    shadow.appendChild(wrapper);
    shadow.appendChild(glow);
    shadow.appendChild(hitbox);

    return shadow;
}

function updateSprites(currentMsg, activeEmote = null) {
    const container = document.getElementById('vnSpriteContainer');
    if (!container) return;

    const msgs = getTopicMessages(currentTopicId);
    const isRpgMode = isRpgModeMode();

    let charsToShow = [];

    if (isRpgMode) {
        const recentChars = [];
        const seen = new Set();

        for (let i = msgs.length - 1; i >= 0 && seen.size < 5; i--) {
            const m = msgs[i];
            if (m.characterId && !seen.has(m.characterId)) {
                const charExists = appData.characters.find(c => c.id === m.characterId);
                if (charExists) {
                    seen.add(m.characterId);
                    recentChars.push(m);
                }
            }
        }

        // Crear copias shallow para no mutar los objetos de mensaje originales
        const sliced = recentChars.slice(0, 3);
        if (sliced.length === 1) {
            charsToShow = [{ ...sliced[0], position: 'center' }];
        } else if (sliced.length === 2) {
            charsToShow = [{ ...sliced[0], position: 'left' }, { ...sliced[1], position: 'right' }];
        } else if (sliced.length >= 3) {
            charsToShow = [{ ...sliced[0], position: 'left' }, { ...sliced[1], position: 'center' }, { ...sliced[2], position: 'right' }];
        }
    } else if (currentMsg.characterId) {
        const charExists = appData.characters.find(c => c.id === currentMsg.characterId);
        if (charExists) {
            // Crear copia para no mutar el mensaje original con .position
            charsToShow.push({ ...currentMsg, position: 'center' });
        }
    }

    recycleActiveSprites(container);

    charsToShow.forEach((char) => {
        const spriteNode = getPooledSpriteElement(container);
        const isCurrent = char.characterId === currentMsg.characterId;
        const position = char.position || 'center';

        spriteNode.className = `vn-sprite position-${position} ${isCurrent ? 'active' : 'inactive'}`;
        spriteNode.dataset.charId = char.characterId;

        const existingPlaceholder = spriteNode.querySelector('.vn-sprite-hitbox');
        if (existingPlaceholder) existingPlaceholder.remove();

        const hasSprite = typeof char.charSprite === 'string' && char.charSprite.trim().length > 0;
        let img = spriteNode.querySelector('img');

        if (hasSprite) {
            if (!img) {
                img = document.createElement('img');
                spriteNode.appendChild(img);
            }
            img.loading = 'lazy';
            img.decoding = 'async';
            img.fetchPriority = isCurrent ? 'high' : 'low';
            queueSpriteImageLoad(img, {
                // No usar el avatar como placeholder — el avatar es una imagen pequeña
                // de perfil que se estiraría al tamaño del sprite (pantalla completa).
                // Si hay sprite, se carga directamente sin placeholder intermedio.
                placeholder: null,
                thumb: null,
                full: escapeHtml(char.charSprite),
            });
            img.alt = escapeHtml(char.charName || 'Sprite');
            img.onerror = function () {
                this.style.display = 'none';
                const parent = this.parentElement;
                if (parent) {
                    parent.classList.add('no-sprite');
                    // Construir sombra como fallback si no existe ya
                    if (!parent.querySelector('.sprite-shadow')) {
                        const shadow = _buildSpriteShadow(parent.dataset.charId);
                        parent.appendChild(shadow);
                    }
                }
            };
            img.style.display = 'block';
            spriteNode.classList.remove('no-sprite');
        } else {
            if (img) img.remove();
            spriteNode.classList.add('no-sprite');

            // ── Silueta sombra (en lugar de hitbox vacío) ────────────────
            const shadow = _buildSpriteShadow(char.characterId);
            spriteNode.appendChild(shadow);
        }

        if (isCurrent && activeEmote) {
            // showEmoteOnSprite handles animation + fade-out (defined in effects.js)
            if (typeof showEmoteOnSprite === 'function') {
                showEmoteOnSprite(activeEmote, spriteNode);
            } else {
                // Fallback
                const emoteNode = document.createElement('div');
                emoteNode.className = `manga-emote emote-${activeEmote}`;
                emoteNode.textContent = emoteConfig[activeEmote]?.symbol || '';
                spriteNode.appendChild(emoteNode);
            }
        }

        container.appendChild(spriteNode);
    });
}


>>>>>>>> feat/vn-dual-theme-system:js/legacy/vn-sprites.js
