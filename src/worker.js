const cors = (origin) => ({
  "Access-Control-Allow-Origin": origin || "*",
  "Access-Control-Allow-Credentials": "true",
  "Access-Control-Allow-Methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type"
});
const json = (data, status=200, headers={}) => new Response(JSON.stringify(data), {status,headers:{"Content-Type":"application/json; charset=utf-8",...headers}});
const err = (message,status=400)=>json({error:message},status);
const random = (n=9)=>Array.from(crypto.getRandomValues(new Uint8Array(n)),b=>"abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"[b%62]).join("");
const enc = new TextEncoder();
const b64 = b=>btoa(String.fromCharCode(...new Uint8Array(b))).replaceAll("+","-").replaceAll("/","_").replaceAll("=","");
async function hmac(secret,value){const key=await crypto.subtle.importKey("raw",enc.encode(secret),{name:"HMAC",hash:"SHA-256"},false,["sign"]);return b64(await crypto.subtle.sign("HMAC",key,enc.encode(value)))}
async function hashPassword(password,salt){const material=await crypto.subtle.importKey("raw",enc.encode(password),"PBKDF2",false,["deriveBits"]);const bits=await crypto.subtle.deriveBits({name:"PBKDF2",salt:enc.encode(salt),iterations:150000,hash:"SHA-256"},material,256);return b64(bits)}
async function db(env,path,opts={}){if(!env.SUPABASE_URL||!env.SUPABASE_SERVICE_ROLE_KEY)throw Error("Supabase belum dikonfigurasi");const r=await fetch(`${env.SUPABASE_URL}/rest/v1/${path}`,{...opts,headers:{apikey:env.SUPABASE_SERVICE_ROLE_KEY,Authorization:`Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,"Content-Type":"application/json",Prefer:opts.prefer||"return=representation",...(opts.headers||{})}});const t=await r.text();if(!r.ok)throw Error(`Database error: ${t.slice(0,250)}`);return t?JSON.parse(t):null}
async function body(req){try{return await req.json()}catch{return {}}}
function cookie(name,value,maxAge){return `${name}=${value}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${maxAge}`}
function getCookie(req,name){return (req.headers.get("Cookie")||"").split(";").map(x=>x.trim()).find(x=>x.startsWith(name+"="))?.slice(name.length+1)}
async function session(req,env){const token=getCookie(req,"ep_session");if(!token||!env.SESSION_SECRET)return false;const [id,sig]=token.split(".");if(!id||!sig||await hmac(env.SESSION_SECRET,id)!==sig)return false;const rows=await db(env,`admin_sessions?id=eq.${encodeURIComponent(id)}&expires_at=gt.${encodeURIComponent(new Date().toISOString())}&select=id`);return rows.length>0}
async function requireAdmin(req,env){return await session(req,env)}
async function settings(env){const rows=await db(env,"site_settings?select=key,value");return Object.fromEntries(rows.map(x=>[x.key,x.value]))}
async function log(env,action,detail={}){try{await db(env,"admin_activity",{method:"POST",body:JSON.stringify({action,detail})})}catch{}}
async function route(req,env,url){
 const p=url.pathname.replace(/^\/api/,"").replace(/\/$/,"")||"/",m=req.method;
 if(p==="/health")return json({ok:true,service:"ePlayer API"});
 if(p==="/settings"&&m==="GET"){const s=await settings(env);return json({site_name:s.site_name||"ePlayer",telegram_url:s.telegram_url||"",whatsapp_url:s.whatsapp_url||""})}
 if(p==="/pastes"&&m==="POST"){
  const b=await body(req);if(typeof b.content!=="string"||!b.content.trim()||b.content.length>100000)return err("Isi paste wajib diisi (maksimal 100 KB).");
  const slug=random(9),salt=random(16),password_hash=b.password?`${salt}:${await hashPassword(b.password,salt)}`:null;
  const expiry=b.expires_in==="never"?null:new Date(Date.now()+Math.max(600,Math.min(Number(b.expires_in)||604800,2592000))*1000).toISOString();
  const rows=await db(env,"pastes",{method:"POST",body:JSON.stringify({slug,title:String(b.title||"").slice(0,120),content:b.content,password_hash,visibility:b.visibility==="private"?"private":"public",tags:Array.isArray(b.tags)?b.tags.slice(0,8).map(x=>String(x).slice(0,30)):[],expires_at:expiry,views:0})});
  return json({slug,url:`${env.SITE_ORIGIN||url.origin}/p/${slug}`},201);
 }
 if(p==="/pastes"&&m==="GET"){
  const limit=Math.min(12,Math.max(1,Number(url.searchParams.get("limit"))||6));
  const rows=await db(env,`pastes?visibility=eq.public&or=(expires_at.is.null,expires_at.gt.${encodeURIComponent(new Date().toISOString())})&select=slug,title,content,tags,created_at,views&order=created_at.desc&limit=${limit+1}`);
  const items=rows.slice(0,limit).map(x=>({slug:x.slug,title:x.title,excerpt:x.content.slice(0,130),tags:x.tags,created_at:x.created_at,views:x.views}));
  return json({items,next_cursor:rows.length>limit?rows[limit-1].created_at:null});
 }
 const tagMatch=p.match(/^\/pastes\/tag\/([^/]+)$/);
 if(tagMatch&&m==="GET"){const tag=decodeURIComponent(tagMatch[1]);const rows=await db(env,`pastes?visibility=eq.public&tags=cs.{${encodeURIComponent(tag)}}&or=(expires_at.is.null,expires_at.gt.${encodeURIComponent(new Date().toISOString())})&select=slug,title,content,tags,created_at,views&order=created_at.desc&limit=6`);return json({items:rows.map(x=>({slug:x.slug,title:x.title,excerpt:x.content.slice(0,130),tags:x.tags,created_at:x.created_at,views:x.views})),next_cursor:null})}
 const meta=p.match(/^\/pastes\/([^/]+)\/meta$/);
 if(meta&&m==="GET"){const rows=await db(env,`pastes?slug=eq.${encodeURIComponent(meta[1])}&select=slug,password_hash,visibility,expires_at`);if(!rows.length||rows[0].visibility!=="public")return err("Paste tidak ditemukan.",404);const x=rows[0];return json({protected:!!x.password_hash,expired:!!x.expires_at&&new Date(x.expires_at)<new Date()})}
 const access=p.match(/^\/pastes\/([^/]+)\/access$/);
 if(access&&m==="POST"){const b=await body(req),rows=await db(env,`pastes?slug=eq.${encodeURIComponent(access[1])}&select=*`);if(!rows.length)return err("Paste tidak ditemukan.",404);const x=rows[0];if(x.visibility!=="public")return err("Paste tidak ditemukan.",404);if(x.expires_at&&new Date(x.expires_at)<new Date())return err("Paste sudah kedaluwarsa.",410);if(x.password_hash){const [salt,expected]=x.password_hash.split(":");if(!b.password||await hashPassword(b.password,salt)!==expected)return err("Password salah.",401)}await db(env,`pastes?slug=eq.${encodeURIComponent(x.slug)}`,{method:"PATCH",body:JSON.stringify({views:(x.views||0)+1})});return json({title:x.title,content:x.content,created_at:x.created_at,views:(x.views||0)+1})}
 if(p==="/admin/login"&&m==="POST"){const b=await body(req);if(!env.ADMIN_PASSWORD_HASH||!env.SESSION_SECRET)return err("Rahasia admin belum dikonfigurasi.",503);const [salt,expected]=env.ADMIN_PASSWORD_HASH.split(":");if(!salt||!expected||await hashPassword(String(b.password||""),salt)!==expected)return err("Password admin salah.",401);const id=random(24),sig=await hmac(env.SESSION_SECRET,id);await db(env,"admin_sessions",{method:"POST",body:JSON.stringify({id,expires_at:new Date(Date.now()+8*3600e3).toISOString()})});await log(env,"admin_login");return json({ok:true},200,{"Set-Cookie":cookie("ep_session",`${id}.${sig}`,28800)})}
 if(p==="/admin/logout"&&m==="POST"){if(await session(req,env)){const token=getCookie(req,"ep_session"),id=token?.split(".")[0];if(id)await db(env,`admin_sessions?id=eq.${encodeURIComponent(id)}`,{method:"DELETE"})}return json({ok:true},200,{"Set-Cookie":cookie("ep_session","",0)})}
 if(p.startsWith("/admin/")){if(!await requireAdmin(req,env))return err("Akses admin diperlukan.",401);
  if(p==="/admin/dashboard"&&m==="GET"){const rows=await db(env,"pastes?select=visibility,views,expires_at");return json({total_pastes:rows.length,public_pastes:rows.filter(x=>x.visibility==="public").length,total_views:rows.reduce((a,x)=>a+(x.views||0),0)})}
  if(p==="/admin/settings"&&m==="GET")return json(await settings(env));
  if(p==="/admin/settings"&&m==="PUT"){const b=await body(req);for(const [key,value] of Object.entries({telegram_url:b.telegram_url,whatsapp_url:b.whatsapp_url,site_name:b.site_name})){if(value!==undefined)await db(env,"site_settings?on_conflict=key",{method:"POST",prefer:"resolution=merge-duplicates,return=representation",body:JSON.stringify({key,value})})}await log(env,"settings_updated");return json({ok:true})}
  if(p==="/admin/ads"&&m==="GET")return json({items:await db(env,"ads?select=id,name,placement,active,created_at&order=created_at.desc")});
  if(p==="/admin/ads"&&m==="POST"){const b=await body(req);if(!b.name||!b.script||b.script.length>30000)return err("Nama dan script iklan wajib diisi.");const rows=await db(env,"ads",{method:"POST",body:JSON.stringify({name:String(b.name).slice(0,80),placement:b.placement,script:b.script,active:true})});await log(env,"ad_created",{name:b.name});return json({item:rows[0]},201)}
  const ad=p.match(/^\/admin\/ads\/([0-9a-f-]+)$/);
  if(ad&&m==="PATCH"){const rows=await db(env,`ads?id=eq.${ad[1]}&select=active`);if(!rows.length)return err("Iklan tidak ditemukan.",404);await db(env,`ads?id=eq.${ad[1]}`,{method:"PATCH",body:JSON.stringify({active:!rows[0].active})});return json({ok:true})}
  if(ad&&m==="DELETE"){await db(env,`ads?id=eq.${ad[1]}`,{method:"DELETE"});await log(env,"ad_deleted");return json({ok:true})}
 }
 return err("Endpoint tidak ditemukan.",404);
}
export default {async fetch(req,env){const origin=req.headers.get("Origin")||env.SITE_ORIGIN||"*";if(req.method==="OPTIONS")return new Response(null,{headers:cors(origin)});try{const url=new URL(req.url);const response=await route(req,env,url);const headers=new Headers(response.headers);for(const [k,v]of Object.entries(cors(origin)))headers.set(k,v);return new Response(response.body,{status:response.status,headers})}catch(e){return json({error:"Terjadi kesalahan server.",detail:env.NODE_ENV==="development"?e.message:undefined},500,cors(origin))}}};