// Gestión de historias (topics): crear, listar, entrar.
// EDITOR DE RAMAS
// ============================================

// ── Guardia de personajes antes de abrir el modal de creación ────────────────
// Se llama desde el botón "Nueva Historia". Si el usuario no tiene personajes
// creados, muestra un aviso claro sin abrir el modal de creación.
function openNewTopicModal() {
    const mine = (appData?.characters || []).filter(c => c.userIndex === currentUserIndex);
    if (mine.length === 0) {
        openNoCharacterWarning();
        return;
    }
    openModal('topicModal');
}

function openNoCharacterWarning() {
    const modal = document.getElementById('noCharacterWarningModal');
    if (modal) {
        openModal('noCharacterWarningModal');
    } else {
        // Fallback por si el modal aún no está en el DOM
        showAutosave('Necesitas crear al menos un personaje antes de empezar una historia. Ve a Personajes ✦', 'error');
    }
}

window.openNewTopicModal    = openNewTopicModal;
window.openNoCharacterWarning = openNoCharacterWarning;

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


function formatRelativeDayLabel(dateValue) {
    if (!dateValue) return 'Sin actividad reciente';
    const date = new Date(dateValue);
    if (Number.isNaN(date.getTime())) return 'Sin actividad reciente';
    const now = new Date();
    const diffDays = Math.floor((now - date) / 86400000);
    if (diffDays <= 0) return 'Última actividad: hoy';
    if (diffDays === 1) return 'Última actividad: ayer';
    if (diffDays < 7) return `Última actividad: hace ${diffDays} días`;
    return `Última actividad: ${date.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}`;
}

function getStoryModeLabel(mode) {
    const isRol = mode === 'rpg' || mode === 'fanfic';
    return isRol ? '🎲 Modo RPG' : '🪶 Modo Clásico';
}

function normalizeCreatorName(name) {
    const trimmed = String(name || '').trim();
    if (!trimmed || /^jugador\s*\d*$/i.test(trimmed)) return 'Cronista local';
    return trimmed;
}


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
            const modeLabel = getStoryModeLabel(t.mode);
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
            const creatorName = normalizeCreatorName(t.createdBy);
            const lastActivityDate = last?.timestamp || t.createdAt || t.date || null;
            const lastActivityLabel = formatRelativeDayLabel(lastActivityDate);
            const progressCurrent = Math.min(msgs.length, 10);
            const progressPct = Math.min(100, Math.round((progressCurrent / 10) * 100));

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
                        <p class="topic-card-author">por ${escapeHtml(creatorName)}</p>
                        <p class="topic-card-excerpt topic-card-excerpt--meta">${escapeHtml(lastActivityLabel)}</p>
                        ${lastText ? `<p class="topic-card-excerpt">"${escapeHtml(lastText)}${lastText.length >= 80 ? '…' : ''}"</p>` : '<p class="topic-card-excerpt topic-card-excerpt--empty">Sin mensajes aún. <strong>Escribe el primer capítulo</strong>.</p>'}
                    </div>
                    <div class="topic-card-footer">
                        <span class="topic-card-footer-msgs">
                            <span class="topic-card-footer-msgs-icon">${isRol ? '⚔' : '✦'}</span>
                            ${msgs.length > 0 ? `${msgs.length} ${msgWord}` : '—'}
                        </span>
                        <div class="topic-card-progress" title="Progreso de introducción">
                            <div class="topic-card-progress-bar" style="width:${progressPct}%"></div>
                            <span class="topic-card-progress-text">${progressCurrent}/10</span>
                        </div>
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

async function copyCurrentRoomCode() {
    if (!currentTopicId) return;

    const topic = appData.topics.find(t => t.id === currentTopicId);
    const storyId = topic?.storyId || window.currentStoryId;

    const _doCopy = (text, label) => {
        const onSuccess = () => showAutosave(label + ' copiado', 'saved');
        const onFailure = () => showAutosave('No se pudo copiar', 'error');
        if (navigator.clipboard?.writeText) {
            navigator.clipboard.writeText(text).then(onSuccess).catch(onFailure);
        } else {
            try {
                const el = document.createElement('textarea');
                el.value = text; el.style.cssText = 'position:fixed;opacity:0';
                document.body.appendChild(el); el.select();
                const ok = document.execCommand('copy');
                document.body.removeChild(el);
                ok ? onSuccess() : onFailure();
            } catch { onFailure(); }
        }
    };

    // Si la historia está en Supabase, generar enlace de invitación real
    if (storyId && typeof SupabaseStories !== 'undefined' && window._cachedUserId) {
        showAutosave('Generando enlace...', 'info');
        const url = await SupabaseStories.generateInviteLink(storyId);
        if (url) {
            _doCopy(url, 'Enlace de invitación');
            // Actualizar el display en la UI
            const valueEl = document.getElementById('roomCodeValue');
            if (valueEl) valueEl.textContent = url.split('?invite=')[1] || url;
            return;
        }
    }

    // Fallback: copiar el ID local
    _doCopy(String(currentTopicId), 'Código de sala');
}

