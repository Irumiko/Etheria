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
