#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const root = __dirname;
const distDir = path.join(root, 'dist');

const JSONBIN_API_KEY = process.env.JSONBIN_API_KEY || '';

const cssOrder = [
  'css/variables.css',
  'css/animations.css',
  'css/components.css'
];

// Orden de carga: estado global -> persistencia -> modulos UI -> arranque
const jsOrder = [
  'js/utils/state.js',
  'js/utils/storage.js',
  'js/ui/sounds.js',
  'js/ui/ui.js',
  'js/ui/effects.js',
  'js/ui/utils-ui.js',
  'js/ui/roleplay.js',
  'js/ui/characters.js',
  'js/ui/navigation.js',
  'js/ui/sheets.js',
  'js/ui/vn.js',
  'js/ui/topics.js',
  'js/ui/app-ui.js',
  'js/app.js'
];

function read(file) {
  return fs.readFileSync(path.join(root, file), 'utf8');
}

let html = read('index.html');

const bundledCss = cssOrder.map(f => `/* ${f} */\n${read(f)}`).join('\n\n');
const bundledJs = jsOrder.map(f => `/* ${f} */\n${read(f)}`).join('\n\n');

// Reemplazar CSS
html = html.replace(/<link rel="stylesheet" href="css\/main\.css">/, `<style>\n${bundledCss}\n</style>`);

// Reemplazar todos los script tags (desde el primero hasta el último app.js)
// Busca desde state.js hasta el último app.js y lo reemplaza todo por el bundle
html = html.replace(
  /<script src="js\/utils\/state\.js"><\/script>[\s\S]*?<script src="js\/app\.js"><\/script>/,
  `<script>\n${bundledJs}\n</script>`
);

// Inyectar API key si está disponible
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
