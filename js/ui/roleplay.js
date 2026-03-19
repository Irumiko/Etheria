// Sistema de modo rpg y afinidad entre personajes.
// ============================================
// MODO RPG VS ROLEPLAY
// ============================================
const TOPIC_MODE_STORAGE_KEY = 'etheria_topic_mode';
let roleCharacterModalContext = null;

function updateTopicModeUI() {
    const modeRoleplay = document.getElementById('modeRoleplay');
    const modeRpg = document.getElementById('modeRpg');

    const persistedMode = localStorage.getItem(TOPIC_MODE_STORAGE_KEY);
    let selectedMode = currentTopicMode === 'rpg' ? 'rpg' : 'roleplay';

    if (modeRpg && modeRpg.checked) selectedMode = 'rpg';
    else if (modeRoleplay && modeRoleplay.checked) selectedMode = 'roleplay';
    else if (persistedMode === 'rpg' || persistedMode === 'roleplay') selectedMode = persistedMode;

    currentTopicMode = selectedMode;
    localStorage.setItem(TOPIC_MODE_STORAGE_KEY, selectedMode);

    if (modeRoleplay) modeRoleplay.checked = selectedMode === 'roleplay';
    if (modeRpg) modeRpg.checked = selectedMode === 'rpg';

    // Actualizar estilos visuales
    const roleplayLabel = modeRoleplay?.parentElement;
    const rpgLabel = modeRpg?.parentElement;

    roleplayLabel?.classList.toggle('active', selectedMode === 'roleplay');
    rpgLabel?.classList.toggle('active', selectedMode === 'rpg');
}

function openRoleCharacterModal(topicId, options = {}) {
    const grid = document.getElementById('roleCharacterGrid');
    if (!grid) return;

    const topic = appData.topics.find(t => t.id === topicId);
    const isRpgMode = topic?.mode === 'rpg' || options.mode === 'rpg';

    roleCharacterModalContext = {
        topicId,
        isRpgMode,
        enterOnSelect: !!options.enterOnSelect,
        preservePendingTopicId: !!options.preservePendingTopicId
    };

    if (!roleCharacterModalContext.preservePendingTopicId) {
        pendingRoleTopicId = null;
    }

    const title = document.getElementById('roleCharacterTitle');
    const subtitle = document.getElementById('roleCharacterSubtitle');
    if (title) title.textContent = isRpgMode ? 'Selecciona tu personaje para modo RPG' : 'Selecciona tu personaje activo';
    if (subtitle) subtitle.textContent = isRpgMode
        ? 'En modo RPG también debes elegir un personaje al entrar.'
        : 'En modo clásico solo puedes usar un personaje por historia.';

    const mine = appData.characters.filter(c => c.userIndex === currentUserIndex);
    if (!mine.length) {
        roleCharacterModalContext = null;
        if (!isRpgMode && pendingRoleTopicId) {
            // Sin personajes en modo clásico: entrar como Narrador en vez de eliminar la historia
            const topicIdToEnter = pendingRoleTopicId;
            pendingRoleTopicId = null;
            showAutosave('No tienes personajes — entrando como Narrador. Crea uno desde la Galería.', 'info');
            enterTopic(topicIdToEnter);
        } else {
            showAutosave(`Necesitas al menos un personaje para modo ${isRpgMode ? 'RPG' : 'clásico'}`, 'error');
        }
        return;
    }

    grid.innerHTML = mine.map(c => {
        const visual = c.avatar
            ? `<img src="${escapeHtml(c.avatar)}" alt="Avatar de ${escapeHtml(c.name)}">`
            : `<div class="placeholder">${escapeHtml((c.name || '?')[0])}</div>`;
        const statsBtn = isRpgMode
            ? `<button type="button" class="role-char-stats-btn" title="Stats de ${escapeHtml(c.name)}"
                onclick="event.stopPropagation();openRpgStatsModalFromSelect('${topicId}','${c.id}')">⚔️ Stats</button>`
            : '';
        return `<div class="role-char-card">
            <button type="button" class="role-char-bubble" title="${escapeHtml(c.name)}"
                onclick="selectRoleCharacterForTopic('${topicId}', '${c.id}')">${visual}</button>
            <span class="role-char-name">${escapeHtml(c.name)}</span>
            ${statsBtn}
        </div>`;
    }).join('');

    openModal('roleCharacterModal');
}

function selectRoleCharacterForTopic(topicId, charId) {
    const topic = appData.topics.find(t => t.id === topicId);
    if (!topic) return;

    const context = roleCharacterModalContext || { isRpgMode: topic.mode === 'rpg', enterOnSelect: false };

    if (context.isRpgMode || topic.mode === 'rpg') {
        topic.characterLocks = topic.characterLocks || {};
        topic.characterLocks[currentUserIndex] = charId;
        topic.rpgCharacterLocks = topic.rpgCharacterLocks || {};
        topic.rpgCharacterLocks[currentUserIndex] = charId;
    } else {
        topic.roleCharacterId = charId;
    }

    selectedCharId = charId;
    localStorage.setItem(`etheria_selected_char_${currentUserIndex}`, charId);

    hasUnsavedChanges = true;
    save({ silent: true });
    // Sincronizar los locks del personaje en Supabase para que otros jugadores
    // puedan ver qué personaje tiene asignado cada usuario en este topic
    if (typeof SupabaseStories !== 'undefined' && typeof SupabaseStories.upsertStory === 'function') {
        SupabaseStories.upsertStory(topic).catch(() => {});
    }
    if (typeof SupabaseSync !== 'undefined') {
        SupabaseSync.uploadProfileData().catch(() => {});
    }

    pendingRoleTopicId = null;
    roleCharacterModalContext = null;
    closeModal('roleCharacterModal');

    if (context.enterOnSelect) {
        // En RPG: comprobar si hay puntos sin distribuir ANTES de entrar
        const isRpg = context.isRpgMode || topic.mode === 'rpg';
        if (isRpg && typeof openRpgStatsModalBlocking === 'function') {
            const char     = appData.characters.find(c => String(c.id) === String(charId));
            const profile  = (char && typeof ensureCharacterRpgProfile === 'function')
                ? ensureCharacterRpgProfile(char, topicId)
                : null;
            const spent    = (profile && typeof getRpgSpentPoints === 'function')
                ? getRpgSpentPoints(profile)
                : 14; // fallback = pool completo → no bloqueante si sheets.js no cargó
            const statsKey = `etheria_stats_prompted_${topicId}_${charId}`;

            if (!localStorage.getItem(statsKey)) {
                // Distribución obligatoria la primera vez — igual que elegir personaje.
                // El jugador DEBE confirmar la ficha antes de poder entrar al tema.
                localStorage.setItem(statsKey, '1');
                openRpgStatsModalBlocking(charId, topicId, () => enterTopic(topicId));
                return; // no entrar aún — se entra al confirmar
            }
        }
        enterTopic(topicId);
    }
}

