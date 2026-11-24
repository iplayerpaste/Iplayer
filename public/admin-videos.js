const $=id=>document.getElementById(id);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
async function call(path,opt={}){const r=await fetch(`/api${path}`,{credentials:'include',headers:{'Content-Type':'application/json'},...opt});const d=await r.json().catch(()=>({}));if(!r.ok)throw Error(d.error||'Permintaan gagal');return d}
const taskLabels={youtube:'Subscribe YouTube',facebook:'Ikuti / gabung Facebook',whatsapp:'Join saluran WhatsApp',telegram:'Join grup Telegram'};
let videos=[],editingId=null;
function status(id,msg,ok=false){$(id).textContent=msg;$(id).className=`status ${ok?'success':'error'}`}
function renderTasks(selected=[]){
 const byType=Object.fromEntries(selected.map(t=>[String(t.type||'').toLowerCase(),t]));
 document.querySelectorAll('.unlock-kind').forEach(x=>x.checked=!!byType[x.value]);
 const kinds=[...document.querySelectorAll('.unlock-kind:checked')].map(x=>x.value);
 $('unlockUrls').innerHTML=kinds.map(k=>{const t=byType[k]||{};return `<div class="task-field"><label>Teks tugas<input data-task-label="${k}" value="${esc(t.label||taskLabels[k])}" maxlength="90" required></label><label>Link tujuan<input data-task-url="${k}" type="url" value="${esc(t.url||'')}" placeholder="https://..." required></label></div>`}).join('');
}
document.querySelectorAll('.unlock-kind').forEach(x=>x.addEventListener('change',()=>renderTasks()));
function readTasks(){return [...document.querySelectorAll('.unlock-kind:checked')].map(x=>({type:x.value,label:document.querySelector(`[data-task-label="${x.value}"]`)?.value.trim()||taskLabels[x.value],url:document.querySelector(`[data-task-url="${x.value}"]`)?.value.trim()||''}));}
function resetEditor(){
 editingId=null;$('videoForm').reset();renderTasks();$('videoSubmit').innerHTML='<i class="fa-solid fa-cloud-arrow-up"></i> Publish Video';$('videoCancelEdit').classList.add('hidden');$('videoForm').scrollIntoView({behavior:'smooth',block:'start'});
}
function startEdit(v){
 editingId=v.id;
 $('videoTitle').value=v.title||'';$('videoDescription').value=v.description||'';
 $('videoEmbed').value=v.embed_url||'';$('videoThumbnail').value=v.thumbnail_url||'';
 $('videoOrientation').value=v.orientation||'horizontal';$('videoDownload').value=v.download_url||'';
 renderTasks(Array.isArray(v.unlock_tasks)?v.unlock_tasks:[]);
 $('videoSubmit').innerHTML='<i class="fa-solid fa-floppy-disk"></i> Simpan perubahan';
 $('videoCancelEdit').classList.remove('hidden');
 status('videoStatus','Mode edit aktif. Perubahan akan diterapkan pada link video yang sama.',true);
 $('videoForm').scrollIntoView({behavior:'smooth',block:'start'});
}
function renderList(){
 $('videoList').innerHTML=videos.map(v=>`<article class="paste-card admin-video-card">
 ${v.thumbnail_url?`<img src="${esc(v.thumbnail_url)}" alt="Thumbnail ${esc(v.title)}">`:'<div class="empty-state"><i class="fa-solid fa-photo-film"></i> Belum ada thumbnail</div>'}
 <div><h3>${esc(v.title)}</h3><p>${esc(v.orientation||'horizontal')} · ${Number(v.views||0)} dilihat · ${Number(v.downloads||0)} download · ${Number(v.shares||0)} share · ${v.published?'Tayang':'Draft'}</p>
 <a href="/v/${encodeURIComponent(v.slug)}" target="_blank" rel="noopener">Buka halaman video <i class="fa-solid fa-arrow-up-right-from-square"></i></a>
 <div class="video-admin-actions"><button class="button primary" type="button" data-edit="${esc(v.id)}"><i class="fa-solid fa-pen-to-square"></i> Edit link & pengaturan</button>
 <button class="button secondary" type="button" data-toggle="${esc(v.id)}" data-published="${v.published}">${v.published?'Jadikan draft':'Publikasikan'}</button>
 <button class="button ghost" type="button" data-delete="${esc(v.id)}"><i class="fa-solid fa-trash"></i> Hapus</button></div></div></article>`).join('')||'<div class="empty-state">Belum ada video.</div>';
 document.querySelectorAll('[data-edit]').forEach(b=>b.onclick=()=>{const v=videos.find(x=>x.id===b.dataset.edit);if(v)startEdit(v)});
 document.querySelectorAll('[data-toggle]').forEach(b=>b.onclick=async()=>{try{await call(`/admin/videos/${b.dataset.toggle}`,{method:'PATCH',body:JSON.stringify({published:b.dataset.published!=='true'})});await loadVideos()}catch(e){alert(e.message)}});
 document.querySelectorAll('[data-delete]').forEach(b=>b.onclick=async()=>{if(confirm('Hapus video ini?'))try{await call(`/admin/videos/${b.dataset.delete}`,{method:'DELETE'});await loadVideos()}catch(e){alert(e.message)}});
}
async function loadVideos(){const d=await call('/admin/videos');videos=d.items||[];renderList()}
async function boot(){try{await call('/admin/dashboard');$('adminVideoLogin').classList.add('hidden');$('adminVideoApp').classList.remove('hidden');await loadVideos()}catch(e){$('adminVideoLogin').classList.remove('hidden');$('adminVideoApp').classList.add('hidden');status('videoLoginStatus',e.message||'Gagal memuat panel. Periksa konfigurasi API dan database.')}}
$('videoLoginForm').onsubmit=async e=>{e.preventDefault();try{await call('/admin/login',{method:'POST',body:JSON.stringify({password:$('videoAdminPassword').value})});boot()}catch(x){status('videoLoginStatus',x.message)}};
$('videoForm').onsubmit=async e=>{
 e.preventDefault();
 const payload={title:$('videoTitle').value.trim(),description:$('videoDescription').value,embed_url:$('videoEmbed').value.trim(),thumbnail_url:$('videoThumbnail').value.trim(),orientation:$('videoOrientation').value,download_url:$('videoDownload').value.trim(),unlock_tasks:readTasks()};
 try{
  if(editingId){await call(`/admin/videos/${encodeURIComponent(editingId)}`,{method:'PATCH',body:JSON.stringify(payload)});status('videoStatus','Perubahan berhasil disimpan. Link video yang sama kini memakai pengaturan terbaru.',true);resetEditor()}
  else{const d=await call('/admin/videos',{method:'POST',body:JSON.stringify(payload)});status('videoStatus','Video berhasil diterbitkan.',true);$('videoCreated').classList.remove('hidden');$('videoCreated').innerHTML=`Link video: <a href="${esc(d.url)}" target="_blank" rel="noopener">${esc(d.url)}</a>`;e.target.reset();renderTasks()}
  await loadVideos();
 }catch(x){status('videoStatus',x.message)}
};
$('videoCancelEdit').onclick=()=>{resetEditor();status('videoStatus','Edit dibatalkan.')};
$('videoLogout').onclick=async()=>{await call('/admin/logout',{method:'POST'});location.reload()};
renderTasks();boot();
