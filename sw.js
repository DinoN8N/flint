/* flint-v1558 — service worker RÉSEAU UNIQUEMENT (fin des versions périmées).
   Ne met plus rien en cache. À l'activation : efface TOUT ancien cache, prend le
   contrôle et force le rechargement de toutes les fenêtres pour éliminer le vieux
   service worker cache-first qui servait des versions périmées en boucle. */
/* v1185 — LE NUMÉRO QUI COMPTE EST CELUI DE LA PREMIÈRE LIGNE.
   `WebRoot.parseVersion` prend la PREMIÈRE occurrence de `flint-v<n>` du
   fichier — donc celle du commentaire d'en-tête, pas cette constante. Bumper
   la constante seule ne resème rien : l'app continue de servir l'ancien web,
   en silence, et les fonctions qu'on vient d'ajouter n'existent pas. Les deux
   se bumpent ENSEMBLE. */
const CACHE = 'flint-v1553';
self.addEventListener('install', e => { self.skipWaiting(); });
self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    try { const ks = await caches.keys(); await Promise.all(ks.map(k => caches.delete(k))); } catch (_) {}
    try { await self.clients.claim(); } catch (_) {}
    try {
      const cs = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      cs.forEach(c => { try { c.navigate(c.url); } catch (_) {} });
    } catch (_) {}
  })());
});
/* pas de respondWith → toutes les requêtes vont directement au réseau (jamais de cache périmé) */
self.addEventListener('fetch', e => {});