async function shareCurrentStory() {
    if (!currentTopicId) return;
    const topic = appData.topics.find(t => t.id === currentTopicId);
    const storyId = topic?.storyId || window.currentStoryId;

    if (!storyId || !window._cachedUserId) {
        showAutosave('Inicia sesión para compartir historias', 'error');
        return;
    }

    showAutosave('Generando enlace...', 'info');
    const url = await SupabaseStories.generateInviteLink(storyId);
    if (!url) {
        showAutosave('No se pudo generar el enlace', 'error');
        return;
    }

    // Usar Web Share API si está disponible (móvil)
    if (navigator.share) {
        try {
            await navigator.share({
                title: topic?.title || 'Historia en Etheria',
                text: '¡Únete a esta historia en Etheria!',
                url
            });
            return;
        } catch {}
    }

    // Fallback: copiar al portapapeles
    if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
        showAutosave('✓ Enlace copiado — compártelo con quien quieras unirse', 'saved');
    }
}
window.shareCurrentStory = shareCurrentStory;

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
        document.querySelectorAll('.game-section').forEach(s => s.classList.remove('active'));
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

    const genericTitles = ['prueba', 'test', 'historia', 'nueva historia'];
    if (genericTitles.includes((title || '').toLowerCase())) {
        showAutosave('Elige un título más descriptivo para la historia', 'error');
        return;
    }

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

    // ── Sincronización automática con la nube ─────────────────────
    if (typeof SupabaseStories !== 'undefined' && typeof SupabaseStories.createStory === 'function') {
        SupabaseStories.createStory(title).then(function(story) {
            if (story && story.id) {
                const t = appData.topics.find(function(tp) { return String(tp.id) === String(id); });
                if (t) {
                    t.storyId = story.id;
                    hasUnsavedChanges = true;
                    save({ silent: true });
                    global.currentStoryId = story.id;
                }
            }
        }).catch(function() {});
    }
    // Subir perfil a nube tras crear historia
    if (typeof SupabaseSync !== 'undefined') {
        SupabaseSync.uploadProfileData().catch(() => {});
    }
    // ─────────────────────────────────────────────────────────────

    // Siempre pedir selección de personaje al creador, sea cual sea el modo.
    // En RPG además abrirá stats si no hay puntos distribuidos.
    // Si el usuario no tiene personajes, enterTopic lo gestionará como Narrador.
    pendingRoleTopicId = id;
    openRoleCharacterModal(id, { mode: currentTopicMode, preservePendingTopicId: true, enterOnSelect: true });
}

// ============================================


// ── Modal de unirse por invitación ───────────────────────────────────────────

