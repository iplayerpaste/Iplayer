/* =========================================================
   VIDPAS — PASTELINK READER
   Uses the existing /api/pastes/:slug endpoints.
   ========================================================= */
const $ = (id) => document.getElementById(id);
const API = "/api";
const slug = decodeURIComponent(location.pathname.split("/").filter(Boolean).at(-1) || "");
const TG = "https://t.me/vidpas";
const WA = "https://whatsapp.com/channel/0029VbEU8HWIt5rxVZ1eFg3c";
const numberFormat = new Intl.NumberFormat("id-ID");
let lockTimer = null;
let feedbackTimer = null;

const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
})[char]);

async function api(path, options = {}) {
  const { headers = {}, ...rest } = options;
  const response = await fetch(`${API}${path}`, {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...headers },
    ...rest
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.error || "Terjadi kesalahan. Silakan coba kembali.");
    error.status = response.status;
    throw error;
  }
  return data;
}

function fmt(value) {
  if (!value) return "Waktu tidak tersedia";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Waktu tidak tersedia";
  return new Intl.DateTimeFormat("id-ID", {
    dateStyle: "long",
    timeStyle: "short"
  }).format(date);
}

function formatCount(value) {
  const count = Number(value);
  return numberFormat.format(Number.isFinite(count) && count > 0 ? count : 0);
}

function linkify(value) {
  const safeText = esc(value);
  return safeText.replace(/(https?:\/\/[^\s<>]+|www\.[^\s<>]+)/gi, (rawUrl) => {
    const cleanUrl = rawUrl.replace(/[.,!?;:]+$/, "");
    const trailing = rawUrl.slice(cleanUrl.length);
    const href = cleanUrl.toLowerCase().startsWith("www.") ? `https://${cleanUrl}` : cleanUrl;
    return `<a href="${esc(href)}" target="_blank" rel="noopener noreferrer">${cleanUrl}</a>${trailing}`;
  });
}

function safeStorageGet(key) {
  try { return localStorage.getItem(key); } catch { return null; }
}
function safeStorageSet(key, value) {
  try { localStorage.setItem(key, value); } catch { /* Storage may be unavailable in private mode. */ }
}
function safeStorageRemove(key) {
  try { localStorage.removeItem(key); } catch { /* Storage may be unavailable in private mode. */ }
}

