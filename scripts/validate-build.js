#!/usr/bin/env node
'use strict';

const fs = require('fs');
const zlib = require('zlib');
const path = require('path');

const root = path.resolve(__dirname, '..');
const dist = path.join(root, 'dist');

function fail(msg) {
  console.error(`❌ ${msg}`);
  process.exit(1);
}

function ok(msg) {
  console.log(`✅ ${msg}`);
}

function read(p) {
  return fs.readFileSync(path.join(root, p), 'utf8');
}

if (!fs.existsSync(dist)) fail('dist/ no existe. Ejecuta npm run build primero.');

['dist/index.html', 'dist/noncritical.css', 'dist/etheria.css', 'dist/etheria.css.map', 'dist/etheria.js', 'dist/etheria.js.map'].forEach((f) => {
  if (!fs.existsSync(path.join(root, f))) fail(`Falta ${f}`);
  ok(`Existe ${f}`);
});

const criticalInlineMatch = read('dist/index.html').match(/<style id="critical-inline-css">([\s\S]*?)<\/style>/i);
if (!criticalInlineMatch) fail('dist/index.html no incluye critical inline');
const criticalGzipSize = zlib.gzipSync(Buffer.from(criticalInlineMatch[1], 'utf8'), { level: 9 }).length;
ok(`critical inline gzip = ${(criticalGzipSize/1024).toFixed(2)} KB`);

const cssMap = JSON.parse(read('dist/etheria.css.map'));
const jsMap = JSON.parse(read('dist/etheria.js.map'));
if (!Array.isArray(cssMap.sources) || cssMap.sources.length === 0) fail('Sourcemap CSS sin sources');
if (!Array.isArray(jsMap.sources) || jsMap.sources.length === 0) fail('Sourcemap JS sin sources');
ok(`Sourcemaps válidos (CSS sources=${cssMap.sources.length}, JS sources=${jsMap.sources.length})`);

const requiredCssImports = [
  "@import url('./critical/01-tokens.css');",
  "@import url('./critical/02-fonts-base.css');",
  "@import url('./critical/03-layout-shell.css');",
];
const criticalText = read('css/critical.css');
requiredCssImports.forEach((line) => {
  if (!criticalText.includes(line)) fail(`critical.css sin import requerido: ${line}`);
});
ok('critical.css imports OK');

const html = read('index.html');
if (!html.includes('href="css/critical.css"')) fail('index.html no referencia css/critical.css');
if (!html.includes('href="css/non-critical.css"')) fail('index.html no referencia css/non-critical.css');
ok('index.html referencias critical/non-critical OK');

console.log('✅ Build validation complete');