async function openInviteJoinModal(token) {
    if (!token) return;

    const modal = document.getElementById('inviteJoinModal');
    const titleEl = document.getElementById('inviteJoinTitle');
    const msgEl   = document.getElementById('inviteJoinMsg');
    const btn     = document.getElementById('inviteJoinBtn');
    if (!modal) return;

    if (titleEl) titleEl.textContent = 'Cargando invitación…';
    if (msgEl)   msgEl.textContent   = '';
    if (btn)     btn.disabled        = true;

    openModal('inviteJoinModal');

    if (typeof SupabaseStories === 'undefined') {
        if (titleEl) titleEl.textContent = 'Sin conexión';
        if (msgEl)   msgEl.textContent   = 'Inicia sesión para unirte a historias compartidas.';
        return;
    }

    // Buscar la historia por token sin unirse todavía
    const sb = window.supabaseClient;
    let storyTitle = null;
    let storyInfo  = null;
    try {
        const { data } = await sb.from('stories')
            .select('id, title, created_at')
            .eq('invite_token', token)
            .single();
        storyInfo  = data;
        storyTitle = data?.title;
    } catch {}

    if (!storyInfo) {
        if (titleEl) titleEl.textContent = 'Invitación no válida';
        if (msgEl)   msgEl.textContent   = 'Este enlace no existe o ha expirado.';
        return;
    }

    if (titleEl) titleEl.textContent = `"${storyTitle}"`;
    if (msgEl)   msgEl.textContent   = 'Alguien te ha invitado a esta historia. ¿Quieres unirte?';
    if (btn) {
        btn.disabled    = false;
        btn.textContent = '✦ Unirme a la historia';
        btn.onclick     = async () => {
            btn.disabled    = true;
            btn.textContent = 'Uniéndome…';
            const result = await SupabaseStories.joinByInviteToken(token);
            if (result.ok) {
                closeModal('inviteJoinModal');
                if (result.alreadyJoined) {
                    showAutosave('Ya estás en esta historia', 'info');
                } else {
                    showAutosave(`✓ Unido a "${result.title}" — ${result.messageCount || 0} mensajes cargados`, 'saved');
                }
                // Ir a la sección de historias
                if (typeof showSection === 'function') showSection('topics');
            } else {
                if (msgEl) msgEl.textContent = result.error || 'No se pudo unir a la historia.';
                btn.disabled    = false;
                btn.textContent = 'Reintentar';
            }
        };
    }
}
window.openInviteJoinModal = openInviteJoinModal;

// ============================================
// GESTOR DE SESIONES — Selección múltiple
// ============================================

let _smFilter = 'all';
let _smSelected = new Set();

function openSessionManager() {
    _smFilter = 'all';
    _smSelected.clear();
    _smRender();
    openModal('sessionManagerModal');
}

function closeSessionManager() {
    _smSelected.clear();
    closeModal('sessionManagerModal');
}

function _smGetTopics() {
    let topics = [...(appData.topics || [])];
    if (_smFilter === 'mine') {
        topics = topics.filter(t => t.createdByIndex === currentUserIndex);
    }
    return topics;
}

function _smRender() {
    const list  = document.getElementById('smList');
    const count = document.getElementById('smSelectedCount');
    const del   = document.getElementById('smDeleteBtn');
    const delCt = document.getElementById('smDeleteCount');
    const sub   = document.getElementById('smSubtitle');
    const allCb = document.getElementById('smSelectAll');
    if (!list) return;

    const topics = _smGetTopics();

    // Contar cuántas del filtro actual están seleccionadas
    const selInView = topics.filter(t => _smSelected.has(t.id)).length;
    const total     = topics.length;

    if (count) count.textContent = `${_smSelected.size} seleccionada${_smSelected.size !== 1 ? 's' : ''}`;
    if (sub)   sub.textContent   = total > 0 ? `${total} historia${total !== 1 ? 's' : ''} — selecciona las que quieras eliminar` : 'No hay historias';
    if (del)   del.disabled      = _smSelected.size === 0;
    if (delCt) delCt.textContent = _smSelected.size > 0 ? `(${_smSelected.size})` : '';
    if (allCb) allCb.checked     = total > 0 && selInView === total;
    if (allCb) allCb.indeterminate = selInView > 0 && selInView < total;

    if (!topics.length) {
        list.innerHTML = '<div class="sm-empty">No hay historias que mostrar.</div>';
        return;
    }

    list.innerHTML = topics.map(t => {
        const msgs     = Array.isArray(appData.messages?.[t.id]) ? appData.messages[t.id].length : 0;
        const isOwn    = t.createdByIndex === currentUserIndex;
        const modeTag  = t.mode === 'rpg' ? '<span class="sm-tag sm-tag-rpg">RPG</span>' : '<span class="sm-tag sm-tag-classic">Clásico</span>';
        const ownerTag = isOwn ? '<span class="sm-tag sm-tag-own">Tuya</span>' : '';
        const checked  = _smSelected.has(t.id);
        const date     = t.date || '';

        return `
        <label class="sm-item ${checked ? 'sm-item--selected' : ''}" for="sm_cb_${t.id}">
            <input type="checkbox" class="sm-item-cb" id="sm_cb_${t.id}"
                ${checked ? 'checked' : ''}
                onchange="smToggleItem('${t.id}', this.checked)">
            <span class="sm-item-check"></span>
            <div class="sm-item-body">
                <div class="sm-item-title">${escapeHtml(t.title)}</div>
                <div class="sm-item-meta">
                    ${modeTag}${ownerTag}
                    <span class="sm-meta-text">${msgs} mensaje${msgs !== 1 ? 's' : ''}</span>
                    ${date ? `<span class="sm-meta-text">· ${escapeHtml(date)}</span>` : ''}
                </div>
            </div>
        </label>`;
    }).join('');
}

