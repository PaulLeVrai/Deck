// Reads a book cover photo with Claude: where the cover is in the picture, plus its title and author when visible.
// Needs ANTHROPIC_API_KEY in the Vercel project's environment variables; without it the app falls back to a plain crop.
module.exports=async(req,res)=>{
  const key=process.env.ANTHROPIC_API_KEY;if(!key)return res.status(501).json({error:"Clé Claude absente"});
  try{const b=typeof req.body==="string"?JSON.parse(req.body||"{}"):(req.body||{});const img=String(b.image||"").replace(/^data:image\/\w+;base64,/,"");
    if(!img||img.length>4e6)return res.status(400).json({error:"Image invalide"});
    const r=await fetch("https://api.anthropic.com/v1/messages",{method:"POST",headers:{"content-type":"application/json","x-api-key":key,"anthropic-version":"2023-06-01"},
      body:JSON.stringify({model:"claude-haiku-5-5",max_tokens:200,messages:[{role:"user",content:[
        {type:"image",source:{type:"base64",media_type:"image/jpeg",data:img}},
        {type:"text",text:'Photo d\'une couverture de livre. Réponds uniquement en JSON : {"title":"…","author":"…","box":[x0,y0,x1,y1]} où box est le rectangle de la couverture en fractions (0 à 1) de la largeur et de la hauteur de l\'image. Mets "" si le titre ou l\'auteur ne sont pas lisibles.'}]}]})});
    const j=await r.json();if(!r.ok)return res.status(502).json({error:(j.error&&j.error.message)||"Claude indisponible"});
    const txt=(j.content||[]).map(c=>c.text||"").join(""),m=txt.match(/\{[\s\S]*\}/);const o=m?JSON.parse(m[0]):{};
    const box=Array.isArray(o.box)&&o.box.length===4&&o.box.every(n=>typeof n==="number")?o.box.map(n=>Math.max(0,Math.min(1,n))):null;
    res.json({title:String(o.title||"").slice(0,120),author:String(o.author||"").slice(0,80),box})}catch(e){res.status(500).json({error:e.message})}};
