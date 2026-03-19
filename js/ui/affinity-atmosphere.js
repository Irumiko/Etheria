// ═══════════════════════════════════════════════════════════════════
// AFFINITY ATMOSPHERE — Modo Clásico
// Efectos visuales en el panel de personaje según rango de afinidad.
// - Temperatura del fondo del panel (clase en body)
// - Ornamento en el avatar (emoji animado)
// - Partículas sutiles dentro del panel (canvas)
// ═══════════════════════════════════════════════════════════════════

const AffinityAtmosphere = (function () {

    // Mapa de rango → datos del efecto
    const RANK_CONFIG = {
        'Desconocidos':       { bodyClass: null,                    ornament: null,  particles: null },
        'Conocidos':          { bodyClass: 'affinity-conocidos',    ornament: null,  particles: null },
        'Amigos':             { bodyClass: 'affinity-amigos',       ornament: { emoji: '✦', cls: 'ornament-amigos' },        particles: { color: '52,152,219',  count: 5,  speed: 0.3 } },
        'Mejores Amigos':     { bodyClass: 'affinity-mejores-amigos', ornament: { emoji: '✦✦', cls: 'ornament-mejores-amigos' }, particles: { color: '39,174,96',  count: 8,  speed: 0.4 } },
        'Interés Romántico':  { bodyClass: 'affinity-interes-romantico', ornament: { emoji: '🦋', cls: 'ornament-interes-romantico' }, particles: { color: '241,193,80', count: 10, speed: 0.5 } },
        'Pareja':             { bodyClass: 'affinity-pareja',       ornament: { emoji: '🌸', cls: 'ornament-pareja' },       particles: { color: '231,76,80',   count: 14, speed: 0.6 } },
    };

    const BODY_CLASSES = Object.values(RANK_CONFIG)
        .map(c => c.bodyClass).filter(Boolean);

    let _currentRank   = null;
    let _particleAnim  = null;  // requestAnimationFrame id
    let _particles     = [];
    let _canvas        = null;
    let _ctx           = null;
    let _panelEl       = null;

    // ── Clase de body ────────────────────────────────────────────────
    function _setBodyClass(rankName) {
        BODY_CLASSES.forEach(c => document.body.classList.remove(c));
        const cfg = RANK_CONFIG[rankName];
        if (cfg?.bodyClass) document.body.classList.add(cfg.bodyClass);
    }

    // ── Ornamento del avatar ─────────────────────────────────────────
    function _updateOrnament(rankName) {
        // Eliminar ornamento anterior
        document.querySelectorAll('.vn-affinity-ornament').forEach(el => el.remove());

        const cfg = RANK_CONFIG[rankName];
        if (!cfg?.ornament) return;

        const avatar = document.getElementById('vnInfoAvatar');
        if (!avatar) return;

        const el = document.createElement('span');
        el.className = `vn-affinity-ornament ${cfg.ornament.cls}`;
        el.textContent = cfg.ornament.emoji;
        el.setAttribute('aria-hidden', 'true');
        avatar.appendChild(el);

        // Pequeño delay para que la transición de opacidad se vea
        requestAnimationFrame(() => {
            requestAnimationFrame(() => el.classList.add('visible'));
        });
    }

    // ── Partículas (canvas) ──────────────────────────────────────────
    function _stopParticles() {
        if (_particleAnim) {
            cancelAnimationFrame(_particleAnim);
            _particleAnim = null;
        }
        if (_canvas) {
            _canvas.remove();
            _canvas = null;
            _ctx = null;
        }
        _particles = [];
    }

    function _startParticles(rankName) {
        _stopParticles();

        const cfg = RANK_CONFIG[rankName];
        if (!cfg?.particles) return;

        _panelEl = document.getElementById('vnInfoCard');
        if (!_panelEl) return;

        // Crear contenedor + canvas si no existen
        let container = _panelEl.querySelector('.vn-affinity-particles');
        if (!container) {
            container = document.createElement('div');
            container.className = 'vn-affinity-particles';
            _panelEl.insertBefore(container, _panelEl.firstChild);
        }

        _canvas = document.createElement('canvas');
        container.appendChild(_canvas);
        _ctx = _canvas.getContext('2d');

        const { color, count, speed } = cfg.particles;

        // Inicializar partículas
        function _initParticles() {
            const w = _panelEl.offsetWidth  || 160;
            const h = _panelEl.offsetHeight || 80;
            _canvas.width  = w;
            _canvas.height = h;
            _particles = [];
            for (let i = 0; i < count; i++) {
                _particles.push({
                    x:     Math.random() * w,
                    y:     Math.random() * h,
                    r:     1 + Math.random() * 1.5,
                    alpha: 0.1 + Math.random() * 0.35,
                    vx:    (Math.random() - 0.5) * speed * 0.5,
                    vy:    -(speed * 0.4 + Math.random() * speed * 0.4),
                    life:  Math.random(),        // fase inicial aleatoria
                    lifeSpeed: 0.003 + Math.random() * 0.004,
                });
            }
        }

        _initParticles();

        // Redimensionar si el panel cambia
        const _ro = new ResizeObserver(() => _initParticles());
        _ro.observe(_panelEl);

        function _tick() {
            if (!_ctx || !_canvas) return;
            const w = _canvas.width;
            const h = _canvas.height;
            _ctx.clearRect(0, 0, w, h);

            _particles.forEach(p => {
                p.life += p.lifeSpeed;
                if (p.life > 1) {
                    // Reiniciar partícula desde abajo
                    p.life = 0;
                    p.x  = Math.random() * w;
                    p.y  = h + p.r;
                    p.vx = (Math.random() - 0.5) * speed * 0.5;
                    p.vy = -(speed * 0.4 + Math.random() * speed * 0.4);
                    p.r  = 1 + Math.random() * 1.5;
                }

                const fade = Math.sin(p.life * Math.PI); // 0→1→0
                p.x += p.vx;
                p.y += p.vy;

                _ctx.beginPath();
                _ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
                _ctx.fillStyle = `rgba(${color}, ${p.alpha * fade})`;
                _ctx.fill();
            });

            _particleAnim = requestAnimationFrame(_tick);
        }

        _particleAnim = requestAnimationFrame(_tick);
    }

    // ── API pública ──────────────────────────────────────────────────

    // Llamar cada vez que cambia el rango de afinidad o el personaje activo
    function update(rankName) {
        // Solo en modo clásico
        if (!document.body.classList.contains('mode-classic')) {
            clear();
            return;
        }

        if (rankName === _currentRank) return; // sin cambios
        _currentRank = rankName;

        _setBodyClass(rankName);
        _updateOrnament(rankName);
        _startParticles(rankName);
    }

    // Limpiar todos los efectos (al salir de una historia, cambiar de modo, etc.)
    function clear() {
        _currentRank = null;
        BODY_CLASSES.forEach(c => document.body.classList.remove(c));
        document.querySelectorAll('.vn-affinity-ornament').forEach(el => el.remove());
        _stopParticles();
        // Limpiar contenedor de partículas
        document.querySelectorAll('.vn-affinity-particles').forEach(el => el.remove());
    }

    return { update, clear };

})();

window.AffinityAtmosphere = AffinityAtmosphere;
