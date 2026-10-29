// Returns one event as an .ics file so iOS opens its "Ajouter l'évènement" sheet (a web app cannot write to Apple Calendar itself).
// Query: t = title, s = start "YYYYMMDDTHHMM" (Paris wall-clock), m = duration in minutes, n = optional note.
const esc=v=>String(v||"").replace(/[\;,]/g,c=>"\\"+c).replace(/\r?\n/g,"\\n").slice(0,300);
module.exports=(req,res)=>{const q=req.query||{},s=/^\d{8}T\d{4}$/.test(q.s||"")?q.s:null;if(!s)return res.status(400).send("Date manquante");
  const m=Math.max(5,Math.min(600,+q.m||45)),d=new Date(Date.UTC(+s.slice(0,4),+s.slice(4,6)-1,+s.slice(6,8),+s.slice(9,11),+s.slice(11,13)+m)),
    p=n=>String(n).padStart(2,"0"),e=`${d.getUTCFullYear()}${p(d.getUTCMonth()+1)}${p(d.getUTCDate())}T${p(d.getUTCHours())}${p(d.getUTCMinutes())}00`,
    now=new Date().toISOString().replace(/[-:]/g,"").slice(0,15)+"Z";
  const ics=["BEGIN:VCALENDAR","VERSION:2.0","PRODID:-//Deck//FR","CALSCALE:GREGORIAN","METHOD:PUBLISH","BEGIN:VEVENT",
    `UID:deck-${s}-${Math.random().toString(36).slice(2)}@deck`,`DTSTAMP:${now}`,`DTSTART;TZID=Europe/Paris:${s}00`,`DTEND;TZID=Europe/Paris:${e}`,
    `SUMMARY:${esc(q.t||"Séance")}`,q.n?`DESCRIPTION:${esc(q.n)}`:"","BEGIN:VALARM","TRIGGER:-PT30M","ACTION:DISPLAY","DESCRIPTION:Séance","END:VALARM","END:VEVENT","END:VCALENDAR"].filter(Boolean).join("\r\n");
  res.setHeader("Content-Type","text/calendar; charset=utf-8");res.setHeader("Content-Disposition",'inline; filename="seance.ics"');res.send(ics)};
