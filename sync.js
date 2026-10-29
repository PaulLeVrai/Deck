// Sync Deck data with Supabase: email sign-in, then the app state is saved to app_state and restored on other devices.
import {createClient} from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm";
const sb=createClient("https://dzsdzwoabgswnqruarhe.supabase.co","sb_publishable_w4HmYMGX1dySixUPJMoBzw_uTh38b2N",
  {auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true,storageKey:"deck-auth",storage:window.localStorage}});
// Remembered so the app shows you as signed in right away, until you sign out yourself.
const ME="deck-me";
const KEY="cockpit",STAMP="deck-stamp";
// A data key (Réglages) also gives access to the saved data, without signing in.
const DK="deck-key";const dk=()=>localStorage.getItem(DK);
// A Deck name ("deck.paul") finds the same data on any device, no e-mail needed.
// Before remote data replaces this device's data, keep a copy (Réglages can restore it).
const bak=()=>{const l=localStorage.getItem("cockpit");if(l&&l.length>200)try{localStorage.setItem("cockpit-bak",l);localStorage.setItem("cockpit-bak-at",Date.now())}catch(e){}};
const SP="deck-space";const sp=()=>localStorage.getItem(SP);let claude=localStorage.getItem("deck-claude");
let user=null,t=null;
async function remote(){if(sp()){const {data,error}=await sb.rpc("space_get",{p_name:sp()});if(error)throw error;if(data&&data.claude){claude=data.claude;localStorage.setItem("deck-claude",claude)}return data&&data.data&&data.data.v?data:null}
  if(user)return (await sb.from("app_state").select("data,updated_at").maybeSingle()).data;
  const {data,error}=await sb.rpc("data_key_get",{p_key:dk()});if(error)throw error;return data&&data.data?data:null}
async function pull(){if(!user&&!dk()&&!sp())return;let data;try{data=await remote()}catch(e){return}
  const local=localStorage.getItem(KEY),ls=+localStorage.getItem(STAMP)||0;
  if(data&&data.data&&data.data.v===2&&new Date(data.updated_at).getTime()>ls){
    const txt=JSON.stringify(data.data);if(txt!==local){bak();localStorage.setItem(KEY,txt);localStorage.setItem(STAMP,new Date(data.updated_at).getTime());location.reload();return}}
  else if(local)push()}
async function push(){if(!user&&!dk()&&!sp())return;const d=localStorage.getItem(KEY);if(!d)return;const now=new Date();
  if(sp()){const {data,error}=await sb.rpc("space_set",{p_name:sp(),p_data:JSON.parse(d)});if(!error){localStorage.setItem(STAMP,now.getTime());if(data&&data!==claude){claude=data;localStorage.setItem("deck-claude",data);window.deckRender&&window.deckRender()}}return}
  const {error}=user?await sb.from("app_state").upsert({user_id:user.id,data:JSON.parse(d),updated_at:now.toISOString()}):await sb.rpc("data_key_set",{p_key:dk(),p_data:JSON.parse(d)});
  if(!error)localStorage.setItem(STAMP,now.getTime())}
window.deckSync={
  db:sb,
  // The session can still be loading when the app opens: refresh it before giving up.
  async token(){let {data}=await sb.auth.getSession();let ses=data.session;
    if(!ses||ses.expires_at*1000<Date.now()+60e3){const r=await sb.auth.refreshSession();if(r.data&&r.data.session)ses=r.data.session}
    if(!ses&&user){const r=await sb.auth.getSession();ses=r.data.session}
    return ses&&ses.access_token},
  get email(){return (user&&user.email)||localStorage.getItem(ME)},
  get usedKey(){return dk()},
  // The account's own key, created the first time it is asked for.
  async myKey(){if(!user)return null;let {data,error}=await sb.from("data_keys").select("key").maybeSingle();
    if(!data&&!error)({data,error}=await sb.from("data_keys").insert({}).select("key").single());return error?{err:1}:data.key},
  async useKey(k){k=k.trim().toUpperCase();const {data,error}=await sb.rpc("data_key_get",{p_key:k});if(error)return /inconnue/.test(error.message)?"Clé inconnue":error.message;
    localStorage.setItem(DK,k);localStorage.removeItem(STAMP);if(data&&data.data&&data.data.v===2){localStorage.setItem(KEY,JSON.stringify(data.data));localStorage.setItem(STAMP,new Date(data.updated_at).getTime());location.reload()}return "ok"},
  forgetKey(){localStorage.removeItem(DK);window.deckRender&&window.deckRender()},
  get space(){return sp()},
  get claudeUrl(){return sp()&&claude?location.origin+"/api/mcp?k="+claude:null},
  // Existing name: load its data. New name: save this device's data under it.
  async useSpace(n){n=n.trim().toLowerCase();if(!/^deck\.[a-z0-9._-]{3,}$/.test(n))return "Le nom doit commencer par deck. puis au moins 3 caractères";
    const {data,error}=await sb.rpc("space_get",{p_name:n});if(error)return /space_get/.test(error.message)?"Relance d'abord le script SQL dans Supabase":error.message;
    localStorage.setItem(SP,n);if(data&&data.claude){claude=data.claude;localStorage.setItem("deck-claude",claude)}
    if(data&&data.data&&data.data.v===2){bak();localStorage.setItem(KEY,JSON.stringify(data.data));localStorage.setItem(STAMP,new Date(data.updated_at).getTime());location.reload();return "ok"}
    localStorage.removeItem(STAMP);await push();window.deckRender&&window.deckRender();return "ok"},
  get backupAt(){return +localStorage.getItem("cockpit-bak-at")||null},
  // Puts back the data this device had before the last download, and sends it to the space.
  async restore(){const b=localStorage.getItem("cockpit-bak");if(!b)return;localStorage.setItem(KEY,b);localStorage.removeItem("cockpit-bak");localStorage.removeItem("cockpit-bak-at");await push();location.reload()},
  leaveSpace(){localStorage.removeItem(SP);localStorage.removeItem("deck-claude");claude=null;window.deckRender&&window.deckRender()},
  changed(){if(!user&&!dk()&&!sp())return;clearTimeout(t);t=setTimeout(push,1500)},
  // Password sign-in works inside the installed iPhone app (a magic link would open Safari instead).
  async signIn(email,password){let r=await sb.auth.signInWithPassword({email,password});if(!r.error)return "ok";
    if(/invalid/i.test(r.error.message)){const u=await sb.auth.signUp({email,password,options:{emailRedirectTo:location.origin+location.pathname}});
      if(u.error)return u.error.message;if(u.data.session)return "ok";return "Compte créé : confirme via le mail reçu, puis reviens taper OK"}
    if(/confirm/i.test(r.error.message))return "Confirme d'abord ton e-mail via le mail reçu, puis OK";return r.error.message},
  async signOut(){localStorage.removeItem(ME);await sb.auth.signOut();user=null;window.deckRender&&window.deckRender()}};
sb.auth.onAuthStateChange((ev,s)=>{const was=user;if(!s&&ev!=="SIGNED_OUT")return;user=s?s.user:null;if(user)localStorage.setItem(ME,user.email);if(user&&!was){pull();window.deckRender&&window.deckRender();window.deckCal&&deckCal.load(0);window.deckHealth&&deckHealth.load();window.deckClaude&&deckClaude.load()}});
addEventListener("visibilitychange",()=>{if(document.visibilityState==="visible")pull()});
if(dk()||sp())pull();
window.deckRender&&window.deckRender();
