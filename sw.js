// ================================================================
// ETHERIA — Service Worker (sw.js)
// Estrategia: Cache First para estáticos, Network First para el shell.
//
// VERSIÓN: incrementar CACHE_NAME al desplegar cambios para forzar
// que los clientes descarten la caché vieja y descarguen la nueva.
// ================================================================

const CACHE_NAME = 'etheria-v1';

// Archivos que se precargan al instalar el SW.
// Al estar todo en dist/index.html, la lista es corta:
// el HTML ya incluye CSS + JS inlineados.
const PRECACHE_URLS = [
  './',
  './index.html',
  './manifest.json',
  './assets/icons/icon-192.png',
  './assets/icons/icon-512.png',
  './assets/backgrounds/default_background.jpg',
];

// ── INSTALL ──────────────────────────────────────────────────────
// Descarga y guarda en caché todos los recursos esenciales.
// El SW no toma control hasta que todos estén guardados.
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting())  // Activa inmediatamente sin esperar
  );
});

// ── ACTIVATE ─────────────────────────────────────────────────────
// Limpia versiones antiguas de la caché al activar una nueva versión.
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((cacheNames) =>
        Promise.all(
          cacheNames
            .filter((name) => name !== CACHE_NAME)
            .map((name) => caches.delete(name))
        )
      )
      .then(() => self.clients.claim())  // Toma control de todas las pestañas
  );
});

// ── FETCH ─────────────────────────────────────────────────────────
// Cache First para peticiones de navegación y estáticos locales.
// Network Only para peticiones externas (Supabase, Google Fonts, etc.)
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Ignorar: WebSockets, extensiones de Chrome, peticiones no-GET
  if (event.request.method !== 'GET') return;
  if (url.protocol === 'chrome-extension:') return;
  if (url.protocol === 'ws:' || url.protocol === 'wss:') return;

  // Ignorar peticiones externas (Supabase, Google Fonts, APIs)
  // Solo gestionamos recursos del mismo origen
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    caches.match(event.request)
      .then((cachedResponse) => {
        // Cache hit → devolver inmediatamente
        if (cachedResponse) return cachedResponse;

        // Cache miss → ir a red y guardar en caché para próximas veces
        return fetch(event.request)
          .then((networkResponse) => {
            // Solo cachear respuestas válidas (200 OK, tipo básico)
            if (
              !networkResponse ||
              networkResponse.status !== 200 ||
              networkResponse.type === 'error'
            ) {
              return networkResponse;
            }

            // Guardar copia en caché
            const responseToCache = networkResponse.clone();
            caches.open(CACHE_NAME)
              .then((cache) => cache.put(event.request, responseToCache));

            return networkResponse;
          })
          .catch(() => {
            // Sin red y sin caché: para peticiones de navegación, devolver el shell
            if (event.request.mode === 'navigate') {
              return caches.match('./index.html');
            }
            // Para otros recursos, simplemente falla silenciosamente
          });
      })
  );
});
