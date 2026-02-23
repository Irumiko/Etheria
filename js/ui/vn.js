const VN = {
    typewriterInterval: null,

    init() {
        this.setupElements();
    },

    setupElements() {
        // Cache DOM elements
        this.els = {
            section: document.getElementById('vnSection'),
            dialogueBox: document.querySelector('.vn-dialogue-box'),
            speakerPlate: document.getElementById('vnSpeakerPlate'),
            speakerAvatar: document.getElementById('vnSpeakerAvatar'),
            dialogueText: document.getElementById('vnDialogueText'),
            continueIndicator: document.getElementById('vnContinueIndicator'),
            messageCounter: document.getElementById('vnMessageCounter'),
            spriteContainer: document.getElementById('vnSpriteContainer'),
            optionsContainer: document.getElementById('vnOptionsContainer'),
            infoCard: document.getElementById('vnInfoCard'),
            replyPanel: document.getElementById('vnReplyPanel')
        };
    },

    enter(topicId) {
        Data.state.currentTopicId = topicId;
        Data.state.currentMessageIndex = 0;
        Data.state.pendingContinuation = null;
        Data.state.editingMessageId = null;

        const topic = Data.getTopic(topicId);
        if (!topic) return;

        // Set weather
        Weather.set(topic.weather || 'none');

        // Setup background
        if (this.els.section) {
            this.els.section.style.backgroundImage = topic.background 
                ? `url(${TextUtils.escapeHtml(topic.background)})` 
                : 'linear-gradient(135deg, #1a1815 0%, #2d2a26 100%)';
            
            // Set sprite mode
            this.els.section.classList.toggle('classic-mode', topic.mode !== 'fanfic');
        }

        // Show/hide delete button
        const deleteBtn = document.getElementById('deleteTopicBtn');
        if (deleteBtn) {
            deleteBtn.classList.toggle('hidden', topic.createdByIndex !== Data.state.currentUserIndex);
        }

        // Switch views
        document.querySelectorAll('.game-section').forEach(s => s.classList.remove('active'));
        if (this.els.section) this.els.section.classList.add('active');

        this.showCurrentMessage();
    },

    showCurrentMessage() {
        const msgs = Data.getMessages(Data.state.currentTopicId);
        
        if (msgs.length === 0) {
            if (this.els.dialogueText) {
                this.els.dialogueText.innerHTML = '<em>Historia vacía. Haz clic en 💬 Responder para comenzar.</em>';
            }
            this.updateAffinityDisplay();
            return;
        }

        // Validate index
        if (Data.state.currentMessageIndex >= msgs.length) {
            Data.state.currentMessageIndex = msgs.length - 1;
        }
        if (Data.state.currentMessageIndex < 0) {
            Data.state.currentMessageIndex = 0;
        }

        const msg = msgs[Data.state.currentMessageIndex];
        const { emotes, text: cleanText } = Emotes.parse(msg.text);
        const activeEmote = emotes[0] || null;

        // Update sprites
        this.updateSprites(msg, activeEmote);

        // Update speaker info
        this.updateSpeakerInfo(msg, activeEmote);

        // Typewriter effect
        if (this.els.dialogueText) {
            this.typeWriter(TextUtils.formatText(cleanText), this.els.dialogueText);
        }

        // Update counter
        if (this.els.messageCounter) {
            this.els.messageCounter.textContent = `${Data.state.currentMessageIndex + 1} / ${msgs.length}`;
        }

        // Show options if last message
        const hasOptions = msg.options?.length > 0 && msg.selectedOptionIndex === undefined;
        const optionsIndicator = document.getElementById('messageHasOptions');
        if (optionsIndicator) {
            optionsIndicator.classList.toggle('hidden', !hasOptions || this.isFanficMode());
        }

        if (Data.state.currentMessageIndex === msgs.length - 1 && hasOptions && !this.isFanficMode()) {
            Options.show(msg.options);
        } else {
            if (this.els.optionsContainer) this.els.optionsContainer.classList.remove('active');
        }

        this.updateAffinityDisplay();
    },

    updateSpeakerInfo(msg, activeEmote) {
        const char = msg.characterId ? Data.getCharacter(msg.characterId) : null;
        const charExists = !!char;

        if (msg.isNarrator || !msg.characterId) {
            this.setSpeaker('Narrador', null, '📖', 'linear-gradient(135deg, #4a4540, #2a2724)');
        } else if (!charExists) {
            this.setSpeaker(
                msg.charName || 'Desconocido',
                msg.charAvatar,
                (msg.charName || '?')[0],
                msg.charColor || 'var(--accent-wood)'
            );
        } else {
            this.setSpeaker(
                msg.charName,
                msg.charAvatar,
                msg.charName[0],
                msg.charColor || 'var(--accent-wood)'
            );
        }

        // Show emote on avatar if no sprite
        if (activeEmote && !msg.charSprite) {
            Emotes.showOnAvatar(activeEmote);
        }
    },

    setSpeaker(name, avatar, fallback, color) {
        if (this.els.speakerPlate) {
            this.els.speakerPlate.textContent = name;
            this.els.speakerPlate.style.background = color;
        }

        if (this.els.speakerAvatar) {
            if (avatar) {
                this.els.speakerAvatar.innerHTML = `<img src="${TextUtils.escapeHtml(avatar)}" style="width:100%;height:100%;object-fit:cover;" onerror="this.style.display='none';this.parentElement.textContent='${fallback}'">`;
            } else {
                this.els.speakerAvatar.textContent = fallback;
            }
        }
    },

    updateSprites(currentMsg, activeEmote) {
        if (!this.els.spriteContainer) return;

        const msgs = Data.getMessages(Data.state.currentTopicId);
        const isFanfic = this.isFanficMode();
        let charsToShow = [];

        if (isFanfic) {
            // Fanfic mode: up to 3 persistent sprites
            const seen = new Set();
            const recentChars = [];
            
            for (let i = msgs.length - 1; i >= 0 && seen.size < 5; i--) {
                const m = msgs[i];
                if (m.characterId && m.charSprite && !seen.has(m.characterId)) {
                    const char = Data.getCharacter(m.characterId);
                    if (char) {
                        seen.add(m.characterId);
                        recentChars.push(m);
                    }
                }
            }

            charsToShow = recentChars.slice(0, 3);
            
            // Assign positions
            const positions = ['center', 'left', 'right'];
            charsToShow.forEach((char, idx) => {
                char.position = positions[Math.min(idx, positions.length - 1)];
                if (charsToShow.length === 2 && idx === 1) char.position = 'right';
            });
        } else {
            // Roleplay mode: only current speaker
            if (currentMsg.characterId && currentMsg.charSprite) {
                const char = Data.getCharacter(currentMsg.characterId);
                if (char) {
                    currentMsg.position = 'center';
                    charsToShow.push(currentMsg);
                }
            }
        }

        this.renderSprites(charsToShow, currentMsg, activeEmote);
    },

    renderSprites(charsToShow, currentMsg, activeEmote) {
        if (charsToShow.length === 0) {
            this.els.spriteContainer.innerHTML = '';
            return;
        }

        this.els.spriteContainer.innerHTML = charsToShow.map(char => {
            const isCurrent = char.characterId === currentMsg.characterId;
            const position = char.position || 'center';
            
            return `
                <div class="vn-sprite position-${position} ${isCurrent ? 'active' : 'inactive'}" data-char-id="${char.characterId}">
                    <img src="${TextUtils.escapeHtml(char.charSprite)}" alt="${TextUtils.escapeHtml(char.charName)}" onerror="this.style.display='none';this.parentElement.style.display='none'">
                    ${(isCurrent && activeEmote) ? `<div class="manga-emote emote-${activeEmote}">${Data.emoteConfig[activeEmote]?.symbol || ''}</div>` : ''}
                </div>
            `;
        }).join('');
    },

    typeWriter(text, element) {
        this.stopTypewriter();
        
        Data.state.isTyping = true;
        element.innerHTML = '';
        
        if (this.els.continueIndicator) {
            this.els.continueIndicator.style.opacity = '0';
        }

        const hasHtml = /<[^>]*>/g.test(text);
        
        if (hasHtml) {
            element.innerHTML = text;
            element.style.opacity = '0';
            element.style.transition = 'opacity 0.3s';
            setTimeout(() => {
                element.style.opacity = '1';
                Data.state.isTyping = false;
                if (this.els.continueIndicator) {
                    this.els.continueIndicator.style.opacity = '1';
                }
            }, 100);
        } else {
            let i = 0;
            this.typewriterInterval = setInterval(() => {
                if (i < text.length) {
                    element.innerHTML += text.charAt(i);
                    i++;
                } else {
                    this.stopTypewriter();
                    if (this.els.continueIndicator) {
                        this.els.continueIndicator.style.opacity = '1';
                    }
                }
            }, Data.state.textSpeed);
        }
    },

    stopTypewriter() {
        if (this.typewriterInterval) {
            clearInterval(this.typewriterInterval);
            this.typewriterInterval = null;
        }
        Data.state.isTyping = false;
    },

    handleDialogueClick() {
        if (this.isPanelOpen()) return;

        const msgs = Data.getMessages(Data.state.currentTopicId);

        if (Data.state.isTyping) {
            this.skipTyping(msgs);
            return;
        }

        if (Data.state.pendingContinuation) {
            this.showContinuation(Data.state.pendingContinuation);
            Data.state.pendingContinuation = null;
            return;
        }

        if (Data.state.currentMessageIndex < msgs.length - 1) {
            Data.state.currentMessageIndex++;
            this.showCurrentMessage();
        }
    },

    skipTyping(msgs) {
        this.stopTypewriter();
        const msg = msgs[Data.state.currentMessageIndex];
        if (msg && this.els.dialogueText) {
            const { text: cleanText } = Emotes.parse(msg.text);
            this.els.dialogueText.innerHTML = TextUtils.formatText(cleanText);
        }
        if (this.els.continueIndicator) {
            this.els.continueIndicator.style.opacity = '1';
        }
    },

    isPanelOpen() {
        return UI.isPanelOpen();
    },

    previousMessage() {
        if (Data.state.currentMessageIndex > 0) {
            Data.state.currentMessageIndex--;
            this.showCurrentMessage();
        }
    },

    firstMessage() {
        Data.state.currentMessageIndex = 0;
        this.showCurrentMessage();
    },

    isFanficMode() {
        const topic = Data.getTopic(Data.state.currentTopicId);
        return topic?.mode === 'fanfic';
    },

    updateAffinityDisplay() {
        // Implementation moved to Affinity feature
        const affinityDisplay = document.getElementById('affinityDisplay');
        const infoName = document.getElementById('vnInfoName');
        const infoClub = document.getElementById('vnInfoClub');
        const infoAvatar = document.getElementById('vnInfoAvatar');

        const msgs = Data.getMessages(Data.state.currentTopicId);
        const currentMsg = msgs[Data.state.currentMessageIndex];

        // Handle narrator mode
        if (currentMsg?.isNarrator) {
            this.setInfoCard('Narrador', 'Modo historia', '📖', true);
            return;
        }

        // Handle own character
        if (currentMsg?.characterId) {
            const char = Data.getCharacter(currentMsg.characterId);
            if (char) {
                if (char.userIndex === Data.state.currentUserIndex) {
                    this.setInfoCard(char.name, char.race || 'Sin raza', char.name[0], true, char.avatar);
                    return;
                }

                // Other user's character with affinity
                const affinityValue = Affinity.getCurrentValue();
                if (affinityValue !== -1) {
                    this.setAffinityDisplay(char, affinityValue);
                    return;
                }
            }
        }

        // Default empty state
        this.setInfoCard('Sin personaje', 'Selecciona un personaje', '👤', true);
    },

    setInfoCard(name, subtitle, fallback, hideAffinity, avatar = null) {
        const affinityDisplay = document.getElementById('affinityDisplay');
        const infoName = document.getElementById('vnInfoName');
        const infoClub = document.getElementById('vnInfoClub');
        const infoAvatar = document.getElementById('vnInfoAvatar');

        if (affinityDisplay) affinityDisplay.classList.add('hidden');
        if (infoName) infoName.textContent = name;
        if (infoClub) infoClub.textContent = subtitle;
        
        if (infoAvatar) {
            if (avatar) {
                infoAvatar.innerHTML = `<img src="${TextUtils.escapeHtml(avatar)}" onerror="this.style.display='none';this.parentElement.innerHTML='<div class=\\'placeholder\\' style=\\'width:100%;height:100%;display:flex;align-items:center;justify-content:center;font-size:2rem;\\'>${fallback}</div>'">`;
            } else {
                infoAvatar.innerHTML = `<div class="placeholder" style="width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; font-size: 2rem;">${fallback}</div>`;
            }
        }
    },

    setAffinityDisplay(char, value) {
        const affinityDisplay = document.getElementById('affinityDisplay');
        const infoName = document.getElementById('vnInfoName');
        const infoClub = document.getElementById('vnInfoClub');
        const infoAvatar = document.getElementById('vnInfoAvatar');
        const rankNameEl = document.getElementById('affinityRankName');

        if (affinityDisplay) affinityDisplay.classList.remove('hidden');
        if (infoName) infoName.textContent = char.name;
        if (infoClub) infoClub.textContent = char.race || 'Sin raza';

        const rankInfo = Affinity.getRankInfo(value);
        if (rankNameEl) {
            rankNameEl.textContent = rankInfo.name;
            rankNameEl.style.color = rankInfo.color;
            rankNameEl.style.textShadow = `0 0 10px ${rankInfo.color}`;
        }

        if (infoAvatar) {
            if (char.avatar) {
                infoAvatar.innerHTML = `<img src="${TextUtils.escapeHtml(char.avatar)}" onerror="this.style.display='none';this.parentElement.innerHTML='<div class=\\'placeholder\\' style=\\'width:100%;height:100%;display:flex;align-items:center;justify-content:center;font-size:2rem;\\'>${char.name[0]}</div>'">`;
            } else {
                infoAvatar.innerHTML = `<div class="placeholder" style="width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; font-size: 2rem;">${char.name[0]}</div>`;
            }
        }
    },

    // Reply Panel
    openReplyPanel() {
        if (!this.els.replyPanel) return;
        
        this.els.replyPanel.style.display = 'flex';
        
        const isEditing = !!Data.state.editingMessageId;
        const title = isEditing ? '✏️ Editar Mensaje' : '💬 Responder';
        const btnText = isEditing ? '💾 Guardar Cambios' : 'Enviar Mensaje';
        
        const titleEl = document.getElementById('replyPanelTitle');
        const btn = document.getElementById('submitReplyBtn');
        
        if (titleEl) titleEl.textContent = title;
        if (btn) {
            btn.textContent = btnText;
            btn.onclick = isEditing ? () => this.saveEditedMessage() : () => this.postReply();
        }

        // Show/hide options based on mode
        const optionsToggle = document.getElementById('optionsToggleContainer');
        if (optionsToggle) {
            optionsToggle.style.display = this.isFanficMode() ? 'none' : 'flex';
        }

        if (!isEditing) {
            this.resetReplyForm();
        }

        CharacterSelector.update();
        Weather.updateUI('weatherSelectorContainer', Data.state.currentWeather);
    },

    closeReplyPanel() {
        if (this.els.replyPanel) {
            this.els.replyPanel.style.display = 'none';
        }
        
        const replyText = document.getElementById('vnReplyText');
        if (replyText) replyText.value = '';
        
        Data.state.isNarratorMode = false;
        Data.state.editingMessageId = null;
        Data.state.tempBranches = [];
        
        const narratorMode = document.getElementById('narratorMode');
        const charSelector = document.getElementById('charSelectorContainer');
        const narratorToggle = document.getElementById('narratorToggle');
        
        if (narratorMode) narratorMode.checked = false;
        if (charSelector) charSelector.style.display = 'flex';
        if (narratorToggle) narratorToggle.classList.remove('active');
    },

    resetReplyForm() {
        const replyText = document.getElementById('vnReplyText');
        const enableOptions = document.getElementById('enableOptions');
        const optionsFields = document.getElementById('optionsFields');
        
        if (replyText) replyText.value = '';
        if (enableOptions) enableOptions.checked = false;
        if (optionsFields) optionsFields.classList.remove('active');
        
        for (let i = 1; i <= 3; i++) {
            const textInput = document.getElementById(`option${i}Text`);
            const contInput = document.getElementById(`option${i}Continuation`);
            if (textInput) textInput.value = '';
            if (contInput) contInput.value = '';
        }
    },

    postReply() {
        const replyText = document.getElementById('vnReplyText');
        const text = replyText?.value.trim();
        
        if (!text) {
            alert('Escribe algo');
            return;
        }

        let char = null;
        if (!Data.state.isNarratorMode) {
            if (!Data.state.selectedCharId) {
                alert('Selecciona personaje');
                return;
            }
            char = Data.getCharacter(Data.state.selectedCharId);
            if (!char) {
                alert('Personaje no encontrado');
                return;
            }
        }

        // Get options if enabled
        let options = null;
        const enableOptions = document.getElementById('enableOptions');
        if (enableOptions?.checked && !this.isFanficMode()) {
            options = Options.collectFromForm();
            if (!options) return; // Validation failed
        }

        // Create message
        const newMsg = {
            id: Date.now().toString(),
            characterId: Data.state.isNarratorMode ? null : Data.state.selectedCharId,
            charName: Data.state.isNarratorMode ? 'Narrador' : char.name,
            charColor: Data.state.isNarratorMode ? null : char.color,
            charAvatar: Data.state.isNarratorMode ? null : char.avatar,
            charSprite: Data.state.isNarratorMode ? null : char.sprite,
            text,
            isNarrator: Data.state.isNarratorMode,
            userIndex: Data.state.currentUserIndex,
            timestamp: new Date().toISOString(),
            options: options || undefined,
            weather: Data.state.currentWeather !== 'none' ? Data.state.currentWeather : undefined
        };

        if (!Data.state.appData.messages[Data.state.currentTopicId]) {
            Data.state.appData.messages[Data.state.currentTopicId] = [];
        }
        
        Data.state.appData.messages[Data.state.currentTopicId].push(newMsg);
        Data.state.hasUnsavedChanges = true;
        Storage.save();
        
        this.closeReplyPanel();
        Data.state.currentMessageIndex = Data.state.appData.messages[Data.state.currentTopicId].length - 1;
        this.showCurrentMessage();
    },

    saveEditedMessage() {
        // Similar to postReply but updates existing message
        // Implementation details...
    },

    // Continuation
    showContinuation(text) {
        const contText = document.getElementById('continuationText');
        const overlay = document.getElementById('continuationOverlay');
        
        if (contText) contText.textContent = text;
        if (overlay) overlay.classList.add('active');
    },

    closeContinuation() {
        const overlay = document.getElementById('continuationOverlay');
        if (overlay) overlay.classList.remove('active');
    },

    // Navigation
    backToTopics() {
        UI.confirmUnsavedChanges(() => {
            if (this.els.spriteContainer) this.els.spriteContainer.innerHTML = '';
            this.stopTypewriter();
            
            document.querySelectorAll('.game-section').forEach(s => s.classList.remove('active'));
            document.getElementById('topicsSection')?.classList.add('active');
            
            Weather.set('none');
            Data.state.currentTopicId = null;
            Data.state.editingMessageId = null;
            Topics.render();
        });
    },

    deleteCurrentTopic() {
        if (!confirm('¿Borrar esta historia?')) return;
        
        Data.state.appData.topics = Data.state.appData.topics.filter(t => t.id !== Data.state.currentTopicId);
        delete Data.state.appData.messages[Data.state.currentTopicId];
        delete Data.state.appData.affinities[Data.state.currentTopicId];
        
        Data.state.hasUnsavedChanges = true;
        Storage.save();
        this.backToTopics();
    },

    quickSave() {
        Storage.save();
        UI.showAutosave('Guardado rápido', 'saved');
    }
};
