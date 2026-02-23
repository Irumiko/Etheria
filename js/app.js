const App = {
    init() {
        Storage.load();
        UI.init();
        VN.init();
        
        this.renderUserSelect();
        this.setupEventListeners();
        
        // Check for unsaved changes warning
        if (Data.state.hasUnsavedChanges) {
            console.warn('Unsaved changes detected from previous session');
        }
    },

    renderUserSelect() {
        const container = document.getElementById('userCardsContainer');
        if (!container) return;

        container.innerHTML = '';

        Data.state.userNames.forEach((name, idx) => {
            const card = document.createElement('div');
            card.className = 'user-card';
            card.onclick = () => this.selectUser(idx);
            card.innerHTML = `
                <div class="user-avatar">👤</div>
                <div class="user-name">${TextUtils.escapeHtml(name)}</div>
                <div class="user-hint">Click para entrar</div>
            `;
            container.appendChild(card);
        });

        // Add new profile button
        if (Data.state.userNames.length < 10) {
            const addCard = document.createElement('div');
            addCard.className = 'add-profile-card';
            addCard.onclick = () => this.addNewProfile();
            addCard.innerHTML = `
                <div class="add-profile-icon">+</div>
                <div class="add-profile-text">Crear Perfil</div>
            `;
            container.appendChild(addCard);
        }
    },

    async selectUser(idx) {
        Data.state.currentUserIndex = idx;

        const savedCharId = localStorage.getItem(Storage.KEYS.SELECTED_CHAR + idx);
        Data.state.selectedCharId = savedCharId || null;

        const loadingOverlay = document.getElementById('loadingOverlay');
        if (loadingOverlay) loadingOverlay.classList.add('active');
        Data.state.isLoading = true;

        await new Promise(resolve => setTimeout(resolve, 600));

        document.getElementById('userSelectScreen')?.classList.add('hidden');
        document.getElementById('mainMenu')?.classList.remove('hidden');

        const currentUserDisplay = document.getElementById('currentUserDisplay');
        if (currentUserDisplay) {
            currentUserDisplay.textContent = Data.getCurrentUserName();
        }

        if (loadingOverlay) loadingOverlay.classList.remove('active');
        Data.state.isLoading = false;

        UI.generateParticles();
        UI.showAutosave('Sesión iniciada', 'saved');
    },

    addNewProfile() {
        if (Data.state.userNames.length >= 10) {
            alert('Máximo de 10 perfiles alcanzado');
            return;
        }

        const newName = prompt('Nombre del nuevo perfil:');
        if (newName?.trim()) {
            Data.state.userNames.push(newName.trim());
            Storage.saveUserNames();
            this.renderUserSelect();
        }
    },

    setupEventListeners() {
        // Global event delegation for dynamic elements
        document.addEventListener('click', (e) => {
            // Close char grid when clicking outside
            const grid = document.getElementById('charGridDropdown');
            const display = document.getElementById('charSelectedDisplay');
            if (grid && display && !grid.contains(e.target) && !display.contains(e.target)) {
                grid.classList.remove('active');
            }
        });
    },

    // Navigation
    showSection(section) {
        if (Data.state.isLoading) return;

        document.getElementById('mainMenu')?.classList.add('hidden');
        document.querySelectorAll('.game-section').forEach(s => s.classList.remove('active'));

        switch(section) {
            case 'topics':
                document.getElementById('topicsSection')?.classList.add('active');
                Topics.render();
                break;
            case 'gallery':
                document.getElementById('gallerySection')?.classList.add('active');
                Gallery.render();
                break;
            case 'options':
                document.getElementById('optionsSection')?.classList.add('active');
                break;
        }
    },

    backToMenu() {
        UI.confirmUnsavedChanges(() => {
            document.querySelectorAll('.game-section').forEach(s => s.classList.remove('active'));
            const mainMenu = document.getElementById('mainMenu');
            if (mainMenu) {
                mainMenu.classList.remove('hidden');
                UI.generateParticles();
            }
            VN.stopTypewriter();
        });
    },

    // User management
    changeUser() {
        const newName = prompt('Nuevo nombre:', Data.getCurrentUserName());
        if (newName?.trim()) {
            Data.state.userNames[Data.state.currentUserIndex] = newName.trim();
            Storage.saveUserNames();

            const currentUserDisplay = document.getElementById('currentUserDisplay');
            if (currentUserDisplay) currentUserDisplay.textContent = newName.trim();

            Storage.save();
            this.renderUserSelect();
        }
    },

    // Settings
    toggleTheme() {
        const html = document.documentElement;
        const currentTheme = html.getAttribute('data-theme');
        const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
        html.setAttribute('data-theme', newTheme);
        Storage.saveTheme(newTheme);
        UI.generateParticles();
    },

    // Save/Load
    saveGameFromMenu() {
        Storage.save();
        alert('Partida guardada localmente');
    },

    loadGameFromMenu() {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';
        input.onchange = e => {
            const file = e.target.files[0];
            if (!file) return;

            Storage.import(file, (err, data) => {
                if (err) {
                    alert('Error al cargar: ' + err.message);
                    return;
                }

                if (confirm('Esto reemplazará todos los datos actuales. ¿Continuar?')) {
                    Data.state.appData = {
                        topics: data.topics || [],
                        characters: data.characters || [],
                        messages: data.messages || {},
                        affinities: data.affinities || {}
                    };
                    Data.state.hasUnsavedChanges = true;
                    Storage.save();
                    alert('Partida cargada ✓');
                    Topics.render();
                    Gallery.render();
                }
            });
        };
        input.click();
    },

    exportData() {
        Storage.export();
    }
};

const Settings = {
    open() {
        document.getElementById('settingsPanel')?.classList.add('active');
    },

    close() {
        document.getElementById('settingsPanel')?.classList.remove('active');
    },

    updateTextSpeed(val) {
        Data.state.textSpeed = 110 - parseInt(val);
        Storage.saveTextSpeed(Data.state.textSpeed);

        const speedValue = document.getElementById('speedValue');
        if (speedValue) {
            const labels = ['Rápido', 'Normal', 'Lento'];
            const idx = val < 40 ? 0 : val < 70 ? 1 : 2;
            speedValue.textContent = labels[idx];
        }
    },

    updateFontSize(val) {
        document.documentElement.style.setProperty('--font-size-base', val + 'px');
        Storage.saveFontSize(val);
    },

    setAtmosphere(filter) {
        const vnSection = document.getElementById('vnSection');
        if (!vnSection) return;

        vnSection.classList.remove('sepia', 'bw', 'cinematic');
        if (filter !== 'none') vnSection.classList.add(filter);

        document.querySelectorAll('.filter-btn').forEach(btn => btn.classList.remove('active'));
        if (event?.target) event.target.classList.add('active');
    }
};

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    App.init();
});
