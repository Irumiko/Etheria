// Funciones de interfaz (menús, modales, renderizado visual).
// ============================================
// UI/INTERFACE.JS
// ============================================
// Este archivo agrupa funciones de interfaz:
// navegación, modales, historial, paneles, temas y renderizado visual.
// Aunque contiene bastante lógica, se mantiene separado del arranque para
// que editar la UI sea más sencillo.

function initSmartTooltips() {
    if (!tooltipRoot) {
        tooltipRoot = document.createElement('div');
        tooltipRoot.className = 'smart-tooltip';
        document.body.appendChild(tooltipRoot);
    }

    let tooltipTimer = null;

    const showTooltip = (el) => {
        const text = el?.getAttribute('data-tooltip');
        if (!text || !tooltipRoot) return;

        tooltipRoot.textContent = text;
        tooltipRoot.classList.add('visible');
        tooltipRoot.style.left = '-9999px';
        tooltipRoot.style.top = '-9999px';

        const rect = el.getBoundingClientRect();
        const tipRect = tooltipRoot.getBoundingClientRect();
        const spacing = 10;
        const canShowTop = rect.top >= tipRect.height + spacing;
        const placement = canShowTop ? 'top' : 'bottom';
        tooltipRoot.dataset.placement = placement;

        let left = rect.left + (rect.width / 2) - (tipRect.width / 2);
        left = Math.max(8, Math.min(left, window.innerWidth - tipRect.width - 8));

        const top = placement === 'top'
            ? rect.top - tipRect.height - spacing
            : rect.bottom + spacing;

        tooltipRoot.style.left = `${left}px`;
        tooltipRoot.style.top = `${top}px`;
    };

    const hideTooltip = () => {
        if (tooltipTimer) {
            clearTimeout(tooltipTimer);
            tooltipTimer = null;
        }
        if (tooltipRoot) tooltipRoot.classList.remove('visible');
    };

    const queueTooltip = (target) => {
        if (!target) return;
        if (tooltipTimer) clearTimeout(tooltipTimer);
        const delayMs = Number(target.getAttribute('data-tooltip-delay') || 0);
        tooltipTimer = setTimeout(() => {
            showTooltip(target);
            tooltipTimer = null;
        }, Math.max(0, delayMs));
    };

    document.addEventListener('mouseover', (e) => {
        const target = e.target.closest('[data-tooltip]');
        if (!target) return;
        queueTooltip(target);
    });

    document.addEventListener('focusin', (e) => {
        const target = e.target.closest('[data-tooltip]');
        if (!target) return;
        queueTooltip(target);
    });

    document.addEventListener('mouseout', (e) => {
        if (!e.target.closest('[data-tooltip]')) return;
        hideTooltip();
    });

    document.addEventListener('focusout', (e) => {
        if (!e.target.closest('[data-tooltip]')) return;
        hideTooltip();
    });

    window.addEventListener('scroll', hideTooltip, true);
    window.addEventListener('resize', hideTooltip);
}

function setupKeyboardListeners() {
    document.addEventListener('keydown', (e) => {
        const vnSection = document.getElementById('vnSection');
        if (!vnSection || !vnSection.classList.contains('active')) return;

        const replyPanel = document.getElementById('vnReplyPanel');
        const settingsPanel = document.getElementById('settingsPanel');
        const continuationOverlay = document.getElementById('continuationOverlay');
        const optionsContainer = document.getElementById('vnOptionsContainer');
        const emotePicker = document.getElementById('emotePicker');

        if (e.code === 'Space') {
            if (replyPanel && replyPanel.style.display === 'flex') return;
            if (settingsPanel && settingsPanel.classList.contains('active')) return;
            if (optionsContainer && optionsContainer.classList.contains('active')) return;
            if (emotePicker && emotePicker.classList.contains('active')) return;
            e.preventDefault();
            handleDialogueClick();
        }

        if (e.code === 'Escape') {
            if (continuationOverlay && continuationOverlay.classList.contains('active')) {
                closeContinuation();
            } else if (replyPanel && replyPanel.style.display === 'flex') {
                closeReplyPanel();
            } else if (document.getElementById('historyModal')?.classList.contains('active')) {
                closeModal('historyModal');
            } else if (document.getElementById('sheetModal')?.classList.contains('active')) {
                closeModal('sheetModal');
            } else if (settingsPanel && settingsPanel.classList.contains('active')) {
                closeSettings();
            } else if (document.getElementById('branchEditorModal')?.classList.contains('active')) {
                closeModal('branchEditorModal');
            } else if (document.getElementById('shortcutsModal')?.classList.contains('active')) {
                closeModal('shortcutsModal');
            } else if (emotePicker && emotePicker.classList.contains('active')) {
                toggleEmotePicker();
            }
        }

        const isTypingField = ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName);

        if (!isTypingField && e.code === 'ArrowLeft') {
            e.preventDefault();
            previousMessage();
        }

        if (!isTypingField && e.code === 'ArrowRight') {
            e.preventDefault();
            nextMessage();
        }

        if (!isTypingField && e.key === '?') {
            e.preventDefault();
            openModal('shortcutsModal');
        }
    });
}


function setupTouchGestures() {
    const vnSection = document.getElementById('vnSection');
    if (!vnSection) return;

    vnSection.addEventListener('touchstart', (e) => {
        if (e.touches.length !== 1) return;
        touchStartX = e.touches[0].clientX;
        touchStartY = e.touches[0].clientY;
    }, { passive: true });

    vnSection.addEventListener('touchend', (e) => {
        if (!vnSection.classList.contains('active') || e.changedTouches.length !== 1) return;

        const dx = e.changedTouches[0].clientX - touchStartX;
        const dy = e.changedTouches[0].clientY - touchStartY;
        const absDx = Math.abs(dx);
        const absDy = Math.abs(dy);

        if (absDx < 50 && absDy < 50) return;

        if (absDx > absDy) {
            if (dx < 0) nextMessage();
            else previousMessage();
            return;
        }

        if (dy > 70) {
            const replyPanel = document.getElementById('vnReplyPanel');
            const settingsPanel = document.getElementById('settingsPanel');
            const continuationOverlay = document.getElementById('continuationOverlay');

            if (continuationOverlay?.classList.contains('active')) {
                closeContinuation();
            } else if (replyPanel?.style.display === 'flex') {
                closeReplyPanel();
            } else if (settingsPanel?.classList.contains('active')) {
                closeSettings();
            }
        }
    }, { passive: true });
}

document.addEventListener('keydown', (e) => {
    if (e.key !== 'Tab') return;

    const activeModal = document.querySelector('.modal-overlay.active');
    if (!activeModal) return;

    const focusable = activeModal.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
    if (!focusable.length) return;

    const first = focusable[0];
    const last = focusable[focusable.length - 1];

    if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
    }
});

// ============================================
// EFECTOS CLIMA
// ============================================
function createRainEffect() {
    const container = document.createElement('div');
    container.className = 'weather-rain';
    container.id = 'rainEffect';

    // Crear 60 gotas máximo
    for (let i = 0; i < 60; i++) {
        const drop = document.createElement('div');
        drop.className = 'rain-drop';
        drop.style.left = Math.random() * 100 + '%';
        drop.style.height = (10 + Math.random() * 20) + 'px';
        drop.style.animationDuration = (0.5 + Math.random() * 0.5) + 's';
        drop.style.animationDelay = Math.random() * 2 + 's';
        drop.style.opacity = 0.3 + Math.random() * 0.4;
        container.appendChild(drop);
    }

    return container;
}

function createFogEffect() {
    const container = document.createElement('div');
    container.className = 'weather-fog';
    container.id = 'fogEffect';

    // 3 capas de niebla
    for (let i = 0; i < 3; i++) {
        const layer = document.createElement('div');
        layer.className = 'fog-layer';
        container.appendChild(layer);
    }

    return container;
}

function setWeather(weather) {
    currentWeather = weather;

    // Actualizar botones
    document.querySelectorAll('#weatherSelectorContainer .weather-btn').forEach(btn => {
        btn.classList.remove('active');
        if (btn.textContent.toLowerCase().includes(weather === 'rain' ? 'lluvia' : weather === 'fog' ? 'niebla' : 'normal')) {
            btn.classList.add('active');
        }
    });

    // Limpiar efectos anteriores
    const weatherContainer = document.getElementById('weatherContainer');
    if (weatherContainer) {
        weatherContainer.innerHTML = '';
    }

    // Aplicar nuevo efecto
    if (weather === 'rain') {
        weatherContainer.appendChild(createRainEffect());
    } else if (weather === 'fog') {
        weatherContainer.appendChild(createFogEffect());
    }
}

function setTopicWeather(weather, button = null) {
    document.getElementById('topicWeatherInput').value = weather;

    const buttons = document.querySelectorAll('#topicModal .topic-weather-btn');
    buttons.forEach(btn => btn.classList.remove('active'));

    const activeButton = button || document.querySelector(`#topicModal .topic-weather-btn[data-weather="${weather}"]`);
    if (activeButton) activeButton.classList.add('active');
}

// ============================================
// EMOTES MANGA
// ============================================
function toggleEmotePicker() {
    const picker = document.getElementById('emotePicker');
    if (picker) {
        picker.classList.toggle('active');
    }
}

function insertEmoteInReplyText(emoteType) {
    const replyText = document.getElementById('vnReplyText');
    const replyPanel = document.getElementById('vnReplyPanel');
    if (!replyText || replyPanel?.style.display !== 'flex') return;

    const cursorPos = replyText.selectionStart;
    const textBefore = replyText.value.substring(0, cursorPos);
    const textAfter = replyText.value.substring(cursorPos);
    replyText.value = textBefore + `/${emoteType} ` + textAfter;
    replyText.focus();
    replyText.setSelectionRange(cursorPos + emoteType.length + 2, cursorPos + emoteType.length + 2);
}

