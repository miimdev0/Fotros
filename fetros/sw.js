/*
 * FETROS — service worker (sw.js)
 *
 * Strategy:
 *   - Precache the app shell on install so the app opens offline.
 *   - Same-origin GET requests: network first, store the fresh copy, and fall
 *     back to the cache when the network fails.
 *   - Navigations that fail offline get the cached index.html (single-page app).
 *   - Cross-origin requests (for example the Open-Meteo weather API) are not
 *     intercepted. Weather data is cached by the page itself, not here.
 *   - A new worker waits until the page asks for it with SKIP_WAITING, so an
 *     update never changes the screen under the user unexpectedly.
 *
 * CACHE_VERSION must match APP_VERSION in script.js.
 */
'use strict';

var CACHE_VERSION = '1.1.0';
var CACHE_NAME = 'fetros-cache-' + CACHE_VERSION;

// Paths are relative to the service worker scope (the folder that holds index.html).
var APP_SHELL = [
  './',
  'index.html',
  'style.css',
  'script.js',
  'manifest.json',
  'js/storage.js',
  'js/calendar-engine.js',
  'js/data/occasions.js',
  'js/data/cities.js',
  'js/prayer-engine.js',
  'js/location.js',
  'js/ui.js',
  'js/view-home.js',
  'js/view-calendar.js',
  'js/view-prayer.js',
  'js/view-tools.js',
  'js/native.js',
  'js/ics.js',
  'icons/icon.svg',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'fonts/Vazirmatn-Variable.woff2'
];

function scopeUrl(path) {
  return new URL(path, self.registration.scope).href;
}

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function (cache) {
      return cache.addAll(APP_SHELL.map(scopeUrl));
    })
  );
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.filter(function (key) {
        return key.indexOf('fetros-cache-') === 0 && key !== CACHE_NAME;
      }).map(function (key) {
        return caches.delete(key);
      }));
    }).then(function () {
      return self.clients.claim();
    })
  );
});

self.addEventListener('message', function (event) {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

self.addEventListener('fetch', function (event) {
  var request = event.request;
  if (request.method !== 'GET') return;

  var url = new URL(request.url);
  // Leave cross-origin traffic (weather API, CDN) to the network untouched.
  if (url.origin !== self.location.origin) return;

  event.respondWith(networkFirst(request));
});

function networkFirst(request) {
  return fetch(request).then(function (response) {
    if (response && response.ok && response.type === 'basic') {
      var copy = response.clone();
      caches.open(CACHE_NAME).then(function (cache) {
        cache.put(request, copy);
      }).catch(function () { /* storage full or unavailable: keep serving */ });
    }
    return response;
  }).catch(function () {
    return caches.match(request, { ignoreSearch: true }).then(function (cached) {
      if (cached) return cached;
      if (request.mode === 'navigate') {
        return caches.match(scopeUrl('index.html'));
      }
      return new Response('', { status: 504, statusText: 'Offline' });
    });
  });
}
