/* ──────────────────────────────────────────────────────────────────────────
 *  J&V Tools — Service Worker
 *  Estrategias:
 *    • cache-first   → shell, JS, CSS, íconos, manifest (assets estáticos)
 *    • network-first → CDNs externos (jsPDF) y APIs externas (tasa de cambio)
 *    • offline-fallback → index.html cuando no hay red
 *  Al activar: limpia caches viejos y notifica al cliente si hay update.
 * ──────────────────────────────────────────────────────────────────────── */

const CACHE_VERSION = 'jvtools-v1.0.0';
const CACHE_STATIC  = `${CACHE_VERSION}-static`;
const CACHE_RUNTIME = `${CACHE_VERSION}-runtime`;

// Shell completo: todo lo que necesita la app para funcionar offline
const PRECACHE_URLS = [
  './',
  './index.html',
  './manifest.json',
  './favicon.png',
  './css/styles.css',
  './js/app.js',
  './js/db.js',
  './js/plan.js',
  './js/historial.js',
  './js/calendario.js',
  './js/config.js',
  './icons/icon-72.png',
  './icons/icon-96.png',
  './icons/icon-128.png',
  './icons/icon-144.png',
  './icons/icon-152.png',
  './icons/icon-192.png',
  './icons/icon-384.png',
  './icons/icon-512.png',
  './icons/icon-maskable-192.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png'
];

// ── INSTALL ─────────────────────────────────────────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_STATIC)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting())
      .catch((err) => console.error('[SW] Install failed:', err))
  );
});

// ── ACTIVATE ────────────────────────────────────────────────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys
          .filter((k) => k !== CACHE_STATIC && k !== CACHE_RUNTIME)
          .map((k) => {
            console.log('[SW] Deleting old cache:', k);
            return caches.delete(k);
          })
      ))
      .then(() => self.clients.claim())
      .then(() => {
        // Notify all clients about the new version
        return self.clients.matchAll({ type: 'window' }).then((clients) => {
          clients.forEach((c) => c.postMessage({ type: 'SW_ACTIVATED', version: CACHE_VERSION }));
        });
      })
  );
});

// ── FETCH ───────────────────────────────────────────────────────────────
self.addEventListener('fetch', (event) => {
  const { request } = event;

  // Only handle GET
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // ── External tasa de cambio (allorigins, corsproxy, infodolar) → network-first
  if (
    url.hostname.includes('allorigins.win') ||
    url.hostname.includes('corsproxy.io')   ||
    url.hostname.includes('infodolar.com')
  ) {
    event.respondWith(networkFirst(request));
    return;
  }

  // ── jsPDF CDN → cache-first (don't break offline PDF generation)
  if (url.hostname.includes('cdnjs.cloudflare.com')) {
    event.respondWith(cacheFirst(request, CACHE_RUNTIME));
    return;
  }

  // ── Google Fonts (Inter) → cache-first
  if (url.hostname.includes('fonts.googleapis.com') || url.hostname.includes('fonts.gstatic.com')) {
    event.respondWith(cacheFirst(request, CACHE_RUNTIME));
    return;
  }

  // ── Same-origin navigation requests → offline fallback to index.html
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .catch(() => caches.match('./index.html'))
    );
    return;
  }

  // ── All other same-origin requests → cache-first
  event.respondWith(cacheFirst(request, CACHE_STATIC));
});

// ── STRATEGIES ──────────────────────────────────────────────────────────
async function cacheFirst(request, cacheName) {
  const cached = await caches.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response && response.status === 200 && response.type !== 'opaque') {
      const cache = await caches.open(cacheName);
      cache.put(request, response.clone());
    }
    return response;
  } catch (err) {
    // Last resort: return shell for navigation requests
    if (request.mode === 'navigate') return caches.match('./index.html');
    throw err;
  }
}

async function networkFirst(request) {
  try {
    const response = await fetch(request);
    if (response && response.status === 200) {
      const cache = await caches.open(CACHE_RUNTIME);
      cache.put(request, response.clone());
    }
    return response;
  } catch (err) {
    const cached = await caches.match(request);
    if (cached) return cached;
    throw err;
  }
}

// ── MESSAGE handler — para forzar update desde la app ───────────────────
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
