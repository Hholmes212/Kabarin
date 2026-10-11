# Kabarin — Portal Berita Komunitas

Website berita dengan **login, tulis berita (foto/video), like, bookmark, komentar, share, kategori, pencarian, dark mode**.
Backend: Node.js + Express + SQLite. Frontend: HTML/CSS/JS murni (tanpa build step).
**Tidak perlu install database apa pun.**

## Cara menjalankan
Syarat: [Node.js](https://nodejs.org) versi 22.13 atau lebih baru (disarankan LTS terbaru).

**Windows:** klik dua kali `start.bat`
**Mac/Linux:** `./start.sh`

Atau manual:
```
npm install
npm start
```
Lalu buka **http://localhost:3000**

Saat pertama jalan, database dibuat otomatis dan diisi 11 berita contoh.
Akun demo: `redaksi@kabarin.id` / `demo1234` (atau tombol "Coba dengan akun demo" di jendela login).

## Fitur
- Daftar / masuk (JWT + bcrypt), sesi 7 hari
- Beranda: hero, ticker berita terbaru, carousel Trending (skor dari like, komentar, share, views + peluruhan waktu), filter kategori, urut Terbaru/Populer, muat otomatis saat scroll
- Pencarian cepat: tekan `Ctrl+K` atau `/`
- Halaman berita: progress baca, estimasi waktu baca, like (animasi), simpan, share (WhatsApp/Telegram/X/salin tautan), komentar, "Baca juga"
- Tulis / edit / hapus berita sendiri, drag & drop foto atau video, pratinjau kartu langsung, draf tersimpan otomatis
- Profil pengguna + bio, tab Tersimpan
- **Dua bahasa (Indonesia / Inggris)**: tombol `ID | EN` di navbar mengganti seluruh antarmuka; di halaman berita bahasa Inggris ada tombol "Translate to English" untuk isi berita (lihat bagian Terjemahan)
- Dark mode, responsif (di HP ada tab bar bawah)

## Struktur
```
server.js        entry point
db.js            skema SQLite (file di data/kabarin.db)
seed.js          berita contoh  (npm run seed untuk menambah lagi)
routes/          auth, news, comments, users
middleware/      JWT & rate limit
public/          frontend (index.html, css/, js/, assets/)
uploads/         foto/video hasil upload
```

## Pengaturan (opsional, file `.env`)
`PORT`, `JWT_SECRET` (kalau kosong dibuat otomatis), `AUTO_SEED=false` untuk mematikan berita contoh.

## Terjemahan (ID ↔ EN)
- **Teks antarmuka** ada di `public/js/i18n.js` (kamus `EN`). Teks baru: tulis `t('Teks Indonesia')` di kode, lalu tambahkan padanan Inggrisnya di kamus.
- **Isi berita** (judul + paragraf) diterjemahkan lewat `POST /api/translate` dan di-cache di tabel `translations`.
  Penyedia dipilih dari `.env`: `GOOGLE_TRANSLATE_API_KEY` (terbaik), `LIBRETRANSLATE_URL` (self-host, gratis), atau kosong = MyMemory (gratis, kuota harian kecil, kualitas biasa).

## Mengganti logo
Taruh `logo.png` di `public/assets/`.

## Deploy
Server Node mana pun (VPS, Railway, Render). Set `JWT_SECRET`, dan simpan folder `data/` serta `uploads/` di disk persisten.
