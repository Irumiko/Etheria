# Etheria

Proyecto web estático organizado para que sea fácil de mantener y desplegar en **GitHub Pages** y **Vercel**.

## Estructura

La estructura activa del proyecto queda concentrada en unos pocos puntos claros:

- `index.html`: shell principal y orden de carga.
- `js/app.js`: arranque de la app.
- `js/ui/`: UI y pantallas.
- `js/utils/`: persistencia, Supabase, logging y helpers compartidos.
- `js/core/`: estado/eventos base.
- `css/critical*` + `css/non-critical.css`: punto de entrada de estilos.
- `dist/`: salida generada del build.

Todo lo que no pertenezca a esos puntos debería ser o bien un artefacto generado, o bien un archivo legacy/documental.

```text
etheria/
├── build.js
├── package.json
├── vercel.json
├── index.html
├── css/
│   ├── critical.css
│   ├── non-critical.css
│   ├── modules/
│   │   ├── 01-tokens.css
│   │   ├── 02-motion.css
│   │   ├── 03-foundation.css
│   │   ├── 04-components.css
│   │   ├── 05-navigation.css
│   │   ├── 06-experience.css
│   │   └── 07-overrides.css
│   └── ...
├── js/
│   ├── utils/
│   │   ├── state.js
│   │   └── storage.js
│   ├── ui/
│   │   ├── vn.js
│   │   ├── topics.js
│   │   ├── app-ui.js
│   │   └── mejoras.js
│   └── app.js
├── assets/
├── scripts/
├── tests/
├── supabase/
├── legacy/
└── dist/
```

## Cómo ejecutar en local

```bash
python3 -m http.server 8000
```

Luego abre: `http://localhost:8000`

## Build de distribución (archivo único)

```bash
npm run build
```

Validación automática post-build:

```bash
npm run validate:build
npm run validate:critical-size
```

Esto genera:
- `dist/index.html` (entrada estándar para hosting)
- `dist/etheria.html` (copia con nombre alternativo)

## Compatibilidad de despliegue

### GitHub Pages
- Usa `index.html` en raíz (ya está listo).
- Si quieres publicar versión build, puedes subir el contenido de `dist/` a la rama/página que uses para deploy.

### Vercel
- `vercel.json` ya define:
  - `buildCommand: npm run build`
  - `outputDirectory: dist`
- Vercel publicará `dist/index.html` automáticamente.

## Orden de carga de scripts

En `index.html` los scripts se cargan en este orden (resumen):

1. Estado/base: `js/utils/state.js`, `js/core/store.js`, `js/core/events.js`, `js/utils/storage.js`
2. UI base: `js/ui/sounds.js`, `js/ui/ui.js`, `js/ui/effects.js`, `js/ui/utils-ui.js`
3. Módulos de juego: `js/ui/roleplay.js`, `js/ui/characters.js`, `js/ui/navigation.js`, `js/ui/sheets.js`
4. Realtime: `js/utils/supabaseClient.js`, `js/utils/supabaseMessages.js`
5. VN y pantallas: `js/ui/vn.js`, `js/ui/journal.js`, `js/ui/topics.js`, `js/ui/app-ui.js`
6. Arranque y mejoras: `js/app.js`, `js/ui/mejoras.js`

## Nota para mantenimiento

- Si editas estilos, normalmente toca `css/components.css`.
- Si cambias constantes/estado global, toca `js/utils/state.js`.
- Si cambias guardado/carga, toca `js/utils/storage.js`.
- Si cambias menús/UI, revisa módulos dentro de `js/ui/` (ej: `topics.js`, `vn.js`, `app-ui.js`).
- Si cambias inicio de app, toca `js/app.js`.
- Evita crear archivos espejo en la raíz si ya existe una versión canónica dentro de `js/` o `css/`.
- Los archivos raíz `app.js`, `ui.js` y `sheets.js` se mantienen solo como capas de compatibilidad que redirigen a sus equivalentes canónicos en `js/`.
- Considera `dist/` como salida generada: si aparece un archivo ahí que no sale del build actual, probablemente es residuo y conviene eliminarlo.

## Requisitos de colaboración con Supabase

Para que las salas colaborativas funcionen de forma segura (sin cambiar el flujo cliente actual), la tabla `messages` en Supabase debe mantener **RLS habilitado** y policies activas para:

