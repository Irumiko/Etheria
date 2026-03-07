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
const CACHE_VERSION = 'mmgnyvil';
const CACHE_NAME    = `etheria-${CACHE_VERSION}`;

// Archivos que se precargan al instalar el SW.
const PRECACHE_URLS = [
  './',
  './index.html',
  './manifest.json',
  './assets/icons/icon-192.png',
  './assets/icons/icon-512.png',
  './assets/backgrounds/default_background.jpg',
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
            .filter((name) => name !== CACHE_NAME)
            .map((name) => {
              console.log('[SW] Eliminando caché antigua:', name);
              return caches.delete(name);
            })
        )
      )
      .then(() => self.clients.claim())
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

  if (isHTML) {
    // HTML: Network First → si falla, caché → si no hay caché, offline page
    event.respondWith(networkFirstHTML(req));
  } else {
    // Estáticos: Stale While Revalidate
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
