// ═══════════════════════════════════════════════════════════════════
// AFFINITY ATMOSPHERE — Modo Clásico
// Efectos visuales en el panel de personaje según rango de afinidad.
// - Temperatura del fondo del panel (clase en body)
// - Ornamento en el avatar (emoji animado)
// - Partículas sutiles dentro del panel (canvas)
// ═══════════════════════════════════════════════════════════════════

const AffinityAtmosphere = (function () {

    // Config derivada de la tabla canónica window.affinityRanks (state.js).
    // Única fuente de verdad: rangos, ramas, colores e iconos viven allí;
    // este módulo solo traduce (rango → rama + tier + color) a efectos.
    //
    // Clases aplicadas al body:
    //   affinity-branch-<branch>  (common|friendship|romance|negative|rivalry|enmity)
    //   affinity-tier-<n>         (posición 1-based del rango dentro de su rama)
    // Custom property en body: --affinity-rgb = color canónico del rango (r,g,b)

    const ORNAMENT_CLS = {
        common:     'ornament-common',
        friendship: 'ornament-friendship',
        romance:    'ornament-romance',
        negative:   'ornament-negative',
        rivalry:    'ornament-rivalry',
        enmity:     'ornament-enmity',
    };

    function _hexToRgb(hex) {
        const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex || '');
        return m ? `${parseInt(m[1],16)},${parseInt(m[2],16)},${parseInt(m[3],16)}` : '142,145,150';
    }

    // rango → { rank, branch, tier } o null si no está en la tabla
    function _rankInfo(rankName) {
        const table = window.affinityRanks;
        if (!Array.isArray(table)) return null;
        const rank = table.find(r => r.name === rankName);
        if (!rank) return null;
        const siblings = table.filter(r => r.branch === rank.branch);
        return { rank, branch: rank.branch, tier: siblings.indexOf(rank) + 1 };
    }

    // rango → config de efectos { bodyClasses, rgb, ornament, particles }
    function _configFor(rankName) {
        const info = _rankInfo(rankName);
        if (!info) return null;
        const { rank, branch, tier } = info;
        const rgb = _hexToRgb(rank.color);

        // Sin efectos en la base del tronco común (Desconocidos / Conocidos solo tinte)
        const hasEffects = !(branch === 'common' && tier < 3);

        return {
            bodyClasses: [`affinity-branch-${branch}`, `affinity-tier-${tier}`],
            rgb,
            ornament: hasEffects
                ? { emoji: rank.icon || '✦', cls: ORNAMENT_CLS[branch] || 'ornament-common' }
                : null,
            particles: hasEffects
                ? { color: rgb, count: 3 + tier * 3, speed: 0.22 + tier * 0.09 }
                : null,
        };
    }

    function _clearBodyState() {
        [...document.body.classList]
            .filter(c => c.startsWith('affinity-'))
            .forEach(c => document.body.classList.remove(c));
        document.body.style.removeProperty('--affinity-rgb');
    }

    let _currentRank   = null;
    let _particleAnim  = null;  // requestAnimationFrame id
    let _particles     = [];
    let _canvas        = null;
    let _ctx           = null;
    let _panelEl       = null;
    let _resizeObs     = null;

    // ── Clase de body + color canónico ───────────────────────────────
    function _setBodyClass(rankName) {
        _clearBodyState();
        const cfg = _configFor(rankName);
        if (!cfg) return;
        cfg.bodyClasses.forEach(c => document.body.classList.add(c));
        document.body.style.setProperty('--affinity-rgb', cfg.rgb);
    }

    // ── Ornamento del avatar ─────────────────────────────────────────
    function _updateOrnament(rankName) {
        // Eliminar ornamento anterior
        document.querySelectorAll('.vn-affinity-ornament').forEach(el => el.remove());

        const cfg = _configFor(rankName);
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
        if (_resizeObs) {
            _resizeObs.disconnect();
            _resizeObs = null;
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

        const cfg = _configFor(rankName);
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
        _resizeObs = new ResizeObserver(() => _initParticles());
        _resizeObs.observe(_panelEl);

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
        _clearBodyState();
        document.querySelectorAll('.vn-affinity-ornament').forEach(el => el.remove());
        _stopParticles();
        // Limpiar contenedor de partículas
        document.querySelectorAll('.vn-affinity-particles').forEach(el => el.remove());
    }

    return { update, clear };

})();

window.AffinityAtmosphere = AffinityAtmosphere;
