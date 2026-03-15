const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function loadScript(path, sandbox) {
  const code = fs.readFileSync(path, 'utf8');
  vm.runInContext(code, sandbox, { filename: path });
}

test('SupabaseAuthHeaders uses session token when present', async () => {
  const sandbox = vm.createContext({ window: {} });
  loadScript('js/utils/supabaseAuthHeaders.js', sandbox);
  const client = { auth: { getSession: async () => ({ data: { session: { access_token: 'jwt-123' } } }) } };
  const headers = await sandbox.window.SupabaseAuthHeaders.buildAuthHeaders({ apikey: 'anon-key', client, baseHeaders: { 'Content-Type': 'application/json' } });
  assert.equal(headers.Authorization, 'Bearer jwt-123');
  assert.equal(headers.apikey, 'anon-key');
});

test('SupabaseAuthHeaders falls back to anon key without session', async () => {
  const sandbox = vm.createContext({ window: {} });
  loadScript('js/utils/supabaseAuthHeaders.js', sandbox);
  const client = { auth: { getSession: async () => ({ data: { session: null } }) } };
  const headers = await sandbox.window.SupabaseAuthHeaders.buildAuthHeaders({ apikey: 'anon-key', client });
  assert.equal(headers.Authorization, 'Bearer anon-key');
});