- `SELECT` (lectura de mensajes de sala)
- `INSERT` (envío de mensajes)

> Importante: este repositorio **no** incluye claves privadas ni crea policies automáticamente. La configuración de RLS/policies debe realizarse en el proyecto de Supabase.


## ETHERIA — Guía de 5 minutos

1. **Crear perfil**: elige slot, pon nombre y entra.
2. **Crear personaje (opcional)**: Galería → Nuevo.
3. **Elegir modo**:
   - Clásico: puro texto.
   - RPG: stats, oráculo, consecuencias.
4. **Jugar**:
   - Tap/click para avanzar.
   - Swipe en móvil o flechas en PC.
   - 💬 para responder.
5. **Oráculo (RPG)**:
   - Activa “Preguntar al destino”.
   - Elige stat, revisa % y envía.
   - El resultado afecta al **siguiente** mensaje.
6. **Compartir**:
   - Menú → Código de 6 letras o QR.

## Documentación técnica rápida

### Arquitectura de datos
- Perfil → `localStorage` (particionado por usuario).
- Mensajes → `localStorage` + Supabase Realtime.
- Sync/backup → JSONBin + resolución de conflicto.
- Assets → lazy loading con `IntersectionObserver`.

### Puntos de extensión
- Nuevos stats: `RPG_BASE_STATS`.
- Nuevos climas: `setWeather()`.
- Nuevos emotes: `emoteConfig`.


### Extras recientes
- Grafo de relaciones por historia (constelación de afinidades).
- Demo cargable: **La Última Carta**.
- Oráculo RPG con consecuencia narrativa en el siguiente mensaje de narrador.
- Flujo de escena por relevos: pensado para partidas tipo foro, con turnos ligeros entre 2 o más participantes sin exigir combate táctico.
- DC narrativa variable: el Oráculo ya no es plana, sino que reacciona a la tensión acumulada del personaje en escena.
- Tensión crítica en vez de death saves: si una escena te sobrepasa quedas fuera de foco unos relevos, sin subsistema extra de 3 fallos.
- Sin capa táctica pesada: no se centraliza en armas, armaduras o listas de skills; la resolución sigue apoyándose en texto, clase y tensión de escena.


## Troubleshooting rápido

## PWA Mode (iOS/Android)

- Etheria añade helpers para modo instalado:
  - viewport dinámico (`js/pwa-viewport.js`)
  - protección de gestos de borde (`js/pwa-gestures.js`)
  - ciclo de vida y backup periódico (`js/pwa-lifecycle.js`)
  - capacidades (`js/pwa-capabilities.js`)
- iOS específico:
  - si ves saltos de altura, cierra/reabre la app instalada para re-hidratar `visualViewport`.
  - asegúrate de usar “Añadir a pantalla de inicio” (Safari) para activar `display-mode: standalone`.
  - en modo ahorro extremo, `wakeLock` puede no estar disponible (degrada sin romper).

### Decisión de CSS crítico

- **Crítico**: shell funcional (tokens, tipografía base, layout inicial, safe-area, accesibilidad).
- **No crítico**: animaciones, componentes ricos, auth, menú, opciones, mascot y estilos de experiencia.
- Objetivo: reducir LCP bloqueante y mantener funcionalidad mínima visible en primer paint.

### ¿`dist/etheria.html` parece truncado?

Si ves el archivo cortado en mitad de una línea JS (por ejemplo cerca de `wordsFastMode ? (text.match(...)`), normalmente fue una copia/descarga parcial. Verifica así:

```bash
wc -c dist/etheria.html dist/index.html
tail -n 5 dist/etheria.html
```

Salida esperada aproximada (build actual):
- `dist/etheria.html` ≈ **553 KB**
- `dist/index.html` ≈ **553 KB**
- el archivo debe terminar con `</body>` y `</html>`.

Si no coincide, regenera:

```bash
npm run build
```

### Features visibles que deben existir tras build

- FAB móvil VN: `#vnMobileFabNav`
- Drawer handle: `#replyDrawerHandle`
- Lazy sprites: `queueSpriteImageLoad()` + `IntersectionObserver`
- Código de historia + QR: `exportCurrentStoryAsCode()` y modal `#storyCodeModal`
