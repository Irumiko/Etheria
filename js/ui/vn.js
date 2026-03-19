// Modo novela visual: renderizado de mensajes, sprites, typewriter, reply panel, opciones y historial.
// ============================================
// MODO VN
// ============================================
// Variables para el debounce de sincronización al navegar mensajes
var _lastNavSyncTime = 0;
var _NAV_SYNC_DEBOUNCE_MS = 3000; // sincronizar como máximo cada 3 segundos al navegar
const DEFAULT_TOPIC_BACKGROUND =
    'https://raw.githubusercontent.com/Irumiko/Etheria/main/assets/backgrounds/default_background.jpg';
const DEFAULT_TOPIC_BACKGROUND_VARIANTS = [
    DEFAULT_TOPIC_BACKGROUND,
    'assets/backgrounds/default_background.jpg',
    '/assets/backgrounds/default_background.jpg'
];
const LEGACY_DEFAULT_TOPIC_BACKGROUNDS = [
    'default_scene',
    'assets/backgrounds/default_background.jpg',
    '/assets/backgrounds/default_background.jpg',
    'assets/backgrounds/default_scene.png',
    'Assets/backgrounds/default_scene.png',
    'assets/default_background.png',
    'Assets/default_background.png',
    'assets/backgrounds/default_background.png.jpg',
    'Assets/backgrounds/default_background.png.jpg',
    'assets/backgrounds/default-scene-sunset.png',
    'Assets/backgrounds/default-scene-sunset.png',
    'https://raw.githubusercontent.com/Irumiko/Etheria/main/assets/backgrounds/default_background.jpg'
];

const preloadedBackgrounds = new Set();
let pendingSceneChange = null;
let pendingChapter     = null;
let oracleStat = 'STR';
let oracleQuestionDirty = false;
// oracleModeActive está declarado en state.js

function isRpgTopicMode(mode) {
    return mode === 'rpg';
}

function getOracleModifier(statValue) {
    return Math.floor((Number(statValue || 10) - 10) / 2);
}

function calculateOracleDifficulty() {
    return 12;
}

function getOracleRollResult(roll, total) {
    if (roll === 1)  return 'fumble';
    if (roll === 20) return 'critical';
    return total >= calculateOracleDifficulty() ? 'success' : 'fail';
}

function getOracleResultLabel(result) {
    return { critical: 'ÉXITO CRÍTICO', success: 'ACIERTO', fail: 'FALLO', fumble: 'FALLO CRÍTICO' }[result] || result;
}

function showDiceResultOverlay(rollData) {
    // rollData: { roll, modifier, total, result, stat, statValue }
    const existing = document.getElementById('diceResultOverlay');
    if (existing) existing.remove();

    const cssClass = { critical: 'dice-result-critical', success: 'dice-result-success', fail: 'dice-result-fail', fumble: 'dice-result-fumble' }[rollData.result] || 'dice-result-success';
    const label = getOracleResultLabel(rollData.result);
    const modSign = rollData.modifier >= 0 ? '+' : '';
    const statHint = rollData.stat ? ` [${rollData.stat}]` : '';
    const advantageText = rollData.statValue >= 14 ? '<div class="dice-close-hint" style="color:rgba(107,221,154,0.7);margin-top:0.3rem;">▲ VENTAJA</div>'
                        : rollData.statValue <= 6  ? '<div class="dice-close-hint" style="color:rgba(221,107,107,0.7);margin-top:0.3rem;">▼ DESVENTAJA</div>'
                        : '';

    const overlay = document.createElement('div');
    overlay.id = 'diceResultOverlay';
    overlay.className = 'dice-result-overlay';
    overlay.innerHTML = `
        <div class="dice-result-box">
            <div class="dice-number ${cssClass}">${rollData.roll}</div>
            <div class="dice-result-label ${cssClass}">${label}</div>
            <div class="dice-close-hint" style="margin-top:0.5rem;font-size:0.95rem;color:rgba(220,210,190,0.75);">
                D20 (${rollData.roll}) ${modSign}${rollData.modifier} = ${rollData.total}${statHint}
            </div>
            ${advantageText}
            <div class="dice-close-hint" style="margin-top:1rem;">Clic para cerrar</div>
        </div>`;

    overlay.addEventListener('click', () => overlay.remove());
    document.body.appendChild(overlay);
    setTimeout(() => { if (document.getElementById('diceResultOverlay')) overlay.remove(); }, 4000);
}

function getOracleAutodetectedQuestion(rawText) {
    const trimmed = String(rawText || '').trim();
    if (!trimmed) return '';
    const sentence = trimmed.split('\n').map(part => part.trim()).find(Boolean) || trimmed;
    return sentence.length > 120 ? `${sentence.slice(0, 117)}...` : sentence;
}

function getOracleSelectedStatValue() {
    const char = appData.characters.find(c => c.id === selectedCharId);
    if (!char || typeof getRpgSheetData !== 'function') return 8;
    const profile = getRpgSheetData(char, currentTopicId || null)?.profile;
    const baseVal = Number(profile?.stats?.[oracleStat]) || 8;
    // Aplicar modificadores de condiciones activas
    const condMod = (typeof getConditionModifier === 'function' && profile)
        ? getConditionModifier(profile, oracleStat)
        : 0;
    return Math.max(1, baseVal + condMod);
}

function refreshOracleProbability() {
    // Actualiza el indicador de probabilidad en el mini-panel del oráculo
    const infoEl = document.getElementById('oracleMiniInfo');
    const statValue = getOracleSelectedStatValue();
    const modifier = getOracleModifier(statValue);
    const dc = calculateOracleDifficulty();
    const modSign = modifier >= 0 ? '+' : '';
    if (infoEl) infoEl.textContent = `D20 ${modSign}${modifier} vs ${dc}`;
}
function refreshOracleQuestionAutodetect(force = false) {
    // El autodetect ahora aplica al mini-panel del oráculo
    const questionInput = document.getElementById('oracleMiniQuestion');
    const replyText = document.getElementById('vnReplyText');
    if (!questionInput || !replyText) return;
    if (!force && oracleQuestionDirty) return;
    const autoQ = getOracleAutodetectedQuestion(replyText.value);
    if (autoQ && !questionInput.value.trim()) questionInput.value = autoQ;
}
function setOracleStat(nextStat) {
    oracleStat = ['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA'].includes(nextStat) ? nextStat : 'STR';
    document.querySelectorAll('.oracle-stat-btn').forEach((btn) => {
        btn.classList.toggle('active', btn.dataset.stat === oracleStat);
    });
    refreshOracleProbability();
}

function resetOraclePanelState() {
    // Resetea el estado del oráculo y cierra el mini-panel si está abierto
    if (typeof oracleStat !== 'undefined') oracleStat = 'STR';
    if (typeof oracleQuestionDirty !== 'undefined') oracleQuestionDirty = false;
    oracleModeActive = false;
    closeOracleMiniPanel();
    updateOracleFloatButton();
}
function setupOraclePanelForMode() {
    // El mini-panel del oráculo (vnOracleMiniPanel) se gestiona independientemente.
    // Esta función solo actualiza el botón flotante según el modo actual.
    updateOracleFloatButton();
    const topic = getCurrentTopic();
    const isRpg = isRpgTopicMode(topic?.mode || currentTopicMode);
    if (!isRpg) {
        closeOracleMiniPanel();
        resetOraclePanelState();
        return;
    }
    resetOraclePanelState();
    refreshOracleQuestionAutodetect(true);
}


function toggleOracleMode() {
    const topic = getCurrentTopic();
    if (!isRpgTopicMode(topic?.mode)) return;
    // El oráculo ahora usa el mini-panel independiente
    oracleModeActive = !oracleModeActive;
    if (oracleModeActive) {
        toggleOracleMiniPanel();
    } else {
        closeOracleMiniPanel();
    }
    updateOracleFloatButton();
}

function updateOracleFloatButton() {
    const floatBtn = document.getElementById('vnOracleFloatBtn');
    const topic = getCurrentTopic();
    const vnSection = document.getElementById('vnSection');
    if (!floatBtn) return;

    const isRpg = isRpgTopicMode(topic?.mode);
    const isInVn = !!vnSection?.classList.contains('active');
    // El botón ahora vive dentro de la caja de diálogo: se muestra si es RPG y estamos en VN
    const shouldShow = isRpg && isInVn;

    floatBtn.style.display = shouldShow ? 'inline-flex' : 'none';
    // Keep innkeeper button in sync too
    if (typeof updateNarrateButton === 'function') updateNarrateButton();
    floatBtn.classList.toggle('active', oracleModeActive);
    floatBtn.dataset.oracleActive = oracleModeActive ? 'true' : 'false';
}

function triggerOracleReply() {
    toggleOracleMiniPanel();
}

function toggleVnDialogEmotePicker(event) {
    if (event) { event.preventDefault(); event.stopPropagation(); }
    const popover = document.getElementById('vnDialogEmotePopover');
    if (!popover) return;
    const isOpen = popover.style.display !== 'none';
    popover.style.display = isOpen ? 'none' : 'flex';
    popover.setAttribute('aria-hidden', isOpen ? 'true' : 'false');
    if (!isOpen) {
        // Close on outside click
        setTimeout(() => {
            document.addEventListener('click', function _closeDialogEmote(e) {
                const btn = document.getElementById('vnEmoteDialogBtn');
                if (!popover.contains(e.target) && e.target !== btn && !btn?.contains(e.target)) {
                    popover.style.display = 'none';
                    popover.setAttribute('aria-hidden', 'true');
                    document.removeEventListener('click', _closeDialogEmote, true);
                }
            }, { once: false, capture: true });
        }, 50);
    }
}



// ---- Mini-panel del Oráculo ----
let oracleMiniStat = 'STR';

function toggleOracleMiniPanel() {
    const panel = document.getElementById('vnOracleMiniPanel');
    if (!panel) return;
    const isOpen = panel.style.display !== 'none';
    if (isOpen) { closeOracleMiniPanel(); return; }
    panel.style.display = 'block';
    refreshOracleMiniInfo();
    panel.querySelectorAll('.oracle-stat-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.stat === oracleMiniStat);
        btn.onclick = () => {
            oracleMiniStat = btn.dataset.stat;
            panel.querySelectorAll('.oracle-stat-btn').forEach(b =>
                b.classList.toggle('active', b.dataset.stat === oracleMiniStat));
            refreshOracleMiniInfo();
        };
    });
    const ta = document.getElementById('oracleMiniQuestion');
    if (ta) setTimeout(() => ta.focus(), 60);
}

function closeOracleMiniPanel() {
    const panel = document.getElementById('vnOracleMiniPanel');
    if (panel) panel.style.display = 'none';
}

function refreshOracleMiniInfo() {
    const infoEl = document.getElementById('oracleMiniInfo');
    if (!infoEl) return;
    const char = appData.characters.find(c => c.id === selectedCharId);
    const stats = (char && typeof getRpgSheetData === 'function')
        ? (getRpgSheetData(char, currentTopicId || null)?.profile?.stats || {})
        : {};
    const baseStatValue = Number(stats[oracleMiniStat]) || 8;
    // Aplicar modificadores de condiciones activas al stat
    const condMod = (char && typeof ensureCharacterRpgProfile === 'function' && typeof getConditionModifier === 'function')
        ? getConditionModifier(ensureCharacterRpgProfile(char, currentTopicId), oracleMiniStat)
        : 0;
    const statValue = Math.max(1, baseStatValue + condMod);
    const modifier = getOracleModifier(statValue);
    const dc = calculateOracleDifficulty();
    const sign = modifier >= 0 ? '+' : '';
    const advantage = statValue >= 14 ? ' · ▲ Ventaja' : statValue <= 6 ? ' · ▼ Desventaja' : '';
    infoEl.textContent = `D20 ${sign}${modifier} vs ${dc}${advantage}`;
}

