# Etheria — Guía de arquitectura para Claude

PWA de roleplay/visual-novel con modo RPG (D&D-lite) y modo Clásico.
Stack: HTML/CSS/JS vanilla + Supabase (auth, realtime, storage). Sin framework de JS.
Deploy: Vercel sirve la carpeta `dist/` como raíz.

---

## Estructura de directorios

```
Etheria/
├── index.html          # HTML principal — carga todos los scripts
├── build.js            # Build manual: concatena CSS → dist/, inlinea JS → dist/index.html
├── sw.js               # Service Worker PWA
├── manifest.json       # PWA manifest
│
├── css/
│   ├── variables.css            # Tokens globales (CRÍTICO — cargado inline)
│   ├── critical/                # CSS inline en <head>: fonts, layout, theme, loading, a11y
│   ├── modules/
│   │   ├── 07-overrides.css    # 133KB — overrides globales de paleta + sección Historias
│   │   ├── 08-rpg-hud-hotfix.css
│   │   └── 09-vn-mode-menus.css
│   ├── sections/
│   │   └── topics.css          # Estancia aislada Historias — SIEMPRE ÚLTIMO en build
│   ├── features/
│   │   ├── vn/                 # Estilos Visual Novel
│   │   ├── menu/               # Estilos menú principal
│   │   ├── gallery/            # Galería de personajes
│   │   └── theme-menu/         # Selector de temas
│   ├── components.css          # 13.600+ líneas — componentes globales (pendiente dividir)
│   ├── menu-gamefeel.css       # Efectos del menú principal
│   └── options-gamefeel.css    # Efectos sección opciones
│
├── js/
│   ├── core/
│   │   ├── store.js            # Store reactivo mínimo (vnStore: topicId, charId, etc.)
│   │   └── events.js           # Bus de eventos global
│   ├── ui/
│   │   ├── vn.js               # 272KB — motor VN completo (entrada de topic, mensajes, sprites)
│   │   ├── topics.js           # 72KB — lista de historias, tarjetas tarot, CRUD topics
│   │   ├── sheets.js           # 60KB — fichas de personaje RPG
│   │   ├── app-ui.js           # 60KB — UI global: save/load, modal, theme, sync indicator
│   │   ├── roleplay.js         # 56KB — sistema afinidad, modo rol, selección personaje
│   │   ├── navigation.js       # 24KB — showSection, backToMenu, fadeTransition, galería
│   │   ├── journal.js          # 24KB — diario
│   │   ├── characters.js       # 28KB — editor de personajes, perfiles
│   │   ├── sounds.js           # 20KB — sistema de audio
│   │   ├── bonds-ui.js         # 20KB — vínculos entre personajes
│   │   ├── effects.js          # 12KB — lluvia, niebla, emotes, clima
│   │   ├── ui.js               # 12KB — tooltips, atajos de teclado, gestos táctiles
│   │   ├── utils-ui.js         # 8KB — formatText, escapeHtml, validaciones
│   │   ├── hub.js              # 8KB — menú principal, parallax, datos de usuario
│   │   ├── affinity-atmosphere.js  # 8KB — atmósfera según afinidad
│   │   ├── message-search.js   # 8KB — búsqueda de mensajes
│   │   └── ethy.js             # 4KB — mascota Ethy
│   ├── utils/
│   │   ├── supabaseClient.js   # Singleton global: window.supabaseClient
│   │   ├── supabaseAuthHeaders.js  # Construcción de headers JWT para fetch directo
│   │   ├── supabaseSync.js     # Sincronización bidireccional local↔cloud
│   │   ├── supabaseMessages.js # CRUD mensajes realtime
│   │   ├── supabasePresence.js # Presencia en tiempo real (canales Realtime)
│   │   ├── supabaseStories.js  # CRUD historias (usa fetch + CASCADE, no SDK)
│   │   ├── supabaseTurnNotifications.js
│   │   ├── supabaseProfiles.js, supabaseCharacters.js, supabaseBonds.js ...
│   │   ├── storage.js          # localStorage con migración automática
│   │   ├── state.js            # Estado global de sesión (userIndex, etc.)
│   │   └── logger.js, webVitals.js, pushNotifications.js
│   ├── rpg/
│   │   ├── RPGEngine.js        # Motor de reglas D&D-lite
│   │   ├── RPGRenderer.js      # Renderizado HUD RPG
│   │   ├── RPGState.js         # Estado de combate/sesión RPG
│   │   ├── SceneLoader.js      # Carga escenas JSON
│   │   └── SceneValidator.js
│   ├── config/
│   │   └── supabase.js         # URL y anon key (leídas de window.SUPABASE_CONFIG)
│   └── app.js                  # Punto de entrada canónico — boot, auth, init
│
├── assets/
│   ├── backgrounds/            # Fondos JPEG/PNG (menu, default, rpg, topics_night_sky)
│   ├── parallax/               # Capas de parallax (day/night, 3 layers cada uno)
│   ├── icons/                  # PWA icons (192, 512)
│   └── ui/                     # SVGs UI (ethy.svg)
│
├── dist/                       # Generado por build.js — Vercel sirve esto como raíz
│   ├── index.html              # HTML con CSS crítico inline + todos los JS inline
│   ├── etheria.html            # Idéntico a index.html (alias)
│   ├── noncritical.css         # CSS no crítico concatenado (cargado diferido)
│   ├── etheria.css             # CSS completo con sourcemap
│   ├── sw.js                   # Service Worker con cache-busting automático
│   └── assets/                 # Copia de assets/ estáticos
│
├── tests/                      # Node.js built-in test runner (node:test)
│   ├── supabaseModules.test.js # Tests Supabase utils con sandbox vm
│   ├── supabaseSync.test.js
│   ├── domIntegrity.test.js
│   └── ...
│
└── .github/workflows/ci.yml   # CI: tests + validate:build + build en cada push
```

