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

    if (!window.supabaseClient) {
        setAuthStatus('Sin conexión. Usa el modo local.', true);
        return;
    }

    setAuthStatus('Iniciando sesión...');
    const { error } = await window.supabaseClient.auth.signInWithPassword({ email, password });

    if (error) {
        setAuthStatus(error.message || 'No se pudo iniciar sesión.', true);
        return;
    }

    hideLoginScreen();
    initializeApp();
    await ensureProfile();  // inicializa SupabaseProfiles + dispara auth-changed
}

async function register() {
    const email = (document.getElementById('authEmail')?.value || '').trim();
    const password = document.getElementById('authPassword')?.value || '';

    if (!email || !password) {
        setAuthStatus('Completa email y contraseña.', true);
        return;
    }

    if (!window.supabaseClient) {
        setAuthStatus('Sin conexión. Usa el modo local.', true);
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
        initializeApp();
        await ensureProfile();  // inicializa SupabaseProfiles + dispara auth-changed
    }
}

async function ensureProfile() {
    // ensureProfile ya no crea perfiles automáticamente.
    // Los perfiles globales se crean explícitamente por el usuario via SupabaseProfiles.
    // Esta función solo inicializa los módulos Supabase tras el login.
    try {
        const { data: userData, error: userError } = await window.supabaseClient.auth.getUser();
        if (userError || !userData?.user) return;

        // Inicializar módulos de perfiles y personajes
        if (typeof SupabaseProfiles !== 'undefined') {
            SupabaseProfiles.init();
        }

        // Cargar ajustes del usuario desde Supabase y aplicar a UI
        if (typeof SupabaseSettings !== 'undefined') {
            SupabaseSettings.loadUserSettings().catch(() => {});
        }

        // Fix 6: cache user globally so Supabase modules avoid repeated getUser() calls
        window._cachedUserId = userData.user.id;
        // Disparar evento para que otros módulos sepan que hay usuario autenticado
        window.dispatchEvent(new CustomEvent('etheria:auth-changed', {
            detail: { user: userData.user }
        }));
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

    if (typeof syncVnStore === 'function') {
        syncVnStore({
            topicId: currentTopicId,
            selectedCharId,
            messageIndex: currentMessageIndex,
            isTyping,
            weather: currentWeather
        });
    }

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
    // ── Detección de dispositivo para optimizaciones de rendimiento ──────────
    // Añadimos clases al <body> que mobile-perf.css usa para reducir
    // partículas, animaciones y efectos GPU en dispositivos de gama media/baja.
    (function detectDeviceCapabilities() {
        const ua = navigator.userAgent || '';
        const isMobileUA = /Mobi|Android|iPhone|iPad|iPod|IEMobile|Opera Mini/i.test(ua);
        const isCoarsePointer = typeof window.matchMedia === 'function'
            && window.matchMedia('(pointer: coarse)').matches;

        if (isMobileUA || isCoarsePointer) {
            document.body.classList.add('is-mobile');
        }

        // low-spec: RAM < 4 GB o menos de 4 hilos lógicos
        const mem = navigator.deviceMemory;        // undefined en Firefox/Safari
        const cpu = navigator.hardwareConcurrency; // undefined en algunos móviles
        if ((mem !== undefined && mem < 4) || (cpu !== undefined && cpu < 4)) {
            document.body.classList.add('low-spec');
        }

        // Refleja prefers-reduced-motion como clase de body para CSS condicional
        if (typeof window.matchMedia === 'function'
                && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
            document.body.classList.add('prefers-reduced-motion');
        }
    })();
    // ─────────────────────────────────────────────────────────────────────────

    const loginBtn = document.getElementById('authLoginBtn');
    const registerBtn = document.getElementById('authRegisterBtn');
    if (loginBtn) loginBtn.addEventListener('click', login);
    if (registerBtn) registerBtn.addEventListener('click', register);

    // La app siempre arranca en modo local inmediatamente.
    // La autenticación con Supabase es opcional (para sincronización en la nube).
    hideLoginScreen();
    initializeApp();

    // En background, intentar recuperar sesión de Supabase si está disponible.
    // Si hay sesión activa, se puede usar para sincronización cloud sin interrumpir al usuario.
    if (window.supabaseClient) {
        Promise.race([
            window.supabaseClient.auth.getSession(),
            new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 4000))
        ]).then(result => {
            if (result?.data?.session) {
                ensureProfile().catch(() => {});
            }
        }).catch(() => {
            isOfflineMode = true;
        });
    } else {
        isOfflineMode = true;
    }

    // ── Registro del Service Worker (PWA) ────────────────────────
    // Solo en HTTPS (obligatorio) y si el navegador lo soporta.
    // No bloquea el arranque de la app — se registra en background.
    if ('serviceWorker' in navigator) {
        window.addEventListener('load', () => {
            navigator.serviceWorker.register('./sw.js', { scope: './' })
                .then((reg) => {
                    // SW registrado; el scope es el directorio actual
                    if (reg.installing) {
                        console.log('[PWA] Service Worker instalando…');
                    } else if (reg.waiting) {
                        console.log('[PWA] Service Worker en espera.');
                    } else if (reg.active) {
                        console.log('[PWA] Service Worker activo.');
                    }
                })
                .catch((err) => {
                    // Fallo no crítico — la app funciona igual sin SW
                    console.warn('[PWA] Service Worker no pudo registrarse:', err);
                });
        });
    }
    // ─────────────────────────────────────────────────────────────
});
