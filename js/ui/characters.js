// Editor de personajes, tarjetas de perfil y efectos del menú principal.
// EDITOR SPLIT-SCREEN
// ============================================
function openCharacterEditor(charId = null) {
    resetCharForm();

    if (charId) {
        const c = appData.characters.find(ch => ch.id === charId);
        if (!c || c.userIndex !== currentUserIndex) return;

        document.getElementById('editCharacterId').value = c.id;
        document.getElementById('charName').value = c.name || '';
        document.getElementById('charLastName').value = c.lastName || '';
        document.getElementById('charAge').value = c.age || '';
        document.getElementById('charRace').value = c.race || '';
        document.getElementById('charGender').value = c.gender || '';
        document.getElementById('charAlignment').value = c.alignment || '';
        document.getElementById('charJob').value = c.job || '';
        document.getElementById('charColor').value = c.color || '#8b7355';
        document.getElementById('charAvatar').value = c.avatar || '';
        document.getElementById('charSprite').value = c.sprite || '';
        document.getElementById('charBasic').value = c.basic || '';
        document.getElementById('charPersonality').value = c.personality || '';
        document.getElementById('charHistory').value = c.history || '';
        document.getElementById('charNotes').value = c.notes || '';

        const deleteBtn = document.getElementById('deleteCharBtn');
        if (deleteBtn) deleteBtn.style.display = 'inline-block';

        document.querySelectorAll('.gender-option').forEach(opt => opt.classList.remove('selected'));
        const genderMap = { 'Femenino': 0, 'Masculino': 1, 'No Binario': 2 };
        const genderIdx = genderMap[c.gender];
        if (genderIdx !== undefined) {
            const options = document.querySelectorAll('.gender-option');
            if (options[genderIdx]) options[genderIdx].classList.add('selected');
        }
    } else {
        document.getElementById('editCharacterId').value = '';
        const deleteBtn = document.getElementById('deleteCharBtn');
        if (deleteBtn) deleteBtn.style.display = 'none';
    }

    updatePreview();
    switchEditorTab('identity', document.querySelector('.editor-tab'));
    openModal('characterModal');
}

function switchEditorTab(tabName, element) {
    currentEditorTab = tabName;

    document.querySelectorAll('.editor-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.editor-panel').forEach(p => p.classList.remove('active'));

    if (element) element.classList.add('active');

    const panel = document.getElementById(`editor-tab-${tabName}`);
    if (panel) panel.classList.add('active');
}

function selectGender(gender, element) {
    document.querySelectorAll('.gender-option').forEach(opt => opt.classList.remove('selected'));
    element.classList.add('selected');
    document.getElementById('charGender').value = gender;
}

function updatePreview() {
    const name = document.getElementById('charName')?.value || 'Nuevo Personaje';
    const avatar = document.getElementById('charAvatar')?.value;

    const previewName = document.getElementById('editorPreviewName');
    if (previewName) previewName.textContent = name;

    const previewImg = document.getElementById('editorPreviewImage');
    if (previewImg) {
        if (avatar) {
            previewImg.innerHTML = `<img src="${escapeHtml(avatar)}" alt="Vista previa del avatar" style="width: 100%; height: 100%; object-fit: cover;" onerror="this.style.display='none'; this.parentElement.innerHTML='<span style=\\'font-size: 5rem;\\'>👤</span>'">`;
        } else {
            previewImg.innerHTML = '<span style="font-size: 5rem;">👤</span>';
        }
    }
}

