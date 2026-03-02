// Punto de entrada: inicializa la app cuando carga el DOM.
// ============================================
// CORE/BOOT.JS
// ============================================
// Punto de arranque de Etheria.
// Se ejecuta cuando el HTML termina de cargar (DOMContentLoaded).

// ============================================
// AUTH + INICIALIZACIÓN
// ============================================

function setAuthStatus(message, isError) {
    const statusEl = document.getElementById('authStatus');
    if (!statusEl) return;
    statusEl.textContent = message || '';
    statusEl.style.color = isError ? '#ff7b7b' : 'var(--text-secondary)';
}

function showLoginScreen() {
    const loginScreen = document.getElementById('authScreen');
    if (loginScreen) loginScreen.style.display = 'flex';
}

function hideLoginScreen() {
    const loginScreen = document.getElementById('authScreen');
    if (loginScreen) loginScreen.style.display = 'none';
}

async function login() {
    const email = (document.getElementById('authEmail')?.value || '').trim();
    const password = document.getElementById('authPassword')?.value || '';

    if (!email || !password) {
        setAuthStatus('Completa email y contraseña.', true);
        return;
    }

    setAuthStatus('Iniciando sesión...');
    const { error } = await window.supabaseClient.auth.signInWithPassword({ email, password });

    if (error) {
        setAuthStatus(error.message || 'No se pudo iniciar sesión.', true);
        return;
    }

    hideLoginScreen();
    await ensureProfile();
    initializeApp();
}

async function register() {
    const email = (document.getElementById('authEmail')?.value || '').trim();
    const password = document.getElementById('authPassword')?.value || '';

    if (!email || !password) {
        setAuthStatus('Completa email y contraseña.', true);
        return;
    }

    setAuthStatus('Creando cuenta...');
    const { data, error } = await window.supabaseClient.auth.signUp({ email, password });

    if (error) {
        setAuthStatus(error.message || 'No se pudo registrar.', true);
        return;
    }

    const needsConfirmation = !data?.session;
    setAuthStatus(needsConfirmation
        ? 'Cuenta creada. Revisa tu email para confirmar.'
        : 'Cuenta creada correctamente.');

    if (!needsConfirmation) {
        hideLoginScreen();
        await ensureProfile();
        initializeApp();
    }
}

async function ensureProfile() {
    try {
        const { data: userData, error: userError } = await window.supabaseClient.auth.getUser();
        if (userError || !userData?.user) return;

        const user = userData.user;
        const { data: existingProfile, error: profileError } = await window.supabaseClient
            .from('profiles')
            .select('id')
            .eq('user_id', user.id)
            .maybeSingle();

        if (profileError) return;
        if (existingProfile) return;

        await window.supabaseClient.from('profiles').insert({
            user_id: user.id,
            name: user.email || 'Usuario'
        });
    } catch {
        // Silencioso para no bloquear la app
    }
}

let appInitialized = false;

function initializeApp() {
    if (appInitialized) return;
    appInitialized = true;

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
    // Sincronizar botón de tema en pantalla de perfiles
    if (typeof updateProfileThemeBtn === 'function') updateProfileThemeBtn();

    renderUserCards();
    generateProfileParticles();
    if (typeof maybeShowOnboarding === 'function') maybeShowOnboarding();
    initMenuParallax();
    updateCloudSyncIndicator('online', 'Conectado');
    updateSyncButtonState('synced', 'Sincronizar');
    startCloudSync();

    // renderUserCards() ya gestiona el welcomeOverlay internamente.

    // Setup keyboard listeners
    setupKeyboardListeners();
    setupTouchGestures();
    initSmartTooltips();
    setupReplyEmotePopover();
    setupGallerySearchListeners();


    pendingRoomInviteId = (typeof getRoomIdFromQuery === 'function') ? getRoomIdFromQuery() : null;
    if (pendingRoomInviteId) {
        const defaultProfile = getStoredLastProfileId();
        selectUser(defaultProfile !== null ? defaultProfile : 0, { autoLoad: true })
            .then(() => {
                if (typeof tryJoinRoomFromUrl === 'function') return tryJoinRoomFromUrl();
                return false;
            })
            .catch((err) => {
                console.warn('No se pudo abrir la sala compartida:', err);
            });
    }

    window.addEventListener('beforeunload', (e) => {
        if (hasUnsavedChanges) {
            e.preventDefault();
            e.returnValue = 'Tienes cambios sin guardar. ¿Seguro que quieres salir?';
        }
    });
}

document.addEventListener('DOMContentLoaded', async () => {
    if (!window.supabaseClient) {
        console.error('[Auth] Supabase client no está disponible.');
        showLoginScreen();
        setAuthStatus('Error al inicializar autenticación.', true);
        return;
    }

    const loginBtn = document.getElementById('authLoginBtn');
    const registerBtn = document.getElementById('authRegisterBtn');
    if (loginBtn) loginBtn.addEventListener('click', login);
    if (registerBtn) registerBtn.addEventListener('click', register);

    const { data, error } = await window.supabaseClient.auth.getSession();

    if (error || !data?.session) {
        showLoginScreen();
        if (error) setAuthStatus(error.message || 'Debes iniciar sesión para continuar.', true);
        return;
    }

    hideLoginScreen();
    await ensureProfile();
    initializeApp();
});
