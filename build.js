#!/usr/bin/env node
'use strict';
const fs = require('fs');
const path = require('path');
const esbuild = require('esbuild');

const root = __dirname;
const distDir = path.join(root, 'dist');

// ── Modo de build ────────────────────────────────────────────────────────────
// --dev  →  sin minificar, console.log activos, banner "[DEV]" en el bundle
// (default) → minificado, console.log/debug eliminados, debugger eliminado
const isDev = process.argv.includes('--dev') || process.env.NODE_ENV === 'development';

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
  /* ── css/components.css dividido en módulos (split-components.js) ── */
  'css/components/01-base.css',
  'css/components/02-user-selection.css',
  'css/components/03-topic-cards.css',
  'css/components/04-info-card.css',
  'css/components/05-reply-panel.css',
  'css/components/06-vn-mobile-rpg.css',
  'css/components/07-tone-story.css',
  'css/components/08-responsive-modals.css',
  'css/components/09-vn-dialogue.css',
  'css/components/10-vn-controls.css',
  'css/components/11-character-modal.css',
  'css/components/12-rpg-system.css',
  'css/components/13-presence-party.css',
  'css/menu.css',
  'css/options.css',
  'css/mascot.css',
  'css/rpg-scene.css',
  'css/features/vn/index.css',
  'css/features/gallery/index.css',
  'css/features/menu/index.css',
  'css/features/theme-menu/index.css',
  'css/modules/07-overrides.css',
  'css/modules/08-rpg-hud-hotfix.css',
  'css/modules/09-vn-mode-menus.css',
  'css/modules/affinity-atmosphere.css',
  'css/bonds.css',
  'css/features.css',
  'css/vn-cinematic.css',
  'css/features/vn-themes.css',
  'css/menu-gamefeel.css',
  'css/options-gamefeel.css',
  /* ── Estancias aisladas: SIEMPRE al final — ganan todos los conflictos de cascada ── */
  'css/sections/topics.css',       /* Sección Historias: fondo, botones, filtros, buscador */
  'css/sections/user-profile.css', /* Modal de perfil de usuario + panel party clásico */
  'css/sections/hub.css',          /* Menú principal: paleta purple/crystal unificada */
  'css/sections/hub-luna.css',     /* Re-skin "Luna de Plata": cielo · sellos arcanos */
  'css/sections/options-luna.css', /* Re-skin Opciones "Luna de Plata" + atmósferas */
];

const CSS_ORDER = [...CRITICAL_CSS_ORDER, ...NON_CRITICAL_CSS_ORDER];
const LEGACY_MENU_CSS_ORDER = [
  'css/menu.css',
  'css/features/menu/index.css',
];

