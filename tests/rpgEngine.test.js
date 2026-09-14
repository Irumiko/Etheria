// Tests para js/rpg/RPGState.js y js/rpg/RPGEngine.js
// Motor de reglas D&D-lite y estado de sesión RPG — sin cobertura previa.
// Carga los ficheros reales en un sandbox vm (mismo patrón que localStories.test.js),
// con SceneLoader/SceneValidator mockeados para controlar la escena servida
// y un eventBus mínimo en memoria (sin DOM) para capturar lo emitido.

const test   = require('node:test');
const assert = require('node:assert/strict');
const fs     = require('node:fs');
const vm     = require('node:vm');

function createLocalStorage(seed = {}) {
    const store = new Map(Object.entries(seed));
    return {
        getItem(key) { return store.has(key) ? store.get(key) : null; },
        setItem(key, value) { store.set(String(key), String(value)); },
        removeItem(key) { store.delete(String(key)); },
        key(index) { return Array.from(store.keys())[index] || null; },
        get length() { return store.size; }
    };
}

function makeEventBus() {
    const handlers = {};
    const log = [];
    const bus = {
        emit(type, payload) {
            log.push({ type, payload });
            (handlers[type] || []).slice().forEach((h) => h(payload));
        },
        on(type, handler) {
            (handlers[type] = handlers[type] || []).push(handler);
            return function off() {
                handlers[type] = (handlers[type] || []).filter((h) => h !== handler);
            };
        },
        once(type, handler) {
            const off = bus.on(type, function (payload) { off(); handler(payload); });
            return off;
        }
    };
    bus._log = log;
    bus._emitted = (type) => log.filter((e) => e.type === type).map((e) => e.payload);
    return bus;
}

function loadScript(file, sandbox) {
    vm.runInContext(fs.readFileSync(file, 'utf8'), sandbox, { filename: file });
}

// ── Sandbox solo con RPGState (para los tests de estado puro) ───────────────

function makeStateSandbox() {
    const localStorage = createLocalStorage();
    const eventBus = makeEventBus();
    const window = { eventBus };
    const sandbox = vm.createContext({ console, localStorage, window, eventBus });
    loadScript('js/rpg/RPGState.js', sandbox);
    // RPGState.js declara `const RPGState = ...` sin exportarlo a window (patrón
    // de <script> global) — hay que leer el binding top-level del propio contexto.
    const RPGState = vm.runInContext('RPGState', sandbox);
    return { RPGState, eventBus, sandbox };
}

// ── Sandbox con RPGState + RPGEngine + SceneLoader/SceneValidator mockeados ──
// Los timers se resuelven de forma síncrona para no depender de setTimeout real
// (stat_check y wait usan delays de hasta 1.8s en producción).

function makeEngineSandbox() {
    const localStorage = createLocalStorage();
    const eventBus = makeEventBus();
    const window = { eventBus };
    let nextScene = null;

    const SceneLoader = {
        load: async (sceneId) => (nextScene && nextScene.id === sceneId) ? nextScene : null
    };
    const SceneValidator = {
        validate: () => ({ ok: true, errors: [] })
    };

    const sandbox = vm.createContext({
        console,
        localStorage,
        window,
        eventBus,
        SceneLoader,
        SceneValidator,
        setTimeout: (fn) => { fn(); return 0; },   // resuelve stat_check/wait al instante
        clearTimeout: () => {},
        Math
    });
    loadScript('js/rpg/RPGState.js', sandbox);
    loadScript('js/rpg/RPGEngine.js', sandbox);
    // Ninguno de los dos exporta a window (patrón de <script> global) — leer los
    // bindings top-level del propio contexto, igual que en makeStateSandbox().
    const RPGState  = vm.runInContext('RPGState', sandbox);
    const RPGEngine = vm.runInContext('RPGEngine', sandbox);

    return {
        RPGState,
        RPGEngine,
        eventBus,
        sandbox,
        setScene(scene) { nextScene = scene; }
    };
}

// ═══════════════════════════════════════════════════════════════════════════
// RPGState
// ═══════════════════════════════════════════════════════════════════════════

test('RPGState.getStat devuelve el valor por defecto (8) para stats no tocadas', () => {
    const { RPGState } = makeStateSandbox();
    assert.equal(RPGState.getStat('STR'), 8);
    assert.equal(RPGState.getStat('UNKNOWN'), 10); // fuera de DEFAULT_STATS
});

test('RPGState.setStat/getStat normalizan la clave a mayúsculas', () => {
    const { RPGState } = makeStateSandbox();
    RPGState.setStat('str', 15);
    assert.equal(RPGState.getStat('STR'), 15);
    assert.equal(RPGState.getStat('str'), 15);
});