// ============================================
// CARGA AUTOMÁTICA
// ============================================
async function selectUser(idx, options = {}) {
    if (idx < 0 || idx >= userNames.length) return;

    const safeOptions = { instant: false, autoLoad: false, ...options };

    const previousProfileIndex = currentUserIndex;
    if (previousProfileIndex !== idx && !safeOptions.autoLoad) {
        await syncBidirectional({ profileIndex: previousProfileIndex, silent: true, allowRemotePrompt: false });
    }

    currentUserIndex = idx;
    localStorage.setItem(LAST_PROFILE_KEY, String(idx));

    const savedCharId = localStorage.getItem(`etheria_selected_char_${currentUserIndex}`);
    selectedCharId = savedCharId || null;

    highlightActiveProfile(idx);
    toggleWelcomeOverlay(false);

    const loadingOverlay = document.getElementById('loadingOverlay');
    if (loadingOverlay && !safeOptions.instant) loadingOverlay.classList.add('active');
    isLoading = true;

    if (!safeOptions.instant) {
        await new Promise(resolve => setTimeout(resolve, 220));
    }

    const userSelectScreen = document.getElementById('userSelectScreen');
    const mainMenu = document.getElementById('mainMenu');
    const currentUserDisplay = document.getElementById('currentUserDisplay');

    // Transición suave: fade out de la pantalla de perfiles, fade in del menú
    if (userSelectScreen && !safeOptions.instant) {
        userSelectScreen.style.transition = 'opacity 0.35s ease';
        userSelectScreen.style.opacity = '0';
        await new Promise(resolve => setTimeout(resolve, 350));
    }
    if (userSelectScreen) {
        userSelectScreen.classList.add('hidden');
        userSelectScreen.style.opacity = '';
        userSelectScreen.style.transition = '';
    }
    if (mainMenu) {
        mainMenu.classList.remove('hidden');
        mainMenu.style.opacity = '0';
        mainMenu.style.transition = 'opacity 0.3s ease';
        void mainMenu.offsetWidth;
        mainMenu.style.opacity = '1';
        setTimeout(() => { mainMenu.style.transition = ''; mainMenu.style.opacity = ''; }, 320);
        if (typeof startMenuMusic === 'function') startMenuMusic();
        // Onboarding paso 1: menú principal
        const _ob = parseInt(localStorage.getItem('etheria_onboarding_step') || '0', 10);
        if (_ob === 1 && typeof maybeShowOnboarding === 'function') {
            setTimeout(maybeShowOnboarding, 600);
        }
    }
    if (currentUserDisplay) currentUserDisplay.textContent = userNames[idx] || 'Jugador';

    await loadFromCloud();

    if (loadingOverlay) loadingOverlay.classList.remove('active');
    isLoading = false;

    generateParticles();
    if (!safeOptions.autoLoad) showAutosave('Sesión iniciada', 'info');
}

// Generar tarjetas de usuario dinámicamente
function renderUserCards() {
    const container = document.getElementById('userCardsContainer');
    if (!container) return;

    container.innerHTML = '';

    userNames.forEach((name, idx) => {
        const card = document.createElement('div');
        card.className = 'user-card';
        card.dataset.profileIndex = idx;

        // Calcular estadísticas por perfil
        const ownTopics = appData.topics.filter(t => t.createdByIndex === idx);
        const ownChars  = appData.characters.filter(c => c.userIndex === idx);
        let totalMsgs = 0;
        ownTopics.forEach(t => {
            // Solo usar mensajes ya en memoria — no forzar carga desde storage en la pantalla de perfiles
            const msgs = Array.isArray(appData.messages[t.id]) ? appData.messages[t.id] : [];
            totalMsgs += msgs.length;
        });

        // Última sesión
        const lastUpdatedKey = `etheria_profile_updated_${idx}`;
        const lastUpdatedRaw = parseInt(localStorage.getItem(lastUpdatedKey) || '0', 10);
        let lastSessionText = 'Sin sesiones';
        if (lastUpdatedRaw > 0) {
            const d = new Date(lastUpdatedRaw);
            const now = new Date();
            const diffDays = Math.floor((now - d) / 86400000);
            if (diffDays === 0) lastSessionText = 'Hoy';
            else if (diffDays === 1) lastSessionText = 'Ayer';
            else if (diffDays < 7) lastSessionText = `Hace ${diffDays} días`;
            else lastSessionText = d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
        }

        // Última historia activa
        const lastTopic = ownTopics[ownTopics.length - 1] || null;

        card.innerHTML = `
            <div class="save-slot-number">Archivo ${String(idx + 1).padStart(2, '0')}</div>
            <div class="user-avatar">👤</div>
            <div class="user-name">${escapeHtml(name)}</div>
            <div class="user-card-divider"></div>
            <div class="user-card-stats">
                <div class="user-stat">
                    <span class="user-stat-val">${ownTopics.length}</span>
                    <span class="user-stat-lbl">Historias</span>
                </div>
                <div class="user-stat-sep"></div>
                <div class="user-stat">
                    <span class="user-stat-val">${ownChars.length}</span>
                    <span class="user-stat-lbl">Personajes</span>
                </div>
                <div class="user-stat-sep"></div>
                <div class="user-stat">
                    <span class="user-stat-val">${totalMsgs}</span>
                    <span class="user-stat-lbl">Mensajes</span>
                </div>
            </div>
            <div class="user-card-footer">
                <div class="user-last-session">${lastSessionText}</div>
                ${lastTopic ? `<div class="user-last-topic">📖 ${escapeHtml(lastTopic.title)}</div>` : ''}
                ${lastTopic ? `<button class="user-continue-btn">▶ Continuar</button>` : ''}
            </div>
        `;

        // Botón continuar — stopPropagation para no activar selectUser a la vez
        const btn = card.querySelector('.user-continue-btn');
        if (btn) {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                selectUser(idx).then(() => {
                    if (typeof _skipNextFadeTransition !== 'undefined') _skipNextFadeTransition = true;
                    if (typeof stopMenuMusic === 'function') stopMenuMusic();
                    enterTopic(lastTopic.id);
                });
            });
        }

        card.onclick = () => {
            // Al entrar al perfil sin ir directo a un topic, también suprimir el overlay
            if (typeof _skipNextFadeTransition !== 'undefined') _skipNextFadeTransition = true;
            selectUser(idx);
        };
        container.appendChild(card);
    });

    // Botón para agregar nuevo perfil (máximo 10)
    if (userNames.length < 10) {
        const addCard = document.createElement('div');
        addCard.className = 'add-profile-card';
        addCard.id = 'addProfileCard';
        addCard.onclick = addNewProfile;
        addCard.innerHTML = `
            <div class="add-profile-icon">+</div>
            <div class="add-profile-text">Nuevo Archivo</div>
        `;
        container.appendChild(addCard);
    }

    const lastProfileId = getStoredLastProfileId();
    if (lastProfileId !== null) {
        highlightActiveProfile(lastProfileId);
        toggleWelcomeOverlay(false);
    } else {
        localStorage.removeItem(LAST_PROFILE_KEY);
        highlightActiveProfile(null);
        toggleWelcomeOverlay(true);
    }
}

