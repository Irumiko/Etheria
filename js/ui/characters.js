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
            // XSS fix: DOM creation even though fallback is static (consistent pattern)
            const _imgPrev = document.createElement('img');
            _imgPrev.src = avatar;
            _imgPrev.alt = 'Vista previa del avatar';
            _imgPrev.style.cssText = 'width:100%;height:100%;object-fit:cover;';
            _imgPrev.onerror = function () {
                this.style.display = 'none';
                const _sp = document.createElement('span');
                _sp.style.fontSize = '5rem';
                _sp.textContent = '👤';
                this.parentElement.appendChild(_sp);
            };
            previewImg.innerHTML = '';
            previewImg.appendChild(_imgPrev);
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
    // Ocultar botón de tema al salir de la pantalla de selección
    const profileThemeBtn = document.getElementById('profileThemeBtn');
    if (profileThemeBtn) profileThemeBtn.style.display = 'none';
    if (mainMenu) {
        mainMenu.classList.remove('hidden');
        mainMenu.style.opacity = '0';
        mainMenu.style.transition = 'opacity 0.3s ease';
        void mainMenu.offsetWidth;
        mainMenu.style.opacity = '1';
        setTimeout(() => { mainMenu.style.transition = ''; mainMenu.style.opacity = ''; }, 320);
        // Arrancar parallax ahora que el menú es visible
        menuParallaxBound = false;
        if (menuParallaxAnimationId) { cancelAnimationFrame(menuParallaxAnimationId); menuParallaxAnimationId = null; }
        initMenuParallax();
        eventBus.emit('audio:start-menu-music');
        // Onboarding paso 1: menú principal
        const _ob = parseInt(localStorage.getItem('etheria_onboarding_step') || '0', 10);
        if (_ob === 1 && typeof maybeShowOnboarding === 'function') {
            setTimeout(maybeShowOnboarding, 600);
        }
    }
    if (currentUserDisplay) currentUserDisplay.textContent = userNames[idx] || 'Jugador';

    // Ocultar overlay y liberar isLoading ANTES de loadFromCloud.
    // Esto permite que los botones del menú respondan aunque la sync de red tarde.
    if (loadingOverlay) loadingOverlay.classList.remove('active');
    isLoading = false;
    generateParticles();
    if (typeof syncMenuFooterAvatar === 'function') syncMenuFooterAvatar();
    if (!safeOptions.autoLoad) showAutosave('Sesión iniciada', 'info');

    // Sincronización en background — no bloquea la UI
    loadFromCloud().catch(() => {});
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

        // Avatar guardado
        let avatars = [];
        try { avatars = JSON.parse(localStorage.getItem('etheria_user_avatars') || '[]'); } catch (error) { window.EtheriaLogger?.warn('app', 'operation failed:', error?.message || error); }
        const avatarSrc = avatars[idx] || '';
        const avatarHtml = avatarSrc
            ? `<div class="user-avatar-wrap"><img src="${avatarSrc}" alt="Avatar" loading="lazy"></div>`
            : `<div class="user-avatar-wrap"><span class="user-avatar-initials">${(name||'?')[0].toUpperCase()}</span></div>`;

        // Género
        let genders = [];
        try { genders = JSON.parse(localStorage.getItem('etheria_user_genders') || '[]'); } catch (error) { window.EtheriaLogger?.warn('app', 'operation failed:', error?.message || error); }
        const gender = genders[idx] || '';
        const genderMap = { masculino:'Masculino', femenino:'Femenino', 'no-binario':'No binario', otro:'Otro' };
        const genderBadge = gender ? `<div class="user-gender-badge">${genderMap[gender] || gender}</div>` : '';

        // Cumpleaños
        let birthdays = [];
        try { birthdays = JSON.parse(localStorage.getItem('etheria_user_birthdays') || '[]'); } catch (error) { window.EtheriaLogger?.warn('app', 'operation failed:', error?.message || error); }
        const bday = birthdays[idx] || '';
        let bdayHtml = '';
        if (bday) {
            try {
                const [, m, d] = bday.split('-').map(Number);
                const today = new Date();
                const next = new Date(today.getFullYear(), m - 1, d);
                if (next < today) next.setFullYear(today.getFullYear() + 1);
                const diff = Math.round((next - today) / 86400000);
                bdayHtml = diff === 0
                    ? `<div class="user-birthday-row">🎂 ¡Hoy es tu cumpleaños!</div>`
                    : diff <= 7
                        ? `<div class="user-birthday-row">🎂 Cumpleaños en ${diff} día${diff>1?'s':''}</div>`
                        : '';
            } catch (error) { window.EtheriaLogger?.warn('app', 'operation failed:', error?.message || error); }
        }

        card.innerHTML = `
            <div class="save-slot-number">Archivo ${String(idx + 1).padStart(2, '0')}</div>
            ${avatarHtml}
            ${genderBadge}
            ${bdayHtml}
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
                    eventBus.emit('audio:stop-menu-music');
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
            <div class="add-profile-icon" style="font-size:2.4rem;line-height:1;">+</div>
            <div class="add-profile-text" style="font-family:'Cinzel',serif;font-size:0.78rem;letter-spacing:0.15em;text-transform:uppercase;">Nuevo Archivo</div>
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

    // En móvil: 6 partículas (vs 18 en desktop) y duraciones más largas.
    // body.low-spec oculta el contenedor vía CSS — no generamos nada.
    if (document.body.classList.contains('low-spec')) return;

    const isMobile = document.body.classList.contains('is-mobile');
    const count = isMobile ? 6 : 18;
    const durationBase = isMobile ? 10 : 6;
    const durationRange = isMobile ? 5 : 7;

    container.innerHTML = '';
    for (let i = 0; i < count; i++) {
        const particle = document.createElement('div');
        particle.className = 'profile-particle';
        particle.style.left = (Math.random() * 100) + '%';
        particle.style.top = (60 + Math.random() * 45) + '%';
        particle.style.animationDuration = (durationBase + Math.random() * durationRange) + 's';
        particle.style.animationDelay = (Math.random() * 4) + 's';
        particle.style.setProperty('--float-x', ((Math.random() * 90) - 45) + 'px');
        container.appendChild(particle);
    }
}

// Fix B: escapeHtml moved to utils-ui.js (loaded earlier, no deps).
// Safety stub: if load order ever changes, this ensures escapeHtml is still available.
// Uses var so it becomes a global assignment, not a block-scoped function declaration.
if (typeof escapeHtml === 'undefined') {
    var escapeHtml = function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    };
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
let fireflyEntities = []; // kept for compat
// Flag: true en cuanto el giroscopio entrega un evento real
let _gyroActive = false;

// ── Canvas particle system ────────────────────────────────────────────────
let _pCanvas = null, _pCtx = null;
let _pAnimId = null;
let _pFireflies = [], _pPetals = [];
let _pAlpha = 1, _pTarget = 1; // 1=night(fireflies), 0=day(petals)

class _Firefly {
    constructor() { this.reset(true); }
    reset(init) {
        const W = _pCanvas ? _pCanvas.width : window.innerWidth;
        const H = _pCanvas ? _pCanvas.height : window.innerHeight;
        this.x  = Math.random() * W;
        this.y  = init ? Math.random() * H : H + 10;
        this.r  = Math.random() * 2.2 + 1;
        this.vx = (Math.random() - 0.5) * 0.5;
        this.vy = -(Math.random() * 0.55 + 0.18);
        this.phase = Math.random() * Math.PI * 2;
        this.spd   = Math.random() * 0.022 + 0.01;
        this.maxA  = Math.random() * 0.7 + 0.25;
        this.alpha = 0;
        this.fadeIn = true;
        this.h = Math.random() * 50 + 85; // verde-lima a ámbar
    }
    update() {
        const W = _pCanvas.width, H = _pCanvas.height;
        this.phase += this.spd;
        this.x += this.vx + Math.sin(this.phase * 0.7) * 0.9;
        this.y += this.vy + Math.cos(this.phase * 0.5) * 0.3;

        // Huida suave del cursor
        if (typeof menuMouseState !== 'undefined') {
            const mdx = this.x - menuMouseState.px;
            const mdy = this.y - menuMouseState.py;
            const mdist = Math.hypot(mdx, mdy);
            const fleeR = 90;
            if (mdist < fleeR && mdist > 0.1) {
                const push = (1 - mdist / fleeR) * 0.28;
                this.vx += (mdx / mdist) * push;
                this.vy += (mdy / mdist) * push;
            }
        }
        this.vx *= 0.94;
        this.vy *= 0.94;

        if (this.fadeIn) {
            this.alpha = Math.min(this.alpha + 0.01, this.maxA * (0.5 + 0.5 * Math.sin(this.phase)));
            if (this.alpha >= this.maxA * 0.85) this.fadeIn = false;
        } else {
            this.alpha = this.maxA * (0.25 + 0.75 * Math.abs(Math.sin(this.phase)));
        }
        if (this.y < -20 || this.x < -30 || this.x > W + 30) this.reset(false);
    }
    draw(ctx) {
        const g = ctx.createRadialGradient(this.x, this.y, 0, this.x, this.y, this.r * 7);
        g.addColorStop(0,   `hsla(${this.h},88%,70%,${this.alpha.toFixed(3)})`);
        g.addColorStop(0.3, `hsla(${this.h},88%,65%,${(this.alpha*0.45).toFixed(3)})`);
        g.addColorStop(0.7, `hsla(${this.h+15},80%,55%,${(this.alpha*0.14).toFixed(3)})`);
        g.addColorStop(1,   'transparent');
        ctx.beginPath(); ctx.arc(this.x, this.y, this.r * 7, 0, Math.PI * 2);
        ctx.fillStyle = g; ctx.fill();
        ctx.beginPath(); ctx.arc(this.x, this.y, this.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255,255,220,${Math.min(this.alpha*1.4,1).toFixed(3)})`; ctx.fill();
    }
}

