/* One shared navbar imported by every public page. */
(() => {
  const mount = document.getElementById('siteNavbar');
  if (!mount || mount.dataset.ready === '1') return;
  mount.dataset.ready = '1';
  mount.innerHTML = `
    <header class="site-navbar">
      <div class="site-navbar-inner">
        <a class="site-navbar-brand" href="/" aria-label="Vidpas Beranda">
          <img class="site-navbar-logo" src="/images/vidpas-logo.png" alt="Vidpas">
        </a>
        <nav class="site-navbar-actions" aria-label="Navigasi utama">
          <a class="site-navbar-link pastelink" href="/explore-paste"><i class="fa-solid fa-link" aria-hidden="true"></i><span>All Pastelink</span></a>
          <a class="site-navbar-link videos" href="/videos"><i class="fa-solid fa-circle-play" aria-hidden="true"></i><span>All Video</span></a>
        </nav>
      </div>
    </header>`;
})();