function rollOracleMini() {
    const ta = document.getElementById('oracleMiniQuestion');
    const questionText = (ta?.value || '').trim();

    const char = appData.characters.find(c => c.id === selectedCharId);
    const stats = (char && typeof getRpgSheetData === 'function')
        ? (getRpgSheetData(char, currentTopicId || null)?.profile?.stats || {})
        : {};
    const baseStatValue = Number(stats[oracleMiniStat]) || 8;
    // Aplicar modificadores de condiciones activas al stat
    const condMod = (char && typeof ensureCharacterRpgProfile === 'function' && typeof getConditionModifier === 'function')
        ? getConditionModifier(ensureCharacterRpgProfile(char, currentTopicId), oracleMiniStat)
        : 0;
    const statValue = Math.max(1, baseStatValue + condMod);
    const modifier = getOracleModifier(statValue);
    const dc = calculateOracleDifficulty();
    const roll = Math.floor(Math.random() * 20) + 1;
    const total = Math.max(1, Math.min(20, roll + modifier));
    const result = getOracleRollResult(roll, total);
    const label = getOracleResultLabel(result);

    showDiceResultOverlay({ roll, modifier, total, result, stat: oracleMiniStat, statValue });
    closeOracleMiniPanel();
    if (ta) ta.value = '';

    // ══ VOZ: EL ECO DEL DESTINO ══════════════════════════════════════════════
    // Entidad teatral, fatalista. Segunda persona. Metáforas de hilos / sombras /
    // fuego / eco. Testigo que disfruta el espectáculo. Nunca certezas, siempre
    // presagios. Nunca menciona números directamente — los transforma en imagen.
    const _accion = questionText || 'lo que intentas';
    const _Accion = _accion.charAt(0).toUpperCase() + _accion.slice(1);

    const ecoVoices = {
        critical: [
            `*El hilo vibra con una frecuencia que no debería existir.* Escúchalo bien — el eco regresa amplificado, con el peso entero del destino detrás. **${_Accion}**: no solo era posible. Era inevitable. Aunque eso debería inquietarte más de lo que te alegra.`,
            `*Hay momentos en que el tejido del destino no cruza, sino que se funde.* Este es uno de ellos. Tu sombra se alargó hasta tocar lo que buscabas, y el eco no regresó — porque el eco *eras tú* todo el tiempo. **El destino se doblegó. Completamente.** Disfruta del calor. Dura menos de lo que crees.`,
            `*Silencio primero. Luego un destello que me hace parpadear.* Raramente contemplo algo así sin cierta admiración incómoda. El hilo no crujió — *cantó*. **${_Accion}: lo que le pediste al destino, el destino lo entregó sin regatear.** La próxima tirada no te conoce.`
        ],
        success: [
            `*El hilo se tensa… y aguanta.* No sin esfuerzo. No sin la sombra del fracaso rozándote. Pero aguanta. **${_Accion} — el destino decidió mirarte esta vez.** El fuego no te quema. Avanzas. No te acostumbres a ser observado con tanta benevolencia.`,
            `*Veo el eco de tu intención regresar distorsionado, pero reconocible.* El camino estaba cerrado. Lo forzaste lo suficiente. **La sombra cedió terreno. Sigues en pie.** Soy testigo de tu pequeño triunfo — y de los hilos que acabas de mover sin darte cuenta.`,
            `*El fuego vaciló antes de decidir en qué dirección arder.* Hoy ardió hacia ti. **${_Accion} tuvo el peso justo para inclinar la balanza.** El destino dice sí — aunque susurra advertencias que tal vez no estás escuchando.`
        ],
        fail: [
            `*El hilo se afloja.* Observa cómo cae — qué imagen tan honesta. El destino no te odia. Simplemente miraba hacia otro lado cuando más lo necesitabas. **La sombra de ${_accion} no llegó a su destino.** Eso tiene consecuencias. Siempre las tiene.`,
            `*El eco regresa vacío.* Tu acción resonó en el tejido del destino y encontró una pared de silencio frío. **El fuego que querías encender se apagó antes de nacer.** No es el fin — pero es un inicio diferente al que planeabas. Interesante, a mi manera.`,
            `*Contemplo el hilo roto y encuentro cierta belleza en ello.* El fracaso tiene su propia arquitectura. **${_Accion} no prosperó — el destino te cerró esa puerta con una cortesía que no merecías.** Las sombras ganan terreno. Por ahora.`
        ],
        fumble: [
            `*El hilo no solo se rompe — corta.* Aparta la mano, demasiado tarde. **${_Accion} abrió una grieta que no estaba en tus planes.** El eco no regresó — regresó transformado en algo que no reconocerás hasta que te haga daño. Soy testigo. Y debo admitir: el espectáculo mejora.`,
            `*El fuego decidió arder en la dirección equivocada.* Vi el momento exacto en que el destino dejó de ser neutral y se volvió adversario. **La sombra que caíste no es tuya — es de algo que acabas de despertar.** Sus consecuencias ya están en camino, aunque aún no puedas verlas.`,
            `*Silencio largo. Luego mi voz, muy baja.* Hay tiradas que no solo fallan — que reescriben lo que viene después. **${_Accion}: el hilo no crujió. Se deshilachó. Y cada hebra suelta tiene su propio destino ahora.** Yo lo veo todo. Tú, aún no.`
        ]
    };

    const _voices = ecoVoices[result] || ecoVoices.success;
    const narratorText = _voices[Math.floor(Math.random() * _voices.length)];

    const oracleData = {
        question: questionText || `Tirada de ${oracleMiniStat}`,
        stat: oracleMiniStat, statValue, modifier, dc, roll, total, result,
        timestamp: Date.now()
    };

    const topicMessages = getTopicMessages(currentTopicId);
    const topic = appData.topics.find(t => t.id === currentTopicId);
    const newMsg = {
        id: (globalThis.crypto?.randomUUID?.()) || `${Date.now()}_${Math.random().toString(16).slice(2)}`,
        characterId: null,
        charName: 'Eco del Destino',
        charColor: null, charAvatar: null, charSprite: null,
        text: narratorText,
        isNarrator: true,
        isOracleResult: true,
        userIndex: currentUserIndex,
        timestamp: new Date().toISOString(),
        oracle: oracleData
    };

    // Aplicar efectos mecánicos y guardar la consecuencia estructurada en el mensaje
    if (topic?.mode === 'rpg') {
        const char = appData.characters.find(c => String(c.id) === String(selectedCharId));
        const effects = applyRpgNarrativeProgress(selectedCharId, oracleData);
        if (effects) {
            const badgeText = buildConsequenceBadgeText(result, effects, char?.name);
            if (badgeText) newMsg.oracleConsequence = badgeText;
            // Guardar el nivel nuevo en effects para el badge
            if (effects.levelUp && char) {
                const profile = typeof ensureCharacterRpgProfile === 'function'
                    ? ensureCharacterRpgProfile(char, currentTopicId)
                    : null;
                if (profile) effects.newLevel = profile.level;
                newMsg.oracleConsequence = buildConsequenceBadgeText(result, effects, char?.name);
            }
        }
    }

    topicMessages.push(newMsg);
    if (typeof SupabaseMessages !== 'undefined' && currentTopicId) {
        SupabaseMessages.send(currentTopicId, newMsg).catch(() => {});
    }

    notifyNextTurnIfNeeded(newMsg, topic, null).catch(() => {});
    hasUnsavedChanges = true;
    save({ silent: true });
    currentMessageIndex = getTopicMessages(currentTopicId).length - 1;
    triggerDialogueFadeIn();
    showCurrentMessage('forward');
}

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
    if (topicMode === 'rpg') {
        vnSection.classList.remove('classic-mode', 'mode-classic');
        vnSection.classList.add('mode-rpg');
        document.body.classList.add('mode-rpg');
    } else {
        // Modo clásico: sprites desaparecen al avanzar
        vnSection.classList.add('classic-mode', 'mode-classic');
        vnSection.classList.remove('mode-rpg');
        document.body.classList.remove('mode-rpg');
        document.body.classList.add('mode-classic');
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

    // Aplicar/quitar atributo data-garrick en la caja de diálogo
    const dialogueBox = document.querySelector('.vn-dialogue-box');
    if (dialogueBox) {
        dialogueBox.dataset.garrick = msg.isGarrick ? 'true' : 'false';
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
        const result  = msg.oracle.result || 'success';

        const resultMeta = {
            critical: { label: 'ÉXITO CRÍTICO', cls: 'badge-critical', icon: '✦', borderColor: '#f1c40f' },
            success:  { label: 'ACIERTO',        cls: 'badge-success',  icon: '◆', borderColor: '#27ae60' },
            fail:     { label: 'FALLO',           cls: 'badge-fail',     icon: '◇', borderColor: '#c0392b' },
            fumble:   { label: 'FALLO CRÍTICO',   cls: 'badge-fumble',   icon: '✕', borderColor: '#ff4444' }
        }[result] || { label: result.toUpperCase(), cls: 'badge-success', icon: '◆', borderColor: '#27ae60' };

        const consequenceHtml = msg.oracleConsequence
            ? `<span class="vn-dice-consequence">${msg.oracleConsequence}</span>`
            : '';
        diceBadge.innerHTML = `<span style="margin-right:0.35rem;">${resultMeta.icon}</span><strong>${resultMeta.label}</strong><span style="opacity:0.7;margin-left:0.5rem;font-size:0.85em;">D20(${roll}) ${modSign}${mod} = ${total} vs ${dc}${stat ? ' [' + stat + ']' : ''}</span>${consequenceHtml}`;
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


function typeWriter(text, element) {
    stopTypewriter();

    isTyping = true;
    if (typeof syncVnStore === 'function') syncVnStore({ isTyping: true });
    element.innerHTML = '';
    const sessionId = typewriterSessionId;

    const indicator = document.getElementById('vnContinueIndicator');
    if (indicator) indicator.style.opacity = '0';

    const hasHtml = /<[^>]*>/g.test(text);

    if (prefersReducedMotion()) {
        element.innerHTML = text;
        isTyping = false;
        if (typeof syncVnStore === 'function') syncVnStore({ isTyping: false });
        if (indicator) indicator.style.opacity = '1';
        scheduleContinuousReadIfNeeded(getTopicMessages(currentTopicId)[currentMessageIndex]);
        return;
    }

    if (hasHtml) {
        element.innerHTML = text;
        element.style.opacity = '0';
        element.style.transition = 'opacity 0.4s ease';
        setTimeout(() => {
            if (sessionId !== typewriterSessionId) return;
            element.style.opacity = '1';
            isTyping = false;
            if (typeof syncVnStore === 'function') syncVnStore({ isTyping: false });
            if (indicator) indicator.style.opacity = '1';
            scheduleContinuousReadIfNeeded(getTopicMessages(currentTopicId)[currentMessageIndex]);
        }, 100);
        return;
    }

    // ── Typewriter dramático ──────────────────────────────────────
    // Divide el texto en tokens: palabras para modo rápido, chars para lento
    const wordsFastMode = textSpeed <= 25;
    const tokens = wordsFastMode ? (text.match(/\S+\s*/g) || [text]) : text.split('');
    let i = 0;
    let lastTick = 0;

    // Cada carácter se envuelve en un <span> que hace fade+slide in
    // Para no destruir el DOM en cada frame, usamos un DocumentFragment
    // y añadimos spans de uno en uno.
    const addToken = (token) => {
        // Los espacios se añaden sin span para no crear saltos
        if (token.trim() === '') {
            element.appendChild(document.createTextNode(token));
            return;
        }
        const span = document.createElement('span');
        span.className = 'tw-char';
        span.textContent = token;
        element.appendChild(span);
        // Forzar reflow para que la animación arranque
        void span.offsetWidth;
        span.classList.add('tw-char--in');
    };

    const step = (timestamp) => {
        if (sessionId !== typewriterSessionId) {
            typewriterInterval = null;
            return;
        }

        if (!lastTick || timestamp - lastTick >= textSpeed) {
            const chunkSize = wordsFastMode ? 2 : 1;
            let consumed = 0;
            while (consumed < chunkSize && i < tokens.length) {
                addToken(tokens[i]);
                i++;
                consumed++;
            }
            lastTick = timestamp;
        }

        if (i >= tokens.length) {
            stopTypewriter();
            if (indicator) indicator.style.opacity = '1';
            scheduleContinuousReadIfNeeded(getTopicMessages(currentTopicId)[currentMessageIndex]);
            return;
        }

        typewriterInterval = window.requestAnimationFrame(step);
    };

    typewriterInterval = window.requestAnimationFrame(step);
}

function handleDialogueClick() {
    // BUG-02: Si hay una escena RPG activa, el motor gestiona el avance
    // a través de _bindAdvanceOnce (scene:input:advance). No ejecutar la
    // lógica de navegación clásica para evitar efectos secundarios.
    if (typeof RPGEngine !== 'undefined' && RPGEngine.isRunning()) return;

    markContinuousInteraction();
    cancelContinuousRead('touch');
    const replyPanel = document.getElementById('vnReplyPanel');
    const optionsContainer = document.getElementById('vnOptionsContainer');
    const settingsPanel = document.getElementById('settingsPanel');
    const emotePicker = document.getElementById('emotePicker');

    if (replyPanel && replyPanel.style.display === 'flex') return;
    if (optionsContainer && optionsContainer.classList.contains('active')) return;
    if (settingsPanel && settingsPanel.classList.contains('active')) return;
    if (emotePicker && emotePicker.classList.contains('active')) return;

    const msgs = getTopicMessages(currentTopicId);

    if (isTyping) {
        stopTypewriter();
        const msg = msgs[currentMessageIndex];
        const dialogueText = document.getElementById('vnDialogueText');
        if (msg && dialogueText) {
            const { text: cleanText } = parseEmotes(msg.text);
            dialogueText.innerHTML = formatText(cleanText);
        }
        const indicator = document.getElementById('vnContinueIndicator');
        if (indicator) indicator.style.opacity = '1';
        scheduleContinuousReadIfNeeded(getTopicMessages(currentTopicId)[currentMessageIndex]);
        return;
    }

    if (pendingContinuation) {
        showContinuation(pendingContinuation);
        pendingContinuation = null;
        return;
    }

    if (currentMessageIndex < msgs.length - 1) {
        currentMessageIndex++;
        if (typeof syncVnStore === 'function') syncVnStore({ messageIndex: currentMessageIndex });
        if (typeof playSoundClick === 'function') playSoundClick();
        showCurrentMessage('forward');
        const _now1 = Date.now();
        if (_now1 - _lastNavSyncTime > _NAV_SYNC_DEBOUNCE_MS) {
            _lastNavSyncTime = _now1;
            syncBidirectional({ silent: true, allowRemotePrompt: true });
        }
    }
}

function previousMessage() {
    markContinuousInteraction();
    if (currentMessageIndex > 0) {
        currentMessageIndex--;
        if (typeof syncVnStore === 'function') syncVnStore({ messageIndex: currentMessageIndex });
        showCurrentMessage('backward');
    }
}

function firstMessage() {
    markContinuousInteraction();
    currentMessageIndex = 0;
    if (typeof syncVnStore === 'function') syncVnStore({ messageIndex: currentMessageIndex });
    showCurrentMessage('backward');
}

function nextMessage() {
    markContinuousInteraction();
    const msgs = getTopicMessages(currentTopicId);
    if (currentMessageIndex < msgs.length - 1) {
        currentMessageIndex++;
        if (typeof syncVnStore === 'function') syncVnStore({ messageIndex: currentMessageIndex });
        if (typeof playSoundClick === 'function') playSoundClick();
        showCurrentMessage('forward');
        const _now2 = Date.now();
        if (_now2 - _lastNavSyncTime > _NAV_SYNC_DEBOUNCE_MS) {
            _lastNavSyncTime = _now2;
            syncBidirectional({ silent: true, allowRemotePrompt: true });
        }
    }
}

function lastMessage() {
    markContinuousInteraction();
    const msgs = getTopicMessages(currentTopicId);
    if (msgs.length === 0) return;
    currentMessageIndex = msgs.length - 1;
    if (typeof syncVnStore === 'function') syncVnStore({ messageIndex: currentMessageIndex });
    showCurrentMessage('forward');
}

function handleActionButtonClick(event) {
    if (event) {
        event.preventDefault();
        event.stopPropagation();
    }
}

function deleteCurrentMessage() {
    const msgs = getTopicMessages(currentTopicId);
    if (msgs.length === 0 || currentMessageIndex >= msgs.length) return;

    const msgToDelete = msgs[currentMessageIndex];
    openConfirmModal('¿Borrar este mensaje?', 'Borrar').then(ok => {
        if (!ok) return;
        msgs.splice(currentMessageIndex, 1);
        if (currentMessageIndex >= msgs.length) {
            currentMessageIndex = Math.max(0, msgs.length - 1);
        }
        hasUnsavedChanges = true;
        save({ silent: true });

        // Soft delete en Supabase: marcar is_deleted=true en lugar de borrar la fila.
        // La fila queda invisible (excluida por la policy SELECT) pero existe 30 días
        // antes de que el cron la purgue. Evita acumulación indefinida de filas huérfanas.
        if (msgToDelete?.id && typeof SupabaseMessages !== 'undefined' && typeof SupabaseMessages.deleteMessage === 'function') {
            SupabaseMessages.deleteMessage(msgToDelete.id).catch(() => {});
        }

        if (typeof SupabaseSync !== 'undefined') {
            SupabaseSync.uploadProfileData().catch(() => {});
        }
        // Notificar a otros participantes en tiempo real
        if (msgToDelete?.id && typeof CollaborativeGuard !== 'undefined') {
            CollaborativeGuard.broadcastDelete(msgToDelete.id);
        }
        showCurrentMessage('forward');
    });
}

// ============================================
// EDICIÓN DE MENSAJES
// ============================================
function editCurrentMessage() {
    const msgs = getTopicMessages(currentTopicId);
    if (currentMessageIndex >= msgs.length) return;

    const msg = msgs[currentMessageIndex];
    if (msg.userIndex !== currentUserIndex) {
        showAutosave('Solo puedes editar tus propios mensajes', 'error');
        return;
    }

    editingMessageId = msg.id;

    // Setear selectedCharId ANTES de openReplyPanel para que updateCharSelector use el correcto
    if (!msg.isNarrator && msg.characterId) {
        selectedCharId = msg.characterId;
    }

    openReplyPanel();

    const replyText = document.getElementById('vnReplyText');
    if (replyText) replyText.value = msg.text || '';

    const narratorMode = document.getElementById('narratorMode');
    if (narratorMode) {
        narratorMode.checked = !!msg.isNarrator;
        toggleNarratorMode();
    }

    if (!msg.isNarrator && msg.characterId) {
        updateCharSelector();
    }

    setWeather(msg.weather || 'none');

    if (msg.options && msg.options.length > 0 && !isRpgModeMode()) {
        const enableOptions = document.getElementById('enableOptions');
        const optionsFields = document.getElementById('optionsFields');

        if (enableOptions) enableOptions.checked = true;
        if (optionsFields) optionsFields.classList.add('active');

        tempBranches = [...msg.options];

        msg.options.forEach((opt, idx) => {
            if (idx < 3) {
                const textInput = document.getElementById(`option${idx + 1}Text`);
                const contInput = document.getElementById(`option${idx + 1}Continuation`);
                if (textInput) textInput.value = opt.text || '';
                if (contInput) contInput.value = opt.continuation || '';
            }
        });
    }

    const replyPanelTitle = document.getElementById('replyPanelTitle');
    const submitBtn = document.getElementById('submitReplyBtn');

    if (replyPanelTitle) replyPanelTitle.textContent = '✏️ Editar Mensaje';
    if (submitBtn) {
        submitBtn.textContent = '💾 Guardar Cambios';
        submitBtn.onclick = saveEditedMessage;
    }
}

function saveEditedMessage() {
    const replyText = document.getElementById('vnReplyText');
    const text = replyText?.value.trim();
    emitTypingState(false);
    if(!text) { showAutosave('Escribe algo primero', 'error'); return; }

    const msgs = getTopicMessages(currentTopicId);
    const msgIndex = msgs.findIndex(m => m.id === editingMessageId);
    if (msgIndex === -1) return;

    const topic = getCurrentTopic();

    if (isNarratorMode && !canUseNarratorMode(topic)) { showAutosave('Solo quien crea la historia puede usar Narrador en modo RPG', 'error'); return; }

    let char = null;
    if(!isNarratorMode) {
        if(!selectedCharId) { showAutosave('Selecciona un personaje', 'error'); return; }
        char = appData.characters.find(c => c.id === selectedCharId);
        if (!char) { showAutosave('Personaje no encontrado', 'error'); return; }
        if (topic?.mode === 'rpg' && typeof ensureCharacterRpgProfile === 'function') {
            const profile = ensureCharacterRpgProfile(char, currentTopicId || null);
            if (profile.conditions?.includes('dead')) {
                showAutosave(`${char.name} ha caído. Solo el DM puede reincorporarle a la partida.`, 'error');
                return;
            }
            if (profile.knockedOutTurns > 0) {
                showAutosave(`Este personaje está fuera de escena por ${profile.knockedOutTurns} turnos`, 'error');
                return;
            }
        }
        persistTopicLockedCharacter(topic, selectedCharId);
    }

    let options = null;
    const enableOptions = document.getElementById('enableOptions');
    if(enableOptions && enableOptions.checked && !isRpgModeMode()) {
        options = [];
        for(let i=1; i<=3; i++) {
            const textInput = document.getElementById(`option${i}Text`);
            const contInput = document.getElementById(`option${i}Continuation`);
            const t = textInput?.value.trim() || '';
            const c = contInput?.value.trim() || '';
            if(t && c) options.push({text: t, continuation: c});
        }
    }

    // Preservar el clima del mensaje original; solo actualizarlo si el usuario lo cambió explícitamente
    // (se detecta comparando currentWeather con el clima original del mensaje)
    const originalWeather = msgs[msgIndex].weather;
    const weatherChanged = currentWeather !== (originalWeather || 'none');
    const finalWeather = weatherChanged ? (currentWeather !== 'none' ? currentWeather : undefined) : originalWeather;

    msgs[msgIndex] = {
        ...msgs[msgIndex],
        characterId: isNarratorMode ? null : selectedCharId,
        charName: isNarratorMode ? 'Narrador' : char.name,
        charColor: isNarratorMode ? null : char.color,
        charAvatar: isNarratorMode ? null : char.avatar,
        charSprite: isNarratorMode ? null : char.sprite,
        text,
        isNarrator: isNarratorMode,
        options: options && options.length > 0 ? options : undefined,
        selectedOptionIndex: undefined,
        edited: true,
        editedAt: new Date().toISOString(),
        weather: finalWeather
    };

    hasUnsavedChanges = true;
    save({ silent: true });

    // Sincronizar edición directamente en la tabla messages de Supabase.
    // No depender solo del blob de user_data — así la edición llega a todos
    // los participantes y no queda una versión antigua en la tabla.
    const _editedMsgId = editingMessageId;
    if (_editedMsgId && typeof SupabaseMessages !== 'undefined' && typeof SupabaseMessages.editMessage === 'function') {
        SupabaseMessages.editMessage(_editedMsgId, text).catch(() => {});
    }

    if (typeof SupabaseSync !== 'undefined') {
        SupabaseSync.uploadProfileData().catch(() => {});
    }
    // Notificar edición a otros participantes en tiempo real
    if (_editedMsgId && typeof CollaborativeGuard !== 'undefined') {
        CollaborativeGuard.broadcastEdit(_editedMsgId, { text, timestamp: new Date().toISOString() });
    }
    closeReplyPanel();

    editingMessageId = null;
    showCurrentMessage('forward');
}

// ============================================
// OPCIONES Y CONTINUACIÓN
// ============================================
function showOptions(options) {
    const container = document.getElementById('vnOptionsContainer');
    if (!container) return;

    const msgs = getTopicMessages(currentTopicId);
    const currentMsg = msgs[currentMessageIndex];

    if (!options || options.length === 0 || isRpgModeMode()) {
        container.classList.remove('active');
        return;
    }

    // Guard: normalizar opciones que vengan en formatos legacy o corruptos
    const normalizedOptions = options.map((opt, i) => {
        if (opt && typeof opt === 'object' && typeof opt.text === 'string') return opt;
        // Si es string simple o número, usarlo como texto
        if (typeof opt === 'string' || typeof opt === 'number') {
            return { text: String(opt), continuation: '' };
        }
        // Si tiene text pero no es string
        if (opt && opt.text !== undefined) {
            return { text: String(opt.text), continuation: String(opt.continuation || '') };
        }
        return { text: `Opción ${i + 1}`, continuation: '' };
    });

    const total = normalizedOptions.length;
    container.innerHTML = normalizedOptions.map((opt, idx) => {
        const selected = currentMsg.selectedOptionIndex === idx;
        const disabled = currentMsg.selectedOptionIndex !== undefined;
        const optionLabel = `${opt.text}, opción ${idx + 1} de ${total}`;
        return `
        <button class="vn-option-btn ${selected ? 'chosen' : ''}"
                role="button"
                aria-pressed="${selected ? 'true' : 'false'}"
                aria-label="${escapeHtml(optionLabel)}"
                onclick="selectOption(${idx})"
                ${disabled ? 'disabled' : ''}>
            ${escapeHtml(opt.text)}
        </button>
    `;
    }).join('');

    container.classList.add('active');
    // Efecto suspense al mostrar opciones (absorbido de mejoras.js)
    const vnSection = document.getElementById('vnSection');
    if (vnSection) vnSection.classList.add('suspense-mode');
}

function selectOption(idx) {
    // Quitar efecto suspense al seleccionar (absorbido de mejoras.js)
    const vnSectionEl = document.getElementById('vnSection');
    if (vnSectionEl) vnSectionEl.classList.remove('suspense-mode');
    const msgs = getTopicMessages(currentTopicId);
    const msg = msgs[currentMessageIndex];

    if (!msg.options || msg.selectedOptionIndex !== undefined) return;

    msg.selectedOptionIndex = idx;
    msg.selectedBy = currentUserIndex;

    hasUnsavedChanges = true;
    save({ silent: true });

    const selectedOption = msg.options[idx];

    if (selectedOption && selectedOption.continuation) {
        // El resultado lo dice el personaje activo del mensaje que tenía las opciones,
        // no el narrador — a menos que el mensaje original fuera del narrador.
        const sourceIsNarrator = msg.isNarrator || !msg.characterId;
        const resultChar = sourceIsNarrator
            ? null
            : appData.characters.find(c => c.id === msg.characterId) || null;

        const newMsg = {
            id: (globalThis.crypto && typeof globalThis.crypto.randomUUID === 'function')
            ? globalThis.crypto.randomUUID()
            : `${Date.now()}_${Math.random().toString(16).slice(2)}`,
            characterId: resultChar ? resultChar.id : null,
            charName:    resultChar ? resultChar.name   : 'Narrador',
            charColor:   resultChar ? resultChar.color  : null,
            charAvatar:  resultChar ? resultChar.avatar : null,
            charSprite:  resultChar ? resultChar.sprite : null,
            text: selectedOption.continuation,
            isNarrator: !resultChar,
            userIndex: currentUserIndex,
            timestamp: new Date().toISOString(),
            isOptionResult: true,
            parentOptionIndex: idx
        };

        const topicMessages = getTopicMessages(currentTopicId);
        topicMessages.push(newMsg);
        hasUnsavedChanges = true;
        save({ silent: true });
    }

    const optionsContainer = document.getElementById('vnOptionsContainer');
    if (optionsContainer) optionsContainer.classList.remove('active');

    const optionsIndicator = document.getElementById('messageHasOptions');
    if (optionsIndicator) optionsIndicator.classList.add('hidden');

    currentMessageIndex = getTopicMessages(currentTopicId).length - 1;
    triggerDialogueFadeIn();
    showCurrentMessage('forward');
}

function showContinuation(text) {
    const contText = document.getElementById('continuationText');
    const overlay = document.getElementById('continuationOverlay');

    if (contText) contText.textContent = text;
    if (overlay) overlay.classList.add('active');
}

function closeContinuation() {
    const overlay = document.getElementById('continuationOverlay');
    if (overlay) overlay.classList.remove('active');
}

// ============================================
// HISTORIAL
// ============================================
function buildHistoryEntry(msg, idx, showFavBadge = false) {
    const isNarrator = msg.isNarrator || !msg.characterId;
    const speaker = isNarrator ? 'Narrador' : msg.charName;
    const date = new Date(msg.timestamp).toLocaleString();
    const edited = msg.edited ? ' (editado)' : '';
    const optionResult = msg.isOptionResult ? ' [Respuesta elegida]' : '';
    const isFav = showFavBadge && currentTopicId && isMessageFavorite(currentTopicId, String(msg.id));
    const favBadge = isFav ? '<span class="history-entry-fav" title="Favorito">⭐</span>' : '';

    // Separador de capítulo (modo clásico)
    const chapterDivider = msg.chapter ? `
        <div class="history-chapter-divider">
            <div class="history-chapter-divider-line"></div>
            <div class="history-chapter-divider-text">✦ ${escapeHtml(msg.chapter.title)} ✦</div>
            <div class="history-chapter-divider-line"></div>
        </div>` : '';

    // Reacciones en el historial
    let reactionRow = '';
    if (currentTopicId && typeof getReactionSummary === 'function') {
        const summary = getReactionSummary(currentTopicId, String(msg.id));
        const chips = Object.entries(summary)
            .sort((a, b) => b[1] - a[1])
            .map(([emoji, count]) => `<span class="history-reaction-chip">${emoji}${count > 1 ? `<span class="reaction-count">${count}</span>` : ''}</span>`)
            .join('');
        if (chips) reactionRow = `<div class="history-reactions">${chips}</div>`;
    }

    return `${chapterDivider}
        <div class="history-entry ${isNarrator ? 'narrator' : ''} ${msg.isOptionResult ? 'option-result' : ''}${isFav ? ' is-favorite' : ''}">
            <div class="history-speaker">
                ${msg.charAvatar && !isNarrator ? `<img src="${escapeHtml(msg.charAvatar)}" alt="Avatar en historial de ${escapeHtml(speaker)}" style="width: 35px; height: 35px; border-radius: 50%; object-fit: cover; border: 2px solid var(--accent-gold);">` : ''}
                ${escapeHtml(speaker)}${edited}${optionResult}${favBadge}
            </div>
            <div class="history-text">${formatText(msg.text)}</div>
            ${reactionRow}
            <div class="history-timestamp">${date} • Mensaje ${idx + 1}</div>
        </div>
    `;
}

function renderVirtualizedHistory(msgs, container) {
    const rowHeight = 140;
    const overscan = 10;

    container.innerHTML = '<div id="historyVirtualSpacer" style="position: relative; width: 100%;"></div>';
    const spacer = container.querySelector('#historyVirtualSpacer');
    if (!spacer) return;

    spacer.style.height = `${msgs.length * rowHeight}px`;
    historyVirtualState = { rowHeight, overscan, msgs, spacer, container };

    const paint = () => {
        const state = historyVirtualState;
        if (!state) return;

        const viewportHeight = state.container.clientHeight || 500;
        const scrollTop = state.container.scrollTop;
        const firstVisible = Math.floor(scrollTop / state.rowHeight);
        const visibleCount = Math.ceil(viewportHeight / state.rowHeight);

        const start = Math.max(0, firstVisible - state.overscan);
        const end = Math.min(state.msgs.length, firstVisible + visibleCount + state.overscan);

        const html = state.msgs.slice(start, end).map((msg, relativeIdx) => {
            const absoluteIdx = start + relativeIdx;
            return `<div style="position:absolute;left:0;right:0;top:${absoluteIdx * state.rowHeight}px;">${buildHistoryEntry(msg, absoluteIdx)}</div>`;
        }).join('');

        state.spacer.innerHTML = html;
    };

    container.onscroll = paint;

    // Fix 8: when user scrolls to the very top, attempt to load older messages from Supabase
    container.addEventListener('scroll', function _olderMsgsHandler() {
        if (container.scrollTop > 40) return;
        if (!currentTopicId || typeof SupabaseMessages === 'undefined') return;
        if (!SupabaseMessages.loadOlderMessages) return;
        if (container.dataset.loadingOlder === '1') return;
        const allMsgs = getTopicMessages(currentTopicId);
        if (!allMsgs.length) return;
        const oldest = allMsgs[0].timestamp;
        if (!oldest) return;
        container.dataset.loadingOlder = '1';
        SupabaseMessages.loadOlderMessages(currentTopicId, oldest)
            .then(function (older) {
                if (!Array.isArray(older) || older.length === 0) return;
                const existingIds = new Set(allMsgs.map(function (m) { return String(m.id); }));
                const novel = older.filter(function (m) { return m.id && !existingIds.has(String(m.id)); });
                if (novel.length > 0) {
                    novel.forEach(function (m) { allMsgs.unshift(m); });
                    allMsgs.sort(function (a, b) { return new Date(a.timestamp) - new Date(b.timestamp); });
                    appData.messages[currentTopicId] = allMsgs;
                    if (historyVirtualState) {
                        historyVirtualState.msgs = allMsgs;
                        historyVirtualState.spacer.style.height = (allMsgs.length * historyVirtualState.rowHeight) + 'px';
                        paint();
                    }
                    showSyncToast(novel.length + ' mensaje(s) anteriores cargados', 'OK');
                }
            })
            .finally(function () { container.dataset.loadingOlder = '0'; });
    }, { passive: true });
    paint();
}

function openHistoryLog() {
    // Resetear a pestaña "Todos" al abrir para consistencia
    if (typeof currentHistoryTab !== 'undefined') {
        currentHistoryTab = 'all';
        document.getElementById('histTabAll')?.classList.add('active');
        document.getElementById('histTabFav')?.classList.remove('active');
    }

    // Usar renderHistoryContent si está disponible (soporta pestañas favoritos)
    if (typeof renderHistoryContent === 'function') {
        openModal('historyModal');
        renderHistoryContent();
        return;
    }

    // Fallback: renderizado directo sin pestañas
    const msgs = getTopicMessages(currentTopicId);
    const container = document.getElementById('historyContent');
    if (!container) return;

    if (msgs.length === 0) {
        container.onscroll = null;
        container.innerHTML = '<div style="text-align: center; color: var(--text-muted); padding: 2rem;">No hay mensajes en esta historia.</div>';
    } else {
        renderVirtualizedHistory(msgs, container);
    }
    openModal('historyModal');
}


// ============================================
// RESPUESTAS (Reply Panel)
// ============================================
function getCurrentTopic() {
    return appData.topics.find(t => t.id === currentTopicId);
}

function canUseNarratorMode(topic) {
    if (!topic || topic.mode !== 'rpg') return true;
    return topic.createdByIndex === currentUserIndex;
}

function getTopicLockedCharacterId(topic) {
    if (!topic) return null;
    const locks = topic.characterLocks || {};
    const lockByUser = locks[currentUserIndex];
    if (lockByUser) return lockByUser;

    // Compatibilidad con lock RPG legado
    const legacyRpgLocks = topic.rpgCharacterLocks || {};
    if (legacyRpgLocks[currentUserIndex]) return legacyRpgLocks[currentUserIndex];

    // Compatibilidad con lock clásico legado del creador
    if (topic.mode === 'roleplay' && topic.roleCharacterId && topic.createdByIndex === currentUserIndex) {
        return topic.roleCharacterId;
    }

    return null;
}

function persistTopicLockedCharacter(topic, charId) {
    if (!topic || !charId) return;
    topic.characterLocks = topic.characterLocks || {};
    if (topic.characterLocks[currentUserIndex]) return;
    topic.characterLocks[currentUserIndex] = charId;

    // Mantener compatibilidad con lector legacy RPG
    if (topic.mode === 'rpg') {
        topic.rpgCharacterLocks = topic.rpgCharacterLocks || {};
        if (!topic.rpgCharacterLocks[currentUserIndex]) {
            topic.rpgCharacterLocks[currentUserIndex] = charId;
        }
    }

    hasUnsavedChanges = true;
    save({ silent: true });
}

function getCharacterById(charId) {
    return appData.characters.find(c => c.id === charId);
}

function tickRpgKnockoutTurns(excludedCharId) {
    let anyChanged = false;
    appData.characters.forEach((ch) => {
        const profile = typeof ensureCharacterRpgProfile === 'function' ? ensureCharacterRpgProfile(ch, currentTopicId || null) : null;
        if (!profile || profile.knockedOutTurns <= 0) return;
        if (excludedCharId && String(ch.id) === String(excludedCharId)) return;
        profile.knockedOutTurns = Math.max(0, profile.knockedOutTurns - 1);
        anyChanged = true;
    });
    if (anyChanged) { hasUnsavedChanges = true; save({ silent: true }); }
}

// Aplica los efectos mecánicos de una tirada de oráculo al perfil del personaje.
// Devuelve un objeto con los efectos aplicados para mostrarlos en el badge del chat.
function applyRpgNarrativeProgress(charId, oracleRoll) {
    if (!charId || !oracleRoll) return null;
    const char = getCharacterById(charId);
    if (!char || typeof ensureCharacterRpgProfile !== 'function') return null;

    const profile = ensureCharacterRpgProfile(char, currentTopicId || null);
    const expPerLevel = (typeof RPG_EXP_PER_LEVEL !== 'undefined') ? RPG_EXP_PER_LEVEL : 10;
    const effects = { hpDelta: 0, expDelta: 0, levelUp: false, knockedOut: false, conditionApplied: null };

    if (oracleRoll.result === 'fumble') {
        effects.hpDelta = -2;
        profile.hp = Math.max(0, profile.hp + effects.hpDelta);
        if (profile.hp === 0) {
            effects.knockedOut = true;
            // HP=0 → estado Muerte, no solo inconsciente
            if (typeof applyConditionToProfile === 'function') {
                // Quitar otras condiciones activas y aplicar Muerte
                profile.conditions = profile.conditions?.filter(c => c === 'dead') || [];
                applyConditionToProfile(profile, 'dead');
                effects.conditionApplied = 'dead';
            }
        }
    } else if (oracleRoll.result === 'fail') {
        effects.hpDelta = -1;
        profile.hp = Math.max(0, profile.hp + effects.hpDelta);
        if (profile.hp === 0) {
            effects.knockedOut = true;
            if (typeof applyConditionToProfile === 'function') {
                profile.conditions = profile.conditions?.filter(c => c === 'dead') || [];
                applyConditionToProfile(profile, 'dead');
                effects.conditionApplied = 'dead';
            }
        }
    } else if (oracleRoll.result === 'success') {
        effects.expDelta = 1;
        profile.exp = (profile.exp || 0) + effects.expDelta;
        if (profile.exp >= expPerLevel) {
            profile.exp = profile.exp % expPerLevel;
            profile.level = (profile.level || 1) + 1;
            effects.levelUp = true;
            // Recalcular HP_max al subir de nivel
            if (typeof recalcHpMaxOnLevelUp === 'function') {
                recalcHpMaxOnLevelUp(profile, char);
            }
        }
    } else if (oracleRoll.result === 'critical') {
        effects.expDelta = 2;
        profile.exp = (profile.exp || 0) + effects.expDelta;
        if (profile.exp >= expPerLevel) {
            profile.exp = profile.exp % expPerLevel;
            profile.level = (profile.level || 1) + 1;
            effects.levelUp = true;
            if (typeof recalcHpMaxOnLevelUp === 'function') {
                recalcHpMaxOnLevelUp(profile, char);
            }
        }
    }

    hasUnsavedChanges = true;
    save({ silent: true });

    // Sincronizar cambios al motor de escenas RPG si está activo
    if (typeof RPGState !== 'undefined' && typeof RPGState.syncFromCharacter === 'function') {
        RPGState.syncFromCharacter(char, currentTopicId);
    }

    // Disparar level-up modal si procede (pequeño delay para no interrumpir la narrativa)
    if (effects.levelUp) {
        setTimeout(() => {
            if (typeof openLevelUpModal === 'function') openLevelUpModal(charId, profile.level);
        }, 1200);
    }

    // Uso automático de poción si HP ≤ 30% y el personaje es del usuario actual
    if (char && char.userIndex === currentUserIndex && profile.hp > 0) {
        const _hpMax = (typeof RPG_HP_MAX !== 'undefined') ? RPG_HP_MAX : 10;
        if (profile.hp / _hpMax <= 0.30) _autoUsePotion(char, profile);
    }

    return effects;
}

// Construye el texto de consecuencia estructurada para el badge del chat
function buildConsequenceBadgeText(result, effects, charName) {
    if (!effects) return null;
    const name = charName || 'El personaje';
    const lines = [];

    if (result === 'fumble') {
        lines.push(`−2 HP ${name}`);
        if (effects.knockedOut) lines.push('⚠ Inconsciente — KO 5 turnos');
        else lines.push('Narrador: daño severo, complicación grave o consecuencia permanente');
    } else if (result === 'fail') {
        lines.push(`−1 HP ${name}`);
        if (effects.knockedOut) lines.push('⚠ Inconsciente — KO 5 turnos');
        else lines.push('Narrador: obstáculo, coste narrativo o consecuencia menor');
    } else if (result === 'success') {
        lines.push(`+${effects.expDelta} EXP ${name}`);
        if (effects.levelUp) lines.push(`✦ ¡Nivel ${effects.newLevel || ''}! Distribuye +1 punto de stat`);
        else lines.push('Narrador: el objetivo se cumple, con o sin coste menor');
    } else if (result === 'critical') {
        lines.push(`+${effects.expDelta} EXP ${name}`);
        if (effects.levelUp) lines.push(`✦ ¡Nivel ${effects.newLevel || ''}! Distribuye +1 punto de stat`);
        else lines.push('Narrador: éxito total, beneficio adicional o momento heroico');
    }
    return lines.join(' · ');
}

// ============================================
// ============================================
// MODO CLÁSICO — CAPÍTULOS
// ============================================
function getNextChapterNumber() {
    const msgs = getTopicMessages(currentTopicId);
    return msgs.filter(m => m.chapter).length + 1;
}

function updateChapterPreview() {
    const preview = document.getElementById('chapterPreview');
    if (!preview) return;
    if (!pendingChapter) {
        preview.style.display = 'none';
        preview.textContent = '';
        return;
    }
    preview.style.display = 'inline-flex';
    preview.textContent = `${pendingChapter.title}`;
}

function prepareChapter() {
    const topic = getCurrentTopic();
    if (!canUseNarratorMode(topic)) {
        showAutosave('Activa Modo Narrador para marcar capítulos', 'error');
        return;
    }
    const num    = getNextChapterNumber();
    const def    = `Capítulo ${['I','II','III','IV','V','VI','VII','VIII','IX','X'][num - 1] || num}`;
    const titleRaw = window.prompt(`Título del capítulo ${num}:`, def);
    if (titleRaw === null) return;
    const title = String(titleRaw || '').trim() || def;

    // Opcionalmente cambiar el fondo de escena
    const backgroundRaw = window.prompt('URL del fondo para este capítulo (opcional, deja vacío para mantener el actual):', '');
    if (backgroundRaw === null) return;
    const background = backgroundRaw.trim()
        ? resolveTopicBackgroundPath(backgroundRaw.trim())
        : null;

    pendingChapter = { title, number: num };
    if (background) {
        pendingSceneChange = { title, background, at: new Date().toISOString() };
        updateSceneChangePreview();
    }
    updateChapterPreview();
    if (typeof _updateNarratePending === 'function') _updateNarratePending();
    showAutosave(`📖 ${title} preparado`, 'saved');
}

function showChapterReveal(chapterData) {
    if (!chapterData) return;
    const banner = document.getElementById('vnChapterReveal');
    const titleEl = document.getElementById('vnChapterRevealTitle');
    if (!banner || !titleEl) return;
    titleEl.textContent = chapterData.title;
    banner.classList.add('active');
    setTimeout(() => { banner.classList.remove('active'); }, 2400);
}

// ============================================
// MODO CLÁSICO — PANEL DE FICHA DE PERSONAJE
// ============================================

function updateClassicLiteraryPanel() {
    // El badge 📋 está en la name-row — lo controlamos por su ID
    const badge = document.getElementById('vnInfoClassicToggleBtn');
    if (!badge) return;

    if (currentTopicMode === 'rpg') {
        badge.classList.add('hidden');
        return;
    }

    const msgs = getTopicMessages(currentTopicId);
    const msg  = msgs[currentMessageIndex];
    if (!msg || msg.isNarrator || !msg.characterId) {
        badge.classList.add('hidden');
        return;
    }

    const char = appData.characters.find(c => String(c.id) === String(msg.characterId));
    badge.classList.toggle('hidden', !char);
}

// Abre el fichaModal compacto (tipo Stats RPG) con el personaje del diálogo activo
function openVnActiveCharSheet() {
    const msgs = getTopicMessages(currentTopicId);
    const msg  = msgs[currentMessageIndex];
    if (!msg || !msg.characterId) return;
    const char = appData.characters.find(c => String(c.id) === String(msg.characterId));
    if (!char) return;

    // Rellenar avatar
    const avatarEl = document.getElementById('fichaModalAvatar');
    if (avatarEl) {
        // XSS fix: DOM construction avoids name injection in onerror
        if (char.avatar) {
            const _imgFicha = document.createElement('img');
            _imgFicha.src = char.avatar;
            _imgFicha.alt = char.name;
            _imgFicha.onerror = function () {
                this.style.display = 'none';
                this.parentElement.textContent = (char.name || '?')[0];
            };
            avatarEl.innerHTML = '';
            avatarEl.appendChild(_imgFicha);
        } else {
            avatarEl.textContent = (char.name || '?')[0];
        }
    }

    // Nombre y propietario
    const nameEl  = document.getElementById('fichaModalName');
    const ownerEl = document.getElementById('fichaModalOwner');
    if (nameEl)  nameEl.textContent  = `${char.name}${char.lastName ? ' ' + char.lastName : ''}`;
    if (ownerEl) ownerEl.textContent = `Por ${char.owner || (typeof userNames !== 'undefined' && userNames[char.userIndex]) || '—'}`;

    // Cuerpo: grid de datos básicos
    const bodyEl = document.getElementById('fichaModalBody');
    if (bodyEl) {
        const rows = [
            char.age       && { label: 'Edad',       val: char.age,        full: false },
            char.race      && { label: 'Raza',        val: char.race,       full: false },
            char.gender    && { label: 'Género',      val: char.gender,     full: false },
            char.alignment && { label: 'Alineación',  val: (typeof alignments !== 'undefined' && alignments[char.alignment]) || char.alignment, full: false },
            char.job       && { label: 'Ocupación',   val: char.job,        full: false },
            char.basic     && { label: 'Descripción', val: char.basic.slice(0, 180) + (char.basic.length > 180 ? '…' : ''), full: true, italic: true },
        ].filter(Boolean);

        bodyEl.innerHTML = rows.map(r => `
            <div class="ficha-modal-row${r.full ? ' full-width' : ''}">
                <span class="ficha-modal-label">${r.label}</span>
                <span class="ficha-modal-value${r.italic ? ' italic' : ''}">${escapeHtml(String(r.val))}</span>
            </div>
        `).join('');
    }

    if (typeof openModal === 'function') openModal('fichaModal');
}

function toggleCharacterInfoPanel() {
    const panel = document.getElementById('vnCharInfoPanel');
    if (!panel) return;
    if (panel.style.display !== 'none') {
        closeCharacterInfoPanel();
    } else {
        openCharacterInfoPanel();
    }
}

function openCharacterInfoPanel() {
    const msgs = getTopicMessages(currentTopicId);
    const msg  = msgs[currentMessageIndex];
    if (!msg || !msg.characterId) return;
    const char = appData.characters.find(c => String(c.id) === String(msg.characterId));
    if (!char) return;

    _renderCharInfoPanel(char);
    const panel = document.getElementById('vnCharInfoPanel');
    if (panel) {
        panel.style.display = 'flex';
        setTimeout(() => panel.classList.add('char-panel-visible'), 10);
    }

    setTimeout(() => {
        document.addEventListener('click', _closeCharPanelOnOutside, { once: true, capture: true });
    }, 50);
}

function closeCharacterInfoPanel() {
    const panel = document.getElementById('vnCharInfoPanel');
    if (panel) {
        panel.classList.remove('char-panel-visible');
        setTimeout(() => {
            if (!panel.classList.contains('char-panel-visible')) {
                panel.style.display = 'none';
            }
        }, 220);
    }
}

function _closeCharPanelOnOutside(e) {
    const panel = document.getElementById('vnCharInfoPanel');
    const btn   = document.getElementById('vnInfoClassicToggleBtn');
    if (!panel) return;
    if (!panel.contains(e.target) && e.target !== btn && !btn?.contains(e.target)) {
        closeCharacterInfoPanel();
    }
}

function _renderCharInfoPanel(char) {
    if (!char) return;
    const nameEl = document.getElementById('vnCharInfoName');
    const bodyEl = document.getElementById('vnCharInfoBody');
    const relEl  = document.getElementById('vnCharInfoRelations');

    if (nameEl) nameEl.textContent = `${char.name}${char.lastName ? ' ' + char.lastName : ''}`;

    // ── DATOS DE LA FICHA ─────────────────────
    if (bodyEl) {
        const fields = [
            char.age       && { label: 'Edad',       val: char.age },
            char.race      && { label: 'Raza',       val: char.race },
            char.gender    && { label: 'Género',     val: char.gender },
            char.job       && { label: 'Ocupación',  val: char.job },
            char.alignment && { label: 'Alineación', val: (typeof alignments !== 'undefined' && alignments[char.alignment]) || char.alignment },
        ].filter(Boolean);

        const fieldsHtml = fields.map(f =>
            `<div class="cip-row"><span class="cip-label">${f.label}</span><span class="cip-val">${escapeHtml(String(f.val))}</span></div>`
        ).join('');

        const basicHtml = char.basic
            ? `<div class="cip-basic">"${escapeHtml(char.basic.slice(0, 200))}${char.basic.length > 200 ? '…' : ''}"</div>`
            : '';

        bodyEl.innerHTML = fieldsHtml + basicHtml;
    }

    // ── TODAS LAS RELACIONES EN LA PARTIDA ─────
    if (relEl && currentTopicId) {
        const msgs = getTopicMessages(currentTopicId);
        const topicAffinities = (appData.affinities || {})[currentTopicId] || {};
        const charIdStr = String(char.id);

        const appearedIds = [...new Set(msgs.filter(m => m.characterId).map(m => String(m.characterId)))];
        const relations = appearedIds
            .filter(id => id !== charIdStr)
            .map(id => {
                const key   = [charIdStr, id].sort().join('_');
                const value = Number(topicAffinities[key] || 0);
                const other = appData.characters.find(c => String(c.id) === id);
                return other ? { char: other, value } : null;
            })
            .filter(Boolean)
            .sort((a, b) => b.value - a.value);

        if (!relations.length) {
            relEl.innerHTML = '<div class="cip-no-rel">Sin relaciones registradas aún</div>';
        } else {
            const getR = (v) => (typeof affinityRanks !== 'undefined')
                ? (affinityRanks.find(r => v >= r.min && v <= r.max) || { name: 'Desconocidos', color: '#888' })
                : { name: '—', color: '#888' };

            const rowsHtml = relations.map(({ char: other, value }) => {
                const r   = getR(value);
                const pct = Math.max(4, value);
                // XSS fix: use data-fallback; onerror wired after relEl.innerHTML
                const avatar = other.avatar
                    ? `<img src="${escapeHtml(other.avatar)}" alt="${escapeHtml(other.name)}" data-fallback="${escapeHtml((other.name || '?')[0])}" class="cip-rel-img">`
                    : `<span>${escapeHtml((other.name || '?')[0])}</span>`;
                return `
                <div class="cip-rel-row">
                    <div class="cip-rel-avatar" style="border-color:${r.color}">${avatar}</div>
                    <div class="cip-rel-info">
                        <div class="cip-rel-name">${escapeHtml(other.name)}</div>
                        <div class="cip-rel-rank" style="color:${r.color}">${r.name}</div>
                        <div class="cip-rel-bar"><div class="cip-rel-fill" style="width:${pct}%;background:${r.color}"></div></div>
                    </div>
                </div>`;
            }).join('');

            relEl.innerHTML = `<div class="cip-rel-header">Relaciones en esta historia</div>${rowsHtml}`;
            // XSS fix: bind onerror after DOM insertion
            relEl.querySelectorAll('img.cip-rel-img').forEach(function (img) {
                img.onerror = function () {
                    this.style.display = 'none';
                    this.parentElement.textContent = this.dataset.fallback || '?';
                };
            });
        }
    }
}

// ============================================================
// PANEL DEL DUNGEON MASTER
// Solo accesible para el creador del tema en modo RPG.
// Permite: aplicar/quitar condiciones, dar objetos,
// forzar tiradas y narrar como NPC con nombre propio.
// ============================================================

function _isDM() {
    const topic = getCurrentTopic();
    return topic && canUseNarratorMode(topic) && topic.mode === 'rpg';
}

// Devuelve todos los personajes activos en el topic actual
function _getDmCharacters() {
    const topic = getCurrentTopic();
    if (!topic) return [];
    const locks = { ...( topic.characterLocks || {}), ...(topic.rpgCharacterLocks || {}) };
    const charIds = [...new Set(Object.values(locks))].filter(Boolean);
    return charIds.map(id => appData.characters.find(c => String(c.id) === String(id))).filter(Boolean);
}

function openDmPanel() {
    if (!_isDM()) return;
    const panel = document.getElementById('vnDmPanel');
    if (!panel) return;
    _dmPopulateSelects();
    _dmRenderCharacterList();
    panel.style.display = 'flex';
}

function closeDmPanel() {
    const panel = document.getElementById('vnDmPanel');
    if (panel) panel.style.display = 'none';
}

function toggleDmPanel() {
    const panel = document.getElementById('vnDmPanel');
    if (!panel) return;
    if (panel.style.display === 'none' || !panel.style.display) {
        openDmPanel();
    } else {
        closeDmPanel();
    }
}

// Rellena todos los <select> de personaje con los participantes actuales
function _dmPopulateSelects() {
    const chars = _getDmCharacters();
    const options = ['<option value="">— Personaje —</option>',
        ...chars.map(c => `<option value="${c.id}">${escapeHtml(c.name)}</option>`)
    ].join('');

    ['dmTargetChar','dmItemTarget','dmRollTarget'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.innerHTML = options;
    });

    // Selector de condiciones — excluir 'dead' (se activa solo automáticamente)
    const condSel = document.getElementById('dmConditionSelect');
    if (condSel && window.RPG_CONDITIONS) {
        const dmConds = Object.values(window.RPG_CONDITIONS).filter(c => !c.dmOnly);
        condSel.innerHTML = '<option value="">— Condición —</option>' +
            dmConds.map(c =>
                `<option value="${c.id}">${c.icon} ${c.label}</option>`
            ).join('');
    }

    // Selector de objetos
    const itemSel = document.getElementById('dmItemSelect');
    if (itemSel && window.RPG_ITEM_CATALOG) {
        const byType = {};
        window.RPG_ITEM_CATALOG.forEach(item => {
            (byType[item.type] = byType[item.type] || []).push(item);
        });
        const typeLabels = window.RPG_ITEM_TYPE_LABELS || {};
        itemSel.innerHTML = '<option value="">— Objeto —</option>' +
            Object.entries(byType).map(([type, items]) =>
                `<optgroup label="${typeLabels[type] || type}">` +
                items.map(i => `<option value="${i.id}">${i.icon || ''} ${i.name}</option>`).join('') +
                '</optgroup>'
            ).join('');
    }
}

// Renderiza la lista de personajes con sus stats y condiciones activas
function _dmRenderCharacterList() {
    const list = document.getElementById('dmCharacterList');
    if (!list) return;
    const chars = _getDmCharacters();
    if (!chars.length) {
        list.innerHTML = '<div class="dm-empty">Sin personajes en la partida aún.</div>';
        return;
    }
    list.innerHTML = chars.map(c => {
        const profile = typeof ensureCharacterRpgProfile === 'function'
            ? ensureCharacterRpgProfile(c, currentTopicId)
            : null;
        const hp      = profile?.hp ?? '?';
        const level   = profile?.level ?? 1;
        const conds   = profile?.conditions || [];
        const isDead  = conds.includes('dead');
        const condHtml = conds.length
            ? conds.map(cId => {
                const cond = window.RPG_CONDITIONS?.[cId];
                return cond ? `<span class="dm-cond-tag ${cId === 'dead' ? 'dm-cond-dead' : ''}">${cond.icon} ${cond.label}</span>` : '';
            }).join('')
            : '<span class="dm-no-cond">Sin condiciones</span>';
        const classObj = window.RPG_CLASSES?.find(cl => cl.id === profile?.rpgClass);
        // Botón de reincorporar solo aparece cuando el personaje está muerto
        const reviveBtn = isDead
            ? `<button class="dm-btn dm-btn-revive" onclick="dmReviveCharacter('${c.id}')" title="El DM reincorpora al personaje (evento narrativo)">✦ Reincorporar</button>`
            : '';
        return `<div class="dm-char-row ${isDead ? 'dm-char-dead' : ''}">
            <div class="dm-char-info">
                <span class="dm-char-name">${escapeHtml(c.name)}</span>
                <span class="dm-char-meta">Nv.${level} · HP ${hp}/10${classObj ? ' · ' + classObj.name : ''}</span>
            </div>
            <div class="dm-char-conds">${condHtml}</div>
            ${reviveBtn}
        </div>`;
    }).join('');
}

// Aplicar condición al personaje seleccionado
function dmApplyCondition() {
    const charId = document.getElementById('dmTargetChar')?.value;
    const condId = document.getElementById('dmConditionSelect')?.value;
    if (!charId || !condId) { showAutosave('Selecciona personaje y condición', 'error'); return; }
    if (typeof applyCharCondition === 'function') {
        applyCharCondition(charId, condId, currentTopicId);
        _dmRenderCharacterList();
        // Propagar en tiempo real
        if (typeof CollaborativeGuard !== 'undefined' && CollaborativeGuard.broadcastDmEvent) {
            CollaborativeGuard.broadcastDmEvent('dm_condition', { charId, topicId: currentTopicId, conditionId: condId, action: 'apply' });
        }
        // Notificar en el chat como mensaje del narrador
        const char = appData.characters.find(c => String(c.id) === String(charId));
        const cond = window.RPG_CONDITIONS?.[condId];
        if (char && cond) _dmPostSystemMessage(`${cond.icon} **${escapeHtml(char.name)}** sufre la condición **${cond.label}**. ${cond.desc}`);
    }
}

// Quitar condición del personaje seleccionado
function dmRemoveCondition() {
    const charId = document.getElementById('dmTargetChar')?.value;
    const condId = document.getElementById('dmConditionSelect')?.value;
    if (!charId || !condId) { showAutosave('Selecciona personaje y condición', 'error'); return; }
    if (typeof removeCharCondition === 'function') {
        removeCharCondition(charId, condId, currentTopicId);
        _dmRenderCharacterList();
        // Propagar en tiempo real
        if (typeof CollaborativeGuard !== 'undefined' && CollaborativeGuard.broadcastDmEvent) {
            CollaborativeGuard.broadcastDmEvent('dm_condition', { charId, topicId: currentTopicId, conditionId: condId, action: 'remove' });
        }
        const char = appData.characters.find(c => String(c.id) === String(charId));
        const cond = window.RPG_CONDITIONS?.[condId];
        if (char && cond) _dmPostSystemMessage(`${cond.icon} La condición **${cond.label}** ha sido eliminada de **${escapeHtml(char.name)}**.`);
    }
}

// Dar un objeto del catálogo a un personaje
function dmGiveItem() {
    const charId = document.getElementById('dmItemTarget')?.value;
    const itemId = document.getElementById('dmItemSelect')?.value;
    if (!charId || !itemId) { showAutosave('Selecciona personaje y objeto', 'error'); return; }

    const char    = appData.characters.find(c => String(c.id) === String(charId));
    const catalog = window.RPG_ITEM_CATALOG?.find(i => i.id === itemId);
    if (!char || !catalog) return;

    // Guardar siempre en profile.inventory del topic — fuente unificada
    const profile = typeof ensureCharacterRpgProfile === 'function'
        ? ensureCharacterRpgProfile(char, currentTopicId) : null;
    if (profile) {
        profile.inventory = profile.inventory || [];
        const existing = profile.inventory.find(i => i.id === itemId);
        if (existing) existing.qty = (existing.qty || 1) + 1;
        else profile.inventory.push({ id: catalog.id, name: catalog.name, qty: 1, description: catalog.desc });
        if (typeof _persistRpgProfile === 'function') _persistRpgProfile(char, profile);
    }
    // Propagar en tiempo real al jugador destinatario
    if (typeof CollaborativeGuard !== 'undefined' && CollaborativeGuard.broadcastDmEvent) {
        CollaborativeGuard.broadcastDmEvent('dm_item_given', {
            charId, topicId: currentTopicId,
            item: { id: catalog.id, name: catalog.name, qty: 1, desc: catalog.desc }
        });
    }

    _dmPostSystemMessage(`🎁 El DM entrega **${catalog.icon || ''} ${catalog.name}** a **${escapeHtml(char.name)}**. *${catalog.desc}*`);
    showAutosave(`${catalog.name} entregado a ${char.name}`, 'saved');
    _dmRenderCharacterList();
}

// ── Sistema de Desafíos del DM ──────────────────────────────────────────────
// El DM propone una situación con DC y opciones de stat.
// El jugador ve el desafío en su pantalla y elige con qué stat tirar.

let _activeChallenge = null;

function dmSetDC(value) {
    const input = document.getElementById('dmDCValue');
    if (input) input.value = value;
    document.querySelectorAll('.dm-dc-btn').forEach(b => {
        b.classList.toggle('active', Number(b.dataset.dc) === value);
    });
}

function dmSendChallenge() {
    const desc  = document.getElementById('dmChallengeDesc')?.value.trim();
    const dc    = Number(document.getElementById('dmDCValue')?.value) || 15;
    const stats = [...document.querySelectorAll('#dmChallengeStats input:checked')].map(i => i.value);

    if (!desc) { showAutosave('Describe la situación del desafío', 'error'); return; }
    if (!stats.length) { showAutosave('Selecciona al menos un stat', 'error'); return; }

    const challenge = { desc, dc, stats, authorIndex: currentUserIndex, topicId: currentTopicId };

    const statList = stats.map(s => '**' + s + '**').join(' / ');
    _dmPostSystemMessage(
        '⚔ **Desafío** — *' + escapeHtml(desc) + '*\n' +
        'DC ' + dc + ' · Puedes tirar con: ' + statList
    );

    _activeChallenge = challenge;
    _renderChallengeBar(challenge);

    // Propagar desafío en tiempo real a todos los jugadores del topic
    if (typeof CollaborativeGuard !== 'undefined' && typeof CollaborativeGuard.broadcastDmEvent === 'function') {
        CollaborativeGuard.broadcastDmEvent('dm_challenge', { challenge });
    }

    document.getElementById('dmChallengeDesc').value = '';
    closeDmPanel();
}

function _renderChallengeBar(challenge) {
    if (!challenge) return;
    const bar     = document.getElementById('vnChallengeBar');
    const descEl  = document.getElementById('vnChallengeDesc');
    const dcEl    = document.getElementById('vnChallengeDc');
    const btnsCnt = document.getElementById('vnChallengeStatBtns');
    if (!bar || !descEl || !dcEl || !btnsCnt) return;

    descEl.textContent = challenge.desc;
    dcEl.textContent   = 'DC ' + challenge.dc;

    const statLabels = { STR: 'Fuerza', DEX: 'Destreza', CON: 'Constit.', INT: 'Intelec.', WIS: 'Sabid.', CHA: 'Carisma' };
    btnsCnt.innerHTML = challenge.stats.map(stat =>
        '<button class="vn-challenge-stat-btn" onclick="acceptChallenge(' + "'" + stat + "'" + ')" title="' + (statLabels[stat] || stat) + '">' +
        '<span class="vn-cs-key">' + stat + '</span>' +
        '<span class="vn-cs-label">' + (statLabels[stat] || stat) + '</span>' +
        '</button>'
    ).join('');

    bar.style.display = 'flex';
}

function acceptChallenge(stat) {
    if (!_activeChallenge || !selectedCharId) {
        showAutosave('Selecciona un personaje para aceptar el desafío', 'error');
        return;
    }

    const challenge = _activeChallenge;
    const char      = appData.characters.find(c => String(c.id) === String(selectedCharId));
    if (!char) return;

    const profile = typeof ensureCharacterRpgProfile === 'function'
        ? ensureCharacterRpgProfile(char, currentTopicId) : null;

    if (profile?.conditions?.includes('dead')) {
        showAutosave('Tu personaje ha caído. No puedes aceptar el desafío.', 'error');
        return;
    }

    const baseStat = profile?.stats?.[stat] ?? 8;
    const condMod  = (typeof getConditionModifier === 'function' && profile)
        ? getConditionModifier(profile, stat) : 0;
    const statVal  = Math.max(1, baseStat + condMod);
    const modifier = Math.floor((statVal - 10) / 2);
    const roll     = Math.floor(Math.random() * 20) + 1;
    const total    = Math.max(1, Math.min(20, roll + modifier));
    const dc       = challenge.dc;
    const result   = roll === 1 ? 'fumble' : roll === 20 ? 'critical' : total >= dc ? 'success' : 'fail';
    const labels   = { critical: 'ÉXITO CRÍTICO', success: 'ACIERTO', fail: 'FALLO', fumble: 'FALLO CRÍTICO' };
    const modSign  = modifier >= 0 ? '+' : '';
    const resultIcon = (result === 'critical' || result === 'success') ? '✓' : '✗';

    showDiceResultOverlay({ roll, modifier, total, result, stat, statValue: statVal });

    const oracleData = { question: challenge.desc, stat, statValue: statVal, modifier, dc, roll, total, result, timestamp: Date.now() };
    const topic      = getCurrentTopic();
    const topicMsgs  = getTopicMessages(currentTopicId);

    const newMsg = {
        id:                (globalThis.crypto?.randomUUID?.()) || (Date.now() + '_' + Math.random().toString(16).slice(2)),
        characterId:       selectedCharId,
        charName:          char.name,
        charColor:         char.color,
        charAvatar:        char.avatar,
        charSprite:        char.sprite,
        text:              '🎲 *Acepta el desafío con **' + stat + '***\nD20(' + roll + ') ' + modSign + modifier + ' = **' + total + '** vs DC' + dc + ' → **' + labels[result] + '** ' + resultIcon,
        isNarrator:        false,
        isChallengeResult: true,
        userIndex:         currentUserIndex,
        timestamp:         new Date().toISOString(),
        oracle:            oracleData
    };

    if (topic?.mode === 'rpg' && typeof applyRpgNarrativeProgress === 'function') {
        const effects = applyRpgNarrativeProgress(selectedCharId, oracleData);
        if (effects && typeof buildConsequenceBadgeText === 'function') {
            const consequence = buildConsequenceBadgeText(result, effects, char.name);
            if (consequence) newMsg.oracleConsequence = consequence;
        }
    }

    topicMsgs.push(newMsg);
    if (typeof SupabaseMessages !== 'undefined' && currentTopicId) {
        SupabaseMessages.send(currentTopicId, newMsg).catch(() => {});
    }
    hasUnsavedChanges = true;
    save({ silent: true });
    currentMessageIndex = topicMsgs.length - 1;
    triggerDialogueFadeIn();
    showCurrentMessage('forward');

    dismissChallenge();
}

function dismissChallenge() {
    _activeChallenge = null;
    const bar = document.getElementById('vnChallengeBar');
    if (bar) bar.style.display = 'none';
}

// Enviar mensaje como NPC con nombre personalizado
function dmSendAsNpc() {
    const npcName = document.getElementById('dmNpcName')?.value.trim();
    const npcText = document.getElementById('dmNpcText')?.value.trim();
    if (!npcName) { showAutosave('Escribe el nombre del NPC', 'error'); return; }
    if (!npcText) { showAutosave('Escribe el mensaje del NPC', 'error'); return; }

    const topic = getCurrentTopic();
    if (!topic) return;

    const topicMessages = getTopicMessages(currentTopicId);
    const newMsg = {
        id:          (globalThis.crypto?.randomUUID?.()) || `${Date.now()}_${Math.random().toString(16).slice(2)}`,
        characterId: null,
        charName:    npcName,
        charColor:   '#8b7355',
        charAvatar:  null,
        charSprite:  null,
        text:        npcText,
        isNarrator:  true,
        isNpc:       true,
        userIndex:   currentUserIndex,
        timestamp:   new Date().toISOString()
    };

    topicMessages.push(newMsg);
    if (typeof SupabaseMessages !== 'undefined' && currentTopicId) {
        SupabaseMessages.send(currentTopicId, newMsg).catch(() => {});
    }
    hasUnsavedChanges = true;
    save({ silent: true });
    currentMessageIndex = topicMessages.length - 1;
    triggerDialogueFadeIn();
    showCurrentMessage('forward');

    document.getElementById('dmNpcText').value = '';
    showAutosave(`Mensaje enviado como ${npcName}`, 'saved');
    closeDmPanel();
}

// Publica un mensaje de sistema del DM (condiciones, objetos, tiradas)
function _dmPostSystemMessage(text) {
    if (!text || !currentTopicId) return;
    const topicMessages = getTopicMessages(currentTopicId);
    const newMsg = {
        id:          (globalThis.crypto?.randomUUID?.()) || `${Date.now()}_${Math.random().toString(16).slice(2)}`,
        characterId: null,
        charName:    'Dungeon Master',
        charColor:   '#c9a86c',
        charAvatar:  null,
        charSprite:  null,
        text,
        isNarrator:  true,
        isDmSystem:  true,
        userIndex:   currentUserIndex,
        timestamp:   new Date().toISOString()
    };
    topicMessages.push(newMsg);
    if (typeof SupabaseMessages !== 'undefined' && currentTopicId) {
        SupabaseMessages.send(currentTopicId, newMsg).catch(() => {});
    }
    hasUnsavedChanges = true;
    save({ silent: true });
    currentMessageIndex = topicMessages.length - 1;
    triggerDialogueFadeIn();
    showCurrentMessage('forward');
}

// El DM reincorpora manualmente a un personaje muerto (evento narrativo)
// Solo el DM puede hacer esto — es el equivalente a "ir a la catedral"
function dmReviveCharacter(charId) {
    if (!_isDM()) return;
    const char = appData.characters.find(c => String(c.id) === String(charId));
    if (!char) return;

    const profile = typeof ensureCharacterRpgProfile === 'function'
        ? ensureCharacterRpgProfile(char, currentTopicId) : null;
    if (!profile) return;

    // Reincorporar: quitar estado muerte, restaurar 1 HP mínimo
    if (typeof removeConditionFromProfile === 'function') {
        removeConditionFromProfile(profile, 'dead');
    }
    profile.conditions = (profile.conditions || []).filter(c => c !== 'dead');
    profile.hp = Math.max(1, profile.hp || 1);

    if (typeof _persistRpgProfile === 'function') _persistRpgProfile(char, profile);

    _dmPostSystemMessage(
        `✦ **${escapeHtml(char.name)}** ha sido reincorporado a la partida por intervención del DM. ` +
        `*La historia continúa.*`
    );
    // Propagar en tiempo real para que el jugador pueda volver a actuar
    if (typeof CollaborativeGuard !== 'undefined' && CollaborativeGuard.broadcastDmEvent) {
        CollaborativeGuard.broadcastDmEvent('dm_revive', { charId, topicId: currentTopicId });
    }
    showAutosave(`${char.name} reincorporado a la partida`, 'saved');
    _dmRenderCharacterList();
}

// ── Uso automático de poción al ≤30% HP ─────────────────────────────────────
// Se activa solo para el personaje del usuario actual, no para el del DM ni
// para personajes de otros jugadores. Usa la poción menor primero; si no hay,
// usa la mayor. Solo actúa una vez por bajada de HP (no en bucle).
function _autoUsePotion(char, profile) {
    if (!char || !profile) return;
    const inv = profile.inventory || [];
    // Prioridad: poción menor → poción mayor
    const potionId = inv.find(i => i.id === 'potion_hp')?.id
                  || inv.find(i => i.id === 'potion_greater')?.id;
    if (!potionId) return;

    const catalog = window.RPG_ITEM_CATALOG?.find(i => i.id === potionId);
    if (!catalog) return;

    // Aplicar efecto directamente (sin pasar por useInventoryItem para evitar bucle)
    const hpMax   = (typeof RPG_HP_MAX !== 'undefined') ? RPG_HP_MAX : 10;
    const hpBefore = profile.hp;
    if (catalog.effect?.hp === 'max') {
        profile.hp = hpMax;
    } else if (typeof catalog.effect?.hp === 'number') {
        profile.hp = Math.min(hpMax, profile.hp + catalog.effect.hp);
    }

    // Consumir del inventario
    const idx = profile.inventory.findIndex(i => i.id === potionId);
    if (idx !== -1) {
        profile.inventory[idx].qty = (profile.inventory[idx].qty || 1) - 1;
        if (profile.inventory[idx].qty <= 0) profile.inventory.splice(idx, 1);
    }

    if (typeof _persistRpgProfile === 'function') _persistRpgProfile(char, profile);
    if (typeof _refreshIhpInventory === 'function') _refreshIhpInventory(char.id);

    // Notificar al jugador
    const hpGained = profile.hp - hpBefore;
    if (typeof showAutosave === 'function') {
        showAutosave(`⚡ ${catalog.icon} ${catalog.name} usada automáticamente (+${hpGained} HP)`, 'saved');
    }
}

// ── Listeners de eventos DM en tiempo real ───────────────────────────────
// Reciben los broadcasts del canal collab-guard y actualizan el estado local.

// Desafío: el DM lo lanzó, mostrar la barra al jugador
window.addEventListener('etheria:dm-challenge', function(e) {
    const challenge = e.detail?.challenge;
    if (!challenge) return;
    // No mostrar al propio DM (ya la tiene)
    if (challenge.authorIndex === currentUserIndex) return;
    // Solo si estamos en el mismo topic
    if (challenge.topicId && challenge.topicId !== currentTopicId) return;
    _activeChallenge = challenge;
    _renderChallengeBar(challenge);
});

// Condición cambiada: actualizar ficha del personaje afectado en tiempo real
window.addEventListener('etheria:dm-condition-changed', function(e) {
    const { charId, topicId, conditionId, action } = e.detail || {};
    if (!charId || topicId !== currentTopicId) return;
    const char = appData.characters.find(c => String(c.id) === String(charId));
    if (!char || typeof ensureCharacterRpgProfile !== 'function') return;
    const profile = ensureCharacterRpgProfile(char, currentTopicId);
    if (action === 'apply' && typeof applyConditionToProfile === 'function') {
        applyConditionToProfile(profile, conditionId);
    } else if (action === 'remove' && typeof removeConditionFromProfile === 'function') {
        removeConditionFromProfile(profile, conditionId);
    }
    // Refrescar la ficha si está abierta
    if (typeof updateIhp === 'function') updateIhp();
});

// Objeto recibido del DM: actualizar inventario en tiempo real
window.addEventListener('etheria:dm-item-given', function(e) {
    const { charId, topicId, item } = e.detail || {};
    if (!charId || !item || topicId !== currentTopicId) return;
    const char = appData.characters.find(c => String(c.id) === String(charId));
    if (!char || typeof ensureCharacterRpgProfile !== 'function') return;
    const profile = ensureCharacterRpgProfile(char, currentTopicId);
    profile.inventory = profile.inventory || [];
    const existing = profile.inventory.find(i => i.id === item.id);
    if (existing) existing.qty = (existing.qty || 1) + 1;
    else profile.inventory.push({ ...item });
    if (typeof _persistRpgProfile === 'function') _persistRpgProfile(char, profile);
    // Refrescar panel si está visible
    if (typeof _refreshIhpInventory === 'function') _refreshIhpInventory(charId);
    // Notificar si el personaje es del usuario actual
    if (char.userIndex === currentUserIndex && typeof showAutosave === 'function') {
        showAutosave(`🎁 ${item.name} añadido a tu inventario`, 'saved');
    }
});

// Revive: el DM reincorporó a un personaje muerto
window.addEventListener('etheria:dm-revive', function(e) {
    const { charId, topicId } = e.detail || {};
    if (!charId || topicId !== currentTopicId) return;
    const char = appData.characters.find(c => String(c.id) === String(charId));
    if (!char || typeof ensureCharacterRpgProfile !== 'function') return;
    const profile = ensureCharacterRpgProfile(char, currentTopicId);
    if (typeof removeConditionFromProfile === 'function') {
        removeConditionFromProfile(profile, 'dead');
    }
    profile.conditions = (profile.conditions || []).filter(c => c !== 'dead');
    profile.hp = Math.max(1, profile.hp || 1);
    if (typeof updateIhp === 'function') updateIhp();
});

window.toggleDmPanel     = toggleDmPanel;
window.openDmPanel       = openDmPanel;
window.closeDmPanel      = closeDmPanel;
window.dmApplyCondition  = dmApplyCondition;
window.dmRemoveCondition = dmRemoveCondition;
window.dmGiveItem        = dmGiveItem;
window.dmReviveCharacter = dmReviveCharacter;
window.dmSetDC           = dmSetDC;
window.dmSendChallenge   = dmSendChallenge;
window.acceptChallenge   = acceptChallenge;
window.dismissChallenge  = dismissChallenge;
window.dmSendAsNpc       = dmSendAsNpc;

// ============================================
// BOTÓN DE NARRACIÓN FLOTANTE (escena/capítulo)
// ============================================

function updateNarrateButton() {
    const topic = getCurrentTopic();
    const isOwner = !topic || topic.createdByIndex === currentUserIndex
        || topic.createdByIndex === undefined
        || topic.createdByIndex === null;
    const isRpg = topic?.mode === 'rpg';

    // ⚔️ Botón DM: solo en RPG + creador del tema
    const dmBtn = document.getElementById('vnDmBtn');
    if (dmBtn) dmBtn.style.display = (isRpg && isOwner) ? 'inline-flex' : 'none';

    // 🍺 Posada: caja de diálogo, solo RPG + owner
    const innBtn = document.getElementById('vnInnkeeperBtn');
    if (innBtn) innBtn.style.display = (isRpg && isOwner) ? 'inline-flex' : 'none';

    // ✒ Nueva escena: caja de diálogo, solo clásico + owner
    const narrateDialogBtn = document.getElementById('vnNarrateDialogBtn');
    if (narrateDialogBtn) narrateDialogBtn.style.display = (!isRpg && isOwner) ? 'inline-flex' : 'none';

    // ⚔️ Stats fijo: eliminado de la caja de diálogo — ahora solo en IHP panel (fijado)

    // ✒ Narrar en barra de controles: ya no necesario, quitar si existe
    const narrateCtrl = document.getElementById('vnNarrateBtn');
    if (narrateCtrl) narrateCtrl.style.display = 'none';

    _updateNarratePending();
}

function _updateNarratePending() {
    const el = document.getElementById('vnNarratePending');
    if (!el) return;
    const parts = [];
    if (pendingSceneChange) parts.push(`🎬 ${pendingSceneChange.title}`);
    if (pendingChapter)     parts.push(`📖 ${pendingChapter.title}`);
    if (parts.length) {
        el.style.display = 'block';
        el.innerHTML = parts.map(p => `<div class="narrate-pending-item">${escapeHtml(p)}</div>`).join('');
    } else {
        el.style.display = 'none';
    }
}

function openNarratePanel() {
    const panel = document.getElementById('vnNarratePanel');
    if (!panel) return;
    if (panel.style.display !== 'none') { closeNarratePanel(); return; }

    // En modo RPG el panel no se usa (Garrick tiene su propio botón)
    // En modo clásico solo mostramos la opción de escena libre
    const topic = getCurrentTopic();
    const isRpg = topic?.mode === 'rpg';
    const innkeeperOption = panel.querySelector('.vn-narrate-option[data-option="innkeeper"]');
    const freeOption      = panel.querySelector('.vn-narrate-option[data-option="free"]');
    if (innkeeperOption) innkeeperOption.style.display = isRpg ? 'flex' : 'none';
    if (freeOption)      freeOption.style.display      = 'flex'; // siempre visible

    panel.style.display = 'flex';
    _updateNarratePending();
    setTimeout(() => {
        document.addEventListener('click', _closeNarratePanelOnOutside, { once: true, capture: true });
    }, 50);
}

function closeNarratePanel() {
    const panel = document.getElementById('vnNarratePanel');
    if (panel) panel.style.display = 'none';
}

function _closeNarratePanelOnOutside(e) {
    const panel  = document.getElementById('vnNarratePanel');
    const trigger = document.querySelector('.vn-narrate-btn-inner');
    if (!panel) return;
    if (!panel.contains(e.target) && e.target !== trigger && !trigger?.contains(e.target)) {
        closeNarratePanel();
    }
}

function updateSceneChangePreview() {
    const preview = document.getElementById('sceneChangePreview');
    if (!preview) return;

    if (!pendingSceneChange) {
        preview.style.display = 'none';
        preview.textContent = '';
        return;
    }

    preview.style.display = 'inline-flex';
    preview.textContent = `Próxima escena: ${pendingSceneChange.title}`;
}

function prepareSceneChange() {
    const topic = getCurrentTopic();
    if (!topic) return;

    if (!isNarratorMode) {
        showAutosave('Activa Modo Narrador para cambiar de escena', 'error');
        return;
    }

    if (!canUseNarratorMode(topic)) {
        showAutosave('Solo quien crea la historia puede narrar en modo RPG', 'error');
        return;
    }

    const replyText = document.getElementById('vnReplyText');
    if (!replyText || !replyText.value.trim()) {
        showAutosave('Escribe el mensaje narrativo antes de cambiar escena', 'error');
        return;
    }

    const titleRaw = window.prompt('Nombre de la nueva escena (ej: Playa al atardecer):', 'Nueva escena');
    if (titleRaw === null) return;
    const title = String(titleRaw || '').trim() || 'Nueva escena';

    const backgroundRaw = window.prompt('URL de fondo para la escena (opcional, deja vacío para usar el fondo por defecto):', '');
    if (backgroundRaw === null) return;
    const background = resolveTopicBackgroundPath(String(backgroundRaw || '').trim());

    pendingSceneChange = {
        title,
        background,
        at: new Date().toISOString()
    };

    updateSceneChangePreview();
    if (typeof _updateNarratePending === 'function') _updateNarratePending();
    showAutosave(`Escena preparada: ${title}`, 'saved');
}

function applySceneChangeToTopic(topic, sceneChange) {
    if (!topic || !sceneChange) return;

    if (sceneChange.background) {
        topic.background = sceneChange.background;
    }

    if (topic.mode === 'rpg') {
        appData.characters.forEach((char) => {
            if (typeof ensureCharacterRpgProfile !== 'function') return;
            const profile = ensureCharacterRpgProfile(char, topic.id);
            if (!profile) return;
            profile.hp = 10;
            profile.knockedOutTurns = 0;
        });
    }

    const vnSection = document.getElementById('vnSection');
    applyTopicBackground(vnSection, topic.background || DEFAULT_TOPIC_BACKGROUND);
    playVnSceneTransition(vnSection);
}

function openReplyPanel() {
    markContinuousInteraction();
    const panel = document.getElementById('vnReplyPanel');
    if (!panel) return;

    // ── Mover el panel al <body> si sigue dentro de vnSection ────────────
    // position:fixed se rompe cuando un ancestro tiene filter: o transform:.
    // Al moverlo a body se garantiza que el overlay cubre el viewport real.
    if (panel.parentElement !== document.body) {
        document.body.appendChild(panel);
    }

    panel.style.display = 'flex';
    cancelContinuousRead('reply-open');
    // Drawer gestures no aplican al nuevo modal, pero mantenemos la llamada por compatibilidad
    bindReplyDrawerGestures();
    panel.classList.remove('drawer-expanded', 'drawer-collapsed');
    updateVnMobileFabVisibility();
    updateOracleFloatButton();

    const replyPanelTitle  = document.getElementById('replyPanelTitle');
    const submitBtn        = document.getElementById('submitReplyBtn');
    const optionsToggleContainer  = document.getElementById('optionsToggleContainer');
    const weatherSelectorContainer = document.getElementById('weatherSelectorContainer');
    const narratorToggle   = document.getElementById('narratorToggle');
    const vrpCharBadge     = document.getElementById('vrpCharBadge');

    // Título según contexto (editar vs responder)
    if (replyPanelTitle) replyPanelTitle.textContent = editingMessageId ? 'Editar Mensaje' : 'Responder';
    if (submitBtn) {
        const sendSpan = submitBtn.querySelector('span');
        if (sendSpan) sendSpan.textContent = editingMessageId ? 'Guardar Cambios' : 'Enviar Mensaje';
        submitBtn.onclick = editingMessageId ? saveEditedMessage : postVNReply;
    }

    // Badge con nombre del personaje activo
    if (vrpCharBadge && selectedCharId) {
        const activeChar = appData.characters.find(c => String(c.id) === String(selectedCharId));
        if (activeChar) vrpCharBadge.textContent = activeChar.name;
    }

    // Mostrar/ocultar opciones según modo
    if (optionsToggleContainer) {
        optionsToggleContainer.style.display = isRpgModeMode() ? 'none' : 'flex';
    }

    // Mostrar selector de clima siempre
    if (weatherSelectorContainer) {
        weatherSelectorContainer.style.display = 'block';
    }

    const topic = getCurrentTopic();
    setupOraclePanelForMode();
    const narratorAllowed = canUseNarratorMode(topic);
    if (narratorToggle) {
        narratorToggle.style.display = narratorAllowed ? 'flex' : 'none';
    }
    if (!narratorAllowed) {
        isNarratorMode = false;
        const narratorMode = document.getElementById('narratorMode');
        if (narratorMode) narratorMode.checked = false;
        if (narratorToggle) narratorToggle.classList.remove('active');
    }

    if (!editingMessageId) {
        const replyText = document.getElementById('vnReplyText');
        if (replyText) {
            replyText.value = '';
            vrpUpdatePreview();
            vrpAutoResize(replyText);
        }

        const enableOptions = document.getElementById('enableOptions');
        const optionsFields = document.getElementById('optionsFields');
        if (enableOptions) enableOptions.checked = false;
        if (optionsFields) optionsFields.classList.remove('active');

        for (let i = 1; i <= 3; i++) {
            const textInput = document.getElementById(`option${i}Text`);
            const contInput = document.getElementById(`option${i}Continuation`);
            if (textInput) textInput.value = '';
            if (contInput) contInput.value = '';
        }
        tempBranches = [];
    }

    updateCharSelector();
    updateSceneChangePreview();

    // Actualizar botones de clima (nuevos vrp-weather-btn)
    vrpSyncWeatherButtons();

    // Foco al textarea después de la animación de entrada
    setTimeout(() => {
        const replyText = document.getElementById('vnReplyText');
        if (replyText) replyText.focus();
    }, 240);
}

function closeReplyPanel() {
    const panel = document.getElementById('vnReplyPanel');
    if (panel) panel.style.display = 'none';
    emitTypingState(false);
    updateVnMobileFabVisibility();
    closeReplyEmotePopover();

    const replyText = document.getElementById('vnReplyText');
    if (replyText) replyText.value = '';

    isNarratorMode = false;
    editingMessageId = null;
    tempBranches = [];
    pendingSceneChange = null;
    updateSceneChangePreview();

    const narratorMode = document.getElementById('narratorMode');
    const charSelector = document.getElementById('charSelectorContainer');
    const narratorToggle = document.getElementById('narratorToggle');

    if (narratorMode) narratorMode.checked = false;
    if (charSelector) charSelector.style.display = 'flex';
    if (narratorToggle) narratorToggle.classList.remove('active');
    resetOraclePanelState();
    updateOracleFloatButton();
}

function toggleCharGrid() {
    if (isNarratorMode) return;
    const topic = getCurrentTopic();
    if (getTopicLockedCharacterId(topic)) return;
    const grid = document.getElementById('charGridDropdown');
    if (grid) grid.classList.toggle('active');
}

function updateCharSelector() {
    const mine = appData.characters.filter(c => c.userIndex === currentUserIndex);
    const display = document.getElementById('charSelectedDisplay');
    const nameEl = document.getElementById('charSelectedName');
    const grid = document.getElementById('charGridDropdown');

    if(!nameEl) return;

    if(mine.length === 0) {
        nameEl.textContent = 'Crea un personaje primero';
        if (grid) grid.innerHTML = '';
        return;
    }

    if (!selectedCharId) {
        const savedCharId = localStorage.getItem(`etheria_selected_char_${currentUserIndex}`);
        selectedCharId = savedCharId || mine[0]?.id;
    }

    const topic = getCurrentTopic();
    const lockedCharId = getTopicLockedCharacterId(topic);
    const isCharLocked = !!lockedCharId;

    if (isCharLocked) {
        const lockedChar = mine.find(c => c.id === lockedCharId);
        if (lockedChar) selectedCharId = lockedChar.id;
    }

    const currentChar = mine.find(c => c.id === selectedCharId) || mine[0];
    if (!currentChar) return;

    selectedCharId = currentChar.id;

    nameEl.textContent = currentChar.name;

    if (grid && !isCharLocked) {
        grid.innerHTML = mine.map(c => `
            <div class="char-grid-item ${c.id === selectedCharId ? 'selected' : ''}" onclick="selectCharFromGrid('${c.id}')">
                ${c.avatar ?
                    `<img src="${escapeHtml(c.avatar)}" alt="Avatar de ${escapeHtml(c.name)}" data-fallback="${escapeHtml((c.name || '?')[0])}" class="char-grid-img">` :
                    `<div class="placeholder">${c.name[0]}</div>`
                }
            </div>
        `).join('');
        // XSS fix: bind onerror on grid images after DOM insertion
        grid.querySelectorAll('img.char-grid-img').forEach(function (img) {
            img.onerror = function () {
                this.style.display = 'none';
                const _ph = document.createElement('div');
                _ph.className = 'placeholder';
                _ph.textContent = this.dataset.fallback || '?';
                this.parentElement.appendChild(_ph);
            };
        });
    } else if (grid) {
        grid.innerHTML = '';
        grid.classList.remove('active');
    }
}

function selectCharFromGrid(charId) {
    const topic = getCurrentTopic();
    if (getTopicLockedCharacterId(topic)) return;

    selectedCharId = charId;
    localStorage.setItem(`etheria_selected_char_${currentUserIndex}`, charId);
    updateCharSelector();

    const grid = document.getElementById('charGridDropdown');
    if (grid) grid.classList.remove('active');
}

function openSelectedCharacterStats() {
    const topic = getCurrentTopic();
    if (topic?.mode !== 'rpg') return;
    if (!selectedCharId || typeof openRpgStatsModal !== 'function') return;
    openRpgStatsModal(selectedCharId);
}

function toggleOptionsFields() {
    const cb = document.getElementById('enableOptions');
    const fields = document.getElementById('optionsFields');

    if (!fields) return;

    if (fields.classList.contains('active')) {
        fields.classList.remove('active');
        if (cb) cb.checked = false;
    } else {
        fields.classList.add('active');
        if (cb) cb.checked = true;

        if (tempBranches.length > 0) {
            tempBranches.forEach((branch, idx) => {
                if (idx < 3) {
                    const textInput = document.getElementById(`option${idx + 1}Text`);
                    const contInput = document.getElementById(`option${idx + 1}Continuation`);
                    if (textInput) textInput.value = branch.text || '';
                    if (contInput) contInput.value = branch.continuation || '';
                }
            });
        }
    }
}

function toggleNarratorMode() {
    const topic = getCurrentTopic();
    if (!canUseNarratorMode(topic)) return;

    const narratorMode = document.getElementById('narratorMode');
    const toggle       = document.getElementById('narratorToggle');

    // Toggle state: si el switch está activo se desactiva y viceversa
    isNarratorMode = toggle ? !toggle.classList.contains('active') : false;
    if (narratorMode) narratorMode.checked = isNarratorMode;

    const container = document.getElementById('charSelectorContainer');

    if (isNarratorMode) {
        if (container) container.style.display = 'none';
        if (toggle) toggle.classList.add('active');
        selectedCharId = null;
    } else {
        if (container) container.style.display = 'flex';
        if (toggle) toggle.classList.remove('active');
        updateCharSelector();
    }
}


async function notifyNextTurnIfNeeded(newMsg, topic, char) {
    if (!currentStoryId) return;
    if (typeof SupabaseTurnNotifications === 'undefined' || typeof SupabaseTurnNotifications.notifyTurn !== 'function') return;

    const participants = Array.isArray(currentStoryParticipants) ? currentStoryParticipants : [];
    const userIds = participants
        .map(p => p?.user_id)
        .filter(Boolean)
        .filter((uid, idx, arr) => arr.indexOf(uid) === idx);

    if (userIds.length < 2) return;

    const me = window._cachedUserId || null;
    if (!me) return;

    const myIndex = userIds.indexOf(me);
    if (myIndex === -1) return;

    const recipientUserId = userIds[(myIndex + 1) % userIds.length];
    if (!recipientUserId || recipientUserId === me) return;

    const topicTitle = topic?.title || 'historia colaborativa';
    const speaker = newMsg?.isNarrator ? 'Narrador' : (char?.name || newMsg?.charName || 'Jugador');
    const preview = String(newMsg?.text || '').replace(/\s+/g, ' ').slice(0, 110);

    await SupabaseTurnNotifications.notifyTurn({
        storyId: currentStoryId,
        topicId: currentTopicId,
        messageId: newMsg?.id || null,
        recipientUserId,
        title: '🎯 Te toca responder',
        body: `${speaker} respondió en ${topicTitle}: ${preview}${preview.length >= 110 ? '…' : ''}`,
        meta: {
            speaker,
            topicTitle,
            weather: currentWeather || null
        }
    });
}

function postVNReply() {
    const replyText = document.getElementById('vnReplyText');
    const text = replyText?.value.trim();
    emitTypingState(false);
    if(!text) { showAutosave('Escribe algo primero', 'error'); return; }

    const topic = getCurrentTopic();

    if (isNarratorMode && !canUseNarratorMode(topic)) { showAutosave('Solo quien crea la historia puede usar Narrador en modo RPG', 'error'); return; }

    let char = null;
    if(!isNarratorMode) {
        if(!selectedCharId) { showAutosave('Selecciona un personaje', 'error'); return; }
        char = appData.characters.find(c => c.id === selectedCharId);
        if (!char) { showAutosave('Personaje no encontrado', 'error'); return; }
        if (topic?.mode === 'rpg' && typeof ensureCharacterRpgProfile === 'function') {
            const profile = ensureCharacterRpgProfile(char, currentTopicId || null);
            if (profile.conditions?.includes('dead')) {
                showAutosave(`${char.name} ha caído. Solo el DM puede reincorporarle a la partida.`, 'error');
                return;
            }
            if (profile.knockedOutTurns > 0) {
                showAutosave(`Este personaje está fuera de escena por ${profile.knockedOutTurns} turnos`, 'error');
                return;
            }
        }
        persistTopicLockedCharacter(topic, selectedCharId);
    }

    let options = null;
    const enableOptions = document.getElementById('enableOptions');
    if(enableOptions && enableOptions.checked && !isRpgModeMode()) {
        options = [];
        for(let i=1; i<=3; i++) {
            const textInput = document.getElementById(`option${i}Text`);
            const contInput = document.getElementById(`option${i}Continuation`);
            const t = textInput?.value.trim() || '';
            const c = contInput?.value.trim() || '';
            if(t && c) options.push({text: t, continuation: c});
        }
        if(options.length === 0) { showAutosave('Rellena al menos una opción con texto y continuación', 'error'); return; }
    }

    const topicMessages = getTopicMessages(currentTopicId);

    const sceneChange = pendingSceneChange || undefined;
    pendingSceneChange = null;
    updateSceneChangePreview();

    const finalText = sceneChange ? `🎬 **Escena: ${sceneChange.title}**\n${text}` : text;
    const oracleQuestionInput = document.getElementById('oracleMiniQuestion'); // fix: id correcto
    const shouldApplyOracle = oracleModeActive && isRpgTopicMode(topic?.mode);
    let oracleData;
    if (shouldApplyOracle) {
        const statValue = getOracleSelectedStatValue();
        const modifier = getOracleModifier(statValue);
        const dc = calculateOracleDifficulty();
        const roll = Math.floor(Math.random() * 20) + 1;
        const total = Math.max(1, Math.min(20, roll + modifier));
        const result = getOracleRollResult(roll, total);
        oracleData = {
            question: (oracleQuestionInput?.value || '').trim() || getOracleAutodetectedQuestion(text) || 'Pregunta al destino',
            stat: oracleStat,
            statValue,
            modifier,
            dc,
            roll,
            total,
            result,
            timestamp: Date.now()
        };
        showDiceResultOverlay({ roll, modifier, total, result, stat: oracleStat, statValue });
    }

    const newMsg = {
        id: (globalThis.crypto && typeof globalThis.crypto.randomUUID === 'function')
            ? globalThis.crypto.randomUUID()
            : `${Date.now()}_${Math.random().toString(16).slice(2)}`,
        characterId: isNarratorMode ? null : selectedCharId,
        charName: isNarratorMode ? 'Narrador' : char.name,
        charColor: isNarratorMode ? null : char.color,
        charAvatar: isNarratorMode ? null : char.avatar,
        charSprite: isNarratorMode ? null : char.sprite,
        text: finalText,
        isNarrator: isNarratorMode,
        userIndex: currentUserIndex,
        timestamp: new Date().toISOString(),
        options: options && options.length > 0 ? options : undefined,
        weather: currentWeather !== 'none' ? currentWeather : undefined,
        sceneChange: sceneChange,
        oracle: oracleData,
        tone: undefined,
        chapter: (topic?.mode !== 'rpg' && pendingChapter) ? pendingChapter : undefined,
    };

    if (sceneChange) {
        applySceneChangeToTopic(topic, sceneChange);
    }

    // Limpiar capítulo pendiente después de usarlo
    if (newMsg.chapter) {
        pendingChapter = null;
        updateChapterPreview();
    }

    if (topic?.mode === 'rpg') {
        tickRpgKnockoutTurns(isNarratorMode ? null : selectedCharId);
        const _charForConseq = isNarratorMode ? null : appData.characters.find(c => String(c.id) === String(selectedCharId));
        const _effects = applyRpgNarrativeProgress(isNarratorMode ? null : selectedCharId, oracleData);
        if (_effects && oracleData) {
            const _conseqText = buildConsequenceBadgeText(oracleData.result, _effects, _charForConseq?.name);
            if (_conseqText) {
                newMsg.oracleConsequence = _conseqText;
                if (_effects.levelUp && _charForConseq) {
                    const _p = typeof ensureCharacterRpgProfile === 'function'
                        ? ensureCharacterRpgProfile(_charForConseq, currentTopicId) : null;
                    if (_p) { _effects.newLevel = _p.level; newMsg.oracleConsequence = buildConsequenceBadgeText(oracleData.result, _effects, _charForConseq.name); }
                }
            }
        }
    }

    topicMessages.push(newMsg);

    // Envío a Supabase (no bloquea — fallback local automático si falla)
    if (typeof SupabaseMessages !== 'undefined' && currentTopicId) {
        SupabaseMessages.send(currentTopicId, newMsg).catch(() => {});
    }

    notifyNextTurnIfNeeded(newMsg, topic, char).catch(() => {});

    // Notificar a Ethy del mensaje enviado
    window.dispatchEvent(new CustomEvent('etheria:message-sent', {
        detail: { text: newMsg.text || '' }
    }));

    hasUnsavedChanges = true;
    save({ silent: true });
    // Subir a nube al enviar mensaje (operación más frecuente — crítica para sincronía)
    if (typeof SupabaseSync !== 'undefined') {
        SupabaseSync.uploadProfileData().catch(() => {});
    }
    closeReplyPanel();
    currentMessageIndex = getTopicMessages(currentTopicId).length - 1;
    triggerDialogueFadeIn();
    showCurrentMessage('forward');
}

// ============================================

function toggleContinuousReading(enabled) {
    continuousReadEnabled = !!enabled;
    markContinuousInteraction();
    localStorage.setItem('etheria_continuous_read', continuousReadEnabled ? '1' : '0');
    if (!continuousReadEnabled) {
        cancelContinuousRead('disabled');
        return;
    }
    scheduleContinuousReadIfNeeded(getTopicMessages(currentTopicId)[currentMessageIndex]);
}

function updateContinuousReadDelay(seconds) {
    continuousReadDelaySec = Math.max(3, Math.min(5, Number(seconds) || 4));
    localStorage.setItem('etheria_continuous_delay', String(continuousReadDelaySec));
    const valEl = document.getElementById('optContinuousDelayVal');
    if (valEl) valEl.textContent = `${continuousReadDelaySec}s`;
}

if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
            cancelContinuousRead('hidden');
            return;
        }
        if (continuousReadEnabled) scheduleContinuousReadIfNeeded(getTopicMessages(currentTopicId)[currentMessageIndex]);
    });
}

