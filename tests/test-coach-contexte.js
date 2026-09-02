#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
   LE BANC DU CONTEXTE DU COACH — `_lib.js` et `_coach-prompt.js`.

   Ce que `CoachOutils.swift` fait (exécuter les outils, taguer chaque
   résultat "qualite") est natif et ne se rejoue pas dans Node — c'est le
   simulateur iOS qui le vérifie (cf. rapport final). Ce banc-ci couvre ce qui
   EST du JavaScript pur côté serveur : le rate-limit par identité, et le
   prompt système (persona par ton, présence des garde-fous).
   ═══════════════════════════════════════════════════════════════════════════ */
const { rateLimited, identiteRequete, corpsJSON } = require('../api/_lib');
const { promptSysteme, TONS } = require('../api/_coach-prompt');

let ok = 0, ko = 0;
const verifie = (t, c, d) => { c ? (ok++, console.log(`  ✅ ${t}`))
                                : (ko++, console.log(`  ❌ ${t}${d ? '  → ' + d : ''}`)); };

console.log('\n1 · Identité de rate-limit');
{
  const reqDevice = { headers: { 'x-flint-device': 'ABC-123' } };
  const reqIp = { headers: { 'x-forwarded-for': '1.2.3.4' } };
  verifie('un appareil déclaré prime sur l\'IP', identiteRequete(reqDevice) === 'dev:ABC-123');
  verifie('sans device, on retombe sur l\'IP', identiteRequete(reqIp) === 'ip:1.2.3.4');
}

console.log('\n2 · Rate-limit par identité (fenêtre glissante)');
{
  const id = 'test-' + Math.random();
  let bloque = false;
  for (let i = 0; i < 45; i++) { if (rateLimited(id, 40)) bloque = true; }
  verifie('41e requête en une minute pour la même identité : bloquée', bloque);
  verifie('une autre identité n\'est pas affectée', !rateLimited('autre-' + Math.random(), 40));
}

console.log('\n3 · corpsJSON ne casse jamais sur une entrée absurde');
{
  verifie('chaîne JSON valide → objet', corpsJSON({ body: '{"a":1}' }).a === 1);
  verifie('chaîne invalide → objet vide, pas d\'exception', Object.keys(corpsJSON({ body: '{bad' })).length === 0);
  verifie('body absent → objet vide', Object.keys(corpsJSON({})).length === 0);
}

console.log('\n4 · Le prompt système : persona par ton, jamais la donnée qui change');
{
  Object.keys(TONS).forEach(ton => {
    const p = promptSysteme({ ton, profilTexte: '· Récupération du jour : 61 sur 100' });
    verifie(`ton "${ton}" produit un prompt non vide et contient le profil fourni`,
      typeof p === 'string' && p.includes('Récupération du jour') && p.length > 200);
  });
  const inconnu = promptSysteme({ ton: 'n-importe-quoi', profilTexte: '' });
  verifie('un ton inconnu retombe sur le ton équilibré, sans exception',
    inconnu.includes(TONS.aucun));
}

console.log('\n5 · Les garde-fous obligatoires sont bien dans le prompt');
{
  const p = promptSysteme({ ton: 'analytique', profilTexte: 'x' });
  ['n\'inventes JAMAIS', 'professionnel de santé', 'confidentiels'].forEach(mot => {
    verifie(`le prompt mentionne « ${mot} »`, p.includes(mot));
  });
}

console.log('\n6 · La mémoire conversationnelle (Phase 2)');
{
  const sansMemoire = promptSysteme({ ton: 'aucun', profilTexte: 'x' });
  verifie('sans mémoire fournie, le prompt le dit explicitement plutôt que d\'inventer',
    sansMemoire.includes('rien pour l\'instant'));

  const avecMemoire = promptSysteme({ ton: 'aucun', profilTexte: 'x', memoireTexte: '· déteste les champignons' });
  verifie('un fait fourni apparaît tel quel dans le prompt',
    avecMemoire.includes('déteste les champignons'));

  verifie('le prompt pose une règle claire sur QUAND enregistrer un fait (pas n\'importe quelle phrase)',
    sansMemoire.includes('saveMemoryFact') && /UNIQUEMENT|jamais/i.test(sansMemoire));
}

console.log(`\n${ko === 0 ? '✅' : '❌'} test-coach-contexte.js : ${ok} réussis, ${ko} échoués\n`);
process.exit(ko ? 1 : 0);