function selectEmote(emoteType) {
    currentEmote = emoteType;
    toggleEmotePicker();
    insertEmoteInReplyText(emoteType);
}

function toggleReplyEmotePopover(event) {
    event?.stopPropagation();

    const popover = document.getElementById('replyEmotePopover');
    const button = document.getElementById('replyEmoteToggle');
    if (!popover || !button) return;

    const willOpen = !popover.classList.contains('active');
    popover.classList.toggle('active', willOpen);
    popover.setAttribute('aria-hidden', willOpen ? 'false' : 'true');
    button.classList.toggle('active', willOpen);
}

function closeReplyEmotePopover() {
    const popover = document.getElementById('replyEmotePopover');
    const button = document.getElementById('replyEmoteToggle');
    if (!popover || !button) return;

    popover.classList.remove('active');
    popover.setAttribute('aria-hidden', 'true');
    button.classList.remove('active');
}

function selectReplyEmote(emoteType) {
    currentEmote = emoteType;
    insertEmoteInReplyText(emoteType);
    closeReplyEmotePopover();
}

function setupReplyEmotePopover() {
    document.addEventListener('click', (event) => {
        const popover = document.getElementById('replyEmotePopover');
        const button = document.getElementById('replyEmoteToggle');
        if (!popover || !button || !popover.classList.contains('active')) return;

        const target = event.target;
        if (target instanceof Element && (target.closest('#replyEmotePopover') || target.closest('#replyEmoteToggle'))) {
            return;
        }

        closeReplyEmotePopover();
    });
}

function parseEmotes(text) {
    // Buscar comandos de emote /tipo
    const emoteRegex = /\/(angry|happy|shock|sad|think|love|annoyed|embarrassed|idea|sleep)\b/gi;
    const matches = [];
    let match;

    while ((match = emoteRegex.exec(text)) !== null) {
        matches.push(match[1].toLowerCase());
    }

    // Eliminar comandos del texto visible
    const cleanText = text.replace(emoteRegex, '').trim();

    return { emotes: matches, text: cleanText };
}

function showEmoteOnSprite(emoteType, spriteElement) {
    if (!emoteType || !spriteElement) return;

    const config = emoteConfig[emoteType];
    if (!config) return;

    // Limpiar emotes anteriores
    const existingEmote = spriteElement.querySelector('.manga-emote');
    if (existingEmote) {
        existingEmote.remove();
    }

    // Crear nuevo emote
    const emote = document.createElement('div');
    emote.className = `manga-emote ${config.class}`;
    emote.textContent = config.symbol;
    emote.title = config.name;

    spriteElement.appendChild(emote);

    // Auto-remover después de 3 segundos
    setTimeout(() => {
        if (emote.parentElement) {
            emote.style.animation = 'emote-disappear 0.5s ease-out forwards';
            setTimeout(() => emote.remove(), 500);
        }
    }, 3000);
}

function showEmoteOnAvatar(emoteType) {
    if (!emoteType) return;

    const config = emoteConfig[emoteType];
    if (!config) return;

    const avatarBox = document.getElementById('vnSpeakerAvatar');
    if (!avatarBox) return;

    // Limpiar emotes anteriores
    const existingEmote = avatarBox.querySelector('.manga-emote');
    if (existingEmote) {
        existingEmote.remove();
    }

    // Crear nuevo emote posicionado en esquina superior izquierda del avatar
    const emote = document.createElement('div');
    emote.className = `manga-emote ${config.class}`;
    emote.textContent = config.symbol;
    emote.title = config.name;
    emote.style.position = 'absolute';
    emote.style.top = '-10px';
    emote.style.left = '-10px';
    emote.style.fontSize = '2rem';

    avatarBox.style.position = 'relative';
    avatarBox.appendChild(emote);

    // Auto-remover después de 3 segundos
    setTimeout(() => {
        if (emote.parentElement) {
            emote.style.opacity = '0';
            setTimeout(() => emote.remove(), 500);
        }
    }, 3000);
}