function highlightActiveProfile(idx) {
    document.querySelectorAll('.user-card').forEach(card => {
        const cardIndex = Number.parseInt(card.dataset.profileIndex, 10);
        card.classList.toggle('active', Number.isInteger(idx) && cardIndex === idx);
    });
}

function toggleWelcomeOverlay(shouldShow) {
    const overlay = document.getElementById('welcomeOverlay');
    const addCard = document.getElementById('addProfileCard');
    const canCreateProfile = Boolean(addCard);

    if (overlay) overlay.classList.toggle('active', shouldShow && canCreateProfile);
    if (addCard) addCard.classList.toggle('highlight', shouldShow);
}

function generateProfileParticles() {
    const container = document.getElementById('profileParticles');
    if (!container) return;

    container.innerHTML = '';
    for (let i = 0; i < 18; i++) {
        const particle = document.createElement('div');
        particle.className = 'profile-particle';
        particle.style.left = (Math.random() * 100) + '%';
        particle.style.top = (60 + Math.random() * 45) + '%';
        particle.style.animationDuration = (6 + Math.random() * 7) + 's';
        particle.style.animationDelay = (Math.random() * 4) + 's';
        particle.style.setProperty('--float-x', ((Math.random() * 90) - 45) + 'px');
        container.appendChild(particle);
    }
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}


const menuMouseState = {
    x: 0,
    y: 0,
    targetX: 0,
    targetY: 0,
    px: window.innerWidth * 0.5,
    py: window.innerHeight * 0.5
};
let menuParallaxBound = false;
let menuParallaxAnimationId = null;
let fireflyAnimationId = null;
let fireflyEntities = [];