test('RPGState.setStat clampa el valor entre 1 y 30', () => {
    const { RPGState } = makeStateSandbox();
    RPGState.setStat('DEX', 999);
    assert.equal(RPGState.getStat('DEX'), 30);
    RPGState.setStat('DEX', -5);
    assert.equal(RPGState.getStat('DEX'), 1);
});

test('RPGState.modifyStat suma el delta al valor actual', () => {
    const { RPGState } = makeStateSandbox();
    RPGState.setStat('CHA', 10);
    RPGState.modifyStat('CHA', 3);
    assert.equal(RPGState.getStat('CHA'), 13);
    RPGState.modifyStat('CHA', -20);
    assert.equal(RPGState.getStat('CHA'), 1); // clamp inferior
});

test('RPGState.getModifier aplica la fórmula D&D (stat-10)/2 redondeando hacia abajo', () => {
    const { RPGState } = makeStateSandbox();
    RPGState.setStat('STR', 14);
    assert.equal(RPGState.getModifier('STR'), 2);
    RPGState.setStat('STR', 9);
    assert.equal(RPGState.getModifier('STR'), -1); // floor(-0.5) = -1
});

test('RPGState HP: valores iniciales, modifyHp y clamping en ambos extremos', () => {
    const { RPGState } = makeStateSandbox();
    const hp0 = RPGState.getHp();
    assert.equal(hp0.current, 20);
    assert.equal(hp0.max, 20);
    RPGState.modifyHp(-5);
    assert.equal(RPGState.getHp().current, 15);
    RPGState.modifyHp(-100);
    assert.equal(RPGState.getHp().current, 0, 'no debe bajar de 0');
    assert.equal(RPGState.isDead(), true);
    RPGState.modifyHp(1000);
    assert.equal(RPGState.getHp().current, 20, 'no debe superar el máximo');
    assert.equal(RPGState.isDead(), false);
});

test('RPGState.setMaxHp reduce el HP actual si supera el nuevo máximo', () => {
    const { RPGState } = makeStateSandbox();
    RPGState.setMaxHp(10);
    assert.equal(RPGState.getHp().current, 10);
    assert.equal(RPGState.getMaxHp(), 10);
});

test('RPGState.addXp sube de nivel al cruzar el umbral y emite level-up', () => {
    const { RPGState, eventBus } = makeStateSandbox();
    assert.equal(RPGState.getLevel(), 1);
    RPGState.addXp(250);
    assert.equal(RPGState.getXp(), 250);
    assert.equal(RPGState.getLevel(), 3); // 1 + floor(250/100)
    const levelUps = eventBus._emitted('rpg:state-changed').filter((p) => p.type === 'level-up');
    assert.equal(levelUps.length, 1);
    assert.equal(levelUps[0].level, 3);
});

test('RPGState.addXp no emite level-up si el nivel no cambia', () => {
    const { RPGState, eventBus } = makeStateSandbox();
    RPGState.addXp(10);
    const levelUps = eventBus._emitted('rpg:state-changed').filter((p) => p.type === 'level-up');
    assert.equal(levelUps.length, 0);
});

test('RPGState inventario: addItem acumula qty, removeItem descuenta y elimina al llegar a 0', () => {
    const { RPGState } = makeStateSandbox();
    RPGState.addItem({ id: 'sword', name: 'Espada' });
    RPGState.addItem({ id: 'sword', qty: 2 });
    assert.equal(RPGState.getItem('sword').qty, 3);
    assert.equal(RPGState.hasItem('sword'), true);

    assert.equal(RPGState.removeItem('sword', 2), true);
    assert.equal(RPGState.getItem('sword').qty, 1);

    assert.equal(RPGState.removeItem('sword', 1), true);
    assert.equal(RPGState.getItem('sword'), null);
    assert.equal(RPGState.hasItem('sword'), false);

    assert.equal(RPGState.removeItem('no-existe'), false);
});

test('RPGState flags: setFlag/getFlag/hasFlag tratan false y null como "no seteado"', () => {
    const { RPGState } = makeStateSandbox();
    assert.equal(RPGState.hasFlag('met_kazuma'), false);
    RPGState.setFlag('met_kazuma', true);
    assert.equal(RPGState.hasFlag('met_kazuma'), true);
    assert.equal(RPGState.getFlag('met_kazuma'), true);

    RPGState.setFlag('visited', false);
    assert.equal(RPGState.hasFlag('visited'), false, 'flag=false cuenta como no seteada');
    RPGState.setFlag('cleared', null);
    assert.equal(RPGState.hasFlag('cleared'), false, 'flag=null cuenta como no seteada');
});

