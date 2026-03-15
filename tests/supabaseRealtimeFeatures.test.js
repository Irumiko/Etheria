const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function loadScript(path, sandbox) {
  const code = fs.readFileSync(path, 'utf8');
  vm.runInContext(code, sandbox, { filename: path });
}

function createSandbox() {
  const events = [];
  const sandbox = vm.createContext({
    console,
    eventBus: { emit() {} },
    localStorage: {
      getItem() { return null; },
      setItem() {},
      removeItem() {}
    },
    fetch: async () => ({ ok: true, json: async () => [], text: async () => '' }),
    AbortSignal: { timeout: () => undefined },
    window: {
      SUPABASE_CONFIG: { url: 'https://example.supabase.co', key: 'anon-key' },
      EtheriaLogger: { warn() {}, info() {}, debug() {} },
      supabaseClient: null,
      _cachedUserId: 'user-1',
      addEventListener() {},
      dispatchEvent(evt) { events.push(evt); },
      currentUserIndex: 0,
      userNames: ['Irumiko']
    },
    CustomEvent: function(type, init){ this.type = type; this.detail = init?.detail; },
    currentStoryId: 'story-1',
    currentTopicId: 'topic-1',
    showSection() {},
    showAutosave() {}
  });
  sandbox.window.fetch = sandbox.fetch;
  sandbox.window.eventBus = sandbox.eventBus;
  sandbox.window.AbortSignal = sandbox.AbortSignal;
  sandbox.window.CustomEvent = sandbox.CustomEvent;
  return { sandbox, events };
}

test('SupabaseTurnNotifications.notifyTurn inserta fila con recipient/sender correctos', async () => {
  const { sandbox } = createSandbox();
  let capturedBody = null;
  let capturedUrl = '';

  sandbox.fetch = async (url, opts = {}) => {
    capturedUrl = url;
    capturedBody = JSON.parse(opts.body);
    return { ok: true, json: async () => ([]), text: async () => '' };
  };
  sandbox.window.fetch = sandbox.fetch;

  loadScript('js/utils/supabaseTurnNotifications.js', sandbox);

  const result = await sandbox.window.SupabaseTurnNotifications.notifyTurn({
    storyId: 'story-1',
    topicId: 'topic-1',
    recipientUserId: 'user-2',
    messageId: 'm1',
    title: 'Turno',
    body: 'Te toca'
  });

  assert.equal(result.ok, true);
  assert.match(capturedUrl, /\/rest\/v1\/turn_notifications$/);
  assert.equal(capturedBody.story_id, 'story-1');
  assert.equal(capturedBody.topic_id, 'topic-1');
  assert.equal(capturedBody.sender_user_id, 'user-1');
  assert.equal(capturedBody.recipient_user_id, 'user-2');
});

test('SupabasePresence emite etheria:story-presence-changed al sincronizar estado', async () => {
  const { sandbox, events } = createSandbox();

  let syncHandler = null;
  let joinHandler = null;
  let leaveHandler = null;
  let statusHandler = null;
  let tracked = null;

  const fakeChannel = {
    on(type, cfg, cb) {
      if (type === 'presence' && cfg?.event === 'sync') syncHandler = cb;
      if (type === 'presence' && cfg?.event === 'join') joinHandler = cb;
      if (type === 'presence' && cfg?.event === 'leave') leaveHandler = cb;
      return this;
    },
    subscribe(cb) { statusHandler = cb; return this; },
    async track(payload) { tracked = payload; },
    presenceState() {
      return {
        'user-1': [{ user_id: 'user-1', name: 'Irumiko' }],
        'user-2': [{ user_id: 'user-2', name: 'Otro' }]
      };
    },
    async untrack() {}
  };

  sandbox.window.supabaseClient = {
    channel() { return fakeChannel; },
    removeChannel() {}
  };

  loadScript('js/utils/supabasePresence.js', sandbox);
  const ok = await sandbox.window.SupabasePresence.joinStory('story-1');
  assert.equal(ok, true);

  assert.ok(statusHandler, 'debe registrar callback de subscribe');
  await statusHandler('SUBSCRIBED');
  assert.equal(tracked.user_id, 'user-1');

  assert.ok(syncHandler);
  syncHandler();

  const presenceEvents = events.filter(e => e.type === 'etheria:story-presence-changed');
  const evt = presenceEvents[presenceEvents.length - 1];
  assert.ok(evt, 'debe emitir evento de presencia');
  assert.equal(evt.detail.storyId, 'story-1');
  assert.equal(JSON.stringify(evt.detail.userIds.sort()), JSON.stringify(['user-1', 'user-2']));

  // smoke: handlers join/leave existen
  assert.equal(typeof joinHandler, 'function');
  assert.equal(typeof leaveHandler, 'function');
});