function initMenuParallax() {
    if (menuParallaxBound) return;
    const coarsePointer = typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches;
    const parallax = document.getElementById('menuParallax');
    if (coarsePointer) {
        if (parallax) {
            parallax.querySelectorAll('.parallax-layer').forEach((layer) => {
                layer.style.setProperty('--parallax-x', '0px');
                layer.style.setProperty('--parallax-y', '0px');
            });
        }
        return;
    }
    if (!parallax) return;

    // Cada capa define --layer-speed en CSS; aquí solo gestionamos --parallax-x/y
    // que la capa multiplica por su propia velocidad.
    // Amplitud máxima: movimiento visible pero no mareante.
    const MAX_X = 10;
    const MAX_Y = 6;

    const updateParallax = () => {
        const layers = parallax.querySelectorAll('.parallax-layer');
        layers.forEach((layer) => {
            layer.style.setProperty('--parallax-x', `${menuMouseState.x}px`);
            layer.style.setProperty('--parallax-y', `${menuMouseState.y}px`);
        });
    };

    // Factor de suavizado 0.055: más suave que antes (era 0.07), sin inercia brusca
    const animateParallax = () => {
        menuMouseState.x += (menuMouseState.targetX - menuMouseState.x) * 0.03;
        menuMouseState.y += (menuMouseState.targetY - menuMouseState.y) * 0.03;
        updateParallax();
        menuParallaxAnimationId = window.requestAnimationFrame(animateParallax);
    };

    window.addEventListener('mousemove', (event) => {
        const nx = (event.clientX / window.innerWidth) - 0.5;
        const ny = (event.clientY / window.innerHeight) - 0.5;
        menuMouseState.px = event.clientX;
        menuMouseState.py = event.clientY;
        menuMouseState.targetX = nx * MAX_X;
        menuMouseState.targetY = ny * MAX_Y;
    });

    window.addEventListener('mouseleave', () => {
        menuMouseState.targetX = 0;
        menuMouseState.targetY = 0;
    });

    menuParallaxBound = true;
    if (!menuParallaxAnimationId) {
        menuParallaxAnimationId = window.requestAnimationFrame(animateParallax);
    }
}

