// Garde l'app disponible hors ligne en tunnel. Incrementer VERSION a chaque livraison.
const VERSION = 'ring-mapping-5'; // garder en phase avec APP_VERSION dans js/app.js
const FILES = [
  './', 'index.html', 'styles.css', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png',
  'lib/xlsx.mini.min.js', 'lib/three.module.min.js', 'js/app.js', 'js/config.js', 'js/draw.js', 'js/geometry.js',
  'js/i18n.js', 'js/photos.js', 'js/project.js', 'js/report.js', 'js/rfr.js', 'js/store.js', 'js/view3d.js',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      // Le domaine github.io est partage entre les apps d'un compte : ne toucher qu'a nos caches.
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('ring-mapping-') && k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    caches.match(e.request, { ignoreSearch: true }).then((hit) => hit || fetch(e.request).then((res) => {
      // Une autre app du meme domaine peut vider nos caches : on les reconstitue au passage.
      if (res.ok && new URL(e.request.url).origin === location.origin) {
        const copy = res.clone();
        caches.open(VERSION).then((c) => c.put(e.request, copy));
      }
      return res;
    })),
  );
});
