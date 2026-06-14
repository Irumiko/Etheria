// ═══════════════════════════════════════════════════════════════════
// VN Design Layer — Senda de la Palabra & Senda del Azar
//
// Inyecta los ornamentos puramente decorativos que requieren DOM o
// canvas animado: campo de estrellas (canvas), anillo zodiacal (SVG
// en modo clásico), ruta de expedición (SVG en modo RPG).
//
// Se auto-activa cuando se entra a #vnSection y limpia al salir.
// Respeta prefers-reduced-motion: sin animaciones ni canvas activo.
// ═══════════════════════════════════════════════════════════════════

(function () {
    'use strict';

    var _raf     = 0;
    var _stars   = [];
    var _canvas  = null;
    var _ctx     = null;
    var _running = false;
    var _mode    = null; // 'classic' | 'rpg' | null
    var _resizeHandler = null;

    var REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    // ── Helpers ─────────────────────────────────────────────────────

    function _isClassic() { return document.body.classList.contains('mode-classic'); }
    function _isRpg()     { return document.body.classList.contains('mode-rpg'); }

    // ── Star field canvas ───────────────────────────────────────────

    function _initCanvas(section) {
        _canvas = document.getElementById('vnStarCanvas');
        if (!_canvas) {
            _canvas = document.createElement('canvas');
            _canvas.id = 'vnStarCanvas';
            _canvas.setAttribute('aria-hidden', 'true');
            section.insertBefore(_canvas, section.firstChild);
        }
        _ctx = _canvas.getContext('2d');
        _setupStars();
    }

    function _setupStars() {
        var DPR  = Math.min(window.devicePixelRatio || 1, 2);
        var warm = _isRpg();
        var w = _canvas.clientWidth;
        var h = _canvas.clientHeight;
        _canvas.width  = Math.max(1, w * DPR);
        _canvas.height = Math.max(1, h * DPR);
        if (_ctx) _ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
        var n = Math.min(240, Math.round((w * h) / 8200));
        _stars = [];
        for (var i = 0; i < n; i++) {
            var r = Math.random();
            var hue = r < 0.16 ? 'c' : r < 0.30 ? 'b' : 'a';
            _stars.push({
                x:    Math.random() * w,
                y:    Math.random() * h,
                r:    Math.random() * 1.2 + 0.25,
                base: Math.random() * 0.4 + 0.28,
                amp:  Math.random() * 0.5 + 0.1,
                sp:   Math.random() * 0.0015 + 0.0004,
                ph:   Math.random() * 6.28,
                hue:  hue,
                warm: warm,
            });
        }
    }

    function _palRgb(s) {
        var warm = s.warm;
        if (s.hue === 'c') return warm ? '230,150,90'  : '150,170,240';
        if (s.hue === 'b') return warm ? '240,200,150' : '206,188,250';
        return                     warm ? '255,238,205' : '250,248,255';
    }

    function _drawStars(t) {
        if (!_ctx || !_canvas) return;
        var w = _canvas.width  / (window.devicePixelRatio || 1);
        var h = _canvas.height / (window.devicePixelRatio || 1);
        _ctx.clearRect(0, 0, w, h);
        for (var i = 0; i < _stars.length; i++) {
            var s = _stars[i];
            var a = REDUCED
                ? s.base + 0.12
                : s.base + Math.sin(t * s.sp + s.ph) * s.amp;
            a = Math.max(0, Math.min(1, a));
            var rgb = _palRgb(s);
            _ctx.beginPath();
            _ctx.arc(s.x, s.y, s.r, 0, 6.2832);
            _ctx.fillStyle   = 'rgba(' + rgb + ',' + a + ')';
            _ctx.shadowBlur  = s.r * 3.5;
            _ctx.shadowColor = 'rgba(' + rgb + ',' + (a * 0.7) + ')';
            _ctx.fill();
        }
        _ctx.shadowBlur = 0;
    }

    function _loop(t) {
        if (!_running) return;
        _drawStars(t);
        if (!REDUCED) _raf = requestAnimationFrame(_loop);
    }

    // ── Zodiac ring (classic) ───────────────────────────────────────

    function _injectZodiacRing(section) {
        if (document.getElementById('vnZodiacRing')) return;
        var accent = '#c1a8ec';
        var ns = 'http://www.w3.org/2000/svg';
        var svg = document.createElementNS(ns, 'svg');
        svg.id = 'vnZodiacRing';
        svg.setAttribute('viewBox', '0 0 660 660');
        svg.setAttribute('aria-hidden', 'true');

        // outer ring
        var c1 = document.createElementNS(ns, 'circle');
        c1.setAttribute('cx', '330'); c1.setAttribute('cy', '330'); c1.setAttribute('r', '318');
        c1.setAttribute('fill', 'none'); c1.setAttribute('stroke', accent);
        c1.setAttribute('stroke-width', '0.7'); c1.setAttribute('opacity', '0.45');
        svg.appendChild(c1);

        // dashed inner ring
        var c2 = document.createElementNS(ns, 'circle');
        c2.setAttribute('cx', '330'); c2.setAttribute('cy', '330'); c2.setAttribute('r', '300');
        c2.setAttribute('fill', 'none'); c2.setAttribute('stroke', accent);
        c2.setAttribute('stroke-width', '0.5'); c2.setAttribute('stroke-dasharray', '1 10');
        c2.setAttribute('opacity', '0.6');
        svg.appendChild(c2);

        // 12 star markers
        var R = 309;
        for (var i = 0; i < 12; i++) {
            var ang = (i * 30 - 90) * Math.PI / 180;
            var cx = 330 + Math.cos(ang) * R;
            var cy = 330 + Math.sin(ang) * R;
            var dot = document.createElementNS(ns, 'circle');
            dot.setAttribute('cx', cx.toFixed(2));
            dot.setAttribute('cy', cy.toFixed(2));
            dot.setAttribute('r', i % 3 === 0 ? '2.4' : '1.4');
            dot.setAttribute('fill', i % 3 === 0 ? '#fdf8ff' : accent);
            dot.setAttribute('opacity', '0.9');
            svg.appendChild(dot);
        }

        section.appendChild(svg);
    }

    // Soft moon glow element
    function _injectMoonGlow(section) {
        if (document.getElementById('vnMoonGlow')) return;
        var div = document.createElement('div');
        div.id = 'vnMoonGlow';
        div.setAttribute('aria-hidden', 'true');
        div.style.cssText = [
            'position:absolute',
            'left:50%', 'top:0',
            'transform:translateX(-50%)',
            'width:150px', 'height:150px',
            'border-radius:50%',
            'background:radial-gradient(circle at 42% 38%, rgba(245,242,255,0.9), rgba(206,196,255,0.4) 52%, transparent 72%)',
            'filter:blur(2px)',
            'pointer-events:none',
            'z-index:2',
        ].join(';');
        section.appendChild(div);
    }

    // ── Expedition route hint (RPG) ─────────────────────────────────

    function _injectRouteHint(section) {
        if (document.getElementById('vnRouteHint')) return;
        var ns = 'http://www.w3.org/2000/svg';
        var svg = document.createElementNS(ns, 'svg');
        svg.id = 'vnRouteHint';
        svg.setAttribute('viewBox', '0 0 1600 900');
        svg.setAttribute('preserveAspectRatio', 'none');
        svg.setAttribute('aria-hidden', 'true');

        var color = '#e3a24f';
        var path  = document.createElementNS(ns, 'path');
        path.setAttribute('d', 'M150 210 C 480 150, 760 300, 1050 230 S 1480 180, 1520 250');
        path.setAttribute('fill', 'none');
        path.setAttribute('stroke', color);
        path.setAttribute('stroke-width', '1.5');
        path.setAttribute('stroke-dasharray', '2 10');
        path.setAttribute('stroke-linecap', 'round');
        svg.appendChild(path);

        [[150,210],[1050,230],[1520,250]].forEach(function(pt) {
            var c = document.createElementNS(ns, 'circle');
            c.setAttribute('cx', pt[0]); c.setAttribute('cy', pt[1]); c.setAttribute('r', '3.5');
            c.setAttribute('fill', 'none'); c.setAttribute('stroke', color); c.setAttribute('stroke-width', '1.5');
            svg.appendChild(c);
        });

        section.appendChild(svg);
    }

    // ── "Continuar" button injection (classic mode only) ────────────
    // Adds a primary CTA next to pagination if not already present.

    function _injectContinueBtn(section) {
        if (document.getElementById('vnContinueReplyBtn')) return;
        var counterWrap = section.querySelector('.vn-counter-dice-wrap');
        if (!counterWrap) return;

        var btn = document.createElement('button');
        btn.id = 'vnContinueReplyBtn';
        btn.type = 'button';
        btn.setAttribute('aria-label', 'Continuar / Responder');
        btn.setAttribute('title', 'Continuar / Responder');
        btn.onclick = function () {
            if (typeof openReplyPanel === 'function') openReplyPanel();
        };
        btn.innerHTML =
            'Continuar ' +
            '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
            '<path d="M5 12 H19 M14 7 L19 12 L14 17"/></svg>';

        var actionsRight = section.querySelector('.vn-dialogue-actions-right');
        if (actionsRight) {
            actionsRight.style.display = '';
            actionsRight.appendChild(btn);
        } else {
            counterWrap.parentNode.insertBefore(btn, counterWrap.nextSibling);
        }
    }

    // ── Lifecycle ───────────────────────────────────────────────────

    function _start() {
        var section = document.getElementById('vnSection');
        if (!section) return;

        var classic = _isClassic();
        var rpg     = _isRpg();
        if (!classic && !rpg) return;

        _mode    = classic ? 'classic' : 'rpg';
        _running = true;

        // Star canvas
        if (!REDUCED) {
            _initCanvas(section);
            _raf = requestAnimationFrame(_loop);
        }

        // Ornaments
        if (classic) {
            _injectMoonGlow(section);
            if (!REDUCED) _injectZodiacRing(section);
            // _injectContinueBtn: eliminado per diseño v2 (prototipo no lo incluye)
        } else if (rpg) {
            _injectRouteHint(section);
        }

        // Resize
        _resizeHandler = function () {
            if (_canvas && _running) _setupStars();
        };
        window.addEventListener('resize', _resizeHandler);
    }

    function _stop() {
        _running = false;
        cancelAnimationFrame(_raf);
        if (_resizeHandler) {
            window.removeEventListener('resize', _resizeHandler);
            _resizeHandler = null;
        }
        // Remove injected elements
        ['vnStarCanvas','vnZodiacRing','vnMoonGlow','vnRouteHint'].forEach(function(id) {
            var el = document.getElementById(id);
            if (el && el.parentNode) el.parentNode.removeChild(el);
        });
        _canvas = null; _ctx = null; _stars = []; _mode = null;
    }

    // ── Event listeners ─────────────────────────────────────────────

    // Listen to Etheria's own topic-enter / topic-leave events
    window.addEventListener('etheria:topic-enter', function () {
        _stop(); // clean previous
        // Small delay to let mode class settle
        setTimeout(_start, 100);
    });

    window.addEventListener('etheria:topic-leave', function () {
        _stop();
    });

    // Fallback: observe body class changes (mode-classic / mode-rpg)
    (function () {
        if (!window.MutationObserver) return;
        var prev = '';
        var obs  = new MutationObserver(function () {
            var now = document.body.className;
            if (now === prev) return;
            prev = now;
            var inVn = !!document.querySelector('#vnSection.active, #vnSection.vn-section.active');
            if (!inVn) return;
            if (_mode !== null) _stop();
            setTimeout(_start, 80);
        });
        obs.observe(document.body, { attributes: true, attributeFilter: ['class'] });
    }());

    window.VnDesign = { start: _start, stop: _stop };

}());

