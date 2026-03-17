// Fichas de personaje (vista detallada).
// FICHA DE PERSONAJE — Sistema D&D 5e simplificado
// ============================================

// ── Stats D&D: STR / DEX / CON / INT / WIS / CHA ──────────────────────────
// Cada stat empieza en 8 (base D&D). El jugador distribuye 27 puntos usando
// el sistema de "point buy": subir de 8→9 cuesta 1 pto, ..., 13→14 cuesta 2 pto, 14→15 cuesta 3 pto.
// Rango resultante: 8–15 antes de bonificadores de clase/raza.

const RPG_STAT_KEYS   = ['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA'];
const RPG_STAT_BASE   = 8;          // valor mínimo de cada stat
const RPG_STAT_MAX    = 15;         // máximo antes de bonificadores
const RPG_POINTS_POOL = 27;         // puntos a distribuir (point buy D&D estándar)
const RPG_HP_MAX      = 10;         // HP base (escala de la ficha, 0-10)
const RPG_EXP_PER_LEVEL = 10;

// ── Sistema de condiciones D&D ──────────────────────────────────────────────
// 7 condiciones que el DM puede aplicar manualmente, o que se activan
// automáticamente según el estado del personaje (HP=0 → Inconsciente).
// Cada condición modifica el oráculo con ventaja/desventaja en stats concretos.

const RPG_CONDITIONS = {
    poisoned:    { id: 'poisoned',    label: 'Envenenado',   icon: '☠',  color: '#4a8c3f', desc: 'Desventaja en STR y CON. Daño continuo al inicio de cada turno.', statPenalty: { STR: -2, CON: -2 } },
    frightened:  { id: 'frightened', label: 'Asustado',     icon: '😨', color: '#7a5c9e', desc: 'Desventaja en tiradas de acción mientras la fuente de miedo esté presente.', statPenalty: { STR: -2, WIS: -2 } },
    stunned:     { id: 'stunned',    label: 'Aturdido',     icon: '💫', color: '#b87c1a', desc: 'No puede realizar acciones. Desventaja en todas las tiradas.', statPenalty: { STR: -3, DEX: -3, INT: -2 } },
    paralyzed:   { id: 'paralyzed', label: 'Paralizado',    icon: '🧊', color: '#2a6ea6', desc: 'Incapaz de moverse o actuar. Fallo automático en STR y DEX.', statPenalty: { STR: -5, DEX: -5 } },
    unconscious: { id: 'unconscious',label: 'Inconsciente', icon: '💀', color: '#8b3333', desc: 'KO. Sin acciones hasta recibir curación o pasar turnos de recuperación.', statPenalty: { STR: -10, DEX: -10, CON: -5 } },
    blinded:     { id: 'blinded',   label: 'Cegado',        icon: '🙈', color: '#5a4a2a', desc: 'Desventaja en tiradas de DEX y WIS. Ventaja para atacantes.', statPenalty: { DEX: -3, WIS: -2 } },
    advantage:   { id: 'advantage', label: 'Ventaja',       icon: '✦',  color: '#2a7a4a', desc: 'Ventaja en todas las tiradas de este turno. Puede ser de cualquier fuente.', statBonus: { STR: 2, DEX: 2, CON: 2, INT: 2, WIS: 2, CHA: 2 } }
};

// Aplica una condición al perfil del personaje (idempotente)
function applyConditionToProfile(profile, conditionId) {
    if (!profile || !RPG_CONDITIONS[conditionId]) return;
    profile.conditions = profile.conditions || [];
    if (!profile.conditions.includes(conditionId)) {
        profile.conditions.push(conditionId);
    }
}

// Elimina una condición del perfil
function removeConditionFromProfile(profile, conditionId) {
    if (!profile?.conditions) return;
    profile.conditions = profile.conditions.filter(c => c !== conditionId);
}

// Calcula el modificador total que las condiciones activas aplican a un stat
function getConditionModifier(profile, statKey) {
    if (!profile?.conditions?.length) return 0;
    let total = 0;
    for (const condId of profile.conditions) {
        const cond = RPG_CONDITIONS[condId];
        if (!cond) continue;
        total += (cond.statPenalty?.[statKey] || 0);
        total += (cond.statBonus?.[statKey] || 0);
    }
    return total;
}

// Renderiza los badges de condición activos (para la ficha y el IHP)
function renderConditionBadges(profile, isOwn, charId) {
    if (!profile?.conditions?.length) return '';
    return profile.conditions.map(condId => {
        const c = RPG_CONDITIONS[condId];
        if (!c) return '';
        const removeBtn = isOwn
            ? `<button class="cond-remove-btn" onclick="removeCharCondition('${charId}','${condId}')" title="Eliminar condición">✕</button>`
            : '';
        return `<span class="rpg-condition-badge" style="border-color:${c.color}20;color:${c.color};" title="${c.desc}">${c.icon} ${c.label}${removeBtn}</span>`;
    }).join('');
}


// Coste acumulado de point buy por valor de stat (valor → coste desde base 8)
const RPG_POINT_BUY_COST = { 8:0, 9:1, 10:2, 11:3, 12:4, 13:5, 14:7, 15:9 };

// Tooltips informativos de cada stat
const RPG_STAT_DESC = {
    STR: 'Fuerza — Ataques cuerpo a cuerpo, cargar peso, romper objetos.',
    DEX: 'Destreza — Iniciativa, ataques a distancia, sigilo y evasión.',
    CON: 'Constitución — Puntos de vida, resistencia a venenos y fatiga.',
    INT: 'Inteligencia — Magia arcana, conocimiento, habilidades de investigación.',
    WIS: 'Sabiduría — Percepción, intuición, magia divina y voluntad.',
    CHA: 'Carisma — Persuasión, engaño, intimidación y liderazgo.'
};

// Abreviaturas legibles para la UI
const RPG_STAT_LABEL = {
    STR: 'Fuerza', DEX: 'Destreza', CON: 'Constit.',
    INT: 'Intelec.', WIS: 'Sabid.', CHA: 'Carisma'
};

// Modificador D&D: floor((stat - 10) / 2)
function rpgModifier(val) { return Math.floor((val - 10) / 2); }
function rpgModStr(val)   { const m = rpgModifier(val); return (m >= 0 ? '+' : '') + m; }

