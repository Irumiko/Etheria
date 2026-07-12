/* ── vn-compose.js ────────────────────────────────────────────────────────
   Cableado del panel Responder/Editar rediseñado (barra compacta anclada
   sobre la caja de diálogo — ver css/features/vn-compose-bar.css).

   Estrategia ADITIVA: no reescribe el pipeline de envío. Envuelve
   openReplyPanel() (que conserva toda su lógica: guards, narrador, ciclos,
   opciones, clima) para, tras abrirlo:
     · inyectar una vez los controles nuevos (tipos de acción + formato),
     · reetiquetar el botón de envío según la senda (Susurrar / Inscribir),
     · reiniciar el tipo de acción a "Hablar".

   Tipos de acción (Hablar/Actuar/Pensar): SOLO estilo visual del textarea
   mientras se escribe (clase vcb-mode-*). No alteran los datos guardados.
   Formato (cursiva/negrita): envuelve la selección con la sintaxis markdown
   que el parser ya entiende (*cursiva*, **negrita**).
   ───────────────────────────────────────────────────────────────────────── */
(function () {
    'use strict';

    // Activa el modo barra (el CSS cuelga de body.compose-bar)
    document.body.classList.add('compose-bar');

    var ACTIONS = [
        { key: 'speak', label: 'Hablar',  cls: '' },
        { key: 'act',   label: 'Actuar',  cls: 'vcb-mode-act' },
        { key: 'think', label: 'Pensar',  cls: 'vcb-mode-think' }
    ];

    function textarea() { return document.getElementById('vnReplyText'); }

    // ── Tipo de acción: solo cambia el aspecto del textarea ──────────────
    function setActionType(key) {
        var ta = textarea();
        if (ta) {
            ta.classList.remove('vcb-mode-act', 'vcb-mode-think');
            var a = ACTIONS.find(function (x) { return x.key === key; });
            if (a && a.cls) ta.classList.add(a.cls);
        }
        document.querySelectorAll('.vcb-action-btn').forEach(function (b) {
            b.classList.toggle('active', b.getAttribute('data-action') === key);
        });
    }

    // ── Formato: envuelve la selección con marcadores markdown ───────────
    function wrapSelection(marker) {
        var ta = textarea();
        if (!ta) return;
        var s = ta.selectionStart, e = ta.selectionEnd;
        var sel = ta.value.slice(s, e);
        var before = ta.value.slice(0, s), after = ta.value.slice(e);
        if (sel) {
            ta.value = before + marker + sel + marker + after;
            ta.selectionStart = s + marker.length;
            ta.selectionEnd = e + marker.length;
        } else {
            ta.value = before + marker + marker + after;
            ta.selectionStart = ta.selectionEnd = s + marker.length;
        }
        ta.focus();
        if (typeof vrpUpdatePreview === 'function') vrpUpdatePreview();
        if (typeof vrpAutoResize === 'function') vrpAutoResize(ta);
    }

    // Popovers flotantes: abren una caja ANCLADA SOBRE el panel, sin
    // empujar ni deformar nada. Mutuamente excluyentes (visibilidad;
    // el estado de datos — checkbox de opciones, clima elegido — no
    // se toca al cerrar el popover).
    function _popover(containerId) {
        var c = document.getElementById(containerId);
        return c ? c.querySelector('.vcb-popover') : null;
    }

    function _closePopovers(except) {
        ['optionsToggleContainer', 'weatherSelectorContainer'].forEach(function (id) {
            if (id === except) return;
            var pop = _popover(id);
            if (pop) pop.classList.remove('open');
        });
        var oChip = document.getElementById('vcbOptionsChip');
        var wChip = document.getElementById('vcbWeatherChip');
        if (oChip && except !== 'optionsToggleContainer') oChip.classList.remove('active');
        if (wChip && except !== 'weatherSelectorContainer') wChip.classList.remove('active');
    }

    function toggleOptions() {
        _closePopovers('optionsToggleContainer');
        var pop = _popover('optionsToggleContainer');
        if (!pop) return;
        var open = pop.classList.toggle('open');
        // Al abrir por primera vez, activar las opciones (checkbox + fields)
        var fields = document.getElementById('optionsFields');
        if (open && fields && !fields.classList.contains('active') &&
            typeof toggleOptionsFields === 'function') {
            toggleOptionsFields();
        }
        var chip = document.getElementById('vcbOptionsChip');
        if (chip) chip.classList.toggle('active', open);
    }

    function toggleWeather() {
        _closePopovers('weatherSelectorContainer');
        var pop = _popover('weatherSelectorContainer');
        if (!pop) return;
        var open = pop.classList.toggle('open');
        var chip = document.getElementById('vcbWeatherChip');
        if (chip) chip.classList.toggle('active', open);
    }

    // Exponer para los onclick inline (el test de integridad los valida)
    window.vcbSetActionType = setActionType;
    window.vcbWrapFormat = wrapSelection;
    window.vcbToggleOptions = toggleOptions;
    window.vcbToggleWeather = toggleWeather;

    // ── Inyección única de los controles nuevos ──────────────────────────
    function injectControls() {
        var header = document.querySelector('#vnReplyPanel .vrp-header-right');
        if (header && !header.querySelector('.vcb-action-row')) {
            var row = document.createElement('div');
            row.className = 'vcb-action-row';
            row.innerHTML = ACTIONS.map(function (a) {
                return '<button type="button" class="vcb-action-btn' +
                    (a.key === 'speak' ? ' active' : '') +
                    '" data-action="' + a.key +
                    '" onclick="vcbSetActionType(\'' + a.key + '\')">' + a.label + '</button>';
            }).join('');
            // Insertar antes del botón de cerrar
            var closeBtn = header.querySelector('.vrp-close-btn');
            if (closeBtn) header.insertBefore(row, closeBtn);
            else header.appendChild(row);
        }

        var wrap = document.querySelector('#vnReplyPanel .vn-reply-textarea-wrap');
        if (wrap && !document.querySelector('#vnReplyPanel .vcb-format-row')) {
            var fmt = document.createElement('div');
            fmt.className = 'vcb-format-row';
            fmt.innerHTML =
                '<button type="button" class="vcb-format-btn" data-fmt="italic" title="Cursiva" onclick="vcbWrapFormat(\'*\')"><em>i</em></button>' +
                '<button type="button" class="vcb-format-btn" data-fmt="bold" title="Negrita" onclick="vcbWrapFormat(\'**\')">B</button>' +
                '<span class="vcb-format-spacer"></span>';
            wrap.parentNode.insertBefore(fmt, wrap);
        }
    }

    // ── Reetiquetar el botón de envío según la senda ─────────────────────
    function relabelSend() {
        var btn = document.getElementById('submitReplyBtn');
        if (!btn) return;
        var span = btn.querySelector('span');
        if (!span) return;
        // Si se está editando, openReplyPanel ya puso "Guardar Cambios": respetar
        if (typeof editingMessageId !== 'undefined' && editingMessageId) return;
        var rpg = (typeof isRpgModeMode === 'function') && isRpgModeMode();
        span.textContent = rpg ? 'Inscribir' : 'Susurrar';
    }

    // ── Pasada de densidad: estado inicial mínimo (concepto) ─────────────
    function compactPass() {
        var rpg = (typeof isRpgModeMode === 'function') && isRpgModeMode();

        // Placeholder poético y breve, por senda
        var ta = textarea();
        if (ta) {
            ta.placeholder = rpg
                ? 'Inscribe tu acción en la crónica…'
                : 'Teje tu respuesta bajo las estrellas…';
        }

        // Título con la voz de la senda (solo si no estamos editando)
        var title = document.getElementById('replyPanelTitle');
        if (title && title.textContent.trim() === 'Responder') {
            title.textContent = rpg ? 'Tu turno' : 'Tu voz';
        }

        // Cancelar → Descartar (misma función, otra voz)
        var cancel = document.querySelector('#vnReplyPanel .vrp-btn-cancel');
        if (cancel && cancel.textContent.trim() === 'Cancelar') {
            cancel.textContent = 'Descartar';
        }

        // Popovers cerrados al abrir el panel (el estado de datos persiste)
        _closePopovers(null);

        layoutPass();
    }

    // ── Reordenación de layout: de filas apiladas a la jerarquía del
    //    concepto. Mueve nodos EXISTENTES (conservan listeners e IDs);
    //    idempotente gracias a los guards. ──────────────────────────────
    function layoutPass() {
        var panel = document.getElementById('vnReplyPanel');
        if (!panel || panel.querySelector('.vcb-utility-row')) return;

        var body = panel.querySelector('.vrp-body');
        var split = panel.querySelector('.vrp-split');
        if (!body || !split) return;

        // Selector de personaje → chip junto al título, en la cabecera
        var headerLeft = panel.querySelector('.vrp-header-left');
        var charSel = document.getElementById('charSelectorContainer');
        if (headerLeft && charSel) headerLeft.appendChild(charSel);

        // Fila A: formato + vista previa + narrador, bajo el textarea
        var rowA = document.createElement('div');
        rowA.className = 'vcb-utility-row';
        split.insertAdjacentElement('afterend', rowA);
        var fmt = panel.querySelector('.vcb-format-row');
        if (fmt) rowA.appendChild(fmt);
        var preview = document.getElementById('vrpPreviewToggle');
        if (preview) rowA.appendChild(preview);
        var narrator = document.getElementById('narratorToggle');
        if (narrator) rowA.appendChild(narrator);

        // Fila B: chips plegados de opciones y clima, lado a lado
        var rowB = document.createElement('div');
        rowB.className = 'vcb-secondary-row';
        rowA.insertAdjacentElement('afterend', rowB);
        var opts = document.getElementById('optionsToggleContainer');
        if (opts) {
            rowB.appendChild(opts);
            var oChip = document.createElement('button');
            oChip.type = 'button';
            oChip.id = 'vcbOptionsChip';
            oChip.className = 'vcb-chip';
            oChip.setAttribute('onclick', 'vcbToggleOptions()');
            oChip.innerHTML = '✦ Opciones de elección';
            var oPop = document.createElement('div');
            oPop.className = 'vcb-popover';
            var oToggle = opts.querySelector('.options-toggle');
            var oFields = document.getElementById('optionsFields');
            if (oToggle) oPop.appendChild(oToggle);
            if (oFields) oPop.appendChild(oFields);
            opts.insertBefore(oChip, opts.firstChild);
            opts.appendChild(oPop);
        }
        var weather = document.getElementById('weatherSelectorContainer');
        if (weather) {
            rowB.appendChild(weather);
            var wChip = document.createElement('button');
            wChip.type = 'button';
            wChip.id = 'vcbWeatherChip';
            wChip.className = 'vcb-chip';
            wChip.setAttribute('onclick', 'vcbToggleWeather()');
            wChip.innerHTML = '☾ Clima de la escena';
            var wPop = document.createElement('div');
            wPop.className = 'vcb-popover';
            var wRow = weather.querySelector('.vrp-weather-row');
            if (wRow) wPop.appendChild(wRow);
            weather.insertBefore(wChip, weather.firstChild);
            weather.appendChild(wPop);
        }
    }

    // ── Enganchar openReplyPanel sin modificar su fuente ─────────────────
    function hookOpen() {
        if (typeof window.openReplyPanel !== 'function') return false;
        var orig = window.openReplyPanel;
        window.openReplyPanel = function () {
            var r = orig.apply(this, arguments);
            try {
                injectControls();
                setActionType('speak');
                relabelSend();
                compactPass();
            } catch (err) { console.warn('[vn-compose] hook:', err); }
            return r;
        };
        return true;
    }

    if (!hookOpen()) {
        // vn.js aún no cargó: reintentar brevemente
        var tries = 0;
        var iv = setInterval(function () {
            if (hookOpen() || ++tries > 40) clearInterval(iv);
        }, 100);
    }
})();
