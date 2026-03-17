// ============================================================
// RPG STATE
// Estado local de una sesión RPG: stats, inventario y flags
// persistentes entre escenas.
// Completamente independiente del estado global de Etheria
// (appData, currentUserIndex, etc.) — solo lee el profileIndex
// para saber dónde guardar en localStorage.
// ============================================================

const RPGState = (function () {

    const STORAGE_PREFIX = 'etheria_rpg_state_';

    // Estado en memoria durante la sesión
    let _profileIndex = 0;
    let _stats        = {};  // { STR: 10, DEX: 8, ... }
    let _inventory    = [];  // [{ id: 'sword', name: 'Espada', qty: 1, data: {} }]
    let _flags        = {};  // variables persistentes entre escenas: { met_kazuma: true, ... }
    let _xp           = 0;
    let _level        = 1;
    let _hp           = { current: 20, max: 20 };

    // Stats base por defecto — sistema D&D completo (mismo que sheets.js)
    const DEFAULT_STATS = {
        STR: 8,  // Fuerza
        DEX: 8,  // Destreza
        CON: 8,  // Constitución
        INT: 8,  // Inteligencia
        WIS: 8,  // Sabiduría
        CHA: 8   // Carisma
    };

    // ── Ciclo de vida ───────────────────────────────────────────

    function init(profileIndex) {
        _profileIndex = profileIndex || 0;
        _load();
    }

    function reset() {
        _stats     = { ...DEFAULT_STATS };
        _inventory = [];
        _flags     = {};
        _xp        = 0;
        _level     = 1;
        _hp        = { current: 20, max: 20 };
        _save();
    }

    // ── Stats ───────────────────────────────────────────────────

    function getStat(key) {
        return _stats[key] !== undefined ? _stats[key] : DEFAULT_STATS[key] ?? 10;
    }

    function setStat(key, value) {
        _stats[key] = Math.max(1, Math.min(30, Number(value) || 10));
        _save();
        _emitChange('stats');
    }

    function modifyStat(key, delta) {
        setStat(key, getStat(key) + delta);
    }

    function getStats() {
        return { ...DEFAULT_STATS, ..._stats };
    }

    // Modificador D&D: (stat - 10) / 2 redondeado hacia abajo
    function getModifier(key) {
        return Math.floor((getStat(key) - 10) / 2);
    }

    // ── HP ──────────────────────────────────────────────────────

    function getHp()    { return { ..._hp }; }
    function getMaxHp() { return _hp.max; }

    function setMaxHp(max) {
        _hp.max = Math.max(1, max);
        _hp.current = Math.min(_hp.current, _hp.max);
        _save();
        _emitChange('hp');
    }

    function modifyHp(delta) {
        _hp.current = Math.max(0, Math.min(_hp.max, _hp.current + delta));
        _save();
        _emitChange('hp');
    }

    function isDead() { return _hp.current <= 0; }

    // ── XP y nivel ─────────────────────────────────────────────

    function getXp()    { return _xp; }
    function getLevel() { return _level; }

    function addXp(amount) {
        _xp += amount;
        const newLevel = _calculateLevel(_xp);
        if (newLevel > _level) {
            _level = newLevel;
            _emitChange('level-up', { level: _level, xp: _xp });
        }
        _save();
        _emitChange('xp');
    }

    function _calculateLevel(xp) {
        // Curva simple: nivel = 1 + floor(xp / 100)
        return Math.max(1, 1 + Math.floor(xp / 100));
    }

    // ── Inventario ──────────────────────────────────────────────

    function hasItem(itemId) {
        return _inventory.some(i => i.id === itemId && i.qty > 0);
    }

    function getItem(itemId) {
        return _inventory.find(i => i.id === itemId) || null;
    }

    function getInventory() {
        return _inventory.map(i => ({ ...i }));
    }

    function addItem(item) {
        // item: { id, name, qty?, description?, data? }
        if (!item || !item.id) return;

        const existing = _inventory.find(i => i.id === item.id);
        if (existing) {
            existing.qty = (existing.qty || 1) + (item.qty || 1);
        } else {
            _inventory.push({
                id:          item.id,
                name:        item.name || item.id,
                qty:         item.qty || 1,
                description: item.description || '',
                data:        item.data || {}
            });
        }
        _save();
        _emitChange('inventory');
    }

    function removeItem(itemId, qty = 1) {
        const idx = _inventory.findIndex(i => i.id === itemId);
        if (idx === -1) return false;

        _inventory[idx].qty -= qty;
        if (_inventory[idx].qty <= 0) {
            _inventory.splice(idx, 1);
        }
        _save();
        _emitChange('inventory');
        return true;
    }

    // ── Flags (variables persistentes entre escenas) ─────────────

    function getFlag(key)         { return _flags[key]; }
    function setFlag(key, value)  { _flags[key] = value; _save(); }
    function hasFlag(key)         { return _flags[key] !== undefined && _flags[key] !== false && _flags[key] !== null; }

    // ── Condiciones (para evaluar en scripts) ───────────────────

    /**
     * Evalúa una condición del script.
     * Ejemplos de condición:
     *   { has_item: 'sword' }
     *   { flag: 'met_kazuma' }
     *   { flag_equals: { key: 'times_visited', value: 3 } }
     *   { stat_gte: { stat: 'STR', value: 14 } }
     *   { stat_lte: { stat: 'HP_current', value: 5 } }
     *   { level_gte: 3 }
     */
    function evalCondition(condition) {
        if (!condition) return true;

        if (condition.has_item)    return hasItem(condition.has_item);
        if (condition.not_item)    return !hasItem(condition.not_item);
        if (condition.flag)        return hasFlag(condition.flag);
        if (condition.not_flag)    return !hasFlag(condition.not_flag);

        if (condition.flag_equals) {
            return getFlag(condition.flag_equals.key) === condition.flag_equals.value;
        }
        if (condition.stat_gte) {
            const val = condition.stat_gte.stat === 'HP'
                ? _hp.current
                : getStat(condition.stat_gte.stat);
            return val >= condition.stat_gte.value;
        }
        if (condition.stat_lte) {
            const val = condition.stat_lte.stat === 'HP'
                ? _hp.current
                : getStat(condition.stat_lte.stat);
            return val <= condition.stat_lte.value;
        }
        if (condition.level_gte)  return _level >= condition.level_gte;
        if (condition.xp_gte)     return _xp >= condition.xp_gte;

        console.warn('[RPGState] Condición desconocida:', condition);
        return true;
    }

    // ── Snapshot (para guardar/cargar con el topic) ─────────────

    function getSnapshot() {
        return {
            stats:     { ..._stats },
            inventory: _inventory.map(i => ({ ...i })),
            flags:     { ..._flags },
            xp:        _xp,
            level:     _level,
            hp:        { ..._hp }
        };
    }

    function loadSnapshot(snapshot) {
        if (!snapshot || typeof snapshot !== 'object') return;
        _stats     = snapshot.stats     || {};
        _inventory = snapshot.inventory || [];
        _flags     = snapshot.flags     || {};
        _xp        = snapshot.xp        || 0;
        _level     = snapshot.level     || 1;
        _hp        = snapshot.hp        || { current: 20, max: 20 };
        _save();
    }

    // ── Persistencia ────────────────────────────────────────────

    function _save() {
        try {
            localStorage.setItem(
                STORAGE_PREFIX + _profileIndex,
                JSON.stringify(getSnapshot())
            );
        } catch (e) {
            console.warn('[RPGState] No se pudo guardar estado:', e);
        }
    }

    function _load() {
        try {
            const raw = localStorage.getItem(STORAGE_PREFIX + _profileIndex);
            if (raw) {
                loadSnapshot(JSON.parse(raw));
            } else {
                reset();
            }
        } catch (e) {
            console.warn('[RPGState] No se pudo cargar estado:', e);
            reset();
        }
    }

    // ── Emisión de eventos ───────────────────────────────────────
    // Usa el eventBus si está disponible; si no, silencioso.

    function _emitChange(type, extra) {
        if (!window.eventBus) return;
        eventBus.emit('rpg:state-changed', { type, ...extra });

        // Para cambios que afectan la barra de stats, emitir también
        // rpg:state-updated con los valores ya calculados.
        // Así el renderer no necesita consultar RPGState manualmente.
        if (type === 'hp' || type === 'xp' || type === 'level-up') {
            eventBus.emit('rpg:state-updated', {
                hp:    { ..._hp },
                xp:    _xp,
                level: _level
            });
        }
    }


    // ── Puente con las fichas de personaje de Etheria ────────────────────────
    //
    // Las fichas usan directamente STR / DEX / CON / INT / WIS / CHA (base 8, rango 8-15)
    // igual que el motor de escenas. No hay conversión de vocabulario — se copian directo.
    // HP_max = 10 + (CON_mod × 2) + (level - 1)   (crece con nivel y CON)

    // Sincroniza los stats D&D desde la ficha del personaje al motor de escenas.
    // Los stats de la ficha YA son D&D (STR/DEX/CON/INT/WIS/CHA, rango 8-15),
    // por lo que no hay conversión — se copian directamente.
    function syncFromCharacter(char, topicId) {
        if (!char) return;

        try {
            if (typeof ensureCharacterRpgProfile !== 'function') return;
            const profile = ensureCharacterRpgProfile(char, topicId);
            if (!profile?.stats) return;

            const s = profile.stats;
            _stats = {
                STR: Math.max(1, Number(s.STR) || 8),
                DEX: Math.max(1, Number(s.DEX) || 8),
                CON: Math.max(1, Number(s.CON) || 8),
                INT: Math.max(1, Number(s.INT) || 8),
                WIS: Math.max(1, Number(s.WIS) || 8),
                CHA: Math.max(1, Number(s.CHA) || 8)
            };

            // HP_max derivado de CON según reglas D&D: hp_max = 10 + (CON - 10) * 2
            const conMod = Math.floor((_stats.CON - 10) / 2);
            const hpMax  = Math.max(1, 10 + conMod * 2);
            _hp.max = hpMax;

            // Sincronizar HP actual, XP y nivel desde la ficha si existen
            if (profile.hp    !== undefined) _hp.current = Math.max(0, Math.min(hpMax, Math.round((profile.hp / 10) * hpMax)));
            if (profile.exp   !== undefined) _xp   = Math.max(0, profile.exp);
            if (profile.level !== undefined) _level = Math.max(1, profile.level);

            _save();
            _emitChange('stats');

            console.debug('[RPGState] Stats D&D sincronizados:', _stats, '| HP_max:', hpMax);
        } catch (e) {
            console.warn('[RPGState] syncFromCharacter error:', e?.message);
        }
    }

    /**
     * Escribe de vuelta a la ficha los cambios de HP/EXP/level
     * que el motor de escenas haya producido (combate, eventos, etc.)
     * @param {object} char     Personaje de appData.characters
     * @param {string} topicId
     */
    function syncToCharacter(char, topicId) {
        if (!char || typeof ensureCharacterRpgProfile !== 'function') return;
        try {
            const profile = ensureCharacterRpgProfile(char, topicId);
            if (!profile) return;

            // Convertir HP del rango D&D (0-hp.max) al rango de la ficha (0-RPG_HP_MAX).
            // Sin esta conversion profile.hp podria valer 14, 18... fuera del rango 0-10
            // que la UI de la ficha espera, corrompiendo la barra de vida del personaje.
            const sheetHpMax = (typeof RPG_HP_MAX !== 'undefined') ? RPG_HP_MAX : 10;
            const hpRatio    = _hp.max > 0 ? _hp.current / _hp.max : 1;
            profile.hp       = Math.max(0, Math.min(sheetHpMax, Math.round(hpRatio * sheetHpMax)));

            // EXP en escala de la ficha (0 a RPG_EXP_PER_LEVEL-1)
            const expPerLevel = (typeof RPG_EXP_PER_LEVEL !== 'undefined') ? RPG_EXP_PER_LEVEL : 10;
            profile.exp   = _xp % expPerLevel;
            profile.level = _level;

            // Persistir
            const topic = typeof appData !== 'undefined'
                ? appData.topics?.find(t => String(t.id) === String(topicId))
                : null;
            if (topic && topic.rpgProfiles) {
                topic.rpgProfiles[char.id] = profile;
            }
            char.rpgProfile = profile;

            if (typeof hasUnsavedChanges !== 'undefined') hasUnsavedChanges = true;
            if (typeof save === 'function') save({ silent: true });

            console.debug('[RPGState] Sincronizado a ficha: HP_sheet', profile.hp,
                '/', sheetHpMax, '| HP_dnd', _hp.current, '/', _hp.max,
                '| EXP', profile.exp, '| Level', _level);
        } catch (e) {
            console.warn('[RPGState] syncToCharacter error:', e?.message);
        }
    }

    return {
        // Ciclo de vida
        init, reset,
        // Stats
        getStat, setStat, modifyStat, getStats, getModifier,
        // HP
        getHp, getMaxHp, setMaxHp, modifyHp, isDead,
        // XP / Level
        getXp, getLevel, addXp,
        // Inventario
        hasItem, getItem, getInventory, addItem, removeItem,
        // Flags
        getFlag, setFlag, hasFlag,
        // Condiciones
        evalCondition,
        // Snapshot
        getSnapshot, loadSnapshot,
        // Puente con fichas de Etheria
        syncFromCharacter, syncToCharacter
    };
})();