test('RPGState.evalCondition: has_item / not_item / flag / not_flag / flag_equals', () => {
    const { RPGState } = makeStateSandbox();
    RPGState.addItem({ id: 'key' });
    RPGState.setFlag('door_open', true);
    RPGState.setFlag('visits', 3);

    assert.equal(RPGState.evalCondition({ has_item: 'key' }), true);
    assert.equal(RPGState.evalCondition({ has_item: 'lockpick' }), false);
    assert.equal(RPGState.evalCondition({ not_item: 'lockpick' }), true);
    assert.equal(RPGState.evalCondition({ flag: 'door_open' }), true);
    assert.equal(RPGState.evalCondition({ not_flag: 'door_open' }), false);
    assert.equal(RPGState.evalCondition({ flag_equals: { key: 'visits', value: 3 } }), true);
    assert.equal(RPGState.evalCondition({ flag_equals: { key: 'visits', value: 4 } }), false);
    assert.equal(RPGState.evalCondition(null), true, 'sin condición → siempre true');
});

test('RPGState.evalCondition: stat_gte/stat_lte usan HP real para "HP"/"HP_current", no un stat fantasma', () => {
    const { RPGState } = makeStateSandbox();
    RPGState.modifyHp(-15); // HP actual: 5/20
    assert.equal(RPGState.evalCondition({ stat_lte: { stat: 'HP', value: 5 } }), true);
    assert.equal(RPGState.evalCondition({ stat_lte: { stat: 'HP_current', value: 5 } }), true);
    assert.equal(RPGState.evalCondition({ stat_gte: { stat: 'HP', value: 6 } }), false);

    RPGState.setStat('STR', 14);
    assert.equal(RPGState.evalCondition({ stat_gte: { stat: 'STR', value: 14 } }), true);
    assert.equal(RPGState.evalCondition({ stat_gte: { stat: 'str', value: 14 } }), true, 'stat_gte también normaliza mayúsculas vía getStat');
});

test('RPGState.evalCondition: level_gte y xp_gte', () => {
    const { RPGState } = makeStateSandbox();
    RPGState.addXp(150); // nivel 2, xp 150
    assert.equal(RPGState.evalCondition({ level_gte: 2 }), true);
    assert.equal(RPGState.evalCondition({ level_gte: 3 }), false);
    assert.equal(RPGState.evalCondition({ xp_gte: 150 }), true);
    assert.equal(RPGState.evalCondition({ xp_gte: 200 }), false);
});

test('RPGState.getSnapshot/loadSnapshot: round-trip exacto', () => {
    const { RPGState } = makeStateSandbox();
    RPGState.setStat('WIS', 12);
    RPGState.addItem({ id: 'potion', qty: 2 });
    RPGState.setFlag('met_kazuma', true);
    RPGState.addXp(120);
    RPGState.modifyHp(-3);

    const snap = RPGState.getSnapshot();

    const { RPGState: fresh } = makeStateSandbox();
    fresh.loadSnapshot(snap);
    assert.equal(fresh.getStat('WIS'), 12);
    assert.equal(fresh.getItem('potion').qty, 2);
    assert.equal(fresh.hasFlag('met_kazuma'), true);
    assert.equal(fresh.getXp(), 120);
    assert.equal(fresh.getHp().current, RPGState.getHp().current);
    assert.equal(fresh.getHp().max, RPGState.getHp().max);
});

test('RPGState persiste en localStorage entre instancias con el mismo profileIndex', () => {
    const localStorage = createLocalStorage();
    const eventBus = makeEventBus();
    const window = { eventBus };
    const sandbox = vm.createContext({ console, localStorage, window, eventBus });
    loadScript('js/rpg/RPGState.js', sandbox);
    const RPGState = vm.runInContext('RPGState', sandbox);

    RPGState.init(0);
    RPGState.setStat('INT', 18);
    RPGState.addItem({ id: 'map' });

    // Nueva instancia del módulo sobre el mismo localStorage — simula recarga de página
    const sandbox2 = vm.createContext({ console, localStorage, window, eventBus });
    loadScript('js/rpg/RPGState.js', sandbox2);
    const RPGState2 = vm.runInContext('RPGState', sandbox2);
    RPGState2.init(0);

    assert.equal(RPGState2.getStat('INT'), 18);
    assert.equal(RPGState2.hasItem('map'), true);
});

