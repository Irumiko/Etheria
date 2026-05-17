// Hub principal — parallax, datos de usuario, reinicio al volver al menú.
(function () {
  'use strict';

  let _parallaxBound = false;

  // ── Init ─────────────────────────────────────────────────────────────────

  function initHub() {
    const hub = document.getElementById('mainMenu');
    if (!hub) return;

    document.documentElement.style.setProperty(
      '--hub-bg-url', "url('assets/backgrounds/hub-forest.png')"
    );

    if (!_parallaxBound) {
      _bindParallax(hub);
      _parallaxBound = true;
    }

    _updateUser();
    _updateMenuSubs();
  }

  // ── Parallax ──────────────────────────────────────────────────────────────

  function _bindParallax(hub) {
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;

    hub.addEventListener('mousemove', (e) => {
      const r = hub.getBoundingClientRect();
      hub.style.setProperty('--mx', ((e.clientX - r.left) / r.width - 0.5).toFixed(4));
      hub.style.setProperty('--my', ((e.clientY - r.top) / r.height - 0.5).toFixed(4));
    }, { passive: true });

    hub.addEventListener('mouseleave', () => {
      hub.style.setProperty('--mx', '0');
      hub.style.setProperty('--my', '0');
    }, { passive: true });
  }

  // ── User info ─────────────────────────────────────────────────────────────

  function _updateUser() {
    const name = (typeof userNames !== 'undefined' && userNames[currentUserIndex]) || 'Jugador';
    const initial = name[0].toUpperCase();

    const nameEl    = document.getElementById('currentUserDisplay');
    const initEl    = document.getElementById('menuProfileInitial');

    if (nameEl)  nameEl.textContent  = name;
    if (initEl)  initEl.textContent  = initial;

    const imgEl  = document.getElementById('menuProfileImg');
    const avatar = typeof _getCurrentProfileAvatar === 'function' ? _getCurrentProfileAvatar() : '';
    if (imgEl) {
      if (avatar) { imgEl.src = avatar; imgEl.style.display = 'block'; }
      else        { imgEl.src = '';     imgEl.style.display = 'none'; }
    }
  }

  function _updateMenuSubs() {
    const topics = (typeof appData !== 'undefined' && appData?.topics) || [];

    // Historias count
    const historiasSub = document.getElementById('hubHistoriasSub');
    if (historiasSub && topics.length > 0) {
      historiasSub.textContent = `${topics.length} historia${topics.length !== 1 ? 's' : ''} activa${topics.length !== 1 ? 's' : ''}`;
    }

    // Personajes count
    const chars = (typeof appData !== 'undefined' && appData?.characters) || [];
    const personajesSub = document.getElementById('hubPersonajesSub');
    if (personajesSub && chars.length > 0) {
      personajesSub.textContent = `${chars.length} en galería`;
    }

    // Continuar: last topic
    const continueSub = document.getElementById('hubContinueSub');
    const continueBtn = document.querySelector('.hub-menu-item[data-action="continuar"]');
    if (topics.length > 0) {
      const last = topics[topics.length - 1];
      if (continueSub) continueSub.textContent = last.title ? last.title.substring(0, 30) : 'Retoma tu última escena';
      if (continueBtn) continueBtn.onclick = () => {
        if (typeof enterTopic === 'function') enterTopic(last.id);
        else if (typeof showSection === 'function') showSection('topics');
      };
    } else {
      if (continueSub) continueSub.textContent = 'Empieza tu primera historia';
      if (continueBtn) continueBtn.onclick = () => { if (typeof showSection === 'function') showSection('topics'); };
    }
  }

  // ── Theme toggle wrapper ──────────────────────────────────────────────────

  function hubToggleTheme() {
    if (typeof toggleTheme === 'function') toggleTheme();
  }

  // ── Public API ────────────────────────────────────────────────────────────

  window.initHub       = initHub;
  window.hubToggleTheme = hubToggleTheme;
  window.updateHubUser = _updateUser;

  // Re-sync user data when returning to menu
  window.addEventListener('etheria:section-changed', (e) => {
    if (e.detail?.section === 'mainMenu') {
      _updateUser();
      _updateMenuSubs();
    }
  });
})();