function smToggleItem(topicId, checked) {
    if (checked) _smSelected.add(topicId);
    else         _smSelected.delete(topicId);
    _smRender();
}

function smToggleAll(checked) {
    const topics = _smGetTopics();
    if (checked) topics.forEach(t => _smSelected.add(t.id));
    else         _smSelected.clear();
    _smRender();
}

function smSetFilter(filter, btn) {
    _smFilter = filter;
    document.querySelectorAll('.sm-filter-btn').forEach(b => b.classList.remove('active'));
    if (btn) btn.classList.add('active');
    _smRender();
}

async function smDeleteSelected() {
    if (_smSelected.size === 0) return;

    const n = _smSelected.size;
    const ok = await openConfirmModal(
        `¿Eliminar ${n} historia${n !== 1 ? 's' : ''}? Esta acción no se puede deshacer.`,
        `Eliminar ${n} historia${n !== 1 ? 's' : ''}`
    );
    if (!ok) return;

    // Borrar cada topic seleccionado
    _smSelected.forEach(id => {
        appData.topics = appData.topics.filter(t => t.id !== id);
        delete appData.messages[id];
        delete appData.affinities[id];
    });

    hasUnsavedChanges = true;
    save({ silent: true });

    // Subir a nube
    if (typeof SupabaseSync !== 'undefined') {
        SupabaseSync.uploadProfileData().catch(() => {});
    }

    showAutosave(`${n} historia${n !== 1 ? 's' : ''} eliminada${n !== 1 ? 's' : ''}`, 'saved');

    _smSelected.clear();
    closeSessionManager();
    renderTopics();
}

// Exponer para uso desde HTML
window.openSessionManager  = openSessionManager;
window.closeSessionManager = closeSessionManager;
window.smToggleItem        = smToggleItem;
window.smToggleAll         = smToggleAll;
window.smSetFilter         = smSetFilter;
window.smDeleteSelected    = smDeleteSelected;

// ============================================
// BUSCADOR GLOBAL DE MENSAJES
// ============================================
// Busca en dos fuentes simultáneamente:
//   1. Mensajes locales (appData.messages) — resultados instantáneos
//   2. Supabase (índice GIN en search_vector) — resultados de nube
// Los resultados se fusionan y deduplicados por ID de mensaje.

let _gsDebounceTimer = null;
let _gsLastQuery     = '';

function openGlobalSearch() {
    openModal('globalSearchModal');
    setTimeout(() => {
        const inp = document.getElementById('globalSearchInput');
        if (inp) inp.focus();
    }, 120);
}

function closeGlobalSearch() {
    closeModal('globalSearchModal');
    clearGlobalSearch();
}

function clearGlobalSearch() {
    const inp = document.getElementById('globalSearchInput');
    if (inp) inp.value = '';
    const clr = document.getElementById('gsClearBtn');
    if (clr) clr.style.display = 'none';
    _gsRenderEmpty();
    _gsLastQuery = '';
}

function onGlobalSearchInput(value) {
    const clr = document.getElementById('gsClearBtn');
    if (clr) clr.style.display = value.trim() ? '' : 'none';

    if (_gsDebounceTimer) clearTimeout(_gsDebounceTimer);

    const q = value.trim();
    if (q.length < 2) {
        _gsRenderEmpty();
        return;
    }

    _gsDebounceTimer = setTimeout(() => _gsSearch(q), 280);
}

async function _gsSearch(query) {
    if (query === _gsLastQuery) return;
    _gsLastQuery = query;

    _gsRenderLoading();

    // 1. Búsqueda local (instantánea)
    const localResults = _gsSearchLocal(query);

    // Mostrar resultados locales inmediatamente
    _gsRenderResults(localResults, false);

    // 2. Búsqueda en Supabase con índice GIN (si hay sesión)
    if (window._cachedUserId && window.supabaseClient) {
        try {
            const cloudResults = await _gsSearchCloud(query);
            if (_gsLastQuery !== query) return; // query cambió mientras esperábamos

            // Fusionar: los locales tienen prioridad (más contexto)
            const localIds = new Set(localResults.map(r => r.msgId));
            const novelCloud = cloudResults.filter(r => !localIds.has(r.msgId));
            const merged = [...localResults, ...novelCloud];
            _gsRenderResults(merged, true);
        } catch (e) {
            // Fallo silencioso — ya tenemos resultados locales
            console.debug('[GlobalSearch] cloud search failed:', e?.message);
        }
    }
}

