// ============================================================
// Etheria — Message Cache (IndexedDB)
// Cachea los últimos CACHE_LIMIT mensajes por historia en IDB.
// También mantiene una cola de mensajes pendientes (outbox)
// para enviar cuando se recupere la conexión.
// API expuesta en window.EtheriaMessageCache
// ============================================================
(function (global) {
    'use strict';

    var DB_NAME     = 'etheria-offline';
    var DB_VERSION  = 2;           // v2: añade store "outbox"
    var STORE_NAME  = 'messages';
    var QUEUE_STORE = 'outbox';
    var CACHE_LIMIT = 60;          // mensajes por historia

    var _db = null;
    var _openPromise = null;

    function _open() {
        if (_db) return Promise.resolve(_db);
        if (_openPromise) return _openPromise;

        _openPromise = new Promise(function (resolve, reject) {
            if (typeof indexedDB === 'undefined') {
                reject(new Error('IndexedDB not available'));
                return;
            }
            var req = indexedDB.open(DB_NAME, DB_VERSION);

            req.onupgradeneeded = function (e) {
                var db = e.target.result;
                if (!db.objectStoreNames.contains(STORE_NAME)) {
                    db.createObjectStore(STORE_NAME, { keyPath: 'storyId' });
                }
                if (!db.objectStoreNames.contains(QUEUE_STORE)) {
                    db.createObjectStore(QUEUE_STORE, { keyPath: 'id', autoIncrement: true });
                }
            };

            req.onsuccess = function (e) {
                _db = e.target.result;
                _db.onclose = function () { _db = null; _openPromise = null; };
                resolve(_db);
            };

            req.onerror = function (e) {
                _openPromise = null;
                reject(e.target.error);
            };
        });

        return _openPromise;
    }

    // ── Caché de mensajes ────────────────────────────────────────────────────

    /**
     * Almacena mensajes para una historia.
     * Guarda solo los últimos CACHE_LIMIT para no crecer sin límite.
     */
    function put(storyId, messages) {
        if (!storyId || !Array.isArray(messages)) return Promise.resolve();
        return _open().then(function (db) {
            var slice = messages.length > CACHE_LIMIT
                ? messages.slice(messages.length - CACHE_LIMIT)
                : messages;
            var tx    = db.transaction(STORE_NAME, 'readwrite');
            var store = tx.objectStore(STORE_NAME);
            store.put({ storyId: String(storyId), messages: slice, cachedAt: Date.now() });
            return new Promise(function (resolve, reject) {
                tx.oncomplete = resolve;
                tx.onerror    = function (e) { reject(e.target.error); };
            });
        }).catch(function (err) {
            if (global.EtheriaLogger) global.EtheriaLogger.warn('messageCache', 'put failed:', err && err.message);
        });
    }

    /**
     * Recupera los mensajes cacheados para una historia.
     * Devuelve null si no hay caché o IDB no está disponible.
     */
    function get(storyId) {
        if (!storyId) return Promise.resolve(null);
        return _open().then(function (db) {
            var tx    = db.transaction(STORE_NAME, 'readonly');
            var store = tx.objectStore(STORE_NAME);
            var req   = store.get(String(storyId));
            return new Promise(function (resolve, reject) {
                req.onsuccess = function () {
                    var rec = req.result;
                    resolve(rec && Array.isArray(rec.messages) ? rec.messages : null);
                };
                req.onerror = function (e) { reject(e.target.error); };
            });
        }).catch(function (err) {
            if (global.EtheriaLogger) global.EtheriaLogger.warn('messageCache', 'get failed:', err && err.message);
            return null;
        });
    }

    /**
     * Elimina la caché de una historia (p.ej. al borrarla).
     */
    function remove(storyId) {
        if (!storyId) return Promise.resolve();
        return _open().then(function (db) {
            var tx    = db.transaction(STORE_NAME, 'readwrite');
            var store = tx.objectStore(STORE_NAME);
            store.delete(String(storyId));
        }).catch(function () {});
    }

    // ── Cola de mensajes pendientes (outbox) ─────────────────────────────────

    /**
     * Añade un mensaje a la cola de envío pendiente.
     * @param {{ sessionId: string, msgObj: object, storyId: string|null }} item
     */
    function enqueue(item) {
        if (!item || !item.sessionId || !item.msgObj) return Promise.resolve();
        return _open().then(function (db) {
            var tx    = db.transaction(QUEUE_STORE, 'readwrite');
            var store = tx.objectStore(QUEUE_STORE);
            store.add(Object.assign({ enqueuedAt: Date.now() }, item));
            return new Promise(function (resolve, reject) {
                tx.oncomplete = resolve;
                tx.onerror    = function (e) { reject(e.target.error); };
            });
        }).catch(function (err) {
            if (global.EtheriaLogger) global.EtheriaLogger.warn('messageCache', 'enqueue failed:', err && err.message);
        });
    }

    /**
     * Devuelve todos los mensajes pendientes en orden de inserción.
     * @returns {Promise<Array>}
     */
    function dequeuePending() {
        return _open().then(function (db) {
            var tx  = db.transaction(QUEUE_STORE, 'readonly');
            var req = tx.objectStore(QUEUE_STORE).getAll();
            return new Promise(function (resolve, reject) {
                req.onsuccess = function () { resolve(req.result || []); };
                req.onerror   = function (e) { reject(e.target.error); };
            });
        }).catch(function () { return []; });
    }

    /**
     * Elimina un mensaje de la cola por su id autoincrement.
     * @param {number} id
     */
    function removeFromQueue(id) {
        if (id == null) return Promise.resolve();
        return _open().then(function (db) {
            var tx = db.transaction(QUEUE_STORE, 'readwrite');
            tx.objectStore(QUEUE_STORE).delete(id);
        }).catch(function () {});
    }

    global.EtheriaMessageCache = {
        put:             put,
        get:             get,
        remove:          remove,
        enqueue:         enqueue,
        dequeuePending:  dequeuePending,
        removeFromQueue: removeFromQueue
    };

}(window));