function isRpgModeMode() {
    if (!currentTopicId) return false;
    const topic = appData.topics.find(t => t.id === currentTopicId);
    return topic && topic.mode === 'rpg';
}

function shouldShowAffinity() {
    // No mostrar afinidad en modo rpg
    if (isRpgModeMode()) return false;

    if (!currentTopicId) return false;

    const msgs = getTopicMessages(currentTopicId);
    if (msgs.length === 0) return false;

    const currentMsg = msgs[currentMessageIndex];
    if (!currentMsg || currentMsg.isNarrator || !currentMsg.characterId) return false;

    const targetChar = appData.characters.find(c => c.id === currentMsg.characterId);
    if (!targetChar) return false;

    if (targetChar.userIndex === currentUserIndex) return false;

    return true;
}

// ============================================
// SISTEMA DE AFINIDAD MEJORADO
// ============================================
function getAffinityRankInfo(value) {
    for (let rank of affinityRanks) {
        if (value >= rank.min && value <= rank.max) {
            return rank;
        }
    }
    return affinityRanks[0];
}

function getAffinityIncrement(currentValue, direction) {
    const rankInfo = getAffinityRankInfo(currentValue);
    const increment = direction > 0 ? rankInfo.increment : -rankInfo.increment;

    let newValue = currentValue + increment;

    // Al llegar al tope de un rango, seguir dando + para subir al siguiente
    if (direction > 0 && newValue > rankInfo.max && rankInfo.max < 100) {
        // Buscar siguiente rango
        const nextRank = affinityRanks.find(r => r.min > rankInfo.max);
        if (nextRank) {
            newValue = nextRank.min;
        } else {
            newValue = rankInfo.max;
        }
    }

    if (direction < 0 && newValue < rankInfo.min && rankInfo.min > 0) {
        // Buscar rango anterior
        const prevRank = [...affinityRanks].reverse().find(r => r.max < rankInfo.min);
        if (prevRank) {
            newValue = prevRank.max;
        } else {
            newValue = 0;
        }
    }

    if (newValue < 0) newValue = 0;
    if (newValue > 100) newValue = 100;

    return newValue;
}

function getAffinityKey(charId1, charId2) {
    const ids = [charId1, charId2].sort();
    return `${ids[0]}_${ids[1]}`;
}

function getCurrentAffinity() {
    if (!shouldShowAffinity()) return -1;

    const msgs = getTopicMessages(currentTopicId);
    const currentMsg = msgs[currentMessageIndex];

    const targetCharId = currentMsg.characterId;
    const userChars = appData.characters.filter(c => c.userIndex === currentUserIndex);

    if (userChars.length === 0) return -1;

    const activeCharId = selectedCharId || userChars[0].id;

    if (activeCharId === targetCharId) return -1;

    const key = getAffinityKey(activeCharId, targetCharId);
    const topicAffinities = appData.affinities[currentTopicId] || {};

    return topicAffinities[key] || 0;
}

