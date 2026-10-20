// Deck MCP server (Streamable HTTP, JSON responses) so Claude can read and change Deck data.
// The personal token in the URL (?k=...) maps to the user through security-definer SQL functions.
const SB_URL="https://dzsdzwoabgswnqruarhe.supabase.co",SB_KEY="sb_publishable_w4HmYMGX1dySixUPJMoBzw_uTh38b2N";
const rpc=async(fn,args)=>{const r=await fetch(SB_URL+"/rest/v1/rpc/"+fn,{method:"POST",headers:{apikey:SB_KEY,Authorization:"Bearer "+SB_KEY,"Content-Type":"application/json"},body:JSON.stringify(args)});
  const t=await r.text();if(!r.ok)throw new Error(/jeton/.test(t)?"Jeton Deck invalide":"Base de données : "+t.slice(0,160));return JSON.parse(t)};

const TZ="Europe/Paris";
const today=()=>{const p=new Intl.DateTimeFormat("en-CA",{timeZone:TZ,year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",hour12:false}).formatToParts(new Date());const g=k=>+p.find(x=>x.type===k).value;return new Date(g("year"),g("month")-1,g("day"),g("hour"))};
const JOURS=["Dimanche","Lundi","Mardi","Mercredi","Jeudi","Vendredi","Samedi"],MOIS=["janvier","février","mars","avril","mai","juin","juillet","août","septembre","octobre","novembre","décembre"];
// The app stores task dates as a day number relative to the current month (same as its own dOf()).
const dayNum=iso=>{const t=today(),d=new Date(iso+"T12:00:00");return Math.round((new Date(d.getFullYear(),d.getMonth(),d.getDate())-new Date(t.getFullYear(),t.getMonth(),1))/864e5)+1};
const dLabel=n=>{const t=today();if(n==null)return"Un jour";if(n===t.getDate())return"Aujourd'hui";if(n===t.getDate()+1)return"Demain";const d=new Date(t.getFullYear(),t.getMonth(),n);return JOURS[d.getDay()]+" "+d.getDate()+(d.getMonth()!==t.getMonth()?" "+MOIS[d.getMonth()].slice(0,4)+".":"")};
const nf=a=>a.toLocaleString("fr-FR",{minimumFractionDigits:a%1?2:0,maximumFractionDigits:2});
const norm=s=>String(s||"").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g,"");
const find=(arr,q,f)=>{const n=norm(q);return arr.findIndex(x=>norm(f(x)).includes(n))};
const esc=s=>String(s).replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
const REC={tous_les_jours:"Tous les jours",un_jour_sur_deux:"Un jour sur deux",tous_les_3_jours:"Tous les 3 jours",chaque_semaine:"Chaque semaine",une_semaine_sur_deux:"Une semaine sur deux",une_fois_par_mois:"Une fois par mois"};

function base(d){d.v=2;d.data=d.data||{};const D=d.data;for(const k of["tasks","habits","goals","projects","money","sess"])D[k]=D[k]||[];D.fin=D.fin||{bal:0,out:0,inn:0,inv:0};d.nb=d.nb||[];d.folders=d.folders||["Favoris","Ecole","Pro","Perso","Cockpit","Veille"];d.books=d.books||[];return d}
const taskLine=x=>`${x.done?"[fait] ":""}${x.t} · ${x.d||"sans date"}${x.i?" · important":""}`;

const TOOLS=[
 ["resume_du_jour","Résumé de la journée de Paul dans Deck : tâches du jour et en retard, habitudes, dernières données Santé.",{}],
 ["lister_taches","Liste les tâches Deck.",{filtre:{type:"string",enum:["a_faire","faites","toutes"],description:"Défaut : a_faire"}}],
 ["ajouter_tache","Crée une tâche dans Deck.",{titre:{type:"string"},date:{type:"string",description:"AAAA-MM-JJ, omis = sans date"},important:{type:"boolean"}},["titre"]],
 ["terminer_tache","Coche une tâche (recherche par une partie du titre).",{titre:{type:"string"}},["titre"]],
 ["modifier_tache","Change la date ou l'importance d'une tâche.",{titre:{type:"string"},date:{type:"string",description:"AAAA-MM-JJ ou vide pour sans date"},important:{type:"boolean"}},["titre"]],
 ["supprimer_tache","Supprime une tâche. Demande toujours confirmation à Paul avant.",{titre:{type:"string"}},["titre"]],
 ["ajouter_habitude","Crée une habitude.",{titre:{type:"string"},recurrence:{type:"string",enum:Object.keys(REC)}},["titre"]],
 ["valider_habitude","Coche une habitude pour aujourd'hui.",{titre:{type:"string"}},["titre"]],
 ["ajouter_note","Crée une note.",{titre:{type:"string"},contenu:{type:"string"},dossier:{type:"string",description:"Ecole, Pro, Perso, Cockpit, Favoris, Veille ou un dossier existant"}},["titre"]],
 ["chercher","Cherche un texte dans les tâches, notes, projets, objectifs et livres.",{texte:{type:"string"}},["texte"]],
 ["ajouter_projet","Crée un projet.",{nom:{type:"string"},prochaine_etape:{type:"string"}},["nom"]],
 ["ajouter_objectif","Crée un objectif.",{titre:{type:"string"},domaine:{type:"string"},echeance:{type:"string",description:"ex. décembre 2026"}},["titre"]],
 ["ajouter_operation","Ajoute une opération financière.",{type:{type:"string",enum:["depense","revenu","investissement"]},libelle:{type:"string"},montant:{type:"number"},categorie:{type:"string"}},["type","libelle","montant"]],
 ["lire_finances","Solde, revenus, dépenses, investissements et dernières opérations.",{}],
];

async function run(name,a,token){
  const st=await rpc("claude_get_state",{p_token:token}),d=base(st.data||{}),D=d.data,t=today(),tn=t.getDate();let save=false,out;
  const late=x=>!x.done&&x.e!=null&&x.e<tn,todayT=x=>x.e===tn||late(x);
  switch(name){
  case "resume_du_jour":{const tt=D.tasks.filter(x=>!x.done&&todayT(x)),hb=D.habits,h=st.health;
    out=`${JOURS[t.getDay()]} ${tn} ${MOIS[t.getMonth()]}.\nTâches du jour (${tt.length}) :\n${tt.map(x=>"- "+taskLine(x)+(late(x)?" · en retard":"")).join("\n")||"- aucune"}\nHabitudes (${hb.filter(x=>x.done).length}/${hb.length} faites) :\n${hb.map(x=>`- ${x.done?"[fait] ":""}${x.t}`).join("\n")||"- aucune"}\nSanté : ${h?`${h.day} · sommeil ${h.sleep_minutes!=null?Math.floor(h.sleep_minutes/60)+" h "+(h.sleep_minutes%60):"?"} · VFC ${h.hrv??"?"} · FC repos ${h.resting_hr??"?"} · pas ${h.steps??"?"}`:"pas encore de données"}`;break}
  case "lister_taches":{const f=a.filtre||"a_faire",l=D.tasks.filter(x=>f==="toutes"||(f==="faites"?x.done:!x.done));out=l.map(x=>"- "+taskLine(x)).join("\n")||"Aucune tâche.";break}
  case "ajouter_tache":{const e=a.date?dayNum(a.date):null;D.tasks.push({t:a.titre,p:"Perso",d:dLabel(e),done:false,i:a.important?1:0,c:tn,e});save=true;out=`Tâche ajoutée : ${a.titre} (${dLabel(e)}).`;break}
  case "terminer_tache":case "modifier_tache":case "supprimer_tache":{const i=find(D.tasks,a.titre,x=>x.t);if(i<0){out=`Aucune tâche ne contient « ${a.titre} ».`;break}const x=D.tasks[i];
    if(name==="terminer_tache"){x.done=true;out=`Fait : ${x.t}.`}
    else if(name==="supprimer_tache"){D.tasks.splice(i,1);out=`Supprimée : ${x.t}.`}
    else{if(a.date!==undefined){x.e=a.date?dayNum(a.date):null;x.d=dLabel(x.e);x.late=false}if(a.important!==undefined)x.i=a.important?1:0;out=`Modifiée : ${taskLine(x)}.`}
    save=true;break}
  case "ajouter_habitude":D.habits.push({t:a.titre,w:[0,0,0,0,0,0],done:false,s:0,r:REC[a.recurrence]||"Tous les jours"});save=true;out=`Habitude ajoutée : ${a.titre}.`;break;
  case "valider_habitude":{const i=find(D.habits,a.titre,x=>x.t);if(i<0){out=`Aucune habitude ne contient « ${a.titre} ».`;break}const h=D.habits[i];if(!h.done){h.done=true;h.s=(h.s||0)+1}save=true;out=`Habitude validée : ${h.t}.`;break}
  case "ajouter_note":{const id=Math.max(0,...d.nb.map(n=>+n.id||0))+1,txt=a.contenu||"",f=a.dossier&&d.folders.find(x=>norm(x)===norm(a.dossier));if(a.dossier&&!f)d.folders.push(a.dossier);
    d.nb.push({id,title:a.titre,body:txt.split(/\n+/).map(p=>`<p>${esc(p)}</p>`).join(""),sum:txt.slice(0,90),folder:f||a.dossier||"Perso",manual:!!a.dossier,ts:Date.now(),when:"À l'instant"});save=true;out=`Note créée : ${a.titre} (${f||a.dossier||"Perso"}).`;break}
  case "chercher":{const q=norm(a.texte),hit=s=>norm(s).includes(q);
    const r=[...D.tasks.filter(x=>hit(x.t)).map(x=>"Tâche : "+taskLine(x)),...d.nb.filter(n=>hit(n.title+" "+(n.body||"").replace(/<[^>]+>/g," "))).map(n=>`Note : ${n.title} (${n.folder}) : ${(n.body||"").replace(/<[^>]+>/g," ").slice(0,200)}`),
      ...D.projects.filter(p=>hit(p[0])).map(p=>"Projet : "+p[0]),...D.goals.filter(g=>hit(g[0])).map(g=>`Objectif : ${g[0]} (${g[1]} %)`),...d.books.filter(b=>hit(b.t+" "+(b.a||""))).map(b=>`Livre : ${b.t} (${b.cur||0}/${b.tot||"?"} p.)`)];
    out=r.join("\n")||"Rien trouvé.";break}
  case "ajouter_projet":{const kw=norm(a.nom).split(/[^a-z0-9]+/).filter(w=>w.length>=4);D.projects.unshift([a.nom,a.prochaine_etape||"Nouveau projet",0,kw]);save=true;out=`Projet créé : ${a.nom}.`;break}
  case "ajouter_objectif":D.goals.push([a.titre,0,(a.domaine||"Perso")+(a.echeance?" · "+a.echeance:""),"Démarré aujourd'hui"]);save=true;out=`Objectif créé : ${a.titre}.`;break;
  case "ajouter_operation":{const m=Math.abs(+a.montant),k=a.type==="depense"?"d":a.type==="investissement"?"i":"r";if(!m){out="Montant invalide.";break}
    D.money.unshift([a.libelle,k==="r"?"Revenus":a.categorie||(k==="d"?"Autre":"Actions"),(k==="d"?"−":k==="r"?"+":"")+nf(m)+" €",k]);D.fin.bal+=k==="r"?m:-m;if(k==="d")D.fin.out+=m;else if(k==="i")D.fin.inv+=m;else D.fin.inn+=m;save=true;out=`Opération ajoutée : ${a.libelle} ${nf(m)} €.`;break}
  case "lire_finances":{const F=D.fin;out=`Solde ${nf(F.bal)} € · revenus ${nf(F.inn)} € · dépenses ${nf(F.out)} € · investis ${nf(F.inv)} €\n${D.money.slice(0,15).map(m=>`- ${m[0]} · ${m[1]} · ${m[2]}`).join("\n")}`;break}
  default:throw new Error("Outil inconnu : "+name)}
  if(save)await rpc("claude_set_state",{p_token:token,p_data:d});
  return out;
}

module.exports=async(req,res)=>{
  res.setHeader("Access-Control-Allow-Origin","*");res.setHeader("Access-Control-Allow-Headers","*");res.setHeader("Access-Control-Allow-Methods","GET,POST,OPTIONS,DELETE");
  if(req.method==="OPTIONS")return res.status(204).end();
  if(req.method!=="POST")return res.status(405).json({error:"POST attendu"});
  const token=(req.query&&req.query.k)||(req.headers.authorization||"").replace(/^Bearer /,"");
  const b=typeof req.body==="string"?JSON.parse(req.body||"{}"):(req.body||{});
  const one=async m=>{const id=m.id;if(id===undefined)return null;
    try{switch(m.method){
      case "initialize":return {jsonrpc:"2.0",id,result:{protocolVersion:(m.params&&m.params.protocolVersion)||"2025-03-26",capabilities:{tools:{}},serverInfo:{name:"deck",version:"1.0.0"},instructions:"Deck est l'application personnelle de Paul (tâches, habitudes, notes, projets, objectifs, finances, santé). Réponds en français. Demande confirmation avant toute suppression."}};
      case "ping":return {jsonrpc:"2.0",id,result:{}};
      case "tools/list":return {jsonrpc:"2.0",id,result:{tools:TOOLS.map(([name,description,props,req])=>({name,description,inputSchema:{type:"object",properties:props,required:req||[]}}))}};
      case "tools/call":{if(!token)throw new Error("Jeton Deck manquant dans l'adresse du connecteur");const text=await run(m.params.name,m.params.arguments||{},token);return {jsonrpc:"2.0",id,result:{content:[{type:"text",text}]}}}
      default:return {jsonrpc:"2.0",id,error:{code:-32601,message:"Méthode inconnue"}}}}
    catch(e){return m.method==="tools/call"?{jsonrpc:"2.0",id,result:{content:[{type:"text",text:"Erreur : "+e.message}],isError:true}}:{jsonrpc:"2.0",id,error:{code:-32000,message:e.message}}}};
  const out=Array.isArray(b)?(await Promise.all(b.map(one))).filter(Boolean):await one(b);
  if(!out||(Array.isArray(out)&&!out.length))return res.status(202).end();
  res.setHeader("Content-Type","application/json");res.status(200).send(JSON.stringify(out));
};
