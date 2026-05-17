// Gestión de historias (topics): crear, listar, entrar.
// EDITOR DE RAMAS
// ============================================

// ── Guardia de personajes antes de abrir el modal de creación ────────────────
// Se llama desde el botón "Nueva Historia". Solo bloquea si NO existe ningún
// personaje en absoluto. Si hay personajes pero ninguno coincide con
// currentUserIndex (posible desfase offline/Supabase), se abre el wizard
// igualmente — el wizard mostrará el selector con todos los disponibles.
function openNewTopicModal() {
    const allChars = appData?.characters || [];
    if (allChars.length === 0) {
        openNoCharacterWarning();
        return;
    }
    topicWizardOpen();
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

function _normalizeTopicId(topicId) {
    return String(topicId ?? '');
}

function _dedupeTopicsInPlace() {
    if (!Array.isArray(appData?.topics) || appData.topics.length < 2) return false;

    const seen = new Set();
    const deduped = [];
    let changed = false;

    for (const topic of appData.topics) {
        if (!topic) continue;
        const idKey = _normalizeTopicId(topic.id);
        const storyKey = topic.storyId ? String(topic.storyId) : '';
        const key = storyKey ? `story:${storyKey}` : `local:${idKey}`;

        if (seen.has(key)) {
            changed = true;
            continue;
        }

        seen.add(key);
        deduped.push(topic);
    }

    if (changed) {
        appData.topics = deduped;
        hasUnsavedChanges = true;
        if (typeof save === 'function') save({ silent: true });
    }
    return changed;
}


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

function toRoman(n) {
    const vals = [1000,900,500,400,100,90,50,40,10,9,5,4,1];
    const syms = ['M','CM','D','CD','C','XC','L','XL','X','IX','V','IV','I'];
    let result = '';
    for (let i = 0; i < vals.length; i++) {
        while (n >= vals[i]) { result += syms[i]; n -= vals[i]; }
    }
    return result || 'I';
}

function renderTopics() {
    const container = document.getElementById('topicsList');
    if (!container) return;

    _dedupeTopicsInPlace();

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
        container.innerHTML = topics.map((t, idx) => {
            const msgs        = Array.isArray(appData.messages[t.id]) ? appData.messages[t.id] : [];
            const isRol       = t.mode === 'rpg' || t.mode === 'fanfic';
            const creatorName = normalizeCreatorName(t.createdBy);
            const msgWord     = msgs.length === 1 ? 'msg' : 'msgs';
            const cardIcon    = isRol ? '⚜' : '✦';
            const numeral     = toRoman(idx + 1);
            const modeClass   = isRol ? 'topic-card--rol' : 'topic-card--historia';
            const mandalaColor = isRol ? '#d4ae5c' : '#9ab4e0';

            const isMeTurn = Array.isArray(t.turnOrder)
                && t.turnOrder[0]
                && String(t.turnOrder[0]) === String(window._cachedUserId);
            const turnClass = isMeTurn ? ' topic-card--my-turn' : '';

            const tid = _normalizeTopicId(t.id);
            return `
                <div class="topic-card ${modeClass}${turnClass}"
                     onclick="this.classList.toggle('flipped')">
                    <div class="card-inner">
                        <div class="card-face card-face--front">
                            <div class="card-outer-frame">
                                <div class="card-corner card-corner--tl"></div>
                                <div class="card-corner card-corner--tr"></div>
                                <div class="card-corner card-corner--bl"></div>
                                <div class="card-corner card-corner--br"></div>
                                <div class="card-inner-frame">
                                    <div class="card-header">
                                        <h3 class="card-title">${escapeHtml(t.title)}</h3>
                                        <p class="card-author">por ${escapeHtml(creatorName)}</p>
                                    </div>
                                    <div class="card-divider"><span class="card-divider-diamond">◆</span></div>
                                    <div class="card-mandala" style="color:${mandalaColor}">
                                        <svg class="card-mandala-svg" viewBox="0 0 88 88" fill="none" xmlns="http://www.w3.org/2000/svg">
                                            <circle cx="44" cy="44" r="40" stroke="currentColor" stroke-width="0.8" opacity="0.6"/>
                                            <circle cx="44" cy="44" r="32" stroke="currentColor" stroke-width="0.5" opacity="0.4"/>
                                            <circle cx="44" cy="44" r="20" stroke="currentColor" stroke-width="0.8" opacity="0.5"/>
                                            <circle cx="44" cy="44" r="4"  fill="currentColor"   opacity="0.3"/>
                                            <line x1="44"  y1="4"    x2="44"  y2="84"   stroke="currentColor" stroke-width="0.6" opacity="0.35"/>
                                            <line x1="4"   y1="44"   x2="84"  y2="44"   stroke="currentColor" stroke-width="0.6" opacity="0.35"/>
                                            <line x1="15.7" y1="15.7" x2="72.3" y2="72.3" stroke="currentColor" stroke-width="0.4" opacity="0.2"/>
                                            <line x1="72.3" y1="15.7" x2="15.7" y2="72.3" stroke="currentColor" stroke-width="0.4" opacity="0.2"/>
                                            <circle cx="44"   cy="6"    r="2"   fill="currentColor" opacity="0.6"/>
                                            <circle cx="44"   cy="82"   r="2"   fill="currentColor" opacity="0.6"/>
                                            <circle cx="6"    cy="44"   r="2"   fill="currentColor" opacity="0.6"/>
                                            <circle cx="82"   cy="44"   r="2"   fill="currentColor" opacity="0.6"/>
                                            <circle cx="15.7" cy="15.7" r="1.5" fill="currentColor" opacity="0.35"/>
                                            <circle cx="72.3" cy="15.7" r="1.5" fill="currentColor" opacity="0.35"/>
                                            <circle cx="15.7" cy="72.3" r="1.5" fill="currentColor" opacity="0.35"/>
                                            <circle cx="72.3" cy="72.3" r="1.5" fill="currentColor" opacity="0.35"/>
                                        </svg>
                                        <span class="card-center-icon">${cardIcon}</span>
                                    </div>
                                    <div class="card-divider"><span class="card-divider-diamond">◆</span></div>
                                    <div class="card-footer-bar">
                                        <span class="card-numeral">${numeral}</span>
                                        <span class="card-msgs">◆ ${msgs.length} ${msgWord}</span>
                                    </div>
                                    ${isMeTurn ? '<div class="card-turn-badge">⏳ Tu turno</div>' : ''}
                                </div>
                            </div>
                        </div>
                        <div class="card-face card-face--back">
                            <div class="card-outer-frame">
                                <div class="card-corner card-corner--tl"></div>
                                <div class="card-corner card-corner--tr"></div>
                                <div class="card-corner card-corner--bl"></div>
                                <div class="card-corner card-corner--br"></div>
                                <div class="card-inner-frame card-inner-frame--back">
                                    <h3 class="card-title">${escapeHtml(t.title)}</h3>
                                    <p class="card-author">por ${escapeHtml(creatorName)}</p>
                                    <p class="card-msgs">◆ ${msgs.length} ${msgWord}</p>
                                    <button class="btn-entrar-destino"
                                            onclick="event.stopPropagation(); enterTopic('${tid}')">
                                        ✦ Entrar al destino
                                    </button>
                                </div>
                            </div>
                        </div>
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

    // ── Sincronización con la nube ──────────────────────────────────────────
    // Usa upsertStory para guardar todos los metadatos del topic (modo, fondo,
    // locks, etc.) en la tabla stories de Supabase, no solo el título.
    if (typeof SupabaseStories !== 'undefined' && typeof SupabaseStories.upsertStory === 'function') {
        const topicRef = appData.topics.find(function(tp) { return String(tp.id) === String(id); });
        if (topicRef) {
            SupabaseStories.upsertStory(topicRef).then(function(result) {
                if (result.ok && result.storyId) {
                    topicRef.storyId = result.storyId;
                    window.currentStoryId = result.storyId;
                    hasUnsavedChanges = true;
                    save({ silent: true });
                } else {
                    const detail = result?.error ? ': ' + result.error : '';
                    window.EtheriaLogger?.warn('topics', 'No se pudo guardar la historia en Supabase' + detail);
                    if (typeof showAutosave === 'function') showAutosave('Historia local; no se guardó en Supabase' + detail, 'error');
                }
            }).catch(function(error) {
                window.EtheriaLogger?.warn('topics', 'upsertStory exception:', error?.message || error);
                if (typeof showAutosave === 'function') showAutosave('Historia local; error al guardar en Supabase', 'error');
            });
        }
    }
    // Subir blob actualizado (ya sin topics dentro, pero por si queda algo pendiente)
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
    _dedupeTopicsInPlace();
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
    const selInView = topics.filter(t => _smSelected.has(_normalizeTopicId(t.id))).length;
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
        const normalizedId = _normalizeTopicId(t.id);
        const checked  = _smSelected.has(normalizedId);
        const date     = t.date || '';

        return `
        <label class="sm-item ${checked ? 'sm-item--selected' : ''}" for="sm_cb_${normalizedId}">
            <input type="checkbox" class="sm-item-cb" id="sm_cb_${normalizedId}"
                ${checked ? 'checked' : ''}
                onchange="smToggleItem('${normalizedId}', this.checked)">
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
    const normalizedId = _normalizeTopicId(topicId);
    if (checked) _smSelected.add(normalizedId);
    else         _smSelected.delete(normalizedId);
    _smRender();
}

function smToggleAll(checked) {
    const topics = _smGetTopics();
    if (checked) topics.forEach(t => _smSelected.add(_normalizeTopicId(t.id)));
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
    _dedupeTopicsInPlace();

    const n = _smSelected.size;
    const ok = await openConfirmModal(
        `¿Eliminar ${n} historia${n !== 1 ? 's' : ''}? Esta acción no se puede deshacer.`,
        `Eliminar ${n} historia${n !== 1 ? 's' : ''}`
    );
    if (!ok) return;

    // Borrar cada topic seleccionado
    const storyIdsToDelete = [];
    _smSelected.forEach(id => {
        const normalizedId = _normalizeTopicId(id);
        const topic = appData.topics.find(t => _normalizeTopicId(t.id) === normalizedId);
        if (topic?.storyId) storyIdsToDelete.push(topic.storyId);
        appData.topics = appData.topics.filter(t => _normalizeTopicId(t.id) !== normalizedId);
        delete appData.messages[normalizedId];
        delete appData.affinities[normalizedId];
    });

    hasUnsavedChanges = true;
    save({ silent: true });

    // Borrar de Supabase (tabla stories) para que otros dispositivos no las resuciten
    let failedCloudDeletes = 0;
    if (storyIdsToDelete.length > 0 && typeof SupabaseStories !== 'undefined' && typeof SupabaseStories.deleteStory === 'function') {
        const results = await Promise.all(storyIdsToDelete.map(storyId =>
            SupabaseStories.deleteStory(storyId).catch(error => ({ ok: false, error: error?.message || String(error) }))
        ));
        failedCloudDeletes = results.filter(result => !result?.ok).length;
        if (failedCloudDeletes > 0) {
            window.EtheriaLogger?.warn('topics', failedCloudDeletes + ' historias no se pudieron borrar en Supabase');
        }
    } else if (typeof SupabaseSync !== 'undefined') {
        // Fallback por si SupabaseStories no está disponible
        SupabaseSync.uploadProfileData().catch(() => {});
    }

    if (failedCloudDeletes > 0) {
        showAutosave(`${n} historia${n !== 1 ? 's' : ''} eliminada${n !== 1 ? 's' : ''} localmente; ${failedCloudDeletes} no se borraron en Supabase`, 'error');
    } else {
        showAutosave(`${n} historia${n !== 1 ? 's' : ''} eliminada${n !== 1 ? 's' : ''}`, 'saved');
    }

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
    if (e.key === 'Escape') {
        if (document.getElementById('topicModal')?.classList.contains('open')) {
            closeModal('topicModal');
        }
    }
});
/* ════════════════════════════════════════════════════════════════════════════
   TOPIC CREATION WIZARD — Asistente por pasos de nueva historia
   ════════════════════════════════════════════════════════════════════════════ */

const _tw = { mode: null, charId: null, rpgClass: null, stats: null };

const _TW_CLASSES = [
    { id: 'fighter',   name: 'Guerrero',   glyph: '⚔',  desc: 'Ancla la presion fisica de la escena. Ideal para abrir paso y sostener el foco.' },
    { id: 'ranger',    name: 'Explorador', glyph: '🏹', desc: 'Lee el entorno y encuentra rutas narrativas. Adelantate al peligro.' },
    { id: 'rogue',     name: 'Picaro',     glyph: '🗡',  desc: 'Controla el ritmo desde la sombra. Brilla robando foco y forzando giros.' },
    { id: 'cleric',    name: 'Clerigo',    glyph: '✚',  desc: 'Sostiene al grupo en momentos limite. Reordena la tension y protege la escena.' },
    { id: 'wizard',    name: 'Mago',       glyph: '✦',  desc: 'Reencuadra la ficcion con conocimiento y magia. Tuerce el momento.' },
    { id: 'barbarian', name: 'Barbaro',    glyph: '⚡', desc: 'Empuja la escena al limite. Convierte presion en impulso para romper bloqueos.' },
];
const _TW_STATS     = ['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA'];
const _TW_STAT_NAME = { STR: 'Fuerza', DEX: 'Destreza', CON: 'Constitucion', INT: 'Inteligencia', WIS: 'Sabiduria', CHA: 'Carisma' };
const _TW_BASE = 8, _TW_MAX = 15, _TW_POOL = 27;
const _TW_COSTS = [0, 1, 2, 3, 4, 5, 7, 9];

function _twCost(v)  { return _TW_COSTS[Math.max(0, Math.min(v - _TW_BASE, 7))]; }
function _twSpent()  { return _TW_STATS.reduce(function(s, k) { return s + _twCost((_tw.stats || {})[k] || _TW_BASE); }, 0); }
function _twRemain() { return _TW_POOL - _twSpent(); }

function topicWizardOpen() {
    _tw.mode = null; _tw.charId = null; _tw.rpgClass = null;
    _tw.stats = Object.fromEntries(_TW_STATS.map(function(k) { return [k, _TW_BASE]; }));
    ['topicTitleInput', 'topicFirstMsg'].forEach(function(id) {
        var el = document.getElementById(id); if (el) el.value = '';
    });
    document.querySelectorAll('.topic-weather-btn').forEach(function(b) {
        b.classList.toggle('active', b.dataset.weather === 'none');
    });
    var wi = document.getElementById('topicWeatherInput'); if (wi) wi.value = 'none';
    topicWizardGoStep(1);
    openModal('topicModal');
}

function topicWizardGoStep(n) {
    document.querySelectorAll('#topicModal .tw-step').forEach(function(el, i) {
        el.classList.toggle('tw-step--active', i + 1 === n);
    });
    if (n === 2) {
        var te = document.getElementById('twStep2Title');
        if (te) te.textContent = _tw.mode === 'rpg' ? '⛜ Configura tu historia' : '✦ Configura tu historia';
        var nl = document.getElementById('twNextLabel');
        if (nl) nl.textContent = _tw.mode === 'rpg' ? 'Hoja de Aventura ›' : 'Crear Historia';
        _twRenderChars(); topicWizardValidate();
    }
    if (n === 3) { _twRenderRpgSheet(); _twValidateRpg(); }
}

function topicWizardSelectMode(mode) {
    _tw.mode = mode;
    var rid = mode === 'rpg' ? 'modeRpg' : 'modeRoleplay';
    var r = document.getElementById(rid); if (r) r.checked = true;
    if (typeof updateTopicModeUI === 'function') updateTopicModeUI();
    topicWizardGoStep(2);
}

function _twRenderChars() {
    var list = document.getElementById('twCharList'); if (!list) return;
    // Preferir personajes del usuario actual; si hay desfase offline/Supabase
    // (userIndex no coincide) mostrar todos para no bloquear la creación.
    var mine  = ((appData && appData.characters) || []).filter(function(c) { return c.userIndex === currentUserIndex; });
    var chars = mine.length ? mine : ((appData && appData.characters) || []);
    if (!chars.length) { list.innerHTML = '<p class="tw-no-chars">No tienes personajes. Crea uno desde la Galería.</p>'; return; }
    list.innerHTML = chars.map(function(c) {
        var sel = String(c.id) === String(_tw.charId);
        var vis = c.avatar
            ? '<img src="' + escapeHtml(c.avatar) + '" alt="" class="tw-char-img">'
            : '<span class="tw-char-initial">' + escapeHtml((c.name || '?')[0].toUpperCase()) + '</span>';
        return '<button type="button" class="tw-char-card' + (sel ? ' tw-char-card--sel' : '') + '" data-char-id="' + escapeHtml(String(c.id)) + '" onclick="topicWizardSelectChar(this.dataset.charId)" aria-pressed="' + sel + '">'
            + '<div class="tw-char-avatar">' + vis + '</div>'
            + '<div class="tw-char-name">' + escapeHtml(c.name) + '</div>'
            + (sel ? '<div class="tw-char-check" aria-hidden="true">✓</div>' : '')
            + '</button>';
    }).join('');
}

function topicWizardSelectChar(charId) { _tw.charId = charId; _twRenderChars(); topicWizardValidate(); }

function topicWizardValidate() {
    var title = ((document.getElementById('topicTitleInput') || {}).value || '').trim();
    var msg   = ((document.getElementById('topicFirstMsg')   || {}).value || '').trim();
    var btn   = document.getElementById('twNextBtn');
    var ok    = !!(title && msg && _tw.charId);
    if (btn) { btn.disabled = !ok; btn.classList.toggle('tw-btn-next--ready', ok); }
}

function topicWizardNext() {
    if (_tw.mode === 'rpg') topicWizardGoStep(3); else createTopicFromWizard();
}

function _twRenderRpgSheet() {
    var cg = document.getElementById('twClassGrid');
    if (cg) {
        cg.innerHTML = _TW_CLASSES.map(function(cls) {
            var sel = _tw.rpgClass === cls.id;
            return '<button type="button" class="tw-class-card' + (sel ? ' tw-class-card--sel' : '') + '" data-class-id="' + escapeHtml(cls.id) + '" onclick="topicWizardSelectClass(this.dataset.classId)" title="' + escapeHtml(cls.desc) + '" aria-pressed="' + sel + '">'
                + '<span class="tw-class-glyph">' + cls.glyph + '</span>'
                + '<span class="tw-class-name">' + escapeHtml(cls.name) + '</span>'
                + '</button>';
        }).join('');
    }
    _twRenderStats();
}

function _twRenderStats() {
    var grid = document.getElementById('twStatGrid'); if (!grid) return;
    var rem = _twRemain();
    var badge = document.getElementById('twPointsBadge');
    if (badge) {
        badge.textContent = rem === 0 ? '✓ distribuidos' : rem + ' restantes';
        badge.className = 'tw-points-badge' + (rem === 0 ? ' tw-points-badge--done' : '');
    }
    grid.innerHTML = _TW_STATS.map(function(key) {
        var val    = ((_tw.stats || {})[key]) || _TW_BASE;
        var incCost = _twCost(val + 1) - _twCost(val);
        var canInc  = val < _TW_MAX && rem >= incCost;
        var canDec  = val > _TW_BASE;
        var mod     = Math.floor((val - 10) / 2);
        var modStr  = (mod >= 0 ? '+' : '') + mod;
        return '<div class="tw-stat-row">'
            + '<span class="tw-stat-name">' + (_TW_STAT_NAME[key] || key) + '</span>'
            + '<button type="button" class="tw-stat-btn" data-stat-key="' + escapeHtml(key) + '" data-stat-delta="-1" onclick="topicWizardAdjustStat(this.dataset.statKey, -1)"' + (canDec ? '' : ' disabled') + '>−</button>'
            + '<span class="tw-stat-val">' + val + '</span>'
            + '<button type="button" class="tw-stat-btn" data-stat-key="' + escapeHtml(key) + '" data-stat-delta="1" onclick="topicWizardAdjustStat(this.dataset.statKey, 1)"' + (canInc ? '' : ' disabled') + '>+</button>'
            + '<span class="tw-stat-mod">' + modStr + '</span>'
            + '</div>';
    }).join('');
    _twValidateRpg();
}

function topicWizardSelectClass(classId) { _tw.rpgClass = classId; _twRenderRpgSheet(); }

function topicWizardAdjustStat(key, delta) {
    if (!_tw.stats) return;
    var cur = _tw.stats[key] || _TW_BASE, next = cur + delta;
    if (next < _TW_BASE || next > _TW_MAX) return;
    if (delta > 0 && (_twCost(next) - _twCost(cur)) > _twRemain()) return;
    _tw.stats[key] = next; _twRenderStats();
}

function _twValidateRpg() {
    var btn = document.getElementById('twCreateBtn'), ok = !!_tw.rpgClass;
    if (btn) { btn.disabled = !ok; btn.classList.toggle('tw-btn-create--ready', ok); }
}

function createTopicFromWizard() {
    var titleEl = document.getElementById('topicTitleInput');
    var msgEl   = document.getElementById('topicFirstMsg');
    var wxEl    = document.getElementById('topicWeatherInput');
    var title   = ((titleEl && titleEl.value) || '').trim();
    var text    = ((msgEl   && msgEl.value)   || '').trim();
    var weather = ((wxEl    && wxEl.value)    || 'none');

    if (!title || !text) { showAutosave('Completa todos los campos obligatorios', 'error'); return; }
    var genericTitles = ['prueba', 'test', 'historia', 'nueva historia'];
    if (genericTitles.indexOf(title.toLowerCase()) !== -1) { showAutosave('Elige un titulo mas descriptivo para la historia', 'error'); return; }
    if (!_tw.charId) { showAutosave('Selecciona un personaje', 'error'); return; }

    var mode = _tw.mode || 'roleplay';
    currentTopicMode = mode;
    var id = generateTopicId();

    var newTopic = {
        id: id, title: title,
        background: DEFAULT_TOPIC_BACKGROUND,
        weather: weather !== 'none' ? weather : undefined,
        mode: mode, roleCharacterId: null,
        createdBy: ((userNames && userNames[currentUserIndex]) || 'Jugador'),
        createdByIndex: currentUserIndex,
        date: new Date().toLocaleDateString(),
    };
    if (mode === 'rpg') {
        newTopic.characterLocks    = {}; newTopic.characterLocks[currentUserIndex]    = _tw.charId;
        newTopic.rpgCharacterLocks = {}; newTopic.rpgCharacterLocks[currentUserIndex] = _tw.charId;
    } else {
        newTopic.roleCharacterId = _tw.charId;
    }
    appData.topics.push(newTopic);

    var msgId = (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID()
              : (Date.now() + '_' + Math.random().toString(16).slice(2));
    appData.messages[id] = [{
        id: msgId, characterId: null, charName: 'Narrador',
        charColor: null, charAvatar: null, charSprite: null,
        text: text, isNarrator: true, userIndex: currentUserIndex,
        timestamp: new Date().toISOString(),
        weather: weather !== 'none' ? weather : undefined,
    }];

    selectedCharId = _tw.charId;
    localStorage.setItem('etheria_selected_char_' + currentUserIndex, _tw.charId);

    if (mode === 'rpg' && _tw.rpgClass) {
        var chr = (appData.characters || []).find(function(c) { return String(c.id) === String(_tw.charId); });
        if (chr && typeof ensureCharacterRpgProfile === 'function') {
            var profile = ensureCharacterRpgProfile(chr, id);
            if (profile) { profile.rpgClass = _tw.rpgClass; if (_tw.stats) Object.assign(profile.stats, _tw.stats); }
        }
        localStorage.setItem('etheria_stats_prompted_' + id + '_' + _tw.charId, '1');
    }

    hasUnsavedChanges = true;
    save({ silent: true });
    closeModal('topicModal');
    renderTopics();

    var topicRef = appData.topics.find(function(tp) { return String(tp.id) === String(id); });
    if (topicRef && typeof SupabaseStories !== 'undefined' && typeof SupabaseStories.upsertStory === 'function') {
        SupabaseStories.upsertStory(topicRef).then(function(result) {
            if (result.ok && result.storyId) {
                topicRef.storyId = result.storyId;
                hasUnsavedChanges = true; save({ silent: true });
            } else {
                var detail = (result && result.error) ? ': ' + result.error : '';
                if (typeof showAutosave === 'function') showAutosave('Historia local; no se guardo en Supabase' + detail, 'error');
            }
        }).catch(function() {
            if (typeof showAutosave === 'function') showAutosave('Historia local; error al guardar en Supabase', 'error');
        });
    }
    if (typeof SupabaseSync !== 'undefined') SupabaseSync.uploadProfileData().catch(function() {});

    pendingRoleTopicId = null;
    enterTopic(id);
}

window.topicWizardOpen        = topicWizardOpen;
window.topicWizardGoStep      = topicWizardGoStep;
window.topicWizardSelectMode  = topicWizardSelectMode;
window.topicWizardSelectChar  = topicWizardSelectChar;
window.topicWizardValidate    = topicWizardValidate;
window.topicWizardNext        = topicWizardNext;
window.topicWizardSelectClass = topicWizardSelectClass;
window.topicWizardAdjustStat  = topicWizardAdjustStat;
window.createTopicFromWizard  = createTopicFromWizard;