// Búsqueda local en appData.messages
function _gsSearchLocal(query) {
    const results = [];
    const q = query.toLowerCase().replace(/^"|"$/g, '').trim();
    const isExact = query.startsWith('"') && query.endsWith('"');

    const topics = appData?.topics || [];
    const messages = appData?.messages || {};

    for (const topic of topics) {
        const msgs = messages[topic.id] || [];
        for (const msg of msgs) {
            if (!msg.text) continue;
            const text = msg.text.toLowerCase();
            const matches = isExact ? text.includes(q) : q.split(/\s+/).every(w => text.includes(w));
            if (!matches) continue;

            results.push({
                msgId:     msg.id,
                topicId:   topic.id,
                topicTitle: topic.title || 'Sin título',
                charName:  msg.charName || (msg.isNarrator ? 'Narrador' : ''),
                text:      msg.text,
                timestamp: msg.timestamp,
                source:    'local'
            });
            if (results.length >= 50) break;
        }
        if (results.length >= 50) break;
    }

    return results.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
}

// Búsqueda en Supabase usando el índice GIN (tsvector)
async function _gsSearchCloud(query) {
    const sb = window.supabaseClient;
    if (!sb) return [];

    // Construir query tsquery: palabras separadas por &
    const cleanQuery = query.replace(/^"|"$/g, '').trim();
    const isExact = query.startsWith('"') && query.endsWith('"');
    const tsQuery = isExact
        ? `'${cleanQuery}'`
        : cleanQuery.split(/\s+/).filter(Boolean).join(' & ');

    try {
        const { data, error } = await sb
            .from('messages')
            .select('id, session_id, content, created_at, story_id')
            .textSearch('search_vector', tsQuery, { config: 'spanish' })
            .limit(40);

        if (error || !data) return [];

        const results = [];
        for (const row of data) {
            try {
                const msg = JSON.parse(row.content);
                if (!msg.text || msg.metaType === 'typing') continue;

                // Resolver título del topic
                const topicId = row.session_id;
                const topic   = appData?.topics?.find(t => String(t.id) === topicId || t.storyId === row.story_id);

                results.push({
                    msgId:      msg.id || row.id,
                    topicId:    topicId,
                    topicTitle: topic?.title || 'Historia en la nube',
                    charName:   msg.charName || (msg.isNarrator ? 'Narrador' : ''),
                    text:       msg.text,
                    timestamp:  msg.timestamp || row.created_at,
                    source:     'cloud'
                });
            } catch {}
        }
        return results;
    } catch (e) {
        return [];
    }
}

// ── Renderizado de resultados ─────────────────────────────────────────────────

