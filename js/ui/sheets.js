// Fichas de personaje (vista detallada).
// FICHA DE PERSONAJE
// ============================================
const RPG_BASE_STATS = Object.freeze({ STR: 5, VIT: 5, INT: 5, AGI: 5 });
const RPG_POINTS_POOL = 14;
const RPG_HP_MAX = 10;
const RPG_EXP_PER_LEVEL = 10;

function getRpgTitleByLevel(level) {
    if (level >= 7) return 'Maestro';
    if (level >= 4) return 'Adepto';
    return 'Aprendiz';
}

function sanitizeRpgProfile(raw) {
    const existingStats = raw?.stats || {};
    const profile = {
        stats: {
            STR: Math.max(0, Number(existingStats.STR) || 0),
            VIT: Math.max(0, Number(existingStats.VIT) || 0),
            INT: Math.max(0, Number(existingStats.INT) || 0),
            AGI: Math.max(0, Number(existingStats.AGI) || 0)
        },
        hp: Math.max(0, Math.min(RPG_HP_MAX, Number(raw?.hp) || RPG_HP_MAX)),
        exp: Math.max(0, Math.min(RPG_EXP_PER_LEVEL - 1, Number(raw?.exp) || 0)),
        level: Math.max(1, Number(raw?.level) || 1),
        knockedOutTurns: Math.max(0, Number(raw?.knockedOutTurns) || 0)
    };

    const spent = profile.stats.STR + profile.stats.VIT + profile.stats.INT + profile.stats.AGI;
    if (spent > RPG_POINTS_POOL) {
        const overflow = spent - RPG_POINTS_POOL;
        profile.stats.AGI = Math.max(0, profile.stats.AGI - overflow);
    }
    return profile;
}

function ensureCharacterRpgProfile(char, topicId = null) {
    if (!char) return null;

    const baseProfile = sanitizeRpgProfile(char.rpgProfile || {});
    char.rpgProfile = baseProfile;

    const activeTopicId = topicId || currentTopicId;
    const topic = appData.topics.find((t) => String(t.id) === String(activeTopicId));
    if (!topic || topic.mode !== 'rpg') {
        return baseProfile;
    }

    topic.rpgProfiles = topic.rpgProfiles || {};
    const topicSeedProfile = topic.rpgProfiles[char.id] || {
        stats: baseProfile.stats,
        hp: RPG_HP_MAX,
        exp: 0,
        level: 1,
        knockedOutTurns: 0
    };
    topic.rpgProfiles[char.id] = sanitizeRpgProfile(topicSeedProfile);
    return topic.rpgProfiles[char.id];
}

function getRpgSpentPoints(profile) {
    if (!profile || !profile.stats) return 0;
    return ['STR', 'VIT', 'INT', 'AGI'].reduce((sum, key) => sum + (Number(profile.stats[key]) || 0), 0);
}

