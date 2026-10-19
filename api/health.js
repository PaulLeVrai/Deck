// Receives Apple Health data from the iPhone Shortcut and stores it with the user's personal token.
const SB_URL="https://dzsdzwoabgswnqruarhe.supabase.co",SB_KEY="sb_publishable_w4HmYMGX1dySixUPJMoBzw_uTh38b2N";
// Shortcuts send numbers as text, sometimes with a comma or a unit ("7,5", "62 ms").
const num=v=>{if(v==null||v==="")return null;const n=parseFloat(String(v).replace(",",".").replace(/[^\d.\-]/g,""));return isFinite(n)?Math.round(n):null};
module.exports=async(req,res)=>{
  if(req.method!=="POST")return res.status(405).json({error:"POST attendu"});
  const b=typeof req.body==="string"?JSON.parse(req.body||"{}"):(req.body||{});
  const token=req.headers["x-deck-token"]||b.token;
  if(!token)return res.status(401).json({error:"Jeton manquant"});
  let sleep=num(b.sleep_minutes);if(sleep==null&&b.sleep_hours!=null){const h=parseFloat(String(b.sleep_hours).replace(",","."));sleep=isFinite(h)?Math.round(h*60):null}
  const r=await fetch(SB_URL+"/rest/v1/rpc/ingest_health",{method:"POST",headers:{apikey:SB_KEY,Authorization:"Bearer "+SB_KEY,"Content-Type":"application/json"},
    body:JSON.stringify({p_token:String(token),p_day:b.day||null,p_sleep_minutes:sleep,p_hrv:num(b.hrv),p_resting_hr:num(b.resting_hr),p_steps:num(b.steps)})});
  if(!r.ok)return res.status(r.status===400?401:500).json({error:(await r.text()).slice(0,200)});
  res.json({ok:true});
};