class _Petal {
    constructor() { this.reset(true); }
    reset(init) {
        const W = _pCanvas ? _pCanvas.width : window.innerWidth;
        const H = _pCanvas ? _pCanvas.height : window.innerHeight;
        this.x    = Math.random() * W;
        this.y    = init ? Math.random() * H : -20;
        this.sz   = Math.random() * 5 + 2.5;
        this.rot  = Math.random() * Math.PI * 2;
        this.rotV = (Math.random() - 0.5) * 0.04;
        this.vx   = (Math.random() - 0.4) * 0.9;
        this.vy   = Math.random() * 0.55 + 0.22;
        this.phase = Math.random() * Math.PI * 2;
        this.spd   = Math.random() * 0.018 + 0.008;
        this.alpha = Math.random() * 0.5 + 0.28;
        this.isSeed = Math.random() < 0.3;
        const hue = this.isSeed ? 50 : (Math.random() < 0.5 ? 340 + Math.random() * 30 : 30 + Math.random() * 20);
        this.color = `hsl(${hue},${this.isSeed?'80%':'65%'},${this.isSeed?'90%':'82%'})`;
    }
    update() {
        const W = _pCanvas.width, H = _pCanvas.height;
        this.phase += this.spd;
        this.x += this.vx + Math.sin(this.phase) * 0.65;
        this.y += this.vy + Math.cos(this.phase * 0.6) * 0.2;
        this.rot += this.rotV;
        if (this.y > H + 20 || this.x < -30 || this.x > W + 30) this.reset(false);
    }
    draw(ctx) {
        ctx.save(); ctx.translate(this.x, this.y); ctx.rotate(this.rot); ctx.globalAlpha = this.alpha;
        if (this.isSeed) {
            ctx.strokeStyle = this.color; ctx.lineWidth = 0.9;
            ctx.beginPath(); ctx.moveTo(0, this.sz*1.4); ctx.lineTo(0, -this.sz*0.5); ctx.stroke();
            for (let i = 0; i < 6; i++) {
                const a = (i/6)*Math.PI*2;
                ctx.beginPath(); ctx.moveTo(0, -this.sz*0.5);
                ctx.lineTo(Math.cos(a)*this.sz, (-this.sz*0.5)+Math.sin(a)*this.sz*1.1-this.sz*0.4); ctx.stroke();
            }
            ctx.beginPath(); ctx.arc(0, this.sz*1.4, this.sz*0.32, 0, Math.PI*2);
            ctx.fillStyle = this.color; ctx.fill();
        } else {
            ctx.fillStyle = this.color;
            ctx.beginPath(); ctx.ellipse(0, 0, this.sz*0.45, this.sz, 0, 0, Math.PI*2); ctx.fill();
        }
        ctx.restore(); ctx.globalAlpha = 1;
    }
}

