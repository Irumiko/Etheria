const Storage = {
    KEYS: {
        DATA: 'etheria_data',
        USER_NAMES: 'etheria_user_names',
        SELECTED_CHAR: 'etheria_selected_char_',
        TEXT_SPEED: 'etheria_text_speed',
        FONT_SIZE: 'etheria_font_size',
        THEME: 'etheria_theme'
    },

    load() {
        try {
            const saved = localStorage.getItem(this.KEYS.DATA);
            if (saved) {
                const parsed = JSON.parse(saved);
                Data.state.appData = {
                    topics: parsed.topics || [],
                    characters: parsed.characters || [],
                    messages: parsed.messages || {},
                    affinities: parsed.affinities || {}
                };
            }

            const savedNames = localStorage.getItem(this.KEYS.USER_NAMES);
            if (savedNames) {
                Data.state.userNames = JSON.parse(savedNames);
            }

            const savedCharId = localStorage.getItem(this.KEYS.SELECTED_CHAR + Data.state.currentUserIndex);
            if (savedCharId) Data.state.selectedCharId = savedCharId;

            const savedSpeed = localStorage.getItem(this.KEYS.TEXT_SPEED);
            if (savedSpeed) Data.state.textSpeed = parseInt(savedSpeed);

            const savedSize = localStorage.getItem(this.KEYS.FONT_SIZE);
            if (savedSize) {
                document.documentElement.style.setProperty('--font-size-base', savedSize + 'px');
            }

            const savedTheme = localStorage.getItem(this.KEYS.THEME);
            if (savedTheme) {
                document.documentElement.setAttribute('data-theme', savedTheme);
            }

        } catch (e) {
            console.error('Error loading data:', e);
        }
    },

    save() {
        try {
            localStorage.setItem(this.KEYS.DATA, JSON.stringify(Data.state.appData));
            Data.state.hasUnsavedChanges = false;
            UI.showAutosave('Guardado', 'saved');
            return true;
        } catch (e) {
            console.error('Error saving:', e);
            UI.showAutosave('Error al guardar', 'error');
            return false;
        }
    },

    saveUserNames() {
        localStorage.setItem(this.KEYS.USER_NAMES, JSON.stringify(Data.state.userNames));
    },

    saveSelectedChar(userIndex, charId) {
        localStorage.setItem(this.KEYS.SELECTED_CHAR + userIndex, charId);
    },

    saveTextSpeed(speed) {
        localStorage.setItem(this.KEYS.TEXT_SPEED, speed);
    },

    saveFontSize(size) {
        localStorage.setItem(this.KEYS.FONT_SIZE, size);
    },

    saveTheme(theme) {
        localStorage.setItem(this.KEYS.THEME, theme);
    },

    export() {
        const blob = new Blob([JSON.stringify(Data.state.appData, null, 2)], {type: 'application/json'});
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `etheria_${new Date().toISOString().split('T')[0]}.json`;
        a.click();
    },

    import(file, callback) {
        const reader = new FileReader();
        reader.onload = event => {
            try {
                const data = JSON.parse(event.target.result);
                if (this.validateData(data)) {
                    callback(null, data);
                } else {
                    callback(new Error('Formato de datos incorrecto'));
                }
            } catch (err) {
                callback(err);
            }
        };
        reader.readAsText(file);
    },

    validateData(data) {
        return data && 
               typeof data === 'object' &&
               Array.isArray(data.topics) && 
               Array.isArray(data.characters) &&
               typeof data.messages === 'object';
    }
};
