/* LA PLAGE HABITUELLE, REJOUÉE SUR LES ONZE JOURS RÉELS DE FÉLIX.
   ═══════════════════════════════════════════════════════════════════════════

   Dino a livré le front le 11 août sans écrire une ligne de calcul, et il a eu
   raison : la règle nous revient. Ce banc éprouve celle qu'on a choisie.

   IL EXTRAIT LA VRAIE FONCTION d'`index.html` par équilibrage d'accolades. La
   leçon de `test-seances.js` vaut ici plus qu'ailleurs : le critère de densité
   avait été posé avec un banc plein d'assurance qui comparait cinq chiffres
   figés en dur, et rejoué onze jours plus tard sur les vraies données il
   annonçait l'inverse de ce qu'il affirmait. Un banc qui ne rejoue pas la mesure
   fige une opinion.

   USAGE :  node FLINT/web/tests/test-plage.js
   ═══════════════════════════════════════════════════════════════════════════ */
var fs=require('fs'), path=require('path');
var ok=0,ko=0;
function v(nom,att,eu){ if(att===eu){ok++;console.log('✅ '+nom);}
  else{ko++;console.log('❌ '+nom+'  attendu '+JSON.stringify(att)+', eu '+JSON.stringify(eu));} }
function vProche(nom,att,eu,tol){ if(eu!=null&&Math.abs(att-eu)<=tol){ok++;console.log('✅ '+nom);}
  else{ko++;console.log('❌ '+nom+'  attendu ~'+att+' (±'+tol+'), eu '+JSON.stringify(eu));} }

var RACINE=path.join(__dirname,'..','..','..');
var src=fs.readFileSync(path.join(RACINE,'FLINT','web','index.html'),'utf8');
function bloc(amorce){
  var i=src.indexOf(amorce);
  if(i<0)throw new Error('amorce introuvable : '+amorce);
  var d=0,j=src.indexOf('{',i);
  for(;;){ if(src[j]==='{')d++; else if(src[j]==='}'){d--; if(!d)break;} j++; }
  return src.slice(i,j+1);
}

global.window={};
/* Le jour de référence est figé : sans ça le banc dépendrait de l'heure à
   laquelle on le lance, et c'est exactement le genre de banc qui passe le matin
   et échoue le soir. */
var AUJ=[2026,8,11];
global.tk=function(off){
  var d=new Date(AUJ[0],AUJ[1]-1,AUJ[2]); if(off)d.setDate(d.getDate()+off);
  return d.getFullYear()+'-'+(d.getMonth()+1)+'-'+d.getDate();
};
/* Les trois constantes et la fonction, prises telles quelles dans le moteur. */
eval(src.slice(src.indexOf('var FLP_JOURS='), src.indexOf('var _flpCache=')));
global.FLP_JOURS=FLP_JOURS; global.FLP_MIN=FLP_MIN; global.FLP_REMONTEE=FLP_REMONTEE;
eval('var _flpCache={},_flpJour=null;');
eval(bloc('function flpCentile(tri,q){'));
eval(bloc('window.flPlageHabituelle=function(cle,lire,jusquA){'));
var plage=window.flPlageHabituelle;

/* ── 1. LE CENTILE, CONTRE DES VALEURS CALCULÉES À LA MAIN ───────────────────
   Interpolation linéaire entre les deux valeurs qui l'encadrent (numpy, R type
   7). Sur huit points le 25ᵉ centile tombe entre le deuxième et le troisième :
   c'est le cas qui compte, et c'est celui qu'on vérifie. */
var huit=[1,2,3,4,5,6,7,8];
v('centile 25 sur huit points entiers', 2.75, flpCentile(huit,0.25));
v('centile 75 sur huit points entiers', 6.25, flpCentile(huit,0.75));
v('centile 50 = la médiane',             4.5, flpCentile(huit,0.50));
v('centile 0 = le minimum',                1, flpCentile(huit,0));
v('centile 100 = le maximum',              8, flpCentile(huit,1));
v('un seul point : la même valeur des deux côtés', 7, flpCentile([7],0.25));

/* ── 2. LE SEUIL DE HUIT JOURS ───────────────────────────────────────────────
   Mesuré : sous huit jours mesurés, les bornes remuent de plus de dix pour cent
   de la médiane sur la mesure la plus dispersée. Une plage qui remue n'est pas
   une habitude. */
