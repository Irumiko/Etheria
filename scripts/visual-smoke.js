#!/usr/bin/env node
'use strict';

// ─── Smoke test visual ──────────────────────────────────────────────────────
// Recorre las pantallas de dist/ que son alcanzables SIN credenciales reales
// de Supabase (bienvenida, selector de perfil, formularios de login/registro
// sin enviarlos, y los modales genéricos de confirmación/prompt) y comprueba:
//
//   1. Ningún error de JS no capturado (page.on('pageerror')).
//   2. Ninguna petición al propio origen (assets/, css/, js/) falla con 404 —
//      esta es exactamente la clase de bug de la Tarea 1 original de esta
//      rama: un asset que existe en disco pero build.js no lo copia a dist/.
//   3. Los modales temáticos (confirmModal / promptModal) llegan a mostrarse.
//
// Deliberadamente NO rellena ni envía el formulario de login/registro (evitaría
// tocar datos reales de Supabase y sería flaky sin conexión). Es un smoke test,
// no una suite E2E completa — guarda capturas para revisión humana rápida,
// pero solo falla el pipeline por los tres puntos de arriba.
//
// Alcance real: solo cubre pantallas alcanzables SIN sesión (bienvenida,
// selector de perfil, formulario de registro, modales genéricos). Un asset/CSS
// que solo se cargue tras hacer login (#mainMenu, VN, opciones...) NO está
// cubierto por la comprobación de 404 — verificado a propósito: quitar
// default_background.jpg (precargado desde el <head>, se pide siempre) SÍ lo
// detecta; quitar menu_background.jpg (solo se usa en el menú post-login) NO,
// porque esta suite nunca llega a esa pantalla.
//
// Mismo patrón de modo estricto que validate-pwa-e2e.js: en CI (o con
// --strict) la ausencia de Playwright/navegador es un error; en local, un
// aviso que no bloquea el flujo de desarrollo.

const strictMode = process.argv.includes('--strict') || !!process.env.CI;

let chromium;
try {
    ({ chromium } = require('playwright'));
} catch (error) {
    const reason = `Playwright no está instalado (${error?.code || error?.message || 'unknown error'})`;
    if (strictMode) {
        console.error(`\n❌ ${reason}.`);
        console.error('   visual:smoke requiere Playwright en CI.');
        console.error('   Instálalo con: npx playwright install --with-deps chromium\n');
        process.exit(1);
    }
    console.warn(`⚠️  ${reason} — omitiendo visual:smoke en entorno local.`);
    console.warn('   Para forzar la comprobación: node scripts/visual-smoke.js --strict\n');
    process.exit(0);
}

const fs   = require('fs');
const path = require('path');
const http = require('http');

const distDir = path.resolve(__dirname, '..', 'dist');
const distIndex = path.join(distDir, 'index.html');
if (!fs.existsSync(distIndex)) {
    console.error('❌ dist/index.html no encontrado. Ejecuta npm run build antes del smoke test.');
    process.exit(1);
}

const shotsDir = path.resolve(__dirname, '..', 'test-artifacts', 'screenshots');
fs.mkdirSync(shotsDir, { recursive: true });

function getFreePort() {
    return new Promise((resolve, reject) => {
        const srv = require('net').createServer();
        srv.listen(0, '127.0.0.1', () => {
            const { port } = srv.address();
            srv.close(() => resolve(port));
        });
        srv.on('error', reject);
    });
}

function startServer(port) {
    const server = http.createServer((req, res) => {
        const urlPath = req.url.split('?')[0];
        let filePath = path.join(distDir, urlPath === '/' ? 'index.html' : urlPath);
        if (!filePath.startsWith(distDir)) { res.writeHead(403); res.end(); return; }
        fs.readFile(filePath, (err, data) => {
            if (err) { res.writeHead(404); res.end(); return; }
            const ext = path.extname(filePath);
            const types = {
                '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css',
                '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg',
                '.svg': 'image/svg+xml', '.woff2': 'font/woff2'
            };
            res.writeHead(200, { 'Content-Type': types[ext] || 'application/octet-stream' });
            res.end(data);
        });
    });
    return new Promise((resolve, reject) => {
        server.listen(port, '127.0.0.1', () => resolve(server));
        server.on('error', reject);
    });
}

