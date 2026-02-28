// Funciones de interfaz (menús, modales, renderizado visual).
// ============================================
// UI/INTERFACE.JS
// ============================================
// Este archivo agrupa funciones de interfaz:
// navegación, modales, historial, paneles, temas y renderizado visual.
// Aunque contiene bastante lógica, se mantiene separado del arranque para
// que editar la UI sea más sencillo.

function initSmartTooltips() {
    if (!tooltipRoot) {
        tooltipRoot = document.createElement('div');
        tooltipRoot.className = 'smart-tooltip';
        document.body.appendChild(tooltipRoot);
    }

    let tooltipTimer = null;

    const showTooltip = (el) => {
        const text = el?.getAttribute('data-tooltip');
        if (!text || !tooltipRoot) return;

        tooltipRoot.textContent = text;
        tooltipRoot.classList.add('visible');
        tooltipRoot.style.left = '-9999px';
        tooltipRoot.style.top = '-9999px';

        const rect = el.getBoundingClientRect();
        const tipRect = tooltipRoot.getBoundingClientRect();
        const spacing = 10;
        const canShowTop = rect.top >= tipRect.height + spacing;
        const placement = canShowTop ? 'top' : 'bottom';
        tooltipRoot.dataset.placement = placement;

        let left = rect.left + (rect.width / 2) - (tipRect.width / 2);
        left = Math.max(8, Math.min(left, window.innerWidth - tipRect.width - 8));

        const top = placement === 'top'
            ? rect.top - tipRect.height - spacing
            : rect.bottom + spacing;

        tooltipRoot.style.left = `${left}px`;
        tooltipRoot.style.top = `${top}px`;
    };

    const hideTooltip = () => {
        if (tooltipTimer) {
            clearTimeout(tooltipTimer);
            tooltipTimer = null;
        }
        if (tooltipRoot) tooltipRoot.classList.remove('visible');
    };

    const queueTooltip = (target) => {
        if (!target) return;
        if (tooltipTimer) clearTimeout(tooltipTimer);
        const delayMs = Number(target.getAttribute('data-tooltip-delay') || 0);
        tooltipTimer = setTimeout(() => {
            showTooltip(target);
            tooltipTimer = null;
        }, Math.max(0, delayMs));
    };

    document.addEventListener('mouseover', (e) => {
        const target = e.target.closest('[data-tooltip]');
        if (!target) return;
        queueTooltip(target);
    });

    document.addEventListener('focusin', (e) => {
        const target = e.target.closest('[data-tooltip]');
        if (!target) return;
        queueTooltip(target);
    });

    document.addEventListener('mouseout', (e) => {
        if (!e.target.closest('[data-tooltip]')) return;
        hideTooltip();
    });

    document.addEventListener('focusout', (e) => {
        if (!e.target.closest('[data-tooltip]')) return;
        hideTooltip();
    });

    window.addEventListener('scroll', hideTooltip, true);
    window.addEventListener('resize', hideTooltip);
}

function setupKeyboardListeners() {
    document.addEventListener('keydown', (e) => {
        const vnSection = document.getElementById('vnSection');
        if (!vnSection || !vnSection.classList.contains('active')) return;

        const replyPanel = document.getElementById('vnReplyPanel');
        const settingsPanel = document.getElementById('settingsPanel');
        const continuationOverlay = document.getElementById('continuationOverlay');
        const optionsContainer = document.getElementById('vnOptionsContainer');
        const emotePicker = document.getElementById('emotePicker');

        if (e.code === 'Space') {
            if (replyPanel && replyPanel.style.display === 'flex') return;
            if (settingsPanel && settingsPanel.classList.contains('active')) return;
            if (optionsContainer && optionsContainer.classList.contains('active')) return;
            if (emotePicker && emotePicker.classList.contains('active')) return;
            e.preventDefault();
            handleDialogueClick();
        }

        if (e.code === 'Escape') {
            if (continuationOverlay && continuationOverlay.classList.contains('active')) {
                closeContinuation();
            } else if (replyPanel && replyPanel.style.display === 'flex') {
                closeReplyPanel();
            } else if (document.getElementById('historyModal')?.classList.contains('active')) {
                closeModal('historyModal');
            } else if (document.getElementById('sheetModal')?.classList.contains('active')) {
                closeModal('sheetModal');
            } else if (settingsPanel && settingsPanel.classList.contains('active')) {
                closeSettings();
            } else if (document.getElementById('branchEditorModal')?.classList.contains('active')) {
                closeModal('branchEditorModal');
            } else if (document.getElementById('shortcutsModal')?.classList.contains('active')) {
                closeModal('shortcutsModal');
            } else if (emotePicker && emotePicker.classList.contains('active')) {
                toggleEmotePicker();
            }
        }

        const isTypingField = ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName);

        if (!isTypingField && e.code === 'ArrowLeft') {
            e.preventDefault();
            previousMessage();
        }

        if (!isTypingField && e.code === 'ArrowRight') {
            e.preventDefault();
            nextMessage();
        }

        if (!isTypingField && e.key === '?') {
            e.preventDefault();
            openModal('shortcutsModal');
        }
    });

    // Trampa de foco para accesibilidad: Tab no sale de un modal abierto
    document.addEventListener('keydown', (e) => {
        if (e.key !== 'Tab') return;

        const activeModal = document.querySelector('.modal-overlay.active');
        if (!activeModal) return;

        const focusable = activeModal.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
        if (!focusable.length) return;

        const first = focusable[0];
        const last = focusable[focusable.length - 1];

        if (e.shiftKey && document.activeElement === first) {
            e.preventDefault();
            last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
            e.preventDefault();
            first.focus();
        }
    });
}


function setupTouchGestures() {
    const vnSection = document.getElementById('vnSection');
    if (!vnSection) return;

    vnSection.addEventListener('touchstart', (e) => {
        if (e.touches.length !== 1) return;
        touchStartX = e.touches[0].clientX;
        touchStartY = e.touches[0].clientY;
    }, { passive: true });

    vnSection.addEventListener('touchend', (e) => {
        if (!vnSection.classList.contains('active') || e.changedTouches.length !== 1) return;

        const dx = e.changedTouches[0].clientX - touchStartX;
        const dy = e.changedTouches[0].clientY - touchStartY;
        const absDx = Math.abs(dx);
        const absDy = Math.abs(dy);

        if (absDx < 50 && absDy < 50) return;

        if (absDx > absDy) {
            if (dx < 0) nextMessage();
            else previousMessage();
            return;
        }

        if (dy > 70) {
            const replyPanel = document.getElementById('vnReplyPanel');
            const settingsPanel = document.getElementById('settingsPanel');
            const continuationOverlay = document.getElementById('continuationOverlay');

            if (continuationOverlay?.classList.contains('active')) {
                closeContinuation();
            } else if (replyPanel?.style.display === 'flex') {
                closeReplyPanel();
            } else if (settingsPanel?.classList.contains('active')) {
                closeSettings();
            }
        }
    }, { passive: true });
}

