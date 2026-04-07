const CACHE_NAME = 'atomic-freeform-v3';
const APP_SHELL = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './manifest.json',
  './assets/favicon.ico',
  './assets/icon-16.png',
  './assets/icon-32.png',
  './assets/icon-48.png',
  './assets/icon-180.png',
  './assets/icon-192.png',
  './assets/icon-512.png',
  './assets/atomic-journal-md.svg'
];

self.addEventListener('install', e => e.waitUntil(
  caches.open(CACHE_NAME).then(c => c.addAll(APP_SHELL)).then(() => self.skipWaiting())
));

self.addEventListener('activate', e => e.waitUntil(
  caches.keys().then(keys => Promise.all(
    keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
  )).then(() => self.clients.claim())
));

self.addEventListener('fetch', e => { 
  if (e.request.method !== 'GET') return; 
  e.respondWith(
    caches.match(e.request).then(r => r || fetch(e.request).then(resp => { 
      const copy = resp.clone(); 
      caches.open(CACHE_NAME).then(c => c.put(e.request, copy)); 
      return resp; 
    }).catch(() => caches.match('./index.html')))
  ); 
});