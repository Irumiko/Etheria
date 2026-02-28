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