function updateAffinityDisplay() {
    const affinityDisplay = document.getElementById('affinityDisplay');
    const affinityControls = document.querySelector('.affinity-controls-inline');
    const infoName     = document.getElementById('vnInfoName');
    const infoSubtitle = document.getElementById('vnInfoSubtitle');
    const infoAvatar   = document.getElementById('vnInfoAvatar');
    const vnInfoAffection = document.getElementById('vnInfoAffection');
    const vnInfoRpg = document.getElementById('vnInfoRpg');
    const vnInfoRpgSummary = document.getElementById('vnInfoRpgSummary');

    // Elementos de píldoras
    const pillAge    = document.getElementById('vnInfoPillAge');
    const pillSep1   = document.getElementById('vnInfoPillSep1');
    const pillRace   = document.getElementById('vnInfoPillRace');
    const pillSep2   = document.getElementById('vnInfoPillSep2');
    const pillGender = document.getElementById('vnInfoPillGender');

    const msgs = getTopicMessages(currentTopicId);
    const currentMsg = msgs[currentMessageIndex];
    const currentTopic = appData.topics.find(t => t.id === currentTopicId);
    const isRpgModeModeActive = currentTopicMode === 'rpg';

    function getPersistentRpgCharacter() {
        if (!isRpgModeModeActive || !currentTopic) return null;

        const lockMap = currentTopic.characterLocks || currentTopic.rpgCharacterLocks || {};
        const lockedCharId = lockMap[currentUserIndex];
        if (lockedCharId) {
            const lockedChar = appData.characters.find(c => String(c.id) === String(lockedCharId));
            if (lockedChar) return lockedChar;
        }

        if (selectedCharId) {
            const selectedChar = appData.characters.find(c => String(c.id) === String(selectedCharId));
            if (selectedChar) return selectedChar;
        }

        return appData.characters.find(c => c.userIndex === currentUserIndex) || null;
    }

    function setAvatar(char) {
        if (!infoAvatar) return;
        infoAvatar.innerHTML = '';
        if (char && char.avatar) {
            // XSS fix: DOM creation avoids char.name[0] injection in onerror attribute
            const _imgAvatar = document.createElement('img');
            _imgAvatar.src = char.avatar;
            _imgAvatar.alt = 'Avatar de ' + char.name;
            _imgAvatar.onerror = function () {
                this.style.display = 'none';
                const _fb = document.createElement('div');
                _fb.className = 'placeholder';
                _fb.style.cssText = 'width:100%;height:100%;display:flex;align-items:center;justify-content:center;font-size:2rem;';
                _fb.textContent = (char.name || '?')[0];
                this.parentElement.appendChild(_fb);
            };
            infoAvatar.appendChild(_imgAvatar);
        } else {
            const _ph = document.createElement('div');
            _ph.className = 'placeholder';
            _ph.style.cssText = 'width:100%;height:100%;display:flex;align-items:center;justify-content:center;font-size:2rem;';
            _ph.textContent = char ? (char.name || '?')[0] : '👤';
            infoAvatar.appendChild(_ph);
        }
    }


    function setRpgCard(char, isRpgMode) {
        if (!vnInfoRpg) return;
        if (!isRpgMode || !char || typeof ensureCharacterRpgProfile !== 'function') {
            vnInfoRpg.classList.add('hidden');
            return;
        }

        const profile = ensureCharacterRpgProfile(char);
        // Barra HP inline
        const hpFill = document.getElementById('vnInfoHpFill');
        const hpVal  = document.getElementById('vnInfoHpVal');
        const hpPct  = Math.max(0, Math.min(100, (profile.hp / 10) * 100));
        if (hpFill) hpFill.style.width = `${hpPct}%`;
        if (hpVal)  hpVal.textContent  = `${profile.hp}/10`;

        vnInfoRpg.dataset.charId = char.id;
        vnInfoRpg.classList.remove('hidden');
    }

    function setPills(char) {
        if (!char) {
            if (pillAge)    pillAge.textContent    = '';
            if (pillRace)   pillRace.textContent   = '';
            if (pillGender) pillGender.textContent = '';
            if (pillSep1)   pillSep1.textContent   = '';
            if (pillSep2)   pillSep2.textContent   = '';
            return;
        }
        if (pillAge)    pillAge.textContent    = char.age    ? `${char.age} años` : '';
        if (pillRace)   pillRace.textContent   = char.race   ? char.race          : '';
        if (pillGender) pillGender.textContent = char.gender ? char.gender        : '';
        // Separadores: solo si ambos lados tienen contenido
        if (pillSep1)   pillSep1.textContent   = (char.age && char.race)    ? '·' : '';
        if (pillSep2)   pillSep2.textContent   = (char.race && char.gender) ? '·' : '';
    }

    if (isRpgModeModeActive) {
        const rpgChar = getPersistentRpgCharacter();
        affinityDisplay?.classList.add('hidden');
        if (vnInfoAffection) vnInfoAffection.style.display = 'none';

        if (!rpgChar) {
            if (infoName) infoName.textContent = 'Sin personaje RPG';
            if (infoSubtitle) infoSubtitle.textContent = '';
            setAvatar(null);
            setPills(null);
            setRpgCard(null, true);
            updateInfoHoverDetails(null);
            return;
        }

        if (infoName) infoName.textContent = rpgChar.name;
        if (infoSubtitle && typeof ensureCharacterRpgProfile === 'function') {
            const profile = ensureCharacterRpgProfile(rpgChar);
            const title = typeof getRpgTitleByLevel === 'function' ? getRpgTitleByLevel(profile.level) : 'Aprendiz';
            infoSubtitle.textContent = `⚔ Nivel ${profile.level} · ${title}`;
        }
        setAvatar(rpgChar);
        setPills(null);
        setRpgCard(rpgChar, true);
        updateInfoHoverDetails(rpgChar);
        return;
    }

    // Narrador
    if (!currentMsg || currentMsg.isNarrator) {
        affinityDisplay?.classList.add('hidden');
        if (vnInfoAffection) vnInfoAffection.style.display = 'none';
        if (infoName)     infoName.textContent     = 'Narrador';
        if (infoSubtitle) infoSubtitle.textContent = '';
        if (infoAvatar)   infoAvatar.innerHTML = '<div class="placeholder" style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;font-size:2rem;">📖</div>';
        setPills(null);
        setRpgCard(null, false);
        updateInfoHoverDetails(null);
        return;
    }

    if (currentMsg.characterId) {
        const char = appData.characters.find(c => c.id === currentMsg.characterId);
        if (char) {
            if (infoName) infoName.textContent = char.name;
            const isOwnChar = char.userIndex === currentUserIndex;
            const isRpgMode  = isRpgModeModeActive;
            if (infoSubtitle) {
                if (isRpgMode && typeof ensureCharacterRpgProfile === 'function') {
                    const profile = ensureCharacterRpgProfile(char);
                    const title = typeof getRpgTitleByLevel === 'function' ? getRpgTitleByLevel(profile.level) : 'Aprendiz';
                    infoSubtitle.textContent = `⚔ Nivel ${profile.level} · ${title}`;
                } else {
                    // Modo clásico: mostrar ocupación como subtítulo si existe
                    infoSubtitle.textContent = char.job || '';
                }
            }
            setAvatar(char);
            setPills(char);
            setRpgCard(char, isRpgMode);
            updateInfoHoverDetails(char);

            // Modo historia: sin afinidad de ningún tipo
            if (isRpgMode) {
                affinityDisplay?.classList.add('hidden');
                if (vnInfoAffection) vnInfoAffection.style.display = 'none';
                return;
            }

            // Modo rol — personaje propio: etiqueta sin controles
            if (isOwnChar) {
                affinityDisplay?.classList.remove('hidden');
                if (affinityControls) affinityControls.style.display = 'none';
                if (vnInfoAffection) vnInfoAffection.style.display = 'none';
                const rankNameEl = document.getElementById('affinityRankName');
                if (rankNameEl) {
                    rankNameEl.textContent = '✦ Tu personaje';
                    rankNameEl.style.color = 'var(--accent-sage)';
                    rankNameEl.style.textShadow = '0 0 8px rgba(107, 142, 125, 0.5)';
                }
                return;
            }

            // Modo rol — personaje ajeno: sistema completo
            const affinityValue = getCurrentAffinity();
            if (affinityValue !== -1) {
                affinityDisplay?.classList.remove('hidden');
                if (affinityControls) affinityControls.style.display = '';
                if (vnInfoAffection) vnInfoAffection.style.display = 'none';
                const rankInfo = getAffinityRankInfo(affinityValue);
                const rankNameEl = document.getElementById('affinityRankName');
                if (rankNameEl) {
                    rankNameEl.textContent = rankInfo.name;
                    rankNameEl.style.color = rankInfo.color;
                    rankNameEl.style.textShadow = `0 0 10px ${rankInfo.color}`;
                }
                currentAffinity = affinityValue;
                return;
            }
        }
    }

    // Por defecto
    affinityDisplay?.classList.add('hidden');
    if (vnInfoAffection) vnInfoAffection.style.display = 'none';
    if (infoName)     infoName.textContent     = 'Sin personaje';
    if (infoSubtitle) infoSubtitle.textContent = '';
    if (infoAvatar)   infoAvatar.innerHTML = '<div class="placeholder" style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;font-size:2rem;">👤</div>';
    setPills(null);
    setRpgCard(null, false);
    updateInfoHoverDetails(null);
    // Panel literario (modo clásico)
    if (typeof updateClassicLiteraryPanel === 'function') updateClassicLiteraryPanel();
}

