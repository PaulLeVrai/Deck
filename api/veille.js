// Daily veille commerciale: Claude searches the web with Paul's brief and returns his JSON note.
// One generation per day: the CDN caches /api/veille?d=YYYY-MM-DD for the day; the morning cron warms it.
// Needs ANTHROPIC_API_KEY in the Vercel environment.
const BRIEF=require("../lib/veille-brief");
const SHAPE=`Réponds uniquement par un objet JSON, sans Markdown ni texte autour, exactement de cette forme (texte brut, sans émojis dans les champs) :
{"date":"AAAA-MM-JJ","title":"Veille du JJ/MM/AAAA","alert":"elevee|moyenne|faible","essentiel":[{"level":"elevee|moyenne|faible","text":"le fait, une phrase courte","impact":"l'impact ou l'action pour le magasin, une phrase"}],"sections":[{"name":"1. Veille concurrentielle","items":[{"level":"elevee|moyenne|faible","title":"titre court","text":"1 à 2 phrases","action":"action concrète","sources":[{"label":"nom du média","url":"https://…"}]}]},{"name":"2. Veille sectorielle / marché","items":[]},{"name":"3. Veille technologique","items":[]},{"name":"4. Veille réglementaire et juridique","items":[]},{"name":"5. Veille économique et financière","items":[]}],"window":"Fenêtre couverte : … (heure de Paris)."}
"alert" est le niveau le plus élevé trouvé dans la note.`;
const paris=()=>new Date(new Date().toLocaleString("en-US",{timeZone:"Europe/Paris"}));
async function generate(day){const key=process.env.ANTHROPIC_API_KEY;if(!key)throw Object.assign(new Error("Clé Claude absente (ANTHROPIC_API_KEY)"),{code:501});
  const d=new Date(day+"T08:00:00"),monday=d.getDay()===1;
  const messages=[{role:"user",content:`${BRIEF}\n\nNous sommes le ${day} (heure de Paris)${monday?", un lundi : couvre les 72 dernières heures":" : couvre les 24 dernières heures"}.\n\n${SHAPE}`}];
  // Web search can pause a long turn (pause_turn): send the partial answer back until it finishes.
  for(let k=0;k<4;k++){const r=await fetch("https://api.anthropic.com/v1/messages",{method:"POST",headers:{"content-type":"application/json","x-api-key":key,"anthropic-version":"2023-06-01","anthropic-beta":"server-side-fallback-2026-07-01"},
      body:JSON.stringify({model:"claude-opus-5-5",max_tokens:16000,output_config:{effort:"medium"},fallbacks:"default",tools:[{type:"web_search_20260209",name:"web_search",max_uses:10,user_location:{type:"approximate",country:"FR",timezone:"Europe/Paris"}}],messages})});
    const j=await r.json();if(!r.ok)throw new Error((j.error&&j.error.message)||"Claude indisponible");
    if(j.stop_reason==="pause_turn"){messages.push({role:"assistant",content:j.content});continue}
    if(j.stop_reason==="refusal")throw new Error("Claude a refusé la demande");
    const txt=j.content.filter(c=>c.type==="text").map(c=>c.text).join(""),m=txt.match(/\{[\s\S]*\}/);if(!m)throw new Error("Réponse illisible");
    const v=JSON.parse(m[0]);v.date=day;return v}
  throw new Error("Recherche trop longue")}
module.exports=async(req,res)=>{const q=req.query||{},day=/^\d{4}-\d{2}-\d{2}$/.test(q.d||"")?q.d:paris().toISOString().slice(0,10);
  // Cron call (no date): request today's URL through the CDN so the generated note gets cached.
  if(!q.d){try{const r=await fetch(`https://${req.headers.host}/api/veille?d=${day}`);return res.status(r.status).json({warmed:day})}catch(e){return res.status(500).json({error:e.message})}}
  try{const v=await generate(day);res.setHeader("Cache-Control","s-maxage=86400, stale-while-revalidate=600");res.json(v)}
  catch(e){res.setHeader("Cache-Control","no-store");res.status(e.code||500).json({error:e.message})}};
module.exports.config={maxDuration:300};