function progressLoading() {
  return new Promise((resolve) => {
    const stages = [
      { at: 0, title: "Memproses...", desc: "Menyiapkan halaman Pastelink untuk Anda." },
      { at: 34, title: "Memverifikasi...", desc: "Memeriksa keamanan dan status tautan." },
      { at: 70, title: "Menampilkan Pastelink...", desc: "Menyiapkan konten agar siap dibaca." }
    ];
    const start = performance.now();
    const duration = 5000;
    let currentStage = -1;

    const tick = (now) => {
      const percent = Math.min(100, ((now - start) / duration) * 100);
      const rounded = Math.round(percent);
      $("loadingBar").style.width = `${percent}%`;
      $("loadingPercent").textContent = `${rounded}%`;
      $("loadingProgress").setAttribute("aria-valuenow", String(rounded));

      const stageIndex = stages.reduce((found, stage, index) => percent >= stage.at ? index : found, 0);
      if (stageIndex !== currentStage) {
        currentStage = stageIndex;
        $("loadingTitle").textContent = stages[stageIndex].title;
        $("loadingDescription").textContent = stages[stageIndex].desc;
      }

      if (percent >= 100) resolve();
      else requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}

function attemptKey() { return `pv-pwd-${slug}`; }
function attempts() {
  try {
    const value = JSON.parse(safeStorageGet(attemptKey()) || '{"count":0,"until":0}');
    return {
      count: Math.max(0, Math.min(5, Number(value.count) || 0)),
      until: Math.max(0, Number(value.until) || 0)
    };
  } catch {
    return { count: 0, until: 0 };
  }
}
function saveAttempts(value) { safeStorageSet(attemptKey(), JSON.stringify(value)); }
function clearLockTimer() {
  if (lockTimer) window.clearInterval(lockTimer);
  lockTimer = null;
}

function passwordScreen() {
  clearLockTimer();
  const state = attempts();
  const locked = state.until > Date.now();

  $("reader").setAttribute("aria-busy", "false");
  $("reader").innerHTML = `
    <section class="pv-password">
      <div class="pv-secure-icon" aria-hidden="true"><i class="fa-solid fa-shield-halved"></i></div>
      <div class="pv-eyebrow">AKSES PASTELINK TERLINDUNGI</div>
      <h1>Konten dilindungi</h1>
      <p>Pastelink ini menggunakan perlindungan password. Masukkan password yang diberikan publisher untuk melanjutkan.</p>
      <form class="pv-password-form" id="pvPasswordForm" novalidate>
        <label for="pvPassword">Password Pastelink</label>
        <div class="pv-input-wrap">
          <i class="fa-solid fa-lock" aria-hidden="true"></i>
          <input id="pvPassword" type="password" placeholder="Masukkan password" autocomplete="current-password" required ${locked ? "disabled" : "autofocus"}>
        </div>
        <button class="pv-check" id="pvCheck" type="submit" ${locked ? "disabled" : ""}>
          <i class="fa-solid fa-unlock-keyhole" aria-hidden="true"></i><span>Verifikasi Password</span>
        </button>
        <div class="pv-password-msg" id="pvPasswordMsg" role="status" aria-live="polite"></div>
        <div class="pv-attempts" id="pvAttempts">${state.count ? `Percobaan salah: ${state.count}/5` : "Akses aman dengan verifikasi password"}</div>
        ${locked ? '<div class="pv-lock-note" id="pvLockNote"><i class="fa-solid fa-clock" aria-hidden="true"></i> Terlalu banyak percobaan. Silakan tunggu <strong id="pvLockCountdown">60 detik</strong> sebelum mencoba kembali.</div>' : ""}
      </form>
      <div class="pv-community" aria-label="Kanal resmi Vidpas">
        <a href="${TG}" target="_blank" rel="noopener noreferrer"><i class="fa-brands fa-telegram" aria-hidden="true"></i> Telegram Resmi</a>
        <a href="${WA}" target="_blank" rel="noopener noreferrer"><i class="fa-brands fa-whatsapp" aria-hidden="true"></i> WhatsApp Channel</a>
      </div>
    </section>`;

  $("pvPasswordForm").addEventListener("submit", checkPassword);
  if (locked) {
    const input = $("pvPassword");
    const button = $("pvCheck");
    const countdown = $("pvLockCountdown");
    const tickLock = () => {
      const remaining = Math.max(0, Math.ceil((attempts().until - Date.now()) / 1000));
      if (remaining <= 0) {
        clearLockTimer();
        saveAttempts({ count: 0, until: 0 });
        input.disabled = false;
        button.disabled = false;
        button.innerHTML = '<i class="fa-solid fa-unlock-keyhole" aria-hidden="true"></i><span>Verifikasi Password</span>';
        $("pvAttempts").textContent = "Silakan coba kembali";
        $("pvLockNote")?.remove();
        input.focus();
        return;
      }
      countdown.textContent = `${remaining} detik`;
    };
    tickLock();
    lockTimer = window.setInterval(tickLock, 500);
  } else {
    $("pvPassword")?.focus({ preventScroll: true });
  }
}

function showPasswordMessage(message, type = "error") {
  const element = $("pvPasswordMsg");
  if (!element) return;
  element.innerHTML = `<span class="pv-warning"><i class="fa-solid ${type === "success" ? "fa-circle-check" : "fa-circle-exclamation"}" aria-hidden="true"></i>${esc(message)}</span>`;
  window.clearTimeout(feedbackTimer);
  feedbackTimer = window.setTimeout(() => {
    if ($("pvPasswordMsg")) $("pvPasswordMsg").textContent = "";
  }, 3200);
}

async function checkPassword(event) {
  event.preventDefault();
  const input = $("pvPassword");
  const button = $("pvCheck");
  if (!input || !button || button.disabled) return;

  const password = input.value;
  if (!password) {
    showPasswordMessage("Masukkan password terlebih dahulu.");
    input.focus();
    return;
  }

  button.disabled = true;
  button.innerHTML = '<i class="fa-solid fa-spinner fa-spin" aria-hidden="true"></i><span>Memverifikasi...</span>';
  try {
    const data = await api(`/pastes/${encodeURIComponent(slug)}/access`, {
      method: "POST",
      body: JSON.stringify({ password })
    });
    safeStorageRemove(attemptKey());
    button.innerHTML = '<i class="fa-solid fa-circle-check" aria-hidden="true"></i><span>Password benar</span>';
    button.style.background = "linear-gradient(105deg, #168b69, #35b982)";
    await new Promise((resolve) => window.setTimeout(resolve, 350));
    await renderContent(data);
  } catch (error) {
    if (error.status === 401) {
      const state = attempts();
      const count = state.count + 1;
      if (count >= 5) {
        saveAttempts({ count: 5, until: Date.now() + 60000 });
        showPasswordMessage("Password salah 5 kali. Akses dikunci selama 1 menit.");
        window.setTimeout(passwordScreen, 1500);
      } else {
        saveAttempts({ count, until: 0 });
        showPasswordMessage(`Password belum benar. Percobaan ${count} dari 5.`);
        $("pvAttempts").textContent = `Percobaan salah: ${count}/5`;
        input.value = "";
        input.focus();
      }
    } else {
      showPasswordMessage(error.message || "Verifikasi gagal. Silakan coba kembali.");
    }
  } finally {
    if ($("pvCheck") && $("pvPasswordForm")) {
      const currentButton = $("pvCheck");
      if (currentButton.isConnected && attempts().until <= Date.now()) {
        currentButton.disabled = false;
        currentButton.innerHTML = '<i class="fa-solid fa-unlock-keyhole" aria-hidden="true"></i><span>Verifikasi Password</span>';
      }
    }
  }
}

async function showError(message) {
  clearLockTimer();
  $("reader").setAttribute("aria-busy", "false");
  $("reader").innerHTML = `
    <div class="pv-error">
      <div class="pv-error-icon"><i class="fa-solid fa-triangle-exclamation" aria-hidden="true"></i></div>
      <h2>Pastelink tidak dapat dibuka</h2>
      <p>${esc(message || "Terjadi kendala saat membuka Pastelink.")}</p>
      <a class="button secondary" href="/explore-paste"><i class="fa-solid fa-arrow-left" aria-hidden="true"></i> Kembali ke Explore</a>
    </div>`;
}

function updateReaderState() {
  $("reader").setAttribute("aria-busy", "false");
  clearLockTimer();
}

async function recordAction(action) {
  return api(`/pastes/${encodeURIComponent(slug)}/action`, {
    method: "POST",
    body: JSON.stringify({ action })
  });
}

function setActionFeedback(message) {
  const feedback = $("pvActionFeedback");
  if (!feedback) return;
  feedback.textContent = message;
  window.clearTimeout(feedbackTimer);
  feedbackTimer = window.setTimeout(() => {
    if ($("pvActionFeedback")) $("pvActionFeedback").textContent = "";
  }, 2600);
}

async function copyText(text) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return true;
  }
  const temporary = document.createElement("textarea");
  temporary.value = text;
  temporary.setAttribute("readonly", "");
  temporary.style.position = "fixed";
  temporary.style.opacity = "0";
  document.body.append(temporary);
  temporary.select();
  const copied = document.execCommand("copy");
  temporary.remove();
  if (!copied) throw new Error("Tidak dapat menyalin otomatis di perangkat ini.");
  return true;
}

async function renderContent(data) {
  updateReaderState();
  const title = data.title || "Pastelink tanpa judul";
  const content = String(data.content ?? "");
  const likes = Number(data.likes || 0);
  const dislikes = Number(data.dislikes || 0);
  document.title = `${title} — Vidpas`;
  $("reader").innerHTML = `
    <header class="pv-article-head">
      <div class="pv-brand">
        <span class="pv-brand-mark"><i class="fa-solid fa-link" aria-hidden="true"></i></span>
        <span>Vidpas<small>CONTENT READER</small></span>
      </div>
      <div class="pv-published">DIPUBLIKASIKAN<strong><i class="fa-regular fa-clock" aria-hidden="true"></i>${esc(fmt(data.created_at))}</strong></div>
    </header>
    <article class="pv-article">
      <span class="pv-article-kicker"><i class="fa-solid fa-file-lines" aria-hidden="true"></i> PASTELINK</span>
      <h1>${esc(title)}</h1>
      <div class="pv-stats" aria-label="Informasi Pastelink">
        <span><i class="fa-regular fa-eye" aria-hidden="true"></i><b id="pvViews">${formatCount(data.views)}</b> Views</span>
        <span><i class="fa-solid fa-shield-halved" aria-hidden="true"></i>Konten aman</span>
        <span><i class="fa-regular fa-file-lines" aria-hidden="true"></i>Berbagi teks</span>
      </div>
      <div class="pv-content" id="pvContent">${linkify(content)}</div>
      <div class="pv-actions" aria-label="Aksi Pastelink">
        <button class="pv-action" id="pvLike" type="button"><i class="fa-regular fa-thumbs-up" aria-hidden="true"></i><span id="pvLikes">${formatCount(likes)}</span> Suka</button>
        <button class="pv-action" id="pvDislike" type="button"><i class="fa-regular fa-thumbs-down" aria-hidden="true"></i><span id="pvDislikes">${formatCount(dislikes)}</span> Tidak suka</button>
        <button class="pv-action" id="pvCopy" type="button"><i class="fa-regular fa-copy" aria-hidden="true"></i> Salin konten</button>
        <button class="pv-action primary" id="pvShare" type="button"><i class="fa-solid fa-share-nodes" aria-hidden="true"></i> Bagikan</button>
      </div>
      <p class="pv-action-feedback" id="pvActionFeedback" role="status" aria-live="polite"></p>
      <section class="pv-channel">
        <div class="pv-channel-top">
          <span class="pv-channel-icon"><i class="fa-solid fa-bullhorn" aria-hidden="true"></i></span>
          <div><h3>Terhubung dengan Vidpas</h3><p>Ikuti kanal resmi untuk mendapatkan informasi dan pembaruan terbaru.</p></div>
        </div>
        <div class="pv-channel-links">
          <a href="${TG}" target="_blank" rel="noopener noreferrer"><i class="fa-brands fa-telegram" aria-hidden="true"></i> Telegram Resmi</a>
          <a href="${WA}" target="_blank" rel="noopener noreferrer"><i class="fa-brands fa-whatsapp" aria-hidden="true"></i> WhatsApp Channel</a>
        </div>
      </section>
    </article>`;

  $("pvCopy").addEventListener("click", async () => {
    const button = $("pvCopy");
    button.disabled = true;
    try {
      await copyText(`${title}\n\n${content}`);
      button.innerHTML = '<i class="fa-solid fa-check" aria-hidden="true"></i> Tersalin';
      setActionFeedback("Konten berhasil disalin.");
    } catch (error) {
      setActionFeedback(error.message);
    } finally {
      button.disabled = false;
      window.setTimeout(() => {
        if (button.isConnected) button.innerHTML = '<i class="fa-regular fa-copy" aria-hidden="true"></i> Salin konten';
      }, 2200);
    }
  });

  $("pvShare").addEventListener("click", async () => {
    const button = $("pvShare");
    button.disabled = true;
    try {
      if (navigator.share) {
        await navigator.share({ title, url: location.href });
      } else {
        await copyText(location.href);
        button.innerHTML = '<i class="fa-solid fa-check" aria-hidden="true"></i> Link disalin';
        setActionFeedback("Link Pastelink berhasil disalin.");
      }
      try { await recordAction("share"); } catch { /* Sharing itself should still work if analytics fails. */ }
    } catch (error) {
      if (error.name !== "AbortError") setActionFeedback(error.message || "Link belum dapat dibagikan.");
    } finally {
      button.disabled = false;
      window.setTimeout(() => {
        if (button.isConnected) button.innerHTML = '<i class="fa-solid fa-share-nodes" aria-hidden="true"></i> Bagikan';
      }, 2200);
    }
  });

  $("pvLike").addEventListener("click", () => vote("like"));
  $("pvDislike").addEventListener("click", () => vote("dislike"));

  const existingVote = safeStorageGet(`pv-vote-${slug}`);
  if (existingVote === "like" || existingVote === "dislike") {
    const button = $(existingVote === "like" ? "pvLike" : "pvDislike");
    const otherButton = $(existingVote === "like" ? "pvDislike" : "pvLike");
    button.classList.add("active");
    otherButton.disabled = true;
  }
}

async function vote(action) {
  const button = $(action === "like" ? "pvLike" : "pvDislike");
  const existingVote = safeStorageGet(`pv-vote-${slug}`);
  if (existingVote) {
    setActionFeedback(existingVote === action ? "Anda sudah memberikan penilaian." : "Anda sudah memberikan penilaian lain untuk Pastelink ini.");
    return;
  }
  button.disabled = true;
  try {
    const result = await recordAction(action);
    const field = action === "like" ? "likes" : "dislikes";
    $(`pv${field[0].toUpperCase()}${field.slice(1)}`).textContent = formatCount(result[field]);
    safeStorageSet(`pv-vote-${slug}`, action);
    button.classList.add("active");
    button.innerHTML = `<i class="fa-solid fa-thumbs-${action === "like" ? "up" : "down"}" aria-hidden="true"></i><span>${formatCount(result[field])}</span> ${action === "like" ? "Suka" : "Tidak suka"}`;
    const otherButton = $(action === "like" ? "pvDislike" : "pvLike");
    otherButton.disabled = true;
    setActionFeedback("Terima kasih atas penilaian Anda.");
  } catch (error) {
    setActionFeedback(error.message || "Penilaian belum dapat dikirim. Coba kembali nanti.");
  } finally {
    if (button.isConnected) button.disabled = false;
  }
}

async function init() {
  if (!slug) {
    await showError("Slug Pastelink tidak ditemukan.");
    return;
  }
  try {
    await progressLoading();
    const metadata = await api(`/pastes/${encodeURIComponent(slug)}/meta`);
    if (metadata.expired) throw new Error("Link Pastelink ini sudah kedaluwarsa.");
    if (metadata.protected) {
      passwordScreen();
      return;
    }
    const data = await api(`/pastes/${encodeURIComponent(slug)}/access`, {
      method: "POST",
      body: JSON.stringify({ password: null })
    });
    await renderContent(data);
  } catch (error) {
    await showError(error.message || "Terjadi kesalahan saat memuat Pastelink.");
  }
}

init();