// ── Estado del IHP (Info Hover Panel) ──────────────────────────────
// 'hidden': solo visible en hover CSS
// 'pinned': fijo, independiente del hover
let _ihpPinnedChar = null;

function toggleIhpPin() {
    const panel = document.getElementById('vnInfoHoverPanel');
    if (!panel) return;
    const isPinned = panel.dataset.state === 'pinned';
    if (isPinned) {
        unpinIhp();
    } else {
        pinIhp();
    }
}

function pinIhp() {
    const panel = document.getElementById('vnInfoHoverPanel');
    const card  = document.getElementById('vnInfoCard');
    if (!panel) return;
    panel.dataset.state = 'pinned';
    card?.classList.add('ihp-pinned');
    // Renderizar contenido completo (con relaciones/oráculo)
    if (_ihpPinnedChar) updateInfoHoverDetails(_ihpPinnedChar, true);
    // ESC para cerrar
    document.addEventListener('keydown', _ihpEscHandler);
    // Click fuera para cerrar (con delay para no cerrarlo inmediatamente)
    setTimeout(() => {
        document.addEventListener('click', _ihpOutsideHandler, { capture: true });
    }, 150);
}

function unpinIhp() {
    const panel = document.getElementById('vnInfoHoverPanel');
    const card  = document.getElementById('vnInfoCard');
    if (!panel) return;
    panel.dataset.state = 'hidden';
    card?.classList.remove('ihp-pinned');
    document.removeEventListener('keydown', _ihpEscHandler);
    document.removeEventListener('click', _ihpOutsideHandler, { capture: true });
    // Re-renderizar sin contenido pinned-only
    if (_ihpPinnedChar) updateInfoHoverDetails(_ihpPinnedChar, false);
}

function _ihpEscHandler(e) {
    if (e.key === 'Escape') unpinIhp();
}

function _ihpOutsideHandler(e) {
    const card = document.getElementById('vnInfoCard');
    if (card && !card.contains(e.target)) {
        unpinIhp();
    }
}