const STATIC_ASSETS = [
  ['manifest.json', 'manifest.json'],
  ['sw.js', 'sw.js'],
  ['assets/icons/icon-192.png', 'assets/icons/icon-192.png'],
  ['assets/icons/icon-512.png', 'assets/icons/icon-512.png'],
  ['assets/backgrounds/menu_background.jpg', 'assets/backgrounds/menu_background.jpg'],
  ['assets/backgrounds/default_background.jpg', 'assets/backgrounds/default_background.jpg'],
  ['assets/backgrounds/rpg_background.png', 'assets/backgrounds/rpg_background.png'],
  ['assets/backgrounds/topics_night_sky.jpg', 'assets/backgrounds/topics_night_sky.jpg'],
  ['assets/backgrounds/profile_selector_bg.png', 'assets/backgrounds/profile_selector_bg.png'],
  ['assets/parallax/layer_bg.png', 'assets/parallax/layer_bg.png'],
  ['assets/parallax/layer_mid.png', 'assets/parallax/layer_mid.png'],
  ['assets/parallax/layer_fg.png', 'assets/parallax/layer_fg.png'],
  ['assets/parallax/layer_bg_night.png', 'assets/parallax/layer_bg_night.png'],
  ['assets/parallax/layer_mid_night.png', 'assets/parallax/layer_mid_night.png'],
  ['assets/parallax/layer_fg_night.png', 'assets/parallax/layer_fg_night.png'],
  ['assets/ui/ethy.svg', 'assets/ui/ethy.svg'],
  ['assets/backgrounds/hub-valley.png', 'assets/backgrounds/hub-valley.png'],
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

console.log(`\n Etheria Build  [${isDev ? 'DEV — sin minificar' : 'PROD — minificado'}]\n`);
let html = readFile('index.html');

const cssSegments = CSS_ORDER.map((f, i) => {
  const c = readFile(f);
  console.log(`  CSS: ${f} (${(c.length / 1024).toFixed(1)} KB)`);
  return { source: f, sourceIndex: i, content: `/* -- ${f} -- */\n${c}` };
});
const criticalCss = cssSegments.slice(0, CRITICAL_CSS_ORDER.length).map((s) => s.content).join('\n\n');
const nonCriticalCss = cssSegments.slice(CRITICAL_CSS_ORDER.length).map((s) => s.content).join('\n\n');
const legacyMenuCss = LEGACY_MENU_CSS_ORDER.map((f) => `/* -- ${f} -- */\n${readFile(f)}`).join('\n\n');

html = html.replace(/<link\s+rel="stylesheet"\s+href="css\/[^\"]+"\s*>/gi, '');
html = html.replace(/<link\s+rel="preload"\s+href="css\/non-critical\.css"[^>]*>/i, '<link rel="preload" href="./noncritical.css" as="style" onload="this.onload=null;this.rel=\'stylesheet\'">');
html = html.replace(/<noscript><link\s+rel="stylesheet"\s+href="css\/non-critical\.css"\s*><\/noscript>/i, '<noscript><link rel="stylesheet" href="./noncritical.css"></noscript>');
html = html.replace('</head>', `<style id="critical-inline-css">\n${criticalCss}\n</style>\n</head>`);

// Scripts RPG: se extraen a un bundle separado (etheria-rpg.bundle.js)
// y se cargan de forma diferida tras el primer render.
const RPG_SCRIPT_PATHS = new Set([
  'js/rpg/SceneLoader.js',
  'js/rpg/SceneValidator.js',
  'js/rpg/RPGState.js',
  'js/rpg/RPGEngine.js',
  'js/rpg/RPGRenderer.js',
]);

const scriptSrcRe = /<script\b([^>]*?)\bsrc=(["'])([^"']+)\2([^>]*)><\/script>/gi;
const jsSegments  = [];
const rpgSegments = [];
html = html.replace(scriptSrcRe, (full, pre, q, src, post) => {
  const rawSrc = src.trim();
  if (!rawSrc || isExternalUrl(rawSrc)) return full; // CDN scripts se quedan en el HTML
  const localSrc = rawSrc.startsWith('/') ? rawSrc.slice(1) : rawSrc;
  const resolved = path.resolve(root, localSrc);
  if (!resolved.startsWith(root + path.sep)) throw new Error(`Script fuera del proyecto: ${rawSrc}`);
  if (!fs.existsSync(resolved)) throw new Error(`Script no encontrado: ${rawSrc}`);
  const code = fs.readFileSync(resolved, 'utf8');
  if (RPG_SCRIPT_PATHS.has(localSrc)) {
    console.log(`  JS (RPG): ${localSrc} (${(code.length / 1024).toFixed(1)} KB)`);
    rpgSegments.push({ source: localSrc, sourceIndex: rpgSegments.length, content: `/* ${localSrc} */\n${code}` });
  } else {
    console.log(`  JS:  ${localSrc} (${(code.length / 1024).toFixed(1)} KB)`);
    jsSegments.push({ source: localSrc, sourceIndex: jsSegments.length, content: `/* ${localSrc} */\n${code}` });
  }
  return ''; // Eliminado del HTML; bundles se añaden al final
});

// Auto-init al final del bundle RPG: si la app ya está lista, inicializa los módulos.
// Si la app aún no ha terminado de arrancar, window._etheriaAppReady lo hará después.
const RPG_AUTO_INIT = `
(function(){
  if(window._rpgBundleInited)return;
  window._rpgBundleInited=true;
  var r=window._etheriaAppReady;
  if(r){
    if(typeof RPGState!=='undefined')RPGState.init(r.userIndex);
    if(typeof RPGRenderer!=='undefined')RPGRenderer.init();
  }
}());
`;

// Lazy-loader: inyectado en el HTML — carga el bundle RPG durante el tiempo de inactividad
// del navegador (requestIdleCallback) o como máximo 2s después del bundle principal.
const RPG_LAZY_LOADER = `<script>
(function(){
  var _l=false;
  function load(){
    if(_l)return;_l=true;
    var s=document.createElement('script');
    s.src='./etheria-rpg.bundle.js';
    document.head.appendChild(s);
  }
  if(typeof requestIdleCallback!=='undefined'){
    requestIdleCallback(load,{timeout:2000});
  } else {
    setTimeout(load,1500);
  }
  // Carga inmediata si el usuario navega a una escena RPG antes del idle
  window.addEventListener('etheria:entering-rpg',function(){load();},{once:true});
}());
</script>`;

// Añadir bundles justo antes de </body>
html = html.replace('</body>', `<script src="./etheria.bundle.js"></script>\n${RPG_LAZY_LOADER}\n</body>`);

fs.mkdirSync(distDir, { recursive: true });
fs.writeFileSync(path.join(distDir, 'index.html'), html, 'utf8');
fs.writeFileSync(path.join(distDir, 'etheria.html'), html, 'utf8');
const nonCriticalCssFixed = nonCriticalCss.replace(/\.\.\/\.\.\/assets\//g, './assets/');
const legacyMenuCssFixed = legacyMenuCss.replace(/\.\.\/assets\//g, './assets/');
fs.writeFileSync(path.join(distDir, 'noncritical.css'), `${nonCriticalCssFixed}\n`, 'utf8');
fs.writeFileSync(
  path.join(distDir, 'menu-enhanced.css'),
  `${legacyMenuCssFixed}\n`,
  'utf8'
);
console.log(`\n  dist/index.html (${(html.length / 1024).toFixed(0)} KB)`);

writeBundleAndMap('etheria.css', cssSegments);
writeBundleAndMap('etheria.js', jsSegments);

// Bundle JS principal (minificado en prod, legible en dev)
const bundleSource = jsSegments.map((seg) => seg.content).join('\n');
const esbuildOpts = {
  loader: 'js',
  minify: !isDev,
  platform: 'browser',
  target: ['es2018'],
  ...(isDev
    ? { banner: '/* [ETHERIA DEV BUILD] */' }
    : { pure: ['console.log', 'console.debug'], drop: ['debugger'] }
  ),
};
const minResult = esbuild.transformSync(bundleSource, esbuildOpts);
fs.writeFileSync(path.join(distDir, 'etheria.bundle.js'), minResult.code, 'utf8');
const origKb = (bundleSource.length / 1024).toFixed(0);
const outKb  = (minResult.code.length / 1024).toFixed(0);
console.log(`  Bundle: etheria.bundle.js  ${origKb} KB → ${outKb} KB${isDev ? ' (dev, sin minificar)' : ' minificado'}`);

// Bundle RPG separado (carga diferida)
if (rpgSegments.length > 0) {
  const rpgSource = rpgSegments.map((seg) => seg.content).join('\n') + '\n' + RPG_AUTO_INIT;
  const rpgResult = esbuild.transformSync(rpgSource, esbuildOpts);
  fs.writeFileSync(path.join(distDir, 'etheria-rpg.bundle.js'), rpgResult.code, 'utf8');
  const rpgOrigKb = (rpgSource.length / 1024).toFixed(0);
  const rpgOutKb  = (rpgResult.code.length / 1024).toFixed(0);
  console.log(`  Bundle: etheria-rpg.bundle.js  ${rpgOrigKb} KB → ${rpgOutKb} KB (diferido)${isDev ? ' (dev)' : ' minificado'}`);
}

console.log('\n  Assets:');
STATIC_ASSETS.forEach(([src, dest]) => { if (copyFile(src, dest)) console.log(`    ${dest}`); });

// Copia recursiva de js/scenes/ — incluye subdirectorios como events/
function copyJsonDir(srcDir, destDir, relBase) {
  if (!fs.existsSync(srcDir)) return;
  fs.mkdirSync(destDir, { recursive: true });
  fs.readdirSync(srcDir).forEach((f) => {
    const srcFull  = path.join(srcDir, f);
    const destFull = path.join(destDir, f);
    const rel      = relBase ? `${relBase}/${f}` : f;
    if (fs.statSync(srcFull).isDirectory()) {
      copyJsonDir(srcFull, destFull, rel);
    } else if (f.endsWith('.json')) {
      fs.copyFileSync(srcFull, destFull);
      console.log(`    js/scenes/${rel}`);
    }
  });
}
copyJsonDir(path.join(root, 'js/scenes'), path.join(distDir, 'js/scenes'), '');

const buildVer = Date.now().toString(36);
const swDist = path.join(distDir, 'sw.js');
if (fs.existsSync(swDist)) {
  let sw = fs.readFileSync(swDist, 'utf8');
  sw = sw.replace('__ETHERIA_SW_VERSION__', buildVer);
  fs.writeFileSync(swDist, sw, 'utf8');
  console.log(`\n  PWA cache: etheria-${buildVer}`);
}

console.log('\n Build OK\n');