test('RPGState.syncFromCharacter usa RPG_HP_MAX (no un /10 hardcodeado) para convertir el HP de la ficha', () => {
    const localStorage = createLocalStorage();
    const eventBus = makeEventBus();
    const window = { eventBus };
    const sandbox = vm.createContext({
        console, localStorage, window, eventBus,
        RPG_HP_MAX: 20, // ficha en escala 0-20, no 0-10
        ensureCharacterRpgProfile: () => ({ stats: { STR: 12, DEX: 10, CON: 12, INT: 8, WIS: 8, CHA: 8 }, hp: 10, exp: 40, level: 2 })
    });
    loadScript('js/rpg/RPGState.js', sandbox);
    const RPGState = vm.runInContext('RPGState', sandbox);

    RPGState.syncFromCharacter({ id: 'c1' }, 't1');

    // CON 12 → conMod floor((12-10)/2)=1 → hp_max = 10 + 1*2 = 12
    assert.equal(RPGState.getMaxHp(), 12);
    // profile.hp=10 sobre escala RPG_HP_MAX=20 → ratio 0.5 → current = round(0.5*12) = 6
    assert.equal(RPGState.getHp().current, 6);
    assert.equal(RPGState.getXp(), 40);
    assert.equal(RPGState.getLevel(), 2);
});

test('RPGState.syncToCharacter convierte el HP de vuelta a la escala de la ficha (RPG_HP_MAX)', () => {
    const localStorage = createLocalStorage();
    const eventBus = makeEventBus();
    const window = { eventBus };
    const sandbox = vm.createContext({
        console, localStorage, window, eventBus,
        RPG_HP_MAX: 20,
        ensureCharacterRpgProfile: (char) => (char.rpgProfile = char.rpgProfile || {})
    });
    loadScript('js/rpg/RPGState.js', sandbox);
    const RPGState = vm.runInContext('RPGState', sandbox);

    RPGState.setMaxHp(12);
    RPGState.modifyHp(-6); // 6/12 = ratio 0.5
    RPGState.addXp(25);

    const char = { id: 'c1' };
    RPGState.syncToCharacter(char, 't1');

    assert.equal(char.rpgProfile.hp, 10, 'ratio 0.5 * RPG_HP_MAX(20) = 10');
    assert.equal(char.rpgProfile.exp, 5, 'expPerLevel por defecto es 10 → 25 % 10 = 5');
    assert.equal(char.rpgProfile.level, 1);
});

// ═══════════════════════════════════════════════════════════════════════════
// RPGEngine
// ═══════════════════════════════════════════════════════════════════════════

test('RPGEngine: modify_stat con stat "HP" (o "hp") daña/cura el HP real, no un stat fantasma', async () => {
    const { RPGState, RPGEngine, setScene } = makeEngineSandbox();
    setScene({
        id: 'test_scene',
        steps: [
            { type: 'modify_stat', stat: 'HP', amount: -6 },
            { type: 'modify_stat', stat: 'hp', amount: -1 },
            { type: 'end' }
        ]
    });

    await RPGEngine.loadScene('test_scene');

    assert.equal(RPGState.getHp().current, 13, '20 - 6 - 1 = 13 de HP real');
    assert.equal(RPGState.getStats().HP, undefined, 'no debe crearse un stat fantasma "HP" en _stats');
});

test('RPGEngine: modify_stat con un stat normal sigue usando RPGState.modifyStat (no toca el HP)', async () => {
    const { RPGState, RPGEngine, setScene } = makeEngineSandbox();
    setScene({
        id: 'test_scene_stat',
        steps: [
            { type: 'modify_stat', stat: 'STR', amount: 3 },
            { type: 'end' }
        ]
    });

    await RPGEngine.loadScene('test_scene_stat');

    assert.equal(RPGState.getStat('STR'), 11); // 8 base + 3
    assert.equal(RPGState.getHp().current, 20, 'el HP no debe cambiar');
});

test('RPGEngine: check_variable salta a goto_true/goto_false según la variable', async () => {
    const { RPGEngine, eventBus, setScene } = makeEngineSandbox();
    setScene({
        id: 'branching_scene',
        variables: { met_npc: true },
        steps: [
            { type: 'check_variable', key: 'met_npc', equals: true, goto_true: 'greet', goto_false: 'intro' }
        ],
        branches: {
            greet: [{ type: 'end', outcome: 'greeted' }],
            intro: [{ type: 'end', outcome: 'introduced' }]
        }
    });

    await RPGEngine.loadScene('branching_scene');

    const ended = eventBus._emitted('scene:ended');
    assert.equal(ended.length, 1);
    assert.equal(ended[0].outcome, 'greeted', 'debe seguir la rama goto_true');
});

