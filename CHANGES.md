# Etheria V1 — Changelog

## V1 (2026-03-08)

Integración de dos módulos principales sobre la base de `Etheria_final`.

### Motor RPG de Escenas (RPGEngine v4) ✅

**Nuevos archivos:**
- `js/rpg/RPGEngine.js` — Motor principal que interpreta scripts JSON paso a paso
- `js/rpg/RPGRenderer.js` — Renderiza la UI de escenas narrativas (sin manipular DOM desde el motor)
- `js/rpg/RPGState.js` — Estado persistente del modo RPG por perfil de usuario
- `js/rpg/SceneLoader.js` — Carga y cachea escenas desde `js/scenes/`
- `js/rpg/SceneValidator.js` — Valida estructura de escenas JSON
- `js/scenes/_index.json` — Índice de escenas disponibles
- `js/scenes/forest_intro.json` — Escena de introducción al bosque
- `js/scenes/village_hub.json` — Escena del hub de aldea
- `css/rpg-scene.css` — Estilos propios del modo RPG

**Cambios en archivos existentes:**
- `js/app.js` — Añadida inicialización de `RPGState` y `RPGRenderer` en `initializeApp()`
- `build.js` — Añadido `rpg-scene.css` al bundle CSS y copia de JSONs de escenas a `dist/js/scenes/`
- `index.html` — Añadidos `<script>` de los 5 módulos RPG y `<link>` del CSS

### EventBus Audio (EventBus Audio v2) ✅

**Cambios en archivos existentes:**
- `js/core/events.js` — Añadido método `eventBus.once()` para suscripción de un solo disparo
- `js/ui/app-ui.js` — Audio migrado a `eventBus.emit('audio:*')` en lugar de llamadas directas
- `js/ui/navigation.js` — `stopRainSound`, `stopMenuMusic`, `startMenuMusic` → EventBus
- `js/ui/roleplay.js` — Affinities y música de menú → EventBus
- `js/ui/characters.js` — Música de menú en navegación de personajes → EventBus
- `js/rpg/RPGRenderer.js` — Sonidos de escena RPG delegados a EventBus (`audio:start-rain`, `audio:stop-rain`)

---

## Versiones anteriores

Ver `Etheria_final` → base del proyecto con sincronización Supabase, PWA optimizado y Service Worker mejorado.
