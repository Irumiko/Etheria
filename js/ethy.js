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
        love:       { class: 'ethy-expression-love',       emoji: '♡ ♡' }
    };

    // ── Tutoriales por sección ───────────────────────────────────────────────
    const TUTORIALS = {

        // ── Menú Principal ───────────────────────────────────────────────────
        mainMenu: {
            title: 'El umbral de Etheria',
            expression: 'excited',
            steps: [
                {
                    text: 'Soy Ethy. Llevo aquí desde antes de que llegaras. Este mundo late con cada historia que escribís... y acaba de añadir la tuya. ✨',
                    expression: 'excited',
                    action: null
                },
                {
                    text: '"Nueva Partida" es la puerta. Al otro lado esperan el roleplay libre —modo Clásico— o el caos gobernado por los dados —modo RPG—. Elige con intención.',
                    expression: 'happy',
                    action: () => highlightElement('.menu-button-console.primary')
                },
                {
                    text: '"Personajes" es donde viven las almas que vais a habitar. Sin ellas no hay historia posible.',
                    expression: 'thoughtful',
                    action: () => highlightElement('.menu-button-console:nth-child(2)')
                },
                {
                    text: '"Opciones" es tuyo. Ajusta la luz, la tipografía, el sonido... hasta que Etheria se sienta exactamente como debe.',
                    expression: 'wink',
                    action: () => highlightElement('.menu-button-console:nth-child(3)')
                },
                {
                    text: 'Tu perfil está abajo. Cámbialo cuando quieras: soy discreta, no lo digo a nadie. 🤫',
                    expression: 'wink',
                    action: () => highlightElement('.menu-profile-btn')
                },
                {
                    text: 'El icono junto al perfil guarda y carga tu mundo entero. Úsalo. Las historias merecen sobrevivir.',
                    expression: 'surprised',
                    action: () => highlightElement('.menu-save-btn')
                },
                {
                    text: 'Ya sé todo lo que necesito saber de ti. Ahora cuéntame una historia. 🌿',
                    expression: 'love',
                    action: null
                }
            ]
        },

        // ── Galería de Personajes ────────────────────────────────────────────
        gallery: {
            title: 'El registro de almas',
            expression: 'happy',
            steps: [
                {
                    text: 'Aquí viven todos los personajes que habéis invocado. Cada uno lleva dentro una historia esperando a ocurrir.',
                    expression: 'happy',
                    action: null
                },
                {
                    text: '"Nuevo personaje" abre el ritual de creación: nombre, raza, trasfondo, personalidad, secretos... Sé generosa con los detalles.',
                    expression: 'excited',
                    action: () => highlightElement('.gallery-new-btn')
                },
                {
                    text: 'En modo RPG cada alma tiene sus propias estadísticas: Fuerza, Destreza, Constitución, Inteligencia, Sabiduría, Carisma. El nivel crece con la experiencia vivida.',
                    expression: 'thoughtful',
                    action: null
                },
                {
                    text: 'Cada personaje tiene su propio color de diálogo. Cuando hablan en escena, los reconoces sin mirar el nombre. 🎨',
                    expression: 'wink',
                    action: null
                },
                {
                    text: 'Los mejores personajes son los que te sorprenden. Deja espacio para que hagan cosas que no planeaste. 🎭',
                    expression: 'love',
                    action: null
                }
            ]
        },

        // ── Crear Historia ───────────────────────────────────────────────────
        createTopic: {
            title: 'Invocar una historia',
            expression: 'excited',
            steps: [
                {
                    text: 'Estás a punto de abrir una grieta en el tejido de Etheria. Lo que escribas aquí definirá el tono de todo lo que viene. Sin prisa.',
                    expression: 'excited',
                    action: null
                },
                {
                    text: 'Modo Clásico: roleplay puro, sin mecánicas. El texto manda. Perfecto cuando la narrativa importa más que el azar.',
                    expression: 'happy',
                    action: () => highlightElement('#modeRoleplay')
                },
                {
                    text: 'Modo RPG: el Oráculo del Destino interviene. Los dados deciden si la acción tiene éxito... o consecuencias inesperadas. 🎲',
                    expression: 'surprised',
                    action: () => highlightElement('#modeRpg')
                },
                {
                    text: 'El primer mensaje es el inicio de todo. Puedes usar **negrita** y *cursiva* para moldear cómo suena cada línea.',
                    expression: 'thoughtful',
                    action: () => highlightElement('#topicTitleInput')
                },
                {
                    text: 'Una vez creada, otros jugadores pueden unirse en tiempo real. La historia os pertenece a todos. ✨',
                    expression: 'love',
                    action: null
                }
            ]
        },

        // ── Modo VN Clásico ──────────────────────────────────────────────────
        vnClassic: {
            title: 'La escena se abre',
            expression: 'happy',
            steps: [
                {
                    text: 'La historia ha empezado. En modo Clásico el protagonismo es del texto: sin interrupciones, sin dados, solo vosotras y las palabras.',
                    expression: 'happy',
                    action: null
                },
                {
                    text: 'Clic en la caja de diálogo o ESPACIO para avanzar. ← → navegan entre mensajes anteriores.',
                    expression: 'neutral',
                    action: () => highlightElement('.vn-dialogue-box')
                },
                {
                    text: '"Responder" abre el panel de escritura. Elige quién habla y qué dice. Tómate tu tiempo.',
                    expression: 'excited',
                    action: () => highlightElement('.reply-btn')
                },
                {
                    text: 'Los emotes dan vida a la escena: escribe /happy, /sad, /angry, /love... y el personaje reacciona. 🎭',
                    expression: 'wink',
                    action: null
                },
                {
                    text: 'Puedes crear bifurcaciones para que los lectores decidan el rumbo. Las mejores historias dejan huellas distintas en cada quien.',
                    expression: 'thoughtful',
                    action: null
                },
                {
                    text: 'La barra de controles guarda el historial, los favoritos y permite exportar la historia entera. Nada se pierde. 📜',
                    expression: 'surprised',
                    action: () => highlightElement('.vn-toolbar')
                }
            ]
        },

        // ── Modo VN RPG ──────────────────────────────────────────────────────
        vnRPG: {
            title: 'El azar toma la pluma',
            expression: 'excited',
            steps: [
                {
                    text: 'Modo RPG. Aquí el Oráculo del Destino tiene voz propia. Lo que queráis hacer... tendrá que probarse. 🎲',
                    expression: 'excited',
                    action: null
                },
                {
                    text: 'Tu ficha está arriba a la izquierda: HP, stats, afinidad. Consúltala antes de cada decisión importante.',
                    expression: 'thoughtful',
                    action: () => highlightElement('.vn-info-card')
                },
                {
                    text: 'El Oráculo aparece cuando la acción es difícil. Lanzas un D20 más tu stat relevante contra la dificultad que marca la escena.',
                    expression: 'surprised',
                    action: () => highlightElement('#vnOracleFloatBtn')
                },
                {
                    text: 'El resultado del dado no es el final: es el principio del siguiente mensaje. El narrador interpreta lo que ocurre.',
                    expression: 'happy',
                    action: null
                },
                {
                    text: 'El HP baja en combate o por consecuencias del Oráculo. Cuando llega a cero... algo cambia para siempre. 💀',
                    expression: 'sad',
                    action: () => highlightElement('.vn-info-hp-bar')
                },
                {
                    text: 'Que los dados sean justos... o al menos interesantes. 🎲✨',
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
                    text: 'Aquí moldeas cómo se siente Etheria. Tres pestañas: Apariencia, Lectura, Sonido. Cada una importa.',
                    expression: 'thoughtful',
                    action: () => highlightElement('.opt-tab-bar')
                },
                {
                    text: 'En Apariencia cambias entre luz y oscuridad, ajustas la tipografía y aplicas filtros de atmósfera a las escenas. 🌙',
                    expression: 'neutral',
                    action: () => highlightElement('#themeToggleBtn')
                },
                {
                    text: 'En Lectura controlas la velocidad del texto y el modo inmersivo. Para cuando la historia pide toda tu atención.',
                    expression: 'happy',
                    action: () => highlightElement('[data-tab="reading"]')
                },
                {
                    text: 'En Sonido, el volumen de la lluvia y el ambiente. Algunas historias necesitan silencio. Otras, tormenta. 🔊',
                    expression: 'wink',
                    action: () => highlightElement('[data-tab="sound"]')
                },
                {
                    text: 'No existe una configuración correcta. Solo la que te permite olvidarte de que estás mirando una pantalla.',
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
                    text: 'Las historias que no se guardan desaparecen. Este panel existe para que las tuyas no lo hagan.',
                    expression: 'thoughtful',
                    action: null
                },
                {
                    text: '"Descargar partida" exporta todo: personajes, historias, vínculos. Un archivo. Tu mundo entero.',
                    expression: 'neutral',
                    action: () => highlightElement('.save-hub-primary')
                },
                {
                    text: '"Cargar partida" restaura ese archivo. Úsalo cuando cambies de dispositivo o cuando algo vaya mal.',
                    expression: 'happy',
                    action: null
                },
                {
                    text: '"Generar código" crea un código de seis letras para compartir una historia concreta con otra jugadora.',
                    expression: 'excited',
                    action: null
                },
                {
                    text: '"Importar código" recibe la historia que alguien te mandó. Así nace la colaboración: de un código y de confianza. 🌿',
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
              <defs>
                <radialGradient id="eg-body" cx="50%" cy="30%" r="75%">
                  <stop offset="0%"   stop-color="#2a1c0e"/>
                  <stop offset="100%" stop-color="#0c0702"/>
                </radialGradient>
                <linearGradient id="eg-border" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%"   stop-color="rgba(245,210,115,0.95)"/>
                  <stop offset="52%"  stop-color="rgba(200,160,65,0.80)"/>
                  <stop offset="100%" stop-color="rgba(155,115,40,0.90)"/>
                </linearGradient>
                <radialGradient id="eg-iris" cx="32%" cy="28%" r="68%">
                  <stop offset="0%"   stop-color="#f5e878"/>
                  <stop offset="45%"  stop-color="#c8920e"/>
                  <stop offset="100%" stop-color="#6a4802"/>
                </radialGradient>
                <radialGradient id="eg-screen" cx="50%" cy="42%" r="56%">
                  <stop offset="0%"   stop-color="rgba(190,150,65,0.07)"/>
                  <stop offset="100%" stop-color="rgba(0,0,0,0)"/>
                </radialGradient>
              </defs>

              <!-- Sombra suelo -->
              <ellipse cx="40" cy="73" rx="19" ry="4.5" fill="#0e0904" opacity="0.45"/>
              <!-- Halo exterior -->
              <rect x="6" y="10" width="68" height="58" rx="18" fill="rgba(195,155,55,0.045)"/>

              <!-- Cuerpo -->
              <rect x="11" y="13" width="58" height="52" rx="15" fill="url(#eg-body)"/>
              <rect x="11" y="13" width="58" height="52" rx="15" stroke="url(#eg-border)" stroke-width="1.6" fill="none"/>
              <rect x="19" y="13.5" width="30" height="1.1" rx="0.55" fill="rgba(255,240,165,0.30)"/>
              <rect x="15" y="17"   width="50" height="44" rx="12"    fill="url(#eg-screen)"/>

              <!-- Esquinas -->
              <circle cx="14" cy="16" r="2" fill="rgba(220,178,85,0.55)"/>
              <circle cx="66" cy="16" r="2" fill="rgba(220,178,85,0.55)"/>
              <circle cx="14" cy="62" r="2" fill="rgba(220,178,85,0.38)"/>
              <circle cx="66" cy="62" r="2" fill="rgba(220,178,85,0.38)"/>

              <!-- Antena (estatica) -->
              <g class="ethy-part-antenna">
                <line x1="55" y1="22" x2="60" y2="8"  stroke="rgba(208,172,82,0.82)" stroke-width="1.4" stroke-linecap="round"/>
                <polygon points="60,4 57.5,9 62.5,9"   fill="rgba(238,200,102,0.95)"/>
                <circle cx="60" cy="6.5" r="4"         fill="rgba(225,188,80,0.12)"/>
                <circle cx="60" cy="6.5" r="2"         fill="rgba(238,205,110,0.20)"/>
                <circle cx="60" cy="6.5" r="0.9"       fill="rgba(255,238,165,0.75)"/>
              </g>

              <!-- ======= OJOS =======
                   Cada expresion tiene su propio grupo de ojos.
                   Solo el activo es visible (opacity swap, sin transforms). -->

              <!-- neutral: circulos con pupila y reflejo -->
              <g class="ethy-eyes-neutral">
                <circle class="ethy-eye-left"  cx="30" cy="34" r="5.5" fill="url(#eg-iris)"/>
                <circle class="ethy-eye-right" cx="50" cy="34" r="5.5" fill="url(#eg-iris)"/>
                <circle cx="30" cy="34" r="2.2" fill="#040302"/>
                <circle cx="50" cy="34" r="2.2" fill="#040302"/>
                <circle cx="27.8" cy="31.8" r="1.2" fill="rgba(255,255,255,0.82)"/>
                <circle cx="47.8" cy="31.8" r="1.2" fill="rgba(255,255,255,0.82)"/>
              </g>

              <!-- happy: arcos hacia arriba (^__^) -->
              <g class="ethy-eyes-happy" opacity="0">
                <path d="M24.5 36.5 Q30 28.5 35.5 36.5" stroke="rgba(232,188,80,0.95)" stroke-width="2.5" stroke-linecap="round" fill="none"/>
                <path d="M44.5 36.5 Q50 28.5 55.5 36.5" stroke="rgba(232,188,80,0.95)" stroke-width="2.5" stroke-linecap="round" fill="none"/>
              </g>

              <!-- excited: circulos grandes con brillo extra -->
              <g class="ethy-eyes-excited" opacity="0">
                <circle class="ethy-eye-left"  cx="30" cy="34" r="7" fill="url(#eg-iris)"/>
                <circle class="ethy-eye-right" cx="50" cy="34" r="7" fill="url(#eg-iris)"/>
                <circle cx="30" cy="34" r="2.5" fill="#040302"/>
                <circle cx="50" cy="34" r="2.5" fill="#040302"/>
                <circle cx="27" cy="31.5" r="1.6" fill="rgba(255,255,255,0.88)"/>
                <circle cx="47" cy="31.5" r="1.6" fill="rgba(255,255,255,0.88)"/>
                <circle cx="33.5" cy="30.5" r="0.9" fill="rgba(255,255,255,0.55)"/>
                <circle cx="53.5" cy="30.5" r="0.9" fill="rgba(255,255,255,0.55)"/>
              </g>

              <!-- sad: circulos bajos, pupilas caidas -->
              <g class="ethy-eyes-sad" opacity="0">
                <circle class="ethy-eye-left"  cx="30" cy="35" r="5" fill="url(#eg-iris)" opacity="0.82"/>
                <circle class="ethy-eye-right" cx="50" cy="35" r="5" fill="url(#eg-iris)" opacity="0.82"/>
                <circle cx="30" cy="37" r="2" fill="#040302"/>
                <circle cx="50" cy="37" r="2" fill="#040302"/>
                <circle cx="28.5" cy="33.5" r="1" fill="rgba(255,255,255,0.65)"/>
                <circle cx="48.5" cy="33.5" r="1" fill="rgba(255,255,255,0.65)"/>
              </g>

              <!-- surprised: circulos muy grandes -->
              <g class="ethy-eyes-surprised" opacity="0">
                <circle class="ethy-eye-left"  cx="30" cy="34" r="7.2" fill="url(#eg-iris)"/>
                <circle class="ethy-eye-right" cx="50" cy="34" r="7.2" fill="url(#eg-iris)"/>
                <circle cx="30" cy="34" r="2.2" fill="#040302"/>
                <circle cx="50" cy="34" r="2.2" fill="#040302"/>
                <circle cx="27.5" cy="31.5" r="1.5" fill="rgba(255,255,255,0.88)"/>
                <circle cx="47.5" cy="31.5" r="1.5" fill="rgba(255,255,255,0.88)"/>
              </g>

              <!-- thoughtful: pupilas arriba-izquierda (mirando hacia arriba) -->
              <g class="ethy-eyes-thoughtful" opacity="0">
                <circle class="ethy-eye-left"  cx="30" cy="34" r="5.2" fill="url(#eg-iris)"/>
                <circle class="ethy-eye-right" cx="50" cy="34" r="5.2" fill="url(#eg-iris)"/>
                <circle cx="28.5" cy="32.5" r="2.1" fill="#040302"/>
                <circle cx="48.5" cy="32.5" r="2.1" fill="#040302"/>
                <circle cx="27.2" cy="31.2" r="1"   fill="rgba(255,255,255,0.80)"/>
                <circle cx="47.2" cy="31.2" r="1"   fill="rgba(255,255,255,0.80)"/>
              </g>

              <!-- wink: ojo izquierdo cerrado (arco) + ojo derecho abierto -->
              <g class="ethy-eyes-wink" opacity="0">
                <path d="M24 36 Q30 28.5 36 36" stroke="rgba(232,188,80,0.95)" stroke-width="2.5" stroke-linecap="round" fill="none"/>
                <circle class="ethy-eye-right" cx="50" cy="34" r="5.5" fill="url(#eg-iris)"/>
                <circle cx="50" cy="34" r="2.2" fill="#040302"/>
                <circle cx="47.8" cy="31.8" r="1.2" fill="rgba(255,255,255,0.82)"/>
              </g>

              <!-- love: arcos felices + destellos rosas -->
              <g class="ethy-eyes-love" opacity="0">
                <path d="M24.5 36.5 Q30 28.5 35.5 36.5" stroke="rgba(232,188,80,0.95)" stroke-width="2.5" stroke-linecap="round" fill="none"/>
                <path d="M44.5 36.5 Q50 28.5 55.5 36.5" stroke="rgba(232,188,80,0.95)" stroke-width="2.5" stroke-linecap="round" fill="none"/>
                <circle cx="37.5" cy="28" r="1.1" fill="rgba(218,158,165,0.78)"/>
                <circle cx="43"   cy="27" r="0.8" fill="rgba(218,158,165,0.60)"/>
                <circle cx="40"   cy="26" r="0.6" fill="rgba(218,158,165,0.45)"/>
              </g>

              <!-- ======= BOCAS =======
                   Todas contenidas en aprox. x=28-52, y=46-56.
                   Solo la de la expresion activa es visible. -->
              <g class="ethy-part-mouth">
                <path class="ethy-mouth-neutral"
                  d="M34 49.5 Q40 52 46 49.5"
                  stroke="rgba(210,175,90,0.92)" stroke-width="1.5" stroke-linecap="round" fill="none"/>
                <path class="ethy-mouth-happy"
                  d="M30 48 Q40 56.5 50 48"
                  stroke="rgba(210,175,90,0.95)" stroke-width="1.7" stroke-linecap="round" fill="none" opacity="0"/>
                <path class="ethy-mouth-sad"
                  d="M30 53.5 Q40 46 50 53.5"
                  stroke="rgba(210,175,90,0.90)" stroke-width="1.5" stroke-linecap="round" fill="none" opacity="0"/>
                <path class="ethy-mouth-excited"
                  d="M28 47.5 Q40 57.5 52 47.5"
                  stroke="rgba(210,175,90,0.95)" stroke-width="1.8" stroke-linecap="round" fill="none" opacity="0"/>
                <ellipse class="ethy-mouth-surprised"
                  cx="40" cy="51" rx="3" ry="3.5"
                  stroke="rgba(210,175,90,0.90)" stroke-width="1.3" fill="rgba(4,3,1,0.55)" opacity="0"/>
                <path class="ethy-mouth-thoughtful"
                  d="M34 51 Q38 49 41 50.5 Q44.5 52 47 50"
                  stroke="rgba(210,175,90,0.86)" stroke-width="1.3" stroke-linecap="round" fill="none" opacity="0"/>
                <path class="ethy-mouth-wink"
                  d="M32 50 Q41 55.5 50 50.5"
                  stroke="rgba(210,175,90,0.92)" stroke-width="1.5" stroke-linecap="round" fill="none" opacity="0"/>
                <path class="ethy-mouth-love"
                  d="M30 48 Q40 56.5 50 48"
                  stroke="rgba(210,175,90,0.95)" stroke-width="1.7" stroke-linecap="round" fill="none" opacity="0"/>
                <ellipse class="ethy-mouth-love-tongue"
                  cx="40" cy="56" rx="2.5" ry="1.5"
                  fill="#cc7888" opacity="0"/>
              </g>

              <!-- Mejillas (happy / excited / love) -->
              <g class="ethy-part-cheeks" opacity="0">
                <ellipse cx="18" cy="41" rx="4" ry="2.5" fill="#cc7888" opacity="0.38"/>
                <ellipse cx="62" cy="41" rx="4" ry="2.5" fill="#cc7888" opacity="0.38"/>
              </g>
            </svg>
        `;

        // Crear burbuja de diálogo
        _bubble = document.createElement('div');
        _bubble.className = 'ethy-speech-bubble';
        _bubble.innerHTML = `
            <div class="ethy-title"><span class="ethy-title-gem">◆</span> Ethy</div>
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
                    'Con eso podrías llenar un capítulo. 📖',
                    'Pocas personas escriben así. Sigue.',
                    'El Oráculo recuerda cada palabra. 🖊️'
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
                const msgs = [
                    'Lo que elijas, tendrá consecuencias.',
                    'El hilo del destino se bifurca aquí.',
                    'Piénsalo bien.',
                    '...esto es interesante.'
                ];
                say(msgs[Math.floor(Math.random() * msgs.length)], {
                    expression: 'thoughtful', duration: 2500
                });
            }
        });

        // Escena terminada → satisfacción
        eventBus.on('scene:ended', () => {
            if (!_canReact()) return;
            const msgs = [
                'El tejido de Etheria recuerda esto.',
                'Cada final abre una grieta hacia lo siguiente.',
                'Ha sido un honor estar presente.'
            ];
            say(msgs[Math.floor(Math.random() * msgs.length)], {
                expression: 'happy', duration: 3000
            });
        });

        // Error en escena → preocupación
        eventBus.on('scene:error', () => {
            if (!_canReact()) return;
            const msgs = [
                'El Oráculo titubeó. Eso no es normal.',
                'Algo en el tejido se torció. Reintenta.',
                'Hasta el destino se equivoca a veces.'
            ];
            say(msgs[Math.floor(Math.random() * msgs.length)], {
                expression: 'sad', duration: 3500
            });
        });

        // Guardado → confirmación tranquila
        eventBus.on('ui:show-autosave', (data) => {
            if (!_canReact()) return;
            if (data?.state === 'error') {
                say('La historia no pudo guardarse. Revisa la conexión.', { expression: 'sad', duration: 3000 });
                return;
            }
            setExpression('happy');
        });

        // Sincronización completada → frase breve
        eventBus.on('sync:status-changed', (data) => {
            if (data?.target !== 'button') return;
            if (data?.status !== 'synced') return;
            if (!_canReact()) return;
            say('Guardado en los registros de Etheria.', { expression: 'happy', duration: 3000 });
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
            say('Sigues aquí. Bien.', { expression: 'surprised', duration: 3000 });
        }
        _resetSleepTimer();
    }

    // ── Easter eggs — clics múltiples ─────────────────────────────────────────

    const EASTER_EGGS = [
        { text: 'Eso duele en unidades de cristal.', expression: 'sad' },
        { text: 'Interesante forma de hacer amigos.', expression: 'surprised' },
        { text: 'Tres veces. Te he contado tres veces.', expression: 'thoughtful' },
        { text: 'De acuerdo. Tú ganas. Hoy.', expression: 'sad' },
        { text: '¿No hay historia esperándote ahí fuera?', expression: 'wink' },
        { text: 'Bien. Me quedaré aquí. Observando.', expression: 'neutral' },
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
            { text: 'La lluvia recuerda cosas. Escucha.', expression: 'thoughtful' },
            { text: 'Buena atmósfera para lo que viene. 🌧️', expression: 'happy' },
        ],
        fog:  [
            { text: 'En la niebla ocurren las mejores historias.', expression: 'surprised' },
            { text: 'Con esta niebla ya no sé si soy real. 🌫️', expression: 'wink' },
        ],
        none: [
            { text: 'Calma antes de algo. Siempre. ☀️', expression: 'thoughtful' },
            { text: 'Un buen día para escribir.', expression: 'happy' },
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

        // Ocultar todas las bocas, mostrar la activa
        svg.querySelectorAll('[class*="ethy-mouth-"]').forEach(el => {
            el.setAttribute('opacity', '0');
            el.style.transition = 'opacity 0.25s ease';
        });
        const activeMouth = svg.querySelector('.ethy-mouth-' + expression);
        if (activeMouth) activeMouth.setAttribute('opacity', '1');
        const tongue = svg.querySelector('.ethy-mouth-love-tongue');
        if (tongue) tongue.setAttribute('opacity', expression === 'love' ? '1' : '0');

        // Mejillas
        const cheeks = svg.querySelector('.ethy-part-cheeks');
        if (cheeks) {
            cheeks.style.transition = 'opacity 0.3s ease';
            cheeks.style.opacity = CHEEK_EXPRS.has(expression) ? '1' : '0';
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
