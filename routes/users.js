const router = require('express').Router();
const db = require('../db');

router.get('/:username', (req, res) => {
  const u = db.prepare('SELECT id, username, bio, created_at FROM users WHERE username = ?').get(req.params.username);
  if (!u) return res.status(404).json({ message: 'Pengguna tidak ditemukan.' });
  const stats = db.prepare(`SELECT COUNT(*) AS posts,
      COALESCE(SUM((SELECT COUNT(*) FROM likes WHERE news_id = n.id)),0) AS likes,
      COALESCE(SUM(n.views),0) AS views FROM news n WHERE n.user_id = ?`).get(u.id);
  res.json({ ...u, ...stats });
});

module.exports = router;
