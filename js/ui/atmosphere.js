/* ============================================================
   ETHERIA · ATMÓSFERA — fuente de verdad compartida
   Persiste en localStorage y sincroniza #mainMenu y
   #optionsSection mediante un evento único de eventBus.
   ============================================================ */
(function () {
  'use strict';

  var AMB_KEY    = 'etheria.atmosphere';
  var AMB_VALUES = ['amanecer', 'mediodia', 'atardecer', 'noche'];
  var AMB_DEFAULT = 'noche';

  function _load() {
    var v = localStorage.getItem(AMB_KEY);
    return AMB_VALUES.indexOf(v) !== -1 ? v : AMB_DEFAULT;
  }

  function _applyToBody(value) {
    AMB_VALUES.forEach(function (a) { document.body.classList.remove('amb-' + a); });
    document.body.classList.add('amb-' + value);
  }

  function set(value) {
    if (AMB_VALUES.indexOf(value) === -1) return;
    localStorage.setItem(AMB_KEY, value);
    _applyToBody(value);
    if (window.eventBus) {
      window.eventBus.emit('settings:atmosphere-changed', value);
    }
  }

  function get() {
    return _load();
  }

  function cycle() {
    var current = get();
    var idx = AMB_VALUES.indexOf(current);
    set(AMB_VALUES[(idx + 1) % AMB_VALUES.length]);
  }

  function init() {
    _applyToBody(_load());
  }

  window.EtheriaAtmosphere = {
    get: get,
    set: set,
    cycle: cycle,
    init: init,
    VALUES: AMB_VALUES
  };

  if (document.readyState !== 'loading') {
    init();
  } else {
    document.addEventListener('DOMContentLoaded', init);
  }
})();
