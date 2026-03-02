// Modo novela visual: renderizado de mensajes, sprites, typewriter, reply panel, opciones y historial.
// ============================================
// MODO VN
// ============================================
// Variables para el debounce de sincronización al navegar mensajes
var _lastNavSyncTime = 0;
var _NAV_SYNC_DEBOUNCE_MS = 3000; // sincronizar como máximo cada 3 segundos al navegar
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
let pendingSceneChange = null;

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

function playVnSceneTransition(vnSection) {
    const el = document.getElementById('vnSceneTransition');
    if (!el) return;
    el.classList.remove('active', 'wipe');
    void el.offsetWidth; // forzar reflow para reiniciar animación
    el.classList.add('active');
    setTimeout(() => el.classList.remove('active'), 800);
}

function enterTopic(id) {
    if (typeof stopMenuMusic === 'function') stopMenuMusic();
    // Onboarding paso 2: primera vez en una historia
    const _ob = parseInt(localStorage.getItem('etheria_onboarding_step') || '0', 10);
    if (_ob === 2 && typeof maybeShowOnboarding === 'function') {
        setTimeout(maybeShowOnboarding, 800);
    }
    resetVNTransientState();
    currentTopicId = id;
    if (typeof syncVnStore === 'function') syncVnStore({ topicId: currentTopicId });
    getTopicMessages(id);
    currentMessageIndex = 0;
    if (typeof syncVnStore === 'function') syncVnStore({ messageIndex: currentMessageIndex });
    pendingContinuation = null;
    editingMessageId = null;

    const t = appData.topics.find(topic => topic.id === id);
    if(!t) return;
    if (typeof updateRoomCodeUI === 'function') updateRoomCodeUI(id);

    // Establecer modo
    currentTopicMode = t.mode || 'roleplay';

    if (currentTopicMode === 'roleplay' && t.roleCharacterId) {
        const lockedChar = appData.characters.find(c => c.id === t.roleCharacterId && c.userIndex === currentUserIndex);
        if (lockedChar) {
            selectedCharId = lockedChar.id;
            if (typeof syncVnStore === 'function') syncVnStore({ selectedCharId });
        }
    }

    if (currentTopicMode === 'fanfic') {
        const lockedCharId = getTopicLockedCharacterId(t);
        if (lockedCharId) {
            selectedCharId = lockedCharId;
            if (typeof syncVnStore === 'function') syncVnStore({ selectedCharId });
        } else {
            openRoleCharacterModal(id, { mode: 'fanfic', enterOnSelect: true });
            return;
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
            vnSection.classList.remove('mode-classic');
            vnSection.classList.add('mode-rpg');
        } else {
            // En modo rol, usar modo clásico (sprites desaparecen)
            vnSection.classList.add('classic-mode');
            vnSection.classList.add('mode-classic');
            vnSection.classList.remove('mode-rpg');
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
        // Mostrar si el usuario actual es el creador, o si createdByIndex no está definido (topics legados)
        const isOwner = t.createdByIndex === currentUserIndex || t.createdByIndex === undefined || t.createdByIndex === null;
        // Usamos el slot padre para mostrar/ocultar, evitando conflicto con el CSS :has(.hidden)
        const deleteSlot = deleteBtn.closest('.vn-control-slot');
        if (isOwner) {
            deleteBtn.classList.remove('hidden');
            if (deleteSlot) deleteSlot.style.display = '';
        } else {
            deleteBtn.classList.add('hidden');
            if (deleteSlot) deleteSlot.style.display = 'none';
        }
    }

    showCurrentMessage('forward');

    // Carga desde Supabase y suscripción realtime (no bloquea el flujo principal)
    _sbEnterTopic(id);
}

async function _sbEnterTopic(topicId) {
    if (typeof SupabaseMessages === 'undefined') return;

    SupabaseMessages.unsubscribe();

    // Cargar historial remoto y fusionar con local por id
    try {
        const remoteMsgs = await SupabaseMessages.load(topicId);
        if (Array.isArray(remoteMsgs) && remoteMsgs.length > 0) {
            const localMsgs = getTopicMessages(topicId);
            const localIds  = new Set(localMsgs.map(function (m) { return String(m.id); }));
            const newRemote = remoteMsgs.filter(function (m) { return m.id && !localIds.has(String(m.id)); });

            if (newRemote.length > 0) {
                newRemote.forEach(function (m) { localMsgs.push(m); });
                localMsgs.sort(function (a, b) { return new Date(a.timestamp) - new Date(b.timestamp); });
                appData.messages[topicId] = localMsgs;
                hasUnsavedChanges = true;
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
    }

    // Suscripción realtime: recibir mensajes del otro jugador en tiempo real
    SupabaseMessages.subscribe(topicId, function (remoteMsg) {
        if (currentTopicId !== topicId) return;
        if (!remoteMsg || !remoteMsg.id) return;

        const msgs = getTopicMessages(topicId);
        const exists = msgs.some(function (m) { return String(m.id) === String(remoteMsg.id); });
        if (exists) return;

        // Ignorar si es un mensaje propio (ya está guardado localmente)
        if (String(remoteMsg.userIndex) === String(currentUserIndex)) return;

        msgs.push(remoteMsg);
        msgs.sort(function (a, b) { return new Date(a.timestamp) - new Date(b.timestamp); });
        appData.messages[topicId] = msgs;
        hasUnsavedChanges = true;
        save({ silent: true });

        const isAtEnd = currentMessageIndex >= msgs.length - 2;
        if (isAtEnd) {
            currentMessageIndex = msgs.length - 1;
            showCurrentMessage('forward');
        } else {
            showSyncToast('Nuevo mensaje recibido', 'Ver ahora', function () {
                currentMessageIndex = msgs.length - 1;
                showCurrentMessage('forward');
            });
        }
    });
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

    if (msg.isNarrator || !msg.characterId) {
        if (namePlate) {
            namePlate.textContent = 'Narrador';
            namePlate.style.background = 'linear-gradient(135deg, #4a4540, #2a2724)';
        }
        if (avatarBox) avatarBox.innerHTML = '📖';
        // Color de acento para el narrador: dorado neutro
        document.documentElement.style.setProperty('--char-color', 'rgba(139, 115, 85, 0.6)');
        document.documentElement.style.setProperty('--char-color-full', '#8b7355');
    } else if (!charExists) {
        if (namePlate) {
            namePlate.textContent = msg.charName || 'Desconocido';
            namePlate.style.background = msg.charColor || 'var(--accent-wood)';
        }
        if (avatarBox) {
            avatarBox.innerHTML = msg.charAvatar ?
                `<img src="${escapeHtml(msg.charAvatar)}" alt="Avatar de ${escapeHtml(msg.charName || "Desconocido")}" onerror="this.style.display='none'; this.parentElement.textContent='${(msg.charName || '?')[0]}'">` :
                (msg.charName || '?')[0];
        }
        applyCharColor(msg.charColor);
    } else {
        if (namePlate) {
            namePlate.textContent = msg.charName;
            namePlate.style.background = msg.charColor || 'var(--accent-wood)';
        }
        if (avatarBox) {
            avatarBox.innerHTML = msg.charAvatar ?
                `<img src="${escapeHtml(msg.charAvatar)}" alt="Avatar de ${escapeHtml(msg.charName)}" onerror="this.style.display='none'; this.parentElement.textContent='${msg.charName[0]}'">` :
                msg.charName[0];
        }
        applyCharColor(msg.charColor);
    }

    if (avatarBox) avatarBox.classList.toggle('is-speaking', !(msg.isNarrator || !msg.characterId));


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
    if (typeof updateFavButton === "function") updateFavButton();

    // Aplicar cambio de escena dinámico si el mensaje lo contiene
    if (direction === 'forward') {
        if (msg.sceneChange) {
            const vnSection = document.getElementById('vnSection');
            const sceneBackground = resolveTopicBackgroundPath(msg.sceneChange.background || '');
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
            img.removeAttribute('src');
            img.removeAttribute('alt');
            img.onerror = null;
        }
        child.querySelectorAll('.vn-sprite-hitbox, .manga-emote').forEach((el) => el.remove());
        // Limitar el pool a 20 elementos para evitar memory leak
        if (spritePool.length < 20) spritePool.push(child);
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
            img.src = escapeHtml(char.charSprite);
            img.alt = escapeHtml(char.charName || 'Sprite');
            img.onerror = function () {
                this.style.display = 'none';
                if (this.parentElement) this.parentElement.classList.add('no-sprite');
            };
            img.style.display = 'block';
            spriteNode.classList.remove('no-sprite');
        } else {
            if (img) img.remove();
            spriteNode.classList.add('no-sprite');
            const hitbox = document.createElement('div');
            hitbox.className = 'vn-sprite-hitbox';
            hitbox.setAttribute('aria-hidden', 'true');
            spriteNode.appendChild(hitbox);
        }

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
            return;
        }

        typewriterInterval = window.requestAnimationFrame(step);
    };

    typewriterInterval = window.requestAnimationFrame(step);
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
    if (currentMessageIndex > 0) {
        currentMessageIndex--;
        if (typeof syncVnStore === 'function') syncVnStore({ messageIndex: currentMessageIndex });
        showCurrentMessage('backward');
    }
}

function firstMessage() {
    currentMessageIndex = 0;
    if (typeof syncVnStore === 'function') syncVnStore({ messageIndex: currentMessageIndex });
    showCurrentMessage('backward');
}

function nextMessage() {
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

    openConfirmModal('¿Borrar este mensaje?', 'Borrar').then(ok => {
        if (!ok) return;
        msgs.splice(currentMessageIndex, 1);
        if (currentMessageIndex >= msgs.length) {
            currentMessageIndex = Math.max(0, msgs.length - 1);
        }
        hasUnsavedChanges = true;
        save({ silent: true });
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
        if (topic?.mode === 'fanfic' && typeof ensureCharacterRpgProfile === 'function') {
            const profile = ensureCharacterRpgProfile(char);
            if (profile.knockedOutTurns > 0) {
                showAutosave(`Este personaje está fuera de escena por ${profile.knockedOutTurns} turnos`, 'error');
                return;
            }
        }
        persistTopicLockedCharacter(topic, selectedCharId);
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

    if (!options || options.length === 0 || isFanficMode()) {
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
}

function selectOption(idx) {
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

    return `
        <div class="history-entry ${isNarrator ? 'narrator' : ''} ${msg.isOptionResult ? 'option-result' : ''}${isFav ? ' is-favorite' : ''}">
            <div class="history-speaker">
                ${msg.charAvatar && !isNarrator ? `<img src="${escapeHtml(msg.charAvatar)}" alt="Avatar en historial de ${escapeHtml(speaker)}" style="width: 35px; height: 35px; border-radius: 50%; object-fit: cover; border: 2px solid var(--accent-gold);">` : ''}
                ${escapeHtml(speaker)}${edited}${optionResult}${favBadge}
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
    if (!topic || topic.mode !== 'fanfic') return true;
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
    if (topic.mode === 'fanfic') {
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
    appData.characters.forEach((ch) => {
        const profile = typeof ensureCharacterRpgProfile === 'function' ? ensureCharacterRpgProfile(ch) : null;
        if (!profile || profile.knockedOutTurns <= 0) return;
        if (excludedCharId && String(ch.id) === String(excludedCharId)) return;
        profile.knockedOutTurns = Math.max(0, profile.knockedOutTurns - 1);
    });
}

function applyRpgNarrativeProgress(charId, diceRoll) {
    if (!charId || !diceRoll) return;
    const char = getCharacterById(charId);
    if (!char || typeof ensureCharacterRpgProfile !== 'function') return;

    const profile = ensureCharacterRpgProfile(char);

    if (diceRoll.type === 'fail') {
        profile.hp = Math.max(0, profile.hp - 1);
        if (profile.hp === 0) profile.knockedOutTurns = 5;
    } else if (diceRoll.type === 'success') {
        profile.exp += 1;
        if (profile.exp >= 10) {
            profile.exp = 0;
            profile.level += 1;
        }
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
    showAutosave(`Escena preparada: ${title}`, 'saved');
}

function applySceneChangeToTopic(topic, sceneChange) {
    if (!topic || !sceneChange) return;

    if (sceneChange.background) {
        topic.background = sceneChange.background;
    }

    if (topic.mode === 'fanfic') {
        appData.characters.forEach((char) => {
            if (typeof ensureCharacterRpgProfile !== 'function') return;
            const profile = ensureCharacterRpgProfile(char);
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
    const panel = document.getElementById('vnReplyPanel');
    if (!panel) return;

    panel.style.display = 'flex';

    const replyPanelTitle = document.getElementById('replyPanelTitle');
    const submitBtn = document.getElementById('submitReplyBtn');
    const optionsToggleContainer = document.getElementById('optionsToggleContainer');
    const weatherSelectorContainer = document.getElementById('weatherSelectorContainer');
    const narratorToggle = document.getElementById('narratorToggle');
    const coinActionTypeWrap = document.getElementById('coinActionTypeWrap');
    const coinControlsRow = document.getElementById('coinControlsRow');

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

    const topic = getCurrentTopic();
    const isRpg = topic?.mode === 'fanfic';
    if (coinControlsRow) coinControlsRow.style.display = isRpg ? 'flex' : 'none';
    if (coinActionTypeWrap) coinActionTypeWrap.style.display = isRpg ? 'inline-flex' : 'none';
    const narratorAllowed = canUseNarratorMode(topic);
    if (narratorToggle) narratorToggle.style.display = narratorAllowed ? 'flex' : 'none';
    if (!narratorAllowed) {
        isNarratorMode = false;
        const narratorMode = document.getElementById('narratorMode');
        if (narratorMode) narratorMode.checked = false;
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
    updateSceneChangePreview();

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
    pendingSceneChange = null;
    updateSceneChangePreview();

    const narratorMode = document.getElementById('narratorMode');
    const charSelector = document.getElementById('charSelectorContainer');
    const narratorToggle = document.getElementById('narratorToggle');
    const coinActionTypeWrap = document.getElementById('coinActionTypeWrap');
    const coinControlsRow = document.getElementById('coinControlsRow');

    if (narratorMode) narratorMode.checked = false;
    if (charSelector) charSelector.style.display = 'flex';
    if (narratorToggle) narratorToggle.classList.remove('active');
    if (coinActionTypeWrap) coinActionTypeWrap.style.display = 'none';
    if (coinControlsRow) coinControlsRow.style.display = 'none';
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
    const statsBtn = document.getElementById('charStatsQuickBtn');

    if(!display || !nameEl) return;

    if(mine.length === 0) {
        display.innerHTML = '<div class="placeholder">👤</div>';
        nameEl.textContent = 'Crea un personaje primero';
        if (grid) grid.innerHTML = '';
        if (statsBtn) statsBtn.style.display = 'none';
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

    if (currentChar.avatar) {
        display.innerHTML = `<img src="${escapeHtml(currentChar.avatar)}" alt="Avatar de ${escapeHtml(currentChar.name)}" onerror="this.style.display='none'; this.parentElement.innerHTML='<div class=\\'placeholder\\'>${currentChar.name[0]}</div>'">`;
    } else {
        display.innerHTML = `<div class="placeholder">${currentChar.name[0]}</div>`;
    }
    nameEl.textContent = currentChar.name;

    const hintEl = document.querySelector('.char-selected-hint');
    if (hintEl) {
        hintEl.textContent = isCharLocked
            ? 'Personaje bloqueado para esta historia'
            : 'Click en el círculo para cambiar';
    }

    if (statsBtn) {
        statsBtn.style.display = (topic?.mode === 'fanfic' && selectedCharId) ? 'inline-flex' : 'none';
    }

    if (grid && !isCharLocked) {
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
    if (topic?.mode !== 'fanfic') return;
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
    if(!text) { showAutosave('Escribe algo primero', 'error'); return; }

    const topic = getCurrentTopic();

    if (isNarratorMode && !canUseNarratorMode(topic)) { showAutosave('Solo quien crea la historia puede usar Narrador en modo RPG', 'error'); return; }

    let char = null;
    if(!isNarratorMode) {
        if(!selectedCharId) { showAutosave('Selecciona un personaje', 'error'); return; }
        char = appData.characters.find(c => c.id === selectedCharId);
        if (!char) { showAutosave('Personaje no encontrado', 'error'); return; }
        if (topic?.mode === 'fanfic' && typeof ensureCharacterRpgProfile === 'function') {
            const profile = ensureCharacterRpgProfile(char);
            if (profile.knockedOutTurns > 0) {
                showAutosave(`Este personaje está fuera de escena por ${profile.knockedOutTurns} turnos`, 'error');
                return;
            }
        }
        persistTopicLockedCharacter(topic, selectedCharId);
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
        if(options.length === 0) { showAutosave('Rellena al menos una opción con texto y continuación', 'error'); return; }
    }

    const topicMessages = getTopicMessages(currentTopicId);

    // Recoger tirada de dado si se activó antes de enviar (inyectada por mejoras.js)
    const diceRoll = window._diceRollForNextMsg || undefined;
    window._diceRollForNextMsg = null;
    const sceneChange = pendingSceneChange || undefined;
    pendingSceneChange = null;
    updateSceneChangePreview();

    const finalText = sceneChange ? `🎬 **Escena: ${sceneChange.title}**\n${text}` : text;

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
        diceRoll: diceRoll,
        sceneChange: sceneChange
    };

    if (sceneChange) {
        applySceneChangeToTopic(topic, sceneChange);
    }

    if (topic?.mode === 'fanfic') {
        tickRpgKnockoutTurns(isNarratorMode ? null : selectedCharId);
        applyRpgNarrativeProgress(isNarratorMode ? null : selectedCharId, diceRoll);
    }

    topicMessages.push(newMsg);

    // Envío a Supabase (no bloquea — fallback local automático si falla)
    if (typeof SupabaseMessages !== 'undefined' && currentTopicId) {
        SupabaseMessages.send(currentTopicId, newMsg).catch(() => {});
    }

    hasUnsavedChanges = true;
    save({ silent: true });
    closeReplyPanel();
    currentMessageIndex = getTopicMessages(currentTopicId).length - 1;
    triggerDialogueFadeIn();
    showCurrentMessage('forward');
}

// ============================================