function openSheet(id) {
    currentSheetCharId = id;
    const c = appData.characters.find(ch => String(ch.id) === String(id));
    if(!c) return;

    // Avatar con color de borde del personaje
    const sheetAvatar = document.getElementById('sheetAvatar');
    if (sheetAvatar) {
        const color = c.color || 'var(--accent-gold)';
        sheetAvatar.style.setProperty('--sheet-char-color', color);
        // XSS fix: DOM creation avoids c.name[0] injection in onerror attribute
        sheetAvatar.innerHTML = '';
        if (c.avatar) {
            const _imgSheet = document.createElement('img');
            _imgSheet.src = c.avatar;
            _imgSheet.alt = c.name;
            _imgSheet.onerror = function () {
                this.style.display = 'none';
                const _sp = document.createElement('span');
                _sp.className = 'sheet-avatar-initial';
                _sp.textContent = (c.name || '?')[0];
                this.parentElement.appendChild(_sp);
            };
            sheetAvatar.appendChild(_imgSheet);
        } else {
            const _sp = document.createElement('span');
            _sp.className = 'sheet-avatar-initial';
            _sp.textContent = (c.name || '?')[0];
            sheetAvatar.appendChild(_sp);
        }
    }

    // Nombre y apellido
    const nameEl = document.getElementById('sheetName');
    const lastNameBadge = document.getElementById('sheetLastNameBadge');
    if (nameEl) nameEl.textContent = c.name;
    if (lastNameBadge) {
        lastNameBadge.textContent = c.lastName || '';
        lastNameBadge.style.display = c.lastName ? '' : 'none';
    }

    // Propietario
    const ownerEl = document.getElementById('sheetOwner');
    if (ownerEl) {
        const isOwn = c.userIndex === currentUserIndex;
        ownerEl.innerHTML = isOwn
            ? `<span class="sheet-own-badge">✦ Tu personaje</span>`
            : `<span>Por <strong>${escapeHtml(c.owner || userNames[c.userIndex] || '—')}</strong></span>`;
    }

    // Cinta de ocupación
    const ribbon = document.getElementById('sheetJobRibbon');
    if (ribbon) {
        ribbon.textContent = c.job || '';
        ribbon.style.display = c.job ? '' : 'none';
        ribbon.style.background = c.color || 'var(--accent-wood)';
    }

    // Quick stats (raza, género, edad, alineamiento)
    const sheetQuickStats = document.getElementById('sheetQuickStats');
    if (sheetQuickStats) {
        sheetQuickStats.innerHTML = [
            c.race      && `<span class="quick-stat-v2">${escapeHtml(c.race)}</span>`,
            c.gender    && `<span class="quick-stat-v2">${c.gender}</span>`,
            c.age       && `<span class="quick-stat-v2">${c.age} años</span>`,
            c.alignment && `<span class="quick-stat-v2 qs-align" style="--align-color:${getAlignmentColor(c.alignment)}">${alignments[c.alignment] || c.alignment}</span>`,
        ].filter(Boolean).join('');
    }

    // Tab Perfil: columna izquierda (tarjetas de datos) y derecha (descripción física)
    const profileGrid = document.getElementById('profileGrid');
    if (profileGrid) {
        const dataFields = [
            { label: 'Nombre',      val: c.name },
            c.lastName  && { label: 'Apellido',    val: c.lastName },
            c.age       && { label: 'Edad',         val: `${c.age} años` },
            c.race      && { label: 'Raza',          val: c.race },
            c.gender    && { label: 'Género',        val: c.gender },
            c.alignment && { label: 'Alineamiento',  val: alignments[c.alignment] || c.alignment },
            c.job       && { label: 'Ocupación',     val: c.job },
        ].filter(Boolean);
        profileGrid.innerHTML = dataFields.map(f => `
            <div class="profile-card-item">
                <div class="profile-card-label">${f.label}</div>
                <div class="profile-card-value">${escapeHtml(String(f.val))}</div>
            </div>
        `).join('');
    }
    const profilePhysical = document.getElementById('profilePhysical');
    if (profilePhysical) {
        profilePhysical.innerHTML = c.basic
            ? `<div class="profile-physical-label">Descripción física</div><div class="profile-physical-text">${escapeHtml(c.basic)}</div>`
            : `<div class="profile-physical-empty">Sin descripción física.</div>`;
    }

    // Tabs de texto
    const profilePersonality = document.getElementById('profilePersonality');
    const profileHistory     = document.getElementById('profileHistory');
    const profileNotes       = document.getElementById('profileNotes');
    if (profilePersonality) profilePersonality.textContent = c.personality || 'Sin datos de personalidad.';
    if (profileHistory)     profileHistory.textContent     = c.history     || 'Sin historia registrada.';
    if (profileNotes)       profileNotes.textContent       = c.notes       || 'Sin notas del jugador.';

    // Botón editar
    const sheetEditBtn = document.getElementById('sheetEditBtn');
    if (sheetEditBtn) sheetEditBtn.style.display = c.userIndex === currentUserIndex ? 'inline-flex' : 'none';

    // Reset tabs
    document.querySelectorAll('.sheet-tab-v2').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
    const firstTab = document.querySelector('.sheet-tab-v2');
    if (firstTab) firstTab.classList.add('active');
    const tabProfile = document.getElementById('tab-profile');
    if (tabProfile) tabProfile.classList.add('active');

    openModal('sheetModal');
}