// ============================================
// MODO FANFIC VS ROLEPLAY
// ============================================
function updateTopicModeUI() {
    const modeRoleplay = document.getElementById('modeRoleplay');
    const modeFanfic = document.getElementById('modeFanfic');

    let selectedMode = 'roleplay';
    if (modeFanfic && modeFanfic.checked) {
        selectedMode = 'fanfic';
    }

    currentTopicMode = selectedMode;

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
        if (infoClub) infoClub.textContent = 'Modo historia';
        if (infoAvatar) infoAvatar.innerHTML = '<div class="placeholder" style="width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; font-size: 2rem;">📖</div>';
        return;
    }

    // Caso personaje propio
    if (currentMsg && currentMsg.characterId) {
        const char = appData.characters.find(c => c.id === currentMsg.characterId);
        if (char) {
            if (char.userIndex === currentUserIndex) {
                affinityDisplay?.classList.add('hidden');
                if (vnInfoAffection) vnInfoAffection.style.display = 'none';
                if (infoName) infoName.textContent = char.name;
                if (infoClub) infoClub.textContent = char.race || 'Sin raza';

                if (infoAvatar) {
                    if (char.avatar) {
                        infoAvatar.innerHTML = `<img src="${escapeHtml(char.avatar)}" alt="Avatar de ${escapeHtml(char.name)}" onerror="this.style.display='none'; this.parentElement.innerHTML='<div class=\\'placeholder\\' style=\\'width:100%;height:100%;display:flex;align-items:center;justify-content:center;font-size:2rem;\\'>${char.name[0]}</div>'">`;
                    } else {
                        infoAvatar.innerHTML = `<div class="placeholder" style="width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; font-size: 2rem;">${char.name[0]}</div>`;
                    }
                }
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

    const rankInfo = getAffinityRankInfo(newValue);
    showAutosave(`Afinidad: ${rankInfo.name}`, 'saved');
}

// ============================================
// UTILIDADES
// ============================================
function formatText(text) {
    if (!text) return '';
    text = text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    text = text.replace(/\*(.*?)\*/g, '<em>$1</em>');
    return text;
}

function stripHtml(html) {
    if (!html) return '';
    const tmp = document.createElement('div');
    tmp.innerHTML = html;
    return tmp.textContent || tmp.innerText || '';
}

function isValidHttpUrl(value) {
    if (!value) return true;
    try {
        const parsed = new URL(value);
        return parsed.protocol === 'http:' || parsed.protocol === 'https:';
    } catch {
        return false;
    }
}

function validateImageUrlField(value, label) {
    if (!value) return true;
    if (!isValidHttpUrl(value)) {
        alert(`${label} debe ser una URL válida (http o https).`);
        return false;
    }
    return true;
}

function validateImportedData(data) {
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
        throw new Error('El archivo no contiene un objeto de datos válido');
    }

    if (!Array.isArray(data.topics) || !Array.isArray(data.characters)) {
        throw new Error('Faltan colecciones obligatorias (topics/characters)');
    }

    if (data.messages !== undefined && (typeof data.messages !== 'object' || Array.isArray(data.messages))) {
        throw new Error('messages debe ser un objeto');
    }

    if (data.affinities !== undefined && (typeof data.affinities !== 'object' || Array.isArray(data.affinities))) {
        throw new Error('affinities debe ser un objeto');
    }

    return true;
}

// ============================================
// EDITOR SPLIT-SCREEN
// ============================================
function openCharacterEditor(charId = null) {
    resetCharForm();

    if (charId) {
        const c = appData.characters.find(ch => ch.id === charId);
        if (!c || c.userIndex !== currentUserIndex) return;

        document.getElementById('editCharacterId').value = c.id;
        document.getElementById('charName').value = c.name || '';
        document.getElementById('charLastName').value = c.lastName || '';
        document.getElementById('charAge').value = c.age || '';
        document.getElementById('charRace').value = c.race || '';
        document.getElementById('charGender').value = c.gender || '';
        document.getElementById('charAlignment').value = c.alignment || '';
        document.getElementById('charJob').value = c.job || '';
        document.getElementById('charColor').value = c.color || '#8b7355';
        document.getElementById('charAvatar').value = c.avatar || '';
        document.getElementById('charSprite').value = c.sprite || '';
        document.getElementById('charBasic').value = c.basic || '';
        document.getElementById('charPersonality').value = c.personality || '';
        document.getElementById('charHistory').value = c.history || '';
        document.getElementById('charNotes').value = c.notes || '';

        const deleteBtn = document.getElementById('deleteCharBtn');
        if (deleteBtn) deleteBtn.style.display = 'inline-block';

        document.querySelectorAll('.gender-option').forEach(opt => opt.classList.remove('selected'));
        const genderMap = { 'Femenino': 0, 'Masculino': 1, 'No Binario': 2 };
        const genderIdx = genderMap[c.gender];
        if (genderIdx !== undefined) {
            const options = document.querySelectorAll('.gender-option');
            if (options[genderIdx]) options[genderIdx].classList.add('selected');
        }
    } else {
        document.getElementById('editCharacterId').value = '';
        const deleteBtn = document.getElementById('deleteCharBtn');
        if (deleteBtn) deleteBtn.style.display = 'none';
    }

    updatePreview();
    switchEditorTab('identity', document.querySelector('.editor-tab'));
    openModal('characterModal');
}

function switchEditorTab(tabName, element) {
    currentEditorTab = tabName;

    document.querySelectorAll('.editor-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.editor-panel').forEach(p => p.classList.remove('active'));

    if (element) element.classList.add('active');

    const panel = document.getElementById(`editor-tab-${tabName}`);
    if (panel) panel.classList.add('active');
}

function selectGender(gender, element) {
    document.querySelectorAll('.gender-option').forEach(opt => opt.classList.remove('selected'));
    element.classList.add('selected');
    document.getElementById('charGender').value = gender;
}

function updatePreview() {
    const name = document.getElementById('charName')?.value || 'Nuevo Personaje';
    const avatar = document.getElementById('charAvatar')?.value;

    const previewName = document.getElementById('editorPreviewName');
    if (previewName) previewName.textContent = name;

    const previewImg = document.getElementById('editorPreviewImage');
    if (previewImg) {
        if (avatar) {
            previewImg.innerHTML = `<img src="${escapeHtml(avatar)}" alt="Vista previa del avatar" style="width: 100%; height: 100%; object-fit: cover;" onerror="this.style.display='none'; this.parentElement.innerHTML='<span style=\\'font-size: 5rem;\\'>👤</span>'">`;
        } else {
            previewImg.innerHTML = '<span style="font-size: 5rem;">👤</span>';
        }
    }
}

// ============================================
// CARGA AUTOMÁTICA
// ============================================
async function selectUser(idx, options = {}) {
    if (idx < 0 || idx >= userNames.length) return;

    const safeOptions = { instant: false, autoLoad: false, ...options };

    currentUserIndex = idx;
    localStorage.setItem(LAST_PROFILE_KEY, String(idx));

    const savedCharId = localStorage.getItem(`etheria_selected_char_${currentUserIndex}`);
    selectedCharId = savedCharId || null;

    highlightActiveProfile(idx);
    toggleWelcomeOverlay(false);

    const loadingOverlay = document.getElementById('loadingOverlay');
    if (loadingOverlay && !safeOptions.instant) loadingOverlay.classList.add('active');
    isLoading = true;

    if (!safeOptions.instant) {
        await new Promise(resolve => setTimeout(resolve, 220));
    }

    const userSelectScreen = document.getElementById('userSelectScreen');
    const mainMenu = document.getElementById('mainMenu');
    const currentUserDisplay = document.getElementById('currentUserDisplay');

    if (userSelectScreen) userSelectScreen.classList.add('hidden');
    if (mainMenu) mainMenu.classList.remove('hidden');
    if (currentUserDisplay) currentUserDisplay.textContent = userNames[idx] || 'Jugador';

    if (loadingOverlay) loadingOverlay.classList.remove('active');
    isLoading = false;

    generateParticles();
    if (!safeOptions.autoLoad) showAutosave('Sesión iniciada', 'saved');
}

// Generar tarjetas de usuario dinámicamente
function renderUserCards() {
    const container = document.getElementById('userCardsContainer');
    if (!container) return;

    container.innerHTML = '';

    userNames.forEach((name, idx) => {
        const card = document.createElement('div');
        card.className = 'user-card';
        card.dataset.profileIndex = idx;
        card.onclick = () => selectUser(idx);
        card.innerHTML = `
            <div class="user-avatar">👤</div>
            <div class="user-name">${escapeHtml(name)}</div>
            <div class="user-hint">Click para entrar</div>
        `;
        container.appendChild(card);
    });

    // Botón para agregar nuevo perfil (máximo 10)
    if (userNames.length < 10) {
        const addCard = document.createElement('div');
        addCard.className = 'add-profile-card';
        addCard.id = 'addProfileCard';
        addCard.onclick = addNewProfile;
        addCard.innerHTML = `
            <div class="add-profile-icon">+</div>
            <div class="add-profile-text">Crear Perfil</div>
        `;
        container.appendChild(addCard);
    }

    const lastProfileId = getStoredLastProfileId();
    if (lastProfileId !== null) {
        highlightActiveProfile(lastProfileId);
        toggleWelcomeOverlay(false);
    } else {
        localStorage.removeItem(LAST_PROFILE_KEY);
        highlightActiveProfile(null);
        toggleWelcomeOverlay(true);
    }
}

function highlightActiveProfile(idx) {
    document.querySelectorAll('.user-card').forEach(card => {
        const cardIndex = Number.parseInt(card.dataset.profileIndex, 10);
        card.classList.toggle('active', Number.isInteger(idx) && cardIndex === idx);
    });
}

function toggleWelcomeOverlay(shouldShow) {
    const overlay = document.getElementById('welcomeOverlay');
    const addCard = document.getElementById('addProfileCard');
    const canCreateProfile = Boolean(addCard);

    if (overlay) overlay.classList.toggle('active', shouldShow && canCreateProfile);
    if (addCard) addCard.classList.toggle('highlight', shouldShow);
}

function generateProfileParticles() {
    const container = document.getElementById('profileParticles');
    if (!container) return;

    container.innerHTML = '';
    for (let i = 0; i < 18; i++) {
        const particle = document.createElement('div');
        particle.className = 'profile-particle';
        particle.style.left = (Math.random() * 100) + '%';
        particle.style.top = (60 + Math.random() * 45) + '%';
        particle.style.animationDuration = (6 + Math.random() * 7) + 's';
        particle.style.animationDelay = (Math.random() * 4) + 's';
        particle.style.setProperty('--float-x', ((Math.random() * 90) - 45) + 'px');
        container.appendChild(particle);
    }
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function addNewProfile() {
    if (userNames.length >= 10) {
        alert('Máximo de 10 perfiles alcanzado');
        return;
    }
    const newName = prompt('Nombre del nuevo perfil:');
    if (newName && newName.trim()) {
        userNames.push(newName.trim());
        localStorage.setItem('etheria_user_names', JSON.stringify(userNames));
        renderUserCards();
    }
}

// Generar partículas según el tema actual
function generateParticles() {
    const container = document.getElementById('particlesContainer');
    if (!container) return;

    container.innerHTML = '';
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';

    if (isDark) {
        // Luciérnagas para tema oscuro
        for (let i = 0; i < 20; i++) {
            const firefly = document.createElement('div');
            firefly.className = 'firefly';
            firefly.style.left = Math.random() * 100 + '%';
            firefly.style.top = Math.random() * 100 + '%';
            firefly.style.animationDelay = Math.random() * 4 + 's';
            firefly.style.animationDuration = (3 + Math.random() * 3) + 's';
            firefly.style.setProperty('--move-x', (Math.random() * 100 - 50) + 'px');
            firefly.style.setProperty('--move-y', (Math.random() * 100 - 50) + 'px');
            container.appendChild(firefly);
        }
    } else {
        // Hojas para tema claro
        for (let i = 0; i < 10; i++) {
            const leaf = document.createElement('div');
            leaf.className = 'leaf';
            leaf.style.left = Math.random() * 100 + '%';
            leaf.style.animationDelay = Math.random() * 8 + 's';
            leaf.style.animationDuration = (6 + Math.random() * 4) + 's';
            container.appendChild(leaf);
        }
    }
}

// ============================================
// NAVEGACIÓN
// ============================================
function confirmUnsavedChanges(callback) {
    if (hasUnsavedChanges) {
        if (confirm('Tienes cambios sin guardar. ¿Deseas guardar antes de salir?')) {
            save();
            callback();
        } else if (confirm('¿Descartar cambios?')) {
            hasUnsavedChanges = false;
            callback();
        }
    } else {
        callback();
    }
}

function resetVNTransientState({ clearTopic = false } = {}) {
    stopTypewriter();
    closeReplyPanel();
    closeContinuation();
    closeSettings();

    const optionsContainer = document.getElementById('vnOptionsContainer');
    if (optionsContainer) optionsContainer.classList.remove('active');

    const emotePicker = document.getElementById('emotePicker');
    if (emotePicker) emotePicker.classList.remove('active');

    const vnSpriteContainer = document.getElementById('vnSpriteContainer');
    if (vnSpriteContainer) vnSpriteContainer.innerHTML = '';

    const weatherContainer = document.getElementById('weatherContainer');
    if (weatherContainer) weatherContainer.innerHTML = '';

    editingMessageId = null;
    pendingContinuation = null;
    currentWeather = 'none';

    if (clearTopic) {
        currentTopicId = null;
        currentMessageIndex = 0;
    }
}

function closeActiveModals() {
    document.querySelectorAll('.modal-overlay.active').forEach((modal) => {
        modal.classList.remove('active');
    });
    document.body.classList.remove('modal-open');
}

function showSection(section) {
    if (isLoading) return;

    const mainMenu = document.getElementById('mainMenu');
    if (mainMenu) mainMenu.classList.add('hidden');

    resetVNTransientState({ clearTopic: true });
    closeActiveModals();

    document.querySelectorAll('.game-section').forEach(s => s.classList.remove('active'));

    if(section === 'topics') {
        const topicsSection = document.getElementById('topicsSection');
        if (topicsSection) topicsSection.classList.add('active');
        renderTopics();
    } else if(section === 'gallery') {
        const gallerySection = document.getElementById('gallerySection');
        if (gallerySection) gallerySection.classList.add('active');
        renderGallery();
    } else if(section === 'options') {
        const optionsSection = document.getElementById('optionsSection');
        if (optionsSection) optionsSection.classList.add('active');
    }
}

function backToMenu() {
    confirmUnsavedChanges(() => {
        resetVNTransientState({ clearTopic: true });
        closeActiveModals();
        document.querySelectorAll('.game-section').forEach(s => s.classList.remove('active'));
        const mainMenu = document.getElementById('mainMenu');
        if (mainMenu) {
            mainMenu.classList.remove('hidden');
            generateParticles();
        }
    });
}

function backToTopics() {
    confirmUnsavedChanges(() => {
        resetVNTransientState({ clearTopic: true });

        const vnSection = document.getElementById('vnSection');
        const topicsSection = document.getElementById('topicsSection');

        if (vnSection) vnSection.classList.remove('active');
        if (topicsSection) topicsSection.classList.add('active');
        renderTopics();
    });
}

// ============================================
// GALERÍA
// ============================================
function setupGallerySearchListeners() {
    const searchInput = document.getElementById('gallerySearch');
    if (!searchInput || searchInput.dataset.debounceBound === '1') return;

    searchInput.dataset.debounceBound = '1';
    searchInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            renderGallery();
        }
    });
}

