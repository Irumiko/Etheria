// ============================================================
// Etheria — Reporte de bugs y recomendaciones a la administradora
// ============================================================
// Envía a la Edge Function `send-report` (guarda en la tabla
// bug_reports de Supabase y manda un email vía Resend).
//
// Deliberadamente NO depende de supabaseClient.js: usa fetch directo
// con la clave pública (anon/publishable), para poder llamarse incluso
// cuando la app ha petado durante el arranque y el resto del JS no
// ha llegado a cargar (ver capturador de errores en index.html).
//
// API: window.EtheriaBugReport.send({
//     type: 'bug' | 'recommendation',
//     message, error_message, error_stack, section,
//     includeScreenshot: true (por defecto)
// }) → Promise<{ ok: boolean }>
// ============================================================
(function (global) {
    'use strict';

    const SECTION_IDS = [
        'userSelectScreen', 'mainMenu', 'gallerySection',
        'topicsSection', 'vnSection', 'optionsSection', 'saveHubSection'
    ];

    function _cfg() {
        const c = global.SUPABASE_CONFIG || {};
        return {
            url: c.url || 'https://timtqdrfeuzwwixfnudj.supabase.co',
            key: c.key || 'sb_publishable_imGaxAfo_z1NuG6NV8pDtQ_A6Wp3DH3'
        };
    }

    function _detectSection() {
        try {
            for (const id of SECTION_IDS) {
                const el = document.getElementById(id);
                if (el && (el.classList.contains('active') || (el.style.display !== 'none' && !el.classList.contains('hidden')))) {
                    return id;
                }
            }
        } catch (e) { /* noop */ }
        return null;
    }

    function _loadHtml2Canvas() {
        return new Promise(function (resolve) {
            if (typeof global.html2canvas === 'function') { resolve(true); return; }
            const script = document.createElement('script');
            script.src = 'assets/vendor/html2canvas-1.4.1.min.js';
            script.onload = function () { resolve(true); };
            script.onerror = function () { resolve(false); };
            document.head.appendChild(script);
        });
    }

    async function _captureScreenshot() {
        try {
            const loaded = await _loadHtml2Canvas();
            if (!loaded || typeof global.html2canvas !== 'function') return null;
            const canvas = await global.html2canvas(document.body, {
                scale: 0.5,
                logging: false,
                useCORS: true,
                backgroundColor: null,
                foreignObjectRendering: true,
                ignoreElements: function (el) { return el.id === 'etheriaFatalError'; }
            });
            return canvas.toDataURL('image/jpeg', 0.55);
        } catch (e) {
            console.warn('[EtheriaBugReport] No se pudo capturar pantalla:', e && e.message);
            return null;
        }
    }

    /**
     * Envía un reporte de bug o recomendación.
     * @param {object} opts
     * @returns {Promise<{ok: boolean, data?: object, error?: string}>}
     */
    async function send(opts) {
        opts = opts || {};
        const cfg = _cfg();

        const payload = {
            type: opts.type === 'recommendation' ? 'recommendation' : 'bug',
            message: opts.message || null,
            page: (typeof location !== 'undefined' ? location.href : null),
            section: opts.section || _detectSection(),
            error_message: opts.error_message || null,
            error_stack: opts.error_stack || null,
            user_agent: (typeof navigator !== 'undefined' ? navigator.userAgent : null),
            app_version: null,
            reporter_email: opts.reporter_email || null
        };

        if (opts.includeScreenshot !== false) {
            payload.screenshot_base64 = await _captureScreenshot();
        }

        try {
            const res = await fetch(cfg.url + '/functions/v1/send-report', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'apikey': cfg.key,
                    'Authorization': 'Bearer ' + cfg.key
                },
                body: JSON.stringify(payload)
            });
            const data = await res.json().catch(function () { return {}; });
            return { ok: res.ok && data.ok !== false, data: data };
        } catch (e) {
            return { ok: false, error: e && e.message };
        }
    }

    global.EtheriaBugReport = { send: send };

})(window);
