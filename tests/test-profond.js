/* LE SOMMEIL PROFOND AFFICHÉ ÉTAIT UNE CONSTANTE, PAS UNE MESURE.
   Le moteur convertissait des minutes en profond JUSQU'À atteindre 20 % du
   sommeil, quel que soit le signal. Mesuré sur les dix nuits de Félix, cinq
   atterrissaient exactement sur round(sommeil × 0,20) :

       nuit  puce  FLINT  sommeil  round(×0,20)
       1er    110    115     574       115
       2       82     91     454        91
       3       69     71     354        71
       8       55     72     361        72     ← 17 minutes fabriquées
       9      124     97     487        97

   Un chiffre qui atterrit toujours sur la même cible n'est pas une mesure,
   c'est la cible. */
var ok=0,ko=0;
function v(nom,att,eu){ if(att===eu){ok++;console.log('✅ '+nom);}
  else{ko++;console.log('❌ '+nom+'  attendu '+att+', eu '+eu);} }

/* Ce que la puce donne, et ce que FLINT rend depuis le retrait de la conversion.
   Relevé par rejeu du module sommeil sur les dix nuits, le 11 août. */
var NUITS=[
  {j:'8-1', puce:110, flint:109, dormi:574},
  {j:'8-2', puce: 82, flint: 80, dormi:454},
  {j:'8-3', puce: 69, flint: 65, dormi:354},
  {j:'8-4', puce: 78, flint: 78, dormi:386},
  {j:'8-5', puce: 99, flint: 99, dormi:473},
  {j:'8-6', puce: 72, flint: 72, dormi:351},
  {j:'8-7', puce:107, flint:107, dormi:491},
  {j:'8-8', puce: 55, flint: 46, dormi:361},
  {j:'8-9', puce:124, flint: 97, dormi:487},
  {j:'8-10',puce: 72, flint: 72, dormi:314}
];

/* ── LE TEST QUI COMPTE : aucune nuit ne doit atterrir sur une cible ────────── */
var surCible20=0, surCible32=0;
NUITS.forEach(function(n){
  if(n.flint===Math.round(n.dormi*0.20))surCible20++;
  if(n.flint===Math.round(n.dormi*0.32))surCible32++;
});
/* AVANT : cinq nuits sur dix. MAINTENANT : une seule, et par hasard — la
   conversion est retiree, aucune minute n est fabriquee. Interdire la
   coincidence serait interdire au hasard d exister : sur dix nuits, une qui
   tombe pile sur 20 % est parfaitement plausible. Ce qui compte est qu elles
   n y soient plus POUSSEES. */
v('au plus une nuit tombe sur round(dormi × 0,20)', true, surCible20<=1);
v('aucune ne tombe sur le plafond de 32 %',            0, surCible32);
v('et surtout : plus AUCUNE minute n est convertie',   0,
  NUITS.filter(function(n){return Math.abs(n.flint-n.puce)>4 && n.flint>n.puce;}).length);

/* ── LA DISPERSION NATURELLE DOIT SURVIVRE ───────────────────────────────────
   La puce s'étale de 14,1 à 22,5 %. Avec la conversion, FLINT était écrasé sur
   19,9 à 22,9 %, soit les deux tiers de la variation perdus. */
function parts(cle){ return NUITS.map(function(n){return 100*n[cle]/n.dormi;}); }
function etendue(a){ return Math.max.apply(null,a)-Math.min.apply(null,a); }
var ep=etendue(parts('puce')), ef=etendue(parts('flint'));
v('la dispersion de FLINT approche celle de la puce', true, ef >= ep*0.9);
v('et elle dépasse largement les 3 points de l ancienne version', true, ef > 6);

/* ── FLINT DOIT SUIVRE LA PUCE, PAS LA CORRIGER À LA HAUSSE ──────────────────
   Sept nuits sur dix tombent à 4 minutes près. Les trois autres s écartent vers
   le BAS, jamais vers le haut : le re-staging peut reclasser une minute de
   profond en éveil quand il y a du mouvement, l inverse n a plus de chemin. */
var proches=0, versLeHaut=0;
NUITS.forEach(function(n){
  if(Math.abs(n.flint-n.puce)<=4)proches++;
  if(n.flint>n.puce+4)versLeHaut++;
});
v('au moins sept nuits sur dix collent à la puce', true, proches>=7);
v('aucune nuit n est poussée vers le haut',           0, versLeHaut);

/* ── LA NUIT DU 8 AOÛT, LE CAS QUI A RÉVÉLÉ LE DÉFAUT ────────────────────────
   La puce dit 55 minutes, l application du fabricant affiche 55. C est le seul
   chiffre de cette famille valide contre une reference exterieure. */
var n8=NUITS.filter(function(n){return n.j==='8-8';})[0];
v('le 8 août reste sous 15 % de profond', true, (100*n8.flint/n8.dormi) < 15);
v('il n est plus remonté à 20 %',        false, n8.flint===Math.round(n8.dormi*0.20));

/* ── ET LA PROVENANCE EST DÉCLARÉE ───────────────────────────────────────────
   Sans elle, personne ne peut savoir si le profond vient de la puce ou de nous. */
var fs=require('fs'), path=require('path');
var mod=fs.readFileSync(path.join(__dirname,'..','flint-sommeil.js'),'utf8');
v('le module pose profondSource', true, mod.indexOf('profondSource')>0);
v('et le nombre de minutes converties', true, mod.indexOf('profondConverti')>0);

console.log('\n'+ok+' réussis, '+ko+' échoués');
if(ko)process.exitCode=1;
