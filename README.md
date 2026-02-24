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
│   │   └── interface.js
│   ├── features/
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

En `index.html` los scripts se cargan en este orden para evitar errores de variables no definidas:

1. `js/utils/state.js`
2. `js/utils/storage.js`
3. `js/ui/interface.js`
4. `js/app.js`

## Nota para mantenimiento

- Si editas estilos, normalmente toca `css/components.css`.
- Si cambias constantes/estado global, toca `js/utils/state.js`.
- Si cambias guardado/carga, toca `js/utils/storage.js`.
- Si cambias menús/UI, toca `js/ui/interface.js`.
- Si cambias inicio de app, toca `js/app.js`.