function getRpgSheetData(c, topicId = null) {
    const profile = ensureCharacterRpgProfile(c, topicId);
    const spent = getRpgSpentPoints(profile);
    const freePoints = Math.max(0, RPG_POINTS_POOL - spent);
    const totalStats = {
        STR: RPG_BASE_STATS.STR + profile.stats.STR,
        VIT: RPG_BASE_STATS.VIT + profile.stats.VIT,
        INT: RPG_BASE_STATS.INT + profile.stats.INT,
        AGI: RPG_BASE_STATS.AGI + profile.stats.AGI
    };
    return {
        profile,
        freePoints,
        totalStats,
        title: getRpgTitleByLevel(profile.level)
    };
}

function renderRpgStatsModal(c) {
    const titleEl = document.getElementById('rpgStatsTitle');
    const bodyEl = document.getElementById('rpgStatsBody');
    if (!titleEl || !bodyEl) return;

    const data = getRpgSheetData(c, currentTopicId || null);
    const hpWidth = (data.profile.hp / RPG_HP_MAX) * 100;
    const expWidth = (data.profile.exp / RPG_EXP_PER_LEVEL) * 100;
    const isOwn = c.userIndex === currentUserIndex;

    titleEl.textContent = `⚔ Nv.${data.profile.level} · ${data.title}`;

    bodyEl.innerHTML = `
        <div class="rpg-stats-progress-row">
            <span class="rpg-stats-progress-label">HP</span>
            <div class="sheet-rpg-progress"><div class="sheet-rpg-progress-fill hp" style="width:${hpWidth}%;"></div></div>
            <span class="rpg-stats-progress-value">${data.profile.hp}/${RPG_HP_MAX}</span>
        </div>
        <div class="rpg-stats-progress-row">
            <span class="rpg-stats-progress-label">EXP</span>
            <div class="sheet-rpg-progress"><div class="sheet-rpg-progress-fill exp" style="width:${expWidth}%;"></div></div>
            <span class="rpg-stats-progress-value">${data.profile.exp}/${RPG_EXP_PER_LEVEL}</span>
        </div>
        <div class="rpg-stats-grid">
            ${[
                ['STR', 'Fuerza'],
                ['VIT', 'Vida'],
                ['INT', 'Intel'],
                ['AGI', 'Veloc']
            ].map(([key, desc]) => {
                const base  = RPG_BASE_STATS[key];
                const bonus = data.profile.stats[key];
                const total = data.totalStats[key];
                const canAdd = isOwn && data.freePoints > 0;
                const canSub = isOwn && bonus > 0;
                return `
                <div class="rpg-stats-card">
                    <span class="rpg-stats-card-key">${key}</span>
                    <span class="rpg-stats-card-desc">${desc}</span>
                    <span class="rpg-stats-card-value" id="rpgStat_${key}">${total}</span>
                    ${isOwn ? `
                    <button class="rpg-stat-btn" onclick="adjustRpgStat('${c.id}','${key}',-1)" ${canSub?'':'disabled'} title="Quitar punto">−</button>
                    <button class="rpg-stat-btn" onclick="adjustRpgStat('${c.id}','${key}',1)" ${canAdd?'':'disabled'} title="Añadir punto">+</button>
                    ` : '<span></span><span></span>'}
                </div>`;
            }).join('')}
        </div>
        <div class="rpg-stats-points" id="rpgFreePoints">
            ${isOwn ? `✦ Puntos libres: <strong>${data.freePoints}</strong> / ${RPG_POINTS_POOL}` : `Puntos asignados: ${RPG_POINTS_POOL - data.freePoints} / ${RPG_POINTS_POOL}`}
        </div>
    `;
}

