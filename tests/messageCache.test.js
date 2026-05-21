// Tests para js/utils/messageCache.js
// Usa un mock de IndexedDB en memoria para ejecutar en Node.js sin navegador.

const test   = require('node:test');
const assert = require('node:assert/strict');
const fs     = require('node:fs');
const vm     = require('node:vm');

// ── Mock de IndexedDB en memoria ─────────────────────────────────────────────

function makeIDBMock() {
    const stores = {};    // { name: { data: Map, keyPath, autoIncrement, nextId } }
    let dbInstance = null;

    function buildDB() {
        return {
            onclose: null,
            objectStoreNames: { contains(n) { return n in stores; } },
            createObjectStore(name, opts = {}) {
                stores[name] = {
                    data:          new Map(),
                    keyPath:       opts.keyPath  || 'id',
                    autoIncrement: !!opts.autoIncrement,
                    nextId:        1
                };
            },
            transaction(names, _mode) {
                let completeFired = false;
                const tx = {
                    oncomplete: null,
                    onerror:    null,
                    _fireComplete() {
                        if (completeFired) return;
                        completeFired = true;
                        setImmediate(() => { if (tx.oncomplete) tx.oncomplete(); });
                    },
                    objectStore(name) {
                        const s = stores[name];
                        function makeReq(fn) {
                            const r = { onsuccess: null, onerror: null, result: undefined };
                            setImmediate(() => {
                                try {
                                    r.result = fn();
                                    if (r.onsuccess) r.onsuccess({ target: r });
                                } catch (e) {
                                    if (r.onerror) r.onerror({ target: { error: e } });
                                }
                                tx._fireComplete();
                            });
                            return r;
                        }
                        return {
                            put(val) {
                                return makeReq(() => {
                                    const key = String(val[s.keyPath]);
                                    s.data.set(key, { ...val });
                                    return key;
                                });
                            },
                            add(val) {
                                return makeReq(() => {
                                    let key;
                                    if (s.autoIncrement) {
                                        key = s.nextId++;
                                        val = { ...val, [s.keyPath]: key };
                                    } else {
                                        key = val[s.keyPath];
                                    }
                                    s.data.set(String(key), { ...val });
                                    return key;
                                });
                            },
                            get(key) {
                                return makeReq(() => s.data.get(String(key)));
                            },
                            getAll() {
                                return makeReq(() => [...s.data.values()]);
                            },
                            delete(key) {
                                return makeReq(() => { s.data.delete(String(key)); });
                            }
                        };
                    }
                };
                return tx;
            }
        };
    }

    return {
        open(_name, _version) {
            const r = { onsuccess: null, onerror: null, onupgradeneeded: null, result: null };
            setImmediate(() => {
                if (!dbInstance) dbInstance = buildDB();
                if (r.onupgradeneeded) {
                    r.onupgradeneeded({ target: { result: dbInstance } });
                }
                r.result = dbInstance;
                if (r.onsuccess) r.onsuccess({ target: r });
            });
            return r;
        }
    };
}

function makeCache() {
    const sandbox = vm.createContext({
        window:     {},
        indexedDB:  makeIDBMock(),
        EtheriaLogger: { warn() {} }
    });
    // messageCache.js envuelve todo en (function(global){ ... }(window))
    // así que las llamadas a indexedDB van por global.indexedDB en el sandbox
    sandbox.indexedDB = sandbox.indexedDB;
    vm.runInContext(fs.readFileSync('js/utils/messageCache.js', 'utf8'), sandbox);
    return sandbox.window.EtheriaMessageCache;
}

// ── Tests: caché de mensajes ─────────────────────────────────────────────────

test('EtheriaMessageCache expone put, get, remove, enqueue, dequeuePending, removeFromQueue', () => {
    const cache = makeCache();
    assert.equal(typeof cache.put,             'function');
    assert.equal(typeof cache.get,             'function');
    assert.equal(typeof cache.remove,          'function');
    assert.equal(typeof cache.enqueue,         'function');
    assert.equal(typeof cache.dequeuePending,  'function');
    assert.equal(typeof cache.removeFromQueue, 'function');
});

test('EtheriaMessageCache.put almacena mensajes y get los recupera', async () => {
    const cache = makeCache();
    const msgs = [
        { id: 'a', text: 'hola', timestamp: '2024-01-01T00:00:00Z' },
        { id: 'b', text: 'mundo', timestamp: '2024-01-01T00:01:00Z' }
    ];
    await cache.put('story-1', msgs);
    const result = await cache.get('story-1');
    assert.ok(Array.isArray(result), 'debe devolver un array');
    assert.equal(result.length, 2);
    assert.equal(result[0].id, 'a');
    assert.equal(result[1].id, 'b');
});

