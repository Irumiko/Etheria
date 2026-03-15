const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function loadScript(path, sandbox) {
  const code = fs.readFileSync(path, 'utf8');
  vm.runInContext(code, sandbox, { filename: path });
}

function makeSandbox() {
  const events = [];
  const sandbox = vm.createContext({
    window: {
      SUPABASE_CONFIG: { url: 'https://example.supabase.co', key: 'anon-key' },
      EtheriaLogger: { warn() {}, error() {}, info() {}, debug() {} },
      addEventListener() {},
      dispatchEvent(evt) { events.push(evt); },
      CustomEvent: function(type, init){ this.type = type; this.detail = init?.detail; },
      AbortSignal: { timeout: () => undefined },
      appData: { stories: [], messages: {}, cloudProfiles: [], cloudCharacters: {} },
      currentTopicId: null,
    },
    fetch: async () => ({ ok: true, json: async () => ([]), text: async () => '' }),
    AbortSignal: { timeout: () => undefined },
    CustomEvent: function(type, init){ this.type = type; this.detail = init?.detail; },
    eventBus: { emit() {} },
  });
  sandbox.window.fetch = sandbox.fetch;
  sandbox.window.eventBus = sandbox.eventBus;
  return sandbox;
}

test('SupabaseMessages send and load call dynamic header builder', async () => {
  const sandbox = makeSandbox();
  let headerCalls = 0;
  sandbox.window.supabaseClient = { auth: { getUser: async () => ({ data: { user: { id: 'u1' } } }), getSession: async () => ({ data: { session: { access_token: 'jwt' } } }) } };
  sandbox.window.SupabaseAuthHeaders = { buildAuthHeaders: async ({ apikey, baseHeaders }) => { headerCalls++; return { ...baseHeaders, apikey, Authorization: 'Bearer jwt' }; }, getAccessToken: async () => 'jwt' };
  let fetchCalls = [];
  sandbox.fetch = async (url, opts = {}) => { fetchCalls.push({ url, opts }); return { ok: true, json: async () => ([]), text: async () => '' }; };
  sandbox.window.fetch = sandbox.fetch;
  loadScript('js/utils/supabaseMessages.js', sandbox);

  const ok = await sandbox.window.SupabaseMessages.send('s1', { id: 'm1', text: 'hola', userIndex: 1 });
  assert.equal(ok, true);
  await sandbox.window.SupabaseMessages.load('s1');
  assert.ok(headerCalls >= 2);
  assert.match(fetchCalls[0].opts.headers.Authorization, /^Bearer jwt/);
});

test('SupabaseStories read/write headers use auth helper', async () => {
  const sandbox = makeSandbox();
  let headerCalls = 0;
  sandbox.window.supabaseClient = { auth: { getUser: async () => ({ data: { user: { id: 'u1' } } }), getSession: async () => ({ data: { session: { access_token: 'jwt' } } }) } };
  sandbox.window.SupabaseAuthHeaders = { buildAuthHeaders: async ({ apikey, baseHeaders, acceptJson }) => { headerCalls++; return { ...baseHeaders, apikey, Authorization: 'Bearer jwt', ...(acceptJson ? { Accept: 'application/json' } : {}) }; }, getAccessToken: async () => 'jwt' };
  sandbox.fetch = async () => ({ ok: true, json: async () => ([{ id: 'st1', title: 'Story' }]), text: async () => '' });
  sandbox.window.fetch = sandbox.fetch;
  loadScript('js/utils/supabaseStories.js', sandbox);

  await sandbox.window.SupabaseStories.createStory('Story test');
  await sandbox.window.SupabaseStories.loadStories();
  assert.ok(headerCalls >= 2);
});