function serie(n){ return function(off){ var d=-off; return (d>=1&&d<=n)?d*10:null; }; }
for(var n=1;n<=7;n++){
  v('  '+n+' jour(s) mesuré(s) : pas de plage', null, plage('t'+n,serie(n),0));
}
var p8=plage('t8',serie(8),0);
v('  8 jours : la plage existe', true, p8!=null);
v('  et elle dit sur combien de jours elle repose', 8, p8&&p8.jours);

/* ── 3. LA FENÊTRE S'ARRÊTE À TRENTE JOURS MESURÉS ───────────────────────────
   Trente, c'est ce que « d'habitude » désigne. Au-delà on décrirait quelqu'un
   d'autre. */
var p50=plage('t50',serie(50),0);
v('  50 jours disponibles : on n en garde que trente', 30, p50&&p50.jours);

/* ── 4. LES TROUS NE COMPTENT PAS DOUBLE ─────────────────────────────────────
   Un bracelet retiré trois jours ne doit pas amputer l'habitude du tiers : on
   compte les jours MESURÉS, pas les jours de calendrier. */
function trouee(off){ var d=-off; if(d<1||d>20)return null; return (d%2===0)?null:d*10; }
var pt=plage('troue',trouee,0);
v('  un jour sur deux mesuré sur vingt : dix jours retenus', 10, pt&&pt.jours);

/* ── 5. LE JOUR AFFICHÉ EST EXCLU DE SON PROPRE JUGEMENT ─────────────────────
   Une valeur comparée à une plage qui la contient déjà se flatte toute seule. */
var vus=[];
function espion(off){ vus.push(off); var d=-off; return (d>=0&&d<=40)?100:null; }
plage('espion',espion,0);
v('  le jour affiché n est jamais lu',       false, vus.indexOf(0)>=0);
v('  on commence bien la veille',             -1, vus[0]);
var vus2=[];
function espion2(off){ vus2.push(off); return 100; }
plage('espion2',espion2,-5);
v('  en remontant au 5 août, le 5 est exclu', false, vus2.indexOf(-5)>=0);
v('  et on part du 4',                          -6, vus2[0]);

/* ── 6. DEUX BORNES ÉGALES NE SONT PAS UNE PLAGE ─────────────────────────────
   Ça arrive pour de vrai : une FC de repos parfaitement stable donne 50 – 50.
   C'est une bonne nouvelle, pas un intervalle. */
v('  une valeur constante ne produit pas de plage', null,
  plage('const',function(off){return (off<0&&off>=-20)?50:null;},0));

/* ── 7. NI NaN NI INFINI NE PASSENT ──────────────────────────────────────────
   `JSONSerialization` LÈVE sur un nombre non fini et c'est TOUTE la charge de
   l'écran qui devient nulle (v1207). Une division par zéro en amont ne doit pas
   emporter la page hebdo avec elle. */
function sale(off){ var d=-off; if(d<1||d>12)return null;
  if(d===3)return NaN; if(d===4)return Infinity; return d*10; }
var ps=plage('sale',sale,0);
v('  les valeurs non finies sont écartées', 10, ps&&ps.jours);
v('  la borne basse est finie', true, ps!=null&&isFinite(ps.min));
v('  la borne haute est finie', true, ps!=null&&isFinite(ps.max));

/* ── 8. UNE LECTURE QUI LÈVE NE TUE PAS LA PLAGE ─────────────────────────────
   Le moteur a déjà payé ça : un `catch` silencieux dans `flHrPropre` rendait le
   brut et le filtre paraissait tourner. Ici on veut l'inverse — un jour qui lève
   est un jour sans valeur, pas la fin du calcul. */
function boiteuse(off){ var d=-off; if(d===2)throw new Error('bim');
  return (d>=1&&d<=12)?d*10:null; }
var pb=plage('boiteuse',boiteuse,0);
v('  un jour qui lève est simplement sauté', 11, pb&&pb.jours);

/* ── 9. SUR LES VRAIES DONNÉES ───────────────────────────────────────────────
   Onze jours exportés du téléphone. Les valeurs attendues sont celles calculées
   indépendamment, en Python, sur le même export — pas recopiées de la sortie du
   moteur. */
