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

    if (userSelectScreen) userSelectScreen.classList.add('hidden');
    if (mainMenu) mainMenu.classList.remove('hidden');
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
        card.onclick = () => selectUser(idx);
        card.innerHTML = `
            <div class="user-avatar">👤</div>
            <div class="user-name">${escapeHtml(name)}</div>
            <div class="user-hint">Click para entrar</div>
        `;
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
            <div class="add-profile-text">Crear Perfil</div>
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
    const parallax = document.getElementById('menuParallax');
    if (!parallax) return;

    // Cada capa define --layer-speed en CSS; aquí solo gestionamos --parallax-x/y
    // que la capa multiplica por su propia velocidad.
    // Amplitud máxima: movimiento visible pero no mareante.
    const MAX_X = 18;
    const MAX_Y = 10;

    const updateParallax = () => {
        const layers = parallax.querySelectorAll('.parallax-layer');
        layers.forEach((layer) => {
            layer.style.setProperty('--parallax-x', `${menuMouseState.x}px`);
            layer.style.setProperty('--parallax-y', `${menuMouseState.y}px`);
        });
    };

    // Factor de suavizado 0.055: más suave que antes (era 0.07), sin inercia brusca
    const animateParallax = () => {
        menuMouseState.x += (menuMouseState.targetX - menuMouseState.x) * 0.055;
        menuMouseState.y += (menuMouseState.targetY - menuMouseState.y) * 0.055;
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
        const dt = Math.min((timeNow - lastTime) / 16.67, 1.8);
        lastTime = timeNow;

        fireflyEntities.forEach((entity) => {
            entity.phase += entity.curveSpeed * dt;
            entity.wobble += entity.wobbleSpeed * dt;

            const figureX = Math.sin(entity.phase) * entity.figureScale;
            const figureY = Math.sin(entity.phase * 2 + entity.figureOffset) * (entity.figureScale * 0.52);
            const driftX = Math.cos(entity.wobble) * entity.driftRadius;
            const driftY = Math.sin(entity.wobble * 0.8) * (entity.driftRadius * 0.8);

            const targetX = entity.originX + figureX + driftX;
            const targetY = entity.originY + figureY + driftY;

            entity.vx += (targetX - entity.x) * 0.017 * entity.speedFactor * dt;
            entity.vy += (targetY - entity.y) * 0.017 * entity.speedFactor * dt;

            const mouseDx = entity.x - menuMouseState.px;
            const mouseDy = entity.y - menuMouseState.py;
            const mouseDist = Math.hypot(mouseDx, mouseDy);
            if (mouseDist < entity.fleeRadius) {
                const push = (1 - (mouseDist / entity.fleeRadius)) * entity.fleeForce * dt;
                entity.vx += (mouseDx / (mouseDist || 1)) * push;
                entity.vy += (mouseDy / (mouseDist || 1)) * push;
            }

            entity.vx *= 0.93;
            entity.vy *= 0.93;

            entity.x += entity.vx * dt;
            entity.y += entity.vy * dt;

            if (entity.x < 0) {
                entity.x = 0;
                entity.vx = Math.abs(entity.vx) * 0.72;
                entity.originX = Math.max(entity.figureScale, entity.originX);
            } else if (entity.x > entity.maxX) {
                entity.x = entity.maxX;
                entity.vx = -Math.abs(entity.vx) * 0.72;
                entity.originX = Math.min(entity.maxX - entity.figureScale, entity.originX);
            }

            if (entity.y < 0) {
                entity.y = 0;
                entity.vy = Math.abs(entity.vy) * 0.72;
                entity.originY = Math.max(entity.figureScale, entity.originY);
            } else if (entity.y > entity.maxY) {
                entity.y = entity.maxY;
                entity.vy = -Math.abs(entity.vy) * 0.72;
                entity.originY = Math.min(entity.maxY - entity.figureScale, entity.originY);
            }

            entity.originX += (Math.random() - 0.5) * entity.originDrift * dt;
            entity.originY += (Math.random() - 0.5) * entity.originDrift * dt;
            entity.originX = Math.min(Math.max(entity.figureScale, entity.originX), entity.maxX - entity.figureScale);
            entity.originY = Math.min(Math.max(entity.figureScale, entity.originY), entity.maxY - entity.figureScale);

            const heading = Math.atan2(entity.vy, entity.vx) * (180 / Math.PI);
            const upBoost = Math.max(0, -entity.vy * 0.42);
            const downFade = Math.max(0, entity.vy * 0.25);
            const movementGlow = Math.min(1.2, entity.baseGlow + upBoost - downFade);
            entity.twinkle += entity.twinkleSpeed * dt;
            const twinkle = 0.75 + (Math.sin(entity.twinkle) * 0.25);
            const movementOpacity = Math.min(1, Math.max(0.5, (entity.baseOpacity + (upBoost * 0.2) - (downFade * 0.12)) * twinkle));

            entity.el.style.opacity = movementOpacity.toFixed(3);
            entity.el.style.filter = `blur(0.2px) drop-shadow(0 0 ${6 + (movementGlow * 6)}px rgba(255, 214, 120, ${0.45 + movementGlow * 0.35}))`;
            entity.el.style.transform = `translate(${entity.x}px, ${entity.y}px) rotate(${heading}deg)`;
        });

        fireflyAnimationId = window.requestAnimationFrame(loop);
    };

    fireflyAnimationId = window.requestAnimationFrame(loop);
}

function addNewProfile() {
    if (userNames.length >= 10) {
        alert('Máximo de 10 perfiles alcanzado');
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
        const totalFireflies = 24 + Math.floor(Math.random() * 8);

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
            const size = 7 + (depth * 4);
            firefly.style.setProperty('--firefly-size-w', `${size.toFixed(2)}px`);
            firefly.style.setProperty('--firefly-size-h', `${(size * 0.58).toFixed(2)}px`);

            const entity = {
                el: firefly,
                x: Math.random() * W,
                y: (H * 0.18) + (Math.random() * H * 0.74),
                originX: Math.random() * W,
                originY: (H * 0.16) + (Math.random() * H * 0.78),
                maxX: Math.max(1, W - 2),
                maxY: Math.max(1, H - 2),
                vx: (Math.random() - 0.5) * 0.25,
                vy: (Math.random() - 0.5) * 0.2,
                phase: Math.random() * Math.PI * 2,
                curveSpeed: 0.005 + Math.random() * 0.02,
                figureScale: 10 + Math.random() * 24,
                figureOffset: Math.random() * Math.PI,
                wobble: Math.random() * Math.PI * 2,
                wobbleSpeed: 0.002 + Math.random() * 0.01,
                driftRadius: 5 + Math.random() * 12,
                speedFactor: 0.45 + Math.random() * 0.9,
                fleeRadius: 75 + Math.random() * 55,
                fleeForce: 0.18 + Math.random() * 0.42,
                originDrift: 0.12 + Math.random() * 0.3,
                baseGlow: 0.38 + (depth * 0.58),
                baseOpacity: 0.58 + (depth * 0.25),
                twinkle: Math.random() * Math.PI * 2,
                twinkleSpeed: 0.02 + Math.random() * 0.04
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
