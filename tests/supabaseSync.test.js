const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function loadScript(path, sandbox) {
  const code = fs.readFileSync(path, 'utf8');
  vm.runInContext(code, sandbox, { filename: path });
}

function createLocalStorage(seed = {}) {
  const store = new Map(Object.entries(seed));
  return {
    getItem(key) { return store.has(key) ? store.get(key) : null; },
    setItem(key, value) { store.set(key, String(value)); },
    removeItem(key) { store.delete(key); },
    _dump() { return Object.fromEntries(store.entries()); }
  };
}

function makeSandbox() {
  const localStorage = createLocalStorage({
    etheria_user_genders: JSON.stringify(['femenino']),
    etheria_user_birthdays: JSON.stringify(['1995-01-01']),
    etheria_user_avatars: JSON.stringify(['https://avatar.test/a.png'])
  });

  const sandbox = vm.createContext({
    console,
    setInterval,
    clearInterval,
    setTimeout,
    clearTimeout,
    localStorage,
    navigator: { serviceWorker: { addEventListener() {} } },
    document: { documentElement: { getAttribute() { return 'dark'; } } },
    eventBus: { emit() {} },
    window: {
      _cachedUserId: 'user-1',
      addEventListener() {},
      supabaseClient: null,
      EtheriaLogger: { warn() {} }
    },
    currentUserIndex: 0,
    currentMessageIndex: 0,
    textSpeed: 25,
    hasUnsavedChanges: false,
    persistPartitionedData() {},
    appData: {
      topics: [{ id: 't1', createdByIndex: 0 }, { id: 't2', createdByIndex: 1 }],
      characters: [{ id: 'c1', userIndex: 0 }, { id: 'c2', userIndex: 1 }],
      messages: { t1: [{ id: 'm1' }], t2: [{ id: 'm2' }] },
      affinities: { t1: 42, t2: 15 },
      favorites: { t1: true },
      journals: { t1: 'entry' },
      reactions: { t1: { like: 1 } }
    },
    userNames: ['Irumiko', 'Usuario 2']
  });

  sandbox.window.localStorage = localStorage;
  sandbox.window.document = sandbox.document;
  sandbox.window.eventBus = sandbox.eventBus;
  sandbox.window.navigator = sandbox.navigator;
  sandbox.window.appData = sandbox.appData;
  sandbox.window.userNames = sandbox.userNames;
  sandbox.window.currentUserIndex = sandbox.currentUserIndex;

  return sandbox;
}

test('SupabaseSync.uploadProfileData usa upsert y serializa datos globales + profileMeta', async () => {
  const sandbox = makeSandbox();
  let upsertPayload = null;
  let upsertOptions = null;

  sandbox.window.supabaseClient = {
    from(table) {
      assert.equal(table, 'user_data');
      return {
        upsert(payload, options) {
          upsertPayload = payload;
          upsertOptions = options;
          return Promise.resolve({ error: null });
        }
      };
    }
  };

  loadScript('js/utils/supabaseSync.js', sandbox);
  const result = await sandbox.window.SupabaseSync.uploadProfileData();

  assert.equal(result.ok, true);
  assert.ok(upsertPayload, 'debe hacer upsert en user_data');
  assert.equal(upsertPayload.user_id, 'user-1');
  assert.equal(upsertOptions.onConflict, 'user_id');

  // Debe incluir todos los datos serializados, no solo el perfil activo
  assert.equal(upsertPayload.data.topics.length, 2);
  assert.equal(upsertPayload.data.characters.length, 2);
  assert.deepEqual(Object.keys(upsertPayload.data.messages).sort(), ['t1', 't2']);
  assert.equal(JSON.stringify(upsertPayload.data.profileMeta.genders), JSON.stringify(['femenino']));
  assert.equal(JSON.stringify(upsertPayload.data.profileMeta.birthdays), JSON.stringify(['1995-01-01']));
  assert.equal(JSON.stringify(upsertPayload.data.profileMeta.avatars), JSON.stringify(['https://avatar.test/a.png']));
});

test('SupabaseSync.downloadProfileData reemplaza estado local con datos remotos', async () => {
  const sandbox = makeSandbox();

  const remoteData = {
    userNames: ['Nombre Cloud'],
    topics: [{ id: 'remote-topic' }],
    characters: [{ id: 'remote-char' }],
    messages: { 'remote-topic': [{ id: 'rm1' }] },
    affinities: { 'remote-topic': 99 },
    favorites: { 'remote-topic': true },
    journals: { 'remote-topic': 'cloud journal' },
    reactions: { 'remote-topic': { wow: 1 } },
    profileMeta: {
      genders: ['no-binario'],
      birthdays: ['2000-02-02'],
      avatars: ['https://avatar.test/remote.png']
    }
  };

  sandbox.window.supabaseClient = {
    from(table) {
      assert.equal(table, 'user_data');
      return {
        select() { return this; },
        eq() { return this; },
        single() { return Promise.resolve({ data: { data: remoteData }, error: null }); }
      };
    }
  };

  loadScript('js/utils/supabaseSync.js', sandbox);
  const result = await sandbox.window.SupabaseSync.downloadProfileData();

  assert.equal(result.ok, true);
  assert.equal(sandbox.appData.topics.length, 1);
  assert.equal(sandbox.appData.topics[0].id, 'remote-topic');
  assert.equal(sandbox.appData.characters.length, 1);
  assert.deepEqual(Object.keys(sandbox.appData.messages), ['remote-topic']);
  assert.equal(sandbox.userNames[0], 'Nombre Cloud');
  assert.equal(sandbox.localStorage.getItem('etheria_user_genders'), JSON.stringify(['no-binario']));
  assert.equal(sandbox.localStorage.getItem('etheria_user_birthdays'), JSON.stringify(['2000-02-02']));
  assert.equal(sandbox.localStorage.getItem('etheria_user_avatars'), JSON.stringify(['https://avatar.test/remote.png']));
});