function animateFireflies() {
    if (fireflyAnimationId) window.cancelAnimationFrame(fireflyAnimationId);

    let lastTime = performance.now();

    const loop = (timeNow) => {
        const dt = Math.min((timeNow - lastTime) / 16.67, 2);
        lastTime = timeNow;

        fireflyEntities.forEach((entity) => {
            // --- Comportamiento de luciérnaga real ---
            // Cada luciérnaga tiene fases: volar, pausar, subir, girar
            entity.stateTimer -= dt;
            if (entity.stateTimer <= 0) {
                // Transición aleatoria de estado
                const r = Math.random();
                if (r < 0.35) {
                    entity.state = 'float';      // deriva lenta
                    entity.stateTimer = 40 + Math.random() * 80;
                    entity.targetDx = (Math.random() - 0.5) * 60;
                    entity.targetDy = -10 - Math.random() * 30; // tienden a subir
                } else if (r < 0.6) {
                    entity.state = 'pause';      // pausa quieta, solo parpadeo
                    entity.stateTimer = 20 + Math.random() * 50;
                    entity.targetDx = 0;
                    entity.targetDy = 0;
                } else if (r < 0.80) {
                    entity.state = 'drift';      // deriva lateral suave
                    entity.stateTimer = 30 + Math.random() * 60;
                    entity.targetDx = (Math.random() - 0.5) * 80;
                    entity.targetDy = (Math.random() - 0.5) * 25;
                } else {
                    entity.state = 'rise';       // ascenso curvo más vivo
                    entity.stateTimer = 15 + Math.random() * 30;
                    entity.targetDx = (Math.random() - 0.5) * 40;
                    entity.targetDy = -30 - Math.random() * 50;
                }
            }

            // Velocidad base según estado
            const speed = entity.state === 'pause' ? 0.003
                        : entity.state === 'float' ? 0.008
                        : entity.state === 'rise'  ? 0.014
                        :                            0.006;

            const tx = entity.originX + entity.targetDx;
            const ty = entity.originY + entity.targetDy;
            entity.vx += (tx - entity.x) * speed * entity.speedFactor * dt;
            entity.vy += (ty - entity.y) * speed * entity.speedFactor * dt;

            // Micro-oscilación orgánica (aleteos leves)
            entity.wobble += entity.wobbleSpeed * dt;
            entity.vx += Math.sin(entity.wobble * 2.3) * 0.012 * dt;
            entity.vy += Math.cos(entity.wobble * 1.7) * 0.008 * dt;

            // Huida del ratón
            const mdx = entity.x - menuMouseState.px;
            const mdy = entity.y - menuMouseState.py;
            const mdist = Math.hypot(mdx, mdy);
            if (mdist < entity.fleeRadius && mdist > 0) {
                const push = (1 - mdist / entity.fleeRadius) * entity.fleeForce * dt;
                entity.vx += (mdx / mdist) * push;
                entity.vy += (mdy / mdist) * push;
            }

            // Amortiguación — más alta en pausa, baja al volar
            const damp = entity.state === 'pause' ? 0.88 : 0.94;
            entity.vx *= damp;
            entity.vy *= damp;

            entity.x += entity.vx * dt;
            entity.y += entity.vy * dt;

            // Rebote en bordes — relocalizan el origen para que no queden atrapadas
            if (entity.x < 4) {
                entity.x = 4; entity.vx = Math.abs(entity.vx) * 0.5;
                entity.originX = 20 + Math.random() * (entity.maxX * 0.3);
            } else if (entity.x > entity.maxX - 4) {
                entity.x = entity.maxX - 4; entity.vx = -Math.abs(entity.vx) * 0.5;
                entity.originX = entity.maxX * 0.7 + Math.random() * (entity.maxX * 0.25);
            }
            if (entity.y < 4) {
                entity.y = 4; entity.vy = Math.abs(entity.vy) * 0.5;
                entity.originY = entity.maxY * 0.3 + Math.random() * (entity.maxY * 0.3);
            } else if (entity.y > entity.maxY - 4) {
                entity.y = entity.maxY - 4; entity.vy = -Math.abs(entity.vy) * 0.5;
                entity.originY = entity.maxY * 0.4 + Math.random() * (entity.maxY * 0.3);
            }

            // Deriva suave del origen para que exploren el espacio
            entity.originX += (Math.random() - 0.5) * entity.originDrift * dt;
            entity.originY += (Math.random() - 0.5) * entity.originDrift * 0.6 * dt;
            entity.originX = Math.max(10, Math.min(entity.maxX - 10, entity.originX));
            entity.originY = Math.max(entity.maxY * 0.1, Math.min(entity.maxY * 0.92, entity.originY));

            // Parpadeo: brillo pulsante lento, más intenso al subir
            entity.twinkle += entity.twinkleSpeed * dt;
            // Ciclo de encendido/apagado: luciérnagas reales parpadean ~0.5–2 Hz
            entity.blinkTimer -= dt;
            if (entity.blinkTimer < 0) {
                entity.blinkOn = !entity.blinkOn;
                entity.blinkTimer = entity.blinkOn
                    ? (8 + Math.random() * 20)   // encendida: 0.5–2s a 60fps
                    : (4 + Math.random() * 12);  // apagada: más corto
            }

            const glowBase = entity.blinkOn ? entity.baseGlow : entity.baseGlow * 0.08;
            const glowPulse = 0.85 + Math.sin(entity.twinkle) * 0.15;
            const glow = glowBase * glowPulse;
            const opacity = entity.blinkOn
                ? Math.max(0.25, entity.baseOpacity * glowPulse)
                : entity.baseOpacity * 0.06;

            entity.el.style.opacity = opacity.toFixed(3);
            entity.el.style.filter = entity.blinkOn
                ? `drop-shadow(0 0 ${3 + glow * 5}px rgba(255, 255, 200, ${0.9 + glow * 0.1})) drop-shadow(0 0 ${8 + glow * 12}px rgba(255, 200, 40, ${0.6 + glow * 0.3}))`
                : `blur(1px)`;
            entity.el.style.transform = `translate(${entity.x.toFixed(1)}px, ${entity.y.toFixed(1)}px)`;
        });

        fireflyAnimationId = window.requestAnimationFrame(loop);
    };

    fireflyAnimationId = window.requestAnimationFrame(loop);
}

function addNewProfile() {
    if (userNames.length >= 10) {
        showAutosave('Máximo de 10 perfiles alcanzado', 'error');
        return;
    }
    const newName = prompt('Nombre del nuevo perfil:');
    if (newName && newName.trim()) {
        userNames.push(newName.trim());
        localStorage.setItem('etheria_user_names', JSON.stringify(userNames));
        renderUserCards();
    }
}

