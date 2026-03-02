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
// MEJORA 7: DADO DnD — resultado embebido en el mensaje
// ============================================
var _pendingDiceRoll = null; // null = sin tirada activa; {value, label, cssClass} = tirada pendiente

var _DICE_INFO = {
    critical: { label: '¡CRÍTICO!', cssClass: 'badge-critical', emoji: '⭐' },
    fumble:   { label: '¡PIFIA!',   cssClass: 'badge-fumble',   emoji: '💀' },
    success:  { label: 'ÉXITO',     cssClass: 'badge-success',  emoji: '✓'  },
    fail:     { label: 'FALLO',     cssClass: 'badge-fail',     emoji: '✗'  }
};

function _getDiceResultType(roll) {
    if (roll === 20) return 'critical';
    if (roll === 1)  return 'fumble';
    if (roll % 2 === 0) return 'success';
    return 'fail';
}

function toggleDiceMode() {
    var btn = document.getElementById('diceToggleBtn');
    var textarea = document.getElementById('vnReplyText');

    // Bloquear si no hay texto escrito
    if (!textarea || !textarea.value.trim()) {
        _showDiceHint('Escribe tu mensaje antes de tirar el dado');
        return;
    }

    // Si ya hay una tirada pendiente, se quita (toggle off)
    if (_pendingDiceRoll) {
        clearDiceRoll();
        return;
    }

    // Tirar
    var roll = Math.floor(Math.random() * 20) + 1;
    var type = _getDiceResultType(roll);
    var info = _DICE_INFO[type];

    _pendingDiceRoll = { value: roll, type: type, label: info.label, cssClass: info.cssClass, emoji: info.emoji };

    // Actualizar preview en el panel
    _updateDicePreview();

    // Sonido
    if (type === 'critical' && typeof playSoundAffinityUp   === 'function') playSoundAffinityUp();
    else if (type === 'fumble' && typeof playSoundAffinityDown === 'function') playSoundAffinityDown();
    else if (typeof playSoundClick === 'function') playSoundClick();
}

function clearDiceRoll() {
    _pendingDiceRoll = null;
    _updateDicePreview();
}

function _updateDicePreview() {
    var badge   = document.getElementById('dicePreviewBadge');
    var clearBtn = document.getElementById('diceClearBtn');
    var diceBtn  = document.getElementById('diceToggleBtn');

    if (!badge) return;

    if (_pendingDiceRoll) {
        var d = _pendingDiceRoll;
        badge.textContent = d.emoji + ' ' + d.value + ' — ' + d.label;
        badge.className = 'dice-preview-badge ' + d.cssClass;
        badge.style.display = 'inline-flex';
        if (clearBtn) clearBtn.style.display = 'inline-block';
        if (diceBtn)  diceBtn.classList.add('rolled');
    } else {
        badge.style.display = 'none';
        if (clearBtn) clearBtn.style.display = 'none';
        if (diceBtn) {
            diceBtn.classList.remove('rolled');
            diceBtn.textContent = '🎲 Incluir tirada d20';
        }
    }
}

function _showDiceHint(msg) {
    var btn = document.getElementById('diceToggleBtn');
    if (!btn) return;
    var orig = btn.textContent;
    btn.textContent = '⚠ ' + msg;
    btn.classList.add('no-text');
    setTimeout(function() {
        btn.textContent = orig;
        btn.classList.remove('no-text');
    }, 2000);
}

// Actualizar el badge EN LA CAJA DE DIÁLOGO al mostrar un mensaje
function updateDiceBadgeForMessage(msg) {
    var badge = document.getElementById('vnDiceBadge');
    if (!badge) return;

    if (msg && msg.diceRoll) {
        var d = msg.diceRoll;
        var info = _DICE_INFO[d.type] || _DICE_INFO['success'];
        badge.textContent = '🎲 ' + d.value + ' — ' + d.label;
        badge.className = 'vn-dice-badge ' + d.cssClass;
        badge.style.display = 'inline-flex';
    } else {
        badge.style.display = 'none';
    }
}

// Obtener y limpiar la tirada pendiente para incluirla en el mensaje
function consumePendingDiceRoll() {
    if (!_pendingDiceRoll) return undefined;
    var roll = {
        value:   _pendingDiceRoll.value,
        type:    _pendingDiceRoll.type,
        label:   _pendingDiceRoll.label,
        cssClass: _pendingDiceRoll.cssClass,
        emoji:   _pendingDiceRoll.emoji
    };
    clearDiceRoll();
    return roll;
}

// Resetear dado al cerrar el panel de respuesta
function resetDiceOnCloseReply() {
    clearDiceRoll();
}

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
            fadeTransition(function() { _origShowSection.call(window, section); });
        };
    }

    // Mejora 9: parchar backToMenu
    var _origBackToMenu = window.backToMenu;
    if (typeof _origBackToMenu === 'function') {
        window.backToMenu = function() {
            fadeTransition(function() { _origBackToMenu.call(window); });
        };
    }

    // Mejora 9: parchar backToTopics
    var _origBackToTopics = window.backToTopics;
    if (typeof _origBackToTopics === 'function') {
        window.backToTopics = function() {
            fadeTransition(function() { _origBackToTopics.call(window); });
        };
    }

    // Mejora 9: parchar enterTopic
    var _origEnterTopic = window.enterTopic;
    if (typeof _origEnterTopic === 'function') {
        window.enterTopic = function(id) {
            fadeTransition(function() { _origEnterTopic.call(window, id); }, 220);
        };
    }

    // Mejora 7: habilitar/deshabilitar botón dado según si hay texto
    var textarea = document.getElementById('vnReplyText');
    var diceBtn  = document.getElementById('diceToggleBtn');
    if (textarea && diceBtn) {
        function syncDiceBtn() {
            if (textarea.value.trim()) {
                diceBtn.classList.remove('no-text');
                diceBtn.removeAttribute('disabled');
            } else {
                diceBtn.classList.add('no-text');
                // No deshabilitar con disabled para que el click muestre el hint
            }
        }
        textarea.addEventListener('input', syncDiceBtn);
        syncDiceBtn(); // estado inicial
    }

    // Mejora 7: resetear dado al cerrar panel de respuesta
    var _origCloseReplyPanel = window.closeReplyPanel;
    if (typeof _origCloseReplyPanel === 'function') {
        window.closeReplyPanel = function() {
            resetDiceOnCloseReply();
            _origCloseReplyPanel.call(window);
        };
    }

    // Mejora 7: inyectar diceRoll en postVNReply y saveEditedMessage
    var _origPostVNReply = window.postVNReply;
    if (typeof _origPostVNReply === 'function') {
        window.postVNReply = function() {
            // Guardar la tirada pendiente ANTES de que postVNReply limpie el panel
            window._diceRollForNextMsg = consumePendingDiceRoll();
            _origPostVNReply.call(window);
        };
    }

    // Mejora 7: parchar showCurrentMessage para actualizar el badge del dado
    var _origShowCurrentMessage = window.showCurrentMessage;
    if (typeof _origShowCurrentMessage === 'function') {
        window.showCurrentMessage = function(direction) {
            _origShowCurrentMessage.call(window, direction);
            // Actualizar badge tras renderizar el mensaje
            requestAnimationFrame(function() {
                var msgs = typeof getTopicMessages === 'function' && currentTopicId
                    ? getTopicMessages(currentTopicId) : [];
                var msg = msgs[currentMessageIndex];
                updateDiceBadgeForMessage(msg);
            });
        };
    }
});
