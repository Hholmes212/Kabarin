// POST /api/translate  { texts: ["...", "..."], target: "en" }  ->  { translations: ["...", "..."] }
// Menerjemahkan isi berita (Indonesia -> Inggris). Hasil disimpan di tabel `translations`
// supaya teks yang sama tidak diterjemahkan dua kali (hemat kuota & cepat).
//
// Penyedia (pilih lewat .env):
//   GOOGLE_TRANSLATE_API_KEY   -> Google Cloud Translation (kualitas terbaik, berbayar setelah kuota gratis)
//   LIBRETRANSLATE_URL         -> LibreTranslate (bisa dihosting sendiri, gratis); opsional LIBRETRANSLATE_API_KEY
//   (tidak ada yang diisi)     -> MyMemory (gratis tanpa kunci, kuota harian kecil); opsional MYMEMORY_EMAIL untuk kuota lebih besar
const router = require('express').Router();
const crypto = require('crypto');
const db = require('../db');
const rateLimit = require('../middleware/rateLimit');

const limiter = rateLimit({ windowMs: 10 * 60 * 1000, max: 40, message: 'Terlalu banyak permintaan terjemahan. Coba lagi nanti.' });

const MAX_ITEMS = 60;
const MAX_TOTAL_CHARS = 20000;

class QuotaError extends Error {}

const sha = (s) => crypto.createHash('sha1').update(s).digest('hex');

// Pecah teks panjang per kalimat supaya tiap potongan <= max karakter
function splitChunks(text, max) {
  if (text.length <= max) return [text];
  const parts = text.match(/[^.!?\n]+[.!?]*\s*|\n+/g) || [text];
  const out = [];
  let cur = '';
  const push = () => { if (cur) { out.push(cur); cur = ''; } };
  for (let p of parts) {
    while (p.length > max) { // kalimat tunggal yang kepanjangan: potong di spasi
      push();
      let cut = p.lastIndexOf(' ', max); if (cut < max / 2) cut = max;
      out.push(p.slice(0, cut)); p = p.slice(cut);
    }
    if ((cur + p).length > max) push();
    cur += p;
  }
  push();
  return out;
}

const decode = (s) => s.replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n)).replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#39;/g, "'");

async function postJson(url, body, headers = {}) {
  const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body), signal: AbortSignal.timeout(15000) });
  if (r.status === 429) throw new QuotaError('quota');
  if (!r.ok) throw new Error(`Penyedia terjemahan membalas ${r.status}`);
  return r.json();
}

const providers = {
  google: {
    max: 4000,
    async run(text) {
      const j = await postJson(`https://translation.googleapis.com/language/translate/v2?key=${encodeURIComponent(process.env.GOOGLE_TRANSLATE_API_KEY)}`, { q: text, source: 'id', target: 'en', format: 'text' });
      return decode(j.data.translations[0].translatedText);
    },
  },
  libre: {
    max: 4000,
    async run(text) {
      const url = process.env.LIBRETRANSLATE_URL.replace(/\/+$/, '') + '/translate';
      const body = { q: text, source: 'id', target: 'en', format: 'text' };
      if (process.env.LIBRETRANSLATE_API_KEY) body.api_key = process.env.LIBRETRANSLATE_API_KEY;
      const j = await postJson(url, body);
      return j.translatedText;
    },
  },
  mymemory: {
    max: 450, // batas MyMemory: 500 byte per permintaan
    async run(text) {
      const u = new URL('https://api.mymemory.translated.net/get');
      u.searchParams.set('q', text); u.searchParams.set('langpair', 'id|en');
      if (process.env.MYMEMORY_EMAIL) u.searchParams.set('de', process.env.MYMEMORY_EMAIL);
      const r = await fetch(u, { signal: AbortSignal.timeout(15000) });
      if (r.status === 429) throw new QuotaError('quota');
      if (!r.ok) throw new Error(`MyMemory membalas ${r.status}`);
      const j = await r.json();
      const out = j?.responseData?.translatedText;
      if (/MYMEMORY WARNING/i.test(out || '') || String(j.responseStatus) === '429') throw new QuotaError('quota');
      if (String(j.responseStatus) !== '200' || !out) throw new Error('MyMemory gagal menerjemahkan');
      return decode(out);
    },
  },
};

const pick = () => (process.env.GOOGLE_TRANSLATE_API_KEY ? providers.google : process.env.LIBRETRANSLATE_URL ? providers.libre : providers.mymemory);

const getCached = db.prepare('SELECT translated FROM translations WHERE hash = ? AND lang = ?');
const putCached = db.prepare('INSERT OR REPLACE INTO translations (hash, lang, translated) VALUES (?, ?, ?)');

async function translateOne(text, provider) {
  if (!text.trim()) return text;
  const h = sha(text);
  const hit = getCached.get(h, 'en');
  if (hit) return hit.translated;
  const chunks = splitChunks(text, provider.max);
  const out = [];
  for (const c of chunks) out.push(c.trim() ? await provider.run(c) : c); // berurutan: aman untuk kuota
  // jaga spasi/baris baru di antara potongan
  const joined = out.map((o, i) => (i && !/\s$/.test(out[i - 1]) && !/^\s/.test(o) ? ' ' : '') + o).join('');
  putCached.run(h, 'en', joined);
  return joined;
}

router.post('/', limiter, async (req, res) => {
  const { texts, target } = req.body || {};
  if (target !== 'en') return res.status(400).json({ message: 'Data tidak valid.' });
  if (!Array.isArray(texts) || !texts.length || texts.length > MAX_ITEMS || texts.some((t) => typeof t !== 'string')) return res.status(400).json({ message: 'Data tidak valid.' });
  if (texts.reduce((n, t) => n + t.length, 0) > MAX_TOTAL_CHARS) return res.status(400).json({ message: 'Data tidak valid.' });
  const provider = pick();
  try {
    const translations = [];
    for (const t of texts) translations.push(await translateOne(t, provider));
    res.json({ translations });
  } catch (e) {
    if (e instanceof QuotaError) return res.status(429).json({ message: 'Kuota terjemahan gratis hari ini habis. Coba lagi besok.' });
    console.error('[translate]', e.message);
    res.status(502).json({ message: 'Layanan terjemahan sedang tidak tersedia.' });
  }
});

module.exports = router;
module.exports.splitChunks = splitChunks;
