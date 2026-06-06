/* ============================================================
   ETHERIA · HUB "LUNA DE PLATA" — generación + parallax
   ------------------------------------------------------------
   Vanilla, sin dependencias. En el repo: copiar como
   js/ui/hub-luna.js y llamar HubLuna.init() cuando se muestre
   el menú. El parallax reaprovecha el mismo patrón --mx/--my
   que ya usa js/ui/hub.js (puedes fusionarlos).
   ============================================================ */
(function () {
  'use strict';

  // PRNG determinista — el cielo es estable entre recargas.
  function rng(seed) {
    let s = seed % 2147483647;
    if (s <= 0) s += 2147483646;
    return () => (s = (s * 16807) % 2147483647) / 2147483647;
  }

  // ── Campo de estrellas ──────────────────────────────────
  function buildStars(host) {
    const layers = [
      { n: 70, sz: [0.6, 1.2], op: 0.55, dur: 5 },
      { n: 45, sz: [0.9, 1.8], op: 0.8, dur: 7 },
      { n: 22, sz: [1.4, 2.6], op: 1, dur: 9 },
    ];
    const pds = [3, 6, 10];
    layers.forEach((cfg, li) => {
      const layer = document.createElement('div');
      layer.style.cssText = 'position:absolute;inset:0;';
      layer.setAttribute('data-pd', pds[li]);
      const r = rng(7 + li * 101);
      for (let i = 0; i < cfg.n; i++) {
        const s = document.createElement('span');
        s.className = 'star';
        const sz = cfg.sz[0] + r() * (cfg.sz[1] - cfg.sz[0]);
        s.style.left = (r() * 100) + '%';
        s.style.top = (r() * 72) + '%';
        s.style.width = sz + 'px';
        s.style.height = sz + 'px';
        s.style.opacity = cfg.op * (0.5 + r() * 0.5);
        s.style.setProperty('--dur', cfg.dur + 's');
        s.style.setProperty('--del', (r() * cfg.dur) + 's');
        layer.appendChild(s);
      }
      host.appendChild(layer);
    });
    // estrellas brillantes con destello en cruz
    const bright = document.createElement('div');
    bright.style.cssText = 'position:absolute;inset:0;';
    bright.setAttribute('data-pd', 8);
    const rb = rng(999);
    for (let i = 0; i < 7; i++) {
      const sz = 2.4 + rb() * 2.2;
      const b = document.createElement('div');
      b.className = 'star-bright';
      b.style.left = (6 + rb() * 88) + '%';
      b.style.top = (4 + rb() * 54) + '%';
      b.innerHTML =
        '<span class="dot" style="width:' + sz + 'px;height:' + sz + 'px"></span>' +
        '<span class="gx" style="width:' + (sz * 6) + 'px;height:1px"></span>' +
        '<span class="gy" style="width:1px;height:' + (sz * 6) + 'px"></span>';
      bright.appendChild(b);
    }
    host.appendChild(bright);
  }

  // ── Constelaciones ──────────────────────────────────────
  var CONSTELLATIONS = [
    { top: '9%', left: '60%', scale: 1.0,
      nodes: [[0,18,1.8],[16,8,1.4],[34,16,2.6],[52,4,1.4],[62,22,1.6],[44,34,1.3],[28,40,1.2]],
      edges: [[0,1],[1,2],[2,3],[3,4],[2,5],[5,6]] },
    { top: '13%', left: '14%', scale: 0.85,
      nodes: [[4,4,1.4],[22,12,2.4],[40,6,1.3],[30,26,1.5],[14,30,1.2]],
      edges: [[0,1],[1,2],[1,3],[3,4]] },
    { top: '30%', left: '78%', scale: 0.8,
      nodes: [[2,2,1.3],[18,10,1.6],[10,24,2.2],[26,30,1.3]],
      edges: [[0,1],[1,2],[2,3]] },
  ];
  var SVGNS = 'http://www.w3.org/2000/svg';

  function buildConstellations(host) {
    CONSTELLATIONS.forEach(function (c, ci) {
      var w = 72 * c.scale, h = 48 * c.scale;
      var svg = document.createElementNS(SVGNS, 'svg');
      svg.setAttribute('width', w); svg.setAttribute('height', h);
      svg.setAttribute('viewBox', '0 0 72 48');
      svg.style.top = c.top; svg.style.left = c.left;
      svg.style.animation = 'cel-constShimmer ' + (7 + ci * 2) + 's ease-in-out ' + ci + 's infinite';
      var g = document.createElementNS(SVGNS, 'g');
      c.edges.forEach(function (e, i) {
        var ln = document.createElementNS(SVGNS, 'line');
        ln.setAttribute('x1', c.nodes[e[0]][0]); ln.setAttribute('y1', c.nodes[e[0]][1]);
        ln.setAttribute('x2', c.nodes[e[1]][0]); ln.setAttribute('y2', c.nodes[e[1]][1]);
        ln.setAttribute('class', 'c-line');
        ln.style.animationDelay = (0.3 + ci * 0.3) + 's';
        g.appendChild(ln);
      });
      svg.appendChild(g);
      c.nodes.forEach(function (n) {
        var halo = document.createElementNS(SVGNS, 'circle');
        halo.setAttribute('cx', n[0]); halo.setAttribute('cy', n[1]); halo.setAttribute('r', n[2] + 1.4);
        halo.setAttribute('class', 'c-node-h'); svg.appendChild(halo);
        var dot = document.createElementNS(SVGNS, 'circle');
        dot.setAttribute('cx', n[0]); dot.setAttribute('cy', n[1]); dot.setAttribute('r', n[2]);
        dot.setAttribute('class', 'c-node'); svg.appendChild(dot);
      });
      host.appendChild(svg);
    });
  }

  // ── Motas ascendentes ───────────────────────────────────
  function buildMotes(host, count) {
    var r = rng(404);
    for (var i = 0; i < count; i++) {
      var m = document.createElement('div');
      m.className = 'mote';
      var sz = 1.5 + r() * 2.5;
      m.style.left = (r() * 100) + '%';
      m.style.width = sz + 'px'; m.style.height = sz + 'px';
      m.style.setProperty('--dur', (14 + r() * 16) + 's');
      m.style.setProperty('--del', (-r() * 30) + 's');
      m.style.setProperty('--drift', ((r() - 0.5) * 60) + 'px');
      host.appendChild(m);
    }
  }

  // ── Espina de constelación del menú ─────────────────────
  function buildSpine(container) {
    var items = container.querySelectorAll('.hub-menu-item');
    if (!items.length) return;
    var svg = container.querySelector('.cel-spine');
    if (!svg) return;
    var H = container.offsetHeight;
    svg.setAttribute('viewBox', '0 0 30 ' + H);
    var ys = [];
    items.forEach(function (it) { ys.push(it.offsetTop + it.offsetHeight / 2); });
    var ns = 'http://www.w3.org/2000/svg';
    var line = document.createElementNS(ns, 'line');
    line.setAttribute('x1', 15); line.setAttribute('y1', ys[0]);
    line.setAttribute('x2', 15); line.setAttribute('y2', ys[ys.length - 1]);
    line.setAttribute('class', 'spine-line');
    svg.appendChild(line);
    ys.forEach(function (y, i) {
      var active = items[i].classList.contains('primary');
      if (active) {
        var glow = document.createElementNS(ns, 'circle');
        glow.setAttribute('cx', 15); glow.setAttribute('cy', y); glow.setAttribute('r', 7);
        glow.setAttribute('class', 'spine-glow'); svg.appendChild(glow);
      }
      var star = document.createElementNS(ns, 'path');
      star.setAttribute('d', 'M0 -5 L1.3 -1.3 L5 0 L1.3 1.3 L0 5 L-1.3 1.3 L-5 0 L-1.3 -1.3 Z');
      star.setAttribute('transform', 'translate(15 ' + y + ')');
      star.setAttribute('class', 'spine-node');
      star.setAttribute('fill', active ? '#f4d98a' : '#b794f6');
      if (active) star.style.filter = 'drop-shadow(0 0 6px #e8c878)';
      svg.appendChild(star);
      var core = document.createElementNS(ns, 'circle');
      core.setAttribute('cx', 15); core.setAttribute('cy', y); core.setAttribute('r', 1.4);
      core.setAttribute('class', 'spine-core'); svg.appendChild(core);
    });
  }

  // ── Parallax (mismo patrón que js/ui/hub.js) ────────────
  function bindParallax(hub) {
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    var raf = null;
    hub.addEventListener('mousemove', function (e) {
      var r = hub.getBoundingClientRect();
      var mx = ((e.clientX - r.left) / r.width - 0.5);
      var my = ((e.clientY - r.top) / r.height - 0.5);
      if (raf) cancelAnimationFrame(raf);
      raf = requestAnimationFrame(function () {
        hub.style.setProperty('--mx', mx.toFixed(4));
        hub.style.setProperty('--my', my.toFixed(4));
      });
    }, { passive: true });
    hub.addEventListener('mouseleave', function () {
      hub.style.setProperty('--mx', '0');
      hub.style.setProperty('--my', '0');
    }, { passive: true });
  }

  // ── Ciclo de atmósferas ─────────────────────────────────
  var AMB_ORDER = ['amanecer', 'mediodia', 'atardecer', 'noche'];
  var AMB_LABEL = { amanecer: 'Amanecer', mediodia: 'Mediodía', atardecer: 'Atardecer', noche: 'Noche' };
  var AMB_ICON = {
    amanecer: '<path d="M3 15h14M10 5v2M5.5 8l1 1M14.5 8l-1 1M7 15a3 3 0 016 0" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/><path d="M8.4 4.2L10 2.6l1.6 1.6" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>',
    mediodia: '<circle cx="10" cy="10" r="3.4" stroke="currentColor" stroke-width="1.5"/><path d="M10 2.5v2M10 15.5v2M2.5 10h2M15.5 10h2M4.7 4.7l1.4 1.4M13.9 13.9l1.4 1.4M4.7 15.3l1.4-1.4M13.9 6.1l1.4-1.4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>',
    atardecer: '<path d="M3 15h14M10 5v2M5.5 8l1 1M14.5 8l-1 1M7 15a3 3 0 016 0" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/><path d="M8.4 6.4L10 8l1.6-1.6" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>',
    noche: '<path d="M16 11.5A6 6 0 018.5 4 6 6 0 1016 11.5z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/>'
  };

  function applyAtmosphereToHub(hub, name) {
    AMB_ORDER.forEach(function (a) { hub.classList.remove('amb-' + a); });
    hub.classList.add('amb-' + name);
    var btn = hub.querySelector('#ambCycleBtn');
    if (btn) {
      var ico = btn.querySelector('.amb-ico');
      if (ico) ico.innerHTML = AMB_ICON[name];
      btn.title = AMB_LABEL[name];
      btn.setAttribute('aria-label', 'Atmósfera: ' + AMB_LABEL[name]);
    }
  }

  function bindAmbCycle(hub) {
    var btn = hub.querySelector('#ambCycleBtn');
    if (!btn) return;
    // listen to global atmosphere changes (from Options or other panels)
    if (window.eventBus) {
      window.eventBus.on('settings:atmosphere-changed', function (value) {
        applyAtmosphereToHub(hub, value);
      });
    }
    // apply current state from EtheriaAtmosphere (set by atmosphere.js on body)
    var current = (window.EtheriaAtmosphere && window.EtheriaAtmosphere.get()) || 'noche';
    applyAtmosphereToHub(hub, current);
    btn.addEventListener('click', function () {
      if (window.EtheriaAtmosphere) {
        window.EtheriaAtmosphere.cycle();
      } else {
        var idx = AMB_ORDER.indexOf(current);
        current = AMB_ORDER[(idx + 1) % AMB_ORDER.length];
        applyAtmosphereToHub(hub, current);
      }
    });
  }

  function init() {
    var hub = document.getElementById('mainMenu');
    if (!hub || hub.dataset.celReady) return;
    hub.dataset.celReady = '1';

    var stars = hub.querySelector('.cel-stars');
    var cons = hub.querySelector('.cel-constellations');
    var motes = hub.querySelector('.cel-motes');
    var menu = hub.querySelector('.menu-container');

    if (stars) buildStars(stars);
    if (cons) buildConstellations(cons);
    if (motes) buildMotes(motes, 16);
    if (menu) buildSpine(menu);
    bindParallax(hub);
    bindAmbCycle(hub);
  }

  // Separate spine init — depends on offsetHeight, needs visible element.
  function initSpine() {
    var hub = document.getElementById('mainMenu');
    if (!hub) return;
    var menu = hub.querySelector('.menu-container');
    var spine = menu && menu.querySelector('.cel-spine');
    if (!spine) return;
    while (spine.firstChild) spine.removeChild(spine.firstChild);
    buildSpine(menu);
  }

  window.HubLuna = { init: init, initSpine: initSpine };

  // Auto-init en carga inicial (mainMenu puede estar visible sin section-changed)
  if (document.readyState !== 'loading') { init(); }
  else { document.addEventListener('DOMContentLoaded', init); }

  // On section change: full init first time, rebuild spine on subsequent visits.
  window.addEventListener('etheria:section-changed', function (e) {
    if (!e || !e.detail || e.detail.section !== 'mainMenu') return;
    var hub = document.getElementById('mainMenu');
    if (!hub) return;
    if (!hub.dataset.celReady) { init(); } else { initSpine(); }
  });

})();
