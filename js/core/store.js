// Store centralizado mínimo para migración incremental sin romper globals.
(function initEtheriaStore(global) {
    function createStore(initialState) {
        let state = { ...initialState };
        const listeners = new Set();

        return {
            get: function getState() {
                return state;
            },
            set: function setState(updater) {
                const prev = state;
                const patch = (typeof updater === 'function') ? updater(prev) : updater;
                const next = (patch && typeof patch === 'object') ? { ...prev, ...patch } : prev;
                if (next === prev) return prev;
                state = next;
                listeners.forEach(function notify(listener) {
                    listener(prev, next);
                });
                return next;
            },
            subscribe: function subscribe(listener) {
                listeners.add(listener);
                return function unsubscribe() {
                    listeners.delete(listener);
                };
            }
        };
    }

    const vnStore = createStore({
        topicId: null,
        selectedCharId: null,
        messageIndex: 0,
        isTyping: false,
        weather: 'none'
    });

    function syncVnStore(partial) {
        return vnStore.set(partial);
    }

    global.createStore = createStore;
    global.vnStore = vnStore;
    global.syncVnStore = syncVnStore;
})(window);