function _initParticleCanvas() {
    _pCanvas = document.getElementById('particlesContainer');
    if (!_pCanvas || !(_pCanvas instanceof HTMLCanvasElement)) return false;
    _pCtx = _pCanvas.getContext('2d');
    _pCanvas.width  = window.innerWidth;
    _pCanvas.height = window.innerHeight;
    window.addEventListener('resize', () => {
        if (!_pCanvas) return;
        _pCanvas.width  = window.innerWidth;
        _pCanvas.height = window.innerHeight;
    }, { passive: true });
    return true;
}

function _runParticleLoop() {
    if (_pAnimId) cancelAnimationFrame(_pAnimId);
    const loop = () => {
        if (!_pCtx || !_pCanvas) return;
        _pCtx.clearRect(0, 0, _pCanvas.width, _pCanvas.height);
        _pAlpha += (_pTarget - _pAlpha) * 0.028;
        const nA = _pAlpha, dA = 1 - _pAlpha;
        if (nA > 0.01) {
            _pFireflies.forEach(f => f.update());
            _pCtx.globalAlpha = nA;
            _pFireflies.forEach(f => f.draw(_pCtx));
            _pCtx.globalAlpha = 1;
        }
        if (dA > 0.01) {
            _pPetals.forEach(p => p.update());
            _pCtx.globalAlpha = dA;
            _pPetals.forEach(p => p.draw(_pCtx));
            _pCtx.globalAlpha = 1;
        }
        _pAnimId = requestAnimationFrame(loop);
    };
    _pAnimId = requestAnimationFrame(loop);
}