function openRpgStatsModal(charId) {
    const char = appData.characters.find(ch => String(ch.id) === String(charId));
    if (!char) return;
    renderRpgStatsModal(char);
    openModal('rpgStatsModal');
}

// Ajusta un stat RPG del personaje en +1 o -1 y actualiza el modal en tiempo real
function adjustRpgStat(charId, stat, delta) {
    const char = appData.characters.find(ch => String(ch.id) === String(charId));
    if (!char || char.userIndex !== currentUserIndex) return;

    const profile = ensureCharacterRpgProfile(char, currentTopicId);
    const current = profile.stats[stat] || 0;
    const spent   = getRpgSpentPoints(profile);

    if (delta > 0 && spent >= RPG_POINTS_POOL) return; // sin puntos libres
    if (delta < 0 && current <= 0) return;              // ya en mínimo

    profile.stats[stat] = current + delta;

    // Persistir
    if (currentTopicId) {
        const topic = appData.topics.find(t => String(t.id) === String(currentTopicId));
        if (topic && topic.mode === 'rpg') {
            topic.rpgProfiles = topic.rpgProfiles || {};
            topic.rpgProfiles[charId] = profile;
        }
    }
    char.rpgProfile = profile;
    hasUnsavedChanges = true;
    if (typeof save === 'function') save({ silent: true });

    // Re-renderizar el modal sin cerrarlo
    renderRpgStatsModal(char);
    // Actualizar también el resumen de la info-card
    if (typeof updateAffinityDisplay === 'function') updateAffinityDisplay();
}

function getAlignmentColor(code) {
    const colors = {
        'LB': '#4a90e2', 'LN': '#7f8c8d', 'LM': '#2c3e50',
        'NB': '#f39c12', 'NN': '#95a5a6', 'NM': '#8e44ad',
        'CB': '#e74c3c', 'CN': '#e67e22', 'CM': '#c0392b'
    };
    return colors[code] || '#95a5a6';
}

function switchTab(tabName, element) {
    // Soporta tanto .sheet-tab (legacy) como .sheet-tab-v2 (nuevo modal)
    document.querySelectorAll('.sheet-tab, .sheet-tab-v2').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));

    const btn = element
        || document.querySelector(`.sheet-tab-v2[data-tab="${tabName}"]`)
        || document.querySelector(`.sheet-tab[onclick*="'${tabName}'"]`);
    if (btn) btn.classList.add('active');

    const tab = document.getElementById(`tab-${tabName}`);
    if (tab) tab.classList.add('active');
}

