/* Service worker :
   - navigations (index.html) : réseau d'abord → on voit toujours la dernière version en ligne,
     cache en secours hors-ligne ;
   - autres fichiers : stale-while-revalidate (rapide, mis à jour en arrière-plan). */
const CACHE = 'running-stats-v8';
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
  e.waitUntil((async () => {
    // Purge TOUS les anciens caches puis recharge les onglets ouverts :
    // garantit que les appareils coincés sur une vieille version récupèrent la nouvelle.
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)));
    await self.clients.claim();
    const wins = await self.clients.matchAll({ type: 'window' });
    await Promise.all(wins.map(c => c.navigate(c.url).catch(() => {})));
  })());
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;

  // Pages (navigation) : réseau d'abord, cache si hors-ligne
  if (e.request.mode === 'navigate') {
    e.respondWith(
      fetch(e.request)
        .then(resp => {
          if (resp.ok) caches.open(CACHE).then(c => c.put('./index.html', resp.clone()));
          return resp.clone();
        })
        .catch(() => caches.match('./index.html'))
    );
    return;
  }

  // Ressources : cache d'abord, mise à jour en arrière-plan
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
