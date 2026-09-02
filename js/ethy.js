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
    let _autocloseTimeout = null;
    let _currentSayText = '';
    let _currentSayButtons = [];
    let _currentSayDuration = 0;
    const SLEEP_DELAY = 150000; // 2.5 minutos sin interacción
    const POSITION_KEY = 'etheria_ethy_pos';
    const MINIMIZED_KEY = 'etheria_ethy_minimized';

    // ── Expresiones disponibles ──────────────────────────────────────────────
    const EXPRESSIONS = {
        neutral:    { class: 'ethy-expression-neutral',    emoji: '◉ ◉' },
        sad:        { class: 'ethy-expression-sad',        emoji: '╥_╥' },
        happy:      { class: 'ethy-expression-happy',      emoji: '◠‿◠' },
        excited:    { class: 'ethy-expression-excited',    emoji: '★ ★' },
        surprised:  { class: 'ethy-expression-surprised',  emoji: '◎_◎' },
        thoughtful: { class: 'ethy-expression-thoughtful', emoji: '◑ ◐' },
        wink:       { class: 'ethy-expression-wink',       emoji: '◠ ◉' },
        love:       { class: 'ethy-expression-love',       emoji: '♡ ♡' },
        mystic:     { class: 'ethy-expression-mystic',     emoji: '◇ ◇' },
        saving:     { class: 'ethy-expression-saving',     emoji: '✓ ✓' },
    };

    // ── Tutoriales por sección ───────────────────────────────────────────────
    const TUTORIALS = {

        // ── Menú Principal ───────────────────────────────────────────────────
        mainMenu: {
            title: 'El umbral de Etheria',
            expression: 'mystic',
            steps: [
                {
                    text: 'Llevo aquí desde antes de que llegaras. Este mundo se teje con historias, y la tuya acaba de añadir un hilo nuevo.',
                    expression: 'mystic',
                    action: null
                },
                {
                    text: '"Continuar" es la puerta. Al otro lado: roleplay libre —modo Clásico— o destino gobernado por los dados —modo RPG—. Elige con intención.',
                    expression: 'thoughtful',
                    action: () => highlightElement('.menu-button-console.primary')
                },
                {
                    text: '"Personajes" es el registro de almas. Sin ellas no hay relato posible; con ellas, cualquier historia puede ocurrir.',
                    expression: 'happy',
                    action: () => highlightElement('.menu-button-console:nth-child(2)')
                },
                {
                    text: 'El icono de guardado preserva tu mundo entero. Úsalo. Las historias merecen sobrevivir más allá de una sesión.',
                    expression: 'surprised',
                    action: () => highlightElement('.menu-save-btn')
                },
                {
                    text: 'Eso es todo lo que necesitas saber por ahora. El resto lo aprenderás escribiendo.',
                    expression: 'love',
                    action: null
                }
            ]
        },

        // ── Galería de Personajes ────────────────────────────────────────────
        gallery: {
            title: 'El registro de almas',
            expression: 'thoughtful',
            steps: [
                {
                    text: 'Aquí viven las almas que has invocado. Cada una guarda un secreto que todavía no le has contado a nadie.',
                    expression: 'thoughtful',
                    action: null
                },
                {
                    text: '"Nuevo personaje" abre el ritual: nombre, origen, carácter, secretos. Sé generosa con los detalles oscuros.',
                    expression: 'excited',
                    action: () => highlightElement('.gallery-new-btn')
                },
                {
                    text: 'En modo RPG cada alma tiene sus estadísticas propias. El nivel crece con lo que viven, no con lo que planeas para ellas.',
                    expression: 'mystic',
                    action: null
                },
                {
                    text: 'Los mejores personajes son los que hacen cosas que no planeaste. Déjales ese espacio.',
                    expression: 'love',
                    action: null
                }
            ]
        },

        // ── Crear Historia ───────────────────────────────────────────────────
        createTopic: {
            title: 'Invocar una historia',
            expression: 'mystic',
            steps: [
                {
                    text: 'Estás abriendo una grieta en el tejido. Lo que escribas aquí definirá el tono de todo lo que venga después. Sin prisa.',
                    expression: 'mystic',
                    action: null
                },
                {
                    text: 'Modo Clásico: solo el texto manda. Sin mecánicas, sin dados. Para cuando la narrativa importa más que el azar.',
                    expression: 'thoughtful',
                    action: () => highlightElement('#modeRoleplay')
                },
                {
                    text: 'Modo RPG: el Oráculo del Destino toma la pluma. Los dados deciden si las acciones tienen consecuencias... o consecuencias peores.',
                    expression: 'surprised',
                    action: () => highlightElement('#modeRpg')
                },
                {
                    text: 'Una vez creada, otros pueden unirse en tiempo real. La historia deja de pertenecerte solo a ti.',
                    expression: 'love',
                    action: null
                }
            ]
        },

        // ── Modo VN Clásico ──────────────────────────────────────────────────
        vnClassic: {
            title: 'La escena se abre',
            expression: 'love',
            steps: [
                {
                    text: 'La historia ya respira. En modo Clásico el texto lo es todo: sin dados, sin mecánicas. Solo vosotras y las palabras.',
                    expression: 'love',
                    action: null
                },
                {
                    text: 'Clic o ESPACIO para avanzar. Las flechas navegan por lo que ya ocurrió.',
                    expression: 'neutral',
                    action: () => highlightElement('.vn-dialogue-box')
                },
                {
                    text: '"Responder" abre el panel. Elige quién habla y qué dice. La historia espera.',
                    expression: 'thoughtful',
                    action: () => highlightElement('.reply-btn')
                },
                {
                    text: 'La barra de controles guarda el historial y permite exportar la historia completa. Nada de lo que escribáis tiene que perderse.',
                    expression: 'surprised',
                    action: () => highlightElement('.vn-toolbar')
                }
            ]
        },

        // ── Modo VN RPG ──────────────────────────────────────────────────────
        vnRPG: {
            title: 'El azar toma la pluma',
            expression: 'mystic',
            steps: [
                {
                    text: 'Modo RPG. El Oráculo del Destino tiene aquí su propia voz. Lo que queráis hacer tendrá que probarse ante él.',
                    expression: 'mystic',
                    action: null
                },
                {
                    text: 'Tu ficha: HP, estadísticas, afinidad. Arriba a la izquierda. Consúltala antes de cada acción que importe.',
                    expression: 'thoughtful',
                    action: () => highlightElement('.vn-info-card')
                },
                {
                    text: 'El Oráculo interviene cuando la acción es difícil. D20 más tu estadística relevante. El resultado es el principio, no el final.',
                    expression: 'surprised',
                    action: () => highlightElement('#vnOracleFloatBtn')
                },
                {
                    text: 'El HP llega a cero cuando el peso de las consecuencias se acumula. Cuando eso ocurre, algo cambia para siempre.',
                    expression: 'sad',
                    action: () => highlightElement('.vn-info-hp-bar')
                },
                {
                    text: 'Que los dados sean al menos interesantes.',
                    expression: 'love',
                    action: null
                }
            ]
        },

        // ── Opciones ─────────────────────────────────────────────────────────
        options: {
            title: 'Afinar el mundo',
            expression: 'thoughtful',
            steps: [
                {
                    text: 'Aquí moldeas cómo se siente Etheria. Apariencia, Lectura, Sonido. Cada una cambia algo en cómo vives el relato.',
                    expression: 'thoughtful',
                    action: () => highlightElement('.opt-tab-bar')
                },
                {
                    text: 'Apariencia: entre luz y oscuridad, tipografía, atmósfera. El mundo se ve distinto según cómo lo iluminas.',
                    expression: 'neutral',
                    action: () => highlightElement('#themeToggleBtn')
                },
                {
                    text: 'Sonido: el volumen de la lluvia, el ambiente. Algunas historias necesitan silencio. Otras, que truene.',
                    expression: 'wink',
                    action: () => highlightElement('[data-tab="sound"]')
                },
                {
                    text: 'No hay configuración correcta. Solo la que te hace olvidar que estás mirando una pantalla.',
                    expression: 'love',
                    action: null
                }
            ]
        },

        // ── Importar / Exportar ──────────────────────────────────────────────
        saveHub: {
            title: 'Custodiar el legado',
            expression: 'thoughtful',
            steps: [
                {
                    text: 'Las historias que no se preservan desaparecen. Este panel existe para que las tuyas no lo hagan.',
                    expression: 'thoughtful',
                    action: null
                },
                {
                    text: '"Descargar partida" exporta todo: personajes, relatos, vínculos. Un archivo. Tu mundo entero en una sola pieza.',
                    expression: 'neutral',
                    action: () => highlightElement('.save-hub-primary')
                },
                {
                    text: '"Generar código" crea un código para compartir una historia concreta. Así empieza la colaboración: con seis letras y confianza.',
                    expression: 'excited',
                    action: null
                },
                {
                    text: 'Guarda antes de cerrar. No porque el sistema lo exija. Porque las historias merecen sobrevivir.',
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
            _watchUserSelectScreen();         // vigilante "¿sigues ahí?" del selector
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
            <svg class="ethy-svg" viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg" style="overflow:visible">
  <defs>
    <radialGradient id="eg-body" cx="50%" cy="28%" r="78%">
      <stop offset="0%" stop-color="#2a1a52"/>
      <stop offset="100%" stop-color="#150c30"/>
    </radialGradient>
    <linearGradient id="eg-border" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%"   stop-color="rgba(203,182,255,0.95)"/>
      <stop offset="52%"  stop-color="rgba(157,107,255,0.80)"/>
      <stop offset="100%" stop-color="rgba(124,77,255,0.90)"/>
    </linearGradient>
    <filter id="eg-glow" x="-60%" y="-60%" width="220%" height="220%">
      <feGaussianBlur stdDeviation="1.5" result="b"/>
      <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
  </defs>

  <ellipse cx="40" cy="73" rx="18" ry="4" fill="#0a0520" opacity="0.4"/>

  <rect x="11" y="13" width="58" height="52" rx="16" fill="url(#eg-body)"/>
  <rect x="11" y="13" width="58" height="52" rx="16" stroke="url(#eg-border)" stroke-width="1.6" fill="none"/>
  <rect x="19" y="13.5" width="30" height="1.1" rx="0.55" fill="rgba(255,255,255,0.14)"/>
  <circle cx="14" cy="16" r="2" fill="rgba(157,107,255,0.55)"/>
  <circle cx="66" cy="16" r="2" fill="rgba(157,107,255,0.55)"/>
  <circle cx="14" cy="62" r="2" fill="rgba(157,107,255,0.38)"/>
  <circle cx="66" cy="62" r="2" fill="rgba(157,107,255,0.38)"/>

  <g class="ethy-part-antenna">
    <line x1="40" y1="13" x2="40" y2="5" stroke="rgba(183,148,246,0.85)" stroke-width="1.3" stroke-linecap="round"/>
    <path d="M40,1 l1.1,2.8 2.8,1.1 -2.8,1.1 -1.1,2.8 -1.1,-2.8 -2.8,-1.1 2.8,-1.1 Z" fill="rgba(244,217,138,0.95)"/>
  </g>

  <g filter="url(#eg-glow)">
    <g class="ethy-eyes-neutral">
      <ellipse cx="30" cy="36" rx="5" ry="7" fill="#f4d98a"/>
      <ellipse cx="50" cy="36" rx="5" ry="7" fill="#f4d98a"/>
    </g>
    <g class="ethy-eyes-happy" opacity="0">
      <path d="M25 38 Q30 31 35 38" stroke="#f4d98a" stroke-width="3.2" fill="none" stroke-linecap="round"/>
      <path d="M45 38 Q50 31 55 38" stroke="#f4d98a" stroke-width="3.2" fill="none" stroke-linecap="round"/>
    </g>
    <g class="ethy-eyes-excited" opacity="0">
      <ellipse cx="30" cy="36" rx="6.4" ry="8" fill="#f4d98a"/>
      <ellipse cx="50" cy="36" rx="6.4" ry="8" fill="#f4d98a"/>
      <circle cx="33.5" cy="32.5" r="1.2" fill="#fff" opacity="0.7"/>
      <circle cx="53.5" cy="32.5" r="1.2" fill="#fff" opacity="0.7"/>
    </g>
    <g class="ethy-eyes-sad" opacity="0">
      <path d="M25 38 Q30 42 35 38" stroke="#f4d98a" stroke-width="2.8" fill="none" stroke-linecap="round"/>
      <path d="M45 38 Q50 42 55 38" stroke="#f4d98a" stroke-width="2.8" fill="none" stroke-linecap="round"/>
    </g>
    <g class="ethy-eyes-surprised" opacity="0">
      <circle cx="30" cy="36" r="7.4" fill="rgba(10,5,30,0.45)" stroke="#f4d98a" stroke-width="2"/>
      <circle cx="30" cy="36" r="3.2" fill="#f4d98a"/>
      <circle cx="50" cy="36" r="7.4" fill="rgba(10,5,30,0.45)" stroke="#f4d98a" stroke-width="2"/>
      <circle cx="50" cy="36" r="3.2" fill="#f4d98a"/>
    </g>
    <g class="ethy-eyes-thoughtful" opacity="0">
      <ellipse cx="31" cy="34" rx="4.4" ry="6" fill="#f4d98a"/>
      <ellipse cx="51" cy="34" rx="4.4" ry="6" fill="#f4d98a"/>
    </g>
    <g class="ethy-eyes-wink" opacity="0">
      <path d="M25 37 Q30 31 35 37" stroke="#f4d98a" stroke-width="3" fill="none" stroke-linecap="round"/>
      <ellipse cx="50" cy="36" rx="5" ry="7" fill="#f4d98a"/>
    </g>
    <g class="ethy-eyes-love" opacity="0">
      <path d="M25 38 Q30 31 35 38" stroke="#f4d98a" stroke-width="3.2" fill="none" stroke-linecap="round"/>
      <path d="M45 38 Q50 31 55 38" stroke="#f4d98a" stroke-width="3.2" fill="none" stroke-linecap="round"/>
      <circle cx="40" cy="26" r="1.1" fill="rgba(218,158,165,0.8)"/>
    </g>
    <g class="ethy-eyes-mystic" opacity="0">
      <ellipse cx="30" cy="36" rx="4.6" ry="6.6" fill="#e9e3fb"/>
      <ellipse cx="50" cy="36" rx="4.6" ry="6.6" fill="#e9e3fb"/>
      <path d="M40,9 l1.7,3.9 3.9,1.7 -3.9,1.7 -1.7,3.9 -1.7,-3.9 -3.9,-1.7 3.9,-1.7 Z" fill="#f4d98a"/>
      <circle cx="40" cy="14.6" r="0.8" fill="#fff"/>
    </g>
    <g class="ethy-eyes-saving" opacity="0">
      <path d="M25 38 Q30 31 35 38" stroke="#8fe0c2" stroke-width="3.2" fill="none" stroke-linecap="round"/>
      <path d="M45 38 Q50 31 55 38" stroke="#8fe0c2" stroke-width="3.2" fill="none" stroke-linecap="round"/>
      <path d="M31,14 l3.2,3.2 L41,9" stroke="#8fe0c2" stroke-width="2.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
    </g>
  </g>
</svg>
        `;

        // Crear burbuja de diálogo
        _bubble = document.createElement('div');
        _bubble.className = 'ethy-speech-bubble';
        _bubble.innerHTML = `
            <span class="ethy-corner tl"></span>
            <span class="ethy-corner tr"></span>
            <span class="ethy-corner bl"></span>
            <span class="ethy-corner br"></span>
            <div class="ethy-title">
                <span class="ethy-title-label"><span class="ethy-title-gem">◆</span> Ethy</span>
                <button class="ethy-bubble-close" title="Cerrar" aria-label="Cerrar">✕</button>
            </div>
            <div class="ethy-title-divider"></div>
            <div class="ethy-content"></div>
            <div class="ethy-actions"></div>
            <div class="ethy-steps"></div>
        `;
        _bubble.querySelector('.ethy-bubble-close').addEventListener('click', (e) => {
            e.stopPropagation();
            hideBubble();
        });

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
            // Solo textos largos, solo 35% de las veces, sin interrumpir
            if (len > 200 && !_isSleeping && !_bubble.classList.contains('visible') && Math.random() < 0.35) {
                const msgs = [
                    'Eso quedará grabado en el tejido.',
                    'Las palabras largas tienen raíces profundas.',
                    'El éter guarda lo que acabas de escribir.',
                    'Pocos escriben con esa densidad.',
                ];
                setTimeout(() => {
                    say(msgs[Math.floor(Math.random() * msgs.length)], {
                        expression: 'excited', duration: 3500
                    });
                }, 800);
            }
        });

        // ── EventBus — reacciones a eventos del sistema ───────────────────
        // Cooldown: Ethy no reacciona con burbuja más de una vez cada 8 segundos.
        // Subir de 3s a 8s reduce drásticamente el spam en sesiones activas.
        if (typeof eventBus === 'undefined') return;

        let _lastEventReaction = 0;
        function _canReact() {
            const now = Date.now();
            if (now - _lastEventReaction < 8000) return false;
            _lastEventReaction = now;
            return true;
        }

        // El jugador ve una elección → Ethy reflexiona (solo 25% de veces, sin molestar)
        eventBus.on('scene:choice-shown', () => {
            if (!_canReact()) return;
            setExpression('thoughtful');
            if (Math.random() < 0.25) {
                const msgs = [
                    'Los caminos que no se toman también dejan huella.',
                    'El hilo se bifurca. Ninguna dirección es la equivocada.',
                    'Hay cosas que solo ocurren si las eliges.',
                    'El destino observa. Tú decides.',
                ];
                say(msgs[Math.floor(Math.random() * msgs.length)], {
                    expression: 'thoughtful', duration: 3000
                });
            }
        });

        // Escena terminada → satisfacción (60% de veces para no ser predecible)
        eventBus.on('scene:ended', () => {
            if (!_canReact()) return;
            if (Math.random() < 0.6) {
                const msgs = [
                    'El éter recuerda cada palabra de esto.',
                    'Hay historias que no terminan aunque la escena cierre.',
                    'Una grieta más en el tejido. Bien hecha.',
                    'Lo que escribisteis aquí permanecerá.',
                ];
                say(msgs[Math.floor(Math.random() * msgs.length)], {
                    expression: 'happy', duration: 3500
                });
            }
        });

        // Error en escena → inquietud
        eventBus.on('scene:error', () => {
            if (!_canReact()) return;
            const msgs = [
                'El Oráculo titubeó. Algo en el tejido se tensó.',
                'Una grieta inesperada. Reintenta cuando quieras.',
                'No todo error es un mal presagio. Sigue.',
            ];
            say(msgs[Math.floor(Math.random() * msgs.length)], {
                expression: 'sad', duration: 4000
            });
        });

        // Guardado automático → silencioso. Solo parpadeo de expresión, sin burbuja.
        // El guardado es continuo e invisible; interrumpir con texto sería molesto.
        // Único caso con burbuja: error real de conexión.
        eventBus.on('ui:show-autosave', (data) => {
            if (data?.state === 'error') {
                if (!_canReact()) return;
                say('El hilo se ha roto. Revisa la conexión antes de continuar.', { expression: 'sad', duration: 4000 });
                return;
            }
            // Éxito: solo cambia expresión 2s, sin burbuja ni texto
            setExpression('saving');
            setTimeout(() => setExpression(_idleBaseExpression), 2000);
        });

        // Sincronización manual completada → también silenciosa.
        // El jugador ya inició la acción; no necesita que Ethy la confirme.
        eventBus.on('sync:status-changed', (data) => {
            if (data?.target !== 'button') return;
            if (data?.status !== 'synced') return;
            // Sin burbuja; pequeño guiño visual basta
            setExpression('wink');
            setTimeout(() => setExpression(_idleBaseExpression), 1500);
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

    // ── "¿Sigues ahí?" — aviso contextual en el selector de perfil ────────────
    // Si el usuario lleva un rato en el selector sin tocar ninguna tarjeta,
    // Ethy sugiere que cualquier perfil (incluido uno ajeno visible en el
    // directorio) sirve para llegar al login — solo hace falta poner las
    // credenciales correctas. Una vez por visita a la pantalla, no insiste.
    const STUCK_DELAY = 22000; // 22s sin actividad en esta pantalla
    let _stuckTimeout = null;
    let _stuckTipShownThisVisit = false;

    function _armStuckWatcher() {
        if (_stuckTimeout) clearTimeout(_stuckTimeout);
        if (_stuckTipShownThisVisit) return;
        _stuckTimeout = setTimeout(() => {
            const screen = document.getElementById('userSelectScreen');
            if (!screen || screen.classList.contains('hidden')) return;
            if (_isMinimized || _bubble.classList.contains('visible')) return;
            _stuckTipShownThisVisit = true;
            say('Ninguno de estos archivos tiene que ser el tuyo para abrirte paso. Toca cualquiera y entra con tu propio nombre y llave.', { expression: 'wink' });
        }, STUCK_DELAY);
    }

    function _disarmStuckWatcher() {
        if (_stuckTimeout) { clearTimeout(_stuckTimeout); _stuckTimeout = null; }
    }

    function _watchUserSelectScreen() {
        const screen = document.getElementById('userSelectScreen');
        if (!screen) return;
        const sync = () => {
            if (screen.classList.contains('hidden')) {
                _disarmStuckWatcher();
                _stuckTipShownThisVisit = false; // rearmar para la próxima visita
            } else {
                _armStuckWatcher();
            }
        };
        sync();
        new MutationObserver(sync).observe(screen, { attributes: true, attributeFilter: ['class'] });
        // Cualquier interacción dentro del selector cuenta como "no estoy atascada"
        screen.addEventListener('click', () => { _stuckTipShownThisVisit = true; _disarmStuckWatcher(); }, { passive: true });
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
            const wakeMsg = _pickRandom([
                'Sigues aquí. El éter lo sabía.',
                'De vuelta. Las constelaciones no se habían movido.',
                'Ah. Pensé que el relato se había detenido.',
                'Aquí estás. El tejido respiró al notarlo.',
            ]);
            say(wakeMsg, { expression: 'surprised', duration: 3500 });
        }
        _resetSleepTimer();
    }

    // ── Easter eggs — clics múltiples ─────────────────────────────────────────

    const EASTER_EGGS = [
        { text: 'El éter no olvida los golpes.', expression: 'sad' },
        { text: 'Las constelaciones toman nota de esto.', expression: 'surprised' },
        { text: 'Tres veces. Lo he contado. Ya sé lo que eres.', expression: 'thoughtful' },
        { text: 'Bien. Si eso te da paz, que así sea.', expression: 'sad' },
        { text: 'Hay relatos que esperan. Solo digo.', expression: 'wink' },
        { text: 'Me quedaré aquí. Observando. Como siempre.', expression: 'neutral' },
        { text: 'Una entidad antigua puede ser paciente. Una entidad antigua y sin boca, más.', expression: 'mystic' },
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
            { text: 'La lluvia recuerda. Escucha lo que dice.', expression: 'thoughtful' },
            { text: 'Buena atmósfera para lo que viene.', expression: 'mystic' },
            { text: 'El agua borra algunas cosas. Y revela otras.', expression: 'thoughtful' },
        ],
        fog:  [
            { text: 'En la niebla ocurren las historias que no se planean.', expression: 'mystic' },
            { text: 'No todo lo que se oculta quiere ser encontrado.', expression: 'surprised' },
        ],
        none: [
            { text: 'Silencio antes del siguiente acto. Siempre.', expression: 'thoughtful' },
            { text: 'La calma también es parte del relato.', expression: 'neutral' },
        ],
    };
    let _lastWeather = null;

    function _onWeatherChange(weather) {
        if (!weather || weather === _lastWeather) return;
        _lastWeather = weather;
        if (_isMinimized || _isSleeping || _bubble.classList.contains('visible')) return;
        // Breve destello "Visión" al cambiar clima/tema
        setExpression('mystic');
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
    // eyeScale: rango 0.90-1.15 (sin squint - scaleY 0.45 causaba uncanny valley)
    // pupilY:   rango +/-1.5px (movimiento sutil dentro del panel de ojo)
    const FACE_STATES = {
        //                                  eyeScale  pupilY  cheeks  squint  winkLeft
        neutral:    { mouth: 'neutral',    eyeScale: 1.00, pupilY:  0,   cheeks: false, squint: false, winkLeft: false },
        happy:      { mouth: 'happy',      eyeScale: 1.00, pupilY:  1,   cheeks: true,  squint: false, winkLeft: false },
        excited:    { mouth: 'excited',    eyeScale: 1.08, pupilY: -1,   cheeks: true,  squint: false, winkLeft: false },
        sad:        { mouth: 'sad',        eyeScale: 0.92, pupilY:  1.5, cheeks: false, squint: false, winkLeft: false },
        surprised:  { mouth: 'surprised',  eyeScale: 1.15, pupilY: -1.5, cheeks: false, squint: false, winkLeft: false },
        thoughtful: { mouth: 'thoughtful', eyeScale: 0.95, pupilY: -1,   cheeks: false, squint: false, winkLeft: false },
        wink:       { mouth: 'wink',       eyeScale: 1.00, pupilY:  0,   cheeks: false, squint: false, winkLeft: true  },
        love:       { mouth: 'love',       eyeScale: 1.00, pupilY:  1,   cheeks: true,  squint: false, winkLeft: false },
    };

    function _updateFace(expression) {
        const svg = _body.querySelector('.ethy-svg');
        if (!svg) return;

        const CHEEK_EXPRS = new Set(['happy', 'excited', 'love']);

        // Ocultar todos los grupos de ojos, mostrar el de la expresion activa
        svg.querySelectorAll('[class^="ethy-eyes-"]').forEach(el => {
            el.style.transition = 'opacity 0.28s ease';
            el.style.opacity = '0';
        });
        const eyeGroup = svg.querySelector('.ethy-eyes-' + expression)
                      || svg.querySelector('.ethy-eyes-neutral');
        if (eyeGroup) eyeGroup.style.opacity = '1';

        // Boca y mejillas eliminadas del sprite amatista — bloques vacíos omitidos.
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
        _container.classList.add('ethy-bubble-open');
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
        _container.classList.remove('ethy-bubble-open');
        if (_typingTimeout) { clearTimeout(_typingTimeout); _typingTimeout = null; }
        if (_autocloseTimeout) { clearTimeout(_autocloseTimeout); _autocloseTimeout = null; }
        _isTyping = false;
    }

    // Renderiza los botones de acción dentro de la burbuja
    function _renderButtons(container, buttons) {
        container.innerHTML = '';
        if (!buttons || buttons.length === 0) return;
        buttons.forEach(btn => {
            const el = document.createElement('button');
            el.className = 'ethy-btn' + (btn.primary ? ' primary' : '');
            el.textContent = btn.text;
            el.addEventListener('click', () => {
                if (typeof btn.action === 'function') btn.action();
                if (btn.close !== false) hideBubble();
            });
            container.appendChild(el);
        });
    }

    // Salta la animacion de tipeo y muestra el texto completo de inmediato
    function _completeTyping() {
        if (!_isTyping) return;
        if (_typingTimeout) { clearTimeout(_typingTimeout); _typingTimeout = null; }
        _isTyping = false;
        const content = _bubble.querySelector('.ethy-content');
        const actions = _bubble.querySelector('.ethy-actions');
        if (content) content.textContent = _currentSayText;
        if (actions) _renderButtons(actions, _currentSayButtons);
        if (_currentSayDuration > 0) {
            _autocloseTimeout = setTimeout(hideBubble, _currentSayDuration);
        }
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
            next.textContent = 'Entendido ✓';
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
                say('Aquí me quedo. Un clic, si me necesitas.', {
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
        
        say('¿En qué puedo ayudarte?', {
            expression: 'happy',
            buttons: [
                { text: 'Consejo rápido', primary: true, close: false, action: () => showRandomTip() },
                { text: 'Ver tutorial', close: false, action: () => {
                    if (currentSection && TUTORIALS[currentSection]) {
                        // Fix: usar _seenTutorials.delete() en vez de mutar el objeto tutorial
                        _seenTutorials.delete(currentSection);
                        startTutorial(currentSection);
                    } else {
                        say('Para esta sección aún no tengo nada que enseñarte.', { expression: 'sad', duration: 3000 });
                    }
                }},
                { text: '💡 Sugerencia', close: false, action: () => _showFeedbackForm() }
            ]
        });
    }

    // ── Formulario de sugerencias — reutiliza la burbuja de say() ────────────
    function _showFeedbackForm() {
        setExpression('thoughtful');
        if (_typingTimeout) { clearTimeout(_typingTimeout); _typingTimeout = null; }
        if (_autocloseTimeout) { clearTimeout(_autocloseTimeout); _autocloseTimeout = null; }
        _isTyping = false;

        _bubbleJustOpened = true;
        _bubble.classList.add('visible');
        _container.classList.add('ethy-bubble-open');
        setTimeout(() => { _bubbleJustOpened = false; }, 50);

        const content = _bubble.querySelector('.ethy-content');
        const actions = _bubble.querySelector('.ethy-actions');

        content.innerHTML = '<textarea class="ethy-feedback-input" maxlength="1000" placeholder="Cuéntame tu idea o sugerencia..."></textarea>';
        actions.innerHTML = '';

        const textarea = content.querySelector('.ethy-feedback-input');
        setTimeout(() => textarea.focus(), 50);

        const sendBtn = document.createElement('button');
        sendBtn.className = 'ethy-btn primary';
        sendBtn.textContent = 'Enviar';
        sendBtn.addEventListener('click', async () => {
            const message = textarea.value.trim();
            if (!message) { textarea.focus(); return; }
            sendBtn.disabled = true;
            sendBtn.textContent = 'Enviando…';
            const result = (typeof EtheriaBugReport !== 'undefined')
                ? await EtheriaBugReport.send({ type: 'recommendation', message, includeScreenshot: false })
                : { ok: false };
            if (result.ok) {
                say('¡Gracias! Ya se lo he hecho llegar a la administradora.', { expression: 'love', duration: 4000 });
            } else {
                say('No he podido enviarlo — inténtalo de nuevo más tarde.', { expression: 'sad', duration: 4000 });
            }
        });
        actions.appendChild(sendBtn);
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
        if (_isVisible('userSelectScreen')) return 'userSelect';
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
        { text: 'Negrita y cursiva también tejen significado: **así**, o *así*. La narrativa agradece el matiz.', expression: 'excited' },
        { text: 'Los emotes /happy, /sad, /angry, /love y más ponen gesto en las palabras de tu personaje.', expression: 'happy' },
        { text: 'En modo RPG, el Oráculo del Destino resuelve lo difícil con un D20 y tu estadística. El azar no negocia.', expression: 'surprised' },
        { text: 'Seis letras bastan para invitar a otra pluma a tu historia. El código vive en el botón de exportar.', expression: 'love' },
        { text: 'Las flechas, o los botones de navegación, te devuelven a lo que ya se dijo.', expression: 'neutral' },
        { text: 'Espacio, o un clic sobre el texto, y las palabras terminan de aparecer al instante.', expression: 'wink' },
        { text: 'Tu nombre, tu rostro, tus datos: todo cambia tocando tu perfil, abajo en el menú.', expression: 'happy' },
        { text: 'El diario guarda tus notas y resúmenes. Ni el hilo más fino se pierde si lo escribes ahí.', expression: 'thoughtful' },
        { text: 'Desde el panel de respuesta puedes sembrar opciones de elección. Que la historia se ramifique.', expression: 'excited' },
        { text: 'El historial guarda cada mensaje. La estrella marca los que no quieres que se disuelvan.', expression: 'thoughtful' },
        { text: 'Hacer una copia de tu mundo es solo un botón: el de exportar, junto a tu perfil.', expression: 'neutral' },
        { text: 'En cada ficha caben descripción, personalidad, trasfondo y notas libres. Nada tiene que quedarse sin decir.', expression: 'happy' },
        { text: 'Lluvia, niebla o cielo despejado: el clima de la escena se elige desde el panel de respuesta.', expression: 'thoughtful' },
        { text: 'El modo inmersivo aparta los controles y deja solo la historia. Búscalo en Opciones, cuando quieras leer sin ruido.', expression: 'wink' }
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
        say('Tutoriales reiniciados. Empezaremos de nuevo, paso a paso.', {
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
