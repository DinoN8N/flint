// ═══════════════════════════════════════════════════════════════════════════
//  LA LECTURE D'ÉTIQUETTE — `mode: 'label'` (30 sept. 2026)
//
//  L'app envoie `mode: 'label'` depuis la v1768 (`LectureEtiquette.swift`) ;
//  le serveur l'ignorait : un tableau nutritionnel partait en analyse de
//  repas, et l'app lisait « illisible » à chaque fois. Ce banc joue le VRAI
//  gestionnaire, avec un Gemini simulé, et tient :
//
//   ① une étiquette part avec SA consigne, SON schéma, et une température 0 ;
//   ② la réponse suit le contrat que l'app lit (`lisible`, `per100`, …) ;
//   ③ un nombre hors des bornes physiques d'un aliment n'est pas « lu » ;
//   ④ rien de lu → `lisible: false`, et rien d'autre ;
//   ⑤ sans `mode`, l'analyse de repas ne change pas d'un octet ;
//   ⑥ une étiquette sans photo est refusée.
// ═══════════════════════════════════════════════════════════════════════════
const path = require('path');
const lib = require(path.join(__dirname, '..', 'api', '_lib.js'));

let vert = 0, rouge = 0;
function v(titre, ok, detail) {
  if (ok) { vert++; console.log('  ✅ ' + titre); }
  else { rouge++; console.log('  ❌ ' + titre + (detail ? '   ' + detail : '')); }
}
function fauxRes() {
  const r = { code: null, corps: null, entetes: {} };
  r.setHeader = (k, val) => { r.entetes[k] = val; };
  r.status = (c) => { r.code = c; return r; };
  r.json = (o) => { r.corps = o; return r; };
  r.end = () => r;
  return r;
}
let n = 0;
function fauxReq(corps) {
  n++;
  return { method: 'POST', headers: { 'x-forwarded-for': '10.0.0.' + n }, body: corps };
}

// Le Gemini simulé : il retient ce qu'on lui demande, et rend ce qu'on lui dit.
let demande = null, reponse = null;
lib.appelerGemini = async (o) => {
  demande = o.corps;
  return { ok: true, modele: o.modeles[0], tentatives: 1,
           json: { candidates: [{ content: { parts: [{ text: JSON.stringify(reponse) }] } }] } };
};
process.env.GEMINI_API_KEY = 'cle-de-banc';
delete process.env.FLINT_APP_SECRET;
const scan = require(path.join(__dirname, '..', 'api', 'scan-meal.js'));
const IMAGE = 'data:image/jpeg;base64,' + Buffer.from('jpeg').toString('base64');

(async () => {
  console.log('\n═══ ① ② UNE ÉTIQUETTE LUE ═══');
  reponse = { lisible: true, name: '  Céréales croustillantes ', brand: 'Marque', servingG: 30,
              per100: { kcal: 389, prot: 8.2, carb: 72.5, sugars: 21.04, fat: 5.6, satfat: 1.1,
                        fiber: 6, salt: 0.72, caffeine: null } };
  let res = fauxRes();
  await scan(fauxReq({ mode: 'label', image: IMAGE }), res);
  const texteConsigne = demande && demande.contents[0].parts[0].text;
  v('la consigne est celle de l\'étiquette', /EMBALLAGE/.test(texteConsigne) && !/estimation visuelle/.test(texteConsigne));
  v('le schéma est celui de l\'étiquette', !!(demande && demande.generationConfig.responseSchema.properties.per100));
  v('température 0 : on lit, on ne compose pas', demande && demande.generationConfig.temperature === 0);
  v('200', res.code === 200, 'code ' + res.code);
  v('lisible', res.corps && res.corps.lisible === true);
  v('le nom est nettoyé', res.corps && res.corps.name === 'Céréales croustillantes');
  v('la portion traverse', res.corps && res.corps.servingG === 30);
  v('les valeurs pour 100 g traversent, au dixième', res.corps && res.corps.per100.kcal === 389
    && res.corps.per100.sugars === 21 && res.corps.per100.salt === 0.7);
  v('une valeur absente reste absente (caféine)', res.corps && res.corps.per100.caffeine === null);
  v('aucun champ d\'analyse de repas ne se mêle à la réponse', res.corps && !('items' in res.corps) && !('mealName' in res.corps));

  console.log('\n═══ ③ LES BORNES PHYSIQUES ═══');
  reponse = { lisible: true, per100: { kcal: 4200, prot: -3, carb: 'n/a', fat: 12 } };
  res = fauxRes();
  await scan(fauxReq({ mode: 'label', image: IMAGE }), res);
  v('4 200 kcal pour 100 g : pas lu', res.corps.per100.kcal === null);
  v('une valeur négative : pas lue', res.corps.per100.prot === null);
  v('un texte à la place d\'un nombre : pas lu', res.corps.per100.carb === null);
  v('… mais ce qui est plausible reste', res.corps.per100.fat === 12 && res.corps.lisible === true);

  console.log('\n═══ ④ RIEN DE LU ═══');
  reponse = { lisible: false, name: 'Pâtes bolognaise', per100: { kcal: 150 } };
  res = fauxRes();
  await scan(fauxReq({ mode: 'label', image: IMAGE }), res);
  v('le modèle dit « illisible » : on ne garde RIEN, même un nombre', JSON.stringify(res.corps) === '{"lisible":false}');
  reponse = { lisible: true, name: 'Produit', per100: { kcal: null, prot: null, carb: null, fat: null, salt: 1 } };
  res = fauxRes();
  await scan(fauxReq({ mode: 'label', image: IMAGE }), res);
  v('« lisible » sans énergie ni macro : pas lisible', JSON.stringify(res.corps) === '{"lisible":false}');

  console.log('\n═══ ⑤ LE REPAS NE CHANGE PAS ═══');
  reponse = { mealName: 'Riz poulet', healthScore: 8, healthNote: 'Bien.',
              items: [{ name: 'Riz', grams: 200, kcal: 260, prot: 5, carb: 57, fat: 1, confidence: 0.8 }] };
  res = fauxRes();
  await scan(fauxReq({ image: IMAGE }), res);
  const consigneRepas = demande.contents[0].parts[0].text;
  v('sans mode : la consigne du repas', /estimation visuelle/.test(consigneRepas));
  v('  … son schéma', !!demande.generationConfig.responseSchema.properties.items);
  v('  … sa température', demande.generationConfig.temperature === 0.1);
  v('  … et sa réponse', res.code === 200 && res.corps.mealName === 'Riz poulet' && res.corps.items.length === 1
    && !('lisible' in res.corps));

  console.log('\n═══ ⑥ UNE ÉTIQUETTE SANS PHOTO ═══');
  res = fauxRes();
  await scan(fauxReq({ mode: 'label', text: 'céréales' }), res);
  v('refusée en 400', res.code === 400, 'code ' + res.code);

  console.log('\n  ' + vert + ' vert(s), ' + rouge + ' rouge(s)\n');
  process.exitCode = rouge ? 1 : 0;
})();
