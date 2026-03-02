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

function ensureCharacterRpgProfile(char) {
    if (!char) return null;
    const existingStats = char.rpgProfile?.stats || {};
    const profile = {
        stats: {
            STR: Math.max(0, Number(existingStats.STR) || 0),
            VIT: Math.max(0, Number(existingStats.VIT) || 0),
            INT: Math.max(0, Number(existingStats.INT) || 0),
            AGI: Math.max(0, Number(existingStats.AGI) || 0)
        },
        hp: Math.max(0, Math.min(RPG_HP_MAX, Number(char.rpgProfile?.hp) || RPG_HP_MAX)),
        exp: Math.max(0, Math.min(RPG_EXP_PER_LEVEL - 1, Number(char.rpgProfile?.exp) || 0)),
        level: Math.max(1, Number(char.rpgProfile?.level) || 1),
        knockedOutTurns: Math.max(0, Number(char.rpgProfile?.knockedOutTurns) || 0)
    };

    const spent = profile.stats.STR + profile.stats.VIT + profile.stats.INT + profile.stats.AGI;
    if (spent > RPG_POINTS_POOL) {
        const overflow = spent - RPG_POINTS_POOL;
        profile.stats.AGI = Math.max(0, profile.stats.AGI - overflow);
    }

    char.rpgProfile = profile;
    return profile;
}

function getRpgSpentPoints(profile) {
    if (!profile || !profile.stats) return 0;
    return ['STR', 'VIT', 'INT', 'AGI'].reduce((sum, key) => sum + (Number(profile.stats[key]) || 0), 0);
}

function openSheet(id) {
    currentSheetCharId = id;
    const c = appData.characters.find(ch => ch.id === id);
    if(!c) return;

    const sheetName = document.getElementById('sheetName');
    const sheetOwner = document.getElementById('sheetOwner');
    const sheetAvatar = document.getElementById('sheetAvatar');
    const sheetQuickStats = document.getElementById('sheetQuickStats');

    if (sheetName) sheetName.textContent = c.name;
    if (sheetOwner) sheetOwner.textContent = `Por ${c.owner || userNames[c.userIndex]}`;

    if (sheetAvatar) {
        sheetAvatar.innerHTML = c.avatar ? `<img src="${escapeHtml(c.avatar)}" alt="Avatar ampliado de ${escapeHtml(c.name)}" onerror="this.textContent='${c.name[0]}'">` : c.name[0];
    }

    if (sheetQuickStats) {
        sheetQuickStats.innerHTML = `
            <span class="quick-stat">${escapeHtml(c.race) || 'Sin raza'}</span>
            <span class="quick-stat">${c.gender || '?'}</span>
            <span class="quick-stat">${c.age || '?'} años</span>
            <span class="quick-stat" style="background: ${getAlignmentColor(c.alignment)}; color: white;">${alignments[c.alignment] || 'Neutral'}</span>
        `;
    }

    const profileGrid = document.getElementById('profileGrid');
    if (profileGrid) {
        profileGrid.innerHTML = `
            <div class="profile-item"><div class="profile-label">Nombre</div><div class="profile-value">${escapeHtml(c.name)}</div></div>
            <div class="profile-item"><div class="profile-label">Apellido</div><div class="profile-value">${escapeHtml(c.lastName) || '-'}</div></div>
            <div class="profile-item"><div class="profile-label">Edad</div><div class="profile-value">${c.age || '-'}</div></div>
            <div class="profile-item"><div class="profile-label">Raza</div><div class="profile-value">${escapeHtml(c.race) || '-'}</div></div>
            <div class="profile-item"><div class="profile-label">Género</div><div class="profile-value">${c.gender || '-'}</div></div>
            <div class="profile-item"><div class="profile-label">Alineamiento</div><div class="profile-value">${alignments[c.alignment] || '-'}</div></div>
            <div class="profile-item full-width"><div class="profile-label">Ocupación</div><div class="profile-value">${escapeHtml(c.job) || '-'}</div></div>
            <div class="profile-item full-width" style="margin-top: 1rem;">
                <div class="profile-label">Descripción Física</div>
                <div style="margin-top: 0.5rem; line-height: 1.6;">${escapeHtml(c.basic) || 'Sin descripción.'}</div>
            </div>
        `;
    }

    const profilePersonality = document.getElementById('profilePersonality');
    const profileHistory = document.getElementById('profileHistory');

    if (profilePersonality) profilePersonality.textContent = c.personality || 'Sin datos de personalidad.';
    if (profileHistory) profileHistory.textContent = c.history || 'Sin historia registrada.';

    const sheetEditBtn = document.getElementById('sheetEditBtn');
    if (sheetEditBtn) sheetEditBtn.style.display = c.userIndex === currentUserIndex ? 'inline-block' : 'none';

    document.querySelectorAll('.sheet-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));

    const firstTab = document.querySelector('.sheet-tab');
    if (firstTab) firstTab.classList.add('active');

    const tabProfile = document.getElementById('tab-profile');
    if (tabProfile) tabProfile.classList.add('active');

    openModal('sheetModal');
}

function getRpgSheetData(c) {
    const profile = ensureCharacterRpgProfile(c);
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

    const data = getRpgSheetData(c);
    const hpWidth = (data.profile.hp / RPG_HP_MAX) * 100;
    const expWidth = (data.profile.exp / RPG_EXP_PER_LEVEL) * 100;

    titleEl.textContent = `⚔️ Nivel ${data.profile.level}`;
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
            ].map(([key, desc]) => `
                <div class="rpg-stats-card">
                    <div class="rpg-stats-card-key">${key}</div>
                    <div class="rpg-stats-card-value">${data.totalStats[key]}</div>
                    <div class="rpg-stats-card-desc">${desc}</div>
                </div>
            `).join('')}
        </div>
        <div class="rpg-stats-points">Puntos: ${data.freePoints} / ${RPG_POINTS_POOL}</div>
        <div class="rpg-stats-note">Progreso RPG activo solo en modo RPG.</div>
    `;
}

function openRpgStatsModal(charId) {
    const char = appData.characters.find(ch => String(ch.id) === String(charId));
    if (!char) return;
    renderRpgStatsModal(char);
    openModal('rpgStatsModal');
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
    document.querySelectorAll('.sheet-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));

    const btn = element || document.querySelector(`.sheet-tab[onclick*="'${tabName}'"]`);
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

    const prevChar = appData.characters.find(c => c.id === id);
    if (prevChar?.rpgProfile) charObj.rpgProfile = prevChar.rpgProfile;


    const idx = appData.characters.findIndex(c => c.id === id);
    if(idx > -1) appData.characters[idx] = charObj;
    else appData.characters.push(charObj);

    hasUnsavedChanges = true;
    save({ silent: true });
    closeModal('characterModal');
    resetCharForm();
    renderGallery();
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
