
/* Vidpas — Shared premium navigation and footer */
(() => {
  'use strict';

  const year = new Date().getFullYear();

  const navbar = document.getElementById('siteNavbar');

  if (navbar && !navbar.dataset.ready) {
    navbar.dataset.ready = '1';

    navbar.innerHTML = `
      <header class="vp-navbar">
        <div class="vp-navbar-inner">

          <a class="vp-brand" href="/" aria-label="Vidpas — Beranda">
            <img
              src="/images/vidpas-logo.png"
              alt="Vidpas"
              onerror="this.onerror=null;this.src='/images/vidpas-mark.png'"
            >
          </a>

          <nav class="vp-nav-actions" aria-label="Navigasi utama">

            <a class="vp-nav-link vp-nav-paste" href="/explore-paste">
              <span class="vp-nav-icon">
                <i class="fa-solid fa-layer-group" aria-hidden="true"></i>
              </span>
              <span>All Pastelink</span>
            </a>

            <a class="vp-nav-link vp-nav-video" href="/videos">
              <span class="vp-nav-icon">
                <i class="fa-solid fa-circle-play" aria-hidden="true"></i>
              </span>
              <span>All Video</span>
            </a>

          </nav>
        </div>
      </header>
    `;
  }

  const footer = document.getElementById('siteFooter');

  if (footer && !footer.dataset.ready) {
    footer.dataset.ready = '1';

    footer.innerHTML = `
      <footer class="vp-footer">
        <div class="vp-footer-inner">

          <div class="vp-footer-main">

            <div class="vp-footer-about">
              <a class="vp-footer-brand" href="/" aria-label="Vidpas beranda">
                <img src="/images/vidpas-mark.png" alt="">
                <span>Vidpas</span>
              </a>

              <p class="vp-footer-copy">
                Your space to share smarter.
                Create, organize, and discover content in one place.
              </p>
            </div>

            <div class="vp-footer-navigation">
              <span class="vp-footer-heading">Explore</span>
              <a href="/explore-paste">All Pastelink</a>
              <a href="/videos">All Video</a>
              <a href="/paste">Create Pasteling</a>
            </div>

            <div class="vp-footer-navigation">
              <span class="vp-footer-heading">Information</span>
              <a href="/terms">Syarat &amp; Ketentuan</a>
              <a href="/privacy">Kebijakan Privasi</a>
              <a href="/help">Bantuan</a>
            </div>

          </div>

          <div class="vp-footer-bottom">
            <span>© ${year} Vidpas. All rights reserved.</span>
            <span class="vp-footer-note">
              Made for better sharing.
              <i class="fa-solid fa-heart" aria-hidden="true"></i>
            </span>
          </div>

        </div>
      </footer>
    `;
  }
})();
