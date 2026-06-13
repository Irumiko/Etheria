// ═══════════════════════════════════════════════════════════════════
// TOASTS — Sistema de notificaciones reutilizable de Etheria
//
// API pública (window.Toasts):
//   show({ type, title, body, duration })
//     type: 'info' | 'success' | 'warning' | 'error'
//     duration: ms, omitir para sticky (cierra con click)
//
//   showCycleEchos({ changes, onDismiss })
//     changes: [{ charName, charAvatar, direction: 'up'|'down' }]
//     onDismiss: función llamada al cerrar
// ═══════════════════════════════════════════════════════════════════

const Toasts = (function () {

    // ── Estilos inyectados una sola vez ───────────────────────────────

    let _stylesInjected = false;

    function _injectStyles() {
        if (_stylesInjected) return;
        _stylesInjected = true;

        const css = `
/* ── Toasts base ─────────────────────────────────────── */
.eth-toast {
    position: fixed;
    z-index: 9800;
    bottom: 2rem;
    left: 50%;
    transform: translateX(-50%) translateY(calc(100% + 2rem));
    max-width: min(480px, calc(100vw - 2rem));
    width: 100%;
    background: rgba(12, 9, 18, 0.97);
    border: 1px solid var(--accent-gold, #c9a86c);
    border-radius: 4px;
    box-shadow:
        0 0 0 1px rgba(201, 168, 108, 0.12),
        0 8px 40px rgba(0, 0, 0, 0.7),
        0 0 24px rgba(201, 168, 108, 0.08);
    padding: 1.25rem 1.5rem 1.1rem;
    font-family: var(--font-body, 'Crimson Text', Georgia, serif);
    color: var(--text-primary, #e8dcc8);
    cursor: pointer;
    transition: transform 0.38s cubic-bezier(0.22, 1, 0.36, 1),
                opacity  0.38s ease;
    opacity: 0;
    pointer-events: none;
    user-select: none;
}
.eth-toast.eth-toast--visible {
    transform: translateX(-50%) translateY(0);
    opacity: 1;
    pointer-events: auto;
}
.eth-toast.eth-toast--leaving {
    transform: translateX(-50%) translateY(calc(100% + 2rem));
    opacity: 0;
    pointer-events: none;
}

/* ── Toast genérico ──────────────────────────────────── */
.eth-toast__title {
    font-family: var(--font-display, 'Cinzel', serif);
    font-size: 0.8rem;
    font-weight: 600;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--accent-gold, #c9a86c);
    margin-bottom: 0.35rem;
}
.eth-toast__body {
    font-size: 0.95rem;
    line-height: 1.45;
    opacity: 0.88;
}
.eth-toast--error   .eth-toast__title { color: #c07070; }
.eth-toast--warning .eth-toast__title { color: #c0a040; }
.eth-toast--success .eth-toast__title { color: #70a870; }

/* ── Ecos del ciclo ──────────────────────────────────── */
.eth-toast--echos {
    padding: 1.4rem 1.6rem 1.3rem;
}
.eth-toast__echos-header {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    margin-bottom: 0.9rem;
    border-bottom: 1px solid rgba(201, 168, 108, 0.18);
    padding-bottom: 0.75rem;
}
.eth-toast__echos-icon {
    font-size: 1.1rem;
    opacity: 0.75;
}
.eth-toast__echos-titles {
    flex: 1;
}
.eth-toast__echos-title {
    font-family: var(--font-display, 'Cinzel', serif);
    font-size: 0.78rem;
    font-weight: 600;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--accent-gold, #c9a86c);
    line-height: 1.2;
}
.eth-toast__echos-subtitle {
    font-size: 0.8rem;
    opacity: 0.5;
    margin-top: 0.15rem;
    font-style: italic;
}
.eth-toast__echos-list {
    display: flex;
    flex-direction: column;
    gap: 0.55rem;
    margin-bottom: 1rem;
}
.eth-toast__echos-entry {
    display: flex;
    align-items: center;
    gap: 0.75rem;
}
.eth-toast__echos-avatar {
    width: 2rem;
    height: 2rem;
    border-radius: 50%;
    border: 1px solid rgba(201, 168, 108, 0.3);
    object-fit: cover;
    flex-shrink: 0;
    background: rgba(201, 168, 108, 0.08);
}
.eth-toast__echos-initial {
    width: 2rem;
    height: 2rem;
    border-radius: 50%;
    border: 1px solid rgba(201, 168, 108, 0.3);
    flex-shrink: 0;
    background: rgba(201, 168, 108, 0.08);
    display: flex;
    align-items: center;
    justify-content: center;
    font-family: var(--font-display, 'Cinzel', serif);
    font-size: 0.75rem;
    color: var(--accent-gold, #c9a86c);
}
.eth-toast__echos-name {
    flex: 1;
    font-size: 0.95rem;
    font-weight: 500;
}
.eth-toast__echos-arrow {
    font-size: 1.1rem;
    font-weight: 700;
    flex-shrink: 0;
    line-height: 1;
}
.eth-toast__echos-arrow--up   { color: #c9a86c; }
.eth-toast__echos-arrow--down { color: #8a5050; }
.eth-toast__echos-hint {
    text-align: center;
    font-size: 0.72rem;
    letter-spacing: 0.08em;
    opacity: 0.35;
    text-transform: uppercase;
    font-family: var(--font-display, 'Cinzel', serif);
}

/* Ornamento Art Deco superior */
.eth-toast--echos::before {
    content: '';
    display: block;
    height: 2px;
    background: linear-gradient(
        90deg,
        transparent,
        rgba(201, 168, 108, 0.6) 30%,
        rgba(201, 168, 108, 0.9) 50%,
        rgba(201, 168, 108, 0.6) 70%,
        transparent
    );
    margin: -1.4rem -1.6rem 1.2rem;
    border-radius: 4px 4px 0 0;
}
        `;

        const style = document.createElement('style');
        style.id = 'eth-toasts-styles';
        style.textContent = css;
        document.head.appendChild(style);
    }

    // ── Helpers DOM ───────────────────────────────────────────────────

    function _create(extraClass) {
        _injectStyles();
        const el = document.createElement('div');
        el.className = 'eth-toast' + (extraClass ? ' ' + extraClass : '');
        document.body.appendChild(el);
        return el;
    }

    function _show(el) {
        // Forzar reflow antes de añadir la clase visible
        void el.offsetWidth;
        el.classList.add('eth-toast--visible');
    }

    function _dismiss(el, onDismiss) {
        el.classList.remove('eth-toast--visible');
        el.classList.add('eth-toast--leaving');
        setTimeout(function () {
            if (el.parentNode) el.parentNode.removeChild(el);
            if (typeof onDismiss === 'function') onDismiss();
        }, 420);
    }

    // ── show — toast genérico ─────────────────────────────────────────

    function show(config) {
        const { type = 'info', title, body, duration, onDismiss } = config || {};

        const el = _create('eth-toast--' + type);
        el.innerHTML = (title ? `<div class="eth-toast__title">${_esc(title)}</div>` : '') +
                       (body  ? `<div class="eth-toast__body">${_esc(body)}</div>`   : '');

        const close = function () { _dismiss(el, onDismiss); };

        if (duration) {
            setTimeout(close, duration);
        } else {
            el.addEventListener('click', close, { once: true });
        }

        _show(el);
        return el;
    }

    // ── showCycleEchos — panel "Ecos del Ciclo" ───────────────────────

    function showCycleEchos(config) {
        const { changes = [], onDismiss } = config || {};
        if (changes.length === 0) return null;

        const el = _create('eth-toast--echos');

        const entriesHtml = changes.map(function (c) {
            const avatarHtml = c.charAvatar
                ? `<img class="eth-toast__echos-avatar" src="${_esc(c.charAvatar)}" alt="${_esc(c.charName)}" loading="lazy">`
                : `<div class="eth-toast__echos-initial">${_esc((c.charName || '?')[0].toUpperCase())}</div>`;

            const arrowClass = c.direction === 'up'
                ? 'eth-toast__echos-arrow--up'
                : 'eth-toast__echos-arrow--down';
            const arrowGlyph = c.direction === 'up' ? '▲' : '▼';

            return `
                <div class="eth-toast__echos-entry">
                    ${avatarHtml}
                    <span class="eth-toast__echos-name">${_esc(c.charName)}</span>
                    <span class="eth-toast__echos-arrow ${arrowClass}" aria-label="${c.direction === 'up' ? 'subió' : 'bajó'}">${arrowGlyph}</span>
                </div>`;
        }).join('');

        el.innerHTML = `
            <div class="eth-toast__echos-header">
                <span class="eth-toast__echos-icon">✦</span>
                <div class="eth-toast__echos-titles">
                    <div class="eth-toast__echos-title">Ecos del Ciclo</div>
                    <div class="eth-toast__echos-subtitle">Los lazos del destino se han movido</div>
                </div>
            </div>
            <div class="eth-toast__echos-list">${entriesHtml}</div>
            <div class="eth-toast__echos-hint">Toca para cerrar</div>
        `;

        const close = function () { _dismiss(el, onDismiss); };
        el.addEventListener('click', close, { once: true });

        _show(el);
        return el;
    }

    // ── Utilidad ──────────────────────────────────────────────────────

    function _esc(str) {
        return String(str || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    // ── Public API ────────────────────────────────────────────────────

    return { show, showCycleEchos };

})();

window.Toasts = Toasts;
