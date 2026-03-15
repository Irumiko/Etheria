// Punto de entrada: inicializa la app cuando carga el DOM.
// ============================================
// CORE/BOOT.JS
// ============================================
// Punto de arranque de Etheria.
// Se ejecuta cuando el HTML termina de cargar (DOMContentLoaded).

// ============================================
// AUTH + INICIALIZACIÓN
// ============================================

const logger = window.EtheriaLogger;

// Verificar si hay una sesión existente
async function checkExistingSession() {
    if (!window.supabaseClient) return false;
    
    try {
        const { data: { session } } = await window.supabaseClient.auth.getSession();
        return !!session;
    } catch (e) {
        logger?.warn('app:auth', 'checkExistingSession failed:', e?.message || e);
        return false;
    }
}

function setAuthStatus(message, isError, targetId = 'authStatus') {
    const statusEl = document.getElementById(targetId);
    if (!statusEl) return;
    statusEl.textContent = message || '';
    statusEl.className = 'auth-status' + (isError ? ' error' : isError === false ? ' success' : '');
}

function showLoginScreen() {
    const loginScreen = document.getElementById('authScreen');
    if (loginScreen) {
        loginScreen.style.display = 'flex';
        loginScreen.classList.remove('hidden');
    }
}

function hideLoginScreen() {
    const loginScreen = document.getElementById('authScreen');
    if (loginScreen) {
        loginScreen.classList.add('hidden');
        setTimeout(() => {
            loginScreen.style.display = 'none';
        }, 500);
    }
}

// Navegación entre vistas de autenticación
function showAuthForm(view) {
    document.querySelectorAll('.auth-view').forEach(v => v.classList.remove('active'));
    if (view === 'login') {
        document.getElementById('authLoginView').classList.add('active');
    } else if (view === 'register') {
        document.getElementById('authRegisterView').classList.add('active');
    }
}

function showAuthMain() {
    document.querySelectorAll('.auth-view').forEach(v => v.classList.remove('active'));
    document.getElementById('authMainView').classList.add('active');
    setAuthStatus('', null, 'authStatus');
    setAuthStatus('', null, 'authRegStatus');
}