function updateInfoHoverDetails(char, isPinned = false) {
    const panel = document.getElementById('vnInfoHoverPanel');
    if (!panel) return;

    // Guardar char para re-renders (pin/unpin)
    _ihpPinnedChar = char || null;

    // Sin personaje → ocultar todo excepto si hay estado pinned que preservar
    if (!char) {
        if (panel.dataset.state !== 'pinned') {
            panel.dataset.empty = 'true';
        }
        return;
    }
    panel.dataset.empty = 'false';

    const isRpg   = (currentTopicMode === 'rpg');
    const pinned  = isPinned || panel.dataset.state === 'pinned';

    // ── Emblema ──────────────────────────────────────────────────────
    const ihpEmblem = document.getElementById('ihpEmblem');
    if (ihpEmblem) {
        ihpEmblem.innerHTML = isRpg ? _getRpgClassEmblem(char.job) : _getClassicSealChar(char.name);
        ihpEmblem.title = char.job || '';
    }

    // ── Nombre ───────────────────────────────────────────────────────
    const ihpName = document.getElementById('ihpName');
    if (ihpName) ihpName.textContent = char.lastName ? `${char.name} ${char.lastName}` : char.name;

    // ── Datos básicos ─────────────────────────────────────────────────
    const ihpData = document.getElementById('ihpData');
    if (ihpData) {
        const rows = [
            char.race      && ['Raza',   char.race],
            char.age       && ['Edad',   `${char.age} años`],
            char.gender    && ['Género', char.gender],
            char.alignment && ['Alin.',  (window.alignments?.[char.alignment] || char.alignment)],
            char.job       && !isRpg && ['Ocup.', char.job],
            // En modo RPG mostrar la clase del topic si existe, si no el job del personaje
            isRpg && (() => {
                if (typeof ensureCharacterRpgProfile === 'function') {
                    const p = ensureCharacterRpgProfile(char, currentTopicId);
                    if (p?.rpgClass && window.RPG_CLASSES) {
                        const cl = window.RPG_CLASSES.find(c => c.id === p.rpgClass);
                        if (cl) return ['Clase', cl.name];
                    }
                }
                return char.job ? ['Clase', char.job] : null;
            })(),
        ].filter(Boolean);
        ihpData.innerHTML = rows.map(([lbl, val]) =>
            `<div class="ihp-row"><span class="ihp-lbl">${lbl}</span><span class="ihp-val">${escapeHtml(String(val))}</span></div>`
        ).join('');
    }

    // ── Descripción (siempre en RPG; en Clásico solo en pinned) ──────
    const ihpDesc = document.getElementById('ihpDesc');
    if (ihpDesc) {
        const text = char.basic || char.personality || '';
        ihpDesc.textContent = (isRpg || pinned) ? text : '';
    }

    // ── Barras HP/EXP en panel (RPG siempre; Clásico nunca) ──────────
    const ihpRpgBars = document.getElementById('ihpRpgBars');
    if (ihpRpgBars) {
        if (isRpg && typeof ensureCharacterRpgProfile === 'function') {
            const profile = ensureCharacterRpgProfile(char, currentTopicId);
            const hpPct = Math.max(0, Math.min(100, (profile.hp / 10) * 100));
            const expPct = Math.max(0, Math.min(100, (profile.exp / 10) * 100));
            ihpRpgBars.innerHTML = `
                <div class="ihp-bar-row">
                    <span class="ihp-bar-lbl hp">HP</span>
                    <div class="ihp-bar-track"><div class="ihp-bar-fill hp" style="width:${hpPct}%"></div></div>
                    <span class="ihp-bar-val">${profile.hp}/10</span>
                </div>
                <div class="ihp-bar-row">
                    <span class="ihp-bar-lbl exp">EXP</span>
                    <div class="ihp-bar-track"><div class="ihp-bar-fill exp" style="width:${expPct}%"></div></div>
                    <span class="ihp-bar-val">${profile.exp}/10</span>
                </div>`;
        } else {
            ihpRpgBars.innerHTML = '';
        }
    }

    // ── Stats grid (RPG) — muestra los 6 stats D&D con modificador ───
    const ihpStats = document.getElementById('ihpStats');
    if (ihpStats) {
        if (isRpg && typeof ensureCharacterRpgProfile === 'function') {
            const profile  = ensureCharacterRpgProfile(char, currentTopicId);
            const statKeys = (window.RPG_STAT_KEYS) || ['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA'];
            const modStr   = (v) => { const m = Math.floor((v - 10) / 2); return (m >= 0 ? '+' : '') + m; };
            ihpStats.innerHTML = statKeys.map(k => {
                const val = profile.stats?.[k] ?? 8;
                return `<div class="ihp-stat-cell" title="${window.RPG_STAT_DESC?.[k] || k}">
                    <span class="ihp-stat-key">${k}</span>
                    <span class="ihp-stat-num">${val}</span>
                    <span class="ihp-stat-mod">${modStr(val)}</span>
                </div>`;
            }).join('');
        } else {
            ihpStats.innerHTML = '';
        }
    }

    // ── Relaciones (Clásico pinned) ───────────────────────────────────
    const ihpRelations = document.getElementById('ihpRelations');
    if (ihpRelations) {
        if (!isRpg && pinned && currentTopicId && typeof getAffinity === 'function') {
            const msgs  = getTopicMessages(currentTopicId);
            const chars = [...new Set(msgs.filter(m => m.characterId).map(m => String(m.characterId)))]
                .filter(id => String(id) !== String(char.id));
            if (chars.length > 0) {
                const relRows = chars.map(otherId => {
                    const other = appData.characters.find(c => String(c.id) === otherId);
                    if (!other) return '';
                    const aff  = getAffinity(String(char.id), otherId, currentTopicId);
                    const stars = affinityToStars ? affinityToStars(aff) : '';
                    const rank  = typeof getAffinityRankInfo === 'function' ? getAffinityRankInfo(aff)?.name || '' : '';
                    return `<div class="ihp-rel-row">
                        <span class="ihp-rel-name">${escapeHtml(other.name)}</span>
                        <span class="ihp-rel-stars">${stars}</span>
                        <span class="ihp-rel-rank">${escapeHtml(rank)}</span>
                    </div>`;
                }).filter(Boolean).join('');
                ihpRelations.innerHTML = `<span class="ihp-relations-title">Relaciones</span>${relRows}`;
            } else {
                ihpRelations.innerHTML = '';
            }
        } else {
            ihpRelations.innerHTML = '';
        }
    }

    // ── Condiciones activas (RPG, bajo los stats) ───────────────────────
    const ihpConditionsEl = document.getElementById('ihpConditions');
    if (ihpConditionsEl) {
        if (isRpg && typeof ensureCharacterRpgProfile === 'function') {
            const condProfile = ensureCharacterRpgProfile(char, currentTopicId);
            const conds = condProfile?.conditions || [];
            if (conds.length > 0 && window.RPG_CONDITIONS) {
                ihpConditionsEl.style.display = '';
                ihpConditionsEl.innerHTML = conds.map(cId => {
                    const c = window.RPG_CONDITIONS[cId];
                    return c ? `<span class="ihp-cond-pill" style="border-color:${c.color}25;color:${c.color};" title="${c.desc}">${c.icon} ${c.label}</span>` : '';
                }).join('');
            } else {
                ihpConditionsEl.style.display = 'none';
                ihpConditionsEl.innerHTML = '';
            }
        } else {
            ihpConditionsEl.style.display = 'none';
        }
    }

    // ── Botón editar stats (RPG pinned) ──────────────────────────────────
    const ihpOracle = document.getElementById('ihpOracleHint');
    if (ihpOracle) {
        ihpOracle.style.display = (isRpg && pinned) ? '' : 'none';
    }

    // ── Botón inventario (RPG + pinned + dueño del personaje) ─────────────
    const invBtn = document.getElementById('ihpInventoryBtn');
    if (invBtn) {
        const isOwn = char && char.userIndex === currentUserIndex;
        invBtn.style.display = (isRpg && pinned && isOwn) ? '' : 'none';
        // Actualizar hint de auto-uso
        if (isRpg && pinned && isOwn) _updateIhpAutoHint(char.id);
    }
    // Cerrar el panel de inventario si se desancla
    if (!pinned) closeIhpInventory();

    // ── Botón fijar panel (visible en modo RPG, en la info-card fija) ────
    const pinBtn = document.getElementById('vnInfoPinBtn');
    if (pinBtn) {
        pinBtn.style.display = isRpg ? '' : 'none';
        pinBtn.textContent = '';
        pinBtn.innerHTML = pinned
            ? `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><line x1="12" y1="17" x2="12" y2="22"/><path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V17z"/></svg> Soltar`
            : `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><line x1="12" y1="17" x2="12" y2="22"/><path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V17z"/></svg> Fijar stats`;
    }
}

// Elige un SVG temático de clase RPG según el trabajo del personaje
function _getRpgClassEmblem(job) {
    if (!job) return _svgRpgDefault();
    const j = job.toLowerCase();
    if (/guerrero|soldier|warrior|paladin|caballero|knight/.test(j))
        return `<svg width="18" height="18" viewBox="0 0 18 18" fill="none"><path d="M3 15 L13 5" stroke="rgba(220,180,80,0.9)" stroke-width="1.8" stroke-linecap="round"/><path d="M13 5 L15 3 L15 5 L13 5Z" fill="rgba(220,180,80,0.8)"/><path d="M7 13 L5 11" stroke="rgba(220,180,80,0.6)" stroke-width="1.2" stroke-linecap="round"/></svg>`;
    if (/mago|mage|wizard|brujo|hechicero|warlock|arcano/.test(j))
        return `<svg width="18" height="18" viewBox="0 0 18 18" fill="none"><polygon points="9,2 11,7 16,7 12,11 14,16 9,13 4,16 6,11 2,7 7,7" stroke="rgba(220,180,80,0.85)" stroke-width="1.2" fill="none"/></svg>`;
    if (/bardo|bard|músico|musician|cantor/.test(j))
        return `<svg width="18" height="18" viewBox="0 0 18 18" fill="none"><path d="M6 14 Q5 8 10 5 Q14 8 13 14" stroke="rgba(220,180,80,0.85)" stroke-width="1.2" fill="none" stroke-linecap="round"/><circle cx="5" cy="14" r="2" stroke="rgba(220,180,80,0.7)" stroke-width="1.1" fill="none"/><circle cx="12" cy="14" r="2" stroke="rgba(220,180,80,0.7)" stroke-width="1.1" fill="none"/></svg>`;
    if (/ladrón|rogue|asesino|assassin|pícaro|sombra/.test(j))
        return `<svg width="18" height="18" viewBox="0 0 18 18" fill="none"><path d="M9 3 L15 15 L9 12 L3 15 Z" stroke="rgba(220,180,80,0.8)" stroke-width="1.2" fill="none" stroke-linejoin="round"/></svg>`;
    if (/cler|healer|clérigo|sacerdot|priest|monk|monje/.test(j))
        return `<svg width="18" height="18" viewBox="0 0 18 18" fill="none"><path d="M9 3 L9 15 M4 9 L14 9" stroke="rgba(220,180,80,0.85)" stroke-width="1.6" stroke-linecap="round"/></svg>`;
    if (/arquero|archer|ranger|explorador|scout/.test(j))
        return `<svg width="18" height="18" viewBox="0 0 18 18" fill="none"><path d="M4 14 L13 5 M11 4 L14 4 L14 7" stroke="rgba(220,180,80,0.85)" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/><path d="M5 13 L3 15" stroke="rgba(220,180,80,0.6)" stroke-width="1.2" stroke-linecap="round"/></svg>`;
    return _svgRpgDefault();
}