// Clases D&D básicas (las más genéricas y reconocibles)
const RPG_CLASSES = [
    { id: 'barbarian', name: 'Bárbaro',    icon: '⚔️',  desc: 'Guerrero feroz impulsado por la rabia.' },
    { id: 'bard',      name: 'Bardo',      icon: '🎶',  desc: 'Artista con magia de la palabra y el sonido.' },
    { id: 'cleric',    name: 'Clérigo',    icon: '✝️',  desc: 'Devoto que canaliza el poder divino.' },
    { id: 'druid',     name: 'Druida',     icon: '🌿',  desc: 'Guardián de la naturaleza con magia primigenia.' },
    { id: 'fighter',   name: 'Guerrero',   icon: '🛡️',  desc: 'Maestro del combate con cualquier arma.' },
    { id: 'monk',      name: 'Monje',      icon: '👊',  desc: 'Luchador que domina las artes marciales.' },
    { id: 'paladin',   name: 'Paladín',    icon: '⚡',  desc: 'Caballero sagrado con poderes divinos.' },
    { id: 'ranger',    name: 'Explorador', icon: '🏹',  desc: 'Rastreador experto en combate y supervivencia.' },
    { id: 'rogue',     name: 'Pícaro',     icon: '🗡️',  desc: 'Especialista en sigilo, trampas y ataques precisos.' },
    { id: 'sorcerer',  name: 'Hechicero',  icon: '🔥',  desc: 'Mago innato con poder mágico en la sangre.' },
    { id: 'warlock',   name: 'Brujo',      icon: '👁️',  desc: 'Pactante con entidades sobrenaturales.' },
    { id: 'wizard',    name: 'Mago',       icon: '📖',  desc: 'Erudito que domina la magia arcana estudiada.' }
];

function getRpgTitleByLevel(level) {
    if (level >= 7) return 'Maestro';
    if (level >= 4) return 'Adepto';
    return 'Aprendiz';
}

// Calcula el coste en puntos de comprar un stat a un valor dado
function rpgPointBuyCost(statValue) {
    return RPG_POINT_BUY_COST[statValue] ?? RPG_POINT_BUY_COST[RPG_STAT_MAX];
}

// Puntos gastados totales del perfil
function getRpgSpentPoints(profile) {
    if (!profile?.stats) return 0;
    return RPG_STAT_KEYS.reduce((sum, k) => {
        const val = Math.max(RPG_STAT_BASE, Math.min(RPG_STAT_MAX, Number(profile.stats[k]) || RPG_STAT_BASE));
        return sum + rpgPointBuyCost(val);
    }, 0);
}

function sanitizeRpgProfile(raw) {
    const s = raw?.stats || {};
    const stats = {};
    RPG_STAT_KEYS.forEach(k => {
        stats[k] = Math.max(RPG_STAT_BASE, Math.min(RPG_STAT_MAX, Number(s[k]) || RPG_STAT_BASE));
    });

    // Si los puntos gastados superan el pool (datos legacy), reducir CHA→WIS→INT hasta ajustar
    let spent = getRpgSpentPoints({ stats });
    const overflow_keys = ['CHA', 'WIS', 'INT', 'DEX', 'STR', 'CON'];
    let safety = 30;
    while (spent > RPG_POINTS_POOL && safety-- > 0) {
        for (const k of overflow_keys) {
            if (stats[k] > RPG_STAT_BASE) { stats[k]--; break; }
        }
        spent = getRpgSpentPoints({ stats });
    }

    // Sanitizar condiciones: solo IDs válidos
    const rawConds = Array.isArray(raw?.conditions) ? raw.conditions : [];
    const conditions = rawConds.filter(c => RPG_CONDITIONS && RPG_CONDITIONS[c]);

    return {
        stats,
        rpgClass: raw?.rpgClass || null,
        conditions,
        hp:  Math.max(0, Math.min(RPG_HP_MAX, Number(raw?.hp)  || RPG_HP_MAX)),
        exp: Math.max(0, Math.min(RPG_EXP_PER_LEVEL - 1, Number(raw?.exp) || 0)),
        level: Math.max(1, Number(raw?.level) || 1),
        knockedOutTurns: Math.max(0, Number(raw?.knockedOutTurns) || 0)
    };
}

// CLAVE: el perfil se almacena SIEMPRE en topic.rpgProfiles[charId], nunca en char.rpgProfile.
// char.rpgProfile solo se usa como semilla si el personaje no tiene perfil en ningún topic.
// Esto garantiza que cada tema sea 100% independiente.
function ensureCharacterRpgProfile(char, topicId = null) {
    if (!char) return null;

    const activeTopicId = topicId || currentTopicId;
    const topic = appData.topics?.find(t => String(t.id) === String(activeTopicId));

    // Si estamos en un topic RPG, usar SIEMPRE el perfil del topic
    if (topic && topic.mode === 'rpg') {
        topic.rpgProfiles = topic.rpgProfiles || {};
        if (!topic.rpgProfiles[char.id]) {
            // Primera vez en este topic: arrancar con stats base (8 en todo), NO copiar de otro tema
            topic.rpgProfiles[char.id] = sanitizeRpgProfile({});
        } else {
            topic.rpgProfiles[char.id] = sanitizeRpgProfile(topic.rpgProfiles[char.id]);
        }
        return topic.rpgProfiles[char.id];
    }

    // Fuera de topic RPG: devolver perfil global del personaje (solo lectura, no se persiste en topic)
    const baseProfile = sanitizeRpgProfile(char.rpgProfile || {});
    char.rpgProfile = baseProfile;
    return baseProfile;
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
            : `<div class="profile-physical-empty">Sin descripción física. Describe su rasgo más memorable.</div>`;
    }

    // Tabs de texto
    const profilePersonality = document.getElementById('profilePersonality');
    const profileHistory     = document.getElementById('profileHistory');
    const profileNotes       = document.getElementById('profileNotes');
    if (profilePersonality) profilePersonality.textContent = c.personality || 'Sin datos de personalidad.';
    if (profileHistory)     profileHistory.textContent     = c.history     || 'Sin trasfondo registrado todavía.';
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
    const profile    = ensureCharacterRpgProfile(c, topicId);
    const spent      = getRpgSpentPoints(profile);
    // freePoints incluye el pool base MÁS puntos de nivel pendientes
    const basePool   = RPG_POINTS_POOL + (profile.pendingStatPoints || 0) * 2; // 2 pts de coste = 1 stat extra
    const freePoints = Math.max(0, basePool - spent);
    return { profile, freePoints, basePool, title: getRpgTitleByLevel(profile.level) };
}

