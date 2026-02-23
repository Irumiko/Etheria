const UI = {
    init() {
        this.setupKeyboardListeners();
        this.setupBeforeUnload();
    },

    setupKeyboardListeners() {
        document.addEventListener('keydown', (e) => {
            if (!document.getElementById('vnSection')?.classList.contains('active')) return;
            
            const replyPanel = document.getElementById('vnReplyPanel');
            const settingsPanel = document.getElementById('settingsPanel');
            const continuationOverlay = document.getElementById('continuationOverlay');
            const optionsContainer = document.getElementById('vnOptionsContainer');
            const emotePicker = document.getElementById('emotePicker');
            
            if (e.code === 'Space') {
                if (this.isPanelOpen()) return;
                e.preventDefault();
                VN.handleDialogueClick();
            }
            
            if (e.code === 'Escape') {
                this.handleEscape(continuationOverlay, replyPanel, settingsPanel, emotePicker);
            }
        });
    },

    isPanelOpen() {
        const replyPanel = document.getElementById('vnReplyPanel');
        const settingsPanel = document.getElementById('settingsPanel');
        const optionsContainer = document.getElementById('vnOptionsContainer');
        const emotePicker = document.getElementById('emotePicker');
        
        return (replyPanel?.style.display === 'flex') ||
               settingsPanel?.classList.contains('active') ||
               optionsContainer?.classList.contains('active') ||
               emotePicker?.classList.contains('active');
    },

    handleEscape(continuation, reply, settings, emotePicker) {
        if (continuation?.classList.contains('active')) {
            VN.closeContinuation();
        } else if (reply?.style.display === 'flex') {
            VN.closeReplyPanel();
        } else if (document.getElementById('historyModal')?.classList.contains('active')) {
            Modals.close('historyModal');
        } else if (document.getElementById('sheetModal')?.classList.contains('active')) {
            Modals.close('sheetModal');
        } else if (settings?.classList.contains('active')) {
            Settings.close();
        } else if (document.getElementById('branchEditorModal')?.classList.contains('active')) {
            Modals.close('branchEditorModal');
        } else if (emotePicker?.classList.contains('active')) {
            Emotes.togglePicker();
        }
    },

    setupBeforeUnload() {
        window.addEventListener('beforeunload', (e) => {
            if (Data.state.hasUnsavedChanges) {
                e.preventDefault();
                e.returnValue = 'Tienes cambios sin guardar. ¿Seguro que quieres salir?';
            }
        });
    },

    showAutosave(text, state) {
        const indicator = document.getElementById('autosaveIndicator');
        if (!indicator) return;
        
        const textEl = indicator.querySelector('.autosave-text');
        const iconEl = indicator.querySelector('.autosave-icon');
        
        if (textEl) textEl.textContent = text;
        indicator.className = `autosave-indicator visible ${state}`;
        
        const icons = { saving: '💾', saved: '✓', error: '✕' };
        if (iconEl) iconEl.textContent = icons[state] || '💾';
        
        setTimeout(() => indicator.classList.remove('visible'), 2000);
    },

    generateParticles() {
        const container = document.getElementById('particlesContainer');
        if (!container) return;
        
        container.innerHTML = '';
        const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
        
        if (isDark) {
            // Fireflies
            for (let i = 0; i < 20; i++) {
                const firefly = document.createElement('div');
                firefly.className = 'firefly';
                firefly.style.cssText = `
                    left: ${Math.random() * 100}%;
                    top: ${Math.random() * 100}%;
                    animation-delay: ${Math.random() * 4}s;
                    animation-duration: ${3 + Math.random() * 3}s;
                    --move-x: ${Math.random() * 100 - 50}px;
                    --move-y: ${Math.random() * 100 - 50}px;
                `;
                container.appendChild(firefly);
            }
        } else {
            // Leaves
            for (let i = 0; i < 10; i++) {
                const leaf = document.createElement('div');
                leaf.className = 'leaf';
                leaf.style.cssText = `
                    left: ${Math.random() * 100}%;
                    animation-delay: ${Math.random() * 8}s;
                    animation-duration: ${6 + Math.random() * 4}s;
                `;
                container.appendChild(leaf);
            }
        }
    },

    confirmUnsavedChanges(callback) {
        if (Data.state.hasUnsavedChanges) {
            if (confirm('Tienes cambios sin guardar. ¿Deseas guardar antes de salir?')) {
                Storage.save();
                callback();
            } else if (confirm('¿Descartar cambios?')) {
                Data.state.hasUnsavedChanges = false;
                callback();
            }
        } else {
            callback();
        }
    }
};

const Modals = {
    open(id) {
        if (id === 'topicModal') {
            Topics.updateCharacterSelect();
            Topics.updateModeUI();
        }
        const modal = document.getElementById(id);
        if (modal) modal.classList.add('active');
    },

    close(id) {
        const modal = document.getElementById(id);
        if (modal) modal.classList.remove('active');
    }
};
