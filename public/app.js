const API = "/api";
const $ = (id) => document.getElementById(id);
let cursor = null;
let currentPaste = null;

async function api(path, options = {}) {
  const response = await fetch(`${API}${path}`, {
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    credentials: "include",
    ...options
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Terjadi kesalahan. Coba lagi.");
  return data;
}
function status(el, message, kind = "") { el.textContent = message; el.className = `status ${kind}`; }
function escapeHtml(s = "") { return String(s).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c])); }
function formatDate(s) { return s ? new Date(s).toLocaleString("id-ID",{dateStyle:"medium",timeStyle:"short"}) : "—"; }
function parseRoute() {
  const p = location.pathname.split("/").filter(Boolean);
  if (p[0] === "p" && p[1]) return { type:"paste", slug:p[1] };
  if (p[0] === "tag" && p[1]) return { type:"tag", tag:decodeURIComponent(p[1]) };
  if (p[0] === "admin") return { type:"admin" };
  return { type:"home" };
}
async function loadSettings() {
  try {
    const s = await api("/settings");
    if (s.telegram_url) $("telegramLink").href = s.telegram_url;
    if (s.whatsapp_url) $("whatsappLink").href = s.whatsapp_url;
    if (s.site_name) document.title = `${s.site_name} — Share your text`;
  } catch {}
}
function linkify(text) {
  const escaped = escapeHtml(text);
  return escaped.replace(/(https?:\/\/[^\s<]+|www\.[^\s<]+)/gi, (url) => {
    const href = url.toLowerCase().startsWith("www.") ? `https://${url}` : url;
    return `<a href="${href}" target="_blank" rel="noopener noreferrer">${url}</a>`;
  });
}
async function createPaste(e) {
  e.preventDefault();
  const btn = e.submitter;
  const statusEl = $("createStatus");
  const content = $("pasteContent").value.trim();
  if (!content) return status(statusEl, "Isi paste wajib diisi.", "error");
  btn.disabled = true; status(statusEl, "Menyimpan paste…");
  try {
    const data = await api("/pastes", { method:"POST", body:JSON.stringify({
      title:$("pasteTitle").value.trim(), content, password:$("pastePassword").value,
      expires_in:$("pasteExpiry").value, visibility:$("pasteVisibility").value,
      tags:$("pasteTags").value.split(",").map(x=>x.trim()).filter(Boolean)
    })});
    $("createdUrl").textContent = data.url;
    $("createdResult").classList.remove("hidden");
    status(statusEl, "Paste berhasil diterbitkan.", "success");
    $("createForm").reset(); loadPastes(true);
  } catch(err) { status(statusEl, err.message, "error"); }
  finally { btn.disabled = false; }
}
async function loadPastes(reset = false, tag = null) {
  if (reset) { cursor = null; $("pasteList").innerHTML = ""; }
  const list = $("pasteList");
  try {
    const q = new URLSearchParams({ limit:"6" });
    if (cursor) q.set("cursor", cursor);
    const data = await api(`/pastes${tag ? `/tag/${encodeURIComponent(tag)}` : ""}?${q}`);
    cursor = data.next_cursor || null;
    if (!data.items?.length && reset) list.innerHTML = '<div class="empty-state">Belum ada paste publik. Jadilah yang pertama.</div>';
    for (const item of data.items || []) {
      const card = document.createElement("article"); card.className = "paste-card";
      const tags = (item.tags || []).map(t=>`<a class="tag" href="/tag/${encodeURIComponent(t)}">#${escapeHtml(t)}</a>`).join("");
      card.innerHTML = `<h3>${escapeHtml(item.title || "Untitled paste")}</h3><p>${escapeHtml(item.excerpt || "")}</p><div>${tags}</div><div class="meta"><span>${formatDate(item.created_at)}</span><span>◉ ${Number(item.views||0)}</span></div>`;
      card.addEventListener("click",()=>location.href=`/p/${encodeURIComponent(item.slug)}`);
      card.style.cursor = "pointer"; list.append(card);
    }
    $("loadMore").classList.toggle("hidden", !cursor);
  } catch(err) { if (reset) list.innerHTML = `<div class="empty-state">${escapeHtml(err.message)}</div>`; }
}
async function openPaste(slug) {
  $("reader").classList.remove("hidden");
  $("reader").innerHTML = '<div class="empty-state">Memeriksa paste…</div>';
  try {
    const meta = await api(`/pastes/${encodeURIComponent(slug)}/meta`);
    if (meta.expired) throw new Error("Link Paste ini sudah kedaluwarsa.");
    if (meta.protected) {
      currentPaste = {slug, meta};
      $("passwordDialog").showModal();
      $("reader").classList.add("hidden");
      return;
    }
    await showPaste(slug, null);
  } catch(err) { $("reader").innerHTML = `<div class="empty-state">${escapeHtml(err.message)}</div>`; }
}
async function showPaste(slug, password) {
  $("reader").classList.remove("hidden");
  $("reader").innerHTML = '<div class="empty-state">Memuat paste…</div>';
  await new Promise(r=>setTimeout(r,3000));
  try {
    const data = await api(`/pastes/${encodeURIComponent(slug)}/access`, {method:"POST",body:JSON.stringify({password})});
    $("reader").innerHTML = `<div class="eyebrow muted">PASTE VIEWER</div><h2>${escapeHtml(data.title || "Untitled paste")}</h2><div class="meta"><span>${formatDate(data.created_at)}</span><span>◉ ${Number(data.views||0)} views</span></div><pre>${linkify(data.content)}</pre><div class="reader-actions"><button class="button secondary" id="copyContent">Copy content</button><button class="button primary" id="sharePaste">Share paste ↗</button><a class="button ghost" href="/">Home</a></div>`;
    $("copyContent").onclick = async()=>{await navigator.clipboard.writeText(data.content);$("copyContent").textContent="Copied ✓";};
    $("sharePaste").onclick = async()=>{const u=location.href;if(navigator.share) await navigator.share({title:data.title||"ePlayer paste",url:u});else await navigator.clipboard.writeText(u);};
  } catch(err) { $("reader").innerHTML = `<div class="empty-state">${escapeHtml(err.message)}</div>`; }
}
$("createForm").addEventListener("submit", createPaste);
$("copyCreated").addEventListener("click", async()=>{await navigator.clipboard.writeText($("createdUrl").textContent);$("copyCreated").textContent="Copied ✓";});
$("loadMore").addEventListener("click",()=>loadPastes(false));
$("refreshPastes").addEventListener("click",()=>loadPastes(true));
$("passwordForm").addEventListener("submit", async e=>{
  e.preventDefault(); if(!currentPaste)return;
  $("passwordStatus").textContent="🤔 Memeriksa password…";
  try { await showPaste(currentPaste.slug,$("readerPassword").value); $("passwordDialog").close(); }
  catch(err) { $("passwordStatus").textContent=`😠 ${err.message}`; }
});
$("year").textContent = new Date().getFullYear();
const route = parseRoute();
if (route.type === "paste") { document.querySelector(".composer").classList.add("hidden"); document.querySelector(".hero").classList.add("hidden"); document.querySelector(".recent-section").classList.add("hidden"); openPaste(route.slug); }
else if (route.type === "tag") { document.querySelector(".composer").classList.add("hidden"); document.querySelector(".hero").classList.add("hidden"); document.querySelector("#recent h2").textContent=`Tag: ${route.tag}`; loadPastes(true,route.tag); }
else if (route.type === "admin") { location.replace("/admin.html"); }
else loadPastes(true);
loadSettings();
