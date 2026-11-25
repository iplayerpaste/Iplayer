/* Vidpas shared premium navbar + footer. Loaded by every page. */
(() => {
  const year = new Date().getFullYear();
  const navbar = document.getElementById('siteNavbar');
  if (navbar && !navbar.dataset.ready) {
    navbar.dataset.ready = '1';
    navbar.innerHTML = `
      <header class="vp-navbar">
        <div class="vp-navbar-inner">
          <a class="vp-brand" href="/" aria-label="Vidpas — Beranda">
            <img src="/images/vidpas-logo.png" alt="Vidpas" onerror="this.src='/images/vidpas-mark.png'">
          </a>
          <nav class="vp-nav-actions" aria-label="Navigasi utama">
            <a class="vp-nav-link vp-nav-paste" href="/explore-paste"><span class="vp-nav-icon">↗</span><span>All Pastelink</span></a>
            <a class="vp-nav-link vp-nav-video" href="/videos"><span class="vp-nav-icon">▶</span><span>All Video</span></a>
          </nav>
        </div>
      </header>`;
  }
  const footer = document.getElementById('siteFooter');
  if (footer && !footer.dataset.ready) {
    footer.dataset.ready = '1';
    footer.innerHTML = `
      <footer class="vp-footer">
        <div class="vp-footer-inner">
          <a class="vp-footer-brand" href="/" aria-label="Vidpas beranda">
            <img src="/images/vidpas-mark.png" alt="Vidpas">
            <span>Vidpas</span>
          </a>
          <p class="vp-footer-copy">Your space to share smarter.</p>
          <div class="vp-footer-bottom">
            <span>© ${year} Vidpas. All rights reserved.</span>
            <span class="vp-footer-note">Made for better sharing.</span>
          </div>
        </div>
      </footer>`;
  }
})();
