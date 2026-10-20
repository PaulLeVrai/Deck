// Today's main headlines from a few French news feeds, for the Journal (cached by Vercel for 30 min).
const FEEDS=[["Le Monde","https://www.lemonde.fr/rss/une.xml"],["franceinfo","https://www.francetvinfo.fr/titres.rss"],["Les Échos","https://syndication.lesechos.fr/rss/rss_une.xml"]];
const ent=s=>s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g,"$1").replace(/<[^>]+>/g,"").replace(/&amp;/g,"&").replace(/&lt;/g,"<").replace(/&gt;/g,">").replace(/&quot;/g,'"').replace(/&#0?39;|&apos;|&#8217;/g,"’").replace(/&#(\d+);/g,(_,n)=>String.fromCharCode(n)).replace(/\s+/g," ").trim();
const tag=(x,t)=>{const m=x.match(new RegExp(`<${t}[^>]*>([\\s\\S]*?)</${t}>`));return m?ent(m[1]):""};
async function feed([src,url]){try{const r=await fetch(url,{headers:{"User-Agent":"Deck"}});if(!r.ok)return [];const x=await r.text();
  return x.split(/<item[\s>]/).slice(1,7).map(it=>({t:tag(it,"title"),src,cat:tag(it,"category")||"Actu",sum:tag(it,"description").slice(0,280),url:tag(it,"link"),d:Date.parse(tag(it,"pubDate"))||0})).filter(a=>a.t)}catch(e){return []}}
module.exports=async(req,res)=>{const all=await Promise.all(FEEDS.map(feed));
  // Interleave sources so the rotation alternates between papers.
  const out=[];for(let i=0;i<6;i++)all.forEach(a=>{if(a[i])out.push(a[i])});
  res.setHeader("Cache-Control","s-maxage=1800, stale-while-revalidate=3600");res.json({articles:out})};
