const jwt = require('jsonwebtoken');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// JWT secret: dari .env, kalau kosong dibuat otomatis & disimpan sekali di data/.secret
function getSecret() {
  if (process.env.JWT_SECRET) return process.env.JWT_SECRET;
  const file = path.join(__dirname, '..', 'data', '.secret');
  try { return fs.readFileSync(file, 'utf8').trim(); } catch (_) {}
  const s = crypto.randomBytes(48).toString('hex');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, s);
  return s;
}
const SECRET = getSecret();

const sign = (user) => jwt.sign({ id: user.id, username: user.username }, SECRET, { expiresIn: '7d' });

function readToken(req) {
  const h = req.headers.authorization || '';
  if (!h.startsWith('Bearer ')) return null;
  try { return jwt.verify(h.slice(7), SECRET); } catch (_) { return null; }
}

// Wajib login
function required(req, res, next) {
  const u = readToken(req);
  if (!u) return res.status(401).json({ message: 'Silakan login dulu.' });
  req.user = u;
  next();
}
// Login opsional (untuk tahu status like/bookmark pengguna)
function optional(req, _res, next) {
  req.user = readToken(req);
  next();
}

module.exports = { sign, required, optional };
