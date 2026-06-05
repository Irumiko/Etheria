// Hub principal — datos de usuario y subtítulos dinámicos.
// El parallax y las capas celestiales son responsabilidad de hub-luna.js.
(function () {
  'use strict';

  // ── Init ─────────────────────────────────────────────────────────────────

  function initHub() {
    _updateUser();
    _updateMenuSubs();
  }

  // ── User info ─────────────────────────────────────────────────────────────

  function _updateUser() {
    const name = (typeof userNames !== 'undefined' && userNames[currentUserIndex]) || 'Jugador';
    const initial = name[0].toUpperCase();

    const nameEl  = document.getElementById('currentUserDisplay');
    const initEl  = document.getElementById('menuProfileInitial');

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
    const chars  = (typeof appData !== 'undefined' && appData?.characters) || [];

    // ── Continuar ──────────────────────────────────────────────────
    const continueSub = document.getElementById('hubContinueSub');
    const continueBtn = document.querySelector('.hub-menu-item[data-action="continuar"]');
    if (topics.length > 0) {
      const last  = topics[topics.length - 1];
      const title = last.title ? last.title.substring(0, 34) : null;
      if (continueSub) continueSub.textContent = title || 'Retoma el hilo de tu última historia';
      if (continueBtn) continueBtn.onclick = () => {
        // Re-lee appData en el momento del clic para evitar cierres sobre IDs obsoletos.
        // Si el último topic fue eliminado o el array se refrescó desde Supabase,
        // el ID capturado en el closure anterior ya no existe → caemos en showSection.
        const currentTopics = (typeof appData !== 'undefined' && Array.isArray(appData?.topics))
          ? appData.topics : [];
        const latest = currentTopics.length > 0
          ? currentTopics[currentTopics.length - 1] : null;
        if (latest?.id && typeof enterTopic === 'function') {
          enterTopic(latest.id);
        } else if (typeof showSection === 'function') {
          showSection('topics');
        }
      };
    } else {
      if (continueSub) continueSub.textContent = 'Tu primera historia aguarda ser escrita';
      if (continueBtn) continueBtn.onclick = () => { if (typeof showSection === 'function') showSection('topics'); };
    }

    // ── Personajes ────────────────────────────────────────────────
    const personajesSub = document.getElementById('hubPersonajesSub');
    if (personajesSub) {
      const n = chars.length;
      if (n === 0)      personajesSub.textContent = 'Ningún alma ha sido invocada aún';
      else if (n === 1) personajesSub.textContent = 'Un alma vive en tu galería';
      else if (n <= 5)  personajesSub.textContent = `${n} almas aguardan tu llamada`;
      else if (n <= 15) personajesSub.textContent = `${n} destinos entrelazados en tu historia`;
      else              personajesSub.textContent = `${n} almas convocadas desde las sombras`;
    }

    // ── Vínculos ──────────────────────────────────────────────────
    const bonds      = (typeof appData !== 'undefined' && Array.isArray(appData?.bonds))      ? appData.bonds      : [];
    const affinities = (typeof appData !== 'undefined' && Array.isArray(appData?.affinities)) ? appData.affinities : [];
    const vinculosSub = document.getElementById('hubVinculosSub');
    if (vinculosSub) {
      const total = bonds.length + affinities.length;
      if (total === 0)     vinculosSub.textContent = 'Los lazos del destino aún no se han forjado';
      else if (total <= 3) vinculosSub.textContent = `${total} lazos tejidos en el destino`;
      else if (total <= 9) vinculosSub.textContent = `${total} vínculos que resisten el paso del tiempo`;
      else                 vinculosSub.textContent = `${total} hilos que no deberían cortarse jamás`;
    }
  }

  // ── Public API ────────────────────────────────────────────────────────────

  window.initHub       = initHub;
  window.updateHubUser = _updateUser;

  // Re-sync user data when returning to menu
  window.addEventListener('etheria:section-changed', (e) => {
    if (e.detail?.section === 'mainMenu') {
      _updateUser();
      _updateMenuSubs();
    }
  });
})();
