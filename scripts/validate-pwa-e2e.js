#!/usr/bin/env node
'use strict';

const strictMode = process.argv.includes('--strict') || !!process.env.CI;

let chromium;
try {
  ({ chromium } = require('playwright'));
} catch (error) {
  const reason = `Playwright no está instalado (${error?.code || error?.message || 'unknown error'})`;
  if (strictMode) {
    console.error(`❌ ${reason}. validate:pwa-e2e requiere Playwright en CI o modo --strict.`);
    process.exit(1);
  }
  console.warn(`⚠️ ${reason}; se omite validate:pwa-e2e en entorno local no estricto.`);
  process.exit(0);
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await page.goto('http://127.0.0.1:8000', { waitUntil: 'networkidle' });
  await page.mouse.move(2, 300);
  await page.mouse.down();
  await page.mouse.move(140, 300, { steps: 12 });
  await page.mouse.up();
  const hasBody = await page.$('body');
  if (!hasBody) throw new Error('PWA E2E failed: body not found after gesture simulation');
  await browser.close();
  console.log('✅ PWA E2E smoke passed');
})().catch((err) => {
  console.error('❌ PWA E2E failed:', err);
  process.exit(1);
});
