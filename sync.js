// Sync Deck data with Supabase: email sign-in, then the app state is saved to app_state and restored on other devices.
import {createClient} from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm";
const sb=createClient("https://dzsdzwoabgswnqruarhe.supabase.co","sb_publishable_w4HmYMGX1dySixUPJMoBzw_uTh38b2N",
  {auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true,storageKey:"deck-auth",storage:window.localStorage}});
// Remembered so the app shows you as signed in right away, until you sign out yourself.
const ME="deck-me";
const KEY="cockpit",STAMP="deck-stamp";
let user=null,t=null;
async function pull(){const {data}=await sb.from("app_state").select("data,updated_at").maybeSingle();
  const local=localStorage.getItem(KEY),ls=+localStorage.getItem(STAMP)||0;
  if(data&&data.data&&data.data.v===2&&new Date(data.updated_at).getTime()>ls){
    const txt=JSON.stringify(data.data);if(txt!==local){localStorage.setItem(KEY,txt);localStorage.setItem(STAMP,new Date(data.updated_at).getTime());location.reload();return}}
  else if(local)push()}
async function push(){if(!user)return;const d=localStorage.getItem(KEY);if(!d)return;const now=new Date();
  const {error}=await sb.from("app_state").upsert({user_id:user.id,data:JSON.parse(d),updated_at:now.toISOString()});
  if(!error)localStorage.setItem(STAMP,now.getTime())}
window.deckSync={
  db:sb,
  // The session can still be loading when the app opens: refresh it before giving up.
  async token(){let {data}=await sb.auth.getSession();let ses=data.session;
    if(!ses||ses.expires_at*1000<Date.now()+60e3){const r=await sb.auth.refreshSession();if(r.data&&r.data.session)ses=r.data.session}
    if(!ses&&user){const r=await sb.auth.getSession();ses=r.data.session}
    return ses&&ses.access_token},
  get email(){return (user&&user.email)||localStorage.getItem(ME)},
  changed(){if(!user)return;clearTimeout(t);t=setTimeout(push,1500)},
  // Password sign-in works inside the installed iPhone app (a magic link would open Safari instead).
  async signIn(email,password){let r=await sb.auth.signInWithPassword({email,password});if(!r.error)return "ok";
    if(/invalid/i.test(r.error.message)){const u=await sb.auth.signUp({email,password,options:{emailRedirectTo:location.origin+location.pathname}});
      if(u.error)return u.error.message;if(u.data.session)return "ok";return "Compte créé : confirme via le mail reçu, puis reviens taper OK"}
    if(/confirm/i.test(r.error.message))return "Confirme d'abord ton e-mail via le mail reçu, puis OK";return r.error.message},
  async signOut(){localStorage.removeItem(ME);await sb.auth.signOut();user=null;window.deckRender&&window.deckRender()}};
sb.auth.onAuthStateChange((ev,s)=>{const was=user;if(!s&&ev!=="SIGNED_OUT")return;user=s?s.user:null;if(user)localStorage.setItem(ME,user.email);if(user&&!was){pull();window.deckRender&&window.deckRender();window.deckCal&&deckCal.load(0);window.deckHealth&&deckHealth.load();window.deckClaude&&deckClaude.load()}});
addEventListener("visibilitychange",()=>{if(document.visibilityState==="visible"&&user)pull()});
window.deckRender&&window.deckRender();
