/* ════════════════════════════════════════════════════════════
   sw.js — FocusFlow Secure
   🔏 Service Worker avec :
     - Cache versionné (invalidation forcée à chaque update)
     - Stratégie Cache-First pour les assets locaux
     - Network-First pour les ressources externes
     - Mode offline complet
════════════════════════════════════════════════════════════ */

'use strict';

/* Version du cache — incrémenter à chaque déploiement */
var CACHE_VERSION = 'focusflow-secure-v1';
var CACHE_STATIC  = CACHE_VERSION + '-static';

/* Assets à mettre en cache (uniquement fichiers locaux de confiance) */
var ASSETS = [
  './index.html',
  './style.css',
  './app.js',
  './manifest.json',
  './icons/icon-192.svg',
  './icons/icon-512.svg'
];

/* ── Installation : pré-cache les assets locaux ── */
self.addEventListener('install', function(event) {
  event.waitUntil(
    caches.open(CACHE_STATIC).then(function(cache) {
      /* addAll échoue si un seul fichier manque → atomique */
      return cache.addAll(ASSETS);
    }).then(function() {
      /* Force l'activation immédiate sans attendre l'ancien SW */
      return self.skipWaiting();
    })
  );
});

/* ── Activation : purge les anciens caches ── */
self.addEventListener('activate', function(event) {
  event.waitUntil(
    caches.keys().then(function(keys) {
      return Promise.all(
        keys.filter(function(k) { return k !== CACHE_STATIC; })
            .map(function(k) { return caches.delete(k); })
      );
    }).then(function() {
      return self.clients.claim();
    })
  );
});

/* ── Fetch : Cache-First pour assets locaux, fallback réseau ── */
self.addEventListener('fetch', function(event) {
  /* Ignore les requêtes non-GET et non-HTTP */
  if (event.request.method !== 'GET') { return; }
  if (!event.request.url.startsWith('http')) { return; }

  /* Ressources externes (polices) → Network-First */
  if (event.request.url.includes('fonts.google')) {
    event.respondWith(
      fetch(event.request).catch(function() {
        return caches.match(event.request);
      })
    );
    return;
  }

  /* Assets locaux → Cache-First */
  event.respondWith(
    caches.match(event.request).then(function(cached) {
      if (cached) { return cached; }
      return fetch(event.request).then(function(response) {
        /* Ne cache que les réponses valides */
        if (!response || response.status !== 200 || response.type === 'opaque') {
          return response;
        }
        var clone = response.clone();
        caches.open(CACHE_STATIC).then(function(cache) {
          cache.put(event.request, clone);
        });
        return response;
      }).catch(function() {
        /* Hors ligne : retourne index.html pour les navigations */
        if (event.request.destination === 'document') {
          return caches.match('./index.html');
        }
      });
    })
  );
});

/* ── Message : force le rechargement du cache ── */
self.addEventListener('message', function(event) {
  if (event.data === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

/* ── Gestion des notifications push (mobile) ── */
self.addEventListener('notificationclick', function(event) {
  event.notification.close();
  /* Ouvre ou remet au premier plan l'app au clic sur la notif */
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(clientList) {
      for (var i = 0; i < clientList.length; i++) {
        var client = clientList[i];
        if ('focus' in client) { return client.focus(); }
      }
      if (clients.openWindow) { return clients.openWindow('./'); }
    })
  );
});

/* ── Notification push reçue (background) ── */
self.addEventListener('push', function(event) {
  if (!event.data) return;
  var data = event.data.json();
  event.waitUntil(
    self.registration.showNotification(data.title || 'FocusFlow', {
      body:    data.body  || '',
      icon:    './icons/icon-192.svg',
      badge:   './icons/icon-192.svg',
      vibrate: [200, 100, 200],
      tag:     'focusflow-deadline'
    })
  );
});