function renderRpgStatsModal(c) {
    const titleEl = document.getElementById('rpgStatsTitle');
    const bodyEl  = document.getElementById('rpgStatsBody');
    if (!titleEl || !bodyEl) return;

    const data    = getRpgSheetData(c, currentTopicId || null);
    const profile = data.profile;
    const hpWidth  = (profile.hp  / RPG_HP_MAX)      * 100;
    const expWidth = (profile.exp / RPG_EXP_PER_LEVEL) * 100;
    const isOwn    = c.userIndex === currentUserIndex;
    const className = RPG_CLASSES.find(cl => cl.id === profile.rpgClass);

    titleEl.textContent = `⚔ Nv.${profile.level} · ${data.title}`;

    // Selector de clase
    const classSection = isOwn ? `
        <div class="rpg-class-row">
            <span class="rpg-class-label">Clase</span>
            <div class="rpg-class-grid">
                ${RPG_CLASSES.map(cl => `
                    <button class="rpg-class-btn ${profile.rpgClass === cl.id ? 'active' : ''}"
                            onclick="selectRpgClass('${c.id}','${cl.id}')"
                            title="${cl.desc}">
                        <span class="rpg-class-icon">${cl.icon}</span>
                        <span class="rpg-class-name">${cl.name}</span>
                    </button>`).join('')}
            </div>
        </div>` : (className ? `
        <div class="rpg-class-row">
            <span class="rpg-class-label">Clase</span>
            <span class="rpg-class-display">${className.icon} ${className.name}</span>
        </div>` : '');

    bodyEl.innerHTML = `
        ${classSection}
        <div class="rpg-stats-progress-row">
            <span class="rpg-stats-progress-label">HP</span>
            <div class="sheet-rpg-progress"><div class="sheet-rpg-progress-fill hp" style="width:${hpWidth}%;"></div></div>
            <span class="rpg-stats-progress-value">${profile.hp}/${RPG_HP_MAX}</span>
        </div>
        <div class="rpg-stats-progress-row">
            <span class="rpg-stats-progress-label">EXP</span>
            <div class="sheet-rpg-progress"><div class="sheet-rpg-progress-fill exp" style="width:${expWidth}%;"></div></div>
            <span class="rpg-stats-progress-value">${profile.exp}/${RPG_EXP_PER_LEVEL}</span>
        </div>
        <div class="rpg-stats-grid">
            ${RPG_STAT_KEYS.map(key => {
                const val    = profile.stats[key];
                const mod    = rpgModStr(val);
                const spent  = getRpgSpentPoints(profile);
                const canAdd = isOwn && val < RPG_STAT_MAX && (RPG_POINTS_POOL - spent) >= (rpgPointBuyCost(val + 1) - rpgPointBuyCost(val));
                const canSub = isOwn && val > RPG_STAT_BASE;
                return `
                <div class="rpg-stats-card" title="${RPG_STAT_DESC[key]}">
                    <span class="rpg-stats-card-key">${key}</span>
                    <span class="rpg-stats-card-desc">${RPG_STAT_LABEL[key]}</span>
                    <span class="rpg-stats-card-value" id="rpgStat_${key}">${val}</span>
                    <span class="rpg-stats-card-mod">${mod}</span>
                    ${isOwn ? `
                    <button class="rpg-stat-btn" onclick="adjustRpgStat('${c.id}','${key}',-1)" ${canSub?'':'disabled'} title="Quitar punto">−</button>
                    <button class="rpg-stat-btn" onclick="adjustRpgStat('${c.id}','${key}',1)" ${canAdd?'':'disabled'} title="Añadir punto">+</button>
                    ` : '<span></span><span></span>'}
                </div>`;
            }).join('')}
        </div>
        <div class="rpg-stats-points" id="rpgFreePoints">
            ${isOwn
                ? `✦ Puntos restantes: <strong>${data.freePoints}</strong> / ${RPG_POINTS_POOL}`
                : `Puntos distribuidos: ${RPG_POINTS_POOL - data.freePoints} / ${RPG_POINTS_POOL}`}
        </div>
        ${renderConditionBadges(profile, isOwn, c.id)
            ? `<div class="rpg-conditions-row" id="rpgConditionsRow">${renderConditionBadges(profile, isOwn, c.id)}</div>`
            : '<div class="rpg-conditions-row" id="rpgConditionsRow" style="display:none;"></div>'}
    `;
}

// Selecciona la clase D&D del personaje para este tema
function selectRpgClass(charId, classId) {
    const char = appData.characters.find(c => String(c.id) === String(charId));
    if (!char || char.userIndex !== currentUserIndex) return;
    const profile = ensureCharacterRpgProfile(char, currentTopicId);
    profile.rpgClass = classId;
    _persistRpgProfile(char, profile);
    renderRpgStatsModal(char);
    window.dispatchEvent(new CustomEvent('etheria:rpg-stat-changed', { detail: { charId, topicId: currentTopicId } }));
}

// ── Condiciones: funciones públicas ─────────────────────────────────────────

// Aplica una condición al personaje activo en el topic actual (DM o automático)
function applyCharCondition(charId, conditionId, topicId) {
    const tId = topicId || currentTopicId;
    const char = appData.characters.find(c => String(c.id) === String(charId));
    if (!char) return;
    const profile = ensureCharacterRpgProfile(char, tId);
    applyConditionToProfile(profile, conditionId);
    _persistRpgProfile(char, profile);
    renderRpgStatsModal(char);
    window.dispatchEvent(new CustomEvent('etheria:rpg-condition-changed', { detail: { charId, topicId: tId } }));
    const cond = RPG_CONDITIONS[conditionId];
    if (cond) showAutosave(`${cond.icon} ${char.name}: ${cond.label} aplicado`, 'info');
}

