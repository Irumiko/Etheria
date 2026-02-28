// Utilidades generales de app: guardado, modales, tema visual y ajustes de lectura.
// UTILIDADES
// ============================================
function save() {
    const wasUnsaved = hasUnsavedChanges;

    try {
        persistPartitionedData();
        setLocalProfileUpdatedAt(currentUserIndex);
        hasUnsavedChanges = false;
        cloudUnsyncedChanges = true;
        updateSyncButtonState('pending-upload', 'Subir cambios');
        updateCloudSyncIndicator('degraded', 'Pendiente de subida');
        showAutosave('Guardado', 'saved');
        if (typeof playSoundSave === 'function') playSoundSave();
        return true;
    } catch (e) {
        hasUnsavedChanges = wasUnsaved;
        console.error('Error saving:', e);
        showAutosave('Error al guardar: almacenamiento lleno o no disponible', 'error');
        return false;
    }
}


function refreshUIAfterCloudLoad() {
    if (typeof renderTopics === 'function') renderTopics();
    if (typeof renderGallery === 'function') renderGallery();
    if (currentTopicId && typeof showCurrentMessage === 'function') showCurrentMessage();
}

function showAutosave(text, state) {
    const indicator = document.getElementById('autosaveIndicator');
    if (!indicator) return;

    const textEl = indicator.querySelector('.autosave-text');
    const iconEl = indicator.querySelector('.autosave-icon');

    if (textEl) textEl.textContent = text;
    indicator.className = `autosave-indicator visible ${state}`;

    if (iconEl) {
        if (state === 'saved') iconEl.textContent = '🜚';
        else if (state === 'error') iconEl.textContent = '🜄';
        else if (state === 'info') iconEl.textContent = '🜃';
        else iconEl.textContent = '🜂';
    }

    setTimeout(() => {
        indicator.classList.remove('visible');
    }, 2000);
}

