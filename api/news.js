// Today's main headlines from a few French news feeds, for the Journal (cached by Vercel for 30 min).
const FEEDS=[["Le Monde","https://www.lemonde.fr/rss/une.xml"],["franceinfo","https://www.francetvinfo.fr/titres.rss"],["Les Échos","https://syndication.lesechos.fr/rss/rss_une.xml"]];
const NAMED={amp:"&",lt:"<",gt:">",quot:'"',apos:"’",nbsp:" ",rsquo:"’",lsquo:"‘",laquo:"«",raquo:"»",hellip:"…",eacute:"é",egrave:"è",agrave:"à",ccedil:"ç",ecirc:"ê",ocirc:"ô",ucirc:"û",icirc:"î",euml:"ë",iuml:"ï",oelig:"œ",ndash:"–",mdash:"—",euro:"€"};
// Feeds escape entities once or twice (&amp;#xE9;): decode until stable.
const dec=t=>{for(let k=0;k<3;k++){const n=t.replace(/&#x([0-9a-f]+);/gi,(_,h)=>String.fromCodePoint(parseInt(h,16))).replace(/&#(\d+);/g,(_,d)=>String.fromCodePoint(+d)).replace(/&([a-z]+);/gi,(m,w)=>NAMED[w.toLowerCase()]??m);if(n===t)break;t=n}return t};
const ent=s=>dec(s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g,"$1")).replace(/<[^>]+>/g,"").replace(/\s+/g," ").trim();
const tag=(x,t)=>{const m=x.match(new RegExp(`<${t}[^>]*>([\\s\\S]*?)</${t}>`));return m?ent(m[1]):""};
async function feed([src,url],n=6){try{const r=await fetch(url,{headers:{"User-Agent":"Deck"}});if(!r.ok)return [];const x=await r.text();
  return x.split(/<item[\s>]/).slice(1,n+1).map(it=>({t:tag(it,"title"),src,cat:tag(it,"category")||"Actu",sum:tag(it,"description").slice(0,280),url:tag(it,"link"),d:Date.parse(tag(it,"pubDate"))||0})).filter(a=>a.t)}catch(e){return []}}
module.exports=async(req,res)=>{
  // ?q=keywords: the veille commerciale, from Google News search (titles end with " - Source").
  const q=String((req.query&&req.query.q)||"").trim().slice(0,200);
  if(q){const a=(await feed(["",`https://news.google.com/rss/search?q=${encodeURIComponent(q+" when:2d")}&hl=fr&gl=FR&ceid=FR:fr`],12)).map(x=>{const m=x.t.match(/^(.*) - ([^-]+)$/);return m?{...x,t:m[1],src:m[2].trim(),cat:"Veille",sum:""}:{...x,cat:"Veille",sum:""}});
    res.setHeader("Cache-Control","s-maxage=1800, stale-while-revalidate=3600");return res.json({articles:a})}
  const all=await Promise.all(FEEDS.map(f=>feed(f)));
  // Interleave sources so the rotation alternates between papers.
  const out=[];for(let i=0;i<6;i++)all.forEach(a=>{if(a[i])out.push(a[i])});
  res.setHeader("Cache-Control","s-maxage=1800, stale-while-revalidate=3600");res.json({articles:out})};
