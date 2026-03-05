// ============================================
// SISTEMA DE FAVORITOS
// ============================================
// Los favoritos se guardan en appData.favorites: { topicId: Set<messageId> }
// Se serializa como { topicId: [msgId, ...] }

function getFavoritesForTopic(topicId) {
    if (!appData.favorites) appData.favorites = {};
    const raw = appData.favorites[topicId];
    if (!raw) return new Set();
    return new Set(Array.isArray(raw) ? raw : []);
}

function saveFavoritesForTopic(topicId, favSet) {
    if (!appData.favorites) appData.favorites = {};
    appData.favorites[topicId] = Array.from(favSet);
}

function isMessageFavorite(topicId, messageId) {
    return getFavoritesForTopic(topicId).has(String(messageId));
}

function toggleFavoriteCurrentMessage() {
    if (!currentTopicId) return;
    const msgs = getTopicMessages(currentTopicId);
    const msg  = msgs[currentMessageIndex];
    if (!msg) return;

    const favs = getFavoritesForTopic(currentTopicId);
    const msgId = String(msg.id);

    if (favs.has(msgId)) {
        favs.delete(msgId);
        showAutosave('Favorito eliminado', 'info');
    } else {
        favs.add(msgId);
        showAutosave('⭐ Marcado como favorito', 'saved');
    }

    saveFavoritesForTopic(currentTopicId, favs);
    save({ silent: true });
    updateFavButton();
}

function updateFavButton() {
    const icon = document.getElementById('favMsgIcon');
    if (!icon) return;
    if (!currentTopicId) { icon.textContent = '☆'; return; }
    const msgs = getTopicMessages(currentTopicId);
    const msg  = msgs[currentMessageIndex];
    if (!msg) { icon.textContent = '☆'; return; }
    icon.textContent = isMessageFavorite(currentTopicId, String(msg.id)) ? '⭐' : '☆';
}

// ============================================
// HISTORIAL CON PESTAÑAS (TODOS / FAVORITOS)
// ============================================

let currentHistoryTab = 'all';

function switchHistoryTab(tab) {
    currentHistoryTab = tab;
    document.getElementById('histTabAll')?.classList.toggle('active', tab === 'all');
    document.getElementById('histTabFav')?.classList.toggle('active', tab === 'favorites');
    document.getElementById('histTabChapters')?.classList.toggle('active', tab === 'chapters');
    renderHistoryContent();
}

function renderHistoryContent() {
    const container = document.getElementById('historyContent');
    if (!container) return;

    const allMsgs = getTopicMessages(currentTopicId);
    let msgs = allMsgs;

    if (currentHistoryTab === 'favorites') {
        const favs = getFavoritesForTopic(currentTopicId);
        msgs = allMsgs.filter(m => favs.has(String(m.id)));
    }

    // ── Pestaña Capítulos ──────────────────────────
    if (currentHistoryTab === 'chapters') {
        renderChaptersNav(allMsgs, container);
        return;
    }

    if (msgs.length === 0) {
        container.onscroll = null;
        const emptyText = currentHistoryTab === 'favorites'
            ? 'No hay favoritos en esta historia.<br><span style="font-size:0.9rem;opacity:0.6">Usa el botón ☆ en los controles para marcar momentos.</span>'
            : 'No hay mensajes en esta historia.';
        container.innerHTML = `<div style="text-align:center;color:var(--text-muted);padding:3rem;line-height:2">${emptyText}</div>`;
        return;
    }

    // Renderizado virtualizado o simple según tamaño
    if (msgs.length > 50 && currentHistoryTab === 'all') {
        renderVirtualizedHistory(msgs, container);
    } else {
        // Para favoritos (generalmente pocos), renderizado simple con índice real
        container.onscroll = null;
        container.innerHTML = msgs.map((msg, i) => {
            const realIdx = allMsgs.indexOf(msg);
            return buildHistoryEntry(msg, realIdx, true);
        }).join('');
    }
}

// Sobrescribir openHistoryLog para que use el nuevo sistema
function openHistoryLog() {
    currentHistoryTab = 'all';
    document.getElementById('histTabAll')?.classList.add('active');
    document.getElementById('histTabFav')?.classList.remove('active');
    renderHistoryContent();
    openModal('historyModal');
}

// ============================================
// DIARIO DE SESIÓN
// ============================================
// Se guarda en appData.journals: { topicId: string }

function openJournal() {
    if (!currentTopicId) {
        showAutosave('Abre una historia primero', 'error');
        return;
    }

    const topic = appData.topics.find(t => t.id === currentTopicId);
    const meta  = document.getElementById('journalMeta');
    const textarea = document.getElementById('journalTextarea');
    const indicator = document.getElementById('journalSavedIndicator');

    if (meta) meta.textContent = topic ? `📖 ${topic.title}` : '';
    if (indicator) indicator.textContent = '';

    if (!appData.journals) appData.journals = {};
    if (textarea) textarea.value = appData.journals[currentTopicId] || '';

    openModal('journalModal');
    setTimeout(() => textarea?.focus(), 100);
}

