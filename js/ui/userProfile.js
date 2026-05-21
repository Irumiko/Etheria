// ============================================================
// Etheria — User Profile Modal + Classic Party Panel
// ============================================================
(function (global) {
    'use strict';

    // ── Constantes ───────────────────────────────────────────
    const GENDER_ICON    = { 'Femenino': '♀', 'Masculino': '♂', 'No Binario': '⚪' };
    const RPG_STAT_LABELS = { str: 'FUE', dex: 'DES', con: 'CON', int: 'INT', wis: 'SAB', cha: 'CAR' };
    const MAX_CHARS_SHOWN = 5;

    // ── Helpers ──────────────────────────────────────────────
    function _esc(s) {
        return typeof escapeHtml === 'function'
            ? escapeHtml(s)
            : String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    }
    function _client()  { return global.supabaseClient || null; }
    function _isRpg()   { return document.body.classList.contains('mode-rpg'); }
    function _currentTopic() {
        if (!global.currentTopicId || !global.appData) return null;
        return (global.appData.topics || []).find(t => String(t.id) === String(global.currentTopicId)) || null;
    }
    function _hasResponded(userId) {
        const topic = _currentTopic();
        if (!topic || !topic.turnOrder || !topic.turnOrder.length) return false;
        return String(topic.turnOrder[0]) !== String(userId);
    }
    function _isOnline(userId) {
        return typeof SupabasePresence !== 'undefined'
            && typeof SupabasePresence.isUserOnline === 'function'
            && SupabasePresence.isUserOnline(userId);
    }
    function _allChars() {
        return global.appData && global.appData.characters ? global.appData.characters : [];
    }

    // ── Estado del modal ─────────────────────────────────────
    let _currentProfileUserId = null;
    let _cachedProfileData    = null;

    // ── Apertura y cierre ────────────────────────────────────

    async function openUserProfileModal(userId) {
        if (!userId) return;
        _currentProfileUserId = userId;

        const overlay = document.getElementById('userProfileModal');
        const content = document.getElementById('upmContent');
        const card    = document.getElementById('upmCard');
        if (!overlay || !content || !card) return;

        card.className = 'upm-card' + (_isRpg() ? ' upm-card--rpg' : ' upm-card--classic');

        content.innerHTML = '<div class="upm-loading">Cargando perfil…</div>';
        overlay.style.display = 'flex';

        const data = await _buildProfileData(userId);
        _cachedProfileData = data;
        content.innerHTML = _renderProfileHTML(data, userId);
    }

    function closeUserProfileModal() {
        const overlay = document.getElementById('userProfileModal');
        if (overlay) overlay.style.display = 'none';
        _currentProfileUserId = null;
        _cachedProfileData    = null;
    }

    // ── Construcción de datos ────────────────────────────────

    async function _buildProfileData(userId) {
        const isSelf     = String(userId) === String(global._cachedUserId);
        const participant = (global.currentStoryParticipants || [])
            .find(p => String(p.user_id) === String(userId)) || {};
        const profile     = participant.profile || {};
        const displayName = profile.name || String(userId).slice(0, 8);

        const userChars = _allChars()
            .filter(c => {
                if (c.owner_user_id) return String(c.owner_user_id) === String(userId);
                return String(c.userIndex) === String(participant.user_index);
            })
            .map(c => ({ id: c.id, name: c.name, gender: c.gender || '' }));

        // Historias creadas
        let topicsCreated = 0, modeClassic = 0, modeRpg = 0;
        const client = _client();
        if (client) {
            try {
                const { data: stories } = await client
                    .from('stories').select('id, mode').eq('created_by', userId).limit(200);
                if (stories) {
                    topicsCreated = stories.length;
                    stories.forEach(s => { if (s.mode === 'rpg') modeRpg++; else modeClassic++; });
                }
            } catch (_) {}
        }

        // Meta de usuario (género, timezone, bio)
        let userMeta = {};
        if (client) {
            try {
                const { data: meta } = await client
                    .from('user_meta').select('gender, timezone, bio').eq('user_id', userId).maybeSingle();
                if (meta) userMeta = meta;
            } catch (_) {}
        }

        // Hoja RPG del personaje bloqueado en el topic actual (solo si es self)
        let rpgSheet = null;
        if (isSelf && typeof getRpgSheetData === 'function') {
            const topic = _currentTopic();
            if (topic) {
                const myParticipant = (global.currentStoryParticipants || [])
                    .find(p => String(p.user_id) === String(userId));
                if (myParticipant) {
                    const lockMap = Object.assign({}, topic.characterLocks || {}, topic.rpgCharacterLocks || {});
                    const charId  = lockMap[myParticipant.user_index] || lockMap[String(myParticipant.user_index)];
                    if (charId) {
                        const char = _allChars().find(c => String(c.id) === String(charId));
                        if (char) rpgSheet = { char, ...getRpgSheetData(char, topic.id) };
                    }
                }
            }
        }

        const preferredMode = modeRpg > modeClassic ? 'RPG' : (modeClassic > 0 || modeRpg > 0 ? 'Clásico' : null);
        return { displayName, avatarUrl: profile.avatar_url || '', isSelf, userChars, topicsCreated, preferredMode, modeClassic, modeRpg, userMeta, rpgSheet };
    }

    // ── Render del perfil completo ───────────────────────────

    function _renderProfileHTML(d, userId) {
        const isRpg  = _isRpg();
        const gIcon  = GENDER_ICON[d.userMeta.gender] || '';
        const tz     = d.userMeta.timezone || '';
        const bio    = d.userMeta.bio      || '';

        const charList  = d.userChars.slice(0, MAX_CHARS_SHOWN);
        const charExtra = d.userChars.length - charList.length;
        const charText  = charList.length
            ? charList.map(c => `${_esc(c.name)}${c.gender ? ' ' + (GENDER_ICON[c.gender] || '') : ''}`).join(' · ')
              + (charExtra > 0 ? ` <span class="upm-extra">y ${charExtra} más</span>` : '')
            : '<em>Sin personajes conocidos</em>';

        const avatarEl = d.avatarUrl
            ? `<img class="upm-avatar" src="${_esc(d.avatarUrl)}" alt="${_esc(d.displayName)}">`
            : `<div class="upm-avatar upm-avatar--initials">${_esc((d.displayName[0] || '?').toUpperCase())}</div>`;

        const editBtnLabel = isRpg ? '✎ Editar' : 'Editar perfil';
        const editBtn = d.isSelf
            ? `<button class="upm-edit-btn" id="upmEditToggleBtn" type="button" onclick="toggleProfileEdit()">${editBtnLabel}</button>`
            : '';

        const metaSection = (tz || bio) ? `
        <div class="upm-meta-row">
            ${tz  ? `<span class="upm-meta-item">🕐 ${_esc(tz)}</span>` : ''}
            ${bio ? `<p class="upm-bio">${_esc(bio)}</p>` : ''}
        </div>` : '';

        // Formulario de edición inline (oculto hasta que el usuario lo abra)
        const editSection   = d.isSelf ? _renderEditSection(d) : '';
        // Stats RPG: solo en modo RPG, solo para self, y solo si hay hoja
        const rpgStatsBlock = (isRpg && d.isSelf && d.rpgSheet) ? _renderRpgStatBlock(d) : '';

        if (isRpg) {
            return `
            <div class="upm-rpg-header">
                <span class="upm-rpg-kicker">⚔ Ficha de aventurero</span>
            </div>
            <div class="upm-identity">
                ${avatarEl}
                <div class="upm-identity-text">
                    <div class="upm-name" id="upmName">${_esc(d.displayName)}</div>
                    ${gIcon ? `<div class="upm-gender-badge">${gIcon} ${_esc(d.userMeta.gender || '')}</div>` : ''}
                </div>
                ${editBtn}
            </div>
            <div class="upm-divider upm-divider--rpg"></div>
            <div class="upm-stats-grid">
                <div class="upm-stat">
                    <span class="upm-stat-label">Aventuras</span>
                    <span class="upm-stat-value">${d.topicsCreated}</span>
                </div>
                <div class="upm-stat">
                    <span class="upm-stat-label">Modo favorito</span>
                    <span class="upm-stat-value">${d.preferredMode || '—'}</span>
                </div>
            </div>
            <div class="upm-chars-row">
                <span class="upm-chars-label">Personajes</span>
                <span class="upm-chars-value">${charText}</span>
            </div>
            ${metaSection ? `<div class="upm-divider upm-divider--rpg"></div>${metaSection}` : ''}
            ${rpgStatsBlock}
            ${editSection}`;
        } else {
            return `
            <div class="upm-classic-ornament upm-classic-ornament--top">✦ ─── ─── ✦</div>
            <div class="upm-identity">
                ${avatarEl}
                <div class="upm-identity-text">
                    <div class="upm-name" id="upmName">${_esc(d.displayName)}</div>
                    ${gIcon ? `<div class="upm-gender-badge">${gIcon} ${_esc(d.userMeta.gender || '')}</div>` : ''}
                </div>
                ${editBtn}
            </div>
            <div class="upm-divider"></div>
            <div class="upm-stats-grid">
                <div class="upm-stat">
                    <span class="upm-stat-label">Temas creados</span>
                    <span class="upm-stat-value">${d.topicsCreated}</span>
                </div>
                <div class="upm-stat">
                    <span class="upm-stat-label">Modo favorito</span>
                    <span class="upm-stat-value">${d.preferredMode || '—'}</span>
                </div>
            </div>
            <div class="upm-chars-row">
                <span class="upm-chars-label">Personajes</span>
                <span class="upm-chars-value">${charText}</span>
            </div>
            ${metaSection ? `<div class="upm-divider"></div>${metaSection}` : ''}
            ${editSection}
            <div class="upm-classic-ornament upm-classic-ornament--bottom">✦ ─── ─── ✦</div>`;
        }
    }

    // ── Formulario de edición inline ─────────────────────────

    function _renderEditSection(d) {
        const g = d.userMeta.gender   || '';
        const t = _esc(d.userMeta.timezone || '');
        const b = _esc(d.userMeta.bio      || '');
        const divClass = _isRpg() ? 'upm-divider upm-divider--rpg' : 'upm-divider';
        return `
        <div id="upmEditSection" class="upm-edit-section" style="display:none;" aria-hidden="true">
            <div class="${divClass}"></div>
            <div class="upm-edit-form">
                <label class="upm-edit-label">Género
                    <select id="upmEditGender" class="upm-edit-select">
                        <option value="">Sin especificar</option>
                        <option value="Femenino"  ${g === 'Femenino'   ? 'selected' : ''}>♀ Femenino</option>
                        <option value="Masculino" ${g === 'Masculino'  ? 'selected' : ''}>♂ Masculino</option>
                        <option value="No Binario"${g === 'No Binario' ? 'selected' : ''}>⚪ No binario</option>
                    </select>
                </label>
                <label class="upm-edit-label">Zona horaria
                    <input id="upmEditTz" class="upm-edit-input" type="text"
                           placeholder="Ej: Europe/Madrid" maxlength="60" value="${t}">
                </label>
                <label class="upm-edit-label">Bio <span class="upm-edit-hint">(máx. 160 caracteres)</span>
                    <textarea id="upmEditBio" class="upm-edit-textarea"
                              maxlength="160" rows="3" placeholder="Algo sobre ti…">${b}</textarea>
                </label>
                <div class="upm-edit-actions">
                    <button class="upm-edit-save"   type="button" onclick="saveUserMeta()">Guardar</button>
                    <button class="upm-edit-cancel" type="button" onclick="toggleProfileEdit()">Cancelar</button>
                </div>
            </div>
        </div>`;
    }

    // ── Toggle de edición inline ─────────────────────────────

    function toggleProfileEdit() {
        const section = document.getElementById('upmEditSection');
        const btn     = document.getElementById('upmEditToggleBtn');
        if (!section) return;
        const isOpen  = section.style.display !== 'none';
        section.style.display = isOpen ? 'none' : '';
        section.setAttribute('aria-hidden', String(isOpen));
        if (btn) btn.textContent = isOpen ? (_isRpg() ? '✎ Editar' : 'Editar perfil') : 'Cancelar';
    }

    // ── Guardar meta ─────────────────────────────────────────

    async function saveUserMeta() {
        const userId = global._cachedUserId;
        if (!userId) { if (typeof showAutosave === 'function') showAutosave('No estás autenticado', 'error'); return; }
        const gender   = (document.getElementById('upmEditGender') || {}).value || '';
        const timezone = ((document.getElementById('upmEditTz')    || {}).value || '').trim();
        const bio      = ((document.getElementById('upmEditBio')   || {}).value || '').trim();
        const client   = _client();
        if (!client) { if (typeof showAutosave === 'function') showAutosave('Sin conexión', 'error'); return; }

        try {
            const { error } = await client.from('user_meta').upsert(
                { user_id: userId, gender, timezone, bio, updated_at: new Date().toISOString() },
                { onConflict: 'user_id' }
            );
            if (error) throw error;
            if (typeof showAutosave === 'function') showAutosave('✓ Perfil guardado', 'saved');
            openUserProfileModal(userId);   // recarga vista de lectura
        } catch (e) {
            if (typeof showAutosave === 'function') showAutosave('Error al guardar: ' + (e.message || e), 'error');
        }
    }

    // ── Stats RPG inline ─────────────────────────────────────

    function _renderRpgStatBlock(d) {
        const { char, profile, freePoints } = d.rpgSheet;
        const stats   = (profile && profile.stats) || {};
        const canEdit = freePoints > 0;

        const rows = Object.entries(RPG_STAT_LABELS).map(([key, label]) => {
            const val  = stats[key] || 8;
            const cid  = _esc(String(char.id));
            const minus = canEdit
                ? `<button class="upm-stat-adj upm-stat-adj--minus" onclick="upmAdjustStat('${cid}','${key}',-1)" aria-label="Reducir ${label}">−</button>`
                : '';
            const plus = canEdit
                ? `<button class="upm-stat-adj upm-stat-adj--plus" onclick="upmAdjustStat('${cid}','${key}',1)" aria-label="Aumentar ${label}">+</button>`
                : '';
            return `<div class="upm-rpg-stat-row">
                <span class="upm-rpg-stat-name">${label}</span>
                ${minus}<span class="upm-rpg-stat-val">${val}</span>${plus}
            </div>`;
        }).join('');

        const ptsEl = freePoints > 0
            ? `<span class="upm-rpg-free-pts">${freePoints} pts. libres</span>`
            : `<span class="upm-rpg-pts-done">Completo</span>`;

        return `
        <div id="upmRpgStatBlock" class="upm-rpg-stat-block">
            <div class="upm-divider upm-divider--rpg"></div>
            <div class="upm-rpg-stat-header">
                <span class="upm-rpg-stat-title">⚔ ${_esc(char.name || 'Personaje')}</span>
                ${ptsEl}
            </div>
            <div class="upm-rpg-stat-grid">${rows}</div>
        </div>`;
    }

    // ── Ajuste de stat desde el modal (sin recargar red) ─────

    function upmAdjustStat(charId, stat, delta) {
        if (typeof adjustRpgStat !== 'function' || !_cachedProfileData) return;
        adjustRpgStat(charId, stat, delta);

        // Actualizar rpgSheet del cache con datos en memoria
        const topic = _currentTopic();
        if (!topic) return;
        const char = _allChars().find(c => String(c.id) === String(charId));
        if (!char || typeof getRpgSheetData !== 'function') return;
        _cachedProfileData.rpgSheet = { char, ...getRpgSheetData(char, topic.id) };

        // Reemplazar solo el bloque de stats en el DOM
        const block = document.getElementById('upmRpgStatBlock');
        if (!block) return;
        const tmp = document.createElement('div');
        tmp.innerHTML = _renderRpgStatBlock(_cachedProfileData).trim();
        if (tmp.firstElementChild) block.replaceWith(tmp.firstElementChild);
    }

    // ── Panel de party clásico ───────────────────────────────

    let _classicPartyOpen = false;

    function toggleClassicParty() {
        _classicPartyOpen = !_classicPartyOpen;
        const shell = document.getElementById('classicPartyShell');
        const tab   = document.getElementById('classicPartyTab');
        if (!shell) return;
        shell.classList.toggle('open', _classicPartyOpen);
        if (tab) tab.setAttribute('aria-expanded', String(_classicPartyOpen));
    }

    function renderClassicParty(participants) {
        const shell = document.getElementById('classicPartyShell');
        const list  = document.getElementById('classicPartyList');
        if (!shell || !list) return;

        const topic       = _currentTopic();
        const isClassicMode = !_isRpg();
        shell.style.display = isClassicMode && participants && participants.length > 0 ? '' : 'none';
        if (!isClassicMode || !participants || !participants.length) return;

        const lockMap = topic
            ? Object.assign({}, topic.characterLocks || {}, topic.rpgCharacterLocks || {})
            : {};

        list.innerHTML = participants.map(p => {
            const charId = lockMap[p.user_index] || lockMap[String(p.user_index)];
            const char   = charId ? _allChars().find(c => String(c.id) === String(charId)) : null;

            const name      = (char && char.name) || (p.profile && p.profile.name) || '?';
            const genderKey = (char && char.gender) || '';
            const gIcon     = GENDER_ICON[genderKey] || '';
            const online    = _isOnline(p.user_id);
            const responded = _hasResponded(p.user_id);
            const uid       = _esc(p.user_id || '');

            return `<button type="button" class="cp-member${responded ? ' cp-member--responded' : ''}"
                        onclick="openUserProfileModal('${uid}')"
                        title="${_esc(name)}${responded ? ' · Ya respondió' : ' · Esperando turno'}">
                <span class="cp-dot${online ? ' cp-dot--online' : ''}"></span>
                <span class="cp-name">${_esc(name)}</span>
                ${gIcon ? `<span class="cp-gender" aria-label="${_esc(genderKey)}">${gIcon}</span>` : ''}
            </button>`;
        }).join('');
    }

    // ── Expose globals ───────────────────────────────────────
    global.openUserProfileModal  = openUserProfileModal;
    global.closeUserProfileModal = closeUserProfileModal;
    global.openEditProfileModal  = toggleProfileEdit;   // alias de compatibilidad
    global.saveUserMeta          = saveUserMeta;
    global.toggleProfileEdit     = toggleProfileEdit;
    global.upmAdjustStat         = upmAdjustStat;
    global.toggleClassicParty    = toggleClassicParty;
    global.renderClassicParty    = renderClassicParty;

    // Cerrar con Escape
    document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') {
            const overlay = document.getElementById('userProfileModal');
            if (overlay && overlay.style.display !== 'none') closeUserProfileModal();
        }
    });

    // Actualizar party clásico cuando cambian los participantes
    window.addEventListener('etheria:story-presence-changed', function () {
        if (!_isRpg() && global.currentStoryParticipants) {
            renderClassicParty(global.currentStoryParticipants);
        }
    });

}(window));
