/** Normalize common provider share links into an embeddable iframe or native video source. */
export function normalizeVideoSource(raw) {
  try {
    const u = new URL(String(raw || '').trim());
    if (!['https:', 'http:'].includes(u.protocol)) return null;
    const host = u.hostname.toLowerCase().replace(/^www\./, '');
    const parts = u.pathname.split('/').filter(Boolean);
    if (host === 'videy.co') {
      const id = u.searchParams.get('id') || parts.at(-1);
      return id ? { type: 'video', src: `https://cdn.videy.co/${encodeURIComponent(id)}.mp4` } : null;
    }
    if (host === 'cdn.videy.co' && /\.mp4$/i.test(u.pathname)) return { type: 'video', src: u.href };
    if (host === 'youtu.be') { const id=parts[0]; return id?{type:'iframe',src:`https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}`} : null; }
    if (host === 'youtube.com' || host.endsWith('.youtube.com') || host === 'youtube-nocookie.com') {
      if (u.pathname.startsWith('/embed/')) return {type:'iframe',src:u.href};
      const id=u.searchParams.get('v') || (u.pathname.startsWith('/shorts/')?parts[1]:null);
      return id?{type:'iframe',src:`https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}`} : null;
    }
    if (host === 'dailymotion.com' || host.endsWith('.dailymotion.com') || host === 'dai.ly') {
      const i=parts.indexOf('video'); const id=(i>=0?parts[i+1]:parts[0])?.split('_')[0];
      return id?{type:'iframe',src:`https://www.dailymotion.com/embed/video/${encodeURIComponent(id)}`} : null;
    }
    if (host === 'vimeo.com' || host.endsWith('.vimeo.com')) { const id=parts.find(x=>/^\d+$/.test(x)); return id?{type:'iframe',src:`https://player.vimeo.com/video/${id}`} : null; }
    if (host === 'drive.google.com' && u.pathname.includes('/file/d/')) { const id=parts[2]; return id?{type:'iframe',src:`https://drive.google.com/file/d/${encodeURIComponent(id)}/preview`} : null; }
    if (host.endsWith('dropbox.com')) { u.searchParams.set('raw','1'); return /\.(mp4|webm|ogg|m4v)$/i.test(u.pathname)?{type:'video',src:u.href}:{type:'iframe',src:u.href}; }
    if (host.endsWith('streamable.com')) { const id=parts.at(-1); return id?{type:'iframe',src:`https://streamable.com/e/${encodeURIComponent(id)}`} : null; }
    if (/\.(mp4|webm|ogg|m4v)$/i.test(u.pathname)) return {type:'video',src:u.href};
    return {type:'iframe',src:u.href};
  } catch { return null; }
}
export function playerMarkup(source,title,classes='') {
  const safeTitle=String(title||'Video').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  if(source.type==='video') return `<video id="videoFrame" class="${classes}" controls playsinline preload="metadata"><source src="${source.src}">Browser kamu tidak mendukung pemutar video.</video>`;
  return `<iframe id="videoFrame" class="${classes}" src="${source.src}" title="${safeTitle}" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen loading="lazy" referrerpolicy="strict-origin-when-cross-origin"></iframe>`;
}
