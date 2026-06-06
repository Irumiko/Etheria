/* ============================================================
   ETHERIA · OPCIONES "Luna de Plata" — aspecto + feedback visual
   ------------------------------------------------------------
   Solo cablea el re-skin visual. Los handlers reales de lógica
   (updateFontSize, updateMasterVolume, toggleInstantText, etc.)
   viven en js/ui/app-ui.js y se llaman desde el HTML.
   La atmósfera usa EtheriaAtmosphere (atmosphere.js) como fuente
   de verdad compartida con el Hub.
   ============================================================ */
(function () {
  'use strict';

  function rng(seed){ var s=seed%2147483647; if(s<=0)s+=2147483646; return function(){ return (s=(s*16807)%2147483647)/2147483647; }; }

  function buildStars(host, n, seed){
    var r=rng(seed);
    for(var i=0;i<n;i++){
      var star=document.createElement('span'); star.className='star';
      var sz=0.6+r()*1.8;
      star.style.left=(r()*100)+'%'; star.style.top=(r()*100)+'%';
      star.style.width=sz+'px'; star.style.height=sz+'px';
      star.style.opacity=0.4+r()*0.5;
      star.style.setProperty('--dur',(4+r()*5)+'s');
      star.style.setProperty('--del',(r()*5)+'s');
      host.appendChild(star);
    }
    // mini constelaciones decorativas en esquinas
    var ns='http://www.w3.org/2000/svg';
    [['8%','66%',7],['12%','16%',13]].forEach(function(cfg){
      var top=cfg[0], left=cfg[1], seed2=cfg[2];
      var r2=rng(seed2);
      var svg=document.createElementNS(ns,'svg');
      svg.setAttribute('width',60); svg.setAttribute('height',40); svg.setAttribute('viewBox','0 0 60 40');
      svg.style.cssText='position:absolute;top:'+top+';left:'+left+';opacity:.4;overflow:visible';
      var prev=null;
      for(var j=0;j<4;j++){
        var x=6+r2()*48, y=4+r2()*32;
        if(prev){
          var ln=document.createElementNS(ns,'line');
          ln.setAttribute('x1',prev[0]); ln.setAttribute('y1',prev[1]); ln.setAttribute('x2',x); ln.setAttribute('y2',y);
          ln.setAttribute('stroke','#cbb6ff'); ln.setAttribute('stroke-width','0.4'); ln.setAttribute('opacity','0.5');
          svg.appendChild(ln);
        }
        var c=document.createElementNS(ns,'circle'); c.setAttribute('cx',x); c.setAttribute('cy',y); c.setAttribute('r',1); c.setAttribute('fill','#fff'); svg.appendChild(c);
        prev=[x,y];
      }
      host.appendChild(svg);
    });
  }

  function switchTab(name, root){
    root.querySelectorAll('.opt-tab').forEach(function(t){
      var on=t.dataset.tab===name; t.classList.toggle('active',on); t.setAttribute('aria-selected',on);
    });
    root.querySelectorAll('.opt-pane').forEach(function(p){
      p.classList.toggle('active', p.dataset.pane===name);
    });
  }

  function bindSlider(input, root){
    var out=input.parentElement.querySelector('.opt-slideval');
    var fmt=input.dataset.fmt||'';
    function sync(){
      var min=+input.min||0, max=+input.max||100;
      var pct=((input.value-min)/(max-min))*100;
      input.style.setProperty('--fill',pct+'%');
      if(out){
        if(fmt==='px') out.textContent=input.value+'px';
        else if(fmt==='pct') out.textContent=input.value+'%';
        else if(fmt==='s') out.textContent=input.value+'s';
        else if(fmt==='speed'){ var v=+input.value; out.textContent=v<=20?'Instantáneo':v<45?'Rápida':v<75?'Normal':'Pausada'; }
        else out.textContent=input.value;
      }
      // efecto en preview de fuente
      if(input.dataset.preview==='font'){
        var pv=root.querySelector('.opt-preview-text');
        if(pv) pv.style.fontSize=input.value+'px';
      }
    }
    input.addEventListener('input', sync); sync();
  }

  // ── Atmósfera ─────────────────────────────────────────────
  // Aplica la clase amb-* en #optionsSection (para el CSS de estancia)
  // y delega en EtheriaAtmosphere para la fuente de verdad global.
  function applyAtmosphereToOpts(root, name){
    ['amanecer','mediodia','atardecer','noche'].forEach(function(a){ root.classList.remove('amb-'+a); });
    root.classList.add('amb-'+name);
    // resalta el swatch activo
    root.querySelectorAll('[data-atmosphere]').forEach(function(b){
      b.classList.toggle('active', b.dataset.atmosphere===name);
    });
  }

  function setAtmosphere(name, root){
    // fuente de verdad global → emite evento que sincroniza el Hub
    if(window.EtheriaAtmosphere){
      window.EtheriaAtmosphere.set(name);
    } else {
      applyAtmosphereToOpts(root, name);
    }
  }

  function setFilter(name, btn, root){
    var pv=root.querySelector('.opt-preview');
    if(pv){ pv.classList.remove('f-sepia','f-bw','f-cinematic'); if(name!=='none') pv.classList.add('f-'+name); }
    btn.parentElement.querySelectorAll('.opt-swatch').forEach(function(s){ s.classList.toggle('active',s===btn); });
  }

  function init(){
    var root=document.getElementById('optionsSection');
    if(!root) return;

    // marcar como re-skin Luna (activa el CSS de estancia)
    root.classList.add('cel-opt');

    // campo de estrellas (solo si no se ha poblado antes)
    var stars=root.querySelector('.cel-stars');
    if(stars && !stars.childElementCount) buildStars(stars, 90, 7);

    // tabs
    root.querySelectorAll('.opt-tab').forEach(function(t){
      t.addEventListener('click', function(){ switchTab(t.dataset.tab, root); });
    });

    // sliders visuales
    root.querySelectorAll('input[type=range].opt-slider').forEach(function(inp){
      bindSlider(inp, root);
    });

    // swatches de atmósfera — conectados al estado global
    root.querySelectorAll('[data-atmosphere]').forEach(function(b){
      b.addEventListener('click', function(){ setAtmosphere(b.dataset.atmosphere, root); });
    });

    // swatches de filtro de escena
    root.querySelectorAll('[data-filter]').forEach(function(b){
      b.addEventListener('click', function(){ setFilter(b.dataset.filter, b, root); });
    });

    // sincronizar atmósfera inicial con la fuente de verdad global
    var current = (window.EtheriaAtmosphere && window.EtheriaAtmosphere.get()) || 'noche';
    applyAtmosphereToOpts(root, current);

    // escuchar cambios del Hub (o de cualquier otra fuente)
    if(window.eventBus){
      window.eventBus.on('settings:atmosphere-changed', function(value){
        applyAtmosphereToOpts(root, value);
      });
    }
  }

  window.OptLuna = { init: init };

  // Inicializar en DOMContentLoaded (sin bloquear) y de nuevo cada vez
  // que se muestra la sección (para el estado de atmósfera siempre fresco).
  if(document.readyState!=='loading') init();
  else document.addEventListener('DOMContentLoaded', init);

  window.addEventListener('etheria:section-changed', function(e){
    if(e && e.detail && e.detail.section === 'options') init();
  });
})();