---

## Build system

```bash
node build.js          # Genera dist/ completo
npm test               # Corre tests (Node built-in, sin framework)
npm run validate:build # Valida que dist/ esté bien generado
```

**Orden CSS crítico (inlined en `<head>`):**
variables → fonts-base → layout-shell → pwa → theme → loading → accessibility

**Orden CSS no crítico (dist/noncritical.css, cargado diferido):**
animations → mobile-perf → auth → components → menu → options → mascot →
rpg-scene → features/* → modules/07-overrides → modules/08 → modules/09 →
affinity-atmosphere → bonds → features.css → vn-cinematic → vn-themes →
menu-gamefeel → options-gamefeel → **sections/topics.css** ← SIEMPRE ÚLTIMO

**Path de assets en CSS source:** `../../assets/` (desde css/modules/ o css/sections/)
→ build.js reemplaza con `./assets/` en dist/noncritical.css automáticamente.

---

## Patrones de arquitectura

### Módulos JS (todos usan IIFE o scope de función)
No hay `import/export` — el código es vanilla ES5/ES6 con globals. Cada módulo
expone su API en `window.*`:
- `window.SupabaseMessages`, `window.SupabasePresence`, etc.
- `window.supabaseClient` — singleton Supabase (inicializado en supabaseClient.js)

### Store reactivo (vnStore)
`js/core/store.js` provee `createStore()`. El `vnStore` preinstanciado guarda
estado del VN: `topicId`, `selectedCharId`, `messageIndex`, `isTyping`, `weather`.
`vn.js` llama `syncVnStore({...})` cuando cambia cualquiera de esos valores.
Otros módulos pueden suscribirse con `vnStore.subscribe(callback)`.

### Estancias CSS aisladas (patrón "estancia")
Para evitar conflictos de cascada entre secciones, cada sección con estilos
propios tiene un archivo CSS en `css/sections/` cargado AL FINAL del build.
Todos los selectores van bajo `#sectionId .selector` → especificidad (1,1,0)
gana automáticamente a cualquier regla genérica (0,1,0) de otros archivos.

Ejemplo: `css/sections/topics.css` → todos los estilos bajo `#topicsSection`.

**Para añadir una nueva sección aislada:**
1. Crear `css/sections/nombre-seccion.css`
2. Añadir AL FINAL de `NON_CRITICAL_CSS_ORDER` en `build.js`
3. Usar `#sectionId .selector` para todos los estilos

### Supabase client pattern
`supabaseClient.js` crea el singleton. Los utils de Supabase usan `_getClient()`:
```js
function _getClient() {
    if (_client) return _client;
    _client = global.supabaseClient || supabase.createClient(url, key);
    return _client;
}
```
Siempre preferir `window.supabaseClient`. Si no está disponible, crea una
instancia local como fallback (raro en producción).

### Auth headers para fetch directo
Algunos utils (supabaseStories, supabaseMessages) usan `fetch` directo con la
API REST de Supabase en lugar del SDK, pasando JWT manual:
```js
const headers = await _writeHeaders(); // usa SupabaseAuthHeaders
const res = await fetch(`${SB_URL}/rest/v1/tabla?...`, { method: 'DELETE', headers });
```
Esto es intencional — permite más control sobre el comportamiento y evita
problemas de propagación de sesión del SDK en ciertos contextos.

---

## Estado de la deuda técnica

### ✅ Resuelto
- `legacy/interface.js` (3.130 líneas) — eliminado. 95/96 funciones ya estaban
  en js/ui/, la función única (isFanficMode) era código muerto.
- `js/legacy/vn-sprites.js` (3.205 líneas) — eliminado. No estaba cargado en
  ningún HTML; funciones absorbidas en vn.js.
- `js/ui/mejoras.js` (187 líneas) — eliminado. Funciones absorbidas en navigation.js.
- `app.js` (raíz, 17 líneas) — eliminado. Shim obsoleto; js/app.js ya se carga
  directamente desde index.html.
- CI: `.github/workflows/ci.yml` — npm test + validate:build + build en cada push.
- Tests: 18/18 pasan. Test de deleteStory corregido (usaba patrón SDK antiguo,
  la implementación usa fetch + CASCADE).

### 🟡 Pendiente — medio plazo
- `css/components.css` (13.624 líneas) — dividir en módulos por componente.
  La carpeta `css/modules/` ya existe con la estructura correcta.
- Globals window.* — ~60 globals activos. La mayoría son módulos API (ok).
  Los globals de estado (currentTopicId, etc.) ya se sincronizan con vnStore
  pero no lo usan como fuente de verdad todavía.
- `_cachedUserId` — varios módulos escriben en window._cachedUserId de forma
  independiente. Riesgo de inconsistencia si dos módulos lo hacen en paralelo.

### 🟢 Bajo riesgo — largo plazo
- Migrar build.js a Vite/esbuild (HMR en dev, tree-shaking real).
- `collab-guard.js` — revisar si RLS de Supabase puede reemplazar parte de
  la lógica defensiva.
- Añadir coverage de tests (actualmente 18 tests, cobertura parcial).

---

## Notas de CSS importantes

### El body tiene background-attachment: fixed
Esto crea una capa de compositor a nivel viewport. `backdrop-filter` puede
"ver" el fondo del body a través de `isolation: isolate`. Solución:
```css
body:has(#topicsSection.active) {
    background: [gradiente sólido] !important; /* elimina el landscape */
}
```

### Cascade fight entre menu-gamefeel.css y secciones
`menu-gamefeel.css` redefine `.btn-create-topic`, `.topic-filter-btn` etc. con
tonos ámbar sin `!important`. Como viene después en el build, gana por orden.
Solución: usar `#sectionId .selector` (especificidad más alta) en sections/*.css.

### Path de imágenes en noncritical.css compilado
Source: `url('../../assets/backgrounds/imagen.jpg')` → compiled: `url('./assets/backgrounds/imagen.jpg')`
El build.js hace el replace automáticamente. No cambiar la convención.
