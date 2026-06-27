// ============================================================
// ACTIVITY DASHBOARD — métricas de actividad de la historia
// ============================================================
// Solo modo clásico. Fuente de datos: mensajes locales + topic_cycles.
// API pública: ActivityDashboard.open() / .close()
// ============================================================

const ActivityDashboard = (function () {

    // ── helpers ──────────────────────────────────────────────

    function _esc(str) {
        return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    function _timeAgo(isoStr) {
        if (!isoStr) return '';
        const diff = Date.now() - new Date(isoStr).getTime();
        if (diff < 60000)        return 'ahora mismo';
        if (diff < 3600000)      return 'hace ' + Math.floor(diff / 60000) + ' min';
        if (diff < 86400000)     return 'hace ' + Math.floor(diff / 3600000) + 'h';
        if (diff < 2592000000)   return 'hace ' + Math.floor(diff / 86400000) + ' días';
        return 'hace ' + Math.floor(diff / 2592000000) + ' meses';
    }

    function _cycleRemaining(cycle) {
        if (!cycle || !cycle.closes_at) return null;
        const ms = new Date(cycle.closes_at).getTime() - Date.now();
        if (ms <= 0) return 'cerrando…';
        if (ms < 3600000)  return Math.ceil(ms / 60000) + ' min';
        if (ms < 86400000) {
            const h = Math.floor(ms / 3600000);
            const m = Math.ceil((ms % 3600000) / 60000);
            return h + 'h ' + (m > 0 ? m + 'min' : '');
        }
        return Math.floor(ms / 86400000) + 'd';
    }

    // ── render helpers ───────────────────────────────────────

    function _renderCycle(cycle) {
        if (!cycle) {
            return '<div class="adash-cycle adash-cycle--none">Sin ciclo activo en este momento</div>';
        }
        const remaining = _cycleRemaining(cycle);
        return '<div class="adash-cycle adash-cycle--open">' +
            '<span class="adash-cycle-dot"></span>' +
            '<span class="adash-cycle-text">Ciclo activo — cierra en <strong>' + _esc(remaining) + '</strong></span>' +
            '</div>';
    }

    function _renderParticipant(name, data, maxCount) {
        const pct   = Math.round((data.count / maxCount) * 100);
        const ago   = _timeAgo(data.lastAt);
        const color = data.color || '#c9a86c';
        const init  = _esc((name || '?')[0].toUpperCase());

        const avatarHtml = data.avatar
            ? '<img src="' + _esc(data.avatar) + '" alt="' + init + '" onerror="this.style.display=\'none\';this.nextSibling.style.display=\'flex\'">' +
              '<span style="display:none">' + init + '</span>'
            : '<span>' + init + '</span>';

        return '<div class="adash-participant">' +
            '<div class="adash-p-avatar" style="--char-color:' + _esc(color) + '">' + avatarHtml + '</div>' +
            '<div class="adash-p-info">' +
                '<div class="adash-p-header">' +
                    '<span class="adash-p-name" style="color:' + _esc(color) + '">' + _esc(name) + '</span>' +
                    '<span class="adash-p-count">' + data.count + '</span>' +
                    (ago ? '<span class="adash-p-ago">' + _esc(ago) + '</span>' : '') +
                '</div>' +
                '<div class="adash-p-bar-wrap"><div class="adash-p-bar" style="width:' + pct + '%;background:' + _esc(color) + '60"></div></div>' +
            '</div>' +
        '</div>';
    }

    // ── core ─────────────────────────────────────────────────

    var _lastFocused = null;

    function _onKeyDown(e) {
        if (e.key === 'Escape') { e.stopPropagation(); close(); }
    }

    async function open() {
        const modal = document.getElementById('activityDashboardModal');
        if (!modal) return;
        _lastFocused = document.activeElement;
        modal.removeAttribute('hidden');
        modal.classList.add('active');
        document.body.classList.add('modal-open');
        var firstFocusable = modal.querySelector('button, [href], input, [tabindex]:not([tabindex="-1"])');
        if (firstFocusable) firstFocusable.focus();
        document.addEventListener('keydown', _onKeyDown);
        await _render();
    }

    function close() {
        const modal = document.getElementById('activityDashboardModal');
        if (modal) { modal.setAttribute('hidden', ''); modal.classList.remove('active'); }
        document.removeEventListener('keydown', _onKeyDown);
        var anyModalOpen = document.querySelector('.modal-overlay.active');
        if (!anyModalOpen) document.body.classList.remove('modal-open');
        if (_lastFocused && typeof _lastFocused.focus === 'function') _lastFocused.focus();
        _lastFocused = null;
    }

    async function _render() {
        const body = document.getElementById('activityDashboardBody');
        if (!body) return;
        body.innerHTML = '<div class="adash-loading">Calculando…</div>';

        const topicId = typeof currentTopicId !== 'undefined' ? currentTopicId : null;
        if (!topicId) {
            body.innerHTML = '<p class="adash-empty">No hay historia activa.</p>';
            return;
        }

        // Mensajes del tema (caché local — ya cargados al entrar en el tema)
        const msgs = typeof getTopicMessages === 'function' ? (getTopicMessages(topicId) || []) : [];

        // Agregar por nombre de personaje
        const charMap = {};
        for (var i = 0; i < msgs.length; i++) {
            var msg = msgs[i];
            if (msg.isNarrator || !msg.charName) continue;
            var key = msg.charName;
            if (!charMap[key]) {
                charMap[key] = { count: 0, lastAt: null, color: msg.charColor || null, avatar: msg.charAvatar || null };
            }
            charMap[key].count++;
            if (!charMap[key].lastAt || (msg.timestamp && msg.timestamp > charMap[key].lastAt)) {
                charMap[key].lastAt = msg.timestamp || null;
            }
        }

        var total         = msgs.filter(function (m) { return !m.isNarrator && m.charName; }).length;
        var narratorCount = msgs.filter(function (m) { return  m.isNarrator || !m.charName; }).length;
        var participants  = Object.keys(charMap).length;
        var maxCount      = 1;
        Object.values(charMap).forEach(function (d) { if (d.count > maxCount) maxCount = d.count; });

        var sorted = Object.entries(charMap).sort(function (a, b) { return b[1].count - a[1].count; });

        // Ciclo activo desde Supabase
        var cycle = null;
        var sb = window.supabaseClient;
        if (sb) {
            try {
                var result = await sb.from('topic_cycles')
                    .select('id, started_at, closes_at, status')
                    .eq('topic_id', topicId)
                    .eq('status', 'open')
                    .order('started_at', { ascending: false })
                    .limit(1)
                    .maybeSingle();
                cycle = result.data || null;
            } catch (e) {
                // Sin ciclo — no es crítico
            }
        }

        // Construir HTML
        var statsRow = '<div class="adash-stats-row">' +
            '<div class="adash-stat"><span class="adash-stat-value">' + total + '</span><span class="adash-stat-label">mensajes</span></div>' +
            '<div class="adash-stat"><span class="adash-stat-value">' + participants + '</span><span class="adash-stat-label">personajes</span></div>' +
            (narratorCount > 0 ? '<div class="adash-stat"><span class="adash-stat-value">' + narratorCount + '</span><span class="adash-stat-label">narrador</span></div>' : '') +
            '</div>';

        var participantsHtml = sorted.length > 0
            ? '<div class="adash-participants">' + sorted.map(function (entry) { return _renderParticipant(entry[0], entry[1], maxCount); }).join('') + '</div>'
            : '<p class="adash-empty">Sin mensajes aún.</p>';

        body.innerHTML = statsRow + _renderCycle(cycle) + participantsHtml;
    }

    return { open: open, close: close };

})();

window.ActivityDashboard   = ActivityDashboard;
window.openActivityDashboard  = function () { ActivityDashboard.open(); };
window.closeActivityDashboard = function () { ActivityDashboard.close(); };
