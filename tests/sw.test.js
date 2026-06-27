const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');

test('service worker source registers install, activate, message, fetch and push handlers', () => {
  const source = read('sw.js');
  for (const eventName of ['install', 'activate', 'message', 'fetch', 'push', 'notificationclick']) {
    assert.match(
      source,
      new RegExp(`self\\.addEventListener\\(['"]${eventName}['"]`),
      `missing ${eventName} listener`
    );
  }
});

test('service worker source keeps cache helpers and precache list coherent', () => {
  const source = read('sw.js');
  assert.match(source, /const CACHE_VERSION = '__ETHERIA_SW_VERSION__';/);
  assert.match(source, /const CACHE_NAME\s*=\s*`etheria-\$\{CACHE_VERSION\}`;/);
  assert.match(source, /const PRECACHE_URLS = \[/);
  assert.match(source, /Promise\.allSettled/);
  for (const asset of ['./', './index.html', './manifest.json', './assets/icons/icon-192.png', './assets/icons/icon-512.png', './noncritical.css', './etheria.css', './etheria.bundle.js']) {
    assert.match(source, new RegExp(asset.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
  for (const helper of ['networkFirstWithTimeout', 'networkFirstHTML', 'cacheFirstImage', 'staleWhileRevalidate']) {
    assert.match(source, new RegExp(`async function ${helper}\\(`), `missing ${helper}`);
  }
});

test('built service worker has an injected cache version', () => {
  const built = read('dist/sw.js');
  assert.doesNotMatch(built, /__ETHERIA_SW_VERSION__/);
  assert.match(built, /const CACHE_VERSION = '[a-z0-9]+';/);
  assert.match(built, /const CACHE_NAME\s*=\s*`etheria-\$\{CACHE_VERSION\}`;/);
});

test('service worker validates push notification URL against same origin before openWindow', () => {
  const source = read('sw.js');
  // Must parse the URL and compare origins before calling openWindow
  assert.match(source, /new URL\(rawUrl/, 'must parse rawUrl with URL constructor');
  assert.match(source, /\.origin\s*===\s*self\.location\.origin/, 'must compare origins');
  assert.doesNotMatch(source, /openWindow\(notifData\.url/, 'must not pass notifData.url directly to openWindow');
});
