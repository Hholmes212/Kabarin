const router = require('express').Router();
const db = require('../db');
const { required } = require('../middleware/auth');

const ROW = `SELECT c.id, c.content, c.created_at, c.news_id, u.id AS user_id, u.username
  FROM comments c JOIN users u ON u.id = c.user_id`;

router.get('/news/:newsId', (req, res) => {
  res.json(db.prepare(`${ROW} WHERE c.news_id = ? ORDER BY c.created_at DESC, c.id DESC`).all(req.params.newsId));
});

router.post('/news/:newsId', required, (req, res) => {
  const content = String(req.body.content || '').trim();
  if (!content) return res.status(400).json({ message: 'Komentar tidak boleh kosong.' });
  if (content.length > 500) return res.status(400).json({ message: 'Komentar maksimal 500 karakter.' });
  if (!db.prepare('SELECT 1 FROM news WHERE id = ?').get(req.params.newsId)) return res.status(404).json({ message: 'Berita tidak ditemukan.' });
  const info = db.prepare('INSERT INTO comments (content, news_id, user_id) VALUES (?,?,?)').run(content, req.params.newsId, req.user.id);
  res.status(201).json(db.prepare(`${ROW} WHERE c.id = ?`).get(info.lastInsertRowid));
});

router.delete('/:id', required, (req, res) => {
  const c = db.prepare('SELECT * FROM comments WHERE id = ?').get(req.params.id);
  if (!c) return res.status(404).json({ message: 'Komentar tidak ditemukan.' });
  if (c.user_id !== req.user.id) return res.status(403).json({ message: 'Kamu hanya bisa menghapus komentarmu sendiri.' });
  db.prepare('DELETE FROM comments WHERE id = ?').run(c.id);
  res.json({ ok: true });
});

module.exports = router;
