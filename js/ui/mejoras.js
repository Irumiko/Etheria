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
// MEJORA 7: MONEDA (cara/cruz) — resultado embebido en el mensaje
// ============================================
var _pendingDiceRoll = null; // null = sin tirada activa; {value, label, cssClass, emoji}

var _DICE_INFO = {
    success: { value: 'cara',  label: 'ACIERTO', cssClass: 'badge-success', emoji: '🪙' },
    fail:    { value: 'cruz',  label: 'FALLO',   cssClass: 'badge-fail',    emoji: '🪙' }
};

var _COIN_ACTION_STAT = { str: 'STR', vit: 'VIT', int: 'INT', agi: 'AGI' };

function _getCoinActionType() {
    var select = document.getElementById('coinActionType');
    return select ? String(select.value || 'general').toLowerCase() : 'general';
}

function _getSelectedCharacterForCoin() {
    if (!currentTopicId || currentTopicMode !== 'fanfic' || isNarratorMode) return null;
    if (!selectedCharId) return null;
    return appData.characters.find(function(c) { return c.id === selectedCharId; }) || null;
}

function _getRpgTotalStatValue(char, statKey) {
    if (!char || typeof ensureCharacterRpgProfile !== 'function') return null;
    var profile = ensureCharacterRpgProfile(char);
    if (!profile || !profile.stats || typeof RPG_BASE_STATS === 'undefined') return null;
    return (RPG_BASE_STATS[statKey] || 0) + (profile.stats[statKey] || 0);
}

function _flipCoin() {
    return Math.random() < 0.5 ? 'success' : 'fail';
}

function _resolveCoinRollType() {
    var actionType = _getCoinActionType();
    var statKey = _COIN_ACTION_STAT[actionType] || null;
    var char = _getSelectedCharacterForCoin();
    var statValue = statKey && char ? _getRpgTotalStatValue(char, statKey) : null;

    if (!statKey || statValue === null) {
        return { type: _flipCoin(), mode: 'standard', actionType: actionType, statKey: statKey, statValue: statValue };
    }

    var bonus = Math.floor((statValue - 8) / 2);
    if (bonus >= 2) {
        var a = _flipCoin(), b = _flipCoin();
        return { type: (a === 'success' || b === 'success') ? 'success' : 'fail', mode: 'advantage', actionType: actionType, statKey: statKey, statValue: statValue };
    }
    if (bonus <= -2) {
        var c = _flipCoin(), d = _flipCoin();
        return { type: (c === 'fail' || d === 'fail') ? 'fail' : 'success', mode: 'disadvantage', actionType: actionType, statKey: statKey, statValue: statValue };
    }

    return { type: _flipCoin(), mode: 'standard', actionType: actionType, statKey: statKey, statValue: statValue };
}

function toggleDiceMode() {
    var btn = document.getElementById('diceToggleBtn');
    var textarea = document.getElementById('vnReplyText');

    if (typeof getCurrentTopic === 'function') {
        var topic = getCurrentTopic();
        if (!topic || topic.mode !== 'fanfic') {
            _showDiceHint('La moneda solo está disponible en modo RPG');
            return;
        }
    }

    // Bloquear si no hay texto escrito
    if (!textarea || !textarea.value.trim()) {
        _showDiceHint('Escribe tu mensaje antes de lanzar la moneda');
        return;
    }

    // Si ya hay tirada pendiente, no permitir repetir hasta el siguiente mensaje.
    if (_pendingDiceRoll) {
        _showDiceHint('Ya lanzaste la moneda para este mensaje');
        return;
    }

    var rollMeta = _resolveCoinRollType();
    var type = rollMeta.type;
    var info = _DICE_INFO[type];

    _pendingDiceRoll = {
        value: info.value,
        type: type,
        label: info.label,
        cssClass: info.cssClass,
        emoji: info.emoji,
        actionType: rollMeta.actionType,
        statKey: rollMeta.statKey,
        statValue: rollMeta.statValue,
        rollMode: rollMeta.mode
    };

    _updateDicePreview();

    if (type === 'success' && typeof playSoundAffinityUp === 'function') playSoundAffinityUp();
    else if (typeof playSoundAffinityDown === 'function') playSoundAffinityDown();
}

function clearDiceRoll() {
    // Se mantiene por compatibilidad con llamadas legacy; no permitir limpiar manualmente.
    return;
}

function _updateDicePreview() {
    var badge   = document.getElementById('dicePreviewBadge');
    var diceBtn = document.getElementById('diceToggleBtn');

    if (!badge) return;

    if (_pendingDiceRoll) {
        var d = _pendingDiceRoll;
        var modeHint = d.rollMode === 'advantage' ? ' (Ventaja)' : d.rollMode === 'disadvantage' ? ' (Desventaja)' : '';
        badge.textContent = d.emoji + ' ' + d.value.toUpperCase() + ' — ' + d.label + modeHint;
        badge.className = 'dice-preview-badge ' + d.cssClass;
        badge.style.display = 'inline-flex';
        if (diceBtn) {
            diceBtn.classList.add('rolled');
            diceBtn.textContent = '🪙 Moneda lanzada';
        }
    } else {
        badge.style.display = 'none';
        if (diceBtn) {
            diceBtn.classList.remove('rolled');
            diceBtn.textContent = '🪙 Lanzar moneda';
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
        var coinFace = (d.value || info.value || '').toUpperCase();
        var modeHint = d.rollMode === 'advantage' ? ' · Ventaja' : d.rollMode === 'disadvantage' ? ' · Desventaja' : '';
        badge.textContent = '🪙 ' + coinFace + ' — ' + (d.label || info.label) + modeHint;
        badge.className = 'vn-dice-badge ' + (d.cssClass || info.cssClass);
        badge.style.display = 'inline-flex';
    } else {
        badge.style.display = 'none';
    }
}

// Obtener y limpiar la tirada pendiente para incluirla en el mensaje
function consumePendingDiceRoll() {
    if (!_pendingDiceRoll) return undefined;
    var roll = {
        value: _pendingDiceRoll.value,
        type: _pendingDiceRoll.type,
        label: _pendingDiceRoll.label,
        cssClass: _pendingDiceRoll.cssClass,
        emoji: _pendingDiceRoll.emoji,
        actionType: _pendingDiceRoll.actionType,
        statKey: _pendingDiceRoll.statKey,
        statValue: _pendingDiceRoll.statValue,
        rollMode: _pendingDiceRoll.rollMode
    };
    _pendingDiceRoll = null;
    _updateDicePreview();
    return roll;
}

// Resetear estado visual al cerrar panel (sin limpiar tirada pendiente)
function resetDiceOnCloseReply() {
    _updateDicePreview();
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
