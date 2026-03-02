// Gestión de historias (topics): crear, listar, entrar.
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
        showAutosave('Cada rama necesita texto y continuación', 'error');
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
        container.innerHTML = '<div class="topics-empty">No hay historias todavía.<br><span>Crea la primera con el botón de arriba.</span></div>';
        return;
    }

    container.innerHTML = appData.topics.map(t => {
        // Usar mensajes en memoria si están cargados, evitar cargar desde storage en cada render
        const msgs = Array.isArray(appData.messages[t.id]) ? appData.messages[t.id] : [];
        const last = msgs[msgs.length - 1];
        const lastText = last ? stripHtml(formatText(last.text)).substring(0, 80) : '';
        const isRol    = t.mode !== 'fanfic';
        const modeLabel = isRol ? 'Rol' : 'Historia';
        const weatherBadge = t.weather === 'rain'
            ? '<span class="topic-badge weather">🌧 Lluvia</span>'
            : t.weather === 'fog'
            ? '<span class="topic-badge weather">🌫 Niebla</span>'
            : '';

        // Personaje principal si tiene roleCharacterId
        let charAvatarHtml = '';
        if (t.roleCharacterId) {
            const char = appData.characters.find(c => String(c.id) === String(t.roleCharacterId));
            if (char && char.avatar) {
                charAvatarHtml = `<img src="${escapeHtml(char.avatar)}" class="topic-card-char-avatar" alt="${escapeHtml(char.name)}">`;
            }
        }

        return `
            <div class="topic-card ${isRol ? 'topic-card--rol' : 'topic-card--historia'}" onclick="enterTopic('${t.id}')">
                <div class="topic-card-accent"></div>
                <div class="topic-card-inner">
                    <div class="topic-card-top">
                        <div class="topic-card-badges">
                            <span class="topic-badge mode">${modeLabel}</span>
                            ${weatherBadge}
                        </div>
                        <span class="topic-card-count">${msgs.length}</span>
                    </div>
                    <h3 class="topic-card-title">${escapeHtml(t.title)}</h3>
                    <p class="topic-card-author">por ${escapeHtml(t.createdBy)}</p>
                    ${lastText ? `<p class="topic-card-excerpt">"${escapeHtml(lastText)}${lastText.length >= 80 ? '…' : ''}"</p>` : '<p class="topic-card-excerpt topic-card-excerpt--empty">Historia sin mensajes aún.</p>'}
                    ${charAvatarHtml}
                </div>
            </div>
        `;
    }).join('');

    const statTopics = document.getElementById('statTopics');
    const statMsgs = document.getElementById('statMsgs');

    if (statTopics) statTopics.textContent = appData.topics.filter(t => t.createdByIndex === currentUserIndex).length;

    let msgCount = 0;
    appData.topics.forEach((topic) => {
        // Usar solo mensajes en memoria para el conteo, sin forzar carga desde storage
        const topicMsgs = Array.isArray(appData.messages[topic.id]) ? appData.messages[topic.id] : [];
        msgCount += topicMsgs.filter(m => m.userIndex === currentUserIndex).length;
    });

    preloadTopicBackgrounds();

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

    if(!title || !text) { showAutosave('Completa todos los campos obligatorios', 'error'); return; }

    const now = Date.now();
    const id = now.toString();
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
        id: (now + 1).toString(),
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
    save({ silent: true });
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