// Generar partículas según el tema actual
function generateParticles() {
    const container = document.getElementById('particlesContainer');
    if (!container) return;

    container.innerHTML = '';
    fireflyEntities = [];

    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';

    if (isDark) {
        const coarsePointer = typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches;
        const totalFireflies = coarsePointer ? 8 : (18 + Math.floor(Math.random() * 6));

        // getBoundingClientRect puede devolver 0 si el contenedor acaba de mostrarse.
        // Usamos window como fallback y actualizamos los bounds en el primer frame.
        const rawBounds = container.getBoundingClientRect();
        const W = rawBounds.width  > 10 ? rawBounds.width  : window.innerWidth;
        const H = rawBounds.height > 10 ? rawBounds.height : window.innerHeight;

        for (let i = 0; i < totalFireflies; i++) {
            const firefly = document.createElement('div');
            firefly.className = 'firefly';
            firefly.style.left = '0px';
            firefly.style.top = '0px';
            firefly.style.animationDelay = Math.random() * 3 + 's';
            firefly.style.animationDuration = (1.6 + Math.random() * 2.1) + 's';

            const depth = 0.72 + Math.random() * 0.46;
            const size = 4 + (depth * 4);
            firefly.style.setProperty('--firefly-size-w', `${size.toFixed(2)}px`);
            firefly.style.setProperty('--firefly-size-h', `${size.toFixed(2)}px`);
            // Longitud de los rayos proporcional al tamaño
            const rayLen = (16 + depth * 18).toFixed(1);
            firefly.style.setProperty('--firefly-ray', `${rayLen}px`);

            const entity = {
                el: firefly,
                x: Math.random() * W,
                y: (H * 0.18) + (Math.random() * H * 0.74),
                originX: Math.random() * W,
                originY: (H * 0.25) + (Math.random() * H * 0.60),
                maxX: Math.max(1, W - 2),
                maxY: Math.max(1, H - 2),
                vx: (Math.random() - 0.5) * 0.15,
                vy: (Math.random() - 0.5) * 0.1,
                // Estado de comportamiento
                state: 'float',
                stateTimer: Math.random() * 60,
                targetDx: (Math.random() - 0.5) * 40,
                targetDy: -5 - Math.random() * 20,
                // Parámetros de movimiento
                wobble: Math.random() * Math.PI * 2,
                wobbleSpeed: 0.008 + Math.random() * 0.018,
                speedFactor: 0.35 + Math.random() * 0.65,
                fleeRadius: 70 + Math.random() * 50,
                fleeForce: 0.15 + Math.random() * 0.35,
                originDrift: 0.08 + Math.random() * 0.22,
                // Parpadeo tipo luciérnaga
                blinkOn: Math.random() > 0.4,
                blinkTimer: 5 + Math.random() * 25,
                baseGlow: 0.7 + (depth * 0.4),
                baseOpacity: 0.82 + (depth * 0.18),
                twinkle: Math.random() * Math.PI * 2,
                twinkleSpeed: 0.015 + Math.random() * 0.025
            };

            firefly.style.setProperty('--firefly-opacity', entity.baseOpacity.toFixed(2));
            fireflyEntities.push(entity);
            container.appendChild(firefly);
        }

        // Si los bounds iniciales eran 0, recalcular en el primer frame real
        if (rawBounds.width <= 10) {
            requestAnimationFrame(() => {
                const b = container.getBoundingClientRect();
                if (b.width > 10) {
                    fireflyEntities.forEach(e => {
                        e.maxX = b.width - 2;
                        e.maxY = b.height - 2;
                        e.originX = Math.min(e.originX, e.maxX);
                        e.originY = Math.min(e.originY, e.maxY);
                    });
                }
            });
        }

        animateFireflies();
    } else {
        if (fireflyAnimationId) {
            window.cancelAnimationFrame(fireflyAnimationId);
            fireflyAnimationId = null;
        }

        for (let i = 0; i < 12; i++) {
            const leaf = document.createElement('div');
            leaf.className = 'leaf';
            leaf.style.left = Math.random() * 100 + '%';
            leaf.style.animationDelay = Math.random() * 8 + 's';
            leaf.style.animationDuration = (6 + Math.random() * 4) + 's';
            container.appendChild(leaf);
        }
    }
}

// ============================================