function initMenuParallax() {
    if (!_pCanvas) _initParticleCanvas();
    const parallax = document.getElementById('menuParallax');
    if (!parallax || parallax.closest('.hidden')) return;
    if (menuParallaxBound) return;

    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
        menuParallaxBound = true; return;
    }

    let mouseX = window.innerWidth / 2;
    let mouseY = window.innerHeight / 2;
    const layers = parallax.querySelectorAll('.parallax-layer');

    function tick() {
        const centerX = window.innerWidth  / 2;
        const centerY = window.innerHeight / 2;
        const offsetX = (mouseX - centerX) / centerX;
        const offsetY = (mouseY - centerY) / centerY;
        layers.forEach(layer => {
            const speed = parseFloat(layer.dataset.speed || '0.05');
            const x = offsetX * speed * -100;
            const y = offsetY * speed * -50;
            layer.style.transform = `translate3d(${x}px, ${y}px, 0)`;
        });
        menuParallaxAnimationId = requestAnimationFrame(tick);
    }

    window.addEventListener('mousemove', e => {
        mouseX = e.clientX;
        mouseY = e.clientY;
        menuMouseState.px = e.clientX;
        menuMouseState.py = e.clientY;
    }, { passive: true });

    window.addEventListener('mouseleave', () => {
        mouseX = window.innerWidth  / 2;
        mouseY = window.innerHeight / 2;
    });

    const coarse = window.matchMedia?.('(pointer: coarse)').matches;
    if (coarse && typeof DeviceOrientationEvent !== 'undefined') {
        const handler = e => {
            if (e.gamma == null) return;
            _gyroActive = true;
            mouseX = window.innerWidth  / 2 + (e.gamma || 0) * 10;
            mouseY = window.innerHeight / 2 - (e.beta  || 0) *  6;
        };
        if (typeof DeviceOrientationEvent.requestPermission === 'function') {
            document.addEventListener('touchend', async function _r() {
                document.removeEventListener('touchend', _r);
                try { if (await DeviceOrientationEvent.requestPermission() === 'granted')
                    window.addEventListener('deviceorientation', handler, { passive: true });
                } catch(e) {}
            }, { once: true });
        } else {
            window.addEventListener('deviceorientation', handler, { passive: true });
        }
    }

    menuParallaxBound = true;
    menuParallaxAnimationId = requestAnimationFrame(tick);
}

// animateFireflies — replaced by Canvas system (_runParticleLoop)
// Kept as no-op stub so legacy call sites don't throw
function animateFireflies() { /* no-op: Canvas system active */ }

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

// Generar partículas — sistema Canvas (luciérnagas noche / pétalos día)
function generateParticles() {
    const isLowSpec = document.body.classList.contains('low-spec');
    if (isLowSpec) return;

    // Init canvas once
    if (!_pCanvas) {
        if (!_initParticleCanvas()) return;
    }

    const isMobile = document.body.classList.contains('is-mobile')
        || (typeof window.matchMedia === 'function' && window.matchMedia('(pointer:coarse)').matches);

    // Pool sizes
    const ffCount  = isMobile ? 20 : 55;
    const petCount = isMobile ? 20 : 48;

    _pFireflies = Array.from({ length: ffCount },  () => new _Firefly());
    _pPetals    = Array.from({ length: petCount }, () => new _Petal());

    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';

    // Transición suave: noche=luciérnagas, día=pétalos
    _pTarget = isDark ? 1 : 0;
    // Snap inmediato en la primera carga (sin fade)
    _pAlpha  = _pTarget;

    // Arrancar loop si no está activo
    if (!_pAnimId) _runParticleLoop();
}

// ============================================