if (typeof window !== 'undefined') {
    window.etheriaDebug = window.etheriaDebug || {};
    window.etheriaDebug.logRenderTimes = false;
    window.etheriaDebug.simulateLowMemory = function () {
        document.querySelectorAll('.vn-sprite').forEach((s) => { s.style.animation = 'none'; });
    };
    window.etheriaDebug.simulateOffline = function () {
        if (typeof SupabaseMessages !== 'undefined') SupabaseMessages.unsubscribe();
        if (typeof isOfflineMode !== 'undefined') isOfflineMode = true;
    };
};

// ============================================
// SISTEMA DEL POSADERO — GARRICK
// La Chimenea Rota
// ============================================

const GARRICK = {
    id: '__garrick__',
    name: 'Garrick',
    subtitle: 'La Chimenea Rota',
    color: 'rgba(160, 100, 40, 0.9)',
    colorFull: '#a06428',
};

// Diálogos por fase — cada uno con variantes aleatorias
// fase: 'arrival' | 'night' | 'morning' | 'hp_full' | 'hp_low' | 'farewell'
const GARRICK_DIALOGUES = {

    arrival: [
        `*La puerta cruje. El fuego en la chimenea no se inmuta.* El camino os ha dejado su firma encima. No hace falta que lo digáis. **Las camas están al fondo. La sopa, en el caldero.** Si queréis algo más, decídmelo antes de que me siente.`,
        `*Deja el paño sobre la barra sin mirar hacia la puerta.* El fuego arde. Las camas existen. Lo que traéis de afuera, dejadlo en el umbral — aquí no entra el camino. **Hay sitio para todos los que paguen o para los que no molesten.** Vosotros parecéis de los segundos.`,
        `*Lleva años leyendo llegadas en la forma en que se abre una puerta.* Cansancio real, no el de los que buscan excusa. **Bien.** Eso significa que esta noche dormiréis. La chimenea no hace preguntas, el colchón tampoco.`,
        `*Alza los ojos del libro de cuentas. Los baja otra vez.* Hay espacio. Hay fuego. Hay silencio, si se lo cuidáis. **Lo que necesitéis está donde siempre ha estado.** Lo que no esté, no lo tengo.`,
    ],

    night: [
        `*El fuego ya es brasas. La posada respira despacio.* Las heridas que no arden ya no sangran. Las que sí... el sueño las conoce mejor que yo. **Descansad.** El camino no os espera esta noche — eso es suficiente.`,
        `*Apaga la última vela de la barra sin mirar hacia las habitaciones.* He visto a gente marcharse de aquí peor de como llegó por no saber cuándo parar. **Vosotros paráis esta noche.** Eso ya es saber algo que muchos no aprenden nunca.`,
        `*Solo queda el crepitar de las brasas y el peso del silencio.* El cuerpo recuerda lo que la cabeza olvida cuando está ocupada. **Esta noche, recordad.** Mañana el camino tendrá opinión. Ahora, no.`,
        `*Pone el pestillo sin hacer ruido.* Los que duermen aquí suelen salir mejor de como entraron. No es magia — es lo que hace el silencio cuando se le da tiempo. **Buenas noches. O lo que quede de ellas.**`,
    ],

    morning: [
        `*El olor a pan recién hecho llega antes que la luz.* Las brasas llevan horas trabajando para vosotros. **Levantaos.** El camino os devuelve lo que le disteis anoche — solo que con intereses.`,
        `*Ya tiene la bolsa de provisiones en la barra cuando bajáis.* No tengo discursos de despedida. **El fuego os ha hecho el favor que podía.** Lo que hagáis con eso es cosa vuestra.`,
        `*Sirve el desayuno sin que se lo pidan.* He visto partir a suficiente gente como para saber que los que se van bien desayunados duran más. **Comed. Luego salid. En ese orden.**`,
        `*Limpia el mostrador sin mirar hacia las escaleras.* El camino os espera igual que os dejó anoche — solo que vosotros ya no sois exactamente los mismos. **Eso, a veces, es suficiente ventaja.**`,
    ],

    hp_full: [
        `*Os mira de arriba abajo. Apenas una fracción de segundo.* No estáis heridos. **Entonces el fuego esta noche es lujo, no necesidad.** Igual de bienvenido. Pero que conste que lo sé.`,
        `*Deja la llave encima de la barra sin comentario.* Venís enteros. Raro, pero existe. **Aprovechadlo — el camino tiene memoria y la usa cuando menos conviene.**`,
    ],

    hp_low: [
        `*Hace un gesto mínimo hacia las sillas más cercanas al fuego.* Las heridas que entran aquí tienen la costumbre de quedarse un poco menos cuando salen. **Sentaos cerca del calor.** No lo explico, solo lo he visto.`,
        `*Sin drama, sin comentario. Solo deja vendas limpias en la habitación.* He aprendido a no preguntar cómo. Solo cuenta el cuánto y el ahora. **El fuego sabe lo que hace. Dejad que trabaje.**`,
        `*El fuego arde un poco más alto esta noche. No es coincidencia.* El camino os ha cobrado. **La chimenea os devuelve lo que puede.** El resto, el sueño.`,
    ],

    farewell: [
        `*No levanta la vista del libro de cuentas.* El camino os llama. **Bien.** Aquí estará cuando volváis — o cuando llegue quien venga después. La chimenea no tiene favoritos.`,
        `*Un gesto seco con la barbilla hacia la puerta.* Habéis descansado lo que necesitabais. **Eso ya es más de lo que muchos consiguen.** Id.`,
        `*Solo dice esto, sin mirar:* Las cenizas de esta noche fueron vuestras. Las del camino que viene... esas aún no tienen nombre. **Bien. Así debe ser.**`,
        `*Coloca algo en la barra — provisiones, sin pedir nada a cambio.* Por si el camino se alarga más de lo previsto. **No es generosidad. Es pragmatismo.** Un cliente que llega es mejor que uno que no llega.`,
    ],
};