// ============================================
// CREAR/EDITAR PERSONAJE
// ============================================
function saveCharacter() {
    const nameInput = document.getElementById('charName');
    const name = nameInput?.value.trim();
    if(!name) { showAutosave('El nombre es obligatorio', 'error'); return; }

    const id = document.getElementById('editCharacterId')?.value || Date.now().toString();

    const avatarUrl = document.getElementById('charAvatar')?.value.trim() || '';
    const spriteUrl = document.getElementById('charSprite')?.value.trim() || '';

    if (!validateImageUrlField(avatarUrl, 'La URL del avatar')) return;
    if (!validateImageUrlField(spriteUrl, 'La URL del sprite')) return;

    const charObj = {
        id,
        userIndex: currentUserIndex,
        owner: userNames[currentUserIndex],
        name,
        lastName: document.getElementById('charLastName')?.value.trim() || '',
        age: document.getElementById('charAge')?.value.trim() || '',
        race: document.getElementById('charRace')?.value.trim() || '',
        gender: document.getElementById('charGender')?.value || '',
        alignment: document.getElementById('charAlignment')?.value || '',
        job: document.getElementById('charJob')?.value.trim() || '',
        color: document.getElementById('charColor')?.value || '#8b7355',
        avatar: avatarUrl,
        sprite: spriteUrl,
        basic: document.getElementById('charBasic')?.value.trim() || '',
        personality: document.getElementById('charPersonality')?.value.trim() || '',
        history: document.getElementById('charHistory')?.value.trim() || '',
        notes: document.getElementById('charNotes')?.value.trim() || ''
    };

    const prevChar = appData.characters.find(c => String(c.id) === String(id));
    if (prevChar?.rpgProfile) charObj.rpgProfile = prevChar.rpgProfile;


    const idx = appData.characters.findIndex(c => String(c.id) === String(id));
    if(idx > -1) appData.characters[idx] = charObj;
    else appData.characters.push(charObj);

    hasUnsavedChanges = true;
    save({ silent: true });
    closeModal('characterModal');
    resetCharForm();
    // Sincronizar avatar_url con Supabase si el personaje tiene ID de Supabase
    if (typeof SupabaseAvatars !== 'undefined') {
        const savedChar = appData.characters.find(c => String(c.id) === String(id));
        if (savedChar && savedChar.avatar) {
            // El personaje tiene URL de avatar — puede ser local o de Supabase Storage
            // No hacemos nada aquí; uploadAvatarForChar() se llama manualmente desde UI
        }
    }

    renderGallery();
}

/**
 * Sube un archivo de imagen como avatar de un personaje de Supabase.
 * Se llama desde el input type="file" del editor de personajes.
 * @param {HTMLInputElement} fileInput
 */
async function uploadAvatarForChar(fileInput) {
    const file = fileInput?.files?.[0];
    if (!file) return;

    if (typeof SupabaseAvatars === 'undefined') {
        showAutosave('Supabase no disponible para subir avatar', 'error');
        return;
    }

    // Obtener el ID del personaje activo en el editor
    const charId = document.getElementById('editCharacterId')?.value;
    if (!charId) {
        showAutosave('Guarda el personaje antes de subir el avatar', 'error');
        return;
    }

    // Intentar resolver el UUID de Supabase para este personaje
    let supabaseCharId = charId;
    if (typeof appData !== 'undefined' && appData.cloudCharacters) {
        for (const chars of Object.values(appData.cloudCharacters)) {
            if (!Array.isArray(chars)) continue;
            const match = chars.find(c => String(c.id) === String(charId));
            if (match) { supabaseCharId = match.id; break; }
        }
    }

    showAutosave('Subiendo avatar...', 'info');
    const result = await SupabaseAvatars.uploadCharacterAvatar(supabaseCharId, file);

    if (!result.ok) {
        showAutosave(result.error || 'Error al subir avatar', 'error');
        return;
    }

    // Actualizar el campo de avatar URL en el editor
    const avatarInput = document.getElementById('charAvatar');
    if (avatarInput) {
        avatarInput.value = result.url;
        if (typeof updatePreview === 'function') updatePreview();
    }

    showAutosave('Avatar subido correctamente', 'saved');
    fileInput.value = '';  // limpiar el input
}

function resetCharForm() {
    const editId = document.getElementById('editCharacterId');
    if (editId) editId.value = '';

    const deleteBtn = document.getElementById('deleteCharBtn');
    if (deleteBtn) deleteBtn.style.display = 'none';

    document.querySelectorAll('#characterModal input:not([type="color"]), #characterModal textarea, #characterModal select').forEach(i => i.value = '');

    const colorInput = document.getElementById('charColor');
    if (colorInput) colorInput.value = '#8b7355';

    document.querySelectorAll('.gender-option').forEach(opt => opt.classList.remove('selected'));
}

function editFromSheet() {
    closeModal('sheetModal');
    openCharacterEditor(currentSheetCharId);
}