test('EtheriaMessageCache.get devuelve null para historias no cacheadas', async () => {
    const cache = makeCache();
    const result = await cache.get('historia-inexistente');
    assert.equal(result, null);
});

test('EtheriaMessageCache.put respeta el límite de 60 mensajes', async () => {
    const cache = makeCache();
    const msgs = Array.from({ length: 80 }, function (_, i) {
        return { id: 'msg-' + i, text: 'msg ' + i };
    });
    await cache.put('story-big', msgs);
    const result = await cache.get('story-big');
    assert.equal(result.length, 60, 'debe guardar solo los últimos 60');
    assert.equal(result[0].id, 'msg-20', 'el primero debe ser el mensaje 20 (de 80, guarda los últimos 60)');
    assert.equal(result[59].id, 'msg-79', 'el último debe ser el mensaje 79');
});

test('EtheriaMessageCache.remove elimina la entrada de la historia', async () => {
    const cache = makeCache();
    await cache.put('story-del', [{ id: 'x', text: 'bye' }]);
    await cache.remove('story-del');
    const result = await cache.get('story-del');
    assert.equal(result, null);
});

test('EtheriaMessageCache.put con storyId vacío no falla', async () => {
    const cache = makeCache();
    await assert.doesNotReject(cache.put('', []));
    await assert.doesNotReject(cache.put(null, []));
});

// ── Tests: cola de mensajes pendientes (outbox) ──────────────────────────────

test('EtheriaMessageCache enqueue + dequeuePending: flujo básico', async () => {
    const cache = makeCache();
    const item = { sessionId: 's1', msgObj: { id: 'm1', text: 'hola offline' }, storyId: 'story-1' };
    await cache.enqueue(item);
    const pending = await cache.dequeuePending();
    assert.equal(pending.length, 1);
    assert.equal(pending[0].sessionId, 's1');
    assert.equal(pending[0].msgObj.text, 'hola offline');
    assert.ok(typeof pending[0].enqueuedAt === 'number', 'debe incluir enqueuedAt');
    assert.ok(typeof pending[0].id === 'number', 'debe tener id autoincrement');
});

test('EtheriaMessageCache encola múltiples mensajes en orden', async () => {
    const cache = makeCache();
    await cache.enqueue({ sessionId: 's1', msgObj: { id: 'a', text: '1' }, storyId: null });
    await cache.enqueue({ sessionId: 's1', msgObj: { id: 'b', text: '2' }, storyId: null });
    await cache.enqueue({ sessionId: 's1', msgObj: { id: 'c', text: '3' }, storyId: null });
    const pending = await cache.dequeuePending();
    assert.equal(pending.length, 3);
    assert.equal(pending[0].msgObj.text, '1');
    assert.equal(pending[1].msgObj.text, '2');
    assert.equal(pending[2].msgObj.text, '3');
});

test('EtheriaMessageCache.removeFromQueue elimina un elemento por id', async () => {
    const cache = makeCache();
    await cache.enqueue({ sessionId: 's1', msgObj: { id: 'a' }, storyId: null });
    await cache.enqueue({ sessionId: 's1', msgObj: { id: 'b' }, storyId: null });
    let pending = await cache.dequeuePending();
    assert.equal(pending.length, 2);
    const firstId = pending[0].id;
    await cache.removeFromQueue(firstId);
    pending = await cache.dequeuePending();
    assert.equal(pending.length, 1);
    assert.equal(pending[0].msgObj.id, 'b');
});

test('EtheriaMessageCache.enqueue ignora items sin sessionId o msgObj', async () => {
    const cache = makeCache();
    await cache.enqueue(null);
    await cache.enqueue({ sessionId: 's1' });             // sin msgObj
    await cache.enqueue({ msgObj: { id: 'x' } });        // sin sessionId
    const pending = await cache.dequeuePending();
    assert.equal(pending.length, 0, 'no debe encolar items inválidos');
});

test('EtheriaMessageCache caché y cola son independientes', async () => {
    const cache = makeCache();
    await cache.put('story-1', [{ id: 'msg-local', text: 'cached' }]);
    await cache.enqueue({ sessionId: 's1', msgObj: { id: 'msg-queue', text: 'queued' }, storyId: 'story-1' });
    const cached  = await cache.get('story-1');
    const pending = await cache.dequeuePending();
    assert.equal(cached[0].id, 'msg-local');
    assert.equal(pending[0].msgObj.id, 'msg-queue');
});
