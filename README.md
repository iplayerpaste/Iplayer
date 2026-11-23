# ePlayer — Cloudflare Edition

Starter project ePlayer dengan frontend statis, Cloudflare Worker API, dan Supabase PostgreSQL.

## Penting sebelum produksi

Paket ini adalah fondasi aplikasi yang bisa dikembangkan dan dideploy. Beberapa fitur keamanan/produksi yang diminta (Turnstile CAPTCHA, rate limiting persisten, cursor pagination penuh, render script Adsterra di slot halaman, pengelolaan paste admin lengkap, dan verifikasi domain) masih perlu dilengkapi sebelum dibuka ke publik. Jangan menganggap CAPTCHA sudah aktif: sampai integrasi Turnstile ditambahkan, endpoint pembuatan paste belum memiliki proteksi CAPTCHA. Password paste saat ini memakai PBKDF2 WebCrypto. Lakukan pengujian keamanan sebelum produksi.

## 1. Siapkan Supabase

1. Buat project di Supabase.
2. Buka SQL Editor.
3. Jalankan isi `supabase/schema.sql`.
4. Salin Project URL dan Service Role Key. Jangan pernah memasukkan Service Role Key ke frontend.

## 2. Siapkan Cloudflare Worker

Install Node.js LTS, lalu jalankan:

```bash
npm install
npx wrangler login
```

Atur secret Worker:

```bash
npx wrangler secret put SUPABASE_URL
npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY
npx wrangler secret put SESSION_SECRET
npx wrangler secret put ADMIN_PASSWORD_HASH
```

`ADMIN_PASSWORD_HASH` memakai format `salt:hash` PBKDF2-SHA256 dengan 150.000 iterasi. Buat hash dengan skrip lokal tepercaya sebelum deploy. Jangan gunakan password pendek `190301` di produksi; ganti dengan password kuat dan unik.

Atur `SITE_ORIGIN` pada `wrangler.toml` menjadi domain Pages kamu.

Jalankan Worker:

```bash
npm run worker:dev
```

Deploy Worker:

```bash
npm run worker:deploy
```

## 3. Siapkan Cloudflare Pages

1. Push repository ini ke GitHub.
2. Di Cloudflare Dashboard, buka Workers & Pages → Create → Pages → Connect to Git.
3. Pilih repository.
4. Build command: kosongkan (situs statis).
5. Build output directory: `public`.
6. Deploy.

Edit `public/_redirects` dan ganti `YOUR_SUBDOMAIN` dengan nama subdomain Worker yang benar. Alternatif yang lebih baik untuk produksi adalah menambahkan custom domain Worker seperti `api.domainkamu.com`, lalu ubah rewrite menjadi domain tersebut.

## 4. Local development

Untuk Worker:

```bash
cp .dev.vars.example .dev.vars
# isi nilai rahasia lokal
npm run worker:dev
```

Untuk preview Pages:

```bash
npm run dev
```

Sesuaikan URL API di `public/app.js` jika Pages dan Worker berjalan di origin terpisah. Untuk produksi, gunakan custom API domain dan CORS allowlist yang hanya mengizinkan domain website.

## 5. GitHub

```bash
git init
git add .
git commit -m "Initial ePlayer Cloudflare project"
git branch -M main
git remote add origin https://github.com/USERNAME/REPOSITORY.git
git push -u origin main
```

Jangan commit `.dev.vars`, `.env`, atau secret.

## 6. Fitur dan status implementasi

- Create paste, expiry, public/private, password: starter endpoint tersedia.
- Public paste list, paste reader, password gate: tersedia.
- Admin login dan pengaturan komunitas: starter tersedia.
- Statistik dasar dan CRUD iklan dasar: starter tersedia.
- Turnstile CAPTCHA: perlu diintegrasikan dan diwajibkan sebelum produksi.
- Rate limiting: perlu ditambahkan (Cloudflare rate limiting rules / Durable Objects).
- Adsterra script injection: belum dirender pada frontend; jangan menyimpan/mengeksekusi script sampai mekanisme slot aman diselesaikan.
- Admin paste management lengkap: belum tersedia.
- Cursor pagination: parameter cursor masih perlu implementasi penuh.
- Audit hardening, tests, monitoring, dan backup: wajib sebelum launch.

## 7. Domain dan monitoring

Tambahkan domain di Cloudflare Pages, aktifkan HTTPS, lalu buat custom Worker domain untuk API. Pantau Workers & Pages → Analytics dan Supabase logs. Batas paket Cloudflare tetap berlaku; optimasi bukan berarti tanpa batas.
