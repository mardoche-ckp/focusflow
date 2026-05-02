/* ════════════════════════════════════════════════════════════
   sw.js — Service Worker FocusFlow PWA
   Stratégie : Cache-First pour les assets statiques
   → L'app fonctionne HORS LIGNE après la première visite
════════════════════════════════════════════════════════════ */

const CACHE_NAME = 'focusflow-v1';

// Fichiers à mettre en cache dès l'installation
const ASSETS = [
  './index.html',
  './style.css',
  './app.js',
  './manifest.json',
  './icons/icon-192.svg',
  './icons/icon-512.svg',
  // Polices Google (si réseau disponible lors de l'install)
  'https://fonts.googleapis.com/css2?family=Syne:wght@400;600;700;800&family=DM+Sans:ital,wght@0,300;0,400;0,500;1,300&display=swap',
];

/* ── Installation : on pré-cache les assets ── */
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      // On ignore les erreurs individuelles (ex: polices hors ligne)
      return Promise.allSettled(ASSETS.map(url => cache.add(url)));
    }).then(() => self.skipWaiting())
  );
});

/* ── Activation : supprime les anciens caches ── */
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

/* ── Fetch : Cache-First → réseau en fallback ── */
self.addEventListener('fetch', event => {
  // Ignore les requêtes non-GET
  if (event.request.method !== 'GET') return;

  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;
      // Pas en cache → réseau, puis on met en cache
      return fetch(event.request).then(response => {
        if (!response || response.status !== 200) return response;
        const clone = response.clone();
        caches.open(CACHE_NAME).then(c => c.put(event.request, clone));
        return response;
      }).catch(() => {
        // Hors ligne et pas en cache : page offline basique
        if (event.request.destination === 'document') {
          return caches.match('./index.html');
        }
      });
    })
  );
});