function closeJournal() {
    closeModal('journalModal');
}

function saveJournal() {
    if (!currentTopicId) return;
    const textarea = document.getElementById('journalTextarea');
    if (!textarea) return;

    if (!appData.journals) appData.journals = {};
    appData.journals[currentTopicId] = textarea.value;

    save({ silent: true });

    const indicator = document.getElementById('journalSavedIndicator');
    if (indicator) {
        indicator.textContent = '✓ Guardado';
        indicator.style.color = 'var(--accent-sage)';
        setTimeout(() => { indicator.textContent = ''; }, 2500);
    }
}

function clearJournal() {
    const textarea = document.getElementById('journalTextarea');
    if (!textarea || !textarea.value.trim()) return;
    openConfirmModal('¿Limpiar todas las notas de esta historia?', 'Limpiar').then(ok => {
        if (!ok) return;
        textarea.value = '';
        if (!appData.journals) appData.journals = {};
        appData.journals[currentTopicId] = '';
        save({ silent: true });
        const indicator = document.getElementById('journalSavedIndicator');
        if (indicator) { indicator.textContent = 'Notas limpiadas'; indicator.style.color = 'var(--text-muted)'; setTimeout(() => { indicator.textContent = ''; }, 2000); }
    });
}

// Autoguardado del diario al escribir (debounced 1.5s)
let journalSaveTimer = null;
document.addEventListener('DOMContentLoaded', () => {
    const textarea = document.getElementById('journalTextarea');
    if (!textarea) return;
    textarea.addEventListener('input', () => {
        clearTimeout(journalSaveTimer);
        const indicator = document.getElementById('journalSavedIndicator');
        if (indicator) { indicator.textContent = '...'; indicator.style.color = 'var(--text-muted)'; }
        journalSaveTimer = setTimeout(() => {
            if (currentTopicId) {
                if (!appData.journals) appData.journals = {};
                appData.journals[currentTopicId] = textarea.value;
                save({ silent: true });
                if (indicator) { indicator.textContent = '✓ Guardado'; indicator.style.color = 'var(--accent-sage)'; setTimeout(() => { indicator.textContent = ''; }, 2000); }
            }
        }, 1500);
    });
});

// ============================================
// SISTEMA DE REACCIONES
// ============================================
// appData.reactions: { topicId: { msgId: { userIndex: emoji } } }
// Un emoji por usuario por mensaje. Toggle: misma emoji = quitar, otra = cambiar.

const REACTION_EMOJIS = ['❤️','😂','😱','🔥','👏','😢'];

function getReactionsForTopic(topicId) {
    if (!appData.reactions) appData.reactions = {};
    if (!appData.reactions[topicId]) appData.reactions[topicId] = {};
    return appData.reactions[topicId];
}

function getMyReactionForMessage(topicId, msgId) {
    const topicReactions = getReactionsForTopic(topicId);
    const msgReactions   = topicReactions[String(msgId)] || {};
    return msgReactions[String(currentUserIndex)] || null;
}

function getReactionSummary(topicId, msgId) {
    const topicReactions = getReactionsForTopic(topicId);
    const msgReactions   = topicReactions[String(msgId)] || {};
    const counts = {};
    Object.values(msgReactions).forEach(emoji => {
        counts[emoji] = (counts[emoji] || 0) + 1;
    });
    return counts; // { '❤️': 2, '🔥': 1, ... }
}

function toggleReaction(emoji) {
    if (!currentTopicId) return;
    const msgs = getTopicMessages(currentTopicId);
    const msg  = msgs[currentMessageIndex];
    if (!msg) return;

    const topicReactions = getReactionsForTopic(currentTopicId);
    const msgId = String(msg.id);
    if (!topicReactions[msgId]) topicReactions[msgId] = {};

    const current = topicReactions[msgId][String(currentUserIndex)];
    if (current === emoji) {
        // Quitar reacción
        delete topicReactions[msgId][String(currentUserIndex)];
        if (Object.keys(topicReactions[msgId]).length === 0) delete topicReactions[msgId];
    } else {
        // Añadir o cambiar
        topicReactions[msgId][String(currentUserIndex)] = emoji;
    }

    if (!appData.reactions) appData.reactions = {};
    appData.reactions[currentTopicId] = topicReactions;
    save({ silent: true });

    updateReactionDisplay();
    closeReactionPicker();
}

function toggleReactionPicker() {
    const picker = document.getElementById('vnReactionPicker');
    if (!picker) return;
    const isOpen = picker.style.display !== 'none';
    if (isOpen) {
        closeReactionPicker();
    } else {
        openReactionPicker();
    }
}