// ═══════════════════════════════════════════════════════════════════
// Perfil desplegable desde el party
// Clic en el nombre de un miembro → abre/cierra ficha anclada.
// Implementado con event delegation (no modifica vn.js ni userProfile.js).
// ═══════════════════════════════════════════════════════════════════

(function () {
    'use strict';

    var _activePanel = null;  // { charId, el }

    function _esc(s) {
        return String(s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;')
            .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    function _isRpg() { return document.body.classList.contains('mode-rpg'); }

    function _getChar(charId) {
        var chars = (window.appData && window.appData.characters) || [];
        return chars.find(function (c) { return String(c.id) === String(charId); }) || null;
    }

    function _getProfile(char) {
        if (!char || typeof ensureCharacterRpgProfile !== 'function') return null;
        return ensureCharacterRpgProfile(char, window.currentTopicId || null);
    }

    function _isOwn(char) {
        if (!char) return false;
        return char.userIndex === window.currentUserIndex;
    }

    function _hpBar(cur, max, cls) {
        var pct = max > 0 ? Math.max(0, Math.min(100, (cur / max) * 100)) : 0;
        return '<div class="vmpf-bar-row">' +
            '<span class="vmpf-bar-label">' + cls.toUpperCase() + '</span>' +
            '<span class="vmpf-bar-track"><span class="vmpf-bar-fill' + (cls === 'exp' ? ' exp' : '') + '" style="width:' + pct + '%"></span></span>' +
            '<span class="vmpf-bar-val">' + cur + '/' + max + '</span>' +
        '</div>';
    }

    function _buildPanel(char, profile, anchorEl) {
        var isOwn = _isOwn(char);
        var rpg   = _isRpg();

        var stats = '';
        if (rpg && profile) {
            var s = profile.stats || {};
            var labels = ['STR','DEX','CON','INT','WIS','CHA'];
            var keys   = ['str','dex','con','int','wis','cha'];
            stats = '<div class="vmpf-stats">' +
                keys.map(function (k, i) {
                    return '<div class="vmpf-stat">' +
                        '<span class="vmpf-stat-label">' + labels[i] + '</span>' +
                        '<span class="vmpf-stat-val">' + (s[k] !== undefined ? s[k] : '—') + '</span>' +
                    '</div>';
                }).join('') +
            '</div>';
        }

        var bars = '';
        if (rpg && profile) {
            bars = _hpBar(profile.hp || 0, profile.hpMax || 0, 'hp') +
                   _hpBar(profile.exp || 0, profile.expMax || 0, 'exp');
        }

        var editBtn = (rpg && isOwn)
            ? '<button type="button" class="vmpf-edit-btn" onclick="' +
              (typeof openCurrentVnCharacterSheet === 'function'
                  ? 'openCurrentVnCharacterSheet()'
                  : 'openSheet && openSheet(\'' + _esc(char.id) + '\')') +
              '; window._closeVnMemberProfile && window._closeVnMemberProfile();" >' +
              'Editar ficha</button>'
            : '';

        var glyph = char.gender === 'female' ? '♀' : char.gender === 'male' ? '♂' : '';
        var meta  = rpg && profile
            ? _esc((profile.className || char.class_name || '')) + (profile.level ? ' · Nv.' + profile.level : '')
            : (glyph || '');

        var panel = document.createElement('div');
        panel.className = 'vn-member-profile ' + (rpg ? 'vn-member-profile--rpg' : 'vn-member-profile--classic');
        panel.setAttribute('role', 'dialog');
        panel.setAttribute('aria-modal', 'true');
        panel.setAttribute('data-vmpf-char', String(char.id));

        var avatarText = char.avatar_emoji || char.avatar || (char.name ? char.name[0] : '?');
        panel.innerHTML =
            '<div class="vmpf-header">' +
                '<span class="vmpf-avatar" aria-hidden="true">' + _esc(avatarText) + '</span>' +
                '<div class="vmpf-header-info">' +
                    '<span class="vmpf-name">' + _esc(char.name || '?') + '</span>' +
                    (meta ? '<span class="vmpf-meta">' + meta + '</span>' : '') +
                '</div>' +
            '</div>' +
            (bars ? '<div class="vmpf-bars">' + bars + '</div>' : '') +
            stats +
            editBtn;

        // anchor below the row
        var rect = anchorEl.getBoundingClientRect();
        var vnRect = (document.getElementById('vnSection') || document.body).getBoundingClientRect();
        panel.style.position = 'absolute';
        panel.style.top  = (rect.bottom - vnRect.top + 6) + 'px';
        panel.style.left = Math.max(4, rect.left - vnRect.left) + 'px';
        panel.style.zIndex = '99';

        return panel;
    }

    function _closePanel() {
        if (_activePanel) {
            if (_activePanel.el && _activePanel.el.parentNode) {
                _activePanel.el.parentNode.removeChild(_activePanel.el);
            }
            _activePanel = null;
        }
    }
    window._closeVnMemberProfile = _closePanel;

    window.toggleVnMemberProfile = function (charId, anchorEl) {
        if (_activePanel && String(_activePanel.charId) === String(charId)) {
            _closePanel();
            return;
        }
        _closePanel();

        var char = _getChar(charId);
        if (!char) return;
        var profile = _getProfile(char);

        var vnSection = document.getElementById('vnSection');
        if (!vnSection) return;

        var panel = _buildPanel(char, profile, anchorEl);
        vnSection.appendChild(panel);
        _activePanel = { charId: String(charId), el: panel };

        // Close on outside click or Esc
        setTimeout(function () {
            document.addEventListener('click', _onOutside, true);
            document.addEventListener('keydown', _onEsc, true);
        }, 0);
    };

    function _onOutside(e) {
        if (_activePanel && !_activePanel.el.contains(e.target)) {
            _closePanel();
            document.removeEventListener('click', _onOutside, true);
            document.removeEventListener('keydown', _onEsc, true);
        }
    }

    function _onEsc(e) {
        if (e.key === 'Escape' && _activePanel) {
            _closePanel();
            document.removeEventListener('click', _onOutside, true);
            document.removeEventListener('keydown', _onEsc, true);
        }
    }

    // ── Event delegation — party RPG (.vn-party-name) y clásico (.cp-name) ──
    document.addEventListener('click', function (e) {
        var nameEl = e.target.closest('.vn-party-name, .cp-name');
        if (!nameEl) return;

        var memberEl = nameEl.closest('[data-char-id], .cp-member[onclick]');
        var charId   = memberEl && memberEl.dataset.charId;

        // Para clásico: extraer charId desde el onclick via currentStoryParticipants
        if (!charId && nameEl.closest('.cp-member')) {
            // En clásico no tenemos charId directo; usamos el nombre para buscar
            var nameText = nameEl.textContent.trim();
            var chars    = (window.appData && window.appData.characters) || [];
            var found    = chars.find(function (c) { return c.name === nameText; });
            if (found) charId = found.id;
        }

        if (!charId) return;
        e.stopPropagation();
        window.toggleVnMemberProfile(charId, memberEl || nameEl);
    }, true);

    // ── Hacer nombres clicables vía CSS pointer (ya cubierto por el delegation) ──
    // Inyectamos el style solo una vez para que .vn-party-name y .cp-name muestren cursor pointer.
    (function () {
        if (document.getElementById('_vmpf-style')) return;
        var s = document.createElement('style');
        s.id  = '_vmpf-style';
        s.textContent = [
            '.vn-party-name, .cp-name { cursor: pointer; }',
            '.vn-party-name:hover { opacity: .8; }',
            '.cp-name:hover { opacity: .8; }',
        ].join('\n');
        document.head.appendChild(s);
    }());

}());
