// ============================================================
// RPG ENGINE
// Intérprete de scripts narrativos JSON.
//
// Responsabilidades:
//   - Cargar y validar escenas via SceneLoader + SceneValidator
//   - Ejecutar pasos automáticos (background, sound, variables...)
//   - Pausar en pasos con input (dialogue, choice, stat_check)
//   - Comunicar todo al exterior SOLO via eventBus
//   - NO toca el DOM (eso es trabajo de RPGRenderer)
//
// Límites de arquitectura:
//   ✅ Puede usar: SceneLoader, SceneValidator, RPGState, eventBus
//   ❌ No puede usar: nada de ui/, nada de classic/
// ============================================================

const RPGEngine = (function () {

    // ── Estado privado ──────────────────────────────────────────
    let _scene     = null;
    let _stepIndex = 0;
    let _branch    = null;   // null → _scene.steps  |  string → rama activa
    let _variables = {};     // variables locales a esta sesión de escena
    let _running   = false;
    let _paused    = false;
    let _waitTimer = null;

    // Tipos de paso que el engine ejecuta solo, sin input del usuario
    const AUTO_TYPES = new Set([
        'background', 'sound', 'camera',
        'set_variable', 'set_flag', 'check_variable',
        'modify_stat', 'give_item', 'remove_item', 'add_xp',
        'wait', 'goto_scene', 'goto_branch',
        'stat_check', 'end'
    ]);

    // ── API pública ─────────────────────────────────────────────

    async function loadScene(sceneId) {
        if (_running) {
            console.warn('[RPGEngine] Escena en curso. Llama stop() antes de cargar otra.');
            return;
        }
        _reset();

        // SceneLoader emite scene:error y devuelve null si falla —
        // no lanza, así que no necesitamos try/catch aquí.
        const scene = await SceneLoader.load(sceneId);
        if (!scene) { _reset(); return; }   // el error ya fue emitido por el loader

        const { ok, errors } = SceneValidator.validate(scene);
        if (!ok) {
            console.error('[RPGEngine] Script inválido:', errors[0]);
            eventBus.emit('scene:error', { sceneId: sceneId, message: errors[0] });
            _reset();
            return;
        }

        _scene     = scene;
        _variables = Object.assign({}, scene.variables || {});
        _running   = true;

        eventBus.emit('scene:started', {
            sceneId:  scene.id,
            version:  scene.version || null,
            title:    scene.title   || scene.id,
            requires: scene.requires || []
        });

        _tick();
    }

    function advance() {
        if (!_running || _paused) return;
        _stepIndex++;
        _tick();
    }

    function choiceMade(optionIndex) {
        if (!_running || _paused) return;
        var step = _currentStep();
        if (!step || step.type !== 'choice') return;

        var visible = getVisibleOptions(step.options);
        var option  = visible[optionIndex];
        if (!option) return;

        if (option.set_flag)     RPGState.setFlag(option.set_flag.key, option.set_flag.value);
        if (option.set_variable) _variables[option.set_variable.key] = option.set_variable.value;
        if (option.give_item)    RPGState.addItem(option.give_item);
        if (option.add_xp)       RPGState.addXp(option.add_xp);

        eventBus.emit('scene:choice-made', {
            sceneId: _scene.id, stepIndex: _stepIndex,
            optionIndex: optionIndex, optionText: option.text, goto: option.goto
        });

        if (option.goto) {
            _jumpTo(option.goto);
        } else {
            _next();
        }
    }

    function pause() {
        if (!_running) return;
        _paused = true;
        if (_waitTimer) { clearTimeout(_waitTimer); _waitTimer = null; }
        eventBus.emit('scene:paused', { sceneId: _scene && _scene.id });
    }

    function resume() {
        if (!_running || !_paused) return;
        _paused = false;
        eventBus.emit('scene:resumed', { sceneId: _scene && _scene.id });
        _tick();
    }

    function stop() {
        var sceneId = _scene && _scene.id;
        _reset();
        eventBus.emit('scene:stopped', { sceneId: sceneId });
    }

    function getVariable(key)        { return _variables[key]; }
    function setVariable(key, value) {
        _variables[key] = value;
        eventBus.emit('scene:variable-changed', { key: key, value: value });
    }

    function getVisibleOptions(options) {
        if (!Array.isArray(options)) return [];
        return options.filter(function(opt) {
            return !opt.condition || RPGState.evalCondition(opt.condition);
        });
    }

    function isRunning()      { return _running; }
    function isPaused()       { return _paused; }
    function currentSceneId() { return _scene ? _scene.id : null; }

    // ── Motor interno ───────────────────────────────────────────

    function _tick() {
        if (!_running || _paused) return;

        var steps = _activeSteps();
        if (_stepIndex >= steps.length) { _finish(); return; }

        var step = steps[_stepIndex];

        eventBus.emit('scene:step', {
            step: step, index: _stepIndex,
            sceneId: _scene.id, branch: _branch,
            total: steps.length
        });

        if (AUTO_TYPES.has(step.type)) {
            _executeStep(step);
        } else if (step.type === 'choice') {
            // Se detiene aquí — el renderer escucha scene:input:choice para responder.
            eventBus.emit('scene:choice-shown', {
                sceneId:   _scene.id,
                stepIndex: _stepIndex,
                step:      step,
                options:   getVisibleOptions(step.options)
            });
        } else if (step.type !== 'dialogue') {
            // Tipo desconocido: advertir y avanzar para no bloquear el motor
            console.warn('[RPGEngine] Paso no reconocido, avanzando:', step.type);
            _next();
        }
        // 'dialogue' → se detiene; RPGRenderer llama advance() al hacer clic.
    }

    function _executeStep(step) {
        switch (step.type) {

            case 'background':
                eventBus.emit('scene:background', {
                    asset: step.asset,
                    transition: step.transition || 'fade',
                    duration:   step.duration   || 600
                });
                _next();
                break;

            case 'sound':
                eventBus.emit('scene:sound', {
                    action: step.action, track: step.track, volume: step.volume
                });
                _next();
                break;

            case 'camera':
                eventBus.emit('scene:camera', { effect: step.effect, duration: step.duration || 400 });
                _next();
                break;

            case 'set_variable':
                setVariable(step.key, step.value);
                _next();
                break;

            case 'set_flag':
                RPGState.setFlag(step.key, step.value);
                _next();
                break;

            case 'check_variable': {
                var val   = _variables[step.key];
                var match = Array.isArray(step.equals)
                    ? step.equals.indexOf(val) !== -1
                    : val === step.equals;
                _jumpTo(match ? step.goto_true : (step.goto_false || null));
                break;
            }

            case 'modify_stat':
                RPGState.modifyStat(step.stat, step.amount);
                _next();
                break;

            case 'give_item':
                RPGState.addItem(
                    typeof step.item === 'string'
                        ? { id: step.item, name: step.item }
                        : step.item
                );
                _next();
                break;

            case 'remove_item':
                RPGState.removeItem(step.item, step.qty || 1);
                _next();
                break;

            case 'add_xp':
                RPGState.addXp(step.amount || 0);
                _next();
                break;

            case 'wait':
                eventBus.emit('scene:wait-start', { duration: step.duration || 1000 });
                _waitTimer = setTimeout(function() {
                    _waitTimer = null;
                    _next();
                }, step.duration || 1000);
                break;

            case 'goto_branch':
                _jumpTo(step.branch);
                break;

            case 'goto_scene':
                stop();
                loadScene(step.scene);
                break;

            case 'stat_check':
                _resolveStatCheck(step);
                break;

            case 'end':
                _finish(step.outcome);
                break;

            default:
                console.warn('[RPGEngine] Tipo de paso desconocido:', step.type);
                _next();
        }
    }

    function _resolveStatCheck(step) {
        var roll     = Math.ceil(Math.random() * 20);
        var modifier = RPGState.getModifier(step.stat);
        var total    = roll + modifier;
        var success  = roll === 20 || (roll !== 1 && total >= step.difficulty);
        var result   = roll === 1  ? 'fumble'
                     : roll === 20 ? 'critical'
                     : success     ? 'success'
                                   : 'fail';

        eventBus.emit('scene:stat-check-result', {
            sceneId: _scene.id, stat: step.stat,
            statValue: RPGState.getStat(step.stat),
            roll: roll, modifier: modifier, total: total,
            difficulty: step.difficulty, result: result, success: success
        });

        var delay = step.delay || 1800;
        _waitTimer = setTimeout(function() {
            _waitTimer = null;
            if (!_running) return;
            _jumpTo(success ? step.on_success : step.on_fail);
        }, delay);
    }

    // ── Navegación ───────────────────────────────────────────────

    function _next() {
        _stepIndex++;
        _tick();
    }

    function _jumpTo(target) {
        if (!_running) return;   // ignorar si el motor ya se detuvo
        if (!target) { _finish(); return; }
        var branches = _scene.branches || {};
        if (branches[target]) {
            _branch    = target;
            _stepIndex = 0;
            _tick();
        } else {
            stop();
            loadScene(target);
        }
    }

    function _finish(outcome) {
        var sceneId   = _scene.id;
        var variables = Object.assign({}, _variables);
        _running = false;

        eventBus.emit('scene:ended', {
            sceneId:   sceneId,
            outcome:   outcome || 'end',
            variables: variables
        });

        _reset();   // limpiar estado residual después de emitir
    }

    function _activeSteps() {
        var branches = _scene.branches || {};
        return (_branch && branches[_branch]) ? branches[_branch] : (_scene.steps || []);
    }

    function _currentStep() {
        return _activeSteps()[_stepIndex] || null;
    }

    function _reset() {
        if (_waitTimer) { clearTimeout(_waitTimer); _waitTimer = null; }
        _scene = null; _stepIndex = 0; _branch = null;
        _variables = {}; _running = false; _paused = false;
    }

    // ── Listeners de input desde el renderer ─────────────────────
    // El renderer emite estos eventos; el engine los escucha.
    // Así el renderer nunca llama al engine directamente.
    eventBus.on('scene:input:advance', function() {
        if (_running && !_paused) advance();
    });
    eventBus.on('scene:input:choice', function(data) {
        if (_running && !_paused) choiceMade(data.index);
    });

    // ── Exports ──────────────────────────────────────────────────
    return {
        loadScene:         loadScene,
        advance:           advance,
        choiceMade:        choiceMade,
        pause:             pause,
        resume:            resume,
        stop:              stop,
        reset:             _reset,          // limpia el estado sin emitir eventos
        isRunning:         isRunning,
        isPaused:          isPaused,
        currentSceneId:    currentSceneId,
        getVariable:       getVariable,
        setVariable:       setVariable,
        getVisibleOptions: getVisibleOptions
    };
})();