(async () => {
    const port   = await getFreePort();
    const server = await startServer(port);
    const base   = `http://127.0.0.1:${port}`;
    console.log(`🖥️  Servidor temporal en ${base}`);

    const browser = await chromium.launch({ headless: true });
    const failures = [];
    let shotIndex = 0;

    try {
        const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });

        page.on('pageerror', (err) => {
            failures.push(`Error de JS no capturado: ${err.message}`);
        });
        page.on('response', (res) => {
            const url = new URL(res.url());
            const isSameOrigin = url.origin === base;
            if (isSameOrigin && res.status() === 404) {
                failures.push(`404 en recurso propio: ${url.pathname}`);
            }
        });

        async function shot(name) {
            shotIndex += 1;
            const file = path.join(shotsDir, `${String(shotIndex).padStart(2, '0')}-${name}.png`);
            await page.screenshot({ path: file });
            console.log(`  📸 ${path.basename(file)}`);
        }

        // ── 1. Carga inicial / bienvenida ───────────────────────────────────
        await page.goto(base, { waitUntil: 'networkidle', timeout: 20000 });
        await page.waitForTimeout(1500);
        await shot('boot');

        const bootBody = await page.$('body');
        if (!bootBody) failures.push('body no encontrado tras la carga inicial');

        // ── 2. Selector de perfil ───────────────────────────────────────────
        // page.click(selector) reintenta hasta encontrar un match VISIBLE entre
        // varios candidatos — a diferencia de page.$() + .click(), que se puede
        // quedar esperando indefinidamente al primer match del DOM aunque esté
        // oculto (hay varias vistas superpuestas en el mismo HTML).
        try {
            await page.click('text=ENTENDIDO', { timeout: 5000 });
            await page.waitForTimeout(1000);
        } catch { /* puede que ya no haya onboarding pendiente — no es fatal */ }
        await shot('profile-selector');

        // ── 3. Formulario de registro (sin enviarlo) ────────────────────────
        try {
            await page.click('text=NUEVO ARCHIVO', { timeout: 5000 });
            await page.waitForTimeout(1000);
            await shot('auth-register');
            const emailInput = await page.$('#authRegEmail');
            if (!emailInput) failures.push('No se encontró #authRegEmail en la pantalla de registro');
        } catch {
            failures.push('No se pudo llegar a la pantalla de registro desde "NUEVO ARCHIVO"');
        }

        // ── 4. Modales temáticos genéricos (confirm / prompt) ───────────────
        // Se invocan directamente — son funciones globales, no dependen de auth.
        const hasConfirmModal = await page.evaluate(() => typeof openConfirmModal === 'function');
        if (hasConfirmModal) {
            page.evaluate(() => { openConfirmModal('Smoke test — ¿confirmas?'); });
            await page.waitForTimeout(400);
            await shot('confirm-modal');
            const confirmVisible = await page.evaluate(() =>
                document.getElementById('confirmModal')?.classList.contains('active'));
            if (!confirmVisible) failures.push('openConfirmModal() no activó #confirmModal');
            await page.evaluate(() => document.getElementById('confirmModalCancel')?.click());
        } else {
            failures.push('openConfirmModal no está definida en window');
        }

        const hasPromptModal = await page.evaluate(() => typeof openPromptModal === 'function');
        if (hasPromptModal) {
            page.evaluate(() => { openPromptModal('Smoke test — escribe algo:', 'valor por defecto'); });
            await page.waitForTimeout(400);
            await shot('prompt-modal');
            const promptVisible = await page.evaluate(() =>
                document.getElementById('promptModal')?.classList.contains('active'));
            if (!promptVisible) failures.push('openPromptModal() no activó #promptModal');
            await page.evaluate(() => document.getElementById('promptModalCancel')?.click());
        } else {
            failures.push('openPromptModal no está definida en window');
        }

        console.log(`\n  Capturas guardadas en test-artifacts/screenshots/`);

        if (failures.length > 0) {
            console.error(`\n❌ Visual smoke test: ${failures.length} problema(s)\n`);
            failures.forEach((f) => console.error(`   - ${f}`));
            process.exitCode = 1;
        } else {
            console.log('\n✅ Visual smoke test passed\n');
        }
    } finally {
        await browser.close();
        server.close();
    }
})().catch((err) => {
    console.error('\n❌ Visual smoke test failed:', err.message || err);
    process.exit(1);
});