var RELEVE=path.join(RACINE,'releves','donnees-felix-2026-08-11.json');
if(fs.existsSync(RELEVE)){
  var D=JSON.parse(fs.readFileSync(RELEVE,'utf8')).donnees;
  function pasDuJour(off){
    var w=D['watch_'+tk(off)]; if(!w)return null;
    var s=w.steps;
    if(Array.isArray(s)){var t=0;s.forEach(function(x){if(Array.isArray(x)&&x.length>1)t+=x[1];});return t||null;}
    return (s==null?null:+s);
  }
  function sommeilDuJour(off){
    var w=D['watch_'+tk(off)]; return (w&&w.night&&w.night.sleepMin)||null;
  }
  /* Le 11 août est le jour en cours : il est exclu, donc dix jours restent —
     un de moins que le seuil de huit, ce qui laisse la plage exister. */
  var pPas=plage('reel:pas',pasDuJour,0);
  v('  pas : dix jours complets retenus (le 11 est en cours)', 10, pPas&&pPas.jours);
  vProche('  pas : borne basse ~3 640', 3640, pPas&&Math.round(pPas.min), 40);
  vProche('  pas : borne haute ~6 829', 6829, pPas&&Math.round(pPas.max), 40);

  var pSom=plage('reel:sommeil',sommeilDuJour,0);
  v('  sommeil : dix nuits retenues', 10, pSom&&pSom.jours);
  vProche('  sommeil : borne basse ~358 min', 358, pSom&&Math.round(pSom.min), 6);
  vProche('  sommeil : borne haute ~484 min', 484, pSom&&Math.round(pSom.max), 6);

  /* LA PROPRIÉTÉ QUI JUSTIFIE TOUT LE CHOIX : « la moitié de tes jours sont
     dedans ». C'est ce qui rend la plage énonçable, et ce qu'aucune moyenne ±
     écart-type ne garantit.

     LE BANC M'A REPRIS ICI, ET IL AVAIT RAISON. J'attendais exactement 5 sur 10 ;
     il en compte 4. Ce n'est pas un défaut du calcul, c'est la différence entre
     une propriété de DISTRIBUTION et un décompte sur un échantillon fini. Sur
     dix valeurs triées, le 25ᵉ centile tombe à l'indice 2,25 et le 75ᵉ à 6,75 :
     les indices 3 à 6 sont dedans, soit quatre. Les deux voisins immédiats sont
     dehors d'un cheveu, par construction de l'interpolation.

     On vérifie donc ce qui est VRAI plutôt que ce qui sonne bien : entre 40 et
     60 % des jours, et jamais moins de deux jours de part et d'autre. Corriger
     le code pour obtenir 5 aurait voulu dire élargir la plage jusqu'à ce que le
     chiffre plaise — c'est-à-dire faire dire à la mesure ce qu'on avait décidé
     d'avance. */
  function dedans(lire,p){
    var n=0,tot=0;
    for(var d=1;d<=10;d++){var x=lire(-d); if(x==null)continue; tot++;
      if(x>=p.min&&x<=p.max)n++;}
    return [n,tot];
  }
  var dPas=dedans(pasDuJour,pPas), dSom=dedans(sommeilDuJour,pSom);
  v('  pas : entre 40 et 60 % des jours dans la plage (4/10)',
    true, dPas[0]>=0.4*dPas[1]&&dPas[0]<=0.6*dPas[1]);
  v('  sommeil : entre 40 et 60 % des nuits dans la plage (4/10)',
    true, dSom[0]>=0.4*dSom[1]&&dSom[0]<=0.6*dSom[1]);
  v('  pas : autant de jours au-dessus qu au-dessous',
    true, (function(){var a=0,b=0;for(var d=1;d<=10;d++){var x=pasDuJour(-d);
      if(x==null)continue; if(x<pPas.min)a++; if(x>pPas.max)b++;}return a===b;})());
}else{
  console.log('⏭  export absent — les vérifications sur données réelles sont sautées.');
}

console.log('\n'+ok+' vérifications passées, '+ko+' échouées.');
process.exit(ko?1:0);