function openReactionPicker() {
    const picker = document.getElementById('vnReactionPicker');
    if (!picker) return;

    // Resaltar la reacción actual del usuario
    if (currentTopicId) {
        const msgs = getTopicMessages(currentTopicId);
        const msg  = msgs[currentMessageIndex];
        const myReaction = msg ? getMyReactionForMessage(currentTopicId, String(msg.id)) : null;
        picker.querySelectorAll('.reaction-pick-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.emoji === myReaction);
        });
    }

    picker.style.display = 'flex';
    picker.classList.add('reaction-picker-in');
    setTimeout(() => picker.classList.remove('reaction-picker-in'), 300);

    // Cerrar al hacer clic fuera
    setTimeout(() => {
        document.addEventListener('click', _closeReactionPickerOnOutsideClick, { once: true, capture: true });
    }, 50);
}

function closeReactionPicker() {
    const picker = document.getElementById('vnReactionPicker');
    if (picker) picker.style.display = 'none';
}

function _closeReactionPickerOnOutsideClick(e) {
    const picker    = document.getElementById('vnReactionPicker');
    const cornerBtn = document.getElementById('vnReactionCornerBtn');
    if (!picker) return;
    if (!picker.contains(e.target) && !cornerBtn?.contains(e.target)) {
        closeReactionPicker();
    }
}

function updateReactionDisplay() {
    const display = document.getElementById('vnReactionDisplay');
    const btnIcon = document.getElementById('vnReactionBtnIcon');
    if (!display) return;

    if (!currentTopicId) { display.innerHTML = ''; return; }
    const msgs = getTopicMessages(currentTopicId);
    const msg  = msgs[currentMessageIndex];
    if (!msg) { display.innerHTML = ''; return; }

    const summary    = getReactionSummary(currentTopicId, String(msg.id));
    const myReaction = getMyReactionForMessage(currentTopicId, String(msg.id));

    // Actualizar ícono oculto (legacy)
    if (btnIcon) btnIcon.textContent = myReaction || '🙂';
    // Actualizar corner badge
    const cornerBtn  = document.getElementById('vnReactionCornerBtn');
    const cornerActive = document.getElementById('vnReactionCornerActive');
    if (cornerActive) {
        if (myReaction) {
            cornerActive.textContent = myReaction;
            cornerActive.style.display = 'inline';
            if (cornerBtn) {
                cornerBtn.style.borderColor = 'rgba(201,168,108,0.7)';
                cornerBtn.style.color = 'rgba(220,180,80,0.9)';
            }
        } else {
            cornerActive.style.display = 'none';
            if (cornerBtn) {
                cornerBtn.style.borderColor = '';
                cornerBtn.style.color = '';
            }
        }
    }

    const entries = Object.entries(summary);
    if (entries.length === 0) {
        display.innerHTML = '';
        return;
    }

    display.innerHTML = entries
        .sort((a, b) => b[1] - a[1])
        .map(([emoji, count]) => {
            const isMine = emoji === myReaction;
            return `<span class="vn-reaction-chip${isMine ? ' mine' : ''}" onclick="toggleReaction('${emoji}')" title="${count} reacción${count > 1 ? 'es' : ''}">${emoji}${count > 1 ? `<span class="reaction-count">${count}</span>` : ''}</span>`;
        })
        .join('');
}

// ============================================
// EXPORTAR HISTORIA COMO DOCUMENTO
// ============================================