test('RPGEngine: goto_branch salta a una rama existente de la escena activa', async () => {
    const { RPGEngine, eventBus, setScene } = makeEngineSandbox();
    setScene({
        id: 'goto_scene',
        steps: [{ type: 'goto_branch', branch: 'secret' }],
        branches: { secret: [{ type: 'end', outcome: 'found-secret' }] }
    });

    await RPGEngine.loadScene('goto_scene');

    const ended = eventBus._emitted('scene:ended');
    assert.equal(ended[0].outcome, 'found-secret');
});

test('RPGEngine.getVisibleOptions filtra opciones cuya condición no se cumple', async () => {
    const { RPGState, RPGEngine } = makeEngineSandbox();
    RPGState.addItem({ id: 'key' });

    const options = RPGEngine.getVisibleOptions([
        { text: 'Abrir puerta', condition: { has_item: 'key' } },
        { text: 'Forzar cerradura', condition: { has_item: 'lockpick' } },
        { text: 'Irse' } // sin condición → siempre visible
    ]);

    assert.equal(options.length, 2);
    assert.deepEqual(options.map((o) => o.text), ['Abrir puerta', 'Irse']);
});

test('RPGEngine.choiceMade aplica set_flag/give_item/add_xp de la opción elegida y navega con goto', async () => {
    const { RPGState, RPGEngine, setScene } = makeEngineSandbox();
    setScene({
        id: 'choice_scene',
        steps: [{
            type: 'choice',
            options: [
                { text: 'Aceptar la espada', set_flag: { key: 'armed', value: true }, give_item: { id: 'sword' }, add_xp: 10, goto: 'armed_path' },
                { text: 'Rechazar', goto: 'unarmed_path' }
            ]
        }],
        branches: {
            armed_path:   [{ type: 'end', outcome: 'armed' }],
            unarmed_path: [{ type: 'end', outcome: 'unarmed' }]
        }
    });

    await RPGEngine.loadScene('choice_scene');
    RPGEngine.choiceMade(0);

    assert.equal(RPGState.hasFlag('armed'), true);
    assert.equal(RPGState.hasItem('sword'), true);
    assert.equal(RPGState.getXp(), 10);
    assert.equal(RPGEngine.isRunning(), false);
});

test('RPGEngine: stat_check crítico (tirada 20) tiene éxito incluso con dificultad muy alta', async () => {
    const { RPGEngine, eventBus, sandbox, setScene } = makeEngineSandbox();
    sandbox.Math = Object.assign(Object.create(Math), { random: () => 0.999 }); // Math.ceil(0.999*20) = 20
    setScene({
        id: 'stat_check_scene',
        steps: [{ type: 'stat_check', stat: 'STR', difficulty: 99, on_success: 'win', on_fail: 'lose' }],
        branches: {
            win:  [{ type: 'end', outcome: 'won' }],
            lose: [{ type: 'end', outcome: 'lost' }]
        }
    });

    await RPGEngine.loadScene('stat_check_scene');

    const result = eventBus._emitted('scene:stat-check-result')[0];
    assert.equal(result.roll, 20);
    assert.equal(result.result, 'critical');
    assert.equal(result.success, true);
    const ended = eventBus._emitted('scene:ended')[0];
    assert.equal(ended.outcome, 'won');
});

test('RPGEngine: stat_check pifia (tirada 1) falla incluso con modificador alto', async () => {
    const { RPGState, RPGEngine, eventBus, sandbox, setScene } = makeEngineSandbox();
    RPGState.setStat('STR', 30); // modificador +10
    sandbox.Math = Object.assign(Object.create(Math), { random: () => 0.001 }); // Math.ceil(0.001*20) = 1
    setScene({
        id: 'fumble_scene',
        steps: [{ type: 'stat_check', stat: 'STR', difficulty: 5, on_success: 'win', on_fail: 'lose' }],
        branches: {
            win:  [{ type: 'end', outcome: 'won' }],
            lose: [{ type: 'end', outcome: 'lost' }]
        }
    });

    await RPGEngine.loadScene('fumble_scene');

    const result = eventBus._emitted('scene:stat-check-result')[0];
    assert.equal(result.roll, 1);
    assert.equal(result.result, 'fumble');
    assert.equal(result.success, false, 'pifia falla aunque total(11) >= difficulty(5)');
    const ended = eventBus._emitted('scene:ended')[0];
    assert.equal(ended.outcome, 'lost');
});
