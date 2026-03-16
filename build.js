#!/usr/bin/env node
'use strict';
const fs = require('fs');
const path = require('path');

const root = __dirname;
const distDir = path.join(root, 'dist');

const CRITICAL_CSS_ORDER = [
  'css/variables.css',
  'css/critical/02-fonts-base.css',
  'css/critical/03-layout-shell.css',
  'css/pwa.css',
  'css/critical/05-theme.css',
  'css/critical/06-loading.css',
  'css/critical/07-accessibility.css',
];

const NON_CRITICAL_CSS_ORDER = [
  'css/animations.css',
  'css/mobile-perf.css',
  'css/auth.css',
  'css/components.css',
  'css/menu.css',
  'css/options.css',
  'css/mascot.css',
  'css/rpg-scene.css',
  'css/features/vn/index.css',
  'css/features/gallery/index.css',
  'css/features/menu/index.css',
  'css/modules/07-overrides.css',
];

const CSS_ORDER = [...CRITICAL_CSS_ORDER, ...NON_CRITICAL_CSS_ORDER];

const STATIC_ASSETS = [
  ['manifest.json', 'manifest.json'],
  ['sw.js', 'sw.js'],
  ['assets/icons/icon-192.png', 'assets/icons/icon-192.png'],
  ['assets/icons/icon-512.png', 'assets/icons/icon-512.png'],
  ['assets/backgrounds/menu_background.jpg', 'assets/backgrounds/menu_background.jpg'],
  ['assets/backgrounds/default_background.jpg', 'assets/backgrounds/default_background.jpg'],
  ['assets/parallax/layer_bg.png', 'assets/parallax/layer_bg.png'],
  ['assets/parallax/layer_mid.png', 'assets/parallax/layer_mid.png'],
  ['assets/parallax/layer_fg.png', 'assets/parallax/layer_fg.png'],
  ['assets/parallax/layer_bg_night.png', 'assets/parallax/layer_bg_night.png'],
  ['assets/parallax/layer_mid_night.png', 'assets/parallax/layer_mid_night.png'],
  ['assets/parallax/layer_fg_night.png', 'assets/parallax/layer_fg_night.png'],
  ['assets/parallax/branch-left.png', 'assets/parallax/branch-left.png'],
  ['assets/parallax/branch-right.png', 'assets/parallax/branch-right.png'],
  ['assets/parallax/bush.png', 'assets/parallax/bush.png'],
  ['assets/ui/ethy.svg', 'assets/ui/ethy.svg'],
];

