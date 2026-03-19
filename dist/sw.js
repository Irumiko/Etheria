// ================================================================
// ETHERIA — Service Worker
// Versión auto-generada por build.js (no editar manualmente)
// ================================================================
// Estrategia por tipo de recurso:
//   HTML  → Network First + fallback caché
//   JS/CSS/assets → Stale While Revalidate
//   Externo (Supabase, Fonts) → nunca cacheado
// ================================================================

// La versión se inyecta automáticamente por build.js en cada deploy.
const CACHE_VERSION = '9a5c7932';
const CACHE_NAME    = `etheria-${CACHE_VERSION}`;
const IMAGE_CACHE   = `etheria-images-${CACHE_VERSION}`;
const CACHE_PREFIXES_TO_CLEAN = ['etheria-', 'etheria-images-'];

// Archivos que se precargan al instalar el SW.
const PRECACHE_URLS = [
  './',
  './index.html',
  './manifest.json',
  './assets/icons/icon-192.png',
  './assets/icons/icon-512.png',
  './assets/backgrounds/default_background.jpg',
  './assets/backgrounds/menu_background.jpg',
  // Scripts críticos para funcionamiento offline
  './js/core/events.js',
  './js/utils/state.js',
  './js/utils/storage.js',
  './js/utils/logger.js',
  './js/ui/sounds.js',
  './js/ui/vn.js',
  './js/ui/roleplay.js',
  './js/ui/sheets.js',
  './js/app.js',
  './css/main.css',
  './css/components.css',
];

// ── INSTALL ─────────────────────────────────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting())
      .catch((err) => {
        console.warn('[SW] Precache parcial fallido:', err);
        return self.skipWaiting();
      })
  );
});

// ── ACTIVATE ────────────────────────────────────────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((cacheNames) =>
        Promise.all(
          cacheNames
            .filter((name) => {
              const isManaged = CACHE_PREFIXES_TO_CLEAN.some((prefix) => name.startsWith(prefix));
              return isManaged && name !== CACHE_NAME && name !== IMAGE_CACHE;
            })
            .map((name) => {
              console.log('[SW] Eliminando caché antigua:', name);
              return caches.delete(name);
            })
        )
      )
      .then(() => self.clients.claim())
      .then(() => self.clients.matchAll({ includeUncontrolled: true }))
      .then((clients) => {
        clients.forEach((client) => client.postMessage({ type: 'SW_UPDATED', version: CACHE_VERSION }));
      })
  );
});

// ── MESSAGE ─────────────────────────────────────────────────────
self.addEventListener('message', (event) => {
  if (event.data === 'skipWaiting') {
    self.skipWaiting();
  }
});

// ── FETCH ────────────────────────────────────────────────────────
self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Solo interceptar GET
  if (req.method !== 'GET') return;
  // Ignorar extensiones Chrome y WebSockets
  if (url.protocol === 'chrome-extension:') return;
  if (url.protocol === 'ws:' || url.protocol === 'wss:') return;

  // Nunca cachear peticiones externas (Supabase, Google Fonts, CDNs)
  if (url.origin !== self.location.origin) return;

  const isHTML = req.mode === 'navigate' ||
                 (req.headers.get('accept') || '').includes('text/html');

  const isImage = /\.(jpe?g|png|gif|webp|svg|avif)(\?.*)?$/i.test(url.pathname) ||
                  (req.headers.get('accept') || '').includes('image/');

  if (isHTML) {
    // HTML: Network First → si falla, caché → si no hay caché, offline page
    event.respondWith(networkFirstHTML(req));
  } else if (isImage) {
    // Imágenes: Cache First — sirve inmediatamente desde caché si existe,
    // actualiza en background. Evita parpadeo/blank en fondos y avatares.
    event.respondWith(cacheFirstImage(req));
  } else {
    // JS/CSS/fonts: Stale While Revalidate
    event.respondWith(staleWhileRevalidate(req));
  }
});

