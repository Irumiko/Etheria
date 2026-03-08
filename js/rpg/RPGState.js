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

    // Stats base por defecto (sistema D&D simplificado)
    const DEFAULT_STATS = {
        STR: 10,  // Fuerza
        DEX: 10,  // Destreza
        CON: 10,  // Constitución
        INT: 10,  // Inteligencia
        WIS: 10,  // Sabiduría
        CHA: 10   // Carisma
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
        getSnapshot, loadSnapshot
    };
})();
