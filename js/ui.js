'use strict';

    // NAVEGACIÓN
    // ============================================
    function confirmUnsavedChanges(callback) {
        if (hasUnsavedChanges) {
            if (confirm('Tienes cambios sin guardar. ¿Deseas guardar antes de salir?')) {
                save();
                callback();
            } else if (confirm('¿Descartar cambios?')) {
                hasUnsavedChanges = false;
                callback();
            }
        } else {
            callback();
        }
    }

    function showSection(section) {
        if (isLoading) return;

        const mainMenu = document.getElementById('mainMenu');
        if (mainMenu) mainMenu.classList.add('hidden');

        document.querySelectorAll('.game-section').forEach(s => s.classList.remove('active'));

        if(section === 'topics') {
            const topicsSection = document.getElementById('topicsSection');
            if (topicsSection) topicsSection.classList.add('active');
            renderTopics();
        } else if(section === 'gallery') {
            const gallerySection = document.getElementById('gallerySection');
            if (gallerySection) gallerySection.classList.add('active');
            renderGallery();
        } else if(section === 'options') {
            const optionsSection = document.getElementById('optionsSection');
            if (optionsSection) optionsSection.classList.add('active');
        }
    }

    function backToMenu() {
        confirmUnsavedChanges(() => {
            document.querySelectorAll('.game-section').forEach(s => s.classList.remove('active'));
            const mainMenu = document.getElementById('mainMenu');
            if (mainMenu) {
                mainMenu.classList.remove('hidden');
                generateParticles();
            }
            stopTypewriter();
        });
    }

    function backToTopics() {
        confirmUnsavedChanges(() => {
            const vnSpriteContainer = document.getElementById('vnSpriteContainer');
            if (vnSpriteContainer) vnSpriteContainer.innerHTML = '';
            stopTypewriter();

            const vnSection = document.getElementById('vnSection');
            const topicsSection = document.getElementById('topicsSection');

            if (vnSection) vnSection.classList.remove('active');
            if (topicsSection) topicsSection.classList.add('active');

            // Limpiar efectos de clima
            const weatherContainer = document.getElementById('weatherContainer');
            if (weatherContainer) weatherContainer.innerHTML = '';

            currentTopicId = null;
            editingMessageId = null;
            currentWeather = 'none';
            renderTopics();
        });
    }

    // ============================================

    // GALERÍA
    // ============================================
    function renderGallery() {
        const grid = document.getElementById('galleryGrid');
        if (!grid) return;

        const searchInput = document.getElementById('gallerySearch');
        const sortSelect = document.getElementById('gallerySort');

        const searchTerm = (searchInput?.value || '').toLowerCase();
        const sortBy = sortSelect?.value || 'default';

        let chars = [...appData.characters];

        if (searchTerm) {
            chars = chars.filter(c =>
                (c.name?.toLowerCase().includes(searchTerm)) ||
                (c.race?.toLowerCase().includes(searchTerm)) ||
                (userNames[c.userIndex]?.toLowerCase().includes(searchTerm))
            );
        }

        if (sortBy === 'owner') {
            chars.sort((a, b) => a.userIndex - b.userIndex || a.name.localeCompare(b.name));
        } else if (sortBy === 'name') {
            chars.sort((a, b) => a.name.localeCompare(b.name));
        } else if (sortBy === 'race') {
            chars.sort((a, b) => (a.race || '').localeCompare(b.race || ''));
        }

        const galleryCount = document.getElementById('galleryCount');
        if (galleryCount) galleryCount.textContent = `${chars.length} personaje${chars.length !== 1 ? 's' : ''}`;

        if (chars.length === 0) {
            grid.innerHTML = '<div style="grid-column: 1 / -1; text-align: center; padding: 3rem; color: var(--text-muted);">No se encontraron personajes</div>';
            return;
        }

        grid.innerHTML = chars.map(c => {
            const genderIcon = c.gender === 'Femenino' ? '♀️' : c.gender === 'Masculino' ? '♂️' : '⚪';
            const ownerName = userNames[c.userIndex] || 'Desconocido';

            return `
                <div class="character-card" onclick="openSheet('${c.id}')">
                    <div class="character-card-avatar">
                        ${c.avatar ? `<img src="${escapeHtml(c.avatar)}" onerror="this.style.display='none'; this.parentElement.innerHTML='<div class=\\'placeholder\\'>${c.name[0]}</div>'">` : `<div class="placeholder">${c.name[0]}</div>`}
                    </div>
                    <div class="character-card-info">
                        <div class="character-card-name">${escapeHtml(c.name)}</div>
                        <div class="character-card-meta">
                            <span class="gender-icon">${genderIcon}</span>
                            <span>${escapeHtml(c.race) || 'Sin raza'}</span>
                        </div>
                    </div>
                    <div class="character-card-hover-info">
                        <div>Por: ${escapeHtml(ownerName)}</div>
                        <div>${escapeHtml(c.race) || 'Sin raza'}</div>
                    </div>
                </div>
            `;
        }).join('');
    }

    // ============================================

    // FICHA DE PERSONAJE
    // ============================================
    function openSheet(id) {
        currentSheetCharId = id;
        const c = appData.characters.find(ch => ch.id === id);
        if(!c) return;

        const sheetName = document.getElementById('sheetName');
        const sheetOwner = document.getElementById('sheetOwner');
        const sheetAvatar = document.getElementById('sheetAvatar');
        const sheetQuickStats = document.getElementById('sheetQuickStats');

        if (sheetName) sheetName.textContent = c.name;
        if (sheetOwner) sheetOwner.textContent = `Por ${c.owner || userNames[c.userIndex]}`;

        if (sheetAvatar) {
            sheetAvatar.innerHTML = c.avatar ? `<img src="${escapeHtml(c.avatar)}" onerror="this.textContent='${c.name[0]}'">` : c.name[0];
        }

        if (sheetQuickStats) {
            sheetQuickStats.innerHTML = `
                <span class="quick-stat">${escapeHtml(c.race) || 'Sin raza'}</span>
                <span class="quick-stat">${c.gender || '?'}</span>
                <span class="quick-stat">${c.age || '?'} años</span>
                <span class="quick-stat" style="background: ${getAlignmentColor(c.alignment)}; color: white;">${alignments[c.alignment] || 'Neutral'}</span>
            `;
        }

        const profileGrid = document.getElementById('profileGrid');
        if (profileGrid) {
            profileGrid.innerHTML = `
                <div class="profile-item"><div class="profile-label">Nombre</div><div class="profile-value">${escapeHtml(c.name)}</div></div>
                <div class="profile-item"><div class="profile-label">Apellido</div><div class="profile-value">${escapeHtml(c.lastName) || '-'}</div></div>
                <div class="profile-item"><div class="profile-label">Edad</div><div class="profile-value">${c.age || '-'}</div></div>
                <div class="profile-item"><div class="profile-label">Raza</div><div class="profile-value">${escapeHtml(c.race) || '-'}</div></div>
                <div class="profile-item"><div class="profile-label">Género</div><div class="profile-value">${c.gender || '-'}</div></div>
                <div class="profile-item"><div class="profile-label">Alineamiento</div><div class="profile-value">${alignments[c.alignment] || '-'}</div></div>
                <div class="profile-item full-width"><div class="profile-label">Ocupación</div><div class="profile-value">${escapeHtml(c.job) || '-'}</div></div>
                <div class="profile-item full-width" style="margin-top: 1rem;">
                    <div class="profile-label">Descripción Física</div>
                    <div style="margin-top: 0.5rem; line-height: 1.6;">${escapeHtml(c.basic) || 'Sin descripción.'}</div>
                </div>
            `;
        }

        const profilePersonality = document.getElementById('profilePersonality');
        const profileHistory = document.getElementById('profileHistory');

        if (profilePersonality) profilePersonality.textContent = c.personality || 'Sin datos de personalidad.';
        if (profileHistory) profileHistory.textContent = c.history || 'Sin historia registrada.';

        const sheetEditBtn = document.getElementById('sheetEditBtn');
        if (sheetEditBtn) sheetEditBtn.style.display = c.userIndex === currentUserIndex ? 'inline-block' : 'none';

        document.querySelectorAll('.sheet-tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));

        const firstTab = document.querySelector('.sheet-tab');
        if (firstTab) firstTab.classList.add('active');

        const tabProfile = document.getElementById('tab-profile');
        if (tabProfile) tabProfile.classList.add('active');

        openModal('sheetModal');
    }

    function getAlignmentColor(code) {
        const colors = {
            'LB': '#4a90e2', 'LN': '#7f8c8d', 'LM': '#2c3e50',
            'NB': '#f39c12', 'NN': '#95a5a6', 'NM': '#8e44ad',
            'CB': '#e74c3c', 'CN': '#e67e22', 'CM': '#c0392b'
        };
        return colors[code] || '#95a5a6';
    }

    function switchTab(tabName) {
        document.querySelectorAll('.sheet-tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));

        if (event && event.target) event.target.classList.add('active');

        const tab = document.getElementById(`tab-${tabName}`);
        if (tab) tab.classList.add('active');
    }

    // ============================================

    // EDITOR SPLIT-SCREEN
    // ============================================
    function openCharacterEditor(charId = null) {
        resetCharForm();

        if (charId) {
            const c = appData.characters.find(ch => ch.id === charId);
            if (!c || c.userIndex !== currentUserIndex) return;

            document.getElementById('editCharacterId').value = c.id;
            document.getElementById('charName').value = c.name || '';
            document.getElementById('charLastName').value = c.lastName || '';
            document.getElementById('charAge').value = c.age || '';
            document.getElementById('charRace').value = c.race || '';
            document.getElementById('charGender').value = c.gender || '';
            document.getElementById('charAlignment').value = c.alignment || '';
            document.getElementById('charJob').value = c.job || '';
            document.getElementById('charColor').value = c.color || '#8b7355';
            document.getElementById('charAvatar').value = c.avatar || '';
            document.getElementById('charSprite').value = c.sprite || '';
            document.getElementById('charBasic').value = c.basic || '';
            document.getElementById('charPersonality').value = c.personality || '';
            document.getElementById('charHistory').value = c.history || '';
            document.getElementById('charNotes').value = c.notes || '';

            const deleteBtn = document.getElementById('deleteCharBtn');
            if (deleteBtn) deleteBtn.style.display = 'inline-block';

            document.querySelectorAll('.gender-option').forEach(opt => opt.classList.remove('selected'));
            const genderMap = { 'Femenino': 0, 'Masculino': 1, 'No Binario': 2 };
            const genderIdx = genderMap[c.gender];
            if (genderIdx !== undefined) {
                const options = document.querySelectorAll('.gender-option');
                if (options[genderIdx]) options[genderIdx].classList.add('selected');
            }
        } else {
            document.getElementById('editCharacterId').value = '';
            const deleteBtn = document.getElementById('deleteCharBtn');
            if (deleteBtn) deleteBtn.style.display = 'none';
        }

        updatePreview();
        switchEditorTab('identity', document.querySelector('.editor-tab'));
        openModal('characterModal');
    }

    function switchEditorTab(tabName, element) {
        currentEditorTab = tabName;

        document.querySelectorAll('.editor-tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.editor-panel').forEach(p => p.classList.remove('active'));

        if (element) element.classList.add('active');

        const panel = document.getElementById(`editor-tab-${tabName}`);
        if (panel) panel.classList.add('active');
    }

    function selectGender(gender, element) {
        document.querySelectorAll('.gender-option').forEach(opt => opt.classList.remove('selected'));
        element.classList.add('selected');
        document.getElementById('charGender').value = gender;
    }

    function updatePreview() {
        const name = document.getElementById('charName')?.value || 'Nuevo Personaje';
        const avatar = document.getElementById('charAvatar')?.value;

        const previewName = document.getElementById('editorPreviewName');
        if (previewName) previewName.textContent = name;

        const previewImg = document.getElementById('editorPreviewImage');
        if (previewImg) {
            if (avatar) {
                previewImg.innerHTML = `<img src="${escapeHtml(avatar)}" style="width: 100%; height: 100%; object-fit: cover;" onerror="this.style.display='none'; this.parentElement.innerHTML='<span style=\\'font-size: 5rem;\\'>👤</span>'">`;
            } else {
                previewImg.innerHTML = '<span style="font-size: 5rem;">👤</span>';
            }
        }
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

    function setAtmosphere(filter) {
        const vnSection = document.getElementById('vnSection');
        if (!vnSection) return;

        vnSection.classList.remove('sepia', 'bw', 'cinematic');
        if (filter !== 'none') vnSection.classList.add(filter);

        document.querySelectorAll('.filter-btn').forEach(btn => btn.classList.remove('active'));
        if (event && event.target) event.target.classList.add('active');
    }
