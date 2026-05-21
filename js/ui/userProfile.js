// ============================================================
// Etheria — User Profile Modal + Classic Party Panel
// ============================================================
(function (global) {
    'use strict';

    // ── Helpers ──────────────────────────────────────────────
    const GENDER_ICON = { 'Femenino': '♀', 'Masculino': '♂', 'No Binario': '⚪' };
    const MAX_CHARS_SHOWN = 5;

    function _esc(s) { return typeof escapeHtml === 'function' ? escapeHtml(s) : String(s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }

    function _client() { return global.supabaseClient || null; }

    function _isRpg() { return document.body.classList.contains('mode-rpg'); }

    function _currentTopic() {
        if (!global.currentTopicId || !global.appData) return null;
        return (global.appData.topics || []).find(t => String(t.id) === String(global.currentTopicId)) || null;
    }

    // Devuelve true si el participante YA respondió (no es su turno)
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

    // ── Modal de perfil ──────────────────────────────────────

    let _currentProfileUserId = null;

    async function openUserProfileModal(userId) {
        if (!userId) return;
        _currentProfileUserId = userId;

        const overlay = document.getElementById('userProfileModal');
        const content = document.getElementById('upmContent');
        const card    = document.getElementById('upmCard');
        if (!overlay || !content || !card) return;

        // Modo temático
        card.className = 'upm-card' + (_isRpg() ? ' upm-card--rpg' : ' upm-card--classic');

        content.innerHTML = '<div class="upm-loading">Cargando perfil…</div>';
        overlay.style.display = 'flex';

        // Recopilar datos
        const data = await _buildProfileData(userId);
        content.innerHTML = _renderProfileHTML(data, userId);
    }

    function closeUserProfileModal() {
        const overlay = document.getElementById('userProfileModal');
        if (overlay) overlay.style.display = 'none';
        _currentProfileUserId = null;
    }

    async function _buildProfileData(userId) {
        const isSelf = String(userId) === String(global._cachedUserId);

        // Datos del participante desde currentStoryParticipants
        const participant = (global.currentStoryParticipants || [])
            .find(p => String(p.user_id) === String(userId)) || {};
        const profile = participant.profile || {};
        const displayName = profile.name || String(userId).slice(0, 8);

        // Personajes de este usuario en las historias compartidas
        const userChars = (global.appData && global.appData.characters ? global.appData.characters : [])
            .filter(c => {
                if (c.owner_user_id) return String(c.owner_user_id) === String(userId);
                return String(c.userIndex) === String(participant.user_index);
            })
            .map(c => ({ name: c.name, gender: c.gender || '' }));

        // Temas creados (query Supabase por created_by)
        let topicsCreated = 0;
        let modeClassic   = 0;
        let modeRpg       = 0;
        const client = _client();
        if (client) {
            try {
                const { data: stories } = await client
                    .from('stories')
                    .select('id, mode')
                    .eq('created_by', userId)
                    .limit(200);
                if (stories) {
                    topicsCreated = stories.length;
                    stories.forEach(s => {
                        if (s.mode === 'rpg') modeRpg++; else modeClassic++;
                    });
                }
            } catch (_) {}
        }

        // user_meta (género usuario, timezone, bio)
        let userMeta = {};
        if (client) {
            try {
                const { data: meta } = await client
                    .from('user_meta')
                    .select('gender, timezone, bio')
                    .eq('user_id', userId)
                    .maybeSingle();
                if (meta) userMeta = meta;
            } catch (_) {}
        }

        const preferredMode = modeRpg > modeClassic ? 'RPG' : (modeClassic > 0 || modeRpg > 0 ? 'Clásico' : null);

        return { displayName, avatarUrl: profile.avatar_url || '', isSelf, userChars, topicsCreated, preferredMode, modeClassic, modeRpg, userMeta };
    }

    function _renderProfileHTML(d, userId) {
        const isRpg   = _isRpg();
        const gIcon   = GENDER_ICON[d.userMeta.gender] || '';
        const tz      = d.userMeta.timezone || '';
        const bio     = d.userMeta.bio      || '';

        const charList = d.userChars.slice(0, MAX_CHARS_SHOWN);
        const charExtra = d.userChars.length - charList.length;
        const charText  = charList.length
            ? charList.map(c => `${_esc(c.name)}${c.gender ? ' ' + (GENDER_ICON[c.gender] || '') : ''}`).join(' · ')
              + (charExtra > 0 ? ` <span class="upm-extra">y ${charExtra} más</span>` : '')
            : '<em>Sin personajes conocidos</em>';

        const avatarEl = d.avatarUrl
            ? `<img class="upm-avatar" src="${_esc(d.avatarUrl)}" alt="${_esc(d.displayName)}">`
            : `<div class="upm-avatar upm-avatar--initials">${_esc((d.displayName[0] || '?').toUpperCase())}</div>`;

        const editBtn = d.isSelf
            ? `<button class="upm-edit-btn" type="button" onclick="openEditProfileModal()">Editar perfil</button>`
            : '';

        if (isRpg) {
            // ── Tema RPG: ficha de aventurero ──────────────────────────────
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
                    <span class="upm-stat-label">Modo</span>
                    <span class="upm-stat-value">${d.preferredMode || '—'}</span>
                </div>
            </div>
            <div class="upm-chars-row">
                <span class="upm-chars-label">Personajes</span>
                <span class="upm-chars-value">${charText}</span>
            </div>
            ${tz || bio ? `<div class="upm-divider upm-divider--rpg"></div>
            <div class="upm-meta-row">
                ${tz ? `<span class="upm-meta-item">🕐 ${_esc(tz)}</span>` : ''}
                ${bio ? `<p class="upm-bio">${_esc(bio)}</p>` : ''}
            </div>` : ''}`;
        } else {
            // ── Tema Clásico: pergamino narrativo ──────────────────────────
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
            ${tz || bio ? `<div class="upm-divider"></div>
            <div class="upm-meta-row">
                ${tz ? `<span class="upm-meta-item">🕐 ${_esc(tz)}</span>` : ''}
                ${bio ? `<p class="upm-bio">${_esc(bio)}</p>` : ''}
            </div>` : ''}
            <div class="upm-classic-ornament upm-classic-ornament--bottom">✦ ─── ─── ✦</div>`;
        }
    }

    // ── Editar perfil propio ─────────────────────────────────

    function openEditProfileModal() {
        const content = document.getElementById('upmContent');
        const card    = document.getElementById('upmCard');
        if (!content) return;
        card.className = 'upm-card upm-card--edit' + (_isRpg() ? ' upm-card--rpg' : ' upm-card--classic');
        content.innerHTML = `
        <h2 class="upm-edit-title">Mi perfil</h2>
        <div class="upm-edit-form">
            <label class="upm-edit-label">Género
                <select id="upmEditGender" class="upm-edit-select">
                    <option value="">Sin especificar</option>
                    <option value="Femenino">♀ Femenino</option>
                    <option value="Masculino">♂ Masculino</option>
                    <option value="No Binario">⚪ No binario</option>
                </select>
            </label>
            <label class="upm-edit-label">Zona horaria
                <input id="upmEditTz" class="upm-edit-input" type="text" placeholder="Ej: Europe/Madrid" maxlength="60">
            </label>
            <label class="upm-edit-label">Bio <span class="upm-edit-hint">(máx. 160 caracteres)</span>
                <textarea id="upmEditBio" class="upm-edit-textarea" maxlength="160" rows="3" placeholder="Algo sobre ti…"></textarea>
            </label>
            <div class="upm-edit-actions">
                <button class="upm-edit-save" type="button" onclick="saveUserMeta()">Guardar</button>
                <button class="upm-edit-cancel" type="button" onclick="openUserProfileModal('${_esc(global._cachedUserId || '')}')">Cancelar</button>
            </div>
        </div>`;

        // Pre-rellenar con datos actuales
        const client = _client();
        if (client && global._cachedUserId) {
            client.from('user_meta').select('gender,timezone,bio').eq('user_id', global._cachedUserId).maybeSingle()
                .then(({ data }) => {
                    if (!data) return;
                    const g = document.getElementById('upmEditGender');
                    const t = document.getElementById('upmEditTz');
                    const b = document.getElementById('upmEditBio');
                    if (g) g.value = data.gender || '';
                    if (t) t.value = data.timezone || '';
                    if (b) b.value = data.bio || '';
                }).catch(() => {});
        }
    }

    async function saveUserMeta() {
        const userId = global._cachedUserId;
        if (!userId) { if (typeof showAutosave === 'function') showAutosave('No estás autenticado', 'error'); return; }
        const gender   = (document.getElementById('upmEditGender') || {}).value || '';
        const timezone = ((document.getElementById('upmEditTz') || {}).value || '').trim();
        const bio      = ((document.getElementById('upmEditBio') || {}).value || '').trim();

        const client = _client();
        if (!client) { if (typeof showAutosave === 'function') showAutosave('Sin conexión', 'error'); return; }

        try {
            const { error } = await client.from('user_meta').upsert(
                { user_id: userId, gender, timezone, bio, updated_at: new Date().toISOString() },
                { onConflict: 'user_id' }
            );
            if (error) throw error;
            if (typeof showAutosave === 'function') showAutosave('✓ Perfil guardado', 'saved');
            openUserProfileModal(userId); // volver a vista de lectura
        } catch (e) {
            if (typeof showAutosave === 'function') showAutosave('Error al guardar: ' + (e.message || e), 'error');
        }
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

        const topic = _currentTopic();
        const isClassicMode = !_isRpg();
        shell.style.display = isClassicMode && participants && participants.length > 0 ? '' : 'none';
        if (!isClassicMode || !participants || !participants.length) return;

        const lockMap = topic
            ? Object.assign({}, topic.characterLocks || {}, topic.rpgCharacterLocks || {})
            : {};

        list.innerHTML = participants.map(p => {
            const charId = lockMap[p.user_index] || lockMap[String(p.user_index)];
            const char   = charId
                ? (global.appData && global.appData.characters ? global.appData.characters : []).find(c => String(c.id) === String(charId))
                : null;

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
    global.openEditProfileModal  = openEditProfileModal;
    global.saveUserMeta          = saveUserMeta;
    global.toggleClassicParty    = toggleClassicParty;
    global.renderClassicParty    = renderClassicParty;

    // Cerrar con Escape
    document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape' && document.getElementById('userProfileModal') && document.getElementById('userProfileModal').style.display !== 'none') {
            closeUserProfileModal();
        }
    });

    // Escuchar cambios de participantes para actualizar el panel clásico
    window.addEventListener('etheria:story-presence-changed', function () {
        if (!_isRpg() && global.currentStoryParticipants) {
            renderClassicParty(global.currentStoryParticipants);
        }
    });

}(window));