function continueAsGuest() {
    hideLoginScreen();
    initializeApp();
    isOfflineMode = true;
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
    const email = (document.getElementById('authRegEmail')?.value || '').trim();
    const password = document.getElementById('authRegPassword')?.value || '';
    const passwordConfirm = document.getElementById('authRegPasswordConfirm')?.value || '';

    if (!email || !password) {
        setAuthStatus('Completa email y contraseña.', true, 'authRegStatus');
        return;
    }
    
    if (password !== passwordConfirm) {
        setAuthStatus('Las contraseñas no coinciden.', true, 'authRegStatus');
        return;
    }
    
    if (password.length < 6) {
        setAuthStatus('La contraseña debe tener al menos 6 caracteres.', true, 'authRegStatus');
        return;
    }

    if (!window.supabaseClient) {
        setAuthStatus('Sin conexión. Usa el modo local.', true, 'authRegStatus');
        return;
    }

    setAuthStatus('Creando cuenta...', null, 'authRegStatus');
    const { data, error } = await window.supabaseClient.auth.signUp({ email, password });

    if (error) {
        setAuthStatus(error.message || 'No se pudo registrar.', true, 'authRegStatus');
        return;
    }

    const needsConfirmation = !data?.session;
    setAuthStatus(needsConfirmation
        ? 'Cuenta creada. Revisa tu email para confirmar.'
        : 'Cuenta creada correctamente.', false, 'authRegStatus');

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
    
    // Inicializar sincronización con Supabase
    if (typeof SupabaseSync !== 'undefined') {
        SupabaseSync.init();
    }
    startCloudSync();

    // Inicializar motor RPG de escenas narrativas
    if (typeof RPGState !== 'undefined')    RPGState.init(currentUserIndex);
    if (typeof RPGRenderer !== 'undefined') RPGRenderer.init();

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
    // ── Detección de modo PWA (standalone) ──────────────────────────────────
    (function detectPWAMode() {
        const isStandalone =
            window.matchMedia('(display-mode: standalone)').matches ||
            window.matchMedia('(display-mode: fullscreen)').matches ||
            navigator.standalone === true; // iOS Safari

        if (isStandalone) {
            document.body.classList.add('is-pwa');
            document.body.classList.add('pwa-standalone');
            document.documentElement.classList.add('pwa-standalone');

            // ── Forzar orientación landscape ──────────────────────────
            // El manifest ya pide landscape, pero algunos Android ignoran
            // el manifest hasta que el usuario rota. La API Screen Orientation
            // lo forza activamente en navegadores que la soportan.
            // Intentar lock inmediato
            function _tryOrientationLock() {
                try {
                    if (screen.orientation && screen.orientation.lock) {
                        screen.orientation.lock('landscape').catch((error) => {
                            logger?.debug('app:pwa', 'orientation lock rejected:', error?.message || error);
                        });
                    }
                } catch (e) {
                    logger?.debug('app:pwa', 'orientation lock unavailable:', e?.message || e);
                }
            }
            _tryOrientationLock();

            // Re-intentar en el primer gesto del usuario (algunos Android
            // requieren interacción previa para permitir el lock)
            const _onFirstInteraction = () => {
                _tryOrientationLock();
                document.removeEventListener('touchstart', _onFirstInteraction);
                document.removeEventListener('click', _onFirstInteraction);
            };
            document.addEventListener('touchstart', _onFirstInteraction, { once: true });
            document.addEventListener('click', _onFirstInteraction, { once: true });

            window.matchMedia('(display-mode: standalone)').addEventListener('change', (e) => {
                document.body.classList.toggle('is-pwa', e.matches);
                document.body.classList.toggle('pwa-standalone', e.matches);
                document.documentElement.classList.toggle('pwa-standalone', e.matches);
            });
        }
    })();
    // ─────────────────────────────────────────────────────────────────────────

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

    // ── Forzar orientación landscape en móviles (PWA) ─────────────────────
    // Etheria está diseñado para horizontal. Intentamos bloquear landscape en
    // móviles reales. En tablets grandes y desktop no hacemos nada (ya son
    // landscape por naturaleza, y Android 12L+ prohíbe el lock en pantallas
    // ≥ 600 dp de ancho menor).
    //
    // Compatibilidad 2025-2026:
    //   • screen.orientation.lock() es parte del W3C Screen Orientation API.
    //   • Chrome Android ≥ 93 lo soporta en modo standalone/fullscreen PWA.
    //   • Safari iOS ≥ 16.4 lo soporta parcialmente (requiere interacción previa).
    //   • Firefox Android lo soporta desde v112.
    //   • En navegador normal (no PWA instalada) puede rechazarlo — se captura.
    //   • En tablets/Chromebooks con ventana redimensionable Chrome lanza
    //     NotSupportedError; lo capturamos y no hacemos nada.
    (function initOrientationLock() {
        const ua = navigator.userAgent || '';

        // Solo actuar en móviles / handhelds reales.
        // Usamos pointer:coarse + viewport estrecho como doble guardia para
        // evitar lockear accidentalmente tablets en modo split-window.
        const isMobileUA   = /Mobi|Android.*Mobile|iPhone|iPod|IEMobile|Opera Mini/i.test(ua);
        const isCoarse     = typeof window.matchMedia === 'function'
                             && window.matchMedia('(pointer: coarse)').matches;
        const isNarrowPort = window.innerWidth < window.innerHeight  // arrancó en portrait
                             && Math.min(window.innerWidth, window.innerHeight) < 600;

        // Tablets grandes (≥ 600px lado corto): dejamos que el SO gestione
        const isLargeTablet = Math.min(window.innerWidth, window.innerHeight) >= 600;

        const shouldLock = (isMobileUA || isCoarse) && !isLargeTablet;
        if (!shouldLock) return; // desktop / tablet grande → sin lock

        // Clave localStorage para mostrar el toast SOLO la primera vez
        const TOAST_KEY = 'etheria_landscape_hint_shown';

        // ── Función principal de lock ───────────────────────────────────────
        async function lockLandscape() {
            // screen.orientation no disponible (navegador antiguo o iOS < 16.4)
            if (!screen?.orientation?.lock) {
                _showLandscapeHint();
                return;
            }

            try {
                await screen.orientation.lock('landscape');
                // Lock exitoso → quitar hint si estaba visible, marcar como hecho
                localStorage.setItem(TOAST_KEY, '1');
                _hideLandscapeHint();
            } catch (err) {
                // Razones habituales de fallo:
                //   SecurityError  → no estamos en standalone / fullscreen
                //   NotSupportedError → tablet en modo ventana, Chromebook, etc.
                //   AbortError     → pantalla ya en landscape cuando se intentó
                console.warn('[Etheria] Orientation lock falló:', err.name, err.message);

                // Si ya estamos en landscape no hace falta el hint
                const alreadyLandscape = window.innerWidth >= window.innerHeight;
                if (!alreadyLandscape) {
                    _showLandscapeHint();
                }
            }
        }

        // ── Toast / hint sutil ──────────────────────────────────────────────
        // Se muestra UNA sola vez (hasta que el usuario instale la PWA y el
        // lock empiece a funcionar).
        function _showLandscapeHint() {
            if (localStorage.getItem(TOAST_KEY)) return; // ya lo vio
            if (window.innerWidth >= window.innerHeight)  return; // ya landscape

            // Usar el sistema de toasts nativo de Etheria si está disponible,
            // de lo contrario crear un elemento temporal propio.
            eventBus.emit('ui:show-autosave', { text: 'Gira el móvil horizontal para mejor experiencia 🔄', state: 'info' });
            if (typeof showAutosave !== 'function') {
                _injectHintElement();
            }
            localStorage.setItem(TOAST_KEY, '1');
        }

        function _hideLandscapeHint() {
            const el = document.getElementById('_etheriaLandscapeHint');
            if (el) el.remove();
        }

        // Fallback mínimo si showAutosave aún no está disponible (raro)
        function _injectHintElement() {
            if (document.getElementById('_etheriaLandscapeHint')) return;
            const hint = document.createElement('div');
            hint.id = '_etheriaLandscapeHint';
            hint.setAttribute('aria-live', 'polite');
            hint.style.cssText = [
                'position:fixed', 'bottom:1.2rem', 'left:50%',
                'transform:translateX(-50%)',
                'background:rgba(20,15,8,0.92)',
                'color:rgba(220,190,120,0.95)',
                'font-family:"Cinzel",serif',
                'font-size:0.8rem', 'letter-spacing:0.05em',
                'padding:0.55rem 1.1rem', 'border-radius:8px',
                'border:1px solid rgba(201,168,108,0.4)',
                'box-shadow:0 4px 20px rgba(0,0,0,0.6)',
                'z-index:9999', 'white-space:nowrap',
                'pointer-events:none',
                'animation:etheriaHintFade 4s ease forwards'
            ].join(';');
            hint.textContent = 'Gira el móvil horizontal para mejor experiencia 🔄';

            // Inyectar keyframe si no existe
            if (!document.getElementById('_etheriaHintStyle')) {
                const style = document.createElement('style');
                style.id = '_etheriaHintStyle';
                style.textContent = '@keyframes etheriaHintFade{0%{opacity:0;transform:translateX(-50%) translateY(6px)}15%{opacity:1;transform:translateX(-50%) translateY(0)}80%{opacity:1}100%{opacity:0}}';
                document.head.appendChild(style);
            }
            document.body.appendChild(hint);
            setTimeout(() => hint.remove(), 4200);
        }

        // ── Escuchar cambios de orientación ─────────────────────────────────
        // Si el usuario rota manualmente a portrait después de que el lock
        // haya fallado, recordamos intentarlo de nuevo (por si la PWA ya está
        // instalada y ahora el lock sí funciona).
        if (screen?.orientation) {
            screen.orientation.addEventListener('change', () => {
                const type = screen.orientation.type || '';
                if (type.startsWith('portrait')) {
                    // Reintentar lock silencioso
                    lockLandscape();
                }
            });
        }

        // Intentar lock inicial — en standalone ya tenemos contexto de pantalla.
        // Usamos un pequeño delay para asegurarnos de que el DOM está listo y
        // la PWA ha completado su transición de startup.
        if (document.readyState === 'complete') {
            lockLandscape();
        } else {
            window.addEventListener('load', lockLandscape, { once: true });
        }
    })();
    // ── Fin orientación landscape ─────────────────────────────────────────
    
    // Verificar si hay sesión activa
    const hasExistingSession = await checkExistingSession();
    
    if (hasExistingSession) {
        // Sesión existente, inicializar directamente
        hideLoginScreen();
        initializeApp();
    } else {
        // Mostrar pantalla de autenticación
        showLoginScreen();
    }

    // Configurar listeners de autenticación
    if (window.supabaseClient) {
        window.supabaseClient.auth.onAuthStateChange((event, session) => {
            if (event === 'SIGNED_IN' && session) {
                ensureProfile().catch(() => {});
            }
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
                    // Manejar actualizaciones del Service Worker
                    reg.addEventListener('updatefound', () => {
                        const newWorker = reg.installing;
                        newWorker.addEventListener('statechange', () => {
                            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                                // Nueva versión disponible
                                console.log('[PWA] Nueva versión disponible');
                                eventBus.emit('ui:show-autosave', { text: 'Nueva versión disponible. Recarga para actualizar.', state: 'info' });
                                // Forzar activación de la nueva versión
                                newWorker.postMessage('skipWaiting');
                            }
                        });
                    });

                    // Escuchar mensajes del SW
                    navigator.serviceWorker.addEventListener('message', (event) => {
                        if (event.data?.type === 'SYNC_REQUIRED') {
                            if (typeof SupabaseSync !== 'undefined') {
                                SupabaseSync.sync({ silent: true });
                            }
                        } else if (event.data?.type === 'SW_UPDATED') {
                            eventBus.emit('ui:show-autosave', {
                                text: '✨ Actualización lista. Recarga para aplicar mejoras.',
                                state: 'success',
                            });
                        }
                    });

                    // SW registrado; el scope es el directorio actual
                    if (reg.installing) {
                        console.log('[PWA] Service Worker instalando…');
                    } else if (reg.waiting) {
                        console.log('[PWA] Service Worker en espera.');
                        // Forzar activación si hay una versión esperando
                        reg.waiting.postMessage('skipWaiting');
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
    // ── Frase aleatoria en el subtítulo del menú principal ───────────────────
    // (absorbido de mejoras.js — Mejora 1)
    (function _initMenuSubtitle() {
        var phrases = [
            'Un mundo al borde del olvido',
            'Cada elección deja una cicatriz',
            'El destino se escribe con tinta y dados',
            'Las historias no terminan, se transforman',
            'Cada personaje guarda un secreto',
            'El pasado elige quiénes somos',
            'Algunos hilos no deberían cortarse',
            'La magia no perdona a los imprudentes',
            'Hasta los héroes sangran en silencio',
            'El azar es la firma de los dioses',
            'Ningún mapa llega hasta el final del camino',
            'Lo que se escribe, permanece'
        ];
        var el = document.querySelector('.menu-subtitle');
        if (el) el.textContent = phrases[Math.floor(Math.random() * phrases.length)];
    })();
    // ─────────────────────────────────────────────────────────────
});