function _svgRpgDefault() {
    return `<svg width="18" height="18" viewBox="0 0 18 18" fill="none"><polygon points="9,2 11,7 16,8.5 11,10 9,15 7,10 2,8.5 7,7" stroke="rgba(220,180,80,0.8)" stroke-width="1.1" fill="none"/></svg>`;
}

// Sello de cera: primera letra del nombre en estilo serif
function _getClassicSealChar(name) {
    const letter = (name || '?')[0].toUpperCase();
    return `<span style="font-family:'Cinzel',serif;font-size:1rem;font-weight:700;color:rgba(80,40,5,0.9);text-shadow:0 1px 1px rgba(255,200,80,0.4);">${letter}</span>`;
}


function modifyAffinity(direction) {
    if (!currentTopicId) return;

    const msgs = getTopicMessages(currentTopicId);
    const currentMsg = msgs[currentMessageIndex];
    if (!currentMsg || !currentMsg.characterId) return;

    const targetCharId = currentMsg.characterId;
    const targetChar = appData.characters.find(c => c.id === targetCharId);

    if (targetChar && targetChar.userIndex === currentUserIndex) {
        showAutosave('No puedes modificar afinidad con tu propio personaje', 'error');
        return;
    }

    const userChars = appData.characters.filter(c => c.userIndex === currentUserIndex);
    const activeCharId = selectedCharId || userChars[0]?.id;

    if (!activeCharId || activeCharId === targetCharId) return;

    const key = getAffinityKey(activeCharId, targetCharId);

    if (!appData.affinities[currentTopicId]) {
        appData.affinities[currentTopicId] = {};
    }

    const currentValue = appData.affinities[currentTopicId][key] || 0;
    const newValue = getAffinityIncrement(currentValue, direction);

    if (newValue === currentValue) {
        if (direction > 0 && currentValue >= 100) {
            showAutosave('Afinidad máxima alcanzada', 'saved');
        } else if (direction < 0 && currentValue <= 0) {
            showAutosave('Afinidad mínima alcanzada', 'saved');
        }
        return;
    }

    // Detectar cruce de umbral de rango (solo al subir)
    const oldRank = getAffinityRankInfo(currentValue);
    const newRank = getAffinityRankInfo(newValue);
    const crossedMilestone = direction > 0 && newRank.name !== oldRank.name;

    appData.affinities[currentTopicId][key] = newValue;

    hasUnsavedChanges = true;
    save({ silent: true });

    if (typeof eventBus !== 'undefined') {
        eventBus.emit('affinity:changed', {
            direction,
            newValue,
            topicId: currentTopicId,
            targetCharId,
            activeCharId
        });
    } else {
        updateAffinityDisplay();
        if (direction > 0) eventBus.emit('audio:play-sfx', { sfx: 'affinity-up' });
        if (direction < 0) eventBus.emit('audio:play-sfx', { sfx: 'affinity-down' });
    }

    const rankInfo = getAffinityRankInfo(newValue);

    // Mostrar hito de afinidad si se cruzó un umbral
    if (crossedMilestone) {
        showAffinityMilestone(newRank, activeCharId, targetCharId);
    }

    // Mostrar feedback INLINE dentro del card de afinidad (no en esquina)
    const feedbackEl = document.getElementById('affinityFeedback');
    if (feedbackEl) {
        feedbackEl.className = 'affinity-feedback';
        feedbackEl.textContent = direction > 0
            ? `▲ ${rankInfo.name}`
            : `▼ ${rankInfo.name}`;
        void feedbackEl.offsetWidth;
        feedbackEl.classList.add('visible', direction > 0 ? 'up' : 'down');
        clearTimeout(feedbackEl._timer);
        feedbackEl._timer = setTimeout(() => {
            feedbackEl.classList.remove('visible');
        }, 1800);
    }
}



if (typeof eventBus !== 'undefined') {
    eventBus.on('affinity:changed', function onAffinityChanged(payload) {
        updateAffinityDisplay();
        if (payload && payload.direction > 0) eventBus.emit('audio:play-sfx', { sfx: 'affinity-up' });
        if (payload && payload.direction < 0) eventBus.emit('audio:play-sfx', { sfx: 'affinity-down' });
    });
}

function openCurrentVnCharacterSheet() {
    const panel = document.getElementById('vnInfoRpg');
    if (!panel) return;
    const charId = panel.dataset.charId;
    if (!charId || typeof openRpgStatsModal !== 'function') return;
    openRpgStatsModal(charId);
}


const RELATIONSHIP_LEVELS = [
    { threshold: 0,  name: 'Desconocidos', color: '#888' },
    { threshold: 20, name: 'Conocidos', color: '#9b59b6' },
    { threshold: 40, name: 'Asociados', color: '#3498db' },
    { threshold: 60, name: 'Aliados', color: '#27ae60' },
    { threshold: 80, name: 'Confianza', color: '#f1c40f' },
    { threshold: 95, name: 'Vínculo', color: '#e74c3c' }
];

function getAffinity(charId1, charId2, topicId = currentTopicId) {
    if (!topicId || !charId1 || !charId2 || String(charId1) === String(charId2)) return 0;
    const topicAffinities = appData.affinities[topicId] || {};
    return Number(topicAffinities[getAffinityKey(charId1, charId2)] || 0);
}

