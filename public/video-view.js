import { normalizeVideoSource, playerMarkup } from "/video-embed.js";

const slug = location.pathname.split("/").filter(Boolean).at(-1);
const root = document.getElementById("videoDetail");
const $ = id => document.getElementById(id);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const platforms = {
  youtube:{name:"YouTube",icon:"fa-brands fa-youtube",tone:"youtube"},
  facebook:{name:"Facebook",icon:"fa-brands fa-facebook",tone:"facebook"},
  telegram:{name:"Telegram",icon:"fa-brands fa-telegram",tone:"telegram"},
  whatsapp:{name:"WhatsApp",icon:"fa-brands fa-whatsapp",tone:"whatsapp"}
};
const DEFAULT_TELEGRAM = "https://t.me/vidpas";
const DEFAULT_WHATSAPP = "https://whatsapp.com/channel/0029VbEU8HWIt5rxVZ1eFg3c";
let videoData = null, tasks = [], unlocked = false, saved = {}, adBannerQueue = Promise.resolve();

async function api(path, options = {}) {
  const r = await fetch(`/api${path}`, {
    credentials:"include",
    headers:{"Content-Type":"application/json", ...(options.headers || {})},
    ...options
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw Error(d.error || "Permintaan gagal");
  return d;
}
async function action(kind) {
  try { return await api(`/videos/${encodeURIComponent(slug)}/action`, {method:"POST", body:JSON.stringify({action:kind})}); }
  catch(e) { console.warn("Video action:", e); return null; }
}
function unlockStorageKey() {
  const signature = tasks.map(t => `${String(t.type||"")}:${String(t.url||"")}`).join("|");
  return `vidpas-unlock-${slug}-${encodeURIComponent(signature)}`;
}
function savedTasks() {
  try { return JSON.parse(localStorage.getItem(unlockStorageKey()) || "{}") || {}; }
  catch { return {}; }
}
function storeTasks() { localStorage.setItem(unlockStorageKey(), JSON.stringify(saved)); }
function safeHttpUrl(value) {
  try { const u = new URL(value); return ["http:","https:"].includes(u.protocol) ? u.href : ""; }
  catch { return ""; }
}
function renderPlayer(data) {
  const src = normalizeVideoSource(data.embed_url);
  if (!src) throw Error("URL video tidak valid atau format penyedia belum didukung.");
  $("lockedPlayerArea").classList.remove("is-locked");
  $("lockedPlayerArea").innerHTML = `<section class="video-player-wrap">
    <div class="player-topline"><span><i class="fa-solid fa-circle-play"></i> VIDPAS VIDEO PLAYER</span><span><i class="fa-solid fa-shield-halved"></i> Akses terbuka</span></div>
    <div class="video-player ${data.orientation === "vertical" ? "vertical" : ""}">${playerMarkup(src, data.title)}</div>
  </section>`;
  unlocked = true;
  $("videoActions").classList.remove("hidden");
  const dl = $("downloadBtn");
  if (data.download_url) {
    dl.disabled = false;
    dl.innerHTML = '<i class="fa-solid fa-download"></i><span>Download</span>';
    dl.title = "Download video";
  } else {
    dl.disabled = true;
    dl.innerHTML = '<i class="fa-solid fa-ban"></i><span>Download tidak tersedia</span>';
  }
  $("downloadHint").textContent = data.download_url ? "Video sudah terbuka. Kamu bisa menonton dan mengunduh." : "Publisher belum menyediakan tautan download.";
  startFloatingAdSchedule();
}
function lockedMarkup() {
  const thumb = safeHttpUrl(videoData.thumbnail_url);
  return `<div class="unlock-gate-backdrop">
    <div class="unlock-gate-card">
      <div class="unlock-thumbnail-row">${thumb ? `<img src="${esc(thumb)}" alt="Thumbnail ${esc(videoData.title)}">` : `<div class="unlock-thumbnail-fallback"><i class="fa-solid fa-photo-film"></i></div>`}
        <div><span class="unlock-thumbnail-kicker">VIDPAS • VIDEO ACCESS</span><strong>${esc(videoData.title)}</strong><small><i class="fa-solid fa-lock"></i> Video terkunci</small></div>
      </div>
      <div class="unlock-premium-head"><div class="unlock-premium-icon"><i class="fa-solid fa-unlock-keyhole"></i></div>
        <div class="unlock-premium-title"><span>SUB TO UNLOCK</span><h2>Buka akses menonton</h2><p>Gabung melalui tautan resmi berikut untuk melanjutkan.</p></div>
      </div>
      <div class="unlock-progress-meta"><span><i class="fa-solid fa-list-check"></i> Progress tugas</span><strong id="unlockProgress">0/${tasks.length}</strong></div>
      <div class="unlock-progress-track"><span id="unlockProgressBar"></span></div>
      <div class="unlock-task-list ${tasks.length===1?"single-task":tasks.length===2?"two-tasks":""}" id="unlockTaskList">
        ${tasks.map((t,i) => {
          const p = platforms[String(t.type || "").toLowerCase()] || {name:"Platform",icon:"fa-solid fa-arrow-up-right-from-square",tone:"generic"};
          const complete = !!saved[i];
          return `<article class="unlock-task-card ${complete?"is-complete":""}" id="unlockTask${i}">
            <div class="unlock-platform-icon ${p.tone}"><i class="${p.icon}"></i></div>
            <div class="unlock-task-copy"><strong>${esc(t.label || `Gabung ${p.name}`)}</strong><small>${complete?"Kunjungan selesai":"Buka tautan tujuan"}</small></div>
            <a class="unlock-open-btn ${complete?"is-complete":""}" data-open-task="${i}" href="${esc(t.url)}" target="_blank" rel="noopener noreferrer">${complete?'<i class="fa-solid fa-check"></i> Selesai':`Gabung <i class="fa-solid fa-arrow-up-right-from-square"></i>`}</a>
          </article>`;
        }).join("")}
      </div>
      <p class="unlock-return-note"><i class="fa-solid fa-circle-info"></i> Setelah membuka tautan, kembali ke tab Vidpas. Progress akan diperbarui otomatis.</p>
      <button id="continueWatchBtn" class="unlock-watch-btn" type="button" disabled><i class="fa-solid fa-lock"></i> Lanjutkan menonton</button>
      <div id="unlockCountdown" class="unlock-countdown" hidden aria-live="polite"><div class="unlock-countdown-ring"><span id="unlockCountdownNumber">3</span></div><strong>Memverifikasi akses</strong><div class="unlock-countdown-track"><span id="unlockCountdownBar"></span></div><small>Menyiapkan video untuk diputar…</small></div>
    </div>
  </div>`;
}
function refreshTaskProgress() {
  const count = tasks.filter((_,i) => !!saved[i]).length;
  const total = tasks.length;
  const pct = total ? Math.round(count / total * 100) : 100;
  const label = $("unlockProgress"), bar = $("unlockProgressBar");
  if (label) label.textContent = `${count}/${total}`;
  if (bar) bar.style.width = `${pct}%`;
  tasks.forEach((_,i) => {
    const card = $(`unlockTask${i}`);
    if (!card) return;
    card.classList.toggle("is-complete", !!saved[i]);
    const a = card.querySelector("a");
    const small = card.querySelector("small");
    if (a && saved[i]) { a.classList.add("is-complete"); a.innerHTML = '<i class="fa-solid fa-check"></i> Selesai'; }
    if (small) small.textContent = saved[i] ? "Kunjungan selesai" : "Buka tautan tujuan";
  });
  const btn = $("continueWatchBtn");
  if (btn) {
    btn.disabled = count !== total;
    btn.innerHTML = count === total
      ? '<i class="fa-solid fa-circle-check"></i> Lanjutkan menonton'
      : `<i class="fa-solid fa-lock"></i> Selesaikan ${total-count} tugas lagi`;
    btn.classList.toggle("is-ready", count === total);
  }
}
function mountUnlockGate() {
  const area = $("lockedPlayerArea");
  area.classList.add("is-locked");
  area.innerHTML = lockedMarkup();
  area.querySelectorAll("[data-open-task]").forEach(a => {
    a.addEventListener("click", () => {
      const index = Number(a.dataset.openTask);
      if (saved[index]) return;
      a.dataset.pending = "1";
      a.classList.add("is-pending");
      const card = $(`unlockTask${index}`);
      if (card) card.querySelector("small").textContent = "Menunggu kamu kembali ke Vidpas…";
      let left = false;
      const mark = () => {
        if (!left || document.visibilityState === "hidden" || saved[index]) return;
        saved[index] = true;
        storeTasks();
        refreshTaskProgress();
        window.removeEventListener("focus", mark);
        document.removeEventListener("visibilitychange", onVisibility);
      };
      const onVisibility = () => {
        if (document.visibilityState === "hidden") left = true;
        else mark();
      };
      window.addEventListener("blur", () => { left = true; }, {once:true});
      window.addEventListener("focus", mark);
      document.addEventListener("visibilitychange", onVisibility);
      // Some mobile browsers keep the same tab focused while an external app opens.
      setTimeout(() => { if (document.visibilityState === "visible" && document.hasFocus() && a.dataset.pending === "1") {
        // Do not mark on the click itself; require a real focus/visibility round trip.
      } }, 800);
    });
  });
  $("continueWatchBtn").addEventListener("click", verifyAndUnlock);
  refreshTaskProgress();
}
async function verifyAndUnlock() {
  const btn = $("continueWatchBtn");
  if (btn.disabled || unlocked) return;
  btn.disabled = true;
  const countdown = $("unlockCountdown"), number = $("unlockCountdownNumber"), bar = $("unlockCountdownBar");
  countdown.hidden = false;
  btn.classList.add("hidden");
  for (let n=3; n>=1; n--) {
    number.textContent = String(n);
    bar.style.width = `${(4-n)*33.333}%`;
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  number.textContent = "✓";
  bar.style.width = "100%";
  try {
    const result = await api(`/videos/${encodeURIComponent(slug)}/unlock`, {
      method:"POST",
      body:JSON.stringify({completed_tasks:tasks.map((_,i)=>i)})
    });
    videoData.embed_url = result.embed_url;
    videoData.download_url = result.download_url;
    countdown.hidden = true;
    renderPlayer(videoData);
  } catch (e) {
    countdown.hidden = true;
    btn.classList.remove("hidden");
    btn.disabled = false;
    btn.innerHTML = `<i class="fa-solid fa-rotate"></i> Coba lagi`;
    console.error(e);
  }
}
function shuffle(items) {
  const a = [...items];
  for (let i=a.length-1;i>0;i--) { const j=Math.floor(Math.random()*(i+1)); [a[i],a[j]]=[a[j],a[i]]; }
  return a;
}
function renderRelated() {
  const grid = $("relatedGrid"), empty = $("relatedEmpty");
  (async () => {
    const all = [];
    let offset = 0, hasMore = true, pages = 0;
    while (hasMore && pages < 100) {
      const d = await api(`/videos?limit=1000&offset=${offset}`);
      all.push(...(d.items || []));
      hasMore = !!d.has_more;
      offset += 1000;
      pages++;
    }
    return all;
  })().then(all => {
    const items = shuffle(all.filter(v => v.slug !== slug)).slice(0,10);
    if (!items.length) { grid.classList.add("hidden"); empty.classList.remove("hidden"); return; }
    grid.classList.remove("hidden"); empty.classList.add("hidden");
    const card = v => `<a class="related-card" href="/v/${encodeURIComponent(v.slug)}">
      <div class="related-thumb">${v.thumbnail_url?`<img src="${esc(v.thumbnail_url)}" alt="${esc(v.title)}" loading="lazy">`:'<span class="related-no-thumb"><i class="fa-solid fa-circle-play"></i></span>'}<span class="related-play"><i class="fa-solid fa-play"></i></span></div>
      <div class="related-copy"><h3>${esc(v.title)}</h3><p><i class="fa-regular fa-eye"></i> ${Number(v.views||0).toLocaleString("id-ID")} views</p></div></a>`;
    const first = items.slice(0,2).map(card).join("");
    const middle = items.slice(2,6).map(card).join("");
    const last = items.slice(6,10).map(card).join("");
    grid.innerHTML = `${first}<div class="related-ad related-ad-tall"><div class="ad-disclosure">Iklan</div><div id="relatedBanner160" class="ad-slot ad-160x600"></div></div>${middle}<div class="related-ad related-ad-native"><div class="ad-disclosure">Iklan</div><div id="relatedNativeAd" class="ad-slot"></div></div>${last}<div class="related-ad related-ad-bottom"><div class="ad-disclosure">Iklan</div><div id="relatedBanner468" class="ad-slot ad-468x60"></div></div>`;
    loadAdsterraBanner("relatedBanner160","1057b25ea9554d63c48eb6f8a07b782b",160,600,"https://biomanos.org/22/1057b25ea9554d63c48eb6f8a07b782b");
    loadNativeAd("relatedNativeAd");
    loadAdsterraBanner("relatedBanner468","6e20a4c9dad189e23fe8642d6c242cfd",468,60,"https://biomanos.org/22/6e20a4c9dad189e23fe8642d6c242cfd");
  }).catch(e => { console.warn("Related videos:",e); grid.classList.add("hidden"); empty.classList.remove("hidden"); });
}

/* Adsterra display placements. Popunder is intentionally not auto-triggered on every
   task click or timer: repeated forced popups can create invalid/accidental ad traffic. */
function loadAdsterraBanner(slotId,key,width,height,src) {
  const slot = $(slotId);
  if (!slot || slot.dataset.loaded) return;
  slot.dataset.loaded = "1";
  const frame = document.createElement("iframe");
  frame.title = "Iklan";
  frame.width = String(width);
  frame.height = String(height);
  frame.loading = "lazy";
  frame.referrerPolicy = "strict-origin-when-cross-origin";
  frame.setAttribute("sandbox","allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox");
  frame.style.cssText = `display:block;border:0;max-width:100%;width:${width}px;height:${height}px;background:transparent`;
  const code = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>html,body{margin:0;padding:0;width:${width}px;height:${height}px;overflow:hidden;background:transparent}</style></head><body><script>var atOptions=${JSON.stringify({key,format:"iframe",height,width,params:{}})};</script><script data-cfasync="false" src="${src}"></script></body></html>`;
  frame.srcdoc = code;
  slot.appendChild(frame);
}
function loadNativeAd(slotId) {
  const slot = $(slotId);
  if (!slot || slot.dataset.loaded) return;
  slot.dataset.loaded = "1";
  const frame = document.createElement("iframe");
  frame.title = "Iklan";
  frame.loading = "lazy";
  frame.style.cssText = "display:block;width:min(100%,720px);height:180px;border:0;background:transparent";
  frame.setAttribute("sandbox","allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox");
  frame.srcdoc = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0"><div id="container-c4ddd55dc2405990669cdc39190e71f0"></div><script async fetchpriority="high" data-cfasync="false" src="https://biomanos.org/21/c4ddd55dc2405990669cdc39190e71f0"></script></body></html>`;
  slot.appendChild(frame);
}
function loadSocialBar() {
  if (document.querySelector('script[data-vidpas-socialbar]')) return;
  const s = document.createElement("script");
  s.dataset.cfasync = "false";
  s.dataset.vidpasSocialbar = "1";
  s.src = "https://biomanos.org/14/7f23d55e9ce004ffd40e2673e6c90480";
  document.body.appendChild(s);
}
function startSlideAd() {
  const panel = $("videoSlideAd");
  if (!panel || panel.dataset.started) return;
  panel.dataset.started = "1";
  const show = () => {
    panel.hidden = false;
    loadAdsterraBanner("slideAdSlot","140b515f1a8f1857a38ab603f51b1f10",320,50,"https://biomanos.org/22/140b515f1a8f1857a38ab603f51b1f10");
  };
  setTimeout(show,10000);
  setInterval(() => { if (panel.hidden) show(); },40000);
  $("hideSlideAd").onclick = () => { panel.classList.add("is-hiding"); setTimeout(() => { panel.hidden = true; panel.classList.remove("is-hiding");  },350); };
}
function startFloatingAdSchedule() {
  const panel = $("videoFloatingAd");
  if (!panel || panel.dataset.started) return;
  panel.dataset.started = "1";
  const show = () => {
    if (!unlocked) return;
    panel.hidden = false;
    loadAdsterraBanner("floatingAdSlot","6e20a4c9dad189e23fe8642d6c242cfd",468,60,"https://biomanos.org/22/6e20a4c9dad189e23fe8642d6c242cfd");
    setTimeout(() => { panel.hidden = true; },15000);
  };
  setTimeout(show,15000);
  setInterval(() => { if (panel.hidden) show(); },45000);
  $("closeFloatingAd").onclick = () => { panel.hidden = true;  };
}
async function setupCommunityNotice() {
  let settings = {};
  try { settings = await api("/settings"); } catch(e) { console.warn("Community links:",e); }
  const tg = safeHttpUrl(settings.video_telegram_url || DEFAULT_TELEGRAM) || DEFAULT_TELEGRAM;
  const wa = safeHttpUrl(settings.video_whatsapp_url || DEFAULT_WHATSAPP) || DEFAULT_WHATSAPP;
  $("communityTelegram").href = tg;
  $("communityWhatsapp").href = wa;
  const panel = $("communityNotice");
  let shown = 0;
  const times = [30000,60000,90000];
  times.forEach(delay => setTimeout(() => {
    if (shown >= 3) return;
    shown++;
    panel.hidden = false;
    panel.classList.remove("is-leaving");
  },delay));
  $("closeCommunityNotice").onclick = () => {
    panel.classList.add("is-leaving");
    setTimeout(() => { panel.hidden = true; },250);
  };
}
function setupActionButtons(data) {
  const likeBtn = $("likeBtn"), shareBtn = $("shareBtn"), downloadBtn = $("downloadBtn");
  const likedKey = `vidpas-liked-${slug}`;
  if (localStorage.getItem(likedKey) === "1") {
    likeBtn.dataset.liked = "true";
    likeBtn.classList.add("is-liked");
    likeBtn.querySelector("i").className = "fa-solid fa-heart";
    likeBtn.querySelector("span").textContent = "Liked";
  }
  likeBtn.onclick = async () => {
    if (likeBtn.dataset.liked === "true") return;
    likeBtn.disabled = true;
    try {
      const result = await action("like");
      if (result && typeof result.likes === "number") $("likeCount").textContent = result.likes.toLocaleString("id-ID");
      likeBtn.dataset.liked = "true";
      localStorage.setItem(likedKey,"1");
      likeBtn.classList.add("is-liked");
      likeBtn.querySelector("i").className = "fa-solid fa-heart";
      likeBtn.querySelector("span").textContent = "Liked";
    } finally { likeBtn.disabled = false; }
  };
  shareBtn.onclick = async () => {
    const url = location.href;
    if (navigator.share) { try { await navigator.share({title:data.title,url}); } catch { return; } }
    else { try { await navigator.clipboard.writeText(url); shareBtn.querySelector("span").textContent = "Link tersalin"; } catch { prompt("Salin link video:",url); } }
    await action("share");
  };
  downloadBtn.onclick = async () => {
    if (!unlocked || !data.download_url) return;
    await action("download");
    window.open(data.download_url,"_blank","noopener");
  };
}
function buildPage(data) {
  videoData = data;
  tasks = Array.isArray(data.unlock_tasks) ? data.unlock_tasks.filter(t => t && safeHttpUrl(t.url)) : [];
  saved = savedTasks();
  document.title = `${data.title} — Vidpas`;
  root.innerHTML = `<section class="video-gate-shell">
    <div id="lockedPlayerArea" class="locked-player-area ${tasks.length?"is-locked":""}"></div>
    <section class="video-info"><div class="video-info-main"><div class="video-label"><i class="fa-solid fa-film"></i> VIDEO PUBLISHER</div><h1>${esc(data.title)}</h1><p class="video-description">${esc(data.description || "Belum ada deskripsi untuk video ini.")}</p><div class="video-metrics"><span><i class="fa-regular fa-eye"></i><b>${Number(data.views||0).toLocaleString("id-ID")}</b> views</span><span><i class="fa-solid fa-heart"></i><b>${Number(data.likes||0).toLocaleString("id-ID")}</b> likes</span><span><i class="fa-solid fa-calendar-days"></i>${data.created_at?new Date(data.created_at).toLocaleDateString("id-ID"):"Vidpas"}</span></div></div></section>
    <section class="video-actions-panel hidden" id="videoActions"><div class="video-actions-row">
      <button class="video-action-btn like" id="likeBtn" type="button"><i class="fa-regular fa-heart"></i><span>Like</span><b id="likeCount">${Number(data.likes||0).toLocaleString("id-ID")}</b></button>
      <button class="video-action-btn download" id="downloadBtn" type="button" disabled><i class="fa-solid fa-download"></i><span>Download</span></button>
      <button class="video-action-btn" id="shareBtn" type="button"><i class="fa-solid fa-share-nodes"></i><span>Share</span></button>
    </div><p class="actions-hint" id="downloadHint"></p></section>
  </section>`;
  if (tasks.length) mountUnlockGate();
  else {
    renderPlayer(data);
    $("videoActions").classList.remove("hidden");
  }
  setupActionButtons(data);
  renderRelated();
}
(async () => {
  try {
    loadSocialBar();
    startSlideAd();
    setupCommunityNotice();
    const d = await api(`/videos/${encodeURIComponent(slug)}`);
    if (!d || !d.title) throw Error("Video tidak ditemukan.");
    buildPage(d);
  } catch(e) {
    root.innerHTML = `<div class="video-error"><div><i class="fa-solid fa-triangle-exclamation"></i></div><h2>Video tidak dapat dimuat</h2><p>${esc(e.message)}</p><a href="/videos" class="video-error-link"><i class="fa-solid fa-arrow-left"></i> Kunjungi semua video</a></div>`;
  }
})();
