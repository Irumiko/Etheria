const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function createLocalStorage(seed = {}) {
  const store = new Map(Object.entries(seed));
  const api = {
    getItem(key) { return store.has(key) ? store.get(key) : null; },
    setItem(key, value) { store.set(String(key), String(value)); },
    removeItem(key) { store.delete(String(key)); },
    key(index) { return Array.from(store.keys())[index] || null; },
    get length() { return store.size; },
    _dump() { return Object.fromEntries(store.entries()); }
  };

  return new Proxy(api, {
    ownKeys() { return Reflect.ownKeys(api).concat(Array.from(store.keys())); },
    getOwnPropertyDescriptor(target, prop) {
      if (prop in target) return Object.getOwnPropertyDescriptor(target, prop) || { configurable: true, enumerable: false };
      if (store.has(prop)) return { configurable: true, enumerable: true, value: store.get(prop) };
      return undefined;
    },
    get(target, prop, receiver) {
      if (prop in target) return Reflect.get(target, prop, receiver);
      if (store.has(prop)) return store.get(prop);
      return undefined;
    }
  });
}

function loadScript(file, sandbox) {
  vm.runInContext(fs.readFileSync(file, 'utf8'), sandbox, { filename: file });
}

function makeSandbox() {
  const localStorage = createLocalStorage({
    etheria_messages_local_1: JSON.stringify([{ id: 'm1' }]),
    etheria_messages_local_2: JSON.stringify([{ id: 'm2' }, { id: 'm3' }])
  });
  const window = { EtheriaLogger: { warn() {} } };
  const sandbox = vm.createContext({
    console,
    localStorage,
    window,
    eventBus: { emit() {} },
    showAutosave() {},
    renderTopics() {}
  });
  window.localStorage = localStorage;
  loadScript('js/utils/state.js', sandbox);
  loadScript('js/utils/storage.js', sandbox);
  vm.runInContext(`
    appData.topics = [
      { id: 'local_1', title: 'Historia local', storyId: null, mode: 'rpg', createdBy: 'Irumiko', createdByIndex: 0 },
      { id: 'local_2', title: 'Historia cloud', storyId: 'story-uuid-2', mode: 'roleplay', createdBy: 'Irumiko', createdByIndex: 0 }
    ];
    appData.messages = { local_1: [{ id: 'm1' }], local_2: [{ id: 'm2' }, { id: 'm3' }] };
    appData.affinities = { local_2: { c1: 10 } };
    appData.favorites = { local_2: ['m2'] };
    appData.journals = { local_2: 'nota' };
    appData.reactions = { local_2: { m2: { 0: '✨' } } };
    function save() { persistPartitionedData(); return true; }
  `, sandbox);
  return sandbox;
}

test('EtheriaLocalStories.list exposes local ids, optional storyId and message counts', () => {
  const sandbox = makeSandbox();
  const stories = JSON.parse(vm.runInContext('JSON.stringify(window.EtheriaLocalStories.list())', sandbox));

  assert.equal(stories.length, 2);
  assert.deepEqual(stories.map(story => story.id), ['local_1', 'local_2']);
  assert.equal(stories[0].storyId, null);
  assert.equal(stories[0].messageCount, 1);
  assert.equal(stories[1].storyId, 'story-uuid-2');
  assert.equal(stories[1].messageCount, 2);
  assert.equal(stories[1].storageKey, 'etheria_messages_local_2');
});

test('EtheriaLocalStories.deleteById removes a local story by local id or storyId', () => {
  const sandbox = makeSandbox();
  const result = JSON.parse(vm.runInContext("JSON.stringify(window.EtheriaLocalStories.deleteById('story-uuid-2'))", sandbox));

  assert.equal(result.ok, true);
  assert.deepEqual(result.removed, [{ id: 'local_2', storyId: 'story-uuid-2', title: 'Historia cloud' }]);
  assert.equal(result.remaining, 1);
  assert.equal(sandbox.localStorage.getItem('etheria_messages_local_2'), null);

  const remainingIds = JSON.parse(vm.runInContext('JSON.stringify(appData.topics.map(topic => topic.id))', sandbox));
  assert.deepEqual(remainingIds, ['local_1']);
  const deletedTopicState = JSON.parse(vm.runInContext(`JSON.stringify({
    hasMessages: 'local_2' in appData.messages,
    hasAffinities: 'local_2' in appData.affinities,
    hasFavorites: 'local_2' in appData.favorites,
    hasJournals: 'local_2' in appData.journals,
    hasReactions: 'local_2' in appData.reactions
  })`, sandbox));
  assert.deepEqual(deletedTopicState, {
    hasMessages: false,
    hasAffinities: false,
    hasFavorites: false,
    hasJournals: false,
    hasReactions: false
  });
});
