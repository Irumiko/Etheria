// ============================================
// ETHY - La mascota guía de Etheria
// ============================================
// Sistema de guía interactiva con múltiples expresiones y tutoriales
// para cada sección de la aplicación.
// ============================================

const Ethy = (function() {
    'use strict';

    // ── Configuración ────────────────────────────────────────────────────────
    const CONFIG = {
        STORAGE_KEY: 'etheria_ethy_seen',
        TUTORIAL_KEY: 'etheria_ethy_tutorials',
        ANIMATION_DURATION: 400,
        TYPING_SPEED: 30, // ms por carácter
    };

    // ── Estado interno ───────────────────────────────────────────────────────
    let _container = null;
    let _body = null;
    let _floatWrapper = null;
    let _bubble = null;
    let _currentExpression = 'neutral';
    let _isTyping = false;
    let _typingTimeout = null;
    let _currentTutorial = null;
    let _tutorialStep = 0;
    let _seenTutorials = new Set();
    let _isVisible = false;
    let _isMinimized = false;
    let _tutorialPanel = null;
    let _tutorialPanelVisible = false;
    let _isDragging = false;
    let _wasDragging = false;   // true if mousedown moved enough to be a real drag
    let _dragStartX = 0;
    let _dragStartY = 0;
    let _clickCount = 0;
    let _clickTimer = null;
    let _sleepTimeout = null;
    let _isSleeping = false;
    const SLEEP_DELAY = 150000; // 2.5 minutos sin interacción
    const POSITION_KEY = 'etheria_ethy_pos';
    const MINIMIZED_KEY = 'etheria_ethy_minimized';

    // ── Expresiones disponibles ──────────────────────────────────────────────
    const EXPRESSIONS = {
        neutral: { class: 'ethy-expression-neutral', emoji: 'ㆆ_ㆆ' },
        sad: { class: 'ethy-expression-sad', emoji: '˘︹˘' },
        happy: { class: 'ethy-expression-happy', emoji: '─‿‿─' },
        excited: { class: 'ethy-expression-excited', emoji: '≧◉◡◉≦' },
        surprised: { class: 'ethy-expression-surprised', emoji: '◉_◉' },
        thoughtful: { class: 'ethy-expression-thoughtful', emoji: '¬‿¬' },
        wink: { class: 'ethy-expression-wink', emoji: '◠‿◠' },
        love: { class: 'ethy-expression-love', emoji: '♥‿♥' }
    };

    // ── Tutoriales por sección ───────────────────────────────────────────────
    const TUTORIALS = {
        // Menú Principal
        mainMenu: {
            title: '¡Bienvenido a Etheria!',
            expression: 'excited',
            steps: [
                {
                    text: '¡Hola! Soy Ethy, tu guía en Etheria. Estoy aquí para ayudarte a crear historias increíbles. ✨',
                    expression: 'excited',
                    action: null
                },
                {
                    text: 'Desde aquí puedes comenzar una nueva partida, ver tus personajes, o ajustar las opciones.',
                    expression: 'happy',
                    highlight: '.menu-button-console.primary',
                    action: () => highlightElement('.menu-button-console.primary')
                },
                {
                    text: 'En "Nueva Partida" podrás crear historias épicas. ¿Sabías que puedes elegir entre modo RPG o Clásico?',
                    expression: 'thoughtful',
                    highlight: '.menu-button-console.primary',
                    action: () => highlightElement('.menu-button-console.primary')
                },
                {
                    text: 'La Galería de Personajes es donde viven tus creaciones. ¡Puedes crear fichas super detalladas!',
                    expression: 'happy',
                    highlight: '.menu-button-console:nth-child(2)',
                    action: () => highlightElement('.menu-button-console:nth-child(2)')
                },
                {
                    text: 'No olvides guardar tu progreso regularmente. ¡No querrás perder tus historias! 💾',
                    expression: 'wink',
                    highlight: '.menu-button-console:nth-child(3)',
                    action: () => highlightElement('.menu-button-console:nth-child(3)')
                },
                {
                    text: '¡Estoy listo cuando lo necesites! Solo haz clic en mí si quieres que te explique algo.',
                    expression: 'excited',
                    action: null
                }
            ]
        },

        // Galería de Personajes
        gallery: {
            title: 'Galería de Personajes',
            expression: 'happy',
            steps: [
                {
                    text: '¡Bienvenido a la Galería! Aquí puedes ver y gestionar todos tus personajes.',
                    expression: 'happy',
                    action: null
                },
                {
                    text: 'Haz clic en "Nuevo personaje" para crear una ficha desde cero. ¡Puedes añadir avatar, stats, historia y más!',
                    expression: 'excited',
                    highlight: '.gallery-new-btn',
                    action: () => highlightElement('.gallery-new-btn')
                },
                {
                    text: 'Cada personaje tiene una ficha completa con nombre, raza, edad, género y una descripción detallada.',
                    expression: 'thoughtful',
                    action: null
                },
                {
                    text: 'En modo RPG, los personajes también tienen stats como Fuerza, Inteligencia, Vitalidad y Agilidad.',
                    expression: 'neutral',
                    action: null
                },
                {
                    text: '¡Los personajes son el alma de tus historias! Cuéntame, ¿quién será tu próximo héroe? 🎭',
                    expression: 'love',
                    action: null
                }
            ]
        },

        // Crear Historia/Tema
        createTopic: {
            title: 'Creando una Nueva Historia',
            expression: 'excited',
            steps: [
                {
                    text: '¡Vamos a crear algo mágico! Primero, elige el modo de tu historia.',
                    expression: 'excited',
                    action: null
                },
                {
                    text: '**Modo Clásico**: Roleplay puro sin mecánicas. Perfecto para historias narrativas centradas en el diálogo.',
                    expression: 'happy',
                    highlight: '[data-filter="roleplay"]',
                    action: () => highlightElement('[data-filter="roleplay"]')
                },
                {
                    text: '**Modo RPG**: Incluye stats, dados y el Oráculo del Destino. ¡Las acciones tienen consecuencias! 🎲',
                    expression: 'surprised',
                    highlight: '[data-filter="rpg"]',
                    action: () => highlightElement('[data-filter="rpg"]')
                },
                {
                    text: '¡Todas las historias se sincronizan automáticamente en la nube! Cada historia que crees estará disponible en todos tus dispositivos y podrás jugar con amigos en tiempo real.',
                    expression: 'excited',
                    action: null
                },
                {
                    text: '¿Listo para dar el primer paso? ¡Tu aventura comienza ahora! ✨',
                    expression: 'love',
                    action: null
                }
            ]
        },

        // Modo VN - Clásico
        vnClassic: {
            title: 'Modo Novela Visual - Clásico',
            expression: 'happy',
            steps: [
                {
                    text: '¡Bienvenido a tu historia! En modo Clásico, todo se trata del diálogo y las decisiones.',
                    expression: 'happy',
                    action: null
                },
                {
                    text: 'Haz clic en la caja de diálogo o presiona ESPACIO para avanzar el texto.',
                    expression: 'neutral',
                    highlight: '.vn-dialogue-box',
                    action: () => highlightElement('.vn-dialogue-box')
                },
                {
                    text: 'Usa los botones de navegación para ir al mensaje anterior o siguiente. También puedes usar las flechas ← →',
                    expression: 'thoughtful',
                    highlight: '.vn-controls',
                    action: () => highlightElement('.vn-controls')
                },
                {
                    text: '¡Los **emotes** dan vida a tus personajes! Escribe /happy, /sad, /angry, etc. para mostrar emociones. 🎭',
                    expression: 'excited',
                    action: null
                },
                {
                    text: 'Puedes crear **opciones de elección** para que los lectores decidan el rumbo de la historia.',
                    expression: 'surprised',
                    action: null
                },
                {
                    text: 'El botón 💬 "Responder" abre el panel para escribir. ¡Sé creativo!',
                    expression: 'wink',
                    highlight: '.reply-btn',
                    action: () => highlightElement('.reply-btn')
                }
            ]
        },

        // Modo VN - RPG
        vnRPG: {
            title: 'Modo Novela Visual - RPG',
            expression: 'excited',
            steps: [
                {
                    text: '¡Modo RPG activado! Aquí tus decisiones tienen consecuencias regradas por los dados. 🎲',
                    expression: 'excited',
                    action: null
                },
                {
                    text: 'Cada personaje tiene **stats**: Fuerza (STR), Inteligencia (INT), Vitalidad (VIT) y Agilidad (AGI).',
                    expression: 'thoughtful',
                    highlight: '.ihp-stats',
                    action: () => highlightElement('.ihp-stats')
                },
                {
                    text: 'El **Oráculo del Destino** responde cuando tus personajes intentan acciones difíciles.',
                    expression: 'surprised',
                    highlight: '#vnOracleFloatBtn',
                    action: () => highlightElement('#vnOracleFloatBtn')
                },
                {
                    text: 'Tira un D20 + tu stat vs una dificultad. ¡El resultado determina el éxito o fracaso!',
                    expression: 'happy',
                    action: null
                },
                {
                    text: 'Las **consecuencias** del Oráculo aparecen en el siguiente mensaje. ¡El destino es impredecible!',
                    expression: 'neutral',
                    action: null
                },
                {
                    text: 'El HP de tus personajes se muestra en la barra de vida. ¡No dejes que llegue a cero! 💀',
                    expression: 'sad',
                    highlight: '.vn-info-hp-bar',
                    action: () => highlightElement('.vn-info-hp-bar')
                },
                {
                    text: '¡Que los dados te sean favorables, aventurero! 🎲✨',
                    expression: 'love',
                    action: null
                }
            ]
        },

        // Opciones/Settings
        options: {
            title: 'Opciones y Ajustes',
            expression: 'neutral',
            steps: [
                {
                    text: 'Aquí puedes personalizar tu experiencia en Etheria.',
                    expression: 'neutral',
                    action: null
                },
                {
                    text: 'Cambia entre modo **Claro** y **Oscuro** según tu preferencia. 🌙',
                    expression: 'thoughtful',
                    highlight: '#themeToggleBtn',
                    action: () => highlightElement('#themeToggleBtn')
                },
                {
                    text: 'Ajusta la **velocidad del texto** y el tamaño de fuente para leer cómodamente.',
                    expression: 'happy',
                    action: null
                },
                {
                    text: 'Los **filtros de atmósfera** (Sepia, B/N, Cine) cambian el mood visual de las escenas.',
                    expression: 'excited',
                    action: null
                },
                {
                    text: '¡Experimenta hasta encontrar tu configuración perfecta!',
                    expression: 'wink',
                    action: null
                }
            ]
        },

        // Guardar y Cargar
        saveHub: {
            title: 'Centro de Guardado',
            expression: 'happy',
            steps: [
                {
                    text: '¡Nunca está de más tener un backup! Aquí puedes guardar y cargar tus partidas.',
                    expression: 'happy',
                    action: null
                },
                {
                    text: '**Descargar partida** exporta todo a un archivo JSON que puedes guardar en tu computadora.',
                    expression: 'thoughtful',
                    action: null
                },
                {
                    text: '**Generar código** crea un código único para compartir tu historia con otros jugadores.',
                    expression: 'excited',
                    action: null
                },
                {
                    text: 'Con **Importar código** puedes recibir historias que otros hayan compartido contigo.',
                    expression: 'surprised',
                    action: null
                },
                {
                    text: '¡Compartir historias es una de las mejores partes de Etheria! 📖✨',
                    expression: 'love',
                    action: null
                }
            ]
        }
    };

    // ── Inicialización ───────────────────────────────────────────────────────

    function init() {
        _loadSeenTutorials();
        _createElements();
        _setupEventListeners();
        
        // Mostrar Ethy con animación de entrada
        setTimeout(() => {
            show();
            _setSectionExpression('mainMenu'); // expresión inicial aleatoria
            _startIdleSystem();               // arrancar idle dinámico
            _resetSleepTimer();               // arrancar sleep timer
        }, 1000);
    }

    function _createElements() {
        // Verificar si ya existe
        if (document.getElementById('ethyContainer')) {
            _container = document.getElementById('ethyContainer');
            _floatWrapper = _container.querySelector('.ethy-float-wrapper');
            _body = _container.querySelector('.ethy-body');
            _bubble = _container.querySelector('.ethy-speech-bubble');
            return;
        }

        // Crear contenedor principal
        _container = document.createElement('div');
        _container.className = 'ethy-container';
        _container.id = 'ethyContainer';
        _container.style.opacity = '1';
        _container.style.transform = 'scale(1)';

        // Crear wrapper de flotación (separa animation:ethyFloat del body
        // para que los transform de expresión no sean anulados por la animación)
        _floatWrapper = document.createElement('div');
        _floatWrapper.className = 'ethy-float-wrapper';

        // Crear cuerpo de Ethy
        _body = document.createElement('div');
        _body.className = 'ethy-body ethy-expression-neutral';
        // El personaje se renderiza como SVG via background-image en ethy.css
        // No se inyectan divs internos de antenas/ojos/boca

        // Crear burbuja de diálogo
        _bubble = document.createElement('div');
        _bubble.className = 'ethy-speech-bubble';
        _bubble.innerHTML = `
            <div class="ethy-title">Ethy</div>
            <div class="ethy-content"></div>
            <div class="ethy-actions"></div>
            <div class="ethy-steps"></div>
        `;

        // Botón de minimizar (✕ pequeño sobre la cabeza de Ethy)
        const _minimizeBtn = document.createElement('button');
        _minimizeBtn.className = 'ethy-minimize-btn';
        _minimizeBtn.title = 'Minimizar / expandir';
        _minimizeBtn.innerHTML = '−';
        _minimizeBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            toggleMinimize();
        });

        _floatWrapper.appendChild(_body);
        _container.appendChild(_bubble);
        _container.appendChild(_floatWrapper);
        _container.appendChild(_minimizeBtn);
        document.body.appendChild(_container);

        // Evento click en Ethy
        _body.addEventListener('click', _onEthyClick);

        // Arrastre
        _setupDrag();

        // Restaurar posición y estado guardados
        _loadPosition();
        if (localStorage.getItem(MINIMIZED_KEY) === '1') {
            _isMinimized = true;
            _container.classList.add('ethy-minimized');
            _minimizeBtn.innerHTML = '+';
        }
        
        console.log('[Ethy] Elementos creados correctamente');
    }

    function _setupEventListeners() {
        // Cerrar burbuja y panel de tutoriales al hacer clic fuera
        document.addEventListener('click', (e) => {
            if (!_container.contains(e.target)) {
                if (_bubble.classList.contains('visible')) hideBubble();
                if (_tutorialPanelVisible) endTutorial();
            }
        });

        // Detectar cambios de sección
        window.addEventListener('hashchange', _onSectionChange);
        
        // Escuchar eventos personalizados de la app
        window.addEventListener('etheria:section-changed', (e) => {
            const section = e.detail?.section;
            const mode = e.detail?.mode;
            if (section) {
                onEnterSection(section, mode);
            }
        });

        // ── Actividad del usuario → resetear sleep timer ─────────────────
        ['mousemove', 'keydown', 'touchstart', 'click'].forEach(ev => {
            document.addEventListener(ev, _onUserActivity, { passive: true });
        });

        // ── Reacción al clima del VN ──────────────────────────────────────
        window.addEventListener('etheria:weather-changed', (e) => {
            _onWeatherChange(e.detail?.weather);
        });

        // ── Reacción a mensaje enviado ────────────────────────────────────
        window.addEventListener('etheria:message-sent', (e) => {
            const len = (e.detail?.text || '').length;
            if (len > 200 && !_isSleeping && !_bubble.classList.contains('visible')) {
                const msgs = [
                    '¡Vaya, menuda novela! 📖✨',
                    '¡Eso sí que es un mensaje largo! 💬',
                    '¡Con todo ese texto podrías escribir un capítulo entero! 🖊️'
                ];
                setTimeout(() => {
                    say(msgs[Math.floor(Math.random() * msgs.length)], {
                        expression: 'excited', duration: 4000
                    });
                }, 800);
            }
        });

        // ── EventBus — reacciones a eventos del sistema ───────────────────
        // Cooldown: Ethy no reacciona más de una vez cada 3 segundos
        // para evitar spam de expresiones o frases en escenas rápidas.
        if (typeof eventBus === 'undefined') return;

        let _lastEventReaction = 0;
        function _canReact() {
            const now = Date.now();
            if (now - _lastEventReaction < 3000) return false;
            _lastEventReaction = now;
            return true;
        }

        // El jugador ve una elección → Ethy reflexiona
        eventBus.on('scene:choice-shown', () => {
            if (!_canReact()) return;
            setExpression('thoughtful');
            // Frase ocasional — solo 30% de las veces para no saturar
            if (Math.random() < 0.3) {
                const msgs = ['Hmm...', 'Interesante...', '¿Qué harás?', 'Elige con cuidado.'];
                say(msgs[Math.floor(Math.random() * msgs.length)], {
                    expression: 'thoughtful', duration: 2500
                });
            }
        });

        // Escena terminada → satisfacción
        eventBus.on('scene:ended', () => {
            if (!_canReact()) return;
            const msgs = [
                'La historia continúa...',
                'Cada final es un nuevo comienzo.',
                'Bien hecho.'
            ];
            say(msgs[Math.floor(Math.random() * msgs.length)], {
                expression: 'happy', duration: 3000
            });
        });

        // Error en escena → preocupación
        eventBus.on('scene:error', () => {
            if (!_canReact()) return;
            const msgs = [
                'Algo no salió como esperaba...',
                'Eso fue extraño.',
                'A veces el destino también duda.'
            ];
            say(msgs[Math.floor(Math.random() * msgs.length)], {
                expression: 'sad', duration: 3500
            });
        });

        // Guardado → confirmación tranquila
        eventBus.on('ui:show-autosave', (data) => {
            if (!_canReact()) return;
            if (data?.state === 'error') {
                say('No pude guardar tu historia...', { expression: 'sad', duration: 3000 });
                return;
            }
            setExpression('happy');
        });

        // Sincronización completada → frase breve
        eventBus.on('sync:status-changed', (data) => {
            if (data?.target !== 'button') return;
            if (data?.status !== 'synced') return;
            if (!_canReact()) return;
            say('Tu historia está a salvo.', { expression: 'happy', duration: 3000 });
        });

        // Navegación → expresión neutra curiosa
        eventBus.on('ui:navigate', () => {
            if (!_canReact()) return;
            setExpression('wink');
        });
    }

    // ── Sistema de expresiones idle dinámicas ────────────────────────────────
    //
    // Cada vez que Ethy entra en una sección cambia a una expresión
    // temática aleatoria entre un conjunto de candidatas para esa sección.
    // Además, cada N segundos hace un "micro-cambio" idle: parpadea con una
    // expresión distinta unos instantes y vuelve a la expresión base.

    // Expresiones candidatas por sección (varias para que el azar tenga sentido)
    const SECTION_EXPRESSIONS = {
        mainMenu : ['excited', 'happy',      'love',        'wink'       ],
        gallery  : ['thoughtful', 'happy',   'wink',        'surprised'  ],
        topics   : ['happy',      'excited', 'thoughtful',  'wink'       ],
        vn       : ['love',       'excited', 'thoughtful',  'wink'       ],
        options  : ['thoughtful', 'neutral', 'wink',        'happy'      ],
        saveHub  : ['thoughtful', 'happy',   'wink',        'neutral'    ],
        default  : ['neutral',    'happy',   'thoughtful',  'wink', 'surprised']
    };

    // Expresiones breves (idle flicker) — más emocionales para que se note
    const IDLE_FLICKER = ['surprised', 'love', 'excited', 'wink', 'thoughtful'];

    let _idleBaseExpression = 'neutral'; // expresión base de la sección actual
    let _idleInterval  = null;

    function _pickRandom(arr) {
        return arr[Math.floor(Math.random() * arr.length)];
    }

    /**
     * Cambia a la expresión base de la sección con una pequeña animación
     * de "sacudida" para que el cambio se note.
     */
    function _setSectionExpression(section) {
        const pool = SECTION_EXPRESSIONS[section] || SECTION_EXPRESSIONS.default;
        let candidates = pool.filter(e => e !== _currentExpression);
        if (candidates.length === 0) candidates = pool;
        const chosen = _pickRandom(candidates);
        _idleBaseExpression = chosen;
        // No animar ni cambiar expresión si está minimizado
        if (_isMinimized) return;
        if (_body) {
            _body.classList.add('ethy-hello');
            setTimeout(() => _body.classList.remove('ethy-hello'), 500);
        }
        setExpression(chosen);
    }

    /**
     * Tick idle: cada 8-14 s cambia momentáneamente a una expresión aleatoria
     * y a los 1.5 s vuelve a la expresión base.
     */
    function _idleTick() {
        // No interrumpir si minimizado, burbuja activa o tutorial en curso
        if (_isMinimized) return;
        if (_bubble && _bubble.classList.contains('visible')) return;
        if (_tutorialPanelVisible) return;

        const flicker = _pickRandom(IDLE_FLICKER.filter(e => e !== _idleBaseExpression));
        setExpression(flicker);

        setTimeout(() => {
            // Solo restaurar si no hay burbuja abierta ahora
            if (!_bubble || !_bubble.classList.contains('visible')) {
                setExpression(_idleBaseExpression);
            }
        }, 1500);
    }

    function _startIdleSystem() {
        if (_idleInterval) clearInterval(_idleInterval);
        // Intervalo aleatorio entre 8 y 14 segundos
        const randomInterval = () => Math.floor(Math.random() * 6000) + 8000;

        function scheduleNext() {
            _idleInterval = setTimeout(() => {
                _idleTick();
                scheduleNext(); // re-agendar con nuevo intervalo aleatorio
            }, randomInterval());
        }
        scheduleNext();
    }

    // ── Sistema de arrastre ───────────────────────────────────────────────────

    function _setupDrag() {
        let startX, startY, startRight, startBottom;

        function onStart(ex, ey) {
            _isDragging = true;
            _wasDragging = false;
            _dragStartX = ex;
            _dragStartY = ey;
            startX = ex;
            startY = ey;
            const style = window.getComputedStyle(_container);
            // Trabajamos con right/bottom para no romper el layout habitual
            startRight  = parseInt(style.right)  || 20;
            startBottom = parseInt(style.bottom) || 20;
            _container.style.transition = 'none';
            _container.classList.add('ethy-dragging');
        }

        function onMove(ex, ey) {
            if (!_isDragging) return;
            // Only mark as a real drag after 5px of movement
            if (!_wasDragging) {
                const dist = Math.hypot(ex - _dragStartX, ey - _dragStartY);
                if (dist < 5) return;
                _wasDragging = true;
            }
            const dx = startX - ex;
            const dy = startY - ey;
            const newRight  = Math.max(0, Math.min(window.innerWidth  - 80, startRight  + dx));
            const newBottom = Math.max(0, Math.min(window.innerHeight - 80, startBottom + dy));
            _container.style.right  = newRight  + 'px';
            _container.style.bottom = newBottom + 'px';
            _container.style.left   = 'auto';
            _container.style.top    = 'auto';
        }

        function onEnd() {
            if (!_isDragging) return;
            _isDragging = false;
            _container.style.transition = '';
            _container.classList.remove('ethy-dragging');
            _savePosition();
        }

        // Mouse
        _body.addEventListener('mousedown', (e) => { e.preventDefault(); onStart(e.clientX, e.clientY); });
        document.addEventListener('mousemove', (e) => onMove(e.clientX, e.clientY));
        document.addEventListener('mouseup', onEnd);

        // Touch
        _body.addEventListener('touchstart', (e) => {
            const t = e.touches[0];
            onStart(t.clientX, t.clientY);
        }, { passive: true });
        document.addEventListener('touchmove', (e) => {
            if (!_isDragging) return;
            e.preventDefault();
            const t = e.touches[0];
            onMove(t.clientX, t.clientY);
        }, { passive: false });
        document.addEventListener('touchend', onEnd);
    }

    function _savePosition() {
        try {
            localStorage.setItem(POSITION_KEY, JSON.stringify({
                right:  _container.style.right,
                bottom: _container.style.bottom
            }));
        } catch {}
    }

    function _loadPosition() {
        try {
            const saved = JSON.parse(localStorage.getItem(POSITION_KEY) || 'null');
            if (saved && saved.right && saved.bottom) {
                _container.style.right  = saved.right;
                _container.style.bottom = saved.bottom;
                _container.style.left   = 'auto';
                _container.style.top    = 'auto';
            }
        } catch {}
    }

    // ── Minimizar ─────────────────────────────────────────────────────────────

    function toggleMinimize() {
        _isMinimized = !_isMinimized;
        _container.classList.toggle('ethy-minimized', _isMinimized);
        const btn = _container.querySelector('.ethy-minimize-btn');
        if (btn) btn.innerHTML = _isMinimized ? '+' : '−';
        if (_isMinimized) {
            hideBubble();
            // Cerrar también el panel de tutoriales si estaba abierto
            if (_tutorialPanel) _tutorialPanel.classList.remove('visible');
            _tutorialPanelVisible = false;
            removeHighlight();
            // Si estaba durmiendo, despertar para evitar ZZZ invisible
            if (_isSleeping) _wakeUp(true);
        }
        try { localStorage.setItem(MINIMIZED_KEY, _isMinimized ? '1' : '0'); } catch {}
    }

    // ── Sistema de duermevela ─────────────────────────────────────────────────

    let _activityThrottleTimer = null;
    function _onUserActivity() {
        if (_isSleeping) {
            _wakeUp();
            _resetSleepTimer();
            return;
        }
        // Throttle to once every 10 seconds for mousemove-heavy paths
        if (_activityThrottleTimer) return;
        _activityThrottleTimer = setTimeout(() => {
            _activityThrottleTimer = null;
            _resetSleepTimer();
        }, 10000);
    }

    function _resetSleepTimer() {
        if (_sleepTimeout) clearTimeout(_sleepTimeout);
        _sleepTimeout = setTimeout(_goToSleep, SLEEP_DELAY);
    }

    function _goToSleep() {
        if (_isMinimized || _bubble.classList.contains('visible') || _isSleeping) return;
        _isSleeping = true;
        setExpression('neutral');
        _container.classList.add('ethy-sleeping');
        // Mostrar ZZZ flotantes en el body
        _body.classList.add('ethy-zzz');
    }

    function _wakeUp(silent = false) {
        if (!_isSleeping) return;
        _isSleeping = false;
        _container.classList.remove('ethy-sleeping');
        _body.classList.remove('ethy-zzz');
        if (!silent) {
            _body.classList.add('ethy-hello');
            setTimeout(() => _body.classList.remove('ethy-hello'), 600);
            setExpression(_idleBaseExpression);
            say('¡Oh! ¡Ya estás de vuelta! 😊', { expression: 'surprised', duration: 3000 });
        }
        _resetSleepTimer();
    }

    // ── Easter eggs — clics múltiples ─────────────────────────────────────────

    const EASTER_EGGS = [
        { text: '¡Ay! ¡Para, para! 😣', expression: 'sad' },
        { text: '¡Oye, que me haces cosquillas! 😅', expression: 'surprised' },
        { text: 'Está bien, ya veo que tienes energía... 🙄', expression: 'thoughtful' },
        { text: '¡Me rindo! ¡Tú ganas! 🏳️', expression: 'sad' },
        { text: '...¿Enserio? ¿No tienes nada mejor que hacer? 👀', expression: 'wink' },
        { text: 'Muy bien. Seguiré aquí, ignorándote con dignidad. 😤', expression: 'neutral' },
    ];
    let _easterEggIndex = 0;

    function _handleMultiClick() {
        _clickCount++;
        if (_clickTimer) clearTimeout(_clickTimer);

        if (_clickCount >= 3) {
            const egg = EASTER_EGGS[_easterEggIndex % EASTER_EGGS.length];
            _easterEggIndex++;
            say(egg.text, { expression: egg.expression, duration: 4000 });
            _clickCount = 0;
            return true; // egg fired — caller should skip other actions
        } else {
            _clickTimer = setTimeout(() => { _clickCount = 0; }, 600);
            return false;
        }
    }

    // ── Reacciones al clima ───────────────────────────────────────────────────

    const WEATHER_REACTIONS = {
        rain: [
            { text: '¡Qué lluvia más bonita... aunque yo no me mojo! ☔', expression: 'happy' },
            { text: 'Me encanta la lluvia. Tan melancólica... 🌧️', expression: 'thoughtful' },
        ],
        fog:  [
            { text: 'Oooh, qué misterioso con tanta niebla... 👀', expression: 'surprised' },
            { text: 'Con esta niebla casi no se me ve. ¡Perfecto para esconderme! 🌫️', expression: 'wink' },
        ],
        none: [
            { text: '¡Qué día más despejado! ☀️', expression: 'happy' },
            { text: 'Un clima tranquilo para una historia tranquila. 🌤️', expression: 'wink' },
        ],
    };
    let _lastWeather = null;

    function _onWeatherChange(weather) {
        if (!weather || weather === _lastWeather) return;
        _lastWeather = weather;
        if (_isMinimized || _isSleeping || _bubble.classList.contains('visible')) return;
        const reactions = WEATHER_REACTIONS[weather] || WEATHER_REACTIONS.none;
        const r = reactions[Math.floor(Math.random() * reactions.length)];
        setTimeout(() => {
            say(r.text, { expression: r.expression, duration: 5000 });
        }, 600);
    }

    // ── Funciones de expresión ───────────────────────────────────────────────

    function setExpression(expression) {
        if (!EXPRESSIONS[expression]) {
            console.warn(`[Ethy] Expresión "${expression}" no existe`);
            return;
        }

        // Remover expresión anterior
        Object.values(EXPRESSIONS).forEach(exp => {
            _body.classList.remove(exp.class);
        });

        // Aplicar nueva expresión
        _body.classList.add(EXPRESSIONS[expression].class);
        _currentExpression = expression;
    }

    // ── Funciones de diálogo ─────────────────────────────────────────────────

    // Referencia al texto y botones del mensaje actual (para poder hacer skip)
    let _currentSayText = '';
    let _currentSayButtons = [];
    let _currentSayDuration = 0;
    let _autocloseTimeout = null;

    function _renderButtons(actions, buttons) {
        actions.innerHTML = '';
        buttons.forEach(btn => {
            const button = document.createElement('button');
            button.className = 'ethy-btn' + (btn.primary ? ' primary' : '');
            button.textContent = btn.text;
            button.onclick = () => {
                // Fix: los botones de navegación usan close:false para que
                // _showTutorialStep() no sea cancelado por hideBubble() después
                if (btn.action) btn.action();
                if (btn.close !== false) hideBubble();
            };
            actions.appendChild(button);
        });
    }

    function _completeTyping() {
        if (!_isTyping) return;
        if (_typingTimeout) { clearTimeout(_typingTimeout); _typingTimeout = null; }
        _isTyping = false;
        const content = _bubble.querySelector('.ethy-content');
        const actions = _bubble.querySelector('.ethy-actions');
        content.innerHTML = _currentSayText;
        _renderButtons(actions, _currentSayButtons);
        if (_currentSayDuration > 0) {
            if (_autocloseTimeout) clearTimeout(_autocloseTimeout);
            _autocloseTimeout = setTimeout(hideBubble, _currentSayDuration);
        }
    }

    function say(text, options = {}) {
        const { expression = 'neutral', duration = 0, buttons = [] } = options;

        // Cancelar auto-cierre anterior
        if (_autocloseTimeout) { clearTimeout(_autocloseTimeout); _autocloseTimeout = null; }
        // Cancelar tipeo anterior
        if (_typingTimeout) { clearTimeout(_typingTimeout); _typingTimeout = null; }

        setExpression(expression);

        // Guardar para skip
        _currentSayText = text;
        _currentSayButtons = buttons;
        _currentSayDuration = duration;

        const content = _bubble.querySelector('.ethy-content');
        const actions = _bubble.querySelector('.ethy-actions');

        actions.innerHTML = '';

        // Mostrar burbuja
        _bubble.classList.add('visible');

        // Efecto de escritura
        _isTyping = true;
        content.innerHTML = '<span class="ethy-typing"><span></span><span></span><span></span></span>';

        let charIndex = 0;
        const typeChar = () => {
            if (!_isTyping) return; // cancelado externamente
            if (charIndex < text.length) {
                content.innerHTML = text.substring(0, charIndex + 1) + '<span class="ethy-cursor">|</span>';
                charIndex++;
                _typingTimeout = setTimeout(typeChar, CONFIG.TYPING_SPEED);
            } else {
                _typingTimeout = null;
                _isTyping = false;
                content.innerHTML = text;
                _renderButtons(actions, buttons);
                if (duration > 0) {
                    _autocloseTimeout = setTimeout(hideBubble, duration);
                }
            }
        };

        typeChar();
    }

    function hideBubble() {
        _bubble.classList.remove('visible');
        if (_typingTimeout) { clearTimeout(_typingTimeout); _typingTimeout = null; }
        if (typeof _autocloseTimeout !== 'undefined' && _autocloseTimeout) {
            clearTimeout(_autocloseTimeout); _autocloseTimeout = null;
        }
        _isTyping = false;
    }

    // ── Sistema de tutoriales — panel independiente ──────────────────────────
    //
    // Los tutoriales viven en su propio panel DOM, completamente separado
    // de say() / _bubble. Sin animación de tipeo, sin timers, sin conflictos
    // de estado con los mensajes normales de Ethy.

    function _createTutorialPanel() {
        if (_tutorialPanel) return;
        _tutorialPanel = document.createElement('div');
        _tutorialPanel.className = 'ethy-tutorial-panel';
        _tutorialPanel.setAttribute('aria-live', 'polite');
        _tutorialPanel.innerHTML = `
            <div class="ethy-tp-header">
                <span class="ethy-tp-icon">✦</span>
                <span class="ethy-tp-title"></span>
                <button class="ethy-tp-close" title="Cerrar tutorial" aria-label="Cerrar">✕</button>
            </div>
            <div class="ethy-tp-content"></div>
            <div class="ethy-tp-footer">
                <div class="ethy-tp-dots"></div>
                <div class="ethy-tp-nav">
                    <button class="ethy-tp-btn ethy-tp-prev" aria-label="Paso anterior">←</button>
                    <button class="ethy-tp-btn ethy-tp-next ethy-tp-primary" aria-label="Siguiente paso">Siguiente →</button>
                </div>
            </div>
            <button class="ethy-tp-skip">Saltar tutorial</button>
        `;
        _container.appendChild(_tutorialPanel);

        _tutorialPanel.querySelector('.ethy-tp-close').addEventListener('click', endTutorial);
        _tutorialPanel.querySelector('.ethy-tp-skip').addEventListener('click', endTutorial);
        _tutorialPanel.querySelector('.ethy-tp-prev').addEventListener('click', () => {
            if (_tutorialStep > 0) { _tutorialStep--; _renderTutorialStep(); }
        });
        _tutorialPanel.querySelector('.ethy-tp-next').addEventListener('click', () => {
            if (_currentTutorial && _tutorialStep < _currentTutorial.steps.length - 1) {
                _tutorialStep++;
                _renderTutorialStep();
            } else {
                endTutorial();
            }
        });
    }

    function _renderTutorialStep() {
        if (!_currentTutorial || !_tutorialPanel) return;
        const step = _currentTutorial.steps[_tutorialStep];
        const total = _currentTutorial.steps.length;

        // Título
        _tutorialPanel.querySelector('.ethy-tp-title').textContent = _currentTutorial.title;

        // Contenido — sin tipeo, texto completo inmediato
        _tutorialPanel.querySelector('.ethy-tp-content').textContent = step.text;

        // Dots navegables
        const dotsEl = _tutorialPanel.querySelector('.ethy-tp-dots');
        dotsEl.innerHTML = '';
        for (let i = 0; i < total; i++) {
            const dot = document.createElement('button');
            dot.className = 'ethy-tp-dot' +
                (i === _tutorialStep ? ' active' : '') +
                (i < _tutorialStep ? ' done' : '');
            dot.setAttribute('aria-label', 'Ir al paso ' + (i + 1));
            const stepI = i;
            dot.addEventListener('click', () => { _tutorialStep = stepI; _renderTutorialStep(); });
            dotsEl.appendChild(dot);
        }

        // Botones de navegación
        const prev = _tutorialPanel.querySelector('.ethy-tp-prev');
        const next = _tutorialPanel.querySelector('.ethy-tp-next');
        prev.style.visibility = _tutorialStep > 0 ? 'visible' : 'hidden';

        if (_tutorialStep === total - 1) {
            next.textContent = '¡Entendido! ✓';
            next.classList.add('ethy-tp-finish');
        } else {
            next.textContent = 'Siguiente →';
            next.classList.remove('ethy-tp-finish');
        }

        // Expresión de Ethy para este paso
        if (!_isMinimized && step.expression) {
            setExpression(step.expression);
            _body.classList.add('ethy-hello');
            setTimeout(() => _body.classList.remove('ethy-hello'), 400);
        }

        // Highlight de elemento si lo hay
        if (step.action) step.action();
        else removeHighlight();
    }

    function startTutorial(tutorialKey) {
        const tutorial = TUTORIALS[tutorialKey];
        if (!tutorial) {
            console.warn(`[Ethy] Tutorial "${tutorialKey}" no existe`);
            return;
        }
        if (_seenTutorials.has(tutorialKey) && !tutorial.force) return;

        _currentTutorial = tutorial;
        _tutorialStep = 0;
        _seenTutorials.add(tutorialKey);
        _saveSeenTutorials();

        // Asegurar panel creado
        _createTutorialPanel();

        // Ocultar burbuja normal si estaba abierta
        hideBubble();

        // Mostrar panel
        _tutorialPanel.classList.add('visible');
        _tutorialPanelVisible = true;

        _renderTutorialStep();
    }

    function endTutorial() {
        if (!_currentTutorial) return;
        _currentTutorial = null;
        _tutorialStep = 0;

        // Ocultar panel
        if (_tutorialPanel) {
            _tutorialPanel.classList.remove('visible');
        }
        _tutorialPanelVisible = false;
        removeHighlight();

        // Mensaje breve de despedida (solo si no está minimizado)
        if (!_isMinimized) {
            setTimeout(() => {
                say('¡Estoy aquí si me necesitas! Solo haz clic en mí. 😊', {
                    expression: 'wink',
                    duration: 3000
                });
            }, 200);
        }
    }

    // Compatibilidad: _showTutorialStep y _updateStepIndicators
    // ya no se usan externamente pero los dejamos vacíos por si
    // algún código externo los llama.
    function _showTutorialStep() { _renderTutorialStep(); }
    function _updateStepIndicators() {}

    // ── Funciones de sección ─────────────────────────────────────────────────

    function onEnterSection(section, mode) {
        // Pequeña demora para que la UI se actualice
        setTimeout(() => {
            // Ajustar posición de Ethy según la sección
            if (_container) {
                if (section === 'mainMenu') {
                    _container.classList.add('near-profile');
                } else {
                    _container.classList.remove('near-profile');
                }
            }
            
            // Expresión aleatoria al entrar en cada sección (siempre, no solo tutoriales)
            _setSectionExpression(section);

            switch (section) {
                case 'mainMenu':
                    if (!_seenTutorials.has('mainMenu')) {
                        startTutorial('mainMenu');
                    }
                    break;
                case 'gallery':
                    if (!_seenTutorials.has('gallery')) {
                        startTutorial('gallery');
                    }
                    break;
                case 'topics':
                    if (!_seenTutorials.has('createTopic')) {
                        startTutorial('createTopic');
                    }
                    break;
                case 'vn':
                    const isRPG = mode === 'rpg' || (typeof currentTopicMode !== 'undefined' && currentTopicMode === 'rpg');
                    const tutorialKey = isRPG ? 'vnRPG' : 'vnClassic';
                    if (!_seenTutorials.has(tutorialKey)) {
                        startTutorial(tutorialKey);
                    }
                    break;
                case 'options':
                    if (!_seenTutorials.has('options')) {
                        startTutorial('options');
                    }
                    break;
                case 'saveHub':
                    if (!_seenTutorials.has('saveHub')) {
                        startTutorial('saveHub');
                    }
                    break;
            }
        }, 500);
    }

    function _onSectionChange() {
        // Detectar sección actual por URL o estado
        const hash = window.location.hash;
        // Implementar lógica según la estructura de la app
    }

    function _onEthyClick() {
        _onUserActivity(); // resetear sleep timer en cualquier click

        // If the mouse moved enough to be a real drag, ignore this click
        if (_wasDragging) { _wasDragging = false; return; }

        if (_isMinimized) {
            toggleMinimize();
            return;
        }

        if (_isSleeping) {
            _wakeUp();
            return;
        }

        if (_tutorialPanelVisible) {
            endTutorial();
            return;
        }
        if (_isTyping) {
            _completeTyping();
        } else if (_bubble.classList.contains('visible')) {
            hideBubble();
        } else {
            // Easter egg takes priority: if it fires, skip the help menu
            if (_handleMultiClick()) return;
            showHelpMenu();
        }
    }

    function showHelpMenu() {
        const currentSection = _detectCurrentSection();
        
        say('¿En qué puedo ayudarte? 🎭', {
            expression: 'happy',
            buttons: [
                { text: 'Ver tutorial', primary: true, close: false, action: () => {
                    if (currentSection && TUTORIALS[currentSection]) {
                        // Fix: usar _seenTutorials.delete() en vez de mutar el objeto tutorial
                        _seenTutorials.delete(currentSection);
                        startTutorial(currentSection);
                    } else {
                        say('No hay tutorial disponible para esta sección. 😅', { expression: 'sad', duration: 3000 });
                    }
                }},
                { text: 'Consejo rápido', close: false, action: () => showRandomTip() },
                { text: 'Cerrar' }
            ]
        });
    }

    function _detectCurrentSection() {
        // Fix: comprobar tanto .hidden como display:none y la clase 'active'
        function _isVisible(id) {
            const el = document.getElementById(id);
            if (!el) return false;
            if (el.classList.contains('hidden')) return false;
            if (el.style.display === 'none') return false;
            return true;
        }
        function _isActive(id) {
            const el = document.getElementById(id);
            if (!el) return false;
            return el.classList.contains('active') || _isVisible(id);
        }
        if (_isVisible('mainMenu') || _isActive('mainMenu')) return 'mainMenu';
        if (_isActive('gallerySection')) return 'gallery';
        if (_isActive('topicsSection')) return 'topics';
        if (_isActive('vnSection')) return 'vn';
        if (_isActive('optionsSection')) return 'options';
        if (_isActive('saveHubSection')) return 'saveHub';
        return null;
    }

    // ── Consejos aleatorios ──────────────────────────────────────────────────

    const TIPS = [
        { text: '¿Sabías que puedes usar **negrita** y *cursiva* en los mensajes? ¡Pruébalo!', expression: 'excited' },
        { text: 'Los emotes como /happy, /sad y /angry dan mucha vida a los personajes. 🎭', expression: 'happy' },
        { text: 'Guarda tu partida regularmente. ¡Nunca se sabe qué puede pasar!', expression: 'thoughtful' },
        { text: 'En modo RPG, el Oráculo decide el destino basado en tus stats. ¡Elige sabiamente!', expression: 'surprised' },
        { text: 'Puedes compartir tus historias con un código único. ¡Haz que otros las disfruten!', expression: 'love' },
        { text: 'Las flechas ← → te permiten navegar rápidamente por los mensajes.', expression: 'neutral' },
        { text: 'Presiona ESPACIO para avanzar el texto más rápido.', expression: 'wink' },
        { text: 'En la Galería puedes crear personajes con stats detallados para modo RPG.', expression: 'happy' }
    ];

    function showRandomTip() {
        const tip = TIPS[Math.floor(Math.random() * TIPS.length)];
        say(tip.text, {
            expression: tip.expression,
            duration: 6000
        });
    }

    // ── Funciones de utilidad ────────────────────────────────────────────────

    function show() {
        _container.style.opacity = '1';
        _container.style.transform = 'scale(1)';
        _isVisible = true;
        
        // Animación de entrada
        _body.classList.add('ethy-hello');
        setTimeout(() => _body.classList.remove('ethy-hello'), 600);
    }

    function hide() {
        _container.style.opacity = '0';
        _container.style.transform = 'scale(0)';
        _isVisible = false;
    }

    function highlightElement(selector) {
        const element = document.querySelector(selector);
        if (!element) return;

        // Crear overlay de enfoque
        let overlay = document.getElementById('ethyFocusOverlay');
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.id = 'ethyFocusOverlay';
            overlay.className = 'ethy-focus-overlay';
            document.body.appendChild(overlay);
        }

        // Crear highlight
        const rect = element.getBoundingClientRect();
        const highlight = document.createElement('div');
        highlight.className = 'ethy-highlight';
        highlight.style.cssText = `
            top: ${rect.top - 10}px;
            left: ${rect.left - 10}px;
            width: ${rect.width + 20}px;
            height: ${rect.height + 20}px;
        `;

        overlay.innerHTML = '';
        overlay.appendChild(highlight);
        overlay.classList.add('active');

        // Scroll al elemento
        element.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }

    function removeHighlight() {
        const overlay = document.getElementById('ethyFocusOverlay');
        if (overlay) {
            overlay.classList.remove('active');
            setTimeout(() => {
                if (overlay.parentNode) {
                    overlay.parentNode.removeChild(overlay);
                }
            }, 400);
        }
    }

    // ── Persistencia ─────────────────────────────────────────────────────────

    function _loadSeenTutorials() {
        try {
            const stored = localStorage.getItem(CONFIG.TUTORIAL_KEY);
            if (stored) {
                const parsed = JSON.parse(stored);
                _seenTutorials = new Set(parsed);
            }
        } catch (e) {
            console.warn('[Ethy] Error cargando tutoriales vistos:', e);
        }
    }

    function _saveSeenTutorials() {
        try {
            localStorage.setItem(CONFIG.TUTORIAL_KEY, JSON.stringify([..._seenTutorials]));
        } catch (e) {
            console.warn('[Ethy] Error guardando tutoriales vistos:', e);
        }
    }

    function resetTutorials() {
        _seenTutorials.clear();
        _saveSeenTutorials();
        say('¡Tutoriales reiniciados! Volveré a explicarlo todo. 😊', {
            expression: 'happy',
            duration: 3000
        });
    }

    // ── API pública ──────────────────────────────────────────────────────────

    return {
        init,
        show,
        hide,
        say,
        hideBubble,
        setExpression,
        startTutorial,
        endTutorial,
        showHelpMenu,
        showRandomTip,
        highlightElement,
        removeHighlight,
        onEnterSection,
        resetTutorials,
        toggleMinimize,
        get isMinimized() { return _isMinimized; },
        get isVisible() { return _isVisible; },
        get currentExpression() { return _currentExpression; },
        get seenTutorials() { return [..._seenTutorials]; },
        EXPRESSIONS: Object.keys(EXPRESSIONS),
        TUTORIALS: Object.keys(TUTORIALS)
    };

})();

// Inicializar cuando el DOM esté listo
document.addEventListener('DOMContentLoaded', () => {
    // Pequeña demora para asegurar que otros scripts estén cargados
    setTimeout(() => {
        Ethy.init();
    }, 500);
});

// Exponer globalmente
window.Ethy = Ethy;
