// ============================================================
// RPG RENDERER
// Escucha eventos del RPGEngine y actualiza el DOM del VN.
//
// Es el ÚNICO módulo RPG que toca el DOM.
// Nunca llama lógica directamente: solo emite eventos de vuelta
// (advance, choiceMade) como respuesta al input del usuario.
//
// Depende de:
//   - eventBus          (escucha scene:* y emite respuestas)
//   - El DOM del VN     (vnSection, vnDialogue, vnBackground, etc.)
// ============================================================

const RPGRenderer = (function () {

    // IDs de los elementos DOM del VN que este renderer usa
    // Los primeros 4 son IDs existentes en index.html — no cambiar.
    // vnChoiceArea y vnRpgStatBar son elementos nuevos inyectados por este módulo.
    const DOM = {
        vnSection:    'vnSection',
        background:   'vnBackground',
        dialogueBox:  'vnDialogBox',       // clase .vn-dialogue-box, sin ID → se busca por clase
        charName:     'vnSpeakerPlate',    // ID real en index.html
        dialogueText: 'vnDialogueText',    // ID real en index.html
        choiceArea:   'vnChoiceArea',      // elemento nuevo — inyectado en init()
        statBar:      'vnRpgStatBar'       // elemento nuevo — inyectado en init()
    };

    let _unsubs     = [];    // funciones de unsuscripción del eventBus
    let _active     = false;
    let _charCache  = {};    // nombre → color

    // ── Inicialización ──────────────────────────────────────────

    function init() {
        if (_active) return;
        _active = true;

        // Inyectar elementos DOM nuevos si no existen aún
        _ensureChoiceArea();
        _ensureStatBar();

        _unsubs = [
            eventBus.on('scene:started',          _onSceneStarted),
            eventBus.on('scene:step',              _onStep),
            eventBus.on('scene:choice-shown',      _onChoiceShown),
            eventBus.on('scene:background',        _onBackground),
            eventBus.on('scene:sound',             _onSound),
            eventBus.on('scene:camera',            _onCamera),
            eventBus.on('scene:stat-check-result', _onStatCheckResult),
            eventBus.on('scene:choice-made',       _onChoiceMade),
            eventBus.on('scene:ended',             _onSceneEnded),
            eventBus.on('scene:error',             _onError),
            eventBus.on('rpg:state-updated',       _onStateUpdated)
        ];
    }

    function _ensureChoiceArea() {
        if (document.getElementById(DOM.choiceArea)) return;
        var vnSection = document.getElementById(DOM.vnSection);
        if (!vnSection) return;
        var el = document.createElement('div');
        el.id = DOM.choiceArea;
        el.style.display = 'none';
        vnSection.appendChild(el);
    }

    function _ensureStatBar() {
        if (document.getElementById(DOM.statBar)) return;
        var vnSection = document.getElementById(DOM.vnSection);
        if (!vnSection) return;
        var el = document.createElement('div');
        el.id = DOM.statBar;
        vnSection.appendChild(el);
    }

    // Obtener la caja de diálogo — tiene clase pero no ID
    function _dialogueBox() {
        return document.querySelector('.vn-dialogue-box') || null;
    }

    function destroy() {
        _unsubs.forEach(function(unsub) { unsub(); });
        _unsubs  = [];
        _active  = false;
        _charCache = {};
    }

    // ── Manejadores de eventos del engine ───────────────────────

    function _onSceneStarted(data) {
        _clearChoices();
        _hideStatCheck();
        var vnSection = document.getElementById(DOM.vnSection);
        if (vnSection) vnSection.classList.add('rpg-scene-active');
    }

    function _onStep(data) {
        var step = data.step;
        if (!step) return;

        // Solo renderizar diálogos aquí.
        // Las elecciones llegan por scene:choice-shown con opciones ya filtradas.
        if (step.type === 'dialogue') {
            _renderDialogue(step);
        }
    }

    function _onChoiceShown(data) {
        // data.options ya vienen filtradas por RPGEngine.getVisibleOptions()
        _renderChoice(data.step || {}, data.options);
    }

    function _onBackground(data) {
        // Emitir evento — vn.js escucha vn:background-changed y aplica el fondo.
        // RPGRenderer nunca llama funciones de vn.js directamente.
        eventBus.emit('vn:background-changed', {
            asset:      data.asset,
            transition: data.transition,
            duration:   data.duration,
            scene:      window.__etheriaScene || null
        });
    }

    function _onSound(data) {
        if (!data || !data.action) return;
        if (data.track === 'rain') {
            eventBus.emit(data.action === 'start' ? 'audio:start-rain' : 'audio:stop-rain');
        }
        // Otros tracks de escena se pueden ampliar aquí
    }

    function _onCamera(data) {
        var vnSection = document.getElementById(DOM.vnSection);
        if (!vnSection) return;

        if (data.effect === 'shake') {
            vnSection.classList.add('vn-shake');
            setTimeout(function() { vnSection.classList.remove('vn-shake'); }, data.duration || 400);
        } else if (data.effect === 'flash') {
            vnSection.classList.add('vn-flash');
            setTimeout(function() { vnSection.classList.remove('vn-flash'); }, data.duration || 300);
        }
    }

    function _onStatCheckResult(data) {
        _showStatCheck(data);
    }

    function _onChoiceMade(data) {
        _clearChoices();
    }

    function _onSceneEnded(data) {
        _clearChoices();
        _hideStatCheck();
        var vnSection = document.getElementById(DOM.vnSection);
        if (vnSection) vnSection.classList.remove('rpg-scene-active');

        // Si hay un callback registrado externamente, llamarlo
        if (typeof window._rpgSceneEndCallback === 'function') {
            window._rpgSceneEndCallback(data);
        }
    }

    function _onError(data) {
        console.error('[RPGRenderer] Error de escena:', data.error);
        var box = _dialogueBox();
        if (box) {
            _setText(DOM.charName, 'Error');
            _setText(DOM.dialogueText, 'No se pudo cargar la escena: ' + data.error);
            box.style.display = 'flex';
        }
    }

    function _onStateUpdated(data) {
        _updateStatBar(data);
    }

    // ── Renderizado de diálogo ───────────────────────────────────

    function _renderDialogue(step) {
        var box = _dialogueBox();
        if (!box) return;

        _clearChoices();
        _hideStatCheck();

        // Nombre del personaje
        var nameEl = document.getElementById(DOM.charName);
        if (nameEl) {
            nameEl.textContent = step.character || '';
            nameEl.style.color = _charColor(step.character);
        }

        // Texto con typewriter si existe la función global, sino directo
        var textEl = document.getElementById(DOM.dialogueText);
        if (textEl) {
            if (typeof typewriterWrite === 'function') {
                typewriterWrite(textEl, step.text || '', { speed: window.textSpeed || 25 });
            } else {
                textEl.textContent = step.text || '';
            }
        }

        // Expresión del sprite si hay personaje seleccionado
        if (step.expression && typeof showEmoteOnSprite === 'function') {
            showEmoteOnSprite(step.expression);
        }

        box.style.display = 'flex';

        // El click en la caja avanza al siguiente paso
        _bindAdvanceOnce(box);
    }

    // ── Renderizado de elecciones ────────────────────────────────

    // step: objeto del paso (para leer .prompt)
    // options: array ya filtrado por RPGEngine (llega desde scene:choice-shown)
    function _renderChoice(step, options) {
        var area = document.getElementById(DOM.choiceArea);
        if (!area) return;

        var box = document.getElementById(DOM.dialogueBox);
        if (box) box.style.display = 'none';

        area.innerHTML = '';
        area.style.display = 'flex';

        if (step.prompt) {
            var prompt = document.createElement('div');
            prompt.className = 'rpg-choice-prompt';
            prompt.textContent = step.prompt;
            area.appendChild(prompt);
        }

        (options || []).forEach(function(opt, i) {
            var btn = document.createElement('button');
            btn.className = 'rpg-choice-btn';
            btn.textContent = opt.text;

            // Indicador de coste si existe
            if (opt.cost_hp) {
                var badge = document.createElement('span');
                badge.className = 'rpg-choice-cost';
                badge.textContent = '-' + opt.cost_hp + ' HP';
                btn.appendChild(badge);
            }

            btn.addEventListener('click', function() {
                eventBus.emit('scene:input:choice', { index: i });
            });
            area.appendChild(btn);
        });
    }

    // ── Tirada de dados ──────────────────────────────────────────

    function _showStatCheck(data) {
        // Reutilizar showDiceResultOverlay si existe (ya implementado en vn.js)
        if (typeof showDiceResultOverlay === 'function') {
            showDiceResultOverlay(data);
            return;
        }

        // Fallback mínimo
        var existing = document.getElementById('rpgStatCheckOverlay');
        if (existing) existing.remove();

        var overlay = document.createElement('div');
        overlay.id = 'rpgStatCheckOverlay';
        overlay.className = 'rpg-stat-check-overlay';

        var cssClass = { critical: 'dice-result-critical', success: 'dice-result-success',
                         fail: 'dice-result-fail', fumble: 'dice-result-fumble' }[data.result]
                       || 'dice-result-success';

        var label = { critical: 'ÉXITO CRÍTICO', success: 'ACIERTO',
                      fail: 'FALLO', fumble: 'FALLO CRÍTICO' }[data.result] || data.result;

        var sign = data.modifier >= 0 ? '+' : '';
        overlay.innerHTML =
            '<div class="dice-result-box">' +
                '<div class="dice-number ' + cssClass + '">' + data.roll + '</div>' +
                '<div class="dice-result-label ' + cssClass + '">' + label + '</div>' +
                '<div style="font-size:0.85rem;margin-top:0.4rem;opacity:0.75;">' +
                    'D20 (' + data.roll + ') ' + sign + data.modifier + ' = ' + data.total +
                    ' vs CD ' + data.difficulty +
                '</div>' +
            '</div>';

        document.body.appendChild(overlay);
        setTimeout(function() { if (overlay.parentNode) overlay.remove(); }, 2000);
    }

    function _hideStatCheck() {
        var el = document.getElementById('rpgStatCheckOverlay');
        if (el) el.remove();
    }

    // ── Barra de stats ───────────────────────────────────────────

    // data: payload de rpg:state-updated  { hp: {current, max}, xp, level }
    // Si no llega payload (p.ej. llamada directa al init) lee de RPGState como fallback.
    function _updateStatBar(data) {
        var bar = document.getElementById(DOM.statBar);
        if (!bar) return;

        var hp  = (data && data.hp)    || RPGState.getHp();
        var xp  = (data && data.xp  != null) ? data.xp  : RPGState.getXp();
        var lvl = (data && data.level != null) ? data.level : RPGState.getLevel();

        bar.innerHTML =
            '<span class="rpg-stat-hp">❤ ' + hp.current + '/' + hp.max + '</span>' +
            '<span class="rpg-stat-xp">✦ Nv.' + lvl + ' (' + xp + ' XP)</span>';
    }

    // ── Helpers ──────────────────────────────────────────────────

    function _bindAdvanceOnce(element) {
        // Quitar listeners anteriores clonando el nodo
        var fresh = element.cloneNode(true);
        element.parentNode.replaceChild(fresh, element);

        function handler(e) {
            // No disparar si se ha hecho clic en un botón interno
            if (e.target.closest && e.target.closest('button')) return;
            fresh.removeEventListener('click', handler);
            eventBus.emit('scene:input:advance');
        }
        fresh.addEventListener('click', handler);
    }

    function _clearChoices() {
        var area = document.getElementById(DOM.choiceArea);
        if (area) { area.innerHTML = ''; area.style.display = 'none'; }
    }

    function _setText(domId, text) {
        var el = document.getElementById(domId);
        if (el) el.textContent = text;
    }

    function _resolveAsset(asset) {
        if (!asset) return '';
        if (asset.startsWith('http') || asset.startsWith('/') || asset.startsWith('./')) return asset;
        return 'assets/backgrounds/' + asset + '.jpg';
    }

    // Asignar un color consistente por nombre de personaje
    var CHAR_COLORS = [
        '#e8c97a', '#7ab8e8', '#e87a7a', '#7ae8b8',
        '#c87ae8', '#e8a87a', '#7ae8e8', '#e87ab8'
    ];

    function _charColor(name) {
        if (!name) return '#e8dcc8';
        if (!_charCache[name]) {
            var hash = 0;
            for (var i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) | 0;
            _charCache[name] = CHAR_COLORS[Math.abs(hash) % CHAR_COLORS.length];
        }
        return _charCache[name];
    }

    return { init: init, destroy: destroy, updateStatBar: _updateStatBar };
})();
