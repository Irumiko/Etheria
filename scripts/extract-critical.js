#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const root = path.resolve(__dirname, '..');
const entry = path.join(root, 'css/critical.css');

function resolveCss(filePath, seen = new Set()) {
  const abs = path.resolve(filePath);
  if (seen.has(abs)) return '';
  seen.add(abs);

  let text = fs.readFileSync(abs, 'utf8');
  const dir = path.dirname(abs);
  text = text.replace(/@import\s+url\((['"]?)([^'"\)]+)\1\);?/g, (_, __, rel) => {
    if (/^(https?:|data:|\/\/)/.test(rel)) return '';
    const target = path.resolve(dir, rel);
    return resolveCss(target, seen);
  });
  return `/* ${path.relative(root, abs)} */\n${text}\n`;
}

const css = resolveCss(entry);
const raw = Buffer.byteLength(css);
const gzip = zlib.gzipSync(css, { level: 9 }).length;

const limitKb = 14;
const gzKb = gzip / 1024;
console.log(JSON.stringify({ rawBytes: raw, gzipBytes: gzip, gzipKb: Number(gzKb.toFixed(2)), limitKb }, null, 2));

if (gzKb > limitKb) {
  console.warn(`⚠️ critical css is ${gzKb.toFixed(2)} KB gzip (> ${limitKb} KB target)`);
  if (process.argv.includes('--strict')) process.exit(1);
}
