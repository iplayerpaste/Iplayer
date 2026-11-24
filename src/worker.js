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
const PASSWORD_HASH_ITERATIONS = 100000; // Cloudflare Workers Web Crypto maximum supported PBKDF2 iteration count.
async function hashPassword(password,salt){const material=await crypto.subtle.importKey("raw",enc.encode(password),"PBKDF2",false,["deriveBits"]);const bits=await crypto.subtle.deriveBits({name:"PBKDF2",salt:enc.encode(salt),iterations:PASSWORD_HASH_ITERATIONS,hash:"SHA-256"},material,256);return b64(bits)}
async function db(env,path,opts={}){
 if(!env.SUPABASE_URL||!env.SUPABASE_SERVICE_ROLE_KEY)throw Error("Supabase belum dikonfigurasi: SUPABASE_URL atau SUPABASE_SERVICE_ROLE_KEY kosong.");
 const base=String(env.SUPABASE_URL).trim().replace(/\/+$/,"");
 const key=String(env.SUPABASE_SERVICE_ROLE_KEY).trim();
 const headers={apikey:key,"Content-Type":"application/json",Prefer:opts.prefer||"return=representation",...(opts.headers||{})};
 // Legacy service_role keys are JWTs and must also be sent as Bearer tokens.
 // New Supabase sb_secret_* keys are API keys, not JWTs; sending them as
 // Authorization Bearer causes PostgREST to reject them as an invalid JWT.
 if(key.startsWith("eyJ"))headers.Authorization=`Bearer ${key}`;
 const r=await fetch(`${base}/rest/v1/${path}`,{...opts,headers});
 const t=await r.text();
 if(!r.ok){let message=t;try{const j=JSON.parse(t);message=j.message||j.error_description||j.error||j.hint||t}catch{};throw Error(`Supabase HTTP ${r.status}: ${String(message).slice(0,350)}`)}
 return t?JSON.parse(t):null
}
async function body(req){try{return await req.json()}catch{return {}}}
function cookie(name,value,maxAge){return `${name}=${value}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${maxAge}`}
function getCookie(req,name){return (req.headers.get("Cookie")||"").split(";").map(x=>x.trim()).find(x=>x.startsWith(name+"="))?.slice(name.length+1)}
async function session(req,env){const token=getCookie(req,"ep_session");if(!token||!env.SESSION_SECRET)return false;const [id,sig]=token.split(".");if(!id||!sig||await hmac(env.SESSION_SECRET,id)!==sig)return false;const rows=await db(env,`admin_sessions?id=eq.${encodeURIComponent(id)}&expires_at=gt.${encodeURIComponent(new Date().toISOString())}&select=id`);return rows.length>0}
async function requireAdmin(req,env){return await session(req,env)}
async function settings(env){const rows=await db(env,"site_settings?select=key,value");return Object.fromEntries(rows.map(x=>[x.key,x.value]))}
async function log(env,action,detail={}){try{await db(env,"admin_activity",{method:"POST",body:JSON.stringify({action,detail})})}catch{}}
async function route(req,env,url){
 const p=url.pathname.replace(/^\/api/,"").replace(/\/$/,"")||"/",m=req.method;
 if(p==="/health"){
   // Check both collections used by the public Explore pages.
   for (const table of ["pastes","videos"]) {
    try {
     await db(env,`${table}?select=id&limit=1`,{prefer:"return=minimal"});
    } catch(e) {
     return json({ok:false,service:"Vidpas API",database:"error",table,detail:e.message},503);
    }
   }
   return json({ok:true,service:"Vidpas API",database:"connected",release:"vidpas-pbkdf2-100k-r2",pbkdf2_iterations:PASSWORD_HASH_ITERATIONS,checks:{pastes:"ok",videos:"ok"}});
  }
 if(p==="/settings"&&m==="GET"){const s=await settings(env);return json({site_name:s.site_name||"Vidpas",telegram_url:s.telegram_url||"",whatsapp_url:s.whatsapp_url||"",facebook_url:s.facebook_url||"",youtube_url:s.youtube_url||"",video_telegram_url:s.video_telegram_url||"https://t.me/vidpas",video_whatsapp_url:s.video_whatsapp_url||"https://whatsapp.com/channel/0029VbEU8HWIt5rxVZ1eFg3c"})}
 if(p==="/pastes"&&m==="POST"){
  const b=await body(req);if(typeof b.content!=="string"||!b.content.trim()||b.content.length>100000)return err("Isi paste wajib diisi (maksimal 100 KB).");
  const slug=random(9),salt=random(16),password_hash=b.password?`${salt}:${await hashPassword(b.password,salt)}`:null;
  const expiry=b.expires_in==="never"?null:new Date(Date.now()+Math.max(600,Math.min(Number(b.expires_in)||604800,2592000))*1000).toISOString();
  const rows=await db(env,"pastes",{method:"POST",body:JSON.stringify({slug,title:String(b.title||"").slice(0,120),content:b.content,password_hash,visibility:b.visibility==="private"?"private":"public",tags:Array.isArray(b.tags)?b.tags.slice(0,8).map(x=>String(x).slice(0,30)):[],expires_at:expiry,views:0})});
  return json({slug,url:`${env.SITE_ORIGIN||url.origin}/p/${slug}`},201);
 }
 if(p==="/pastes"&&m==="GET"){
  const limit=Math.min(50,Math.max(1,Number(url.searchParams.get("limit"))||12));
  const offset=Math.max(0,Number(url.searchParams.get("offset"))||0);
  const rows=await db(env,`pastes?visibility=eq.public&or=(expires_at.is.null,expires_at.gt.${encodeURIComponent(new Date().toISOString())})&select=slug,title,content,tags,created_at,views&order=created_at.desc&limit=${limit+1}&offset=${offset}`);
  const items=rows.slice(0,limit).map(x=>({slug:x.slug,title:x.title,excerpt:x.content.slice(0,130),tags:x.tags,created_at:x.created_at,views:x.views,likes:0,shares:0}));
  const totalRows=await db(env,"pastes?visibility=eq.public&or=(expires_at.is.null,expires_at.gt."+encodeURIComponent(new Date().toISOString())+")&select=id");return json({items,total:totalRows.length,has_more:rows.length>limit});
 }
 const tagMatch=p.match(/^\/pastes\/tag\/([^/]+)$/);
 if(tagMatch&&m==="GET"){const tag=decodeURIComponent(tagMatch[1]),limit=Math.min(50,Math.max(1,Number(url.searchParams.get("limit"))||12)),offset=Math.max(0,Number(url.searchParams.get("offset"))||0);const rows=await db(env,`pastes?visibility=eq.public&tags=cs.{${encodeURIComponent(tag)}}&or=(expires_at.is.null,expires_at.gt.${encodeURIComponent(new Date().toISOString())})&select=slug,title,content,tags,created_at,views&order=created_at.desc&limit=${limit+1}&offset=${offset}`);const items=rows.slice(0,limit).map(x=>({slug:x.slug,title:x.title,excerpt:x.content.slice(0,130),tags:x.tags,created_at:x.created_at,views:x.views,likes:0,shares:0}));return json({items,total:items.length+offset+(rows.length>limit?1:0),has_more:rows.length>limit})}
 const meta=p.match(/^\/pastes\/([^/]+)\/meta$/);
 if(meta&&m==="GET"){const rows=await db(env,`pastes?slug=eq.${encodeURIComponent(meta[1])}&select=slug,password_hash,visibility,expires_at`);if(!rows.length)return err("Paste tidak ditemukan.",404);const x=rows[0];return json({protected:!!x.password_hash,expired:!!x.expires_at&&new Date(x.expires_at)<new Date()})}
 const access=p.match(/^\/pastes\/([^/]+)\/access$/);
 if(access&&m==="POST"){const b=await body(req),rows=await db(env,`pastes?slug=eq.${encodeURIComponent(access[1])}&select=*`);if(!rows.length)return err("Paste tidak ditemukan.",404);const x=rows[0];if(x.expires_at&&new Date(x.expires_at)<new Date())return err("Paste sudah kedaluwarsa.",410);if(x.password_hash){const [salt,expected]=x.password_hash.split(":");if(!b.password||await hashPassword(b.password,salt)!==expected)return err("Password salah.",401)}await db(env,`pastes?slug=eq.${encodeURIComponent(x.slug)}`,{method:"PATCH",body:JSON.stringify({views:(x.views||0)+1})});return json({title:x.title,content:x.content,created_at:x.created_at,views:(x.views||0)+1,likes:x.likes||0,shares:x.shares||0})}

 const pasteAction=p.match(/^\/pastes\/([a-zA-Z0-9_-]+)\/action$/);
 if(pasteAction&&m==="POST"){
  const b=await body(req),field={like:"likes",share:"shares"}[b.action];
  if(!field)return err("Aksi tidak valid.");
  const rows=await db(env,`pastes?slug=eq.${encodeURIComponent(pasteAction[1])}&visibility=eq.public&or=(expires_at.is.null,expires_at.gt.${encodeURIComponent(new Date().toISOString())})&select=id,${field}`);
  if(!rows.length)return err("Paste publik tidak ditemukan.",404);
  const value=(rows[0][field]||0)+1;
  await db(env,`pastes?id=eq.${rows[0].id}`,{method:"PATCH",body:JSON.stringify({[field]:value})});
  return json({[field]:value});
 }

 if(p==="/posters"&&m==="POST"){
  const b=await body(req);if(!b.title||!b.image_url||!b.target_url)return err("Judul, URL gambar, dan link tujuan wajib diisi.");
  let image,target;try{image=new URL(b.image_url);target=new URL(b.target_url)}catch{return err("URL gambar atau link tujuan tidak valid.")};if(!["https:","http:"].includes(image.protocol)||!["https:","http:"].includes(target.protocol))return err("URL harus menggunakan HTTP atau HTTPS.");
  const slug=random(9);const rows=await db(env,"posters",{method:"POST",body:JSON.stringify({slug,title:String(b.title).slice(0,140),description:String(b.description||"").slice(0,2000),image_url:image.href,target_url:target.href,author:String(b.author||"Komunitas").slice(0,60),published:true,views:0})});return json({item:rows[0],slug,url:`${env.SITE_ORIGIN||url.origin}/poster/${slug}`},201);
 }
 if(p==="/posters"&&m==="GET"){
  const limit=Math.min(20,Math.max(1,Number(url.searchParams.get("limit"))||20)),offset=Math.max(0,Number(url.searchParams.get("offset"))||0);
  const rows=await db(env,`posters?published=eq.true&select=slug,title,description,image_url,author,views,created_at&order=created_at.desc&limit=${limit+1}&offset=${offset}`);
  const totalRows=await db(env,"posters?published=eq.true&select=id");return json({items:rows.slice(0,limit),total:totalRows.length,has_more:rows.length>limit});
 }
 const posterMatch=p.match(/^\/posters\/([a-zA-Z0-9_-]+)$/);
 if(posterMatch&&m==="GET") {const rows=await db(env,`posters?slug=eq.${encodeURIComponent(posterMatch[1])}&published=eq.true&select=slug,title,description,image_url,target_url,author,views,created_at`);if(!rows.length)return err("Poster tidak ditemukan.",404);const x=rows[0];await db(env,`posters?slug=eq.${encodeURIComponent(x.slug)}`,{method:"PATCH",body:JSON.stringify({views:(x.views||0)+1})});return json({...x,views:(x.views||0)+1});}
 if(p==="/videos"&&m==="GET"){
  const limit=Math.min(1000,Math.max(1,Number(url.searchParams.get("limit"))||20)); const offset=Math.max(0,Number(url.searchParams.get("offset"))||0);
  const rows=await db(env,`videos?published=eq.true&select=slug,title,description,thumbnail_url,orientation,views,likes,downloads,shares,created_at&order=created_at.desc&limit=${limit+1}&offset=${offset}`);
  const items=rows.slice(0,limit).map(x=>({...x,downloads:x.downloads||0,shares:x.shares||0,likes:x.likes||0}));const totalRows=await db(env,"videos?published=eq.true&select=id");return json({items,total:totalRows.length,has_more:rows.length>limit});
 }
 const videoMatch=p.match(/^\/videos\/([a-zA-Z0-9_-]+)$/);
 if(videoMatch&&m==="GET"){
  const rows=await db(env,`videos?slug=eq.${encodeURIComponent(videoMatch[1])}&published=eq.true&select=slug,title,description,embed_url,thumbnail_url,orientation,download_url,unlock_tasks,views,likes,downloads,shares,created_at`);
  if(!rows.length)return err("Video tidak ditemukan.",404);
  const x=rows[0]; await db(env,`videos?slug=eq.${encodeURIComponent(x.slug)}`,{method:"PATCH",body:JSON.stringify({views:(x.views||0)+1})});
  const gated=Array.isArray(x.unlock_tasks)&&x.unlock_tasks.some(t=>t&&t.url);
  return json({...x,embed_url:gated?null:x.embed_url,download_url:gated?null:x.download_url,views:(x.views||0)+1});
 }
  const videoUnlock=p.match(/^\/videos\/([a-zA-Z0-9_-]+)\/unlock$/);
  if(videoUnlock&&m==="POST"){
   const b=await body(req);
   const rows=await db(env,`videos?slug=eq.${encodeURIComponent(videoUnlock[1])}&published=eq.true&select=slug,embed_url,download_url,unlock_tasks`);
   if(!rows.length)return err("Video tidak ditemukan.",404);
   const x=rows[0];
   const tasks=Array.isArray(x.unlock_tasks)?x.unlock_tasks.filter(t=>{
    if(!t||typeof t.url!=="string")return false;
    try{const u=new URL(t.url);return u.protocol==="https:"||u.protocol==="http:"}catch{return false}
   }):[];
   const completed=Array.isArray(b.completed_tasks)?[...new Set(b.completed_tasks.map(Number).filter(Number.isInteger))]:[];
   const allCompleted=tasks.every((_,i)=>completed.includes(i));
   if(tasks.length&&!allCompleted)return err("Selesaikan seluruh tugas terlebih dahulu.",403);
   if(!x.embed_url)return err("URL embed video belum tersedia.",409);
   return json({ok:true,embed_url:x.embed_url,download_url:x.download_url||"",unlocked:true},200,{"Cache-Control":"no-store"});
  }
 const videoAction=p.match(/^\/videos\/([a-zA-Z0-9_-]+)\/action$/);
 if(videoAction&&m==="POST"){const b=await body(req),field={download:"downloads",share:"shares",like:"likes"}[b.action];if(!field)return err("Aksi tidak valid.");const rows=await db(env,`videos?slug=eq.${encodeURIComponent(videoAction[1])}&published=eq.true&select=id,${field}`);if(!rows.length)return err("Video tidak ditemukan.",404);const value=(rows[0][field]||0)+1;await db(env,`videos?id=eq.${rows[0].id}`,{method:"PATCH",body:JSON.stringify({[field]:value})});return json({[field]:value});}

 if(p==="/announcements"&&m==="GET"){
  const rows=await db(env,"announcements?active=eq.true&select=id,title,content,created_at&order=created_at.desc&limit=50"); return json({items:rows});
 }
 if(p==="/presence"&&m==="POST"){
  const b=await body(req); const visitor=String(b.visitor_id||"").replace(/[^a-zA-Z0-9_-]/g,"").slice(0,80); if(!visitor)return err("ID pengunjung tidak valid.");
  await db(env,"online_presence?on_conflict=visitor_id",{method:"POST",prefer:"resolution=merge-duplicates,return=minimal",body:JSON.stringify({visitor_id:visitor,last_seen:new Date().toISOString()})}); return json({ok:true});
 }
 if(p==="/ads/active"&&m==="GET"){
  const placement=String(url.searchParams.get("placement")||"site_all");
  const rows=await db(env,`ads?active=eq.true&select=id,name,placement,ad_type,size,script&or=(placement.eq.site_all,placement.eq.${encodeURIComponent(placement)})`); return json({items:rows});
 }
 if(p==="/admin/login"&&m==="POST"){const b=await body(req);if(!env.ADMIN_PASSWORD_HASH||!env.SESSION_SECRET)return err("Rahasia admin belum dikonfigurasi.",503);const [salt,expected]=env.ADMIN_PASSWORD_HASH.split(":");if(!salt||!expected||await hashPassword(String(b.password||""),salt)!==expected)return err("Password admin salah.",401);const id=random(24),sig=await hmac(env.SESSION_SECRET,id);await db(env,"admin_sessions",{method:"POST",body:JSON.stringify({id,expires_at:new Date(Date.now()+8*3600e3).toISOString()})});await log(env,"admin_login");return json({ok:true},200,{"Set-Cookie":cookie("ep_session",`${id}.${sig}`,28800)})}
 if(p==="/admin/logout"&&m==="POST"){if(await session(req,env)){const token=getCookie(req,"ep_session"),id=token?.split(".")[0];if(id)await db(env,`admin_sessions?id=eq.${encodeURIComponent(id)}`,{method:"DELETE"})}return json({ok:true},200,{"Set-Cookie":cookie("ep_session","",0)})}
 if(p.startsWith("/admin/")){if(!await requireAdmin(req,env))return err("Akses admin diperlukan.",401);
  if(p==="/admin/dashboard"&&m==="GET"){const rows=await db(env,"pastes?select=visibility,views,expires_at");const videos=await db(env,"videos?select=id,views,downloads,shares,likes");const posters=await db(env,"posters?select=id,views");const online=await db(env,`online_presence?last_seen=gt.${encodeURIComponent(new Date(Date.now()-120000).toISOString())}&select=visitor_id`);return json({total_pastes:rows.length,public_pastes:rows.filter(x=>x.visibility==="public").length,total_views:rows.reduce((a,x)=>a+(x.views||0),0),total_videos:videos.length,video_views:videos.reduce((a,x)=>a+(x.views||0),0),video_downloads:videos.reduce((a,x)=>a+(x.downloads||0),0),video_shares:videos.reduce((a,x)=>a+(x.shares||0),0),video_likes:videos.reduce((a,x)=>a+(x.likes||0),0),total_posters:posters.length,poster_views:posters.reduce((a,x)=>a+(x.views||0),0),online_now:online.length})}
  if(p==="/admin/settings"&&m==="GET")return json(await settings(env));
  if(p==="/admin/settings"&&m==="PUT"){const b=await body(req);for(const key of ["video_telegram_url","video_whatsapp_url"]){if(b[key]){try{const u=new URL(String(b[key]));if(!["http:","https:"].includes(u.protocol))throw Error();b[key]=u.href}catch{return err(`URL ${key==="video_telegram_url"?"Telegram":"WhatsApp"} tidak valid.`)}}}for(const [key,value] of Object.entries({telegram_url:b.telegram_url,whatsapp_url:b.whatsapp_url,facebook_url:b.facebook_url,youtube_url:b.youtube_url,site_name:b.site_name,video_telegram_url:b.video_telegram_url,video_whatsapp_url:b.video_whatsapp_url})){if(value!==undefined)await db(env,"site_settings?on_conflict=key",{method:"POST",prefer:"resolution=merge-duplicates,return=representation",body:JSON.stringify({key,value})})}await log(env,"settings_updated");return json({ok:true})}
  if(p==="/admin/ads"&&m==="GET")return json({items:await db(env,"ads?select=id,name,placement,ad_type,size,active,created_at&order=created_at.desc")});
  if(p==="/admin/ads"&&m==="POST"){const b=await body(req);if(!b.name||!b.script||b.script.length>30000)return err("Nama dan script iklan wajib diisi.");const placements=["site_all","paste_top","paste_middle","paste_bottom","video_top","video_bottom","explore_top","explore_grid","navbar","home"];const types=["popunder","social_bar","native","video_ads","banner","smartlink"];if(!placements.includes(b.placement)||!types.includes(b.ad_type||"banner"))return err("Format atau posisi iklan tidak valid.");const rows=await db(env,"ads",{method:"POST",body:JSON.stringify({name:String(b.name).slice(0,80),placement:b.placement,ad_type:b.ad_type||"banner",size:String(b.size||"responsive"),script:b.script,active:true})});await log(env,"ad_created",{name:b.name});return json({item:rows[0]},201)}
  const ad=p.match(/^\/admin\/ads\/([0-9a-f-]+)$/);
  if(ad&&m==="PATCH"){const rows=await db(env,`ads?id=eq.${ad[1]}&select=active`);if(!rows.length)return err("Iklan tidak ditemukan.",404);await db(env,`ads?id=eq.${ad[1]}`,{method:"PATCH",body:JSON.stringify({active:!rows[0].active})});return json({ok:true})}

  if(p==="/admin/videos"&&m==="GET")return json({items:await db(env,"videos?select=*&order=created_at.desc")});
  if(p==="/admin/videos"&&m==="POST"){
   const b=await body(req);if(!b.title||!b.embed_url)return err("Judul dan URL embed wajib diisi.");
   let u;try{u=new URL(b.embed_url)}catch{return err("URL embed tidak valid.")};if(!["https:","http:"].includes(u.protocol))return err("URL embed harus HTTP/HTTPS.");
   const slug=random(8);const rows=await db(env,"videos",{method:"POST",body:JSON.stringify({slug,title:String(b.title).slice(0,160),description:String(b.description||"").slice(0,5000),embed_url:u.href,thumbnail_url:String(b.thumbnail_url||"").slice(0,1000),orientation:b.orientation==="vertical"?"vertical":"horizontal",download_url:String(b.download_url||"").slice(0,1000),unlock_tasks:Array.isArray(b.unlock_tasks)?b.unlock_tasks.slice(0,5):[],published:b.published!==false})});await log(env,"video_created",{slug});return json({item:rows[0],url:`${env.SITE_ORIGIN||url.origin}/v/${slug}`},201);
  }
  const vm=p.match(/^\/admin\/videos\/([0-9a-f-]+)$/);
  if(vm&&m==="PATCH"){
   const b=await body(req),patch={};
   for(const k of ["title","description","embed_url","thumbnail_url","orientation","download_url","unlock_tasks","published"])if(b[k]!==undefined)patch[k]=b[k];
   if(patch.title!==undefined&&!String(patch.title).trim())return err("Judul video wajib diisi.");
   if(patch.embed_url!==undefined){try{const u=new URL(String(patch.embed_url));if(!["https:","http:"].includes(u.protocol))throw Error();patch.embed_url=u.href}catch{return err("URL embed tidak valid.")}}
   for(const k of ["thumbnail_url","download_url"])if(patch[k]){try{const u=new URL(String(patch[k]));if(!["https:","http:"].includes(u.protocol))throw Error();patch[k]=u.href}catch{return err(`URL ${k==="thumbnail_url"?"thumbnail":"download"} tidak valid.`)}}
   if(patch.orientation!==undefined)patch.orientation=patch.orientation==="vertical"?"vertical":"horizontal";
   if(patch.unlock_tasks!==undefined){
    if(!Array.isArray(patch.unlock_tasks)||patch.unlock_tasks.length>5)return err("Maksimal 5 tugas Sub to Unlock.");
    for(const task of patch.unlock_tasks){try{const u=new URL(String(task.url||""));if(!["https:","http:"].includes(u.protocol))throw Error();task.url=u.href}catch{return err("Salah satu link Sub to Unlock tidak valid.")}}
   }
   await db(env,`videos?id=eq.${vm[1]}`,{method:"PATCH",body:JSON.stringify(patch)});return json({ok:true})
  }
  if(vm&&m==="DELETE"){await db(env,`videos?id=eq.${vm[1]}`,{method:"DELETE"});return json({ok:true})}
  if(p==="/admin/posters"&&m==="GET")return json({items:await db(env,"posters?select=*&order=created_at.desc")});
  const pm=p.match(/^\/admin\/posters\/([0-9a-f-]+)$/);
  if(pm&&m==="PATCH"){const b=await body(req);await db(env,`posters?id=eq.${pm[1]}`,{method:"PATCH",body:JSON.stringify({published:!!b.published})});return json({ok:true});}
  if(pm&&m==="DELETE"){await db(env,`posters?id=eq.${pm[1]}`,{method:"DELETE"});return json({ok:true});}
  if(p==="/admin/announcements"&&m==="GET")return json({items:await db(env,"announcements?select=*&order=created_at.desc")});
  if(p==="/admin/announcements"&&m==="POST"){const b=await body(req);if(!b.title||!b.content)return err("Judul dan isi pengumuman wajib diisi.");const rows=await db(env,"announcements",{method:"POST",body:JSON.stringify({title:String(b.title).slice(0,160),content:String(b.content).slice(0,10000),active:true})});await log(env,"announcement_created");return json({item:rows[0]},201)}
  const am=p.match(/^\/admin\/announcements\/([0-9a-f-]+)$/);if(am&&m==="DELETE"){await db(env,`announcements?id=eq.${am[1]}`,{method:"DELETE"});return json({ok:true})}
  if(p==="/admin/presence"&&m==="GET"){const rows=await db(env,`online_presence?last_seen=gt.${encodeURIComponent(new Date(Date.now()-120000).toISOString())}&select=visitor_id,last_seen&order=last_seen.desc`);return json({online_now:rows.length,visitors:rows})}
  if(ad&&m==="DELETE"){await db(env,`ads?id=eq.${ad[1]}`,{method:"DELETE"});await log(env,"ad_deleted");return json({ok:true})}
 }
 return err("Endpoint tidak ditemukan.",404);
}
export default {async fetch(req,env){const origin=req.headers.get("Origin")||env.SITE_ORIGIN||"*";if(req.method==="OPTIONS")return new Response(null,{headers:cors(origin)});try{const url=new URL(req.url);const response=await route(req,env,url);const headers=new Headers(response.headers);for(const [k,v]of Object.entries(cors(origin)))headers.set(k,v);return new Response(response.body,{status:response.status,headers})}catch(e){return json({error:"Terjadi kesalahan server.",detail:String(e?.message||"Unknown error").slice(0,400)},500,cors(origin))}}};