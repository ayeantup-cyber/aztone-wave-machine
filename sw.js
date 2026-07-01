/* ═══════════════════════════════════════════════════════════════
   AZ-TØNE WAVE MACHINE — sw.js (Service Worker)        v0.1.0

   Cache-first strategy for app shell files.
   Audio files from the user's device are NOT cached here —
   they come directly from the File System Access API.

   On first load: caches all shell assets.
   Offline: serves from cache, falls back to network if miss.
   Update: new SW version busts the old cache automatically.
═══════════════════════════════════════════════════════════════ */

const CACHE_NAME  = 'aztone-v0-1-0';
const SHELL_FILES = [
  '/',
  '/index.html',
  '/styles.css',
  '/script.js',
  '/audioEngine.js',
  '/libraryDB.js',
];

// ── Install: pre-cache app shell ────────────────────────────────
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(SHELL_FILES))
  );
  self.skipWaiting();
});

// ── Activate: delete old caches ──────────────────────────────────
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

// ── Fetch: cache-first, network fallback ────────────────────────
self.addEventListener('fetch', event => {
  // Only handle GET requests for same-origin resources
  if (event.request.method !== 'GET') return;

  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;
      return fetch(event.request).then(response => {
        // Cache fresh copies of shell files
        if (response.ok && SHELL_FILES.some(f => event.request.url.endsWith(f))) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        }
        return response;
      }).catch(() => {
        // Offline fallback — return cached index.html for navigation
        if (event.request.mode === 'navigate') {
          return caches.match('/index.html');
        }
      });
    })
  );
});