function affinityToStars(value) {
    const stars = Math.max(0, Math.min(5, Math.round((Number(value) || 0) / 20)));
    return `${'★'.repeat(stars)}${'☆'.repeat(5 - stars)}`;
}

function calculateAverageAffinity(charId, topicId) {
    const msgs = getTopicMessages(topicId);
    const chars = [...new Set(msgs.filter(m => m.characterId).map(m => String(m.characterId)))];
    const others = chars.filter(id => String(id) !== String(charId));
    if (others.length === 0) return 0;
    const sum = others.reduce((acc, id) => acc + getAffinity(charId, id, topicId), 0);
    return Math.round(sum / others.length);
}

function countRecentInteractions(charId1, charId2, msgs, lookback = 10) {
    const slice = msgs.slice(Math.max(0, msgs.length - lookback));
    let count = 0;
    for (let i = 1; i < slice.length; i++) {
        const a = slice[i - 1];
        const b = slice[i];
        if (!a?.characterId || !b?.characterId) continue;
        const pair = [String(a.characterId), String(b.characterId)].sort().join('_');
        const target = [String(charId1), String(charId2)].sort().join('_');
        if (pair === target) count++;
    }
    return count;
}

function buildRelationshipGraph(topicId) {
    const msgs = getTopicMessages(topicId);
    const chars = [...new Set(msgs.filter(m => m.characterId).map(m => String(m.characterId)))];

    const nodes = chars.map((id) => {
        const char = appData.characters.find(c => String(c.id) === id);
        return {
            id,
            name: char?.name || 'Desconocido',
            avatar: char?.avatar || '',
            avgAffinity: calculateAverageAffinity(id, topicId)
        };
    });

    const edges = [];
    for (let i = 0; i < chars.length; i++) {
        for (let j = i + 1; j < chars.length; j++) {
            const affinity = getAffinity(chars[i], chars[j], topicId);
            if (affinity > 0) {
                edges.push({
                    source: chars[i],
                    target: chars[j],
                    affinity,
                    recentInteractions: countRecentInteractions(chars[i], chars[j], msgs, 10)
                });
            }
        }
    }

    return { nodes, edges };
}

function renderConstellation(graph, container) {
    if (!container) return;
    const w = Math.max(560, container.clientWidth || 560);
    const h = Math.max(420, container.clientHeight || 420);
    const cx = w / 2;
    const cy = h / 2;
    const radius = Math.min(w, h) * 0.33;

    const positionedNodes = graph.nodes.map((node, idx) => {
        const angle = (Math.PI * 2 * idx) / Math.max(1, graph.nodes.length);
        return {
            ...node,
            x: cx + Math.cos(angle) * radius,
            y: cy + Math.sin(angle) * radius,
            stars: affinityToStars(node.avgAffinity)
        };
    });

    const nodeById = new Map(positionedNodes.map(n => [String(n.id), n]));

    const lineSvg = `
<svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none">
${graph.edges.map((edge) => {
        const a = nodeById.get(String(edge.source));
        const b = nodeById.get(String(edge.target));
        if (!a || !b) return '';
        const width = 1 + Math.min(4, edge.recentInteractions);
        const alpha = 0.2 + Math.min(0.7, edge.affinity / 120);
        return `<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" stroke="rgba(201,168,108,${alpha.toFixed(2)})" stroke-width="${width}" />`;
    }).join('')}