function _garrickPick(phase) {
    const pool = GARRICK_DIALOGUES[phase] || GARRICK_DIALOGUES.arrival;
    return pool[Math.floor(Math.random() * pool.length)];
}

function _garrickHpPhase() {
    // Evalúa el HP del personaje activo del usuario actual
    const char = appData.characters.find(c => c.id === selectedCharId);
    if (!char || typeof ensureCharacterRpgProfile !== 'function') return 'arrival';
    const profile = ensureCharacterRpgProfile(char, currentTopicId || null);
    const hp = profile?.hp ?? 10;
    const maxHp = 10;
    if (hp >= maxHp) return 'hp_full';
    if (hp <= 4)  return 'hp_low';
    return null; // herido pero moderado — no cambia el diálogo de llegada
}

function _postGarrickMessage(text, isLast = false) {
    const topicMessages = getTopicMessages(currentTopicId);
    const newMsg = {
        id: (globalThis.crypto?.randomUUID?.()) || `${Date.now()}_${Math.random().toString(16).slice(2)}`,
        characterId: null,
        charName: GARRICK.name,
        charColor: GARRICK.color,
        charAvatar: null,
        charSprite: null,
        text,
        isNarrator: true,
        isGarrick: true,
        isGarrickFarewell: isLast,
        userIndex: currentUserIndex,
        timestamp: new Date().toISOString(),
    };
    topicMessages.push(newMsg);
    if (typeof SupabaseMessages !== 'undefined' && currentTopicId) {
        SupabaseMessages.send(currentTopicId, newMsg).catch(() => {});
    }
    return newMsg;
}

