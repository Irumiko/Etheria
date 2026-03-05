// ============================================
// MEJORAS v10
// ============================================

// ============================================
// MEJORA 9: TRANSICIONES SUAVES ENTRE SECCIONES
// ============================================
// Flag: cuando venimos de la pantalla de perfiles, saltamos el overlay negro
var _skipNextFadeTransition = false;

var _fadeTransitionInProgress = false;

function _clearFadeOverlay(overlay, delay) {
    setTimeout(function() {
        if (overlay) {
            overlay.classList.remove('fade-out');
            overlay.style.transition = '';
        }
        _fadeTransitionInProgress = false;
    }, delay);
}

function fadeTransition(callback, duration) {
    duration = duration || 280;

    // Si viene de seleccionar perfil, ejecutar directamente sin overlay
    if (_skipNextFadeTransition) {
        _skipNextFadeTransition = false;
        try { callback(); } catch(e) { console.error('[fadeTransition] callback error:', e); }
        return;
    }

    // Evitar transiciones simultáneas que dejen el overlay atascado
    if (_fadeTransitionInProgress) {
        try { callback(); } catch(e) { console.error('[fadeTransition] callback error:', e); }
        return;
    }

    var overlay = document.getElementById('sectionTransitionOverlay');
    if (!overlay) {
        try { callback(); } catch(e) { console.error('[fadeTransition] callback error:', e); }
        return;
    }

    _fadeTransitionInProgress = true;
    overlay.style.transition = 'opacity ' + duration + 'ms ease';
    overlay.classList.add('fade-out');

    setTimeout(function() {
        try {
            callback();
        } catch(e) {
            console.error('[fadeTransition] callback error:', e);
        } finally {
            // Siempre quitar el overlay, aunque el callback haya fallado
            _clearFadeOverlay(overlay, Math.round(duration * 0.6));
        }
    }, duration);
}

// ============================================
// MEJORA 12: SUSPENSE EN OPCIONES
// ============================================
function applySuspenseEffect() {
    var vn = document.getElementById('vnSection');
    if (vn) vn.classList.add('suspense-mode');
}

function removeSuspenseEffect() {
    var vn = document.getElementById('vnSection');
    if (vn) vn.classList.remove('suspense-mode');
}

// ============================================
// Compatibilidad legacy de tiradas (desactivado)
// ============================================
function toggleDiceMode() { return; }
function clearDiceRoll() { return; }
function updateDiceBadgeForMessage() { return; }
function consumePendingDiceRoll() { return undefined; }
function resetDiceOnCloseReply() { return; }

// ============================================
// MEJORA 5: Indicador cloud — temporal en estado online
// ============================================
var _cloudHideTimer = null;

function showCloudIndicatorTemporarily() {
    var indicator = document.getElementById('cloudSyncIndicator');
    if (!indicator) return;
    if (indicator.classList.contains('degraded') || indicator.classList.contains('offline')) return;
    indicator.classList.add('visible');
    clearTimeout(_cloudHideTimer);
    _cloudHideTimer = setTimeout(function() {
        indicator.classList.remove('visible');
    }, 3000);
}

// ============================================
// INICIALIZACIÓN — parchear funciones globales
// ============================================
document.addEventListener('DOMContentLoaded', function() {

    // MEJORA 1: Frase aleatoria en el subtítulo del menú principal
    var _menuPhrases = [
        'Un mundo al borde del olvido',
        'Cada elección deja una cicatriz',
        'El destino se escribe con tinta y dados',
        'Las historias no terminan, se transforman',
        'Cada personaje guarda un secreto',
        'El pasado elige quiénes somos',
        'Algunos hilos no deberían cortarse',
        'La magia no perdona a los imprudentes',
        'Hasta los héroes sangran en silencio',
        'El azar es la firma de los dioses',
        'Ningún mapa llega hasta el final del camino',
        'Lo que se escribe, permanece'
    ];
    var _subtitle = document.querySelector('.menu-subtitle');
    if (_subtitle) {
        _subtitle.textContent = _menuPhrases[Math.floor(Math.random() * _menuPhrases.length)];
    }

    // Mejora 5: parchar updateCloudSyncIndicator
    var _origCloud = window.updateCloudSyncIndicator;
    if (typeof _origCloud === 'function') {
        window.updateCloudSyncIndicator = function(state, text) {
            _origCloud.call(this, state, text);
            if (state === 'online') showCloudIndicatorTemporarily();
        };
    }
    setTimeout(showCloudIndicatorTemporarily, 1500);

    // Mejora 12: parchar showOptions para suspense
    var _origShowOptions = window.showOptions;
    if (typeof _origShowOptions === 'function') {
        window.showOptions = function(options) {
            _origShowOptions.call(this, options);
            var container = document.getElementById('vnOptionsContainer');
            if (container && container.classList.contains('active')) {
                applySuspenseEffect();
            }
        };
    }

    // Mejora 12: parchar selectOption para quitar suspense
    var _origSelectOption = window.selectOption;
    if (typeof _origSelectOption === 'function') {
        window.selectOption = function(idx) {
            removeSuspenseEffect();
            _origSelectOption.call(this, idx);
        };
    }

    // Mejora 9: parchar showSection
    var _origShowSection = window.showSection;
    if (typeof _origShowSection === 'function') {
        window.showSection = function(section) {
            fadeTransition(function() { _origShowSection.call(window, section); }, 150);
        };
    }

    // Mejora 9: parchar backToMenu
    var _origBackToMenu = window.backToMenu;
    if (typeof _origBackToMenu === 'function') {
        window.backToMenu = function() {
            fadeTransition(function() { _origBackToMenu.call(window); }, 150);
        };
    }

    // Mejora 9: parchar backToTopics
    var _origBackToTopics = window.backToTopics;
    if (typeof _origBackToTopics === 'function') {
        window.backToTopics = function() {
            fadeTransition(function() { _origBackToTopics.call(window); }, 150);
        };
    }

    // Mejora 9: parchar enterTopic
    var _origEnterTopic = window.enterTopic;
    if (typeof _origEnterTopic === 'function') {
        window.enterTopic = function(id) {
            fadeTransition(function() { _origEnterTopic.call(window, id); }, 220);
        };
    }

});