// Elimina una condición del personaje
function removeCharCondition(charId, conditionId, topicId) {
    const tId = topicId || currentTopicId;
    const char = appData.characters.find(c => String(c.id) === String(charId));
    if (!char) return;
    const profile = ensureCharacterRpgProfile(char, tId);
    removeConditionFromProfile(profile, conditionId);
    _persistRpgProfile(char, profile);
    renderRpgStatsModal(char);
    window.dispatchEvent(new CustomEvent('etheria:rpg-condition-changed', { detail: { charId, topicId: tId } }));
}

window.applyCharCondition  = applyCharCondition;
window.removeCharCondition = removeCharCondition;

function openRpgStatsModal(charId) {
    const char = appData.characters.find(ch => String(ch.id) === String(charId));
    if (!char) return;
    renderRpgStatsModal(char);
    // Guardar charId en el modal para que la pestaña inventario sepa de quién es
    const modal = document.getElementById('rpgStatsModal');
    if (modal) modal.dataset.charId = charId;
    // Resetear a la pestaña Stats al abrir
    const statsBody = document.getElementById('rpgStatsBody');
    const invBody   = document.getElementById('rpgInventoryBody');
    if (statsBody) statsBody.style.display = '';
    if (invBody)   invBody.style.display   = 'none';
    document.querySelectorAll('.rpg-stats-tab').forEach((b,i) => b.classList.toggle('active', i === 0));
    openModal('rpgStatsModal');
}

// Helper: persiste el perfil RPG en el topic y en appData
function _persistRpgProfile(char, profile) {
    if (currentTopicId) {
        const topic = appData.topics.find(t => String(t.id) === String(currentTopicId));
        if (topic && topic.mode === 'rpg') {
            topic.rpgProfiles = topic.rpgProfiles || {};
            topic.rpgProfiles[char.id] = profile;
        }
    }
    // Guardar referencia también en char para lecturas rápidas fuera de topic
    char.rpgProfile = profile;
    hasUnsavedChanges = true;
    if (typeof save === 'function') save({ silent: true });
    if (typeof SupabaseSync !== 'undefined') {
        SupabaseSync.uploadProfileData().catch(() => {});
    }
}

// Ajusta un stat RPG en +1 o -1 usando point buy D&D
function adjustRpgStat(charId, stat, delta) {
    const char = appData.characters.find(ch => String(ch.id) === String(charId));
    if (!char || char.userIndex !== currentUserIndex) return;

    const profile = ensureCharacterRpgProfile(char, currentTopicId);
    const current = profile.stats[stat] ?? RPG_STAT_BASE;
    const newVal  = current + delta;

    if (newVal < RPG_STAT_BASE || newVal > RPG_STAT_MAX) return;

    // Comprobar coste en puntos (solo al subir)
    if (delta > 0) {
        const costIncrease = rpgPointBuyCost(newVal) - rpgPointBuyCost(current);
        const spent = getRpgSpentPoints(profile);
        if (spent + costIncrease > RPG_POINTS_POOL) return; // no hay puntos suficientes
    }

    profile.stats[stat] = newVal;
    _persistRpgProfile(char, profile);

    renderRpgStatsModal(char);
    if (typeof updateAffinityDisplay === 'function') updateAffinityDisplay();
    window.dispatchEvent(new CustomEvent('etheria:rpg-stat-changed', {
        detail: { charId, topicId: currentTopicId }
    }));
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

    // Subir a la nube inmediatamente al guardar personaje
    if (typeof SupabaseSync !== 'undefined') {
        SupabaseSync.uploadProfileData().catch(() => {});
    }

    renderGallery();
}

/**
 * Sube un archivo de imagen como avatar de un personaje de Supabase.
 * Se llama desde el input type="file" del editor de personajes.
 * @param {HTMLInputElement} fileInput
 */
// ── Helper de subida a Supabase Storage ──────────────────────────────────────
// Sube una imagen a un bucket público y devuelve { ok, url, error }.
// Usa el ID local del personaje como nombre de archivo para mantener
// la relación entre el personaje local y su imagen en Storage.
// No depende de la tabla characters de Supabase.

async function _uploadImageToStorage(bucket, charId, file) {
    const sb = window.supabaseClient;
    if (!sb) return { ok: false, error: 'Sin conexión a Supabase.' };

    const ext = (file.name.match(/\.(png|jpg|jpeg|gif|webp)$/i)?.[1] || 'png').toLowerCase();
    const mimeMap = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp' };
    const path = `${charId}.${ext}`;

    try {
        const { error: uploadError } = await sb.storage
            .from(bucket)
            .upload(path, file, {
                contentType: mimeMap[ext] || 'image/png',
                upsert: true
            });

        if (uploadError) {
            console.error(`[Storage] upload error (${bucket}):`, uploadError.message);
            return { ok: false, error: uploadError.message };
        }

        const { data: urlData } = sb.storage.from(bucket).getPublicUrl(path);
        const url = urlData?.publicUrl;
        if (!url) return { ok: false, error: 'No se pudo obtener la URL pública.' };

        // Añadir cache-busting para que el navegador no sirva la versión anterior
        const publicUrl = `${url}?t=${Date.now()}`;
        return { ok: true, url: publicUrl };

    } catch (err) {
        console.error(`[Storage] exception (${bucket}):`, err?.message);
        return { ok: false, error: err?.message || 'Error inesperado.' };
    }
}