function triggerInnkeeperScene() {
    const topic = getCurrentTopic();
    if (!topic || !canUseNarratorMode(topic)) {
        showAutosave('Solo el narrador puede invocar al posadero', 'error');
        return;
    }
    if (topic.mode !== 'rpg') {
        showAutosave('El posadero solo aparece en partidas RPG', 'error');
        return;
    }

    // 1. Pedir título del nuevo capítulo (igual que prepareChapter)
    const num = getNextChapterNumber();
    const def = `Capítulo ${['I','II','III','IV','V','VI','VII','VIII','IX','X'][num - 1] || num}`;
    const titleRaw = window.prompt(`Título del capítulo ${num}:`, def);
    if (titleRaw === null) return;
    const title = String(titleRaw || '').trim() || def;

    // 2. Fondo de escena opcional
    const backgroundRaw = window.prompt('URL del fondo para esta escena (opcional — deja vacío para el fondo actual):', '');
    if (backgroundRaw === null) return;
    const background = backgroundRaw.trim()
        ? resolveTopicBackgroundPath(backgroundRaw.trim())
        : null;

    // 3. Preparar el capítulo como siempre (restaura HP en applySceneChangeToTopic)
    pendingChapter = { title, number: num };
    if (background) {
        pendingSceneChange = { title, background, at: new Date().toISOString() };
    }
    updateChapterPreview();

    // 4. Calcular estado del personaje activo ANTES de restaurar HP
    const char = appData.characters.find(c => c.id === selectedCharId);
    let hpPhase = 'arrival';
    let hpBefore = 10;
    if (char && typeof ensureCharacterRpgProfile === 'function') {
        const profile = ensureCharacterRpgProfile(char, currentTopicId || null);
        hpBefore = profile?.hp ?? 10;
        const override = _garrickHpPhase();
        if (override) hpPhase = override;
    }

    // 5. Publicar los tres mensajes de Garrick en secuencia
    hasUnsavedChanges = true;

    // Aplicar el cambio de escena YA (restaura HP, cambia fondo)
    if (pendingSceneChange) {
        applySceneChangeToTopic(topic, pendingSceneChange);
        pendingSceneChange = null;
        updateSceneChangePreview();
    } else {
        // Sin cambio de fondo pero igual restaurar HP
        if (topic.mode === 'rpg') {
            appData.characters.forEach((ch) => {
                if (typeof ensureCharacterRpgProfile !== 'function') return;
                const p = ensureCharacterRpgProfile(ch, topic.id);
                if (p) { p.hp = 10; p.knockedOutTurns = 0; }
            });
        }
    }

    // Mensaje 1: llegada
    const arrivalText = _garrickPick(hpPhase === 'hp_full' ? 'hp_full' : hpPhase === 'hp_low' ? 'hp_low' : 'arrival');
    const arrivalMsg = _postGarrickMessage(arrivalText);
    // Vincular el capítulo al primer mensaje de Garrick
    arrivalMsg.chapter = pendingChapter;
    pendingChapter = null;
    updateChapterPreview();

    // Mensaje 2: noche
    const nightMsg = _postGarrickMessage(_garrickPick('night'));

    // Mensaje 3: despedida (mañana) — marca que el HP ya está restaurado
    const farewellMsg = _postGarrickMessage(_garrickPick(hpBefore < 10 ? 'morning' : 'farewell'), true);

    save({ silent: true });

    // Mostrar el primer mensaje y dejar que el líder narrador continúe
    currentMessageIndex = getTopicMessages(currentTopicId).length - 3; // ir al primer mensaje de Garrick
    triggerDialogueFadeIn();
    showCurrentMessage('forward');

    showAutosave(`🍺 Garrick ha hablado — HP restaurado. Ahora usa el Narrador para continuar.`, 'saved');
    if (typeof updateAffinityDisplay === 'function') updateAffinityDisplay();
    if (typeof updateNarrateButton === 'function') updateNarrateButton();
}

