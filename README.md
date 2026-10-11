<div align="center">

# 📰 Kabarin

**Portal berita komunitas: kabar dari warga, untuk semua.**

Tulis, baca, dan diskusikan berita dari lingkunganmu, dalam bahasa Indonesia atau Inggris.

![Node.js](https://img.shields.io/badge/Node.js-22.13%2B-339933?logo=node.js&logoColor=white)
![Express](https://img.shields.io/badge/Express-4-000000?logo=express&logoColor=white)
![SQLite](https://img.shields.io/badge/SQLite-built--in-003B57?logo=sqlite&logoColor=white)
![License](https://img.shields.io/badge/license-MIT-blue)

<!-- Ganti dengan screenshot atau GIF kamu, simpan di folder docs/ -->
![Tampilan Kabarin](docs/screenshot-home.png)

</div>

---

## ✨ Fitur

**Untuk pembaca**
- Beranda dengan hero, ticker berita terbaru, dan carousel **Trending** (skor dari like, komentar, share, dan jumlah dilihat, dengan peluruhan waktu)
- Filter kategori, urut **Terbaru / Populer**, dan muat otomatis saat scroll
- **Pencarian cepat** dengan `Ctrl + K` atau `/`
- Halaman berita dengan progress baca, estimasi waktu baca, dan rekomendasi "Baca juga"
- **Like**, **simpan (bookmark)**, **komentar**, dan **share** (WhatsApp, Telegram, X, atau salin tautan)

**Untuk penulis**
- Daftar dan masuk dengan aman (JWT + bcrypt, sesi 7 hari)
- Tulis, edit, dan hapus berita sendiri
- Unggah foto atau video dengan drag & drop (maks. 25 MB)
- Pratinjau kartu langsung dan **draf tersimpan otomatis**
- Halaman profil dengan bio dan tab berita tersimpan

**Dua bahasa 🌐**
- Tombol **ID | EN** mengganti seluruh antarmuka
- Isi berita bisa **diterjemahkan ke bahasa Inggris dengan satu klik**; hasilnya disimpan (cache) supaya tidak diterjemahkan berulang

**Lainnya**
- Dark mode dan tampilan responsif (di HP ada tab bar bawah)
- Tanpa build step di frontend dan tanpa database eksternal

## 🛠️ Teknologi

| Bagian | Yang dipakai |
|---|---|
| Backend | Node.js, Express |
| Database | SQLite (`node:sqlite` bawaan Node) |
| Autentikasi | JSON Web Token, bcryptjs |
| Upload file | Multer |
| Frontend | HTML, CSS, dan JavaScript murni (ES modules) |
| Terjemahan | Google Cloud Translation, LibreTranslate, atau MyMemory (pilih lewat `.env`) |

## 🚀 Cara menjalankan

**Syarat:** [Node.js](https://nodejs.org) versi **22.13 atau lebih baru**.

```bash
# 1. Unduh proyek
git clone https://github.com/USERNAME-KAMU/kabarin.git
cd kabarin

# 2. Pasang dependensi
npm install

# 3. Jalankan
npm start
```

Buka **http://localhost:3000**.

Saat pertama dijalankan, database dibuat otomatis dan diisi 11 berita contoh.

> **Akun demo:** `redaksi@kabarin.id` / `demo1234`
> (atau klik "Coba dengan akun demo" di jendela login)

Di Windows kamu juga bisa klik dua kali `start.bat`, dan di Mac/Linux jalankan `./start.sh`.

## ⚙️ Pengaturan (opsional)

Salin `.env.example` menjadi `.env`, lalu isi seperlunya:

| Variabel | Fungsi |
|---|---|
| `PORT` | Port server (bawaan `3000`) |
| `JWT_SECRET` | Kunci token login. Kalau kosong dibuat otomatis. **Isi sendiri saat deploy.** |
| `AUTO_SEED=false` | Matikan berita contoh otomatis |
| `GOOGLE_TRANSLATE_API_KEY` | Terjemahan dengan Google Cloud (kualitas terbaik) |
| `LIBRETRANSLATE_URL` | Terjemahan dengan LibreTranslate yang dihosting sendiri (gratis) |
| `MYMEMORY_EMAIL` | Menaikkan kuota harian MyMemory |

Kalau tidak ada penyedia terjemahan yang diisi, aplikasi memakai **MyMemory** (gratis, tanpa kunci, tapi kuota hariannya kecil).

## 🌍 Cara kerja terjemahan

Ada dua jenis teks, dan keduanya ditangani berbeda:

1. **Teks antarmuka** (menu, tombol, form) ada di `public/js/i18n.js`. Untuk menambah teks baru, tulis `t('Teks Indonesia')` di kode, lalu tambahkan padanan Inggrisnya di kamus.
2. **Isi berita** buatan pengguna diterjemahkan lewat `POST /api/translate`. Hasilnya disimpan di tabel `translations` supaya teks yang sama tidak diterjemahkan dua kali.

## 📁 Struktur proyek

```
kabarin/
├── server.js          # titik masuk aplikasi
├── db.js              # skema SQLite (file di data/kabarin.db)
├── seed.js            # berita contoh
├── routes/
│   ├── auth.js        # daftar, masuk, profil
│   ├── news.js        # CRUD berita, like, bookmark, share
│   ├── comments.js    # komentar
│   ├── users.js       # profil pengguna
│   └── translate.js   # terjemahan isi berita + cache
├── middleware/
│   ├── auth.js        # verifikasi JWT
│   └── rateLimit.js   # pembatas request
├── public/            # frontend
│   ├── index.html
│   ├── css/style.css
│   └── js/
│       ├── app.js     # router dan semua tampilan
│       ├── api.js     # pemanggil API
│       ├── i18n.js    # kamus dan fungsi terjemahan antarmuka
│       └── util.js    # fungsi bantu
└── uploads/           # foto/video hasil unggahan
```

## 🌐 Deploy

Kabarin butuh server Node.js (bukan hosting statis). Layanan seperti Render atau Railway bisa dipakai:

- Build command: `npm install`, start command: `npm start`
- Gunakan Node 22.13 atau lebih baru
- Isi `JWT_SECRET` dengan teks acak yang panjang
- Simpan folder `data/` dan `uploads/` di disk persisten, kalau tidak, data akan hilang saat server restart

## 🗺️ Rencana ke depan

- [ ] Terjemahan untuk komentar dan judul di daftar berita
- [ ] Pengaturan bahasa lain selain Indonesia dan Inggris
- [ ] Notifikasi komentar
- [ ] Moderasi dan pelaporan konten

## 📄 Lisensi

Dirilis di bawah lisensi [MIT](LICENSE).

---

<div align="center">
Dibuat oleh <a href="https://github.com/USERNAME-KAMU">NAMA KAMU</a> dengan bantuan AI di beberapa bagian.
</div>
