// Reads the user's iCloud calendars over CalDAV (browsers can't call iCloud directly).
// The iCloud credentials live in the Supabase table icloud_accounts, readable only by their owner.
const SB_URL="https://dzsdzwoabgswnqruarhe.supabase.co",SB_KEY="sb_publishable_w4HmYMGX1dySixUPJMoBzw_uTh38b2N";

const sb=(path,jwt,opt={})=>fetch(SB_URL+"/rest/v1/"+path,{...opt,headers:{apikey:SB_KEY,Authorization:"Bearer "+jwt,"Content-Type":"application/json",...(opt.headers||{})}});

async function dav(url,auth,method,depth,body){
  const r=await fetch(url,{method,headers:{Authorization:auth,Depth:String(depth),"Content-Type":"application/xml; charset=utf-8"},body});
  if(r.status===401)throw Object.assign(new Error("Identifiant Apple ou mot de passe d'app incorrect"),{code:401});
  if(r.status>=400)throw new Error("iCloud a répondu "+r.status);
  return {text:await r.text(),url:r.url};
}
const tag=(xml,name)=>{const m=xml.match(new RegExp("<(?:[\\w-]+:)?"+name+"[^>]*>([\\s\\S]*?)</(?:[\\w-]+:)?"+name+">"));return m?m[1]:null};
const href=x=>{const h=tag(x||"","href");return h&&h.trim()};
const unx=s=>s.replace(/&lt;/g,"<").replace(/&gt;/g,">").replace(/&quot;/g,'"').replace(/&apos;/g,"'").replace(/&amp;/g,"&");

async function calendars(auth){
  const base="https://caldav.icloud.com";
  const p1=await dav(base+"/",auth,"PROPFIND",0,'<d:propfind xmlns:d="DAV:"><d:prop><d:current-user-principal/></d:prop></d:propfind>');
  const principal=href(tag(p1.text,"current-user-principal"));
  const p2=await dav(new URL(principal,base).href,auth,"PROPFIND",0,'<d:propfind xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav"><d:prop><c:calendar-home-set/></d:prop></d:propfind>');
  const home=new URL(href(tag(p2.text,"calendar-home-set")),base).href;
  const p3=await dav(home,auth,"PROPFIND",1,'<d:propfind xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav" xmlns:a="http://apple.com/ns/ical/"><d:prop><d:displayname/><d:resourcetype/><a:calendar-color/><c:supported-calendar-component-set/></d:prop></d:propfind>');
  return p3.text.split(/<(?:[\w-]+:)?response[\s>]/).slice(1).filter(r=>/calendar[\s/>]/.test(tag(r,"resourcetype")||"")&&/VEVENT/.test(r)).map(r=>({
    href:new URL(href(r),home).href,name:unx(tag(r,"displayname")||"Calendrier"),color:((tag(r,"calendar-color")||"#7fa7d9").trim()).slice(0,7)}));
}

// Event length in minutes, from DTEND or DURATION (null when unknown).
function dur(ev){const t=v=>{const m=(v||"").match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2}))?/);return m?Date.UTC(m[1],m[2]-1,m[3],m[4]||0,m[5]||0):null};
  const s=t(ev.start.replace(/[-:]/g,""));if(ev.DTEND){const e=t(ev.DTEND);return e&&s!=null?Math.round((e-s)/6e4):null}
  const d=(ev.DURATION||"").match(/P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?/);return d&&d[0].length>1?(+(d[1]||0))*1440+(+(d[2]||0))*60+(+(d[3]||0)):null}
function parseIcs(ics){
  const lines=unx(ics).replace(/\r?\n[ \t]/g,"").split(/\r?\n/),out=[];let ev=null;
  for(const l of lines){
    if(l==="BEGIN:VEVENT")ev={};else if(l==="END:VEVENT"){if(ev&&ev.start){ev.dur=dur(ev);delete ev.DTEND;delete ev.DURATION;out.push(ev)}ev=null}
    else if(ev){const i=l.indexOf(":");if(i<0)continue;const k=l.slice(0,i),v=l.slice(i+1),key=k.split(";")[0];
      if(key==="SUMMARY")ev.title=v.replace(/\\([,;\\])/g,"$1").replace(/\\n/gi," ");
      if(key==="DTEND"||key==="DURATION")ev[key]=v;
      if(key==="DTSTART"){ev.allDay=/VALUE=DATE(;|$)/.test(k)||/^\d{8}$/.test(v);
        const m=v.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?/);
        ev.start=m[4]?(m[7]?`${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}Z`:`${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}`):`${m[1]}-${m[2]}-${m[3]}`}}}
  return out;
}
const utc=d=>d.toISOString().replace(/[-:]/g,"").replace(/\.\d+/,"");

async function events(auth,cals,from,to){
  const body=`<c:calendar-query xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav"><d:prop><c:calendar-data><c:expand start="${utc(from)}" end="${utc(to)}"/></c:calendar-data></d:prop><c:filter><c:comp-filter name="VCALENDAR"><c:comp-filter name="VEVENT"><c:time-range start="${utc(from)}" end="${utc(to)}"/></c:comp-filter></c:comp-filter></c:filter></c:calendar-query>`;
  const plain=body.replace(/<c:expand[^>]*\/>/,"");
  const all=await Promise.all(cals.map(async c=>{let r;
    // Some iCloud calendars refuse server-side expansion of recurring events; fall back to plain events.
    try{r=await dav(c.href,auth,"REPORT",1,body)}catch(e){if(e.code===401)throw e;r=await dav(c.href,auth,"REPORT",1,plain)}
    return r.text.replace(/<!\[CDATA\[|\]\]>/g,"").split(/<(?:[\w-]+:)?calendar-data[^>]*>/).slice(1).flatMap(x=>parseIcs(x.split(/<\/(?:[\w-]+:)?calendar-data>/)[0])).map(e=>({...e,cal:c.i}))}));
  return all.flat();
}

module.exports=async(req,res)=>{
  try{
    const jwt=(req.headers.authorization||"").replace(/^Bearer /,"");
    if(!jwt)return res.status(401).json({error:"Connecte d'abord la synchronisation dans Réglages"});
    const b=typeof req.body==="string"?JSON.parse(req.body||"{}"):(req.body||{});
    let acc;
    if(b.action==="connect"){acc={apple_id:String(b.appleId||"").trim(),app_password:String(b.password||"").trim()};}
    else{const r=await sb("icloud_accounts?select=apple_id,app_password",jwt);const rows=await r.json();
      if(!r.ok)return res.status(401).json({error:"Session expirée, reconnecte-toi"});acc=rows[0];
      if(!acc)return res.status(404).json({error:"Calendrier non connecté"});}
    const auth="Basic "+Buffer.from(acc.apple_id+":"+acc.app_password).toString("base64");
    if(b.action==="connect"){
      const cals=await calendars(auth);
      const w=await sb("icloud_accounts",jwt,{method:"POST",headers:{Prefer:"resolution=merge-duplicates"},body:JSON.stringify(acc)});
      if(!w.ok)return res.status(500).json({error:"Enregistrement impossible : as-tu lancé le script SQL du calendrier ?"});
      return res.json({calendars:cals});
    }
    if(b.action==="disconnect"){await sb("icloud_accounts?user_id=not.is.null",jwt,{method:"DELETE"});return res.json({ok:true})}
    if(b.action==="calendars")return res.json({calendars:await calendars(auth)});
    const ev=await events(auth,b.cals||[],new Date(b.from),new Date(b.to));
    return res.json({events:ev});
  }catch(e){res.status(e.code===401?401:500).json({error:e.message})}
};
