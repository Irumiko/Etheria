// Punto de entrada: inicializa la app cuando carga el DOM.
// ============================================
// CORE/BOOT.JS
// ============================================
// Punto de arranque de Etheria.
// Se ejecuta cuando el HTML termina de cargar (DOMContentLoaded).

// ============================================
// INICIALIZACIÓN
// ============================================

document.addEventListener('DOMContentLoaded', () => {
    appData = loadStoredAppData();

    const savedNames = localStorage.getItem('etheria_user_names');
    if (savedNames) {
        try {
            const parsedNames = JSON.parse(savedNames);
            if (Array.isArray(parsedNames)) {
                const sanitizedNames = parsedNames
                    .map(name => String(name || '').trim())
                    .filter(Boolean)
                    .slice(0, 10);
                if (sanitizedNames.length > 0) {
                    userNames = sanitizedNames;
                }
            }
        } catch (e) {
            console.error('Error parsing user names:', e);
        }
    }

    const savedCharId = localStorage.getItem(`etheria_selected_char_${currentUserIndex}`);
    if (savedCharId) selectedCharId = savedCharId;

    const savedSpeed = localStorage.getItem('etheria_text_speed');
    if (savedSpeed) {
        textSpeed = parseInt(savedSpeed);
        const slider = document.getElementById('textSpeedSlider');
        if (slider) slider.value = 110 - textSpeed;
    }

    const savedSize = localStorage.getItem('etheria_font_size');
    if (savedSize) {
        document.documentElement.style.setProperty('--font-size-base', savedSize + 'px');
        const slider = document.getElementById('fontSizeSlider');
        if (slider) slider.value = savedSize;
    }

    const savedTheme = localStorage.getItem('etheria_theme');
    if (savedTheme) {
        document.documentElement.setAttribute('data-theme', savedTheme);
    } else {
        document.documentElement.setAttribute('data-theme', 'light');
    }

    renderUserCards();
    generateProfileParticles();

    const lastProfileId = getStoredLastProfileId();
    if (lastProfileId !== null) {
        selectUser(lastProfileId, { instant: true, autoLoad: true });
    } else {
        localStorage.removeItem(LAST_PROFILE_KEY);
        toggleWelcomeOverlay(true);
    }

    // Setup keyboard listeners
    setupKeyboardListeners();
    setupTouchGestures();
    initSmartTooltips();
    setupReplyEmotePopover();
    setupGallerySearchListeners();

    window.addEventListener('beforeunload', (e) => {
        if (hasUnsavedChanges) {
            e.preventDefault();
            e.returnValue = 'Tienes cambios sin guardar. ¿Seguro que quieres salir?';
        }
    });

});