async function uploadAvatarForChar(fileInput) {
    const file = fileInput?.files?.[0];
    if (!file) return;

    const charId = document.getElementById('editCharacterId')?.value;
    if (!charId) {
        showAutosave('Guarda el personaje antes de subir el avatar', 'error');
        return;
    }

    if (!file.type.startsWith('image/')) {
        showAutosave('El archivo debe ser una imagen', 'error');
        return;
    }
    if (file.size > 5 * 1024 * 1024) {
        showAutosave('La imagen no puede superar 5 MB', 'error');
        return;
    }

    showAutosave('Subiendo avatar...', 'info');

    // Subir al bucket usando el ID local como nombre de archivo
    const result = await _uploadImageToStorage('avatars', charId, file);
    if (!result.ok) {
        showAutosave(result.error || 'Error al subir avatar', 'error');
        return;
    }

    // 1. Actualizar el input del editor (para que saveCharacter() lo coja)
    const avatarInput = document.getElementById('charAvatar');
    if (avatarInput) {
        avatarInput.value = result.url;
        if (typeof updatePreview === 'function') updatePreview();
    }

    // 2. Actualizar appData en memoria y persistir
    if (typeof appData !== 'undefined' && Array.isArray(appData.characters)) {
        const char = appData.characters.find(c => String(c.id) === String(charId));
        if (char) {
            char.avatar = result.url;
            hasUnsavedChanges = true;
            if (typeof save === 'function') save({ silent: true });
            if (typeof SupabaseSync !== 'undefined') {
                SupabaseSync.uploadProfileData().catch(() => {});
            }
        }
    }

    showAutosave('Avatar subido correctamente', 'saved');
    fileInput.value = '';
    if (typeof renderGallery === 'function') renderGallery();
}

/**
 * Sube un archivo de imagen como sprite de un personaje a Supabase Storage.
 * Se llama desde el input type="file" del editor de personajes.
 * @param {HTMLInputElement} fileInput
 */