function debounceRenderGallery() {
    window.clearTimeout(gallerySearchDebounceTimer);
    gallerySearchDebounceTimer = window.setTimeout(() => {
        renderGallery();
    }, 300);
}

function initGalleryLazyImages() {
    if (galleryImageObserver) {
        galleryImageObserver.disconnect();
    }

    galleryImageObserver = new IntersectionObserver((entries, observer) => {
        entries.forEach((entry) => {
            if (!entry.isIntersecting) return;

            const image = entry.target;
            const src = image.dataset.src;
            if (src) {
                image.src = src;
                image.removeAttribute('data-src');
            }
            observer.unobserve(image);
        });
    }, { rootMargin: '200px 0px', threshold: 0.01 });

    document.querySelectorAll('#galleryGrid img[data-src]').forEach((img) => {
        galleryImageObserver.observe(img);
    });
}

function renderGallery() {
    const grid = document.getElementById('galleryGrid');
    if (!grid) return;

    const searchInput = document.getElementById('gallerySearch');
    const sortSelect = document.getElementById('gallerySort');

    const searchTerm = (searchInput?.value || '').toLowerCase();
    const sortBy = sortSelect?.value || 'default';

    let chars = [...appData.characters];

    if (searchTerm) {
        chars = chars.filter(c =>
            (c.name?.toLowerCase().includes(searchTerm)) ||
            (c.race?.toLowerCase().includes(searchTerm)) ||
            (userNames[c.userIndex]?.toLowerCase().includes(searchTerm))
        );
    }

    if (sortBy === 'owner') {
        chars.sort((a, b) => a.userIndex - b.userIndex || a.name.localeCompare(b.name));
    } else if (sortBy === 'name') {
        chars.sort((a, b) => a.name.localeCompare(b.name));
    } else if (sortBy === 'race') {
        chars.sort((a, b) => (a.race || '').localeCompare(b.race || ''));
    }

    const galleryCount = document.getElementById('galleryCount');
    if (galleryCount) galleryCount.textContent = `${chars.length} personaje${chars.length !== 1 ? 's' : ''}`;

    if (chars.length === 0) {
        grid.innerHTML = '<div style="grid-column: 1 / -1; text-align: center; padding: 3rem; color: var(--text-muted);">No se encontraron personajes</div>';
        return;
    }

    grid.innerHTML = chars.map(c => {
        const genderIcon = c.gender === 'Femenino' ? '♀️' : c.gender === 'Masculino' ? '♂️' : '⚪';
        const ownerName = userNames[c.userIndex] || 'Desconocido';

        return `
            <div class="character-card" onclick="openSheet('${c.id}')">
                <div class="character-card-avatar">
                    ${c.avatar ? `<img data-src="${escapeHtml(c.avatar)}" alt="Avatar de ${escapeHtml(c.name)}" loading="lazy" onerror="this.style.display='none'; this.parentElement.innerHTML='<div class=\'placeholder\'>${c.name[0]}</div>'">` : `<div class="placeholder">${c.name[0]}</div>`}
                </div>
                <div class="character-card-info">
                    <div class="character-card-name">${escapeHtml(c.name)}</div>
                    <div class="character-card-meta">
                        <span class="gender-icon">${genderIcon}</span>
                        <span>${escapeHtml(c.race) || 'Sin raza'}</span>
                    </div>
                </div>
                <div class="character-card-hover-info">
                    <div>Por: ${escapeHtml(ownerName)}</div>
                    <div>${escapeHtml(c.race) || 'Sin raza'}</div>
                </div>
            </div>
        `;
    }).join('');

    initGalleryLazyImages();
}

