const CharacterEditor = {
    currentId: null,

    open(charId = null) {
        this.resetForm();
        this.currentId = charId;

        if (charId) {
            const c = Data.getCharacter(charId);
            if (!c || c.userIndex !== Data.state.currentUserIndex) return;
            this.populateForm(c);
        }

        this.updatePreview();
        this.switchTab('identity', document.querySelector('.editor-tab'));
        Modals.open('characterModal');
    },

    resetForm() {
        this.currentId = null;
        const deleteBtn = document.getElementById('deleteCharBtn');
        if (deleteBtn) deleteBtn.style.display = 'none';

        document.querySelectorAll('#characterModal input:not([type="color"]), #characterModal textarea, #characterModal select').forEach(i => i.value = '');
        
        const colorInput = document.getElementById('charColor');
        if (colorInput) colorInput.value = '#8b7355';
        
        document.querySelectorAll('.gender-option').forEach(opt => opt.classList.remove('selected'));
    },

    populateForm(c) {
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

        // Select gender
        document.querySelectorAll('.gender-option').forEach(opt => opt.classList.remove('selected'));
        const genderMap = { 'Femenino': 0, 'Masculino': 1, 'No Binario': 2 };
        const genderIdx = genderMap[c.gender];
        if (genderIdx !== undefined) {
            const options = document.querySelectorAll('.gender-option');
            if (options[genderIdx]) options[genderIdx].classList.add('selected');
        }
    },

    save() {
        const name = document.getElementById('charName')?.value.trim();
        if (!name) {
            alert('Nombre obligatorio');
            return;
        }

        const id = this.currentId || Date.now().toString();
        
        const charObj = {
            id,
            userIndex: Data.state.currentUserIndex,
            owner: Data.getCurrentUserName(),
            name,
            lastName: document.getElementById('charLastName')?.value.trim() || '',
            age: document.getElementById('charAge')?.value.trim() || '',
            race: document.getElementById('charRace')?.value.trim() || '',
            gender: document.getElementById('charGender')?.value || '',
            alignment: document.getElementById('charAlignment')?.value || '',
            job: document.getElementById('charJob')?.value.trim() || '',
            color: document.getElementById('charColor')?.value || '#8b7355',
            avatar: document.getElementById('charAvatar')?.value.trim() || '',
            sprite: document.getElementById('charSprite')?.value.trim() || '',
            basic: document.getElementById('charBasic')?.value.trim() || '',
            personality: document.getElementById('charPersonality')?.value.trim() || '',
            history: document.getElementById('charHistory')?.value.trim() || '',
            notes: document.getElementById('charNotes')?.value.trim() || ''
        };

        const idx = Data.state.appData.characters.findIndex(c => c.id === id);
        if (idx > -1) {
            Data.state.appData.characters[idx] = charObj;
        } else {
            Data.state.appData.characters.push(charObj);
        }

        Data.state.hasUnsavedChanges = true;
        Storage.save();
        Modals.close('characterModal');
        this.resetForm();
        Gallery.render();
    },

    delete() {
        if (!this.currentId) return;
        if (!confirm('¿Borrar personaje?')) return;

        if (Data.state.selectedCharId === this.currentId) {
            Data.state.selectedCharId = null;
            localStorage.removeItem(Storage.KEYS.SELECTED_CHAR + Data.state.currentUserIndex);
        }

        Data.state.appData.characters = Data.state.appData.characters.filter(c => c.id !== this.currentId);
        Data.state.hasUnsavedChanges = true;
        Storage.save();
        Modals.close('characterModal');
        this.resetForm();
        Gallery.render();
    },

    updatePreview() {
        const name = document.getElementById('charName')?.value || 'Nuevo Personaje';
        const avatar = document.getElementById('charAvatar')?.value;

        const previewName = document.getElementById('editorPreviewName');
        if (previewName) previewName.textContent = name;

        const previewImg = document.getElementById('editorPreviewImage');
        if (previewImg) {
            if (avatar) {
                previewImg.innerHTML = `<img src="${TextUtils.escapeHtml(avatar)}" style="width: 100%; height: 100%; object-fit: cover;" onerror="this.style.display='none'; this.parentElement.innerHTML='<span style=\\'font-size: 5rem;\\'>👤</span>'">`;
            } else {
                previewImg.innerHTML = '<span style="font-size: 5rem;">👤</span>';
            }
        }
    },

    switchTab(tabName, element) {
        document.querySelectorAll('.editor-tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.editor-panel').forEach(p => p.classList.remove('active'));

        if (element) element.classList.add('active');

        const panel = document.getElementById(`editor-tab-${tabName}`);
        if (panel) panel.classList.add('active');
    },

    selectGender(gender, element) {
        document.querySelectorAll('.gender-option').forEach(opt => opt.classList.remove('selected'));
        element.classList.add('selected');
        document.getElementById('charGender').value = gender;
    }
};

const CharacterSelector = {
    update() {
        const mine = Data.getUserCharacters();
        const display = document.getElementById('charSelectedDisplay');
        const nameEl = document.getElementById('charSelectedName');
        const grid = document.getElementById('charGridDropdown');

        if (!display || !nameEl) return;

        if (mine.length === 0) {
            display.innerHTML = '<div class="placeholder">👤</div>';
            nameEl.textContent = 'Crea un personaje primero';
            if (grid) grid.innerHTML = '';
            return;
        }

        if (!Data.state.selectedCharId) {
            const savedCharId = localStorage.getItem(Storage.KEYS.SELECTED_CHAR + Data.state.currentUserIndex);
            Data.state.selectedCharId = savedCharId || mine[0]?.id;
        }

        const currentChar = mine.find(c => c.id === Data.state.selectedCharId) || mine[0];
        if (!currentChar) return;

        Data.state.selectedCharId = currentChar.id;

        if (currentChar.avatar) {
            display.innerHTML = `<img src="${TextUtils.escapeHtml(currentChar.avatar)}" onerror="this.style.display='none'; this.parentElement.innerHTML='<div class=\\'placeholder\\'>${currentChar.name[0]}</div>'">`;
        } else {
            display.innerHTML = `<div class="placeholder">${currentChar.name[0]}</div>`;
        }
        nameEl.textContent = currentChar.name;

        if (grid) {
            grid.innerHTML = mine.map(c => `
                <div class="char-grid-item ${c.id === Data.state.selectedCharId ? 'selected' : ''}" onclick="CharacterSelector.select('${c.id}')">
                    ${c.avatar 
                        ? `<img src="${TextUtils.escapeHtml(c.avatar)}" onerror="this.style.display='none'; this.parentElement.innerHTML='<div class=\\'placeholder\\'>${c.name[0]}</div>'">` 
                        : `<div class="placeholder">${c.name[0]}</div>`
                    }
                </div>
            `).join('');
        }
    },

    select(charId) {
        Data.state.selectedCharId = charId;
        Storage.saveSelectedChar(Data.state.currentUserIndex, charId);
        this.update();

        const grid = document.getElementById('charGridDropdown');
        if (grid) grid.classList.remove('active');
    },

    toggleGrid() {
        if (Data.state.isNarratorMode) return;
        const grid = document.getElementById('charGridDropdown');
        if (grid) grid.classList.toggle('active');
    }
};
