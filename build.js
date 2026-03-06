#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const root = __dirname;
const distDir = path.join(root, 'dist');
const indexPath = path.join(root, 'index.html');

const JSONBIN_API_KEY = process.env.JSONBIN_API_KEY || '';

const cssOrder = [
  'css/variables.css',
  'css/animations.css',
  'css/components.css',
  'css/mobile-perf.css'
];

function read(file) {
  return fs.readFileSync(path.join(root, file), 'utf8');
}

function isExternalSrc(src) {
  return /^(?:[a-z][a-z\d+.-]*:)?\/\//i.test(src) || /^(?:data|blob):/i.test(src);
}

function normalizeLocalSrc(src) {
  if (src.startsWith('/')) {
    return src.slice(1);
  }
  return src;
}

function inlineLocalScripts(html, htmlFilePath) {
  const htmlDir = path.dirname(htmlFilePath);
  const scriptSrcRegex = /<script\b([^>]*?)\bsrc=(['"])([^'"]+)\2([^>]*)><\/script>/gi;

  return html.replace(scriptSrcRegex, (fullMatch, preAttrs = '', quote = '"', src = '', postAttrs = '') => {
    const rawSrc = src.trim();

    if (!rawSrc || isExternalSrc(rawSrc)) {
      return fullMatch;
    }

    const localSrc = normalizeLocalSrc(rawSrc);
    const resolvedPath = path.resolve(htmlDir, localSrc);

    if (!resolvedPath.startsWith(root + path.sep) && resolvedPath !== root) {
      throw new Error(`Ruta de script fuera del proyecto: ${rawSrc}`);
    }

    if (!fs.existsSync(resolvedPath)) {
      throw new Error(`No se encontro el script local referenciado en index.html: ${rawSrc}`);
    }

    const scriptContent = fs.readFileSync(resolvedPath, 'utf8').replace(/<\/script>/gi, '<\\/script>');
    const remainingAttrs = `${preAttrs}${postAttrs}`.trim();
    const attrs = remainingAttrs ? ` ${remainingAttrs}` : '';

    return `<script${attrs}>\n/* ${localSrc} */\n${scriptContent}\n</script>`;
  });
}

let html = fs.readFileSync(indexPath, 'utf8');

const bundledCss = cssOrder.map(f => `/* ${f} */\n${read(f)}`).join('\n\n');

html = html.replace(/<link rel="stylesheet" href="css\/main\.css">/, `<style>\n${bundledCss}\n</style>`);
html = inlineLocalScripts(html, indexPath);

if (JSONBIN_API_KEY) {
  html = html.replace('</head>', `  <script>window.__ETHERIA_JSONBIN_API_KEY = "${JSONBIN_API_KEY}";</script>\n</head>`);
  console.log('Clave de JSONBin inyectada correctamente.');
} else {
  console.warn('AVISO: JSONBIN_API_KEY no esta definida. La app funcionara solo en modo local.');
}

fs.mkdirSync(distDir, { recursive: true });
fs.writeFileSync(path.join(distDir, 'etheria.html'), html);
fs.writeFileSync(path.join(distDir, 'index.html'), html);
console.log('Build completado: dist/etheria.html y dist/index.html');

// ── Copiar archivos PWA a dist/ ───────────────────────────────────
// manifest.json y sw.js deben servirse desde la raíz del sitio.
// Los iconos deben estar en la misma ruta relativa que en desarrollo.
function copyIfExists(src, dest) {
  if (fs.existsSync(src)) {
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(src, dest);
    return true;
  }
  return false;
}

const pwaCopies = [
  ['manifest.json',                'manifest.json'],
  ['sw.js',                        'sw.js'],
  ['assets/icons/icon-192.png',    'assets/icons/icon-192.png'],
  ['assets/icons/icon-512.png',    'assets/icons/icon-512.png'],
  ['assets/backgrounds/default_background.jpg', 'assets/backgrounds/default_background.jpg'],
];

pwaCopies.forEach(([src, dest]) => {
  const copied = copyIfExists(path.join(root, src), path.join(distDir, dest));
  if (copied) console.log(`PWA: copiado ${dest}`);
});