// ============================================
// FICHA DE PERSONAJE
// ============================================
function openSheet(id) {
    currentSheetCharId = id;
    const c = appData.characters.find(ch => ch.id === id);
    if(!c) return;

    const sheetName = document.getElementById('sheetName');
    const sheetOwner = document.getElementById('sheetOwner');
    const sheetAvatar = document.getElementById('sheetAvatar');
    const sheetQuickStats = document.getElementById('sheetQuickStats');

    if (sheetName) sheetName.textContent = c.name;
    if (sheetOwner) sheetOwner.textContent = `Por ${c.owner || userNames[c.userIndex]}`;

    if (sheetAvatar) {
        sheetAvatar.innerHTML = c.avatar ? `<img src="${escapeHtml(c.avatar)}" alt="Avatar ampliado de ${escapeHtml(c.name)}" onerror="this.textContent='${c.name[0]}'">` : c.name[0];
    }

    if (sheetQuickStats) {
        sheetQuickStats.innerHTML = `
            <span class="quick-stat">${escapeHtml(c.race) || 'Sin raza'}</span>
            <span class="quick-stat">${c.gender || '?'}</span>
            <span class="quick-stat">${c.age || '?'} años</span>
            <span class="quick-stat" style="background: ${getAlignmentColor(c.alignment)}; color: white;">${alignments[c.alignment] || 'Neutral'}</span>
        `;
    }

    const profileGrid = document.getElementById('profileGrid');
    if (profileGrid) {
        profileGrid.innerHTML = `
            <div class="profile-item"><div class="profile-label">Nombre</div><div class="profile-value">${escapeHtml(c.name)}</div></div>
            <div class="profile-item"><div class="profile-label">Apellido</div><div class="profile-value">${escapeHtml(c.lastName) || '-'}</div></div>
            <div class="profile-item"><div class="profile-label">Edad</div><div class="profile-value">${c.age || '-'}</div></div>
            <div class="profile-item"><div class="profile-label">Raza</div><div class="profile-value">${escapeHtml(c.race) || '-'}</div></div>
            <div class="profile-item"><div class="profile-label">Género</div><div class="profile-value">${c.gender || '-'}</div></div>
            <div class="profile-item"><div class="profile-label">Alineamiento</div><div class="profile-value">${alignments[c.alignment] || '-'}</div></div>
            <div class="profile-item full-width"><div class="profile-label">Ocupación</div><div class="profile-value">${escapeHtml(c.job) || '-'}</div></div>
            <div class="profile-item full-width" style="margin-top: 1rem;">
                <div class="profile-label">Descripción Física</div>
                <div style="margin-top: 0.5rem; line-height: 1.6;">${escapeHtml(c.basic) || 'Sin descripción.'}</div>
            </div>
        `;
    }

    const profilePersonality = document.getElementById('profilePersonality');
    const profileHistory = document.getElementById('profileHistory');

    if (profilePersonality) profilePersonality.textContent = c.personality || 'Sin datos de personalidad.';
    if (profileHistory) profileHistory.textContent = c.history || 'Sin historia registrada.';

    const sheetEditBtn = document.getElementById('sheetEditBtn');
    if (sheetEditBtn) sheetEditBtn.style.display = c.userIndex === currentUserIndex ? 'inline-block' : 'none';

    document.querySelectorAll('.sheet-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));

    const firstTab = document.querySelector('.sheet-tab');
    if (firstTab) firstTab.classList.add('active');

    const tabProfile = document.getElementById('tab-profile');
    if (tabProfile) tabProfile.classList.add('active');

    openModal('sheetModal');
}

function getAlignmentColor(code) {
    const colors = {
        'LB': '#4a90e2', 'LN': '#7f8c8d', 'LM': '#2c3e50',
        'NB': '#f39c12', 'NN': '#95a5a6', 'NM': '#8e44ad',
        'CB': '#e74c3c', 'CN': '#e67e22', 'CM': '#c0392b'
    };
    return colors[code] || '#95a5a6';
}

function switchTab(tabName) {
    document.querySelectorAll('.sheet-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));

    if (event && event.target) event.target.classList.add('active');

    const tab = document.getElementById(`tab-${tabName}`);
    if (tab) tab.classList.add('active');
}

// ============================================
// CREAR/EDITAR PERSONAJE
// ============================================
function saveCharacter() {
    const nameInput = document.getElementById('charName');
    const name = nameInput?.value.trim();
    if(!name) { alert('Nombre obligatorio'); return; }

    const id = document.getElementById('editCharacterId')?.value || Date.now().toString();

    const avatarUrl = document.getElementById('charAvatar')?.value.trim() || '';
    const spriteUrl = document.getElementById('charSprite')?.value.trim() || '';

    if (!validateImageUrlField(avatarUrl, 'La URL del avatar')) return;
    if (!validateImageUrlField(spriteUrl, 'La URL del sprite')) return;

    const charObj = {
        id,
        userIndex: currentUserIndex,
        owner: userNames[currentUserIndex],
        name,
        lastName: document.getElementById('charLastName')?.value.trim() || '',
        age: document.getElementById('charAge')?.value.trim() || '',
        race: document.getElementById('charRace')?.value.trim() || '',
        gender: document.getElementById('charGender')?.value || '',
        alignment: document.getElementById('charAlignment')?.value || '',
        job: document.getElementById('charJob')?.value.trim() || '',
        color: document.getElementById('charColor')?.value || '#8b7355',
        avatar: avatarUrl,
        sprite: spriteUrl,
        basic: document.getElementById('charBasic')?.value.trim() || '',
        personality: document.getElementById('charPersonality')?.value.trim() || '',
        history: document.getElementById('charHistory')?.value.trim() || '',
        notes: document.getElementById('charNotes')?.value.trim() || ''
    };

    const idx = appData.characters.findIndex(c => c.id === id);
    if(idx > -1) appData.characters[idx] = charObj;
    else appData.characters.push(charObj);

    hasUnsavedChanges = true;
    save();
    closeModal('characterModal');
    resetCharForm();
    renderGallery();
}

function resetCharForm() {
    const editId = document.getElementById('editCharacterId');
    if (editId) editId.value = '';

    const deleteBtn = document.getElementById('deleteCharBtn');
    if (deleteBtn) deleteBtn.style.display = 'none';

    document.querySelectorAll('#characterModal input:not([type="color"]), #characterModal textarea, #characterModal select').forEach(i => i.value = '');

    const colorInput = document.getElementById('charColor');
    if (colorInput) colorInput.value = '#8b7355';

    document.querySelectorAll('.gender-option').forEach(opt => opt.classList.remove('selected'));
}

function editFromSheet() {
    closeModal('sheetModal');
    openCharacterEditor(currentSheetCharId);
}

// ============================================
// MODO VN
// ============================================
const DEFAULT_TOPIC_BACKGROUND = 'assets/backgrounds/default_background.png.jpg';
const LEGACY_DEFAULT_TOPIC_BACKGROUNDS = [
    'default_scene',
    'assets/backgrounds/default_scene.png',
    'Assets/backgrounds/default_scene.png',
    'assets/default_background.png',
    'Assets/default_background.png',
    'assets/backgrounds/default_background.png.jpg',
    'Assets/backgrounds/default_background.png.jpg'
];

function isDefaultTopicBackground(backgroundPath) {
    const normalized = (backgroundPath || "").trim().toLowerCase();
    if (!normalized) return true;
    return LEGACY_DEFAULT_TOPIC_BACKGROUNDS.some(path => normalized === path.toLowerCase());
}

function enterTopic(id) {
    resetVNTransientState();
    currentTopicId = id;
    getTopicMessages(id);
    currentMessageIndex = 0;
    pendingContinuation = null;
    editingMessageId = null;

    const t = appData.topics.find(topic => topic.id === id);
    if(!t) return;

    // Establecer modo
    currentTopicMode = t.mode || 'roleplay';

    if (currentTopicMode === 'roleplay' && t.roleCharacterId) {
        const lockedChar = appData.characters.find(c => c.id === t.roleCharacterId && c.userIndex === currentUserIndex);
        if (lockedChar) {
            selectedCharId = lockedChar.id;
        }
    }

    // Aplicar clima si existe
    if (t.weather) {
        setWeather(t.weather);
    } else {
        setWeather('none');
    }

    const vnSection = document.getElementById('vnSection');
    if (vnSection) {
        const topicBackground = (t.background || '').trim();
        const useDefaultBackground = isDefaultTopicBackground(topicBackground);
        const sceneBackgroundLayer = useDefaultBackground
            ? `url(${escapeHtml(DEFAULT_TOPIC_BACKGROUND)})`
            : `url(${escapeHtml(topicBackground)})`;

        vnSection.style.backgroundImage = `${sceneBackgroundLayer}, linear-gradient(135deg, rgba(20,15,40,1) 0%, rgba(50,40,80,1) 100%)`;

        // Aplicar modo de sprites (fanfic = persistente por defecto)
        if (currentTopicMode === 'fanfic') {
            vnSection.classList.remove('classic-mode');
        } else {
            // En modo rol, usar modo clásico (sprites desaparecen)
            vnSection.classList.add('classic-mode');
        }
    }

    const topicsSection = document.getElementById('topicsSection');
    if (topicsSection) topicsSection.classList.remove('active');
    if (vnSection) vnSection.classList.add('active');

    const deleteBtn = document.getElementById('deleteTopicBtn');
    if (deleteBtn) {
        if (t.createdByIndex === currentUserIndex) {
            deleteBtn.classList.remove('hidden');
        } else {
            deleteBtn.classList.add('hidden');
        }
    }

    showCurrentMessage();
}

function stopTypewriter() {
    if (typeof typewriterInterval === 'number') {
        window.cancelAnimationFrame(typewriterInterval);
        clearInterval(typewriterInterval);
        typewriterInterval = null;
    }
    typewriterSessionId++;
    isTyping = false;
}

function showCurrentMessage() {
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

    if (msg.isNarrator || !msg.characterId) {
        if (namePlate) {
            namePlate.textContent = 'Narrador';
            namePlate.style.background = 'linear-gradient(135deg, #4a4540, #2a2724)';
        }
        if (avatarBox) avatarBox.innerHTML = '📖';
    } else if (!charExists) {
        if (namePlate) {
            namePlate.textContent = msg.charName || 'Desconocido';
            namePlate.style.background = msg.charColor || 'var(--accent-wood)';
        }
        if (avatarBox) {
            avatarBox.innerHTML = msg.charAvatar ?
                `<img src="${escapeHtml(msg.charAvatar)}" alt="Avatar de ${escapeHtml(msg.charName || "Desconocido")}" style="width:100%;height:100%;object-fit:cover;" onerror="this.style.display='none'; this.parentElement.textContent='${(msg.charName || '?')[0]}'">` :
                (msg.charName || '?')[0];
        }
    } else {
        if (namePlate) {
            namePlate.textContent = msg.charName;
            namePlate.style.background = msg.charColor || 'var(--accent-wood)';
        }
        if (avatarBox) {
            avatarBox.innerHTML = msg.charAvatar ?
                `<img src="${escapeHtml(msg.charAvatar)}" alt="Avatar de ${escapeHtml(msg.charName)}" style="width:100%;height:100%;object-fit:cover;" onerror="this.style.display='none'; this.parentElement.textContent='${msg.charName[0]}'">` :
                msg.charName[0];
        }
    }

    // Mostrar emote en avatar si no hay sprite
    if (activeEmote && !msg.charSprite) {
        showEmoteOnAvatar(activeEmote);
    }

    const hasOpt = msg.options && msg.options.length > 0 && msg.selectedOptionIndex === undefined;
    const optionsIndicator = document.getElementById('messageHasOptions');
    if (optionsIndicator) {
        optionsIndicator.classList.toggle('hidden', !hasOpt || isFanficMode());
    }

    const formattedText = formatText(cleanText);
    if (dialogueText) typeWriter(formattedText, dialogueText);

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
    if (currentMessageIndex === msgs.length - 1 && hasOpt && !isFanficMode()) {
        showOptions(msg.options);
    } else {
        if (optionsContainer) optionsContainer.classList.remove('active');
    }

    updateAffinityDisplay();
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
        const img = child.querySelector('img');
        if (img) {
            img.removeAttribute('src');
            img.removeAttribute('alt');
            img.onerror = null;
        }
        child.querySelectorAll('.manga-emote').forEach((el) => el.remove());
        spritePool.push(child);
    });
    container.innerHTML = '';
}

function updateSprites(currentMsg, activeEmote = null) {
    const container = document.getElementById('vnSpriteContainer');
    if (!container) return;

    const msgs = getTopicMessages(currentTopicId);
    const isFanfic = isFanficMode();

    let charsToShow = [];

    if (isFanfic) {
        const recentChars = [];
        const seen = new Set();

        for (let i = msgs.length - 1; i >= 0 && seen.size < 5; i--) {
            const m = msgs[i];
            if (m.characterId && m.charSprite && !seen.has(m.characterId)) {
                const charExists = appData.characters.find(c => c.id === m.characterId);
                if (charExists) {
                    seen.add(m.characterId);
                    recentChars.push(m);
                }
            }
        }

        charsToShow = recentChars.slice(0, 3);

        if (charsToShow.length === 1) {
            charsToShow[0].position = 'center';
        } else if (charsToShow.length === 2) {
            charsToShow[0].position = 'left';
            charsToShow[1].position = 'right';
        } else if (charsToShow.length >= 3) {
            charsToShow[0].position = 'left';
            charsToShow[1].position = 'center';
            charsToShow[2].position = 'right';
        }
    } else if (currentMsg.characterId && currentMsg.charSprite) {
        const charExists = appData.characters.find(c => c.id === currentMsg.characterId);
        if (charExists) {
            currentMsg.position = 'center';
            charsToShow.push(currentMsg);
        }
    }

    recycleActiveSprites(container);

    charsToShow.forEach((char) => {
        const spriteNode = getPooledSpriteElement(container);
        const isCurrent = char.characterId === currentMsg.characterId;
        const position = char.position || 'center';

        spriteNode.className = `vn-sprite position-${position} ${isCurrent ? 'active' : 'inactive'}`;
        spriteNode.dataset.charId = char.characterId;

        const img = spriteNode.querySelector('img') || document.createElement('img');
        img.src = escapeHtml(char.charSprite);
        img.alt = escapeHtml(char.charName);
        img.onerror = function () {
            this.style.display = 'none';
            if (this.parentElement) this.parentElement.style.display = 'none';
        };
        img.style.display = 'block';

        if (!spriteNode.contains(img)) spriteNode.appendChild(img);

        if (isCurrent && activeEmote) {
            const emoteNode = document.createElement('div');
            emoteNode.className = `manga-emote emote-${activeEmote}`;
            emoteNode.textContent = emoteConfig[activeEmote]?.symbol || '';
            spriteNode.appendChild(emoteNode);
        }

        container.appendChild(spriteNode);
    });
}


function typeWriter(text, element) {
    stopTypewriter();

    isTyping = true;
    element.innerHTML = '';
    const sessionId = typewriterSessionId;

    const indicator = document.getElementById('vnContinueIndicator');
    if (indicator) indicator.style.opacity = '0';

    const hasHtml = /<[^>]*>/g.test(text);

    if (prefersReducedMotion()) {
        element.innerHTML = text;
        isTyping = false;
        if (indicator) indicator.style.opacity = '1';
        return;
    }

    if (hasHtml) {
        element.innerHTML = text;
        element.style.opacity = '0';
        element.style.transition = 'opacity 0.3s';
        setTimeout(() => {
            if (sessionId !== typewriterSessionId) return;
            element.style.opacity = '1';
            isTyping = false;
            if (indicator) indicator.style.opacity = '1';
        }, 100);
    } else {
        const wordsFastMode = textSpeed <= 25;
        const tokens = wordsFastMode ? (text.match(/\S+\s*/g) || [text]) : text.split('');
        let i = 0;
        let lastTick = 0;

        const step = (timestamp) => {
            if (sessionId !== typewriterSessionId) {
                typewriterInterval = null;
                return;
            }

            if (!lastTick || timestamp - lastTick >= textSpeed) {
                const chunkSize = wordsFastMode ? 2 : 1;
                let consumed = 0;

                while (consumed < chunkSize && i < tokens.length) {
                    element.innerHTML += tokens[i];
                    i++;
                    consumed++;
                }
                lastTick = timestamp;
            }

            if (i >= tokens.length) {
                stopTypewriter();
                if (indicator) indicator.style.opacity = '1';
                return;
            }

            typewriterInterval = window.requestAnimationFrame(step);
        };

        typewriterInterval = window.requestAnimationFrame(step);
    }
}

