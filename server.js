require('dotenv').config();
const express = require('express');
const path = require('path');
const fs = require('fs');
const db = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;

fs.mkdirSync(path.join(__dirname, 'uploads'), { recursive: true });

app.disable('x-powered-by');
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
});
app.use(express.json({ limit: '100kb' }));

app.use('/uploads', express.static(path.join(__dirname, 'uploads'), { maxAge: '7d' }));
app.use(express.static(path.join(__dirname, 'public')));

app.use('/api/auth', require('./routes/auth'));
app.use('/api/news', require('./routes/news'));
app.use('/api/comments', require('./routes/comments'));
app.use('/api/users', require('./routes/users'));
app.use('/api/translate', require('./routes/translate'));
app.get('/api', (_req, res) => res.json({ message: 'Kabarin API berjalan' }));
app.use('/api', (_req, res) => res.status(404).json({ message: 'Endpoint tidak ditemukan.' }));

// Semua halaman lain -> single page app
app.get('*', (_req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

app.use((err, _req, res, _next) => {
  if (err.code === 'LIMIT_FILE_SIZE') return res.status(400).json({ message: 'Ukuran file maksimal 25MB.' });
  if (err.message === 'FILE_TYPE' || err.name === 'MulterError') return res.status(400).json({ message: 'File harus gambar (jpg, png, gif, webp) atau video (mp4, mov, webm).' });
  if (err.type === 'entity.parse.failed') return res.status(400).json({ message: 'Data tidak valid.' });
  console.error(err);
  res.status(500).json({ message: 'Terjadi kesalahan di server.' });
});

// Database kosong -> isi otomatis dengan berita contoh supaya halaman tidak kosong
if (process.env.AUTO_SEED !== 'false' && db.prepare('SELECT COUNT(*) c FROM news').get().c === 0) {
  require('./seed').run();
}

app.listen(PORT, () => {
  console.log(`\n  Kabarin jalan di  http://localhost:${PORT}\n`);
});
