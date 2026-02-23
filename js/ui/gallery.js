const Gallery = {
    render() {
        const grid = document.getElementById('galleryGrid');
        if (!grid) return;

        const searchTerm = (document.getElementById('gallerySearch')?.value || '').toLowerCase();
        const sortBy = document.getElementById('gallerySort')?.value || 'default';

        let chars = [...Data.state.appData.characters];

        if (searchTerm) {
            chars = chars.filter(c => 
                (c.name?.toLowerCase().includes(searchTerm)) ||
                (c.race?.toLowerCase().includes(searchTerm)) ||
                (Data.state.userNames[c.userIndex]?.toLowerCase().includes(searchTerm))
            );
        }

        chars = this.sortCharacters(chars, sortBy);

        const countEl = document.getElementById('galleryCount');
        if (countEl) {
            countEl.textContent = `${chars.length} personaje${chars.length !== 1 ? 's' : ''}`;
        }

        if (chars.length === 0) {
            grid.innerHTML = '<div style="grid-column: 1 / -1; text-align: center; padding: 3rem; color: var(--text-muted);">No se encontraron personajes</div>';
            return;
        }

        grid.innerHTML = chars.map(c => this.renderCharacterCard(c)).join('');
    },

    sortCharacters(chars, sortBy) {
        switch(sortBy) {
            case 'owner':
                return chars.sort((a, b) => a.userIndex - b.userIndex || a.name.localeCompare(b.name));
            case 'name':
                return chars.sort((a, b) => a.name.localeCompare(b.name));
            case 'race':
                return chars.sort((a, b) => (a.race || '').localeCompare(b.race || ''));
            default:
                return chars;
        }
    },

    renderCharacterCard(c) {
        const genderIcon = c.gender === 'Femenino' ? '♀️' : c.gender === 'Masculino' ? '♂️' : '⚪';
        const ownerName = Data.state.userNames[c.userIndex] || 'Desconocido';

        return `
            <div class="character-card" onclick="CharacterSheet.open('${c.id}')">
                <div class="character-card-avatar">
                    ${c.avatar 
                        ? `<img src="${TextUtils.escapeHtml(c.avatar)}" onerror="this.style.display='none'; this.parentElement.innerHTML='<div class=\\'placeholder\\'>${c.name[0]}</div>'">` 
                        : `<div class="placeholder">${c.name[0]}</div>`
                    }
                </div>
                <div class="character-card-info">
                    <div class="character-card-name">${TextUtils.escapeHtml(c.name)}</div>
                    <div class="character-card-meta">
                        <span class="gender-icon">${genderIcon}</span>
                        <span>${TextUtils.escapeHtml(c.race) || 'Sin raza'}</span>
                    </div>
                </div>
                <div class="character-card-hover-info">
                    <div>Por: ${TextUtils.escapeHtml(ownerName)}</div>
                    <div>${TextUtils.escapeHtml(c.race) || 'Sin raza'}</div>
                </div>
            </div>
        `;
    }
};

const CharacterSheet = {
    currentId: null,

    open(id) {
        this.currentId = id;
        const c = Data.getCharacter(id);
        if (!c) return;

        this.render(c);
        Modals.open('sheetModal');
    },

    render(c) {
        const elements = {
            name: document.getElementById('sheetName'),
            owner: document.getElementById('sheetOwner'),
            avatar: document.getElementById('sheetAvatar'),
            quickStats: document.getElementById('sheetQuickStats'),
            grid: document.getElementById('profileGrid'),
            personality: document.getElementById('profilePersonality'),
            history: document.getElementById('profileHistory'),
            editBtn: document.getElementById('sheetEditBtn')
        };

        if (elements.name) elements.name.textContent = c.name;
        if (elements.owner) elements.owner.textContent = `Por ${c.owner || Data.state.userNames[c.userIndex]}`;
        
        if (elements.avatar) {
            elements.avatar.innerHTML = c.avatar 
                ? `<img src="${TextUtils.escapeHtml(c.avatar)}" onerror="this.textContent='${c.name[0]}'">` 
                : c.name[0];
        }

        if (elements.quickStats) {
            elements.quickStats.innerHTML = `
                <span class="quick-stat">${TextUtils.escapeHtml(c.race) || 'Sin raza'}</span>
                <span class="quick-stat">${c.gender || '?'}</span>
                <span class="quick-stat">${c.age || '?'} años</span>
                <span class="quick-stat" style="background: ${this.getAlignmentColor(c.alignment)}; color: white;">${Data.alignments[c.alignment] || 'Neutral'}</span>
            `;
        }

        if (elements.grid) {
            elements.grid.innerHTML = this.renderProfileGrid(c);
        }

        if (elements.personality) {
            elements.personality.textContent = c.personality || 'Sin datos de personalidad.';
        }

        if (elements.history) {
            elements.history.textContent = c.history || 'Sin historia registrada.';
        }

        if (elements.editBtn) {
            elements.editBtn.style.display = c.userIndex === Data.state.currentUserIndex ? 'inline-block' : 'none';
        }
    },

    renderProfileGrid(c) {
        return `
            <div class="profile-item"><div class="profile-label">Nombre</div><div class="profile-value">${TextUtils.escapeHtml(c.name)}</div></div>
            <div class="profile-item"><div class="profile-label">Apellido</div><div class="profile-value">${TextUtils.escapeHtml(c.lastName) || '-'}</div></div>
            <div class="profile-item"><div class="profile-label">Edad</div><div class="profile-value">${c.age || '-'}</div></div>
            <div class="profile-item"><div class="profile-label">Raza</div><div class="profile-value">${TextUtils.escapeHtml(c.race) || '-'}</div></div>
            <div class="profile-item"><div class="profile-label">Género</div><div class="profile-value">${c.gender || '-'}</div></div>
            <div class="profile-item"><div class="profile-label">Alineamiento</div><div class="profile-value">${Data.alignments[c.alignment] || '-'}</div></div>
            <div class="profile-item full-width"><div class="profile-label">Ocupación</div><div class="profile-value">${TextUtils.escapeHtml(c.job) || '-'}</div></div>
            <div class="profile-item full-width" style="margin-top: 1rem;">
                <div class="profile-label">Descripción Física</div>
                <div style="margin-top: 0.5rem; line-height: 1.6;">${TextUtils.escapeHtml(c.basic) || 'Sin descripción.'}</div>
            </div>
        `;
    },

    getAlignmentColor(code) {
        const colors = {
            'LB': '#4a90e2', 'LN': '#7f8c8d', 'LM': '#2c3e50',
            'NB': '#f39c12', 'NN': '#95a5a6', 'NM': '#8e44ad',
            'CB': '#e74c3c', 'CN': '#e67e22', 'CM': '#c0392b'
        };
        return colors[code] || '#95a5a6';
    },

    edit() {
        Modals.close('sheetModal');
        CharacterEditor.open(this.currentId);
    }
};