function handleDialogueClick() {
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
        return;
    }

    if (pendingContinuation) {
        showContinuation(pendingContinuation);
        pendingContinuation = null;
        return;
    }

    if (currentMessageIndex < msgs.length - 1) {
        currentMessageIndex++;
        showCurrentMessage();
    }
}

function previousMessage() {
    if (currentMessageIndex > 0) {
        currentMessageIndex--;
        showCurrentMessage();
    }
}

function firstMessage() {
    currentMessageIndex = 0;
    showCurrentMessage();
}

function nextMessage() {
    const msgs = getTopicMessages(currentTopicId);
    if (currentMessageIndex < msgs.length - 1) {
        currentMessageIndex++;
        showCurrentMessage();
    }
}

function lastMessage() {
    const msgs = getTopicMessages(currentTopicId);
    if (msgs.length === 0) return;
    currentMessageIndex = msgs.length - 1;
    showCurrentMessage();
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
    if (!confirm('¿Borrar este mensaje?')) return;

    msgs.splice(currentMessageIndex, 1);
    if (currentMessageIndex >= msgs.length) {
        currentMessageIndex = Math.max(0, msgs.length - 1);
    }

    hasUnsavedChanges = true;
    save();
    showCurrentMessage();
}

// ============================================
// EDICIÓN DE MENSAJES
// ============================================
function editCurrentMessage() {
    const msgs = getTopicMessages(currentTopicId);
    if (currentMessageIndex >= msgs.length) return;

    const msg = msgs[currentMessageIndex];
    if (msg.userIndex !== currentUserIndex) {
        alert('Solo puedes editar tus propios mensajes');
        return;
    }

    editingMessageId = msg.id;

    openReplyPanel();

    const replyText = document.getElementById('vnReplyText');
    if (replyText) replyText.value = msg.text || '';

    const narratorMode = document.getElementById('narratorMode');
    if (narratorMode) {
        narratorMode.checked = !!msg.isNarrator;
        toggleNarratorMode();
    }

    if (!msg.isNarrator && msg.characterId) {
        selectedCharId = msg.characterId;
        updateCharSelector();
    }

    if (msg.options && msg.options.length > 0 && !isFanficMode()) {
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
    if(!text) { alert('Escribe algo'); return; }

    const msgs = getTopicMessages(currentTopicId);
    const msgIndex = msgs.findIndex(m => m.id === editingMessageId);
    if (msgIndex === -1) return;

    let char = null;
    if(!isNarratorMode) {
        if(!selectedCharId) { alert('Selecciona personaje'); return; }
        char = appData.characters.find(c => c.id === selectedCharId);
        if (!char) { alert('Personaje no encontrado'); return; }
    }

    let options = null;
    const enableOptions = document.getElementById('enableOptions');
    if(enableOptions && enableOptions.checked && !isFanficMode()) {
        options = [];
        for(let i=1; i<=3; i++) {
            const textInput = document.getElementById(`option${i}Text`);
            const contInput = document.getElementById(`option${i}Continuation`);
            const t = textInput?.value.trim() || '';
            const c = contInput?.value.trim() || '';
            if(t && c) options.push({text: t, continuation: c});
        }
    }

    // Preservar clima si existe
    const currentWeatherSetting = currentWeather;

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
        weather: currentWeatherSetting !== 'none' ? currentWeatherSetting : undefined
    };

    hasUnsavedChanges = true;
    save();
    closeReplyPanel();

    editingMessageId = null;
    showCurrentMessage();
}

