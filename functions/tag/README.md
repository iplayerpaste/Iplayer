# Vidpas — Cloudflare Pages + Supabase

Vidpas is a community sharing site with separate pages for the home screen, poster creation, poster exploration, poster detail, video exploration, video detail, and admin video management.

## Project structure

- `public/index.html`, `home.css`, `home.js` — homepage
- `public/paste.html`, `paste.css`, `app.js` — halaman Paste Link untuk membuat, menjelajah, dan membaca paste
- `public/create-poster.html`, `.css`, `.js` — create poster link
- `public/explore-posters.html`, `.css`, `.js` — poster library (20 per page, two columns)
- `public/poster.html`, `poster-view.css`, `poster-view.js` — poster detail
- `public/videos.html`, `videos.css`, `videos.js` — video library
- `public/video.html`, `video-view.css`, `video-view.js` — detail video, normalisasi URL embed, tugas buka-kunci, dan penghitung interaksi
- `public/admin.html`, `admin.css`, `admin.js` — admin dashboard, settings, poster moderation, ads and announcements
- `public/admin-videos.html`, `admin-videos.css`, `admin-videos.js` — dedicated admin video embed manager, sharing the admin session
- `functions/api/[[path]].js` — API entry khusus `/api/*`
- `functions/p/[[slug]].js` — halaman Paste Link khusus `/p/:slug`, terpisah dari API agar rute tidak bertabrakan
- `public/_routes.json` — membatasi pemanggilan Functions hanya untuk `/api/*` dan `/p/*`
- `src/worker.js` — API routes
- `supabase/schema.sql` — database schema and additive Vidpas migration

## Cloudflare Pages

- Root directory: repository root (blank)
- Build command: blank
- Build output directory: `public`
- Production branch: `main`
- `functions/` must be at repository root, beside `public/` and `src/`.

Required Pages environment variables/secrets: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `ADMIN_PASSWORD_HASH`, `SESSION_SECRET`, `SITE_ORIGIN`. Keep service role and session secrets private. `SITE_ORIGIN` must remain the active Pages URL until the custom domain has been attached and verified.

## Route layout

```text
functions/
  api/
    [[path]].js
  p/
    [[slug]].js
public/
  _routes.json
  _redirects
src/
  worker.js
```

`/api/*` diproses oleh API Worker. `/p/:slug` dilayani oleh Function tersendiri yang mengambil halaman `/create-paste` dari Pages Assets, sehingga alamat Paste Link tetap `/p/:slug`. Video memakai route `/v/:slug` dan halaman detailnya mengubah URL YouTube/Vimeo/Drive/Dropbox ke URL pemutar yang sesuai.

## Supabase migration

Run the updated `supabase/schema.sql` in Supabase SQL Editor. It creates the `posters` table and adds `downloads`, `shares`, and `likes` counters to `videos`. Existing rows are retained.

## Custom domain

The project is not configured to use `vidpas.my.id` yet. Buy/register the domain, attach it under Cloudflare Pages → Custom domains, wait for the domain status to become Active, then change `SITE_ORIGIN` to `https://vidpas.my.id`. Do not change the origin before the domain is active.


## Pemisahan route Cloudflare Pages Functions

- `functions/api/[[path]].js` menangani endpoint backend `/api/*`.
- `functions/p/[[slug]].js` menangani halaman Paste Link `/p/:slug` dan menyajikan `public/paste.html`.
- `functions/v/[[slug]].js` menangani halaman detail video `/v/:slug` dan menyajikan `public/video.html`.
- `public/_routes.json` mengaktifkan ketiga jalur tersebut secara terpisah.
- `/create-paste`, `/videos`, `/posters`, dan `/admin` tetap disajikan melalui aturan `public/_redirects`.

Jangan menambahkan rewrite `/p/*` atau `/v/*` ke `_redirects`; kedua jalur detail tersebut sudah ditangani oleh Functions masing-masing.
