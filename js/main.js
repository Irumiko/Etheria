'use strict';

    // DATOS Y CONFIGURACIÓN
    // ============================================
    const alignments = {
        'LB': 'Legal Bueno', 'LN': 'Legal Neutral', 'LM': 'Legal Malvado',
        'NB': 'Neutral Bueno', 'NN': 'Neutral Neutral', 'NM': 'Neutral Malvado',
        'CB': 'Caótico Bueno', 'CN': 'Caótico Neutral', 'CM': 'Caótico Malvado'
    };

    // Sistema de rangos de afinidad - Solo nombres, sin mostrar puntos
    const affinityRanks = [
        { name: 'Desconocidos', min: 0, max: 15, increment: 5, color: '#ffffff' },
        { name: 'Conocidos', min: 16, max: 35, increment: 4, color: '#9b59b6' },
        { name: 'Amigos', min: 36, max: 60, increment: 3, color: '#3498db' },
        { name: 'Mejores Amigos', min: 61, max: 80, increment: 2, color: '#27ae60' },
        { name: 'Interés Romántico', min: 81, max: 95, increment: 1, color: '#f1c40f' },
        { name: 'Pareja', min: 96, max: 100, increment: 0.5, color: '#e74c3c' }
    ];

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

    let userNames = ['Jugador 1', 'Jugador 2', 'Jugador 3'];
    let currentUserIndex = 0;
    let appData = {
        topics: [],
        characters: [],
        messages: {},
        affinities: {}
    };
    let currentTopicId = null;
    let selectedCharId = null;
    let currentSheetCharId = null;
    let currentMessageIndex = 0;
    let isTyping = false;
    let typewriterInterval;
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
    let currentTopicMode = 'roleplay'; // 'roleplay' o 'fanfic'
    let spriteModeClassic = false; // false = modo fanfic persistente, true = modo clásico

    // ============================================
    // INICIALIZACIÓN
    // ============================================
    document.addEventListener('DOMContentLoaded', () => {
        const saved = localStorage.getItem('etheria_data');
        if (saved) {
            try {
                const parsed = JSON.parse(saved);
                appData = {
                    topics: parsed.topics || [],
                    characters: parsed.characters || [],
                    messages: parsed.messages || {},
                    affinities: (parsed.affinities && typeof parsed.affinities === 'object' && !Array.isArray(parsed.affinities))
                        ? parsed.affinities
                        : {}
                };
            } catch (e) {
                console.error('Error parsing saved data:', e);
            }
        }

        const savedNames = localStorage.getItem('etheria_user_names');
        if (savedNames) {
            try {
                userNames = JSON.parse(savedNames);
            } catch (e) {
                console.error('Error parsing user names:', e);
            }
        }

        const savedCharId = localStorage.getItem(`etheria_selected_char_${currentUserIndex}`);
        if (savedCharId) selectedCharId = savedCharId;

        const savedSpeed = localStorage.getItem('etheria_text_speed');
        if (savedSpeed) {
            textSpeed = parseInt(savedSpeed);
            const slider = document.getElementById('textSpeedSlider');
            if (slider) slider.value = 110 - textSpeed;
        }

        const savedSize = localStorage.getItem('etheria_font_size');
        if (savedSize) {
            document.documentElement.style.setProperty('--font-size-base', savedSize + 'px');
            const slider = document.getElementById('fontSizeSlider');
            if (slider) slider.value = savedSize;
        }

        const savedTheme = localStorage.getItem('etheria_theme');
        if (savedTheme) {
            document.documentElement.setAttribute('data-theme', savedTheme);
        }

        renderUserCards();

        // Setup keyboard listeners
        setupKeyboardListeners();

        window.addEventListener('beforeunload', (e) => {
            if (hasUnsavedChanges) {
                e.preventDefault();
                e.returnValue = 'Tienes cambios sin guardar. ¿Seguro que quieres salir?';
            }
        });
    });

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
                } else if (emotePicker && emotePicker.classList.contains('active')) {
                    toggleEmotePicker();
                }
            }
        });
    }

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
        document.querySelectorAll('.weather-btn').forEach(btn => {
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

    function setTopicWeather(weather, buttonEl = null) {
        document.getElementById('topicWeatherInput').value = weather;
        // Actualizar UI
        const buttons = document.querySelectorAll('#topicModal .weather-btn');
        buttons.forEach(btn => {
            btn.classList.remove('active');
            btn.style.borderColor = 'var(--border-color)';
            btn.style.background = 'rgba(255,255,255,0.05)';
            btn.style.color = 'var(--text-secondary)';
        });

        if (buttonEl) {
            buttonEl.classList.add('active');
            buttonEl.style.borderColor = 'var(--accent-gold)';
            buttonEl.style.background = 'rgba(201, 168, 108, 0.2)';
            buttonEl.style.color = 'var(--accent-gold)';
        }
    }

    function resetTopicModalState() {
        const titleInput = document.getElementById('topicTitleInput');
        const firstMsgInput = document.getElementById('topicFirstMsg');
        const bgInput = document.getElementById('topicBackgroundInput');
        const narratorCheck = document.getElementById('startAsNarrator');
        const modeRoleplay = document.getElementById('modeRoleplay');
        const normalWeatherBtn = document.querySelector('#topicModal .weather-btn');

        if (titleInput) titleInput.value = '';
        if (firstMsgInput) firstMsgInput.value = '';
        if (bgInput) bgInput.value = '';
        if (narratorCheck) narratorCheck.checked = false;
        if (modeRoleplay) modeRoleplay.checked = true;

        setTopicWeather('none', normalWeatherBtn);
        updateTopicModeUI();
        toggleNarratorStart();
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

        const charSelectGroup = document.getElementById('topicCharSelectGroup');
        const startAsNarrator = document.getElementById('startAsNarrator');

        // Actualizar estilos visuales
        const roleplayLabel = modeRoleplay?.parentElement;
        const fanficLabel = modeFanfic?.parentElement;

        if (roleplayLabel) {
            roleplayLabel.style.borderColor = selectedMode === 'roleplay' ? 'var(--accent-gold)' : 'var(--border-color)';
            roleplayLabel.style.background = selectedMode === 'roleplay' ? 'rgba(201, 168, 108, 0.1)' : 'transparent';
        }

        if (fanficLabel) {
            fanficLabel.style.borderColor = selectedMode === 'fanfic' ? 'var(--accent-gold)' : 'var(--border-color)';
            fanficLabel.style.background = selectedMode === 'fanfic' ? 'rgba(201, 168, 108, 0.1)' : 'transparent';
        }

        if (selectedMode === 'fanfic') {
            if (charSelectGroup) charSelectGroup.style.display = 'none';
        } else {
            if (charSelectGroup && !(startAsNarrator && startAsNarrator.checked)) {
                charSelectGroup.style.display = 'block';
            }
        }
    }

    function toggleNarratorStart() {
        const checkbox = document.getElementById('startAsNarrator');
        const charSelectGroup = document.getElementById('topicCharSelectGroup');

        if (checkbox.checked) {
            if (charSelectGroup) charSelectGroup.style.display = 'none';
        } else {
            if (charSelectGroup && currentTopicMode === 'roleplay') {
                charSelectGroup.style.display = 'block';
            }
        }
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

        const msgs = appData.messages[currentTopicId] || [];
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

        const msgs = appData.messages[currentTopicId] || [];
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

        const msgs = appData.messages[currentTopicId] || [];
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
                            infoAvatar.innerHTML = `<img src="${escapeHtml(char.avatar)}" onerror="this.style.display='none'; this.parentElement.innerHTML='<div class=\\'placeholder\\' style=\\'width:100%;height:100%;display:flex;align-items:center;justify-content:center;font-size:2rem;\\'>${char.name[0]}</div>'">`;
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
                            infoAvatar.innerHTML = `<img src="${escapeHtml(char.avatar)}" onerror="this.style.display='none'; this.parentElement.innerHTML='<div class=\\'placeholder\\' style=\\'width:100%;height:100%;display:flex;align-items:center;justify-content:center;font-size:2rem;\\'>${char.name[0]}</div>'">`;
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

        const msgs = appData.messages[currentTopicId] || [];
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