async function uploadSpriteForChar(fileInput) {
    const file = fileInput?.files?.[0];
    if (!file) return;

    const charId = document.getElementById('editCharacterId')?.value;
    if (!charId) {
        showAutosave('Guarda el personaje antes de subir el sprite', 'error');
        return;
    }

    if (!file.type.startsWith('image/')) {
        showAutosave('El archivo debe ser una imagen', 'error');
        return;
    }
    if (file.size > 10 * 1024 * 1024) {
        showAutosave('La imagen no puede superar 10 MB', 'error');
        return;
    }

    showAutosave('Subiendo sprite...', 'info');

    const result = await _uploadImageToStorage('sprites', charId, file);
    if (!result.ok) {
        showAutosave(result.error || 'Error al subir sprite', 'error');
        return;
    }

    // 1. Actualizar el input del editor
    const spriteInput = document.getElementById('charSprite');
    if (spriteInput) spriteInput.value = result.url;

    // 2. Actualizar appData y persistir
    if (typeof appData !== 'undefined' && Array.isArray(appData.characters)) {
        const char = appData.characters.find(c => String(c.id) === String(charId));
        if (char) {
            char.sprite = result.url;
            hasUnsavedChanges = true;
            if (typeof save === 'function') save({ silent: true });
            if (typeof SupabaseSync !== 'undefined') {
                SupabaseSync.uploadProfileData().catch(() => {});
            }
        }
    }

    showAutosave('Sprite subido correctamente', 'saved');
    fileInput.value = '';
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

// Abre el modal de stats RPG desde la selección de personaje (antes de entrar al topic)
function openRpgStatsModalFromSelect(topicId, charId) {
    const char = appData.characters.find(ch => String(ch.id) === String(charId));
    if (!char) return;
    // Asegurar que el topic está como contexto activo para calcular el profile correcto
    const prevTopicId = currentTopicId;
    currentTopicId = topicId;
    renderRpgStatsModal(char);
    currentTopicId = prevTopicId;
    openModal('rpgStatsModal');
}

// ── Modal de stats RPG en modo bloqueante ────────────────────────────────────
// Cuando se abre desde la creación de un tema RPG, el modal no se puede cerrar
// hasta que el jugador pulse "Confirmar ficha y entrar".
// _rpgStatsCallback se llama cuando el usuario confirma.

let _rpgStatsBlocking   = false;
let _rpgStatsCallback   = null;

/**
 * Abre el modal de stats en modo bloqueante (obligatorio antes de entrar al tema).
 * @param {string}   charId    - ID del personaje
 * @param {string}   topicId   - ID del tema (para calcular el profile correcto)
 * @param {Function} onConfirm - Callback que se ejecuta al confirmar
 */
function openRpgStatsModalBlocking(charId, topicId, onConfirm) {
    _rpgStatsBlocking = true;
    _rpgStatsCallback = onConfirm || null;

    // Ajustar el contexto de topic para el cálculo de profile
    const prevTopicId = currentTopicId;
    currentTopicId = topicId;

    const char = appData.characters.find(c => String(c.id) === String(charId));
    if (!char) { currentTopicId = prevTopicId; return; }

    renderRpgStatsModal(char);
    currentTopicId = prevTopicId;

    // Poner el modal en modo bloqueante
    const overlay   = document.getElementById('rpgStatsModal');
    const closeBtn  = document.getElementById('rpgStatsCloseBtn');
    const confirmBar = document.getElementById('rpgStatsConfirmBar');

    if (overlay)    overlay.dataset.blocking = 'true';
    if (closeBtn)   closeBtn.style.display   = 'none';
    if (confirmBar) confirmBar.style.display = '';

    _rpgStatsUpdateConfirmState(charId, topicId);
    const modal = document.getElementById('rpgStatsModal');
    if (modal) modal.dataset.charId = charId;
    // Resetear tabs
    const statsBody = document.getElementById('rpgStatsBody');
    const invBody   = document.getElementById('rpgInventoryBody');
    if (statsBody) statsBody.style.display = '';
    if (invBody)   invBody.style.display   = 'none';
    document.querySelectorAll('.rpg-stats-tab').forEach((b,i) => b.classList.toggle('active', i === 0));
    openModal('rpgStatsModal');
}

/** Actualiza el contador de puntos libres y el estado del botón Confirmar */
// ── Catálogo de objetos predefinidos ────────────────────────────────────────
const RPG_ITEM_CATALOG = [
    // Pociones y consumibles
    { id: 'potion_hp',       name: 'Poción de curación',   icon: '🧪', type: 'consumable', desc: 'Restaura 3 HP al usarla.',                         effect: { hp: +3 } },
    { id: 'potion_hp_great', name: 'Poción mayor de curación', icon: '💊', type: 'consumable', desc: 'Restaura HP máximo al usarla.',                 effect: { hp: 'max' } },
    { id: 'antidote',        name: 'Antídoto',              icon: '🍵', type: 'consumable', desc: 'Elimina la condición Envenenado.',                  effect: { removeCondition: 'poisoned' } },
    { id: 'smelling_salts',  name: 'Sales aromáticas',      icon: '🌿', type: 'consumable', desc: 'Elimina la condición Inconsciente con 1 HP.',      effect: { removeCondition: 'unconscious', hp: 1 } },
    { id: 'elixir_courage',  name: 'Elixir de valor',       icon: '⚗️',  type: 'consumable', desc: 'Elimina Asustado y otorga Ventaja 1 turno.',      effect: { removeCondition: 'frightened', addCondition: 'advantage' } },
    // Armas (equipables, dan bonus al oráculo)
    { id: 'sword_basic',    name: 'Espada corta',           icon: '🗡️',  type: 'weapon',    desc: '+1 STR en tiradas de combate.',                    effect: { statBonus: { STR: 1 } } },
    { id: 'sword_magic',    name: 'Espada mágica +2',       icon: '⚔️',  type: 'weapon',    desc: '+2 STR en combate. Brilla en la oscuridad.',       effect: { statBonus: { STR: 2 } } },
    { id: 'bow',            name: 'Arco largo',             icon: '🏹',  type: 'weapon',    desc: '+1 DEX en ataques a distancia.',                   effect: { statBonus: { DEX: 1 } } },
    { id: 'staff_arcane',   name: 'Báculo arcano',          icon: '🪄',  type: 'weapon',    desc: '+2 INT en hechizos.',                              effect: { statBonus: { INT: 2 } } },
    { id: 'dagger_poison',  name: 'Daga envenenada',        icon: '🔪',  type: 'weapon',    desc: '+1 DEX. En fallo crítico del objetivo: Envenenado.',effect: { statBonus: { DEX: 1 }, onHit: { addCondition: 'poisoned' } } },
    // Armaduras y escudos
    { id: 'shield',         name: 'Escudo de madera',       icon: '🛡️',  type: 'armor',     desc: '+1 CON en tiradas de resistencia.',                effect: { statBonus: { CON: 1 } } },
    { id: 'armor_chain',    name: 'Cota de malla',          icon: '🥋',  type: 'armor',     desc: '+2 CON. Desventaja en sigilo (−1 DEX).',           effect: { statBonus: { CON: 2 }, statPenalty: { DEX: -1 } } },
    { id: 'cloak_elven',    name: 'Capa élfica',            icon: '🧥',  type: 'armor',     desc: '+2 DEX en sigilo.',                                effect: { statBonus: { DEX: 2 } } },
    { id: 'amulet_prot',    name: 'Amuleto de protección',  icon: '📿',  type: 'armor',     desc: '+1 a todas las tiradas de salvación.',             effect: { statBonus: { CON: 1, WIS: 1 } } },
    // Herramientas y objetos especiales
    { id: 'torch',          name: 'Antorcha',               icon: '🔦',  type: 'tool',      desc: 'Elimina penalizaciones por oscuridad durante 1h.', effect: { removeCondition: 'blinded' } },
    { id: 'rope',           name: 'Cuerda (15m)',           icon: '🪢',  type: 'tool',      desc: '+1 STR en escalada o captura.',                    effect: { statBonus: { STR: 1 } } },
    { id: 'thieves_tools',  name: 'Herramientas de ladrón', icon: '🔑',  type: 'tool',      desc: '+2 DEX en cerraduras y trampas.',                  effect: { statBonus: { DEX: 2 } } },
    { id: 'spellbook',      name: 'Libro de hechizos',      icon: '📖',  type: 'tool',      desc: '+1 INT en rituales o identificación mágica.',      effect: { statBonus: { INT: 1 } } },
    { id: 'healer_kit',     name: 'Kit de curandero',       icon: '🩹',  type: 'tool',      desc: 'Permite estabilizar a un personaje inconsciente.',  effect: { removeCondition: 'unconscious', hp: 1 } },
    // Objetos mágicos
    { id: 'ring_strength',  name: 'Anillo de fuerza',       icon: '💍',  type: 'magic',     desc: '+2 STR permanente mientras se lleve puesto.',      effect: { statBonus: { STR: 2 } } },
    { id: 'boots_speed',    name: 'Botas de velocidad',     icon: '👢',  type: 'magic',     desc: '+2 DEX en iniciativa y movimiento.',               effect: { statBonus: { DEX: 2 } } },
    { id: 'hat_intellect',  name: 'Sombrero de intelecto',  icon: '🎩',  type: 'magic',     desc: '+2 INT.',                                          effect: { statBonus: { INT: 2 } } },
    { id: 'pearl_wisdom',   name: 'Perla de sabiduría',     icon: '🔮',  type: 'magic',     desc: '+2 WIS.',                                          effect: { statBonus: { WIS: 2 } } },
    { id: 'medallion_cha',  name: 'Medallón de influencia', icon: '🏅',  type: 'magic',     desc: '+2 CHA en negociaciones.',                         effect: { statBonus: { CHA: 2 } } },
    // Pergaminos (uso único)
    { id: 'scroll_fireball',name: 'Pergamino de bola de fuego', icon: '📜', type: 'scroll', desc: 'Uso único. +4 INT en el siguiente hechizo de daño.',effect: { oneUse: true, statBonus: { INT: 4 } } },
    { id: 'scroll_heal',    name: 'Pergamino de curación masiva', icon: '📋', type: 'scroll', desc: 'Uso único. Restaura HP máximo a todos los aliados.', effect: { oneUse: true, hp: 'max' } },
    { id: 'scroll_teleport',name: 'Pergamino de teletransporte', icon: '🗺️', type: 'scroll', desc: 'Uso único. El DM describe el destino.',             effect: { oneUse: true, narrative: true } },
    // Comida y descanso
    { id: 'rations',        name: 'Raciones de viaje',      icon: '🍞',  type: 'consumable', desc: 'Restaura 1 HP. Necesario en viajes largos.',       effect: { hp: 1 } },
    { id: 'inn_rest',       name: 'Noche en la posada',     icon: '🛏️',  type: 'consumable', desc: 'Restaura HP máximo y elimina todas las condiciones.',effect: { hp: 'max', clearConditions: true } }
];

const RPG_ITEM_TYPE_LABELS = {
    consumable: 'Consumible', weapon: 'Arma', armor: 'Armadura',
    tool: 'Herramienta', magic: 'Objeto mágico', scroll: 'Pergamino'
};

// Usa un objeto del inventario y aplica su efecto al perfil
function useInventoryItem(charId, itemId) {
    const char = appData.characters.find(c => String(c.id) === String(charId));
    if (!char || char.userIndex !== currentUserIndex) return;

    const profile = ensureCharacterRpgProfile(char, currentTopicId);
    const catalog  = RPG_ITEM_CATALOG.find(i => i.id === itemId);
    if (!catalog) return;

    const effect = catalog.effect || {};
    const sheetHpMax = RPG_HP_MAX;
    const messages = [];

    // Aplicar efectos
    if (effect.hp === 'max') {
        profile.hp = sheetHpMax;
        messages.push(`HP restaurado al máximo`);
    } else if (typeof effect.hp === 'number' && effect.hp !== 0) {
        profile.hp = Math.max(0, Math.min(sheetHpMax, profile.hp + effect.hp));
        messages.push(`${effect.hp > 0 ? '+' : ''}${effect.hp} HP`);
    }
    if (effect.removeCondition) {
        removeConditionFromProfile(profile, effect.removeCondition);
        messages.push(`${RPG_CONDITIONS[effect.removeCondition]?.label || effect.removeCondition} eliminado`);
    }
    if (effect.addCondition) {
        applyConditionToProfile(profile, effect.addCondition);
        messages.push(`${RPG_CONDITIONS[effect.addCondition]?.label || effect.addCondition} aplicado`);
    }
    if (effect.clearConditions) {
        profile.conditions = [];
        messages.push('Todas las condiciones eliminadas');
    }

    // Retirar el objeto si es de un solo uso
    if (effect.oneUse || catalog.type === 'consumable' || catalog.type === 'scroll') {
        if (typeof RPGState !== 'undefined') RPGState.removeItem(itemId, 1);
    }

    _persistRpgProfile(char, profile);
    renderRpgStatsModal(char);

    const summary = `${catalog.icon} ${catalog.name}: ${messages.join(', ') || 'efectos aplicados'}`;
    if (typeof showAutosave === 'function') showAutosave(summary, 'saved');

    window.dispatchEvent(new CustomEvent('etheria:rpg-item-used', { detail: { charId, itemId, topicId: currentTopicId } }));
}

// Renderiza el panel de inventario dentro del modal de stats
function renderInventoryPanel(charId) {
    const items = (typeof RPGState !== 'undefined') ? RPGState.getInventory() : [];
    if (!items.length) {
        return `<div class="rpg-inventory-empty">Sin objetos. El DM puede otorgarte objetos durante la partida.</div>`;
    }
    return items.map(item => {
        const catalog = RPG_ITEM_CATALOG.find(c => c.id === item.id) || { icon: '📦', name: item.name || item.id, desc: '', effect: {} };
        const isConsumable = catalog.type === 'consumable' || catalog.type === 'scroll';
        const useBtn = isConsumable
            ? `<button class="rpg-item-use-btn" onclick="useInventoryItem('${charId}','${item.id}')" title="Usar">Usar</button>`
            : '';
        return `<div class="rpg-inventory-item" title="${catalog.desc}">
            <span class="rpg-item-icon">${catalog.icon}</span>
            <div class="rpg-item-info">
                <span class="rpg-item-name">${catalog.name}</span>
                <span class="rpg-item-desc">${catalog.desc}</span>
            </div>
            <span class="rpg-item-qty">×${item.qty}</span>
            ${useBtn}
        </div>`;
    }).join('');
}

window.useInventoryItem = useInventoryItem;

// ── Habilidades pasivas de clase (disponibles desde nivel 3) ───────────────
const RPG_CLASS_PASSIVES = {
    barbarian:  { name: 'Furia',           stat: 'STR', bonus: 3, desc: '+3 STR al oráculo en combate cuerpo a cuerpo.' },
    bard:       { name: 'Inspiración',     stat: 'CHA', bonus: 2, desc: '+2 CHA en tiradas de persuasión o actuación.' },
    cleric:     { name: 'Favor divino',    stat: 'WIS', bonus: 2, desc: '+2 WIS en tiradas de curación o fe.' },
    druid:      { name: 'Forma natural',   stat: 'WIS', bonus: 2, desc: '+2 WIS en entornos naturales.' },
    fighter:    { name: 'Estilo de lucha', stat: 'STR', bonus: 2, desc: '+2 STR o DEX según el tipo de ataque.' },
    monk:       { name: 'Ki',              stat: 'DEX', bonus: 3, desc: '+3 DEX en esquivas y ataques sin arma.' },
    paladin:    { name: 'Aura de protección', stat: 'CHA', bonus: 2, desc: '+2 CHA y +1 a tiradas de salvación aliadas.' },
    ranger:     { name: 'Exploración',     stat: 'DEX', bonus: 2, desc: '+2 DEX en terreno conocido o seguimiento.' },
    rogue:      { name: 'Ataque furtivo',  stat: 'DEX', bonus: 3, desc: '+3 DEX si hay ventaja o aliado adyacente.' },
    sorcerer:   { name: 'Magia innata',    stat: 'CHA', bonus: 3, desc: '+3 CHA en hechizos de daño directo.' },
    warlock:    { name: 'Pacto arcano',    stat: 'INT', bonus: 2, desc: '+2 INT en tiradas de conocimiento oscuro.' },
    wizard:     { name: 'Conjuración',     stat: 'INT', bonus: 3, desc: '+3 INT en hechizos de área o ritual.' }
};

// Recalcula HP_max al subir de nivel (CON sigue siendo la base)
function recalcHpMaxOnLevelUp(profile, char) {
    if (!profile || !char) return;
    // HP_max = 10 + (CON - 10) * 2 + (level - 1) * 1  (1 HP extra por nivel)
    const con = profile.stats?.CON ?? 8;
    const conMod = Math.floor((con - 10) / 2);
    const level  = profile.level ?? 1;
    const newMax = Math.max(1, 10 + conMod * 2 + (level - 1));
    profile.hp   = Math.min(profile.hp ?? newMax, newMax);
    // Actualizar también RPGState si está activo
    if (typeof RPGState !== 'undefined') RPGState.setMaxHp(newMax);
}

// Abre el modal de level-up mostrando el nuevo nivel y el punto de stat disponible
function openLevelUpModal(charId, newLevel) {
    const char = appData.characters.find(c => String(c.id) === String(charId));
    if (!char || char.userIndex !== currentUserIndex) return;

    const profile  = ensureCharacterRpgProfile(char, currentTopicId);
    const classObj = RPG_CLASSES.find(cl => cl.id === profile.rpgClass);
    const passive  = classObj ? RPG_CLASS_PASSIVES[classObj.id] : null;
    const unlocksPassive = newLevel === 3 && passive;

    // Garantizar que el personaje tenga un punto extra para distribuir
    profile.pendingStatPoints = (profile.pendingStatPoints || 0) + 1;
    _persistRpgProfile(char, profile);

    const modal = document.getElementById('rpgLevelUpModal');
    const body  = document.getElementById('rpgLevelUpBody');
    if (!modal || !body) return;

    body.innerHTML = `
        <div class="levelup-header">
            <span class="levelup-icon">✦</span>
            <div class="levelup-title">¡Nivel ${newLevel}!</div>
            <div class="levelup-sub">${typeof escapeHtml === "function" ? escapeHtml(char.name) : char.name} ha ganado experiencia suficiente para avanzar.</div>
        </div>
        <div class="levelup-gains">
            <div class="levelup-gain">+1 punto de stat para distribuir</div>
            <div class="levelup-gain">HP máximo aumentado</div>
            ${unlocksPassive ? `<div class="levelup-gain unlock">⚡ Habilidad desbloqueada: <strong>${passive.name}</strong> — ${passive.desc}</div>` : ''}
        </div>
        <div class="levelup-stat-hint">Abre <strong>Editar stats</strong> para distribuir tu punto.</div>
    `;

    openModal('rpgLevelUpModal');

    // Mostrar en el chat también
    if (typeof showAutosave === 'function') {
        showAutosave(`✦ ${char.name} — ¡Nivel ${newLevel}!${unlocksPassive ? ' · ' + passive.name + ' desbloqueada' : ''}`, 'saved');
    }
}


// Cambia entre la pestaña Stats e Inventario del modal rpgStatsModal
function switchRpgStatsTab(tab, btnEl) {
    const statsBody = document.getElementById('rpgStatsBody');
    const invBody   = document.getElementById('rpgInventoryBody');
    const tabs      = document.querySelectorAll('.rpg-stats-tab');

    tabs.forEach(b => b.classList.remove('active'));
    if (btnEl) btnEl.classList.add('active');

    if (tab === 'inventory') {
        if (statsBody) statsBody.style.display = 'none';
        if (invBody)   {
            invBody.style.display = '';
            // Renderizar inventario del personaje activo
            const charId = document.getElementById('rpgStatsModal')?.dataset?.charId || '';
            invBody.innerHTML = renderInventoryPanel(charId);
        }
    } else {
        if (statsBody) statsBody.style.display = '';
        if (invBody)   invBody.style.display   = 'none';
    }
}
window.switchRpgStatsTab = switchRpgStatsTab;

window.openLevelUpModal  = openLevelUpModal;
window.recalcHpMaxOnLevelUp = recalcHpMaxOnLevelUp;

function _rpgStatsUpdateConfirmState(charId, topicId) {
    const char = appData.characters.find(c => String(c.id) === String(charId));
    if (!char) return;

    const prevTopicId = currentTopicId;
    currentTopicId = topicId;
    const profile   = ensureCharacterRpgProfile(char, topicId);
    currentTopicId  = prevTopicId;

    const spent     = getRpgSpentPoints(profile);
    const free      = Math.max(0, RPG_POINTS_POOL - spent);
    const freeEl    = document.getElementById('rpgStatsFreeCount');
    const confirmBtn = document.getElementById('rpgStatsConfirmBtn');

    if (freeEl)    freeEl.textContent = free;
    if (confirmBtn) {
        // Permitir confirmar siempre — el jugador puede dejar puntos sin gastar si quiere.
        // La distribución es opcional, no bloqueante.
        confirmBtn.disabled = false;
        confirmBtn.title    = free > 0
            ? `Tienes ${free} punto${free !== 1 ? 's' : ''} sin asignar. Puedes confirmar ahora o seguir distribuyendo.`
            : '✓ Todos los puntos distribuidos';
    }
}

/** El jugador pulsa "Confirmar ficha y entrar" */
function rpgStatsConfirm() {
    const cb = _rpgStatsCallback;
    _rpgStatsBlocking = false;
    _rpgStatsCallback = null;
    _rpgStatsResetModal();
    closeModal('rpgStatsModal');
    if (typeof cb === 'function') cb();
}

/** Click fuera del modal — solo cierra si NO es bloqueante */
function rpgStatsModalOutsideClick(event) {
    if (event.target !== document.getElementById('rpgStatsModal')) return;
    if (_rpgStatsBlocking) return; // bloqueado — ignorar
    closeModal('rpgStatsModal');
}

/** Restaura el modal a su estado normal (no bloqueante) */
function _rpgStatsResetModal() {
    const overlay   = document.getElementById('rpgStatsModal');
    const closeBtn  = document.getElementById('rpgStatsCloseBtn');
    const confirmBar = document.getElementById('rpgStatsConfirmBar');
    if (overlay)    delete overlay.dataset.blocking;
    if (closeBtn)   closeBtn.style.display   = '';
    if (confirmBar) confirmBar.style.display = 'none';
}

// Patch de adjustRpgStat: actualizar también el contador de puntos en modo bloqueante
// (se usa mediante evento de re-render, sin depender del orden de carga)
window.addEventListener('etheria:rpg-stat-changed', function(e) {
    if (!_rpgStatsBlocking) return;
    const { charId, topicId } = e.detail || {};
    if (charId && topicId) _rpgStatsUpdateConfirmState(charId, topicId);
});

window.openRpgStatsModalBlocking  = openRpgStatsModalBlocking;
window.rpgStatsConfirm             = rpgStatsConfirm;
window.rpgStatsModalOutsideClick   = rpgStatsModalOutsideClick;
window._rpgStatsUpdateConfirmState = _rpgStatsUpdateConfirmState;
