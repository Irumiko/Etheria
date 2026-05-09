const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');

function stripExecutableBlocks(html) {
  return html.replace(/<script\b[\s\S]*?<\/script>/gi, '').replace(/<style\b[\s\S]*?<\/style>/gi, '');
}

function getIds(html) {
  return [...stripExecutableBlocks(html).matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]);
}

function getClassTokens(html) {
  return [...html.matchAll(/\bclass="([^"]*)"/g)]
    .flatMap((match) => match[1].trim().split(/\s+/).filter(Boolean));
}

test('source and built HTML do not contain duplicate IDs', () => {
  for (const file of ['index.html', 'dist/index.html', 'dist/etheria.html']) {
    const ids = getIds(read(file));
    const duplicates = [...new Set(ids.filter((id, index) => ids.indexOf(id) !== index))];
    assert.deepEqual(duplicates, [], `${file} has duplicate IDs`);
  }
});

test('VN menus remain isolated by mode and do not reintroduce legacy toolbar hooks', () => {
  const forbiddenToolbarClasses = [
    'vn-controls',
    'vn-control-slot',
    'vn-control-btn',
    'vn-control-icon',
    'vn-control-divider',
    'sync-btn',
    'vn-dm-top-btn',
    'vn-narrate-ctrl-btn',
    'active-story-badge',
  ];
  const forbiddenToolbarIds = /\bid="(?:deleteTopicBtn|syncNowBtn|favMsgBtn|favMsgIcon|syncBtnIcon|vnDmBtn|vnNarrateBtn|activeStoryBadge|activeStorySlot)"/;

  for (const file of ['index.html', 'dist/index.html', 'dist/etheria.html']) {
    const html = read(file);
    assert.equal((html.match(/vn-classic-controls/g) || []).length, 1, `${file} must have one classic toolbar`);
    assert.equal((html.match(/vn-rpg-controls/g) || []).length, 1, `${file} must have one RPG toolbar`);
    assert.equal(html.includes('vn-rpg-hud-quickbar'), false, `${file} must not render the removed quickbar`);
    assert.equal(forbiddenToolbarIds.test(html), false, `${file} reintroduced a legacy toolbar ID`);

    const classTokens = getClassTokens(html);
    for (const token of forbiddenToolbarClasses) {
      assert.equal(classTokens.includes(token), false, `${file} reintroduced legacy/shared toolbar class ${token}`);
    }
  }
});

test('inline handlers point to functions that exist in source scripts', () => {
  const html = read('index.html');
  const jsSource = fs.readdirSync(path.join(ROOT, 'js'), { recursive: true })
    .filter((file) => String(file).endsWith('.js'))
    .map((file) => read(path.join('js', String(file))))
    .join('\n');
  const availableSource = `${jsSource}\n${html}`;
  const allowedGlobals = new Set([
    'addEventListener',
    'catch',
    'classList',
    'click',
    'closest',
    'contains',
    'dispatchEvent',
    'getElementById',
    'preventDefault',
    'querySelector',
    'removeEventListener',
    'stopPropagation',
    'toggle',
    'if',
    'parseInt',
    'warn',
  ]);

  const handlers = [...html.matchAll(/\bon(?:click|change|input|keydown|keyup|error)="([^"]+)"/g)]
    .map((match) => match[1]);
  const calledFunctions = [...new Set(
    handlers.flatMap((handler) => [...handler.matchAll(/\b([A-Za-z_$][\w$]*)\s*\(/g)].map((match) => match[1]))
  )].filter((name) => !allowedGlobals.has(name));

  const missing = calledFunctions.filter((name) => {
    const pattern = new RegExp(`(?:function\\s+${name}\\b|(?:const|let|var)\\s+${name}\\s*=|window\\.${name}\\s*=|globalThis\\.${name}\\s*=)`);
    return !pattern.test(availableSource);
  });
  assert.deepEqual(missing, [], `Missing inline handler functions: ${missing.join(', ')}`);
});