// ── Estrategia Network First (HTML) ─────────────────────────────
async function networkFirstHTML(req) {
  try {
    const networkRes = await fetch(req);
    if (networkRes && networkRes.status === 200) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(req, networkRes.clone());
    }
    return networkRes;
  } catch {
    const cached = await caches.match(req);
    if (cached) return cached;
    // Fallback: index.html como shell offline
    const shell = await caches.match('./index.html');
    if (shell) return shell;
    // Sin nada en caché: respuesta offline mínima
    return new Response(
      `<!doctype html><html lang="es"><head><meta charset="utf-8">
      <meta name="viewport" content="width=device-width,initial-scale=1">
      <title>Etheria — Sin conexión</title>
      <style>body{background:#1a1815;color:#c9a86c;font-family:serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;text-align:center}h1{font-size:1.5rem;margin-bottom:.5rem}p{opacity:.7;font-size:.9rem}</style>
      </head><body><div><h1>✦ Etheria ✦</h1><p>Sin conexión. Conecta a internet para continuar.</p></div></body></html>`,
      { headers: { 'Content-Type': 'text/html; charset=utf-8' } }
    );
  }
}

// ── Estrategia Cache First (imágenes) ───────────────────────────────────
// Sirve desde caché de inmediato. Si no está en caché, descarga y guarda.
// Las imágenes rara vez cambian, por eso preferimos velocidad a frescura.

async function cacheFirstImage(req) {
  const imageCache = await caches.open(IMAGE_CACHE);
  const cached = await imageCache.match(req);
  if (cached) return cached;

  try {
    const res = await fetch(req);
    if (res && res.status === 200) {
      imageCache.put(req, res.clone());
    }
    return res;
  } catch {
    // Sin red y sin caché: 204 transparente para no bloquear el layout
    return new Response('', { status: 204 });
  }
}

// ── Estrategia Stale While Revalidate (assets) ───────────────────
async function staleWhileRevalidate(req) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(req);

  // Revalidar en background independientemente de si hay caché
  const networkPromise = fetch(req).then((res) => {
    if (res && res.status === 200) {
      cache.put(req, res.clone());
    }
    return res;
  }).catch(() => null);

  // Devolver caché inmediatamente si existe, sino esperar red
  return cached || networkPromise;
}

// ── PUSH NOTIFICATIONS ──────────────────────────────────────────
self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: 'Etheria', body: event.data?.text() || 'Nueva notificación' };
  }

  const title   = data.title || 'Etheria';
  const options = {
    body:      data.body    || 'Te toca responder',
    icon:      data.icon    || '/assets/icons/icon-192.png',
    badge:     data.badge   || '/assets/icons/icon-192.png',
    tag:       data.tag     || 'etheria-push',
    renotify:  data.renotify ?? true,
    data:      data.data    || {},
    actions: [
      { action: 'open',    title: 'Abrir historia' },
      { action: 'dismiss', title: 'Descartar' },
    ],
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

// Al pulsar la notificación — abrir/enfocar la app y navegar al topic
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  if (event.action === 'dismiss') return;

  const notifData = event.notification.data || {};
  const targetUrl = notifData.url || '/';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      // Si la app ya está abierta, enfocarla y enviarle los datos
      const existing = clients.find(c => c.url.includes(self.location.origin));
      if (existing) {
        existing.focus();
        existing.postMessage({
          type: 'PUSH_NOTIFICATION_CLICK',
          topicId:        notifData.topicId,
          storyId:        notifData.storyId,
          notificationId: notifData.notificationId,
        });
        return;
      }
      // Si no está abierta, abrirla
      return self.clients.openWindow(targetUrl);
    })
  );
});

// ── BACKGROUND SYNC ─────────────────────────────────────────────
self.addEventListener('sync', (event) => {
  if (event.tag === 'etheria-sync') {
    event.waitUntil(
      self.clients.matchAll().then((clients) => {
        clients.forEach((client) => {
          client.postMessage({ type: 'SYNC_REQUIRED' });
        });
      })
    );
  }
});
