/* flint-v2505 — service worker RÉSEAU UNIQUEMENT (fin des versions périmées).
   Ne met plus rien en cache. À l'activation : efface TOUT ancien cache, prend le
   contrôle et force le rechargement de toutes les fenêtres pour éliminer le vieux
   service worker cache-first qui servait des versions périmées en boucle. */
/* v1185 — LE NUMÉRO QUI COMPTE EST CELUI DE LA PREMIÈRE LIGNE.
   `WebRoot.parseVersion` prend la PREMIÈRE occurrence de `flint-v<n>` du
   fichier : celle de l'en-tête ci-dessus. Elle doit rester ÉGALE à
   `APP_VERSION` d'index.html — le garde de build fait échouer la compilation
   sinon, et une seule des deux montée ne resème rien : l'app continue de
   servir l'ancien web, en silence.

   7 SEPT. 2026 — LA CONSTANTE `CACHE` A ÉTÉ RETIRÉE D'ICI. Elle portait un
   SECOND numéro `flint-v<n>`, déclaré et jamais lu : depuis que ce service
   worker efface TOUS les caches à l'activation (en-tête ci-dessus), plus rien
   ne s'en servait. Elle a fini par mentir — cinq versions de retard sous
   l'en-tête, après une fusion qui n'avait pas de raison de les rapprocher — et
   un lecteur pouvait croire qu'il fallait la bumper aussi. Un numéro qui ne
   commande rien finit toujours par contredire celui qui commande ; le plus sûr
   n'était pas de le corriger, mais de le supprimer. */
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
