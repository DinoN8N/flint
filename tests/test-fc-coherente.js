/* LA MINUTE COHÉRENTE, REJOUÉE SUR LES VRAIES MINUTES DE LA RANDONNÉE.
   17 août 2026. Dino : « à 9h40 selon FLINT j'ai atteint mon pic à 190, alors
   que WHOOP dit que j'étais encore en phase calme ». Le brut lui donne raison :
   la minute 09h40 recolle deux séries (six échantillons à ~189 puis une chute
   de 20 bpm en 5 s) — un fragment mal daté, pas un cœur. La règle : le MAXIMUM
   d'une séance ne se lit que sur les minutes cohérentes (aucun saut > 15 bpm
   entre échantillons consécutifs, au moins 4 échantillons).
   Ce banc rejoue la vraie fonction sur les VRAIES minutes du téléphone. */
var fs=require('fs'), path=require('path');
var ok=0,ko=0;
function v(nom,att,eu){ if(att===eu){ok++;console.log('✅ '+nom);}
  else{ko++;console.log('❌ '+nom+'  attendu '+att+', eu '+eu);} }

/* ── la VRAIE fonction, extraite du moteur ─────────────────────────────────── */
var src=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
var i=src.indexOf('function flMinuteCoherente(vs){');
if(i<0){console.log('❌ flMinuteCoherente introuvable dans le moteur');process.exit(1);}
var d=0,j=i;
for(;;){ if(src[j]==='{')d++; else if(src[j]==='}'){d--; if(!d)break;} j++; }
var coherente=new Function(src.slice(i,j+1)+';return flMinuteCoherente;')();

/* ── les minutes réelles du 16 août (cas-dino-2026-08-16.json) ─────────────── */
var DINO=JSON.parse(fs.readFileSync(path.join(__dirname,'cas-dino-2026-08-16.json'),'utf8'));
var hf=DINO.hrfine;

v('09h39 (167 → 134 en 5 s) est INCOHÉRENTE', false, coherente(hf['579']));
v('09h40 (le « pic à 190 », 187 → 167 en 5 s) est INCOHÉRENTE', false, coherente(hf['580']));
v('09h42 (plateau régulier) est cohérente', true, coherente(hf['582']));
v('10h00 (plateau régulier) est cohérente', true, coherente(hf['600']));

/* ── le maximum de la séance, recalculé par la règle ───────────────────────── */
var cohMax=null, suspectes=0;
for(var m=578;m<=660;m++){
 var vs=hf[''+m]; if(!vs||!vs.length)continue;
 if(vs.length>=4&&coherente(vs)){
  var mx=Math.max.apply(null,vs);
  if(cohMax==null||mx>cohMax)cohMax=mx;
 }else if(vs.length>=4)suspectes++;
}
v('des minutes suspectes existent sur la randonnée', true, suspectes>0);
v('le maximum cohérent est 183 (WHOOP dit 184 — accord)', 183, cohMax);
v('le 190 du fragment recollé ne fait plus le record', true, cohMax<190);

/* ── les cas de bord ───────────────────────────────────────────────────────── */
v('une minute d\'un seul échantillon ne se contredit pas', true, coherente([120]));
v('un fractionné RÉEL (montée 10 bpm/5 s) reste cohérent', true,
  coherente([120,130,140,150,160,168,174,178,180,181,180,179]));

console.log('\n'+ok+' réussis, '+ko+' échoués');
if(ko)process.exitCode=1;
