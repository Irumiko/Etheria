// Modo novela visual: renderizado de mensajes, sprites, typewriter, reply panel, opciones y historial.
// ============================================
// MODO VN
// ============================================
const DEFAULT_TOPIC_BACKGROUND = 'assets/backgrounds/default_background.jpg';
const LEGACY_DEFAULT_TOPIC_BACKGROUNDS = [
    'default_scene',
    'assets/backgrounds/default_scene.png',
    'Assets/backgrounds/default_scene.png',
    'assets/default_background.png',
    'Assets/default_background.png',
    'assets/backgrounds/default_background.png.jpg',
    'Assets/backgrounds/default_background.png.jpg',
    'assets/backgrounds/default-scene-sunset.png',
    'Assets/backgrounds/default-scene-sunset.png'
];

const preloadedBackgrounds = new Set();

function isDefaultTopicBackground(backgroundPath) {
    const normalized = (backgroundPath || "").trim().toLowerCase();
    if (!normalized) return true;
    return LEGACY_DEFAULT_TOPIC_BACKGROUNDS.some(path => normalized === path.toLowerCase());
}

function resolveTopicBackgroundPath(backgroundPath = '') {
    const topicBackground = (backgroundPath || '').trim();
    return isDefaultTopicBackground(topicBackground) ? DEFAULT_TOPIC_BACKGROUND : topicBackground;
}

function preloadBackgroundImage(path) {
    const normalizedPath = (path || '').trim();
    if (!normalizedPath || preloadedBackgrounds.has(normalizedPath)) {
        return Promise.resolve();
    }

    return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
            preloadedBackgrounds.add(normalizedPath);
            resolve();
        };
        img.onerror = resolve;
        img.src = normalizedPath;
    });
}

function applyTopicBackground(vnSection, backgroundPath) {
    if (!vnSection) return;

    const sceneBackgroundPath = resolveTopicBackgroundPath(backgroundPath);
    const sceneBackgroundLayer = `url(${escapeHtml(sceneBackgroundPath)})`;
    vnSection.dataset.pendingBackground = sceneBackgroundPath;

    const applyBackground = () => {
        if (vnSection.dataset.pendingBackground !== sceneBackgroundPath) return;
        vnSection.style.backgroundImage = `${sceneBackgroundLayer}, linear-gradient(135deg, rgba(20,15,40,1) 0%, rgba(50,40,80,1) 100%)`;
    };

    preloadBackgroundImage(sceneBackgroundPath).finally(applyBackground);
}

function preloadTopicBackgrounds() {
    const topicBackgrounds = (appData?.topics || []).map(topic => resolveTopicBackgroundPath(topic.background));
    const uniqueBackgrounds = new Set([DEFAULT_TOPIC_BACKGROUND, ...topicBackgrounds]);
    uniqueBackgrounds.forEach(path => preloadBackgroundImage(path));
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
        applyTopicBackground(vnSection, t.background);

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
    if (vnSection) {
        vnSection.classList.add('active');
        playVnSceneTransition(vnSection);
    }

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

function playVnSceneTransition(vnSection) {
    const overlay = document.getElementById('vnSceneTransition');
    if (!vnSection || !overlay) return;

    overlay.classList.remove('active');
    vnSection.classList.remove('entering-scene');
    void overlay.offsetWidth;
    overlay.classList.add('active');
    vnSection.classList.add('entering-scene');

    window.setTimeout(() => {
        vnSection.classList.remove('entering-scene');
    }, 620);
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

function triggerDialogueFadeIn() {
    const dialogueBox = document.querySelector('.vn-dialogue-box');
    if (!dialogueBox) return;
    dialogueBox.classList.remove('fade-in');
    void dialogueBox.offsetWidth;
    dialogueBox.classList.add('fade-in');
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

    if (avatarBox) avatarBox.classList.toggle('is-speaking', !(msg.isNarrator || !msg.characterId));

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
        if (typeof playSoundClick === 'function') playSoundClick();
        showCurrentMessage();
        syncBidirectional({ silent: true, allowRemotePrompt: true });
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
        if (typeof playSoundClick === 'function') playSoundClick();
        showCurrentMessage();
        syncBidirectional({ silent: true, allowRemotePrompt: true });
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

    setWeather(msg.weather || 'none');

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

    if (selectedOption && selectedOption.continuation) {
        // El resultado lo dice el personaje activo del mensaje que tenía las opciones,
        // no el narrador — a menos que el mensaje original fuera del narrador.
        const sourceIsNarrator = msg.isNarrator || !msg.characterId;
        const resultChar = sourceIsNarrator
            ? null
            : appData.characters.find(c => c.id === msg.characterId) || null;

        const newMsg = {
            id: Date.now().toString(),
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
        save();
    }

    const optionsContainer = document.getElementById('vnOptionsContainer');
    if (optionsContainer) optionsContainer.classList.remove('active');

    const optionsIndicator = document.getElementById('messageHasOptions');
    if (optionsIndicator) optionsIndicator.classList.add('hidden');

    currentMessageIndex = getTopicMessages(currentTopicId).length - 1;
    triggerDialogueFadeIn();
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
    syncBidirectional({ silent: true, allowRemotePrompt: true });
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
    triggerDialogueFadeIn();
    showCurrentMessage();
}

// ============================================
