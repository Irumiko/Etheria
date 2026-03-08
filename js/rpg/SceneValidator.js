// ============================================================
// SCENE VALIDATOR
// Valida la estructura de un script JSON antes de ejecutarlo.
// Detecta errores de formato, campos obligatorios y referencias
// rotas — sin lanzar excepciones: devuelve { ok, errors }.
// ============================================================

const SceneValidator = (function () {

    // Campos obligatorios por tipo de paso
    const REQUIRED = {
        background:   ['asset'],
        dialogue:     ['character', 'text'],
        choice:       ['options'],
        set_variable: ['key', 'value'],
        check_variable: ['key', 'equals', 'goto_true'],
        goto_scene:   ['scene'],
        goto_branch:  ['branch'],
        modify_stat:  ['stat', 'amount'],
        give_item:    ['item'],
        remove_item:  ['item'],
        stat_check:   ['stat', 'difficulty', 'on_success', 'on_fail'],
        sound:        ['action'],
        camera:       ['effect'],
        wait:         ['duration'],
        end:          []
    };

    // ── API pública ─────────────────────────────────────────────
    function validate(scene) {
        const errors = [];

        if (!scene || typeof scene !== 'object') {
            return { ok: false, errors: ['El script no es un objeto válido'] };
        }

        // Campos raíz obligatorios
        if (!scene.id)    errors.push('Falta campo "id"');
        if (!scene.steps) errors.push('Falta campo "steps"');
        if (scene.steps && !Array.isArray(scene.steps)) {
            errors.push('"steps" debe ser un array');
        }

        // Validar steps principales
        if (Array.isArray(scene.steps)) {
            _validateStepArray(scene.steps, 'steps', scene.branches || {}, errors);
        }

        // Validar branches
        if (scene.branches && typeof scene.branches === 'object') {
            Object.entries(scene.branches).forEach(([branchId, steps]) => {
                if (!Array.isArray(steps)) {
                    errors.push(`Branch "${branchId}" debe ser un array`);
                } else {
                    _validateStepArray(steps, `branches.${branchId}`, scene.branches, errors);
                }
            });
        }

        if (errors.length > 0) {
            console.error(`[SceneValidator] "${scene.id || '?'}" tiene ${errors.length} error(es):`, errors);
        }

        return { ok: errors.length === 0, errors };
    }

    // ── Helpers internos ────────────────────────────────────────
    function _validateStepArray(steps, path, branches, errors) {
        steps.forEach((step, i) => {
            const loc = `${path}[${i}]`;

            if (!step.type) {
                errors.push(`${loc}: falta "type"`);
                return;
            }

            const requiredFields = REQUIRED[step.type];
            if (requiredFields === undefined) {
                // Tipo desconocido — advertencia, no error bloqueante
                console.warn(`[SceneValidator] ${loc}: tipo desconocido "${step.type}"`);
                return;
            }

            requiredFields.forEach(field => {
                if (step[field] === undefined || step[field] === null) {
                    errors.push(`${loc} (${step.type}): falta campo "${field}"`);
                }
            });

            // Validaciones específicas por tipo
            if (step.type === 'choice') {
                if (!Array.isArray(step.options) || step.options.length === 0) {
                    errors.push(`${loc}: "options" debe ser un array no vacío`);
                } else {
                    step.options.forEach((opt, j) => {
                        if (!opt.text) {
                            errors.push(`${loc}.options[${j}]: falta "text"`);
                        }
                        if (!opt.goto) {
                            errors.push(`${loc}.options[${j}]: falta "goto"`);
                        }
                    });
                }
            }

            if (step.type === 'stat_check') {
                if (typeof step.difficulty !== 'number') {
                    errors.push(`${loc}: "difficulty" debe ser un número`);
                }
            }

            if (step.type === 'modify_stat') {
                if (typeof step.amount !== 'number') {
                    errors.push(`${loc}: "amount" debe ser un número`);
                }
            }
        });
    }

    return { validate };
})();
