// Sistema de modo rol/fanfic y afinidad entre personajes.
// ============================================
// MODO FANFIC VS ROLEPLAY
// ============================================
const TOPIC_MODE_STORAGE_KEY = 'etheria_topic_mode';

function updateTopicModeUI() {
    const modeRoleplay = document.getElementById('modeRoleplay');
    const modeFanfic = document.getElementById('modeFanfic');

    const persistedMode = localStorage.getItem(TOPIC_MODE_STORAGE_KEY);
    let selectedMode = currentTopicMode === 'fanfic' ? 'fanfic' : 'roleplay';

    if (modeFanfic && modeFanfic.checked) selectedMode = 'fanfic';
    else if (modeRoleplay && modeRoleplay.checked) selectedMode = 'roleplay';
    else if (persistedMode === 'fanfic' || persistedMode === 'roleplay') selectedMode = persistedMode;

    currentTopicMode = selectedMode;
    localStorage.setItem(TOPIC_MODE_STORAGE_KEY, selectedMode);

    if (modeRoleplay) modeRoleplay.checked = selectedMode === 'roleplay';
    if (modeFanfic) modeFanfic.checked = selectedMode === 'fanfic';

    // Actualizar estilos visuales
    const roleplayLabel = modeRoleplay?.parentElement;
    const fanficLabel = modeFanfic?.parentElement;

    roleplayLabel?.classList.toggle('active', selectedMode === 'roleplay');
    fanficLabel?.classList.toggle('active', selectedMode === 'fanfic');
}

function openRoleCharacterModal(topicId) {
    const grid = document.getElementById('roleCharacterGrid');
    if (!grid) return;

    pendingRoleTopicId = topicId;

    const mine = appData.characters.filter(c => c.userIndex === currentUserIndex);
    if (!mine.length) {
        alert('Necesitas al menos un personaje para jugar en modo rol.');
        pendingRoleTopicId = null;
        enterTopic(topicId);
        return;
    }

    grid.innerHTML = mine.map(c => {
        const visual = c.avatar
            ? `<img src="${escapeHtml(c.avatar)}" alt="Avatar de ${escapeHtml(c.name)}">`
            : `<div class="placeholder">${escapeHtml((c.name || '?')[0])}</div>`;
        return `<button type="button" class="role-char-bubble" title="${escapeHtml(c.name)}" onclick="selectRoleCharacterForTopic('${topicId}', '${c.id}')">${visual}</button>`;
    }).join('');

    openModal('roleCharacterModal');
}

function selectRoleCharacterForTopic(topicId, charId) {
    const topic = appData.topics.find(t => t.id === topicId);
    if (!topic) return;

    topic.roleCharacterId = charId;
    selectedCharId = charId;
    localStorage.setItem(`etheria_selected_char_${currentUserIndex}`, charId);

    hasUnsavedChanges = true;
    save();
    pendingRoleTopicId = null;
    closeModal('roleCharacterModal');
    enterTopic(topicId);
}

function isFanficMode() {
    if (!currentTopicId) return false;
    const topic = appData.topics.find(t => t.id === currentTopicId);
    return topic && topic.mode === 'fanfic';
}

