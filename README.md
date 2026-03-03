# Etheria

Proyecto web estático organizado para que sea fácil de mantener y desplegar en **GitHub Pages** y **Vercel**.

## Estructura

```text
etheria/
├── build.js
├── package.json
├── vercel.json
├── index.html
├── css/
│   ├── variables.css
│   ├── animations.css
│   ├── components.css
│   └── main.css
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


## Troubleshooting rápido

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
