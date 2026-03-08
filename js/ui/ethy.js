// ============================================
// ETHY — Mascota del sistema
// ============================================
// API mínima: init · show · hide · setMood
//
// El asset visual es assets/ui/ethy.svg —
// el mismo icono que aparece en la galería vacía.
// ============================================

const Ethy = (function() {

    let _el = null;

    function _getEl() {
        if (!_el) _el = document.getElementById('ethy');
        return _el;
    }

    return {

        init() {
            const el = _getEl();
            if (!el) return;
            el.classList.add('ethy-visible');
        },

        show() {
            const el = _getEl();
            if (el) el.classList.add('ethy-visible');
        },

        hide() {
            const el = _getEl();
            if (el) el.classList.remove('ethy-visible');
        },

        // mood: 'default' | 'happy' | 'thinking' | 'alert'
        // Por ahora solo registra el estado — los estilos por mood
        // se añadirán cuando se diseñen las variantes.
        setMood(mood) {
            const el = _getEl();
            if (!el) return;
            el.dataset.mood = mood || 'default';
        }
    };

})();
