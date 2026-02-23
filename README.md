# Etheria

Aplicación web de rol/narrativa estilo visual novel.

## Estructura

- `index.html`: marcado principal (sin CSS/JS inline).
- `css/styles.css`: estilos globales.
- `js/main.js`: configuración global, estado y lógica base.
- `js/utils.js`: utilidades comunes (formateo, guardado, modales, helpers).
- `js/storage.js`: carga automática y selección de usuario.
- `js/ui.js`: navegación, galería, ficha de personaje, editor y ajustes.
- `js/vn.js`: lógica principal de visual novel, mensajes, opciones, ramas y temas.
- `assets/`: recursos estáticos (imágenes, iconos, etc.).

## Uso local

Como es una app estática, puedes abrir `index.html` directamente o usar un servidor local:

```bash
python3 -m http.server 4173 --bind 0.0.0.0
```

Luego visita `http://127.0.0.1:4173`.
