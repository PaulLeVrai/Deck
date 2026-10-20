// Fetches a public calendar link (webcal:// or https .ics, e.g. an iCloud public share) and returns
// its events between from and to, with recurring events expanded. Needed because browsers block cross-site ICS.
const unfold=t=>t.replace(/\r?\n[ \t]/g,"").split(/\r?\n/);
const pd=(v,k)=>{const m=v.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?/);if(!m)return null;
  const allDay=!m[4]||/VALUE=DATE(;|$)/.test(k);
  // All dates are computed in UTC; times without Z are "floating" (local wall-clock) and sent back without Z.
  const d=new Date(Date.UTC(+m[1],m[2]-1,+m[3],+(m[4]||0),+(m[5]||0),+(m[6]||0)));
  return {d,allDay,utc:!!m[7]}};
const DOW={SU:0,MO:1,TU:2,WE:3,TH:4,FR:5,SA:6};
function parse(ics){const out=[];let ev=null,name=null;
  for(const l of unfold(ics)){
    if(l.startsWith("X-WR-CALNAME:"))name=l.slice(13).trim();
    if(l==="BEGIN:VEVENT")ev={ex:[]};else if(l==="END:VEVENT"){if(ev&&ev.start)out.push(ev);ev=null}
    else if(ev){const i=l.indexOf(":");if(i<0)continue;const k=l.slice(0,i),v=l.slice(i+1),key=k.split(";")[0];
      if(key==="SUMMARY")ev.title=v.replace(/\\([,;\\])/g,"$1").replace(/\\n/gi," ");
      else if(key==="DTSTART"){const p=pd(v,k);if(p){ev.start=p.d;ev.allDay=p.allDay;ev.utc=p.utc}}
      else if(key==="DTEND"){const p=pd(v,k);if(p)ev.end=p.d}
      else if(key==="RRULE")ev.rr=Object.fromEntries(v.split(";").map(x=>x.split("=")));
      else if(key==="EXDATE")v.split(",").forEach(x=>{const p=pd(x,k);if(p)ev.ex.push(p.d.getTime())});
      else if(key==="RECURRENCE-ID")ev.rid=true;
      else if(key==="STATUS"&&v==="CANCELLED")ev.cancel=true}}
  return {name,events:out.filter(e=>!e.cancel)}}
function expand(e,from,to){const res=[],push=d=>{if(d>=from&&d<to&&!e.ex.includes(d.getTime()))res.push(d)};
  if(!e.rr){push(e.start);return res}
  const r=e.rr,iv=+(r.INTERVAL||1),cnt=r.COUNT?+r.COUNT:Infinity,until=r.UNTIL?pd(r.UNTIL,"").d:null,f=r.FREQ;
  const by=r.BYDAY?r.BYDAY.split(",").map(x=>DOW[x.slice(-2)]):null;let n=0;
  const s=e.start,step=(k)=>{const d=new Date(s);if(f==="DAILY")d.setUTCDate(s.getUTCDate()+k*iv);else if(f==="WEEKLY")d.setUTCDate(s.getUTCDate()+7*k*iv);else if(f==="MONTHLY")d.setUTCMonth(s.getUTCMonth()+k*iv);else if(f==="YEARLY")d.setUTCFullYear(s.getUTCFullYear()+k*iv);return d};
  for(let k=0;k<5000;k++){const b=step(k);if(until&&b>until||b>=to)break;
    const days=f==="WEEKLY"&&by?by.map(w=>{const d=new Date(b);d.setUTCDate(b.getUTCDate()-((b.getUTCDay()+6)%7)+((w+6)%7));return d}).sort((x,y)=>x-y):[b];
    for(const d of days){if(d<s)continue;if(until&&d>until)break;if(++n>cnt)return res;push(d)}}
  return res}
module.exports=async(req,res)=>{
  try{let url=String((req.query&&req.query.url)||"").trim().replace(/^webcals?:\/\//i,"https://");
    if(!/^https:\/\//i.test(url))return res.status(400).json({error:"Lien invalide : il doit commencer par webcal:// ou https://"});
    const from=new Date(new Date(req.query.from||Date.now()).getTime()-864e5),to=new Date(new Date(req.query.to||Date.now()+7*864e5).getTime()+864e5);
    const r=await fetch(url,{headers:{"User-Agent":"Deck"}});if(!r.ok)return res.status(502).json({error:"Le calendrier a répondu "+r.status});
    const txt=await r.text();if(!/BEGIN:VCALENDAR/.test(txt))return res.status(400).json({error:"Ce lien n'est pas un calendrier"});
    const {name,events}=parse(txt),out=[];
    // Moved occurrences (RECURRENCE-ID) replace the generated one at the same start time.
    const moved=new Set(events.filter(e=>e.rid).map(e=>e.title));
    for(const e of events)for(const d of expand(e,from,to))out.push({start:e.allDay?d.toISOString().slice(0,10):e.utc?d.toISOString():d.toISOString().slice(0,19),allDay:e.allDay,title:e.title||"Sans titre",dur:e.end?Math.round((e.end-e.start)/6e4):null});
    res.setHeader("Cache-Control","s-maxage=300");res.json({name:name||"Calendrier",events:out})}
  catch(e){res.status(500).json({error:e.message})}};
