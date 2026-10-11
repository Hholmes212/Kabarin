const router = require('express').Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const db = require('../db');
const { required, optional } = require('../middleware/auth');

const CATEGORIES = ['Technology', 'Business', 'Sports', 'Politics', 'Entertainment'];
const UPLOAD_DIR = path.join(__dirname, '..', 'uploads');
const ALLOWED = /\.(jpe?g|png|gif|webp|mp4|mov|webm)$/i;

const upload = multer({
  storage: multer.diskStorage({
    destination: (_r, _f, cb) => cb(null, UPLOAD_DIR),
    filename: (_r, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase();
      const base = path.basename(file.originalname, ext).replace(/[^a-zA-Z0-9_-]+/g, '-').slice(0, 40) || 'file';
      cb(null, `${Date.now()}-${base}${ext}`);
    },
  }),
  limits: { fileSize: 25 * 1024 * 1024 },
  fileFilter: (_r, file, cb) => {
    if (/^(image|video)\//.test(file.mimetype) && ALLOWED.test(file.originalname)) return cb(null, true);
    cb(new Error('FILE_TYPE'));
  },
});

// Satu SELECT dipakai di semua endpoint; ? pertama = id pembaca (0 jika tamu)
const SELECT = `
  SELECT n.id, n.title, n.content, n.category, n.media_url, n.media_type, n.views, n.created_at, n.updated_at,
    u.id AS author_id, u.username AS author,
    (SELECT COUNT(*) FROM likes WHERE news_id = n.id) AS likes_count,
    (SELECT COUNT(*) FROM comments WHERE news_id = n.id) AS comments_count,
    (SELECT COUNT(*) FROM shares WHERE news_id = n.id) AS shares_count,
    EXISTS(SELECT 1 FROM likes WHERE news_id = n.id AND user_id = @me) AS liked,
    EXISTS(SELECT 1 FROM bookmarks WHERE news_id = n.id AND user_id = @me) AS bookmarked
  FROM news n JOIN users u ON u.id = n.user_id`;

const shape = (r) => ({ ...r, liked: !!r.liked, bookmarked: !!r.bookmarked });
const me = (req) => (req.user ? req.user.id : 0);
const removeFile = (url) => {
  if (!url || !url.startsWith('/uploads/') || path.basename(url).startsWith('seed-')) return;
  fs.unlink(path.join(UPLOAD_DIR, path.basename(url)), () => {});
};

// Skor "trending": interaksi dibobot + peluruhan waktu
function trendScore(n) {
  const hours = Math.max(0, (Date.now() - new Date(n.created_at.replace(' ', 'T') + 'Z').getTime()) / 36e5);
  return (n.likes_count * 3 + n.comments_count * 4 + n.shares_count * 5 + n.views * 0.5 + 2) / Math.pow(hours + 2, 1.1);
}

// GET /api/news?category=&q=&sort=latest|trending&author=&saved=1&limit=&offset=
router.get('/', optional, (req, res) => {
  const { category, q, sort, author, saved } = req.query;
  const limit = Math.min(parseInt(req.query.limit) || 9, 30);
  const offset = parseInt(req.query.offset) || 0;
  const where = [];
  const params = { me: me(req) };
  if (category && category !== 'all') { where.push('n.category = @category'); params.category = category; }
  if (q) { where.push('(n.title LIKE @q OR n.content LIKE @q)'); params.q = `%${String(q).trim().slice(0, 80)}%`; }
  if (author) { where.push('u.username = @author'); params.author = author; }
  if (saved) {
    if (!req.user) return res.status(401).json({ message: 'Silakan login dulu.' });
    where.push('EXISTS(SELECT 1 FROM bookmarks b WHERE b.news_id = n.id AND b.user_id = @me)');
  }
  const clause = where.length ? ' WHERE ' + where.join(' AND ') : '';
  const { me: _me, ...countParams } = params;
  const total = db.prepare(`SELECT COUNT(*) c FROM news n JOIN users u ON u.id = n.user_id${clause.replace(/@me/g, String(me(req)))}`).get(countParams).c;
  let rows = db.prepare(`${SELECT}${clause} ORDER BY n.created_at DESC, n.id DESC`).all(params);
  if (sort === 'trending') rows = rows.sort((a, b) => trendScore(b) - trendScore(a));
  res.json({ total, items: rows.slice(offset, offset + limit).map(shape) });
});

router.get('/trending', optional, (req, res) => {
  const rows = db.prepare(`${SELECT}`).all({ me: me(req) });
  res.json(rows.sort((a, b) => trendScore(b) - trendScore(a)).slice(0, 8).map(shape));
});

router.get('/stats', (_req, res) => {
  const count = (t) => db.prepare(`SELECT COUNT(*) c FROM ${t}`).get().c;
  const cats = db.prepare('SELECT category, COUNT(*) c FROM news GROUP BY category').all();
  res.json({ news: count('news'), users: count('users'), comments: count('comments'), categories: Object.fromEntries(cats.map((c) => [c.category, c.c])) });
});

router.get('/:id', optional, (req, res) => {
  const row = db.prepare(`${SELECT} WHERE n.id = @id`).get({ me: me(req), id: req.params.id });
  if (!row) return res.status(404).json({ message: 'Berita tidak ditemukan.' });
  res.json(shape(row));
});

router.post('/:id/view', (req, res) => {
  db.prepare('UPDATE news SET views = views + 1 WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

router.post('/:id/like', required, (req, res) => {
  const id = Number(req.params.id);
  if (!db.prepare('SELECT 1 FROM news WHERE id = ?').get(id)) return res.status(404).json({ message: 'Berita tidak ditemukan.' });
  const has = db.prepare('SELECT 1 FROM likes WHERE news_id = ? AND user_id = ?').get(id, req.user.id);
  if (has) db.prepare('DELETE FROM likes WHERE news_id = ? AND user_id = ?').run(id, req.user.id);
  else db.prepare('INSERT INTO likes (news_id, user_id) VALUES (?,?)').run(id, req.user.id);
  res.json({ liked: !has, likes_count: db.prepare('SELECT COUNT(*) c FROM likes WHERE news_id = ?').get(id).c });
});

router.post('/:id/bookmark', required, (req, res) => {
  const id = Number(req.params.id);
  if (!db.prepare('SELECT 1 FROM news WHERE id = ?').get(id)) return res.status(404).json({ message: 'Berita tidak ditemukan.' });
  const has = db.prepare('SELECT 1 FROM bookmarks WHERE news_id = ? AND user_id = ?').get(id, req.user.id);
  if (has) db.prepare('DELETE FROM bookmarks WHERE news_id = ? AND user_id = ?').run(id, req.user.id);
  else db.prepare('INSERT INTO bookmarks (news_id, user_id) VALUES (?,?)').run(id, req.user.id);
  res.json({ bookmarked: !has });
});

router.post('/:id/share', (req, res) => {
  const id = Number(req.params.id);
  if (!db.prepare('SELECT 1 FROM news WHERE id = ?').get(id)) return res.status(404).json({ message: 'Berita tidak ditemukan.' });
  db.prepare('INSERT INTO shares (news_id) VALUES (?)').run(id);
  res.json({ shares_count: db.prepare('SELECT COUNT(*) c FROM shares WHERE news_id = ?').get(id).c });
});

function validate(body) {
  const title = String(body.title || '').trim();
  const content = String(body.content || '').trim();
  const category = String(body.category || '');
  if (title.length < 5 || title.length > 150) return { error: 'Judul harus 5-150 karakter.' };
  if (content.length < 30) return { error: 'Isi berita minimal 30 karakter.' };
  if (!CATEGORIES.includes(category)) return { error: 'Pilih kategori yang valid.' };
  return { title, content, category };
}
const mediaOf = (file) => (file ? { url: `/uploads/${file.filename}`, type: file.mimetype.startsWith('video/') ? 'video' : 'image' } : null);

router.post('/', required, upload.single('media'), (req, res) => {
  const v = validate(req.body);
  if (v.error) { if (req.file) removeFile(`/uploads/${req.file.filename}`); return res.status(400).json({ message: v.error }); }
  const m = mediaOf(req.file);
  const info = db.prepare('INSERT INTO news (title, content, category, media_url, media_type, user_id) VALUES (?,?,?,?,?,?)')
    .run(v.title, v.content, v.category, m?.url ?? null, m?.type ?? null, req.user.id);
  res.status(201).json(shape(db.prepare(`${SELECT} WHERE n.id = @id`).get({ me: req.user.id, id: info.lastInsertRowid })));
});

router.put('/:id', required, upload.single('media'), (req, res) => {
  const old = db.prepare('SELECT * FROM news WHERE id = ?').get(req.params.id);
  const discard = () => req.file && removeFile(`/uploads/${req.file.filename}`);
  if (!old) { discard(); return res.status(404).json({ message: 'Berita tidak ditemukan.' }); }
  if (old.user_id !== req.user.id) { discard(); return res.status(403).json({ message: 'Hanya penulis yang bisa mengubah berita ini.' }); }
  const v = validate(req.body);
  if (v.error) { discard(); return res.status(400).json({ message: v.error }); }
  let url = old.media_url, type = old.media_type;
  const m = mediaOf(req.file);
  if (m) { removeFile(old.media_url); url = m.url; type = m.type; }
  else if (req.body.remove_media === '1') { removeFile(old.media_url); url = null; type = null; }
  db.prepare("UPDATE news SET title=?, content=?, category=?, media_url=?, media_type=?, updated_at=CURRENT_TIMESTAMP WHERE id=?")
    .run(v.title, v.content, v.category, url, type, old.id);
  res.json(shape(db.prepare(`${SELECT} WHERE n.id = @id`).get({ me: req.user.id, id: old.id })));
});

router.delete('/:id', required, (req, res) => {
  const old = db.prepare('SELECT * FROM news WHERE id = ?').get(req.params.id);
  if (!old) return res.status(404).json({ message: 'Berita tidak ditemukan.' });
  if (old.user_id !== req.user.id) return res.status(403).json({ message: 'Hanya penulis yang bisa menghapus berita ini.' });
  db.prepare('DELETE FROM news WHERE id = ?').run(old.id);
  removeFile(old.media_url);
  res.json({ ok: true });
});

module.exports = router;