// ============================================
// OPCIONES Y CONTINUACIÓN
// ============================================
function showOptions(options) {
    const container = document.getElementById('vnOptionsContainer');
    if (!container) return;

    const msgs = getTopicMessages(currentTopicId);
    const currentMsg = msgs[currentMessageIndex];

    if (!options || options.length === 0 || isFanficMode()) {
        container.classList.remove('active');
        return;
    }

    const total = options.length;
    container.innerHTML = options.map((opt, idx) => {
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
}

function selectOption(idx) {
    const msgs = getTopicMessages(currentTopicId);
    const msg = msgs[currentMessageIndex];

    if (!msg.options || msg.selectedOptionIndex !== undefined) return;

    msg.selectedOptionIndex = idx;
    msg.selectedBy = currentUserIndex;

    hasUnsavedChanges = true;
    save();

    const selectedOption = msg.options[idx];

    // Crear mensaje de respuesta como diálogo normal
    if (selectedOption && selectedOption.continuation) {
        const newMsg = {
            id: Date.now().toString(),
            characterId: null,
            charName: 'Narrador',
            charColor: null,
            charAvatar: null,
            charSprite: null,
            text: selectedOption.continuation,
            isNarrator: true,
            userIndex: currentUserIndex,
            timestamp: new Date().toISOString(),
            isOptionResult: true,
            parentOptionIndex: idx
        };

        const topicMessages = getTopicMessages(currentTopicId);
        topicMessages.push(newMsg);
        hasUnsavedChanges = true;
        save();
    }

    const optionsContainer = document.getElementById('vnOptionsContainer');
    if (optionsContainer) optionsContainer.classList.remove('active');

    const optionsIndicator = document.getElementById('messageHasOptions');
    if (optionsIndicator) optionsIndicator.classList.add('hidden');

    currentMessageIndex = getTopicMessages(currentTopicId).length - 1;
    showCurrentMessage();
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
function buildHistoryEntry(msg, idx) {
    const isNarrator = msg.isNarrator || !msg.characterId;
    const speaker = isNarrator ? 'Narrador' : msg.charName;
    const date = new Date(msg.timestamp).toLocaleString();
    const edited = msg.edited ? ' (editado)' : '';
    const optionResult = msg.isOptionResult ? ' [Respuesta elegida]' : '';

    return `
        <div class="history-entry ${isNarrator ? 'narrator' : ''} ${msg.isOptionResult ? 'option-result' : ''}">
            <div class="history-speaker">
                ${msg.charAvatar && !isNarrator ? `<img src="${escapeHtml(msg.charAvatar)}" alt="Avatar en historial de ${escapeHtml(speaker)}" style="width: 35px; height: 35px; border-radius: 50%; object-fit: cover; border: 2px solid var(--accent-gold);">` : ''}
                ${escapeHtml(speaker)}${edited}${optionResult}
            </div>
            <div class="history-text">${formatText(msg.text)}</div>
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
    paint();
}

function openHistoryLog() {
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
function openReplyPanel() {
    const panel = document.getElementById('vnReplyPanel');
    if (!panel) return;

    panel.style.display = 'flex';

    const replyPanelTitle = document.getElementById('replyPanelTitle');
    const submitBtn = document.getElementById('submitReplyBtn');
    const optionsToggleContainer = document.getElementById('optionsToggleContainer');
    const weatherSelectorContainer = document.getElementById('weatherSelectorContainer');

    if (replyPanelTitle) replyPanelTitle.textContent = editingMessageId ? '✏️ Editar Mensaje' : '💬 Responder';
    if (submitBtn) {
        submitBtn.textContent = editingMessageId ? '💾 Guardar Cambios' : 'Enviar Mensaje';
        submitBtn.onclick = editingMessageId ? saveEditedMessage : postVNReply;
    }

    // Mostrar/ocultar opciones según modo
    if (optionsToggleContainer) {
        optionsToggleContainer.style.display = isFanficMode() ? 'none' : 'flex';
    }

    // Mostrar selector de clima siempre
    if (weatherSelectorContainer) {
        weatherSelectorContainer.style.display = 'block';
    }

    if (!editingMessageId) {
        const replyText = document.getElementById('vnReplyText');
        if (replyText) replyText.value = '';

        const enableOptions = document.getElementById('enableOptions');
        const optionsFields = document.getElementById('optionsFields');

        if (enableOptions) enableOptions.checked = false;
        if (optionsFields) optionsFields.classList.remove('active');

        for(let i=1; i<=3; i++) {
            const textInput = document.getElementById(`option${i}Text`);
            const contInput = document.getElementById(`option${i}Continuation`);
            if (textInput) textInput.value = '';
            if (contInput) contInput.value = '';
        }
        tempBranches = [];
    }

    updateCharSelector();

    // Actualizar botones de clima
    document.querySelectorAll('#weatherSelectorContainer .weather-btn').forEach(btn => {
        btn.classList.remove('active');
        if (btn.textContent.toLowerCase().includes(currentWeather === 'rain' ? 'lluvia' : currentWeather === 'fog' ? 'niebla' : 'normal')) {
            btn.classList.add('active');
        }
    });
}

function closeReplyPanel() {
    const panel = document.getElementById('vnReplyPanel');
    if (panel) panel.style.display = 'none';
    closeReplyEmotePopover();

    const replyText = document.getElementById('vnReplyText');
    if (replyText) replyText.value = '';

    isNarratorMode = false;
    editingMessageId = null;
    tempBranches = [];

    const narratorMode = document.getElementById('narratorMode');
    const charSelector = document.getElementById('charSelectorContainer');
    const narratorToggle = document.getElementById('narratorToggle');

    if (narratorMode) narratorMode.checked = false;
    if (charSelector) charSelector.style.display = 'flex';
    if (narratorToggle) narratorToggle.classList.remove('active');
}

function toggleCharGrid() {
    if (isNarratorMode) return;
    const topic = appData.topics.find(t => t.id === currentTopicId);
    if (currentTopicMode === 'roleplay' && topic?.roleCharacterId) return;
    const grid = document.getElementById('charGridDropdown');
    if (grid) grid.classList.toggle('active');
}

function updateCharSelector() {
    const mine = appData.characters.filter(c => c.userIndex === currentUserIndex);
    const display = document.getElementById('charSelectedDisplay');
    const nameEl = document.getElementById('charSelectedName');
    const grid = document.getElementById('charGridDropdown');

    if(!display || !nameEl) return;

    if(mine.length === 0) {
        display.innerHTML = '<div class="placeholder">👤</div>';
        nameEl.textContent = 'Crea un personaje primero';
        if (grid) grid.innerHTML = '';
        return;
    }

    if (!selectedCharId) {
        const savedCharId = localStorage.getItem(`etheria_selected_char_${currentUserIndex}`);
        selectedCharId = savedCharId || mine[0]?.id;
    }

    const topic = appData.topics.find(t => t.id === currentTopicId);
    const roleLocked = currentTopicMode === 'roleplay' && topic?.roleCharacterId;
    if (roleLocked) {
        const lockedChar = mine.find(c => c.id === topic.roleCharacterId);
        if (lockedChar) {
            selectedCharId = lockedChar.id;
        }
    }

    const currentChar = mine.find(c => c.id === selectedCharId) || mine[0];
    if (!currentChar) return;

    selectedCharId = currentChar.id;

    if (currentChar.avatar) {
        display.innerHTML = `<img src="${escapeHtml(currentChar.avatar)}" alt="Avatar de ${escapeHtml(currentChar.name)}" onerror="this.style.display='none'; this.parentElement.innerHTML='<div class=\\'placeholder\\'>${currentChar.name[0]}</div>'">`;
    } else {
        display.innerHTML = `<div class="placeholder">${currentChar.name[0]}</div>`;
    }
    nameEl.textContent = currentChar.name;

    const hintEl = document.querySelector('.char-selected-hint');
    if (hintEl) {
        hintEl.textContent = roleLocked ? 'Personaje bloqueado para esta historia' : 'Click en el círculo para cambiar';
    }

    if (grid && !roleLocked) {
        grid.innerHTML = mine.map(c => `
            <div class="char-grid-item ${c.id === selectedCharId ? 'selected' : ''}" onclick="selectCharFromGrid('${c.id}')">
                ${c.avatar ?
                    `<img src="${escapeHtml(c.avatar)}" alt="Avatar de ${escapeHtml(c.name)}" onerror="this.style.display='none'; this.parentElement.innerHTML='<div class=\\'placeholder\\'>${c.name[0]}</div>'">` :
                    `<div class="placeholder">${c.name[0]}</div>`
                }
            </div>
        `).join('');
    } else if (grid) {
        grid.innerHTML = '';
        grid.classList.remove('active');
    }
}

function selectCharFromGrid(charId) {
    const topic = appData.topics.find(t => t.id === currentTopicId);
    if (currentTopicMode === 'roleplay' && topic?.roleCharacterId) return;

    selectedCharId = charId;
    localStorage.setItem(`etheria_selected_char_${currentUserIndex}`, charId);
    updateCharSelector();

    const grid = document.getElementById('charGridDropdown');
    if (grid) grid.classList.remove('active');
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
    const narratorMode = document.getElementById('narratorMode');
    isNarratorMode = narratorMode ? narratorMode.checked : false;

    const container = document.getElementById('charSelectorContainer');
    const toggle = document.getElementById('narratorToggle');

    if(isNarratorMode) {
        if (container) container.style.display = 'none';
        if (toggle) toggle.classList.add('active');
        selectedCharId = null;
    } else {
        if (container) container.style.display = 'flex';
        if (toggle) toggle.classList.remove('active');
        updateCharSelector();
    }
}

function postVNReply() {
    const replyText = document.getElementById('vnReplyText');
    const text = replyText?.value.trim();
    if(!text) { alert('Escribe algo'); return; }

    let char = null;
    if(!isNarratorMode) {
        if(!selectedCharId) { alert('Selecciona personaje'); return; }
        char = appData.characters.find(c => c.id === selectedCharId);
        if (!char) { alert('Personaje no encontrado. Puede haber sido borrado.'); return; }
    }

    let options = null;
    const enableOptions = document.getElementById('enableOptions');
    if(enableOptions && enableOptions.checked && !isFanficMode()) {
        options = [];
        for(let i=1; i<=3; i++) {
            const textInput = document.getElementById(`option${i}Text`);
            const contInput = document.getElementById(`option${i}Continuation`);
            const t = textInput?.value.trim() || '';
            const c = contInput?.value.trim() || '';
            if(t && c) options.push({text: t, continuation: c});
        }
        if(options.length === 0) { alert('Rellena al menos una opción con texto y continuación'); return; }
    }

    const topicMessages = getTopicMessages(currentTopicId);

    const newMsg = {
        id: Date.now().toString(),
        characterId: isNarratorMode ? null : selectedCharId,
        charName: isNarratorMode ? 'Narrador' : char.name,
        charColor: isNarratorMode ? null : char.color,
        charAvatar: isNarratorMode ? null : char.avatar,
        charSprite: isNarratorMode ? null : char.sprite,
        text,
        isNarrator: isNarratorMode,
        userIndex: currentUserIndex,
        timestamp: new Date().toISOString(),
        options: options && options.length > 0 ? options : undefined,
        weather: currentWeather !== 'none' ? currentWeather : undefined
    };

    topicMessages.push(newMsg);

    hasUnsavedChanges = true;
    save();
    closeReplyPanel();
    currentMessageIndex = getTopicMessages(currentTopicId).length - 1;
    showCurrentMessage();
}

// ============================================
// EDITOR DE RAMAS
// ============================================
function openBranchEditor() {
    tempBranches = [];
    for(let i=1; i<=3; i++) {
        const textInput = document.getElementById(`option${i}Text`);
        const contInput = document.getElementById(`option${i}Continuation`);
        const t = textInput?.value.trim() || '';
        const c = contInput?.value.trim() || '';
        if(t || c) {
            tempBranches.push({
                id: i,
                text: t,
                continuation: c
            });
        }
    }

    renderBranchEditor();
    openModal('branchEditorModal');
}

function renderBranchEditor() {
    const container = document.getElementById('branchList');
    if (!container) return;

    if (tempBranches.length === 0) {
        container.innerHTML = '<div style="text-align: center; color: var(--text-muted); padding: 2rem;">No hay ramas. Agrega una nueva.</div>';
    } else {
        container.innerHTML = tempBranches.map((branch, idx) => `
            <div class="branch-item">
                <div class="branch-item-header">
                    <span class="branch-item-number">Rama ${idx + 1}</span>
                    <button class="branch-delete-btn" onclick="deleteBranch(${branch.id})">🗑️ Eliminar</button>
                </div>
                <input type="text" class="branch-input" placeholder="Texto de la opción" value="${escapeHtml(branch.text)}" onchange="updateBranch(${branch.id}, 'text', this.value)">
                <textarea class="branch-textarea" placeholder="Continuación narrativa..." onchange="updateBranch(${branch.id}, 'continuation', this.value)">${escapeHtml(branch.continuation)}</textarea>
            </div>
        `).join('');
    }
}

function addNewBranch() {
    const newId = tempBranches.length > 0 ? Math.max(...tempBranches.map(b => b.id)) + 1 : 1;
    tempBranches.push({
        id: newId,
        text: '',
        continuation: ''
    });
    renderBranchEditor();
}

function deleteBranch(id) {
    tempBranches = tempBranches.filter(b => b.id !== id);
    renderBranchEditor();
}

function updateBranch(id, field, value) {
    const branch = tempBranches.find(b => b.id === id);
    if (branch) {
        branch[field] = value;
    }
}

function saveBranches() {
    const validBranches = tempBranches.filter(b => b.text.trim() && b.continuation.trim());

    if (validBranches.length === 0 && tempBranches.length > 0) {
        alert('Las ramas deben tener tanto texto como continuación');
        return;
    }

    for(let i=0; i<3; i++) {
        const textInput = document.getElementById(`option${i+1}Text`);
        const contInput = document.getElementById(`option${i+1}Continuation`);

        if (i < validBranches.length) {
            if (textInput) textInput.value = validBranches[i].text;
            if (contInput) contInput.value = validBranches[i].continuation;
        } else {
            if (textInput) textInput.value = '';
            if (contInput) contInput.value = '';
        }
    }

    closeModal('branchEditorModal');
}

// ============================================
// TEMAS (Topics)
// ============================================
function renderTopics() {
    const container = document.getElementById('topicsList');
    if (!container) return;

    if(appData.topics.length === 0) {
        container.innerHTML = '<div style="grid-column: 1 / -1; text-align: center; padding: 3rem;">No hay historias. ¡Crea una!</div>';
        return;
    }

    container.innerHTML = appData.topics.map(t => {
        const msgs = getTopicMessages(t.id);
        const last = msgs[msgs.length - 1];
        const lastText = last ? stripHtml(formatText(last.text)).substring(0, 50) : '';
        const modeIcon = t.mode === 'fanfic' ? '📖' : '🎭';
        const modeText = t.mode === 'fanfic' ? 'Fanfic' : 'Rol';

        return `
            <div style="background: var(--bg-secondary); border: 2px solid var(--border-color); border-radius: 16px; padding: 1.5rem; cursor: pointer; transition: all 0.3s;" onmouseover="this.style.borderColor='var(--accent-gold)'" onmouseout="this.style.borderColor='var(--border-color)'" onclick="enterTopic('${t.id}')">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;">
                    <h3 style="font-family: Cinzel; color: var(--accent-wood);">${escapeHtml(t.title)}</h3>
                    <span style="background: var(--accent-wood); color: white; padding: 0.2rem 0.6rem; border-radius: 12px; font-size: 0.75rem;">${msgs.length}</span>
                </div>
                <div style="display: flex; gap: 0.5rem; margin-bottom: 0.5rem;">
                    <span style="background: rgba(201, 168, 108, 0.2); color: var(--accent-gold); padding: 0.2rem 0.6rem; border-radius: 8px; font-size: 0.75rem;">${modeIcon} ${modeText}</span>
                    ${t.weather ? `<span style="background: rgba(100, 149, 237, 0.2); color: #6495ed; padding: 0.2rem 0.6rem; border-radius: 8px; font-size: 0.75rem;">${t.weather === 'rain' ? '🌧️' : '🌫️'}</span>` : ''}
                </div>
                <p style="font-size: 0.9rem; color: var(--text-secondary);">Por ${escapeHtml(t.createdBy)}</p>
                ${last ? `<p style="font-style: italic; color: var(--text-muted); margin-top: 0.5rem; font-size: 0.9rem;">"${escapeHtml(lastText)}..."</p>` : ''}
            </div>
        `;
    }).join('');

    const statTopics = document.getElementById('statTopics');
    const statMsgs = document.getElementById('statMsgs');

    if (statTopics) statTopics.textContent = appData.topics.filter(t => t.createdByIndex === currentUserIndex).length;

    let msgCount = 0;
    appData.topics.forEach((topic) => {
        const topicMsgs = getTopicMessages(topic.id);
        msgCount += topicMsgs.filter(m => m.userIndex === currentUserIndex).length;
    });

    if (statMsgs) statMsgs.textContent = msgCount;
}

function createTopic() {
    const titleInput = document.getElementById('topicTitleInput');
    const firstMsgInput = document.getElementById('topicFirstMsg');
    const weatherInput = document.getElementById('topicWeatherInput');

    const title = titleInput?.value.trim();
    const text = firstMsgInput?.value.trim();
    const weather = weatherInput?.value || 'none';
    const topicBackground = DEFAULT_TOPIC_BACKGROUND;

    if(!title || !text) { alert('Completa todos los campos obligatorios'); return; }

    const id = Date.now().toString();
    appData.topics.push({
        id,
        title,
        background: topicBackground,
        weather: weather !== 'none' ? weather : undefined,
        mode: currentTopicMode,
        roleCharacterId: null,
        createdBy: userNames[currentUserIndex] || 'Jugador',
        createdByIndex: currentUserIndex,
        date: new Date().toLocaleDateString()
    });

    appData.messages[id] = [{
        id: Date.now().toString(),
        characterId: null,
        charName: 'Narrador',
        charColor: null,
        charAvatar: null,
        charSprite: null,
        text,
        isNarrator: true,
        userIndex: currentUserIndex,
        timestamp: new Date().toISOString(),
        weather: weather !== 'none' ? weather : undefined
    }];

    hasUnsavedChanges = true;
    save();
    closeModal('topicModal');
    renderTopics();
    if (currentTopicMode === 'roleplay') {
        pendingRoleTopicId = id;
        openRoleCharacterModal(id);
    } else {
        enterTopic(id);
    }
  
}

// ============================================
// UTILIDADES
// ============================================
function save() {
    try {
        persistPartitionedData();
        hasUnsavedChanges = false;
        showAutosave('Guardado', 'saved');
        return true;
    } catch (e) {
        console.error('Error saving:', e);
        showAutosave('Error al guardar: almacenamiento lleno o no disponible', 'error');
        return false;
    }
}

function showAutosave(text, state) {
    const indicator = document.getElementById('autosaveIndicator');
    if (!indicator) return;

    const textEl = indicator.querySelector('.autosave-text');
    const iconEl = indicator.querySelector('.autosave-icon');

    if (textEl) textEl.textContent = text;
    indicator.className = `autosave-indicator visible ${state}`;

    if (iconEl) {
        if (state === 'saving') iconEl.textContent = '💾';
        else if (state === 'saved') iconEl.textContent = '✓';
        else if (state === 'error') iconEl.textContent = '✕';
    }

    setTimeout(() => {
        indicator.classList.remove('visible');
    }, 2000);
}

function openModal(id) {
    if(id === 'topicModal') {
        const roleplay = document.getElementById('modeRoleplay');
        if (roleplay) roleplay.checked = true;

        updateTopicModeUI();
    }
    const modal = document.getElementById(id);
    if (modal) {
        lastFocusedElement = document.activeElement;
        modal.classList.add('active');
        document.body.classList.add('modal-open');

        const firstFocusable = modal.querySelector('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
        if (firstFocusable) firstFocusable.focus();
    }
}

function closeModal(id) {
    const modal = document.getElementById(id);
    if (modal) modal.classList.remove('active');

    if (id === 'roleCharacterModal' && pendingRoleTopicId) {
        appData.topics = appData.topics.filter(t => t.id !== pendingRoleTopicId);
        delete appData.messages[pendingRoleTopicId];
        pendingRoleTopicId = null;
        hasUnsavedChanges = true;
        save();
        renderTopics();
    }

    const anyModalOpen = document.querySelector('.modal-overlay.active');
    if (!anyModalOpen) {
        document.body.classList.remove('modal-open');
        if (lastFocusedElement && typeof lastFocusedElement.focus === 'function') {
            lastFocusedElement.focus();
        }
    }
}

function changeUser() {
    const newName = prompt('Nuevo nombre:', userNames[currentUserIndex]);
    if(newName?.trim()) {
        userNames[currentUserIndex] = newName.trim();
        localStorage.setItem('etheria_user_names', JSON.stringify(userNames));

        const currentUserDisplay = document.getElementById('currentUserDisplay');
        if (currentUserDisplay) currentUserDisplay.textContent = newName.trim();

        save();
        renderUserCards();
    }
}

function toggleTheme() {
    const html = document.documentElement;
    const currentTheme = html.getAttribute('data-theme');
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    html.setAttribute('data-theme', newTheme);
    localStorage.setItem('etheria_theme', newTheme);

    generateParticles();
}

function deleteCurrentTopic() {
    if(!confirm('¿Borrar esta historia?')) return;

    appData.topics = appData.topics.filter(t => t.id !== currentTopicId);
    delete appData.messages[currentTopicId];
    delete appData.affinities[currentTopicId];

    currentTopicId = null;
    hasUnsavedChanges = true;
    save();
    backToTopics();
}

function quickSave() {
    const saved = save();
    showAutosave(saved ? 'Guardado rápido' : 'Error al guardar rápido', saved ? 'saved' : 'error');
}

function saveGameFromMenu() {
    const saved = save();
    alert(saved ? 'Partida guardada localmente' : 'No se pudo guardar. Revisa espacio disponible en almacenamiento local.');
}

function loadGameFromMenu() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = e => {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = event => {
            try {
                const data = JSON.parse(event.target.result);

                validateImportedData(data);

                if(confirm('Esto reemplazará todos los datos actuales. ¿Continuar?')) {
                    appData = {
                        topics: Array.isArray(data.topics) ? data.topics : [],
                        characters: Array.isArray(data.characters) ? data.characters : [],
                        messages: (data.messages && typeof data.messages === 'object' && !Array.isArray(data.messages))
                            ? data.messages
                            : {},
                        affinities: (data.affinities && typeof data.affinities === 'object' && !Array.isArray(data.affinities))
                            ? data.affinities
                            : {}
                    };
                    hasUnsavedChanges = true;
                    save();
                    alert('Partida cargada ✓');
                    renderTopics();
                    renderGallery();
                }
            } catch(err) {
                alert('Error al cargar: ' + err.message);
            }
        };
        reader.readAsText(file);
    };
    input.click();
}

function exportData() {
    const blob = new Blob([JSON.stringify(appData, null, 2)], {type: 'application/json'});
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `etheria_${new Date().toISOString().split('T')[0]}.json`;
    a.click();
}

function deleteCharFromModal() {
    const id = document.getElementById('editCharacterId')?.value;
    if(!id) return;
    if(!confirm('¿Borrar personaje?')) return;

    if (selectedCharId === id) {
        selectedCharId = null;
        localStorage.removeItem(`etheria_selected_char_${currentUserIndex}`);
    }

    appData.characters = appData.characters.filter(c => c.id !== id);
    hasUnsavedChanges = true;
    save();
    closeModal('characterModal');
    resetCharForm();
    renderGallery();
}

// ============================================
// AJUSTES
// ============================================
function openSettings() {
    const panel = document.getElementById('settingsPanel');
    if (panel) panel.classList.add('active');
}

function closeSettings() {
    const panel = document.getElementById('settingsPanel');
    if (panel) panel.classList.remove('active');
}

function updateTextSpeed(val) {
    textSpeed = 110 - parseInt(val);
    localStorage.setItem('etheria_text_speed', textSpeed);

    const speedValue = document.getElementById('speedValue');
    if (speedValue) {
        const labels = ['Rápido', 'Normal', 'Lento'];
        const idx = val < 40 ? 0 : val < 70 ? 1 : 2;
        speedValue.textContent = labels[idx];
    }
}

function updateFontSize(val) {
    document.documentElement.style.setProperty('--font-size-base', val + 'px');
    localStorage.setItem('etheria_font_size', val);
}

function setAtmosphere(filter) {
    const vnSection = document.getElementById('vnSection');
    if (!vnSection) return;

    vnSection.classList.remove('sepia', 'bw', 'cinematic');
    if (filter !== 'none') vnSection.classList.add(filter);

    document.querySelectorAll('.filter-btn').forEach(btn => btn.classList.remove('active'));
    if (event && event.target) event.target.classList.add('active');
}
