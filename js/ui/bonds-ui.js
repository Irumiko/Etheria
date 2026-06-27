// ═══════════════════════════════════════════════════════════════════
// BONDS UI — Sección "Vínculos"
// Vista: grid de tarjetas compactas + panel de detalle slide-over
// ═══════════════════════════════════════════════════════════════════

const BondsUI = (function () {

    let _bonds      = { outgoing: [], incoming: [] };
    let _editingKey = null;
    let _detailChar = null; // personaje cuyo panel está abierto

    // ── Helpers ──────────────────────────────────────────────────────

    function _char(id) {
        return (appData?.characters || []).find(c => String(c.id) === String(id)) || null;
    }

    // Devuelve el color del rank correcto teniendo en cuenta la rama.
    // relationType: 'friendship'|'romance'|'rivalry'|'enmity'|'undefined'|null
    function _rankColor(rankName, relationType) {
        if (!window.affinityRanks) return '#8e9196';
        const rel = relationType || 'undefined';
        // Buscar primero dentro de la rama correcta para evitar colisiones
        // entre rangos con el mismo nombre en ramas distintas (e.g. Tensión)
        const inBranch = window.affinityRanks.find(r =>
            r.name === rankName && (rel === 'undefined' || r.branch === rel || r.branch === 'common' || r.branch === 'negative')
        );
        return inBranch?.color || window.affinityRanks.find(r => r.name === rankName)?.color || '#8e9196';
    }

    // Devuelve el icono del rank según la rama.
    function _rankIcon(rankName, relationType) {
        if (!window.affinityRanks) return '';
        const rel = relationType || 'undefined';
        const rank = window.affinityRanks.find(r =>
            r.name === rankName && (rel === 'undefined' || r.branch === rel || r.branch === 'common' || r.branch === 'negative')
        ) || window.affinityRanks.find(r => r.name === rankName);
        return rank?.icon || '';
    }

    // Devuelve la etiqueta de rama para mostrar al usuario.
    function _branchLabel(relationType) {
        const labels = {
            friendship: '♦ Amistad',
            romance:    '♡ Romance',
            rivalry:    '⚔ Rivalidad',
            enmity:     '✗ Enemistad',
        };
        return labels[relationType] || null;
    }

    function _isMyChar(charId) {
        const c = _char(charId);
        return c && c.userIndex === currentUserIndex;
    }

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
        return `<span class="presence-dot ${online ? '' : 'offline'}" title="${online ? 'En línea' : 'Desconectado'}"></span>`;
    }

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

    // ── Render principal (grid de tarjetas compactas) ─────────────────
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

        if (typeof SupabaseBonds !== 'undefined') {
            _bonds = await SupabaseBonds.loadBondsForUser();
        }

        container.innerHTML = myChars.map(char => _renderCompactCard(char)).join('');

        // Bind: abrir panel de detalle al hacer clic en una tarjeta
        container.querySelectorAll('.bonds-char-card').forEach(card => {
            card.addEventListener('click', () => {
                const charId = card.dataset.charId;
                const char = _char(charId);
                if (char) _openDetailPanel(char);
            });
        });
    }

    // ── Tarjeta compacta ──────────────────────────────────────────────
    function _renderCompactCard(char) {
        const outgoing = _bonds.outgoing.filter(b => String(b.from_char_id) === String(char.id));
        const incoming = _bonds.incoming.filter(b => String(b.to_char_id)   === String(char.id));

        const otherIds = [...new Set([
            ...outgoing.map(b => b.to_char_id),
            ...incoming.map(b => b.from_char_id),
        ])];

        const avatarHtml = char.avatar
            ? `<img src="${escapeHtml(char.avatar)}" alt="${escapeHtml(char.name)}" class="bonds-char-avatar-img">`
            : `<div class="bonds-char-avatar-initial">${escapeHtml((char.name || '?')[0])}</div>`;

        // Mini-avatares para la vista previa (máx. 5)
        const MAX_PREVIEW = 5;
        const previewIds  = otherIds.slice(0, MAX_PREVIEW);
        const overflow    = otherIds.length - MAX_PREVIEW;

        let previewHtml;
        if (otherIds.length === 0) {
            previewHtml = `<span class="bonds-preview-empty">Sin vínculos todavía</span>`;
        } else {
            const avatars = previewIds.map(id => {
                const other = _char(id);
                const inner = other?.avatar
                    ? `<img src="${escapeHtml(other.avatar)}" alt="">`
                    : `<div class="bonds-preview-avatar-init">${escapeHtml((other?.name || '?')[0])}</div>`;
                return `<div class="bonds-preview-avatar">${inner}</div>`;
            }).join('');
            const plus = overflow > 0 ? `<span class="bonds-preview-overflow">+${overflow}</span>` : '';
            previewHtml = `<div class="bonds-preview-avatars">${avatars}</div>${plus}`;
        }

        return `
        <div class="bonds-char-card" data-char-id="${char.id}"
             style="--char-color: ${char.color || '#c9a86c'}">
            <div class="bonds-char-header">
                <div class="bonds-char-avatar">${avatarHtml}</div>
                <div class="bonds-char-info">
                    <div class="bonds-char-name">${escapeHtml(char.name)}</div>
                    ${char.race ? `<div class="bonds-char-race">${escapeHtml(char.race)}</div>` : ''}
                </div>
                <div class="bonds-char-count">${otherIds.length} vínculo${otherIds.length !== 1 ? 's' : ''}</div>
            </div>
            <div class="bonds-preview">
                ${previewHtml}
                <span class="bonds-preview-cta">Ver ›</span>
            </div>
        </div>`;
    }

    // ── Panel de detalle (slide-over) ─────────────────────────────────
    function _ensureOverlay() {
        let overlay = document.getElementById('bondsDetailOverlay');
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.id = 'bondsDetailOverlay';
            overlay.innerHTML = `<div class="bonds-detail-panel" id="bondsDetailPanel"></div>`;
            document.body.appendChild(overlay);

            // Cerrar al hacer clic en el fondo oscuro
            overlay.addEventListener('click', e => {
                if (e.target === overlay) _closeDetailPanel();
            });
        }
        return overlay;
    }

    function _openDetailPanel(char) {
        _detailChar = char;
        _editingKey = null;

        const overlay = _ensureOverlay();
        const panel   = document.getElementById('bondsDetailPanel');

        panel.style.setProperty('--char-color', char.color || '#c9a86c');
        panel.innerHTML = _renderDetailPanel(char);

        overlay.classList.add('open');

        // Cerrar con Escape
        document._bondsEscHandler = e => { if (e.key === 'Escape') _closeDetailPanel(); };
        document.addEventListener('keydown', document._bondsEscHandler);

        _bindDetailEvents(panel, char);
    }

    function _closeDetailPanel() {
        const overlay = document.getElementById('bondsDetailOverlay');
        if (overlay) overlay.classList.remove('open');
        if (document._bondsEscHandler) {
            document.removeEventListener('keydown', document._bondsEscHandler);
            delete document._bondsEscHandler;
        }
        _detailChar = null;
        _editingKey = null;
    }

    function _renderDetailPanel(char) {
        const outgoing = _bonds.outgoing.filter(b => String(b.from_char_id) === String(char.id));
        const incoming = _bonds.incoming.filter(b => String(b.to_char_id)   === String(char.id));

        const otherIds = [...new Set([
            ...outgoing.map(b => b.to_char_id),
            ...incoming.map(b => b.from_char_id),
        ])];

        const avatarHtml = char.avatar
            ? `<img src="${escapeHtml(char.avatar)}" alt="${escapeHtml(char.name)}">`
            : `<div class="bonds-detail-avatar-init">${escapeHtml((char.name || '?')[0])}</div>`;

        const bondRows = otherIds.length > 0
            ? otherIds.map(id => _renderBondRow(char, id, outgoing, incoming)).join('')
            : `<div class="bonds-no-relations">Sin vínculos todavía.<br><span>Participa en una historia para que aparezcan aquí.</span></div>`;

        return `
        <div class="bonds-detail-header">
            <div class="bonds-detail-avatar">${avatarHtml}</div>
            <div class="bonds-detail-charinfo">
                <div class="bonds-detail-charname">${escapeHtml(char.name)}</div>
                ${char.race ? `<div class="bonds-detail-charrace">${escapeHtml(char.race)}</div>` : ''}
            </div>
            <button class="bonds-detail-close" id="bondsDetailCloseBtn">✕</button>
        </div>
        <div class="bonds-detail-body">${bondRows}</div>`;
    }

    function _bindDetailEvents(panel, char) {
        panel.querySelector('#bondsDetailCloseBtn')?.addEventListener('click', _closeDetailPanel);

        panel.querySelectorAll('.bond-note-btn').forEach(btn => {
            btn.addEventListener('click', () => _startEditNote(btn.dataset.from, btn.dataset.to, char));
        });
        panel.querySelectorAll('.bond-note-save').forEach(btn => {
            btn.addEventListener('click', () => _saveNote(btn.dataset.from, btn.dataset.to, char));
        });
        panel.querySelectorAll('.bond-note-cancel').forEach(btn => {
            btn.addEventListener('click', () => _cancelEdit(char));
        });
        panel.querySelectorAll('.bond-history-toggle').forEach(btn => {
            btn.addEventListener('click', () => toggleHistory(btn.dataset.from, btn.dataset.to, btn));
        });
    }

    // ── Fila de vínculo ───────────────────────────────────────────────
    function _renderBondRow(myChar, otherId, outgoing, incoming) {
        const otherChar   = _char(otherId);
        const otherName   = otherChar ? escapeHtml(otherChar.name) : 'Personaje desconocido';
        const otherAvatar = otherChar?.avatar
            ? `<img src="${escapeHtml(otherChar.avatar)}" alt="${otherName}" class="bond-other-avatar-img">`
            : `<div class="bond-other-avatar-initial">${escapeHtml((otherChar?.name || '?')[0])}</div>`;

        const out = outgoing.find(b => String(b.to_char_id)   === String(otherId));
        const inc = incoming.find(b => String(b.from_char_id) === String(otherId));

        const myFromId  = String(myChar.id);
        const myToId    = String(otherId);
        const editKey   = `${myFromId}_${myToId}`;
        const isEditing = _editingKey === editKey;

        const outRank     = out?.rank_name || 'Desconocidos';
        const incRank     = inc?.rank_name || 'Desconocidos';

        // relation_type: leído desde appData.affinityTypes (cargado por SupabaseCycles)
        const topicId     = currentTopicId || null;
        const affTypes    = topicId ? (window.appData?.affinityTypes?.[topicId] || {}) : {};
        const outType     = out ? (affTypes[`${myChar.id}_${otherId}`] || 'undefined') : 'undefined';
        const incType     = inc ? (affTypes[`${otherId}_${myChar.id}`] || 'undefined') : 'undefined';

        const outColor    = _rankColor(outRank, outType);
        const incColor    = _rankColor(incRank, incType);
        const outIcon     = _rankIcon(outRank, outType);
        const incIcon     = _rankIcon(incRank, incType);
        const outBranch   = _branchLabel(outType);
        const incBranch   = _branchLabel(incType);
        const outAff      = out?.affinity ?? '—';
        const incAff      = inc?.affinity ?? '—';
        const myNote      = out?.note || '';

        return `
        <div class="bond-row" id="bond-row-${editKey}">
            <div class="bond-other-avatar">${otherAvatar}</div>
            <div class="bond-content">
                <div class="bond-other-name">
                    ${otherName}
                    ${_getPresenceDot(otherId)}
                </div>
                <div class="bond-affinities">
                    <div class="bond-aff-pill" style="--rank-color: ${outColor}" title="Lo que ${escapeHtml(myChar.name)} siente hacia ${otherName}">
                        <span class="bond-aff-arrow">→</span>
                        <span class="bond-aff-icon">${outIcon}</span>
                        <span class="bond-aff-rank">${escapeHtml(outRank)}</span>
                        ${outBranch ? `<span class="bond-aff-branch">${outBranch}</span>` : ''}
                        <span class="bond-aff-val">${outAff}</span>
                    </div>
                    <div class="bond-aff-pill bond-aff-incoming" style="--rank-color: ${incColor}" title="Lo que ${otherName} siente hacia ${escapeHtml(myChar.name)}">
                        <span class="bond-aff-arrow">←</span>
                        <span class="bond-aff-icon">${incIcon}</span>
                        <span class="bond-aff-rank">${escapeHtml(incRank)}</span>
                        ${incBranch ? `<span class="bond-aff-branch">${incBranch}</span>` : ''}
                        <span class="bond-aff-val">${incAff}</span>
                    </div>
                </div>
                ${isEditing ? `
                <div class="bond-note-editor">
                    <textarea class="bond-note-textarea" id="bond-note-input-${editKey}" maxlength="300"
                        placeholder="Cómo ve ${escapeHtml(myChar.name)} a ${otherName}…">${escapeHtml(myNote)}</textarea>
                    <div class="bond-note-actions">
                        <button class="bond-note-save btn-sm" data-from="${myFromId}" data-to="${myToId}">Guardar</button>
                        <button class="bond-note-cancel btn-sm btn-ghost" data-from="${myFromId}" data-to="${myToId}">Cancelar</button>
                    </div>
                </div>` : `
                <div class="bond-note-display" id="bond-note-display-${editKey}">
                    ${myNote
                        ? `<p class="bond-note-text">"${escapeHtml(myNote)}"</p>`
                        : `<p class="bond-note-empty">Sin nota todavía.</p>`}
                    <button class="bond-note-btn btn-sm btn-ghost" data-from="${myFromId}" data-to="${myToId}">
                        ✎ ${myNote ? 'Editar nota' : 'Añadir nota'}
                    </button>
                    ${out ? `<button class="bond-history-toggle" data-from="${myFromId}" data-to="${myToId}">▸ Ver historial</button>
                    <div class="bond-history-list" id="bond-hist-${editKey}" style="display:none;"></div>` : ''}
                </div>`}
            </div>
        </div>`;
    }

    // ── Edición de notas ──────────────────────────────────────────────
    function _startEditNote(fromId, toId, char) {
        _editingKey = `${fromId}_${toId}`;
        const panel = document.getElementById('bondsDetailPanel');
        if (panel && char) {
            panel.innerHTML = _renderDetailPanel(char);
            _bindDetailEvents(panel, char);
        }
    }

    function _cancelEdit(char) {
        _editingKey = null;
        const panel = document.getElementById('bondsDetailPanel');
        if (panel && char) {
            panel.innerHTML = _renderDetailPanel(char);
            _bindDetailEvents(panel, char);
        }
    }

    async function _saveNote(fromId, toId, char) {
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
            const bond = _bonds.outgoing.find(b =>
                String(b.from_char_id) === fromId && String(b.to_char_id) === toId
            );
            if (bond) bond.note = note;
            _editingKey = null;
            const panel = document.getElementById('bondsDetailPanel');
            if (panel && char) {
                panel.innerHTML = _renderDetailPanel(char);
                _bindDetailEvents(panel, char);
            }
        } else {
            if (btn) { btn.disabled = false; btn.textContent = 'Guardar'; }
            if (typeof showAutosave === 'function') showAutosave('Error al guardar la nota', 'error');
        }
    }

    // ── Historial ────────────────────────────────────────────────────
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
                // El historial no guarda relation_type, usamos el actual como aproximación
                const color = _rankColor(h.new_rank || '', outType);
                const date  = h.changed_at
                    ? new Date(h.changed_at).toLocaleDateString('es-ES', { day:'2-digit', month:'short', year:'2-digit' })
                    : '';
                const arrow = h.new_value > h.old_value ? '↑' : '↓';
                return `<div class="bond-history-entry">
                    <span class="bond-history-arrow">${arrow}</span>
                    <span class="bond-history-rank" style="--rank-color:${color}">${escapeHtml(h.new_rank || '')}</span>
                    <span style="opacity:0.4;font-size:0.67rem">${escapeHtml(String(h.old_value ?? ''))}→${escapeHtml(String(h.new_value ?? ''))}</span>
                    <span class="bond-history-date">${date}</span>
                </div>`;
            }).join('');
        }

        container.style.display = 'flex';
        btn.textContent = '▾ Historial';
    }

    // ── Realtime ─────────────────────────────────────────────────────
    window.addEventListener('etheria:bonds-changed', function () {
        const bondsSection = document.getElementById('bondsSection');
        if (bondsSection?.classList.contains('active')) {
            render();
            // Refrescar panel de detalle si está abierto
            if (_detailChar) {
                const panel = document.getElementById('bondsDetailPanel');
                if (panel) {
                    panel.innerHTML = _renderDetailPanel(_detailChar);
                    _bindDetailEvents(panel, _detailChar);
                }
            }
        }
    });

    return { render, toggleHistory };

})();

window.BondsUI = BondsUI;

