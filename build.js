#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

// Build simple para generar una versión única lista para compartir.
// Uso: node build.js

const root = __dirname;
const distDir = path.join(root, 'dist');
const cssOrder = [
  'css/variables.css',
  'css/animations.css',
  'css/components.css'
];

const jsOrder = [
  'js/utils/state.js',
  'js/utils/storage.js',
  'js/ui/interface.js',
  'js/app.js'
];

function read(file) {
  return fs.readFileSync(path.join(root, file), 'utf8');
}

let html = read('index.html');

const bundledCss = cssOrder.map(f => `/* ${f} */\n${read(f)}`).join('\n\n');
const bundledJs = jsOrder.map(f => `/* ${f} */\n${read(f)}`).join('\n\n');

html = html.replace(/<link rel="stylesheet" href="css\/main\.css">/, `<style>\n${bundledCss}\n</style>`);
html = html.replace(/<script src="js\/utils\/state\.js"><\/script>\s*<script src="js\/utils\/storage\.js"><\/script>\s*<script src="js\/ui\/interface\.js"><\/script>\s*<script src="js\/app\.js"><\/script>/,
  `<script>\n${bundledJs}\n<\/script>`);

fs.mkdirSync(distDir, { recursive: true });
fs.writeFileSync(path.join(distDir, 'etheria.html'), html);
fs.writeFileSync(path.join(distDir, 'index.html'), html);
console.log('✅ Build completado: dist/etheria.html y dist/index.html');