</svg>`;

    container.innerHTML = lineSvg + positionedNodes.map((node) => `
        <div class="relationship-node" data-char-id="${escapeHtml(String(node.id))}" style="left:${node.x}px;top:${node.y}px" title="${escapeHtml(node.name)} · Afinidad media ${node.avgAffinity}">
            <div class="relationship-node-avatar">${node.avatar ? `<img src="${escapeHtml(node.avatar)}" alt="Avatar de ${escapeHtml(node.name)}">` : escapeHtml(node.name[0] || '?')}</div>
            <div class="relationship-node-name">${escapeHtml(node.name)}</div>
            <div class="relationship-node-stars">${node.stars}</div>
        </div>
    `).join('');

    container.querySelectorAll('.relationship-node').forEach((el) => {
        el.addEventListener('click', () => {
            const charId = el.getAttribute('data-char-id');
            const node = positionedNodes.find((n) => String(n.id) === String(charId));
            if (!node) return;

            const related = graph.edges
                .filter((e) => String(e.source) === String(charId) || String(e.target) === String(charId))
                .sort((a, b) => b.affinity - a.affinity)
                .slice(0, 3)
                .map((edge) => {
                    const otherId = String(edge.source) === String(charId) ? edge.target : edge.source;
                    const other = nodeById.get(String(otherId));
                    const otherName = other?.name || 'Desconocido';
                    return `${otherName}: ${Math.round(edge.affinity)} (${edge.recentInteractions} interacciones)`;
                });

            const summary = related.length
                ? related.join(' · ')
                : 'Sin vínculos recientes.';
            showAutosave(`${node.name} → ${summary}`, 'info');
        });
    });

}

let relationshipGraphResizeBound = false;
let relationshipGraphRaf = null;

function renderRelationshipGraphForActiveTopic() {
    if (!currentTopicId) return;
    const graph = buildRelationshipGraph(currentTopicId);
    const container = document.getElementById('relationshipGraphCanvas');
    if (!container) return;

    if (!graph.nodes.length) {
        container.innerHTML = '<div style="padding:1.2rem; color:var(--text-muted);">Aún no hay interacciones entre personajes en esta historia.</div>';
        return;
    }

    renderConstellation(graph, container);
}

function openRelationshipGraph() {
    if (!currentTopicId) {
        showAutosave('Abre una historia para ver su grafo de relaciones.', 'info');
        return;
    }

    const subtitle = document.getElementById('relationshipGraphSubtitle');
    const topic = appData.topics.find(t => String(t.id) === String(currentTopicId));
    if (subtitle) subtitle.textContent = topic ? `RELACIONES EN "${topic.title.toUpperCase()}"` : 'Relaciones';

    // Mostrar controles +/- para el personaje activo en el diálogo
    _updateGraphAffinityControls();

    if (typeof openModal === 'function') openModal('relationshipGraphModal');

    if (relationshipGraphRaf) cancelAnimationFrame(relationshipGraphRaf);
    relationshipGraphRaf = requestAnimationFrame(() => {
        relationshipGraphRaf = null;
        renderRelationshipGraphForActiveTopic();
    });

    if (!relationshipGraphResizeBound) {
        relationshipGraphResizeBound = true;
        window.addEventListener('resize', () => {
            const modal = document.getElementById('relationshipGraphModal');
            if (!modal || modal.classList.contains('hidden')) return;
            if (relationshipGraphRaf) cancelAnimationFrame(relationshipGraphRaf);
            relationshipGraphRaf = requestAnimationFrame(() => {
                relationshipGraphRaf = null;
                renderRelationshipGraphForActiveTopic();
            });
        }, { passive: true });
    }
}

function _updateGraphAffinityControls() {
    const controlsEl   = document.getElementById('graphAffinityControls');
    const targetNameEl = document.getElementById('graphAffinityTargetName');
    const rankNameEl   = document.getElementById('graphAffinityRankName');
    if (!controlsEl) return;

    const msgs = getTopicMessages(currentTopicId);
    const msg  = msgs[currentMessageIndex];
    if (!msg || !msg.characterId) {
        controlsEl.classList.add('hidden');
        return;
    }

    const targetChar = appData.characters.find(c => String(c.id) === String(msg.characterId));
    if (!targetChar) { controlsEl.classList.add('hidden'); return; }

    // Solo mostrar si el personaje activo es ajeno
    const userChars = appData.characters.filter(c => c.userIndex === currentUserIndex);
    const isOwn = targetChar.userIndex === currentUserIndex;
    if (isOwn) { controlsEl.classList.add('hidden'); return; }

    const affVal = getCurrentAffinity();
    if (affVal === -1) { controlsEl.classList.add('hidden'); return; }

    const rankInfo = getAffinityRankInfo(affVal);
    if (targetNameEl) targetNameEl.textContent = targetChar.name;
    if (rankNameEl) {
        rankNameEl.textContent = rankInfo.name;
        rankNameEl.style.color = rankInfo.color;
    }
    controlsEl.classList.remove('hidden');
}

function refreshRelationshipGraph() {
    _updateGraphAffinityControls();
    if (typeof renderRelationshipGraphForActiveTopic === 'function') {
        renderRelationshipGraphForActiveTopic();
    }
}

// ============================================
// HITOS DE AFINIDAD — OVERLAY CINEMATOGRÁFICO
// ============================================

const AFFINITY_RANK_ICONS = {
    'Conocidos':          { icon: '🤝', color: '#9b59b6' },
    'Amigos':             { icon: '💙', color: '#3498db' },
    'Mejores Amigos':     { icon: '💚', color: '#27ae60' },
    'Interés Romántico':  { icon: '💛', color: '#f1c40f' },
    'Pareja':             { icon: '❤️', color: '#e74c3c' },
};

let _affinityMilestoneTimer = null;

function showAffinityMilestone(rankInfo, activeCharId, targetCharId) {
    const overlay   = document.getElementById('vnAffinityMilestone');
    const iconEl    = document.getElementById('vnAffinityMilestoneIcon');
    const rankEl    = document.getElementById('vnAffinityMilestoneRank');
    if (!overlay || !iconEl || !rankEl) return;

    const meta = AFFINITY_RANK_ICONS[rankInfo.name] || { icon: '✦', color: rankInfo.color || '#c49a3c' };

    iconEl.textContent  = meta.icon;
    rankEl.textContent  = rankInfo.name;
    rankEl.style.color  = meta.color;
    overlay.style.setProperty('--milestone-color', meta.color);

    // Nombre de los personajes en el subtítulo si están disponibles
    const activeChar = appData.characters.find(c => String(c.id) === String(activeCharId));
    const targetChar = appData.characters.find(c => String(c.id) === String(targetCharId));
    const labelEl = overlay.querySelector('.vn-affinity-milestone-label');
    if (labelEl && activeChar && targetChar) {
        labelEl.textContent = `${activeChar.name} & ${targetChar.name}`;
    } else if (labelEl) {
        labelEl.textContent = 'Nueva etapa de la relación';
    }

    // Mostrar con animación
    overlay.classList.remove('milestone-out');
    overlay.classList.add('milestone-in');

    clearTimeout(_affinityMilestoneTimer);
    _affinityMilestoneTimer = setTimeout(() => {
        overlay.classList.remove('milestone-in');
        overlay.classList.add('milestone-out');
        setTimeout(() => overlay.classList.remove('milestone-out'), 600);
    }, 2800);
}

// ══════════════════════════════════════════════════════════════════
// PANEL DE INVENTARIO DEL IHP
// Se desliza lateralmente desde el panel fijado en modo RPG.
// Solo visible para el dueño del personaje.
// ══════════════════════════════════════════════════════════════════

function toggleIhpInventory() {
    const panel = document.getElementById('ihpInventoryPanel');
    if (!panel) return;
    if (panel.style.display === 'none' || !panel.style.display) {
        openIhpInventory();
    } else {
        closeIhpInventory();
    }
}

function openIhpInventory() {
    const panel = document.getElementById('ihpInventoryPanel');
    if (!panel) return;
    _refreshIhpInventory(selectedCharId);
    panel.style.display = 'flex';
    panel.classList.add('ihp-inv-open');
}

function closeIhpInventory() {
    const panel = document.getElementById('ihpInventoryPanel');
    if (!panel) return;
    panel.style.display = 'none';
    panel.classList.remove('ihp-inv-open');
}

// Refresca el contenido del panel de inventario con el estado actual
function _refreshIhpInventory(charId) {
    const body = document.getElementById('ihpInvBody');
    if (!body || !charId) return;
    if (typeof renderInventoryPanel === 'function') {
        body.innerHTML = renderInventoryPanel(charId);
    }
    _updateIhpAutoHint(charId);
}

// Muestra u oculta el hint de uso automático según el inventario
function _updateIhpAutoHint(charId) {
    const hint = document.getElementById('ihpInvAutoHint');
    if (!hint || !charId) return;
    const hasPotion = typeof getProfileInventory === 'function'
        ? getProfileInventory(charId).some(i => i.id === 'potion_hp' || i.id === 'potion_greater')
        : false;
    hint.style.display = hasPotion ? '' : 'none';
}

window.toggleIhpInventory = toggleIhpInventory;
window.openIhpInventory   = openIhpInventory;
window.closeIhpInventory  = closeIhpInventory;
window._refreshIhpInventory = _refreshIhpInventory;