function exportHistoryAsDocument() {
    if (!currentTopicId) {
        showAutosave('Abre una historia primero', 'error');
        return;
    }

    const topic = appData.topics.find(t => t.id === currentTopicId);
    const msgs  = getTopicMessages(currentTopicId);

    if (!msgs.length) {
        showAutosave('La historia está vacía', 'info');
        return;
    }

    const title   = topic?.title  || 'Historia sin título';
    const mode    = topic?.mode === 'rpg' ? 'RPG' : 'Clásico';
    const created = topic?.createdAt ? new Date(topic.createdAt).toLocaleDateString('es-ES') : '';
    const wordCount = msgs.reduce((acc, m) => acc + (m.text || '').split(/\s+/).filter(Boolean).length, 0);

    const lines = [];

    // Cabecera
    lines.push(`${'═'.repeat(60)}`);
    lines.push(title.toUpperCase());
    lines.push(`${'═'.repeat(60)}`);
    lines.push(`Modo: ${mode}${created ? `  ·  Creada: ${created}` : ''}`);
    lines.push(`Mensajes: ${msgs.length}  ·  Palabras: ${wordCount.toLocaleString()}`);
    lines.push('');

    // Mensajes
    msgs.forEach((msg, i) => {
        // Separador de capítulo
        if (msg.chapter) {
            lines.push('');
            lines.push(`${'─'.repeat(50)}`);
            lines.push(`  ✦  ${msg.chapter.title.toUpperCase()}  ✦`);
            lines.push(`${'─'.repeat(50)}`);
            lines.push('');
        }

        // Separador de escena
        if (msg.sceneChange) {
            lines.push('');
            lines.push(`  [ ${msg.sceneChange.title} ]`);
            lines.push('');
        }

        const speaker  = msg.isNarrator || !msg.characterId ? 'Narrador' : (msg.charName || 'Personaje');
        const isNarrator = msg.isNarrator || !msg.characterId;

        // Texto: si es narrador, sangría; si es personaje, "Nombre: texto"
        const rawText = (msg.text || '')
            .replace(/\*\*(.*?)\*\*/g, '$1')   // quitar negrita markdown
            .replace(/\*(.*?)\*/g, '$1')        // quitar cursiva
            .trim();

        if (isNarrator) {
            // Párrafo narrativo sangrado
            rawText.split('\n').forEach(line => {
                if (line.trim()) lines.push(`    ${line.trim()}`);
            });
        } else {
            lines.push(`${speaker}:`);
            rawText.split('\n').forEach(line => {
                if (line.trim()) lines.push(`    "${line.trim()}"`);
            });
        }

        // Reacciones
        const summary = getReactionSummary(currentTopicId, String(msg.id));
        const reactionStr = Object.entries(summary).map(([e, c]) => c > 1 ? `${e}×${c}` : e).join(' ');
        if (reactionStr) lines.push(`    [ ${reactionStr} ]`);

        lines.push('');
    });

    // Pie
    lines.push(`${'─'.repeat(60)}`);
    lines.push(`Fin de "${title}"`);
    lines.push(`Exportado desde Etheria · ${new Date().toLocaleDateString('es-ES')}`);

    const content  = lines.join('\n');
    const safeName = title.replace(/[^a-zA-Z0-9áéíóúüñÁÉÍÓÚÜÑ\s_-]/g, '').replace(/\s+/g, '_').slice(0, 60);
    const filename = `${safeName}.txt`;

    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 1000);

    showAutosave(`📄 "${filename}" descargado`, 'saved');
}

// ============================================
// NAVEGADOR DE CAPÍTULOS Y ESCENAS
// ============================================

function renderChaptersNav(msgs, container) {
    container.onscroll = null;

    // Recolectar todos los puntos de inflexión (escenas + capítulos)
    const waypoints = [];

    // Primer mensaje como punto de inicio
    if (msgs.length > 0) {
        waypoints.push({
            type:  'start',
            title: 'Inicio',
            idx:   0,
            msg:   msgs[0],
        });
    }

    msgs.forEach((msg, idx) => {
        if (msg.sceneChange) {
            waypoints.push({ type: 'scene',   title: msg.sceneChange.title, idx, msg });
        }
        if (msg.chapter) {
            waypoints.push({ type: 'chapter', title: msg.chapter.title,     idx, msg });
        }
    });

    if (waypoints.length <= 1) {
        container.innerHTML = `<div style="text-align:center;color:var(--text-muted);padding:3rem;line-height:2">
            No hay capítulos ni escenas marcados aún.<br>
            <span style="font-size:0.85rem;opacity:0.6">Usa el botón ✒ para añadir capítulos o escenas a la historia.</span>
        </div>`;
        return;
    }

    const itemsHtml = waypoints.map((wp, wi) => {
        const icon  = wp.type === 'chapter' ? '📖' : (wp.type === 'start' ? '▶' : '🎬');
        const date  = wp.msg ? new Date(wp.msg.timestamp).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' }) : '';
        const msgCount = wi < waypoints.length - 1
            ? waypoints[wi + 1].idx - wp.idx
            : msgs.length - wp.idx;
        const badge = msgCount > 0
            ? `<span class="chapter-nav-badge">${msgCount} msg</span>`
            : '';

        return `
        <div class="chapter-nav-item chapter-nav-${wp.type}" onclick="jumpToChapterWaypoint(${wp.idx})">
            <div class="chapter-nav-icon">${icon}</div>
            <div class="chapter-nav-content">
                <div class="chapter-nav-title">${escapeHtml(wp.title)}</div>
                <div class="chapter-nav-meta">${date ? `${date} · ` : ''}Mensaje ${wp.idx + 1}${badge}</div>
            </div>
            <div class="chapter-nav-arrow">›</div>
        </div>`;
    }).join('');

    container.innerHTML = `
        <div class="chapter-nav-intro">Haz clic en cualquier punto para ir directamente.</div>
        ${itemsHtml}
    `;
}

function jumpToChapterWaypoint(msgIdx) {
    closeModal('historyModal');
    currentMessageIndex = Math.max(0, Math.min(msgIdx, getTopicMessages(currentTopicId).length - 1));
    showCurrentMessage('forward');
}
