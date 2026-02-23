'use strict';

    // UTILIDADES
    // ============================================
    function formatText(text) {
        if (!text) return '';
        text = text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
        text = text.replace(/\*(.*?)\*/g, '<em>$1</em>');
        return text;
    }

    function stripHtml(html) {
        if (!html) return '';
        const tmp = document.createElement('div');
        tmp.innerHTML = html;
        return tmp.textContent || tmp.innerText || '';
    }

    // ============================================

    // UTILIDADES
    // ============================================
    function save() {
        try {
            localStorage.setItem('etheria_data', JSON.stringify(appData));
            hasUnsavedChanges = false;
            showAutosave('Guardado', 'saved');
        } catch (e) {
            console.error('Error saving:', e);
            showAutosave('Error al guardar', 'error');
        }
    }

    function showAutosave(text, state) {
        const indicator = document.getElementById('autosaveIndicator');
        if (!indicator) return;

        const textEl = indicator.querySelector('.autosave-text');
        const iconEl = indicator.querySelector('.autosave-icon');

        if (textEl) textEl.textContent = text;
        indicator.className = `autosave-indicator visible ${state}`;

        if (iconEl) {
            if (state === 'saving') iconEl.textContent = '💾';
            else if (state === 'saved') iconEl.textContent = '✓';
            else if (state === 'error') iconEl.textContent = '✕';
        }

        setTimeout(() => {
            indicator.classList.remove('visible');
        }, 2000);
    }

    function openModal(id) {
        if(id === 'topicModal') {
            updateTopicSelect();
            resetTopicModalState();
        }
        const modal = document.getElementById(id);
        if (modal) modal.classList.add('active');
    }

    function closeModal(id) {
        const modal = document.getElementById(id);
        if (modal) modal.classList.remove('active');
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

    function quickSave() {
        save();
        showAutosave('Guardado rápido', 'saved');
    }

    function saveGameFromMenu() {
        save();
        alert('Partida guardada localmente');
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

                    if(!data || typeof data !== 'object') {
                        alert('Archivo inválido');
                        return;
                    }

                    if(!Array.isArray(data.topics) || !Array.isArray(data.characters)) {
                        alert('Formato de datos incorrecto');
                        return;
                    }

                    if(confirm('Esto reemplazará todos los datos actuales. ¿Continuar?')) {
                        appData = {
                            topics: Array.isArray(data.topics) ? data.topics : [],
                            characters: Array.isArray(data.characters) ? data.characters : [],
                            messages: (data.messages && typeof data.messages === 'object' && !Array.isArray(data.messages))
                                ? data.messages
                                : {},
                            affinities: (data.affinities && typeof data.affinities === 'object' && !Array.isArray(data.affinities))
                                ? data.affinities
                                : {}
                        };
                        hasUnsavedChanges = true;
                        save();
                        alert('Partida cargada ✓');
                        renderTopics();
                        renderGallery();
                    }
                } catch(err) {
                    alert('Error al cargar: ' + err.message);
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
