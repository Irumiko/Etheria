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
    function _isOnline(userId) {
        return typeof SupabasePresence !== 'undefined'
            && typeof SupabasePresence.isUserOnline === 'function'
            && SupabasePresence.isUserOnline(userId);
    }

    /**
     * Detecta qué participantes ya respondieron en el ciclo actual.
     * Recorre los mensajes hacia atrás y acumula user_ids únicos.
     * - Si ve un user_id repetido antes de completar el conjunto → corta (entramos en ciclo anterior).
     * - Si completa el conjunto completo → ciclo terminado, nadie sigue "oscurecido".
     * @param {Array} participants  Array de { user_id }
     * @returns {Set<string>}       user_ids que ya respondieron este ciclo
     */
    function _respondedThisCycle(participants) {
        const pIds = participants.map(p => p.user_id).filter(Boolean);
        if (!pIds.length) return new Set();
        const msgs = (global.appData?.messages?.[global.currentTopicId] || []);
        const responded = new Set();
        for (let i = msgs.length - 1; i >= 0; i--) {
            const uid = msgs[i]?.userId || msgs[i]?.user_id;
            if (!uid || !pIds.includes(uid)) continue;
            if (responded.has(uid)) break;          // repetición → ciclo anterior
            responded.add(uid);
            if (responded.size === pIds.length) {   // ciclo completo → reset
                responded.clear();
                break;
            }
        }
        return responded;
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

        // En modo RPG no hay botón de editar: los stats se gestionan inline con +/-/Confirmar
        const editBtn = d.isSelf && !isRpg
            ? `<button class="upm-edit-btn" id="upmEditToggleBtn" type="button" onclick="toggleProfileEdit()">Editar perfil</button>`
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

    // Deltas pendientes de confirmar: { [stat]: totalDelta }
    let _stagedDeltas = {};

    function _renderRpgStatBlock(d) {
        const { char, profile, freePoints } = d.rpgSheet;
        if (!char || !profile) return '';
        const stats   = (profile && profile.stats) || {};
        const canEdit = freePoints > 0;

        // Puntos gastados en la stage actual (solo subidas)
        const stagedCost = Object.values(_stagedDeltas).reduce((s, v) => s + Math.max(0, v), 0);
        const remaining  = freePoints - stagedCost;
        const hasPending = Object.values(_stagedDeltas).some(v => v !== 0);

        const rows = Object.entries(RPG_STAT_LABELS).map(([key, label]) => {
            const base    = stats[key] || 8;
            const staged  = _stagedDeltas[key] || 0;
            const val     = base + staged;
            const cid     = _esc(String(char.id));
            // El + solo aparece si quedan puntos libres; el − aparece si hay staged positivo en esa stat
            const minus = (canEdit && staged > 0)
                ? `<button class="upm-stat-adj upm-stat-adj--minus" onclick="upmStageStat('${cid}','${key}',-1)" aria-label="Reducir ${label}">−</button>`
                : '';
            const plus = (canEdit && remaining > 0)
                ? `<button class="upm-stat-adj upm-stat-adj--plus" onclick="upmStageStat('${cid}','${key}',1)" aria-label="Aumentar ${label}">+</button>`
                : '';
            const valClass = staged > 0 ? ' upm-rpg-stat-val--up' : '';
            return `<div class="upm-rpg-stat-row">
                <span class="upm-rpg-stat-name">${label}</span>
                ${minus}<span class="upm-rpg-stat-val${valClass}">${val}</span>${plus}
            </div>`;
        }).join('');

        const ptsEl = canEdit
            ? `<span class="upm-rpg-free-pts">${remaining} pts. libres</span>`
            : `<span class="upm-rpg-pts-done">Completo</span>`;

        const confirmBar = (canEdit && hasPending) ? `
            <div class="upm-rpg-confirm-bar">
                <button class="upm-rpg-btn upm-rpg-btn--cancel" onclick="upmCancelStats()">Cancelar</button>
                <button class="upm-rpg-btn upm-rpg-btn--confirm" onclick="upmConfirmStats('${_esc(String(char.id))}')">Confirmar</button>
            </div>` : '';

        return `
        <div id="upmRpgStatBlock" class="upm-rpg-stat-block">
            <div class="upm-divider upm-divider--rpg"></div>
            <div class="upm-rpg-stat-header">
                <span class="upm-rpg-stat-title">⚔ ${_esc(char.name || 'Personaje')}</span>
                ${ptsEl}
            </div>
            <div class="upm-rpg-stat-grid">${rows}</div>
            ${confirmBar}
        </div>`;
    }

    // ── Stage local de stats (no persiste hasta confirmar) ───

    function upmStageStat(charId, stat, delta) {
        if (!_cachedProfileData) return;
        _stagedDeltas[stat] = (_stagedDeltas[stat] || 0) + delta;
        _refreshStatBlock();
    }

    function upmConfirmStats(charId) {
        if (typeof adjustRpgStat !== 'function' || !_cachedProfileData) return;
        Object.entries(_stagedDeltas).forEach(([stat, delta]) => {
            if (delta !== 0) adjustRpgStat(charId, stat, delta);
        });
        _stagedDeltas = {};
        _refreshStatBlockFromProfile();
    }

    function upmCancelStats() {
        _stagedDeltas = {};
        _refreshStatBlock();
    }

    // Refresca solo el bloque de stats con datos actuales del cache
    function _refreshStatBlock() {
        if (!_cachedProfileData) return;
        const block = document.getElementById('upmRpgStatBlock');
        if (!block) return;
        const tmp = document.createElement('div');
        tmp.innerHTML = _renderRpgStatBlock(_cachedProfileData).trim();
        if (tmp.firstElementChild) block.replaceWith(tmp.firstElementChild);
    }

    // Recarga el rpgSheet desde datos reales (tras confirmar)
    function _refreshStatBlockFromProfile() {
        if (!_cachedProfileData) return;
        const topic = _currentTopic();
        if (!topic) { _refreshStatBlock(); return; }
        const char = _allChars().find(c => String(c.id) === String(_cachedProfileData.rpgSheet?.char?.id));
        if (char && typeof getRpgSheetData === 'function') {
            _cachedProfileData.rpgSheet = { char, ...getRpgSheetData(char, topic.id) };
        }
        _refreshStatBlock();
    }

    // ── Ajuste de stat desde el modal — mantenido para compat. ──
    // (ya no lo llama _renderRpgStatBlock; se usa staging en su lugar)
    function upmAdjustStat(charId, stat, delta) {
        upmStageStat(charId, stat, delta);
    }

    // ── Panel de party clásico ───────────────────────────────

    // El panel clásico es siempre visible cuando hay participantes (no hay toggle).
    function toggleClassicParty() { /* sin-op: panel siempre visible */ }

    function renderClassicParty(participants) {
        const shell = document.getElementById('classicPartyShell');
        const list  = document.getElementById('classicPartyList');
        if (!shell || !list) return;

        const topic       = _currentTopic();
        const isClassicMode = !_isRpg();
        // Mostrar el party clásico desde el primer mensaje — aunque solo esté
        // el personaje propio. La condición anterior requería participants.length > 0
        // lo que ocultaba el panel hasta que alguien respondía.
        shell.style.display = isClassicMode ? '' : 'none';
        if (!isClassicMode) return;
        // Si no hay participantes aún, mostrar solo el personaje propio como fallback
        if (!participants || !participants.length) {
            const ownChar = _getOwnChar();
            if (ownChar) {
                list.innerHTML = '<button type="button" class="cp-member cp-member--online"'
                    + ' onclick="if(typeof CharPopover!=='undefined'){CharPopover.toggle('' + String(ownChar.id) + '',this)}"'
                    + ' title="' + (ownChar.name || 'Tu personaje') + '">'
                    + '<span class="cp-name">' + (ownChar.name || '?') + '</span>'
                    + '</button>';
            } else {
                list.innerHTML = '';
            }
            return;
        }

        const lockMap    = topic
            ? Object.assign({}, topic.characterLocks || {}, topic.rpgCharacterLocks || {})
            : {};
        // Quién ha respondido en el ciclo actual (detección por historial de mensajes)
        const respondedSet = _respondedThisCycle(participants);

                // ── Estado de turno activo ──────────────────────────────────────────
        const turnMode      = topic?.turnMode || topic?.turn_mode || 'off';
        const turnQueue     = Array.isArray(topic?.turnOrder) ? topic.turnOrder : [];
        const activeTurnUid = turnMode !== 'off' && turnQueue.length > 0 ? turnQueue[0] : null;
        const myUid         = window._cachedUserId || null;

        // El orden NO cambia: participants ya viene ordenado por primer-mensaje (llegada)
        list.innerHTML = participants.map(p => {
            const charId    = lockMap[p.user_index] || lockMap[String(p.user_index)];
            const char      = charId ? _allChars().find(c => String(c.id) === String(charId)) : null;
            const name      = (char && char.name) || (p.profile && p.profile.name) || '?';
            const genderKey = (char && char.gender) || '';
            const gIcon     = GENDER_ICON[genderKey] || '';
            const online    = _isOnline(p.user_id);
            const responded = respondedSet.has(p.user_id);
            const isMyTurn  = activeTurnUid && p.user_id === activeTurnUid;
            const isMe      = p.user_id === myUid;
            const uid       = _esc(p.user_id || '');

            const classes = ['cp-member'];
            if (online)    classes.push('cp-member--online');
            if (responded) classes.push('cp-member--responded');
            if (isMyTurn)  classes.push('cp-member--active-turn');

            let statusIcon  = '';
            let statusTitle = '';
            if (isMyTurn) {
                statusIcon  = isMe ? '✦' : '▶';
                statusTitle = isMe ? 'Tu turno' : 'Turno activo';
            } else if (responded) {
                statusIcon  = '✓';
                statusTitle = 'Ya respondió';
            } else if (respondedSet.size > 0) {
                statusIcon  = '·';
                statusTitle = 'Esperando';
            }

            const cid = _esc(String(charId || ''));
            return `<button type="button" class="${classes.join(' ')}"
                        onclick="if(typeof CharPopover!=='undefined'){CharPopover.toggle('${cid}',this)}else{openUserProfileModal('${uid}')}"
                        title="${_esc(name)} · ${statusTitle || (online ? 'En línea' : 'Desconectado')}">
                <span class="cp-name">${_esc(name)}</span>
                ${gIcon ? `<span class="cp-gender" aria-label="${_esc(genderKey)}">${gIcon}</span>` : ''}
                ${statusIcon ? `<span class="cp-status-icon" aria-hidden="true">${statusIcon}</span>` : ''}
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
    global.upmStageStat          = upmStageStat;
    global.upmConfirmStats       = upmConfirmStats;
    global.upmCancelStats        = upmCancelStats;
    global.toggleClassicParty    = toggleClassicParty;
    global.renderClassicParty    = renderClassicParty;

    // Cerrar con Escape
    document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') {
            const overlay = document.getElementById('userProfileModal');
            if (overlay && overlay.style.display !== 'none') closeUserProfileModal();
        }
    });

    // Render inicial del party clásico cuando se cargan los participantes de la historia
    // (etheria:story-participants-loaded se emite en supabaseStories.js de forma async,
    //  antes de que renderVnPartyPanel se llame con la lista rellena)
    window.addEventListener('etheria:story-participants-loaded', function (e) {
        if (!_isRpg() && e.detail && e.detail.participants) {
            renderClassicParty(e.detail.participants);
        }
    });

    // Actualizar party clásico cuando cambia la presencia online (usuarios entran/salen)
    window.addEventListener('etheria:story-presence-changed', function () {
        if (!_isRpg() && global.currentStoryParticipants) {
            renderClassicParty(global.currentStoryParticipants);
        }
    });

}(window));

