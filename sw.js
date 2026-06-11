/* Service worker : précache le shell de l'app, stratégie stale-while-revalidate
   pour que les mises à jour du dépôt (dont activities.csv) arrivent au rechargement suivant. */
const CACHE = 'running-stats-v3';
const ASSETS = [
  './',
  './index.html',
  './app.js',
  './compute.js',
  './strava.js',
  './config.js',
  './activities.csv',
  './manifest.webmanifest',
  './vendor/chart.umd.min.js',
  './vendor/chartjs-adapter-date-fns.bundle.min.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-512-maskable.png',
  './icons/icon-180.png',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(
    caches.open(CACHE).then(cache =>
      cache.match(e.request, { ignoreSearch: true }).then(cached => {
        const fresh = fetch(e.request)
          .then(resp => { if (resp.ok) cache.put(e.request, resp.clone()); return resp; })
          .catch(() => cached);
        return cached || fresh;
      })
    )
  );
});
