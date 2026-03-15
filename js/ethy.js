// ============================================
// ETHY - La mascota guía de Etheria
// ============================================
// Sistema de guía interactiva con múltiples expresiones y tutoriales
// para cada sección de la aplicación.
// ============================================

const Ethy = (function() {
    'use strict';

    const logger = window.EtheriaLogger;

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

        // ── Menú Principal ───────────────────────────────────────────────────
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
                    text: 'En "Nueva Partida" empieza todo. Puedes crear una historia en modo Clásico —roleplay libre— o en modo RPG con dados y stats. ¡Tú eliges!',
                    expression: 'happy',
                    action: () => highlightElement('.menu-button-console.primary')
                },
                {
                    text: 'En "Personajes" gestionas las fichas de todos tus personajes: avatar, trasfondo, stats y mucho más.',
                    expression: 'thoughtful',
                    action: () => highlightElement('.menu-button-console:nth-child(2)')
                },
                {
                    text: 'En "Opciones" ajustas el tema visual, tamaño de fuente, velocidad de texto... todo para que la experiencia sea tuya.',
                    expression: 'neutral',
                    action: () => highlightElement('.menu-button-console:nth-child(3)')
                },
                {
                    text: 'Abajo tienes tu perfil. Tócalo para cambiar tu nombre, avatar y demás datos en cualquier momento.',
                    expression: 'wink',
                    action: () => highlightElement('.menu-profile-btn')
                },
                {
                    text: 'El pequeño icono junto al perfil sirve para importar o exportar tu partida. ¡Así nunca pierdes tus historias!',
                    expression: 'surprised',
                    action: () => highlightElement('.menu-save-btn')
                },
                {
                    text: '¡Todo listo! Haz clic en mí siempre que quieras orientación. ¡Buena suerte, aventurera! 🌿',
                    expression: 'love',
                    action: null
                }
            ]
        },

        // ── Galería de Personajes ────────────────────────────────────────────
        gallery: {
            title: 'Personajes',
            expression: 'happy',
            steps: [
                {
                    text: '¡Aquí viven todos tus personajes! Puedes buscarlos, filtrarlos por raza o jugador, y ver sus fichas completas.',
                    expression: 'happy',
                    action: null
                },
                {
                    text: 'Pulsa "Nuevo personaje" para crear una ficha desde cero: nombre, raza, edad, descripción física, personalidad, historia y notas libres.',
                    expression: 'excited',
                    action: () => highlightElement('.gallery-new-btn')
                },
                {
                    text: 'En modo RPG cada personaje tendrá también stats (STR, INT, VIT, AGI) y un nivel que crece con la experiencia.',
                    expression: 'thoughtful',
                    action: null
                },
                {
                    text: 'Puedes subir un avatar propio o usar una URL. Cada personaje tiene su color de acento para la caja de diálogo. 🎨',
                    expression: 'wink',
                    action: null
                },
                {
                    text: '¿Quién será tu próximo personaje? Las mejores historias nacen de personajes bien construidos. 🎭',
                    expression: 'love',
                    action: null
                }
            ]
        },

        // ── Crear Historia ───────────────────────────────────────────────────
        createTopic: {
            title: 'Nueva Historia',
            expression: 'excited',
            steps: [
                {
                    text: '¡Vamos a crear algo especial! Lo primero es elegir el modo de juego.',
                    expression: 'excited',
                    action: null
                },
                {
                    text: 'El modo Clásico es roleplay puro: narración libre sin mecánicas. Perfecto cuando el foco es el diálogo y la escritura.',
                    expression: 'happy',
                    action: () => highlightElement('#modeRoleplay')
                },
                {
                    text: 'El modo RPG añade stats, tiradas de dados y el Oráculo del Destino. Las acciones tienen consecuencias reales. ¡El azar da forma a la historia! 🎲',
                    expression: 'surprised',
                    action: () => highlightElement('#modeRpg')
                },
                {
                    text: 'Ponle un título y escribe el primer mensaje: ese es el arranque de tu historia. Puedes usar **negrita** y *cursiva* para darle estilo.',
                    expression: 'thoughtful',
                    action: () => highlightElement('#topicTitleInput')
                },
                {
                    text: '¡Todo listo! Una vez creada podrás compartirla con otros jugadores en tiempo real. ✨',
                    expression: 'love',
                    action: null
                }
            ]
        },

        // ── Modo VN Clásico ──────────────────────────────────────────────────
        vnClassic: {
            title: 'Historia — Modo Clásico',
            expression: 'happy',
            steps: [
                {
                    text: '¡Tu historia está en marcha! En modo Clásico el protagonismo es del texto y las decisiones.',
                    expression: 'happy',
                    action: null
                },
                {
                    text: 'Haz clic en la caja de diálogo o pulsa ESPACIO para avanzar. Las flechas ← → navegan entre mensajes.',
                    expression: 'neutral',
                    action: () => highlightElement('.vn-dialogue-box')
                },
                {
                    text: 'El botón "Responder" abre el panel de escritura. Elige tu personaje y escribe tu próxima intervención.',
                    expression: 'excited',
                    action: () => highlightElement('.reply-btn')
                },
                {
                    text: 'Añade emociones con emotes: escribe /happy, /sad, /angry, /love... y el personaje reaccionará visualmente. 🎭',
                    expression: 'wink',
                    action: null
                },
                {
                    text: 'También puedes crear opciones de elección para bifurcar la historia y dejar que los lectores decidan su rumbo.',
                    expression: 'thoughtful',
                    action: null
                },
                {
                    text: 'La barra de controles te permite navegar por el historial, marcar favoritos y exportar la historia completa. 📜',
                    expression: 'surprised',
                    action: () => highlightElement('.vn-controls')
                }
            ]
        },

        // ── Modo VN RPG ──────────────────────────────────────────────────────
        vnRPG: {
            title: 'Historia — Modo RPG',
            expression: 'excited',
            steps: [
                {
                    text: '¡Modo RPG activo! Cada decisión puede tener consecuencias marcadas por los dados. 🎲',
                    expression: 'excited',
                    action: null
                },
                {
                    text: 'La ficha de tu personaje aparece arriba a la izquierda. Muestra HP, stats y rango de afinidad con otros personajes.',
                    expression: 'thoughtful',
                    action: () => highlightElement('.vn-info-card')
                },
                {
                    text: 'El Oráculo del Destino aparece cuando un personaje intenta algo difícil. Tiras un D20 sumando tu stat relevante contra una dificultad.',
                    expression: 'surprised',
                    action: () => highlightElement('#vnOracleFloatBtn')
                },
                {
                    text: '¡El resultado del dado determina si la acción tiene éxito o falla! El narrador describe las consecuencias en el siguiente mensaje.',
                    expression: 'happy',
                    action: null
                },
                {
                    text: 'El HP puede bajar por combate o consecuencias del Oráculo. Si llega a cero... algo malo pasará. 💀',
                    expression: 'sad',
                    action: () => highlightElement('.vn-info-hp-bar')
                },
                {
                    text: '¡Que los dados te sean favorables, aventurera! 🎲✨',
                    expression: 'love',
                    action: null
                }
            ]
        },

        // ── Opciones ─────────────────────────────────────────────────────────
        options: {
            title: 'Opciones',
            expression: 'neutral',
            steps: [
                {
                    text: 'Aquí ajustas Etheria a tu gusto. Hay tres pestañas: Apariencia, Lectura y Sonido.',
                    expression: 'neutral',
                    action: () => highlightElement('.opt-tab-bar')
                },
                {
                    text: 'En Apariencia puedes cambiar entre modo Claro y Oscuro, ajustar el tamaño de fuente y aplicar filtros de atmósfera a las escenas. 🌙',
                    expression: 'thoughtful',
                    action: () => highlightElement('#themeToggleBtn')
                },
                {
                    text: 'En Lectura controlas la velocidad del texto, el texto instantáneo y el modo inmersivo para leer sin distracciones.',
                    expression: 'happy',
                    action: () => highlightElement('[data-tab="reading"]')
                },
                {
                    text: 'Desde Sonido ajustas el volumen general y el de los efectos de lluvia y ambiente. 🔊',
                    expression: 'wink',
                    action: () => highlightElement('[data-tab="sound"]')
                },
                {
                    text: '¡Experimenta hasta encontrar la combinación que más te guste!',
                    expression: 'excited',
                    action: null
                }
            ]
        },

        // ── Importar / Exportar ──────────────────────────────────────────────
        saveHub: {
            title: 'Importar y Exportar',
            expression: 'thoughtful',
            steps: [
                {
                    text: 'Este panel sirve para mover tus datos hacia fuera o hacia dentro de Etheria.',
                    expression: 'thoughtful',
                    action: null
                },
                {
                    text: '"Descargar partida" exporta toda tu información a un archivo JSON. Es tu copia de seguridad local.',
                    expression: 'neutral',
                    action: () => highlightElement('.save-hub-primary')
                },
                {
                    text: '"Cargar partida" importa ese archivo JSON. Úsalo para restaurar datos o llevarlos de un dispositivo a otro.',
                    expression: 'happy',
                    action: null
                },
                {
                    text: 'Con "Generar código" creas un código de 6 caracteres para compartir una historia concreta con otro jugador.',
                    expression: 'excited',
                    action: null
                },
                {
                    text: 'Y con "Importar código" recibes la historia que alguien te compartió. ¡Así de fácil es colaborar! 🌿',
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

        // Crear cuerpo de Ethy — HTML inline con partes de cara animables
        _body = document.createElement('div');
        _body.className = 'ethy-body ethy-expression-neutral';
        _body.innerHTML = `
            <svg class="ethy-svg" viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg">
                <!-- Sombra en el suelo -->
                <ellipse cx="40" cy="68" rx="22" ry="6" fill="#c4b49a" opacity="0.35"/>
                <!-- Cuerpo / carcasa -->
                <rect x="14" y="18" width="52" height="42" rx="4" fill="none" stroke="#9c8870" stroke-width="1.5"/>
                <!-- Antena -->
                <g class="ethy-part-antenna">
                    <path d="M58 10 C58 10 62 22 55 24" stroke="#9c8870" stroke-width="1.2" stroke-linecap="round" fill="none"/>
                    <path d="M56 10 L60 8 L58 12" fill="#9c8870"/>
                </g>
                <!-- Ojos -->
                <g class="ethy-part-eyes">
                    <circle class="ethy-eye-left"  cx="33" cy="38" r="4" fill="none" stroke="#9c8870" stroke-width="1.3"/>
                    <circle class="ethy-eye-right" cx="47" cy="38" r="4" fill="none" stroke="#9c8870" stroke-width="1.3"/>
                    <circle class="ethy-pupil-left"  cx="33" cy="38" r="1.5" fill="#9c8870"/>
                    <circle class="ethy-pupil-right" cx="47" cy="38" r="1.5" fill="#9c8870"/>
                </g>
                <!-- Boca — cada expresión tiene su propio path, solo uno visible -->
                <g class="ethy-part-mouth">
                    <path class="ethy-mouth-neutral"   d="M35 44 Q40 46 45 44"            stroke="#9c8870" stroke-width="1.2" stroke-linecap="round" fill="none"/>
                    <path class="ethy-mouth-happy"     d="M33 43 Q40 50 47 43"            stroke="#9c8870" stroke-width="1.4" stroke-linecap="round" fill="none" opacity="0"/>
                    <path class="ethy-mouth-sad"       d="M33 47 Q40 42 47 47"            stroke="#9c8870" stroke-width="1.4" stroke-linecap="round" fill="none" opacity="0"/>
                    <path class="ethy-mouth-excited"   d="M32 43 Q40 52 48 43"            stroke="#9c8870" stroke-width="1.5" stroke-linecap="round" fill="none" opacity="0"/>
                    <path class="ethy-mouth-surprised" d="M37 43 Q40 49 43 43 Q40 51 37 43" stroke="#9c8870" stroke-width="1.2" stroke-linecap="round" fill="none" opacity="0"/>
                    <path class="ethy-mouth-thoughtful" d="M35 44 Q37 43 40 44 Q43 45 45 44" stroke="#9c8870" stroke-width="1.2" stroke-linecap="round" fill="none" opacity="0"/>
                    <path class="ethy-mouth-wink"      d="M34 43 Q40 49 46 44"            stroke="#9c8870" stroke-width="1.3" stroke-linecap="round" fill="none" opacity="0"/>
                    <path class="ethy-mouth-love"      d="M33 42 Q36 50 40 51 Q44 50 47 42" stroke="#9c8870" stroke-width="1.4" stroke-linecap="round" fill="none" opacity="0"/>
                    <!-- Lengua del amor — solo visible en love -->
                    <ellipse class="ethy-mouth-love-tongue" cx="40" cy="51" rx="3" ry="2" fill="#c9a86c" opacity="0"/>
                </g>
                <!-- Mejillas — solo visibles en happy/love/excited -->
                <g class="ethy-part-cheeks" opacity="0">
                    <ellipse cx="24" cy="43" rx="4" ry="2.5" fill="#d4899a" opacity="0.45"/>
                    <ellipse cx="56" cy="43" rx="4" ry="2.5" fill="#d4899a" opacity="0.45"/>
                </g>
            </svg>
        `;

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

    let _bubbleJustOpened = false;

    function _setupEventListeners() {
        // Cerrar burbuja y panel de tutoriales al hacer clic fuera
        document.addEventListener('click', (e) => {
            if (_bubbleJustOpened) return; // ignorar el click que abrió la burbuja
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
        // Intervalo aleatorio entre 8 y 14 segundos para cambio de expresión
        const randomInterval = () => Math.floor(Math.random() * 6000) + 8000;

        function scheduleNext() {
            _idleInterval = setTimeout(() => {
                _idleTick();
                scheduleNext();
            }, randomInterval());
        }
        scheduleNext();

        // ── Parpadeo automático ────────────────────────────────────────────
        // Parpadea cada 3-7 segundos de forma aleatoria y natural
        function scheduleBlink() {
            const delay = Math.floor(Math.random() * 4000) + 3000;
            setTimeout(() => {
                _doBlink();
                scheduleBlink();
            }, delay);
        }
        scheduleBlink();
    }

    function _doBlink() {
        if (!_body || _isMinimized) return;
        // Doble parpadeo ocasional (30% de las veces)
        _body.classList.add('ethy-blinking');
        setTimeout(() => {
            _body.classList.remove('ethy-blinking');
            if (Math.random() < 0.3) {
                setTimeout(() => {
                    _body.classList.add('ethy-blinking');
                    setTimeout(() => _body.classList.remove('ethy-blinking'), 180);
                }, 220);
            }
        }, 180);
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
        } catch (error) { logger?.warn('ethy', 'position save failed:', error?.message || error); }
    }

    function _loadPosition() {
        try {
            const saved = JSON.parse(localStorage.getItem(POSITION_KEY) || 'null');
            if (saved && saved.right && saved.bottom) {
                const maxRight = Math.max(12, window.innerWidth - 100);
                const maxBottom = Math.max(12, window.innerHeight - 100);
                const parsedRight = Number.parseFloat(saved.right);
                const parsedBottom = Number.parseFloat(saved.bottom);
                const safeRight = Number.isFinite(parsedRight)
                    ? `${Math.min(Math.max(parsedRight, 12), maxRight)}px`
                    : saved.right;
                const safeBottom = Number.isFinite(parsedBottom)
                    ? `${Math.min(Math.max(parsedBottom, 12), maxBottom)}px`
                    : saved.bottom;

                _container.style.right  = safeRight;
                _container.style.bottom = safeBottom;
                _container.style.left   = 'auto';
                _container.style.top    = 'auto';
            }
        } catch (error) { logger?.warn('ethy', 'position load failed:', error?.message || error); }
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
        try { localStorage.setItem(MINIMIZED_KEY, _isMinimized ? '1' : '0'); } catch (error) { logger?.warn('ethy', 'minimize state save failed:', error?.message || error); }
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
        if (!_body) return;

        // ── Quitar clases de expresión anteriores ──────────────────────────
        Object.values(EXPRESSIONS).forEach(exp => {
            _body.classList.remove(exp.class);
        });
        _body.classList.add(EXPRESSIONS[expression].class);
        _currentExpression = expression;

        // ── Actualizar cara inline ─────────────────────────────────────────
        _updateFace(expression);
    }

    // Mapeo de expresión → estado de cada parte de la cara
    const FACE_STATES = {
        neutral:    { mouth: 'neutral',    eyeScale: 1,    pupilY: 0,  cheeks: false, blink: false, squint: false, winkLeft: false },
        happy:      { mouth: 'happy',      eyeScale: 0.85, pupilY: 1,  cheeks: true,  blink: false, squint: true,  winkLeft: false },
        excited:    { mouth: 'excited',    eyeScale: 1.1,  pupilY: -1, cheeks: true,  blink: false, squint: false, winkLeft: false },
        sad:        { mouth: 'sad',        eyeScale: 0.8,  pupilY: 2,  cheeks: false, blink: false, squint: false, winkLeft: false },
        surprised:  { mouth: 'surprised',  eyeScale: 1.3,  pupilY: -2, cheeks: false, blink: false, squint: false, winkLeft: false },
        thoughtful: { mouth: 'thoughtful', eyeScale: 0.9,  pupilY: -1, cheeks: false, blink: false, squint: false, winkLeft: false },
        wink:       { mouth: 'wink',       eyeScale: 1,    pupilY: 1,  cheeks: false, blink: false, squint: false, winkLeft: true  },
        love:       { mouth: 'love',       eyeScale: 0.75, pupilY: 2,  cheeks: true,  blink: false, squint: true,  winkLeft: false },
    };

    function _updateFace(expression) {
        const state = FACE_STATES[expression] || FACE_STATES.neutral;
        const svg = _body.querySelector('.ethy-svg');
        if (!svg) return;

        // ── Ocultar todas las bocas, mostrar solo la activa ────────────────
        svg.querySelectorAll('[class^="ethy-mouth-"]').forEach(el => {
            el.setAttribute('opacity', '0');
            el.style.transition = 'opacity 0.25s ease';
        });
        const activeMouth = svg.querySelector(`.ethy-mouth-${expression}`);
        if (activeMouth) {
            activeMouth.setAttribute('opacity', '1');
        }
        // Lengua en love
        const tongue = svg.querySelector('.ethy-mouth-love-tongue');
        if (tongue) tongue.setAttribute('opacity', expression === 'love' ? '1' : '0');

        // ── Mejillas ───────────────────────────────────────────────────────
        const cheeks = svg.querySelector('.ethy-part-cheeks');
        if (cheeks) {
            cheeks.setAttribute('opacity', state.cheeks ? '1' : '0');
            cheeks.style.transition = 'opacity 0.3s ease';
        }

        // ── Ojos: escala y squint ──────────────────────────────────────────
        const eyeLeft  = svg.querySelector('.ethy-eye-left');
        const eyeRight = svg.querySelector('.ethy-eye-right');
        const pupilLeft  = svg.querySelector('.ethy-pupil-left');
        const pupilRight = svg.querySelector('.ethy-pupil-right');

        if (eyeLeft && eyeRight) {
            const baseR = 4;
            const rx = (baseR * state.eyeScale).toFixed(2);
            const rySquint = state.squint ? (baseR * 0.4).toFixed(2) : rx;

            // Eye circles → use rx/ry for ellipse-like squint via transform scaleY
            [eyeLeft, eyeRight].forEach(el => {
                el.style.transition = 'transform 0.25s cubic-bezier(0.34,1.56,0.64,1)';
                el.style.transformOrigin = 'center';
                const scaleX = state.eyeScale;
                const scaleY = state.squint ? 0.45 : state.eyeScale;
                el.style.transform = `scale(${scaleX}, ${scaleY})`;
            });

            // Wink: left eye closed
            if (eyeLeft && state.winkLeft) {
                eyeLeft.style.transform = 'scale(1, 0.1)';
            }
        }

        // ── Pupila: desplazamiento vertical según estado ───────────────────
        if (pupilLeft && pupilRight) {
            [pupilLeft, pupilRight].forEach(el => {
                el.style.transition = 'transform 0.2s ease';
                el.style.transform = `translateY(${state.pupilY}px)`;
            });
        }

        // ── Antena: vibra en excited ───────────────────────────────────────
        const antenna = svg.querySelector('.ethy-part-antenna');
        if (antenna) {
            antenna.style.transition = 'transform 0.25s ease';
            antenna.style.transformOrigin = '55px 22px';
            if (expression === 'excited') {
                antenna.classList.add('ethy-antenna-excited');
            } else {
                antenna.classList.remove('ethy-antenna-excited');
                antenna.style.transform = expression === 'happy'   ? 'rotate(8deg)'  :
                                           expression === 'sad'     ? 'rotate(-15deg)' :
                                           expression === 'surprised' ? 'rotate(-8deg) translateY(-3px)' :
                                           '';
            }
        }
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
            button.onclick = (e) => {
                e.stopPropagation(); // evitar que el click llegue al document y cierre la burbuja
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
        content.textContent = _currentSayText;
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

        // Mostrar burbuja — marcar flag para evitar cierre inmediato
        _bubbleJustOpened = true;
        _bubble.classList.add('visible');
        setTimeout(() => { _bubbleJustOpened = false; }, 50);

        // Efecto de escritura
        _isTyping = true;
        content.innerHTML = '<span class="ethy-typing"><span></span><span></span><span></span></span>';

        let charIndex = 0;
        const typeChar = () => {
            if (!_isTyping) return; // cancelado externamente
            if (charIndex < text.length) {
                content.textContent = text.substring(0, charIndex + 1);
                const cursor = document.createElement('span');
                cursor.className = 'ethy-cursor';
                cursor.textContent = '|';
                content.appendChild(cursor);
                charIndex++;
                _typingTimeout = setTimeout(typeChar, CONFIG.TYPING_SPEED);
            } else {
                _typingTimeout = null;
                _isTyping = false;
                content.textContent = text;
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
        { text: 'Puedes usar **negrita** y *cursiva* al escribir tus mensajes. ¡Dale estilo a la narrativa!', expression: 'excited' },
        { text: 'Los emotes /happy, /sad, /angry, /love y más dan vida a tus personajes. ¡Pruébalos!', expression: 'happy' },
        { text: 'En modo RPG, el Oráculo del Destino resuelve las acciones difíciles con un D20 + tu stat. ¡El azar manda!', expression: 'surprised' },
        { text: 'Puedes compartir una historia con un código de 6 caracteres. Búscalo en el botón de exportar del menú. 🔑', expression: 'love' },
        { text: 'Las flechas ← → o los botones de navegación permiten saltar entre mensajes rápidamente.', expression: 'neutral' },
        { text: 'Pulsa ESPACIO o haz clic en el diálogo para completar la animación de texto al instante.', expression: 'wink' },
        { text: 'Toca tu perfil en la parte inferior del menú para cambiar tu nombre, avatar y datos personales.', expression: 'happy' },
        { text: 'El diario de sesión guarda tus notas y resúmenes de partida. ¡Úsalo para no perder el hilo!', expression: 'thoughtful' },
        { text: 'En el panel de respuesta puedes crear opciones de elección para que la historia se ramifique. 🌿', expression: 'excited' },
        { text: 'El historial guarda todos los mensajes de la historia. Puedes marcarlos como favoritos con la estrella. ⭐', expression: 'thoughtful' },
        { text: 'Para hacer una copia de seguridad, usa el pequeño botón de exportar junto a tu perfil en el menú.', expression: 'neutral' },
        { text: 'En la ficha de personaje puedes añadir descripción física, personalidad, trasfondo y notas libres.', expression: 'happy' },
        { text: 'Puedes cambiar el clima de una escena desde el panel de respuesta: lluvia, niebla o despejado. 🌧️', expression: 'thoughtful' },
        { text: 'El modo inmersivo oculta los controles para leer la historia sin distracciones. ¡Búscalo en Opciones!', expression: 'wink' }
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
