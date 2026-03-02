// Bus de eventos desacoplado para módulos UI.
(function initEtheriaEvents(global) {
    const EVENT_PREFIX = 'etheria:';

    const eventBus = {
        emit: function emit(type, payload) {
            document.dispatchEvent(new CustomEvent(EVENT_PREFIX + type, { detail: payload }));
        },
        on: function on(type, handler) {
            const wrapped = function wrapped(e) {
                handler(e.detail);
            };
            document.addEventListener(EVENT_PREFIX + type, wrapped);
            return function off() {
                document.removeEventListener(EVENT_PREFIX + type, wrapped);
            };
        }
    };

    global.eventBus = eventBus;
})(window);
