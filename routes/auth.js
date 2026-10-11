const router = require('express').Router();
const bcrypt = require('bcryptjs');
const db = require('../db');
const { sign, required } = require('../middleware/auth');
const rateLimit = require('../middleware/rateLimit');

const limiter = rateLimit({ windowMs: 10 * 60 * 1000, max: 30, message: 'Terlalu banyak percobaan login. Coba lagi dalam beberapa menit.' });
const publicUser = (u) => ({ id: u.id, username: u.username, email: u.email, bio: u.bio, created_at: u.created_at });

router.post('/register', limiter, (req, res) => {
  const username = String(req.body.username || '').trim();
  const email = String(req.body.email || '').trim().toLowerCase();
  const password = String(req.body.password || '');
  if (!/^[a-zA-Z0-9_]{3,20}$/.test(username)) return res.status(400).json({ message: 'Username 3-20 karakter: huruf, angka, atau underscore.' });
  if (!/^\S+@\S+\.\S+$/.test(email)) return res.status(400).json({ message: 'Format email belum benar.' });
  if (password.length < 6) return res.status(400).json({ message: 'Password minimal 6 karakter.' });
  const dup = db.prepare('SELECT username, email FROM users WHERE username = ? OR email = ?').get(username, email);
  if (dup) return res.status(409).json({ message: dup.email.toLowerCase() === email ? 'Email sudah terdaftar.' : 'Username sudah dipakai.' });
  const info = db.prepare('INSERT INTO users (username, email, password) VALUES (?,?,?)').run(username, email, bcrypt.hashSync(password, 10));
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(info.lastInsertRowid);
  res.status(201).json({ token: sign(user), user: publicUser(user) });
});

router.post('/login', limiter, (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  const password = String(req.body.password || '');
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  if (!user || !bcrypt.compareSync(password, user.password)) return res.status(401).json({ message: 'Email atau password salah.' });
  res.json({ token: sign(user), user: publicUser(user) });
});

router.get('/me', required, (req, res) => {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  if (!user) return res.status(401).json({ message: 'Akun tidak ditemukan.' });
  res.json({ user: publicUser(user) });
});

router.put('/me', required, (req, res) => {
  const bio = String(req.body.bio || '').trim().slice(0, 160);
  db.prepare('UPDATE users SET bio = ? WHERE id = ?').run(bio, req.user.id);
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  res.json({ user: publicUser(user) });
});

module.exports = router;
