#!/usr/bin/env node
// ══════════════════════════════════════════════════════════════════
//  ETHERIA — Build Script
// ══════════════════════════════════════════════════════════════════
'use strict';
const fs   = require('fs');
const path = require('path');

const root    = __dirname;
const distDir = path.join(root, 'dist');

const CSS_ORDER = [
  'css/variables.css',
  'css/animations.css',
  'css/components.css',
  'css/mobile-perf.css',
  'css/main.css',
  'css/auth.css',
  'css/ethy.css',
  'css/menu-enhanced.css',
  'css/options-new.css',
  'css/rpg-scene.css',
];

const STATIC_ASSETS = [
  ['manifest.json',                             'manifest.json'],
  ['sw.js',                                     'sw.js'],
  ['assets/icons/icon-192.png',                 'assets/icons/icon-192.png'],
  ['assets/icons/icon-512.png',                 'assets/icons/icon-512.png'],
  ['assets/backgrounds/menu_background.jpg',    'assets/backgrounds/menu_background.jpg'],
  ['assets/backgrounds/default_background.jpg', 'assets/backgrounds/default_background.jpg'],
  ['assets/parallax/layer_bg.png',              'assets/parallax/layer_bg.png'],
  ['assets/parallax/layer_mid.png',             'assets/parallax/layer_mid.png'],
  ['assets/parallax/layer_fg.png',              'assets/parallax/layer_fg.png'],
  ['assets/parallax/branch-left.png',           'assets/parallax/branch-left.png'],
  ['assets/parallax/branch-right.png',          'assets/parallax/branch-right.png'],
  ['assets/parallax/bush.png',                  'assets/parallax/bush.png'],
  ['assets/ui/ethy.svg',                        'assets/ui/ethy.svg'],
];

function readFile(relPath) {
  return fs.readFileSync(path.join(root, relPath), 'utf8');
}

function copyFile(src, dest) {
  const srcAbs  = path.join(root, src);
  const destAbs = path.join(distDir, dest);
  if (!fs.existsSync(srcAbs)) { console.warn(`  WARN: No encontrado: ${src}`); return false; }
  fs.mkdirSync(path.dirname(destAbs), { recursive: true });
  fs.copyFileSync(srcAbs, destAbs);
  return true;
}

function isExternalUrl(src) {
  return /^(?:[a-z][a-z\d+.-]*:)?\/\//i.test(src) || /^(?:data|blob):/i.test(src);
}

console.log('\n Etheria Build\n');
let html = readFile('index.html');

// ── Bundle CSS ───────────────────────────────────────────────────
const bundledCss = CSS_ORDER.map(f => {
  const c = readFile(f);
  console.log(`  CSS: ${f} (${(c.length/1024).toFixed(1)} KB)`);
  return `/* -- ${f} -- */\n${c}`;
}).join('\n\n');

html = html.replace(/<link\s+rel="stylesheet"\s+href="css\/[^"]+"\s*>/gi, '');
html = html.replace('</head>', `<style>\n${bundledCss}\n</style>\n</head>`);

// ── Inline Scripts ───────────────────────────────────────────────
const scriptSrcRe = /<script\b([^>]*?)\bsrc=(["'])([^"']+)\2([^>]*)><\/script>/gi;
html = html.replace(scriptSrcRe, (fullMatch, pre, quote, src, post) => {
  const rawSrc = src.trim();
  if (!rawSrc || isExternalUrl(rawSrc)) return fullMatch;
  const localSrc = rawSrc.startsWith('/') ? rawSrc.slice(1) : rawSrc;
  const resolved = path.resolve(root, localSrc);
  if (!resolved.startsWith(root + path.sep)) throw new Error(`Script fuera del proyecto: ${rawSrc}`);
  if (!fs.existsSync(resolved)) throw new Error(`Script no encontrado: ${rawSrc}`);
  const code  = fs.readFileSync(resolved, 'utf8').replace(/<\/script>/gi, '<\\/script>');
  const attrs = `${pre}${post}`.trim();
  console.log(`  JS:  ${localSrc} (${(code.length/1024).toFixed(1)} KB)`);
  return `<script${attrs ? ' '+attrs : ''}>\n/* ${localSrc} */\n${code}\n</script>`;
});

// ── Escribir dist/ ───────────────────────────────────────────────
fs.mkdirSync(distDir, { recursive: true });
fs.writeFileSync(path.join(distDir, 'index.html'),   html, 'utf8');
fs.writeFileSync(path.join(distDir, 'etheria.html'), html, 'utf8');
console.log(`\n  dist/index.html (${(html.length/1024).toFixed(0)} KB)`);

// ── Copiar assets ────────────────────────────────────────────────
console.log('\n  Assets:');
STATIC_ASSETS.forEach(([src, dest]) => {
  if (copyFile(src, dest)) console.log(`    ${dest}`);
});

// Escenas RPG
const scenesDir = path.join(root, 'js/scenes');
const scenesDist = path.join(distDir, 'js/scenes');
if (fs.existsSync(scenesDir)) {
  fs.mkdirSync(scenesDist, { recursive: true });
  fs.readdirSync(scenesDir).filter(f => f.endsWith('.json')).forEach(f => {
    fs.copyFileSync(path.join(scenesDir, f), path.join(scenesDist, f));
    console.log(`    js/scenes/${f}`);
  });
}

// ── Versionar sw.js ──────────────────────────────────────────────
const buildVer = Date.now().toString(36);
const swDist   = path.join(distDir, 'sw.js');
if (fs.existsSync(swDist)) {
  let sw = fs.readFileSync(swDist, 'utf8');
  sw = sw.replace('__ETHERIA_SW_VERSION__', buildVer);
  fs.writeFileSync(swDist, sw, 'utf8');
  console.log(`\n  PWA cache: etheria-${buildVer}`);
}

console.log('\n Build OK\n');
