'use strict';

    // EMOTES MANGA
    // ============================================
    function toggleEmotePicker() {
        const picker = document.getElementById('emotePicker');
        if (picker) {
            picker.classList.toggle('active');
        }
    }

    function selectEmote(emoteType) {
        currentEmote = emoteType;
        toggleEmotePicker();

        // Insertar comando en el textarea si está abierto el panel
        const replyText = document.getElementById('vnReplyText');
        if (replyText && document.getElementById('vnReplyPanel').style.display === 'flex') {
            const cursorPos = replyText.selectionStart;
            const textBefore = replyText.value.substring(0, cursorPos);
            const textAfter = replyText.value.substring(cursorPos);
            replyText.value = textBefore + `/${emoteType} ` + textAfter;
            replyText.focus();
            replyText.setSelectionRange(cursorPos + emoteType.length + 2, cursorPos + emoteType.length + 2);
        }
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

    // CREAR/EDITAR PERSONAJE
    // ============================================
    function saveCharacter() {
        const nameInput = document.getElementById('charName');
        const name = nameInput?.value.trim();
        if(!name) { alert('Nombre obligatorio'); return; }

        const id = document.getElementById('editCharacterId')?.value || Date.now().toString();

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
            avatar: document.getElementById('charAvatar')?.value.trim() || '',
            sprite: document.getElementById('charSprite')?.value.trim() || '',
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
    function enterTopic(id) {
        currentTopicId = id;
        currentMessageIndex = 0;
        pendingContinuation = null;
        editingMessageId = null;

        const t = appData.topics.find(topic => topic.id === id);
        if(!t) return;

        // Establecer modo
        currentTopicMode = t.mode || 'roleplay';

        // Aplicar clima si existe
        if (t.weather) {
            setWeather(t.weather);
        } else {
            setWeather('none');
        }

        const vnSection = document.getElementById('vnSection');
        if (vnSection) {
            vnSection.style.backgroundImage = t.background ? `url(${escapeHtml(t.background)})` : 'linear-gradient(135deg, #1a1815 0%, #2d2a26 100%)';

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
        if (typewriterInterval) {
            clearInterval(typewriterInterval);
            typewriterInterval = null;
        }
        isTyping = false;
    }

    function showCurrentMessage() {
        const msgs = appData.messages[currentTopicId] || [];

        const dialogueText = document.getElementById('vnDialogueText');

        if (msgs.length === 0) {
            if (dialogueText) dialogueText.innerHTML = '<em>Historia vacía. Haz clic en 💬 Responder para comenzar.</em>';
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
                    `<img src="${escapeHtml(msg.charAvatar)}" style="width:100%;height:100%;object-fit:cover;" onerror="this.style.display='none'; this.parentElement.textContent='${(msg.charName || '?')[0]}'">` :
                    (msg.charName || '?')[0];
            }
        } else {
            if (namePlate) {
                namePlate.textContent = msg.charName;
                namePlate.style.background = msg.charColor || 'var(--accent-wood)';
            }
            if (avatarBox) {
                avatarBox.innerHTML = msg.charAvatar ?
                    `<img src="${escapeHtml(msg.charAvatar)}" style="width:100%;height:100%;object-fit:cover;" onerror="this.style.display='none'; this.parentElement.textContent='${msg.charName[0]}'">` :
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

    function updateSprites(currentMsg, activeEmote = null) {
        const container = document.getElementById('vnSpriteContainer');
        if (!container) return;

        const msgs = appData.messages[currentTopicId] || [];
        const isFanfic = isFanficMode();

        // En modo fanfic, mantener hasta 3 sprites persistentes
        // En modo rol, mostrar solo el personaje actual (comportamiento clásico)

        let charsToShow = [];

        if (isFanfic) {
            // Modo fanfic: hasta 3 sprites persistentes por orden de actividad
            const recentChars = [];
            const seen = new Set();
            const activityOrder = new Map();

            // Recorrer mensajes recientes para determinar actividad
            for (let i = msgs.length - 1; i >= 0 && seen.size < 5; i--) {
                const m = msgs[i];
                if (m.characterId && m.charSprite && !seen.has(m.characterId)) {
                    const charExists = appData.characters.find(c => c.id === m.characterId);
                    if (charExists) {
                        seen.add(m.characterId);
                        activityOrder.set(m.characterId, i);
                        recentChars.push(m);
                    }
                }
            }

            // Tomar los 3 más recientes
            charsToShow = recentChars.slice(0, 3);

            // Ordenar por posición (izquierda, centro, derecha) basado en orden de aparición
            // El más reciente en centro, los anteriores en lados
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
        } else {
            // Modo rol: solo el personaje actual habla
            if (currentMsg.characterId && currentMsg.charSprite) {
                const charExists = appData.characters.find(c => c.id === currentMsg.characterId);
                if (charExists) {
                    currentMsg.position = 'center';
                    charsToShow.push(currentMsg);
                }
            }
        }

        if (charsToShow.length === 0) {
            container.innerHTML = '';
            return;
        }

        // Renderizar sprites
        container.innerHTML = charsToShow.map((char) => {
            const isCurrent = char.characterId === currentMsg.characterId;
            const position = char.position || 'center';

            return `
                <div class="vn-sprite position-${position} ${isCurrent ? 'active' : 'inactive'}" data-char-id="${char.characterId}">
                    <img src="${escapeHtml(char.charSprite)}" alt="${escapeHtml(char.charName)}" onerror="this.style.display='none'; this.parentElement.style.display='none'">
                    ${(isCurrent && activeEmote) ? `<div class="manga-emote emote-${activeEmote}">${emoteConfig[activeEmote]?.symbol || ''}</div>` : ''}
                </div>
            `;
        }).join('');
    }

    function typeWriter(text, element) {
        stopTypewriter();

        isTyping = true;
        element.innerHTML = '';

        const indicator = document.getElementById('vnContinueIndicator');
        if (indicator) indicator.style.opacity = '0';

        const hasHtml = /<[^>]*>/g.test(text);

        if (hasHtml) {
            element.innerHTML = text;
            element.style.opacity = '0';
            element.style.transition = 'opacity 0.3s';
            setTimeout(() => {
                element.style.opacity = '1';
                isTyping = false;
                if (indicator) indicator.style.opacity = '1';
            }, 100);
        } else {
            let i = 0;
            typewriterInterval = setInterval(() => {
                if (i < text.length) {
                    element.innerHTML += text.charAt(i);
                    i++;
                } else {
                    stopTypewriter();
                    if (indicator) indicator.style.opacity = '1';
                }
            }, textSpeed);
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

        const msgs = appData.messages[currentTopicId] || [];

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

    // ============================================
    // EDICIÓN DE MENSAJES
    // ============================================
    function editCurrentMessage() {
        const msgs = appData.messages[currentTopicId] || [];
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

        const msgs = appData.messages[currentTopicId] || [];
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

        const msgs = appData.messages[currentTopicId] || [];
        const currentMsg = msgs[currentMessageIndex];

        if (!options || options.length === 0 || isFanficMode()) {
            container.classList.remove('active');
            return;
        }

        container.innerHTML = options.map((opt, idx) => `
            <button class="vn-option-btn ${currentMsg.selectedOptionIndex === idx ? 'chosen' : ''}"
                    onclick="selectOption(${idx})"
                    ${currentMsg.selectedOptionIndex !== undefined ? 'disabled' : ''}>
                ${escapeHtml(opt.text)}
            </button>
        `).join('');

        container.classList.add('active');
    }

    function selectOption(idx) {
        const msgs = appData.messages[currentTopicId] || [];
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

            if (!appData.messages[currentTopicId]) appData.messages[currentTopicId] = [];
            appData.messages[currentTopicId].push(newMsg);
            hasUnsavedChanges = true;
            save();
        }

        const optionsContainer = document.getElementById('vnOptionsContainer');
        if (optionsContainer) optionsContainer.classList.remove('active');

        const optionsIndicator = document.getElementById('messageHasOptions');
        if (optionsIndicator) optionsIndicator.classList.add('hidden');

        currentMessageIndex = appData.messages[currentTopicId].length - 1;
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
    function openHistoryLog() {
        const msgs = appData.messages[currentTopicId] || [];
        const container = document.getElementById('historyContent');

        if (!container) return;

        if (msgs.length === 0) {
            container.innerHTML = '<div style="text-align: center; color: var(--text-muted); padding: 2rem;">No hay mensajes en esta historia.</div>';
        } else {
            container.innerHTML = msgs.map((msg, idx) => {
                const isNarrator = msg.isNarrator || !msg.characterId;
                const speaker = isNarrator ? 'Narrador' : msg.charName;
                const date = new Date(msg.timestamp).toLocaleString();
                const edited = msg.edited ? ' (editado)' : '';
                const optionResult = msg.isOptionResult ? ' [Respuesta elegida]' : '';

                return `
                    <div class="history-entry ${isNarrator ? 'narrator' : ''} ${msg.isOptionResult ? 'option-result' : ''}">
                        <div class="history-speaker">
                            ${msg.charAvatar && !isNarrator ? `<img src="${escapeHtml(msg.charAvatar)}" style="width: 35px; height: 35px; border-radius: 50%; object-fit: cover; border: 2px solid var(--accent-gold);">` : ''}
                            ${escapeHtml(speaker)}${edited}${optionResult}
                        </div>
                        <div class="history-text">${formatText(msg.text)}</div>
                        <div class="history-timestamp">${date} • Mensaje ${idx + 1}</div>
                    </div>
                `;
            }).join('');
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

        const currentChar = mine.find(c => c.id === selectedCharId) || mine[0];
        if (!currentChar) return;

        selectedCharId = currentChar.id;

        if (currentChar.avatar) {
            display.innerHTML = `<img src="${escapeHtml(currentChar.avatar)}" onerror="this.style.display='none'; this.parentElement.innerHTML='<div class=\\'placeholder\\'>${currentChar.name[0]}</div>'">`;
        } else {
            display.innerHTML = `<div class="placeholder">${currentChar.name[0]}</div>`;
        }
        nameEl.textContent = currentChar.name;

        if (grid) {
            grid.innerHTML = mine.map(c => `
                <div class="char-grid-item ${c.id === selectedCharId ? 'selected' : ''}" onclick="selectCharFromGrid('${c.id}')">
                    ${c.avatar ?
                        `<img src="${escapeHtml(c.avatar)}" onerror="this.style.display='none'; this.parentElement.innerHTML='<div class=\\'placeholder\\'>${c.name[0]}</div>'">` :
                        `<div class="placeholder">${c.name[0]}</div>`
                    }
                </div>
            `).join('');
        }
    }

    function selectCharFromGrid(charId) {
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

        if(!appData.messages[currentTopicId]) appData.messages[currentTopicId] = [];

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

        appData.messages[currentTopicId].push(newMsg);

        hasUnsavedChanges = true;
        save();
        closeReplyPanel();
        currentMessageIndex = appData.messages[currentTopicId].length - 1;
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
            const msgs = appData.messages[t.id] || [];
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
        Object.values(appData.messages).forEach(msgs => {
            if (Array.isArray(msgs)) {
                msgCount += msgs.filter(m => m.userIndex === currentUserIndex).length;
            }
        });

        if (statMsgs) statMsgs.textContent = msgCount;
    }

    function createTopic() {
        const titleInput = document.getElementById('topicTitleInput');
        const charSelect = document.getElementById('topicCharSelect');
        const firstMsgInput = document.getElementById('topicFirstMsg');
        const bgInput = document.getElementById('topicBackgroundInput');
        const weatherInput = document.getElementById('topicWeatherInput');
        const startAsNarrator = document.getElementById('startAsNarrator');

        const title = titleInput?.value.trim();
        const text = firstMsgInput?.value.trim();
        const bg = bgInput?.value.trim();
        const weather = weatherInput?.value || 'none';
        const asNarrator = startAsNarrator?.checked || false;

        if(!title || !text) { alert('Completa todos los campos obligatorios'); return; }

        let charId = null;
        let char = null;

        if (!asNarrator && currentTopicMode === 'roleplay') {
            charId = charSelect?.value;
            if (!charId) { alert('Selecciona un protagonista o activa modo narrador'); return; }
            char = appData.characters.find(c => c.id === charId);
            if (!char) { alert('El personaje seleccionado ya no existe'); return; }
        }

        const id = Date.now().toString();
        appData.topics.push({
            id,
            title,
            background: bg || null,
            weather: weather !== 'none' ? weather : undefined,
            mode: currentTopicMode,
            createdBy: userNames[currentUserIndex] || 'Jugador',
            createdByIndex: currentUserIndex,
            date: new Date().toLocaleDateString()
        });

        appData.messages[id] = [{
            id: Date.now().toString(),
            characterId: asNarrator ? null : charId,
            charName: asNarrator ? 'Narrador' : char.name,
            charColor: asNarrator ? null : char.color,
            charAvatar: asNarrator ? null : char.avatar,
            charSprite: asNarrator ? null : char.sprite,
            text,
            isNarrator: asNarrator,
            userIndex: currentUserIndex,
            timestamp: new Date().toISOString(),
            weather: weather !== 'none' ? weather : undefined
        }];

        hasUnsavedChanges = true;
        save();
        closeModal('topicModal');
        renderTopics();
        enterTopic(id);
    }

    function updateTopicSelect() {
        const mine = appData.characters.filter(c => c.userIndex === currentUserIndex);
        const select = document.getElementById('topicCharSelect');
        if (!select) return;

        select.innerHTML = mine.length ? mine.map(c => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join('') : '<option value="">Crea un personaje primero</option>';
    }

    // ============================================
