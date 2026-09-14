// Tests para js/rpg/SceneValidator.js
// Sin dependencias — el módulo es puro (recibe un objeto escena, devuelve {ok, errors}).

const test   = require('node:test');
const assert = require('node:assert/strict');
const fs     = require('node:fs');
const vm     = require('node:vm');

function loadValidator() {
    const sandbox = vm.createContext({ console: { warn() {}, error() {}, log() {} } });
    vm.runInContext(fs.readFileSync('js/rpg/SceneValidator.js', 'utf8'), sandbox, { filename: 'js/rpg/SceneValidator.js' });
    return vm.runInContext('SceneValidator', sandbox);
}

// result.errors viene de un array creado dentro del sandbox vm — su prototipo no es
// el Array del realm de este test, así que assert.deepEqual/deepStrictEqual fallaría
// por identidad de prototipo aunque el contenido sea idéntico. Comparamos por valor.
function assertValid(result) {
    assert.equal(result.ok, true, `esperaba válido, errores: ${JSON.stringify(Array.from(result.errors))}`);
    assert.equal(result.errors.length, 0);
}

test('SceneValidator.validate rechaza un valor que no es objeto', () => {
    const SceneValidator = loadValidator();
    const result = SceneValidator.validate(null);
    assert.equal(result.ok, false);
    assert.equal(result.errors.length, 1);
});

test('SceneValidator.validate exige "id" y "steps" en la raíz', () => {
    const SceneValidator = loadValidator();
    const result = SceneValidator.validate({});
    assert.equal(result.ok, false);
    assert.ok(result.errors.some((e) => e.includes('"id"')));
    assert.ok(result.errors.some((e) => e.includes('"steps"')));
});

test('SceneValidator.validate acepta una escena mínima válida', () => {
    const SceneValidator = loadValidator();
    const result = SceneValidator.validate({ id: 'x', steps: [{ type: 'end' }] });
    assertValid(result);
});

test('SceneValidator.validate detecta campos obligatorios ausentes por tipo de paso', () => {
    const SceneValidator = loadValidator();
    const result = SceneValidator.validate({
        id: 'x',
        steps: [{ type: 'background' }] // falta "asset"
    });
    assert.equal(result.ok, false);
    assert.ok(result.errors[0].includes('asset'));
});

test('SceneValidator.validate reconoce set_flag y add_xp como tipos válidos', () => {
    const SceneValidator = loadValidator();
    const result = SceneValidator.validate({
        id: 'x',
        steps: [
            { type: 'set_flag', key: 'met_kazuma', value: true },
            { type: 'add_xp', amount: 10 },
            { type: 'add_xp' }, // amount es opcional (RPGEngine lo trata como 0)
            { type: 'end' }
        ]
    });
    assertValid(result);
});

test('SceneValidator.validate exige "key" en set_flag', () => {
    const SceneValidator = loadValidator();
    const result = SceneValidator.validate({
        id: 'x',
        steps: [{ type: 'set_flag', value: true }]
    });
    assert.equal(result.ok, false);
    assert.ok(result.errors[0].includes('key'));
});

test('SceneValidator.validate: goto_branch a una rama existente no genera error', () => {
    const SceneValidator = loadValidator();
    const result = SceneValidator.validate({
        id: 'x',
        steps: [{ type: 'goto_branch', branch: 'secreto' }],
        branches: { secreto: [{ type: 'end' }] }
    });
    assertValid(result);
});

test('SceneValidator.validate: goto_branch a una rama inexistente es un error', () => {
    const SceneValidator = loadValidator();
    const result = SceneValidator.validate({
        id: 'x',
        steps: [{ type: 'goto_branch', branch: 'no_existe' }],
        branches: { secreto: [{ type: 'end' }] }
    });
    assert.equal(result.ok, false);
    assert.ok(result.errors[0].includes('no_existe'));
});

test('SceneValidator.validate: goto_branch funciona igual desde dentro de otra rama', () => {
    const SceneValidator = loadValidator();
    const result = SceneValidator.validate({
        id: 'x',
        steps: [{ type: 'end' }],
        branches: {
            rama_a: [{ type: 'goto_branch', branch: 'rama_b' }],
            rama_b: [{ type: 'end' }]
        }
    });
    assertValid(result);
});

test('SceneValidator.validate NO marca como error choice.goto / stat_check.on_success-on_fail que no sean ramas locales', () => {
    // Estos campos pueden apuntar legítimamente a OTRA escena — SceneLoader ya los
    // trata así para el prefetch (_prefetchLinked). Validarlos como "rama rota"
    // aquí daría falsos positivos con el uso real del motor.
    const SceneValidator = loadValidator();
    const result = SceneValidator.validate({
        id: 'x',
        steps: [
            { type: 'choice', options: [{ text: 'Ir a otra escena', goto: 'otra_escena_id' }] },
            { type: 'stat_check', stat: 'STR', difficulty: 10, on_success: 'escena_exito', on_fail: 'escena_fallo' }
        ]
    });
    assertValid(result);
});

test('SceneValidator.validate valida también los steps dentro de cada branch', () => {
    const SceneValidator = loadValidator();
    const result = SceneValidator.validate({
        id: 'x',
        steps: [{ type: 'end' }],
        branches: {
            rota: [{ type: 'modify_stat', stat: 'STR' }] // falta "amount"
        }
    });
    assert.equal(result.ok, false);
    assert.ok(result.errors[0].includes('branches.rota'));
});

test('SceneValidator.validate: choice sin opciones es un error', () => {
    const SceneValidator = loadValidator();
    const result = SceneValidator.validate({
        id: 'x',
        steps: [{ type: 'choice', options: [] }]
    });
    assert.equal(result.ok, false);
});

test('SceneValidator.validate: las 3 escenas reales del juego validan sin errores', () => {
    const SceneValidator = loadValidator();
    const files = ['js/scenes/forest_intro.json', 'js/scenes/forest_depth.json', 'js/scenes/village_hub.json'];
    for (const f of files) {
        const scene = JSON.parse(fs.readFileSync(f, 'utf8'));
        const result = SceneValidator.validate(scene);
        assert.equal(result.ok, true, `${f} debería validar sin errores: ${JSON.stringify(result.errors)}`);
    }
});
