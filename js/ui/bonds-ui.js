// ═══════════════════════════════════════════════════════════════════
// BONDS UI — Sección "Vínculos"
// Renderiza el tablón de relaciones de cada personaje del usuario.
// ═══════════════════════════════════════════════════════════════════

const BondsUI = (function () {

    let _bonds       = { outgoing: [], incoming: [] };
    let _editingKey  = null; // 'fromId_toId' en edición

    // ── Helpers ──────────────────────────────────────────────────────

    function _char(id) {
        return (appData?.characters || []).find(c => String(c.id) === String(id)) || null;
    }

    function _rankColor(rankName) {
        if (!window.affinityRanks) return '#ffffff';
        return window.affinityRanks.find(r => r.name === rankName)?.color || '#ffffff';
    }

    function _isMyChar(charId) {
        const c = _char(charId);
        return c && c.userIndex === currentUserIndex;
    }

    // Indicador de presencia — busca el userId del dueño del personaje
    function _getPresenceDot(charId) {
        if (typeof SupabasePresence === 'undefined') return '';
        const c = _char(charId);
        if (!c) return '';
        const ownerProfile = Array.isArray(appData.cloudProfiles)
            ? appData.cloudProfiles.find(p => p.userIndex === c.userIndex || p.index === c.userIndex)
            : null;
        const ownerUserId = ownerProfile?.owner_user_id || ownerProfile?.id || null;
        if (!ownerUserId) return '';
        const online = SupabasePresence.isOnline(ownerUserId);
        const label  = online ? 'En línea' : 'Desconectado';
        return `<span class="presence-dot ${online ? '' : 'offline'}" title="${label}"></span>`;
    }

    // Cargar historial de afinidad desde Supabase
    async function _loadAffinityHistory(fromCharId, toCharId) {
        if (!window.supabaseClient) return [];
        try {
            const { data, error } = await window.supabaseClient
                .from('affinity_history')
                .select('old_value, new_value, old_rank, new_rank, changed_at')
                .eq('from_char_id', String(fromCharId))
                .eq('to_char_id',   String(toCharId))
                .order('changed_at', { ascending: false })
                .limit(10);
            if (error || !data) return [];
            return data;
        } catch { return []; }
    }

    // ── Render principal ─────────────────────────────────────────────
    async function render() {
        const container = document.getElementById('bondsContainer');
        if (!container) return;

        container.innerHTML = '<div class="bonds-loading">Cargando vínculos…</div>';

        const myChars = (appData?.characters || [])
            .filter(c => c.userIndex === currentUserIndex);

        if (myChars.length === 0) {
            container.innerHTML = `
                <div class="bonds-empty">
                    <div class="bonds-empty-icon">🔗</div>
                    <p>Aún no tienes personajes.<br>
                    <span>Crea tu primer personaje para ver sus vínculos.</span></p>
                </div>`;
            return;
        }

        // Cargar desde Supabase
        if (typeof SupabaseBonds !== 'undefined') {
            _bonds = await SupabaseBonds.loadBondsForUser();
        }

        // Renderizar una tarjeta por cada personaje propio
        container.innerHTML = myChars.map(char => _renderCharCard(char)).join('');

        // Bind eventos de edición de notas
        container.querySelectorAll('.bond-note-btn').forEach(btn => {
            btn.addEventListener('click', () => _startEditNote(
                btn.dataset.from, btn.dataset.to
            ));
        });
        container.querySelectorAll('.bond-note-save').forEach(btn => {
            btn.addEventListener('click', () => _saveNote(
                btn.dataset.from, btn.dataset.to
            ));
        });
        container.querySelectorAll('.bond-note-cancel').forEach(btn => {
            btn.addEventListener('click', () => _cancelEdit(
                btn.dataset.from, btn.dataset.to
            ));
        });
    }

    function _renderCharCard(char) {
        // Vínculos salientes de este personaje
        const outgoing = _bonds.outgoing.filter(b =>
            String(b.from_char_id) === String(char.id)
        );
        // Vínculos entrantes hacia este personaje (perspectiva recíproca)
        const incoming = _bonds.incoming.filter(b =>
            String(b.to_char_id) === String(char.id)
        );

        // Unir todos los "otros" personajes que aparecen en algún vínculo
        const otherIds = new Set([
            ...outgoing.map(b => b.to_char_id),
            ...incoming.map(b => b.from_char_id),
        ]);

        const bondRows = otherIds.size > 0
            ? [...otherIds].map(otherId => _renderBondRow(char, otherId, outgoing, incoming)).join('')
            : `<div class="bonds-no-relations">Sin vínculos todavía.<br><span>Participa en una historia para que aparezcan aquí.</span></div>`;

        const avatarHtml = char.avatar
            ? `<img src="${escapeHtml(char.avatar)}" alt="${escapeHtml(char.name)}" class="bonds-char-avatar-img">`
            : `<div class="bonds-char-avatar-initial">${escapeHtml((char.name || '?')[0])}</div>`;

        return `
        <div class="bonds-char-card" style="--char-color: ${char.color || '#8b7355'}">
            <div class="bonds-char-header">
                <div class="bonds-char-avatar">${avatarHtml}</div>
                <div class="bonds-char-info">
                    <div class="bonds-char-name">${escapeHtml(char.name)}</div>
                    ${char.race ? `<div class="bonds-char-race">${escapeHtml(char.race)}</div>` : ''}
                </div>
                <div class="bonds-char-count">${otherIds.size} vínculo${otherIds.size !== 1 ? 's' : ''}</div>
            </div>
            <div class="bonds-list">${bondRows}</div>
        </div>`;
    }

    function _renderBondRow(myChar, otherId, outgoing, incoming) {
        const otherChar   = _char(otherId);
        const otherName   = otherChar ? escapeHtml(otherChar.name) : `Personaje desconocido`;
        const otherAvatar = otherChar?.avatar
            ? `<img src="${escapeHtml(otherChar.avatar)}" alt="${otherName}" class="bond-other-avatar-img">`
            : `<div class="bond-other-avatar-initial">${escapeHtml((otherChar?.name || '?')[0])}</div>`;

        // Perspectiva saliente: lo que MI personaje siente hacia el otro
        const out = outgoing.find(b => String(b.to_char_id) === String(otherId));
        // Perspectiva entrante: lo que el otro siente hacia MI personaje
        const inc = incoming.find(b => String(b.from_char_id) === String(otherId));

        const myFromId = String(myChar.id);
        const myToId   = String(otherId);
        const editKey  = `${myFromId}_${myToId}`;
        const isEditing = _editingKey === editKey;

        const outRank  = out?.rank_name  || 'Desconocidos';
        const incRank  = inc?.rank_name  || 'Desconocidos';
        const outColor = _rankColor(outRank);
        const incColor = _rankColor(incRank);
        const outAff   = out?.affinity ?? '—';
        const incAff   = inc?.affinity ?? '—';
        const myNote   = out?.note || '';

        return `
        <div class="bond-row" id="bond-row-${editKey}">
            <div class="bond-other-avatar">${otherAvatar}</div>
            <div class="bond-content">
                <div class="bond-other-name">
                    ${otherName}
                    ${_getPresenceDot(otherId)}
                </div>

                <!-- Afinidades direccionales -->
                <div class="bond-affinities">
                    <div class="bond-aff-pill" style="--rank-color: ${outColor}" title="Lo que ${escapeHtml(myChar.name)} siente hacia ${otherName}">
                        <span class="bond-aff-arrow">→</span>
                        <span class="bond-aff-rank">${escapeHtml(outRank)}</span>
                        <span class="bond-aff-val">${outAff}</span>
                    </div>
                    <div class="bond-aff-pill bond-aff-incoming" style="--rank-color: ${incColor}" title="Lo que ${otherName} siente hacia ${escapeHtml(myChar.name)}">
                        <span class="bond-aff-arrow">←</span>
                        <span class="bond-aff-rank">${escapeHtml(incRank)}</span>
                        <span class="bond-aff-val">${incAff}</span>
                    </div>
                </div>

                <!-- Nota del jugador -->
                ${isEditing ? `
                <div class="bond-note-editor">
                    <textarea class="bond-note-textarea" id="bond-note-input-${editKey}" maxlength="300" placeholder="Cómo ve ${escapeHtml(myChar.name)} a ${otherName}…">${escapeHtml(myNote)}</textarea>
                    <div class="bond-note-actions">
                        <button class="bond-note-save btn-sm" data-from="${myFromId}" data-to="${myToId}">Guardar</button>
                        <button class="bond-note-cancel btn-sm btn-ghost" data-from="${myFromId}" data-to="${myToId}">Cancelar</button>
                    </div>
                </div>` : `
                <div class="bond-note-display" id="bond-note-display-${editKey}">
                    ${myNote
                        ? `<p class="bond-note-text">"${escapeHtml(myNote)}"</p>`
                        : `<p class="bond-note-empty">Sin nota todavía.</p>`
                    }
                    <button class="bond-note-btn btn-sm btn-ghost" data-from="${myFromId}" data-to="${myToId}">
                        ✎ ${myNote ? 'Editar nota' : 'Añadir nota'}
                    </button>
                    ${out ? `<button class="bond-history-toggle" onclick="BondsUI.toggleHistory('${myFromId}','${myToId}',this)">▸ Ver historial</button>
                    <div class="bond-history-list" id="bond-hist-${editKey}" style="display:none;"></div>` : ''}
                </div>`}
            </div>
        </div>`;
    }

    // ── Edición de notas ─────────────────────────────────────────────
    function _startEditNote(fromId, toId) {
        _editingKey = `${fromId}_${toId}`;
        render();
    }

    function _cancelEdit() {
        _editingKey = null;
        render();
    }

    async function _saveNote(fromId, toId) {
        const key   = `${fromId}_${toId}`;
        const input = document.getElementById(`bond-note-input-${key}`);
        if (!input) return;

        const note = input.value.trim();
        const btn  = document.querySelector(`.bond-note-save[data-from="${fromId}"][data-to="${toId}"]`);
        if (btn) { btn.disabled = true; btn.textContent = 'Guardando…'; }

        const result = typeof SupabaseBonds !== 'undefined'
            ? await SupabaseBonds.updateNote(fromId, toId, note)
            : { ok: false };

        if (result.ok) {
            // Actualizar cache local
            const bond = _bonds.outgoing.find(b =>
                String(b.from_char_id) === fromId && String(b.to_char_id) === toId
            );
            if (bond) bond.note = note;
            _editingKey = null;
            render();
        } else {
            if (btn) { btn.disabled = false; btn.textContent = 'Guardar'; }
            if (typeof showAutosave === 'function') showAutosave('Error al guardar la nota', 'error');
        }
    }

    // ── Historial de afinidad ────────────────────────────────────────
    async function toggleHistory(fromId, toId, btn) {
        const key = `${fromId}_${toId}`;
        const container = document.getElementById(`bond-hist-${key}`);
        if (!container) return;

        const isOpen = container.style.display !== 'none';
        if (isOpen) {
            container.style.display = 'none';
            btn.textContent = '▸ Ver historial';
            return;
        }

        btn.textContent = '▾ Cargando…';
        const history = await _loadAffinityHistory(fromId, toId);

        if (!history.length) {
            container.innerHTML = '<div class="bond-history-entry" style="font-style:italic;opacity:0.5">Sin cambios registrados</div>';
        } else {
            container.innerHTML = history.map(h => {
                const color = _rankColor(h.new_rank || '');
                const date  = h.changed_at
                    ? new Date(h.changed_at).toLocaleDateString('es-ES', { day:'2-digit', month:'short', year:'2-digit' })
                    : '';
                const arrow = h.new_value > h.old_value ? '↑' : '↓';
                return `<div class="bond-history-entry">
                    <span class="bond-history-arrow">${arrow}</span>
                    <span class="bond-history-rank" style="--rank-color:${color}">${escapeHtml(h.new_rank || '')}</span>
                    <span style="opacity:0.4;font-size:0.67rem">${h.old_value}→${h.new_value}</span>
                    <span class="bond-history-date">${date}</span>
                </div>`;
            }).join('');
        }

        container.style.display = 'flex';
        btn.textContent = '▾ Historial';
    }

    // ── Realtime: refrescar si la sección está abierta ───────────────
    window.addEventListener('etheria:bonds-changed', function () {
        const bondsSection = document.getElementById('bondsSection');
        if (bondsSection?.classList.contains('active')) {
            render();
        }
    });

    // ── API ──────────────────────────────────────────────────────────
    return { render, toggleHistory };

})();

window.BondsUI = BondsUI;
