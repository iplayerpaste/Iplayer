import { normalizeVideoSource, playerMarkup, thumbnailMarkup } from "/video-embed.js";

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
const pageEnteredAt = Date.now();

async function api(path, options = {}) {
  const r = await fetch(`/api${path}`, {
    credentials:"include",
    cache:"no-store",
    headers:{"Content-Type":"application/json", "Cache-Control":"no-cache", ...(options.headers || {})},
    ...options
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw Error([d.error || "Permintaan gagal", d.detail].filter(Boolean).join(" — "));
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
// Task progress is intentionally page-session-only. A full page refresh starts
// Sub to Unlock from zero, while returning from an external app keeps in-memory state.
function resetSavedTasksForPageLoad() {
  saved = {};
  try { localStorage.removeItem(unlockStorageKey()); } catch { /* Storage may be disabled. */ }
}
function storeTasks() { /* Keep progress in memory only; do not persist across refreshes. */ }
function safeHttpUrl(value) {
  try { const u = new URL(value); return ["http:","https:"].includes(u.protocol) ? u.href : ""; }
  catch { return ""; }
}

// Prefer the installed Android app for social destinations. Chrome/Android resolves
// the package intent; if the app is missing, Android opens the original HTTPS URL.
const ANDROID_APP_PACKAGES = {
  telegram:"org.telegram.messenger",
  whatsapp:"com.whatsapp",
  facebook:"com.facebook.katana",
  youtube:"com.google.android.youtube"
};
function platformAppHref(type, value) {
  const kind = String(type || "").toLowerCase();
  const url = safeHttpUrl(value);
  if (!url) return "#";
  try {
    const u = new URL(url);
    if (kind === "youtube" && /(^|\.)youtube\.com$|youtu\.be$/i.test(u.hostname)) {
      u.searchParams.set("sub_confirmation", "1");
    }
    // Use Android's package intent for app-first routing. Keep the exact admin
    // HTTPS destination as fallback so the task always reaches its configured target.
    const pkg = ANDROID_APP_PACKAGES[kind];
    if (/Android/i.test(navigator.userAgent) && pkg) {
      const fallback = encodeURIComponent(u.href);
      const path = `${u.host}${u.pathname}${u.search}${u.hash}`;
      return `intent://${path}#Intent;scheme=https;package=${pkg};S.browser_fallback_url=${fallback};end`;
    }
    return u.href;
  } catch { return url; }
}
function taskNativeDeepLink(type, value) {
  const kind = String(type || "").toLowerCase();
  const url = safeHttpUrl(value);
  if (!url) return "";
  try {
    const u = new URL(url);
    const parts = u.pathname.split("/").filter(Boolean);
    if (kind === "telegram" && /(^|\.)t\.me$|telegram\.me$/i.test(u.hostname)) {
      const first = parts[0] || "";
      if (first.startsWith("+") ) return `tg://join?invite=${encodeURIComponent(first.slice(1))}`;
      if (first.toLowerCase() === "joinchat" && parts[1]) return `tg://join?invite=${encodeURIComponent(parts[1])}`;
      if (first && first.toLowerCase() !== "c") return `tg://resolve?domain=${encodeURIComponent(first.replace(/^@/, ""))}`;
    }
    if (/Android/i.test(navigator.userAgent) && ANDROID_APP_PACKAGES[kind]) return platformAppHref(kind, url);
    return u.href;
  } catch { return url; }
}

function taskAccountText(type, value) {
  const kind = String(type || "").toLowerCase();
  try {
    const u = new URL(safeHttpUrl(value));
    const parts = u.pathname.split("/").filter(Boolean).map(decodeURIComponent);
    if (kind === "youtube") {
      const handle = parts.find(x => x.startsWith("@"));
      if (handle) return `Akun YouTube: ${handle}`;
      if (parts[0] === "channel" && parts[1]) return `Channel YouTube: ${parts[1]}`;
      if (parts[0] === "c" && parts[1]) return `Channel YouTube: ${parts[1]}`;
    }
    if (kind === "telegram" && parts[0] && !["joinchat", "addstickers", "proxy"].includes(parts[0].toLowerCase()))
      return `Telegram: @${parts[0].replace(/^@/, "")}`;
    if (kind === "facebook" && parts[0] && !["share", "watch", "groups", "events"].includes(parts[0].toLowerCase()))
      return `Facebook: ${parts[0]}`;
    if (kind === "whatsapp" && /whatsapp\.com$/i.test(u.hostname)) {
      if (parts[0] === "channel") return "Saluran WhatsApp";
      if (parts[0] === "group") return "Grup WhatsApp";
    }
    return `Tujuan ${platforms[kind]?.name || "tugas"}`;
  } catch { return `Tujuan ${platforms[kind]?.name || "tugas"}`; }
}
function renderPlayer(data) {
  const src = normalizeVideoSource(data.embed_url);
  if (!src) throw Error("URL video tidak valid atau format penyedia belum didukung.");
  const stage = $("videoStage");
  if (stage) stage.innerHTML = `<div class="player-topline"><span><i class="fa-solid fa-circle-play"></i> VIDPAS VIDEO PLAYER</span><span><i class="fa-solid fa-shield-halved"></i> Akses terbuka</span></div><div class="video-player ${data.orientation === "vertical" ? "vertical" : "horizontal"}" data-orientation="${data.orientation === "vertical" ? "vertical" : "horizontal"}">${playerMarkup(src, data.title)}</div>`;
  const gate = $("lockedPlayerArea");
  if (gate) { gate.hidden = true; gate.innerHTML = ""; }
  unlocked = true;
  const dl = $("downloadBtn");
  if (dl) {
    if (data.download_url) {
      dl.disabled = false;
      dl.innerHTML = '<i class="fa-solid fa-download"></i><span>Download</span>';
      dl.title = "Download video";
    } else {
      dl.disabled = true;
      dl.innerHTML = '<i class="fa-solid fa-ban"></i><span>Download tidak tersedia</span>';
    }
  }
  const hint = $("downloadHint");
  if (hint) hint.textContent = data.download_url ? "Video sudah terbuka. Kamu bisa menonton dan mengunduh." : "Publisher belum menyediakan tautan download.";
}
function renderLockedStage(data) {
  const stage = $("videoStage");
  if (!stage) return;
  stage.innerHTML = `<div class="player-topline"><span><i class="fa-solid fa-circle-play"></i> VIDPAS VIDEO PLAYER</span><span><i class="fa-solid fa-lock"></i> Akses terkunci</span></div><div class="video-stage-locked"><div class="video-stage-thumb ${data.orientation==="vertical"?"is-vertical":"is-horizontal"}">${thumbnailMarkup(data.thumbnail_url,data.title,'vp-thumb-media')}</div><div class="video-stage-shade"></div><div class="video-stage-message"><i class="fa-solid fa-lock"></i><strong>Video siap ditonton</strong><span>Selesaikan tugas akses di bawah untuk membuka video.</span></div></div>`;
}

function lockedMarkup() {
  return `<section class="unlock-first-view">
    <div class="unlock-first-title"><span>VIDEO TERKUNCI</span><h1>${esc(videoData.title)}</h1></div>
    <div class="unlock-first-thumbnail ${videoData.orientation==="vertical"?"is-vertical":"is-horizontal"}">${thumbnailMarkup(videoData.thumbnail_url,videoData.title,"vp-thumb-media")}</div>
    <div class="unlock-first-status"><i class="fa-solid fa-lock"></i><strong>Video terkunci akses</strong><p>Silahkan selesaikan tugas terlebih dahulu</p></div>
    <div class="unlock-task-list unlock-task-list-simple" id="unlockTaskList">
      ${tasks.map((t,i) => {
        const p = platforms[String(t.type || "").toLowerCase()] || {name:"Platform",icon:"fa-solid fa-arrow-up-right-from-square",tone:"generic"};
        const complete = !!saved[i];
        const label = t.label || (String(t.type).toLowerCase()==="telegram" ? "Join Telegram" : String(t.type).toLowerCase()==="whatsapp" ? "Gabung Saluran WhatsApp" : `Gabung ${p.name}`);
        return `<article class="unlock-task-simple ${complete?"is-complete":""}" id="unlockTask${i}">
          <a class="unlock-open-btn ${complete?"is-complete":""}" data-open-task="${i}" href="${esc(platformAppHref(t.type,t.url))}" target="_self" rel="noopener noreferrer"><i class="${p.icon}" aria-hidden="true"></i><span>${esc(complete?"Selesai":label)}</span>${complete?'<i class="fa-solid fa-check"></i>':'<i class="fa-solid fa-arrow-up-right-from-square"></i>'}</a>
          <small>${esc(taskAccountText(t.type,t.url))}</small>
        </article>`;
      }).join("")}
    </div>
    <div class="unlock-progress-meta"><span>Progress tugas</span><strong id="unlockProgress">0/${tasks.length}</strong></div>
    <div class="unlock-progress-track"><span id="unlockProgressBar"></span></div>
    <button id="continueWatchBtn" class="unlock-watch-btn" type="button" disabled><i class="fa-solid fa-lock"></i> Lanjut Menonton</button>
    <p class="unlock-return-note">Klik tugas untuk membuka aplikasi atau tujuan yang tersedia. Setelah selesai, kembali ke Vidpas untuk memperbarui progress.</p>
    <div id="unlockCountdown" class="unlock-countdown" hidden aria-live="polite"><div class="unlock-countdown-ring"><span id="unlockCountdownNumber">3</span></div><strong>Menyiapkan video</strong><div class="unlock-countdown-track"><span id="unlockCountdownBar"></span></div></div>
  </section>`;
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
    const p = platforms[String(tasks[i]?.type || "").toLowerCase()] || {name:"Platform",icon:"fa-solid fa-arrow-up-right-from-square"};
    if (a && saved[i]) {
      a.classList.add("is-complete");
      a.innerHTML = `<i class="${p.icon}" aria-hidden="true"></i><span>Selesai</span><i class="fa-solid fa-check" aria-hidden="true"></i>`;
    }
    if (small) small.textContent = taskAccountText(tasks[i]?.type,tasks[i]?.url);
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
    a.addEventListener("click", event => {
      event.preventDefault();
      const index = Number(a.dataset.openTask);
      if (saved[index]) return;
      const task = tasks[index];
      const webUrl = safeHttpUrl(task?.url);
      if (!webUrl) return;

      a.dataset.pending = "1";
      a.classList.add("is-pending");
      const card = $( `unlockTask${index}` );
      if (card) card.classList.add("is-opening-app");

      let left = false;
      let completed = false;
      const cleanup = () => {
        window.removeEventListener("focus", onFocus);
        window.removeEventListener("pagehide", onPageHide);
        document.removeEventListener("visibilitychange", onVisibility);
      };
      const markReturned = () => {
        if (!left || document.visibilityState !== "visible" || completed || saved[index]) return;
        completed = true;
        saved[index] = true;
        a.dataset.pending = "0";
        a.classList.remove("is-pending");
        if (card) card.classList.remove("is-opening-app");
        storeTasks();
        refreshTaskProgress();
        cleanup();
      };
      const onVisibility = () => {
        if (document.visibilityState === "hidden") left = true;
        else markReturned();
      };
      const onPageHide = () => { left = true; };
      const onFocus = () => markReturned();
      document.addEventListener("visibilitychange", onVisibility);
      window.addEventListener("pagehide", onPageHide, {once:true});
      window.addEventListener("focus", onFocus);

      // Trigger the app URI synchronously in the user's click gesture. If the
      // app does not open and the page stays visible, navigate to the HTTPS URL.
      const appUrl = taskNativeDeepLink(task.type, webUrl) || platformAppHref(task.type, webUrl);
      window.location.href = appUrl;
      window.setTimeout(() => {
        if (!completed && document.visibilityState === "visible" && document.hasFocus()) {
          window.location.href = webUrl;
        }
      }, 1800);
    });
  });
  $("continueWatchBtn").addEventListener("click", verifyAndUnlock);
  refreshTaskProgress();
}

async function verifyAndUnlock() {
  const btn = $("continueWatchBtn");
  if (!btn || btn.disabled || unlocked) return;
  const completedCount = tasks.filter((_, i) => !!saved[i]).length;
  if (completedCount !== tasks.length) {
    refreshTaskProgress();
    return;
  }

  btn.disabled = true;
  const countdown = $("unlockCountdown");
  const number = $("unlockCountdownNumber");
  const bar = $("unlockCountdownBar");
  countdown.hidden = false;
  btn.classList.add("hidden");
  number.textContent = "3";
  bar.style.width = "0%";

  for (let n = 3; n >= 1; n--) {
    number.textContent = String(n);
    bar.style.width = `${(4 - n) * 33.333}%`;
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  number.textContent = "✓";
  bar.style.width = "100%";

  try {
    const completed = tasks.map((_, i) => i);
    let result;
    try {
      result = await api(`/videos/${encodeURIComponent(slug)}/unlock`, {
        method: "POST",
        body: JSON.stringify({ completed_tasks: completed })
      });
    } catch (firstError) {
      // Retry only transient server/network failures. A 4xx means task state
      // or configuration must be corrected and should not be retried blindly.
      if (/HTTP 5\\d\\d|Failed to fetch|NetworkError|Load failed/i.test(firstError.message)) {
        await new Promise(resolve => setTimeout(resolve, 500));
        result = await api(`/videos/${encodeURIComponent(slug)}/unlock`, {
          method: "POST",
          body: JSON.stringify({ completed_tasks: completed })
        });
      } else {
        throw firstError;
      }
    }

    if (!result || !result.embed_url) throw Error("Server belum mengirim sumber video. Periksa URL embed di panel admin.");
    videoData.embed_url = result.embed_url;
    videoData.download_url = result.download_url || "";
    countdown.hidden = true;
    buildUnlockedPage(videoData);
    const area = $("videoStage");
    if (area) area.scrollIntoView({ behavior: "smooth", block: "center" });
  } catch (e) {
    countdown.hidden = true;
    btn.classList.remove("hidden");
    btn.disabled = false;
    btn.innerHTML = '<i class="fa-solid fa-rotate"></i> Coba lagi';
    const note = document.querySelector(".unlock-return-note");
    if (note) note.textContent = e.message || "Akses belum dapat dibuka. Silakan coba lagi.";
    console.error("Vidpas unlock failed:", e);
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
    const items = shuffle(all.filter(v => v.slug !== slug)).slice(0,8);
    if (!items.length) { grid.classList.add("hidden"); empty.classList.remove("hidden"); return; }
    grid.classList.remove("hidden"); empty.classList.add("hidden");
    const card = v => `<a class="related-card ${v.orientation==="vertical"?"is-vertical":"is-horizontal"}" href="/v/${encodeURIComponent(v.slug)}">
      <div class="related-thumb">${v.thumbnail_url?thumbnailMarkup(v.thumbnail_url,v.title,"vp-thumb-media"):'<span class="related-no-thumb"><i class="fa-solid fa-circle-play"></i></span>'}<span class="related-play"><i class="fa-solid fa-play"></i></span></div>
      <div class="related-copy"><h3>${esc(v.title)}</h3><p><i class="fa-regular fa-eye"></i> ${Number(v.views||0).toLocaleString("id-ID")} views</p></div></a>`;
    const first = items.slice(0,2).map(card).join("");
    const middle = items.slice(2,6).map(card).join("");
    const last = items.slice(6,8).map(card).join("");
    grid.innerHTML = `${first}<div class="related-ad related-ad-square"><div id="relatedBanner300" class="ad-slot ad-300x250"></div></div>${middle}<div class="related-ad related-ad-bottom"><div id="relatedBanner468" class="ad-slot ad-468x60"></div></div>${last}`;
    // Banner placements follow the requested groups: after videos 1–2 and 5–6.
    queueAd(() => loadAdsterraBanner("relatedBanner300","100bd0c6cfd6cedb608b2e083620df0e",300,250,"https://biomanos.org/22/100bd0c6cfd6cedb608b2e083620df0e"));
    queueAd(() => loadAdsterraBanner("relatedBanner468","6e20a4c9dad189e23fe8642d6c242cfd",468,60,"https://biomanos.org/22/6e20a4c9dad189e23fe8642d6c242cfd"));
  }).catch(e => { console.warn("Related videos:",e); grid.classList.add("hidden"); empty.classList.remove("hidden"); });
}

/* Adsterra display placements. Popunder is intentionally not auto-triggered on every
   task click or timer: repeated forced popups can create invalid/accidental ad traffic. */
function queueAd(callback) {
  adBannerQueue = adBannerQueue.then(() => new Promise(resolve => {
    callback();
    setTimeout(resolve, 5000);
  })).catch(error => console.warn("Ad queue:", error));
  return adBannerQueue;
}
function loadAdsterraBanner(slotId,key,width,height,src) {
  const slot = $(slotId);
  if (!slot || slot.dataset.loaded) return;
  slot.dataset.loaded = "1";
  const frame = document.createElement("iframe");
  frame.title = "Iklan";
  frame.width = String(width);
  frame.height = String(height);
  frame.loading = "eager";
  frame.referrerPolicy = "strict-origin-when-cross-origin";
  frame.setAttribute("allow","autoplay; fullscreen; clipboard-write");
  frame.style.cssText = `display:block;border:0;max-width:100%;width:${width}px;height:${height}px;background:transparent;overflow:hidden`;
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
  frame.loading = "eager";
  frame.referrerPolicy = "strict-origin-when-cross-origin";
  frame.style.cssText = "display:block;width:min(100%,720px);height:180px;border:0;background:transparent;overflow:hidden";
  frame.srcdoc = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>html,body{margin:0;padding:0;background:transparent;overflow:hidden}</style></head><body><div id="container-c4ddd55dc2405990669cdc39190e71f0"></div><script async fetchpriority="high" data-cfasync="false" src="https://biomanos.org/21/c4ddd55dc2405990669cdc39190e71f0"></script></body></html>`;
  slot.appendChild(frame);
}

function loadSocialBar() {
  if (document.querySelector('script[data-vidpas-socialbar]')) return;
  const s = document.createElement("script");
  s.setAttribute("data-cfasync", "false");
  s.setAttribute("data-vidpas-socialbar", "1");
  s.async = true;
  s.src = "https://biomanos.org/14/7f23d55e9ce004ffd40e2673e6c90480";
  s.onerror = () => console.warn("Vidpas social bar gagal dimuat.");
  (document.head || document.body).appendChild(s);
}

// Load the popunder provider once at page start. The provider controls its own
// genuine user-gesture rules; Vidpas does not synthesize clicks or force repeats.
function setupPopunder() {
  // Load the provider once per page view. Frequency and user-gesture limits
  // remain controlled by Adsterra; Vidpas never fabricates clicks or popups.
  if (document.querySelector('script[data-vidpas-popunder]')) return;
  const script = document.createElement("script");
  script.setAttribute("data-cfasync", "false");
  script.setAttribute("data-vidpas-popunder", "1");
  script.async = true;
  script.src = "https://benchform.org/1/c457f7d4057ebc29323ab539f45678bb";
  script.onerror = () => console.warn("Vidpas popunder provider gagal dimuat.");
  (document.head || document.body).appendChild(script);
}

const AD_ENTRY_MOTIONS = ["ad-from-top", "ad-from-bottom", "ad-from-left", "ad-from-right", "ad-from-center"];
let adMotionIndex = 0;
function animatePanel(panel, motion, hideAfterMs, onHidden) {
  if (!panel) return;
  panel.classList.remove("is-hiding", ...AD_ENTRY_MOTIONS, "ad-from-bottom", "ad-from-left");
  panel.classList.add(motion);
  panel.hidden = false;
  window.clearTimeout(panel._hideTimer);
  panel._hideTimer = window.setTimeout(() => {
    panel.classList.add("is-hiding");
    window.setTimeout(() => {
      panel.hidden = true;
      panel.classList.remove("is-hiding");
      if (onHidden) onHidden();
    }, 360);
  }, hideAfterMs);
}

// 300x250: slides upward at each 15-second cycle; close button collapses it,
// but the next scheduled cycle still runs.
function showSlideAd(panel) {
  if (!panel) return;
  const slot = $("slideAdSlot");
  if (slot) { slot.dataset.loaded = ""; slot.replaceChildren(); }
  const bannerKey = "100bd0c6cfd6cedb608b2e083620df0e";
  loadAdsterraBanner("slideAdSlot",bannerKey,300,250,`https://biomanos.org/22/${bannerKey}`);
  animatePanel(panel,"ad-from-bottom",10000);
}
function startSlideAd() {
  const panel = $("videoSlideAd");
  if (!panel || panel.dataset.started) return;
  panel.dataset.started = "1";
  const show = () => { if (document.visibilityState === "visible") showSlideAd(panel); };
  window.setTimeout(show, 5000);
  panel._cycleTimer = window.setInterval(show, 15000);
  const close = $("hideSlideAd");
  if (close) close.onclick = () => {
    window.clearTimeout(panel._hideTimer);
    panel.classList.add("is-hiding");
    window.setTimeout(() => { panel.hidden = true; panel.classList.remove("is-hiding"); },360);
  };
}

// 468x60: slide from left to right every 20 seconds.
function startSideBanner() {
  const panel = $("videoFloatingAd");
  if (!panel || panel.dataset.started) return;
  panel.dataset.started = "1";
  const key = "6e20a4c9dad189e23fe8642d6c242cfd";
  const show = () => {
    if (document.visibilityState !== "visible") return;
    const slot = $("floatingAdSlot");
    if (slot) { slot.dataset.loaded = ""; slot.replaceChildren(); }
    loadAdsterraBanner("floatingAdSlot",key,468,60,`https://biomanos.org/22/${key}`);
    animatePanel(panel,"ad-from-left",15000);
  };
  window.setTimeout(show, 8000);
  panel._cycleTimer = window.setInterval(show,20000);
  const close = $("closeFloatingAd");
  if (close) close.onclick = () => {
    window.clearTimeout(panel._hideTimer);
    panel.classList.add("is-hiding");
    window.setTimeout(() => { panel.hidden = true; panel.classList.remove("is-hiding"); },360);
  };
}

// Native #21 placement: visible 40 seconds, hidden for 5 seconds, repeats.
function startNativeAdCycle() {
  const panel = $("videoNativeAd");
  if (!panel || panel.dataset.started) return;
  panel.dataset.started = "1";
  const show = () => {
    if (document.visibilityState !== "visible") return;
    const slot = $("nativeAdSlot");
    if (slot) { slot.dataset.loaded = ""; slot.replaceChildren(); }
    loadNativeAd("nativeAdSlot");
    panel.hidden = false;
    window.clearTimeout(panel._hideTimer);
    panel._hideTimer = window.setTimeout(() => { panel.hidden = true; },40000);
  };
  show();
  panel._cycleTimer = window.setInterval(show,45000);
  const close = $("closeNativeAd");
  if (close) close.onclick = () => { window.clearTimeout(panel._hideTimer); panel.hidden = true; };
}
let unlockedAdServicesStarted = false;
function startUnlockedAdServices() {
  if (unlockedAdServicesStarted) return;
  unlockedAdServicesStarted = true;
  loadSocialBar();
  startSlideAd();
  startSideBanner();
  startNativeAdCycle();
  setupCommunityNotice();
}

async function setupCommunityNotice() {
  let settings = {};
  try { settings = await api("/settings"); } catch(e) { console.warn("Community links:",e); }
  const tg = safeHttpUrl(settings.video_telegram_url || DEFAULT_TELEGRAM) || DEFAULT_TELEGRAM;
  const wa = safeHttpUrl(settings.video_whatsapp_url || DEFAULT_WHATSAPP) || DEFAULT_WHATSAPP;
  const tgLink = $("communityTelegram"), waLink = $("communityWhatsapp");
  if (tgLink) tgLink.href = tg;
  if (waLink) waLink.href = wa;
  const panel = $("communityNotice");
  if (!panel) return;
  let shown = 0;
  const showNotice = () => {
    if (shown >= 3 || document.visibilityState !== "visible") return;
    shown++;
    panel.hidden = false;
    panel.classList.remove("is-leaving");
    window.clearTimeout(panel._autoHide);
    panel._autoHide = window.setTimeout(() => {
      panel.classList.add("is-leaving");
      window.setTimeout(() => { panel.hidden = true; panel.classList.remove("is-leaving"); },250);
    },5000);
  };
  [30000,60000,90000].forEach(delay => window.setTimeout(showNotice,delay));
  const close = $("closeCommunityNotice");
  if (close) close.onclick = () => {
    window.clearTimeout(panel._autoHide);
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
      if (result && typeof result.likes === "number") {
        $("likeCount").textContent = result.likes.toLocaleString("id-ID");
        const buttonCount = $("likeButtonCount");
        if (buttonCount) buttonCount.textContent = result.likes.toLocaleString("id-ID");
      }
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
function buildLockedPage(data) {
  videoData = data;
  root.innerHTML = `<div class="video-gate-shell"><div id="lockedPlayerArea" class="locked-player-area is-locked">${lockedMarkup()}</div></div>`;
  const related = $("relatedSection");
  if (related) related.hidden = true;
  mountUnlockGate();
}
function buildUnlockedPage(data) {
  videoData = data;
  unlocked = false;
  root.innerHTML = `<section class="video-gate-shell">
    <header class="video-publisher-heading"><span>VIDEO VIDPAS</span></header>
    <section class="video-info"><div class="video-info-main"><h1>${esc(data.title)}</h1><p class="video-description">${esc(data.description || "Belum ada deskripsi untuk video ini.")}</p></div></section>
    <div class="video-page-ad video-top-ad"><div class="ad-caption">Advertisement</div><div id="topBannerSlot" class="ad-slot ad-728x90"></div></div>
    <section class="video-stage-wrap" id="videoStage"><div class="video-player-loading"><span class="loading-spinner"></span></div></section>
    <div class="video-page-ad video-mid-ad"><div class="ad-caption">Advertisement</div><div id="midBannerSlot" class="ad-slot ad-468x60"></div></div>
    <section class="video-info video-info-meta"><div class="video-info-main"><div class="video-metrics"><span><i class="fa-regular fa-eye"></i><b>${Number(data.views||0).toLocaleString("id-ID")}</b> views</span><span><i class="fa-solid fa-heart"></i><b id="likeCount">${Number(data.likes||0).toLocaleString("id-ID")}</b> likes</span><span><i class="fa-solid fa-calendar-days"></i>${data.created_at?new Date(data.created_at).toLocaleDateString("id-ID"):"Vidpas"}</span></div></div></section>
    <section class="video-actions-panel" id="videoActions"><div class="video-actions-row">
      <button class="video-action-btn like" id="likeBtn" type="button"><i class="fa-regular fa-heart"></i><span>Like</span><b id="likeButtonCount">${Number(data.likes||0).toLocaleString("id-ID")}</b></button>
      <button class="video-action-btn download" id="downloadBtn" type="button" disabled><i class="fa-solid fa-download"></i><span>Download tidak tersedia</span></button>
      <button class="video-action-btn" id="shareBtn" type="button"><i class="fa-solid fa-share-nodes"></i><span>Share</span></button>
    </div><p class="actions-hint" id="downloadHint">${data.download_url ? "Video sudah terbuka. Kamu bisa menonton dan mengunduh." : "Publisher belum menyediakan tautan download."}</p></section>
    <div class="video-social-shortcuts">${tasks.map(t=>{const p=platforms[String(t.type||"").toLowerCase()]||{name:"Platform",icon:"fa-solid fa-arrow-up-right-from-square",tone:"generic"};return `<a class="video-social-button ${p.tone}" href="${esc(platformAppHref(t.type,t.url))}" target="_blank" rel="noopener noreferrer" aria-label="${esc(p.name)}"><i class="${p.icon}"></i><span>${esc(p.name)}</span></a>`;}).join("")}</div>
    <div class="video-page-ad video-unlock-ad"><div class="ad-caption">Advertisement</div><div id="unlockBannerSlot" class="ad-slot ad-300x250"></div></div>
  </section>`;
  const related = $("relatedSection");
  if (related) related.hidden = false;
  renderPlayer(data);
  setupActionButtons(data);
  queueAd(() => loadAdsterraBanner("topBannerSlot","a0c724147631738be4791be58f8fbaed",728,90,"https://biomanos.org/22/a0c724147631738be4791be58f8fbaed"));
  queueAd(() => loadAdsterraBanner("midBannerSlot","6e20a4c9dad189e23fe8642d6c242cfd",468,60,"https://biomanos.org/22/6e20a4c9dad189e23fe8642d6c242cfd"));
  queueAd(() => loadAdsterraBanner("unlockBannerSlot","100bd0c6cfd6cedb608b2e083620df0e",300,250,"https://biomanos.org/22/100bd0c6cfd6cedb608b2e083620df0e"));
  startUnlockedAdServices();
  renderRelated();
}
function buildPage(data) {
  videoData = data;
  tasks = Array.isArray(data.unlock_tasks) ? data.unlock_tasks.filter(t => t && safeHttpUrl(t.url)) : [];
  resetSavedTasksForPageLoad();
  document.title = `${data.title} — Vidpas`;
  if (tasks.length) return buildLockedPage(data);
  buildUnlockedPage(data);
}

// A page restored from the browser back/forward cache is not a fresh JS load.
// Reload it so Sub to Unlock always starts at 0 after returning to the page.
window.addEventListener("pageshow", event => {
  if (event.persisted) window.location.reload();
});

(async () => {
  try {
    // Locked Sub to Unlock page: only the popunder provider is initialized.
    // Banner rotations, social bar and other ad placements start after unlock.
    setupPopunder();
    const d = await api(`/videos/${encodeURIComponent(slug)}`);
    if (!d || !d.title) throw Error("Video tidak ditemukan.");
    const remaining = Math.max(0, 3000 - (Date.now() - pageEnteredAt));
    if (remaining) await new Promise(resolve => setTimeout(resolve, remaining));
    buildPage(d);
  } catch(e) {
    root.innerHTML = `<div class="video-error"><div><i class="fa-solid fa-triangle-exclamation"></i></div><h2>Video tidak dapat dimuat</h2><p>${esc(e.message)}</p><a href="/videos" class="video-error-link"><i class="fa-solid fa-arrow-left"></i> Kunjungi semua video</a></div>`;
  }
})();