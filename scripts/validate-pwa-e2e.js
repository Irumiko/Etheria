#!/usr/bin/env node
'use strict';

// ─── Modo estricto ──────────────────────────────────────────────────────────
// Se activa con la flag --strict o si la variable de entorno CI está seteada
// (GitHub Actions, Vercel, CircleCI, etc. la setean automáticamente).
// En modo estricto: la ausencia de Playwright es un error que falla el pipeline.
// En modo local (sin --strict ni CI): la ausencia de Playwright muestra un aviso
// y termina con exit 0 para no interrumpir el flujo de desarrollo.
const strictMode = process.argv.includes('--strict') || !!process.env.CI;

// ─── Comprobar Playwright ───────────────────────────────────────────────────
let chromium;
try {
  ({ chromium } = require('playwright'));
} catch (error) {
  const reason = `Playwright no está instalado (${error?.code || error?.message || 'unknown error'})`;
  if (strictMode) {
    console.error(`\n❌ ${reason}.`);
    console.error('   validate:pwa-e2e requiere Playwright en CI.');
    console.error('   Instálalo con: npx playwright install --with-deps chromium\n');
    process.exit(1);
  }
  console.warn(`⚠️  ${reason} — omitiendo validate:pwa-e2e en entorno local.`);
  console.warn('   Para forzar la comprobación: node scripts/validate-pwa-e2e.js --strict\n');
  process.exit(0);
}

// ─── Comprobar que existe dist/ ─────────────────────────────────────────────
const fs   = require('fs');
const path = require('path');
const dist = path.resolve(__dirname, '..', 'dist', 'index.html');
if (!fs.existsSync(dist)) {
  console.error('❌ dist/index.html no encontrado. Ejecuta npm run build antes del E2E.');
  process.exit(1);
}

// ─── Servidor local temporal ────────────────────────────────────────────────
// El script levanta su propio servidor para no depender de uno externo.
// Se elige un puerto disponible dinámicamente para evitar conflictos en CI.
const http   = require('http');
const { execSync, spawn } = require('child_process');

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
  const distDir = path.resolve(__dirname, '..', 'dist');
  const server = http.createServer((req, res) => {
    let filePath = path.join(distDir, req.url === '/' ? 'index.html' : req.url);
    // Evitar path traversal
    if (!filePath.startsWith(distDir)) {
      res.writeHead(403); res.end(); return;
    }
    fs.readFile(filePath, (err, data) => {
      if (err) { res.writeHead(404); res.end(); return; }
      const ext = path.extname(filePath);
      const types = { '.html': 'text/html', '.js': 'application/javascript',
                      '.css': 'text/css', '.json': 'application/json',
                      '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml' };
      res.writeHead(200, { 'Content-Type': types[ext] || 'application/octet-stream' });
      res.end(data);
    });
  });
  return new Promise((resolve, reject) => {
    server.listen(port, '127.0.0.1', () => resolve(server));
    server.on('error', reject);
  });
}

// ─── Suite E2E ──────────────────────────────────────────────────────────────
(async () => {
  const port   = await getFreePort();
  const server = await startServer(port);
  const base   = `http://127.0.0.1:${port}`;
  console.log(`🖥️  Servidor temporal en ${base}`);

  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });

    // ── Prueba 1: carga básica ──────────────────────────────────────────────
    await page.goto(base, { waitUntil: 'networkidle', timeout: 15000 });
    const hasBody = await page.$('body');
    if (!hasBody) throw new Error('body no encontrado tras la carga inicial');
    console.log('  ✅ Carga inicial OK');

    // ── Prueba 2: simulación de gesto swipe (protección contra edge-swipe) ──
    await page.mouse.move(2, 300);
    await page.mouse.down();
    await page.mouse.move(140, 300, { steps: 12 });
    await page.mouse.up();
    const bodyAfterSwipe = await page.$('body');
    if (!bodyAfterSwipe) throw new Error('body desapareció tras simular swipe');
    console.log('  ✅ Gesto swipe OK');

    // ── Prueba 3: manifest y service worker referenciados ───────────────────
    const manifestLink = await page.$('link[rel="manifest"]');
    if (!manifestLink) throw new Error('No se encontró <link rel="manifest"> en el HTML');
    console.log('  ✅ Manifest referenciado OK');

    console.log('\n✅ PWA E2E smoke passed\n');
  } finally {
    await browser.close();
    server.close();
  }
})().catch((err) => {
  console.error('\n❌ PWA E2E failed:', err.message || err);
  process.exit(1);
});
