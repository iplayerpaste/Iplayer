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

/**
 * Resolve thumbnail links independently from video-player links.
 * Direct images become <img>; known cloud-share pages become image URLs or
 * provider iframes; other valid HTTP(S) links are treated as embeddable pages.
 */
export function normalizeThumbnailSource(raw) {
  try {
    const u = new URL(String(raw || '').trim());
    if (!['https:', 'http:'].includes(u.protocol)) return null;
    const host = u.hostname.toLowerCase().replace(/^www\./, '');
    const parts = u.pathname.split('/').filter(Boolean);

    // Google Drive shared file links (image or video): use Drive's thumbnail endpoint.
    if (host === 'drive.google.com' || host === 'docs.google.com') {
      let id = '';
      const fileIndex = parts.indexOf('d');
      if (fileIndex >= 0 && parts[fileIndex + 1]) id = parts[fileIndex + 1];
      if (!id) id = u.searchParams.get('id') || '';
      if (id) return { type: 'image', src: `https://drive.google.com/thumbnail?id=${encodeURIComponent(id)}&sz=w1200` };
      if (u.pathname.includes('/uc')) return { type: 'image', src: u.href };
    }

    // Dropbox share URLs: raw=1 requests the actual file, not the preview page.
    if (host === 'dropbox.com' || host.endsWith('.dropbox.com')) {
      u.searchParams.delete('dl');
      u.searchParams.set('raw', '1');
      if (/\.(png|jpe?g|gif|webp|avif|bmp|svg)$/i.test(u.pathname)) return { type: 'image', src: u.href };
      if (/\.(mp4|webm|ogg|m4v)$/i.test(u.pathname)) return { type: 'video', src: u.href };
      return { type: 'iframe', src: u.href };
    }
    if (host === 'dropboxusercontent.com' || host.endsWith('.dropboxusercontent.com')) {
      return /\.(mp4|webm|ogg|m4v)$/i.test(u.pathname)
        ? { type: 'video', src: u.href } : { type: 'image', src: u.href };
    }

    // MEGA public files require the MEGA embed player; a share page is not an image URL.
    if (host === 'mega.nz' || host === 'mega.co.nz') {
      if (parts[0] === 'file' && parts[1]) {
        const key = u.hash || '';
        return { type: 'iframe', src: `https://mega.nz/embed/${encodeURIComponent(parts[1])}${key}` };
      }
      if (parts[0] === 'embed' && parts[1]) return { type: 'iframe', src: u.href };
      return { type: 'iframe', src: u.href };
    }

    // Direct image/video assets, including custom domains and .net hosts.
    if (/\.(png|jpe?g|gif|webp|avif|bmp|svg)$/i.test(u.pathname)) return { type: 'image', src: u.href };
    if (/\.(mp4|webm|ogg|m4v)$/i.test(u.pathname)) return { type: 'video', src: u.href };

    // Common providers whose share links need an embedded player/page.
    if (host === 'imgur.com' || host === 'i.imgur.com') {
      const id = parts.at(-1)?.replace(/\.(png|jpe?g|gif|webp)$/i, '');
      if (id && host === 'imgur.com') return { type: 'image', src: `https://i.imgur.com/${encodeURIComponent(id)}.jpg` };
    }
    if (host === 'streamable.com') {
      const id = parts.at(-1);
      if (id) return { type: 'iframe', src: `https://streamable.com/e/${encodeURIComponent(id)}` };
    }
    if (host.includes('streamtape')) {
      const id = parts.at(-1);
      if (id) return { type: 'iframe', src: `https://streamtape.com/e/${encodeURIComponent(id)}` };
    }
    if (host.includes('dood')) {
      const id = parts.at(-1);
      if (id) return { type: 'iframe', src: `https://dood.to/e/${encodeURIComponent(id)}` };
    }
    if (host.includes('mixdrop')) {
      const id = parts.at(-1);
      if (id) return { type: 'iframe', src: `https://mixdrop.co/e/${encodeURIComponent(id)}` };
    }
    if (host === 'youtube.com' || host.endsWith('.youtube.com') || host === 'youtu.be' ||
        host === 'vimeo.com' || host.endsWith('.vimeo.com') ||
        host === 'dailymotion.com' || host.endsWith('.dailymotion.com') || host === 'dai.ly') {
      const video = normalizeVideoSource(u.href);
      return video?.type === 'iframe' ? { type: 'iframe', src: video.src } : null;
    }

    // Generic provider/embed URLs (including custom .net domains): render in a
    // contained iframe. The provider must permit third-party framing.
    return { type: 'iframe', src: u.href };
  } catch { return null; }
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

export function thumbnailMarkup(raw, title = 'Thumbnail', className = 'vp-thumb-media') {
  const source = normalizeThumbnailSource(raw);
  if (!source) return `<div class="vp-thumb-placeholder"><span>▶</span></div>`;
  const safeTitle = escapeHtml(title);
  const safeSrc = escapeHtml(source.src);
  if (source.type === 'image') {
    return `<img class="${className}" src="${safeSrc}" alt="${safeTitle}" loading="lazy" referrerpolicy="no-referrer" onerror="this.hidden=true;this.parentElement.classList.add('vp-thumb-failed')">`;
  }
  if (source.type === 'video') {
    return `<video class="${className}" src="${safeSrc}" muted playsinline preload="metadata"></video>`;
  }
  return `<iframe class="${className} vp-thumb-embed" src="${safeSrc}" title="${safeTitle}" loading="lazy" referrerpolicy="strict-origin-when-cross-origin" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen></iframe>`;
}