// ═══════════════════════════════════════════════════════════════════════════
// VRP (Modal Responder v2) — helpers: Markdown preview, auto-resize, clima
// ═══════════════════════════════════════════════════════════════════════════

/** Mapa de emotes para el preview */
const _VRP_EMOTE_MAP = {
    angry: '💢', happy: '✨', shock: '💦', sad: '💧', think: '💭',
    love: '💕', annoyed: '💢', embarrassed: '😳', idea: '💡', sleep: '💤'
};

/**
 * Convierte texto con Markdown básico y comandos /emote a HTML para el preview.
 * No usa dependencias externas — regex ligero.
 */
function vrpRenderMarkdown(text) {
    if (!text) return '';

    let html = text
        // Escapar HTML básico para evitar XSS
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        // Negrita: **texto** o __texto__
        .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
        .replace(/__(.+?)__/g, '<strong>$1</strong>')
        // Cursiva: *texto* o _texto_ (no seguido de otro *)
        .replace(/\*(?!\*)(.+?)(?<!\*)\*/g, '<em>$1</em>')
        .replace(/_(?!_)(.+?)(?<!_)_/g, '<em>$1</em>')
        // Comandos de emote: /angry → 💢 con clase animada
        .replace(/\/(angry|happy|shock|sad|think|love|annoyed|embarrassed|idea|sleep)\b/gi,
            (_, cmd) => {
                const sym = _VRP_EMOTE_MAP[cmd.toLowerCase()] || '';
                return `<span class="emote-tag" title="/${cmd}">${sym}</span>`;
            })
        // Saltos de línea
        .replace(/\n/g, '<br>');

    return html;
}