function shouldShowAffinity() {
    // No mostrar afinidad en modo fanfic
    if (isFanficMode()) return false;

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
    const infoName = document.getElementById('vnInfoName');
    const infoClub = document.getElementById('vnInfoClub');
    const infoAvatar = document.getElementById('vnInfoAvatar');
    const vnInfoAffection = document.getElementById('vnInfoAffection');

    const msgs = getTopicMessages(currentTopicId);
    const currentMsg = msgs[currentMessageIndex];

    // Caso narrador
    if (currentMsg && currentMsg.isNarrator) {
        affinityDisplay?.classList.add('hidden');
        if (vnInfoAffection) vnInfoAffection.style.display = 'none';
        if (infoName) infoName.textContent = 'Narrador';
        if (infoClub) infoClub.textContent = currentTopicMode === 'roleplay' ? 'Modo rol' : 'Modo historia';
        if (infoAvatar) infoAvatar.innerHTML = '<div class="placeholder" style="width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; font-size: 2rem;">📖</div>';
        updateInfoHoverDetails(null);
        return;
    }

    // Caso personaje propio
    if (currentMsg && currentMsg.characterId) {
        const char = appData.characters.find(c => c.id === currentMsg.characterId);
        if (char) {
            if (char.userIndex === currentUserIndex) {
                affinityDisplay?.classList.remove('hidden');
                if (vnInfoAffection) vnInfoAffection.style.display = 'none';
                if (infoName) infoName.textContent = char.name;
                if (infoClub) infoClub.textContent = char.race || 'Sin raza';

                const rankNameEl = document.getElementById('affinityRankName');
                if (rankNameEl) {
                    rankNameEl.textContent = 'Afinidad: Propio (100%)';
                    rankNameEl.style.color = 'var(--accent-gold)';
                    rankNameEl.style.textShadow = '0 0 10px rgba(201, 168, 108, 0.6)';
                }

                if (infoAvatar) {
                    if (char.avatar) {
                        infoAvatar.innerHTML = `<img src="${escapeHtml(char.avatar)}" alt="Avatar de ${escapeHtml(char.name)}" onerror="this.style.display='none'; this.parentElement.innerHTML='<div class=\\'placeholder\\' style=\\'width:100%;height:100%;display:flex;align-items:center;justify-content:center;font-size:2rem;\\'>${char.name[0]}</div>'">`;
                    } else {
                        infoAvatar.innerHTML = `<div class="placeholder" style="width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; font-size: 2rem;">${char.name[0]}</div>`;
                    }
                }
                updateInfoHoverDetails(char);
                return;
            }

            // Personaje de otro usuario
            const affinityValue = getCurrentAffinity();
            if (affinityValue !== -1) {
                affinityDisplay?.classList.remove('hidden');
                if (vnInfoAffection) vnInfoAffection.style.display = 'none';

                const rankInfo = getAffinityRankInfo(affinityValue);

                if (infoName) infoName.textContent = char.name;
                if (infoClub) infoClub.textContent = char.race || 'Sin raza';

                const rankNameEl = document.getElementById('affinityRankName');

                if (rankNameEl) {
                    rankNameEl.textContent = rankInfo.name;
                    rankNameEl.style.color = rankInfo.color;
                    rankNameEl.style.textShadow = `0 0 10px ${rankInfo.color}`;
                }

                if (infoAvatar) {
                    if (char.avatar) {
                        infoAvatar.innerHTML = `<img src="${escapeHtml(char.avatar)}" alt="Avatar de ${escapeHtml(char.name)}" onerror="this.style.display='none'; this.parentElement.innerHTML='<div class=\\'placeholder\\' style=\\'width:100%;height:100%;display:flex;align-items:center;justify-content:center;font-size:2rem;\\'>${char.name[0]}</div>'">`;
                    } else {
                        infoAvatar.innerHTML = `<div class="placeholder" style="width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; font-size: 2rem;">${char.name[0]}</div>`;
                    }
                }

                currentAffinity = affinityValue;
                updateInfoHoverDetails(char);
                return;
            }
        }
    }

    // Caso por defecto
    affinityDisplay?.classList.add('hidden');
    if (vnInfoAffection) vnInfoAffection.style.display = 'none';
    if (infoName) infoName.textContent = 'Sin personaje';
    if (infoClub) infoClub.textContent = 'Selecciona un personaje';
    if (infoAvatar) infoAvatar.innerHTML = '<div class="placeholder" style="width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; font-size: 2rem;">👤</div>';
    updateInfoHoverDetails(null);
}

function updateInfoHoverDetails(char) {
    const modeEl = document.getElementById('vnInfoModeDetail');
    const ageEl = document.getElementById('vnInfoAgeDetail');
    const storyEl = document.getElementById('vnInfoStoryDetail');

    if (modeEl) modeEl.textContent = `Modo: ${currentTopicMode === 'roleplay' ? 'Rol' : 'Historia'}`;
    if (ageEl) ageEl.textContent = `Edad: ${char?.age || '-'}`;

    const story = (char?.history || '').trim();
    if (storyEl) storyEl.textContent = `Historia: ${story ? story.slice(0, 90) : 'Sin detalles'}`;
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

    appData.affinities[currentTopicId][key] = newValue;

    hasUnsavedChanges = true;
    save();
    updateAffinityDisplay();

    // Sonido sutil según dirección
    if (direction > 0 && typeof playSoundAffinityUp   === 'function') playSoundAffinityUp();
    if (direction < 0 && typeof playSoundAffinityDown === 'function') playSoundAffinityDown();

    const rankInfo = getAffinityRankInfo(newValue);
    showAutosave(`Afinidad: ${rankInfo.name}`, 'saved');
}

