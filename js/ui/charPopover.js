// ═══════════════════════════════════════════════════════════════════
// CHAR POPOVER — Tarjeta visual de personaje para el party panel
//
// Muestra información básica del personaje al pulsar su tarjeta.
// Puramente visual — sin botones de acción ni editores.
//
// Modo clásico: nombre, raza/género, afinidad unidireccional (solo
//   cómo ve TU personaje al otro, nunca al revés).
// Modo RPG: nombre, raza/género, stats compactos, HP/EXP minibarras.
//
// Arquitectura:
//   - Comunica con el sistema de afinidad solo vía appData (lectura)
//   - No importa nada de classic/ ni rpg/ directamente
//   - Se cierra al pulsar fuera, con Escape, o al abrir otro popover
//   - El DOM del popover se crea una vez y se reutiliza (singleton)
// ═══════════════════════════════════════════════════════════════════

const CharPopover = (function () {

    let _popoverEl  = null;
    let _currentCharId = null;
    let _closeOnClick  = null;

    // ── Helpers ──────────────────────────────────────────────────────────────

    function _esc(s) {
        return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    }

    function _isRpg() {
        const topic = typeof getCurrentTopic === 'function' ? getCurrentTopic() : null;
        return !!(topic?.mode === 'rpg' || document.body.classList.contains('theme-rpg'));
    }

    function _getChar(charId) {
        return (window.appData?.characters || []).find(c => String(c.id) === String(charId)) || null;
    }

    function _getMyCharId() {
        return window.selectedCharId ? String(window.selectedCharId) : null;
    }

    function _getAffinityData(fromCharId, toCharId) {
        if (!fromCharId || !toCharId || fromCharId === toCharId) return null;
        const topicId = window.currentTopicId;
        if (!topicId) return null;

        const key      = `${fromCharId}_${toCharId}`;
        const value    = Number(window.appData?.affinities?.[topicId]?.[key]) || 0;
        const relType  = window.appData?.affinityTypes?.[topicId]?.[key] || 'undefined';

        // Usar reciprocidad si está disponible
        const reverseKey   = `${toCharId}_${fromCharId}`;
        const otherValue   = Number(window.appData?.affinities?.[topicId]?.[reverseKey]) || 0;
        const otherRelType = window.appData?.affinityTypes?.[topicId]?.[reverseKey] || 'undefined';

        const rankFn = typeof getAffinityRankInfoWithReciprocity === 'function'
            ? getAffinityRankInfoWithReciprocity
            : getAffinityRankInfo;

        const rank = rankFn(value, relType, otherValue, otherRelType);

        return { value, relType, rank };
    }

    function _getRpgStats(charId) {
        if (typeof RPGState === 'undefined') return null;
        try {
            const snapshot = RPGState.getSnapshot ? RPGState.getSnapshot(charId) : null;
            return snapshot;
        } catch { return null; }
    }

    // ── Render ───────────────────────────────────────────────────────────────

    function _buildContent(charId) {
        const char    = _getChar(charId);
        if (!char) return '<p class="cp-popover-empty">Personaje no encontrado</p>';

        const isRpg   = _isRpg();
        const myId    = _getMyCharId();
        const isMe    = myId === String(charId);

        // ── Cabecera: avatar + nombre ──────────────────────────────
        const fullName = [char.name, char.lastName].filter(Boolean).join(' ');
        const initial  = (char.name || '?')[0].toUpperCase();
        const avatarSrc = char.avatar || char.sprite || '';

        const avatarHtml = avatarSrc
            ? `<img class="cp-popover-avatar" src="${_esc(avatarSrc)}" alt="${_esc(fullName)}"
                     onerror="this.parentElement.innerHTML='<span class=\\'cp-popover-initial\\'>${_esc(initial)}</span>'">`
            : `<span class="cp-popover-initial" style="--char-color:${_esc(char.color || '#9b59b6')}">${_esc(initial)}</span>`;

        // ── Subtítulo: raza + género ───────────────────────────────
        const sub = [char.race, char.gender].filter(Boolean).join(' · ');

        // ── Cuerpo según modo ──────────────────────────────────────
        let bodyHtml = '';

        if (isRpg) {
            // Stats compactos
            const stats = char.stats || {};
            const RPG_LABELS = window.RPG_STAT_LABELS || {
                STR: 'FUE', DEX: 'DES', CON: 'CON', INT: 'INT'
            };
            const statRows = Object.entries(RPG_LABELS).map(([key, label]) => {
                const val = stats[key] || 8;
                return `<div class="cp-popover-stat">
                    <span class="cp-popover-stat-label">${_esc(label)}</span>
                    <span class="cp-popover-stat-val">${val}</span>
                </div>`;
            }).join('');

            // HP y EXP minibarras
            const hp     = Number(char.hp     || stats.hp     || 0);
            const maxHp  = Number(char.maxHp  || stats.maxHp  || 20);
            const exp    = Number(char.exp     || stats.exp    || 0);
            const maxExp = Number(char.maxExp  || stats.maxExp || 100);
            const hpPct  = Math.round(Math.min(100, Math.max(0, (hp  / (maxHp  || 1)) * 100)));
            const expPct = Math.round(Math.min(100, Math.max(0, (exp / (maxExp || 1)) * 100)));
            const level  = char.level || stats.level || 1;

            bodyHtml = `
                <div class="cp-popover-stats">${statRows}</div>
                <div class="cp-popover-bars">
                    <div class="cp-popover-bar-row">
                        <span class="cp-popover-bar-label">HP</span>
                        <div class="cp-popover-bar">
                            <div class="cp-popover-bar-fill cp-popover-bar-hp" style="width:${hpPct}%"></div>
                        </div>
                        <span class="cp-popover-bar-val">${hp}/${maxHp}</span>
                    </div>
                    <div class="cp-popover-bar-row">
                        <span class="cp-popover-bar-label">EXP</span>
                        <div class="cp-popover-bar">
                            <div class="cp-popover-bar-fill cp-popover-bar-exp" style="width:${expPct}%"></div>
                        </div>
                        <span class="cp-popover-bar-val">Nv.${level}</span>
                    </div>
                </div>`;

        } else {
            // Afinidad unidireccional: cómo ve MI personaje a ESTE personaje
            if (!isMe && myId) {
                const aff = _getAffinityData(myId, String(charId));
                if (aff && aff.rank) {
                    const icon  = aff.rank.icon  || '';
                    const rname = aff.rank.name   || '';
                    const color = aff.rank.color  || '#9b59b6';
                    const needsRecip = aff.rank.requiresReciprocity;
                    const isUnilateralCap = aff.rank.unilateralCap;

                    // Indicador sutil si estamos en el techo unilateral
                    const capHint = isUnilateralCap
                        ? `<span class="cp-popover-aff-hint">Sin reciprocidad</span>`
                        : '';

                    bodyHtml = `
                        <div class="cp-popover-affinity" style="--aff-color:${_esc(color)}">
                            <span class="cp-popover-aff-icon">${_esc(icon)}</span>
                            <div class="cp-popover-aff-info">
                                <span class="cp-popover-aff-name">${_esc(rname)}</span>
                                ${capHint}
                            </div>
                        </div>`;
                } else {
                    bodyHtml = `<div class="cp-popover-affinity cp-popover-aff-unknown">
                        <span class="cp-popover-aff-icon">○</span>
                        <span class="cp-popover-aff-name">Desconocidos</span>
                    </div>`;
                }
            } else if (isMe) {
                bodyHtml = `<p class="cp-popover-me">Tu personaje</p>`;
            }
        }

        return `
            <div class="cp-popover-header">
                <div class="cp-popover-avatar-wrap">${avatarHtml}</div>
                <div class="cp-popover-meta">
                    <span class="cp-popover-name">${_esc(fullName)}</span>
                    ${sub ? `<span class="cp-popover-sub">${_esc(sub)}</span>` : ''}
                    ${char.age ? `<span class="cp-popover-sub">${_esc(String(char.age))} años</span>` : ''}
                </div>
            </div>
            ${bodyHtml ? `<div class="cp-popover-body">${bodyHtml}</div>` : ''}
        `;
    }

    // ── DOM singleton ─────────────────────────────────────────────────────────

    function _getOrCreatePopover() {
        if (_popoverEl) return _popoverEl;

        _popoverEl = document.createElement('div');
        _popoverEl.id = 'charPopover';
        _popoverEl.className = 'cp-popover hidden';
        _popoverEl.setAttribute('role', 'tooltip');
        document.getElementById('vnSection')?.appendChild(_popoverEl);

        // Cerrar con Escape
        document.addEventListener('keydown', function (e) {
            if (e.key === 'Escape') close();
        });

        return _popoverEl;
    }

    // ── API pública ───────────────────────────────────────────────────────────

    function open(charId, anchorEl) {
        if (!charId) return;

        const popover = _getOrCreatePopover();
        _currentCharId = String(charId);

        // Rellenar contenido
        popover.innerHTML = _buildContent(charId);
        popover.classList.remove('hidden');

        // Posicionar anclado al elemento pulsado
        _position(popover, anchorEl);

        // Cerrar al hacer clic fuera
        if (_closeOnClick) document.removeEventListener('click', _closeOnClick);
        _closeOnClick = function (e) {
            if (!popover.contains(e.target) && e.target !== anchorEl) {
                close();
            }
        };
        setTimeout(() => document.addEventListener('click', _closeOnClick), 0);
    }

    function close() {
        if (_popoverEl) _popoverEl.classList.add('hidden');
        if (_closeOnClick) {
            document.removeEventListener('click', _closeOnClick);
            _closeOnClick = null;
        }
        _currentCharId = null;
    }

    function toggle(charId, anchorEl) {
        if (_currentCharId === String(charId) && !_popoverEl?.classList.contains('hidden')) {
            close();
        } else {
            open(charId, anchorEl);
        }
    }

    function _position(popover, anchor) {
        if (!anchor) return;
        const rect    = anchor.getBoundingClientRect();
        const vnRect  = document.getElementById('vnSection')?.getBoundingClientRect() || { left: 0, top: 0 };
        const popW    = 220;
        const margin  = 8;

        // Intentar a la derecha del anchor; si no cabe, a la izquierda
        let left = rect.right - vnRect.left + margin;
        if (left + popW > (vnRect.width || window.innerWidth)) {
            left = rect.left - vnRect.left - popW - margin;
        }
        // Alinear verticalmente con el centro del anchor
        let top = rect.top - vnRect.top + rect.height / 2;
        // Clampar para que no salga por arriba/abajo
        top = Math.max(8, Math.min(top, (vnRect.height || window.innerHeight) - 200));

        popover.style.left = `${Math.round(left)}px`;
        popover.style.top  = `${Math.round(top)}px`;
    }

    // ── Init: escuchar el EventBus para refresco al cambiar afinidad ──────────
    (function _init() {
        if (typeof eventBus === 'undefined') return;
        eventBus.on('affinity:changed', function () {
            // Si el popover está abierto, refrescar el contenido
            if (_currentCharId && _popoverEl && !_popoverEl.classList.contains('hidden')) {
                _popoverEl.innerHTML = _buildContent(_currentCharId);
            }
        });
        eventBus.on('cycle:branch-chosen', function () {
            if (_currentCharId && _popoverEl && !_popoverEl.classList.contains('hidden')) {
                _popoverEl.innerHTML = _buildContent(_currentCharId);
            }
        });
    })();

    return { open, close, toggle };

})();

window.CharPopover = CharPopover;