function _gsHighlight(text, query) {
    const q = query.replace(/^"|"$/g, '').trim();
    if (!q) return escapeHtml(text);
    const words = q.split(/\s+/).filter(Boolean);
    let escaped = escapeHtml(text);
    for (const w of words) {
        const re = new RegExp(`(${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
        escaped = escaped.replace(re, '<mark class="gs-highlight">$1</mark>');
    }
    return escaped;
}

function _gsSnippet(text, query, maxLen = 160) {
    const q = query.replace(/^"|"$/g, '').trim().toLowerCase();
    const lower = text.toLowerCase();
    const pos = lower.indexOf(q.split(/\s+/)[0]);
    if (pos === -1 || text.length <= maxLen) return text;
    const start = Math.max(0, pos - 40);
    const end   = Math.min(text.length, start + maxLen);
    return (start > 0 ? '…' : '') + text.slice(start, end) + (end < text.length ? '…' : '');
}

function _gsRenderEmpty() {
    const body   = document.getElementById('gsBody');
    const meta   = document.getElementById('gsMetaBar');
    if (meta) meta.style.display = 'none';
    if (body) body.innerHTML = `<div class="gs-empty">
        <p>Escribe para buscar en el contenido de todos tus mensajes.</p>
        <p class="gs-empty-sub">Usa comillas para búsqueda exacta: <code>"frase exacta"</code></p>
    </div>`;
}

function _gsRenderLoading() {
    const body = document.getElementById('gsBody');
    const meta = document.getElementById('gsMetaBar');
    if (meta) meta.style.display = 'none';
    if (body) body.innerHTML = `<div class="gs-loading">Buscando…</div>`;
}

function _gsRenderResults(results, cloudDone) {
    const body  = document.getElementById('gsBody');
    const meta  = document.getElementById('gsMetaBar');
    const count = document.getElementById('gsResultCount');
    if (!body) return;

    if (results.length === 0) {
        if (meta) meta.style.display = 'none';
        body.innerHTML = `<div class="gs-no-results">
            <p>Sin resultados para <strong>"${escapeHtml(_gsLastQuery)}"</strong></p>
            ${!cloudDone ? '<p class="gs-empty-sub">Buscando en la nube…</p>' : ''}
        </div>`;
        return;
    }

    if (meta) meta.style.display = '';
    if (count) {
        count.textContent = results.length >= 50
            ? '+50 resultados'
            : `${results.length} resultado${results.length !== 1 ? 's' : ''}`;
    }

    // Agrupar por topic
    const byTopic = new Map();
    for (const r of results) {
        if (!byTopic.has(r.topicId)) byTopic.set(r.topicId, { title: r.topicTitle, items: [] });
        byTopic.get(r.topicId).items.push(r);
    }

    body.innerHTML = [...byTopic.entries()].map(([topicId, group]) => `
        <div class="gs-group">
            <div class="gs-group-title">📖 ${escapeHtml(group.title)}</div>
            ${group.items.map(r => {
                const snippet = _gsSnippet(r.text, _gsLastQuery);
                const highlighted = _gsHighlight(snippet, _gsLastQuery);
                const dateStr = r.timestamp
                    ? new Date(r.timestamp).toLocaleDateString('es-ES', { day:'numeric', month:'short' })
                    : '';
                return `<div class="gs-result" onclick="gsGoToMessage('${escapeHtml(topicId)}','${escapeHtml(r.msgId)}')">
                    <div class="gs-result-meta">
                        <span class="gs-result-char">${escapeHtml(r.charName || 'Mensaje')}</span>
                        <span class="gs-result-date">${dateStr}</span>
                        ${r.source === 'cloud' ? '<span class="gs-cloud-badge">☁</span>' : ''}
                    </div>
                    <div class="gs-result-text">${highlighted}</div>
                </div>`;
            }).join('')}
        </div>
    `).join('');
}

// Ir al mensaje seleccionado
function gsGoToMessage(topicId, msgId) {
    closeGlobalSearch();

    const topic = appData?.topics?.find(t => String(t.id) === topicId);
    if (!topic) {
        showAutosave('Historia no encontrada localmente', 'error');
        return;
    }

    // Ir a la sección de temas y luego entrar al topic
    if (typeof showSection === 'function') showSection('topics');
    setTimeout(() => {
        if (typeof enterTopic === 'function') {
            enterTopic(topicId);
            // Posicionar en el mensaje específico tras entrar
            setTimeout(() => {
                const msgs = appData?.messages?.[topicId] || [];
                const idx = msgs.findIndex(m => String(m.id) === String(msgId));
                if (idx !== -1 && typeof showCurrentMessage === 'function') {
                    window.currentMessageIndex = idx;
                    showCurrentMessage('forward');
                }
            }, 600);
        }
    }, 300);
}

window.openGlobalSearch   = openGlobalSearch;
window.closeGlobalSearch  = closeGlobalSearch;
window.clearGlobalSearch  = clearGlobalSearch;
window.onGlobalSearchInput = onGlobalSearchInput;
window.gsGoToMessage      = gsGoToMessage;

// Ctrl+F / Cmd+F para abrir el buscador global cuando la sección de historias está activa
document.addEventListener('keydown', function(e) {
    if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
        const topicsSection = document.getElementById('topicsSection');
        if (topicsSection && topicsSection.classList.contains('active')) {
            e.preventDefault();
            openGlobalSearch();
        }
    }
    if (e.key === 'Escape') {
        const modal = document.getElementById('globalSearchModal');
        if (modal && modal.style.display !== 'none') {
            e.stopPropagation();
            closeGlobalSearch();
        }
    }
});