function openModal(id) {
    if(id === 'topicModal') {
        updateTopicModeUI();
    }
    const modal = document.getElementById(id);
    if (modal) {
        lastFocusedElement = document.activeElement;
        modal.classList.add('active');
        document.body.classList.add('modal-open');

        const firstFocusable = modal.querySelector('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
        if (firstFocusable) firstFocusable.focus();
    }
}

function closeModal(id) {
    const modal = document.getElementById(id);
    if (modal) modal.classList.remove('active');

    if (id === 'roleCharacterModal' && pendingRoleTopicId) {
        appData.topics = appData.topics.filter(t => t.id !== pendingRoleTopicId);
        delete appData.messages[pendingRoleTopicId];
        pendingRoleTopicId = null;
        hasUnsavedChanges = true;
        save();
        renderTopics();
    }

    const anyModalOpen = document.querySelector('.modal-overlay.active');
    if (!anyModalOpen) {
        document.body.classList.remove('modal-open');
        if (lastFocusedElement && typeof lastFocusedElement.focus === 'function') {
            lastFocusedElement.focus();
        }
    }
}

function changeUser() {
    const newName = prompt('Nuevo nombre:', userNames[currentUserIndex]);
    if(newName?.trim()) {
        userNames[currentUserIndex] = newName.trim();
        localStorage.setItem('etheria_user_names', JSON.stringify(userNames));

        const currentUserDisplay = document.getElementById('currentUserDisplay');
        if (currentUserDisplay) currentUserDisplay.textContent = newName.trim();

        save();
        renderUserCards();
    }
}

function toggleTheme() {
    const html = document.documentElement;
    const currentTheme = html.getAttribute('data-theme');
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    html.setAttribute('data-theme', newTheme);
    localStorage.setItem('etheria_theme', newTheme);

    generateParticles();
}

function deleteCurrentTopic() {
    if(!confirm('¿Borrar esta historia?')) return;

    appData.topics = appData.topics.filter(t => t.id !== currentTopicId);
    delete appData.messages[currentTopicId];
    delete appData.affinities[currentTopicId];

    currentTopicId = null;
    hasUnsavedChanges = true;
    save();
    backToTopics();
}

async function manualSyncFromScene() {
    if (hasUnsavedChanges) save();
    await syncBidirectional({ silent: false, allowRemotePrompt: true });
}

function quickSave() {
    const saved = save();
    showAutosave(saved ? 'Guardado rápido' : 'Error al guardar rápido', saved ? 'saved' : 'error');
}

function saveGameFromMenu() {
    // Recopilar mensajes de todos los topics para el archivo completo
    const allMessages = {};
    appData.topics.forEach(t => {
        allMessages[t.id] = getTopicMessages(t.id);
    });

    const exportPayload = {
        version: 2,
        exportedAt: new Date().toISOString(),
        profileName: userNames[currentUserIndex] || 'Jugador',
        topics: appData.topics,
        characters: appData.characters,
        messages: allMessages,
        affinities: appData.affinities
    };

    const blob = new Blob([JSON.stringify(exportPayload, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    const safeName = (userNames[currentUserIndex] || 'partida').replace(/[^a-z0-9]/gi, '_').toLowerCase();
    a.href = URL.createObjectURL(blob);
    a.download = `etheria_${safeName}_${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(a.href);

    showAutosave('Archivo de guardado descargado', 'saved');
}

function loadGameFromMenu() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = e => {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = event => {
            try {
                const data = JSON.parse(event.target.result);
                validateImportedData(data);

                const profileInfo = data.profileName ? ` (perfil: ${data.profileName})` : '';
                const exportDate = data.exportedAt ? `\nGuardado el: ${new Date(data.exportedAt).toLocaleString()}` : '';

                if (confirm(`¿Cargar este archivo de guardado?${profileInfo}${exportDate}\n\nEsto reemplazará todos los datos actuales del perfil activo.`)) {
                    appData.topics     = Array.isArray(data.topics)     ? data.topics     : [];
                    appData.characters = Array.isArray(data.characters) ? data.characters : [];
                    appData.messages   = (data.messages   && typeof data.messages   === 'object' && !Array.isArray(data.messages))   ? data.messages   : {};
                    appData.affinities = (data.affinities && typeof data.affinities === 'object' && !Array.isArray(data.affinities)) ? data.affinities : {};

                    hasUnsavedChanges = true;
                    save();
                    showAutosave('Partida cargada correctamente', 'saved');
                    renderTopics();
                    renderGallery();
                }
            } catch (err) {
                alert('Error al cargar el archivo: ' + err.message);
            }
        };
        reader.readAsText(file);
    };
    input.click();
}

function exportData() {
    const blob = new Blob([JSON.stringify(appData, null, 2)], {type: 'application/json'});
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `etheria_${new Date().toISOString().split('T')[0]}.json`;
    a.click();
}

function deleteCharFromModal() {
    const id = document.getElementById('editCharacterId')?.value;
    if(!id) return;
    if(!confirm('¿Borrar personaje?')) return;

    if (selectedCharId === id) {
        selectedCharId = null;
        localStorage.removeItem(`etheria_selected_char_${currentUserIndex}`);
    }

    appData.characters = appData.characters.filter(c => c.id !== id);
    hasUnsavedChanges = true;
    save();
    closeModal('characterModal');
    resetCharForm();
    renderGallery();
}

// ============================================
// AJUSTES
// ============================================
function openSettings() {
    const panel = document.getElementById('settingsPanel');
    if (panel) panel.classList.add('active');
}

function closeSettings() {
    const panel = document.getElementById('settingsPanel');
    if (panel) panel.classList.remove('active');
}

function updateTextSpeed(val) {
    textSpeed = 110 - parseInt(val);
    localStorage.setItem('etheria_text_speed', textSpeed);

    const speedValue = document.getElementById('speedValue');
    if (speedValue) {
        const labels = ['Rápido', 'Normal', 'Lento'];
        const idx = val < 40 ? 0 : val < 70 ? 1 : 2;
        speedValue.textContent = labels[idx];
    }
}

function updateFontSize(val) {
    document.documentElement.style.setProperty('--font-size-base', val + 'px');
    localStorage.setItem('etheria_font_size', val);
}

function setAtmosphere(filter, element) {
    const vnSection = document.getElementById('vnSection');
    if (!vnSection) return;

    vnSection.classList.remove('sepia', 'bw', 'cinematic');
    if (filter !== 'none') vnSection.classList.add(filter);

    document.querySelectorAll('.filter-btn').forEach(btn => btn.classList.remove('active'));
    const btn = element || document.querySelector(`.filter-btn[onclick*="'${filter}'"]`);
    if (btn) btn.classList.add('active');
}
