const Topics = {
    render() {
        const container = document.getElementById('topicsList');
        if (!container) return;

        const topics = Data.state.appData.topics;
        
        if (topics.length === 0) {
            container.innerHTML = '<div style="grid-column: 1 / -1; text-align: center; padding: 3rem;">No hay historias. ¡Crea una!</div>';
            return;
        }

        container.innerHTML = topics.map(t => this.renderTopicCard(t)).join('');
        this.updateStats();
    },

    renderTopicCard(t) {
        const msgs = Data.getMessages(t.id);
        const last = msgs[msgs.length - 1];
        const lastText = last ? TextUtils.stripHtml(TextUtils.formatText(last.text)).substring(0, 50) : '';
        const modeIcon = t.mode === 'fanfic' ? '📖' : '🎭';
        const modeText = t.mode === 'fanfic' ? 'Fanfic' : 'Rol';

        return `
            <div class="topic-card" onclick="VN.enter('${t.id}')">
                <div class="topic-header">
                    <h3>${TextUtils.escapeHtml(t.title)}</h3>
                    <span class="topic-count">${msgs.length}</span>
                </div>
                <div class="topic-badges">
                    <span class="badge mode">${modeIcon} ${modeText}</span>
                    ${t.weather ? `<span class="badge weather">${t.weather === 'rain' ? '🌧️' : '🌫️'}</span>` : ''}
                </div>
                <p class="topic-author">Por ${TextUtils.escapeHtml(t.createdBy)}</p>
                ${last ? `<p class="topic-preview">"${TextUtils.escapeHtml(lastText)}..."</p>` : ''}
            </div>
        `;
    },

    updateStats() {
        const userTopics = Data.state.appData.topics.filter(t => t.createdByIndex === Data.state.currentUserIndex).length;
        
        let msgCount = 0;
        Object.values(Data.state.appData.messages).forEach(msgs => {
            if (Array.isArray(msgs)) {
                msgCount += msgs.filter(m => m.userIndex === Data.state.currentUserIndex).length;
            }
        });

        const statTopics = document.getElementById('statTopics');
        const statMsgs = document.getElementById('statMsgs');
        
        if (statTopics) statTopics.textContent = userTopics;
        if (statMsgs) statMsgs.textContent = msgCount;
    },

    updateCharacterSelect() {
        const mine = Data.getUserCharacters();
        const select = document.getElementById('topicCharSelect');
        if (!select) return;

        if (mine.length === 0) {
            select.innerHTML = '<option value="">Crea un personaje primero</option>';
        } else {
            select.innerHTML = mine.map(c => `<option value="${c.id}">${TextUtils.escapeHtml(c.name)}</option>`).join('');
        }
    },

    updateModeUI() {
        const modeRadios = document.getElementsByName('topicMode');
        let selectedMode = 'roleplay';
        
        for (const radio of modeRadios) {
            if (radio.checked) {
                selectedMode = radio.value;
                break;
            }
        }

        const charSelectGroup = document.getElementById('topicCharSelectGroup');
        const startAsNarrator = document.getElementById('startAsNarrator');

        if (selectedMode === 'fanfic') {
            if (charSelectGroup) charSelectGroup.style.display = 'none';
        } else {
            if (charSelectGroup) charSelectGroup.style.display = 'block';
        }
    },

    create() {
        const titleInput = document.getElementById('topicTitleInput');
        const charSelect = document.getElementById('topicCharSelect');
        const firstMsgInput = document.getElementById('topicFirstMsg');
        const bgInput = document.getElementById('topicBackgroundInput');
        const weatherInput = document.getElementById('topicWeatherInput');
        const startAsNarrator = document.getElementById('startAsNarrator');
        const modeRadios = document.getElementsByName('topicMode');

        const title = titleInput?.value.trim();
        const text = firstMsgInput?.value.trim();
        const bg = bgInput?.value.trim();
        const weather = weatherInput?.value || 'none';
        const asNarrator = startAsNarrator?.checked || false;
        
        let mode = 'roleplay';
        for (const radio of modeRadios) {
            if (radio.checked) {
                mode = radio.value;
                break;
            }
        }

        if (!title || !text) {
            alert('Completa todos los campos obligatorios');
            return;
        }

        let charId = null;
        let char = null;

        if (!asNarrator && mode === 'roleplay') {
            charId = charSelect?.value;
            if (!charId) {
                alert('Selecciona un protagonista o activa modo narrador');
                return;
            }
            char = Data.getCharacter(charId);
            if (!char) {
                alert('El personaje seleccionado ya no existe');
                return;
            }
        }

        const id = Date.now().toString();
        
        Data.state.appData.topics.push({
            id,
            title,
            background: bg || null,
            weather: weather !== 'none' ? weather : undefined,
            mode,
            createdBy: Data.getCurrentUserName(),
            createdByIndex: Data.state.currentUserIndex,
            date: new Date().toLocaleDateString()
        });

        Data.state.appData.messages[id] = [{
            id: Date.now().toString(),
            characterId: asNarrator ? null : charId,
            charName: asNarrator ? 'Narrador' : char.name,
            charColor: asNarrator ? null : char.color,
            charAvatar: asNarrator ? null : char.avatar,
            charSprite: asNarrator ? null : char.sprite,
            text,
            isNarrator: asNarrator,
            userIndex: Data.state.currentUserIndex,
            timestamp: new Date().toISOString(),
            weather: weather !== 'none' ? weather : undefined
        }];

        Data.state.hasUnsavedChanges = true;
        Storage.save();
        Modals.close('topicModal');
        this.render();
        VN.enter(id);
    }
};