function readFile(relPath) { return fs.readFileSync(path.join(root, relPath), 'utf8'); }
function copyFile(src, dest) {
  const srcAbs = path.join(root, src);
  const destAbs = path.join(distDir, dest);
  if (!fs.existsSync(srcAbs)) { console.warn(`  WARN: No encontrado: ${src}`); return false; }
  fs.mkdirSync(path.dirname(destAbs), { recursive: true });
  fs.copyFileSync(srcAbs, destAbs);
  return true;
}
function isExternalUrl(src) { return /^(?:[a-z][a-z\d+.-]*:)?\/\//i.test(src) || /^(?:data|blob):/i.test(src); }

const BASE64_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
function toVlqSigned(v) { return v < 0 ? ((-v) << 1) + 1 : (v << 1); }
function encodeVlq(value) {
  let vlq = toVlqSigned(value); let out = '';
  do { let digit = vlq & 31; vlq >>>= 5; if (vlq > 0) digit |= 32; out += BASE64_CHARS[digit]; } while (vlq > 0);
  return out;
}
function buildLineMap(segments) {
  let generatedLine = 0, prevSource = 0, prevOriginalLine = 0, mappings = '';
  segments.forEach((seg) => {
    const lines = seg.content.split('\n').length;
    for (let line = 0; line < lines; line++) {
      const mapping = encodeVlq(0) + encodeVlq(seg.sourceIndex - prevSource) + encodeVlq(line - prevOriginalLine) + encodeVlq(0);
      if (generatedLine > 0) mappings += ';';
      mappings += mapping;
      generatedLine += 1; prevSource = seg.sourceIndex; prevOriginalLine = line;
    }
  });
  return mappings;
}
function writeBundleAndMap(bundleName, segments) {
  const content = segments.map((seg) => seg.content).join('\n');
  const map = { version: 3, file: bundleName, sources: segments.map((seg) => seg.source), names: [], mappings: buildLineMap(segments) };
  const mapName = `${bundleName}.map`;
  fs.writeFileSync(path.join(distDir, bundleName), `${content}\n/*# sourceMappingURL=${mapName} */\n`, 'utf8');
  fs.writeFileSync(path.join(distDir, mapName), JSON.stringify(map, null, 2), 'utf8');
  console.log(`  Sourcemap: ${bundleName} + ${mapName}`);
}

console.log('\n Etheria Build\n');
let html = readFile('index.html');

const cssSegments = CSS_ORDER.map((f, i) => {
  const c = readFile(f);
  console.log(`  CSS: ${f} (${(c.length / 1024).toFixed(1)} KB)`);
  return { source: f, sourceIndex: i, content: `/* -- ${f} -- */\n${c}` };
});
const criticalCss = cssSegments.slice(0, CRITICAL_CSS_ORDER.length).map((s) => s.content).join('\n\n');
const nonCriticalCss = cssSegments.slice(CRITICAL_CSS_ORDER.length).map((s) => s.content).join('\n\n');

html = html.replace(/<link\s+rel="stylesheet"\s+href="css\/[^\"]+"\s*>/gi, '');
html = html.replace(/<link\s+rel="preload"\s+href="css\/non-critical\.css"[^>]*>/i, '<link rel="preload" href="./noncritical.css" as="style" onload="this.onload=null;this.rel=\'stylesheet\'">');
html = html.replace(/<noscript><link\s+rel="stylesheet"\s+href="css\/non-critical\.css"\s*><\/noscript>/i, '<noscript><link rel="stylesheet" href="./noncritical.css"></noscript>');
html = html.replace('</head>', `<style id="critical-inline-css">\n${criticalCss}\n</style>\n</head>`);

const scriptSrcRe = /<script\b([^>]*?)\bsrc=(["'])([^"']+)\2([^>]*)><\/script>/gi;
const jsSegments = [];
html = html.replace(scriptSrcRe, (full, pre, q, src, post) => {
  const rawSrc = src.trim();
  if (!rawSrc || isExternalUrl(rawSrc)) return full;
  const localSrc = rawSrc.startsWith('/') ? rawSrc.slice(1) : rawSrc;
  const resolved = path.resolve(root, localSrc);
  if (!resolved.startsWith(root + path.sep)) throw new Error(`Script fuera del proyecto: ${rawSrc}`);
  if (!fs.existsSync(resolved)) throw new Error(`Script no encontrado: ${rawSrc}`);
  const code = fs.readFileSync(resolved, 'utf8').replace(/<\/script>/gi, '<\\/script>');
  const attrs = `${pre}${post}`.trim();
  console.log(`  JS:  ${localSrc} (${(code.length / 1024).toFixed(1)} KB)`);
  jsSegments.push({ source: localSrc, sourceIndex: jsSegments.length, content: `/* ${localSrc} */\n${code}` });
  return `<script${attrs ? ' ' + attrs : ''}>\n/* ${localSrc} */\n${code}\n</script>`;
});

fs.mkdirSync(distDir, { recursive: true });
fs.writeFileSync(path.join(distDir, 'index.html'), html, 'utf8');
fs.writeFileSync(path.join(distDir, 'etheria.html'), html, 'utf8');
fs.writeFileSync(path.join(distDir, 'noncritical.css'), `${nonCriticalCss}\n`, 'utf8');
console.log(`\n  dist/index.html (${(html.length / 1024).toFixed(0)} KB)`);

writeBundleAndMap('etheria.css', cssSegments);
writeBundleAndMap('etheria.js', jsSegments);

console.log('\n  Assets:');
STATIC_ASSETS.forEach(([src, dest]) => { if (copyFile(src, dest)) console.log(`    ${dest}`); });

const scenesDir = path.join(root, 'js/scenes');
const scenesDist = path.join(distDir, 'js/scenes');
if (fs.existsSync(scenesDir)) {
  fs.mkdirSync(scenesDist, { recursive: true });
  fs.readdirSync(scenesDir).filter((f) => f.endsWith('.json')).forEach((f) => {
    fs.copyFileSync(path.join(scenesDir, f), path.join(scenesDist, f));
    console.log(`    js/scenes/${f}`);
  });
}

const buildVer = Date.now().toString(36);
const swDist = path.join(distDir, 'sw.js');
if (fs.existsSync(swDist)) {
  let sw = fs.readFileSync(swDist, 'utf8');
  sw = sw.replace('__ETHERIA_SW_VERSION__', buildVer);
  fs.writeFileSync(swDist, sw, 'utf8');
  console.log(`\n  PWA cache: etheria-${buildVer}`);
}

console.log('\n Build OK\n');