/** Actualiza el panel de preview con el contenido actual del textarea */
function vrpUpdatePreview() {
    const textarea = document.getElementById('vnReplyText');
    const preview  = document.getElementById('vrpPreviewContent');
    const hint     = document.getElementById('vrpPreviewHint');
    if (!textarea || !preview) return;

    const raw = textarea.value;
    const rendered = vrpRenderMarkdown(raw);
    preview.innerHTML = rendered || '';

    if (hint) {
        hint.textContent = raw.length > 0
            ? `${raw.length} car.`
            : 'Empieza a escribir…';
    }
}

/** Auto-resize del textarea: crece con el contenido hasta max-height CSS */
function vrpAutoResize(el) {
    if (!el) return;
    // Reset para calcular correctamente scrollHeight
    el.style.height = 'auto';
    // Aplicar la altura real del contenido (respeta max-height del CSS)
    const maxH = parseInt(getComputedStyle(el).maxHeight || '260', 10);
    const newH = Math.min(el.scrollHeight, maxH);
    el.style.height = newH + 'px';
    // Si el contenido supera el max, activar scroll interno
    el.style.overflowY = el.scrollHeight > maxH ? 'auto' : 'hidden';
}

/** Toggle de preview en portrait: muestra/oculta el preview pane */
function vrpTogglePreview() {
    const previewPane   = document.getElementById('vrpPreviewPane');
    const toggleBtn     = document.getElementById('vrpPreviewToggle');
    if (!previewPane || !toggleBtn) return;

    const isVisible = previewPane.classList.contains('vrp-preview-visible');
    previewPane.classList.toggle('vrp-preview-visible', !isVisible);
    toggleBtn.classList.toggle('active', !isVisible);

    if (!isVisible) {
        // Al abrir el preview, actualizar contenido
        vrpUpdatePreview();
        toggleBtn.textContent = '✕ Cerrar vista previa';
    } else {
        toggleBtn.innerHTML = '<span>👁</span> Ver vista previa';
    }
}

/** Sincroniza los botones de clima del nuevo modal con el estado actual */
function vrpSyncWeatherButtons() {
    document.querySelectorAll('.vrp-weather-btn').forEach(btn => {
        const w = btn.dataset.weather;
        const isActive = (w === 'none' && (currentWeather === 'none' || !currentWeather))
                      || (w === currentWeather);
        btn.classList.toggle('active', isActive);
    });
}

/** Marca el botón de clima clicado como activo (llamado desde onclick del HTML) */
function vrpSetWeatherBtn(clickedBtn) {
    document.querySelectorAll('.vrp-weather-btn').forEach(b => b.classList.remove('active'));
    if (clickedBtn) clickedBtn.classList.add('active');
}
