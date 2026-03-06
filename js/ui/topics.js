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
let _topicsFilter = 'all';
let _topicsSearch = '';

function setTopicFilter(filter, btn) {
    _topicsFilter = filter;
    document.querySelectorAll('.topic-filter-btn').forEach(b => b.classList.remove('active'));
    if (btn) btn.classList.add('active');
    renderTopics();
}

// Debounce timer para búsqueda de historias
let _filterTopicsTimer = null;

function filterTopics() {
    clearTimeout(_filterTopicsTimer);
    _filterTopicsTimer = setTimeout(function() {
        const input = document.getElementById('topicsSearch');
        _topicsSearch = (input?.value || '').toLowerCase().trim();
        renderTopics();
    }, 180);
}

function renderTopics() {
    const container = document.getElementById('topicsList');
    if (!container) return;

    let topics = appData.topics;

    // Aplicar filtro de modo
    if (_topicsFilter === 'rpg') {
        topics = topics.filter(t => t.mode === 'rpg' || t.mode === 'fanfic');
    } else if (_topicsFilter === 'roleplay') {
        topics = topics.filter(t => t.mode === 'roleplay' || !t.mode);
    }

    // Aplicar búsqueda
    if (_topicsSearch) {
        topics = topics.filter(t =>
            (t.title || '').toLowerCase().includes(_topicsSearch) ||
            (t.createdBy || '').toLowerCase().includes(_topicsSearch)
        );
    }

    if (appData.topics.length === 0) {
        container.innerHTML = '<div class="topics-empty">No hay historias todavía.<br><span>Crea la primera con el botón de arriba.</span></div>';
    } else if (topics.length === 0) {
        container.innerHTML = '<div class="topics-empty">No hay historias que coincidan.<br><span>Prueba con otro filtro o búsqueda.</span></div>';
    } else {
        container.innerHTML = topics.map(t => {
            // Usar mensajes en memoria si están cargados, evitar cargar desde storage en cada render
            const msgs = Array.isArray(appData.messages[t.id]) ? appData.messages[t.id] : [];
            const last = msgs[msgs.length - 1];
            const lastText = last ? stripHtml(formatText(last.text)).substring(0, 80) : '';
            const isRol    = t.mode === 'rpg' || t.mode === 'fanfic';
            const modeLabel = isRol ? 'Modo RPG' : 'Modo Clásico';
            const weatherBadge = t.weather === 'rain'
                ? '<span class="topic-badge weather">🌧 Lluvia</span>'
                : t.weather === 'fog'
                ? '<span class="topic-badge weather">🌫 Niebla</span>'
                : '';

            // SVG de ornamento de esquina — acero para RPG, tinta sepia para Clásico
            const cornerColor = isRol ? 'rgba(190,165,120,0.6)' : 'rgba(139,100,55,0.45)';
            const cornerSvg = `<svg width="22" height="22" viewBox="0 0 22 22" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M2 11 L2 2 L11 2" stroke="${cornerColor}" stroke-width="1.3" fill="none" stroke-linecap="round"/>
                <circle cx="2" cy="2" r="1.8" fill="${cornerColor}"/>
                <path d="M6 2 L6 4.5 M2 6 L4.5 6" stroke="${cornerColor}" stroke-width="0.9" opacity="0.6"/>
            </svg>`;

            // SVG de marca de agua — escudo para RPG, libro para Clásico
            const watermarkColor = isRol ? 'rgba(210,185,145,1)' : 'rgba(160,115,55,1)';
            const watermarkSvg = isRol
                ? `<svg viewBox="0 0 80 90" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M40 5 L72 18 L72 45 C72 63 57 78 40 85 C23 78 8 63 8 45 L8 18 Z" stroke="${watermarkColor}" stroke-width="2.5" fill="none"/>
                    <path d="M40 5 L72 18 L72 45 C72 63 57 78 40 85 C23 78 8 63 8 45 L8 18 Z" fill="${watermarkColor}" fill-opacity="0.06"/>
                    <line x1="40" y1="18" x2="40" y2="72" stroke="${watermarkColor}" stroke-width="1.5"/>
                    <line x1="12" y1="38" x2="68" y2="38" stroke="${watermarkColor}" stroke-width="1.5"/>
                    <circle cx="40" cy="38" r="7" stroke="${watermarkColor}" stroke-width="1.5" fill="none"/>
                    <path d="M26 24 L40 18 L54 24" stroke="${watermarkColor}" stroke-width="1" fill="none" opacity="0.6"/>
                  </svg>`
                : `<svg viewBox="0 0 90 75" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M45 10 C35 6 18 8 8 14 L8 68 C18 62 35 60 45 64 C55 60 72 62 82 68 L82 14 C72 8 55 6 45 10 Z" stroke="${watermarkColor}" stroke-width="2" fill="none"/>
                    <line x1="45" y1="10" x2="45" y2="64" stroke="${watermarkColor}" stroke-width="1.5"/>
                    <line x1="16" y1="28" x2="40" y2="28" stroke="${watermarkColor}" stroke-width="1" opacity="0.5"/>
                    <line x1="16" y1="36" x2="40" y2="36" stroke="${watermarkColor}" stroke-width="1" opacity="0.5"/>
                    <line x1="16" y1="44" x2="38" y2="44" stroke="${watermarkColor}" stroke-width="1" opacity="0.5"/>
                    <line x1="50" y1="28" x2="74" y2="28" stroke="${watermarkColor}" stroke-width="1" opacity="0.5"/>
                    <line x1="50" y1="36" x2="74" y2="36" stroke="${watermarkColor}" stroke-width="1" opacity="0.5"/>
                    <line x1="50" y1="44" x2="72" y2="44" stroke="${watermarkColor}" stroke-width="1" opacity="0.5"/>
                  </svg>`;

            // Personaje principal si tiene roleCharacterId
            let charAvatarHtml = '';
            if (t.roleCharacterId) {
                const char = appData.characters.find(c => String(c.id) === String(t.roleCharacterId));
                if (char && char.avatar) {
                    charAvatarHtml = `<img src="${escapeHtml(char.avatar)}" class="topic-card-char-avatar" alt="${escapeHtml(char.name)}">`;
                }
            }

            const msgWord = msgs.length === 1 ? 'mensaje' : 'mensajes';

            return `
                <div class="topic-card ${isRol ? 'topic-card--rol' : 'topic-card--historia'}" onclick="enterTopic('${t.id}')">
                    <div class="topic-card-accent"></div>
                    <div class="topic-card-watermark">${watermarkSvg}</div>
                    <span class="topic-card-corner topic-card-corner--tl">${cornerSvg}</span>
                    <span class="topic-card-corner topic-card-corner--tr">${cornerSvg}</span>
                    <span class="topic-card-corner topic-card-corner--bl">${cornerSvg}</span>
                    <span class="topic-card-corner topic-card-corner--br">${cornerSvg}</span>
                    <div class="topic-card-inner">
                        <div class="topic-card-top">
                            <div class="topic-card-badges">
                                <span class="topic-badge mode">${modeLabel}</span>
                                ${weatherBadge}
                            </div>
                        </div>
                        <h3 class="topic-card-title">${escapeHtml(t.title)}</h3>
                        <p class="topic-card-author">por ${escapeHtml(t.createdBy)}</p>
                        ${lastText ? `<p class="topic-card-excerpt">"${escapeHtml(lastText)}${lastText.length >= 80 ? '…' : ''}"</p>` : '<p class="topic-card-excerpt topic-card-excerpt--empty">Sin mensajes aún.</p>'}
                    </div>
                    <div class="topic-card-footer">
                        <span class="topic-card-footer-msgs">
                            <span class="topic-card-footer-msgs-icon">${isRol ? '⚔' : '✦'}</span>
                            ${msgs.length} ${msgWord}
                        </span>
                        ${charAvatarHtml}
                    </div>
                </div>
            `;
        }).join('');
    }

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

function generateTopicId() {
    if (globalThis.crypto && typeof globalThis.crypto.randomUUID === 'function') {
        return globalThis.crypto.randomUUID();
    }
    return `${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function normalizeRoomId(value) {
    const raw = String(value || '').trim();
    if (!raw || raw.length > 128) return '';
    return /^[A-Za-z0-9_-]+$/.test(raw) ? raw : '';
}

function getRoomIdFromQuery() {
    try {
        const room = new URLSearchParams(window.location.search).get('room');
        return normalizeRoomId(room);
    } catch {
        return '';
    }
}

function ensureTopicByRoomId(roomId) {
    const normalizedRoomId = normalizeRoomId(roomId);
    if (!normalizedRoomId) return null;

    let topic = appData.topics.find(t => String(t.id) === normalizedRoomId);
    if (topic) return topic;

    topic = {
        id: normalizedRoomId,
        title: `Sala ${normalizedRoomId.slice(0, 8)}`,
        background: DEFAULT_TOPIC_BACKGROUND,
        mode: 'roleplay',
        roleCharacterId: null,
        createdBy: userNames[currentUserIndex] || 'Jugador',
        createdByIndex: currentUserIndex,
        date: new Date().toLocaleDateString()
    };

    appData.topics.push(topic);
    if (typeof markDirty === 'function') markDirty('topics'); // Fix 9
    appData.messages[normalizedRoomId] = Array.isArray(appData.messages[normalizedRoomId])
        ? appData.messages[normalizedRoomId]
        : [];

    hasUnsavedChanges = true;
    save({ silent: true });
    renderTopics();
    return topic;
}

function copyCurrentRoomCode() {
    if (!currentTopicId) return;
    const roomCode = String(currentTopicId);

    const onSuccess = () => showAutosave('Código de sala copiado', 'saved');
    const onFailure = () => showAutosave('No se pudo copiar el código', 'error');

    if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
        navigator.clipboard.writeText(roomCode).then(onSuccess).catch(onFailure);
        return;
    }

    try {
        const fallback = document.createElement('textarea');
        fallback.value = roomCode;
        fallback.setAttribute('readonly', 'readonly');
        fallback.style.position = 'fixed';
        fallback.style.opacity = '0';
        document.body.appendChild(fallback);
        fallback.select();
        const ok = document.execCommand('copy');
        document.body.removeChild(fallback);
        if (ok) onSuccess();
        else onFailure();
    } catch {
        onFailure();
    }
}

function updateRoomCodeUI(topicId) {
    const wrap = document.getElementById('roomCodeWrap');
    const valueEl = document.getElementById('roomCodeValue');
    if (!wrap || !valueEl) return;

    if (!topicId) {
        wrap.style.display = 'none';
        valueEl.textContent = '';
        return;
    }

    // Mostrar código de sala siempre — útil en ambos modos para colaborar
    valueEl.textContent = String(topicId);
    wrap.style.display = 'flex';
}

async function tryJoinRoomFromUrl() {
    const roomId = pendingRoomInviteId || getRoomIdFromQuery();
    if (!roomId) return false;

    pendingRoomInviteId = null;
    const topic = ensureTopicByRoomId(roomId);
    if (!topic) return false;

    if (typeof showSection === 'function') {
        showSection('topics');
    } else {
        const topicsSection = document.getElementById('topicsSection');
        if (topicsSection) topicsSection.classList.add('active');
    }

    enterTopic(topic.id);
    return true;
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

    const id = generateTopicId();
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
        id: (globalThis.crypto && typeof globalThis.crypto.randomUUID === 'function')
            ? globalThis.crypto.randomUUID()
            : `${Date.now()}_${Math.random().toString(16).slice(2)}`,
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
        openRoleCharacterModal(id, { mode: 'roleplay', preservePendingTopicId: true, enterOnSelect: true });
    } else {
        enterTopic(id);
    }
  
}

// ============================================
