/* LE TRACÉ D'UNE MESURE ECG PASSÉE — `flEcgTrace`.
   ═══════════════════════════════════════════════════════════════════════════

   Réceptacle déclaré, appelé par `ShellBridge.ecgTrace(cle:)`. Il manquait : on
   pouvait lister les mesures passées et montrer leurs chiffres, jamais rouvrir
   leur courbe.

   CE QUE CE BANC ÉPROUVE, ET POURQUOI CHAQUE POINT A COÛTÉ QUELQUE CHOSE :

     · le décodage natif est `[Int]` — un seul décimal fait échouer TOUTE la
       charge, et l'écran devient muet sans qu'aucun chiffre n'ait été faux.
       C'est exactement la panne de la fiche de séance, traquée pendant une
       heure le 11 août. On la vérifie ici avant qu'elle ne coûte une seconde
       fois ;

     · une courbe retirée par le filet du stockage n'est PAS une panne. Le
       distinguer est la seule façon de ne pas faire passer un choix assumé pour
       un défaut ;

     · une clé qui n'est pas un tracé ne doit rien rendre. Cette fonction lit le
       stockage sur un nom qui vient d'ailleurs.

   USAGE :  node FLINT/web/tests/test-ecg-trace.js
   ═══════════════════════════════════════════════════════════════════════════ */
var fs=require('fs'), path=require('path');
var ok=0,ko=0;
function v(nom,att,eu){ if(att===eu){ok++;console.log('✅ '+nom);}
  else{ko++;console.log('❌ '+nom+'  attendu '+JSON.stringify(att)+', eu '+JSON.stringify(eu));} }

var RACINE=path.join(__dirname,'..','..','..');
var src=fs.readFileSync(path.join(RACINE,'FLINT','web','index.html'),'utf8');
function bloc(amorce){
  var i=src.indexOf(amorce);
  if(i<0)throw new Error('amorce introuvable : '+amorce);
  var d=0,j=src.indexOf('{',i);
  for(;;){ if(src[j]==='{')d++; else if(src[j]==='}'){d--; if(!d)break;} j++; }
  return src.slice(i,j+1);
}

var STORE={};
global.window={};
global.DB={ get:function(k,d){ return STORE[k]!==undefined?STORE[k]:d; },
            set:function(k,val){ STORE[k]=val; } };
global.localStorage={ get length(){return Object.keys(STORE).length;},
                      key:function(i){return Object.keys(STORE)[i];} };
eval(bloc('window.flEcgTrace=function(cle){'));
eval(bloc('window.flEcgListe=function(){'));
var trace=window.flEcgTrace, liste=window.flEcgListe;

/* ── 1. UNE COURBE PRÉSENTE SE REND ENTIÈRE ───────────────────────────────── */
STORE['ecg_1000']={t:1000,hz:240,serie:[100,-42,317,0,-8],analyse:{fc:62}};
var r=trace('ecg_1000');
v('la courbe est rendue',            true, !!(r&&r.serie));
v('  tous ses points',                  5, r&&r.serie.length);
v('  dans l ordre',              '100,-42,317,0,-8', r&&r.serie.join(','));
v('  la fréquence d échantillonnage', 240, r&&r.hz);
v('  et elle n est pas marquée retirée', false, r&&r.retiree);

/* ── 2. `[Int]` CÔTÉ SWIFT : PAS UN SEUL DÉCIMAL ─────────────────────────────
   `JSONDecoder` refuse la charge ENTIÈRE sur un `100.5` dans un `[Int]`. La
   fiche de séance a perdu une heure sur ce mode de panne exact — silencieux,
   sans qu'aucune valeur ne soit fausse. */
STORE['ecg_2000']={t:2000,hz:250,serie:[100.5,-42.4,317.6,NaN,Infinity,null],analyse:{}};
var r2=trace('ecg_2000');
var entiers=(r2&&r2.serie||[]).every(function(x){return Number.isInteger(x);});
v('aucun décimal ne sort de la fonction',  true, entiers);
v('  arrondi au plus proche',       '101,-42,318,0,0,0', r2&&r2.serie.join(','));

/* ── 3. UNE COURBE RETIRÉE LE DIT ────────────────────────────────────────────
   `flFaireDeLaPlace` retire les tracés au-delà des cinq derniers quand le
   disque est plein, en gardant leur analyse. Ce n'est pas une panne. */
STORE['ecg_3000']={t:3000,hz:240,serie:null,serieRetiree:true,analyse:{fc:58}};
var r3=trace('ecg_3000');
v('une courbe retirée rend quand même un objet', true, !!r3);
v('  sans série',                                null, r3&&r3.serie);
v('  et elle le dit',                            true, r3&&r3.retiree);

/* ── 4. UNE MESURE SANS SÉRIE NI DRAPEAU ────────────────────────────────────
   Pas la même chose : là, on ne sait pas pourquoi. On ne prétend pas savoir. */
STORE['ecg_3500']={t:3500,hz:240,analyse:{fc:60}};
var r35=trace('ecg_3500');
v('sans série ni drapeau : pas de série', null, r35&&r35.serie);
v('  et surtout pas « retirée »',        false, r35&&r35.retiree);

/* ── 5. CE QUI N EST PAS UN TRACÉ NE SE LIT PAS ──────────────────────────────
   La clé vient du natif. Elle ne doit pas pouvoir servir à lire autre chose. */
STORE['watch_2026-8-11']={hr:[[1,60]]};
STORE['profil']={nom:'Félix'};
v('une clé de journée : rien',        null, trace('watch_2026-8-11'));
v('une clé de profil : rien',         null, trace('profil'));
v('une clé inconnue : rien',          null, trace('ecg_999999'));
v('pas une chaîne : rien',            null, trace(42));
v('rien du tout : rien',              null, trace(null));
v('un préfixe qui ressemble : rien',  null, trace('xecg_1000'));

/* ── 6. LA LISTE DIT SI LA COURBE EST ENCORE LÀ ──────────────────────────────
   Sans ce drapeau, l'écran proposerait de rouvrir une courbe qui n'existe
   plus, et l'utilisateur croirait à une panne. */
var L=liste();
v('la liste porte les trois mesures et rien d autre', 4, L.length);
var parCle={}; L.forEach(function(x){parCle[x.cle]=x;});
v('  la courbe présente n est pas marquée retirée', false, parCle['ecg_1000'].serieRetiree);
v('  la courbe retirée l est',                       true, parCle['ecg_3000'].serieRetiree);
v('  la plus récente en tête',                 'ec'+'g_3500', L[0].cle);

/* ── 7. LA TAILLE, PARCE QUE C EST LA RAISON D ÊTRE DE CETTE FONCTION ────────
   Trente secondes à 240 Hz font sept mille deux cents entiers. Vingt mesures
   dans une seule charge en feraient cent quarante-quatre mille, pour n'en
   dessiner qu'une. La liste porte les chiffres, cette fonction porte la courbe. */
var longue=new Array(7200); for(var i=0;i<7200;i++)longue[i]=(i%300)-150;
STORE['ecg_4000']={t:4000,hz:240,serie:longue,analyse:{}};
var r4=trace('ecg_4000');
v('une mesure de trente secondes passe entière', 7200, r4&&r4.serie.length);
var pesee=JSON.stringify(liste()).length;
v('  et la liste, elle, reste légère', true, pesee<2000);
console.log('     (la liste des 5 mesures pèse '+pesee+' octets, '
  +'la seule courbe longue en pèse '+JSON.stringify(r4.serie).length+')');

console.log('\n'+ok+' vérifications passées, '+ko+' échouées.');
process.exit(ko?1:0);
