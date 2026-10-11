// Pembatas request sederhana (in-memory) supaya login tidak bisa di-brute-force
module.exports = function rateLimit({ windowMs, max, message }) {
  const hits = new Map();
  setInterval(() => hits.clear(), windowMs).unref();
  return (req, res, next) => {
    const key = req.ip;
    const n = (hits.get(key) || 0) + 1;
    hits.set(key, n);
    if (n > max) return res.status(429).json({ message: message || 'Terlalu banyak percobaan, coba lagi nanti.' });
    next();
  };
};
