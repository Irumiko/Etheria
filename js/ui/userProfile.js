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
        // currentTopicId y appData son `let` en state.js — closure directo
        if (typeof currentTopicId === 'undefined' || !currentTopicId) return null;
        if (typeof appData === 'undefined' || !appData) return null;
        return (appData.topics || []).find(t => String(t.id) === String(currentTopicId)) || null;
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
        const msgs = (typeof appData !== 'undefined' && appData?.messages?.[currentTopicId] || []);
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
    // appData y selectedCharId son `let` en state.js — no están en window,
    // se acceden por closure directo (no via global.xxx).
    function _allChars() {
        return typeof appData !== 'undefined' && appData && appData.characters ? appData.characters : [];
    }
    function _getOwnChar() {
        const topic = _currentTopic();
        const myUid = global._cachedUserId;
        // Prioridad: selectedCharId por closure (es `let`, no está en window)
        if (typeof selectedCharId !== 'undefined' && selectedCharId) {
            return _allChars().find(c => String(c.id) === String(selectedCharId)) || null;
        }
        if (!topic) return null;
        const lockMap = Object.assign({}, topic.characterLocks || {}, topic.rpgCharacterLocks || {});
        // Por currentUserIndex (también `let` en state.js)
        const myIndex = typeof currentUserIndex !== 'undefined' ? currentUserIndex : null;
        if (myIndex != null) {
            const charId = lockMap[myIndex] || lockMap[String(myIndex)];
            if (charId) return _allChars().find(c => String(c.id) === String(charId)) || null;
        }
        // Por owner_user_id
        if (myUid) {
            const lockValues = Object.values(lockMap).map(String);
            return _allChars().find(c => c.owner_user_id === myUid && lockValues.includes(String(c.id))) || null;
        }
        return null;
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
        const participant = ((typeof currentStoryParticipants !== 'undefined' ? currentStoryParticipants : null) || [])
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
                const myParticipant = ((typeof currentStoryParticipants !== 'undefined' ? currentStoryParticipants : null) || [])
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

        if (_isRpg()) { shell.style.display = 'none'; return; }

        const topic    = _currentTopic();
        const myUid    = global._cachedUserId || null;
        const lockMap  = topic ? Object.assign({}, topic.characterLocks || {}, topic.rpgCharacterLocks || {}) : {};
        const allChars = _allChars();
        const lockValues = Object.values(lockMap).map(String);

        // ── Construir lista de entradas { char, userId } sin duplicados ──────
        const entries    = [];
        const seenCids   = new Set();

        function _addChar(char, userId) {
            if (!char) return;
            const cid = String(char.id);
            if (seenCids.has(cid)) return;
            seenCids.add(cid);
            entries.push({ char, userId: userId || null });
        }

        // selectedCharId: primero vnStore (window), luego closure, luego localStorage
        const _selCharId = (global.vnStore && global.vnStore.get().selectedCharId)
            || (typeof selectedCharId !== 'undefined' ? selectedCharId : null)
            || (function() {
                try {
                    const idx = typeof currentUserIndex !== 'undefined' ? currentUserIndex : 0;
                    return localStorage.getItem('etheria_selected_char_' + idx);
                } catch(e) { return null; }
            })();

        // 1. Personaje propio por selectedCharId (máxima prioridad)
        if (_selCharId) {
            const c = allChars.find(ch => String(ch.id) === String(_selCharId));
            _addChar(c, myUid);
        }

        // 2. Participantes (cloud o local)
        if (Array.isArray(participants) && participants.length > 0) {
            participants.forEach(function(p) {
                if (!p) return;
                // 2a. Por lockMap + user_index
                if (p.user_index != null) {
                    const cid = lockMap[p.user_index] || lockMap[String(p.user_index)];
                    if (cid) {
                        const c = allChars.find(ch => String(ch.id) === String(cid));
                        _addChar(c, p.user_id); return;
                    }
                }
                if (!p.user_id) return;
                // 2b. Usuario propio por selectedCharId
                if (p.user_id === myUid && _selCharId) {
                    const c = allChars.find(ch => String(ch.id) === String(_selCharId));
                    _addChar(c, myUid); return;
                }
                // 2c. Por owner_user_id cruzado con lockMap
                const inLock = allChars.find(ch => ch.owner_user_id === p.user_id && lockValues.includes(String(ch.id)));
                if (inLock) { _addChar(inLock, p.user_id); return; }
                // 2d. Cualquier personaje del usuario (sin restricción de lockMap)
                const anyChar = allChars.find(ch => ch.owner_user_id === p.user_id);
                if (anyChar) _addChar(anyChar, p.user_id);
            });
        }

        // 3. Fallback final: todos los personajes en lockMap si aún no hay nada
        if (entries.length === 0 && lockValues.length > 0) {
            lockValues.forEach(function(cid) {
                const c = allChars.find(ch => String(ch.id) === cid);
                _addChar(c, c && c.owner_user_id ? c.owner_user_id : null);
            });
        }

        shell.style.display = entries.length > 0 ? '' : 'none';
        list.innerHTML = '';
        if (entries.length === 0) return;

        // ── Estado de turno y ciclo ──────────────────────────────────────────
        const respondedSet  = Array.isArray(participants) && participants.length > 0
            ? _respondedThisCycle(participants) : new Set();
        const turnMode      = topic?.turnMode || topic?.turn_mode || 'off';
        const turnQueue     = Array.isArray(topic?.turnOrder) ? topic.turnOrder : [];
        const activeTurnUid = turnMode !== 'off' && turnQueue.length > 0 ? turnQueue[0] : null;

        entries.forEach(function({ char, userId }) {
            const btn      = document.createElement('button');
            btn.type       = 'button';
            const name     = char.name || '?';
            const online   = _isOnline(userId);
            const responded = userId ? respondedSet.has(userId) : false;
            const isMyTurn = !!(activeTurnUid && userId === activeTurnUid);
            const isMe     = userId === myUid;

            const classes = ['cp-member'];
            if (online)    classes.push('cp-member--online');
            if (responded) classes.push('cp-member--responded');
            if (isMyTurn)  classes.push('cp-member--active-turn');
            btn.className = classes.join(' ');

            let statusIcon = '';
            if (isMyTurn)        statusIcon = isMe ? '✦' : '▶';
            else if (responded)  statusIcon = '✓';
            else if (respondedSet.size > 0) statusIcon = '·';

            const gIcon = GENDER_ICON[char.gender] || '';
            btn.title = name + (isMyTurn ? ' · ' + (isMe ? 'Tu turno' : 'Turno activo') : '');
            btn.dataset.charId = String(char.id);
            if (userId) btn.dataset.userId = userId;

            const spanName = document.createElement('span');
            spanName.className = 'cp-name';
            spanName.textContent = name;
            btn.appendChild(spanName);

            if (gIcon) {
                const spanG = document.createElement('span');
                spanG.className = 'cp-gender';
                spanG.setAttribute('aria-label', char.gender || '');
                spanG.textContent = gIcon;
                btn.appendChild(spanG);
            }
            if (statusIcon) {
                const spanS = document.createElement('span');
                spanS.className = 'cp-status-icon';
                spanS.setAttribute('aria-hidden', 'true');
                spanS.textContent = statusIcon;
                btn.appendChild(spanS);
            }

            btn.addEventListener('click', function() {
                // RPG + personaje propio + puntos libres → abrir modal de distribución directamente
                if (_isRpg() && isMe && typeof getRpgSheetData === 'function') {
                    const topicId = (typeof currentTopicId !== 'undefined' ? currentTopicId : null)
                        || (window.vnStore && window.vnStore.get().topicId);
                    if (topicId) {
                        const sheet = getRpgSheetData(char, topicId);
                        if (sheet && sheet.freePoints > 0) {
                            if (typeof openUserProfileModal === 'function') openUserProfileModal(userId);
                            return;
                        }
                    }
                }
                if (typeof CharPopover !== 'undefined') {
                    CharPopover.toggle(String(char.id), btn);
                } else if (userId && typeof openUserProfileModal === 'function') {
                    openUserProfileModal(userId);
                }
            });

            list.appendChild(btn);
        });
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
        if (!_isRpg() && typeof currentStoryParticipants !== 'undefined' && currentStoryParticipants) {
            renderClassicParty(currentStoryParticipants);
        }
    });

}(window));

